#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  AWS ECS on EC2 — Full Infrastructure Setup                                ║
# ║  Creates: VPC/Subnets, ECR, IAM, SGs, RDS, ALB (path-based routing),      ║
# ║           Cloud Map, EC2 Launch Template, ASG, ECS Cluster + Services      ║
# ║           (App + Monitoring + Promtail), Auto-scaling, CloudWatch          ║
# ║  Safe to re-run — all creates are idempotent                               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ── Required (leave blank to be prompted) ─────────────
PROJECT=""                   # prefix for all AWS resources
ENV=""                       # "test" or "prod"
REGION=""                    # AWS region

# ── Backend ───────────────────────────────────────────
BACKEND_TYPE=""              # "node" or "python"
API_PORT=4000

# ── Database ──────────────────────────────────────────
DB_NAME=""
DB_USER=""
DB_INSTANCE_CLASS="db.t4g.micro"
DB_STORAGE_GB=20

# ── EC2 Instance ──────────────────────────────────────
INSTANCE_TYPE=""             # leave blank for auto (t3.medium)

# ── ECS Sizing ────────────────────────────────────────
# App task: backend + frontend + redis (shared CPU/memory)
APP_CPU=""                   # leave blank for auto
APP_MEMORY=""
DESIRED_COUNT=""

# ── Auto-scaling (prod only) ─────────────────────────
AUTOSCALE_ENABLED="true"     # enable CPU-based auto-scaling
AUTOSCALE_MIN=2
AUTOSCALE_MAX=4
AUTOSCALE_CPU_TARGET=70      # scale up when avg CPU > 70%

# ── ASG sizing ────────────────────────────────────────
ASG_MIN=""                   # leave blank for auto
ASG_MAX=""
ASG_DESIRED=""

# ── HTTPS (optional) ─────────────────────────────────
DOMAIN=""                    # e.g. "myapp.example.com" — leave blank to skip HTTPS

# ── Monitoring ────────────────────────────────────────
ALARMS_ENABLED="true"        # create CloudWatch alarms
ALARM_EMAIL=""               # SNS notification email (optional)
GRAFANA_ADMIN_USER="admin"
GRAFANA_ADMIN_PASSWORD=""    # leave blank to auto-generate

# ── GitHub Actions OIDC (optional) ────────────────────
GITHUB_REPO=""               # e.g. "owner/repo" — leave blank to skip OIDC setup

# ── Paths ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ══════════════════════════════════════════════════════════════════════════════
# Helper functions
# ══════════════════════════════════════════════════════════════════════════════

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
  local var_name="$1" prompt_text="$2" default_val="${3:-}"
  local current_val="${!var_name}"
  if [[ -n "$current_val" ]]; then return; fi
  if [[ -n "$default_val" ]]; then
    read -rp "  $prompt_text [$default_val]: " input
    eval "$var_name=\"${input:-$default_val}\""
  else
    while true; do
      read -rp "  $prompt_text: " input
      if [[ -n "$input" ]]; then eval "$var_name=\"$input\""; return; fi
      echo -e "  ${RED}This field is required.${NC}"
    done
  fi
}

prompt_optional() {
  local var_name="$1" prompt_text="$2" default_val="${3:-}"
  local current_val="${!var_name}"
  if [[ -n "$current_val" ]]; then return; fi
  read -rp "  $prompt_text [$default_val]: " input
  eval "$var_name=\"${input:-$default_val}\""
}

prompt_choice() {
  local var_name="$1" prompt_text="$2" choices="$3" default_val="${4:-}"
  local current_val="${!var_name}"
  if [[ -n "$current_val" ]]; then return; fi
  while true; do
    if [[ -n "$default_val" ]]; then
      read -rp "  $prompt_text ($choices) [$default_val]: " input
      input="${input:-$default_val}"
    else
      read -rp "  $prompt_text ($choices): " input
    fi
    if echo "$choices" | tr '|' '\n' | grep -qx "$input"; then
      eval "$var_name=\"$input\""; return
    fi
    echo -e "  ${RED}Invalid choice. Pick one of: $choices${NC}"
  done
}

save_resource() {
  local key="$1" value="$2"
  if [[ ! -f "$RESOURCES_FILE" ]]; then
    echo '{}' > "$RESOURCES_FILE"
  fi
  local tmp
  tmp=$(mktemp)
  python3 -c "
import json, sys
with open('$RESOURCES_FILE') as f:
    data = json.load(f)
data['$key'] = '$value'
with open('$tmp', 'w') as f:
    json.dump(data, f, indent=2)
"
  mv "$tmp" "$RESOURCES_FILE"
}

# ══════════════════════════════════════════════════════════════════════════════
# Interactive prompts
# ══════════════════════════════════════════════════════════════════════════════

NEEDS_PROMPT="false"
for _v in PROJECT ENV REGION BACKEND_TYPE DB_NAME DB_USER; do
  if [[ -z "${!_v}" ]]; then NEEDS_PROMPT="true"; break; fi
done

if [[ "$NEEDS_PROMPT" == "true" ]]; then
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  Configure your deployment (press Enter for defaults)       ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  echo -e "${CYAN}── Required ──${NC}"
  prompt_required  PROJECT      "Project name (prefix for AWS resources)"  "myapp"
  prompt_choice    ENV          "Environment"                              "test|prod"     "prod"
  prompt_optional  REGION       "AWS region"                               "us-east-1"
  prompt_choice    BACKEND_TYPE "Backend type"                             "node|python"   "node"

  echo ""
  echo -e "${CYAN}── Database ──${NC}"
  prompt_optional  DB_NAME      "Database name"                            "${PROJECT}db"
  prompt_optional  DB_USER      "Database user"                            "dbadmin"

  echo ""
  echo -e "${CYAN}── EC2 ──${NC}"
  prompt_optional  INSTANCE_TYPE "Instance type"                           "t3.medium"

  echo ""
  echo -e "${CYAN}── Optional ──${NC}"
  prompt_optional  DOMAIN       "Domain for HTTPS (blank to skip)"         ""
  prompt_optional  GITHUB_REPO  "GitHub repo for OIDC CI/CD (owner/repo)" ""
  prompt_optional  ALARM_EMAIL  "Email for CloudWatch alerts (blank to skip)" ""
  prompt_optional  GRAFANA_ADMIN_PASSWORD "Grafana admin password (blank to auto-generate)" ""

  echo ""
fi

# Apply defaults
PROJECT="${PROJECT:-myapp}"
ENV="${ENV:-prod}"
REGION="${REGION:-us-east-1}"
BACKEND_TYPE="${BACKEND_TYPE:-node}"
DB_NAME="${DB_NAME:-${PROJECT}db}"
DB_USER="${DB_USER:-dbadmin}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.medium}"

RESOURCES_FILE="$SCRIPT_DIR/${PROJECT}-${ENV}-resources.json"

