# ECS Deployment Guide — sd-core-platform

## Architecture

```
                         Internet
                            |
                  DNS (GoDaddy CNAMEs)
                  *.salesduo.com ──────> ALB DNS
                            |
                            v
                 +---------------------+
                 |   Application Load  |
                 |   Balancer (ALB)    |
                 |                     |
                 |  :443 (HTTPS)       |
                 |    Host: api-*  → backend TG
                 |    Default      → frontend TG
                 |  :80 → 301 HTTPS   |
                 |  :3001 → Grafana   |
                 +---------+-----------+
                           |
              host-based routing (HTTPS):
              api-test.salesduo.com  --> backend:4000   (staging)
              api.salesduo.com       --> backend:4000   (prod)
              *  (default)           --> frontend:8080
                           |
            +--------------+--------------+
            |     ECS Cluster (EC2)       |
            |     t3.large (awsvpc)       |
            |                             |
            |  +----------+ +----------+  |
            |  | backend  | | frontend |  |
            |  | node:4000| | nginx:   |  |
            |  | (Express)| | 8080     |  |
            |  +----+-----+ +----------+  |
            |       |                     |
            |  +----+-----+              |
            |  | redis    |              |
            |  | :6379    |              |
            |  +----------+              |
            +-------|---------------------+
                    | port 5432 (SSL)
                    v
           +----------------+
           |  RDS Postgres  |
           |  db.t4g.micro  |
           |  (PostgreSQL 16)|
           |  Not public    |
           +----------------+
```

**Key points:**
- **ECS on EC2** (not Fargate) with **awsvpc** networking — each task gets its own ENI
- **Single ECS task** runs 3 containers: backend + frontend + redis (sidecar)
- **ALB host-based routing:** `api-*.salesduo.com` → backend, everything else → frontend (both on port 443)
- **HTTP → HTTPS redirect** on port 80 (301)
- **RDS** is only accessible from the ECS security group (not public)

### Domain mapping

| Environment | Frontend | Backend | ALB |
|-------------|----------|---------|-----|
| Staging | `app-test.salesduo.com` | `api-test.salesduo.com` | `sd-core-platform-test-alb` |
| Production | `app.salesduo.com` | `api.salesduo.com` | Separate ALB (same pattern) |

Both subdomains CNAME to the same ALB. The ALB inspects the `Host` header and routes to the correct target group.

---

## Custom Domain Setup (Step-by-step)

This is the procedure used to map subdomains to the ALB. Repeat for each environment with its own ALB.

### 1. Request ACM wildcard certificate

```bash
CERT_ARN=$(aws acm request-certificate \
  --domain-name "*.salesduo.com" \
  --validation-method DNS \
  --query "CertificateArn" --output text --region us-east-1)

sleep 5

# Get the validation CNAME record
aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --query "Certificate.DomainValidationOptions[0].ResourceRecord" \
  --output table --region us-east-1
```

### 2. Add CNAME records in GoDaddy

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| CNAME | `_<hash>` (from ACM output) | `_<hash>.acm-validations.aws.` | Certificate validation |
| CNAME | `app-test` | `<ALB DNS>` | Frontend (staging) |
| CNAME | `api-test` | `<ALB DNS>` | Backend (staging) |

For production, add `app` and `api` CNAMEs pointing to the production ALB DNS.

### 3. Wait for certificate validation

```bash
aws acm wait certificate-validated --certificate-arn "$CERT_ARN" --region us-east-1
```

Usually takes 5-30 minutes after adding the CNAME in GoDaddy.

### 4. Create HTTPS listener with host-based routing

```bash
# Create HTTPS listener (default → frontend)
HTTPS_LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTPS --port 443 \
  --certificates "CertificateArn=$CERT_ARN" \
  --ssl-policy "ELBSecurityPolicy-TLS13-1-2-2021-06" \
  --default-actions "Type=forward,TargetGroupArn=$FRONTEND_TG" \
  --query "Listeners[0].ListenerArn" --output text --region us-east-1)

# Add host-based rule: api subdomain → backend
aws elbv2 create-rule \
  --listener-arn "$HTTPS_LISTENER_ARN" \
  --priority 10 \
  --conditions "Field=host-header,Values=api-test.salesduo.com" \
  --actions "Type=forward,TargetGroupArn=$BACKEND_TG" \
  --region us-east-1
```

