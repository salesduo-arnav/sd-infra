import { Request, Response, NextFunction } from 'express';
import { Organization, OrganizationMember } from '../models/organization';
import { Role, RolePermission } from '../models/role';
import { RoleType } from '../constants/rbac.constants';
import Logger from '../utils/logger';

// Extend Request to include organization
declare module 'express-serve-static-core' {
    interface Request {
      organization?: Organization;
      membership?: OrganizationMember;
    }
}

export const resolveOrganization = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const orgId = req.headers['x-organization-id'] as string;

        // Strict mode: only resolve if header explicitly provided
        if (orgId) {
            const membership = await OrganizationMember.findOne({
                where: { user_id: userId, organization_id: orgId },
                include: [
                    { model: Organization, as: 'organization' },
                    { model: Role, as: 'role' }
                ]
            });

            if (membership && membership.organization) {
                req.organization = membership.organization;
                req.membership = membership;
            }
        }

        next();
    } catch (error) {
        Logger.error('Organization Middleware Error:', { error });
        next(error);
    }
};

export const requireOrganization = (req: Request, res: Response, next: NextFunction) => {
    if (!req.organization) {
        return res.status(404).json({ message: 'Organization context required' });
    }
    next();
};

export const requireOwner = (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership || req.membership.role?.name !== RoleType.OWNER) {
        return res.status(403).json({ message: 'Organization Owner permission required' });
    }
    next();
};

/**
 * Fine-grained permission middleware factory.
 * Checks if the current user's role has the specified permission.
 */
export const requirePermission = (permissionId: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.membership) {
                return res.status(403).json({ message: 'Organization membership required' });
            }

            const roleId = req.membership.role_id;

            const hasPermission = await RolePermission.findOne({
                where: {
                    role_id: roleId,
                    permission_id: permissionId,
                },
            });

            if (!hasPermission) {
                return res.status(403).json({ message: 'Insufficient permissions' });
            }

            next();
        } catch (error) {
            Logger.error('Permission Middleware Error:', { error });
            next(error);
        }
    };
};
