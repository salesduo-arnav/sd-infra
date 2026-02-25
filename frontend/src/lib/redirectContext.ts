/**
 * Redirect Context — sessionStorage-backed persistence for onboarding flow params.
 *
 * When a user arrives from any micro-app (e.g. demo-app, creative-studio, analytics, …)
 * the entry page captures { redirect, app } into sessionStorage.
 * All onboarding pages read from here instead of URL params, so the context
 * survives back-button navigation, internal links, and page refreshes.
 *
 * Cleared when the flow finishes (user reaches the external app or /apps).
 */

const STORAGE_KEY = "sd_redirect_context";

export interface RedirectContext {
    /** The external URL to redirect to after onboarding completes */
    redirect: string;
    /** The app slug (e.g. "demo-app") — drives which integrations are required */
    app: string | null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Capture redirect context from URL search params into sessionStorage.
 * Only writes if `redirect` is present. Merges with existing context so that
 * a page that only receives `redirect` doesn't accidentally clear `app`.
 */
export function captureRedirectContext(searchParams: URLSearchParams): void {
    const redirect = searchParams.get("redirect");
    if (!redirect) return;

    const existing = getRedirectContext();
    const ctx: RedirectContext = {
        redirect,
        app: searchParams.get("app") ?? existing?.app ?? null,
    };

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
}

/**
 * Clear the redirect context. Call this when the onboarding flow is complete
 * (i.e. after redirecting to the external app or navigating to /apps).
 */
export function clearRedirectContext(): void {
    sessionStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Get the full redirect context, or null if none is set. */
export function getRedirectContext(): RedirectContext | null {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as RedirectContext;
    } catch {
        return null;
    }
}

/** Quick boolean check — is there a pending redirect? */
export function hasRedirectContext(): boolean {
    return getRedirectContext() !== null;
}

/** The external redirect URL (or null). */
export function getRedirectUrl(): string | null {
    return getRedirectContext()?.redirect ?? null;
}

/** The app slug (or null). */
export function getAppSlug(): string | null {
    return getRedirectContext()?.app ?? null;
}

/**
 * Build a URL query-string suffix that carries the redirect context.
 * Returns e.g. `?redirect=https%3A…&app=demo-app` or `""` if no context.
 * Use this when you still need params in the URL (e.g. for integration-onboarding).
 */
export function getRedirectSuffix(): string {
    const ctx = getRedirectContext();
    if (!ctx) return "";

    const params = new URLSearchParams();
    params.set("redirect", ctx.redirect);
    if (ctx.app) params.set("app", ctx.app);
    return `?${params.toString()}`;
}

/**
 * Perform the final redirect to the external app.
 * Clears the redirect context and navigates via `window.location.replace`.
 *
 * @returns `true` if a redirect was performed, `false` if no context existed.
 *          Use the return value to fall through to `/apps` when false.
 */
export function finalizeRedirect(): boolean {
    const ctx = getRedirectContext();
    if (!ctx) return false;

    clearRedirectContext();

    try {
        const url = new URL(ctx.redirect);
        url.searchParams.set("auth_success", "true");
        window.location.replace(url.toString());
    } catch {
        // Invalid URL — try raw
        window.location.replace(ctx.redirect);
    }

    return true;
}
