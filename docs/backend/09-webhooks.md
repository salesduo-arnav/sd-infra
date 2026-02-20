# Webhooks

## Overview

The webhook system handles incoming events from Stripe for payment and subscription lifecycle management. The webhook endpoint requires special handling because Stripe signature verification needs the raw request body, not the JSON-parsed body.

## Architecture

```
Stripe --> POST /webhooks/stripe --> Raw body parsing --> Signature verification --> Event handler
```

**Critical:** The webhook route is mounted in `app.ts` **before** `express.json()` middleware to ensure the raw body is preserved for Stripe signature verification.

```typescript
// In app.ts — ORDER MATTERS
app.use('/webhooks', webhookRoutes);  // Before express.json()
app.use(express.json());               // After webhooks
```

## Endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/stripe` | Stripe Signature | Handle Stripe webhook events |

The route uses `express.raw({ type: 'application/json' })` to receive the raw body buffer.

## Handled Events

| Stripe Event | Action |
|-------------|--------|
| `checkout.session.completed` | Create subscription record from completed checkout session |
| `customer.subscription.updated` | Sync subscription status, billing period, cancellation flags |
| `customer.subscription.deleted` | Mark subscription as canceled |
| `invoice.payment_failed` | Track payment failure timestamp on subscription |

## Event Processing

### `checkout.session.completed`
1. Extract subscription ID from checkout session
2. Retrieve full subscription from Stripe
3. Find or create local subscription record
4. Link to organization via Stripe customer ID
5. Set status, billing period, and plan/bundle associations

### `customer.subscription.updated`
1. Find local subscription by Stripe subscription ID
2. Update status, current period dates, cancellation flags
3. Handle plan/bundle changes (upgrades/downgrades)
4. Update scheduled changes (upcoming_plan_id/upcoming_bundle_id)

### `customer.subscription.deleted`
1. Find local subscription by Stripe subscription ID
2. Set status to `canceled`
3. Record cancellation timestamp

### `invoice.payment_failed`
1. Find subscription by Stripe subscription ID from invoice
2. Update `last_payment_failure_at` timestamp

## Signature Verification

Every incoming webhook request is verified using:
1. The raw request body (Buffer)
2. The `stripe-signature` header
3. The `STRIPE_WEBHOOK_SECRET` environment variable

This prevents forged webhook requests. The `stripeService.constructEvent()` method handles verification.

## Key Files

- `backend/src/controllers/billing.controller.ts` — Webhook handler (within billing controller)
- `backend/src/routes/webhook.routes.ts` — Webhook route definition with raw body parser
- `backend/src/services/stripe.service.ts` — `constructEvent()` for signature verification
- `backend/src/app.ts` — Route mounting order (webhooks before express.json)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook endpoint signing secret |

---

## Issues Found

1. **Route ordering fragility** — The webhook route must be mounted before `express.json()` in `app.ts`. If routes are reordered, webhook signature verification silently breaks because the body will be JSON-parsed instead of raw.
2. **No replay protection** — While Stripe signatures prevent forgery, there's no explicit nonce or idempotency key checking to prevent webhook replay attacks.
3. **No retry/dead-letter handling** — If webhook processing fails (database down, logic error), there's no retry mechanism. Stripe will retry automatically, but the application doesn't track failed webhook deliveries.
4. **Missing event types** — Common Stripe events like `invoice.paid`, `invoice.payment_succeeded`, `customer.subscription.trial_will_end` are not handled.
5. **Webhook handler is in the billing controller** — The webhook handling logic is mixed into the billing controller (~1200 LOC file) rather than being a separate, focused handler.
6. **No webhook event logging** — Incoming webhook events are not logged to the audit system, making it difficult to debug payment issues.
7. **Subscription lookup by Stripe ID has no unique constraint** — Finding subscriptions by `stripe_subscription_id` assumes uniqueness, but the model doesn't enforce it, potentially causing duplicate updates.