### 5. Redirect HTTP → HTTPS

```bash
aws elbv2 modify-listener \
  --listener-arn "$HTTP_LISTENER_ARN" \
  --default-actions 'Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
  --region us-east-1
```

### 6. Update backend environment variables

Update the ECS task definition with:

| Variable | Staging value | Production value |
|----------|--------------|-----------------|
| `CORS_ORIGINS` | `https://app-test.salesduo.com` | `https://app.salesduo.com` |
| `FRONTEND_URL` | `https://app-test.salesduo.com` | `https://app.salesduo.com` |
| `COOKIE_DOMAIN` | `.salesduo.com` | `.salesduo.com` |

Then register the new task definition and update the service.

### 7. Update GitHub Actions secret

Set `VITE_API_BASE_URL` to:
- Staging: `https://api-test.salesduo.com`
- Production: `https://api.salesduo.com`

Push to trigger a rebuild — the URL is baked into the frontend JS bundle at build time.

### 8. Verify

```bash
curl -I https://app-test.salesduo.com        # → 200 (frontend)
curl https://api-test.salesduo.com/api/health # → 200 OK (backend)
curl -I http://app-test.salesduo.com          # → 301 redirect to HTTPS
```

---

## Deployment Gotchas Checklist

Every issue we hit during deployment, and the fix:

