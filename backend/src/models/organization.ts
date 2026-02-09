import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { User } from './user'; // Assuming User is exported from user.ts
import { Role } from './role';

// ==========================
// Organization Model
// ==========================

export enum OrgStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

export interface OrganizationAttributes {
  id: string;
  name: string;
  slug: string;
  website?: string;
  stripe_customer_id?: string;
  billing_email?: string;
  tax_id?: string;
  status: OrgStatus;
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type OrganizationCreationAttributes = Optional<OrganizationAttributes, 'id' | 'website' | 'stripe_customer_id' | 'billing_email' | 'tax_id' | 'status' | 'deleted_at' | 'created_at' | 'updated_at'>;

export class Organization extends Model<OrganizationAttributes, OrganizationCreationAttributes> implements OrganizationAttributes {
  public id!: string;
  public name!: string;
  public slug!: string;
  public website!: string;
  public stripe_customer_id!: string;
  public billing_email!: string;
  public tax_id!: string;
  public status!: OrgStatus;
  public deleted_at!: Date | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Organization.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: false, // Managed by partial index
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stripe_customer_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    billing_email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tax_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(OrgStatus)),
      defaultValue: OrgStatus.ACTIVE,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Soft delete timestamp. If set, org is in trash.',
    },
  },
  {
    sequelize,
    tableName: 'organizations',
    timestamps: true,
    paranoid: true, // Enables soft deletes (automatically handles deleted_at)
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      {
        unique: true,
        fields: ['slug'],
        where: {
          deleted_at: null,
        },
      },
      {
        unique: true,
        fields: ['stripe_customer_id'],
        where: {
          deleted_at: null,
        },
      },
    ],
    hooks: {
      afterDestroy: async (organization, options) => {
        const { Invitation } = await import('./invitation'); // Dynamic import
        const { Subscription } = await import('./subscription');
        const { OrganizationEntitlement } = await import('./organization_entitlement');
        const { OneTimePurchase } = await import('./one_time_purchase');

        // Soft delete members
        await OrganizationMember.destroy({
          where: { organization_id: organization.id },
          transaction: options.transaction,
        });
        // Soft delete invitations
        await Invitation.destroy({
          where: { organization_id: organization.id },
          transaction: options.transaction,
        });
        // Soft delete subscriptions
        await Subscription.destroy({
          where: { organization_id: organization.id },
          transaction: options.transaction,
        });
        // Soft delete entitlements
        await OrganizationEntitlement.destroy({
          where: { organization_id: organization.id },
          transaction: options.transaction,
        });
        // Soft delete OTPs
        await OneTimePurchase.destroy({
          where: { organization_id: organization.id },
          transaction: options.transaction,
        });
      },
    },
  }
);


// ==========================
// OrganizationMember Model
// ==========================

export interface OrganizationMemberAttributes {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: number;
  is_active: boolean;
  joined_at?: Date;
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type OrganizationMemberCreationAttributes = Optional<OrganizationMemberAttributes, 'id' | 'is_active' | 'joined_at' | 'created_at' | 'updated_at' | 'deleted_at'>;

export class OrganizationMember extends Model<OrganizationMemberAttributes, OrganizationMemberCreationAttributes> implements OrganizationMemberAttributes {
  public id!: string;
  public organization_id!: string;
  public user_id!: string;
  public role_id!: number;
  public is_active!: boolean;
  public readonly joined_at!: Date;
  public readonly deleted_at!: Date | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly role?: Role;
  public readonly user?: User;
  public readonly organization?: Organization;
}

OrganizationMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id',
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    joined_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  },
  {
    sequelize,
    tableName: 'organization_members',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'user_id'],
        where: {
          deleted_at: null,
        },
      },
    ],
  }
);
