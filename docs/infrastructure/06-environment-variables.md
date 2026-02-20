# Environment Variables Reference

## Overview

This document provides a centralized reference for all environment variables used across the platform. Variables are defined in multiple locations: `.env` files, Docker Compose, ECS task definitions, and CI/CD secrets.

## Backend Environment Variables

### Database (PostgreSQL)

| Variable | Required | Default | Description | Used In |
|----------|----------|---------|-------------|---------|
| `PGHOST` | Yes | — | Database hostname | db.ts, sequelize.config.js |
| `PGPORT` | No | 5432 | Database port | db.ts, sequelize.config.js |
| `PGUSER` | Yes | — | Database username | db.ts, sequelize.config.js |
| `PGPASSWORD` | Yes | — | Database password | db.ts, sequelize.config.js |
| `PGDATABASE` | Yes | — | Database name | db.ts, sequelize.config.js |

### Redis

| Variable | Required | Default | Description | Used In |
|----------|----------|---------|-------------|---------|
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL | redis.ts |

### Application

| Variable | Required | Default | Description | Used In |
|----------|----------|---------|-------------|---------|
| `NODE_ENV` | No | `development` | Environment (production enables SSL) | db.ts, logger.ts |
| `PORT` | No | 3000 | Server port | server.ts |
| `FRONTEND_URL` | Yes | `http://localhost:5173` | Frontend URL (links, CORS) | auth, invitation |
| `CORS_ORIGINS` | Yes | — | Comma-separated allowed origins | app.ts |
| `LOG_LEVEL` | No | `debug`/`http` | Winston log level | logger.ts |

### Authentication

| Variable | Required | Default | Description | Used In |
|----------|----------|---------|-------------|---------|
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth client ID | auth.controller.ts |
| `SUPERUSER_EMAILS` | No | — | Comma-separated admin emails | superuser.ts |

### Stripe (Billing)

| Variable | Required | Default | Description | Used In |
|----------|----------|---------|-------------|---------|
| `STRIPE_SECRET_KEY` | Yes | — | Stripe API secret key | stripe.service.ts |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Webhook signing secret | billing.controller.ts |

### Email (SMTP)

| Variable | Required | Default | Description | Used In |
|----------|----------|---------|-------------|---------|
| `SMTP_HOST` | No | `smtp.ethereal.email` | SMTP hostname | mail.service.ts |
| `SMTP_PORT` | No | 587 | SMTP port | mail.service.ts |
| `SMTP_USER` | No | `test_user` | SMTP username | mail.service.ts |
| `SMTP_PASS` | No | `test_pass` | SMTP password | mail.service.ts |

### Amazon Ads Integration

| Variable | Required* | Default | Description | Used In |
|----------|-----------|---------|-------------|---------|
| `AMAZON_ADS_CLIENT_ID` | Yes* | — | Amazon Ads OAuth client ID | ads.controller.ts |
| `AMAZON_ADS_CLIENT_SECRET` | Yes* | — | Amazon Ads OAuth secret | ads.controller.ts |
| `AMAZON_ADS_REDIRECT_URI` | Yes* | — | OAuth callback URL | ads.controller.ts |

*Required only if Amazon Ads integration is used.

## Frontend Environment Variables (Build-time)

| Variable | Required | Description | Used In |
|----------|----------|-------------|---------|
| `VITE_API_BASE_URL` | Yes | Backend API URL | lib/api.ts |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID | AuthContext, Login |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key | CheckoutPage |

**Important:** These are baked into the frontend build at compile time. Changing them requires a rebuild.

## Configuration Sources

| Source | Environment | Priority |
|--------|-------------|----------|
| `.env` file | Local development | Base values |
| `docker-compose.yml` | Docker development | Overrides .env |
| GitHub Secrets | CI/CD | Build-time injection |
| ECS Task Definition | Production/Staging | Runtime values |
| System Config (DB) | All | Application-level config |

## Template Files

| File | Description |
|------|-------------|
| `.env.example` | Root-level template |
| `backend/.env.example` | Backend-specific template (localhost defaults) |
| `frontend/.env.example` | Frontend-specific template |

---

## Issues Found

1. **No centralized env var documentation** — Until this document, environment variables were spread across multiple `.env.example` files with no single reference.
2. **Multiple sources of truth** — VITE variables appear in `.env.example`, `docker-compose.yml`, task definitions, and CI/CD workflow, leading to potential inconsistencies.
3. **Dangerous defaults** — `REDIS_URL` defaults to `localhost:6379` and SMTP defaults to ethereal email. In production, these defaults would silently fail or connect to the wrong service.
4. **No startup validation** — The application doesn't validate required environment variables at startup, leading to cryptic runtime errors.
5. **Example values are insecure** — `.env.example` uses `mypassword`, `SECRET`, and similar weak values.
6. **No distinction between required and optional** — Template files don't clearly mark which variables are required for the application to function.
7. **Secrets in task definitions** — ECS task definitions contain actual secret values instead of using AWS Secrets Manager references.
8. **`CORS_ORIGINS` not documented** — The expected format (comma-separated URLs) and behavior when empty are not documented in any template.
