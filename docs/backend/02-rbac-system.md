# RBAC (Role-Based Access Control) System

## Overview

The platform implements a role-based access control system at the organization level. Users are assigned roles within organizations, and roles have associated permissions. Access control is enforced through middleware that checks role names and, in some cases, specific permissions.

## Data Model

```
User ──M:M──> Organization  (via OrganizationMember, which holds role_id)
Role ──M:M──> Permission    (via RolePermission)
```

### Role

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER (auto-increment) | Primary key |
| name | STRING (unique) | Role name (e.g., "Owner", "Admin", "Member") |
| description | TEXT | Human-readable description |

### Permission

| Field | Type | Description |
|-------|------|-------------|
| id | STRING | Permission identifier (e.g., "org.update", "members.invite") |
| description | TEXT | Human-readable description |
| category | STRING | Grouping category |

### RolePermission (Junction Table)

| Field | Type | Description |
|-------|------|-------------|
| role_id | INTEGER | FK to Role |
| permission_id | STRING | FK to Permission |

### OrganizationMember

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| user_id | UUID | FK to User |
| role_id | INTEGER | FK to Role |
| is_active | BOOLEAN | Active status |
| joined_at | DATE | When the user joined |

## Built-in Roles

The system recognizes three role levels by name:
- **Owner** — Full control, can transfer ownership, delete organization
- **Admin** — Can manage members, send invitations
- **Member** — Basic access to organization resources

## Middleware Enforcement

### `resolveOrganization`
Reads `x-organization-id` from request header, loads the organization and the user's membership (including role). Falls back to the user's first organization if no header is provided.

### `requireOrganization`
Ensures an organization context is set on the request. Returns 403 if no organization is resolved.

### `requireOwner`
Checks that the authenticated user's role name is "Owner". Used on destructive or administrative operations.

### `requireAdmin` (Superuser)
Separate from org RBAC — checks `is_superuser` flag on the User model. Used for platform-wide admin routes (`/admin/*`).

## Access Control Matrix

| Operation | Required Role |
|-----------|--------------|
| View organization | Any member |
| Update organization | Owner |
| Delete organization | Owner |
| Invite members | Admin, Owner |
| Remove members | Admin, Owner |
| Change member role | Owner |
| Transfer ownership | Owner |
| Platform admin routes | Superuser (is_superuser flag) |

## Key Files

- `backend/src/models/role.ts` — Role, Permission, RolePermission models
- `backend/src/models/organization.ts` — Organization, OrganizationMember models
- `backend/src/middlewares/organization.middleware.ts` — Org context and role enforcement
- `backend/src/middlewares/auth.middleware.ts` — `requireAdmin` (superuser check)

---

## Issues Found

1. **Role checking is string-based** — `requireOwner` checks `role.name === 'Owner'` which is brittle. If the role name is changed or localized, access control breaks. Should use role IDs or a dedicated role type enum.
2. **No default roles seeded** — There is no migration or seed script to create the default Owner/Admin/Member roles. They must be created manually or by application logic.
3. **Role.id is auto-increment** — Using auto-increment IDs for roles makes test data inconsistent across environments. Consider using fixed UUIDs or string identifiers.
4. **Permission model exists but is unused** — The Permission and RolePermission tables exist but no middleware actually checks individual permissions. Access control is entirely role-name-based (coarse-grained).
5. **No permission validation on most routes** — Beyond `requireOwner` and `requireAdmin`, there is no fine-grained permission checking. For example, member invitation only checks if the user is an Admin/Owner by implication, not by explicit permission.
6. **`is_active` on OrganizationMember is redundant** — The soft delete pattern (`deleted_at`) already handles membership deactivation. The `is_active` boolean adds confusion about which field is authoritative.
7. **No audit trail for role/permission changes** — Changes to roles or role assignments are not logged to the audit system.
8. **Fallback organization behavior** — When no `x-organization-id` header is provided, the middleware falls back to the user's first organization (by `joined_at ASC`). This implicit behavior could cause confusion and unintended access.
9. **Organization middleware uses `console.error`** — Should use the Logger utility instead of `console.error` for consistency (line 52 of `organization.middleware.ts`).
