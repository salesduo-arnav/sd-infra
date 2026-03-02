# Authentication & Authorization

## Overview

Session-based authentication system using Redis for session storage. Supports email/password login, Google OAuth, and OTP (One-Time Password) verification. Sessions are stored as UUIDs in Redis with a 24-hour TTL, set as HTTP-only cookies.

## Architecture

```
Client (Cookie) --> Auth Middleware --> Redis (Session Lookup) --> DB (User Lookup) --> Request Handler
```

## Endpoints

### Registration & Login

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register with email/password, optional invitation token |
| POST | `/auth/login` | No | Login with email/password, optional invitation token |
| POST | `/auth/logout` | Yes | Destroy session and clear cookie |
| GET | `/auth/me` | Yes | Get current user with org memberships |

### Password Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/forgot-password` | No | Request password reset link via email |
| POST | `/auth/reset-password` | No | Reset password using token from email |

### Google OAuth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/google-auth` | No | Authenticate via Google OAuth token |

### OTP (One-Time Password)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/send-login-otp` | No | Send 6-digit OTP to email for login |
| POST | `/auth/verify-login-otp` | No | Verify OTP and create session |
| POST | `/auth/send-signup-otp` | No | Send OTP for email verification during signup |
| POST | `/auth/verify-signup-otp` | No | Verify OTP and complete registration |

## Session Management

- **Storage:** Redis with key format `session:<uuid>`
- **TTL:** 24 hours (86400 seconds)
- **Cookie:** HTTP-only, set on successful authentication
- **Validation:** On each authenticated request, session UUID is looked up in Redis, then user is loaded from the database

## OTP Flow

1. Client requests OTP via `/auth/send-login-otp` or `/auth/send-signup-otp`
2. Server generates 6-digit OTP using `crypto.randomBytes`
3. OTP stored in Redis with 5-minute TTL
4. OTP sent to user's email via mail service
5. Client submits OTP via `/auth/verify-login-otp` or `/auth/verify-signup-otp`
6. Server validates OTP (max 5 attempts)
7. On success, session created and cookie set

## Google OAuth Flow

1. Frontend obtains Google OAuth token via Google Sign-In
2. Token sent to `/auth/google-auth`
3. Server verifies token with Google's `OAuth2Client`
4. If user exists, session created; if not, user registered and session created
5. Supports optional invitation token for auto-joining organizations

## Invitation Integration

Both `/auth/register` and `/auth/login` accept an optional `token` parameter. When provided:
1. The invitation is validated (not expired, pending status)
2. After successful auth, user is automatically added to the inviting organization
3. Invitation status updated to `ACCEPTED`

## Key Files

- `backend/src/controllers/auth.controller.ts` — All auth endpoint handlers
- `backend/src/services/otp.service.ts` — OTP generation, storage, verification
- `backend/src/services/mail.service.ts` — Email delivery for OTP and password reset
- `backend/src/middlewares/auth.middleware.ts` — Session validation middleware
- `backend/src/config/redis.ts` — Redis client configuration

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection URL |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `FRONTEND_URL` | Yes | Frontend URL for password reset links |
| `SESSION_COOKIE_NAME` | No | Cookie name (defaults to internal value) |

---

## Issues Found

- [x] **No password strength validation** — Registration and password reset do not enforce password complexity rules (minimum length, character requirements) at the controller level.
- [x] **OTP brute-force risk** — No rate limiting on OTP endpoints. The 6-digit OTP (60,000 combinations) with 5 retry attempts is vulnerable to automated brute-force attacks. Consider adding per-IP rate limiting.
- [x] **OTP stored in plaintext** — OTPs are stored in Redis without hashing. If Redis is compromised, all active OTPs are exposed. Consider storing hashed OTPs.
- [x] **Password stored in Redis during signup OTP flow** — The `createSignupOtp` method stores the user's password in plaintext in Redis while awaiting OTP verification. This should be hashed before storage.
- [x] **OTP TTL is hardcoded** — The 5-minute OTP expiry is hardcoded in the OTP service rather than being configurable via environment variable or system config.
- [x] **No session binding** — Sessions are not bound to IP address or User-Agent, making them vulnerable to session fixation/hijacking attacks.
- [ ] **No CSRF protection** — No CSRF token validation is implemented on state-changing endpoints. _**[Skipped]**_
- [ ] **Forgot password returns generic message** — Good for preventing user enumeration, but no internal monitoring/alerting for failed attempts.  _**[Skipped]**_
- [ ] **Race condition** — A user could be deleted between the auth middleware check and the request handler execution, causing unexpected errors. _**[Skipped]**_
