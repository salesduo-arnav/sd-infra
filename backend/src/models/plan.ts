import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { PriceInterval, TierType } from './enums';
import { Tool } from './tool';

// ==========================
// Plan Model
// ==========================

export interface PlanAttributes {
  id: string;
  name: string;
  description?: string;
  tool_id: string;
  tier: TierType;
  price: number;
  currency: string;
  interval: PriceInterval;
  stripe_product_id?: string;
  stripe_price_id_monthly?: string;
  stripe_price_id_yearly?: string;
  active: boolean;
  is_trial_plan: boolean;
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type PlanCreationAttributes = Optional<
  PlanAttributes,
  'id' | 'description' | 'active' | 'is_trial_plan' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export class Plan extends Model<PlanAttributes, PlanCreationAttributes> implements PlanAttributes {
  public id!: string;
  public name!: string;
  public description!: string;
  public tool_id!: string;
  public tier!: TierType;
  public price!: number;
  public currency!: string;
  public interval!: PriceInterval;
  public stripe_product_id!: string;
  public stripe_price_id_monthly!: string;
  public stripe_price_id_yearly!: string;

  public active!: boolean;
  public is_trial_plan!: boolean;
  public readonly deleted_at!: Date | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly tool?: Tool;
}

Plan.init(
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tool_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tools',
        key: 'id',
      },
    },
    tier: {
      type: DataTypes.ENUM(...Object.values(TierType)),
      allowNull: false,
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    interval: {
      type: DataTypes.ENUM(...Object.values(PriceInterval)),
      allowNull: false,
    },
    stripe_product_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stripe_price_id_monthly: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stripe_price_id_yearly: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    is_trial_plan: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Marks this plan as the trial plan for its tool',
    },
  },
  {
    sequelize,
    tableName: 'plans',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    hooks: {
      afterDestroy: async (plan, options) => {
        const { PlanLimit } = await import('./plan_limit');
        const { BundlePlan } = await import('./bundle_plan');

        await PlanLimit.destroy({ where: { plan_id: plan.id }, transaction: options.transaction });
        await BundlePlan.destroy({ where: { plan_id: plan.id }, transaction: options.transaction });
      }
    }
  }
);
