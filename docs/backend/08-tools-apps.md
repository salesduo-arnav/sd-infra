# Tools / Apps Module

## Overview

Tools (also called Apps) represent the billable products in the platform. Each tool can have associated plans, features, feature limits, and required integrations. Tool usage is tracked per user, per organization, per day.

## Data Models

### Tool

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | STRING | Tool display name |
| slug | STRING | URL-friendly identifier (unique with soft delete) |
| description | TEXT | Tool description |
| tool_link | STRING | External link to the tool |
| is_active | BOOLEAN | Whether the tool is available |
| trial_card_required | BOOLEAN | Whether credit card is required for trial |
| trial_days | INTEGER | Number of trial days |
| required_integrations | JSONB | Array of integration slugs needed |

### ToolUsage

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| tool_id | UUID | FK to Tool |
| user_id | UUID | FK to User |
| organization_id | UUID | FK to Organization |
| date | DATEONLY | Usage date |
| count | INTEGER | Usage count (default: 1) |

**Unique Constraint:** `(tool_id, user_id, organization_id, date)` — One record per user per tool per org per day.

## Relationships

```
Tool --1:M--> Plan --1:M--> PlanLimit --M:1--> Feature
Tool --1:M--> Feature
Tool --via Plan--> Bundle (through BundlePlan)
Tool --1:M--> OrganizationEntitlement
```

## Endpoints

### Public Tool Access

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tools` | No | Get all active tools |
| GET | `/tools/:slug` | No | Get tool by slug |

### Usage Tracking

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/tools/:id/usage` | Yes | Track tool usage (increment daily count) |

### Admin Tool Management

See [Admin Module](./06-admin-module.md) for full admin CRUD.

## Usage Tracking Flow

1. Frontend calls `POST /tools/:id/usage` when a tool is used
2. Backend extracts `organization_id` from `req.user.organization_id`
3. Uses `findOrCreate` with the unique constraint to get or create a daily record
4. Increments the `count` field
5. Returns updated usage record

## Cascade Delete Behavior

When a Tool is deleted (soft delete), the `afterDestroy` hook cascades to:
- All associated Features (with `individualHooks: false`)
- All associated Plans (with `individualHooks: true` — triggers Plan's own cascade)
- All associated OrganizationEntitlements

## Public Plan/Bundle API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/bundles` | No | Get active bundle groups with bundles and plans |
| GET | `/public/plans` | No | Get active plans with tools and limits |

These public endpoints are used for the pricing page and plan selection, accessible without authentication.

## Key Files

- `backend/src/controllers/tool.controller.ts` — Public tool endpoints and usage tracking
- `backend/src/controllers/public.plan.controller.ts` — Public plan/bundle listing
- `backend/src/models/tool.ts` — Tool model
- `backend/src/models/tool_usage.ts` — ToolUsage model
- `backend/src/routes/tool.routes.ts` — Tool route definitions
- `backend/src/routes/public.plan.routes.ts` — Public route definitions

---

## Issues Found

1. **Usage tracking uses `req.user.organization_id`** — The `trackToolUsage` handler extracts `organization_id` from the user object rather than the `x-organization-id` header. The User model doesn't guarantee this field exists, which could result in null organization tracking.
2. **UUID validation regex is case-sensitive** — The UUID validation regex in `trackToolUsage` doesn't account for uppercase hex characters, potentially rejecting valid UUIDs.
3. **No authentication on tool listing** — `getTools` and `getToolBySlug` are intentionally public, but this means tool catalog data is accessible without any rate limiting.
4. **`trial_card_required` and `trial_days` defaults unclear** — When these fields are not specified, the default behavior for trial eligibility is not documented.
5. **`required_integrations` accepts arbitrary strings** — No validation against known integration type slugs.
6. **Inconsistent cascade hooks** — `afterDestroy` uses `individualHooks: true` for Plan (to trigger Plan's cascade) but `individualHooks: false` for Feature. This inconsistency could lead to Feature's cascade hooks not firing.
7. **No date validation on ToolUsage** — Past dates are accepted for usage tracking, which could allow manipulation of usage records.
8. **No rollup/aggregation strategy** — Daily usage records accumulate indefinitely with no archival or aggregation for historical data.
9. **Public endpoints with deep includes** — The `/public/bundles` endpoint includes nested associations (BundleGroup -> Bundle -> Plan -> Tool -> Feature) which could cause N+1 queries in some Sequelize configurations.
10. **No tool deprecation mechanism** — There's no way to mark a tool as deprecated (different from inactive) to warn existing users while preventing new subscriptions.