# AWS ALB and target group names have a 32-character limit.
# Create a short prefix for these resources.
_full_prefix="${PROJECT}-${ENV}"
if [[ ${#_full_prefix} -gt 19 ]]; then
  SHORT_PREFIX="${_full_prefix:0:19}"
  # Remove trailing dash
  SHORT_PREFIX="${SHORT_PREFIX%-}"
else
  SHORT_PREFIX="$_full_prefix"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 1: Validate inputs
# ══════════════════════════════════════════════════════════════════════════════
step "Step 1: Validating inputs"

if ! command -v aws &>/dev/null; then
  error "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
  exit 1
fi
log "AWS CLI found"

if ! command -v docker &>/dev/null; then
  error "Docker not found. Install: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker info &>/dev/null; then
  error "Docker daemon is not running. Start Docker and try again."
  exit 1
fi
log "Docker is running"

if [[ "$ENV" != "test" && "$ENV" != "prod" ]]; then
  error "ENV must be 'test' or 'prod', got '$ENV'"
  exit 1
fi

if [[ "$BACKEND_TYPE" != "node" && "$BACKEND_TYPE" != "python" ]]; then
  error "BACKEND_TYPE must be 'node' or 'python', got '$BACKEND_TYPE'"
  exit 1
fi

# Apply environment-based defaults
if [[ -z "$APP_CPU" ]]; then
  [[ "$ENV" == "prod" ]] && APP_CPU=512 || APP_CPU=512
fi
if [[ -z "$APP_MEMORY" ]]; then
  [[ "$ENV" == "prod" ]] && APP_MEMORY=1024 || APP_MEMORY=1024
fi
if [[ -z "$DESIRED_COUNT" ]]; then
  [[ "$ENV" == "prod" ]] && DESIRED_COUNT=2 || DESIRED_COUNT=1
fi
if [[ -z "$ASG_MIN" ]]; then
  [[ "$ENV" == "prod" ]] && ASG_MIN=2 || ASG_MIN=1
fi
if [[ -z "$ASG_MAX" ]]; then
  [[ "$ENV" == "prod" ]] && ASG_MAX=4 || ASG_MAX=1
fi
if [[ -z "$ASG_DESIRED" ]]; then
  [[ "$ENV" == "prod" ]] && ASG_DESIRED=2 || ASG_DESIRED=1
fi

# Auto-generate Grafana password if not set
if [[ -z "$GRAFANA_ADMIN_PASSWORD" ]]; then
  GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=')
fi

log "Config: PROJECT=$PROJECT ENV=$ENV REGION=$REGION INSTANCE_TYPE=$INSTANCE_TYPE"
log "App task sizing: CPU=$APP_CPU MEM=$APP_MEMORY desired=$DESIRED_COUNT"
log "ASG sizing: min=$ASG_MIN max=$ASG_MAX desired=$ASG_DESIRED"

# ══════════════════════════════════════════════════════════════════════════════
# Step 2: Detect AWS Account ID
# ══════════════════════════════════════════════════════════════════════════════
step "Step 2: Detecting AWS account"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
log "AWS Account: $ACCOUNT_ID"
save_resource "account_id" "$ACCOUNT_ID"
save_resource "region" "$REGION"
save_resource "project" "$PROJECT"
save_resource "env" "$ENV"

# ══════════════════════════════════════════════════════════════════════════════
# Step 3: Find VPC and subnets
# ══════════════════════════════════════════════════════════════════════════════
step "Step 3: Finding VPC and subnets"

VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text --region "$REGION" 2>/dev/null || echo "None")

if [[ "$VPC_ID" == "None" || -z "$VPC_ID" ]]; then
  warn "No default VPC found. Listing available VPCs..."
  aws ec2 describe-vpcs --query "Vpcs[*].[VpcId,Tags[?Key=='Name'].Value|[0]]" \
    --output table --region "$REGION"
  error "Set VPC_ID manually in the script or create a default VPC: aws ec2 create-default-vpc"
  exit 1
fi
log "VPC: $VPC_ID"
save_resource "vpc_id" "$VPC_ID"

SUBNETS_JSON=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" \
  --query "Subnets[*].[SubnetId,AvailabilityZone]" --output json --region "$REGION")

SUBNET1=$(echo "$SUBNETS_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0][0])")
SUBNET1_AZ=$(echo "$SUBNETS_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0][1])")
SUBNET2=$(echo "$SUBNETS_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
az1 = d[0][1]
for s in d[1:]:
    if s[1] != az1:
        print(s[0])
        sys.exit(0)
print(d[1][0])
")
SUBNET2_AZ=$(echo "$SUBNETS_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
az1 = d[0][1]
for s in d[1:]:
    if s[1] != az1:
        print(s[1])
        sys.exit(0)
print(d[1][1])
")

log "Subnet 1: $SUBNET1 ($SUBNET1_AZ)"
log "Subnet 2: $SUBNET2 ($SUBNET2_AZ)"
save_resource "subnet1" "$SUBNET1"
save_resource "subnet2" "$SUBNET2"

# Verify subnets have internet gateway route
for SUBNET in "$SUBNET1" "$SUBNET2"; do
  RT_ID=$(aws ec2 describe-route-tables \
    --filters "Name=association.subnet-id,Values=$SUBNET" \
    --query "RouteTables[0].RouteTableId" --output text --region "$REGION" 2>/dev/null)

  if [[ "$RT_ID" == "None" || -z "$RT_ID" ]]; then
    RT_ID=$(aws ec2 describe-route-tables \
      --filters "Name=vpc-id,Values=$VPC_ID" "Name=association.main,Values=true" \
      --query "RouteTables[0].RouteTableId" --output text --region "$REGION")
  fi

  HAS_IGW=$(aws ec2 describe-route-tables \
    --route-table-ids "$RT_ID" \
    --query "RouteTables[0].Routes[?GatewayId && starts_with(GatewayId,'igw-')]" \
    --output text --region "$REGION" 2>/dev/null)

  if [[ -z "$HAS_IGW" || "$HAS_IGW" == "None" ]]; then
    error "Subnet $SUBNET has no internet gateway route."
    exit 1
  fi
done
log "Subnets have internet gateway routes"

# ══════════════════════════════════════════════════════════════════════════════
# Step 4: Create ECR repositories
# ══════════════════════════════════════════════════════════════════════════════
step "Step 4: Creating ECR repositories"

LIFECYCLE_POLICY='{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep only last 10 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}'

for REPO_NAME in "$PROJECT/backend" "$PROJECT/frontend"; do
  if aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" &>/dev/null; then
    log "ECR repo $REPO_NAME already exists"
  else
    aws ecr create-repository --repository-name "$REPO_NAME" --region "$REGION" --output text >/dev/null
    log "Created ECR repo: $REPO_NAME"
  fi

  aws ecr put-lifecycle-policy \
    --repository-name "$REPO_NAME" \
    --lifecycle-policy-text "$LIFECYCLE_POLICY" \
    --region "$REGION" --output text >/dev/null
  log "Lifecycle policy set for $REPO_NAME (keep last 10 images)"
done

BACKEND_REPO_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$PROJECT/backend"
FRONTEND_REPO_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$PROJECT/frontend"
save_resource "backend_repo_uri" "$BACKEND_REPO_URI"
save_resource "frontend_repo_uri" "$FRONTEND_REPO_URI"

# ══════════════════════════════════════════════════════════════════════════════
# Step 5: Create IAM roles
# ══════════════════════════════════════════════════════════════════════════════
step "Step 5: Setting up IAM roles"

# --- ECS Task Execution Role (for pulling images, log routing) ---
EXECUTION_ROLE_NAME="ecsTaskExecutionRole"

ECS_TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}'

if aws iam get-role --role-name "$EXECUTION_ROLE_NAME" &>/dev/null; then
  log "IAM role $EXECUTION_ROLE_NAME already exists"
else
  aws iam create-role \
    --role-name "$EXECUTION_ROLE_NAME" \
    --assume-role-policy-document "$ECS_TRUST_POLICY" \
    --output text >/dev/null
  log "Created IAM role: $EXECUTION_ROLE_NAME"
fi

aws iam attach-role-policy \
  --role-name "$EXECUTION_ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" 2>/dev/null || true
log "AmazonECSTaskExecutionRolePolicy attached"

SM_LOGS_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:*:*:secret:*"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup"],
      "Resource": "*"
    }
  ]
}'

aws iam put-role-policy \
  --role-name "$EXECUTION_ROLE_NAME" \
  --policy-name "SecretsManagerAccess" \
  --policy-document "$SM_LOGS_POLICY" 2>/dev/null || true
log "Secrets Manager + CloudWatch Logs inline policy attached"

EXECUTION_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${EXECUTION_ROLE_NAME}"
save_resource "execution_role_arn" "$EXECUTION_ROLE_ARN"

# --- EC2 Instance Role (for ECS agent, ECR pull, SSM, CloudWatch) ---
EC2_ROLE_NAME="${PROJECT}-${ENV}-ecs-instance-role"

EC2_TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}'

if aws iam get-role --role-name "$EC2_ROLE_NAME" &>/dev/null; then
  log "IAM role $EC2_ROLE_NAME already exists"
else
  aws iam create-role \
    --role-name "$EC2_ROLE_NAME" \
    --assume-role-policy-document "$EC2_TRUST_POLICY" \
    --output text >/dev/null
  log "Created IAM role: $EC2_ROLE_NAME"
fi

# Attach managed policies
aws iam attach-role-policy \
  --role-name "$EC2_ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role" 2>/dev/null || true
log "AmazonEC2ContainerServiceforEC2Role attached"

aws iam attach-role-policy \
  --role-name "$EC2_ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore" 2>/dev/null || true
log "AmazonSSMManagedInstanceCore attached"

# Inline policy for ECR, Secrets Manager, CloudWatch
EC2_INLINE_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:*:*:secret:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}'

aws iam put-role-policy \
  --role-name "$EC2_ROLE_NAME" \
  --policy-name "ECSInstancePolicy" \
  --policy-document "$EC2_INLINE_POLICY" 2>/dev/null || true
log "EC2 instance inline policy attached"

# Create instance profile
INSTANCE_PROFILE_NAME="${PROJECT}-${ENV}-ecs-instance-profile"

if aws iam get-instance-profile --instance-profile-name "$INSTANCE_PROFILE_NAME" &>/dev/null; then
  log "Instance profile $INSTANCE_PROFILE_NAME already exists"
else
  aws iam create-instance-profile \
    --instance-profile-name "$INSTANCE_PROFILE_NAME" --output text >/dev/null
  log "Created instance profile: $INSTANCE_PROFILE_NAME"

  aws iam add-role-to-instance-profile \
    --instance-profile-name "$INSTANCE_PROFILE_NAME" \
    --role-name "$EC2_ROLE_NAME" 2>/dev/null || true
  log "Added $EC2_ROLE_NAME to instance profile"

  # Wait for instance profile to propagate
  info "Waiting for instance profile to propagate..."
  sleep 10
fi

save_resource "ec2_role_name" "$EC2_ROLE_NAME"
save_resource "instance_profile_name" "$INSTANCE_PROFILE_NAME"

# ══════════════════════════════════════════════════════════════════════════════
# Step 6: Create security groups
# ══════════════════════════════════════════════════════════════════════════════
step "Step 6: Creating security groups"

# --- ALB Security Group ---
ALB_SG_NAME="${PROJECT}-${ENV}-alb-sg"
ALB_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$ALB_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null)

if [[ "$ALB_SG_ID" == "None" || -z "$ALB_SG_ID" ]]; then
  ALB_SG_ID=$(aws ec2 create-security-group \
    --group-name "$ALB_SG_NAME" \
    --description "ALB security group for $PROJECT $ENV" \
    --vpc-id "$VPC_ID" \
    --query "GroupId" --output text --region "$REGION")
  log "Created ALB SG: $ALB_SG_ID"

  # Inbound: HTTP
  aws ec2 authorize-security-group-ingress --group-id "$ALB_SG_ID" \
    --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION" >/dev/null
  # Inbound: HTTPS
  aws ec2 authorize-security-group-ingress --group-id "$ALB_SG_ID" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0 --region "$REGION" >/dev/null
  # Inbound: Grafana
  aws ec2 authorize-security-group-ingress --group-id "$ALB_SG_ID" \
    --protocol tcp --port 3001 --cidr 0.0.0.0/0 --region "$REGION" >/dev/null
  log "ALB SG ingress rules added (80, 443, 3001)"
else
  log "ALB SG already exists: $ALB_SG_ID"
fi
save_resource "alb_sg_id" "$ALB_SG_ID"

