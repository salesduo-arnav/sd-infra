# Deploying a New Satellite Tool

**Scope:** Deploying a satellite tool that is **already built**. Uses the existing `satellite-setup.sh` script for AWS infra, plus manual steps for DNS, secrets, and core platform setup.

**Audience:** Engineer deploying a new tool for the first time to staging and production.

**Prerequisites:**
- AWS CLI configured with permissions for ECR, ECS, Secrets Manager, ELB, S3, IAM, RDS
- Access to the sd-core-platform repo (contains the setup script)
- Stripe dashboard access
- Superuser access to the SalesDuo admin panel
- sd-core-platform already deployed in the target environment
- The satellite's code is already pushed to a GitHub repo with CI/CD workflow

---

## TL;DR — The Short Version

For each environment (test, then prod), run:

```bash
cd sd-core-platform/infra
./satellite-setup.sh
```

Then do the manual steps the script prints: DB creation, DNS CNAMEs, secret updates. After that, register the tool/plans in the admin UI, configure Stripe, and push to deploy via CI/CD.

The rest of this guide walks through each step in order with commands and examples.

---

## Deployment Checklist (High-Level)

| # | Step | Automated? | Where |
|---|---|---|---|
| 1 | Register tool in core platform admin UI | Manual | `app.salesduo.com/admin/apps` |
| 2 | Create Stripe products + prices | Manual | Stripe Dashboard |
| 3 | Create plans in admin UI | Manual | `app.salesduo.com/admin/plans` |
| 4 | Create task definition JSON | Manual | Copy from existing tool |
| 5 | Run `satellite-setup.sh` | ✅ Script | `sd-core-platform/infra/` |
| 6 | Create DB and user on RDS | Manual | psql |
| 7 | Add DNS CNAMEs | Manual | Route 53 / GoDaddy |
| 8 | Update Secrets Manager with real values | Manual (CLI) | AWS |
| 9 | Update CORS on core platform | Manual | sd-core-platform env |
| 10 | Configure GitHub Actions secrets | Manual | GitHub repo settings |
| 11 | First deploy via CI/CD | ✅ Push to dev | GitHub |
| 12 | Verify end-to-end | Manual | Browser + logs |

---

## Part 1: Core Platform Setup (Admin UI)

All of these are done through the admin panel at `app.salesduo.com/admin` — no migrations or code changes needed.

### Step 1.1: Create the Tool

Navigate to: **Admin > Apps > Add New App**

| Field | Example |
|---|---|
| Name | Insights |
| Slug | insights |
| Description | Amazon listing insights and analytics |
| Tool Link | https://insights.salesduo.com |
| Trial Days | 14 |
| Is Active | ✓ |

**Important:** The `slug` must exactly match the `TOOL_SLUGS` env var in your satellite.

### Step 1.2: Create Features

**Admin > Apps > [Your Tool] > Features > Add Feature**

| Name | Slug | Unit | Reset Period |
|---|---|---|---|
| Max ASINs | max_asins | count | never |
| API Calls | api_calls | count | monthly |
| Reports | reports | count | monthly |
| Advanced Filters | advanced_filters | boolean | never |

Slugs are referenced by your satellite when checking entitlements — they must match exactly.

---

## Part 2: Stripe Setup

### Step 2.1: Create Product

In **Stripe Dashboard > Products > Add Product**:
- Name: `Insights — SalesDuo`
- Description: Match admin panel
- Statement Descriptor: `SALESDUO INSIGHTS`

### Step 2.2: Create Prices

Create monthly and yearly prices for each tier and copy the `price_id` values:

| Plan | Monthly | Yearly |
|---|---|---|
| Starter | $29/mo — `price_xxx1` | $290/yr — `price_xxx2` |
| Pro | $99/mo — `price_xxx3` | $990/yr — `price_xxx4` |
| Enterprise | $299/mo — `price_xxx5` | $2990/yr — `price_xxx6` |

**Do this in both Stripe Test and Live modes.** Test prices → staging, live prices → production.

---

## Part 3: Create Plans in Admin UI

**Admin > Plans > Add Plan** — create one plan per tier:

