import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { Bundle } from './bundle';
import { Plan } from './plan';

// ==========================
// BundlePlan Model
// ==========================

export interface BundlePlanAttributes {
  bundle_id: string;
  plan_id: string;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export type BundlePlanCreationAttributes = Optional<BundlePlanAttributes, 'created_at' | 'updated_at' | 'deleted_at'>;

export class BundlePlan extends Model<BundlePlanAttributes, BundlePlanCreationAttributes> implements BundlePlanAttributes {
  public bundle_id!: string;
  public plan_id!: string;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public readonly deleted_at!: Date | null;

  public readonly bundle?: Bundle;
  public readonly plan?: Plan;
}

BundlePlan.init(
  {
    bundle_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'bundles',
        key: 'id',
      },
    },
    plan_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'plans',
        key: 'id',
      },
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'bundle_plans',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    paranoid: true,
    indexes: [
      {
        unique: true,
        fields: ['bundle_id', 'plan_id'],
      },
    ],
  }
);
