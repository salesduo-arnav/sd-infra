# Plans & Checkout

## Overview

The plans system allows users to browse available plans and bundles, add them to a cart, and proceed to Stripe-powered checkout. Supports individual tool plans, bundled plans, free trials, and subscription upgrades/downgrades.

## Pages

### Plans (`Plans.tsx`)
The plan selection page with:
- Bundle groups displayed as tier cards
- Individual app plans with expandable details
- Shopping cart sidebar
- Trial eligibility indicators
- Mixed interval/currency validation

### Checkout (`CheckoutPage.tsx`)
Stripe embedded checkout with:
- Order summary with feature lists
- Cart item display with pricing
- Stripe Elements integration
- Tax calculation note

## Plan Selection Flow

```
Browse Plans/Bundles → Add to Cart → Review Cart → Checkout → Stripe Payment → Success
```

1. User browses plans on `/plans`
2. Selects bundles or individual plans
3. Items added to cart (local state)
4. Reviews cart in sidebar
5. Proceeds to `/checkout`
6. Stripe embedded checkout renders
7. Payment processed by Stripe
8. Redirect to success/billing page

## Cart Management

Cart is managed in React state (not persisted):

### Cart Item Structure
```typescript
{
  type: 'plan' | 'bundle',
  id: string,
  name: string,
  price: number,
  interval: 'monthly' | 'yearly',
  currency: string,
  tool_id?: string,      // for plans
  bundle_id?: string,    // for bundles
}
```

### Validation Rules
- Cannot mix monthly and yearly items
- Cannot mix different currencies
- Cannot add duplicate tool plans
- Trial items have separate handling

## Trial Eligibility

Before displaying trial options, the system checks:
1. Tool has a trial plan (`is_trial_plan = true`)
2. User hasn't used a trial before (across all organizations)
3. Card fingerprint hasn't been used for a trial before
4. Tool-specific trial days and card requirements

## Components

### Plan Components (`components/plans/`)

| Component | Description |
|-----------|-------------|
| `BundleCard.tsx` | Bundle tier card with features and pricing |
| `AppCard.tsx` | Individual app plan card |
| `TierItem.tsx` | Tier selection within a bundle |
| `CartSidebarItem.tsx` | Cart item in checkout sidebar |
| `FeatureComparisonModal.tsx` | Modal comparing features across plans |
| `CheckoutFeatureList.tsx` | Feature list in checkout summary |
| `types.ts` | Shared type definitions |
| `utils.tsx` | Helper functions |

## Stripe Integration

The checkout page uses Stripe's embedded checkout:
1. Backend creates a Stripe checkout session
2. Returns `clientSecret` to frontend
3. Frontend renders `<EmbeddedCheckout>` component
4. Stripe handles payment collection
5. Success triggers webhook → subscription created

## Key Files

- `frontend/src/pages/Plans.tsx` — Plan selection and cart
- `frontend/src/pages/CheckoutPage.tsx` — Stripe checkout
- `frontend/src/components/plans/` — Plan UI components
- `frontend/src/components/checkout/CheckoutFeatureList.tsx`
- `frontend/src/services/billing.service.ts` — Checkout API calls
- `frontend/src/services/public.service.ts` — Public plan data

---

## Issues Found

1. **Cart not persisted** — Cart state is lost on page reload. Should use `localStorage` or session storage.
2. **No Stripe error recovery** — If Stripe Elements fails to load (network issue, invalid key), there's no retry mechanism or user-friendly error message.
3. **`clientSecret` never cleared** — If checkout fails and user navigates back, the same session may be reused.
4. **Race condition on trial eligibility** — Multiple `Promise.all` calls create a race condition. If one eligibility check fails, others may continue with stale data.
5. **Price formatting uses hard-coded locale** — `Intl.NumberFormat` uses `'en-US'` instead of respecting the user's locale.
6. **Total price recalculated every render** — Cart total has no memoization.
7. **Missing cart validation at checkout** — The checkout page allows rendering with an empty cart.
8. **No mobile scroll lock** — When the cart sidebar is open on mobile, the background content still scrolls.
9. **Feature comparison modal** — Features are not displayed when expanding individual app cards.
10. **No redirect after successful payment** — The success redirect URL from Stripe is not explicitly captured/configured in the frontend.
11. **Mixed trial validation happens late** — Different trial lengths in the same cart are checked but not prevented early in the add-to-cart flow.
