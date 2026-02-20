# Testing Patterns

## Overview

The platform has two testing systems: backend unit/integration tests using Jest + Supertest, and frontend E2E tests using Playwright (currently disabled in CI).

## Backend Tests

### Framework
- **Test runner:** Jest
- **HTTP testing:** Supertest
- **Database:** Dedicated test database (`mydb_test`)
- **Mocking:** jest.mock for external services (Google Auth)

### Test Files

| File | Coverage Area |
|------|---------------|
| `auth.test.ts` | Registration, login, logout, Google OAuth, OTP |
| `organization.test.ts` | Org CRUD, member management |
| `invitation.test.ts` | Invitation lifecycle |
| `rbac.test.ts` | Role-based access control |
| `superuser.test.ts` | Superuser-specific operations |
| `superuser_admin.test.ts` | Admin panel access |
| `soft_delete_integrity.test.ts` | Soft delete cascade verification |
| `ads.controller.test.ts` | Amazon Ads OAuth |
| `user.controller.test.ts` | User profile and account |
| `public.plan.test.ts` | Public plan API |
| `admin.tool.test.ts` | Admin tool management |
| `admin.feature.test.ts` | Admin feature management |
| `admin.plan.test.ts` | Admin plan management |
| `admin.bundle.test.ts` | Admin bundle management |
| `admin.audit.test.ts` | Audit log queries |
| `admin.stats.test.ts` | Dashboard statistics |
| `admin.organization.test.ts` | Admin org management |
| `admin.user.test.ts` | Admin user management |

### Global Setup (`global-setup.ts`)

Before all tests:
1. **Safety check:** Validates `PGDATABASE === 'mydb_test'` to prevent running tests against production
2. **Creates test database** if it doesn't exist
3. **Runs all migrations** to set up schema
4. **Creates necessary seed data** (roles, permissions)

### Global Teardown (`global-teardown.ts`)

After all tests:
1. Closes database connection
2. Closes Redis connection

### Test Isolation Pattern

```typescript
beforeEach(async () => {
  // Truncate all tables to ensure clean state
  await sequelize.query('TRUNCATE TABLE users, organizations, ... CASCADE');
});
```

Each test suite truncates relevant tables before each test to ensure isolation.

### Test Patterns

#### Authentication Tests
```typescript
// Helper to create and login a user
const registerAndLogin = async (email, password) => {
  await request(app).post('/auth/register').send({ email, password, full_name: 'Test' });
  const res = await request(app).post('/auth/login').send({ email, password });
  return res.headers['set-cookie'];
};
```

#### Authenticated Request Pattern
```typescript
const res = await request(app)
  .get('/organizations/my')
  .set('Cookie', sessionCookie)
  .set('x-organization-id', orgId);
```

#### Admin Test Pattern
```typescript
// Create superuser via SUPERUSER_EMAILS env or direct DB update
await User.update({ is_superuser: true }, { where: { id: userId } });
```

### Running Tests

```bash
cd backend
npm run test              # Run all tests
npm run test -- --watch   # Watch mode
npm run test -- auth      # Run specific test file
```

### CI Integration

Tests run in the CI/CD pipeline:
1. Docker Compose starts PostgreSQL and Redis
2. Backend `.env` created from GitHub Secrets
3. `npm run test` executes Jest
4. Results uploaded as artifacts and posted as PR comments via CML

## Frontend E2E Tests

### Framework
- **Test runner:** Playwright
- **Status:** Disabled in CI (commented out in workflow)

### Commands
```bash
cd frontend
npm run test:e2e           # Run Playwright tests
npm run test:e2e:ui        # Playwright UI mode (interactive)
```

### Configuration
Playwright configuration is in `frontend/playwright.config.ts`.

## Key Files

- `backend/src/tests/` — All backend test files
- `backend/src/tests/global-setup.ts` — Database setup
- `backend/src/tests/global-teardown.ts` — Cleanup
- `backend/jest.config.js` — Jest configuration
- `frontend/playwright.config.ts` — Playwright configuration
- `.github/workflows/ci-cd.yaml` — CI test execution

---

## Issues Found

1. **Frontend E2E tests disabled** — Playwright tests are commented out in CI, meaning no end-to-end testing runs automatically.
2. **No test coverage reporting** — Jest is not configured to generate coverage reports. There's no visibility into what percentage of code is tested.
3. **DEBUG console.log in tests** — Some test files (e.g., `admin.tool.test.ts`) contain debug `console.log` statements that should be removed.
4. **Database recreated every run** — The global setup drops and recreates the test database on each run, which is slow. Transaction-based isolation would be faster.
5. **No timeout handling** — Async operations in tests have no explicit timeout, which could cause tests to hang indefinitely on failure.
6. **Mocking is incomplete** — Only `google-auth-library` is mocked. Stripe service calls may hit actual Stripe APIs during testing if not properly isolated.
7. **No integration test for webhooks** — Stripe webhook handling is not tested in the test suite.
8. **No load/performance testing** — No load testing framework or scripts exist.
9. **Test data not reusable** — Each test creates its own data inline. There's no factory or fixture system for generating test data.
10. **No testing guide** — There's no documentation explaining how to write new tests, naming conventions, or testing best practices for this codebase.
