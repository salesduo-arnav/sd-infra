# Backend Configuration

## Overview

Backend configuration is managed through three config modules: database (Sequelize/PostgreSQL), Redis, and superuser management. All configuration is driven by environment variables.

## 1. Database Configuration (`config/db.ts`)

### Sequelize Setup

| Setting | Value | Notes |
|---------|-------|-------|
| Dialect | PostgreSQL | Via Sequelize ORM |
| Host | `PGHOST` env var | Required |
| Port | `PGPORT` env var | Default: 5432 |
| Username | `PGUSER` env var | Required |
| Password | `PGPASSWORD` env var | Required |
| Database | `PGDATABASE` env var | Required |
| Logging | Disabled | `logging: false` |
| SSL | Production only | `rejectUnauthorized: false` |

### Functions

| Function | Description |
|----------|-------------|
| `sequelize` | Sequelize instance (default export) |
| `connectDB()` | Authenticate and test connection |
| `closeDB()` | Close database connection |

### Connection Failure
On connection failure, `connectDB()` logs the error and calls `process.exit(1)`.

## 2. Redis Configuration (`config/redis.ts`)

### Redis Client Setup

| Setting | Value | Notes |
|---------|-------|-------|
| URL | `REDIS_URL` env var | Default: `redis://localhost:6379` |
| Reconnect | Exponential backoff | `min(retries * 50, 2000)` ms |

### Functions

| Function | Description |
|----------|-------------|
| `redisClient` | Redis client instance |
| `connectRedis()` | Connect if not already open |
| `closeRedis()` | Disconnect if open |

### Event Handlers
- `error` — Logs error via Logger
- `connect` — Logs successful connection
- `reconnecting` — Logs reconnection attempt

## 3. Superuser Configuration (`config/superuser.ts`)

Manages platform superuser (admin) access via email whitelist.

### Functions

| Function | Description |
|----------|-------------|
| `getSuperuserEmails()` | Parse `SUPERUSER_EMAILS` env var into array |
| `isSuperuserEmail(email)` | Check if email is in the superuser list |

### Format
`SUPERUSER_EMAILS` is a comma-separated list of emails, compared case-insensitively.

```
SUPERUSER_EMAILS=admin@example.com,super@example.com
```

## Complete Environment Variable Reference

### Database (PostgreSQL)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PGHOST` | Yes | — | Database hostname |
| `PGPORT` | No | 5432 | Database port |
| `PGUSER` | Yes | — | Database username |
| `PGPASSWORD` | Yes | — | Database password |
| `PGDATABASE` | Yes | — | Database name |
| `NODE_ENV` | No | development | Environment (enables SSL in production) |

### Redis
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |

### Authentication
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth client ID |
| `SUPERUSER_EMAILS` | No | — | Comma-separated superuser email list |

### Stripe
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | Yes | — | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Stripe webhook signing secret |

### Email (SMTP)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | `smtp.ethereal.email` | SMTP server hostname |
| `SMTP_PORT` | No | 587 | SMTP server port |
| `SMTP_USER` | No | `test_user` | SMTP username |
| `SMTP_PASS` | No | `test_pass` | SMTP password |

### Amazon Ads
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AMAZON_ADS_CLIENT_ID` | Yes* | — | Amazon Ads OAuth client ID |
| `AMAZON_ADS_CLIENT_SECRET` | Yes* | — | Amazon Ads OAuth secret |
| `AMAZON_ADS_REDIRECT_URI` | Yes* | — | OAuth callback URL |

### Application
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `FRONTEND_URL` | Yes | `http://localhost:5173` | Frontend URL for links |
| `CORS_ORIGINS` | Yes | — | Comma-separated allowed origins |
| `LOG_LEVEL` | No | `debug`/`http` | Winston log level |

*Required only if Amazon Ads integration is used.

## Key Files

- `backend/src/config/db.ts` — Sequelize initialization
- `backend/src/config/redis.ts` — Redis client setup
- `backend/src/config/superuser.ts` — Superuser email management
- `backend/config/sequelize.config.js` — Sequelize CLI config
- `backend/.env.example` — Environment variable template

---

## Issues Found

- [x] **[ALREADY FIXED] SECURITY: SSL `rejectUnauthorized: false` in production** — The database SSL configuration disables certificate verification, making the connection vulnerable to man-in-the-middle attacks. Should use proper CA certificates or at least `rejectUnauthorized: true`.
- [x] **REDIS_URL defaults to localhost** — In production, if `REDIS_URL` is not set, the application silently connects to `localhost:6379` instead of failing with an error.
- [x] **No connection pooling configuration** — Sequelize uses default connection pool settings. For production workloads, `pool.max`, `pool.min`, `pool.idle`, and `pool.acquire` should be explicitly configured.
- [x] **`process.exit(1)` on DB connection failure** — Hard exit is not graceful for container orchestration. The container will restart but may lose in-flight requests.
- [x] **No Redis authentication** — The Redis client configuration doesn't explicitly handle password authentication. If the Redis instance requires a password, it must be included in the URL.
- [x] **No per-command timeout on Redis** — Individual Redis commands have no timeout, so a slow or unresponsive Redis server could block requests indefinitely.
- [x] **[SKIPPED] Superuser email list parsed on every call** — `getSuperuserEmails()` re-parses the environment variable on each invocation instead of caching the result. *(Skipped: Not needed)*
- [x] **[ALREADY FIXED] SMTP fallback credentials in production** — Mail service defaults to test credentials (`test_user`/`test_pass` at `smtp.ethereal.email`) if SMTP env vars are missing, which would silently fail to deliver emails in production.
- [x] **No validation of required env vars at startup** — The application doesn't validate that required environment variables are set before starting, leading to cryptic runtime errors.
- [x] **CORS_ORIGINS parsing** — If `CORS_ORIGINS` is not set, `allowedOrigins` becomes an empty array, which may block all cross-origin requests without a clear error.