# --- EC2/ECS Security Group ---
ECS_SG_NAME="${PROJECT}-${ENV}-ecs-sg"
ECS_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$ECS_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null)

if [[ "$ECS_SG_ID" == "None" || -z "$ECS_SG_ID" ]]; then
  ECS_SG_ID=$(aws ec2 create-security-group \
    --group-name "$ECS_SG_NAME" \
    --description "EC2/ECS security group for $PROJECT $ENV" \
    --vpc-id "$VPC_ID" \
    --query "GroupId" --output text --region "$REGION")
  log "Created ECS SG: $ECS_SG_ID"

  # Inbound: all traffic from ALB SG (for awsvpc tasks)
  aws ec2 authorize-security-group-ingress --group-id "$ECS_SG_ID" \
    --protocol tcp --port 0-65535 --source-group "$ALB_SG_ID" --region "$REGION" >/dev/null
  log "ECS SG ingress: all TCP from ALB SG"

  # Inbound: all TCP self-referencing (awsvpc tasks communicate via ENI IPs)
  aws ec2 authorize-security-group-ingress --group-id "$ECS_SG_ID" \
    --protocol tcp --port 0-65535 --source-group "$ECS_SG_ID" --region "$REGION" >/dev/null
  log "ECS SG ingress: all TCP self-referencing"
else
  log "ECS SG already exists: $ECS_SG_ID"
fi
save_resource "ecs_sg_id" "$ECS_SG_ID"

# --- RDS Security Group ---
RDS_SG_NAME="${PROJECT}-${ENV}-rds-sg"
RDS_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$RDS_SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null)

if [[ "$RDS_SG_ID" == "None" || -z "$RDS_SG_ID" ]]; then
  RDS_SG_ID=$(aws ec2 create-security-group \
    --group-name "$RDS_SG_NAME" \
    --description "RDS security group for $PROJECT $ENV" \
    --vpc-id "$VPC_ID" \
    --query "GroupId" --output text --region "$REGION")
  log "Created RDS SG: $RDS_SG_ID"

  # Inbound: PostgreSQL from ECS SG only
  aws ec2 authorize-security-group-ingress --group-id "$RDS_SG_ID" \
    --protocol tcp --port 5432 --source-group "$ECS_SG_ID" --region "$REGION" >/dev/null
  log "RDS SG ingress: 5432 from ECS SG"
else
  log "RDS SG already exists: $RDS_SG_ID"
fi
save_resource "rds_sg_id" "$RDS_SG_ID"

# ══════════════════════════════════════════════════════════════════════════════
# Step 7: Create RDS PostgreSQL instance
# ══════════════════════════════════════════════════════════════════════════════
step "Step 7: Creating RDS PostgreSQL instance"

DB_HOST=""
DB_PASSWORD=""
DB_SECRET_ARN=""
DB_INSTANCE_ID="${PROJECT}-${ENV}-db"
SECRET_NAME="${PROJECT}-${ENV}-db-password"

if [[ "$ENV" == "prod" ]]; then
  RDS_BACKUP_DAYS=7
  RDS_DELETION_PROTECTION="--deletion-protection"
else
  RDS_BACKUP_DAYS=1
  RDS_DELETION_PROTECTION="--no-deletion-protection"
fi

DB_STATUS=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query "DBInstances[0].DBInstanceStatus" --output text --region "$REGION" 2>/dev/null || echo "not-found")

if [[ "$DB_STATUS" == "not-found" ]]; then
  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')

  if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" &>/dev/null; then
    aws secretsmanager put-secret-value \
      --secret-id "$SECRET_NAME" \
      --secret-string "$DB_PASSWORD" \
      --region "$REGION" --output text >/dev/null
    DB_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" \
      --query "ARN" --output text --region "$REGION")
    log "Updated existing secret: $SECRET_NAME"
  else
    DB_SECRET_ARN=$(aws secretsmanager create-secret \
      --name "$SECRET_NAME" \
      --secret-string "$DB_PASSWORD" \
      --query "ARN" --output text --region "$REGION")
    log "Created secret: $SECRET_NAME"
  fi
  save_resource "db_secret_arn" "$DB_SECRET_ARN"
  save_resource "db_secret_name" "$SECRET_NAME"

  SUBNET_GROUP_NAME="${PROJECT}-${ENV}-db-subnet-group"
  if ! aws rds describe-db-subnet-groups --db-subnet-group-name "$SUBNET_GROUP_NAME" --region "$REGION" &>/dev/null; then
    aws rds create-db-subnet-group \
      --db-subnet-group-name "$SUBNET_GROUP_NAME" \
      --db-subnet-group-description "DB subnet group for $PROJECT $ENV" \
      --subnet-ids "$SUBNET1" "$SUBNET2" \
      --region "$REGION" --output text >/dev/null
    log "Created DB subnet group: $SUBNET_GROUP_NAME"
  else
    log "DB subnet group already exists: $SUBNET_GROUP_NAME"
  fi
  save_resource "db_subnet_group" "$SUBNET_GROUP_NAME"

  info "Creating RDS instance (this takes 5-10 minutes)..."
  aws rds create-db-instance \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --db-instance-class "$DB_INSTANCE_CLASS" \
    --engine postgres \
    --engine-version "16" \
    --master-username "$DB_USER" \
    --master-user-password "$DB_PASSWORD" \
    --db-name "$DB_NAME" \
    --allocated-storage "$DB_STORAGE_GB" \
    --vpc-security-group-ids "$RDS_SG_ID" \
    --db-subnet-group-name "$SUBNET_GROUP_NAME" \
    --no-publicly-accessible \
    --backup-retention-period "$RDS_BACKUP_DAYS" \
    $RDS_DELETION_PROTECTION \
    --storage-encrypted \
    --region "$REGION" --output text >/dev/null
  log "RDS instance creation started: $DB_INSTANCE_ID"
else
  log "RDS instance already exists (status: $DB_STATUS)"

  DB_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" \
    --query "ARN" --output text --region "$REGION" 2>/dev/null || echo "")
  save_resource "db_secret_arn" "$DB_SECRET_ARN"
  save_resource "db_secret_name" "$SECRET_NAME"
  save_resource "db_subnet_group" "${PROJECT}-${ENV}-db-subnet-group"
fi

info "Waiting for RDS instance to become available..."
aws rds wait db-instance-available \
  --db-instance-identifier "$DB_INSTANCE_ID" --region "$REGION"
log "RDS instance is available"

DB_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --query "DBInstances[0].Endpoint.Address" --output text --region "$REGION")
log "RDS endpoint: $DB_HOST"
save_resource "db_instance_id" "$DB_INSTANCE_ID"
save_resource "db_host" "$DB_HOST"

# ══════════════════════════════════════════════════════════════════════════════
# Step 8: ACM Certificate (if DOMAIN set)
# ══════════════════════════════════════════════════════════════════════════════
CERT_ARN=""
if [[ -n "$DOMAIN" ]]; then
  step "Step 8: Creating ACM certificate for $DOMAIN"

  CERT_ARN=$(aws acm list-certificates \
    --query "CertificateSummaryList[?DomainName=='$DOMAIN'].CertificateArn | [0]" \
    --output text --region "$REGION" 2>/dev/null)

  if [[ "$CERT_ARN" == "None" || -z "$CERT_ARN" ]]; then
    CERT_ARN=$(aws acm request-certificate \
      --domain-name "$DOMAIN" \
      --validation-method DNS \
      --query "CertificateArn" --output text --region "$REGION")
    log "Requested ACM certificate: $CERT_ARN"

    sleep 5
    VALIDATION_RECORD=$(aws acm describe-certificate \
      --certificate-arn "$CERT_ARN" \
      --query "Certificate.DomainValidationOptions[0].ResourceRecord" \
      --output json --region "$REGION")

    CNAME_NAME=$(echo "$VALIDATION_RECORD" | python3 -c "import json,sys; print(json.load(sys.stdin)['Name'])")
    CNAME_VALUE=$(echo "$VALIDATION_RECORD" | python3 -c "import json,sys; print(json.load(sys.stdin)['Value'])")

    echo ""
    warn "╔══════════════════════════════════════════════════════════════╗"
    warn "║  Add this DNS CNAME record to validate the certificate:    ║"
    warn "╚══════════════════════════════════════════════════════════════╝"
    echo "  Name:  $CNAME_NAME"
    echo "  Value: $CNAME_VALUE"
    echo ""
    info "Waiting for certificate validation..."
    aws acm wait certificate-validated --certificate-arn "$CERT_ARN" --region "$REGION"
    log "Certificate validated!"
  else
    log "ACM certificate already exists: $CERT_ARN"
  fi
  save_resource "cert_arn" "$CERT_ARN"
else
  info "Skipping ACM certificate (no DOMAIN set)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 9: Create ALB + Target Groups + Listeners (path-based routing)
# ══════════════════════════════════════════════════════════════════════════════
step "Step 9: Creating ALB and target groups"

ALB_NAME="${PROJECT}-${ENV}-alb"

# Create ALB
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names "$ALB_NAME" \
  --query "LoadBalancers[0].LoadBalancerArn" --output text --region "$REGION" 2>/dev/null || echo "not-found")

if [[ "$ALB_ARN" == "not-found" ]]; then
  ALB_ARN=$(aws elbv2 create-load-balancer \
    --name "$ALB_NAME" \
    --subnets "$SUBNET1" "$SUBNET2" \
    --security-groups "$ALB_SG_ID" \
    --scheme internet-facing \
    --type application \
    --query "LoadBalancers[0].LoadBalancerArn" --output text --region "$REGION")
  log "Created ALB: $ALB_NAME"
else
  log "ALB already exists: $ALB_NAME"
fi
save_resource "alb_arn" "$ALB_ARN"

