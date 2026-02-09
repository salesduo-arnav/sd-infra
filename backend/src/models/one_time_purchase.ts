import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { Organization } from './organization';
import { Plan } from './plan';
import { Bundle } from './bundle';

// ==========================
// OneTimePurchase Model
// ==========================

export interface OneTimePurchaseAttributes {
  id: string;
  organization_id: string;
  plan_id?: string;
  bundle_id?: string;
  stripe_payment_intent_id?: string;
  amount_paid?: number;
  currency?: string;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export type OneTimePurchaseCreationAttributes = Optional<
  OneTimePurchaseAttributes,
  'id' | 'plan_id' | 'bundle_id' | 'stripe_payment_intent_id' | 'amount_paid' | 'currency' | 'status' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export class OneTimePurchase extends Model<OneTimePurchaseAttributes, OneTimePurchaseCreationAttributes> implements OneTimePurchaseAttributes {
  public id!: string;
  public organization_id!: string;
  public plan_id!: string | undefined;
  public bundle_id!: string | undefined;
  public stripe_payment_intent_id!: string;
  public amount_paid!: number;
  public currency!: string;
  public status!: string;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public readonly deleted_at!: Date | null;

  public readonly organization?: Organization;
  public readonly plan?: Plan;
  public readonly bundle?: Bundle;
}

OneTimePurchase.init(
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
    plan_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'plans',
        key: 'id',
      },
    },
    bundle_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'bundles',
        key: 'id',
      },
    },
    stripe_payment_intent_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: false, // Partial index in DB
    },
    amount_paid: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'succeeded, refunded',
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'one_time_purchases',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    paranoid: true,
  }
);
