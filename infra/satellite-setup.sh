#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Satellite Service Setup — Deploy tool services alongside Core Platform     ║
# ║  Creates: ECR repos, Secrets Manager, S3 bucket, Target Groups,            ║
# ║           ALB rules, DNS hints, ECS task definition, ECS service            ║
# ║  Reuses: VPC, subnets, ALB, ECS cluster, RDS from Core Platform            ║
# ║  Safe to re-run — all creates are idempotent                                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ── Configuration ────────────────────────────────────────
SATELLITE_NAME=""           # e.g. "sd-cohesity" or "sd-analytics-hub"
ENV=""                      # "test" or "prod"
REGION="us-east-1"

# Core platform resources file (auto-detected)
CORE_RESOURCES_FILE=""

# Satellite-specific
FRONTEND_HOSTNAME=""        # e.g. "cohesity-test" → cohesity-test.salesduo.com
API_HOSTNAME=""             # e.g. "cohesityapi-test" → cohesityapi-test.salesduo.com
BACKEND_PORT=3000
FRONTEND_PORT=8080
DB_NAME=""                  # e.g. "sdcohesitydb"
DB_USER=""                  # e.g. "cohesity_user"
S3_BUCKET=""                # e.g. "sd-cohesity-images-test" (leave blank to skip)

# ALB rule priorities (must be unique across all rules on the listener)
FRONTEND_RULE_PRIORITY=""   # e.g. 8
BACKEND_RULE_PRIORITY=""    # e.g. 9

# Task definition file (relative to infra/)
TASK_DEF_FILE=""            # e.g. "sd-cohesity-test-app-task-def.json"

