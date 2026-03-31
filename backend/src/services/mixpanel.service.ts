import Mixpanel from 'mixpanel';
import Logger from '../utils/logger';

const MIXPANEL_TOKEN = process.env.MIXPANEL_TOKEN;

let mixpanel: Mixpanel.Mixpanel | null = null;

if (MIXPANEL_TOKEN) {
    mixpanel = Mixpanel.init(MIXPANEL_TOKEN, { geolocate: true });
    Logger.info('Mixpanel initialized');
} else {
    Logger.warn('MIXPANEL_TOKEN not set — Mixpanel tracking disabled');
}

interface TrackParams {
    actorId?: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
}

/**
 * Fire-and-forget Mixpanel event tracker.
 * Called from AuditService.log() so every audited action is also sent to Mixpanel.
 */
export function trackAuditEvent(params: TrackParams): void {
    if (!mixpanel) return;

    try {
        const { actorId, action, entityType, entityId, details, ipAddress } = params;

        const source = (details?.source as string) || 'sd-core-platform';

        const properties: Record<string, unknown> = {
            distinct_id: actorId || 'system',
            entity_type: entityType,
            entity_id: entityId,
            source,
            ...details,
        };

        if (ipAddress) {
            properties.ip = ipAddress;
        }

        mixpanel.track(action, properties);
    } catch (error) {
        Logger.error('Mixpanel track failed:', { error });
    }
}
