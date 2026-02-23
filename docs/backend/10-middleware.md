# Backend Middleware

## Overview

The backend uses four middleware layers for request processing: authentication, organization context resolution, HTTP logging, and global error handling. These are applied in a specific order in `app.ts`.

## Middleware Stack Order

```
Request
  --> helmet()                    # Security headers
  --> cors()                      # CORS handling
  --> webhookRoutes               # Raw body for Stripe (BEFORE express.json)
  --> express.json()              # JSON body parsing
  --> cookieParser()              # Cookie parsing
  --> morganMiddleware            # HTTP request logging
  --> Route handlers              # Auth/org middleware applied per-route
  --> errorHandler                # Global error handler (last)
```

## 1. Authentication Middleware (`auth.middleware.ts`)

### `authenticate(req, res, next)`
Validates the user's session on every authenticated request.

**Flow:**
1. Extract session token from HTTP-only cookie
2. Look up session in Redis (key: `session:<token>`)
3. If not found, clear cookie and return 401
4. Parse user ID from Redis value
5. Look up user in database by primary key
6. If user not found, clear cookie and return 401
7. Attach `req.user` to the request
8. Call `next()`

### `requireAdmin(req, res, next)`
Checks if the authenticated user has the `is_superuser` flag.

**Flow:**
1. Check `req.user.is_superuser`
2. If false, return 403
3. If true, call `next()`

## 2. Organization Middleware (`organization.middleware.ts`)

### `resolveOrganization(req, res, next)`
Loads the organization context from the `x-organization-id` header.

**Flow:**
1. Read `x-organization-id` header
2. If present, load organization and user's membership
3. If not present, fall back to user's first organization (by `joined_at ASC`)
4. Attach `req.organization` and `req.membership` (includes role) to request
5. Call `next()`

### `requireOrganization(req, res, next)`
Ensures an organization context exists on the request.

**Flow:**
1. Check if `req.organization` is set
2. If not, return 403
3. If yes, call `next()`

### `requireOwner(req, res, next)`
Checks if the user's role in the current organization is "Owner".

**Flow:**
1. Check `req.membership.role.name === 'Owner'`
2. If not, return 403
3. If yes, call `next()`

## 3. Morgan Middleware (`morgan.middleware.ts`)

HTTP request logging using the Morgan library.

**Format:** `:method :url :status :res[content-length] - :response-time ms`

**Output:** Logs to `Logger.http()` (Winston)

**Skip:** Always `false` — all requests are logged.

## 4. Error Handler (`error.ts`)

### `errorHandler(err, req, res, next)`
Global catch-all error handler, mounted as the last middleware.

**Flow:**
1. Log error stack trace via `Logger.error()`
2. Return 500 with error message

## Middleware Usage in Routes

```typescript
// Public routes — no auth
router.get('/public/plans', getPlans);

// Authenticated routes
router.get('/auth/me', authenticate, getMe);

// Organization-scoped routes
router.get('/billing/subscription', authenticate, resolveOrganization, requireOrganization, getSubscription);

// Owner-only routes
router.delete('/organizations/:id', authenticate, resolveOrganization, requireOwner, deleteOrganization);

// Admin routes
router.get('/admin/users', authenticate, requireAdmin, getUsers);
```

## Key Files

- `backend/src/middlewares/auth.middleware.ts` — Session authentication
- `backend/src/middlewares/organization.middleware.ts` — Organization context
- `backend/src/middlewares/morgan.middleware.ts` — HTTP logging
- `backend/src/middlewares/error.ts` — Global error handler

---

## Issues Found

- [x] **[ALREADY FIXED] No session binding to IP/User-Agent** — Sessions are not bound to the client's IP address or User-Agent, making them vulnerable to session hijacking/fixation attacks.
- [ ] **[SKIPPED] No CSRF token validation** — State-changing endpoints have no CSRF protection beyond CORS. *(SKIPPED: Existing mitigations in place - CORS, SameSite cookie)*
- [x] **Error handler exposes error messages** — The global error handler returns `error.message` to the client, which could leak internal implementation details.
- [x] **Error handler doesn't check `res.headersSent`** — If headers are already sent (e.g., streaming response), attempting to send a 500 response will cause `ERR_HTTP_HEADERS_ALREADY_SENT`.
- [x] **Error handler always returns 500** — No distinction between client errors (400-level) and server errors (500-level). All unhandled errors are treated as 500.
- [x] **Error stack logged in production** — Full stack traces are logged, which could expose sensitive file paths, environment variables, or code structure.
- [x] **[ALREADY FIXED] Organization fallback behavior** — When no `x-organization-id` header is provided, silently falling back to the first organization is surprising behavior that could lead to unintended data access.
- [x] **[ALREADY FIXED] `requireOwner` uses string comparison** — Checking `role.name === 'Owner'` is brittle. Renaming or localizing role names breaks access control.
- [x] **Morgan logs all requests including health checks** — The skip function always returns `false`, meaning `/health` endpoint polling generates excessive log noise.
- [x] **[ALREADY FIXED] `console.error` in organization middleware** — Uses `console.error` instead of the Logger utility, inconsistent with the rest of the codebase.
- [x] **[ALREADY FIXED] Race condition in auth middleware** — A user could be deleted between the Redis session lookup and the database user lookup, causing an unexpected state.
