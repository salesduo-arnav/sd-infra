# Internal API — Service-to-Service Communication

Base URL: `/internal`

All internal routes are protected by the `requireServiceAuth` middleware. These endpoints are designed for micro-tools and internal services, **not** for end users.

---

## Authentication

Every request must include:

| Header | Required | Description |
|--------|----------|-------------|
| `X-Service-Key` | Yes | Must match the `INTERNAL_API_KEY` environment variable |
| `X-Service-Name` | No | Identifier for the calling service (e.g., `"creatives-tool"`). Defaults to `"unknown-service"`. Used in audit logs and response attribution. |
| `Content-Type` | Yes (for POST) | `application/json` |

**Error responses:**

| Status | Condition |
|--------|-----------|
| `401` | `X-Service-Key` header missing |
| `403` | `X-Service-Key` value does not match `INTERNAL_API_KEY` |

---

## Response Format

All successful responses include a `source` field with the calling service's name:

```json
{ "message": "...", "source": "creatives-tool" }
```

All error responses follow the format:

```json
{ "message": "Human-readable error description" }
```

---

## Endpoints

### 1. Organization Data

#### GET `/internal/organizations/:id`

Get basic organization details.

**Params:** `id` — organization UUID

**Success (200):**
```json
{
  "id": "uuid",
  "name": "Acme Corp",
  "status": "active",
  "created_at": "2026-01-15T10:00:00.000Z"
}
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `404` | Organization not found |

---

#### GET `/internal/organizations/:id/members`

Get all active members of an organization.

**Params:** `id` — organization UUID

**Success (200):**
```json
[
  {
    "id": "membership-uuid",
    "user_id": "user-uuid",
    "email": "john@example.com",
    "full_name": "John Doe",
    "name": "John Doe",
    "role": "admin",
    "joined_at": "2026-01-15T10:00:00.000Z"
  }
]
```

Returns an empty array `[]` if the organization has no active members.

---

#### GET `/internal/organizations/:id/subscription`

Get the latest subscription for an organization, including plan and bundle details.

**Params:** `id` — organization UUID

**Success (200):**
```json
{
  "id": "subscription-uuid",
  "organization_id": "org-uuid",
  "plan_id": "plan-uuid",
  "bundle_id": "bundle-uuid",
  "status": "active",
  "plan": { "id": "plan-uuid", "name": "Pro", "tier": "pro" },
  "bundle": { "id": "bundle-uuid", "name": "Starter Bundle", "slug": "starter-bundle" },
  "created_at": "2026-01-15T10:00:00.000Z"
}
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `404` | No subscription found for this organization |

---

#### GET `/internal/organizations/:id/entitlements`

Get all feature entitlements for an organization.

**Params:** `id` — organization UUID

**Success (200):**
```json
[
  {
    "id": "entitlement-uuid",
    "organization_id": "org-uuid",
    "feature_id": "feature-uuid",
    "tool_id": "tool-uuid",
    "usage_amount": 42,
    "limit_amount": 100,
    "feature": { "id": "feature-uuid", "name": "API Calls", "slug": "api-calls", "description": "..." },
    "tool": { "id": "tool-uuid", "name": "Creatives Tool", "slug": "creatives-tool" }
  }
]
```

Returns an empty array `[]` if the organization has no entitlements.

---

#### POST `/internal/organizations/:id/entitlements/consume`

Atomically check and consume a feature entitlement. Uses row-level locking to prevent concurrent over-consumption.

**Params:** `id` — organization UUID

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `feature_slug` | string | Yes | Slug of the feature to consume |
| `amount` | number | No | Amount to consume. Default: `1` |

**Success — allowed (200):**
```json
{
  "allowed": true,
  "usage_amount": 43,
  "limit_amount": 100,
  "feature": { "id": "...", "name": "API Calls", "slug": "api-calls", "description": "..." }
}
```

**Success — denied (200):**
```json
{
  "allowed": false,
  "reason": "limit_exceeded",
  "usage_amount": 100,
  "limit_amount": 100,
  "feature": { "..." }
}
```

