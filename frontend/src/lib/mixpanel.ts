import mixpanel from 'mixpanel-browser';

const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN;
const SOURCE = 'sd-core-platform';

let initialized = false;

export function initMixpanel(): void {
    if (!MIXPANEL_TOKEN) {
        console.warn('VITE_MIXPANEL_TOKEN not set — Mixpanel disabled');
        return;
    }

    mixpanel.init(MIXPANEL_TOKEN, {
        track_pageview: false, // we handle page views manually via router
        persistence: 'localStorage',
    });

    mixpanel.register({ source: SOURCE });
    initialized = true;
}

export function identifyUser(user: {
    id: string;
    email: string;
    full_name: string;
    is_superuser?: boolean;
}): void {
    if (!initialized) return;

    mixpanel.identify(user.id);
    mixpanel.people.set({
        $name: user.full_name,
        $email: user.email,
        is_superuser: user.is_superuser || false,
        source: SOURCE,
    });
}

export function setOrganizationProperties(org: {
    id: string;
    name: string;
    slug?: string;
}): void {
    if (!initialized) return;

    mixpanel.register({
        organization_id: org.id,
        organization_name: org.name,
    });
}

export function clearOrganizationProperties(): void {
    if (!initialized) return;

    mixpanel.unregister('organization_id');
    mixpanel.unregister('organization_name');
}

export function trackPageView(path: string): void {
    if (!initialized) return;

    mixpanel.track('Page Viewed', { path, source: SOURCE });
}

export function resetMixpanel(): void {
    if (!initialized) return;

    mixpanel.reset();
}
