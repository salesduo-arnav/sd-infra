# Frontend Services & API Layer

## Overview

The frontend communicates with the backend through an Axios HTTP client instance configured with credentials, organization context, and error handling. Domain-specific service modules encapsulate API calls.

## API Client (`lib/api.ts`)

### Configuration
- **Base URL:** `VITE_API_BASE_URL` environment variable
- **Credentials:** `withCredentials: true` (sends HTTP-only session cookie)
- **Timeout:** Not explicitly set

### Request Interceptor
Adds `x-organization-id` header from `localStorage.activeOrganizationId` to every request.

### Response Interceptor
Handles common error responses:
- **401:** Redirects to login (session expired)
- **403:** Shows "Access denied" toast
- **Other errors:** Shows error message toast from `response.data.message`

## Service Modules

### Admin Service (`services/admin.service.ts`)

| Category | Methods |
|----------|---------|
| **Tools** | `getTools`, `getToolById`, `createTool`, `updateTool`, `deleteTool` |
| **Features** | `getFeatures`, `createFeature`, `updateFeature`, `deleteFeature` |
| **Plans** | `getPlans`, `getPlanById`, `createPlan`, `updatePlan`, `deletePlan` |
| **Plan Limits** | `upsertPlanLimit`, `deletePlanLimit` |
| **Bundles** | `getBundles`, `getBundleById`, `createBundle`, `updateBundle`, `deleteBundle` |
| **Bundle Groups** | `getBundleGroups`, `createBundleGroup`, `updateBundleGroup`, `deleteBundleGroup` |
| **Bundle Plans** | `addPlanToBundle`, `removePlanFromBundle` |
| **Users** | `getUsers`, `updateUser`, `deleteUser` |
| **Organizations** | `getOrganizations`, `getOrganizationById`, `updateOrganization`, `deleteOrganization` |
| **Audit Logs** | `getAuditLogs`, `getAuditLogById` |
| **Stats** | `getOverviewStats`, `getRevenueChart`, `getUserGrowthChart`, `getToolUsageChart` |
| **Config** | `getConfigs`, `updateConfig` |

### Billing Service (`services/billing.service.ts`)

| Method | Description |
|--------|-------------|
| `createCheckoutSession(items)` | Create Stripe checkout |
| `getSubscription()` | Get current subscriptions |
| `createPortalSession()` | Open Stripe billing portal |
| `getInvoices()` | Get invoice history |
| `cancelSubscription(id)` | Cancel subscription |
| `resumeSubscription(id)` | Resume cancelled subscription |
| `updateSubscription(id, data)` | Upgrade/downgrade |
| `cancelDowngrade(id)` | Cancel scheduled downgrade |
| `syncSubscription()` | Manual Stripe sync |
| `startTrial(data)` | Start free trial |
| `cancelTrial(id)` | Cancel trial |
| `checkTrialEligibility(toolId)` | Check if eligible for trial |
| `getBillingConfig()` | Get billing configuration |

### Integration Service (`services/integration.service.ts`)

| Method | Description |
|--------|-------------|
| `getIntegrationAccounts()` | List org's integration accounts |
| `createIntegrationAccount(data)` | Create new account |
| `deleteIntegrationAccount(id)` | Delete account |
| `connectIntegrationAccount(id, data)` | Store credentials |
| `disconnectIntegrationAccount(id)` | Clear credentials |
| `getGlobalIntegrations()` | List global integrations |
| `connectGlobalIntegration(data)` | Connect global service |
| `disconnectGlobalIntegration(id)` | Disconnect global service |
| `getAdsAuthUrl(accountId)` | Get Amazon Ads OAuth URL |

### Tool Service (`services/tool.service.ts`)

| Method | Description |
|--------|-------------|
| `getTools()` | Get active tools |
| `getToolBySlug(slug)` | Get tool by slug |
| `trackToolUsage(toolId)` | Track usage |

### Public Service (`services/public.service.ts`)

| Method | Description |
|--------|-------------|
| `getBundles()` | Get public bundle data |
| `getPlans()` | Get public plan data |

## Environment Variables (Build-time)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API URL |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |

These are baked into the frontend build at compile time (Vite replaces them during build).

## Key Files

- `frontend/src/lib/api.ts` — Axios instance and interceptors
- `frontend/src/services/admin.service.ts`
- `frontend/src/services/billing.service.ts`
- `frontend/src/services/integration.service.ts`
- `frontend/src/services/tool.service.ts`
- `frontend/src/services/public.service.ts`

---

## Issues Found

1. **No request timeout** — The Axios instance has no explicit timeout configured. Slow or unresponsive backend calls could hang indefinitely.
2. **401 handling may cause loops** — If the session expires during a request, the interceptor redirects to login. If the login page also makes an API call that returns 401, this could cause a redirect loop.
3. **Error messages from backend shown directly** — The response interceptor shows `response.data.message` in toasts without sanitization, potentially exposing internal error details to users.
4. **`x-organization-id` read from localStorage** — The interceptor reads from `localStorage` on every request. If `localStorage` is out of sync with React state, requests may use the wrong organization.
5. **No request cancellation** — Long-running requests are not cancelled when components unmount (no AbortController usage).
6. **No retry logic** — Failed requests are not retried for transient network errors.
7. **VITE vars are build-time only** — Environment variables are baked in at build time. Changing the API URL requires a full rebuild.
8. **Service methods don't return typed responses** — Most service methods return `any` from Axios, losing TypeScript type safety.
