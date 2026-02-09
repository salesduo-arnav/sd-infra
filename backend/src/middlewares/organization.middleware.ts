import { Request, Response, NextFunction } from 'express';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';

// Extend Request to include organization
declare global {
  namespace Express {
    interface Request {
      organization?: Organization;
      membership?: OrganizationMember;
    }
  }
}

export const resolveOrganization = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const orgId = req.headers['x-organization-id'] as string;
        let membership;

        if (orgId) {
            membership = await OrganizationMember.findOne({
                where: { user_id: userId, organization_id: orgId },
                include: [
                    { model: Organization, as: 'organization' },
                    { model: Role, as: 'role' }
                ]
            });
        }

        // Fallback: If no specific org requested, try to find the default/first one
        if (!membership && !orgId) {
             membership = await OrganizationMember.findOne({
                where: { user_id: userId },
                include: [
                    { model: Organization, as: 'organization' },
                    { model: Role, as: 'role' }
                ],
                order: [['joined_at', 'ASC']] // consistent fallback
            });
        }

        if (membership && membership.organization) {
            req.organization = membership.organization;
            req.membership = membership;
        }

        next();
    } catch (error) {
        console.error('Organization Middleware Error:', error);
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
    if (!req.membership || req.membership.role?.name !== 'Owner') {
        return res.status(403).json({ message: 'Organization Owner permission required' });
    }
    next();
};
