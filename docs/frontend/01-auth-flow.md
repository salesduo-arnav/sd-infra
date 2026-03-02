# Frontend Auth Flow & Context

## Overview

The frontend authentication system is built around `AuthContext` which manages user state, organization selection, and session persistence. It supports email/password login, Google OAuth, and OTP-based authentication. Route protection is handled through wrapper components in `App.tsx`.

## AuthContext

The `AuthContext` provides global authentication state and actions to all components.

### State
| Field | Type | Description |
|-------|------|-------------|
| `user` | User \| null | Current authenticated user |
| `activeOrganization` | Organization \| null | Currently selected organization |
| `isAuthenticated` | boolean | Whether user has an active session |
| `isLoading` | boolean | Whether auth state is being loaded |

### Actions
| Action | Description |
|--------|-------------|
| `login(email, password, token?)` | Email/password login |
| `signup(email, password, full_name, token?)` | Register new account |
| `googleAuth(credential, token?)` | Google OAuth authentication |
| `logout()` | Destroy session |
| `setActiveOrganization(org)` | Switch active organization |
| `checkPendingInvites()` | Check for pending invitations |

### Organization Persistence
- `activeOrganizationId` is stored in `localStorage`
- On app load, if the user has a stored org ID, it's used to set the active organization
- The `x-organization-id` header is sent with every API request via Axios interceptor

## Route Protection

Three wrapper components in `App.tsx` control access:

### `PublicRoute`
- For unauthenticated pages (login, signup, forgot-password)
- Redirects authenticated users to `/apps` or org selection
- Supports `redirect` query parameter for external app integration

### `ProtectedRoute`
- Requires authentication
- Requires active organization
- If no organizations: redirects to `/create-organisation`
- If multiple organizations and none selected: redirects to `/choose-organisation`
- Auto-selects if user has exactly one organization

### `AdminRoute`
- Requires authentication + `is_superuser` flag
- Returns 404-like response if not superuser

## Pages

### Login (`Login.tsx`)
- Dual-mode: password or OTP
- Mode toggle button
- OTP flow: request → input → verify
- Pending invites check after auth
- Google OAuth button
- Redirect URL support

### SignUp (`SignUp.tsx`)
- Full name, email, password with confirmation
- Terms acceptance checkbox
- Email verification via OTP modal
- Password strength visual feedback
- Resend OTP capability
- Google OAuth alternative

### ForgotPassword (`ForgotPassword.tsx`)
- Email input form
- Shows success message regardless of email existence (prevents enumeration)
- Link back to login

### ResetPassword (`ResetPassword.tsx`)
- Token from URL query parameter
- New password + confirmation inputs
- Minimum 8 character validation
- Redirects to login on success

## Auth Components

| Component | Location | Description |
|-----------|----------|-------------|
| `AuthLayout` | `components/auth/AuthLayout.tsx` | Shared layout for auth pages |
| `GoogleButton` | `components/auth/GoogleButton.tsx` | Google OAuth sign-in button |
| `OtpInput` | `components/auth/OtpInput.tsx` | 6-digit OTP input component |

## Key Files

- `frontend/src/contexts/AuthContext.tsx` — Auth state management
- `frontend/src/App.tsx` — Route definitions and protection
- `frontend/src/pages/Login.tsx`, `SignUp.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`
- `frontend/src/components/auth/` — Auth-specific components
- `frontend/src/lib/api.ts` — Axios instance with auth interceptors

---

## Issues Found

- [x] **`window.location.href` used for navigation** — PublicRoute uses `window.location.href` for redirect, causing a full page reload instead of client-side navigation via React Router.
- [x] **No deep link preservation** — When unauthenticated users are redirected to login, the intended destination URL may be lost during the org selection flow.
- [ ] **[SKIPPED] Race condition on auth state** — If auth state changes during route evaluation (e.g., session expiry), users may see inconsistent UI. *(Skipped: Already handled, very rare case)*
- [ ] **[SKIPPED] No session refresh mechanism** — There's no refresh token or session renewal. Sessions expire after 24 hours with no warning. *(Skipped: Can change Cookie TTL if needed)*
- [x] **Missing OTP retry logic** — No visible rate limiting or retry count on the OTP resend button. Users can spam the resend button.
- [x] **OTP timeout not communicated** — No countdown timer or indication when the OTP expires.
- [x] **Password policy not enforced on frontend** — No minimum length, complexity, or strength requirements beyond the HTML `minLength=8` attribute.
- [x] **Terms links go nowhere** — SignUp links to `/terms` and `/privacy` which don't exist in the route definitions.
- [x] **Reset token visible in URL** — The password reset token remains in the browser URL/history, which could be a security concern on shared computers.
- [x] **`localStorage` not cleared on logout** — `activeOrganizationId` may persist in localStorage after logout, causing stale organization selection on next login.
- [x] **[ALREADY FIXED] Generic loading state** — App shows plain "Loading..." text during initial auth check, with no visual polish or skeleton UI.
