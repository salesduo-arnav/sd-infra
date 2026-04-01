# Tools & Internal Service API — Business Rules Document

**Platform:** SalesDuo Core Platform
**Last Updated:** April 2026
**Audience:** Non-technical stakeholders, product managers, QA teams

---

## Table of Contents

### Part 1: Tools
1. [What is a Tool?](#1-what-is-a-tool)
2. [Tool Properties](#2-tool-properties)
3. [Tool Lifecycle](#3-tool-lifecycle)
4. [Required Integrations](#4-required-integrations)
5. [Tool Usage Tracking](#5-tool-usage-tracking)
6. [Tool-to-Plan Relationship](#6-tool-to-plan-relationship)
7. [Tool Deletion Rules](#7-tool-deletion-rules)

### Part 2: Internal Service API
8. [Overview](#8-overview)
9. [Authentication](#9-authentication)
10. [Organization Data Lookups](#10-organization-data-lookups)
11. [Entitlement Checking and Consumption](#11-entitlement-checking-and-consumption)
12. [Usage Tracking](#12-usage-tracking)
13. [Email Dispatch](#13-email-dispatch)
14. [Slack Messaging](#14-slack-messaging)
15. [Audit Log Creation](#15-audit-log-creation)
16. [Edge Cases](#16-edge-cases)

---

# Part 1: Tools

## 1. What is a Tool?

A tool is a product or application offered through the SalesDuo platform. Each tool represents a distinct capability — for example, "Listing Generator" for creating Amazon product listings using AI, or "Campaign Manager" for managing advertising campaigns.

Tools are the central organizing concept of the platform. Plans, features, subscriptions, and integrations all revolve around tools:

- Each **plan** belongs to one tool (you subscribe to a plan to get access to a tool).
- Each **feature** belongs to one tool (features define what a tool can do and how much).
- Each **integration requirement** is defined per tool (some tools need Amazon Seller Central, others need Advertising).
- **Usage** is tracked per tool (how often each tool is used).

---

## 2. Tool Properties

Each tool has the following properties:

| Property | Description |
|----------|-------------|
| **Name** | The display name shown to users (e.g., "Listing Generator") |
| **Slug** | A URL-friendly identifier (e.g., `listing-generator`). Must be unique across all active tools. Cannot be changed after creation. |
| **Description** | A marketing description of what the tool does |
| **Tool Link** | An optional external URL to the tool (if it is hosted separately) |
| **Active** | Whether the tool is available to users. Inactive tools are hidden from the interface. |
| **Trial Days** | How many days of free trial are offered (0 means no trial). |
| **Trial Card Required** | Whether a credit card must be on file before starting a trial. |
| **Required Integrations** | A list of third-party integrations needed to use the tool (e.g., Seller Central, Advertising API). |

---

## 3. Tool Lifecycle

### 3.1 Creating a Tool

- Platform administrators create tools through the admin panel.
- A name and unique slug are required.
- If required integrations are specified, they are validated:
  - Valid integration types: `sp_api` (Seller or Vendor Central), `sp_api_sc` (Seller Central only), `sp_api_vc` (Vendor Central only), `ads_api` (Amazon Advertising)
  - You cannot require both `sp_api_sc` and `sp_api_vc` for the same tool (mutual exclusivity).
  - You cannot use `sp_api` (generic) alongside `sp_api_sc` or `sp_api_vc` (specific).

### 3.2 Updating a Tool

- Administrators can update any tool property.
- If the slug is changed, it must still be unique.
- Changes to trial settings (days, card required) affect future trials only — existing trials are not modified.

### 3.3 Deactivating vs. Deleting

- **Deactivating** (`is_active = false`): Hides the tool from users but preserves all data, plans, and subscriptions. The tool can be reactivated later. This is the preferred approach for temporarily removing a tool.
- **Deleting**: Permanently removes the tool (soft delete). See [Tool Deletion Rules](#7-tool-deletion-rules).

---

## 4. Required Integrations

### 4.1 How It Works

Each tool can declare which integrations must be connected before a user can access it. For example:

| Tool | Required Integrations |
|------|-----------------------|
| Listing Generator | Seller Central |
| Campaign Manager | Seller Central + Advertising |
| Vendor Analytics | Vendor Central |
| Notification Hub | (none) |

### 4.2 What Happens When a User Opens a Tool

1. The system checks the tool's required integrations.
2. It compares them against the organization's connected integrations.
3. **If all are connected:** The user goes directly to the tool.
4. **If any are missing:** The user is redirected to the Integration Onboarding page, which guides them through connecting the required services.
5. **If no integrations are required:** The user goes directly to the tool (no onboarding step).

### 4.3 Validation Rules

| Integration Code | What It Means |
|------------------|---------------|
| `sp_api` | Either Seller Central or Vendor Central (the user can choose) |
| `sp_api_sc` | Specifically Seller Central only |
| `sp_api_vc` | Specifically Vendor Central only |
| `ads_api` | Amazon Advertising API |

**Conflict rules:**
- A tool cannot require both `sp_api_sc` and `sp_api_vc` (they are mutually exclusive on Amazon).
- A tool cannot use `sp_api` (generic) alongside `sp_api_sc` or `sp_api_vc` (specific).

---

## 5. Tool Usage Tracking

### 5.1 What is Tracked

Every time a user performs a significant action with a tool (e.g., generates a listing, runs a campaign analysis), a usage event is recorded. Each event captures:

| Data Point | Description |
|------------|-------------|
| **Tool** | Which tool was used |
| **User** | Who used it |
| **Organization** | Which organization they were acting on behalf of |
| **Date** | The calendar date of usage |
| **Count** | How many times the tool was used that day |

### 5.2 How Counting Works

- Usage is aggregated **daily**. There is one record per tool-user-organization-date combination.
- The first use on a given day creates a new record with a count of 1.
- Each subsequent use on the same day increments the count by 1.
- The counting is atomic — even if multiple requests arrive at the exact same time, each one is counted correctly without duplicates or losses.

### 5.3 Fire-and-Forget

- Usage tracking is designed to never interrupt the user's workflow. If the tracking system encounters an error (e.g., a database issue), the error is logged internally but the user's action still completes successfully.
- Users never see usage tracking errors.

### 5.4 Analytics

- Platform administrators can view tool usage analytics on the admin dashboard.
- The dashboard shows the **top 5 most-used tools** ranked by total usage count.
- Usage data is retained indefinitely for historical reporting.

---

## 6. Tool-to-Plan Relationship

Tools, plans, features, and entitlements form a hierarchy:

```
Tool
 ├── Feature A (e.g., "Image Generations")
 ├── Feature B (e.g., "Advanced Reporting")
 │
 ├── Plan 1: Basic ($29/month)
 │    ├── Feature A: 50 per month
 │    └── Feature B: Disabled
 │
 ├── Plan 2: Premium ($99/month)
 │    ├── Feature A: 500 per month
 │    └── Feature B: Enabled
 │
 └── Plan 3: Diamond ($249/month)
      ├── Feature A: Unlimited
      └── Feature B: Enabled
```

- Each tool can have multiple plans at different price points.
- Each tool can have multiple features that define its capabilities.
- Plan limits connect plans to features and define how much of each feature is available.
- When an organization subscribes to a plan, they receive entitlements that match the plan limits.

For full details on plans, features, and entitlements, see the [Pricing and Billing](pricing-and-billing.md) document.

---

## 7. Tool Deletion Rules

### 7.1 When Deletion is Blocked

A tool **cannot be deleted** if any of the following conditions are true:

- There are subscriptions with status **Active**, **Trialing**, or **Past Due** for any plan belonging to the tool.
- There are subscriptions for any **bundle** that includes a plan belonging to the tool.

The system checks both direct plan subscriptions and bundle subscriptions before allowing deletion.

### 7.2 What Happens When a Tool is Deleted

If deletion is allowed (no active subscriptions), the following cascade occurs:

1. All **features** belonging to the tool are soft-deleted.
2. All **plans** belonging to the tool are soft-deleted.
3. All **plan limits** associated with those plans are soft-deleted.
4. All **organization entitlements** for those features are soft-deleted.
5. The tool itself is soft-deleted.

All of this happens within a single transaction — if any step fails, nothing is deleted.

---

# Part 2: Internal Service API

## 8. Overview

The Internal Service API is a set of endpoints that allow the platform's individual tools (which may run as separate services) to communicate with the core platform. It provides capabilities like:

- Looking up organization details and members
- Checking subscriptions and entitlements
- Consuming entitlements (deducting usage from limits)
- Recording tool usage
- Sending emails
- Sending Slack messages and files
- Creating audit log entries

This API is **not accessible to end users** — it is exclusively for service-to-service communication between the platform's internal components.

---

## 9. Authentication

### 9.1 How Internal Services Authenticate

Internal services authenticate using an **API key**, not user sessions. Each request must include:

| Header | Purpose |
|--------|---------|
| **X-Service-Key** | The API key that proves the request is from an authorized internal service |
| **X-Service-Name** | The name of the calling service (e.g., "listing-generator-service") — used for audit trail attribution |

### 9.2 Validation

- If the API key header is missing, the request is rejected with **"Service authentication required"**.
- If the API key does not match the expected value, the request is rejected with **"Invalid service key"**.
- The service name is attached to the request context and appears in audit logs, so you can trace which service performed each action.

---

## 10. Organization Data Lookups

Internal services can retrieve information about organizations:

### 10.1 Get Organization Details

Retrieves basic information about an organization including its name, status, and creation date. Returns an error if the organization does not exist.

### 10.2 Get Organization Members

Retrieves a list of all active members in an organization, including each member's name, email, role, and join date. Only active (non-deleted) members are returned.

### 10.3 Get Subscription

Retrieves the organization's current subscription, including plan or bundle details, subscription status, trial dates, and billing period dates. Returns an error if no subscription exists.

---

## 11. Entitlement Checking and Consumption

This is the most critical part of the Internal API — it controls whether an organization is allowed to use a specific feature and tracks how much they have used.

### 11.1 Listing Entitlements

A service can retrieve all entitlements for an organization, which shows:
- Which features the organization has access to
- The limit for each feature (e.g., 500 image generations per month)
- How much has been used so far (e.g., 327 out of 500)
- The reset period (monthly, yearly, or never)

### 11.2 Consuming an Entitlement

When a tool wants to perform an action that is subject to a limit (e.g., generating an image), it calls the entitlement consumption endpoint. This performs two operations atomically (as a single, indivisible action):

1. **Check:** Is the organization allowed to perform this action? (Is usage below the limit?)
2. **Consume:** If allowed, increment the usage counter.

**How the check works:**

| Scenario | Result |
|----------|--------|
| No entitlement exists for this feature | Denied — reason: "no entitlement" |
| Limit is null (unlimited) | Allowed — always |
| Current usage + requested amount > limit | Denied — reason: "limit exceeded" |
| Current usage + requested amount <= limit | Allowed — usage incremented |

**What the response includes:**

- Whether the action is **allowed** or **denied**
- The current usage amount (after the increment, if allowed)
- The limit amount
- The reason for denial (if denied)

### 11.3 Thread Safety

The consumption check uses database-level locking to ensure correctness even when multiple requests arrive simultaneously. This prevents a scenario where two concurrent requests both pass the limit check and both increment, potentially exceeding the limit.

### 11.4 Example Scenario

1. Organization "Acme Corp" has an entitlement for "Image Generations" with a limit of 100 and current usage of 98.
2. A user generates an image. The tool calls the consume endpoint with `amount: 1`.
3. The system checks: 98 + 1 = 99, which is <= 100. **Allowed.** Usage becomes 99.
4. Another user generates an image. The tool calls consume again.
5. The system checks: 99 + 1 = 100, which is <= 100. **Allowed.** Usage becomes 100.
6. A third user tries to generate an image.
7. The system checks: 100 + 1 = 101, which is > 100. **Denied.** Reason: "limit exceeded."

---

## 12. Usage Tracking

Internal services can record tool usage events. This works the same way as the user-facing usage tracking described in [Part 1](#5-tool-usage-tracking):

- The service provides the tool identifier (UUID or slug), organization ID, and optionally a user ID.
- The system finds or creates a daily usage record and increments the count.
- This is fire-and-forget — errors do not affect the calling service's operation.

The service name that made the request is recorded alongside the usage event for attribution.

---

## 13. Email Dispatch

Internal services can send transactional emails through the platform's email system.

### 13.1 What Can Be Sent

| Field | Required | Description |
|-------|----------|-------------|
| **To** | Yes | One or more email addresses |
| **Subject** | Yes | The email subject line |
| **HTML body** | One of these | Rich HTML email content |
| **Text body** | One of these | Plain text email content |

At least one of HTML body or text body must be provided.

### 13.2 Use Cases

- Tool completion notifications (e.g., "Your report is ready")
- Alert emails (e.g., "Your campaign budget is running low")
- Scheduled report delivery

---

## 14. Slack Messaging

Internal services can send messages and files through the organization's connected Slack workspace.

### 14.1 Available Operations

| Operation | Description |
|-----------|-------------|
| **Send to channel** | Post a message to a Slack channel. If no channel is specified, the organization's default notification channel is used. |
| **Send to user** | Send a direct message to a specific Slack user (identified by email or Slack user ID). |
| **Upload file to channel** | Share a file (report, image, etc.) in a channel. |
| **Upload file to user** | Share a file directly with a specific user. |
| **List channels** | Get a list of all channels in the organization's Slack workspace. |
| **Look up user** | Find a Slack user by their email address. |

### 14.2 Auto-Join Behavior

If the SalesDuo bot is not a member of the target channel, it automatically joins the channel before sending the message. This means tools do not need to worry about channel membership — the bot handles it.

### 14.3 Disconnection Handling

If the organization's Slack integration has been disconnected or the token has been revoked, the messaging attempt returns an error. The calling service receives a clear indication that Slack is not available, and the Slack integration is automatically marked as "Disconnected."

### 14.4 File Size Limit

Files uploaded through Slack must be under **50 MB** (after decoding from base64).

---

## 15. Audit Log Creation

Internal services can create audit log entries to record significant actions performed by the tool.

### 15.1 What Can Be Logged

| Field | Required | Description |
|-------|----------|-------------|
| **Action** | Yes | A descriptive action name (e.g., "GENERATE_LISTING", "CAMPAIGN_CREATED") |
| **Entity type** | Yes | The type of entity affected (e.g., "Listing", "Campaign") |
| **Entity ID** | Yes | The identifier of the affected entity |
| **Actor ID** | No | The user who performed the action (if known) |
| **Details** | No | Additional context as structured data |
| **IP address** | No | The client's IP address |

### 15.2 Source Attribution

The calling service's name (from the `X-Service-Name` header) is automatically added to the audit log details as the "source." This allows platform administrators to filter audit logs by which service generated them (e.g., "Core Platform" vs. "Listing Generator" vs. "Campaign Manager").

---

## 16. Edge Cases

### 16.1 Entitlement Consumption with No Subscription

If an organization has never subscribed to a plan for a particular tool, they will have no entitlements for that tool's features. Any consumption attempt will be denied with the reason "no entitlement."

### 16.2 Unlimited Features

Some features have a null limit, meaning they are unlimited. For these features, the consumption endpoint always returns "allowed" regardless of how much has been used. Usage is still tracked for analytics purposes.

### 16.3 Tool Identified by Slug or UUID

When tracking usage or looking up tools, internal services can provide either the tool's UUID or its slug (e.g., `listing-generator`). The system tries UUID first, then falls back to slug lookup.

### 16.4 Slack Not Connected

If an internal service tries to send a Slack message but the organization has not connected Slack, the request returns an error indicating that no Slack integration was found. The calling service should handle this gracefully (e.g., fall back to email notification).

### 16.5 Email Delivery Failures

If the email service encounters a delivery failure (e.g., invalid email address, SMTP server unreachable), the error is returned to the calling service. The calling service decides how to handle it (e.g., retry, log, or notify the user through another channel).

---

*End of Document*
