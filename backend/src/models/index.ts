import { User } from './user';
import { Role, Permission, RolePermission } from './role';
import { Organization, OrganizationMember } from './organization';
import { Invitation } from './invitation';

// =====================
// Associations
// =====================

// User <-> Organization (via OrganizationMember)
User.hasMany(OrganizationMember, { foreignKey: 'user_id', as: 'memberships' });
OrganizationMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Organization.hasMany(OrganizationMember, { foreignKey: 'organization_id', as: 'members', onDelete: 'CASCADE' });
OrganizationMember.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// User <-> Organization (Many-to-Many Shortcut)
User.belongsToMany(Organization, {
  through: OrganizationMember,
  foreignKey: 'user_id',
  otherKey: 'organization_id',
  as: 'organizations'
});
Organization.belongsToMany(User, {
  through: OrganizationMember,
  foreignKey: 'organization_id',
  otherKey: 'user_id',
  as: 'users'
});

// OrganizationMember <-> Role
OrganizationMember.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });
Role.hasMany(OrganizationMember, { foreignKey: 'role_id' });

// Role <-> Permission (Many-to-Many)
Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: 'role_id',
  otherKey: 'permission_id',
  as: 'permissions',
});
Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: 'permission_id',
  otherKey: 'role_id',
  as: 'roles',
});

// Invitation Associations
Organization.hasMany(Invitation, { foreignKey: 'organization_id', as: 'invitations', onDelete: 'CASCADE' });
Invitation.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

Role.hasMany(Invitation, { foreignKey: 'role_id' });
Invitation.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

User.hasMany(Invitation, { foreignKey: 'invited_by', as: 'sent_invitations', onDelete: 'SET NULL' });
Invitation.belongsTo(User, { foreignKey: 'invited_by', as: 'sender' });


// Export all models
export {
  User,
  Role,
  Permission,
  RolePermission,
  Organization,
  OrganizationMember,
  Invitation
};