| Field | Pro Plan Example |
|---|---|
| Tool | Insights |
| Name | Pro |
| Slug | insights-pro |
| Tier | pro |
| Price Monthly | 99 |
| Price Yearly | 990 |
| Currency | USD |
| Stripe Price ID (Monthly) | `price_xxx3` |
| Stripe Price ID (Yearly) | `price_xxx4` |
| Is Active | ✓ |

### Step 3.1: Set Plan Limits

Click **Manage Limits** on each plan:

| Feature | Starter | Pro | Enterprise |
|---|---|---|---|
| Max ASINs | 50 | 500 | -1 (unlimited) |
| API Calls | 1000 | 10000 | 100000 |
| Reports | 5 | 50 | -1 |
| Advanced Filters | 0 | 1 | 1 |

Verify at: `GET https://api.salesduo.com/public/plans?tool_slug=insights`

---

## Part 4: Prepare the Task Definition JSON

Before running the setup script, create the ECS task definition file. Copy from an existing tool and update it.

```bash
cd sd-core-platform/infra
cp sd-cohesity-test-app-task-def.json sd-insights-test-app-task-def.json
```

Edit the new file and update:

| Field | What to change |
|---|---|
| `family` | `sd-insights-test-app` |
| Container `image` fields | Point to your new ECR repos (script prints the URIs) |
| `environment` variables | `TOOL_SLUGS=insights`, `NODE_ENV=test`, `CORE_PLATFORM_URL`, etc. |
| `secrets` ARNs | Point to the secrets the script creates (see Step 5) |
| `logConfiguration` log group | e.g., `/ecs/sd-insights-test` |
| Port mappings | Match your backend (usually 3000) and frontend (usually 8080) |
| CPU / Memory | Adjust for workload (512/1024 is a good start) |

You don't need exact ARNs yet — the script will update them. But the task definition structure (container names `backend` and `frontend`, ports, environment variables) must be correct.

Repeat for prod: `sd-insights-prod-app-task-def.json`

---

## Part 5: Run the Setup Script

The `satellite-setup.sh` script handles 90% of AWS setup. It is **idempotent** — safe to re-run.

### What it does

| Step | Creates | Reuses |
|---|---|---|
| 1 | ECR repos (backend + frontend) | — |
| 2 | Secrets Manager entries (db password + backend env placeholder) | — |
| 3 | S3 bucket (optional, if satellite needs one) | — |
| 4 | ALB target groups (frontend + backend) | Uses core's VPC |
| 5 | ALB listener rules (host-based routing) | Uses core's HTTPS listener |
| 6 | ECS task definition registration | Uses core's execution role |
| 7 | ECS service | Uses core's cluster, subnets, security group |
| 8 | Prints manual steps (DB, DNS, secrets) | — |

It reads infrastructure details from `sd-core-platform-<env>-resources.json` (created when core platform was deployed).

### Run it

```bash
cd sd-core-platform/infra
./satellite-setup.sh
```

You'll be prompted for:

| Prompt | Example Value (test env) |
|---|---|
| Satellite name | `sd-insights` |
| Environment | `test` |
| Frontend hostname prefix | `insights-test` (becomes `insights-test.salesduo.com`) |
| API hostname prefix | `insightsapi-test` (becomes `insightsapi-test.salesduo.com`) |
| Database name | `sdinsightsdb` |
| Database user | `insights_user` |
| ALB rule priority — frontend | `10` (must be unique across listener) |
| ALB rule priority — backend | `11` |
| Task definition filename | `sd-insights-test-app-task-def.json` |

**Check existing rule priorities first:**

```bash
aws elbv2 describe-rules \
  --listener-arn $(jq -r '.https_listener_arn' infra/sd-core-platform-test-resources.json) \
  --region us-east-1 \
  --query 'Rules[].[Priority,Conditions[0].Values[0]]' \
  --output table
```

Pick two unused priorities (numerical — lower runs first).

### After the script runs

It creates `sd-insights-test-resources.json` with all ARNs and writes what to do manually. Keep this file — you'll need it later.

### Run for production (after test works)

```bash
./satellite-setup.sh
# Same prompts, but use:
# Environment: prod
# Frontend: insights (→ insights.salesduo.com)
# API: insightsapi (→ insightsapi.salesduo.com)
```

---

## Part 6: Manual Steps After Script Runs

