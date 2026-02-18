# ECS Deployment Guide — sd-core-platform

## Architecture

```
                         Internet
                            |
                            v
                 +---------------------+
                 |   Application Load  |
                 |   Balancer (ALB)    |
                 |                     |
                 |   :80  → frontend   |
                 |   :4000 → backend   |
                 |   :443 (HTTPS, opt) |
                 +---------+-----------+
                           |
              port-based routing:
              :80    --> frontend:8080
              :4000  --> backend:4000
                           |
            +--------------+--------------+
            |     ECS Cluster (EC2)       |
            |     Single Task (awsvpc)    |
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
- **ALB port-based routing:** port 80 → frontend:8080, port 4000 → backend:4000
- **RDS** is only accessible from the ECS security group (not public)

---

## Deployment Gotchas Checklist

Every issue we hit during the initial sd-core-platform deployment, and the fix:

| # | Issue | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | Backend can't connect to DB | Task def uses `DB_HOST` but code reads `PGHOST` | Use `PG*` env var names (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`) |
| 2 | Migration hangs forever | `sequelize-cli` in devDependencies, `npx` tries to download, no internet in awsvpc | Move `sequelize-cli` to `dependencies` in `package.json` |
| 3 | `no pg_hba.conf entry... no encryption` | RDS requires SSL, app doesn't enable it | Add `dialectOptions.ssl` for production in `db.ts` and `sequelize.config.js` |
| 4 | Backend 502, health checks fail | ALB health check path didn't match app route | Ensure backend TG health check path is `/health` (matches Express route) |
| 5 | Backend crashes on startup | `STRIPE_SECRET_KEY`, `JWT_SECRET`, etc. missing from task def | Add all required env vars and secrets to the task definition |
| 6 | Frontend Stripe error (empty key) | `VITE_STRIPE_PUBLISHABLE_KEY` not passed as Docker build arg | Pass `--build-arg VITE_STRIPE_PUBLISHABLE_KEY=...` during `docker build` |
| 7 | RDS creation fails | DB name `sd-core-platformdb` contains hyphens | Strip hyphens from DB name (PostgreSQL doesn't allow them) |
| 8 | Task stuck in PROVISIONING | t3.medium ENI limit with awsvpc — too many tasks for available ENIs | Account for ENI limits when sizing instances (t3.medium = 3 ENIs = 2 tasks max) |
| 9 | Docker build OOM on macOS | `tsc` SIGKILL'd during cross-compilation (amd64 on ARM via QEMU) | Build via CI/CD (GitHub Actions), not locally on Apple Silicon |
| 10 | Frontend port mismatch | docker-compose maps `5173:5173` but nginx listens on 8080 | Use `5173:8080` in docker-compose for local dev |
| 11 | Frontend API calls return HTML | `VITE_API_BASE_URL=""` makes requests go to `/auth/me` on port 80 (frontend), not the backend | Set `VITE_API_BASE_URL` to the backend URL (`http://ALB_DNS:4000`) so Axios calls the backend directly |

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

| Variable | Example Value |
|----------|--------------|
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCOUNT_ID` | `968669187421` |
| `ECS_CLUSTER` | `sd-core-platform-test-cluster` |
| `APP_SERVICE_NAME` | `sd-core-platform-test-app-service` |
| `IMAGE_TAG` | `test` |
| `PROJECT_NAME` | `sd-core-platform` |

### Required GitHub Repo Secrets

| Secret | Description |
|--------|------------|
| `OIDC_ROLE_ARN` | ARN of the GitHub deploy role (from setup output) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for frontend build arg |
| `VITE_API_BASE_URL` | Backend URL for frontend API calls (e.g., `http://ALB_DNS:4000`) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID for frontend build arg |

### Frontend Build Args

`VITE_*` variables must be passed as `--build-arg` during `docker build` because Vite bakes them into the JS bundle at build time. They cannot be set as runtime environment variables.

```bash
docker build --platform linux/amd64 \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="$VITE_STRIPE_PUBLISHABLE_KEY" \
  --build-arg VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
  --build-arg VITE_API_BASE_URL="http://ALB_DNS:4000" \
  -t $IMAGE_URI \
  ./frontend
```

Setting `VITE_API_BASE_URL` to the backend's URL (ALB on port 4000) makes the frontend call the backend directly. The ALB has a dedicated listener on port 4000 that forwards to the backend target group, so no `/api` prefix is needed — backend routes work as-is (`/auth/me`, `/health`, etc.).

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

# --- View Logs ---
aws logs tail /ecs/sd-core-platform-test-app --follow --region us-east-1

# Filter to backend only
aws logs tail /ecs/sd-core-platform-test-app --follow --region us-east-1 \
  --filter-pattern '{$.kubernetes.container_name = "backend"}'

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

The `-1` is because the host needs one ENI for itself. If tasks get stuck in PROVISIONING, you've likely hit this limit. Either reduce task count or add more EC2 instances via the ASG.

---

## Cross-Tool Authentication

sd-core-platform supports cross-tool authentication via a shared `session_id` cookie. Each tool is completely independent infrastructure (own ALB, ECS cluster, RDS), but authentication is shared — log in once on `app.example.com`, be authenticated on `tool1.example.com`.

### How it works

1. User logs in on the core platform (`app.example.com`), which sets a `session_id` cookie scoped to `.example.com` (via `COOKIE_DOMAIN`)
2. When the user visits a tool (`tool1.example.com`), the tool's frontend calls `GET https://api.example.com/auth/me` with `credentials: 'include'`
3. The browser sends the `session_id` cookie (shared across subdomains via `COOKIE_DOMAIN`)
4. The core backend validates the session in its own Redis and returns user data (id, email, name, org memberships, roles)
5. If the response is `401`, the tool redirects to `https://app.example.com/login?redirect=https://tool1.example.com`

**No shared Redis or ElastiCache needed.** Tools don't validate sessions themselves — they call the core backend's `/auth/me` endpoint.

```
tool1.example.com          app.example.com          api.example.com
(tool1's ALB)              (core ALB)               (core ALB)
     |                          |                        |
tool1 frontend             core frontend            core backend
     |                                                   |
     +--- GET /auth/me (with cookie) ------------------->|
     |<-- 200 { user data } or 401 ----------------------|
```

### Setup checklist for adding a new tool

1. **Deploy the tool** with its own `setup.sh` (own ALB, ECS, RDS, etc.)
2. **Set up DNS:** `tool1.example.com` CNAME to tool1's ALB DNS
3. **Update core backend CORS:** Add `https://tool1.example.com` to the core backend's `CORS_ORIGINS` env var in its ECS task definition, then force a redeploy:
   ```bash
   # Update the task def JSON to include the new origin in CORS_ORIGINS
   # e.g. "https://app.example.com,https://example.com,https://tool1.example.com"
   # Then register the new task def and update the service:
   aws ecs update-service \
     --cluster <core-cluster> \
     --service <core-app-service> \
     --force-new-deployment \
     --region us-east-1
   ```
4. **In tool1's frontend:** Call `GET https://api.example.com/auth/me` with `credentials: 'include'` on page load
5. **Handle 401:** Redirect to `https://app.example.com/login?redirect=https://tool1.example.com`

### Requirements

- **Same parent domain:** All tools must be subdomains of the same parent domain (e.g., `*.example.com`)
- **`COOKIE_DOMAIN` must be set:** e.g., `.example.com` — this is prompted during `setup.sh` and auto-derived from `DOMAIN` if not explicitly provided
- **Core backend CORS must include each tool's origin:** Update `CORS_ORIGINS` in the core task def whenever a new tool is added
- **`sameSite: 'lax'`** (current cookie setting) works — the browser sends the cookie on cross-origin GET requests when `credentials: 'include'` is used and the server responds with `Access-Control-Allow-Credentials: true` (already configured in `app.ts` via `cors({ credentials: true })`)
