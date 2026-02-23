# Billing & Subscriptions

## Overview

The billing system integrates with Stripe for payment processing, subscription management, and invoicing. Organizations subscribe to individual plans or bundles of plans. The system supports monthly/yearly billing intervals, free trials, subscription upgrades/downgrades, and one-time purchases.

## Architecture

```
Organization --> Subscription --> Plan (individual tool)
                              --> Bundle (multiple plans)
                              --> upcoming_plan_id / upcoming_bundle_id (scheduled changes)

Stripe Webhooks --> billing.controller.ts --> DB sync
```

## Data Model

### Plan

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | STRING | Plan name |
| tool_id | UUID | FK to Tool |
| tier | ENUM | `FREE`, `STARTER`, `PRO`, `ENTERPRISE` |
| price | DECIMAL | Price in cents |
| currency | STRING | Currency code (e.g., "usd") |
| interval | ENUM | `MONTHLY`, `YEARLY`, `ONE_TIME` |
| stripe_product_id | STRING | Stripe product ID |
| stripe_price_id_monthly | STRING | Stripe monthly price ID |
| stripe_price_id_yearly | STRING | Stripe yearly price ID |
| active | BOOLEAN | Whether plan is available |
| is_trial_plan | BOOLEAN | Whether this is the free trial plan |

### Bundle

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | STRING | Bundle name |
| slug | STRING | URL-friendly identifier |
| bundle_group_id | UUID | FK to BundleGroup |
| tier_label | STRING | Display tier label |
| price | DECIMAL | Bundle price (overrides individual plan prices) |
| currency | STRING | Currency code |
| interval | ENUM | Billing interval |
| stripe_product_id | STRING | Stripe product ID |
| stripe_price_id_monthly | STRING | Stripe monthly price ID |
| stripe_price_id_yearly | STRING | Stripe yearly price ID |
| active | BOOLEAN | Whether bundle is available |

### Subscription

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| plan_id | UUID | FK to Plan (nullable) |
| bundle_id | UUID | FK to Bundle (nullable) |
| upcoming_plan_id | UUID | Scheduled plan change |
| upcoming_bundle_id | UUID | Scheduled bundle change |
| stripe_subscription_id | STRING | Stripe subscription ID |
| status | ENUM | `active`, `trialing`, `past_due`, `canceled`, `incomplete`, `incomplete_expired` |
| trial_start | DATE | Trial start date |
| trial_end | DATE | Trial end date |
| current_period_start | DATE | Current billing period start |
| current_period_end | DATE | Current billing period end |
| cancel_at_period_end | BOOLEAN | Whether subscription cancels at period end |
| card_fingerprint | STRING | Card fingerprint for trial abuse detection |

### OneTimePurchase

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| plan_id / bundle_id | UUID | What was purchased |
| stripe_payment_intent_id | STRING | Stripe payment intent |
| amount_paid | DECIMAL | Amount paid |
| currency | STRING | Currency code |
| status | STRING | Payment status |

## Endpoints

### Billing Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/billing/config` | Yes | Get payment grace period config |
| POST | `/billing/checkout` | Yes | Create Stripe checkout session |
| GET | `/billing/subscription` | Yes | Get current subscriptions with payment methods |
| POST | `/billing/portal` | Yes | Create Stripe customer portal session |
| GET | `/billing/invoices` | Yes | Get invoices from Stripe |
| GET | `/billing/payment-methods` | Yes | Get stored payment methods |
| POST | `/billing/sync` | Yes | Manual subscription sync with Stripe |

### Subscription Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| DELETE | `/billing/subscriptions/:id` | Yes | Cancel subscription |
| POST | `/billing/subscriptions/:id/resume` | Yes | Resume cancelled subscription |
| POST | `/billing/subscriptions/:id` | Yes | Update subscription (upgrade/downgrade) |
| DELETE | `/billing/subscriptions/:id/downgrade` | Yes | Cancel scheduled downgrade |

### Trial Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/billing/trials/start` | Yes | Start free trial |
| DELETE | `/billing/trials/:id` | Yes | Cancel trial |
| GET | `/billing/trials/eligibility` | Yes | Check trial eligibility |

### Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/stripe` | No (signature verified) | Handle Stripe webhook events |

## Checkout Flow

1. Frontend sends cart items to `/billing/checkout`
2. Backend creates/retrieves Stripe customer for the organization
3. Stripe checkout session created with line items
4. Frontend renders embedded Stripe checkout
5. On completion, Stripe sends webhook events
6. Webhook handler syncs subscription status to database

## Trial System

- Each tool can have one trial plan (`is_trial_plan = true`)
- Trial eligibility checks across ALL user organizations (prevents multi-org abuse)
- Card fingerprint tracking prevents same card from getting multiple trials
- `paranoid: false` queries include soft-deleted subscriptions for abuse detection
- Configurable `trial_days` per tool, `trial_card_required` flag

## Webhook Events Handled

- `checkout.session.completed` — Create subscription from completed checkout
- `customer.subscription.updated` — Sync status, period, cancel flags
- `customer.subscription.deleted` — Mark subscription as canceled
- `invoice.payment_failed` — Track payment failure timestamp

## Stripe Integration

The `StripeService` class wraps all Stripe API calls:
- Customer management (create, retrieve)
- Checkout session creation
- Subscription CRUD (cancel, resume, update, schedule downgrade)
- Product and price management
- Invoice and payment method retrieval
- Webhook event construction and verification

## Key Files

- `backend/src/controllers/billing.controller.ts` — All billing endpoint handlers (~1200 LOC)
- `backend/src/services/stripe.service.ts` — Stripe API wrapper
- `backend/src/models/subscription.ts` — Subscription model
- `backend/src/models/plan.ts` — Plan model
- `backend/src/models/bundle.ts` — Bundle model
- `backend/src/models/one_time_purchase.ts` — OneTimePurchase model
- `backend/src/routes/billing.routes.ts` — Billing route definitions
- `backend/src/routes/webhook.routes.ts` — Webhook route (mounted before express.json())

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key (frontend) |
| `FRONTEND_URL` | Yes | Redirect URL after checkout |

---

## Issues Found

1. ~~**Trial abuse gap** — Card fingerprint check only triggers for `TRIALING` or `ACTIVE` status subscriptions. A user could: start trial -> cancel -> start another trial with the same card if the original subscription reaches `canceled` status.~~
2. **`updateGracePeriod()` is a stub** — `StripeService.updateGracePeriod()` only logs to console and doesn't actually update any Stripe configuration. (Skipped as stripe doesn't support this)
3. ~~**Floating-point price calculation** — `Math.round(price * 100)` for converting to cents can have floating-point precision errors with certain decimal values.~~
4. ~~**Orphaned Stripe prices** — When a plan is updated, new Stripe prices are created but old prices are never archived/deactivated, leading to orphaned prices in Stripe.~~
5. ~~**`eitherPlanOrBundle` validator incomplete** — The Subscription model validates that either `plan_id` or `bundle_id` is set, but doesn't validate `upcoming_plan_id`/`upcoming_bundle_id`.~~
6. ~~**OneTimePurchase lacks plan/bundle validation** — Unlike Subscription, OneTimePurchase has no model-level validator ensuring either `plan_id` or `bundle_id` is set.~~
7. ~~**Silent Stripe connection failures** — When fetching payment methods fails, the error is silently caught and the response continues without payment details, potentially masking configuration issues.~~
8. ~~**No retry logic in Stripe service** — Transient Stripe API failures are not retried.~~
9. ~~**Webhook raw body requirement** — The webhook route must be mounted before `express.json()` middleware. This is correctly implemented but fragile — reordering routes in `app.ts` would break webhook signature verification.~~
10. ~~**`stripe_subscription_id` not unique** — The Subscription model doesn't enforce uniqueness on `stripe_subscription_id`, which could cause duplicate entries if sync logic runs concurrently.~~
11. **MRR calculation excludes trialing** — Overview stats only include `ACTIVE` subscriptions in MRR, excluding `TRIALING` subscriptions. This may or may not be intentional but should be documented.
(Skipped as it is not a bug)
~~12. **Price stored ambiguously** — Plan `price` field represents cents but this is not documented in the model or migrations, creating confusion.~~
