# Integrations UI

## Overview

The integrations UI manages third-party marketplace connections (Amazon Seller Central, Vendor Central, Advertising API) and global services (Slack). Features OAuth popup flows, account grouping, and an onboarding wizard for required integrations.

## Pages

### Integrations (`Integrations.tsx`)
Main integration management page:
- Create integration accounts (SP-API, Advertising API)
- Connect/disconnect integrations via OAuth popup
- Global integrations section (Slack)
- Group accounts by name/region
- Status tracking (Connected, Disconnected, Connecting, Error)
- Real Amazon Ads OAuth flow

### IntegrationOnboarding (`IntegrationOnboarding.tsx`)
Step-by-step integration setup during tool onboarding:

**Steps:**
1. **Account Setup** — Enter account name and select region
2. **SP-API Connection** — Connect Seller/Vendor Central
3. **Advertising API** — Connect Amazon Ads via real OAuth
4. **Completion** — All required integrations connected

## OAuth Flows

### Amazon Ads (Real OAuth)
1. Frontend requests auth URL from backend
2. Backend generates state parameter, stores on account
3. Popup opens Amazon authorization page
4. User authorizes on Amazon
5. Amazon redirects to callback URL
6. Backend exchanges code for tokens
7. Callback page sends `postMessage` to parent window
8. Frontend detects connection, updates UI

### SP-API / Seller Central (Simulated)
1. Frontend opens popup with simulated OAuth page
2. Popup waits 2.5 seconds (simulated delay)
3. Frontend calls connect endpoint with credentials
4. Account status updated

## Integration Types

| Type | Slug | Description |
|------|------|-------------|
| `SP_API_SC` | Seller Central | Amazon Seller Central API |
| `SP_API_VC` | Vendor Central | Amazon Vendor Central API |
| `ADS_API` | Advertising | Amazon Advertising API |

## Marketplace Support

| Marketplace | Regions |
|-------------|---------|
| Amazon | US, CA, MX, BR, UK, DE, FR, IT, ES, NL, PL, SE, TR, AE, SA, IN, SG, AU, JP |
| Walmart | (Future) |

## Components

### Integration Components (`components/integrations/`)

| Component | Description |
|-----------|-------------|
| `ManageIntegrationDialog.tsx` | Dialog for managing connected integrations |

## Key Files

- `frontend/src/pages/Integrations.tsx` — Main integrations page
- `frontend/src/pages/IntegrationOnboarding.tsx` — Onboarding wizard
- `frontend/src/components/integrations/ManageIntegrationDialog.tsx`
- `frontend/src/services/integration.service.ts` — Integration API calls

---

## Issues Found

- [x] **Memory leaks from event listeners** — `postMessage` event listeners are added but not cleaned up on component unmount, causing memory leaks.
- [x] **Polling intervals not cleared** — `setInterval` used for checking OAuth completion is not cleaned up on unmount.
- [x] **Multiple poll timers can stack** — Clicking "connect" multiple times starts multiple polling intervals.
- [x] **No popup blocker detection** — Code assumes the OAuth popup opens successfully, with no fallback for blocked popups.
- [x] **Simulated OAuth is unsafe** — `popup.document.write()` injects raw HTML into a new window, which could allow XSS if input is not sanitized.
- [x] **[ALREADY FIXED] SP-API connection is simulated** — The SP-API OAuth flow uses a hardcoded `setTimeout(2500)` instead of actual OAuth, meaning no real connection is established.
- [x] **Hardcoded polling timeout** — 120-second polling timeout for OAuth completion is not configurable.
- [x] **Stale closure in polling** — `orgId` and other state variables referenced in `setInterval` callbacks may be stale.
- [x] **Simulated popup HTML hardcoded** — Large HTML strings for simulated OAuth popups are embedded in component files.
- [x] **No connection status verification** — After popup closes, the UI assumes connection succeeded without backend verification.
- [ ] **[SKIPPED] No progress indication during OAuth** — Users don't see how long the connection process will take. *(Skipped: Not Needed)*
- [x] **Multiple state updates in effects** — State updates are not batched, causing multiple unnecessary re-renders.
