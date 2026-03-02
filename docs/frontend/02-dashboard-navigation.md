# Dashboard & App Navigation

## Overview

The main dashboard (`/apps`) displays available tools/apps as card tiles. Navigation is handled through a sidebar layout with a header, providing access to all major sections of the application.

## Pages

### Apps Dashboard (`Apps.tsx`)
The primary landing page after authentication. Displays:
- Grid of tool/app cards
- Quick stats widgets
- Active subscription indicators

### Layout Structure

```
+------------------+-------------------------------+
|                  |         Header                |
|    Sidebar       +-------------------------------+
|    (AppSidebar)  |                               |
|                  |         Page Content           |
|                  |                               |
+------------------+-------------------------------+
```

## Components

### Layout Components (`components/layout/`)

| Component | Description |
|-----------|-------------|
| `Layout.tsx` | Main layout wrapper with sidebar and header |
| `AppSidebar.tsx` | Navigation sidebar with menu items |
| `Header.tsx` | Top header with breadcrumbs and user menu |
| `UserMenu.tsx` | User dropdown with profile, org switch, logout |
| `SplitScreenLayout.tsx` | Two-column layout for auth pages |
| `NavLink.tsx` | Active-aware navigation link component |

### Dashboard Components (`components/dashboard/`)

| Component | Description |
|-----------|-------------|
| `AppCard.tsx` | Tool/app tile with icon, name, description |
| `QuickStats.tsx` | Summary statistics widgets |

## Navigation Structure

### Sidebar Menu Items
- **Apps** — `/apps` (main dashboard)
- **Plans** — `/plans` (plan selection)
- **Billing** — `/billing` (subscription management)
- **Integrations** — `/integrations` (marketplace connections)
- **Organisation** — `/organisation` (team management)
- **Profile** — `/profile` (user settings)

### Admin Menu (superusers only)
- **Dashboard** — `/admin`
- **Apps** — `/admin/apps`
- **Plans** — `/admin/plans`
- **Users** — `/admin/users`
- **Organizations** — `/admin/organisations`
- **Audit Logs** — `/admin/audit-logs`
- **Configs** — `/admin/configs`

## Key Files

- `frontend/src/pages/Apps.tsx` — Main dashboard page
- `frontend/src/components/layout/Layout.tsx` — Main layout
- `frontend/src/components/layout/AppSidebar.tsx` — Sidebar navigation
- `frontend/src/components/layout/Header.tsx` — Top header
- `frontend/src/components/layout/UserMenu.tsx` — User dropdown menu
- `frontend/src/components/dashboard/AppCard.tsx` — Tool card component
- `frontend/src/components/dashboard/QuickStats.tsx` — Stats widgets

---

## Issues Found

1. ~~**No error boundary** — The layout has no error boundary to catch rendering errors. A crash in any child component will unmount the entire layout.~~
2. ~~**No keyboard navigation** — Sidebar menu items lack keyboard accessibility (arrow key navigation, focus management).~~
3. ~~**No skeleton loaders** — Dashboard cards and stats show no loading skeleton while data is being fetched.~~
4. **No optimistic updates** — Navigation between pages always waits for data before rendering. (Skipping for now as added skeletons)
5. **Hard-coded navigation structure** — Sidebar menu items are hard-coded rather than driven by user permissions or feature flags. (It is driven by permission)
6. **No breadcrumb trail** — Header exists but breadcrumb navigation is minimal, making deep navigation unclear. (Breadcrumb trail is there)