```json
{
  "allowed": false,
  "reason": "no_entitlement",
  "message": "No entitlement found for this feature."
}
```

Note: A `null` value for `limit_amount` means unlimited.

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `feature_slug` missing from body |

---

### 2. Fire-and-Forget Operations

#### POST `/internal/usage/track`

Track tool usage for a given organization. Creates or increments a daily usage counter.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_id` | string | Yes | Tool UUID or slug |
| `organization_id` | string | Yes | Organization UUID |
| `user_id` | string | No | User UUID (if attributable to a specific user) |

**Success (200):**
```json
{ "message": "Usage tracked", "source": "creatives-tool" }
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `tool_id` or `organization_id` missing |
| `404` | Tool not found by ID or slug |

---

#### POST `/internal/audit-logs`

Create an audit log entry.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | Action name (e.g., `"EXPORT_DATA"`, `"DELETE_RECORD"`) |
| `entity_type` | string | Yes | Type of entity (e.g., `"Campaign"`, `"Report"`) |
| `entity_id` | string | Yes | UUID of the entity acted upon |
| `actor_id` | string | No | UUID of the user who performed the action |
| `details` | object | No | Arbitrary metadata. The calling service's `X-Service-Name` is automatically added as `source`. |
| `ip_address` | string | No | IP address of the original request |

**Success (200):**
```json
{ "message": "Audit log created", "source": "creatives-tool" }
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `action`, `entity_type`, or `entity_id` missing |

---

### 3. Email

#### POST `/internal/email/send`

Send an email via the platform's SMTP service.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string or string[] | Yes | Recipient email address(es) |
| `subject` | string | Yes | Email subject line |
| `html` | string | No* | HTML email body |
| `text` | string | No* | Plain text email body |

*At least one of `html` or `text` must be provided.

**Success (200):**
```json
{ "message": "Email sent", "source": "creatives-tool" }
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `to` or `subject` missing |
| `400` | Neither `html` nor `text` provided |
| `500` | SMTP delivery failure |

---

### 4. Slack — Messaging

> **Prerequisite:** The organization must have Slack connected as a global integration. If Slack is not connected, all Slack endpoints return `404`.

#### POST `/internal/slack/send-to-channel`

