import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import Logger from '../utils/logger';

// Shape of a single feature returned by a micro-tool's GET /internal/features.
export interface DiscoveredFeature {
    slug: string;
    name: string;
}

export interface DiscoveryResult {
    available: DiscoveredFeature[];
    source: 'remote' | 'unavailable';
}

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Pick the base URL sd-infra should call for service-to-service requests.
 *
 * Prefer `tool.internal_url` (e.g. `http://creatives-prod-backend:8000` — a
 * container hostname reachable on the shared `salesduo-net` docker network).
 * Fall back to `tool.tool_link` only when `internal_url` is unset — that's
 * the public, browser-facing URL (e.g. `http://creatives.lvh.me`) and only
 * works for sd-infra when both services are on the same host network.
 */
function getDiscoveryBaseUrl(tool: Tool): string | null {
    const url = tool.internal_url || tool.tool_link;
    if (!url) return null;
    return url.replace(/\/+$/, '');
}

/**
 * Calls {tool.tool_link}/api/v1/internal/features and returns the list of
 * advertised features minus any already registered for this tool. On any
 * failure (no tool_link, network error, non-2xx, bad JSON, timeout) this
 * returns `source: "unavailable"` so the admin UI can fall back to the
 * existing manual-entry flow without surfacing a backend error.
 */
export async function fetchDiscoveredFeatures(tool: Tool): Promise<DiscoveryResult> {
    const base = getDiscoveryBaseUrl(tool);
    if (!base) {
        return { available: [], source: 'unavailable' };
    }

    // Micro-tools mount their API under /api/v1; the discovery endpoint sits
    // at /internal/features within that router.
    const url = `${base}/api/v1/internal/features`;
    const serviceKey = process.env.INTERNAL_API_KEY || '';

    let payload: unknown;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-Service-Key': serviceKey,
                    'X-Service-Name': 'sd-infra',
                    'Accept': 'application/json',
                },
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            Logger.warn('Feature discovery: non-OK response', {
                toolId: tool.id, toolSlug: tool.slug, url, status: response.status,
            });
            return { available: [], source: 'unavailable' };
        }

        payload = await response.json();
    } catch (error) {
        Logger.warn('Feature discovery: fetch failed', {
            toolId: tool.id, toolSlug: tool.slug, url,
            error: error instanceof Error ? error.message : String(error),
        });
        return { available: [], source: 'unavailable' };
    }

    const advertised = parseFeatures(payload);
    if (advertised === null) {
        Logger.warn('Feature discovery: malformed payload', {
            toolId: tool.id, toolSlug: tool.slug, url,
        });
        return { available: [], source: 'unavailable' };
    }

    const existing = await Feature.findAll({
        where: { tool_id: tool.id },
        attributes: ['slug'],
    });
    const taken = new Set(existing.map((f) => f.slug));

    const available = advertised.filter((f) => !taken.has(f.slug));
    return { available, source: 'remote' };
}

function parseFeatures(payload: unknown): DiscoveredFeature[] | null {
    if (!payload || typeof payload !== 'object') return null;
    const features = (payload as { features?: unknown }).features;
    if (!Array.isArray(features)) return null;

    const out: DiscoveredFeature[] = [];
    for (const entry of features) {
        if (!entry || typeof entry !== 'object') return null;
        const slug = (entry as { slug?: unknown }).slug;
        const name = (entry as { name?: unknown }).name;
        if (typeof slug !== 'string' || typeof name !== 'string' || !slug || !name) {
            return null;
        }
        out.push({ slug, name });
    }
    return out;
}
