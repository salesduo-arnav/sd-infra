# Micro-tool feature discovery

sd-infra auto-discovers the feature catalog from each micro-tool so admins can
pick feature slugs from a dropdown in the "Manage Features" dialog instead of
typing them by hand. The micro-tool is the source of truth for what slugs
exist; sd-infra is the source of truth for which of those have been officially
registered (and entitled to plans / orgs).

## Discovery flow

1. Admin opens "Manage Features" for a tool in sd-infra.
2. Frontend calls `GET /admin/tools/:toolId/discovered-features`.
3. sd-infra reads `tool.tool_link` and calls
   `GET {tool_link}/api/v1/internal/features` with service-key headers.
4. sd-infra filters out slugs already registered for that tool and returns the
   remaining candidates to the frontend.
5. If the call fails for any reason (no `tool_link`, timeout, 4xx/5xx, malformed
   JSON), sd-infra responds with `{ available: [], source: "unavailable" }` and
   the frontend falls back to the existing manual text-input form.

The admin still confirms registration explicitly — discovery only populates
the dropdown; nothing is written to the DB until the admin submits the Add
Feature form.

## Contract: GET `/api/v1/internal/features`

A micro-tool that wants its features auto-discovered exposes this endpoint.

**Request headers**

| Header           | Required | Notes                                                       |
| ---------------- | -------- | ----------------------------------------------------------- |
| `X-Service-Key`  | yes      | Shared secret. Validated against the micro-tool's env var.  |
| `X-Service-Name` | optional | sd-infra sends `sd-infra` for logging.                      |

**Response 200**

```json
{
  "tool_slug": "creatives-micro-tool",
  "features": [
    { "slug": "dp_image_generation", "name": "Detail Page Image Generation" },
    { "slug": "image_editor",         "name": "Image Editor" }
  ]
}
```

- `slug` — stable identifier used for entitlement checks. Must match exactly
  what the micro-tool's runtime guards read.
- `name` — human-readable label shown in the admin dropdown.

No additional fields are required. The response should be cheap to produce
(read from a static in-process registry, not the database).

**Failure modes**

- Bad/missing `X-Service-Key` → 403.
- Service not configured (no key in env) → 503.

Any other failure (404, 5xx, timeout) is treated by sd-infra as "discovery
unavailable" and the admin UI silently falls back to manual entry — no error
is surfaced to the operator.

## Configuration

**sd-infra (caller)**

- `INTERNAL_API_KEY` — shared secret sent in `X-Service-Key`. This is the same
  variable sd-infra already uses to authenticate inbound `/internal/*` calls
  from micro-tools; the same value is reused here for outbound calls.
- `tool.internal_url` — backend-to-backend base URL set per tool in the admin
  panel (e.g. `http://creatives-prod-backend:8000`). This must be reachable
  from inside the sd-infra container — typically a container hostname on the
  shared `salesduo-net` docker network.
- `tool.tool_link` — the public, browser-facing URL (e.g.
  `http://creatives.lvh.me`). Used as a fallback when `internal_url` is unset,
  but `lvh.me`/host-only hostnames will not resolve from inside the sd-infra
  container, so `internal_url` should be filled in for any tool sd-infra
  needs to call.

**Micro-tool (callee)**

- Validate `X-Service-Key` against the same shared secret. The
  `creatives-micro-tool` implementation reuses its existing
  `SD_INFRA_INTERNAL_API_KEY` setting — the same value it already uses when
  calling sd-infra's `/internal/*` endpoints.

## Adding a new micro-tool

1. Create a `features/registry.py` (or equivalent) listing `{slug, name}` for
   every feature you want sd-infra to advertise.
2. Mount `GET /internal/features` returning `{tool_slug, features}` and gate
   it behind `X-Service-Key`.
3. Make sure the deployed tool's `tool_link` in sd-infra's `tools` table
   points at the right host.

No sd-infra change is required for new micro-tools — discovery is driven off
`tool.tool_link`.
