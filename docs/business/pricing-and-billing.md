# Pricing and Billing — Business Rules Document

**Platform:** SalesDuo Core Platform
**Last Updated:** April 2026
**Audience:** Non-technical stakeholders, product managers, QA teams

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tools](#2-tools)
3. [Plans](#3-plans)
4. [Features and Plan Limits](#4-features-and-plan-limits)
5. [Bundles](#5-bundles)
6. [Subscriptions](#6-subscriptions)
7. [Checkout and Payment](#7-checkout-and-payment)
8. [Upgrades](#8-upgrades)
9. [Downgrades](#9-downgrades)
10. [Cancellation](#10-cancellation)
11. [Reactivation](#11-reactivation)
12. [Free Trials](#12-free-trials)
13. [Trial Abuse Prevention](#13-trial-abuse-prevention)
14. [Entitlements](#14-entitlements)
15. [Payment Failures and Grace Period](#15-payment-failures-and-grace-period)
16. [One-Time Purchases](#16-one-time-purchases)
17. [Billing Portal](#17-billing-portal)
18. [Invoices and Payment Methods](#18-invoices-and-payment-methods)
19. [Stripe Webhooks and Sync](#19-stripe-webhooks-and-sync)
20. [Edge Cases and Special Scenarios](#20-edge-cases-and-special-scenarios)
21. [System Configuration](#21-system-configuration)
22. [Who Can Do What (Billing Permissions)](#22-who-can-do-what-billing-permissions)

---

## 1. Overview

The platform uses **Stripe** as its payment processor for all billing operations. The billing system supports:

- **Recurring subscriptions** (monthly or yearly)
- **One-time purchases**
- **Free trials** with abuse prevention
- **Plan upgrades and downgrades** with proration
- **Bundles** (multi-plan packages)
- **Feature-based entitlements** with usage tracking and periodic resets

Billing is managed at the **organization level**, not the individual user level. An organization subscribes to plans, and all members of that organization benefit from the subscription.

---

## 2. Tools

Tools are the top-level products offered by the platform. Each tool represents a distinct service or application that organizations can subscribe to.

### 2.1 What is a Tool?

- A tool is a product or service (e.g., "Amazon Ads Manager", "Listing Optimizer").
- Each tool can have multiple **plans** (pricing tiers) and multiple **features**.
- Tools can be active or inactive. Inactive tools are hidden from users.

### 2.2 Tool-Level Settings

| Setting | Description |
|---------|-------------|
| **Trial days** | How many days of free trial are offered for this tool (0 means no trial) |
| **Trial card required** | Whether a credit card must be on file to start a trial |
| **Required integrations** | Which third-party integrations (e.g., Amazon Seller account) must be connected before using the tool |

---

## 3. Plans

Plans define the pricing tiers available for each tool.

### 3.1 Plan Structure

Each plan belongs to exactly one tool and includes:

- **Name and description** — What the plan is called and what it offers
- **Tier** — Classification level: Basic, Premium, Platinum, or Diamond
- **Price** — The cost per billing interval
- **Currency** — The currency for billing (e.g., USD)
- **Billing interval** — Monthly, Yearly, or One-Time
- **Active flag** — Whether the plan is currently available for purchase

### 3.2 Plan Rules

- A plan with a price of **zero** is considered a free or trial plan.
- Each tool can have at most **one trial plan**. Attempting to create a second trial plan for the same tool is rejected.
- A plan **cannot be deleted** if there are active subscriptions using it. The plan must first have no subscribers with an Active, Trialing, or Past Due status.
- When a plan is created, corresponding product and price records are automatically created in Stripe.
- Each plan has separate Stripe price identifiers for monthly and yearly billing.

---

## 4. Features and Plan Limits

Features represent specific capabilities or resources within a tool. Plan limits define how much of each feature is available on each plan.

### 4.1 What is a Feature?

- A feature is a measurable or toggleable capability within a tool (e.g., "Image Generation Count", "Number of Campaigns", "Advanced Reporting").
- Each feature belongs to one tool.
- Features are identified by a unique slug (e.g., `img_gen_count`) used internally to check access.

### 4.2 What is a Plan Limit?

A plan limit connects a feature to a plan and defines:

| Field | Description |
|-------|-------------|
| **Default limit** | The maximum amount allowed (e.g., 100 image generations per month). A null value means unlimited. |
| **Is enabled** | Whether this feature is included in this plan at all. If disabled, the limit is effectively zero. |
| **Reset period** | How often the usage counter resets: Monthly, Yearly, or Never. |

### 4.3 Examples

| Plan | Feature | Limit | Reset |
|------|---------|-------|-------|
| Basic | Image Generations | 50 per month | Monthly |
| Premium | Image Generations | 500 per month | Monthly |
| Diamond | Image Generations | Unlimited | Never |
| Basic | Advanced Reporting | Disabled | — |
| Premium | Advanced Reporting | Enabled (no numeric limit) | Never |

### 4.4 Cascading Updates

When a platform administrator changes a plan limit (e.g., increases the image generation limit on the Premium plan from 500 to 750):

- The change is automatically applied to **all organizations** that currently have an active subscription to that plan.
- Each affected organization's entitlement is updated to reflect the new limit.
- This happens immediately — organizations do not need to wait for a new billing cycle.

---

## 5. Bundles

Bundles allow multiple plans to be packaged together and sold as a single product at a combined price.

### 5.1 What is a Bundle?

- A bundle groups together two or more plans from different tools into a single purchasable package.
- Bundles have their own **name**, **price**, **billing interval**, and **tier label**.
- The bundle price **overrides** the individual plan prices — the customer pays the bundle price, not the sum of individual plan prices.

### 5.2 Bundle Groups

- Bundles can optionally belong to a **bundle group** (e.g., "Reseller Plans", "Enterprise Packages").
- Bundle groups are for organizational purposes and help categorize bundles in the user interface.
- A bundle group **cannot be deleted** if any bundle within it has active subscriptions.

### 5.3 Bundle Subscriptions

- When an organization subscribes to a bundle, they receive entitlements for **all plans** included in the bundle.
- The subscription record links to the bundle (not to individual plans).
- Upgrading or downgrading between bundles follows the same rules as plan changes (see [Upgrades](#8-upgrades) and [Downgrades](#9-downgrades)).

---

## 6. Subscriptions

A subscription represents an organization's ongoing access to a plan or bundle.

### 6.1 Subscription Basics

- Subscriptions exist at the **organization level**. All members of the organization share the subscription.
- An organization can have **multiple subscriptions** — for example, one for each tool they use.
- Each subscription is linked to either a **plan** or a **bundle**, but never both simultaneously.

### 6.2 Subscription Statuses

| Status | Meaning | Service Access |
|--------|---------|:--------------:|
| **Trialing** | Free trial period is active | Yes |
| **Active** | Paid subscription in good standing | Yes |
| **Past Due** | Payment failed, within grace period | Yes (temporarily) |
| **Canceled** | Subscription has ended | No |
| **Incomplete** | Initial payment attempt in progress | No |
| **Incomplete Expired** | Initial payment attempt expired | No |
| **Unpaid** | Invoice remains unpaid | No |
| **Paused** | Subscription temporarily paused | No |

### 6.3 Key Subscription Data

Each subscription tracks:

- **Current billing period** — Start and end dates of the current cycle
- **Trial period** — Start and end dates of the trial (if applicable)
- **Cancel at period end** — Whether the subscription is set to cancel when the current period ends
- **Upcoming plan/bundle** — If a downgrade is scheduled, what plan/bundle will take effect at the next cycle
- **Payment failure timestamp** — When the last payment failure occurred (used for grace period calculation)
- **Card fingerprint** — A partial identifier of the payment card (used for trial abuse detection)
- **Cancellation reason** — Why the subscription was canceled (e.g., user-initiated, duplicate card detected, auto-canceled after payment failure)

---

## 7. Checkout and Payment

### 7.1 Starting a Subscription

1. The user selects a plan or bundle and billing interval (monthly or yearly).
2. The system creates a **Stripe Checkout Session** — a secure payment page hosted by Stripe.
3. The user enters their payment information on the Stripe-hosted page.
4. Upon successful payment, Stripe notifies the platform via a webhook.
5. The platform creates the subscription record, provisions entitlements, and grants access.

### 7.2 Checkout Modes

| Mode | Use Case |
|------|----------|
| **Subscription** | Recurring plans and bundles (monthly/yearly) |
| **Payment** | One-time purchases |

### 7.3 Checkout Display

The checkout can be presented in two ways:
- **Hosted** — The user is redirected to a full Stripe-hosted page.
- **Embedded** — The checkout form is embedded within the platform's interface.

### 7.4 Stripe Customer Linking

- Each organization is linked to a **Stripe customer**.
- If the organization does not already have a Stripe customer ID, one is created during the first checkout.
- The Stripe customer stores the organization's payment methods and billing history.

---

## 8. Upgrades

An upgrade occurs when an organization switches to a higher-priced plan or bundle.

### 8.1 How Upgrades Work

1. The user selects a new plan or bundle with a **higher price** than their current one.
2. The system compares the current price to the target price. If the target is equal to or higher, it is treated as an upgrade.
3. The upgrade takes effect **immediately**.
4. Stripe calculates the prorated amount — the user is credited for the unused portion of their current plan and charged for the new plan.
5. A prorated invoice is generated and charged immediately.
6. The organization's entitlements are updated right away to reflect the new plan's limits.
7. Any previously scheduled downgrade is canceled.

### 8.2 Upgrading from a Free Trial

- If the organization is on a free trial (price = $0) and upgrades to a paid plan, the trial ends immediately.
- The user is charged the full price of the new plan starting from the upgrade date.
- Entitlements are updated to the new plan's limits.

### 8.3 Upgrade Summary

| Aspect | Behavior |
|--------|----------|
| When it takes effect | Immediately |
| Billing impact | Prorated charge for the remainder of the cycle |
| Entitlements | Updated immediately to new plan's limits |
| Usage counters | Not reset (existing usage carries over) |
| Pending downgrades | Canceled |

---

## 9. Downgrades

A downgrade occurs when an organization switches to a lower-priced plan or bundle.

### 9.1 How Downgrades Work

1. The user selects a new plan or bundle with a **lower price** than their current one.
2. The system compares prices. If the target is lower, it is treated as a downgrade.
3. The downgrade is **scheduled** to take effect at the end of the current billing period — the user keeps their current plan until then.
4. The subscription record stores the upcoming plan/bundle as a "scheduled change."
5. When the billing period ends, Stripe applies the new plan automatically.
6. At that point, entitlements are updated to reflect the new (lower) plan's limits.

### 9.2 Why Downgrades Are Deferred

- Users have already paid for the current billing period. It would be unfair to reduce their access before the period they paid for has ended.
- The deferred approach ensures users get the full value of what they have already paid for.

### 9.3 Canceling a Scheduled Downgrade

- At any time before the downgrade takes effect, the user can cancel it.
- This removes the scheduled change. The subscription continues with the current plan as if nothing happened.
- No billing impact — the user simply stays on their current plan.

### 9.4 Downgrade Summary

| Aspect | Behavior |
|--------|----------|
| When it takes effect | At the end of the current billing period |
| Billing impact | No immediate charge; lower price from next cycle |
| Entitlements | Updated only when the new period begins |
| Can be canceled? | Yes, at any time before it takes effect |
| Pending indicator | The subscription shows an "upcoming" plan/bundle |

### 9.5 Downgrade with Exceeded Limits

- If the new plan has lower feature limits than what the organization is currently using, the system does **not** automatically block the downgrade.
- However, once the downgrade takes effect, the organization's entitlements will reflect the new, lower limits.
- Any usage exceeding the new limits will be restricted going forward (the usage counter is not reset).
- The frontend should warn users if a downgrade would reduce their available capacity below their current usage.

---

## 10. Cancellation

### 10.1 User-Initiated Cancellation (End of Period)

- The user requests cancellation of their subscription.
- The subscription is marked to **cancel at the end of the current billing period**.
- The organization continues to have full access until the period ends.
- This is the default cancellation behavior — it is non-destructive and allows the user to change their mind.

### 10.2 System-Initiated Immediate Cancellation

In certain situations, the system cancels a subscription immediately (not at period end):

| Reason | When It Happens |
|--------|----------------|
| **Trial abuse detected** | A duplicate credit card is found across trial subscriptions (see [Trial Abuse Prevention](#13-trial-abuse-prevention)) |
| **Auto-cancel after payment failure** | Grace period has expired after a failed payment (see [Payment Failures](#15-payment-failures-and-grace-period)) |
| **Organization deleted** | The organization itself is deleted |

### 10.3 What Happens When a Subscription is Canceled

- The subscription status changes to **Canceled**.
- Entitlements are revoked (see [Entitlement Revocation](#1410-entitlement-revocation) for details).
- The cancellation reason is recorded (e.g., "user_initiated", "duplicate_card", "auto_cancel_past_due").

---

## 11. Reactivation

### 11.1 Resuming a Canceled Subscription

- If a subscription is set to cancel at the end of the period (but the period has not yet ended), the user can **resume** it.
- Resuming clears the cancellation flag. The subscription continues as if cancellation was never requested.
- No additional charges — the user is already paid through the current period.

### 11.2 Limitations

- Once a subscription has fully ended (the period is over and it is canceled), it cannot be reactivated. The user must create a new subscription.
- Subscriptions that were immediately canceled (e.g., due to abuse detection) cannot be resumed.

---

## 12. Free Trials

### 12.1 How Trials Work

1. Each tool can offer a free trial period (configured as a number of days, e.g., 14 days).
2. The user starts a trial by clicking "Start Trial" for a tool.
3. The system finds the tool's designated **trial plan** (the plan marked as `is_trial_plan`).
4. A subscription is created with a status of **Trialing** and a trial end date.
5. The organization receives full entitlements for the trial plan's features for the duration of the trial.

### 12.2 Trial Eligibility

A user can only start **one trial per tool**, regardless of which organization they are in. Specifically:

- The system checks all organizations the user is a member of (including organizations they have left).
- If any subscription — active, canceled, or even deleted — exists for that tool in any of those organizations, the user is **not eligible** for another trial.
- This rule prevents users from creating new organizations to get repeated free trials.

### 12.3 Card Requirement

- Each tool can be configured to require a credit card on file before starting a trial.
- If `trial_card_required` is enabled for a tool, the user must have a verified payment method before the trial can begin.
- This reduces the risk of trial abuse and ensures a smooth transition to paid plans.

### 12.4 Free Trial Auto-Cancellation

- If the trial plan has a price of **$0** (completely free), the subscription is automatically set to cancel at the end of the trial period.
- This prevents users from receiving indefinite free access after the trial ends.
- If the trial plan has a price greater than $0 (i.e., the user will be charged after the trial), the subscription continues into a paid state automatically.

### 12.5 Upgrading During a Trial

- If a user upgrades from a free trial to a paid plan, the trial ends immediately.
- The user is charged for the paid plan starting from that moment.
- Entitlements are updated to the paid plan's limits.

---

## 13. Trial Abuse Prevention

The platform includes specific measures to prevent users from abusing free trials.

### 13.1 One Trial Per User Per Tool

- As described above, the system tracks trial history across all organizations a user belongs to.
- Even if a user deletes their subscription or leaves an organization, the trial record persists and prevents re-enrollment.

### 13.2 Card Fingerprinting

- When a subscription is created (particularly trials that require a card), the system records a **fingerprint** of the payment card — specifically, the last 8 characters of the card identifier.
- This fingerprint is stored on the subscription record.

### 13.3 Duplicate Card Detection

When a new subscription is created or updated, the system checks for abuse:

1. It looks at all other subscriptions for the **same tool** (across all organizations).
2. If another subscription uses the **same card fingerprint**, this is flagged as potential abuse.
3. The newer subscription is **immediately canceled** with the reason "duplicate_card".
4. An audit event is logged as "TRIAL_ABUSE_DETECTED".

**Exception:** If the matching subscription is a fully paid, active subscription (not a trial), the duplicate card check is bypassed. This handles the legitimate scenario where the same card is used for paid subscriptions across organizations.

### 13.4 Scope of Detection

- The duplicate card check includes **all** subscriptions — active, canceled, and even deleted ones.
- This ensures that someone cannot circumvent detection by canceling their old subscription before starting a new one with the same card.

---

## 14. Entitlements

Entitlements are the core mechanism that controls what features and how much of each feature an organization can use. They bridge the gap between what a plan promises and what an organization actually has access to.

### 14.1 What is an Entitlement?

An entitlement is a per-organization, per-feature record that tracks:

| Field | Description |
|-------|-------------|
| **Feature** | Which feature this entitlement is for (e.g., "Image Generations") |
| **Limit amount** | The maximum allowed value. Null means unlimited. Zero means the feature is disabled. |
| **Usage amount** | How much of the limit has been consumed so far (starts at 0) |
| **Reset period** | How often the usage counter resets: Monthly, Yearly, or Never |
| **Last reset date** | When the usage was last reset to zero |

### 14.2 How Entitlements Are Created (Provisioning)

Entitlements are automatically created or updated whenever one of these events occurs:

| Event | What Happens |
|-------|-------------|
| **New subscription activated** | Entitlements are created for all features in the subscribed plan |
| **Subscription upgraded** | Entitlements are updated to the new plan's higher limits |
| **Trial started** | Entitlements are created for all features in the trial plan |
| **Bundle subscribed** | Entitlements are created for all features across all plans in the bundle |
| **Webhook confirms subscription change** | Entitlements are synchronized based on the new subscription state |
| **Manual sync triggered** | Entitlements are recalculated from the current subscription state |

### 14.3 Provisioning Details for Plans

When entitlements are provisioned for a plan:

1. The system looks up all **plan limits** defined for that plan.
2. For each plan limit:
   - If the feature is **enabled** on the plan, the entitlement's limit is set to the plan's default limit (or unlimited if no numeric limit is defined).
   - If the feature is **disabled** on the plan, the entitlement's limit is set to **zero** (effectively blocking access).
3. The reset period is copied from the plan limit.

### 14.4 Provisioning Details for Bundles

When entitlements are provisioned for a bundle:

1. The system identifies all plans included in the bundle.
2. For **each plan** in the bundle, it provisions entitlements exactly as described above for individual plans.
3. This means the organization gets the combined entitlements of all plans in the bundle.

### 14.5 Entitlement Updates (Upsert Behavior)

When provisioning entitlements, the system handles several scenarios:

- **First-time provisioning:** A new entitlement record is created with usage set to zero.
- **Updating an existing entitlement:** The limit and reset period are updated, but the **usage counter is preserved** (not reset to zero). This means if a user has consumed 30 of 50 image generations and upgrades to a plan with 500, they will have used 30 of 500.
- **Restoring a previously revoked entitlement:** If the entitlement was soft-deleted (e.g., after a cancellation) and is being re-provisioned, the record is restored and the usage counter is reset to zero. The user gets a fresh start.

### 14.6 Usage Tracking

- Every time an organization uses a feature (e.g., generates an image), the `usage_amount` on the corresponding entitlement is incremented.
- Before allowing the action, the system checks whether `usage_amount < limit_amount`. If the usage equals or exceeds the limit, the action is blocked.
- If `limit_amount` is null, the feature is unlimited and usage is not restricted.

### 14.7 Usage Resets

Feature usage counters are periodically reset back to zero based on the reset period.

**How resets work:**
- A background job runs daily (default: 1:00 AM UTC).
- For each entitlement, it checks the `reset_period` and `last_reset_at` date:
  - **Monthly reset:** If 30+ days have passed since the last reset, usage is set to zero and `last_reset_at` is updated.
  - **Yearly reset:** If 365+ days have passed since the last reset, usage is set to zero and `last_reset_at` is updated.
  - **Never:** The usage counter is never automatically reset.
- The number of days for "monthly" (30) and "yearly" (365) resets are configurable by platform administrators.

**Example:**
- An organization on the Premium plan has a limit of 500 image generations per month.
- They have used 487 generations this month.
- On the monthly reset date, their usage is reset to 0, and they have 500 generations available again.

### 14.8 Cascading Limit Updates

When a platform administrator changes a plan limit:

1. The system finds all organizations with active subscriptions to that plan (directly or via a bundle).
2. Each organization's corresponding entitlement is updated with the new limit.
3. This happens immediately and does not wait for a new billing cycle.

**Example:**
- The admin increases the "Image Generations" limit on the Premium plan from 500 to 750.
- All organizations currently subscribed to Premium immediately see their limit change to 750.
- Their current usage is preserved — if they had used 300, they now have 450 remaining (not 750).

### 14.9 Entitlement Caching

- Entitlements are cached for performance. When entitlements are provisioned, updated, or revoked, the cache is invalidated so that the latest values are always used.
- This means changes to entitlements take effect almost instantly across the platform.

### 14.10 Entitlement Revocation

When a subscription is canceled, entitlements may be revoked (soft-deleted):

1. The system determines which tool(s) are associated with the canceled plan or bundle.
2. For each tool, it checks whether the organization has **any other active subscriptions** for that tool (with status Active, Trialing, or Past Due).
3. **If other active subscriptions exist:** Entitlements are **preserved**. The organization still needs them for their other subscription.
4. **If no other active subscriptions exist:** Entitlements for that tool are **revoked** (soft-deleted). The organization loses access to those features.
5. The cache is invalidated.

**Why this matters:** An organization might subscribe to two different plans for the same tool (e.g., through a bundle and a direct plan). Canceling one should not remove access granted by the other.

### 14.11 Entitlements and Organization Deletion

When an organization is deleted, all of its entitlements are automatically removed as part of the cascading deletion process.

### 14.12 Entitlements Lifecycle Summary

```
Plan Created → Plan Limits Defined
                    ↓
Organization Subscribes → Entitlements Provisioned (usage = 0)
                    ↓
Organization Uses Features → Usage Incremented
                    ↓
Reset Period Elapsed → Usage Reset to 0
                    ↓
Plan Upgraded → Entitlements Updated (usage preserved)
                    ↓
Plan Limit Changed by Admin → Entitlements Updated for All Subscribers
                    ↓
Subscription Canceled → Entitlements Revoked (if no other active sub)
                    ↓
Re-Subscription → Entitlements Re-Provisioned (usage = 0)
```

---

## 15. Payment Failures and Grace Period

### 15.1 What Happens When a Payment Fails

1. Stripe attempts to charge the organization's payment method at the start of a billing cycle.
2. If the charge fails, Stripe notifies the platform via a webhook.
3. The subscription status changes to **Past Due**.
4. The timestamp of the failure is recorded.
5. **Service access continues** — the organization is given a grace period to resolve the payment issue.

### 15.2 Grace Period

- The grace period is **3 days** by default (configurable by platform administrators).
- During the grace period, the organization retains full access to all features.
- Stripe will automatically retry the payment during this time with increasing delays between attempts.

### 15.3 Payment Recovery

- If payment succeeds during the grace period (either through Stripe's automatic retry or the customer updating their payment method):
  - The subscription status returns to **Active**.
  - The failure timestamp is cleared.
  - No disruption to service.

### 15.4 Auto-Cancellation After Grace Period

- A background job runs daily (default: midnight UTC) to check for expired grace periods.
- If a subscription has been in **Past Due** status for longer than the grace period:
  1. The subscription is **immediately canceled** in Stripe.
  2. The local subscription status is updated to **Canceled**.
  3. The cancellation reason is recorded as "auto_cancel_past_due".
  4. All entitlements for the subscription's tool(s) are revoked.
  5. An audit event is logged.

### 15.5 Grace Period Timeline

```
Day 0: Payment fails → Status: Past Due → Full access continues
Day 1-3: Stripe retries payment → Grace period active → Full access continues
Day 3: Grace period expires → Auto-cancellation → Access revoked
```

---

## 16. One-Time Purchases

### 16.1 How One-Time Purchases Work

- Some plans may be offered as one-time purchases rather than recurring subscriptions.
- The checkout process is the same, but the Stripe checkout session is in **payment mode** instead of subscription mode.
- After successful payment, a one-time purchase record is created with the amount paid and currency.

### 16.2 One-Time Purchase Record

Each purchase tracks:
- The organization that made the purchase
- The plan or bundle purchased
- The payment amount and currency
- The Stripe payment intent ID (for reference and reconciliation)
- The status (succeeded or refunded)

### 16.3 Organization Deletion Impact

When an organization is deleted, all of its one-time purchase records are also removed as part of the cascading deletion.

---

## 17. Billing Portal

### 17.1 Stripe Customer Portal

- Organizations can access Stripe's self-service billing portal to:
  - View and download invoices
  - Update payment methods
  - View subscription details
- The portal is accessed through a secure session created by the platform.
- After the user finishes in the portal, they are redirected back to the platform.

---

## 18. Invoices and Payment Methods

### 18.1 Invoices

- All invoices are managed by Stripe and accessible through the platform.
- Users can view a list of recent invoices.
- Invoices include details of charges, prorations, and credits.

### 18.2 Payment Methods

- Payment methods (credit cards, etc.) are stored securely by Stripe.
- The platform can retrieve and display saved payment methods.
- Users manage their payment methods through the Stripe billing portal.

---

## 19. Stripe Webhooks and Sync

### 19.1 What Are Webhooks?

Webhooks are automatic notifications sent by Stripe to the platform whenever something happens on the Stripe side (e.g., a payment succeeds, a subscription is updated). The platform listens for these notifications and updates its own records accordingly.

### 19.2 Webhook Security

- Every webhook received is verified using a cryptographic signature to ensure it genuinely came from Stripe and was not tampered with.
- Invalid or unsigned webhooks are rejected.

### 19.3 Duplicate Prevention

- Each webhook event has a unique identifier.
- The system tracks which events have been processed.
- If the same event is received twice (which can happen due to network issues), it is processed only once.

### 19.4 Handled Webhook Events

| Event | What It Triggers |
|-------|-----------------|
| **Checkout completed** | Creates subscription or one-time purchase record; provisions entitlements |
| **Subscription created/updated** | Updates subscription details; re-provisions entitlements; checks for trial abuse |
| **Subscription deleted** | Marks subscription as canceled; revokes entitlements |
| **Payment failed** | Marks subscription as Past Due; records failure timestamp |
| **Payment succeeded** | Restores subscription to Active; clears failure timestamp |

### 19.5 Manual Sync

- Users can trigger a manual sync of their subscription status from Stripe.
- This is useful if the platform's records are out of sync with Stripe (e.g., due to a missed webhook).
- The sync pulls the latest subscription data from Stripe and updates all local records, entitlements, and abuse checks.

---

## 20. Edge Cases and Special Scenarios

### 20.1 Multiple Subscriptions Per Organization

- An organization can have multiple active subscriptions (e.g., one for each tool).
- Each subscription is independent — canceling one does not affect others.
- Entitlements are managed per-tool, so canceling a subscription only revokes features for that specific tool.

### 20.2 Subscription with Both Plan and Bundle

- A subscription must be linked to either a plan **or** a bundle, never both.
- This is strictly enforced at the data level. Attempting to assign both is rejected.
- Similarly, a scheduled downgrade can target either a plan or a bundle, not both.

### 20.3 Organization Deleted with Active Subscriptions

- When an organization is deleted, all subscriptions are soft-deleted as part of the cascade.
- Active Stripe subscriptions should be canceled separately (handled by the deletion flow).
- All entitlements and one-time purchases are also removed.

### 20.4 Same Plan, Different Interval

- A plan can have both monthly and yearly Stripe prices.
- Switching between monthly and yearly billing for the same plan follows upgrade/downgrade logic based on effective price comparison.

### 20.5 Webhook Event Processing Failures

- If a webhook event fails to process (e.g., due to a database error), it is marked as **Failed** with an error message.
- Failed events can be retried if the same webhook is sent again by Stripe (Stripe retries failed webhook deliveries).
- Already-processed events are skipped on retry.

### 20.6 Missing Organization in Webhook

When a webhook is received, the system needs to figure out which organization it belongs to. It checks in this order:

1. Subscription metadata (organization ID stored when the subscription was created)
2. Customer metadata (organization ID stored on the Stripe customer)
3. Existing local subscription record (matched by Stripe subscription ID)

If none of these resolve to an organization, the webhook cannot be processed.

### 20.7 Downgrade to a Plan with Fewer Features

- The system does not prevent a downgrade even if the organization is actively using features that will be lost.
- The downgrade is scheduled as normal.
- When it takes effect, entitlements are updated and the organization may lose access to features they were previously using.
- The frontend should display a warning to users about what they will lose.

### 20.8 Upgrading While a Downgrade is Scheduled

- If an organization has a downgrade scheduled and then performs an upgrade:
  - The upgrade takes effect immediately.
  - The scheduled downgrade is canceled.
  - The organization is now on the upgraded plan with no pending changes.

### 20.9 Re-Subscribing After Cancellation

- After a subscription is fully canceled, the organization can subscribe to any plan or bundle by going through the normal checkout process.
- If they re-subscribe to the same plan, entitlements are re-provisioned with usage reset to zero.
- Previous subscription history is preserved for audit and trial eligibility purposes.

### 20.10 Free Plan Behavior

- Plans with a price of $0 behave like regular plans but without payment processing.
- Free trial plans that are auto-cancelled prevent indefinite free access.
- The system treats $0 plans as "no paid component" for the purpose of trial management.

---

## 21. System Configuration

The following billing-related settings can be adjusted by platform administrators without code changes:

| Setting | Default | Description |
|---------|:-------:|-------------|
| Payment grace period | 3 days | How long to wait after a failed payment before auto-canceling |
| Monthly feature reset interval | 30 days | Number of days between monthly usage resets |
| Yearly feature reset interval | 365 days | Number of days between yearly usage resets |
| Past-due cancellation schedule | Daily at midnight UTC | How often the system checks for expired grace periods |
| Entitlement reset schedule | Daily at 1:00 AM UTC | How often the system checks for features that need usage resets |

---

## 22. Who Can Do What (Billing Permissions)

| Action | Owner | Admin | Member |
|--------|:-----:|:-----:|:------:|
| View subscriptions and billing info | Yes | Yes | Yes |
| View invoices | Yes | Yes | Yes |
| View payment methods | Yes | Yes | Yes |
| Check trial eligibility | Yes | Yes | Yes |
| Start a checkout session | Yes | Yes | No |
| Start a free trial | Yes | Yes | No |
| Cancel a subscription | Yes | Yes | No |
| Resume a canceled subscription | Yes | Yes | No |
| Upgrade or downgrade | Yes | Yes | No |
| Cancel a scheduled downgrade | Yes | Yes | No |
| Cancel a trial | Yes | Yes | No |
| Access Stripe billing portal | Yes | Yes | No |
| Trigger manual sync | Yes | Yes | No |

---
