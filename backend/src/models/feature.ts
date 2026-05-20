import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { Tool } from './tool';

// ==========================
// Feature Model
// ==========================

export interface FeatureAttributes {
  id: string;
  tool_id: string;
  name: string;
  slug: string;
  description?: string;
  credit_cost: number;
  requires_subscription: boolean;
  use_credit_system: boolean;
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type FeatureCreationAttributes = Optional<FeatureAttributes, 'id' | 'description' | 'credit_cost' | 'requires_subscription' | 'use_credit_system' | 'created_at' | 'updated_at' | 'deleted_at'>;

export class Feature extends Model<FeatureAttributes, FeatureCreationAttributes> implements FeatureAttributes {
  public id!: string;
  public tool_id!: string;
  public name!: string;
  public slug!: string;
  public description!: string;
  public credit_cost!: number;
  public requires_subscription!: boolean;
  public use_credit_system!: boolean;
  public readonly deleted_at!: Date | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly tool?: Tool;
}

Feature.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tool_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tools',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: false, // Managed by partial index
      comment: 'Unique key for code checks: e.g. "img_gen_count"',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    credit_cost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Credits consumed per unit of this feature. 0 = free.',
    },
    requires_subscription: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'When true, this feature requires an active subscription to the tool, i.e cant be used in credit-only mode. ',
    },
    use_credit_system: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment:
        'When true, this feature is credit-metered (cost charged per invocation). When false, falls back to entitlement/plan-limit enforcement.',
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'features',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      {
        // Scoped per-tool: different tools can legitimately share an operation
        // slug (e.g. multiple creative tools each having "dp_image_generation").
        name: 'features_tool_slug_active_unique',
        unique: true,
        fields: ['tool_id', 'slug'],
        where: {
          deleted_at: null,
        },
      },
    ],
    hooks: {
      afterDestroy: async (feature, options) => {
        try {
          // Dynamic imports required to avoid circular dependencies
          const { PlanLimit } = await import('./plan_limit');
          const { OrganizationEntitlement } = await import('./organization_entitlement');

          await PlanLimit.destroy({ where: { feature_id: feature.id }, transaction: options.transaction, individualHooks: true });
          await OrganizationEntitlement.destroy({ where: { feature_id: feature.id }, transaction: options.transaction, individualHooks: true });
        } catch (error) {
          console.error(`Cascade delete failed for feature ${feature.id}:`, error);
          throw error; // Re-throw to trigger transaction rollback
        }
      }
    }
  }
);
