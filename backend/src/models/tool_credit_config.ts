import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { Tool } from './tool';

// ==========================
// ToolCreditConfig Model
// ==========================
// One row per tool. Holds a-la-carte credit-purchase configuration. Distinct from
// the `tools` table so the existing tool model + behavior is unchanged.

export interface ToolCreditConfigAttributes {
  tool_id: string;
  alacarte_enabled: boolean;
  price_per_credit?: number | null;
  currency: string;
  alacarte_stripe_product_id?: string | null;
  alacarte_stripe_price_id?: string | null;
  min_credits: number;
  max_credits?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export type ToolCreditConfigCreationAttributes = Optional<
  ToolCreditConfigAttributes,
  | 'alacarte_enabled'
  | 'price_per_credit'
  | 'currency'
  | 'alacarte_stripe_product_id'
  | 'alacarte_stripe_price_id'
  | 'min_credits'
  | 'max_credits'
  | 'created_at'
  | 'updated_at'
>;

export class ToolCreditConfig
  extends Model<ToolCreditConfigAttributes, ToolCreditConfigCreationAttributes>
  implements ToolCreditConfigAttributes
{
  public tool_id!: string;
  public alacarte_enabled!: boolean;
  public price_per_credit!: number | null;
  public currency!: string;
  public alacarte_stripe_product_id!: string | null;
  public alacarte_stripe_price_id!: string | null;
  public min_credits!: number;
  public max_credits!: number | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly tool?: Tool;
}

ToolCreditConfig.init(
  {
    tool_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      references: { model: 'tools', key: 'id' },
    },
    alacarte_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    price_per_credit: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    alacarte_stripe_product_id: { type: DataTypes.STRING, allowNull: true },
    alacarte_stripe_price_id: { type: DataTypes.STRING, allowNull: true },
    min_credits: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    max_credits: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    tableName: 'tool_credit_configs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);
