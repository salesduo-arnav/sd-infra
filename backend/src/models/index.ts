import { User } from './user';
import { Role, Permission, RolePermission } from './role';
import { Organization, OrganizationMember } from './organization';
import { Invitation } from './invitation';
import { Tool } from './tool';
import { Feature } from './feature';
import { Plan } from './plan';
import { PlanLimit } from './plan_limit';
import { Bundle } from './bundle';
import { BundlePlan } from './bundle_plan';
import { Subscription } from './subscription';
import { OrganizationEntitlement } from './organization_entitlement';
import { OneTimePurchase } from './one_time_purchase';
import { PriceInterval, TierType, SubStatus, FeatureType, FeatureResetPeriod } from './enums';

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

// =====================
// Billing & Tool Associations
// =====================

// Tool <-> Plan
Tool.hasMany(Plan, { foreignKey: 'tool_id', as: 'plans' });
Plan.belongsTo(Tool, { foreignKey: 'tool_id', as: 'tool' });

// Tool <-> Feature
Tool.hasMany(Feature, { foreignKey: 'tool_id', as: 'features' });
Feature.belongsTo(Tool, { foreignKey: 'tool_id', as: 'tool' });

// Tool <-> OrganizationEntitlement
Tool.hasMany(OrganizationEntitlement, { foreignKey: 'tool_id', as: 'entitlements' });
OrganizationEntitlement.belongsTo(Tool, { foreignKey: 'tool_id', as: 'tool' });

// Plan <-> PlanLimit
Plan.hasMany(PlanLimit, { foreignKey: 'plan_id', as: 'limits' });
PlanLimit.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// Feature <-> PlanLimit
Feature.hasMany(PlanLimit, { foreignKey: 'feature_id', as: 'plan_limits' });
PlanLimit.belongsTo(Feature, { foreignKey: 'feature_id', as: 'feature' });

// Plan <-> Subscription
Plan.hasMany(Subscription, { foreignKey: 'plan_id', as: 'subscriptions' });
Subscription.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// Bundle <-> Subscription
Bundle.hasMany(Subscription, { foreignKey: 'bundle_id', as: 'subscriptions' });
Subscription.belongsTo(Bundle, { foreignKey: 'bundle_id', as: 'bundle' });

// Organization <-> Subscription
Organization.hasMany(Subscription, { foreignKey: 'organization_id', as: 'subscriptions' });
Subscription.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// Bundle <-> BundlePlan (Junction)
Bundle.belongsToMany(Plan, {
  through: BundlePlan,
  foreignKey: 'bundle_id',
  otherKey: 'plan_id',
  as: 'plans',
});
Plan.belongsToMany(Bundle, {
  through: BundlePlan,
  foreignKey: 'plan_id',
  otherKey: 'bundle_id',
  as: 'bundles',
});

// Organization <-> OrganizationEntitlement
Organization.hasMany(OrganizationEntitlement, { foreignKey: 'organization_id', as: 'entitlements' });
OrganizationEntitlement.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// Feature <-> OrganizationEntitlement
Feature.hasMany(OrganizationEntitlement, { foreignKey: 'feature_id', as: 'entitlements' });
OrganizationEntitlement.belongsTo(Feature, { foreignKey: 'feature_id', as: 'feature' });

// Organization <-> OneTimePurchase
Organization.hasMany(OneTimePurchase, { foreignKey: 'organization_id', as: 'one_time_purchases' });
OneTimePurchase.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// Plan <-> OneTimePurchase
Plan.hasMany(OneTimePurchase, { foreignKey: 'plan_id', as: 'one_time_purchases' });
OneTimePurchase.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// Bundle <-> OneTimePurchase
Bundle.hasMany(OneTimePurchase, { foreignKey: 'bundle_id', as: 'one_time_purchases' });
OneTimePurchase.belongsTo(Bundle, { foreignKey: 'bundle_id', as: 'bundle' });

// Export all models
export {
  User,
  Role,
  Permission,
  RolePermission,
  Organization,
  OrganizationMember,
  Invitation,
  Tool,
  Feature,
  Plan,
  PlanLimit,
  Bundle,
  BundlePlan,
  Subscription,
  OrganizationEntitlement,
  OneTimePurchase,
  PriceInterval,
  TierType,
  SubStatus,
  FeatureType,
  FeatureResetPeriod,
};
