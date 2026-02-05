import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { FeatureResetPeriod } from './enums';
import { Plan } from './plan';
import { Feature } from './feature';

// ==========================
// PlanLimit Model
// ==========================

export interface PlanLimitAttributes {
  id: string;
  plan_id: string;
  feature_id: string;
  default_limit?: number;
  reset_period: FeatureResetPeriod;
  created_at?: Date;
  updated_at?: Date;
}

export type PlanLimitCreationAttributes = Optional<PlanLimitAttributes, 'id' | 'default_limit' | 'reset_period' | 'created_at' | 'updated_at'>;

export class PlanLimit extends Model<PlanLimitAttributes, PlanLimitCreationAttributes> implements PlanLimitAttributes {
  public id!: string;
  public plan_id!: string;
  public feature_id!: string;
  public default_limit!: number;
  public reset_period!: FeatureResetPeriod;
  
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly plan?: Plan;
  public readonly feature?: Feature;
}

PlanLimit.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    plan_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'plans',
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
    default_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Null/0 for boolean features, Number for metered',
    },
    reset_period: {
      type: DataTypes.ENUM(...Object.values(FeatureResetPeriod)),
      defaultValue: FeatureResetPeriod.MONTHLY,
    },
  },
  {
    sequelize,
    tableName: 'plan_limits',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['plan_id', 'feature_id'],
      },
    ],
  }
);
