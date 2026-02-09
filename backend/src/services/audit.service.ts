import AuditLog from "../models/audit_log";

interface LogParams {
    actorId?: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, any>;
    ipAddress?: string;
    req?: any; // generic express req
}

export class AuditService {
    /**
     * Logs an action to the audit_logs table.
     * This method is designed to be fire-and-forget or awaited depending on caller preference.
     * It catches errors internally to prevent failing the main request logic.
     */
    static async log(params: LogParams): Promise<void> {
        try {
            const { actorId, action, entityType, entityId, details, ipAddress, req } = params;

            let finalIp = ipAddress;
            if (!finalIp && req) {
                finalIp = req.ip || req.connection?.remoteAddress;
            }

            await AuditLog.create({
                actor_id: actorId,
                action,
                entity_type: entityType,
                entity_id: entityId,
                details,
                ip_address: finalIp,
            });
        } catch (error) {
            console.error("Failed to create audit log:", error);
            // We explicitly do NOT throw here to avoid failing the main business logic
            // just because logging failed.
        }
    }
}
