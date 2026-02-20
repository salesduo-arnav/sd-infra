# Infrastructure Scripts

## Overview

Two shell scripts manage AWS infrastructure provisioning and teardown: `setup.sh` (~96KB, comprehensive provisioning) and `teardown.sh` (~35KB, safe resource cleanup).

## Setup Script (`infra/setup.sh`)

### Purpose
Interactive script that provisions the complete AWS infrastructure for the platform.

### Resources Created
1. **Networking:** VPC, public/private subnets, Internet Gateway, NAT Gateway, route tables
2. **Container Registry:** ECR repositories for backend and frontend
3. **IAM:** ECS task execution role, task role, OIDC provider for GitHub Actions
4. **Database:** RDS PostgreSQL 16 instance in private subnet
5. **Cache:** ElastiCache Redis (or standalone Redis on EC2)
6. **Load Balancer:** Application Load Balancer with target groups
7. **Compute:** ECS cluster on EC2 (not Fargate), Auto Scaling Group
8. **Monitoring:** CloudWatch alarms, SNS topics for alerts
9. **DNS:** Route53 records (optional)

### Features
- **Interactive prompts** with sensible defaults
- **Idempotent** — safe to re-run (checks for existing resources)
- **Environment-aware** — different defaults for dev/staging/prod
- **Resource tracking** — generates JSON file of all created resource IDs
- **Auto-generated passwords** for database and Grafana

### Usage
```bash
cd infra
chmod +x setup.sh
./setup.sh
```

### Output
Creates a resource tracking file (e.g., `sd-core-platform-dev-resources.json`) containing all resource ARNs and IDs for future reference and teardown.

## Teardown Script (`infra/teardown.sh`)

### Purpose
Safely removes all AWS resources created by the setup script.

### Features
- Reads resource JSON file to identify what to delete
- **Confirmation prompt** with full resource inventory
- **Ordered deletion** — respects dependency order
- **RDS final snapshot** — creates snapshot before deletion
- **Graceful handling** of already-deleted resources

### Usage
```bash
cd infra
chmod +x teardown.sh
./teardown.sh
```

### Deletion Order
1. ECS services and tasks
2. ECS cluster
3. Auto Scaling Group and Launch Template
4. Load Balancer and Target Groups
5. RDS instance (with final snapshot)
6. ElastiCache
7. NAT Gateway
8. Security Groups
9. Subnets
10. VPC
11. ECR repositories
12. IAM roles and policies

## Task Definition Files

Located in `infra/`, these JSON files define ECS task configurations:

| File | Description |
|------|-------------|
| `prod-backend-task-def.json` | Production backend |
| `prod-frontend-task-def.json` | Production frontend |
| `backend-task-def.json` | Staging/dev backend |
| `frontend-task-def.json` | Staging/dev frontend |
| `sd-core-platform-test-app-task-def.json` | Full stack test |
| `sd-core-platform-test-monitoring-task-def.json` | Grafana monitoring |
| `sd-core-platform-test-promtail-task-def.json` | Log shipping |

## Key Files

- `infra/setup.sh` — Infrastructure provisioning
- `infra/teardown.sh` — Infrastructure cleanup
- `infra/*.json` — ECS task definitions
- `infra/DEPLOYMENT.md` — Deployment guide
- `infra/DATABASE-AND-OPS.md` — Database operations guide

---

## Issues Found

1. **CRITICAL: Hardcoded database password in task definition** — `prod-backend-task-def.json` contains a plaintext database password. Should use AWS Secrets Manager with `valueFrom` instead of `value`.
2. **Hardcoded AWS account ID** — Account ID `968669187421` appears in examples/comments in the setup script.
3. **Port inconsistency** — Backend task definition references port 4000, while other documentation and code use port 3000.
4. **Log driver mismatch** — Task definitions use `awslogs` driver, but `DEPLOYMENT.md` recommends `json-file` for Promtail integration. These are contradictory.
5. **Setup script uses inline Python** — Uses `python3` for JSON parsing instead of `jq`, which is more standard for shell scripts.
6. **Passwords stored in readable JSON** — Resource tracking files contain auto-generated passwords in plaintext.
7. **No backup before teardown** — Teardown script creates RDS final snapshot but doesn't backup application code or configuration.
8. **No resource validation before deletion** — Teardown doesn't verify resources still exist before attempting deletion, leading to misleading "may already be gone" warnings.
9. **No email format validation** — Setup script prompts for alarm notification email but doesn't validate format.
10. **Database name sanitization** — Hyphens are stripped from database names silently, which could create unintended names.
11. **No Terraform/CloudFormation** — Infrastructure is managed via bash scripts rather than infrastructure-as-code tools, making it harder to version, review, and reproduce.