# ── Paths ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Colors ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${GREEN}[✓]${NC} $*"; }
info()  { echo -e "${CYAN}[i]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }
step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

prompt_required() {
  local var_name="$1" prompt_text="$2" current_val="${!1:-}"
  if [[ -z "$current_val" ]]; then
    read -rp "$prompt_text: " current_val
    [[ -z "$current_val" ]] && { error "Required: $var_name"; exit 1; }
    eval "$var_name='$current_val'"
  fi
}

# Track created resources
RESOURCES_FILE=""
save_resource() {
  local key="$1" value="$2"
  if [[ -f "$RESOURCES_FILE" ]]; then
    local tmp
    tmp=$(jq --arg k "$key" --arg v "$value" '.[$k] = $v' "$RESOURCES_FILE")
    echo "$tmp" > "$RESOURCES_FILE"
  else
    echo "{\"$key\": \"$value\"}" > "$RESOURCES_FILE"
  fi
  info "  $key = $value"
}

# ══════════════════════════════════════════════════════════════════════════════
# Gather inputs
# ══════════════════════════════════════════════════════════════════════════════

step "Satellite Service Setup"

prompt_required SATELLITE_NAME "Satellite name (e.g. sd-cohesity)"
prompt_required ENV "Environment (test/prod)"
prompt_required FRONTEND_HOSTNAME "Frontend hostname prefix (e.g. cohesity-test)"
prompt_required API_HOSTNAME "API hostname prefix (e.g. cohesityapi-test)"
prompt_required DB_NAME "Database name (e.g. sdcohesitydb)"
prompt_required DB_USER "Database user (e.g. cohesity_user)"
prompt_required FRONTEND_RULE_PRIORITY "ALB rule priority for frontend (e.g. 8)"
prompt_required BACKEND_RULE_PRIORITY "ALB rule priority for backend (e.g. 9)"
prompt_required TASK_DEF_FILE "Task definition filename (e.g. sd-cohesity-test-app-task-def.json)"

DOMAIN_SUFFIX="salesduo.com"
FRONTEND_DOMAIN="${FRONTEND_HOSTNAME}.${DOMAIN_SUFFIX}"
API_DOMAIN="${API_HOSTNAME}.${DOMAIN_SUFFIX}"

PREFIX="${SATELLITE_NAME}-${ENV}"
RESOURCES_FILE="${SCRIPT_DIR}/${PREFIX}-resources.json"

# Find core platform resources
if [[ -z "$CORE_RESOURCES_FILE" ]]; then
  CORE_RESOURCES_FILE="${SCRIPT_DIR}/sd-core-platform-${ENV}-resources.json"
fi
if [[ ! -f "$CORE_RESOURCES_FILE" ]]; then
  error "Core platform resources not found: $CORE_RESOURCES_FILE"
  error "Run setup.sh for core platform first."
  exit 1
fi

info "Core resources: $CORE_RESOURCES_FILE"
info "Satellite: $SATELLITE_NAME ($ENV)"
info "Frontend: $FRONTEND_DOMAIN"
info "API: $API_DOMAIN"

# Read core resources
VPC_ID=$(jq -r '.vpc_id' "$CORE_RESOURCES_FILE")
SUBNET1=$(jq -r '.subnet1' "$CORE_RESOURCES_FILE")
SUBNET2=$(jq -r '.subnet2' "$CORE_RESOURCES_FILE")
ALB_ARN=$(jq -r '.alb_arn' "$CORE_RESOURCES_FILE")
ALB_DNS=$(jq -r '.alb_dns' "$CORE_RESOURCES_FILE")
HTTPS_LISTENER_ARN=$(jq -r '.https_listener_arn' "$CORE_RESOURCES_FILE")
ECS_SG_ID=$(jq -r '.ecs_sg_id' "$CORE_RESOURCES_FILE")
CLUSTER_NAME=$(jq -r '.cluster_name' "$CORE_RESOURCES_FILE")
EXECUTION_ROLE_ARN=$(jq -r '.execution_role_arn' "$CORE_RESOURCES_FILE")
ACCOUNT_ID=$(jq -r '.account_id' "$CORE_RESOURCES_FILE")

info "VPC: $VPC_ID | Cluster: $CLUSTER_NAME"

# Initialize resources file
if [[ ! -f "$RESOURCES_FILE" ]]; then
  cat > "$RESOURCES_FILE" <<EOF
{
  "satellite_name": "${SATELLITE_NAME}",
  "env": "${ENV}",
  "region": "${REGION}",
  "core_cluster": "${CLUSTER_NAME}",
  "frontend_domain": "${FRONTEND_DOMAIN}",
  "api_domain": "${API_DOMAIN}"
}
EOF
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 1: ECR Repositories
# ══════════════════════════════════════════════════════════════════════════════

step "Step 1: ECR Repositories"

for component in backend frontend; do
  REPO_NAME="${SATELLITE_NAME}/${component}"
  if aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" &>/dev/null; then
    log "ECR repo already exists: $REPO_NAME"
  else
    aws ecr create-repository \
      --repository-name "$REPO_NAME" \
      --region "$REGION" \
      --image-scanning-configuration scanOnPush=true \
      --output text --query 'repository.repositoryUri'
    log "Created ECR repo: $REPO_NAME"
  fi
  REPO_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"
  save_resource "${component}_repo_uri" "$REPO_URI"
done

# ══════════════════════════════════════════════════════════════════════════════
# Step 2: Secrets Manager
# ══════════════════════════════════════════════════════════════════════════════

step "Step 2: Secrets Manager"

DB_SECRET_NAME="${PREFIX}-db-password"
if aws secretsmanager describe-secret --secret-id "$DB_SECRET_NAME" --region "$REGION" &>/dev/null; then
  log "DB password secret already exists: $DB_SECRET_NAME"
else
  DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)
  DB_SECRET_ARN=$(aws secretsmanager create-secret \
    --name "$DB_SECRET_NAME" \
    --secret-string "$DB_PASSWORD" \
    --region "$REGION" \
    --output text --query 'ARN')
  log "Created DB password secret: $DB_SECRET_NAME"
  warn "DB Password: $DB_PASSWORD (save this — you need it to CREATE USER in RDS)"
fi
DB_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$DB_SECRET_NAME" --region "$REGION" --query 'ARN' --output text)
save_resource "db_secret_arn" "$DB_SECRET_ARN"
save_resource "db_secret_name" "$DB_SECRET_NAME"

BACKEND_ENV_SECRET_NAME="${PREFIX}-backend-env"
if aws secretsmanager describe-secret --secret-id "$BACKEND_ENV_SECRET_NAME" --region "$REGION" &>/dev/null; then
  log "Backend env secret already exists: $BACKEND_ENV_SECRET_NAME"
