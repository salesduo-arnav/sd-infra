# Route Protection

## Overview

The frontend uses three route wrapper components to control access based on authentication state, organization membership, and superuser status. These are defined in `App.tsx` and wrap all page components.

## Route Guards

### `PublicRoute`
For pages that should only be visible to unauthenticated users.

**Behavior:**
- If user is **not authenticated**: renders the child component
- If user **is authenticated** with `redirect` param: navigates to the redirect URL
- If user **is authenticated** with organizations: redirects to `/apps`
- If user **is authenticated** without organizations: redirects to `/create-organisation`

**Used by:** `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/accept-invite`

### `ProtectedRoute`
For pages that require authentication and an active organization.

**Behavior:**
- If user is **not authenticated**: redirects to `/login`
- If user has **no organizations**: redirects to `/create-organisation`
- If user has **multiple orgs** and none selected: redirects to `/choose-organisation`
- If user has **exactly one org**: auto-selects it
- If user has **active organization**: renders the child component

**Used by:** `/apps`, `/plans`, `/billing`, `/checkout`, `/integrations`, `/profile`, `/organisation`, `/tools/*`

### `AdminRoute`
For platform administration pages restricted to superusers.

**Behavior:**
- If user is **not authenticated**: redirects to `/login`
- If user is **not superuser**: renders a 404-like response
- If user **is superuser**: renders the child component

**Used by:** `/admin`, `/admin/apps`, `/admin/plans`, `/admin/users`, `/admin/organisations`, `/admin/audit-logs`, `/admin/configs`

## Route Map

```
/                           → Redirect to /login
/login                      → PublicRoute → Login
/signup                     → PublicRoute → SignUp
/forgot-password            → PublicRoute → ForgotPassword
/reset-password             → PublicRoute → ResetPassword
/accept-invite              → PublicRoute → InviteAccepted

/apps                       → ProtectedRoute → Apps
/plans                      → ProtectedRoute → Plans
/billing                    → ProtectedRoute → Billing
/checkout                   → ProtectedRoute → CheckoutPage
/integrations               → ProtectedRoute → Integrations
/integration-onboarding     → ProtectedRoute → IntegrationOnboarding
/profile                    → ProtectedRoute → Profile
/organisation               → ProtectedRoute → Organisation
/create-organisation        → ProtectedRoute* → CreateOrganisation
/choose-organisation        → ProtectedRoute* → ChooseOrganisation
/pending-invites            → ProtectedRoute* → PendingInvitations
/tools/listing-generator    → ProtectedRoute → ListingGenerator

/admin                      → AdminRoute → AdminDashboard
/admin/apps                 → AdminRoute → AdminApps
/admin/plans                → AdminRoute → AdminPlans
/admin/users                → AdminRoute → AdminUsers
/admin/organisations        → AdminRoute → AdminOrganizations
/admin/audit-logs           → AdminRoute → AuditLogs
/admin/configs              → AdminRoute → AdminConfigs

/design                     → DesignSystem (no guard)
/*                          → NotFound
```

*These routes have special handling to avoid infinite redirect loops (they're accessible even without an active organization).

## Key Files

- `frontend/src/App.tsx` — Route definitions and guard components

---

## Issues Found

1. **`/design` is unprotected** — The DesignSystem page is accessible without authentication. While it's a development tool, it could expose component structure in production. (Will remove in production)
2. **No 404 analytics** — The NotFound page logs to console but doesn't track unknown routes. (Tracking for 404 not needed currently)
3. ~~**Redirect loops possible** — Edge cases where ProtectedRoute redirects to `/create-organisation` which also uses ProtectedRoute could potentially loop.~~
4. **No route-level code splitting** — All pages are imported eagerly, increasing the initial bundle size. React.lazy() and Suspense should be used for route-level code splitting. (Not needed for now)
5. **No transition animations** — Route changes are instant with no transition effects. (Not needed for now)
6. **Admin routes return 404 for non-superusers** — Instead of showing "Access Denied", non-superusers see a 404, which hides the existence of admin pages (security through obscurity). (Not needed for now)
7. **`/accept-invite` is in PublicRoute** — But invitation acceptance requires authentication. The page handles both states internally, which adds complexity. (This is by design so we can show pending invites)
