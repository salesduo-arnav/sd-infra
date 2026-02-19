# Database Operations & Deployment Guide

## RDS Instance Details

| Property | Value |
|---|---|
| **Instance ID** | `sd-core-platform-test-db` |
| **Engine** | PostgreSQL 16 |
| **Endpoint** | `sd-core-platform-test-db.<id>.us-east-1.rds.amazonaws.com` |
| **Port** | `5432` |
| **Database** | `sdcoreplatformdb` |
| **Username** | `dbadmin` |
| **Instance Class** | `db.t4g.micro` |
| **Storage** | 20GB gp3 |
| **Publicly Accessible** | No |
| **Backup Retention** | 7 days (prod) / 1 day (test) |
| **RDS Security Group** | Allows 5432 from ECS SG only |
| **DB Subnet Group** | `sd-core-platform-test-db-subnet-group` (2 AZs) |

> **Note:** The DB name is `sdcoreplatformdb` (no hyphens) because PostgreSQL doesn't allow hyphens in database names. The `setup.sh` script strips them automatically.

---

## Deployment Steps (Code Change to Production)

### Quick deploy (backend changes only)
```bash
# 1. Build for linux/amd64 (ECS runs on amd64)
docker build --platform linux/amd64 \
  -t $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/sd-core-platform/backend:test \
  ./backend

# 2. Login to ECR and push
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/sd-core-platform/backend:test

# 3. Force ECS to pull the new image
aws ecs update-service \
  --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service \
  --force-new-deployment \
  --region us-east-1

# 4. Wait for rollout to complete
aws ecs wait services-stable \
  --cluster sd-core-platform-test-cluster \
  --services sd-core-platform-test-app-service \
  --region us-east-1
```

### Quick deploy (frontend changes only)
```bash
# 1. Build with VITE build args
docker build --platform linux/amd64 \
  --build-arg VITE_API_BASE_URL="http://ALB_DNS:4000" \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY="pk_test_..." \
  --build-arg VITE_GOOGLE_CLIENT_ID="...apps.googleusercontent.com" \
  -t $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/sd-core-platform/frontend:test \
  ./frontend

# 2. Push
docker push $ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/sd-core-platform/frontend:test

# 3. Force redeploy (same service — frontend is a container in the app task)
aws ecs update-service \
  --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service \
  --force-new-deployment \
  --region us-east-1
```

### If task definition changes (new env vars, CPU/memory, etc.)
```bash
# 1. Edit infra/sd-core-platform-test-app-task-def.json

# 2. Register new revision
aws ecs register-task-definition \
  --cli-input-json file://infra/sd-core-platform-test-app-task-def.json \
  --region us-east-1

# 3. Deploy with the new revision number
aws ecs update-service \
  --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service \
  --task-definition sd-core-platform-test-app:NEW_REVISION \
  --force-new-deployment \
  --region us-east-1
```

### Production verification
```bash
# Health check
curl -s http://<ALB_DNS>:4000/health | python3 -m json.tool

# Web UI
open http://<ALB_DNS>
```

---

## Direct Database Access

RDS is **not publicly accessible** (by design — it only allows connections from the ECS security group). Here are the ways to connect directly:

### Option 1: ECS Exec (recommended — no infra changes)

Run a one-off command inside a running ECS task, then use `psql` from there.

```bash
# 1. Enable ECS Exec on the service (one-time setup)
aws ecs update-service \
  --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service \
  --enable-execute-command \
  --region us-east-1

# 2. Find a running task
TASK_ARN=$(aws ecs list-tasks \
  --cluster sd-core-platform-test-cluster \
  --service-name sd-core-platform-test-app-service \
  --region us-east-1 \
  --query 'taskArns[0]' --output text)

# 3. Exec into the backend container
aws ecs execute-command \
  --cluster sd-core-platform-test-cluster \
  --task "$TASK_ARN" \
  --container backend \
  --interactive \
  --command "/bin/sh" \
  --region us-east-1

# 4. Inside the container, connect to DB using PG* env vars already set
# Install psql if needed:
apk add postgresql-client
# Connect (env vars are already set by the task definition):
psql "host=$PGHOST port=5432 dbname=$PGDATABASE user=$PGUSER password=$PGPASSWORD sslmode=require"
```