The script prints these at the end. Here they are with exact commands.

### Step 6.1: Create Database and User

```bash
# Get DB host and password
DB_HOST=$(jq -r '.db_host' infra/sd-core-platform-test-resources.json)
DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id sd-insights-test-db-password \
  --query SecretString --output text \
  --region us-east-1)

# Connect as dbadmin (password from sd-core-platform's secrets)
psql -h $DB_HOST -U dbadmin -d postgres
```

In psql:

```sql
CREATE DATABASE sdinsightsdb;
CREATE USER insights_user WITH PASSWORD '<paste-from-secrets-manager>';
GRANT ALL PRIVILEGES ON DATABASE sdinsightsdb TO insights_user;
\c sdinsightsdb
GRANT ALL ON SCHEMA public TO insights_user;
\q
```

### Step 6.2: Add DNS CNAMEs

Get the ALB DNS:

```bash
ALB_DNS=$(jq -r '.alb_dns' infra/sd-core-platform-test-resources.json)
echo $ALB_DNS
```

Add CNAME records pointing to `$ALB_DNS`:

| Host | Type | Target |
|---|---|---|
| insights-test.salesduo.com | CNAME | `$ALB_DNS` |
| insightsapi-test.salesduo.com | CNAME | `$ALB_DNS` |

**If using Route 53:**

```bash
# Get the hosted zone ID
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name salesduo.com \
  --query 'HostedZones[0].Id' --output text | cut -d/ -f3)

# Create both records
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch '{
    "Changes": [
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "insights-test.salesduo.com",
          "Type": "CNAME",
          "TTL": 300,
          "ResourceRecords": [{"Value": "'$ALB_DNS'"}]
        }
      },
      {
        "Action": "UPSERT",
        "ResourceRecordSet": {
          "Name": "insightsapi-test.salesduo.com",
          "Type": "CNAME",
          "TTL": 300,
          "ResourceRecords": [{"Value": "'$ALB_DNS'"}]
        }
      }
    ]
  }'
```

**If using GoDaddy:** Do this in the GoDaddy DNS dashboard — no CLI.

### Step 6.3: Update Backend Env Secret with Real Values

The script created a placeholder. Update with real values:

```bash
aws secretsmanager put-secret-value \
  --secret-id sd-insights-test-backend-env \
  --region us-east-1 \
  --secret-string '{
    "DATABASE_URL": "postgres://insights_user:<db-password>@<db-host>:5432/sdinsightsdb",
    "REDIS_URL": "redis://<redis-endpoint>:6379",
    "CORE_PLATFORM_URL": "https://api-test.salesduo.com",
    "SD_INFRA_INTERNAL_API_KEY": "<copy-from-sd-core-platform-test-backend-env>",
    "TOOL_SLUGS": "insights",
    "ENCRYPTION_KEY": "<32-char-hex>",
    "NODE_ENV": "test",
    "LOG_LEVEL": "info"
  }'
```

To get the internal API key from core platform:

```bash
aws secretsmanager get-secret-value \
  --secret-id sd-core-platform-test-backend-env \
  --query SecretString --output text \
  --region us-east-1 | jq -r '.INTERNAL_API_KEY'
```

### Step 6.4: Update CORS on Core Platform

Fetch current CORS_ORIGINS and append the new tool's domain:

```bash
# Get current secret
CURRENT=$(aws secretsmanager get-secret-value \
  --secret-id sd-core-platform-test-backend-env \
  --query SecretString --output text \
  --region us-east-1)

# Update CORS_ORIGINS (edit the value manually or with jq)
UPDATED=$(echo "$CURRENT" | jq '.CORS_ORIGINS += ",https://insights-test.salesduo.com"')

# Write back
aws secretsmanager put-secret-value \
  --secret-id sd-core-platform-test-backend-env \
  --secret-string "$UPDATED" \
  --region us-east-1

# Force redeploy core platform backend to pick up new CORS
aws ecs update-service \
  --cluster <core-cluster-name> \
  --service sd-core-platform-test-backend-service \
  --force-new-deployment \
  --region us-east-1
```

### Step 6.5: Optional — S3 Bucket CORS

If your tool serves images directly from S3:

```bash
aws s3api put-bucket-cors \
  --bucket sd-insights-images-test \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["https://insights-test.salesduo.com"],
      "AllowedMethods": ["GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }]
  }'
```

---

## Part 7: CI/CD Setup

The satellite repo should already have `.github/workflows/ci-cd.yaml`. Add these GitHub secrets:

**Settings > Secrets and variables > Actions**

| Secret | Value | Where to find |
|---|---|---|
| AWS_ROLE_ARN | IAM role ARN | From `sd-core-platform-test-resources.json` or create new OIDC role |
| AWS_REGION | us-east-1 | Constant |
| ECR_REGISTRY | `<account>.dkr.ecr.us-east-1.amazonaws.com` | From `backend_repo_uri` (strip repo name) |
| ECS_CLUSTER | (from resources file) | `jq -r '.core_cluster' sd-insights-test-resources.json` |
| ECS_SERVICE_TEST | `sd-insights-test-app-service` | (from resources file) |
| ECS_SERVICE_PROD | `sd-insights-prod-app-service` | (after running script for prod) |
| TASK_FAMILY_TEST | `sd-insights-test-app` | (from resources file) |
| TASK_FAMILY_PROD | `sd-insights-prod-app` | — |
| VITE_API_BASE_URL_TEST | https://insightsapi-test.salesduo.com | — |
| VITE_API_BASE_URL_PROD | https://insightsapi.salesduo.com | — |
| VITE_STRIPE_PUBLISHABLE_KEY_TEST | pk_test_xxx | Stripe test mode |
| VITE_STRIPE_PUBLISHABLE_KEY_PROD | pk_live_xxx | Stripe live mode |

---

## Part 8: First Deploy

### Step 8.1: Deploy to Staging

```bash
cd sd-<toolname>
git push origin dev
```

Watch GitHub Actions. The pipeline will:
1. Lint + test
2. Build Docker images
3. Push to ECR
4. Update ECS task definition
5. Force new deployment
6. Verify health

### Step 8.2: Watch ECS Service Events

```bash
aws ecs describe-services \
  --cluster <core-cluster-name> \
  --services sd-insights-test-app-service \
  --region us-east-1 \
  --query 'services[0].events[0:5]'
```

### Step 8.3: Tail Logs

```bash
aws logs tail /ecs/sd-insights-test --follow --region us-east-1
```

### Step 8.4: Verify Health

```bash
curl https://insightsapi-test.salesduo.com/health
curl -I https://insights-test.salesduo.com
```

Both should return 200.

### Step 8.5: Deploy to Production

After staging passes verification:

```bash
git checkout main
git merge dev
git push origin main
```

---

## Part 9: Verification Checklist

### Infrastructure

- [ ] DNS resolves: `nslookup insights-test.salesduo.com`
- [ ] ALB target groups healthy: `aws elbv2 describe-target-health --target-group-arn <arn>`
- [ ] ECS service running desired count: `aws ecs describe-services ...`
- [ ] CloudWatch logs flowing for both backend and frontend

### Core Platform Integration

- [ ] Tool visible at `GET https://api-test.salesduo.com/public/tools`
- [ ] Plans visible at `GET https://api-test.salesduo.com/public/plans?tool_slug=insights`
- [ ] Satellite can call `/internal/*` with API key (check backend logs)
- [ ] Session cookie shared: log in on core platform, navigate to satellite, should be authenticated

### Billing

- [ ] Stripe test checkout works for each plan tier
- [ ] Webhook creates subscription in sd-core-platform DB
- [ ] OrganizationEntitlements auto-created after subscription
- [ ] Satellite reads entitlements correctly
- [ ] Trial works (if enabled)

### End-to-End

- [ ] New user signup → create org → subscribe → use tool
- [ ] Existing user adds tool to existing org
- [ ] Plan upgrade updates entitlements
- [ ] Cancellation blocks access at period end

---

## Common Deployment Issues

### Issue: Script fails "Core platform resources not found"

**Cause:** `sd-core-platform-<env>-resources.json` doesn't exist.

**Fix:** Run the core platform setup first:
```bash
cd sd-core-platform/infra
./setup.sh
```

### Issue: ALB rule priority conflict

**Cause:** Chose a priority already in use.

