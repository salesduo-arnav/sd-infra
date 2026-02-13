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
  plan_id?: string | null;
  bundle_id?: string | null;
  upcoming_plan_id?: string | null;
  upcoming_bundle_id?: string | null;
  stripe_subscription_id?: string | null;
  status: SubStatus;
  trial_start?: Date | null;
  trial_end?: Date | null;
  current_period_start?: Date | null;
  current_period_end?: Date | null;
  cancel_at_period_end: boolean;
  last_payment_failure_at?: Date | null;
  card_fingerprint?: string | null;
  cancellation_reason?: string | null;
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
  | 'last_payment_failure_at'
  | 'card_fingerprint'
  | 'cancellation_reason'
>;

export class Subscription extends Model<SubscriptionAttributes, SubscriptionCreationAttributes> implements SubscriptionAttributes {
  public id!: string;
  public organization_id!: string;
  public plan_id!: string | null | undefined;
  public bundle_id!: string | null | undefined;
  public upcoming_plan_id!: string | null | undefined;
  public upcoming_bundle_id!: string | null | undefined;
  public stripe_subscription_id!: string | null;
  public status!: SubStatus;
  public trial_start!: Date | null;
  public trial_end!: Date | null;
  public current_period_start!: Date | null;
  public current_period_end!: Date | null;
  public cancel_at_period_end!: boolean;
  public last_payment_failure_at!: Date | null;
  public card_fingerprint!: string | null;
  public cancellation_reason!: string | null;
  public readonly deleted_at!: Date | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly organization?: Organization;
  public readonly plan?: Plan;
  public readonly bundle?: Bundle;
  public readonly upcoming_plan?: Plan;
  public readonly upcoming_bundle?: Bundle;
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
    upcoming_plan_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'plans',
        key: 'id',
      },
    },
    upcoming_bundle_id: {
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
    last_payment_failure_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    card_fingerprint: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cancellation_reason: {
      type: DataTypes.STRING,
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
