import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { SubStatus } from './enums';
import { Organization } from './organization';
import { Plan } from './plan';
import { Bundle } from './bundle';

// ==========================
// Subscription Model
// ==========================

export interface SubscriptionAttributes {
  id: string;
  organization_id: string;
  plan_id?: string;
  bundle_id?: string;
  stripe_subscription_id?: string;
  status: SubStatus;
  trial_start?: Date;
  trial_end?: Date;
  current_period_start?: Date;
  current_period_end?: Date;
  cancel_at_period_end: boolean;
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type SubscriptionCreationAttributes = Optional<
  SubscriptionAttributes,
  | 'id'
  | 'plan_id'
  | 'bundle_id'
  | 'stripe_subscription_id'
  | 'trial_start'
  | 'trial_end'
  | 'current_period_start'
  | 'current_period_end'
  | 'cancel_at_period_end'
  | 'created_at'
  | 'updated_at'
  | 'deleted_at'
>;

export class Subscription extends Model<SubscriptionAttributes, SubscriptionCreationAttributes> implements SubscriptionAttributes {
  public id!: string;
  public organization_id!: string;
  public plan_id!: string | undefined;
  public bundle_id!: string | undefined;
  public stripe_subscription_id!: string;
  public status!: SubStatus;
  public trial_start!: Date;
  public trial_end!: Date;
  public current_period_start!: Date;
  public current_period_end!: Date;
  public cancel_at_period_end!: boolean;
  public readonly deleted_at!: Date | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly organization?: Organization;
  public readonly plan?: Plan;
  public readonly bundle?: Bundle;
}

Subscription.init(
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
    stripe_subscription_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(SubStatus)),
      allowNull: false,
    },
    trial_start: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    trial_end: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'If current date < trial_end, allow access',
    },
    current_period_start: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    current_period_end: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancel_at_period_end: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'subscriptions',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    validate: {
      eitherPlanOrBundle() {
        if (!this.plan_id && !this.bundle_id) {
          throw new Error('Subscription must have either a plan_id or a bundle_id');
        }
      },
    },
  }
);
