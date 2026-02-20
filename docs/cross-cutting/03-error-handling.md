# Error Handling Patterns

## Overview

Error handling spans both the backend and frontend, with different strategies at each layer. The backend uses a centralized error handler middleware plus per-controller try/catch patterns. The frontend uses Axios response interceptors and toast notifications.

## Backend Error Handling

### Layer 1: Controller Try/Catch

Every controller action wraps its logic in try/catch and delegates to `handleError()`:

```typescript
export const createFeature = async (req: Request, res: Response) => {
  try {
    // ... business logic
  } catch (error) {
    handleError(res, error, 'Create Feature Error');
  }
};
```

### Layer 2: Error Utility (`utils/error.ts`)

The `handleError` function maps error types to HTTP status codes:

| Pattern | Status | Response |
|---------|--------|----------|
| `error.message` contains "not found" | 404 | Not found |
| `error.message === 'NOT_FOUND'` | 404 | Not found |
| `error.message === 'ALREADY_EXISTS'` | 400 | Already exists |
| `error.message === 'SLUG_EXISTS'` | 400 | Slug exists |
| `SequelizeUniqueConstraintError` | 400 | Duplicate entry |
| `error.message === 'HAS_ACTIVE_SUBSCRIPTIONS'` | 400 | Active subscriptions |
| Everything else | 500 | Internal error |

### Layer 3: Global Error Handler (`middlewares/error.ts`)

Catch-all middleware for unhandled errors:
```typescript
const errorHandler = (err, req, res, next) => {
  Logger.error(`${err.message}`, { stack: err.stack });
  res.status(500).json({ message: err.message || 'Internal Server Error' });
};
```

### Error Conventions

Controllers throw known error strings that are caught by `handleError`:
```typescript
// In controller/service
throw new Error('NOT_FOUND');
throw new Error('ALREADY_EXISTS');
throw new Error('SLUG_EXISTS');
throw new Error('HAS_ACTIVE_SUBSCRIPTIONS');

// Caught by handleError, mapped to appropriate HTTP status
```

## Frontend Error Handling

### Axios Response Interceptor (`lib/api.ts`)

Catches all HTTP errors globally:

| Status | Behavior |
|--------|----------|
| 401 | Redirect to `/login` (session expired) |
| 403 | Show "Access denied" toast |
| Other | Show `response.data.message` toast |

### Component-Level Error Handling

Most components use async/await with try/catch:
```typescript
try {
  await billingService.cancelSubscription(id);
  toast({ title: "Subscription cancelled" });
} catch (error) {
  toast({ title: "Error", description: error.message, variant: "destructive" });
}
```

### React Query Error Handling

Admin pages use React Query which has built-in error state:
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['admin-stats'],
  queryFn: () => adminService.getOverviewStats()
});
// Note: error state is often not rendered in the UI
```

## Error Flow

```
Backend Controller
  ├── Business logic error → throw Error('CODE') → handleError() → HTTP response
  ├── Sequelize error → handleError() → HTTP response
  └── Unhandled error → Global error handler → 500 response

Frontend
  ├── API response error → Axios interceptor → Toast notification
  ├── Component error → try/catch → Toast notification
  └── Render error → (no error boundary) → White screen
```

## Key Files

- `backend/src/utils/error.ts` — Error response formatter
- `backend/src/middlewares/error.ts` — Global error handler
- `frontend/src/lib/api.ts` — Axios error interceptor

---

## Issues Found

### Backend

1. **String-based error matching is fragile** — `handleError` checks `error.message` for substrings like "not found", which could produce false positives on messages that coincidentally contain these words.
2. **No custom error classes** — All errors use the generic `Error` class with string codes. Custom error classes (e.g., `NotFoundError`, `ValidationError`) would be more robust and type-safe.
3. **Global error handler exposes error messages** — `err.message` is returned to the client, potentially leaking internal implementation details (database errors, file paths).
4. **No `res.headersSent` check** — The global error handler doesn't check if headers were already sent, which would crash with `ERR_HTTP_HEADERS_ALREADY_SENT`.
5. **Error handler always returns 500** — The global handler doesn't distinguish between client errors (4xx) and server errors (5xx).
6. **Full stack trace logged in production** — `err.stack` is logged without sanitization, potentially exposing sensitive file paths and environment details.
7. **Validation errors not handled** — Sequelize `ValidationError` is not explicitly mapped in `handleError`, defaulting to 500 instead of 400.

### Frontend

8. **No error boundaries** — The application has no React error boundaries. A rendering error in any component crashes the entire application (white screen).
9. **Silent API failures** — Many components (especially admin dashboard) don't render error states from React Query. Failed queries show empty data with no user feedback.
10. **Error messages shown directly from backend** — Backend error messages are displayed in toasts without sanitization or user-friendly mapping.
11. **No retry mechanism** — Failed API calls are not retried for transient network errors.
12. **No offline detection** — The application doesn't detect or handle network disconnection.
13. **401 redirect may loop** — If the login page makes an API call that returns 401, the interceptor could cause a redirect loop.
