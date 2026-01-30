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
  status: OrgStatus;
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type OrganizationCreationAttributes = Optional<OrganizationAttributes, 'id' | 'website' | 'stripe_customer_id' | 'status' | 'deleted_at' | 'created_at' | 'updated_at'>;

export class Organization extends Model<OrganizationAttributes, OrganizationCreationAttributes> implements OrganizationAttributes {
  public id!: string;
  public name!: string;
  public slug!: string;
  public website!: string;
  public stripe_customer_id!: string;
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
      unique: true,
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
    status: {
      type: DataTypes.ENUM(...Object.values(OrgStatus)),
      defaultValue: OrgStatus.ACTIVE,
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
}

export type OrganizationMemberCreationAttributes = Optional<OrganizationMemberAttributes, 'id' | 'is_active' | 'joined_at'>;

export class OrganizationMember extends Model<OrganizationMemberAttributes, OrganizationMemberCreationAttributes> implements OrganizationMemberAttributes {
  public id!: string;
  public organization_id!: string;
  public user_id!: string;
  public role_id!: number;
  public is_active!: boolean;
  public readonly joined_at!: Date;
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
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id',
      },
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    joined_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'organization_members',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'user_id'],
      },
    ],
  }
);
