#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  AWS ECS on EC2 — Teardown Script                                          ║
# ║  Reads resources JSON and deletes in reverse dependency order              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ── Config (leave blank to be prompted) ───────────────
PROJECT=""                   # project name
ENV=""                       # "test" or "prod"
REGION=""                    # AWS region
DELETE_ECR_REPOS="false"     # set to "true" to delete ECR repos and images

# ── Paths ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Parse flags ───────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --delete-images) DELETE_ECR_REPOS="true" ;;
    --project=*) PROJECT="${arg#*=}" ;;
    --env=*) ENV="${arg#*=}" ;;
    --region=*) REGION="${arg#*=}" ;;
  esac
done

# ── Prompt for missing required values ────────────────
if [[ -z "$PROJECT" ]]; then
  echo ""
  while true; do
    read -rp "  Project name to tear down: " PROJECT
    if [[ -n "$PROJECT" ]]; then break; fi
    echo -e "  \033[0;31mProject name is required.\033[0m"
  done
fi

if [[ -z "$ENV" ]]; then
  while true; do
    read -rp "  Environment to tear down (test|prod): " ENV
    if [[ "$ENV" == "test" || "$ENV" == "prod" ]]; then break; fi
    echo -e "  \033[0;31mMust be 'test' or 'prod'.\033[0m"
  done
fi

if [[ -z "$REGION" ]]; then
  read -rp "  AWS region [us-east-1]: " REGION
  REGION="${REGION:-us-east-1}"
fi

RESOURCES_FILE="$SCRIPT_DIR/${PROJECT}-${ENV}-resources.json"

# ══════════════════════════════════════════════════════════════════════════════
# Helpers
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

get_resource() {
  local key="$1"
  python3 -c "
import json, sys
try:
    with open('$RESOURCES_FILE') as f:
        data = json.load(f)
    print(data.get('$key', ''))
except:
    print('')
" 2>/dev/null
}

safe_delete() {
  local desc="$1"
  shift
  if "$@" 2>/dev/null; then
    log "Deleted: $desc"
  else
    warn "Could not delete (may already be gone): $desc"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# Validate & Pre-flight Check
# ══════════════════════════════════════════════════════════════════════════════

if [[ ! -f "$RESOURCES_FILE" ]]; then
  error "Resources file not found: $RESOURCES_FILE"
  error "Nothing to tear down. Run setup.sh first or check the ENV value."
  exit 1
fi

PROJECT=$(get_resource "project")
CLUSTER_NAME=$(get_resource "cluster_name")
ACCOUNT_ID=$(get_resource "account_id")

# ── Resource inventory ───────────────────────────────
echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  TEARDOWN — DESTRUCTIVE OPERATION                          ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Project:${NC}     $PROJECT"
echo -e "  ${CYAN}Environment:${NC} $ENV"
echo -e "  ${CYAN}Region:${NC}      $REGION"
echo -e "  ${CYAN}Account:${NC}     $ACCOUNT_ID"
echo ""

echo -e "${YELLOW}── Resources to be destroyed ───────────────────────────────${NC}"

RESOURCE_COUNT=0

# ECS cluster + services
if [[ -n "$CLUSTER_NAME" ]]; then
  echo -e "  ${RED}ECS Cluster:${NC}  $CLUSTER_NAME"
  RESOURCE_COUNT=$((RESOURCE_COUNT + 1))

  APP_SVC=$(get_resource "app_service_name")
  MONITORING_SVC=$(get_resource "monitoring_service_name")
  PROMTAIL_SVC=$(get_resource "promtail_service_name")

  for SVC_NAME in "$APP_SVC" "$MONITORING_SVC" "$PROMTAIL_SVC"; do
    if [[ -z "$SVC_NAME" ]]; then continue; fi
    SVC_INFO=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SVC_NAME" \
      --query "services[0].{status:status, running:runningCount, desired:desiredCount}" \
      --output json --region "$REGION" 2>/dev/null || echo "{}")

    SVC_STATUS=$(echo "$SVC_INFO" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','GONE'))" 2>/dev/null || echo "GONE")
    RUNNING=$(echo "$SVC_INFO" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('running',0))" 2>/dev/null || echo "0")
    DESIRED=$(echo "$SVC_INFO" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('desired',0))" 2>/dev/null || echo "0")

    if [[ "$SVC_STATUS" == "ACTIVE" ]]; then
      echo -e "  ${RED}ECS Service:${NC}  $SVC_NAME ${YELLOW}[ACTIVE — $RUNNING/$DESIRED tasks]${NC}"
    else
      echo -e "  ${RED}ECS Service:${NC}  $SVC_NAME (${SVC_STATUS})"
    fi
    RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
  done
fi

# ASG + Launch Template
ASG_NAME=$(get_resource "asg_name")
LT_NAME=$(get_resource "launch_template_name")
CP_NAME=$(get_resource "capacity_provider_name")
[[ -n "$ASG_NAME" ]] && echo -e "  ${RED}ASG:${NC}          $ASG_NAME" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
[[ -n "$LT_NAME" ]] && echo -e "  ${RED}Launch Tmpl:${NC}  $LT_NAME" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
[[ -n "$CP_NAME" ]] && echo -e "  ${RED}Cap Provider:${NC} $CP_NAME" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))

