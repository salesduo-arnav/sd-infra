# Organization Management

## Overview

Organizations are the primary tenant unit in the platform. Every user belongs to one or more organizations, and all billing, subscriptions, integrations, and tool usage are scoped to an organization. Organizations support multi-member teams with role-based access.

## Data Model

### Organization

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | STRING | Organization name |
| slug | STRING | URL-friendly identifier (unique, partial index with soft delete) |
| website | STRING | Optional website URL |
| stripe_customer_id | STRING | Stripe customer ID for billing |
| billing_email | STRING | Email for billing communications |
| tax_id | STRING | Tax identification number |
| status | ENUM | `active`, `suspended`, `archived` |

### OrganizationMember

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| user_id | UUID | FK to User |
| role_id | INTEGER | FK to Role |
| is_active | BOOLEAN | Active status |
| joined_at | DATE | Join date |

## Endpoints

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/organizations` | Yes | — | Create organization with optional bulk invites |
| GET | `/organizations/my` | Yes | Member | Get current organization (from x-organization-id) |
| GET | `/organizations/:id/members` | Yes | Member | List org members with pagination |
| PUT | `/organizations/:id` | Yes | Owner | Update organization details |
| DELETE | `/organizations/:id/members/:memberId` | Yes | Admin+ | Remove member |
| PUT | `/organizations/:id/members/:memberId/role` | Yes | Owner | Change member role |
| POST | `/organizations/:id/ownership` | Yes | Owner | Transfer ownership |
| DELETE | `/organizations/:id` | Yes | Owner | Delete organization |

## Organization Creation Flow

1. User provides organization name and optional website
2. Slug auto-generated from name (with random suffix for uniqueness)
3. Organization created with user as Owner
4. Optional: bulk invitations sent to provided email addresses
5. Audit log entry created

## Organization Context

The `x-organization-id` HTTP header is used to identify the active organization for each request. The `resolveOrganization` middleware:
1. Reads the header value
2. Loads the organization from the database
3. Loads the user's membership and role
4. Attaches `req.organization` and `req.membership` to the request

## Cascade Delete Behavior

When an organization is deleted (soft delete), the `afterDestroy` hook cascades to:
- Invitations (soft delete)
- Subscriptions (soft delete)
- OrganizationEntitlements (soft delete)
- OneTimePurchases (soft delete)

## Key Files

- `backend/src/controllers/organization.controller.ts` — Organization CRUD and member management
- `backend/src/models/organization.ts` — Organization and OrganizationMember models
- `backend/src/middlewares/organization.middleware.ts` — Organization context middleware
- `backend/src/routes/organization.routes.ts` — Route definitions

---

## Issues Found

1. ~~**Duplicate audit log** — The `createOrganization` handler logs `CREATE_ORGANIZATION` twice (two separate `AuditService.log` calls at lines ~96-112).~~
2. ~~**Bulk invitations are fire-and-forget** — When creating an organization with invites, invitation errors are silently swallowed. The user is not notified if some invitations fail to send.~~
3. ~~**No email validation on invites** — The invite emails array passed during creation is not validated for proper email format.~~
4. ~~**Slug can be excessively long** — Slug generation appends a random string to the org name, with no length limit enforced.~~
5. **No minimum owner check on member removal** — `removeMember` does not verify that at least one Owner remains after removal, potentially leaving an organization ownerless.
(Skipped as this check already exists)
6. **Missing UUID validation** — `transferOwnership` does not validate that `new_owner_id` is a valid UUID format before querying.
(Not needed, check already there)
7. ~~**OrgStatus enum defined in model file** — The `OrgStatus` enum is defined in `organization.ts` instead of the centralized `enums.ts` file, breaking consistency with other enums.~~
8. **Cascade delete uses dynamic imports** — The `afterDestroy` hook uses multiple dynamic `import()` calls which could partially fail, leaving the cascade incomplete without transaction rollback.
(Not Needed)
9. **`is_active` field redundancy** — OrganizationMember has both `is_active` and soft delete (`deleted_at`), creating ambiguity about which field determines active membership.
(Skipped as in RBAC)
