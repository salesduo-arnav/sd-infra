# Frontend Hooks & Utilities

## Overview

The frontend uses custom React hooks for device detection and toast notifications, along with utility functions for common operations.

## Custom Hooks

### `useMobile` (`hooks/use-mobile.tsx`)
Detects if the viewport is mobile-sized.

```typescript
const isMobile = useMobile();
```

- Uses `window.matchMedia` to check viewport width
- Breakpoint: 768px (below = mobile)
- Updates on window resize via media query listener
- Returns `boolean`

### `useToast` (`hooks/use-toast.ts`)
Hook for managing toast notifications.

```typescript
const { toast } = useToast();
toast({ title: "Success", description: "Operation completed" });
```

- Manages toast state (queue, dismiss, update)
- Integrates with Shadcn UI's Sonner toast component
- Supports variants: default, destructive

## Type Definitions (`types/`)

Shared TypeScript type definitions used across the frontend. These define the shape of API responses and component props.

Key types include:
- `User` — User profile data
- `Organization` — Organization details
- `OrganizationMember` — Membership with role
- `Plan`, `Bundle`, `BundleGroup` — Billing entities
- `Subscription` — Subscription state
- `IntegrationAccount` — Integration data
- `Tool` — Tool/app data

## Utility: API Instance (`lib/api.ts`)

See [Services & API Layer](./08-services-api.md) for detailed documentation.

## Key Files

- `frontend/src/hooks/use-mobile.tsx`
- `frontend/src/hooks/use-toast.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/types/`
- `frontend/src/lib/utils.ts` (Tailwind `cn()` helper)

---

## Issues Found

1. **No additional custom hooks** — The application has only 2 custom hooks. Common patterns like `useDebounce`, `useLocalStorage`, or `useAsync` are repeated inline across components.
2. **Type definitions may be incomplete** — Types are defined locally but may not cover all API response shapes, leading to `any` usage in some places.
3. **No centralized constants** — Magic numbers and strings (timeouts, limits, status values) are scattered across components instead of being centralized.
4. **`useMobile` has no SSR safety** — Accesses `window` directly, which would crash during server-side rendering (not currently an issue with Vite SPA, but limits future portability).
5. **No `useDebounce` hook** — Search inputs across multiple pages trigger API calls on every keystroke because there's no debounce utility.
6. **Toast duration not configurable globally** — Each toast call uses default duration, with no global configuration.