Send a message to a Slack channel.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organization_id` | string | Yes | Organization UUID |
| `channel` | string | No | Channel name (e.g., `"general"`) or channel ID (e.g., `"C0ABC123"`). If omitted, sends to the default `#salesduo-notifications` channel. |
| `text` | string | Yes | Message text. Also used as the notification fallback when `blocks` are provided. |
| `blocks` | array | No | [Slack Block Kit](https://api.slack.com/block-kit) blocks for rich formatting. Design visually at https://app.slack.com/block-kit-builder |

**Success (200):**
```json
{ "message": "Slack message sent to channel", "source": "creatives-tool" }
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `organization_id` or `text` missing |
| `400` | `channel` omitted and no default channel configured |
| `404` | Slack not connected for this organization |
| `404` | Channel not found in the workspace |
| `401` | Slack token revoked — integration marked as disconnected |

**Behavior notes:**
- If the bot is not in the channel, it automatically joins (public channels) and retries.
- Channel names are resolved to IDs internally. Both `"general"` and `"C0ABC123XYZ"` work.

---

#### POST `/internal/slack/send-to-user`

Send a direct message to a Slack user.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organization_id` | string | Yes | Organization UUID |
| `user_email` | string | No* | Email address of the Slack user to DM |
| `user_id` | string | No* | Slack user ID (e.g., `"U0ABC123"`) to DM |
| `text` | string | Yes | Message text |
| `blocks` | array | No | Slack Block Kit blocks |

*At least one of `user_email` or `user_id` must be provided. If both are provided, `user_id` takes precedence.

**Success (200):**
```json
{ "message": "Slack DM sent", "source": "creatives-tool" }
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `organization_id` or `text` missing |
| `400` | Neither `user_email` nor `user_id` provided |
| `404` | Slack not connected for this organization |
| `404` | No Slack user found with the given email |
| `401` | Slack token revoked |

---

### 5. Slack — File Uploads

Files must be sent as **base64-encoded** strings. Maximum file size: **50 MB**.

#### POST `/internal/slack/send-file-to-channel`

Upload a file to a Slack channel.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organization_id` | string | Yes | Organization UUID |
| `channel` | string | No | Channel name or ID. Defaults to `#salesduo-notifications` if omitted. |
| `file` | string | Yes | Base64-encoded file content |
| `filename` | string | Yes | Filename with extension (e.g., `"report.csv"`, `"image.png"`) |
| `title` | string | No | Display title shown in Slack |
| `initial_comment` | string | No | Message posted alongside the file |

**Success (200):**
```json
{ "message": "File sent to channel", "source": "creatives-tool" }
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `organization_id`, `file`, or `filename` missing |
| `400` | File exceeds 50 MB |
| `400` | `channel` omitted and no default channel configured |
| `404` | Slack not connected for this organization |
| `404` | Channel not found |
| `401` | Slack token revoked |

---

#### POST `/internal/slack/send-file-to-user`

Upload a file as a direct message to a Slack user.

**Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `organization_id` | string | Yes | Organization UUID |
| `user_email` | string | No* | Email of the Slack user |
| `user_id` | string | No* | Slack user ID |
| `file` | string | Yes | Base64-encoded file content |
| `filename` | string | Yes | Filename with extension |
| `title` | string | No | Display title |
| `initial_comment` | string | No | Message alongside the file |

*At least one of `user_email` or `user_id` must be provided.

**Success (200):**
```json
{ "message": "File sent to user", "source": "creatives-tool" }
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `organization_id`, `file`, or `filename` missing |
| `400` | Neither `user_email` nor `user_id` provided |
| `400` | File exceeds 50 MB |
| `404` | Slack not connected for this organization |
| `404` | No Slack user found with the given email |
| `401` | Slack token revoked |

---

### 6. Slack — Queries

#### GET `/internal/slack/channels/:organization_id`

List all Slack channels accessible to the bot.

**Params:** `organization_id` — organization UUID

**Success (200):**
```json
{
  "channels": [
    {
      "id": "C0ABC123",
      "name": "general",
      "is_private": false,
      "num_members": 42
    },
    {
      "id": "G0DEF456",
      "name": "team-alerts",
      "is_private": true,
      "num_members": 5
    }
  ]
}
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `organization_id` missing |
| `404` | Slack not connected for this organization |
| `401` | Slack token revoked |

---

#### GET `/internal/slack/lookup-user/:organization_id?email=user@example.com`

Look up a Slack user by their email address.

**Params:** `organization_id` — organization UUID

**Query:**
| Param | Required | Description |
|-------|----------|-------------|
| `email` | Yes | Email address to search for |

**Success (200):**
```json
{
  "user": {
    "id": "U0ABC123",
    "name": "johndoe",
    "real_name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Errors:**
| Status | Condition |
|--------|-----------|
| `400` | `organization_id` or `email` missing |
| `404` | Slack not connected for this organization |
| `404` | No Slack user found with that email |
| `401` | Slack token revoked |

---

## Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/internal/organizations/:id` | Get organization details |
| GET | `/internal/organizations/:id/members` | List active members |
| GET | `/internal/organizations/:id/subscription` | Get subscription + plan/bundle |
| GET | `/internal/organizations/:id/entitlements` | List feature entitlements |
| POST | `/internal/organizations/:id/entitlements/consume` | Consume a feature entitlement |
| POST | `/internal/usage/track` | Track tool usage |
| POST | `/internal/audit-logs` | Create audit log entry |
| POST | `/internal/email/send` | Send email |
| POST | `/internal/slack/send-to-channel` | Send Slack message to channel |
| POST | `/internal/slack/send-to-user` | Send Slack DM |
| POST | `/internal/slack/send-file-to-channel` | Upload file to channel |
| POST | `/internal/slack/send-file-to-user` | Upload file as DM |
| GET | `/internal/slack/channels/:org_id` | List Slack channels |
| GET | `/internal/slack/lookup-user/:org_id` | Lookup Slack user by email |