# Backend Target Group (port 4000, ip type for awsvpc)
BACKEND_TG_NAME="${SHORT_PREFIX}-backend-tg"
BACKEND_TG_ARN=$(aws elbv2 describe-target-groups \
  --names "$BACKEND_TG_NAME" \
  --query "TargetGroups[0].TargetGroupArn" --output text --region "$REGION" 2>/dev/null || echo "not-found")

if [[ "$BACKEND_TG_ARN" == "not-found" ]]; then
  BACKEND_TG_ARN=$(aws elbv2 create-target-group \
    --name "$BACKEND_TG_NAME" \
    --protocol HTTP \
    --port "$API_PORT" \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/api/health" \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query "TargetGroups[0].TargetGroupArn" --output text --region "$REGION")
  log "Created Backend TG: $BACKEND_TG_NAME"
else
  log "Backend TG already exists: $BACKEND_TG_NAME"
fi
save_resource "backend_tg_arn" "$BACKEND_TG_ARN"

# Frontend Target Group (port 8080, ip type for awsvpc)
FRONTEND_TG_NAME="${SHORT_PREFIX}-fe-tg"
FRONTEND_TG_ARN=$(aws elbv2 describe-target-groups \
  --names "$FRONTEND_TG_NAME" \
  --query "TargetGroups[0].TargetGroupArn" --output text --region "$REGION" 2>/dev/null || echo "not-found")

if [[ "$FRONTEND_TG_ARN" == "not-found" ]]; then
  FRONTEND_TG_ARN=$(aws elbv2 create-target-group \
    --name "$FRONTEND_TG_NAME" \
    --protocol HTTP \
    --port 8080 \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/" \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query "TargetGroups[0].TargetGroupArn" --output text --region "$REGION")
  log "Created Frontend TG: $FRONTEND_TG_NAME"
else
  log "Frontend TG already exists: $FRONTEND_TG_NAME"
fi
save_resource "frontend_tg_arn" "$FRONTEND_TG_ARN"

# Monitoring Target Group (Grafana port 3000)
MONITORING_TG_NAME="${SHORT_PREFIX}-mon-tg"
MONITORING_TG_ARN=$(aws elbv2 describe-target-groups \
  --names "$MONITORING_TG_NAME" \
  --query "TargetGroups[0].TargetGroupArn" --output text --region "$REGION" 2>/dev/null || echo "not-found")

if [[ "$MONITORING_TG_ARN" == "not-found" ]]; then
  MONITORING_TG_ARN=$(aws elbv2 create-target-group \
    --name "$MONITORING_TG_NAME" \
    --protocol HTTP \
    --port 3000 \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/api/health" \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --query "TargetGroups[0].TargetGroupArn" --output text --region "$REGION")
  log "Created Monitoring TG: $MONITORING_TG_NAME"
else
  log "Monitoring TG already exists: $MONITORING_TG_NAME"
fi
save_resource "monitoring_tg_arn" "$MONITORING_TG_ARN"

# Wait for ALB to be active
aws elbv2 wait load-balancer-available --load-balancer-arns "$ALB_ARN" --region "$REGION"
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query "LoadBalancers[0].DNSName" --output text --region "$REGION")
log "ALB DNS: $ALB_DNS"
save_resource "alb_dns" "$ALB_DNS"
save_resource "alb_name" "$ALB_NAME"

# --- HTTP Listener (port 80) with path-based routing ---
HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --query "Listeners[?Port==\`80\`].ListenerArn | [0]" --output text --region "$REGION" 2>/dev/null)

if [[ "$HTTP_LISTENER_ARN" == "None" || -z "$HTTP_LISTENER_ARN" ]]; then
  if [[ -n "$DOMAIN" && -n "$CERT_ARN" ]]; then
    # HTTP redirects to HTTPS
    HTTP_LISTENER_ARN=$(aws elbv2 create-listener \
      --load-balancer-arn "$ALB_ARN" \
      --protocol HTTP --port 80 \
      --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
      --query "Listeners[0].ListenerArn" --output text --region "$REGION")
    log "Created HTTP listener (redirects to HTTPS)"
  else
    # Default action: forward to frontend TG
    HTTP_LISTENER_ARN=$(aws elbv2 create-listener \
      --load-balancer-arn "$ALB_ARN" \
      --protocol HTTP --port 80 \
      --default-actions "Type=forward,TargetGroupArn=$FRONTEND_TG_ARN" \
      --query "Listeners[0].ListenerArn" --output text --region "$REGION")
    log "Created HTTP listener (default → frontend)"

    # Add /api/* rule to route to backend
    aws elbv2 create-rule \
      --listener-arn "$HTTP_LISTENER_ARN" \
      --priority 10 \
      --conditions "Field=path-pattern,Values=/api/*" \
      --actions "Type=forward,TargetGroupArn=$BACKEND_TG_ARN" \
      --region "$REGION" --output text >/dev/null 2>&1 || true
    log "Added /api/* path rule → backend TG"
  fi
else
  log "HTTP listener already exists"
fi
save_resource "http_listener_arn" "$HTTP_LISTENER_ARN"

# HTTPS Listener (port 443, if DOMAIN set)
if [[ -n "$DOMAIN" && -n "$CERT_ARN" ]]; then
  HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners \
    --load-balancer-arn "$ALB_ARN" \
    --query "Listeners[?Port==\`443\`].ListenerArn | [0]" --output text --region "$REGION" 2>/dev/null)

  if [[ "$HTTPS_LISTENER_ARN" == "None" || -z "$HTTPS_LISTENER_ARN" ]]; then
    HTTPS_LISTENER_ARN=$(aws elbv2 create-listener \
      --load-balancer-arn "$ALB_ARN" \
      --protocol HTTPS --port 443 \
      --certificates "CertificateArn=$CERT_ARN" \
      --ssl-policy "ELBSecurityPolicy-TLS13-1-2-2021-06" \
      --default-actions "Type=forward,TargetGroupArn=$FRONTEND_TG_ARN" \
      --query "Listeners[0].ListenerArn" --output text --region "$REGION")
    log "Created HTTPS listener (default → frontend)"

    # Add /api/* rule
    aws elbv2 create-rule \
      --listener-arn "$HTTPS_LISTENER_ARN" \
      --priority 10 \
      --conditions "Field=path-pattern,Values=/api/*" \
      --actions "Type=forward,TargetGroupArn=$BACKEND_TG_ARN" \
      --region "$REGION" --output text >/dev/null 2>&1 || true
    log "Added /api/* path rule → backend TG (HTTPS)"
  else
    log "HTTPS listener already exists"
  fi
  save_resource "https_listener_arn" "$HTTPS_LISTENER_ARN"
fi

# Monitoring Listener (port 3001 → Grafana port 3000)
MONITORING_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --query "Listeners[?Port==\`3001\`].ListenerArn | [0]" --output text --region "$REGION" 2>/dev/null)

if [[ "$MONITORING_LISTENER_ARN" == "None" || -z "$MONITORING_LISTENER_ARN" ]]; then
  MONITORING_LISTENER_ARN=$(aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP --port 3001 \
    --default-actions "Type=forward,TargetGroupArn=$MONITORING_TG_ARN" \
    --query "Listeners[0].ListenerArn" --output text --region "$REGION")
  log "Created Monitoring listener on port 3001 → Grafana"
else
  log "Monitoring listener already exists"
fi
save_resource "monitoring_listener_arn" "$MONITORING_LISTENER_ARN"

# Determine URLs
if [[ -n "$DOMAIN" && -n "$CERT_ARN" ]]; then
  API_URL="https://${DOMAIN}"
else
  API_URL="http://${ALB_DNS}"
fi
save_resource "api_url" "$API_URL"

# ══════════════════════════════════════════════════════════════════════════════
# Step 10: Store Grafana admin password in Secrets Manager
# ══════════════════════════════════════════════════════════════════════════════
step "Step 10: Storing Grafana credentials"

GRAFANA_SECRET_NAME="${PROJECT}-${ENV}-grafana-password"

if aws secretsmanager describe-secret --secret-id "$GRAFANA_SECRET_NAME" --region "$REGION" &>/dev/null; then
  GRAFANA_SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$GRAFANA_SECRET_NAME" \
    --query "ARN" --output text --region "$REGION")
  log "Grafana secret already exists: $GRAFANA_SECRET_NAME"
else
  GRAFANA_SECRET_ARN=$(aws secretsmanager create-secret \
    --name "$GRAFANA_SECRET_NAME" \
    --secret-string "$GRAFANA_ADMIN_PASSWORD" \
    --query "ARN" --output text --region "$REGION")
  log "Created Grafana secret: $GRAFANA_SECRET_NAME"
fi
save_resource "grafana_secret_arn" "$GRAFANA_SECRET_ARN"
save_resource "grafana_secret_name" "$GRAFANA_SECRET_NAME"

# ══════════════════════════════════════════════════════════════════════════════
# Step 11: Create Cloud Map namespace
# ══════════════════════════════════════════════════════════════════════════════
step "Step 11: Creating Cloud Map namespace"

NAMESPACE_NAME="${PROJECT}-${ENV}.local"

# Check if namespace exists
NAMESPACE_ID=$(aws servicediscovery list-namespaces \
  --query "Namespaces[?Name=='$NAMESPACE_NAME'].Id | [0]" --output text --region "$REGION" 2>/dev/null)