else
  # Create with placeholder values — update manually with real secrets
  PLACEHOLDER_JSON=$(cat <<'ENDJSON'
{
  "SP_API_CLIENT_ID": "PLACEHOLDER",
  "SP_API_CLIENT_SECRET": "PLACEHOLDER",
  "ENCRYPTION_KEY": "PLACEHOLDER",
  "INTERNAL_API_KEY": "PLACEHOLDER",
  "SMTP_USER": "PLACEHOLDER",
  "SMTP_PASS": "PLACEHOLDER",
  "SMTP_FROM": "noreply@salesduo.com",
  "AWS_S3_CLIENT_ID": "PLACEHOLDER",
  "AWS_S3_CLIENT_SECRET": "PLACEHOLDER"
}
ENDJSON
)
  BACKEND_ENV_ARN=$(aws secretsmanager create-secret \
    --name "$BACKEND_ENV_SECRET_NAME" \
    --secret-string "$PLACEHOLDER_JSON" \
    --region "$REGION" \
    --output text --query 'ARN')
  log "Created backend env secret: $BACKEND_ENV_SECRET_NAME"
  warn "Update secret values: aws secretsmanager put-secret-value --secret-id $BACKEND_ENV_SECRET_NAME --secret-string '{...}'"
fi
BACKEND_ENV_ARN=$(aws secretsmanager describe-secret --secret-id "$BACKEND_ENV_SECRET_NAME" --region "$REGION" --query 'ARN' --output text)
save_resource "backend_env_secret_arn" "$BACKEND_ENV_ARN"
save_resource "backend_env_secret_name" "$BACKEND_ENV_SECRET_NAME"

# ══════════════════════════════════════════════════════════════════════════════
# Step 3: S3 Bucket (optional)
# ══════════════════════════════════════════════════════════════════════════════

if [[ -n "$S3_BUCKET" ]]; then
  step "Step 3: S3 Bucket"

  if aws s3api head-bucket --bucket "$S3_BUCKET" --region "$REGION" 2>/dev/null; then
    log "S3 bucket already exists: $S3_BUCKET"
  else
    aws s3 mb "s3://${S3_BUCKET}" --region "$REGION"
    # Block public access
    aws s3api put-public-access-block \
      --bucket "$S3_BUCKET" \
      --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
    log "Created S3 bucket: $S3_BUCKET"
  fi
  save_resource "s3_bucket" "$S3_BUCKET"
else
  info "Skipping S3 bucket (not configured)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 4: Target Groups
# ══════════════════════════════════════════════════════════════════════════════

step "Step 4: Target Groups"

# Frontend target group
FE_TG_NAME="${PREFIX}-fe-tg"
# AWS target group names max 32 chars
FE_TG_NAME="${FE_TG_NAME:0:32}"
EXISTING_FE_TG=$(aws elbv2 describe-target-groups --names "$FE_TG_NAME" --region "$REGION" 2>/dev/null | jq -r '.TargetGroups[0].TargetGroupArn // empty' || true)
if [[ -n "$EXISTING_FE_TG" ]]; then
  log "Frontend target group exists: $FE_TG_NAME"
  FE_TG_ARN="$EXISTING_FE_TG"
