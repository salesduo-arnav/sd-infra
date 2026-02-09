import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { FeatureResetPeriod } from './enums';
import { Organization } from './organization';
import { Tool } from './tool';
import { Feature } from './feature';

// ==========================
// OrganizationEntitlement Model
// ==========================

export interface OrganizationEntitlementAttributes {
  id: string;
  organization_id: string;
  tool_id: string;
  feature_id: string;
  limit_amount?: number;
  usage_amount: number;
  reset_period?: FeatureResetPeriod;
  last_reset_at?: Date;
  updated_at?: Date;
  created_at?: Date;
}

export type OrganizationEntitlementCreationAttributes = Optional<
  OrganizationEntitlementAttributes,
  'id' | 'limit_amount' | 'usage_amount' | 'reset_period' | 'last_reset_at' | 'updated_at' | 'created_at'
>;

export class OrganizationEntitlement extends Model<OrganizationEntitlementAttributes, OrganizationEntitlementCreationAttributes> implements OrganizationEntitlementAttributes {
  public id!: string;
  public organization_id!: string;
  public tool_id!: string;
  public feature_id!: string;
  public limit_amount!: number;
  public usage_amount!: number;
  public reset_period!: FeatureResetPeriod;
  public last_reset_at!: Date;
  
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly organization?: Organization;
  public readonly tool?: Tool;
  public readonly feature?: Feature;
}

OrganizationEntitlement.init(
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
      comment: 'Denormalized for faster queries',
    },
    tool_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tools',
        key: 'id',
      },
    },
    feature_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'features',
        key: 'id',
      },
    },
    limit_amount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'The MAX allowed. Copied from plan_limits, but editable per org!',
    },
    usage_amount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'The CURRENT usage',
    },
    reset_period: {
      type: DataTypes.ENUM(...Object.values(FeatureResetPeriod)),
      allowNull: true,
    },
    last_reset_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'organization_entitlements',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'feature_id'],
        name: 'os_entitlements_org_id_feat_id_unique', // Explicit name to avoid length issues
      },
    ],
  }
);
