import { Request, Response } from 'express';
import { Role, Permission, RolePermission } from '../models/role';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';
import Logger from '../utils/logger';

/**
 * Get all roles with their associated permissions
 */
export const getRoles = async (req: Request, res: Response) => {
    try {
        const roles = await Role.findAll({
            include: [{
                model: Permission,
                as: 'permissions',
                through: { attributes: [] }
            }],
            order: [['id', 'ASC']]
        });

        res.json({ roles });
    } catch (error) {
        Logger.error('Error fetching roles:', { error });
        handleError(res, error);
    }
};

/**
 * Get all available permissions, grouped by category
 */
export const getPermissions = async (req: Request, res: Response) => {
    try {
        const permissions = await Permission.findAll({
            order: [['category', 'ASC'], ['id', 'ASC']]
        });

        // Group by category
        const grouped = permissions.reduce((acc: Record<string, typeof permissions>, perm) => {
            const cat = perm.category || 'Other';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(perm);
            return acc;
        }, {});

        res.json({ permissions, grouped });
    } catch (error) {
        Logger.error('Error fetching permissions:', { error });
        handleError(res, error);
    }
};

/**
 * Update permissions for a specific role
 * Body: { permissionIds: string[] }
 */
export const updateRolePermissions = async (req: Request, res: Response) => {
    try {
        const roleId = parseInt(req.params.roleId, 10);
        const { permissionIds } = req.body;

        if (isNaN(roleId)) {
            return res.status(400).json({ message: 'Invalid role ID' });
        }

        if (!Array.isArray(permissionIds)) {
            return res.status(400).json({ message: 'permissionIds must be an array' });
        }

        const role = await Role.findByPk(roleId);
        if (!role) {
            return res.status(404).json({ message: 'Role not found' });
        }

        // Get existing permissions for audit trail
        const existingPerms = await RolePermission.findAll({ where: { role_id: roleId } });
        const oldPermissionIds = existingPerms.map(rp => rp.permission_id);

        // Validate all permission IDs exist
        const validPermissions = await Permission.findAll({
            where: { id: permissionIds }
        });
        if (validPermissions.length !== permissionIds.length) {
            return res.status(400).json({ message: 'One or more permission IDs are invalid' });
        }

        // Replace permissions: delete old, insert new
        await RolePermission.destroy({ where: { role_id: roleId } });

        if (permissionIds.length > 0) {
            const newRolePerms = permissionIds.map((pid: string) => ({
                role_id: roleId,
                permission_id: pid,
            }));
            await RolePermission.bulkCreate(newRolePerms);
        }

        // Audit log the change
        await AuditService.log({
            actorId: req.user?.id || 'system',
            action: 'UPDATE_ROLE_PERMISSIONS',
            entityType: 'Role',
            entityId: String(roleId),
            details: {
                roleName: role.name,
                previousPermissions: oldPermissionIds,
                newPermissions: permissionIds,
            },
            req
        });

        Logger.info('Role permissions updated', { roleId, roleName: role.name, permissionIds });

        res.json({ message: 'Role permissions updated successfully' });
    } catch (error) {
        Logger.error('Error updating role permissions:', { error });
        handleError(res, error);
    }
};
