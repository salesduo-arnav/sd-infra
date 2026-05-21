import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { CreditOnCancel, CreditResetInterval } from './enums';
import { Plan } from './plan';
import { Tool } from './tool';

// ==========================
// PlanCreditGrant Model
// ==========================
// Per-plan, per-tool credit configuration. A plan can have multiple grants if
// it spans multiple tools (rare for plans, common when plans are composed into
// bundles).

export interface PlanCreditGrantAttributes {
  id: string;
  plan_id: string;
  tool_id: string;
  credits_per_cycle: number;
  trial_credits: number;
  reset_interval: CreditResetInterval;
  carry_over: boolean;
  on_cancel: CreditOnCancel;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export type PlanCreditGrantCreationAttributes = Optional<
  PlanCreditGrantAttributes,
  | 'id'
  | 'credits_per_cycle'
  | 'trial_credits'
  | 'reset_interval'
  | 'carry_over'
  | 'on_cancel'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
>;

export class PlanCreditGrant
  extends Model<PlanCreditGrantAttributes, PlanCreditGrantCreationAttributes>
  implements PlanCreditGrantAttributes
{
  public id!: string;
  public plan_id!: string;
  public tool_id!: string;
  public credits_per_cycle!: number;
  public trial_credits!: number;
  public reset_interval!: CreditResetInterval;
  public carry_over!: boolean;
  public on_cancel!: CreditOnCancel;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public readonly deleted_at!: Date | null;

  public readonly plan?: Plan;
  public readonly tool?: Tool;
}

PlanCreditGrant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    plan_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'plans', key: 'id' },
    },
    tool_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tools', key: 'id' },
    },
    credits_per_cycle: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    trial_credits: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reset_interval: {
      type: DataTypes.ENUM(...Object.values(CreditResetInterval)),
      allowNull: false,
      defaultValue: CreditResetInterval.MONTHLY,
    },
    carry_over: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    on_cancel: {
      type: DataTypes.ENUM(...Object.values(CreditOnCancel)),
      allowNull: false,
      defaultValue: CreditOnCancel.KEEP_TILL_GRANT_PERIOD_END,
    },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'plan_credit_grants',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      {
        unique: true,
        fields: ['plan_id', 'tool_id'],
        where: { deleted_at: null },
      },
    ],
  },
);
