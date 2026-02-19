# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant SaaS platform (SalesDuo) with organization-based RBAC, Stripe billing, Google OAuth, and Amazon Ads integration. The repo is a simple monorepo with `backend/`, `frontend/`, `gateway/`, and `infra/` directories — no workspace tooling.

## Common Commands

### Development

```bash
# Full stack via Docker (frontend + backend + postgres + redis + nginx + logging)
make dev              # docker compose up --build -d
make down             # stop all containers
make logs             # docker compose logs -f

# Run backend and frontend manually (start DB/Redis first)
make dev-db           # start postgres + redis only
cd backend && npm run dev       # runs migrations then starts with nodemon
cd frontend && npm run dev      # vite dev server

# Install dependencies
make setup            # npm install for both backend and frontend
```

### Backend (run from `backend/`)

```bash
npm run build         # tsc compile to dist/
npm run lint          # eslint src
npm run test          # jest (uses PGDATABASE=mydb_test)
npm run migrate:up    # run pending migrations
npm run migrate:down  # undo last migration
npm run migrate:create -- --name migration-name
```

### Frontend (run from `frontend/`)

```bash
npm run build         # vite production build
npm run lint          # eslint
npm run test:e2e      # playwright tests
npm run test:e2e:ui   # playwright UI mode
```

## Architecture

### Backend (Express + TypeScript + Sequelize)

**Pattern:** Controller → Service → Model. Controllers handle HTTP + validation, services contain business logic, models are Sequelize definitions.

**Key files:**
- `src/app.ts` — Express app setup, route mounting, middleware ordering
- `src/models/index.ts` — All Sequelize model associations (the relationship graph)
- `src/config/db.ts` — Sequelize init (SSL enabled in production)
- `src/config/redis.ts` — Redis client setup

**Route prefix mapping** (from `app.ts`):
`/auth`, `/organizations`, `/invitations`, `/admin`, `/billing`, `/webhooks`, `/tools`, `/public`, `/integrations`, `/users`

**Important ordering in app.ts:** Webhook routes are mounted *before* `express.json()` because Stripe webhooks need the raw body.

**Authentication:** Session-based via Redis. Login creates a UUID session stored in Redis (24h TTL) and set as an HTTP-only cookie. Auth middleware (`middlewares/auth.middleware.ts`) validates the session against Redis + DB.

**Database:** PostgreSQL via Sequelize ORM. Migrations in `backend/migrations/` using sequelize-cli. Config in `backend/config/sequelize.config.js` (referenced by `.sequelizerc`). Models use soft deletes (`deleted_at`).

**Key domain models and relationships:**
- User ↔ Organization: many-to-many via OrganizationMember (which also holds role_id)
- Role ↔ Permission: many-to-many via RolePermission
- Tool → Plan → PlanLimit ← Feature (billing hierarchy)
- Bundle ↔ Plan: many-to-many via BundlePlan
- Organization → Subscription → Plan/Bundle
- Organization → IntegrationAccount, GlobalIntegration

### Frontend (React + Vite + TypeScript)

**UI:** Shadcn UI components (in `components/ui/`) built on Radix primitives + Tailwind CSS. Path alias `@/*` maps to `src/*`.

**State management:** AuthContext (`contexts/AuthContext.tsx`) for user/org state, React Query for server state, localStorage for `activeOrganizationId`.

**API layer:** Axios instance in `lib/api.ts` with `withCredentials: true`. Request interceptor adds `x-organization-id` header. Response interceptor handles errors and shows toast notifications.

**Route protection** (in `App.tsx`):
- `PublicRoute` — redirects authenticated users to `/apps`
- `ProtectedRoute` — requires auth + active organization, redirects to org creation/selection if needed
- `AdminRoute` — requires superuser status

**Services** (`services/*.ts`) encapsulate API calls by domain (admin, billing, integration, tool, public).

### Local Dev Networking

The nginx gateway (`gateway/nginx.conf`) routes by hostname:
- `api.lvh.me` → backend:3000 (production: `api.salesduo.com`)
- `app.lvh.me` → frontend:5173 (production: `app.salesduo.com`)

`lvh.me` resolves to 127.0.0.1 and is used for local development only.

### Infrastructure (AWS)

ECS on EC2 with ALB, RDS PostgreSQL 16, Redis. CI/CD via GitHub Actions (`.github/workflows/ci-cd.yaml`). Deploys on push to main/master/dev. Backend container runs migrations on startup.

## Conventions

- **Commit messages:** Conventional Commits format — `<type>(<scope>): <subject>` (e.g., `feat(auth): add google oauth login`, `fix(api): handle null user`)
- **Backend pattern:** Follow existing controller-service-model structure
- **Frontend UI:** Use existing Shadcn UI components from `components/ui/` before adding new ones

Don't use this - Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>