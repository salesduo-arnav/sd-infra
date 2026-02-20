# API Reference

## Overview

The backend exposes a RESTful API at the base URL configured by `VITE_API_BASE_URL` (frontend) or directly via the backend port. All endpoints return JSON. Authentication is session-based via HTTP-only cookies.

## Common Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Cookie` | For authenticated routes | Session cookie (set by login) |
| `x-organization-id` | For org-scoped routes | Active organization UUID |
| `Content-Type` | For POST/PUT | `application/json` |

## Common Response Patterns

### Success
```json
{ "field": "value" }
```

### Paginated Response
```json
{
  "items": [...],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

### Error Response
```json
{ "message": "Error description" }
```

### Pagination Query Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 10 | Items per page |
| `sortBy` | `created_at` | Sort column |
| `sortOrder` | `DESC` | Sort direction |
| `search` | — | Search string |

## Endpoint Groups

### Authentication (`/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register account |
| POST | `/auth/login` | No | Login |
| POST | `/auth/logout` | Yes | Logout |
| GET | `/auth/me` | Yes | Current user + orgs |
| POST | `/auth/forgot-password` | No | Request reset |
| POST | `/auth/reset-password` | No | Reset password |
| POST | `/auth/google-auth` | No | Google OAuth |
| POST | `/auth/send-login-otp` | No | Send login OTP |
| POST | `/auth/verify-login-otp` | No | Verify login OTP |
| POST | `/auth/send-signup-otp` | No | Send signup OTP |
| POST | `/auth/verify-signup-otp` | No | Verify signup OTP |

### Organizations (`/organizations`)
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/organizations` | Yes | — | Create org |
| GET | `/organizations/my` | Yes | Member | Current org |
| GET | `/organizations/:id/members` | Yes | Member | List members |
| PUT | `/organizations/:id` | Yes | Owner | Update org |
| DELETE | `/organizations/:id/members/:memberId` | Yes | Admin+ | Remove member |
| PUT | `/organizations/:id/members/:memberId/role` | Yes | Owner | Change role |
| POST | `/organizations/:id/ownership` | Yes | Owner | Transfer ownership |
| DELETE | `/organizations/:id` | Yes | Owner | Delete org |

### Invitations (`/invitations`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/invitations` | Yes (Admin+) | Send invite |
| GET | `/invitations/pending` | Yes | Org pending invites |
| DELETE | `/invitations/:id` | Yes (Admin+) | Revoke invite |
| GET | `/invitations/validate` | No | Validate token |
| POST | `/invitations/accept` | Yes | Accept invite |
| GET | `/invitations/my-pending` | Yes | User's pending invites |
| POST | `/invitations/decline` | Yes | Decline invite |

### Billing (`/billing`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/billing/config` | Yes | Grace period config |
| POST | `/billing/checkout` | Yes | Create checkout session |
| GET | `/billing/subscription` | Yes | Current subscriptions |
| POST | `/billing/portal` | Yes | Stripe billing portal |
| GET | `/billing/invoices` | Yes | Invoice history |
| GET | `/billing/payment-methods` | Yes | Payment methods |
| DELETE | `/billing/subscriptions/:id` | Yes | Cancel subscription |
| POST | `/billing/subscriptions/:id/resume` | Yes | Resume subscription |
| POST | `/billing/subscriptions/:id` | Yes | Update subscription |
| DELETE | `/billing/subscriptions/:id/downgrade` | Yes | Cancel downgrade |
| POST | `/billing/trials/start` | Yes | Start trial |
| DELETE | `/billing/trials/:id` | Yes | Cancel trial |
| GET | `/billing/trials/eligibility` | Yes | Check eligibility |
| POST | `/billing/sync` | Yes | Sync with Stripe |

### Tools (`/tools`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tools` | No | List active tools |
| GET | `/tools/:slug` | No | Get tool by slug |
| POST | `/tools/:id/usage` | Yes | Track usage |

### Integrations (`/integrations`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/integrations/accounts` | Yes | List integration accounts |
| POST | `/integrations/accounts` | Yes | Create account |
| DELETE | `/integrations/accounts/:id` | Yes | Delete account |
| POST | `/integrations/accounts/:id/connect` | Yes | Connect (store creds) |
| POST | `/integrations/accounts/:id/disconnect` | Yes | Disconnect |
| GET | `/integrations/global` | Yes | List global integrations |
| POST | `/integrations/global` | Yes | Connect global |
| DELETE | `/integrations/global/:id` | Yes | Disconnect global |
| GET | `/integrations/ads/auth-url` | Yes | Amazon Ads auth URL |
| GET | `/integrations/ads/callback` | No* | OAuth callback |

### Users (`/users`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PUT | `/users/profile` | Yes | Update profile |
| PUT | `/users/password` | Yes | Change password |
| POST | `/users/password` | Yes | Create password (OAuth users) |
| DELETE | `/users/account` | Yes | Delete account |

### Public (`/public`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/public/bundles` | No | Public bundle listing |
| GET | `/public/plans` | No | Public plan listing |

### Webhooks (`/webhooks`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/stripe` | Stripe signature | Stripe webhook events |

### Admin (`/admin`) — Superuser Only
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/stats/overview` | Platform stats |
| GET | `/admin/stats/revenue-chart` | Revenue data |
| GET | `/admin/stats/user-growth-chart` | User growth data |
| GET | `/admin/stats/tool-usage-chart` | Tool usage data |
| GET/POST/PUT/DELETE | `/admin/tools[/:id]` | Tool CRUD |
| GET/POST/PUT/DELETE | `/admin/features[/:id]` | Feature CRUD |
| GET/POST/PUT/DELETE | `/admin/plans[/:id]` | Plan CRUD |
| POST/DELETE | `/admin/plans/:id/limits[/:featureId]` | Plan limits |
| GET/POST/PUT/DELETE | `/admin/bundle-groups[/:id]` | Bundle group CRUD |
| GET/POST/PUT/DELETE | `/admin/bundles[/:id]` | Bundle CRUD |
| POST/DELETE | `/admin/bundles/:id/plans[/:planId]` | Bundle-plan association |
| GET/PUT/DELETE | `/admin/users[/:id]` | User management |
| GET/PUT/DELETE | `/admin/organizations[/:id]` | Org management |
| GET | `/admin/audit-logs[/:id]` | Audit logs |
| GET/PUT | `/admin/config[/:key]` | System config |

### Health Check
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/api/health` | No | Health check (alt) |

---

## Issues Found

1. **No OpenAPI/Swagger specification** — The API has no formal specification document. This reference was compiled by reading source code, which is error-prone and may be incomplete.
2. **No API versioning** — All endpoints are unversioned (no `/v1/` prefix). Breaking changes would affect all consumers simultaneously.
3. **No rate limiting** — No rate limiting is configured on any endpoint, making the API vulnerable to abuse and brute-force attacks.
4. **Inconsistent error responses** — Some controllers return `{ message: "..." }` while others return `{ error: "..." }`. Error format should be standardized.
5. **No request/response schemas** — Request body schemas and response shapes are not formally documented.
6. **Mixed auth patterns** — Some endpoints require org context, some don't. The requirements are not discoverable from the API surface alone.
7. **No deprecation strategy** — No mechanism for deprecating endpoints or communicating breaking changes.
8. **CORS configuration not documented** — The allowed origins are environment-dependent but not documented as part of the API contract.
