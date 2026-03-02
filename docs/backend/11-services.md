# Backend Services

## Overview

The backend service layer contains business logic that is shared across controllers or requires complex orchestration. There are five services: Stripe, OTP, Invitation, Audit, and Mail.

## 1. Stripe Service (`stripe.service.ts`)

Wraps all Stripe API interactions into a single service class.

### Methods

| Method | Description |
|--------|-------------|
| `createCustomer(email, name, metadata)` | Create a Stripe customer |
| `createCheckoutSession(params)` | Create a Stripe checkout session |
| `createPortalSession(customerId, returnUrl)` | Create billing portal session |
| `getSubscription(subscriptionId)` | Retrieve a subscription |
| `cancelSubscription(subscriptionId)` | Cancel subscription immediately |
| `cancelSubscriptionAtPeriodEnd(subscriptionId)` | Cancel at billing period end |
| `resumeSubscription(subscriptionId)` | Resume a cancelled subscription |
| `updateSubscription(subscriptionId, priceId, metadata)` | Change subscription plan |
| `scheduleDowngrade(subscriptionId, newPriceId)` | Schedule downgrade at period end |
| `cancelScheduledDowngrade(subscriptionId)` | Cancel a scheduled downgrade |
| `getCustomerSubscriptions(customerId)` | List customer subscriptions |
| `getInvoices(customerId)` | List customer invoices |
| `getPaymentMethods(customerId)` | List payment methods |
| `createProduct(params)` | Create Stripe product |
| `updateProduct(productId, params)` | Update Stripe product |
| `createPrice(params)` | Create Stripe price |
| `createTrialSubscription(customerId, priceId, trialDays)` | Start trial subscription |
| `constructEvent(payload, signature, secret)` | Verify and construct webhook event |
| `updateGracePeriod(days)` | Update payment grace period (STUB) |
| `getClient()` | Get raw Stripe client instance |

### Configuration
- Initialized with `STRIPE_SECRET_KEY` environment variable
- Logs warning if secret key is missing (does not throw)

## 2. OTP Service (`otp.service.ts`)

Handles One-Time Password generation, storage, and verification using Redis.

### Methods

| Method | Description |
|--------|-------------|
| `generateOtp()` | Generate 6-digit OTP via `crypto.randomBytes` |
| `createLoginOtp(email)` | Store OTP in Redis with 5-min TTL |
| `verifyLoginOtp(email, inputOtp)` | Verify OTP (max 5 attempts) |
| `createSignupOtp(email, password, full_name, token?)` | Store OTP with user data |
| `verifySignupOtp(email, inputOtp)` | Verify and return stored user data |
| `canSendOtp(email, type)` | Rate limiting check (one active OTP per email) |

### Redis Key Patterns
- Login OTP: `otp:login:<email>` → `{ otp, attempts }`
- Signup OTP: `otp:signup:<email>` → `{ otp, attempts, email, password, full_name, token? }`
- TTL: 300 seconds (5 minutes)

## 3. Invitation Service (`invitation.service.ts`)

Manages invitation creation and email delivery.

### Methods

| Method | Description |
|--------|-------------|
| `sendInvitation(orgId, email, roleId, invitedBy, transaction?)` | Create invitation and send email |

### Flow
1. Check if user is already a member
2. Check for existing pending invitation (upsert if exists)
3. Generate token: `crypto.randomBytes(32).toString('hex')`
4. Set expiry: 7 days from now
5. Send invitation email with link
6. Return invitation record

## 4. Audit Service (`audit.service.ts`)

Fire-and-forget audit logging for compliance and debugging.

### Methods

| Method | Description |
|--------|-------------|
| `static log(params)` | Log an action to the audit_log table |

### Parameters
```typescript
interface LogParams {
  actorId?: string;      // User who performed the action
  action: string;        // Action identifier (e.g., 'CREATE_ORGANIZATION')
  entityType: string;    // Entity type (e.g., 'Organization')
  entityId?: string;     // Entity ID
  details: object;       // Additional context (JSONB)
  req?: Request;         // Express request (for IP extraction)
}
```

### Behavior
- All errors are caught and logged (never throws)
- IP extracted from `req.ip` or `req.connection.remoteAddress`
- Each call creates a single INSERT

## 5. Mail Service (`mail.service.ts`)

Email delivery via SMTP using Nodemailer.

### Methods

| Method | Description |
|--------|-------------|
| `sendMail(options)` | Send an email with HTML/text content |

### Configuration
- SMTP host, port, user, password from environment variables
- TLS/SSL determined by port (465 = secure)
- Falls back to ethereal email credentials if env vars missing

### Mail Options
```typescript
interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}
```

## Key Files

- `backend/src/services/stripe.service.ts`
- `backend/src/services/otp.service.ts`
- `backend/src/services/invitation.service.ts`
- `backend/src/services/audit.service.ts`
- `backend/src/services/mail.service.ts`

---

## Issues Found

- [x] **[ALREADY FIXED] SECURITY: Password stored in plaintext in Redis** — The OTP signup flow stores the user's password as plaintext in Redis. If Redis is compromised, all in-progress signup passwords are exposed.
- [x] ** [SKIPPED] OTP is too weak** — 6-digit OTP has only 60,000 combinations. With 5 retry attempts, brute-force is feasible. Consider 8+ digits or alphanumeric codes. *(Skipped: Not needed)*
- [x] **[ALREADY FIXED] OTP stored unhashed** — OTPs are stored in plaintext in Redis. Should be hashed (e.g., bcrypt or SHA-256) before storage.
- [x] **[SKIPPED] `generateOtp()` has minor modulo bias** — Using `randomBytes` with modulo for non-power-of-2 ranges introduces slight bias, though practically negligible for OTPs. *(Skipped: Not needed)*
- [x] **Stripe service continues with missing key** — If `STRIPE_SECRET_KEY` is not set, the service logs a warning but initializes with `undefined`, which will cause cryptic errors on first API call.
- [ ] **[SKIPPED] `updateGracePeriod()` is a stub** — Only logs to console, doesn't implement actual Stripe configuration update. *(Skipped: Not possible)*
- [ ] **[SKIPPED] `getClient()` exposes raw Stripe instance** — Allows callers to bypass the service abstraction and make direct Stripe API calls. *(Skipped: Needed for future edge cases)*
- [x] **`scheduleDowngrade()` assumes items array** — Assumes `subscription.items.data[0]` exists without validation.
- [ ] **[SKIPPED] Audit service silently swallows errors** — If the database is down, audit log creation fails silently with no indication to the caller. *(Skipped: Intentional design to prevent audit failures from failing core business logic)*
- [x] **`req.connection.remoteAddress` is deprecated** — The audit service uses deprecated Node.js API for IP extraction.
- [ ] **[SKIPPED] Audit service has no batching** — Each audit log is an individual database INSERT, which could be slow under high throughput. *(Skipped: Not needed)*
- [x] **Mail service hardcoded fallback credentials** — Falls back to `test_user`/`test_pass` at `smtp.ethereal.email` if environment variables are missing. This could cause silent failures in production.
- [ ] **[SKIPPED] Mail service has no retry logic** — Transient SMTP failures are not retried. *(Skipped: Not needed)*
- [x] **[ALREADY FIXED] Invitation expiry hardcoded** — 7-day expiry is not configurable.
- [x] **Invitation email sent after creation** — If email sending fails, the invitation record exists but the user never receives it. No mechanism to resend.
- [ ] **[SKIPPED] No email template engine** — HTML content is constructed as raw strings by callers, with no templating system. *(Skipped: Not needed)*
