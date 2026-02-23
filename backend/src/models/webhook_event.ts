import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

export enum WebhookEventStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED'
}

export interface WebhookEventAttributes {
  id: string;
  stripe_event_id: string;
  type: string;
  status: WebhookEventStatus;
  error_message?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export type WebhookEventCreationAttributes = Optional<
  WebhookEventAttributes,
  'id' | 'status' | 'error_message' | 'created_at' | 'updated_at'
>;

export class WebhookEvent extends Model<WebhookEventAttributes, WebhookEventCreationAttributes> implements WebhookEventAttributes {
  public id!: string;
  public stripe_event_id!: string;
  public type!: string;
  public status!: WebhookEventStatus;
  public error_message!: string | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

WebhookEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    stripe_event_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(WebhookEventStatus)),
      allowNull: false,
      defaultValue: WebhookEventStatus.PENDING,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'webhook_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);
