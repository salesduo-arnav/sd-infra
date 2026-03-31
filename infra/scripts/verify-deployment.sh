#!/bin/bash
# Deployment verification script
# Run after any env var / secret / task def change to confirm everything is wired correctly
set -e

REGION="us-east-1"
ENV="${1:-test}" # test or prod

if [ "$ENV" = "prod" ]; then
  CORE_SERVICE="sd-core-platform-prod-app-service"
  LO_SERVICE="sd-listings-optimizer-prod-app-service"
  CORE_API="https://api.salesduo.com"
  STUDIO_API="https://studio-api.salesduo.com"
  CORE_APP="https://app.salesduo.com"
  STUDIO_APP="https://studio.salesduo.com"
else
  CORE_SERVICE="sd-core-platform-test-app-service"
  LO_SERVICE="sd-listings-optimizer-test-app-service"
  CORE_API="https://api-test.salesduo.com"
  STUDIO_API="https://studio-api-test.salesduo.com"
  CORE_APP="https://app-test.salesduo.com"
  STUDIO_APP="https://studio-test.salesduo.com"
fi

CLUSTER="sd-core-platform-test-cluster"
PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Verifying $ENV environment ==="
echo ""

# 1. Services running
echo "Services:"
CORE_RUNNING=$(aws ecs describe-services --cluster $CLUSTER --services $CORE_SERVICE --region $REGION --query 'services[0].runningCount' --output text)
check "Core Platform running ($CORE_RUNNING tasks)" "$([ "$CORE_RUNNING" -ge 1 ] && echo true || echo false)"

LO_RUNNING=$(aws ecs describe-services --cluster $CLUSTER --services $LO_SERVICE --region $REGION --query 'services[0].runningCount' --output text 2>/dev/null)
check "Listings Optimizer running ($LO_RUNNING tasks)" "$([ "$LO_RUNNING" -ge 1 ] && echo true || echo false)"

# 2. Health checks
echo ""
echo "Health Checks:"
CORE_HEALTH=$(curl -sk -o /dev/null -w "%{http_code}" "$CORE_API/health")
check "Core API health ($CORE_HEALTH)" "$([ "$CORE_HEALTH" = "200" ] && echo true || echo false)"

STUDIO_HEALTH=$(curl -sk -o /dev/null -w "%{http_code}" "$STUDIO_API/api/v1/health")
check "Studio API health ($STUDIO_HEALTH)" "$([ "$STUDIO_HEALTH" = "200" ] && echo true || echo false)"

CORE_FE=$(curl -sk -o /dev/null -w "%{http_code}" "$CORE_APP")
check "Core Frontend ($CORE_FE)" "$([ "$CORE_FE" = "200" ] && echo true || echo false)"

STUDIO_FE=$(curl -sk -o /dev/null -w "%{http_code}" "$STUDIO_APP")
check "Studio Frontend ($STUDIO_FE)" "$([ "$STUDIO_FE" = "200" ] && echo true || echo false)"

# 3. Frontend JS loads without errors
echo ""
echo "Frontend Integrity:"
CORE_HTML=$(curl -sk "$CORE_APP")
check "Core Frontend has content" "$([ ${#CORE_HTML} -gt 100 ] && echo true || echo false)"
check "Core Frontend no error in HTML" "$(echo "$CORE_HTML" | grep -qi 'error\|not found' && echo false || echo true)"

# 4. Key env vars in task definitions
echo ""
echo "Core Platform Env Vars:"
CORE_TASK=$(aws ecs describe-services --cluster $CLUSTER --services $CORE_SERVICE --region $REGION --query 'services[0].taskDefinition' --output text)
CORE_ENV=$(aws ecs describe-task-definition --task-definition "$CORE_TASK" --region $REGION --query 'taskDefinition.containerDefinitions[0]')

for var in PGHOST REDIS_URL CORS_ORIGINS FRONTEND_URL COOKIE_DOMAIN; do
  HAS=$(echo "$CORE_ENV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(e['name']=='$var' for e in d.get('environment',[])))")
  check "$var" "$HAS"
done

for secret in PGPASSWORD JWT_SECRET GOOGLE_CLIENT_ID ENCRYPTION_KEY INTERNAL_API_KEY MIXPANEL_TOKEN; do
  HAS=$(echo "$CORE_ENV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(e['name']=='$secret' for e in d.get('secrets',[])))")
  check "$secret (secret)" "$HAS"
done

echo ""
echo "Listings Optimizer Env Vars:"
LO_TASK=$(aws ecs describe-services --cluster $CLUSTER --services $LO_SERVICE --region $REGION --query 'services[0].taskDefinition' --output text 2>/dev/null)
if [ -n "$LO_TASK" ] && [ "$LO_TASK" != "None" ]; then
  LO_ENV=$(aws ecs describe-task-definition --task-definition "$LO_TASK" --region $REGION --query 'taskDefinition.containerDefinitions[0]')

  for var in DATABASE_URL CORS_ORIGINS SD_INFRA_URL; do
    HAS=$(echo "$LO_ENV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(e['name']=='$var' for e in d.get('environment',[])))")
    check "$var" "$HAS"
  done

  for secret in OPENAI_API_KEY GEMINI_API_KEY RAPID_API_KEY SD_INFRA_INTERNAL_API_KEY S3_BUCKET_NAME; do
    HAS=$(echo "$LO_ENV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(e['name']=='$secret' for e in d.get('secrets',[])))")
    check "$secret (secret)" "$HAS"
  done
fi

# Summary
echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -gt 0 ]; then
  echo "⚠️  Some checks failed!"
  exit 1
else
  echo "✅ All checks passed!"
fi
