# Integrations Module

## Overview

The integrations module manages third-party service connections at the organization level. Currently supports Amazon Seller/Vendor Central (SP-API) and Amazon Advertising API via OAuth, plus global integrations like Slack. Integration accounts store OAuth credentials and connection status.

## Data Models

### IntegrationAccount

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| marketplace | ENUM | `AMAZON`, `WALMART` |
| integration_type | ENUM | `SP_API_SC` (Seller Central), `SP_API_VC` (Vendor Central), `ADS_API` |
| account_name | STRING | User-defined account name |
| region | STRING | Marketplace region |
| status | ENUM | `CONNECTED`, `DISCONNECTED`, `ERROR`, `CONNECTING` |
| credentials | JSONB | OAuth tokens and credentials (encrypted at rest recommended) |
| oauth_state | STRING | OAuth state parameter for CSRF protection |
| connected_at | DATE | When the integration was connected |

**Unique Constraint:** `(organization_id, marketplace, account_name, integration_type)`

### GlobalIntegration

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | FK to Organization |
| service_name | STRING | Service identifier (e.g., "slack") |
| status | ENUM | `CONNECTED`, `DISCONNECTED` |
| config | JSONB | Service configuration |
| credentials | JSONB | Service credentials |
| connected_at | DATE | Connection timestamp |

**Unique Constraint:** `(organization_id, service_name)`

## Endpoints

### Integration Accounts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/integrations/accounts` | Yes | List integration accounts for current org |
| POST | `/integrations/accounts` | Yes | Create integration account |
| DELETE | `/integrations/accounts/:id` | Yes | Delete integration account |
| POST | `/integrations/accounts/:id/connect` | Yes | Store credentials and mark connected |
| POST | `/integrations/accounts/:id/disconnect` | Yes | Clear credentials and mark disconnected |

### Global Integrations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/integrations/global` | Yes | List global integrations for current org |
| POST | `/integrations/global` | Yes | Create/connect global integration |
| DELETE | `/integrations/global/:id` | Yes | Delete global integration |

### Amazon Ads OAuth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/integrations/ads/auth-url` | Yes | Generate Amazon Ads OAuth authorization URL |
| GET | `/integrations/ads/callback` | No* | Handle Amazon Ads OAuth callback |

*The callback endpoint is public because it's an OAuth redirect from Amazon.

## Amazon Ads OAuth Flow

1. Frontend calls `/integrations/ads/auth-url?accountId=<id>`
2. Backend generates OAuth state, stores it on the integration account, returns auth URL
3. Frontend opens popup/redirect to Amazon OAuth
4. User authorizes on Amazon
5. Amazon redirects to `/integrations/ads/callback` with `code` and `state`
6. Backend validates `state` against stored `oauth_state`
7. Backend exchanges `code` for access/refresh tokens
8. Tokens stored in `credentials` JSONB field
9. Account status updated to `CONNECTED`
10. Callback renders HTML that sends `postMessage` to parent window

## Tool Required Integrations

Tools can specify `required_integrations` (JSONB array of integration slugs). During onboarding, the frontend checks which integrations are required and guides the user through connecting them.

## Key Files

- `backend/src/controllers/integration.controller.ts` — Integration account management
- `backend/src/controllers/ads.controller.ts` — Amazon Ads OAuth flow
- `backend/src/models/integration_account.ts` — IntegrationAccount model
- `backend/src/models/global_integration.ts` — GlobalIntegration model
- `backend/src/routes/integration.routes.ts` — Route definitions

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AMAZON_ADS_CLIENT_ID` | Yes | Amazon Advertising API client ID |
| `AMAZON_ADS_CLIENT_SECRET` | Yes | Amazon Advertising API client secret |
| `AMAZON_ADS_REDIRECT_URI` | Yes | OAuth callback URL |

---

## Issues Found

- [x] **SECURITY: Credentials stored in plaintext** — Both `IntegrationAccount` and `GlobalIntegration` store OAuth tokens and credentials as plaintext JSONB. These should be encrypted at rest.
- [x] **SECURITY: OAuth state comparison vulnerable to timing attacks** — The `ads.controller.ts` compares `account.oauth_state !== returnedState` using standard string comparison, which is susceptible to timing attacks. Should use a constant-time comparison function.
- [x] **SECURITY: CSP header override in OAuth callback** — The ads callback handler sets an unsafe Content-Security-Policy with inline scripts to render the success page. This could allow XSS if the HTML generation has escaping issues.
- [x] **No audit logging for credential changes** — Connecting, disconnecting, and modifying integration credentials are not logged to the audit system.
- [x] **No credential validation** — The `connectIntegrationAccount` endpoint stores whatever `credentials` object is provided without validating its structure or required fields.
- [ ] **[Skipped] Missing `error_message` field** — When `IntegrationAccount` status is `ERROR`, there's no field to store the error reason, making debugging difficult. *(Skipped: Not required, current logging should be enough)*
- [ ] **[Skipped] OAuth callback is public** — The `/integrations/ads/callback` endpoint has no authentication. While this is necessary for OAuth redirects, it relies entirely on state validation for security. *(Skipped: Needs to be public for amazon callback)*
- [ ] **[Skipped] No oauth_state timeout/cleanup** — OAuth state parameters are stored on integration accounts but never cleaned up if the OAuth flow is abandoned. *(Skipped: Not required)*
- [x] **`required_integrations` not validated** — The `Tool.required_integrations` JSONB field accepts arbitrary strings with no validation against known integration types.
- [x] **No rate limiting on token exchange** — The OAuth token exchange endpoint has no rate limiting, potentially allowing abuse.