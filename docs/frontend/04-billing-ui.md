# Billing UI

## Overview

The billing page (`/billing`) provides subscription management, invoice history, and Stripe billing portal access. Users can view, cancel, resume subscriptions, manage trials, and sync subscription data with Stripe.

## Page: Billing (`Billing.tsx`)

### Features
- Display active subscriptions with status badges
- Subscription actions (cancel, resume, cancel trial)
- Invoice download history via DataTable
- Billing portal access (redirect to Stripe)
- Subscription sync with Stripe (manual)
- Grace period display from system config

### Subscription Status Badges
| Status | Display |
|--------|---------|
| `active` | Green badge |
| `trialing` | Blue badge |
| `past_due` | Yellow/warning badge |
| `canceled` | Red/destructive badge |
| `incomplete` | Gray badge |

### Subscription Actions
| Action | Condition | Description |
|--------|-----------|-------------|
| Cancel | Active subscription | Cancels at period end |
| Resume | Cancelled (cancel_at_period_end) | Resumes subscription |
| Cancel Trial | Trialing status | Immediately cancels trial |

### Invoice Table
Displays Stripe invoices with:
- Invoice number
- Date
- Amount
- Status
- PDF download link

## Components

### Billing Components (`components/billing/`)

| Component | Description |
|-----------|-------------|
| `BillingAlert.tsx` | Alert banner for billing issues (past due, grace period) |
| `columns.tsx` | DataTable column definitions for invoice list |

## URL Parameters

The billing page checks URL parameters on load:
- `?success=true` — Shows success toast after checkout completion
- `?canceled=true` — Shows cancellation message

## Key Files

- `frontend/src/pages/Billing.tsx` — Billing page
- `frontend/src/components/billing/BillingAlert.tsx` — Alert component
- `frontend/src/components/billing/columns.tsx` — Invoice columns
- `frontend/src/services/billing.service.ts` — Billing API calls

---

## Issues Found

1. **URL params not cleaned** — `?success=true` and `?canceled=true` parameters are checked but never removed from the URL. Navigating away and back triggers the toast again.
2. **Sync call has no error handling** — The manual Stripe sync button calls the API but doesn't handle errors, leading to silent failures.
3. **Toast shown before data refresh** — Success toast appears before the subscription data is actually re-fetched, potentially showing stale data.
4. **Grace period default is hardcoded** — Falls back to 3 days if system config is not available.
5. **Duplicate `setIsLoading` calls** — Multiple loading state setter calls in the code, some unreachable.
6. **Subscription actions use potentially stale IDs** — Stripe subscription IDs used in action calls may be stale if the data changed.
7. **No confirmation for resume** — Resuming a cancelled subscription has no confirmation dialog (cancel does, but resume doesn't).
