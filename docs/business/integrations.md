# Integrations — Business Rules Document

**Platform:** SalesDuo Core Platform
**Last Updated:** April 2026
**Audience:** Non-technical stakeholders, product managers, QA teams

---

## Table of Contents

1. [Overview](#1-overview)
2. [Integration Accounts](#2-integration-accounts)
3. [Account Groups](#3-account-groups)
4. [Global Integrations](#4-global-integrations)
5. [Amazon Seller Central (SP-API)](#5-amazon-seller-central-sp-api)
6. [Amazon Vendor Central (SP-API)](#6-amazon-vendor-central-sp-api)
7. [Amazon Advertising API](#7-amazon-advertising-api)
8. [Slack Integration](#8-slack-integration)
9. [Integration Onboarding for Tools](#9-integration-onboarding-for-tools)
10. [Credential Security](#10-credential-security)
11. [Regions and Marketplaces](#11-regions-and-marketplaces)
12. [Edge Cases and Special Scenarios](#12-edge-cases-and-special-scenarios)
13. [Audit Logging](#13-audit-logging)
14. [Rate Limiting](#14-rate-limiting)

---

## 1. Overview

The Integrations module manages your organization's connections to third-party services. It acts as a secure "connection hub" that stores and manages access credentials to:

- **Amazon Seller Central** — for sellers managing their own inventory on Amazon
- **Amazon Vendor Central** — for vendors supplying products wholesale to Amazon
- **Amazon Advertising** — for managing ad campaigns and accessing advertising data
- **Slack** — for receiving notifications and alerts in your Slack workspace

These connections are required by the platform's tools. For example, an inventory management tool needs a Seller Central connection to access your product catalog.

Integrations are managed at the **organization level** — when you connect an Amazon account, all members of your organization can use tools that rely on that connection.

There are two types of integrations:

| Type | Examples | Scope |
|------|----------|-------|
| **Account-level integrations** | Amazon Seller Central, Vendor Central, Advertising | One per marketplace account; you can have many |
| **Global integrations** | Slack | One per organization; applies to the whole team |

---

## 2. Integration Accounts

An integration account represents a single marketplace connection (e.g., one Amazon Seller Central account) linked to your organization.

### 2.1 Account Properties

Each integration account tracks:

- **Account Name** — A label you choose (e.g., "US Main Account", "EU Brand B")
- **Marketplace** — Which e-commerce platform (currently Amazon; Walmart support is planned)
- **Region** — The geographic marketplace region (e.g., US, UK, Germany, Japan)
- **Integration Type** — Which specific service:
  - `sp_api_sc` — Seller Central
  - `sp_api_vc` — Vendor Central
  - `ads_api` — Amazon Advertising
- **Status** — Current connection state
- **Connected At** — When the account was last successfully authenticated

### 2.2 Account Statuses

| Status | Meaning |
|--------|---------|
| **Connected** | Authenticated and working. Tools can access this account. |
| **Disconnected** | Not authenticated. Needs to go through the login process. |
| **Connecting** | Authentication is in progress (user is currently on Amazon's login page). |
| **Error** | Authentication failed or tokens expired. Needs to be reconnected. |

### 2.3 Account Rules

- **No exact duplicates:** You cannot create two accounts with the same name, region, marketplace, and integration type within one organization.
- **Seller/Vendor mutual exclusivity:** An account group (same name + region) **cannot** have both a Seller Central and a Vendor Central connection. Amazon does not allow an entity to operate as both a seller and a vendor in the same region. The system enforces this — if you connect Seller Central, the Vendor Central option is hidden, and vice versa.
- **Soft deletion:** When you delete an account, it is marked as deleted but retained in the database for audit purposes. Deleted accounts do not appear in the interface.
- **Organization cascade:** If your organization is deleted, all integration accounts are automatically removed.

---

## 3. Account Groups

Account groups are logical containers that automatically bundle multiple integration accounts that share the same name, region, and marketplace.

### 3.1 How Groups Work

When you create an integration account named "US Main" in the US region for Seller Central, a group called "US Main" is automatically created. If you later add an Advertising connection for the same "US Main" account in the US region, it joins the same group.

**Example group:**
- **Group: "US Main" (Region: US, Marketplace: Amazon)**
  - Seller Central — Connected
  - Advertising API — Connected

### 3.2 Group Rules

- **Automatic creation:** Groups are created automatically when you set up your first account. You never create them manually.
- **Automatic cleanup:** If you delete all accounts in a group, the group itself is automatically deleted.
- **Single region:** Each group represents one region. "US Main" in the US is a separate group from "US Main" in the UK.
- **Seller/Vendor exclusivity applies per group:** Within one group, you can have either Seller Central or Vendor Central, but not both.

---

## 4. Global Integrations

Global integrations connect your organization to services that apply across the entire team, not tied to a specific marketplace account.

### 4.1 How They Differ from Account Integrations

| Aspect | Account Integration | Global Integration |
|--------|--------------------|--------------------|
| **Scope** | One marketplace account | Entire organization |
| **Can have multiple?** | Yes (many Amazon accounts) | No (one per service type) |
| **Example** | "US Seller Central" | "Company Slack Workspace" |
| **Who benefits** | Users working with that marketplace | All organization members |

### 4.2 Global Integration Rules

- **One per service:** You can only have one Slack connection per organization. Reconnecting replaces the previous connection.
- **Organization-wide:** When connected, the integration applies to everyone in the organization.
- **Soft deletion:** Disconnecting a global integration clears its credentials and marks it as disconnected but does not delete the record.

---

## 5. Amazon Seller Central (SP-API)

### 5.1 What It Is

Seller Central is Amazon's portal for individual sellers and selling partners. Connecting it allows the platform's tools to access your product catalog, inventory, orders, and other selling data.

### 5.2 Connection Process

1. You click **"Connect Seller Central"** on the integrations page or during tool onboarding.
2. The system generates a unique security code and marks your account as "Connecting."
3. Your browser opens Amazon's official login page (the address bar shows amazon.com).
4. You enter your Amazon credentials and review the permissions SalesDuo is requesting.
5. You click **"Approve"** to authorize access.
6. Amazon redirects you back to SalesDuo with an authorization code.
7. The platform exchanges this code for access tokens (done automatically in the background).
8. The tokens are encrypted and stored securely. Your account status becomes **"Connected."**

### 5.3 What Happens Behind the Scenes

- The platform receives two tokens: an **access token** (short-lived, used for API calls) and a **refresh token** (long-lived, used to get new access tokens when the current one expires).
- Both tokens are encrypted using AES-256 encryption before being stored in the database.
- Amazon also provides a **Selling Partner ID** — a unique identifier for your seller account — which is stored alongside the tokens.

### 5.4 Token Refresh

- Access tokens expire after a short period (typically hours).
- When a tool tries to use your account and finds the token expired, it automatically uses the refresh token to get a new access token. This happens silently — you do not need to do anything.
- If the refresh fails (e.g., because you revoked access in Amazon's settings), your account status changes to **"Error"** and you need to reconnect manually.

---

## 6. Amazon Vendor Central (SP-API)

### 6.1 What It Is

Vendor Central is Amazon's portal for vendors who sell products wholesale to Amazon. Connecting it allows tools to access your vendor-specific data such as purchase orders, shipments, and retail analytics.

### 6.2 Connection Process

The connection process is identical to Seller Central (see above), except:
- You click **"Connect Vendor Central"** instead.
- The authorization URL points to Amazon's Vendor Central domain for your region.
- The same token exchange and encryption process applies.

### 6.3 Seller vs. Vendor Exclusivity

This is a critical business rule:

**An account group cannot have both Seller Central and Vendor Central.**

Amazon treats sellers and vendors as fundamentally different business relationships. A single entity cannot be both a seller and a vendor in the same marketplace region. The platform enforces this:

- If you have connected Seller Central for an account group, the option to add Vendor Central is hidden.
- If you have connected Vendor Central, the option to add Seller Central is hidden.
- Attempting to bypass this (e.g., via API) returns an error: *"This account group already has Seller Central. An Amazon entity cannot have both Seller Central and Vendor Central."*

---

## 7. Amazon Advertising API

### 7.1 What It Is

The Amazon Advertising API provides access to your ad campaign data, allowing tools to analyze performance, manage bids, and create campaigns.

### 7.2 Connection Process

1. You click **"Connect Advertising"** in the integrations setup.
2. A popup window opens to Amazon's Advertising authorization screen.
3. You log in and approve the requested permissions.
4. The popup sends a confirmation message back to the platform.
5. The platform exchanges the authorization code for tokens and stores them encrypted.
6. Your advertising account status becomes **"Connected."**

### 7.3 Key Differences from SP-API

- The Advertising API uses a **separate OAuth flow** from Seller/Vendor Central. You need to authorize it independently.
- There is **no exclusivity rule** between Advertising and Seller/Vendor Central. You can (and typically should) have both connected for the same account group.
- Each Advertising account can have multiple advertising profiles (brands). Tools let you select which profiles to work with.

### 7.4 Multiple Advertising Accounts

You can connect multiple Advertising accounts across different regions or seller entities:
- "Main Brand - US" (Advertising)
- "Main Brand - EU" (Advertising)
- "Partner Brand - US" (Advertising)

Each has its own independent connection status and credentials.

---

## 8. Slack Integration

### 8.1 What It Is

The Slack integration connects your SalesDuo organization to your Slack workspace, enabling tools to send notifications, alerts, and files directly to Slack channels or individual users.

### 8.2 Connection Process

1. You click **"Connect Slack"** on the integrations page.
2. A popup window opens to Slack's authorization page.
3. You select your Slack workspace and authorize SalesDuo to:
   - Read users and channels
   - Write messages
   - Upload files
   - Manage channels
   - Send direct messages
4. Slack redirects back to SalesDuo with an authorization code.
5. The platform exchanges the code for a bot token and stores it encrypted.
6. The platform automatically creates (or joins) a channel called **"salesduo-notifications"** in your Slack workspace.
7. The user who authorized the connection is invited to this channel.
8. The connection status becomes **"Connected."**

### 8.3 Default Notification Channel

- When you first connect Slack, a **"salesduo-notifications"** channel is created in your workspace. This is the default channel where all platform notifications are sent.
- If a channel with that name already exists, the SalesDuo bot simply joins it instead of creating a duplicate.
- The default channel name is configurable by platform administrators (via system configuration).

### 8.4 Channel Behavior

- **Auto-join:** When a tool sends a message to a channel that the SalesDuo bot is not a member of, the bot automatically joins the channel first, then posts the message. You do not need to manually add the bot to channels.
- **Channel listing:** The platform can list all channels in your Slack workspace, including their privacy status and member count. This is used in the interface when selecting which channel to send notifications to.

### 8.5 Messaging Capabilities

The Slack integration supports:

| Capability | Description |
|-----------|-------------|
| **Send to channel** | Post a message to any channel in your workspace |
| **Send to user** | Send a direct message to a specific Slack user (by email or Slack user ID) |
| **Upload file to channel** | Share a file (e.g., a report PDF) in a channel |
| **Upload file to user** | Share a file directly with a specific user |
| **Look up user** | Find a Slack user by their email address |

### 8.6 Disconnecting Slack

- When you disconnect Slack, the bot token is cleared and the status changes to "Disconnected."
- The "salesduo-notifications" channel remains in your Slack workspace (it is not deleted), but the bot will no longer post messages to it.
- All tools that rely on Slack notifications will stop sending messages until you reconnect.

### 8.7 Token Revocation

Unlike Amazon tokens, Slack tokens do **not** expire on a timer. They only become invalid if:
- Someone removes the SalesDuo app from the Slack workspace.
- A workspace admin revokes the app's permissions.

If the token is revoked:
1. The next attempt to send a message will fail.
2. The system detects the "token_revoked" error and automatically marks the Slack integration as **"Disconnected."**
3. You will need to reconnect Slack to resume notifications.

---

## 9. Integration Onboarding for Tools

When you start using a tool that requires specific integrations, the platform guides you through a setup wizard.

### 9.1 How It Works

1. You select a tool (e.g., "Inventory Manager").
2. The system checks the tool's **required integrations** (e.g., Seller Central + Advertising).
3. If any required integrations are not yet connected, you are redirected to the **Integration Onboarding** page.
4. The page shows which integrations are required and which are already connected.

### 9.2 Onboarding Steps

1. **Enter account details:** Provide an account name (e.g., "US Main") and select a region.
2. **Connect required integrations:** Each required integration is shown as a card with a "Connect" button. Cards show their status — "Required", "Connected", or "Not Required."
3. **Seller/Vendor exclusivity enforced:** If Seller Central is connected, the Vendor Central option is hidden, and vice versa.
4. **Proceed to tool:** Once all required integrations show "Connected", the "Continue to Dashboard" button becomes active.

### 9.3 Existing Account Detection

- If an account with the same name and region already exists (from a previous setup), the system detects it and offers to reuse it.
- You can click "Sync Status" to load the existing account's connection state rather than creating a new one.

### 9.4 No Required Integrations

- If a tool does not require any integrations, the onboarding step is skipped entirely. You go straight to the tool.

---

## 10. Credential Security

### 10.1 Encryption

All OAuth tokens and secrets are encrypted before being stored in the database:

- **Algorithm:** AES-256-GCM (military-grade encryption)
- **Key:** A 256-bit encryption key stored securely in the server environment, never in the database
- **Format:** Encrypted data is stored as a specially formatted string. Even if someone gains access to the database, they cannot read the tokens without the encryption key.

### 10.2 What Gets Encrypted

- OAuth access tokens (for making API calls)
- OAuth refresh tokens (for getting new access tokens)
- Slack bot tokens
- Any other API credentials

### 10.3 What Does NOT Get Encrypted

- Account names, regions, and marketplace identifiers (these are not sensitive)
- Slack workspace name and channel names (non-sensitive configuration)
- Connection timestamps and status

### 10.4 In-Transit Security

- All communication with Amazon and Slack happens over HTTPS (encrypted in transit).
- OAuth redirects go to official Amazon/Slack domains.
- Credentials are never logged or exposed in API responses.
- The frontend never handles raw tokens — all token exchange happens server-side.

---

## 11. Regions and Marketplaces

### 11.1 Supported Regions

Amazon organizes its marketplaces into three major regions:

| Region | Name | Included Marketplaces |
|--------|------|-----------------------|
| **NA** | North America | United States, Canada, Mexico, Brazil |
| **EU** | Europe | United Kingdom, Germany, France, Italy, Spain, Netherlands, Sweden, Poland, Belgium, Turkey |
| **FE** | Far East | Japan, Australia, Singapore |

### 11.2 How Region Mapping Works

When you select a specific marketplace (e.g., "Germany"), the system maps it to the appropriate region (EU) to determine which Amazon authorization URL to use. This mapping is configurable by platform administrators.

### 11.3 Multi-Region Operations

- The same seller can have accounts in multiple regions. Each region requires a separate connection.
- Example: "Main Brand" could have:
  - "Main Brand - US" (NA region, Seller Central + Advertising)
  - "Main Brand - UK" (EU region, Seller Central + Advertising)
  - "Main Brand - JP" (FE region, Seller Central)
- Each connection is independent — connecting in one region does not affect others.

---

## 12. Edge Cases and Special Scenarios

### 12.1 Token Expiration and Automatic Refresh

**What happens when tokens expire:**
1. A tool attempts to access your Amazon account.
2. The access token is found to be expired.
3. The system automatically uses the refresh token to obtain a new access token.
4. If the refresh succeeds, the tool continues working seamlessly. You notice nothing.
5. If the refresh fails (e.g., you revoked access in Amazon), the account status changes to "Error."

**Common reasons for refresh failure:**
- You revoked the SalesDuo app in your Amazon Seller Central settings.
- Amazon deactivated your seller account.
- The refresh token itself expired (rare, but possible after extended periods of inactivity).

**Resolution:** Go to Integrations, click "Reconnect" on the affected account, and complete the OAuth process again.

### 12.2 Disconnecting an Account While a Tool is Using It

- If you disconnect an integration account, its credentials are immediately cleared.
- If a tool is actively using that account at the moment of disconnection, the tool's next API call will fail with a "credentials missing" error.
- The tool will display an error message indicating that the integration needs to be reconnected.

### 12.3 Deleting the Last Account in a Group

- When you delete the last remaining account in a group, the group is automatically deleted.
- If the group still has other accounts, only the specific account is removed.

### 12.4 Reconnecting After Disconnection

- When you reconnect an account, you go through the full OAuth process again (logging into Amazon, approving permissions).
- New tokens are issued and stored. The old tokens were already cleared during disconnection.
- The account status returns to "Connected" and tools can access it again.

### 12.5 Slack App Removed from Workspace

- If someone removes the SalesDuo app from your Slack workspace (via Slack's admin settings), the stored token becomes invalid.
- The next time a tool tries to send a Slack notification, the system detects the invalid token and automatically marks the integration as "Disconnected."
- All Slack-based features stop working until you reconnect.
- Your Slack message history is preserved in Slack — the disconnection only affects future messages.

### 12.6 Multiple Organizations Using the Same Slack Workspace

- Each organization has its own independent Slack connection, even if they connect to the same Slack workspace.
- Each connection creates its own "salesduo-notifications" channel (or joins the existing one).
- Messages from different organizations may appear in the same channel if they share a workspace.

### 12.7 OAuth Flow Interrupted

- If you close the browser or lose internet during the OAuth process (while on Amazon's or Slack's login page), the connection attempt fails silently.
- The account remains in "Disconnected" or "Connecting" status.
- You can simply try again by clicking "Connect" — a new security token is generated each time.
- Security tokens used during OAuth expire after a short period (10 minutes for Slack) to prevent replay attacks.

---

## 13. Audit Logging

Every integration action is recorded in the platform's audit trail:

| Action | When It Is Logged |
|--------|--------------------|
| Connect Integration Account | User successfully connects a marketplace account |
| Disconnect Integration Account | User disconnects a marketplace account |
| Connect SP-API (OAuth callback) | Amazon OAuth callback completes successfully |
| Connect Ads API (OAuth callback) | Amazon Ads OAuth callback completes successfully |
| Connect Global Integration | User connects a global service (e.g., Slack) |
| Connect Global Integration (OAuth callback) | Slack OAuth callback completes successfully |
| Disconnect Global Integration | User disconnects a global service |

Each audit record includes:
- **Who** performed the action
- **When** it happened
- **Which** account or integration was affected
- **What type** of integration (Seller Central, Ads, Slack, etc.)
- **IP address** of the user

---

## 14. Rate Limiting

All OAuth-related endpoints (the URLs that initiate and complete the Amazon/Slack login process) are rate-limited:

| Setting | Value |
|---------|-------|
| **Window** | 15 minutes |
| **Maximum requests** | 10 per IP address |
| **Error message** | "Too many OAuth requests from this IP, please try again after 15 minutes" |

This prevents abuse of the OAuth flow (e.g., automated scripts attempting to flood the system with connection requests). Normal usage is well within these limits.

---

*End of Document*