if [[ "$NAMESPACE_ID" == "None" || -z "$NAMESPACE_ID" ]]; then
  # Create private DNS namespace
  OPERATION_ID=$(aws servicediscovery create-private-dns-namespace \
    --name "$NAMESPACE_NAME" \
    --vpc "$VPC_ID" \
    --query "OperationId" --output text --region "$REGION")
  log "Creating Cloud Map namespace: $NAMESPACE_NAME"

  # Wait for creation
  info "Waiting for namespace creation..."
  while true; do
    OP_STATUS=$(aws servicediscovery get-operation \
      --operation-id "$OPERATION_ID" \
      --query "Operation.Status" --output text --region "$REGION" 2>/dev/null || echo "PENDING")
    if [[ "$OP_STATUS" == "SUCCESS" ]]; then break; fi
    if [[ "$OP_STATUS" == "FAIL" ]]; then
      error "Namespace creation failed"
      exit 1
    fi
    sleep 5
  done

  NAMESPACE_ID=$(aws servicediscovery list-namespaces \
    --query "Namespaces[?Name=='$NAMESPACE_NAME'].Id | [0]" --output text --region "$REGION")
  log "Cloud Map namespace created: $NAMESPACE_ID"
else
  log "Cloud Map namespace already exists: $NAMESPACE_ID"
fi
save_resource "cloudmap_namespace_id" "$NAMESPACE_ID"
save_resource "cloudmap_namespace_name" "$NAMESPACE_NAME"

# Create monitoring service in Cloud Map (for promtail to discover loki)
CM_SERVICE_NAME="monitoring"
CM_SERVICE_ID=$(aws servicediscovery list-services \
  --filters "Name=NAMESPACE_ID,Values=$NAMESPACE_ID,Condition=EQ" \
  --query "Services[?Name=='$CM_SERVICE_NAME'].Id | [0]" \
  --output text --region "$REGION" 2>/dev/null)

if [[ "$CM_SERVICE_ID" == "None" || -z "$CM_SERVICE_ID" ]]; then
  CM_SERVICE_ID=$(aws servicediscovery create-service \
    --name "$CM_SERVICE_NAME" \
    --namespace-id "$NAMESPACE_ID" \
    --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=10}]" \
    --health-check-custom-config "FailureThreshold=1" \
    --query "Service.Id" --output text --region "$REGION")
  log "Created Cloud Map service: $CM_SERVICE_NAME"
else
  log "Cloud Map service already exists: $CM_SERVICE_ID"
fi
save_resource "cloudmap_service_id" "$CM_SERVICE_ID"

# ══════════════════════════════════════════════════════════════════════════════
# Step 12: Create ECS cluster
# ══════════════════════════════════════════════════════════════════════════════
step "Step 12: Creating ECS cluster"

CLUSTER_NAME="${PROJECT}-${ENV}-cluster"

CLUSTER_ARN=$(aws ecs describe-clusters --clusters "$CLUSTER_NAME" \
  --query "clusters[?status=='ACTIVE'].clusterArn | [0]" --output text --region "$REGION" 2>/dev/null)

if [[ "$CLUSTER_ARN" == "None" || -z "$CLUSTER_ARN" ]]; then
  CLUSTER_ARN=$(aws ecs create-cluster \
    --cluster-name "$CLUSTER_NAME" \
    --settings "name=containerInsights,value=enhanced" \
    --query "cluster.clusterArn" --output text --region "$REGION")
  log "Created ECS cluster: $CLUSTER_NAME"
else
  log "ECS cluster already exists: $CLUSTER_NAME"
fi
save_resource "cluster_name" "$CLUSTER_NAME"
save_resource "cluster_arn" "$CLUSTER_ARN"

# ══════════════════════════════════════════════════════════════════════════════
# Step 13: Generate task definitions
# ══════════════════════════════════════════════════════════════════════════════
step "Step 13: Generating task definitions"

# Pre-create CloudWatch log groups (awslogs-create-group requires logs:CreateLogGroup)
for _lg in "/ecs/${PROJECT}-${ENV}-app" "/ecs/${PROJECT}-${ENV}-monitoring" "/ecs/${PROJECT}-${ENV}-promtail"; do
  aws logs create-log-group --log-group-name "$_lg" --region "$REGION" 2>/dev/null && log "Created log group: $_lg" || true
done

APP_TASK_DEF_FILE="$SCRIPT_DIR/${PROJECT}-${ENV}-app-task-def.json"
MONITORING_TASK_DEF_FILE="$SCRIPT_DIR/${PROJECT}-${ENV}-monitoring-task-def.json"
PROMTAIL_TASK_DEF_FILE="$SCRIPT_DIR/${PROJECT}-${ENV}-promtail-task-def.json"

NODE_ENV_VALUE="production"

# App task definition (backend + frontend + redis)
cat > "$APP_TASK_DEF_FILE" <<EOF
{
  "family": "${PROJECT}-${ENV}-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["EC2"],
  "cpu": "$APP_CPU",
  "memory": "$APP_MEMORY",
  "executionRoleArn": "$EXECUTION_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "$BACKEND_REPO_URI:$ENV",
      "essential": true,
      "portMappings": [
        { "containerPort": $API_PORT, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "$NODE_ENV_VALUE" },
        { "name": "PORT", "value": "$API_PORT" },
        { "name": "DB_HOST", "value": "$DB_HOST" },
        { "name": "DB_PORT", "value": "5432" },
        { "name": "DB_NAME", "value": "$DB_NAME" },
        { "name": "DB_USER", "value": "$DB_USER" },
        { "name": "REDIS_HOST", "value": "localhost" },
        { "name": "REDIS_PORT", "value": "6379" }
      ],
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "$DB_SECRET_ARN"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PROJECT}-${ENV}-app",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "backend",
          "awslogs-create-group": "true"
        }
      }
    },
    {
      "name": "frontend",
      "image": "$FRONTEND_REPO_URI:$ENV",
      "essential": true,
      "portMappings": [
        { "containerPort": 8080, "protocol": "tcp" }
      ],
      "environment": [],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PROJECT}-${ENV}-app",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "frontend",
          "awslogs-create-group": "true"
        }
      }
    },
    {
      "name": "redis",
      "image": "redis:alpine",
      "essential": false,
      "portMappings": [
        { "containerPort": 6379, "protocol": "tcp" }
      ],
      "command": ["redis-server", "--appendonly", "yes"],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PROJECT}-${ENV}-app",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "redis",
          "awslogs-create-group": "true"
        }
      }
    }
  ]
}
EOF
log "Generated App task definition: $APP_TASK_DEF_FILE"

# Monitoring task definition (loki + grafana)
cat > "$MONITORING_TASK_DEF_FILE" <<EOF
{
  "family": "${PROJECT}-${ENV}-monitoring",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["EC2"],
  "cpu": "512",
  "memory": "512",
  "executionRoleArn": "$EXECUTION_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "loki",
      "image": "grafana/loki:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 3100, "protocol": "tcp" }
      ],
      "command": ["-config.file=/etc/loki/local-config.yaml"],
      "mountPoints": [
        {
          "sourceVolume": "loki-config",
          "containerPath": "/etc/loki",
          "readOnly": true
        },
        {
          "sourceVolume": "loki-data",
          "containerPath": "/loki/data",
          "readOnly": false
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PROJECT}-${ENV}-monitoring",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "loki",
          "awslogs-create-group": "true"
        }
      }
    },
    {
      "name": "grafana",
      "image": "grafana/grafana:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 3000, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "GF_SECURITY_ADMIN_USER", "value": "$GRAFANA_ADMIN_USER" },
        { "name": "GF_USERS_ALLOW_SIGN_UP", "value": "false" }
      ],
      "secrets": [
        {
          "name": "GF_SECURITY_ADMIN_PASSWORD",
          "valueFrom": "$GRAFANA_SECRET_ARN"
        }
      ],
      "mountPoints": [
        {
          "sourceVolume": "grafana-datasources",
          "containerPath": "/etc/grafana/provisioning/datasources",
          "readOnly": true
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PROJECT}-${ENV}-monitoring",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "grafana",
          "awslogs-create-group": "true"
        }
      }
    }
  ],
  "volumes": [
    {
      "name": "loki-config",
      "host": { "sourcePath": "/opt/ecs/config/loki" }
    },
    {
      "name": "loki-data",
      "host": { "sourcePath": "/opt/ecs/loki-data" }
    },
    {
      "name": "grafana-datasources",
      "host": { "sourcePath": "/opt/ecs/config/grafana" }
    }
  ]
}
EOF
log "Generated Monitoring task definition: $MONITORING_TASK_DEF_FILE"

# Promtail daemon task definition (host network mode)
cat > "$PROMTAIL_TASK_DEF_FILE" <<EOF
{
  "family": "${PROJECT}-${ENV}-promtail",
  "networkMode": "host",
  "requiresCompatibilities": ["EC2"],
  "cpu": "128",
  "memory": "256",
  "executionRoleArn": "$EXECUTION_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "promtail",
      "image": "grafana/promtail:latest",
      "essential": true,
      "command": [
        "-config.file=/etc/promtail/config.yaml",
        "-client.url=http://monitoring.${NAMESPACE_NAME}:3100/loki/api/v1/push"
      ],
      "mountPoints": [
        {
          "sourceVolume": "docker-socket",
          "containerPath": "/var/run/docker.sock",
          "readOnly": false
        },
        {
          "sourceVolume": "docker-containers",
          "containerPath": "/var/lib/docker/containers",
          "readOnly": true
        },
        {
          "sourceVolume": "promtail-config",
          "containerPath": "/etc/promtail",
          "readOnly": true
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PROJECT}-${ENV}-promtail",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "promtail",
          "awslogs-create-group": "true"
        }
      }
    }
  ],
  "volumes": [
    {
      "name": "docker-socket",
      "host": { "sourcePath": "/var/run/docker.sock" }
    },
    {
      "name": "docker-containers",
      "host": { "sourcePath": "/var/lib/docker/containers" }
    },
    {
      "name": "promtail-config",
      "host": { "sourcePath": "/opt/ecs/config/promtail" }
    }
  ]
}
EOF
log "Generated Promtail task definition: $PROMTAIL_TASK_DEF_FILE"