# RDS
DB_INSTANCE_ID=$(get_resource "db_instance_id")
if [[ -n "$DB_INSTANCE_ID" ]]; then
  DB_STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --query "DBInstances[0].{status:DBInstanceStatus, class:DBInstanceClass}" \
    --output json --region "$REGION" 2>/dev/null || echo "{}")

  DB_ST=$(echo "$DB_STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','not-found'))" 2>/dev/null || echo "not-found")
  DB_CL=$(echo "$DB_STATUS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('class',''))" 2>/dev/null || echo "")

  if [[ "$DB_ST" != "not-found" ]]; then
    echo -e "  ${RED}RDS Instance:${NC} $DB_INSTANCE_ID ${YELLOW}[$DB_ST, $DB_CL]${NC}"
    echo -e "  ${GREEN}RDS Snapshot:${NC} Final snapshot will be created before deletion ${GREEN}(SAFE)${NC}"
  else
    echo -e "  ${RED}RDS Instance:${NC} $DB_INSTANCE_ID (already deleted)"
  fi
  RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
fi

# Secrets Manager
DB_SECRET=$(get_resource "db_secret_name")
GRAFANA_SECRET=$(get_resource "grafana_secret_name")
[[ -n "$DB_SECRET" ]] && echo -e "  ${RED}Secret:${NC}       $DB_SECRET" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
[[ -n "$GRAFANA_SECRET" ]] && echo -e "  ${RED}Secret:${NC}       $GRAFANA_SECRET" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))

# Cloud Map
CM_NS=$(get_resource "cloudmap_namespace_name")
[[ -n "$CM_NS" ]] && echo -e "  ${RED}Cloud Map:${NC}    $CM_NS" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))

# ALB
ALB_NAME=$(get_resource "alb_name")
ALB_DNS=$(get_resource "alb_dns")
[[ -n "$ALB_NAME" ]] && echo -e "  ${RED}ALB:${NC}          $ALB_NAME ($ALB_DNS)" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))

# Target groups
for TG_KEY in "backend_tg_arn" "frontend_tg_arn" "monitoring_tg_arn"; do
  TG_ARN=$(get_resource "$TG_KEY")
  if [[ -n "$TG_ARN" ]]; then
    TG_LABEL="${TG_KEY%%_tg_arn}"
    echo -e "  ${RED}Target Group:${NC} $TG_LABEL"
    RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
  fi
done

# Security groups
for SG_KEY in "alb_sg_id" "ecs_sg_id" "rds_sg_id"; do
  SG_ID=$(get_resource "$SG_KEY")
  if [[ -n "$SG_ID" ]]; then
    SG_LABEL=$(echo "${SG_KEY//_sg_id/}" | tr '[:lower:]' '[:upper:]')
    echo -e "  ${RED}Security Grp:${NC} $SG_ID ($SG_LABEL)"
    RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
  fi
done

# SNS
SNS_TOPIC=$(get_resource "sns_topic_name")
[[ -n "$SNS_TOPIC" ]] && echo -e "  ${RED}SNS Topic:${NC}    $SNS_TOPIC" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))

