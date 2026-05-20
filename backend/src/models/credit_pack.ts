import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { Tool } from './tool';

// ==========================
// CreditPack Model
// ==========================
// One-time purchasable credit bundles per tool. Backed by a Stripe Product+Price.

export interface CreditPackAttributes {
  id: string;
  tool_id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  active: boolean;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export type CreditPackCreationAttributes = Optional<
  CreditPackAttributes,
  'id' | 'currency' | 'stripe_product_id' | 'stripe_price_id' | 'active' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export class CreditPack
  extends Model<CreditPackAttributes, CreditPackCreationAttributes>
  implements CreditPackAttributes
{
  public id!: string;
  public tool_id!: string;
  public name!: string;
  public credits!: number;
  public price!: number;
  public currency!: string;
  public stripe_product_id!: string | null;
  public stripe_price_id!: string | null;
  public active!: boolean;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public readonly deleted_at!: Date | null;

  public readonly tool?: Tool;
}

CreditPack.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tool_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tools', key: 'id' },
    },
    name: { type: DataTypes.STRING, allowNull: false },
    credits: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    price: { type: DataTypes.INTEGER, allowNull: false },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    stripe_product_id: { type: DataTypes.STRING, allowNull: true },
    stripe_price_id: { type: DataTypes.STRING, allowNull: true },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'credit_packs',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  },
);
