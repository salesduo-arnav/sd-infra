# ECS Task Definitions

## Overview

ECS task definitions specify how Docker containers run on the ECS cluster. Each task definition describes the container image, port mappings, environment variables, logging configuration, and resource limits.

## Task Definition Files

### Production

| File | Container | Image | Port |
|------|-----------|-------|------|
| `prod-backend-task-def.json` | backend | ECR backend image | 4000 |
| `prod-frontend-task-def.json` | frontend | ECR frontend image | 8080 |

### Staging/Dev

| File | Container | Image | Port |
|------|-----------|-------|------|
| `backend-task-def.json` | backend | ECR backend image | 3000 |
| `frontend-task-def.json` | frontend | ECR frontend image | 8080 |

### Monitoring

| File | Container | Description |
|------|-----------|-------------|
| `sd-core-platform-test-monitoring-task-def.json` | grafana | Grafana dashboard |
| `sd-core-platform-test-promtail-task-def.json` | promtail | Log shipping to Loki |

### Full Stack

| File | Description |
|------|-------------|
| `sd-core-platform-test-app-task-def.json` | Backend + Frontend in single task |

## Backend Task Definition Structure

```json
{
  "family": "sd-core-platform-prod-backend",
  "containerDefinitions": [{
    "name": "backend",
    "image": "<ECR_URI>:latest",
    "portMappings": [{ "containerPort": 4000 }],
    "environment": [
      { "name": "NODE_ENV", "value": "production" },
      { "name": "PORT", "value": "4000" },
      { "name": "PGHOST", "value": "<RDS_ENDPOINT>" },
      { "name": "PGDATABASE", "value": "<DB_NAME>" },
      { "name": "PGUSER", "value": "<DB_USER>" },
      { "name": "PGPASSWORD", "value": "<DB_PASSWORD>" },
      { "name": "REDIS_URL", "value": "<REDIS_ENDPOINT>" },
      { "name": "CORS_ORIGINS", "value": "<ALLOWED_ORIGINS>" },
      { "name": "FRONTEND_URL", "value": "<FRONTEND_URL>" },
      { "name": "STRIPE_SECRET_KEY", "value": "<STRIPE_KEY>" },
      { "name": "STRIPE_WEBHOOK_SECRET", "value": "<WEBHOOK_SECRET>" },
      // ... more env vars
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "<LOG_GROUP>",
        "awslogs-region": "<REGION>",
        "awslogs-stream-prefix": "backend"
      }
    }
  }],
  "executionRoleArn": "<EXECUTION_ROLE_ARN>",
  "taskRoleArn": "<TASK_ROLE_ARN>"
}
```

## Frontend Task Definition Structure

```json
{
  "family": "sd-core-platform-prod-frontend",
  "containerDefinitions": [{
    "name": "frontend",
    "image": "<ECR_URI>:latest",
    "portMappings": [{ "containerPort": 8080 }],
    "logConfiguration": {
      "logDriver": "awslogs"
    }
  }]
}
```

Note: Frontend has no runtime environment variables because VITE variables are baked in at Docker build time.

## CI/CD Integration

The GitHub Actions workflow:
1. Fills in the ECR image URI in the task definition
2. Registers the new task definition revision
3. Updates the ECS service to use the new revision
4. Waits for deployment stabilization

## Key Files

- `infra/prod-backend-task-def.json`
- `infra/prod-frontend-task-def.json`
- `infra/backend-task-def.json`
- `infra/frontend-task-def.json`
- `infra/sd-core-platform-test-*.json`

---

## Issues Found

1. **CRITICAL: Plaintext secrets in task definition** — Database passwords, Stripe keys, and other secrets are stored as plaintext `value` in the task definition JSON. Should use AWS Secrets Manager with `valueFrom` to reference secrets securely.
2. **Port inconsistency** — Production backend uses port 4000 while staging uses 3000. This inconsistency could cause confusion and deployment issues.
3. **No memory/CPU limits** — Task definitions don't specify explicit memory or CPU limits, relying on ECS defaults which may not be appropriate.
4. **No health check in task definition** — Container health checks should be defined to enable ECS to detect unhealthy tasks.
5. **Log driver conflict** — Uses `awslogs` but deployment documentation mentions using `json-file` for Promtail. These approaches conflict.
6. **Task definitions checked into version control** — Files containing secrets (even if they should be replaced) are in git. The prod task definition has actual credentials.
7. **No environment variable documentation** — No reference for which variables are required, their format, or valid values.
8. **Multiple task definition variants** — 8+ task definition files with overlapping configuration, making maintenance error-prone.
