# Admin UI

## Overview

The admin UI provides platform-wide management for superusers. Accessible at `/admin/*` routes, protected by the `AdminRoute` wrapper which checks the `is_superuser` flag.

## Pages

### AdminDashboard (`/admin`)
Platform overview with KPI cards and charts:
- **Stats cards:** Total users, organizations, active subscriptions, MRR
- **Charts:** User growth (line), tool usage (bar), revenue trend (line)
- Uses React Query for data fetching

### AdminApps (`/admin/apps`)
Tool/app management:
- Create, edit, delete tools
- Manage features per tool
- Configure required integrations
- Set trial periods (days, card required)
- DataTable with pagination and search
- Slug auto-generation from name

### AdminPlans (`/admin/plans`)
Plan and bundle hierarchy management:
- **Plans tab:** Create/edit plans with tiers, prices, currencies
- **Bundles tab:** Create/edit bundles grouping multiple plans
- **Bundle Groups:** Organize bundles into display groups
- **Plan Limits:** Configure feature limits per plan
- Plan-to-bundle associations
- Stripe product/price creation

### AdminUsers (`/admin/users`)
User management:
- List all users with pagination and search
- Delete users (with cascade checks for org ownership)
- Send email to users
- View user's organizations
- Self-deletion prevention

### AdminOrganizations (`/admin/organisations`)
Organization oversight:
- List organizations with status and member counts
- View org details with member list
- Edit organization details
- Delete organizations
- Pagination on member lists

### AuditLogs (`/admin/audit-logs`)
Audit trail viewer:
- Filter by action category, entity type, date range
- Search across actor, action, entity
- View detailed JSON payload per entry
- Grouped action categories
- Date/time range picker

### AdminConfigs (`/admin/configs`)
System configuration:
- Display configs grouped by category
- Edit individual config values
- Save with immediate effect

## Components

### Admin Components (`components/admin/`)

| Component | Description |
|-----------|-------------|
| `OverviewChart.tsx` | Recharts-based chart for dashboard |
| `StatsCard.tsx` | KPI card with growth indicator |

## Data Fetching

All admin pages use React Query for server state:
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['admin-stats'],
  queryFn: () => adminService.getOverviewStats()
});
```

## Key Files

- `frontend/src/pages/admin/AdminDashboard.tsx`
- `frontend/src/pages/admin/AdminApps.tsx`
- `frontend/src/pages/admin/AdminPlans.tsx`
- `frontend/src/pages/admin/AdminUsers.tsx`
- `frontend/src/pages/admin/AdminOrganizations.tsx`
- `frontend/src/pages/admin/AuditLogs.tsx`
- `frontend/src/pages/admin/AdminConfigs.tsx`
- `frontend/src/components/admin/overview/`
- `frontend/src/services/admin.service.ts`

---

## Issues Found

1. ~~**No error handling on dashboard** — React Query errors are not displayed to the user. Queries fail silently.~~
2. ~~**No skeleton loaders** — Dashboard uses `Array(4).fill(0).map()` for stat cards but no skeleton implementation for loading states.~~
3. **Hard-coded chart colors** — Colors like `#2563eb` are hardcoded instead of using theme variables. (Skipping as not needed right now)
4. **No data refresh button** — Stale data is cached with no manual refresh option. (Can refresh the page, so new buttons not needed)
5. **Bundle slug uses `Math.random()`** — Auto-generated slugs use `Math.random().toString(36)` which is non-deterministic and bad for SEO. (Skipping as not needed right now)
6. ~~**No input validation on plan creation** — Can create plans with empty names.~~
7. **Plan deletion without confirmation** — Some delete actions lack confirmation dialogs. (Checked, it has confirmation dialogs)
8. ~~**DataTable search not debounced** — Every keystroke in search triggers a new API call.~~
9. ~~**Action categories hardcoded** — Audit log action categories are hardcoded in the frontend instead of being fetched from the backend.~~
10. **JSON payload not syntax highlighted** — Audit log details show raw JSON in a code block without syntax highlighting. (Skipping as not needed right now)
11. **No CSV/PDF export** — Audit logs and user lists cannot be exported. (Skipping as not needed right now)
12. ~~**409 conflict handling incomplete** — AdminUsers shows conflicting orgs on 409 but doesn't handle edge cases.~~
13. ~~**Config values treated as strings** — No type coercion for numeric or boolean configuration values.~~
14. **No undo/reset for configs** — Config changes take effect immediately with no way to revert. (Skipping as not needed right now)
15. **Currency hardcoded to USD** — Plan creation has no easy way to add new currencies. (Already solved)
16. ~~**Duplicate `setState` calls** — Multiple loading state setter calls, some unreachable, in AdminPlans.~~
