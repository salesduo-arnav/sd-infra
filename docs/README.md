# SalesDuo Platform Documentation

## Backend

| # | Document | Description |
|---|----------|-------------|
| 1 | [Authentication](./backend/01-authentication.md) | Session-based auth, Google OAuth, OTP, password management |
| 2 | [RBAC System](./backend/02-rbac-system.md) | Roles, permissions, organization-level access control |
| 3 | [Organization Management](./backend/03-organization-management.md) | Multi-tenancy, members, org lifecycle |
| 4 | [Billing & Subscriptions](./backend/04-billing-subscriptions.md) | Stripe integration, plans, bundles, trials, checkout |
| 5 | [Invitation System](./backend/05-invitation-system.md) | Team invitations, acceptance flow, email delivery |
| 6 | [Admin Module](./backend/06-admin-module.md) | Platform admin: users, orgs, tools, plans, bundles, audit, stats, config |
| 7 | [Integrations](./backend/07-integrations.md) | Amazon Ads OAuth, SP-API, global integrations |
| 8 | [Tools / Apps](./backend/08-tools-apps.md) | Tool definitions, usage tracking, public API |
| 9 | [Webhooks](./backend/09-webhooks.md) | Stripe webhook handling and event processing |
| 10 | [Middleware](./backend/10-middleware.md) | Auth, organization context, logging, error handling |
| 11 | [Services](./backend/11-services.md) | Stripe, OTP, invitation, audit, mail services |
| 12 | [Data Models](./backend/12-data-models.md) | Sequelize models, associations, cascade behavior |
| 13 | [Migrations](./backend/13-migrations.md) | Database migrations, commands, conventions |
| 14 | [Utilities](./backend/14-utilities.md) | Logger, error handler, pagination, stats helpers |
| 15 | [Configuration](./backend/15-configuration.md) | Database, Redis, superuser config, full env var reference |

## Frontend

| # | Document | Description |
|---|----------|-------------|
| 16 | [Auth Flow](./frontend/01-auth-flow.md) | AuthContext, login/signup pages, session management |
| 17 | [Dashboard & Navigation](./frontend/02-dashboard-navigation.md) | App dashboard, sidebar, layout components |
| 18 | [Plans & Checkout](./frontend/03-plans-checkout.md) | Plan selection, cart, Stripe checkout |
| 19 | [Billing UI](./frontend/04-billing-ui.md) | Subscription management, invoices, portal |
| 20 | [Organization UI](./frontend/05-organization-ui.md) | Create, select, manage organizations |
| 21 | [Integrations UI](./frontend/06-integrations-ui.md) | OAuth flows, marketplace connections, onboarding |
| 22 | [Admin UI](./frontend/07-admin-ui.md) | Admin dashboard, management pages |
| 23 | [Services & API Layer](./frontend/08-services-api.md) | Axios client, interceptors, service modules |
| 24 | [Hooks & Utilities](./frontend/09-hooks-utilities.md) | Custom hooks, type definitions |
| 25 | [Route Protection](./frontend/10-route-protection.md) | PublicRoute, ProtectedRoute, AdminRoute guards |

## Infrastructure

| # | Document | Description |
|---|----------|-------------|
| 26 | [CI/CD Pipeline](./infrastructure/01-ci-cd-pipeline.md) | GitHub Actions, build, test, deploy workflow |
| 27 | [Docker & Local Dev](./infrastructure/02-docker-local-dev.md) | Docker Compose, Makefile, local development |
| 28 | [Gateway / Nginx](./infrastructure/03-gateway-nginx.md) | Reverse proxy, host-based routing |
| 29 | [Infrastructure Scripts](./infrastructure/04-infra-scripts.md) | AWS setup/teardown scripts |
| 30 | [ECS Task Definitions](./infrastructure/05-ecs-task-definitions.md) | Container configuration for AWS ECS |
| 31 | [Environment Variables](./infrastructure/06-environment-variables.md) | Complete env var reference across all services |

## Cross-Cutting

| # | Document | Description |
|---|----------|-------------|
| 32 | [API Reference](./cross-cutting/01-api-reference.md) | Complete REST API endpoint catalog |
| 33 | [Testing Patterns](./cross-cutting/02-testing-patterns.md) | Jest, Playwright, test conventions |
| 34 | [Error Handling](./cross-cutting/03-error-handling.md) | Backend/frontend error patterns and flow |

---

Every document includes an **Issues Found** section at the bottom identifying bugs, security concerns, missing validation, and improvement opportunities discovered during code review.
