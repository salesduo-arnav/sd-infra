import { Permission, RolePermission } from '../models/role';
import { Role } from '../models/role';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../constants/rbac.constants';

/**
 * Seeds permissions and role_permissions tables for integration tests.
 * Must be called AFTER roles exist in the database.
 */
export async function seedPermissions(): Promise<void> {
    // Seed all permissions
    for (const perm of ALL_PERMISSIONS) {
        await Permission.findOrCreate({
            where: { id: perm.id },
            defaults: { id: perm.id, description: perm.description, category: perm.category }
        });
    }

    // Seed role-permission mappings
    for (const [roleName, permIds] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        const [role] = await Role.findOrCreate({ 
            where: { name: roleName },
            defaults: { name: roleName, description: `${roleName} role` }
        });

        for (const permId of permIds) {
            await RolePermission.findOrCreate({
                where: { role_id: role.id, permission_id: permId },
                defaults: { role_id: role.id, permission_id: permId }
            });
        }
    }
}
