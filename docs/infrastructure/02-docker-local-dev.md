# Docker & Local Development

## Overview

Local development uses Docker Compose to orchestrate the full stack: Nginx gateway, PostgreSQL, Redis, backend, frontend, and optional monitoring (Loki, Promtail, Grafana). The `Makefile` provides convenience commands.

## Docker Compose Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `gateway` | nginx:alpine | 80 | Reverse proxy (routes by hostname) |
| `db` | postgres:16-alpine | 5432 | PostgreSQL database |
| `redis` | redis:alpine | 6379 | Session storage and caching |
| `backend` | Custom (Dockerfile) | 3000 | Express API server |
| `frontend` | Custom (Dockerfile) | 5173→8080 | Vite/nginx SPA |
| `loki` | grafana/loki:latest | 3100 | Log aggregation |
| `promtail` | grafana/promtail:latest | — | Log shipping |
| `grafana` | grafana/grafana:latest | 4000 | Monitoring dashboard |

## Networking

All services communicate on the `app-network` Docker bridge network. External access uses `lvh.me` (resolves to 127.0.0.1):

- `http://app.lvh.me` → frontend (via gateway)
- `http://api.lvh.me` → backend (via gateway)
- `http://localhost:4000` → Grafana (direct)

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | `docker compose up --build -d` — Start full stack |
| `make down` | `docker compose down` — Stop all services |
| `make logs` | `docker compose logs -f` — Tail all logs |
| `make dev-db` | Start only PostgreSQL and Redis |
| `make setup` | `npm install` for backend and frontend |
| `make prune` | Docker system prune |

## Local Development Without Docker

For faster iteration, you can run backend and frontend natively:

```bash
# Start only database and Redis
make dev-db

# In terminal 1: Backend
cd backend && npm run dev    # nodemon with auto-restart

# In terminal 2: Frontend
cd frontend && npm run dev   # Vite dev server with HMR
```

## Volume Mounts

| Volume | Purpose |
|--------|---------|
| `pgdata` | PostgreSQL persistent data |
| `grafana-storage` | Grafana dashboard persistence |
| Docker socket mount | Promtail reads container logs |

## Health Checks

| Service | Check |
|---------|-------|
| PostgreSQL | `pg_isready -U postgres` (interval: 10s, retries: 5) |

## Environment Variables

Environment variables are loaded from `.env` at the project root. See `backend/.env.example` and `frontend/.env.example` for templates.

## Key Files

- `docker-compose.yml` — Full stack definition
- `docker-compose.ci.yml` — CI override (test database only)
- `Makefile` — Development convenience commands
- `backend/Dockerfile` — Backend build
- `frontend/Dockerfile` — Frontend build
- `.env.example` — Environment variable template

---

## Issues Found

1. **Grafana credentials hardcoded** — `GF_SECURITY_ADMIN_USER=admin` and `GF_SECURITY_ADMIN_PASSWORD=admin` are hardcoded in `docker-compose.yml`. Should use environment variables.
2. **No restart policies** — Only Redis has `restart: always`. Other services (especially the database) lack restart policies.
3. **No resource limits** — No CPU or memory limits defined for any container. A runaway process could consume all host resources.
4. **Frontend port mapping confusing** — Maps `5173:8080` — external port 5173 but internal nginx serves on 8080, which can confuse developers.
5. **Makefile is minimal** — Missing common targets: `make test`, `make lint`, `make build`, `make clean`.
6. **No health checks for backend/frontend** — Only PostgreSQL has a health check. Backend and frontend containers have no health verification.
7. **`lvh.me` dependency** — Local development requires `lvh.me` DNS resolution, which may fail on restricted networks or VPNs.
8. **Example passwords too simple** — `.env.example` uses `mypassword` and `SECRET`, setting a bad example for development practices.
9. **No documentation of required vs optional env vars** — Developers must guess which variables are required to start the application.
10. **Monitoring stack always starts** — Loki, Promtail, and Grafana start with every `make dev`, even if not needed, consuming resources.