**Fix:** List existing priorities and pick unused ones:
```bash
aws elbv2 describe-rules \
  --listener-arn <https-listener-arn> \
  --query 'Rules[].[Priority]' --output table
```

### Issue: Target group name too long

**Cause:** AWS limits target group names to 32 chars. The script truncates, but long satellite names can cause collisions.

**Fix:** Use a shorter satellite name (e.g., `sd-insights` instead of `sd-listing-insights-analytics`).

### Issue: Task definition registration fails

**Cause:** Referenced secret ARNs or log group don't exist.

**Fix:** 
1. Check the task def JSON for placeholder ARNs — replace with real ones
2. Create the log group: `aws logs create-log-group --log-group-name /ecs/sd-insights-test`

### Issue: ECS tasks fail to pull image

**Cause:** Image not yet pushed to ECR, or task execution role lacks ECR permissions.

**Fix:** Build and push manually first to verify:
```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

docker build -t sd-insights/backend ./backend
docker tag sd-insights/backend:latest <account>.dkr.ecr.us-east-1.amazonaws.com/sd-insights/backend:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/sd-insights/backend:latest
```

Then re-run: `aws ecs update-service --cluster <cluster> --service sd-insights-test-app-service --force-new-deployment`

### Issue: Tool slug mismatch

**Symptom:** Subscription exists but satellite shows "no access".

**Fix:** The slug in **Admin > Apps** must exactly match `TOOL_SLUGS` env var in the task definition / secrets. Compare:
```bash
# In admin UI
curl https://api-test.salesduo.com/public/tools | jq '.[] | .slug'

# In ECS task env
aws secretsmanager get-secret-value \
  --secret-id sd-insights-test-backend-env \
  --query SecretString --output text | jq -r '.TOOL_SLUGS'
```

### Issue: CORS errors in browser

**Fix:** Verify `CORS_ORIGINS` on core platform includes the new tool's domain. Restart core platform backend after updating.

### Issue: Session not shared between core platform and satellite

**Cause:** Cookie domain not set to parent `.salesduo.com`.

**Fix:** Check sd-core-platform's cookie config — the `Domain` attribute must be `.salesduo.com` (with leading dot) for sibling subdomains to share sessions.

---

## Rollback

If production deploy breaks something:

```bash
# Option 1: Revert code (safest)
git checkout main
git revert HEAD
git push origin main

# Option 2: Roll back to previous task definition
PREV_TASK=$(aws ecs list-task-definitions \
  --family-prefix sd-insights-prod-app \
  --sort DESC --max-items 2 \
  --region us-east-1 \
  --query 'taskDefinitionArns[1]' --output text)

aws ecs update-service \
  --cluster <core-cluster-name> \
  --service sd-insights-prod-app-service \
  --task-definition $PREV_TASK \
  --region us-east-1

# Option 3: Scale to 0 to stop traffic
aws ecs update-service \
  --cluster <core-cluster-name> \
  --service sd-insights-prod-app-service \
  --desired-count 0 \
  --region us-east-1
```

---

## Reference: Existing Tools

Study these for working examples:

| Tool | Frontend Domain | API Domain | Task Def File |
|---|---|---|---|
| Core Platform | app.salesduo.com | api.salesduo.com | `prod-backend-task-def.json` |
| Cohesity | cohesity.salesduo.com | cohesityapi.salesduo.com | `sd-cohesity-test-app-task-def.json` |
| Analytics Hub | analytics.salesduo.com | analyticsapi.salesduo.com | `sd-analytics-hub-test-app-task-def.json` |
| Listings Optimizer | creatives.salesduo.com | creativesapi.salesduo.com | `sd-listings-optimizer-test-app-task-def.json` |

All task definition files live in `sd-core-platform/infra/`.

---

## Reference: Setup Script Location

```
sd-core-platform/
└── infra/
    ├── satellite-setup.sh              # The main script
    ├── setup.sh                        # For core platform itself
    ├── teardown.sh                     # Remove resources
    ├── sd-core-platform-test-resources.json   # Core platform ARNs (input)
    ├── sd-insights-test-resources.json        # Your new tool's ARNs (output)
    └── sd-insights-test-app-task-def.json     # Your task definition (input)
```

---

## Last Updated
2026-04-10