| # | Issue | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | Backend can't connect to DB | Task def uses `DB_HOST` but code reads `PGHOST` | Use `PG*` env var names (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`) |
| 2 | Migration hangs forever | `sequelize-cli` in devDependencies, `npx` tries to download, no internet in awsvpc | Move `sequelize-cli` to `dependencies` in `package.json` |
| 3 | `no pg_hba.conf entry... no encryption` | RDS requires SSL, app doesn't enable it | Add `dialectOptions.ssl` for production in `db.ts` and `sequelize.config.js` |
| 4 | Backend 502, health checks fail | ALB health check path didn't match app route | Ensure backend TG health check path is `/health` (matches Express route) |
| 5 | Backend crashes on startup | `STRIPE_SECRET_KEY`, `JWT_SECRET`, etc. missing from task def | Add all required env vars and secrets to the task definition |
| 6 | Frontend Stripe error (empty key) | `VITE_STRIPE_PUBLISHABLE_KEY` not passed as Docker build arg | Pass `--build-arg VITE_STRIPE_PUBLISHABLE_KEY=...` during `docker build` |
| 7 | RDS creation fails | DB name `sd-core-platformdb` contains hyphens | Strip hyphens from DB name (PostgreSQL doesn't allow them) |
| 8 | Task stuck in PROVISIONING | t3.medium ENI limit with awsvpc — too many tasks for available ENIs | Account for ENI limits when sizing instances. Set `minimumHealthyPercent=0` to avoid deadlocks during deployments |
| 9 | Docker build OOM on macOS | `tsc` SIGKILL'd during cross-compilation (amd64 on ARM via QEMU) | Build via CI/CD (GitHub Actions), not locally on Apple Silicon |
| 10 | Frontend port mismatch | docker-compose maps `5173:5173` but nginx listens on 8080 | Use `5173:8080` in docker-compose for local dev |
| 11 | Frontend API calls return HTML | `VITE_API_BASE_URL=""` makes requests go to `/auth/me` on port 80 (frontend), not the backend | Set `VITE_API_BASE_URL` to the backend URL (e.g., `https://api-test.salesduo.com`) |
| 12 | ENI deadlock during deployments | ECS tries to start new task before stopping old, but no free ENI (3 ENIs, 1 for host = 2 for tasks) | Set `minimumHealthyPercent=0` on service deployment config so ECS stops old task first. Upgraded to t3.large for more memory |
| 13 | Cookies not sent cross-subdomain | `COOKIE_DOMAIN` not set — cookies scoped to exact hostname only | Set `COOKIE_DOMAIN=.salesduo.com` so cookies are shared across `app-test.salesduo.com` and `api-test.salesduo.com` |
| 14 | 401 errors after domain migration | Frontend built with old `VITE_API_BASE_URL` (ALB DNS), cookie domain mismatch | Update GitHub secret `VITE_API_BASE_URL` to match the API domain, rebuild frontend. Ensure `COOKIE_DOMAIN`, `CORS_ORIGINS`, and `FRONTEND_URL` all use the same parent domain |
| 15 | `NET::ERR_CERT_COMMON_NAME_INVALID` | HTTPS listener missing the wildcard cert for the requested domain | Add certs via `aws elbv2 add-listener-certificates` — ALB uses SNI to serve the correct cert per hostname |
| 16 | Grafana/Loki shows no backend logs | All containers used `awslogs` driver — Promtail reads Docker logs via socket, which only works with `json-file` driver | Switch container log driver from `awslogs` to `json-file` in the task definition |
| 17 | Promtail can't reach Loki | Promtail config pointed to `localhost:3100` but Promtail and Loki are in separate ECS tasks (separate ENIs) | Use Cloud Map service discovery address: `http://monitoring.<namespace>:3100/loki/api/v1/push` |

---

## Backend Requirements Checklist (for any new app)

Before deploying a new app to this infrastructure, verify:

- [ ] `sequelize-cli` is in **`dependencies`** (not devDependencies) — npx can't download packages in awsvpc without a NAT gateway
- [ ] `db.ts` and `sequelize.config.js` enable **SSL when `NODE_ENV=production`** — RDS requires SSL connections
- [ ] App has a **`/health` endpoint** — ALB health checks hit this path
- [ ] **All `process.env.*` vars** are listed in the ECS task definition (environment or secrets block)
- [ ] Frontend **`VITE_*` vars** are passed as `--build-arg` at Docker build time (they're baked into the JS bundle)
- [ ] **DB name has no hyphens** — PostgreSQL rejects them; `setup.sh` now strips them automatically

---

## Secrets Management

The setup script creates two Secrets Manager secrets:

| Secret | Contains | Used by |
|--------|----------|---------|
| `{project}-{env}-db-password` | Plain-text DB password | Task def `PGPASSWORD` via `valueFrom` |
| `{project}-{env}-backend-env` | JSON with app secrets | Task def secrets via `arn:...:secret-name:KEY::` syntax |

**Backend env secret keys:**
`JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SUPERUSER_EMAILS`

`JWT_SECRET` is auto-generated during setup. All other keys are created with `REPLACE_ME` placeholders — update them before deploying:

```bash
aws secretsmanager put-secret-value \
  --secret-id sd-core-platform-test-backend-env \
  --region us-east-1 \
  --secret-string '{
    "JWT_SECRET": "...",
    "STRIPE_SECRET_KEY": "sk_test_...",
    "STRIPE_WEBHOOK_SECRET": "whsec_...",
    "GOOGLE_CLIENT_ID": "...apps.googleusercontent.com",
    "GOOGLE_CLIENT_SECRET": "GOCSPX-...",
    "SMTP_USER": "email@gmail.com",
    "SMTP_PASS": "app-password",
    "SMTP_FROM": "email@gmail.com",
    "SUPERUSER_EMAILS": "admin@example.com"
  }'
```

---

## CI/CD with GitHub Actions

### OIDC Setup

The `setup.sh` script creates a GitHub Actions OIDC role when you provide `GITHUB_REPO`. This allows GitHub Actions to assume an AWS role without long-lived access keys.

### Required GitHub Repo Variables

Set these in **Settings > Secrets and variables > Actions > Variables**:

| Variable | Staging | Production |
|----------|---------|------------|
| `AWS_REGION` | `us-east-1` | `us-east-1` |
| `AWS_ACCOUNT_ID` | `968669187421` | `968669187421` |
| `ECS_CLUSTER` | `sd-core-platform-test-cluster` | `sd-core-platform-prod-cluster` |
| `APP_SERVICE_NAME` | `sd-core-platform-test-app-service` | `sd-core-platform-prod-app-service` |
| `IMAGE_TAG` | `test` | `prod` |
| `PROJECT_NAME` | `sd-core-platform` | `sd-core-platform` |

### Required GitHub Repo Secrets

| Secret | Staging | Production |
|--------|---------|------------|
| `OIDC_ROLE_ARN` | ARN of the GitHub deploy role | Same or separate role |
| `VITE_API_BASE_URL` | `https://api-test.salesduo.com` | `https://api.salesduo.com` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key | Stripe live publishable key |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID | Same |

### Frontend Build Args

`VITE_*` variables must be passed as `--build-arg` during `docker build` because Vite bakes them into the JS bundle at build time. They cannot be set as runtime environment variables.

```bash
docker build --platform linux/amd64 \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="$VITE_STRIPE_PUBLISHABLE_KEY" \
  --build-arg VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
  --build-arg VITE_API_BASE_URL="https://api-test.salesduo.com" \
  -t $IMAGE_URI \
  ./frontend
```

### Deployment Verification

The CI/CD pipeline includes a verification step that fails the build if:
- Multiple deployments are still active (stuck old tasks)
- Running task count doesn't match desired count (resource failures like ENI exhaustion)

This prevents silent deployment failures.

---

## Monitoring (Grafana + Loki + Promtail)

### How it works

- **Promtail** runs as a separate ECS task, mounts the Docker socket, and discovers all containers on the host
- **Loki** runs inside the monitoring task, receives logs from Promtail via Cloud Map service discovery
- **Grafana** runs alongside Loki in the monitoring task, queries Loki on `localhost:3100`

### Log driver requirement

All app containers must use the `json-file` Docker log driver (not `awslogs`). Promtail reads logs via the Docker socket, which only works with `json-file` or `local` drivers.

```json
"logConfiguration": {
  "logDriver": "json-file",
  "options": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

### Grafana access

```
http://<ALB_DNS>:3001
```

### Useful Loki queries in Grafana Explore

```
{task_family="sd-core-platform-test-app"}                    # All app logs
{task_family="sd-core-platform-test-app", ecs_container="backend"}   # Backend only
{task_family="sd-core-platform-test-app", ecs_container="frontend"}  # Frontend only
{container=~".+"}                                            # Everything
```

---

## Useful Commands

```bash
# --- Service Status ---
aws ecs describe-services \
  --cluster sd-core-platform-test-cluster \
  --services sd-core-platform-test-app-service \
  --region us-east-1 \
  --query 'services[*].{name:serviceName,desired:desiredCount,running:runningCount,status:status}' \
  --output table

# --- View Logs (via Grafana/Loki, not CloudWatch) ---
# Open Grafana at http://<ALB_DNS>:3001, use Explore tab with Loki datasource

# --- Force Redeploy (after pushing new images) ---
aws ecs update-service \
  --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service \
  --force-new-deployment \
  --region us-east-1

# --- Scale Up/Down ---
aws ecs update-service \
  --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service \
  --desired-count 2 \
  --region us-east-1

# --- Stop All Tasks (save cost) ---
aws ecs update-service \
  --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service \
  --desired-count 0 \
  --region us-east-1

# --- SSH into EC2 Instance via SSM ---
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=sd-core-platform-test-ecs-instance" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" --output text --region us-east-1)
aws ssm start-session --target "$INSTANCE_ID" --region us-east-1

# --- ECS Exec into Container ---
TASK_ARN=$(aws ecs list-tasks \
  --cluster sd-core-platform-test-cluster \
  --service-name sd-core-platform-test-app-service \
  --region us-east-1 \
  --query 'taskArns[0]' --output text)

aws ecs execute-command \
  --cluster sd-core-platform-test-cluster \
  --task "$TASK_ARN" \
  --container backend \
  --interactive \
  --command "/bin/sh" \
  --region us-east-1

# --- View Recent Deployment Events ---
aws ecs describe-services \
  --cluster sd-core-platform-test-cluster \
  --services sd-core-platform-test-app-service \
  --region us-east-1 \
  --query 'services[0].events[0:10].{time:createdAt,msg:message}' \
  --output table
```

---

## ENI Limits & Instance Sizing

With `awsvpc` networking, each ECS task consumes one ENI. EC2 instances have ENI limits:

| Instance Type | Max ENIs | Max Tasks (ENIs - 1 for host) |
|--------------|----------|-------------------------------|
| t3.micro | 2 | 1 |
| t3.small | 3 | 2 |
| t3.medium | 3 | 2 |
| t3.large | 3 | 2 |

The `-1` is because the host needs one ENI for itself.

**Deployment deadlock fix:** The service is configured with `minimumHealthyPercent=0` so ECS stops the old task before starting the new one. This avoids the ENI deadlock where the new task can't start because the old task holds the only free ENI. Tradeoff: brief downtime during deployments (acceptable for staging, reconsider for production with larger instances or ENI trunking).

---

## Cross-Tool Authentication

sd-core-platform supports cross-tool authentication via a shared `session_id` cookie. Each tool is completely independent infrastructure (own ALB, ECS cluster, RDS), but authentication is shared — log in once on `app.salesduo.com`, be authenticated on `tool1.salesduo.com`.

### How it works

1. User logs in on the core platform (`app.salesduo.com`), which sets a `session_id` cookie scoped to `.salesduo.com` (via `COOKIE_DOMAIN`)
2. When the user visits a tool (`tool1.salesduo.com`), the tool's frontend calls `GET https://api.salesduo.com/auth/me` with `credentials: 'include'`
3. The browser sends the `session_id` cookie (shared across subdomains via `COOKIE_DOMAIN`)
4. The core backend validates the session in its own Redis and returns user data (id, email, name, org memberships, roles)
5. If the response is `401`, the tool redirects to `https://app.salesduo.com/login?redirect=https://tool1.salesduo.com`

**No shared Redis or ElastiCache needed.** Tools don't validate sessions themselves — they call the core backend's `/auth/me` endpoint.

```
tool1.salesduo.com         app.salesduo.com         api.salesduo.com
(tool1's ALB)              (core ALB)               (core ALB)
     |                          |                        |
tool1 frontend             core frontend            core backend
     |                                                   |
     +--- GET /auth/me (with cookie) ------------------->|
     |<-- 200 { user data } or 401 ----------------------|
```

### Cookie configuration

| Setting | Value | Why |
|---------|-------|-----|
| `domain` | `.salesduo.com` | Shared across all `*.salesduo.com` subdomains |
| `httpOnly` | `true` | Prevents XSS access to session cookie |
| `secure` | `true` | HTTPS only (all environments use HTTPS) |
| `sameSite` | `lax` | Same-site requests (all subdomains share eTLD+1 `salesduo.com`) — works for AJAX calls between subdomains |

### Setup checklist for adding a new tool

1. **Deploy the tool** with its own `setup.sh` (own ALB, ECS, RDS, etc.)
2. **Set up DNS:** `tool1.salesduo.com` CNAME to tool1's ALB DNS
3. **Update core backend CORS:** Add `https://tool1.salesduo.com` to the core backend's `CORS_ORIGINS` env var in its ECS task definition, then force a redeploy
4. **In tool1's frontend:** Call `GET https://api.salesduo.com/auth/me` with `credentials: 'include'` on page load
5. **Handle 401:** Redirect to `https://app.salesduo.com/login?redirect=https://tool1.salesduo.com`

### Requirements

- **Same parent domain:** All tools must be subdomains of `*.salesduo.com`
- **`COOKIE_DOMAIN` must be set:** `.salesduo.com` — auto-derived from `DOMAIN` in `setup.sh`
- **Core backend CORS must include each tool's origin:** Update `CORS_ORIGINS` in the core task def whenever a new tool is added
- **`sameSite: 'lax'`** (current cookie setting) works — the browser sends the cookie on same-site requests when `credentials: 'include'` is used and the server responds with `Access-Control-Allow-Credentials: true` (configured in `app.ts` via `cors({ credentials: true })`)