# ECR repos
if [[ "$DELETE_ECR_REPOS" == "true" ]]; then
  echo -e "  ${RED}ECR Repo:${NC}     $PROJECT/backend (--delete-images)"
  echo -e "  ${RED}ECR Repo:${NC}     $PROJECT/frontend (--delete-images)"
  RESOURCE_COUNT=$((RESOURCE_COUNT + 2))
else
  echo -e "  ${GREEN}ECR Repo:${NC}     $PROJECT/backend ${GREEN}(KEEPING)${NC}"
  echo -e "  ${GREEN}ECR Repo:${NC}     $PROJECT/frontend ${GREEN}(KEEPING)${NC}"
fi

# IAM
EC2_ROLE=$(get_resource "ec2_role_name")
INSTANCE_PROFILE=$(get_resource "instance_profile_name")
OIDC_ROLE=$(get_resource "oidc_role_name")
[[ -n "$EC2_ROLE" ]] && echo -e "  ${RED}IAM Role:${NC}     $EC2_ROLE" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
[[ -n "$INSTANCE_PROFILE" ]] && echo -e "  ${RED}Inst Profile:${NC} $INSTANCE_PROFILE" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))
[[ -n "$OIDC_ROLE" ]] && echo -e "  ${RED}IAM Role:${NC}     $OIDC_ROLE" && RESOURCE_COUNT=$((RESOURCE_COUNT + 1))

echo ""
echo -e "  ${YELLOW}Total: $RESOURCE_COUNT resources will be destroyed${NC}"
echo ""

# ── Confirmation ─────────────────────────────────────
CONFIRM_STRING="${PROJECT}-${ENV}"

if [[ "$ENV" == "prod" ]]; then
  echo -e "${RED}  ┌─────────────────────────────────────────────────────────┐${NC}"
  echo -e "${RED}  │  PRODUCTION ENVIRONMENT — EXTRA CAUTION REQUIRED       │${NC}"
  echo -e "${RED}  │  This will cause downtime and data loss.               │${NC}"
  echo -e "${RED}  │  RDS data will be permanently deleted unless you       │${NC}"
  echo -e "${RED}  │  choose to create a final snapshot.                    │${NC}"
  echo -e "${RED}  └─────────────────────────────────────────────────────────┘${NC}"
  echo ""
  read -rp "  Type '${CONFIRM_STRING}' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "$CONFIRM_STRING" ]]; then
    error "Aborted — confirmation did not match."
    exit 1
  fi

  echo ""
  echo -e "  ${YELLOW}Starting teardown in 5 seconds... Press Ctrl+C to abort.${NC}"
  for i in 5 4 3 2 1; do
    echo -ne "  ${RED}$i...${NC} "
    sleep 1
  done
  echo ""
else
  read -rp "  Type '${CONFIRM_STRING}' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "$CONFIRM_STRING" ]]; then
    error "Aborted — confirmation did not match."
    exit 1
  fi
fi

echo ""
info "Teardown starting..."

# ══════════════════════════════════════════════════════════════════════════════
# Step 1: Remove auto-scaling policies and targets
# ══════════════════════════════════════════════════════════════════════════════
AUTOSCALE_ENABLED=$(get_resource "autoscale_enabled")
if [[ "$AUTOSCALE_ENABLED" == "true" ]]; then
  step "Step 1: Removing auto-scaling"

  APP_SERVICE_NAME=$(get_resource "app_service_name")
  RESOURCE_ID="service/${CLUSTER_NAME}/${APP_SERVICE_NAME}"

  # Delete scaling policies
  POLICIES=$(aws application-autoscaling describe-scaling-policies \
    --service-namespace ecs \
    --resource-id "$RESOURCE_ID" \
    --query "ScalingPolicies[*].PolicyName" --output text --region "$REGION" 2>/dev/null || echo "")

  for POLICY in $POLICIES; do
    safe_delete "scaling policy $POLICY" \
      aws application-autoscaling delete-scaling-policy \
        --service-namespace ecs \
        --scalable-dimension "ecs:service:DesiredCount" \
        --resource-id "$RESOURCE_ID" \
        --policy-name "$POLICY" \
        --region "$REGION"
  done

  # Deregister scalable target
  safe_delete "scalable target for $APP_SERVICE_NAME" \
    aws application-autoscaling deregister-scalable-target \
      --service-namespace ecs \
      --scalable-dimension "ecs:service:DesiredCount" \
      --resource-id "$RESOURCE_ID" \
      --region "$REGION"