**Note:** ECS Exec requires the task role to have SSM permissions. If it doesn't work, add this policy to the task role:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel"
    ],
    "Resource": "*"
  }]
}
```

### Option 2: SSH Tunnel via SSM to EC2 Instance

Since we're running ECS on EC2, you can use SSM to tunnel through the EC2 instance:

```bash
# 1. Find the EC2 instance
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=sd-core-platform-test-ecs-instance" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" --output text --region us-east-1)

# 2. Start SSM port-forwarding session
aws ssm start-session \
  --target "$INSTANCE_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"sd-core-platform-test-db.<id>.us-east-1.rds.amazonaws.com\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5432\"]}" \
  --region us-east-1

# 3. In another terminal, connect locally:
psql -h localhost -p 5432 -U dbadmin -d sdcoreplatformdb
```

### Common SQL Operations
```sql
-- List all tables
\dt

-- Check table schema
\d users

-- Count rows
SELECT COUNT(*) FROM users;

-- Recent records
SELECT * FROM users ORDER BY "createdAt" DESC LIMIT 10;
```

---

## Viewing Logs

### ECS Application Logs (CloudWatch)
```bash
# Tail all app logs in real-time (backend + frontend + redis)
aws logs tail /ecs/sd-core-platform-test-app --follow --region us-east-1

# Last 30 minutes
aws logs tail /ecs/sd-core-platform-test-app --since 30m --region us-east-1

# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/sd-core-platform-test-app \
  --filter-pattern "error" \
  --region us-east-1 \
  --query 'events[*].message' --output text
```

### ECS Service Events (deployment issues)
```bash
aws ecs describe-services \
  --cluster sd-core-platform-test-cluster \
  --services sd-core-platform-test-app-service \
  --region us-east-1 \
  --query 'services[0].events[0:10].{time:createdAt,msg:message}' \
  --output table
```

### RDS Logs
```bash
# List available log files
aws rds describe-db-log-files \
  --db-instance-identifier sd-core-platform-test-db \
  --region us-east-1

# Download a specific log
aws rds download-db-log-file-portion \
  --db-instance-identifier sd-core-platform-test-db \
  --log-file-name "error/postgresql.log.2026-02-18-19" \
  --region us-east-1 \
  --output text
```

---

## Backup & Restore (RDS)

```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier sd-core-platform-test-db \
  --db-snapshot-identifier sd-core-platform-test-db-manual-$(date +%Y%m%d) \
  --region us-east-1

# List snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier sd-core-platform-test-db \
  --region us-east-1 \
  --query 'DBSnapshots[*].{ID:DBSnapshotIdentifier,Status:Status,Created:SnapshotCreateTime}' \
  --output table

# Restore to a point in time (creates a NEW instance)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier sd-core-platform-test-db \
  --target-db-instance-identifier sd-core-platform-test-db-restored \
  --restore-time "2026-02-18T12:00:00Z" \
  --region us-east-1
```

---

## Cost Breakdown (Approximate)

| Resource | Monthly Cost |
|---|---|
| RDS db.t4g.micro (single-AZ) | ~$12 |
| EC2 t3.medium (1 instance) | ~$30 |
| ALB | ~$16 + data transfer |
| CloudWatch Logs | ~$1 |
| ECR storage | < $1 |
| Secrets Manager (3 secrets) | ~$1.20 |
| **Total** | **~$61/mo** |

To reduce costs: scale the app service to 0 and stop the EC2 instances when not in use.
```bash
# Stop app tasks
aws ecs update-service --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service --desired-count 0 --region us-east-1

# Stop RDS (stops billing for compute, keeps data; auto-restarts after 7 days)
aws rds stop-db-instance --db-instance-identifier sd-core-platform-test-db --region us-east-1

# Resume
aws rds start-db-instance --db-instance-identifier sd-core-platform-test-db --region us-east-1
aws ecs update-service --cluster sd-core-platform-test-cluster \
  --service sd-core-platform-test-app-service --desired-count 1 --region us-east-1
```

---

## Local Development

```bash
# Start everything locally (Postgres + Redis + Backend + Frontend)
docker compose up --build

# Just the Backend and DB (skip frontend)
docker compose up --build backend db redis

# Connect to local DB
psql -h localhost -p 5432 -U myuser -d mydb
# password: mypassword

# Reset local DB (wipe data)
docker compose down -v   # -v removes volumes
docker compose up --build
```