# ══════════════════════════════════════════════════════════════════════════════
# Step 14: Build and push Docker images
# ══════════════════════════════════════════════════════════════════════════════
step "Step 14: Building and pushing Docker images"

aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
log "Logged in to ECR"

# Build and push Backend
info "Building Backend image..."
docker build --platform linux/amd64 -t "$BACKEND_REPO_URI:$ENV" "$PROJECT_ROOT/backend"
docker push "$BACKEND_REPO_URI:$ENV"
log "Backend image pushed: $BACKEND_REPO_URI:$ENV"

# Build and push Frontend (use empty VITE_API_URL for relative paths via ALB)
info "Building Frontend image..."
docker build --platform linux/amd64 \
  --build-arg "VITE_API_URL=" \
  -t "$FRONTEND_REPO_URI:$ENV" "$PROJECT_ROOT/frontend"
docker push "$FRONTEND_REPO_URI:$ENV"
log "Frontend image pushed: $FRONTEND_REPO_URI:$ENV"

# ══════════════════════════════════════════════════════════════════════════════
# Step 15: Create EC2 launch template
# ══════════════════════════════════════════════════════════════════════════════
step "Step 15: Creating EC2 launch template"

LAUNCH_TEMPLATE_NAME="${PROJECT}-${ENV}-ecs-lt"

# Get ECS-optimized AMI
ECS_AMI_ID=$(aws ssm get-parameters \
  --names "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id" \
  --query "Parameters[0].Value" --output text --region "$REGION")
log "ECS-optimized AMI: $ECS_AMI_ID"

# Build user data script
USER_DATA_SCRIPT=$(cat <<'USERDATA_EOF'
#!/bin/bash
# Configure ECS agent
cat >> /etc/ecs/ecs.config <<ECSCONF
ECS_CLUSTER=__CLUSTER_NAME__
ECS_ENABLE_TASK_IAM_ROLE=true
ECS_ENABLE_TASK_ENI=true
ECSCONF

# Create config directories
mkdir -p /opt/ecs/config/loki
mkdir -p /opt/ecs/config/grafana
mkdir -p /opt/ecs/config/promtail
mkdir -p /opt/ecs/loki-data

# Write Loki config
cat > /opt/ecs/config/loki/local-config.yaml <<'LOKICONF'
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki/data
  storage:
    filesystem:
      chunks_directory: /loki/data/chunks
      rules_directory: /loki/data/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: "2020-10-24"
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 168h

compactor:
  working_directory: /loki/data/compactor
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
  delete_request_store: filesystem
LOKICONF

# Write Promtail config
cat > /opt/ecs/config/promtail/config.yaml <<'PROMCONF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://localhost:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ["__meta_docker_container_name"]
        regex: "/(.*)"
        target_label: "container"
      - source_labels: ["__meta_docker_container_log_stream"]
        target_label: "logstream"
      - source_labels: ["__meta_docker_container_label_com_amazonaws_ecs_task_definition_family"]
        target_label: "task_family"
      - source_labels: ["__meta_docker_container_label_com_amazonaws_ecs_container_name"]
        target_label: "ecs_container"
PROMCONF

# Write Grafana datasources
cat > /opt/ecs/config/grafana/datasources.yml <<'GRAFCONF'
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://localhost:3100
    isDefault: true
    editable: false
GRAFCONF

# Fix permissions for loki data directory
chmod -R 777 /opt/ecs/loki-data
USERDATA_EOF
)

# Replace placeholders
USER_DATA_SCRIPT="${USER_DATA_SCRIPT//__CLUSTER_NAME__/$CLUSTER_NAME}"

# Base64 encode
USER_DATA_B64=$(echo "$USER_DATA_SCRIPT" | base64)

# Check if launch template exists
LT_EXISTS=$(aws ec2 describe-launch-templates \
  --launch-template-names "$LAUNCH_TEMPLATE_NAME" \
  --query "LaunchTemplates[0].LaunchTemplateId" --output text --region "$REGION" 2>/dev/null || echo "not-found")

if [[ "$LT_EXISTS" == "not-found" ]]; then
  LAUNCH_TEMPLATE_ID=$(aws ec2 create-launch-template \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --launch-template-data "{
      \"ImageId\": \"$ECS_AMI_ID\",
      \"InstanceType\": \"$INSTANCE_TYPE\",
      \"IamInstanceProfile\": {\"Name\": \"$INSTANCE_PROFILE_NAME\"},
      \"SecurityGroupIds\": [\"$ECS_SG_ID\"],
      \"UserData\": \"$USER_DATA_B64\",
      \"TagSpecifications\": [{
        \"ResourceType\": \"instance\",
        \"Tags\": [{\"Key\": \"Name\", \"Value\": \"${PROJECT}-${ENV}-ecs-instance\"}]
      }]
    }" \
    --query "LaunchTemplate.LaunchTemplateId" --output text --region "$REGION")
  log "Created launch template: $LAUNCH_TEMPLATE_NAME ($LAUNCH_TEMPLATE_ID)"
else
  LAUNCH_TEMPLATE_ID="$LT_EXISTS"
  # Create new version with updated config
  aws ec2 create-launch-template-version \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --launch-template-data "{
      \"ImageId\": \"$ECS_AMI_ID\",
      \"InstanceType\": \"$INSTANCE_TYPE\",
      \"IamInstanceProfile\": {\"Name\": \"$INSTANCE_PROFILE_NAME\"},
      \"SecurityGroupIds\": [\"$ECS_SG_ID\"],
      \"UserData\": \"$USER_DATA_B64\",
      \"TagSpecifications\": [{
        \"ResourceType\": \"instance\",
        \"Tags\": [{\"Key\": \"Name\", \"Value\": \"${PROJECT}-${ENV}-ecs-instance\"}]
      }]
    }" \
    --region "$REGION" --output text >/dev/null
  aws ec2 modify-launch-template \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --default-version '$Latest' \
    --region "$REGION" --output text >/dev/null
  log "Updated launch template: $LAUNCH_TEMPLATE_NAME"
fi
save_resource "launch_template_name" "$LAUNCH_TEMPLATE_NAME"
save_resource "launch_template_id" "$LAUNCH_TEMPLATE_ID"

# ══════════════════════════════════════════════════════════════════════════════
# Step 16: Create Auto Scaling Group
# ══════════════════════════════════════════════════════════════════════════════
step "Step 16: Creating Auto Scaling Group"

ASG_NAME="${PROJECT}-${ENV}-ecs-asg"

ASG_EXISTS=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].AutoScalingGroupName" --output text --region "$REGION" 2>/dev/null || echo "None")

if [[ "$ASG_EXISTS" == "None" || -z "$ASG_EXISTS" ]]; then
  aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version=\$Latest" \
    --min-size "$ASG_MIN" \
    --max-size "$ASG_MAX" \
    --desired-capacity "$ASG_DESIRED" \
    --vpc-zone-identifier "$SUBNET1,$SUBNET2" \
    --health-check-type EC2 \
    --health-check-grace-period 300 \
    --tags "Key=Name,Value=${PROJECT}-${ENV}-ecs-instance,PropagateAtLaunch=true" \
      "Key=Project,Value=$PROJECT,PropagateAtLaunch=true" \
      "Key=Environment,Value=$ENV,PropagateAtLaunch=true" \
    --region "$REGION"
  log "Created ASG: $ASG_NAME (min=$ASG_MIN, max=$ASG_MAX, desired=$ASG_DESIRED)"
else
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version=\$Latest" \
    --min-size "$ASG_MIN" \
    --max-size "$ASG_MAX" \
    --desired-capacity "$ASG_DESIRED" \
    --region "$REGION"
  log "Updated ASG: $ASG_NAME"
fi
save_resource "asg_name" "$ASG_NAME"

# Wait for instances to come up
info "Waiting for EC2 instances to launch..."
ATTEMPTS=0
while true; do
  INSTANCE_COUNT=$(aws autoscaling describe-auto-scaling-groups \
    --auto-scaling-group-names "$ASG_NAME" \
    --query "AutoScalingGroups[0].Instances[?LifecycleState=='InService'] | length(@)" \
    --output text --region "$REGION" 2>/dev/null || echo "0")
  if [[ "$INSTANCE_COUNT" -ge "$ASG_DESIRED" ]]; then
    break
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  if [[ $ATTEMPTS -ge 60 ]]; then
    warn "Timeout waiting for instances (continuing anyway)..."
    break
  fi
  sleep 10
done
log "EC2 instances running: $INSTANCE_COUNT"

# ══════════════════════════════════════════════════════════════════════════════
# Step 17: Create ECS capacity provider
# ══════════════════════════════════════════════════════════════════════════════
step "Step 17: Creating ECS capacity provider"

CAPACITY_PROVIDER_NAME="${PROJECT}-${ENV}-cp"

# Get ASG ARN
ASG_ARN=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --query "AutoScalingGroups[0].AutoScalingGroupARN" --output text --region "$REGION")

CP_EXISTS=$(aws ecs describe-capacity-providers \
  --capacity-providers "$CAPACITY_PROVIDER_NAME" \
  --query "capacityProviders[0].name" --output text --region "$REGION" 2>/dev/null || echo "not-found")

if [[ "$CP_EXISTS" == "not-found" || "$CP_EXISTS" == "None" ]]; then
  aws ecs create-capacity-provider \
    --name "$CAPACITY_PROVIDER_NAME" \
    --auto-scaling-group-provider "autoScalingGroupArn=$ASG_ARN,managedScaling={status=ENABLED,targetCapacity=100,minimumScalingStepSize=1,maximumScalingStepSize=2},managedTerminationProtection=DISABLED" \
    --region "$REGION" --output text >/dev/null
  log "Created capacity provider: $CAPACITY_PROVIDER_NAME"