else
  FE_TG_ARN=$(aws elbv2 create-target-group \
    --name "$FE_TG_NAME" \
    --protocol HTTP --port "$FRONTEND_PORT" \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/" \
    --health-check-interval-seconds 30 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --region "$REGION" \
    --output text --query 'TargetGroups[0].TargetGroupArn')
  log "Created frontend target group: $FE_TG_NAME"
fi
save_resource "frontend_tg_arn" "$FE_TG_ARN"

# Backend target group
BE_TG_NAME="${PREFIX}-be-tg"
BE_TG_NAME="${BE_TG_NAME:0:32}"
EXISTING_BE_TG=$(aws elbv2 describe-target-groups --names "$BE_TG_NAME" --region "$REGION" 2>/dev/null | jq -r '.TargetGroups[0].TargetGroupArn // empty' || true)
if [[ -n "$EXISTING_BE_TG" ]]; then
  log "Backend target group exists: $BE_TG_NAME"
  BE_TG_ARN="$EXISTING_BE_TG"
else
  BE_TG_ARN=$(aws elbv2 create-target-group \
    --name "$BE_TG_NAME" \
    --protocol HTTP --port "$BACKEND_PORT" \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/health" \
    --health-check-interval-seconds 30 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --region "$REGION" \
    --output text --query 'TargetGroups[0].TargetGroupArn')
  log "Created backend target group: $BE_TG_NAME"
fi
save_resource "backend_tg_arn" "$BE_TG_ARN"

# ══════════════════════════════════════════════════════════════════════════════
# Step 5: ALB Listener Rules (host-based routing)
# ══════════════════════════════════════════════════════════════════════════════

step "Step 5: ALB Listener Rules"

# Check if rules already exist for these hosts
EXISTING_RULES=$(aws elbv2 describe-rules --listener-arn "$HTTPS_LISTENER_ARN" --region "$REGION" --output json)

# Frontend rule
FE_RULE_EXISTS=$(echo "$EXISTING_RULES" | jq -r --arg host "$FRONTEND_DOMAIN" '.Rules[] | select(.Conditions[]? | select(.Field=="host-header") | .Values[]? == $host) | .RuleArn' | head -1)
if [[ -n "$FE_RULE_EXISTS" ]]; then
  log "Frontend ALB rule already exists for $FRONTEND_DOMAIN"
  save_resource "frontend_rule_arn" "$FE_RULE_EXISTS"
else
  FE_RULE_ARN=$(aws elbv2 create-rule \
    --listener-arn "$HTTPS_LISTENER_ARN" \
    --priority "$FRONTEND_RULE_PRIORITY" \
    --conditions "Field=host-header,Values=$FRONTEND_DOMAIN" \
    --actions "Type=forward,TargetGroupArn=$FE_TG_ARN" \
    --region "$REGION" \
    --output text --query 'Rules[0].RuleArn')
  log "Created frontend ALB rule: $FRONTEND_DOMAIN → priority $FRONTEND_RULE_PRIORITY"
  save_resource "frontend_rule_arn" "$FE_RULE_ARN"
fi

# Backend rule
BE_RULE_EXISTS=$(echo "$EXISTING_RULES" | jq -r --arg host "$API_DOMAIN" '.Rules[] | select(.Conditions[]? | select(.Field=="host-header") | .Values[]? == $host) | .RuleArn' | head -1)
if [[ -n "$BE_RULE_EXISTS" ]]; then
  log "Backend ALB rule already exists for $API_DOMAIN"
  save_resource "backend_rule_arn" "$BE_RULE_EXISTS"
else
  BE_RULE_ARN=$(aws elbv2 create-rule \
    --listener-arn "$HTTPS_LISTENER_ARN" \
    --priority "$BACKEND_RULE_PRIORITY" \
    --conditions "Field=host-header,Values=$API_DOMAIN" \
    --actions "Type=forward,TargetGroupArn=$BE_TG_ARN" \
    --region "$REGION" \
    --output text --query 'Rules[0].RuleArn')
  log "Created backend ALB rule: $API_DOMAIN → priority $BACKEND_RULE_PRIORITY"
  save_resource "backend_rule_arn" "$BE_RULE_ARN"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 6: Register ECS Task Definition
# ══════════════════════════════════════════════════════════════════════════════

step "Step 6: Register ECS Task Definition"

TASK_DEF_PATH="${SCRIPT_DIR}/${TASK_DEF_FILE}"
if [[ ! -f "$TASK_DEF_PATH" ]]; then
  error "Task definition not found: $TASK_DEF_PATH"
  exit 1
fi

# Update secret ARNs in task def with actual values (replace placeholder ARNs)
TASK_DEF_CONTENT=$(cat "$TASK_DEF_PATH")

# Check if task family already has a registered revision
TASK_FAMILY=$(echo "$TASK_DEF_CONTENT" | jq -r '.family')
EXISTING_TASK=$(aws ecs describe-task-definition --task-definition "$TASK_FAMILY" --region "$REGION" 2>/dev/null | jq -r '.taskDefinition.taskDefinitionArn // empty' || true)

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "$TASK_DEF_CONTENT" \
  --region "$REGION" \
  --output text --query 'taskDefinition.taskDefinitionArn')
log "Registered task definition: $TASK_DEF_ARN"
save_resource "task_def_arn" "$TASK_DEF_ARN"
save_resource "task_family" "$TASK_FAMILY"

# ══════════════════════════════════════════════════════════════════════════════
# Step 7: Create ECS Service
# ══════════════════════════════════════════════════════════════════════════════

step "Step 7: Create ECS Service"

SERVICE_NAME="${PREFIX}-app-service"
EXISTING_SERVICE=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SERVICE_NAME" --region "$REGION" 2>/dev/null | jq -r '.services[] | select(.status != "INACTIVE") | .serviceName' || true)

if [[ -n "$EXISTING_SERVICE" ]]; then
  log "ECS service already exists: $SERVICE_NAME"
  info "To update, run: aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force-new-deployment"
else
  aws ecs create-service \
    --cluster "$CLUSTER_NAME" \
    --service-name "$SERVICE_NAME" \
    --task-definition "$TASK_FAMILY" \
    --desired-count 1 \
    --deployment-configuration "minimumHealthyPercent=0,maximumPercent=100" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET1,$SUBNET2],securityGroups=[$ECS_SG_ID]}" \
    --load-balancers "[
      {\"targetGroupArn\":\"$BE_TG_ARN\",\"containerName\":\"backend\",\"containerPort\":$BACKEND_PORT},
      {\"targetGroupArn\":\"$FE_TG_ARN\",\"containerName\":\"frontend\",\"containerPort\":$FRONTEND_PORT}
    ]" \
    --region "$REGION" \
    --output text --query 'service.serviceArn'
  log "Created ECS service: $SERVICE_NAME"
fi
save_resource "service_name" "$SERVICE_NAME"

# ══════════════════════════════════════════════════════════════════════════════
# Step 8: Database Setup Instructions
# ══════════════════════════════════════════════════════════════════════════════

step "Step 8: Manual Steps Required"

DB_HOST=$(jq -r '.db_host' "$CORE_RESOURCES_FILE")

echo ""
warn "The following steps must be done manually:"
echo ""
echo -e "${CYAN}1. Create database and user on shared RDS:${NC}"
echo "   Connect: psql -h $DB_HOST -U dbadmin -d postgres"
echo "   Then run:"
echo "     CREATE DATABASE $DB_NAME;"
echo "     CREATE USER $DB_USER WITH PASSWORD '<password-from-secrets-manager>';"
echo "     GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
echo "     \\c $DB_NAME"
echo "     GRANT ALL ON SCHEMA public TO $DB_USER;"
echo ""
echo -e "${CYAN}2. Add DNS CNAME records (GoDaddy):${NC}"
echo "   $FRONTEND_DOMAIN → CNAME → $ALB_DNS"
echo "   $API_DOMAIN       → CNAME → $ALB_DNS"
echo ""
echo -e "${CYAN}3. Update Secrets Manager with real values:${NC}"
echo "   aws secretsmanager put-secret-value \\"
echo "     --secret-id $BACKEND_ENV_SECRET_NAME \\"
echo "     --secret-string '{\"SP_API_CLIENT_ID\":\"...\",\"SP_API_CLIENT_SECRET\":\"...\",\"ENCRYPTION_KEY\":\"...\",\"INTERNAL_API_KEY\":\"...\",\"SMTP_USER\":\"...\",\"SMTP_PASS\":\"...\",\"SMTP_FROM\":\"...\",\"AWS_S3_CLIENT_ID\":\"...\",\"AWS_S3_CLIENT_SECRET\":\"...\"}'"
echo ""
if [[ -n "$S3_BUCKET" ]]; then
  echo -e "${CYAN}4. Configure S3 bucket CORS (if serving images directly):${NC}"
  echo "   aws s3api put-bucket-cors --bucket $S3_BUCKET --cors-configuration '{\"CORSRules\":[{\"AllowedOrigins\":[\"https://$FRONTEND_DOMAIN\"],\"AllowedMethods\":[\"GET\"],\"AllowedHeaders\":[\"*\"]}]}'"
  echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════

step "Setup Complete"

echo ""
log "Resources saved to: $RESOURCES_FILE"
echo ""
echo -e "${GREEN}Created:${NC}"
echo "  - ECR repos: ${SATELLITE_NAME}/backend, ${SATELLITE_NAME}/frontend"
echo "  - Secrets: $DB_SECRET_NAME, $BACKEND_ENV_SECRET_NAME"
[[ -n "$S3_BUCKET" ]] && echo "  - S3 bucket: $S3_BUCKET"
echo "  - Target groups: $FE_TG_NAME, $BE_TG_NAME"
echo "  - ALB rules: $FRONTEND_DOMAIN (priority $FRONTEND_RULE_PRIORITY), $API_DOMAIN (priority $BACKEND_RULE_PRIORITY)"
echo "  - ECS task definition: $TASK_FAMILY"
echo "  - ECS service: $SERVICE_NAME"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Complete manual steps above (DB, DNS, secrets)"
echo "  2. Build and push Docker images to ECR"
echo "  3. Set up CI/CD in the satellite repo (copy ci-cd.yaml, update vars)"
echo "  4. Deploy: aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force-new-deployment"