else
  info "No auto-scaling to remove"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 2: Delete CloudWatch alarms + SNS topic
# ══════════════════════════════════════════════════════════════════════════════
step "Step 2: Deleting CloudWatch alarms and SNS"

SNS_TOPIC_ARN=$(get_resource "sns_topic_arn")

for ALARM_NAME in "${PROJECT}-${ENV}-app-high-cpu" "${PROJECT}-${ENV}-unhealthy-targets" "${PROJECT}-${ENV}-alb-5xx"; do
  safe_delete "alarm $ALARM_NAME" \
    aws cloudwatch delete-alarms --alarm-names "$ALARM_NAME" --region "$REGION"
done

if [[ -n "$SNS_TOPIC_ARN" ]]; then
  safe_delete "SNS topic" \
    aws sns delete-topic --topic-arn "$SNS_TOPIC_ARN" --region "$REGION"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 3: Scale ECS services to 0, wait, then delete
# ══════════════════════════════════════════════════════════════════════════════
step "Step 3: Deleting ECS services"

APP_SERVICE_NAME=$(get_resource "app_service_name")
MONITORING_SERVICE_NAME=$(get_resource "monitoring_service_name")
PROMTAIL_SERVICE_NAME=$(get_resource "promtail_service_name")

for SVC_NAME in "$APP_SERVICE_NAME" "$MONITORING_SERVICE_NAME" "$PROMTAIL_SERVICE_NAME"; do
  if [[ -z "$SVC_NAME" ]]; then continue; fi

  SVC_STATUS=$(aws ecs describe-services --cluster "$CLUSTER_NAME" --services "$SVC_NAME" \
    --query "services[?status=='ACTIVE'].serviceName | [0]" --output text --region "$REGION" 2>/dev/null || echo "None")

  if [[ "$SVC_STATUS" != "None" && -n "$SVC_STATUS" ]]; then
    info "Scaling $SVC_NAME to 0..."
    aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SVC_NAME" \
      --desired-count 0 --region "$REGION" --output text >/dev/null 2>&1 || true

    info "Waiting for tasks to drain..."
    aws ecs wait services-stable --cluster "$CLUSTER_NAME" --services "$SVC_NAME" \
      --region "$REGION" 2>/dev/null || true

    safe_delete "service $SVC_NAME" \
      aws ecs delete-service --cluster "$CLUSTER_NAME" --service "$SVC_NAME" \
        --force --region "$REGION"
  else
    warn "Service $SVC_NAME not found or already deleted"
  fi
done

# ══════════════════════════════════════════════════════════════════════════════
# Step 4: Deregister task definitions
# ══════════════════════════════════════════════════════════════════════════════
step "Step 4: Deregistering task definitions"

for FAMILY in "${PROJECT}-${ENV}-app" "${PROJECT}-${ENV}-monitoring" "${PROJECT}-${ENV}-promtail"; do
  TASK_DEFS=$(aws ecs list-task-definitions \
    --family-prefix "$FAMILY" \
    --query "taskDefinitionArns" --output text --region "$REGION" 2>/dev/null || echo "")

  for TD_ARN in $TASK_DEFS; do
    safe_delete "task definition $TD_ARN" \
      aws ecs deregister-task-definition \
        --task-definition "$TD_ARN" --region "$REGION" --output text
  done
done

# ══════════════════════════════════════════════════════════════════════════════
# Step 5: Delete ECS cluster
# ══════════════════════════════════════════════════════════════════════════════
step "Step 5: Deleting ECS cluster"

if [[ -n "$CLUSTER_NAME" ]]; then
  # Remove capacity provider association first
  aws ecs put-cluster-capacity-providers \
    --cluster "$CLUSTER_NAME" \
    --capacity-providers [] \
    --default-capacity-provider-strategy [] \
    --region "$REGION" --output text >/dev/null 2>&1 || true

  safe_delete "ECS cluster $CLUSTER_NAME" \
    aws ecs delete-cluster --cluster "$CLUSTER_NAME" --region "$REGION" --output text
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 6: Delete Auto Scaling Group
# ══════════════════════════════════════════════════════════════════════════════
step "Step 6: Deleting Auto Scaling Group"