else
  log "Capacity provider already exists: $CAPACITY_PROVIDER_NAME"
fi
save_resource "capacity_provider_name" "$CAPACITY_PROVIDER_NAME"

# Associate capacity provider with cluster
aws ecs put-cluster-capacity-providers \
  --cluster "$CLUSTER_NAME" \
  --capacity-providers "$CAPACITY_PROVIDER_NAME" \
  --default-capacity-provider-strategy "capacityProvider=$CAPACITY_PROVIDER_NAME,weight=1" \
  --region "$REGION" --output text >/dev/null 2>&1 || true
log "Capacity provider associated with cluster"

# Wait for container instances to register
info "Waiting for ECS container instances to register..."
ATTEMPTS=0
while true; do
  CI_COUNT=$(aws ecs list-container-instances --cluster "$CLUSTER_NAME" \
    --query "containerInstanceArns | length(@)" --output text --region "$REGION" 2>/dev/null || echo "0")
  if [[ "$CI_COUNT" -ge 1 ]]; then
    break
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  if [[ $ATTEMPTS -ge 30 ]]; then
    warn "Timeout waiting for container instances (continuing anyway)..."
    break
  fi
  sleep 10
done
log "Container instances registered: $CI_COUNT"

# ══════════════════════════════════════════════════════════════════════════════
# Step 18: Register task definitions
# ══════════════════════════════════════════════════════════════════════════════
step "Step 18: Registering task definitions"

APP_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "file://$APP_TASK_DEF_FILE" \
  --query "taskDefinition.taskDefinitionArn" --output text --region "$REGION")
log "Registered App task definition: $APP_TASK_DEF_ARN"
save_resource "app_task_def_arn" "$APP_TASK_DEF_ARN"
save_resource "app_task_family" "${PROJECT}-${ENV}-app"

MONITORING_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "file://$MONITORING_TASK_DEF_FILE" \
  --query "taskDefinition.taskDefinitionArn" --output text --region "$REGION")
log "Registered Monitoring task definition: $MONITORING_TASK_DEF_ARN"
save_resource "monitoring_task_def_arn" "$MONITORING_TASK_DEF_ARN"
save_resource "monitoring_task_family" "${PROJECT}-${ENV}-monitoring"

PROMTAIL_TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "file://$PROMTAIL_TASK_DEF_FILE" \
  --query "taskDefinition.taskDefinitionArn" --output text --region "$REGION")
log "Registered Promtail task definition: $PROMTAIL_TASK_DEF_ARN"
save_resource "promtail_task_def_arn" "$PROMTAIL_TASK_DEF_ARN"
save_resource "promtail_task_family" "${PROJECT}-${ENV}-promtail"

# ══════════════════════════════════════════════════════════════════════════════
# Step 19: Create ECS services
# ══════════════════════════════════════════════════════════════════════════════
step "Step 19: Creating ECS services"

APP_SERVICE_NAME="${PROJECT}-${ENV}-app-service"
MONITORING_SERVICE_NAME="${PROJECT}-${ENV}-monitoring-service"
PROMTAIL_SERVICE_NAME="${PROJECT}-${ENV}-promtail-service"

DEPLOY_CONFIG="maximumPercent=200,minimumHealthyPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}"

# --- App Service (backend + frontend + redis) ---
APP_SVC_STATUS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$APP_SERVICE_NAME" \
  --query "services[?status=='ACTIVE'].serviceName | [0]" --output text --region "$REGION" 2>/dev/null || echo "None")

if [[ "$APP_SVC_STATUS" == "None" || -z "$APP_SVC_STATUS" ]]; then
  aws ecs create-service \
    --cluster "$CLUSTER_NAME" \
    --service-name "$APP_SERVICE_NAME" \
    --task-definition "${PROJECT}-${ENV}-app" \
    --desired-count "$DESIRED_COUNT" \
    --capacity-provider-strategy "capacityProvider=$CAPACITY_PROVIDER_NAME,weight=1" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET1,$SUBNET2],securityGroups=[$ECS_SG_ID]}" \
    --load-balancers "targetGroupArn=$BACKEND_TG_ARN,containerName=backend,containerPort=$API_PORT" "targetGroupArn=$FRONTEND_TG_ARN,containerName=frontend,containerPort=8080" \
    --deployment-configuration "$DEPLOY_CONFIG" \
    --health-check-grace-period-seconds 120 \
    --region "$REGION" --output text >/dev/null
  log "Created App service: $APP_SERVICE_NAME"
else
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$APP_SERVICE_NAME" \
    --task-definition "${PROJECT}-${ENV}-app" \
    --desired-count "$DESIRED_COUNT" \
    --deployment-configuration "$DEPLOY_CONFIG" \
    --force-new-deployment \
    --region "$REGION" --output text >/dev/null
  log "Updated App service: $APP_SERVICE_NAME"
fi
save_resource "app_service_name" "$APP_SERVICE_NAME"

# --- Monitoring Service (loki + grafana) ---
MONITORING_SVC_STATUS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$MONITORING_SERVICE_NAME" \
  --query "services[?status=='ACTIVE'].serviceName | [0]" --output text --region "$REGION" 2>/dev/null || echo "None")

if [[ "$MONITORING_SVC_STATUS" == "None" || -z "$MONITORING_SVC_STATUS" ]]; then
  aws ecs create-service \
    --cluster "$CLUSTER_NAME" \
    --service-name "$MONITORING_SERVICE_NAME" \
    --task-definition "${PROJECT}-${ENV}-monitoring" \
    --desired-count 1 \
    --capacity-provider-strategy "capacityProvider=$CAPACITY_PROVIDER_NAME,weight=1" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET1,$SUBNET2],securityGroups=[$ECS_SG_ID]}" \
    --load-balancers "targetGroupArn=$MONITORING_TG_ARN,containerName=grafana,containerPort=3000" \
    --service-registries "registryArn=arn:aws:servicediscovery:${REGION}:${ACCOUNT_ID}:service/${CM_SERVICE_ID}" \
    --deployment-configuration "$DEPLOY_CONFIG" \
    --health-check-grace-period-seconds 120 \
    --region "$REGION" --output text >/dev/null
  log "Created Monitoring service: $MONITORING_SERVICE_NAME"
else
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$MONITORING_SERVICE_NAME" \
    --task-definition "${PROJECT}-${ENV}-monitoring" \
    --desired-count 1 \
    --deployment-configuration "$DEPLOY_CONFIG" \
    --force-new-deployment \
    --region "$REGION" --output text >/dev/null
  log "Updated Monitoring service: $MONITORING_SERVICE_NAME"
fi
save_resource "monitoring_service_name" "$MONITORING_SERVICE_NAME"

# --- Promtail Daemon Service (one per EC2 instance) ---
PROMTAIL_SVC_STATUS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$PROMTAIL_SERVICE_NAME" \
  --query "services[?status=='ACTIVE'].serviceName | [0]" --output text --region "$REGION" 2>/dev/null || echo "None")

if [[ "$PROMTAIL_SVC_STATUS" == "None" || -z "$PROMTAIL_SVC_STATUS" ]]; then
  aws ecs create-service \
    --cluster "$CLUSTER_NAME" \
    --service-name "$PROMTAIL_SERVICE_NAME" \
    --task-definition "${PROJECT}-${ENV}-promtail" \
    --launch-type EC2 \
    --scheduling-strategy DAEMON \
    --deployment-configuration "maximumPercent=100,minimumHealthyPercent=0" \
    --region "$REGION" --output text >/dev/null
  log "Created Promtail daemon service: $PROMTAIL_SERVICE_NAME"
else
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$PROMTAIL_SERVICE_NAME" \
    --task-definition "${PROJECT}-${ENV}-promtail" \
    --force-new-deployment \
    --region "$REGION" --output text >/dev/null
  log "Updated Promtail daemon service: $PROMTAIL_SERVICE_NAME"
fi
save_resource "promtail_service_name" "$PROMTAIL_SERVICE_NAME"

# ══════════════════════════════════════════════════════════════════════════════
# Step 20: Auto-scaling (prod only)
# ══════════════════════════════════════════════════════════════════════════════
if [[ "$ENV" == "prod" && "$AUTOSCALE_ENABLED" == "true" ]]; then
  step "Step 20: Setting up auto-scaling"

  RESOURCE_ID="service/${CLUSTER_NAME}/${APP_SERVICE_NAME}"

  aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --scalable-dimension "ecs:service:DesiredCount" \
    --resource-id "$RESOURCE_ID" \
    --min-capacity "$AUTOSCALE_MIN" \
    --max-capacity "$AUTOSCALE_MAX" \
    --region "$REGION" 2>/dev/null || true

  POLICY_NAME="${APP_SERVICE_NAME}-cpu-scaling"
  aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension "ecs:service:DesiredCount" \
    --resource-id "$RESOURCE_ID" \
    --policy-name "$POLICY_NAME" \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration "{
      \"TargetValue\": $AUTOSCALE_CPU_TARGET,
      \"PredefinedMetricSpecification\": {
        \"PredefinedMetricType\": \"ECSServiceAverageCPUUtilization\"
      },
      \"ScaleOutCooldown\": 60,
      \"ScaleInCooldown\": 120
    }" \
    --region "$REGION" --output text >/dev/null 2>&1 || true

  log "Auto-scaling configured for $APP_SERVICE_NAME (min=$AUTOSCALE_MIN, max=$AUTOSCALE_MAX, CPU target=$AUTOSCALE_CPU_TARGET%)"
  save_resource "autoscale_enabled" "true"
else
  info "Skipping auto-scaling (test env or disabled)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 21: CloudWatch alarms
