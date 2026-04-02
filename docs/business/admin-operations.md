# Admin Operations & System Configuration — Business Rules Document

**Platform:** SalesDuo Core Platform
**Last Updated:** April 2026
**Audience:** Non-technical stakeholders, product managers, QA teams

---

## Table of Contents

1. [Overview](#1-overview)
2. [Admin Dashboard and Analytics](#2-admin-dashboard-and-analytics)
3. [System Configuration](#3-system-configuration)
4. [Audit Logging](#4-audit-logging)
5. [RBAC Administration](#5-rbac-administration)
6. [Public API (Pricing Pages)](#6-public-api-pricing-pages)
7. [Background Jobs (Cron)](#7-background-jobs-cron)
8. [Admin Access Control](#8-admin-access-control)

---

## 1. Overview

The Admin Operations module provides platform-wide management capabilities exclusively available to **superusers** (platform administrators). It covers:

- **Dashboard and analytics** — Real-time metrics on users, organizations, subscriptions, and revenue
- **System configuration** — Centralized settings that control platform behavior without code changes
- **Audit logging** — A complete, immutable trail of every significant action on the platform
- **RBAC administration** — Managing which permissions are assigned to each role
- **Public API** — Exposing plan and pricing information to unauthenticated users (e.g., for marketing pages)
- **Background jobs** — Automated tasks that run on a schedule (payment failure handling, usage resets)

All admin functionality is accessed through the admin panel and requires superuser privileges. Regular users (Owner, Admin, Member) cannot access any of these features.

---

## 2. Admin Dashboard and Analytics

The admin dashboard provides a real-time overview of platform health and growth.

### 2.1 Key Metrics

The dashboard displays four primary metric cards:

| Metric | What It Shows |
|--------|---------------|
| **Total Users** | Total number of registered users, new users this month, and month-over-month growth percentage |
| **Active Organizations** | Total number of organizations, new organizations this month, and growth percentage |
| **Active Subscriptions** | Count of subscriptions with Active or Trialing status, new subscriptions this month, and growth percentage |
| **Monthly Recurring Revenue (MRR)** | Total recurring revenue normalized to a monthly figure, new MRR this month, and growth percentage |

### 2.2 How MRR is Calculated

Monthly Recurring Revenue is calculated as follows:

- **Monthly plans:** The plan's full price is counted toward MRR.
- **Yearly plans:** The plan's price is divided by 12 to get the monthly equivalent.
- Only subscriptions with **Active** status are included.
- Subscriptions without a linked plan or with invalid prices are excluded.

**Example:**
- 10 organizations on a $99/month plan = $990 MRR
- 5 organizations on a $948/year plan = 5 x ($948 / 12) = $395 MRR
- **Total MRR:** $1,385

### 2.3 Growth Calculation

Growth percentages are calculated as:

```
Growth % = ((Current Month Count) / (Previous Total)) x 100
```

Special cases:
- If there were zero items at the start of the month but new items were added, growth is shown as 100%.
- If both are zero, growth is shown as 0%.

### 2.4 Charts

The dashboard includes three visualization charts:

| Chart | What It Shows |
|-------|---------------|
| **User Growth** | A line chart showing monthly user registrations over time |
| **Top Tool Usage** | A bar chart showing the 5 most-used tools ranked by total usage count |
| **Revenue Trend** | A line chart showing one-time purchase revenue by month |

### 2.5 Caching

Dashboard metrics are cached for **2 minutes** to improve performance. This means that after a change (e.g., a new user signs up), the dashboard may take up to 2 minutes to reflect the update. There is no manual refresh button — the cache automatically expires.

---

## 3. System Configuration

The platform's behavior is controlled by a set of configurable settings that administrators can change without requiring a code deployment.

### 3.1 How Configuration Works

- All settings are stored in a database table as key-value pairs.
- The platform loads these settings into memory at startup for fast access.
- When a setting is changed, the in-memory cache is refreshed immediately.
- In a multi-server deployment, changes are broadcast to all servers via a message channel, ensuring all instances use the updated values.

### 3.2 Configuration Categories

Settings are organized into categories for easier navigation:

#### Branding

| Setting | Default | Description |
|---------|---------|-------------|
| Brand Color | #ff9900 | Primary brand color used in the interface (hex color code) |
| Brand Name | SalesDuo | The platform name displayed in emails and notifications |

#### Authentication

| Setting | Default | Description |
|---------|---------|-------------|
| Session Duration | 86,400 seconds (24 hours) | How long a login session remains valid. Minimum: 5 minutes. Maximum: 7 days. |
| Password Regex | (pattern) | The regular expression used to validate password strength |
| Password Regex Message | (descriptive text) | The error message shown when a password fails validation |
| Invitation Expiry | 7 days | How long an invitation link remains valid. Range: 1-90 days. |

#### Organization Limits

| Setting | Default | Description |
|---------|---------|-------------|
| User Organization Limit | 5 | Maximum number of organizations a single user can belong to. Minimum: 1. |
| Organization Max Capacity | 50 | Maximum number of members + pending invitations per organization. Minimum: 1. |

#### Payment & Billing

| Setting | Default | Description |
|---------|---------|-------------|
| Payment Grace Period | 3 days | Days to wait after a failed payment before auto-canceling the subscription. Minimum: 0 (immediate cancellation). |

When the grace period is changed, it is **automatically synchronized with Stripe** so that Stripe's retry and dunning behavior matches the platform's expectations.

#### Entitlements

| Setting | Default | Description |
|---------|---------|-------------|
| Monthly Feature Reset Days | 30 | Number of days between monthly usage resets. Minimum: 1. |
| Yearly Feature Reset Days | 365 | Number of days between yearly usage resets. Minimum: 1. |

#### Scheduled Jobs

| Setting | Default | Description |
|---------|---------|-------------|
| Past-Due Cancellation Schedule | Daily at midnight UTC | How often the system checks for subscriptions that have exceeded the grace period |
| Entitlement Reset Schedule | Daily at 1:00 AM UTC | How often the system checks for features that need usage resets |

**Note:** Changes to scheduled job timings require an application restart to take effect.

#### Amazon Integration

| Setting | Default | Description |
|---------|---------|-------------|
| Marketplace Region Map | (built-in mapping) | Maps specific marketplace codes (us, uk, de) to Amazon regions (NA, EU, FE) |
| Seller Central Region URLs | (built-in URLs) | OAuth login URLs for Seller Central, organized by region |
| Vendor Central Region URLs | (built-in URLs) | OAuth login URLs for Vendor Central, organized by region |
| Amazon Token URL | (Amazon's URL) | The endpoint used to exchange OAuth codes for tokens |
| Amazon Ads Auth URL | (Amazon's URL) | The Advertising API authorization endpoint |
| Amazon Ads Scope | advertising::campaign_management | The OAuth permissions requested for Advertising access |

#### Slack Integration

| Setting | Default | Description |
|---------|---------|-------------|
| Slack Bot Scopes | chat:write, users:read, etc. | The OAuth permissions requested from Slack |
| Slack Authorize URL | (Slack's URL) | The Slack OAuth authorization endpoint |
| Slack Token URL | (Slack's URL) | The Slack token exchange endpoint |
| Slack Redirect URI | (platform callback URL) | Where Slack redirects after authorization |
| Default Channel Name | salesduo-notifications | The channel created when Slack is first connected |

### 3.3 Validation Rules

Every configuration value is validated before it is saved:

| Type | Validation |
|------|-----------|
| **Integer settings** | Must be a valid number within the specified min/max range |
| **JSON settings** | Must be valid JSON and must be an object (not an array or primitive) |
| **Cron expressions** | Must have exactly 5 space-separated fields (minute, hour, day, month, weekday) |
| **Color settings** | Must be a valid 6-digit hex color code (e.g., `#ff9900`) |
| **Regex settings** | Must be a valid regular expression |

If validation fails, the setting is not saved and an error message is returned.

---

## 4. Audit Logging

The platform maintains a comprehensive, immutable audit trail of all significant actions.

### 4.1 What Makes Audit Logs Special

- **Immutable:** Once an audit log entry is created, it can never be modified or deleted. This ensures a trustworthy record for compliance and security investigations.
- **Non-blocking:** If the audit system encounters an error, the main operation still completes. Audit logging never interrupts user workflows.
- **Dual recording:** Audit events are recorded both in the platform's database and in an analytics system (Mixpanel) for additional reporting capabilities.

### 4.2 What is Logged

Audit logs cover the entire platform. Key categories include:

| Category | Example Actions |
|----------|----------------|
| **Authentication** | Login, logout, registration, password reset, OTP verification |
| **Organization** | Organization created, updated, deleted |
| **User** | Profile updated, password changed, account deleted |
| **Billing** | Subscription created, canceled, payment failed, auto-canceled |
| **Catalog** | Plan created, tool updated, feature deleted, bundle modified |
| **System** | Configuration changed, cron job executed, webhook processed |

### 4.3 What Each Log Entry Contains

| Field | Description |
|-------|-------------|
| **Event ID** | A unique identifier for each log entry |
| **Actor** | Who performed the action (user name and email, or "System" for automated actions) |
| **Action** | The action code (e.g., "UPDATE_ROLE_PERMISSIONS", "AUTO_CANCEL_SUBSCRIPTION") |
| **Entity Type** | What type of object was affected (e.g., "User", "Subscription", "Role") |
| **Entity ID** | The specific object's identifier |
| **Source** | Which service generated the log (e.g., "Core Platform", "Listing Generator") |
| **IP Address** | The IP address of the actor |
| **Timestamp** | When the action occurred |
| **Details** | Additional context as structured data (e.g., old values vs. new values, reasons) |

### 4.4 Filtering and Searching

Administrators can filter audit logs by:

- **Action category** (Authentication, Organization, Billing, etc.)
- **Specific action** (e.g., only "AUTO_CANCEL_SUBSCRIPTION")
- **Entity type** (e.g., only events affecting "Subscription" entities)
- **Source** (e.g., only events from "Core Platform" or from a specific tool)
- **Date range** (start and end date/time)
- **Free text search** (searches across action names, entity types, entity IDs, actor names, and emails)

### 4.5 Action Categories

The system dynamically groups audit actions into categories based on naming patterns:

| Category | Actions Matching |
|----------|------------------|
| **Auth** | Actions containing LOGIN, LOGOUT, REGISTER, AUTH, OTP, PASSWORD |
| **Organization** | Actions containing ORG, ORGANIZATION |
| **User** | Actions containing USER |
| **Billing** | Actions containing SUBSCRIPTION, PAYMENT, INVOICE, BILLING |
| **Catalog** | Actions containing PLAN, TOOL, FEATURE, BUNDLE, ENTITLEMENT |
| **Creatives** | Actions containing PROJECT, IMAGE, QUICK_FLOW, BRANDIFY, etc. |
| **System** | Actions containing SYSTEM, CRON, WEBHOOK |
| **Other** | Actions that don't match any of the above |

### 4.6 Source Filtering

- **"Core Platform"** shows audit logs generated by the main platform (user actions, billing events, system operations).
- **Other sources** show audit logs generated by external tool services (e.g., a listing generator tool recording its own actions via the Internal API).
- **"All Sources"** shows everything.

---

## 5. RBAC Administration

RBAC (Role-Based Access Control) administration allows superusers to view and modify the permissions assigned to each role.

### 5.1 Viewing Roles and Permissions

The RBAC page shows each role (Owner, Admin, Member) as a card, with all available permissions listed as checkboxes. Permissions are grouped by category for easier scanning.

### 5.2 Modifying Role Permissions

- Superusers can add or remove permissions from any role by checking or unchecking the corresponding checkboxes.
- Changes are saved per role with a "Save Changes" button.
- When permissions are updated, the **entire permission set is replaced** — the system receives the full list of permissions that should be assigned to the role.

### 5.3 Audit Trail for Permission Changes

Every permission change is logged with:
- The role that was modified
- The **previous** set of permissions (before the change)
- The **new** set of permissions (after the change)

This allows administrators to review exactly what changed and when.

### 5.4 Effect of Permission Changes

When a role's permissions are changed, the effect is **immediate**:
- All users with that role will see the updated permissions the next time they load a page or make an API request.
- No logout or session refresh is required.
- The frontend dynamically shows or hides UI elements based on the user's current permissions.

---

## 6. Public API (Pricing Pages)

The platform exposes certain data publicly (without requiring authentication) for use on marketing websites and pricing pages.

### 6.1 What is Publicly Available

| Endpoint | What It Returns |
|----------|----------------|
| **Public Plans** | All active plans with their prices, features, limits, trial information, and associated tool details |
| **Public Bundles** | All active bundle groups with their bundles, included plans, features, and limits |

### 6.2 Filtering

- Only **active** plans, bundles, and bundle groups are returned.
- Only tools that are **active** are included.
- Plans are sorted by price (lowest first) within their tool group.
- Bundle groups are sorted by creation date.

### 6.3 Data Enrichment

Each plan includes all of its associated data in a single response:
- Tool name and description
- Trial configuration (days, card required)
- All features with their limits and reset periods
- Stripe pricing information

This allows a marketing page to render a complete pricing comparison table from a single API call.

---

## 7. Background Jobs (Cron)

The platform runs two automated background jobs on a configurable schedule.

### 7.1 Job 1: Past-Due Subscription Cancellation

**Default Schedule:** Daily at midnight UTC

**Purpose:** Automatically cancel subscriptions that have failed to pay within the grace period.

**How it works:**

1. The job retrieves the grace period setting (default: 3 days).
2. It finds all subscriptions where:
   - Status is **Past Due**
   - The last payment failure occurred more than [grace period] days ago
3. For each overdue subscription:
   - The subscription is canceled immediately in Stripe.
   - The local subscription status is updated to **Canceled**.
   - The cancellation reason is recorded as "auto_cancel_past_due".
   - All entitlements for the subscription's tool(s) are revoked.
   - An audit log entry is created with full details.

**Error handling:**
- If one subscription fails to cancel (e.g., Stripe is temporarily unavailable), the job continues with the remaining subscriptions.
- Errors are logged for each individual subscription but do not stop the entire job.

### 7.2 Job 2: Entitlement Usage Reset

**Default Schedule:** Daily at 1:00 AM UTC

**Purpose:** Reset feature usage counters based on their reset period.

**How it works:**

1. The job retrieves the reset interval settings:
   - Monthly reset interval (default: 30 days)
   - Yearly reset interval (default: 365 days)
2. It finds all entitlements where:
   - The reset period is **Monthly** and the last reset was more than 30 days ago, OR
   - The reset period is **Yearly** and the last reset was more than 365 days ago
   - AND the usage amount is greater than 0 (no point resetting something already at 0)
3. For each matching entitlement:
   - Usage is set back to 0.
   - The "last reset" timestamp is updated to now.
4. If any resets were performed, an audit log entry is created recording how many entitlements were reset.

### 7.3 Distributed Execution Safety

In a multi-server deployment, both jobs use a locking mechanism to ensure they only run once, even if multiple servers trigger them at the same time:

- Before executing, each job attempts to acquire a temporary lock (valid for 5 minutes).
- If the lock is already held (another server is running the job), the duplicate attempt exits silently.
- This prevents situations like a subscription being canceled twice or a usage counter being reset multiple times.

### 7.4 Configuration

Both the schedule and thresholds for these jobs are configurable through the System Configuration panel (see [System Configuration](#3-system-configuration)).

---

## 8. Admin Access Control

### 8.1 Who Can Access Admin Features

Only **superusers** can access admin functionality. Superuser status is:

- Configured via an environment variable listing designated email addresses.
- Synchronized at every login — if an email is added to or removed from the list, the change takes effect when the user next logs in.
- Completely separate from organization-level roles (Owner, Admin, Member).

### 8.2 What Superusers Can Do

| Capability | Description |
|------------|-------------|
| View all users | See every user across the platform |
| Manage users | Update user details, grant/revoke superuser status, delete accounts |
| View all organizations | See every organization and its details |
| Manage organizations | Update or delete any organization |
| View dashboard | Access real-time analytics and charts |
| Manage system configuration | Change any platform-wide setting |
| View audit logs | Search and filter the complete audit trail |
| Manage RBAC | Modify role-permission mappings |
| Manage tools | Create, update, and delete tools |
| Manage plans and bundles | Create, update, and delete pricing configurations |
| Manage features and entitlements | Define and modify feature limits |

### 8.3 Superuser Restrictions

- A superuser **cannot revoke their own superuser status** through the admin panel. This prevents accidental lockout.
- A superuser **cannot delete another superuser** through the admin panel.

---

*End of Document*
