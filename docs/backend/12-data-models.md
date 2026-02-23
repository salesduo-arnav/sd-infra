# Data Models & Associations

## Overview

The backend uses Sequelize ORM with PostgreSQL. All models use UUID primary keys (except Role which uses auto-increment) and support soft deletes via `paranoid: true` (adds `deleted_at` column). Model associations are defined centrally in `models/index.ts`.

## Entity Relationship Diagram

```
User ───M:M──> Organization         (via OrganizationMember)
  |                |
  |                |──1:M──> Subscription ──M:1──> Plan
  |                |                       ──M:1──> Bundle
  |                |──1:M──> IntegrationAccount
  |                |──1:M──> GlobalIntegration
  |                |──1:M──> OrganizationEntitlement
  |                |──1:M──> OneTimePurchase
  |                |──1:M──> Invitation
  |                └──1:M──> ToolUsage
  |
  └──1:M──> AuditLog (as actor)

Role ───M:M──> Permission           (via RolePermission)
  └──1:M──> OrganizationMember

Tool ──1:M──> Plan ──1:M──> PlanLimit ──M:1──> Feature
  |              └──M:M──> Bundle    (via BundlePlan)
  └──1:M──> Feature
  └──1:M──> ToolUsage

BundleGroup ──1:M──> Bundle

SystemConfig (standalone key-value store)
```

## Model Summary

| Model | PK Type | Soft Delete | Key Relationships |
|-------|---------|-------------|-------------------|
| User | UUID | Yes | M:M Organization, 1:M AuditLog |
| Organization | UUID | Yes | M:M User, 1:M Subscription/Integration/Entitlement |
| OrganizationMember | UUID | Yes | Belongs to User, Organization, Role |
| Role | INTEGER (auto) | No | M:M Permission, 1:M OrganizationMember |
| Permission | STRING | No | M:M Role |
| RolePermission | Composite | No | Junction for Role-Permission |
| Tool | UUID | Yes | 1:M Plan, Feature, ToolUsage |
| Feature | UUID | Yes | Belongs to Tool, 1:M PlanLimit, OrganizationEntitlement |
| Plan | UUID | Yes | Belongs to Tool, 1:M PlanLimit, M:M Bundle |
| PlanLimit | UUID | Yes | Belongs to Plan, Feature |
| Bundle | UUID | Yes | Belongs to BundleGroup, M:M Plan |
| BundlePlan | Composite | Yes | Junction for Bundle-Plan |
| BundleGroup | UUID | Yes | 1:M Bundle |
| Subscription | UUID | Yes | Belongs to Organization, Plan, Bundle |
| OneTimePurchase | UUID | Yes | Belongs to Organization, Plan/Bundle |
| OrganizationEntitlement | UUID | Yes | Belongs to Organization, Tool, Feature |
| IntegrationAccount | UUID | Yes | Belongs to Organization |
| GlobalIntegration | UUID | Yes | Belongs to Organization |
| ToolUsage | UUID | No | Belongs to Tool, User, Organization |
| Invitation | UUID | Yes | Belongs to Organization, Role |
| AuditLog | UUID | No | Belongs to User (actor) |
| SystemConfig | STRING (key) | No | Standalone |

## Cascade Delete Hooks

Several models implement `afterDestroy` hooks for cascade deletion:

### User → OrganizationMember
When a user is deleted, all their organization memberships are destroyed.

### Organization → Invitation, Subscription, OrganizationEntitlement, OneTimePurchase
When an organization is deleted, all related records are soft-deleted.

### Tool → Feature, Plan, OrganizationEntitlement
When a tool is deleted, all features, plans, and entitlements are destroyed. Plans use `individualHooks: true` to trigger their own cascades.

### Plan → PlanLimit, BundlePlan
When a plan is deleted, its feature limits and bundle associations are destroyed.

### Feature → PlanLimit, OrganizationEntitlement
When a feature is deleted, its plan limits and entitlements are destroyed.

### Bundle → BundlePlan
When a bundle is deleted, its plan associations are destroyed.

## Partial Unique Indexes

Several models use partial unique indexes that exclude soft-deleted records:

```sql
-- Example: Tool slug uniqueness (only for non-deleted records)
CREATE UNIQUE INDEX tools_slug_unique ON tools (slug) WHERE deleted_at IS NULL;
```

Models with partial unique indexes: User (email), Tool (slug), Feature (slug), Bundle (slug), BundleGroup (slug)

## Key Files

- `backend/src/models/index.ts` — Central association definitions
- `backend/src/models/*.ts` — Individual model files (23 total)
- `backend/src/models/enums.ts` — Shared enum definitions

---

## Issues Found

1. ~~**Enum inconsistency** — `InvitationStatus` is defined in `invitation.ts` and `OrgStatus` in `organization.ts`, while other enums (`PriceInterval`, `TierType`, `SubStatus`, `FeatureType`, `FeatureResetPeriod`) are in `enums.ts`. Should be centralized.~~
2. ~~**Cascade hooks use dynamic imports** — `afterDestroy` hooks use `await import()` to avoid circular dependencies. This is fragile — if any import fails, the cascade is partial and no transaction rollback occurs.~~
3. ~~**No transaction in cascade hooks** — Cascade deletions in `afterDestroy` hooks don't run inside the caller's transaction. A failure mid-cascade leaves the database in an inconsistent state.~~
4. ~~**`password_hash` can be null** — The User model allows null `password_hash`, which is needed for OAuth-only users but not explicitly documented or validated.~~
5. **Role.id is auto-increment** — Using auto-increment integers for roles makes IDs environment-dependent and fragile for test data. (Already done)
6. **`is_active` on OrganizationMember is redundant** — Soft delete (`deleted_at`) already handles deactivation. The `is_active` boolean creates ambiguity. (Not needed)
7. **BundlePlan uses paranoid mode unnecessarily** — As a pure junction table, soft deletes add complexity without clear benefit. (Not needed)
8. **`OneTimePurchase` lacks plan/bundle validator** — Unlike Subscription, which validates that either `plan_id` or `bundle_id` is set, `OneTimePurchase` has no such validation. (Already completed)
9. **`stripe_subscription_id` not unique** — The Subscription model doesn't enforce uniqueness on this field. (Already completed)
10. **Credentials stored as plaintext JSONB** — `IntegrationAccount` and `GlobalIntegration` store sensitive OAuth tokens without encryption. (Already completed)
11. ~~**AuditLog lacks indexes** — No indexes on `(entity_type, entity_id)` or `created_at` for efficient querying. ~~
12. ~~**`usage_amount` can go negative** — `OrganizationEntitlement.usage_amount` has no minimum value constraint.~~
13. ~~**`tool_usage.count` increment logic undocumented** — How the count field is incremented (findOrCreate + increment) is not clear from the model definition alone.~~
14. ~~**Feature lacks `feature_type` field** — The `FeatureType` enum exists in `enums.ts` but there's no `feature_type` column on the Feature model to use it.~~
15. **`system_config` values are untyped** — All config values are stored as TEXT with no schema or type validation. (Not needed)
