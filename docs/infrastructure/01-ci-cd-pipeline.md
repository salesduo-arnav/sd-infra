# CI/CD Pipeline

## Overview

The CI/CD pipeline is implemented as a GitHub Actions workflow (`.github/workflows/ci-cd.yaml`). It handles linting, testing, Docker image building, ECR pushing, and ECS deployment. Deployments trigger on pushes to `main`, `master`, and `dev` branches.

## Workflow Stages

### 1. Lint & Test (`lint-and-test`)
**Trigger:** Every push and pull request

- **Environment:** Node.js 20, Docker Compose
- **Steps:**
  1. Checkout code
  2. Set up Node.js
  3. Install backend dependencies
  4. Install frontend dependencies
  5. Run backend ESLint (`npm run lint`)
  6. Run frontend ESLint (`npm run lint`)
  7. Start test database/Redis via Docker Compose
  8. Create backend `.env` from GitHub secrets
  9. Run backend tests (`npm run test`)
  10. Generate CML report with test results (PR comment)
  11. Upload test reports as artifacts

### 2. Build & Deploy (`build-and-deploy`)
**Trigger:** Push to main/master/dev only (after lint-and-test passes)

- **Authentication:** AWS OIDC (no long-lived credentials)
- **Steps:**
  1. Checkout code
  2. Configure AWS credentials via OIDC
  3. Login to ECR
  4. Build backend Docker image
  5. Build frontend Docker image (with VITE build args)
  6. Push both images to ECR
  7. Register new ECS task definitions
  8. Update ECS services
  9. Verify deployment (wait for stabilization)

## Docker Build

### Backend Image
```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
# Install deps, compile TypeScript
FROM node:20-alpine AS runtime
# Copy compiled code, install prod deps only
CMD ["npm", "start"]  # Runs migrations then starts server
```

### Frontend Image
```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
# Install deps, build Vite SPA with env vars
FROM nginx:alpine AS runtime
# Copy built assets, serve via nginx
```

**Build Args (Frontend):**
- `VITE_API_BASE_URL` — Backend API URL
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID
- `VITE_STRIPE_PUBLISHABLE_KEY` — Stripe publishable key

## Deployment Verification

After ECS service update, the pipeline:
1. Waits for service stabilization (10 min timeout)
2. Checks deployment count (expects exactly 1 active deployment)
3. Verifies running task count matches desired count
4. Fails the pipeline if stabilization times out

## Environment Configuration

Secrets are stored in GitHub Secrets and injected during build:
- Database credentials → backend `.env`
- VITE variables → Docker build args
- AWS credentials → OIDC token exchange

## Key Files

- `.github/workflows/ci-cd.yaml` — Pipeline definition
- `backend/Dockerfile` — Backend Docker build
- `frontend/Dockerfile` — Frontend Docker build
- `docker-compose.ci.yml` — CI-specific Docker Compose override

---

## Issues Found

1. **Frontend E2E tests are disabled** — Playwright tests are commented out in the workflow. No end-to-end testing runs in CI.
2. **No artifact retention policy** — Test report artifacts are uploaded but have no explicit expiration, accumulating storage costs.
3. **Deployment only checks running count** — Verification checks that running tasks match desired count but doesn't verify service status (`ACTIVE`) or health check passing.
4. **No rollback mechanism** — If deployment fails after the ECS update, there's no automatic rollback to the previous task definition.
5. **Frontend build args create multiple sources of truth** — VITE environment variables appear in `.env.example`, `docker-compose.yml`, task definitions, and CI/CD workflow.
6. **No staging/production separation** — The same workflow deploys to all environments based on branch name, with no environment-specific approval gates.
7. **10-minute stabilization timeout** — May be insufficient for slow deployments, but too long for fast-fail scenarios.
8. **No smoke tests post-deployment** — After deployment, no HTTP health check or smoke test verifies the application is actually working.
9. **CML report generation** — Generates PR comments but only on PR, not on direct pushes to main/dev.
