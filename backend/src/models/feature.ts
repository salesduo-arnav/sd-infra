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
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type FeatureCreationAttributes = Optional<FeatureAttributes, 'id' | 'description' | 'created_at' | 'updated_at' | 'deleted_at'>;

export class Feature extends Model<FeatureAttributes, FeatureCreationAttributes> implements FeatureAttributes {
  public id!: string;
  public tool_id!: string;
  public name!: string;
  public slug!: string;
  public description!: string;
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
        unique: true,
        fields: ['slug'],
        where: {
          deleted_at: null,
        },
      },
    ],
    hooks: {
      afterDestroy: async (feature, options) => {
        const { PlanLimit } = await import('./plan_limit');
        const { OrganizationEntitlement } = await import('./organization_entitlement');

        await PlanLimit.destroy({ where: { feature_id: feature.id }, transaction: options.transaction });
        await OrganizationEntitlement.destroy({ where: { feature_id: feature.id }, transaction: options.transaction });
      }
    }
  }
);
