# Backend Utilities

## Overview

Four utility modules provide shared functionality across the backend: logging, error handling, pagination, and statistics calculations.

## 1. Logger (`utils/logger.ts`)

Winston-based logging utility with colored console output.

### Log Levels
| Level | Priority | Usage |
|-------|----------|-------|
| error | 0 | Application errors |
| warn | 1 | Warnings |
| info | 2 | General information |
| http | 3 | HTTP request logs |
| debug | 4 | Debug information |

### Configuration
- **Development:** Default level `debug` (logs everything)
- **Production:** Default level `http`
- **Override:** `LOG_LEVEL` environment variable
- **Format:** `YYYY-MM-DD HH:MM:SS` timestamp with colorized output

### Usage
```typescript
import Logger from '../utils/logger';
Logger.info('Creating feature', { name, userId: req.user?.id });
Logger.error('Database connection failed', { error: err.message });
```

## 2. Error Handler (`utils/error.ts`)

Standardized error response formatting.

### `handleError(res, error, message)`

Maps error types to HTTP status codes:

| Error Pattern | Status Code | Response |
|---------------|-------------|----------|
| `error.message` contains "not found" (case-insensitive) | 404 | Not found message |
| `error.message === 'NOT_FOUND'` | 404 | Not found message |
| `error.message === 'ALREADY_EXISTS'` | 400 | Already exists message |
| `error.message === 'SLUG_EXISTS'` | 400 | Slug already exists |
| `SequelizeUniqueConstraintError` | 400 | Duplicate entry message |
| Everything else | 500 | Internal server error |

### Usage
```typescript
try {
  // ... operation
} catch (error) {
  handleError(res, error, 'Create Feature Error');
}
```

## 3. Pagination (`utils/pagination.ts`)

Standardized pagination parsing and response formatting.

### `getPaginationOptions(req, defaultSortBy?)`

Parses query parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 10 | Items per page |
| `sortBy` | `created_at` | Sort column |
| `sortOrder` | `DESC` | Sort direction (ASC/DESC) |

Returns: `{ page, limit, offset, sortBy, sortOrder }`

### `formatPaginationResponse<T>(rows, count, page, limit, dataKey)`

Returns:
```json
{
  "[dataKey]": [...rows],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

## 4. Statistics (`utils/stats.ts`)

Financial and growth metrics calculations used by the admin dashboard.

### Functions

| Function | Description |
|----------|-------------|
| `getStartOfMonth(date?)` | Return first day of the given month |
| `getStartOfLastMonth(date?)` | Return first day of the previous month |
| `calculateGrowth(current, previous)` | Calculate percentage growth (handles divide-by-zero) |
| `calculateMRR(subscriptions)` | Calculate Monthly Recurring Revenue |

### MRR Calculation Logic
- Filters subscriptions with associated plans
- Monthly plans: price added directly
- Yearly plans: `price / 12`
- Other intervals: treated as monthly
- Result rounded to 2 decimal places

## Key Files

- `backend/src/utils/logger.ts`
- `backend/src/utils/error.ts`
- `backend/src/utils/pagination.ts`
- `backend/src/utils/stats.ts`

---

## Issues Found

- [x] **Logger has only console transport** — No file logging is configured. In production, logs are only available through container stdout, with no persistent log files.
- [x] **No log rotation** — Since only console transport is used, there's no log rotation strategy.
- [ ] **No request ID or tracing context** — Logger has no concept of request correlation IDs, making it difficult to trace a single request through log entries. *(Skipped: Not needed for now)*
- [x] **`handleError` uses fragile string matching** — Checking `error.message` for substrings like "not found" could produce false positives if an error message coincidentally contains these words.
- [x] **No max limit on pagination** — `limit` parameter has no upper bound. A client could request `?limit=999999` and cause a large database query.
- [x] **`sortBy` is not validated** — The sort column from user input is passed directly to Sequelize's `order` clause. While Sequelize typically prevents SQL injection, unvalidated column names could cause errors or expose column information.
- [x] **`calculateGrowth` returns 100 for new data** — When previous is 0 and current > 0, returns 100%. This is mathematically undefined (infinity) and the choice of 100% should be documented.
- [x] **`calculateMRR` silently skips subscriptions without plans** — If a subscription has no associated plan (e.g., bundle-only), it's excluded from MRR without any logging.
- [x] **No handling of negative prices in MRR** — If a plan price is negative (credit/refund), it would reduce MRR without any safeguard.
- [x] **Timestamp format truncated** — The logger timestamp format includes "ms" in the format string but doesn't actually output milliseconds.