ASG_NAME=$(get_resource "asg_name")
if [[ -n "$ASG_NAME" ]]; then
  info "Scaling ASG to 0 and deleting..."
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --min-size 0 --max-size 0 --desired-capacity 0 \
    --region "$REGION" 2>/dev/null || true

  # Wait for instances to terminate
  info "Waiting for instances to terminate..."
  ATTEMPTS=0
  while true; do
    INSTANCE_COUNT=$(aws autoscaling describe-auto-scaling-groups \
      --auto-scaling-group-names "$ASG_NAME" \
      --query "AutoScalingGroups[0].Instances | length(@)" \
      --output text --region "$REGION" 2>/dev/null || echo "0")
    if [[ "$INSTANCE_COUNT" == "0" || "$INSTANCE_COUNT" == "None" ]]; then break; fi
    ATTEMPTS=$((ATTEMPTS + 1))
    if [[ $ATTEMPTS -ge 30 ]]; then
      warn "Timeout waiting for instances to terminate"
      break
    fi
    sleep 10
  done

  safe_delete "ASG $ASG_NAME" \
    aws autoscaling delete-auto-scaling-group \
      --auto-scaling-group-name "$ASG_NAME" \
      --force-delete \
      --region "$REGION"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 7: Delete Launch Template
# ══════════════════════════════════════════════════════════════════════════════
step "Step 7: Deleting Launch Template"

LT_NAME=$(get_resource "launch_template_name")
if [[ -n "$LT_NAME" ]]; then
  safe_delete "launch template $LT_NAME" \
    aws ec2 delete-launch-template \
      --launch-template-name "$LT_NAME" \
      --region "$REGION" --output text
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 8: Delete Capacity Provider
# ══════════════════════════════════════════════════════════════════════════════
step "Step 8: Deleting Capacity Provider"

CP_NAME=$(get_resource "capacity_provider_name")
if [[ -n "$CP_NAME" ]]; then
  safe_delete "capacity provider $CP_NAME" \
    aws ecs delete-capacity-provider \
      --capacity-provider "$CP_NAME" \
      --region "$REGION" --output text
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 9: Delete RDS
# ══════════════════════════════════════════════════════════════════════════════
DB_INSTANCE_ID=$(get_resource "db_instance_id")

if [[ -n "$DB_INSTANCE_ID" ]]; then
  step "Step 9: Deleting RDS instance"

  DB_STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --query "DBInstances[0].DBInstanceStatus" --output text --region "$REGION" 2>/dev/null || echo "not-found")

  if [[ "$DB_STATUS" != "not-found" ]]; then
    SNAPSHOT_ID="${DB_INSTANCE_ID}-final-$(date +%Y%m%d-%H%M%S)"
    info "Final snapshot will be created: ${CYAN}$SNAPSHOT_ID${NC}"

    info "Disabling deletion protection..."
    aws rds modify-db-instance \
      --db-instance-identifier "$DB_INSTANCE_ID" \
      --no-deletion-protection \
      --apply-immediately \
      --region "$REGION" --output text >/dev/null 2>&1 || true

    sleep 10

    info "Deleting RDS instance (this takes several minutes)..."
    aws rds delete-db-instance \
      --db-instance-identifier "$DB_INSTANCE_ID" \
      --final-db-snapshot-identifier "$SNAPSHOT_ID" \
      --region "$REGION" --output text >/dev/null 2>&1 || true

    info "Waiting for RDS deletion..."
    aws rds wait db-instance-deleted \
      --db-instance-identifier "$DB_INSTANCE_ID" \
      --region "$REGION" 2>/dev/null || true
    log "RDS instance deleted"
  else
    warn "RDS instance not found: $DB_INSTANCE_ID"
  fi
else
  info "No RDS instance to delete"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 10: Delete Secrets Manager secrets
# ══════════════════════════════════════════════════════════════════════════════
step "Step 10: Deleting secrets"

DB_SECRET_NAME=$(get_resource "db_secret_name")
if [[ -n "$DB_SECRET_NAME" ]]; then
  safe_delete "secret $DB_SECRET_NAME" \
    aws secretsmanager delete-secret \
      --secret-id "$DB_SECRET_NAME" \
      --force-delete-without-recovery \
      --region "$REGION"
fi

