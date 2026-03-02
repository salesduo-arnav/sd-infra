# Admin Module

## Overview

The admin module provides platform-wide management capabilities restricted to superusers (`is_superuser = true`). It covers user management, organization oversight, tool/app configuration, plan and bundle management, feature definitions, system configuration, audit logging, and platform statistics.

All admin routes are prefixed with `/admin` and protected by both `authenticate` and `requireAdmin` middleware.

## Sub-Modules

### 1. Dashboard Statistics (`admin.stats.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/stats/overview` | Platform KPIs: total users, orgs, active subs, MRR, growth |
| GET | `/admin/stats/revenue-chart` | Monthly revenue aggregation (one-time purchases) |
| GET | `/admin/stats/user-growth-chart` | Monthly user registration counts |
| GET | `/admin/stats/tool-usage-chart` | Top 5 tools by usage |

**Metrics Calculated:**
- Total users, organizations, active subscriptions
- MRR (Monthly Recurring Revenue) from active subscriptions
- Month-over-month growth percentages
- One-time revenue total

### 2. User Management (`admin.user.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List all users with pagination/search |
| PUT | `/admin/users/:id` | Update user (superuser status, etc.) |
| DELETE | `/admin/users/:id` | Delete user (with org ownership safeguards) |

**Deletion Safeguards:**
- Cannot delete yourself
- If user is sole owner of orgs, returns 409 with list of affected organizations
- `force: true` parameter bypasses org ownership check

### 3. Organization Management (`admin.organization.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/organizations` | List organizations with member counts |
| GET | `/admin/organizations/:id` | Get org details with members and owner |
| PUT | `/admin/organizations/:id` | Update organization |
| DELETE | `/admin/organizations/:id` | Delete organization |

### 4. Tool/App Management (`admin.tool.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/tools` | List tools with pagination |
| GET | `/admin/tools/:id` | Get tool details with features |
| POST | `/admin/tools` | Create tool |
| PUT | `/admin/tools/:id` | Update tool |
| DELETE | `/admin/tools/:id` | Delete tool (checks active subscriptions) |

**Deletion Protection:** Before deleting a tool, the system checks for active subscriptions on:
- Plans directly associated with the tool
- Bundles that contain plans associated with the tool

### 5. Feature Management (`admin.feature.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/features` | List features with pagination |
| GET | `/admin/features/:id` | Get feature details |
| POST | `/admin/features` | Create feature (requires tool_id, name, slug) |
| PUT | `/admin/features/:id` | Update feature |
| DELETE | `/admin/features/:id` | Delete feature |

### 6. Plan Management (`admin.plan.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/plans` | List plans with pagination |
| GET | `/admin/plans/:id` | Get plan details with limits |
| POST | `/admin/plans` | Create plan with Stripe product/prices |
| PUT | `/admin/plans/:id` | Update plan (recalculates Stripe prices) |
| DELETE | `/admin/plans/:id` | Delete plan (checks subscriptions) |
| POST | `/admin/plans/:id/limits` | Upsert plan feature limit |
| DELETE | `/admin/plans/:id/limits/:featureId` | Delete plan feature limit |

**Stripe Integration:** Creating a plan automatically creates a Stripe product and price objects. Yearly prices are calculated as `monthly_price * 12`.

### 7. Bundle Management (`admin.bundle.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/bundle-groups` | List bundle groups |
| POST | `/admin/bundle-groups` | Create bundle group |
| PUT | `/admin/bundle-groups/:id` | Update bundle group |
| DELETE | `/admin/bundle-groups/:id` | Delete bundle group |
| GET | `/admin/bundles` | List bundles with pagination |
| GET | `/admin/bundles/:id` | Get bundle details with plans |
| POST | `/admin/bundles` | Create bundle with Stripe products |
| PUT | `/admin/bundles/:id` | Update bundle |
| DELETE | `/admin/bundles/:id` | Delete bundle (checks subscriptions) |
| POST | `/admin/bundles/:id/plans` | Add plan to bundle |
| DELETE | `/admin/bundles/:id/plans/:planId` | Remove plan from bundle |

### 8. System Configuration (`admin.config.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/config` | Get all system configurations |
| PUT | `/admin/config/:key` | Upsert a configuration value |

**Side Effects:** Updating `payment_grace_period_days` triggers a best-effort Stripe sync.

### 9. Audit Logs (`admin.audit.controller.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/audit-logs` | List audit logs with filters (action, entity, date, search) |
| GET | `/admin/audit-logs/:id` | Get audit log details |

**Filter Options:** action, entity_type, actor_id, start_date, end_date, search (across multiple fields)

## Key Files

- `backend/src/routes/admin.routes.ts` — All admin route definitions
- `backend/src/controllers/admin.*.controller.ts` — 8 admin controller files
- `backend/src/services/audit.service.ts` — Audit logging service

---

## Issues Found

- [x] **Stats queries have no caching** — Overview stats, revenue charts, and growth charts execute potentially expensive aggregate queries on every request with no caching layer.
- [ ] **[SKIPPED] Hard-coded limit of 5 in tool usage chart** — The top tools query is hard-coded to return only 5 results, with no option for the client to customize. *(Skipped: Hardcoded limit of 5 to keep the dashboard UI simple)*
- [ ] **[SKIPPED] MRR excludes trialing subscriptions** — The MRR calculation only includes `ACTIVE` subscriptions. Whether this is intentional should be explicitly documented. *(Skipped: Trialing subscriptions are not guaranteed revenue)*
- [x] **No input validation on config values** — `updateConfig` accepts any string value, with no schema validation. Invalid values (e.g., non-numeric string for `payment_grace_period_days`) could cause downstream failures.
- [ ] **[SKIPPED] Feature slug uniqueness is global** — Feature slugs are unique across the entire platform, not per-tool. Two tools cannot have features with the same slug, which may be restrictive. *(Skipped: We'll have unique slugs per tool)*
- [x] **No tool_id existence validation** — `createFeature` does not verify that the provided `tool_id` corresponds to an existing tool before creating the feature.
- [ ] **[SKIPPED] Yearly price is always monthly * 12** — Plan update/creation calculates yearly price as exactly `monthly_price * 12`, with no support for yearly discounts. *(Skipped: Intentional pricing model choice to avoid complex discounting logic currently)*
- [ ] **[SKIPPED] Orphaned Stripe prices** — When updating a plan's price, new Stripe price objects are created but the old ones are never archived/deactivated. *(Skipped: Being handled in another module)*
- [ ] **[SKIPPED] Bundle slug checked globally** — Bundle slug uniqueness is enforced globally, not per-bundle-group. This may or may not be intentional. *(Skipped: Same as before)*
- [ ] **[SKIPPED] Config upsert always succeeds** — Even if the Stripe side-effect fails, the config update is committed. There's no transactional consistency. *(Skipped: Stripe doesnt allow)*
- [ ] **[SKIPPED] Audit log retention unbounded** — No log retention policy or cleanup mechanism. Audit logs will grow indefinitely. *(Skipped: We can add crons for deleting audits later as audits grow)*
- [x] **Date range filter doesn't validate input** — Audit log date range filters pass raw strings to `new Date()` without format validation.
- [x] **Plan deletion without active subscription check on bundles** — While direct plan subscription checks exist, the check for plans within bundles could miss edge cases with nested deletions.
