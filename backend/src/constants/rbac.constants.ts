// Centralized RBAC constants — use these instead of raw string literals

export enum RoleType {
  OWNER = 'Owner',
  ADMIN = 'Admin',
  MEMBER = 'Member',
}

export enum PermissionId {
  ORG_UPDATE = 'org.update',
  ORG_DELETE = 'org.delete',
  MEMBERS_INVITE = 'members.invite',
  MEMBERS_REMOVE = 'members.remove',
  MEMBERS_UPDATE_ROLE = 'members.update_role',
  OWNERSHIP_TRANSFER = 'ownership.transfer',
  BILLING_VIEW = 'billing.view',
  BILLING_MANAGE = 'billing.manage',
  PLANS_VIEW = 'plans.view',
}

// All permissions with metadata for seeding
export const ALL_PERMISSIONS = [
  { id: PermissionId.ORG_UPDATE, description: 'Update organization details', category: 'Organization' },
  { id: PermissionId.ORG_DELETE, description: 'Delete the organization', category: 'Organization' },
  { id: PermissionId.MEMBERS_INVITE, description: 'Invite new members', category: 'Members' },
  { id: PermissionId.MEMBERS_REMOVE, description: 'Remove members from the organization', category: 'Members' },
  { id: PermissionId.MEMBERS_UPDATE_ROLE, description: 'Change member roles', category: 'Members' },
  { id: PermissionId.OWNERSHIP_TRANSFER, description: 'Transfer organization ownership', category: 'Members' },
  { id: PermissionId.BILLING_VIEW, description: 'View billing and subscription info', category: 'Billing' },
  { id: PermissionId.BILLING_MANAGE, description: 'Manage subscriptions and payments', category: 'Billing' },
  { id: PermissionId.PLANS_VIEW, description: 'View available plans and pricing', category: 'Billing' }
];

// Default permission sets per role
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionId[]> = {
  [RoleType.OWNER]: Object.values(PermissionId), // Owner gets everything
  [RoleType.ADMIN]: [
    PermissionId.ORG_UPDATE,
    PermissionId.MEMBERS_INVITE,
    PermissionId.MEMBERS_REMOVE,
    PermissionId.BILLING_VIEW,
    PermissionId.BILLING_MANAGE,
    PermissionId.PLANS_VIEW,
  ],
  [RoleType.MEMBER]: [
    PermissionId.BILLING_VIEW,
  ],
};
