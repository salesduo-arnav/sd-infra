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
  trial_period_days: number;
  is_public: boolean;
  active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type PlanCreationAttributes = Optional<
  PlanAttributes,
  'id' | 'description' | 'trial_period_days' | 'is_public' | 'active' | 'created_at' | 'updated_at'
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
  public trial_period_days!: number;
  public is_public!: boolean;
  public active!: boolean;
  
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
    trial_period_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'If > 0, auto-set trial_end on sub creation',
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'plans',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);