GRAFANA_SECRET_NAME=$(get_resource "grafana_secret_name")
if [[ -n "$GRAFANA_SECRET_NAME" ]]; then
  safe_delete "secret $GRAFANA_SECRET_NAME" \
    aws secretsmanager delete-secret \
      --secret-id "$GRAFANA_SECRET_NAME" \
      --force-delete-without-recovery \
      --region "$REGION"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 11: Delete DB subnet group
# ══════════════════════════════════════════════════════════════════════════════
step "Step 11: Deleting DB subnet group"

DB_SUBNET_GROUP=$(get_resource "db_subnet_group")
if [[ -n "$DB_SUBNET_GROUP" ]]; then
  safe_delete "DB subnet group $DB_SUBNET_GROUP" \
    aws rds delete-db-subnet-group \
      --db-subnet-group-name "$DB_SUBNET_GROUP" \
      --region "$REGION"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 12: Delete Cloud Map service + namespace
# ══════════════════════════════════════════════════════════════════════════════
step "Step 12: Deleting Cloud Map resources"

CM_SERVICE_ID=$(get_resource "cloudmap_service_id")
if [[ -n "$CM_SERVICE_ID" ]]; then
  # Deregister all instances first
  INSTANCES=$(aws servicediscovery list-instances \
    --service-id "$CM_SERVICE_ID" \
    --query "Instances[*].Id" --output text --region "$REGION" 2>/dev/null || echo "")
  for INST_ID in $INSTANCES; do
    aws servicediscovery deregister-instance \
      --service-id "$CM_SERVICE_ID" \
      --instance-id "$INST_ID" \
      --region "$REGION" 2>/dev/null || true
  done

  safe_delete "Cloud Map service $CM_SERVICE_ID" \
    aws servicediscovery delete-service \
      --id "$CM_SERVICE_ID" \
      --region "$REGION"
fi

NAMESPACE_ID=$(get_resource "cloudmap_namespace_id")
if [[ -n "$NAMESPACE_ID" ]]; then
  safe_delete "Cloud Map namespace $NAMESPACE_ID" \
    aws servicediscovery delete-namespace \
      --id "$NAMESPACE_ID" \
      --region "$REGION"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 13: Delete ALB listeners → target groups → ALB
# ══════════════════════════════════════════════════════════════════════════════
step "Step 13: Deleting ALB and target groups"

ALB_ARN=$(get_resource "alb_arn")

if [[ -n "$ALB_ARN" ]]; then
  # Delete all listeners first
  LISTENER_ARNS=$(aws elbv2 describe-listeners \
    --load-balancer-arn "$ALB_ARN" \
    --query "Listeners[*].ListenerArn" --output text --region "$REGION" 2>/dev/null || echo "")

  for LISTENER_ARN in $LISTENER_ARNS; do
    # Delete listener rules first (except default)
    RULE_ARNS=$(aws elbv2 describe-rules \
      --listener-arn "$LISTENER_ARN" \
      --query "Rules[?!IsDefault].RuleArn" --output text --region "$REGION" 2>/dev/null || echo "")
    for RULE_ARN in $RULE_ARNS; do
      safe_delete "listener rule" \
        aws elbv2 delete-rule --rule-arn "$RULE_ARN" --region "$REGION"
    done

    safe_delete "listener" \
      aws elbv2 delete-listener --listener-arn "$LISTENER_ARN" --region "$REGION"
  done

  safe_delete "ALB" \
    aws elbv2 delete-load-balancer --load-balancer-arn "$ALB_ARN" --region "$REGION"

  info "Waiting for ALB deletion to complete..."
  sleep 30
fi

# Delete target groups
for TG_KEY in "backend_tg_arn" "frontend_tg_arn" "monitoring_tg_arn"; do
  TG_ARN=$(get_resource "$TG_KEY")
  if [[ -n "$TG_ARN" ]]; then
    safe_delete "target group" \
      aws elbv2 delete-target-group --target-group-arn "$TG_ARN" --region "$REGION"
  fi
done

# ══════════════════════════════════════════════════════════════════════════════
# Step 14: Delete security groups (RDS → ECS → ALB order)
# ══════════════════════════════════════════════════════════════════════════════
step "Step 14: Deleting security groups"

