import { User } from './user';
import { Role, Permission, RolePermission } from './role';
import { Organization, OrganizationMember } from './organization';
import { Invitation } from './invitation';
import { Tool } from './tool';
import { Feature } from './feature';
import { Plan } from './plan';
import { PlanLimit } from './plan_limit';
import { Bundle } from './bundle';
import { BundleGroup } from './bundle_group';
import { BundlePlan } from './bundle_plan';
import { Subscription } from './subscription';
import { OrganizationEntitlement } from './organization_entitlement';
import { OneTimePurchase } from './one_time_purchase';
import { ToolUsage } from './tool_usage';
import { IntegrationAccount, IntegrationType, IntegrationStatus } from './integration_account';
import { GlobalIntegration, GlobalIntegrationStatus } from './global_integration';
import { PriceInterval, TierType, SubStatus, FeatureType, FeatureResetPeriod } from './enums';

// =====================
// Associations
// =====================

// User <-> Organization (via OrganizationMember)
User.hasMany(OrganizationMember, { foreignKey: 'user_id', as: 'memberships', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
OrganizationMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Organization.hasMany(OrganizationMember, { foreignKey: 'organization_id', as: 'members', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
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
Organization.hasMany(Invitation, { foreignKey: 'organization_id', as: 'invitations', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Invitation.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

Role.hasMany(Invitation, { foreignKey: 'role_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Invitation.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

User.hasMany(Invitation, { foreignKey: 'invited_by', as: 'sent_invitations', onUpdate: 'CASCADE', onDelete: 'SET NULL' });
Invitation.belongsTo(User, { foreignKey: 'invited_by', as: 'sender' });

// =====================
// Billing & Tool Associations
// =====================

// Tool <-> Plan
Tool.hasMany(Plan, { foreignKey: 'tool_id', as: 'plans', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Plan.belongsTo(Tool, { foreignKey: 'tool_id', as: 'tool' });

// Tool <-> Feature
Tool.hasMany(Feature, { foreignKey: 'tool_id', as: 'features', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Feature.belongsTo(Tool, { foreignKey: 'tool_id', as: 'tool' });

// Tool <-> OrganizationEntitlement
Tool.hasMany(OrganizationEntitlement, { foreignKey: 'tool_id', as: 'entitlements', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
OrganizationEntitlement.belongsTo(Tool, { foreignKey: 'tool_id', as: 'tool' });

// Plan <-> PlanLimit
Plan.hasMany(PlanLimit, { foreignKey: 'plan_id', as: 'limits', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
PlanLimit.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// Feature <-> PlanLimit
Feature.hasMany(PlanLimit, { foreignKey: 'feature_id', as: 'plan_limits', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
PlanLimit.belongsTo(Feature, { foreignKey: 'feature_id', as: 'feature' });

// Plan <-> Subscription
Plan.hasMany(Subscription, { foreignKey: 'plan_id', as: 'subscriptions', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Subscription.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// Bundle <-> Subscription
Bundle.hasMany(Subscription, { foreignKey: 'bundle_id', as: 'subscriptions', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Subscription.belongsTo(Bundle, { foreignKey: 'bundle_id', as: 'bundle' });

// Organization <-> Subscription
Organization.hasMany(Subscription, { foreignKey: 'organization_id', as: 'subscriptions', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Subscription.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// Bundle <-> BundlePlan (Junction)
Bundle.belongsToMany(Plan, {
  through: BundlePlan,
  foreignKey: 'bundle_id',
  otherKey: 'plan_id',
  as: 'plans',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});
Plan.belongsToMany(Bundle, {
  through: BundlePlan,
  foreignKey: 'plan_id',
  otherKey: 'bundle_id',
  as: 'bundles',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Explicit BundlePlan Associations (Super Many-to-Many)
Bundle.hasMany(BundlePlan, { foreignKey: 'bundle_id', as: 'bundle_plans' });
BundlePlan.belongsTo(Bundle, { foreignKey: 'bundle_id', as: 'bundle' });

Plan.hasMany(BundlePlan, { foreignKey: 'plan_id', as: 'bundle_plans' });
BundlePlan.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// Organization <-> OrganizationEntitlement
Organization.hasMany(OrganizationEntitlement, { foreignKey: 'organization_id', as: 'entitlements', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
OrganizationEntitlement.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// Feature <-> OrganizationEntitlement
Feature.hasMany(OrganizationEntitlement, { foreignKey: 'feature_id', as: 'entitlements', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
OrganizationEntitlement.belongsTo(Feature, { foreignKey: 'feature_id', as: 'feature' });

// Organization <-> OneTimePurchase
Organization.hasMany(OneTimePurchase, { foreignKey: 'organization_id', as: 'one_time_purchases', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
OneTimePurchase.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// Plan <-> OneTimePurchase
Plan.hasMany(OneTimePurchase, { foreignKey: 'plan_id', as: 'one_time_purchases', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
OneTimePurchase.belongsTo(Plan, { foreignKey: 'plan_id', as: 'plan' });

// Bundle <-> OneTimePurchase
Bundle.hasMany(OneTimePurchase, { foreignKey: 'bundle_id', as: 'one_time_purchases', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
OneTimePurchase.belongsTo(Bundle, { foreignKey: 'bundle_id', as: 'bundle' });

// BundleGroup <-> Bundle
BundleGroup.hasMany(Bundle, { foreignKey: 'bundle_group_id', as: 'bundles', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
Bundle.belongsTo(BundleGroup, { foreignKey: 'bundle_group_id', as: 'group' });


// Tool Usage Associations
Tool.hasMany(ToolUsage, { foreignKey: 'tool_id', as: 'usages', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
ToolUsage.belongsTo(Tool, { foreignKey: 'tool_id', as: 'tool' });

User.hasMany(ToolUsage, { foreignKey: 'user_id', as: 'tool_usages', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
ToolUsage.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Organization.hasMany(ToolUsage, { foreignKey: 'organization_id', as: 'tool_usages', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
ToolUsage.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// =====================
// Integration Associations
// =====================

// Organization <-> IntegrationAccount
Organization.hasMany(IntegrationAccount, { foreignKey: 'organization_id', as: 'integration_accounts', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
IntegrationAccount.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

// Organization <-> GlobalIntegration
Organization.hasMany(GlobalIntegration, { foreignKey: 'organization_id', as: 'global_integrations', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
GlobalIntegration.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

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
  BundleGroup,
  BundlePlan,
  Subscription,
  OrganizationEntitlement,
  OneTimePurchase,
  ToolUsage,
  IntegrationAccount,
  IntegrationType,
  IntegrationStatus,
  GlobalIntegration,
  GlobalIntegrationStatus,
  PriceInterval,
  TierType,
  SubStatus,
  FeatureType,
  FeatureResetPeriod,
};