# ══════════════════════════════════════════════════════════════════════════════
if [[ "$ALARMS_ENABLED" == "true" ]]; then
  step "Step 21: Creating CloudWatch alarms"

  SNS_TOPIC_NAME="${PROJECT}-${ENV}-alerts"
  SNS_TOPIC_ARN=$(aws sns create-topic --name "$SNS_TOPIC_NAME" \
    --query "TopicArn" --output text --region "$REGION")
  log "SNS topic: $SNS_TOPIC_ARN"
  save_resource "sns_topic_arn" "$SNS_TOPIC_ARN"
  save_resource "sns_topic_name" "$SNS_TOPIC_NAME"

  if [[ -n "$ALARM_EMAIL" ]]; then
    aws sns subscribe --topic-arn "$SNS_TOPIC_ARN" \
      --protocol email --notification-endpoint "$ALARM_EMAIL" \
      --region "$REGION" --output text >/dev/null
    log "Subscribed $ALARM_EMAIL to alerts (confirm the email)"
  fi

  # Alarm: App service CPU > 80% for 5 min
  aws cloudwatch put-metric-alarm \
    --alarm-name "${PROJECT}-${ENV}-app-high-cpu" \
    --alarm-description "App service CPU utilization > 80% for 5 minutes" \
    --namespace "AWS/ECS" \
    --metric-name "CPUUtilization" \
    --dimensions "Name=ClusterName,Value=$CLUSTER_NAME" "Name=ServiceName,Value=$APP_SERVICE_NAME" \
    --statistic Average \
    --period 300 \
    --threshold 80 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --alarm-actions "$SNS_TOPIC_ARN" \
    --region "$REGION" 2>/dev/null
  log "Alarm created: App high CPU"

  # Alarm: Unhealthy target count > 0 for 2 min
  aws cloudwatch put-metric-alarm \
    --alarm-name "${PROJECT}-${ENV}-unhealthy-targets" \
    --alarm-description "Unhealthy target count > 0 for 2 minutes" \
    --namespace "AWS/ApplicationELB" \
    --metric-name "UnHealthyHostCount" \
    --dimensions "Name=TargetGroup,Value=$(echo "$BACKEND_TG_ARN" | sed 's|.*:\(targetgroup/.*\)|\1|')" "Name=LoadBalancer,Value=$(echo "$ALB_ARN" | sed 's|.*:loadbalancer/\(.*\)|\1|')" \
    --statistic Sum \
    --period 60 \
    --threshold 0 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 2 \
    --alarm-actions "$SNS_TOPIC_ARN" \
    --region "$REGION" 2>/dev/null
  log "Alarm created: Unhealthy targets"

  # Alarm: ALB 5xx count > 10 in 5 min
  aws cloudwatch put-metric-alarm \
    --alarm-name "${PROJECT}-${ENV}-alb-5xx" \
    --alarm-description "ALB 5xx errors > 10 in 5 minutes" \
    --namespace "AWS/ApplicationELB" \
    --metric-name "HTTPCode_ELB_5XX_Count" \
    --dimensions "Name=LoadBalancer,Value=$(echo "$ALB_ARN" | sed 's|.*:loadbalancer/\(.*\)|\1|')" \
    --statistic Sum \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold \
    --evaluation-periods 1 \
    --alarm-actions "$SNS_TOPIC_ARN" \
    --treat-missing-data "notBreaching" \
    --region "$REGION" 2>/dev/null
  log "Alarm created: ALB 5xx errors"
else
  info "Skipping CloudWatch alarms (disabled)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 22: Wait for services to stabilize
# ══════════════════════════════════════════════════════════════════════════════
step "Step 22: Waiting for services to stabilize"
info "This may take 2-5 minutes..."

aws ecs wait services-stable \
  --cluster "$CLUSTER_NAME" \
  --services "$APP_SERVICE_NAME" "$MONITORING_SERVICE_NAME" \
  --region "$REGION" 2>/dev/null || warn "Timeout waiting for stabilization (services may still be starting)"
log "Services stabilized"

# ══════════════════════════════════════════════════════════════════════════════
# Step 23: Save resources file
# ══════════════════════════════════════════════════════════════════════════════
step "Step 23: Resources saved"
log "Resources file: $RESOURCES_FILE"

# ══════════════════════════════════════════════════════════════════════════════
# Step 24: GitHub Actions OIDC setup
# ══════════════════════════════════════════════════════════════════════════════
OIDC_ROLE_ARN=""
if [[ -n "$GITHUB_REPO" ]]; then
  step "Step 24: Setting up GitHub Actions OIDC"

  OIDC_PROVIDER_URL="token.actions.githubusercontent.com"
  OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_PROVIDER_URL}"

  if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_PROVIDER_ARN" &>/dev/null; then
    log "OIDC provider already exists"
  else
    aws iam create-open-id-connect-provider \
      --url "https://${OIDC_PROVIDER_URL}" \
      --client-id-list "sts.amazonaws.com" \
      --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
      --output text >/dev/null 2>&1
    log "Created OIDC provider for GitHub Actions"
  fi

  OIDC_ROLE_NAME="${PROJECT}-github-deploy"
  OIDC_TRUST_POLICY=$(cat <<TRUSTEOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "$OIDC_PROVIDER_ARN"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_PROVIDER_URL}:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "${OIDC_PROVIDER_URL}:sub": "repo:${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
TRUSTEOF
)

  if aws iam get-role --role-name "$OIDC_ROLE_NAME" &>/dev/null; then
    aws iam update-assume-role-policy \
      --role-name "$OIDC_ROLE_NAME" \
      --policy-document "$OIDC_TRUST_POLICY" 2>/dev/null || true
    log "OIDC role already exists, updated trust policy: $OIDC_ROLE_NAME"
  else
    aws iam create-role \
      --role-name "$OIDC_ROLE_NAME" \
      --assume-role-policy-document "$OIDC_TRUST_POLICY" \
      --output text >/dev/null
    log "Created OIDC role: $OIDC_ROLE_NAME"
  fi

  DEPLOY_POLICY=$(cat <<POLICYEOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:ListTasks",
        "ecs:DescribeTasks"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "$EXECUTION_ROLE_ARN"
    }
  ]
}
POLICYEOF
)

  aws iam put-role-policy \
    --role-name "$OIDC_ROLE_NAME" \
    --policy-name "ECSDeployPolicy" \
    --policy-document "$DEPLOY_POLICY" 2>/dev/null || true
  log "Deploy policy attached to OIDC role"

  OIDC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${OIDC_ROLE_NAME}"
  save_resource "oidc_role_arn" "$OIDC_ROLE_ARN"
  save_resource "oidc_role_name" "$OIDC_ROLE_NAME"
else
  info "Skipping GitHub Actions OIDC (no GITHUB_REPO set)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 25: Print summary
# ══════════════════════════════════════════════════════════════════════════════
step "Setup complete!"

WEB_URL="http://${ALB_DNS}"
[[ -n "$DOMAIN" && -n "$CERT_ARN" ]] && WEB_URL="https://${DOMAIN}"
HEALTH_URL="${API_URL}/api/health"
GRAFANA_URL="http://${ALB_DNS}:3001"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Deployment Summary                                        ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  Environment:  ${CYAN}$ENV${NC}"
echo -e "${GREEN}║${NC}  Web URL:      ${CYAN}$WEB_URL${NC}"
echo -e "${GREEN}║${NC}  API URL:      ${CYAN}$API_URL/api/health${NC}"
echo -e "${GREEN}║${NC}  Grafana:      ${CYAN}$GRAFANA_URL${NC}"
echo -e "${GREEN}║${NC}  Grafana User: ${CYAN}$GRAFANA_ADMIN_USER${NC}"
[[ -n "$DB_HOST" ]] && \
echo -e "${GREEN}║${NC}  Database:     ${CYAN}$DB_HOST${NC}"
echo -e "${GREEN}║${NC}  Cluster:      ${CYAN}$CLUSTER_NAME${NC}"
echo -e "${GREEN}║${NC}  ASG:          ${CYAN}$ASG_NAME${NC}"
echo -e "${GREEN}║${NC}  Resources:    ${CYAN}$RESOURCES_FILE${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"

if [[ -n "$GITHUB_REPO" || -n "$OIDC_ROLE_ARN" ]]; then
  echo ""
  echo -e "${CYAN}GitHub Actions Variables (copy to repo settings):${NC}"
  echo "────────────────────────────────────────────────────"
  echo "  AWS_REGION        = $REGION"
  echo "  AWS_ACCOUNT_ID    = $ACCOUNT_ID"
  echo "  ECS_CLUSTER       = $CLUSTER_NAME"
  echo "  APP_SERVICE_NAME  = $APP_SERVICE_NAME"
  echo "  IMAGE_TAG         = $ENV"
  echo "  PROJECT_NAME      = $PROJECT"
  [[ -n "$OIDC_ROLE_ARN" ]] && \
  echo "  OIDC_ROLE_ARN     = $OIDC_ROLE_ARN"
  echo "────────────────────────────────────────────────────"
fi

echo ""
echo -e "${CYAN}Useful commands:${NC}"
echo "  # View app logs (via Grafana)"
echo "  open $GRAFANA_URL"
echo ""
echo "  # Scale app service"
echo "  aws ecs update-service --cluster $CLUSTER_NAME --service $APP_SERVICE_NAME --desired-count 3 --region $REGION"
echo ""
echo "  # Check service status"
echo "  aws ecs describe-services --cluster $CLUSTER_NAME --services $APP_SERVICE_NAME $MONITORING_SERVICE_NAME $PROMTAIL_SERVICE_NAME --region $REGION --query 'services[*].{name:serviceName,status:status,running:runningCount,desired:desiredCount}' --output table"
echo ""
echo "  # SSH into instance via SSM"
echo "  aws ssm start-session --target <instance-id> --region $REGION"
echo ""

log "Done! Your infrastructure is ready."