for SG_KEY in "rds_sg_id" "ecs_sg_id" "alb_sg_id"; do
  SG_ID=$(get_resource "$SG_KEY")
  if [[ -n "$SG_ID" ]]; then
    safe_delete "security group $SG_ID" \
      aws ec2 delete-security-group --group-id "$SG_ID" --region "$REGION"
  fi
done

# ══════════════════════════════════════════════════════════════════════════════
# Step 15: Optionally delete ECR repos
# ══════════════════════════════════════════════════════════════════════════════
step "Step 15: ECR repositories"

if [[ "$DELETE_ECR_REPOS" == "true" ]]; then
  for REPO_NAME in "$PROJECT/backend" "$PROJECT/frontend"; do
    if aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" &>/dev/null; then
      safe_delete "ECR repo $REPO_NAME" \
        aws ecr delete-repository --repository-name "$REPO_NAME" --force --region "$REGION" --output text
    fi
  done
else
  info "Keeping ECR repos (use --delete-images to remove them)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 16: Delete IAM instance profile + EC2 role
# ══════════════════════════════════════════════════════════════════════════════
step "Step 16: Cleaning up IAM EC2 resources"

INSTANCE_PROFILE=$(get_resource "instance_profile_name")
EC2_ROLE=$(get_resource "ec2_role_name")

if [[ -n "$INSTANCE_PROFILE" ]]; then
  # Remove role from instance profile
  aws iam remove-role-from-instance-profile \
    --instance-profile-name "$INSTANCE_PROFILE" \
    --role-name "$EC2_ROLE" 2>/dev/null || true

  safe_delete "instance profile $INSTANCE_PROFILE" \
    aws iam delete-instance-profile \
      --instance-profile-name "$INSTANCE_PROFILE"
fi

if [[ -n "$EC2_ROLE" ]]; then
  # Detach managed policies
  ATTACHED_POLICIES=$(aws iam list-attached-role-policies --role-name "$EC2_ROLE" \
    --query "AttachedPolicies[*].PolicyArn" --output text 2>/dev/null || echo "")
  for POLICY_ARN in $ATTACHED_POLICIES; do
    aws iam detach-role-policy --role-name "$EC2_ROLE" --policy-arn "$POLICY_ARN" 2>/dev/null || true
  done

  # Remove inline policies
  INLINE_POLICIES=$(aws iam list-role-policies --role-name "$EC2_ROLE" \
    --query "PolicyNames" --output text 2>/dev/null || echo "")
  for POLICY in $INLINE_POLICIES; do
    aws iam delete-role-policy --role-name "$EC2_ROLE" --policy-name "$POLICY" 2>/dev/null || true
  done

  safe_delete "IAM role $EC2_ROLE" \
    aws iam delete-role --role-name "$EC2_ROLE"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 17: Delete OIDC role
# ══════════════════════════════════════════════════════════════════════════════
step "Step 17: Cleaning up IAM OIDC resources"

OIDC_ROLE_NAME=$(get_resource "oidc_role_name")
if [[ -n "$OIDC_ROLE_NAME" ]]; then
  POLICIES=$(aws iam list-role-policies --role-name "$OIDC_ROLE_NAME" \
    --query "PolicyNames" --output text 2>/dev/null || echo "")
  for POLICY in $POLICIES; do
    aws iam delete-role-policy --role-name "$OIDC_ROLE_NAME" --policy-name "$POLICY" 2>/dev/null || true
  done

  safe_delete "OIDC role $OIDC_ROLE_NAME" \
    aws iam delete-role --role-name "$OIDC_ROLE_NAME"

  info "OIDC provider is shared across environments — keeping it"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Step 18: Delete resources file and generated files
# ══════════════════════════════════════════════════════════════════════════════
step "Step 18: Cleanup"

rm -f "$RESOURCES_FILE"
log "Deleted resources file: $RESOURCES_FILE"

rm -f "$SCRIPT_DIR/${PROJECT}-${ENV}-app-task-def.json"
rm -f "$SCRIPT_DIR/${PROJECT}-${ENV}-monitoring-task-def.json"
rm -f "$SCRIPT_DIR/${PROJECT}-${ENV}-promtail-task-def.json"
log "Deleted generated task definition files"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Teardown complete for $PROJECT ($ENV)                      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
log "All resources have been deleted."
