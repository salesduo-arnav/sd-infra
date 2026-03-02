# Database Migrations

## Overview

Database migrations are managed using `sequelize-cli`. Migration files live in `backend/migrations/` and are executed automatically when the backend container starts (via `npm start` which runs `npx sequelize-cli db:migrate` before starting the server).

## Migration Runner Configuration

- **Config file:** `backend/config/sequelize.config.js` (referenced by `.sequelizerc`)
- **Migration path:** `backend/migrations/`
- **Execution:** `npx sequelize-cli db:migrate` (up) / `npx sequelize-cli db:migrate:undo` (down)
- **Test database:** `mydb_test` (separate database for testing)

## Migration History

Migrations are ordered chronologically by timestamp prefix:

| Migration | Description |
|-----------|-------------|
| `20260128104444-add_initial_users_table` | Create users table with UUID PK, email, password_hash, full_name, is_superuser |
| `20260130000000-create-rbac-org-tables` | Create organizations, organization_members, roles, permissions, role_permissions, invitations |
| `20260204173000-create-plan-features-tables` | Create tools, plans, features, plan_limits, bundles, bundle_groups, bundle_plans, subscriptions |
| `20260205xxxxxx-*` (multiple) | Constraint fixes, subscription fields, one-time purchases, tool usage |
| `20260206083056-add-deleted-at-*` | Add `deleted_at` columns for soft delete support |
| `20260207xxxxxx-*` | Integration accounts, global integrations, organization entitlements |
| `20260208xxxxxx-*` | System config, audit logs, additional fields |
| `20260209120000-add-deleted-at-to-billing-tables` | Soft deletes on billing tables |

## Creating New Migrations

```bash
cd backend
npm run migrate:create -- --name descriptive-migration-name
```

This creates a new file in `backend/migrations/` with the current timestamp prefix.

## Migration File Structure

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Forward migration (create tables, add columns, etc.)
  },
  down: async (queryInterface, Sequelize) => {
    // Reverse migration (drop tables, remove columns, etc.)
  }
};
```

## Commands

```bash
npm run migrate:up      # Run pending migrations
npm run migrate:down    # Undo last migration
```

## Production Considerations

- Migrations run automatically on container startup before the server starts
- `sequelize-cli` must be in `dependencies` (not `devDependencies`) for production builds
- SSL is enabled for production database connections (`rejectUnauthorized: false`)
- Database names should not contain hyphens (PostgreSQL restriction)

## Key Files

- `backend/migrations/` — All migration files
- `backend/config/sequelize.config.js` — Sequelize CLI configuration
- `backend/.sequelizerc` — Sequelize CLI path configuration
- `backend/package.json` — `migrate:up`, `migrate:down`, `migrate:create` scripts

---

## Issues Found

- [ ] **Soft delete columns added late** — The `deleted_at` columns were added in migration `20260206083056`, after models were already using `paranoid: true`. This means early data may have inconsistencies. *(Skipped: Database contains no production data, so early data inconsistency is a non-issue)*
- [ ] **Multiple constraint fix migrations** — Several migrations (20260205xxx) fix constraints from the initial schema, indicating the initial migration design had issues. *(Skipped: Current database schema is correct; no production data exists to need rewriting history)*
- [ ] **No rollback testing** — There are no tests verifying that `down` migrations work correctly. A failed rollback in production could be catastrophic. *(Skipped: Roll-forward is preferred, and without production data, down migrations are not needed)*
- [ ] **No seed data** — There are no seed scripts for default roles (Owner, Admin, Member), permissions, or initial system config values. *(Skipped: Multiple seed migrations have already been implemented previously)*
- [ ] **No data migration scripts** — Only schema migrations exist. If data transformations are needed, there's no established pattern. *(Skipped: We have no production data to transform yet. Can be implemented when needed)*
- [x] **SSL `rejectUnauthorized: false` in production** — The sequelize config uses `rejectUnauthorized: false` for SSL in production, which is vulnerable to man-in-the-middle attacks. Should use proper CA certificates.
- [x] **[ALREADY FIXED] Migrations run at startup** — Running migrations automatically at container startup can cause slow deployments and race conditions if multiple instances start simultaneously.
- [x] **[ALREADY FIXED] No migration locking** — If multiple containers start concurrently, they could both attempt to run migrations simultaneously, causing conflicts.
