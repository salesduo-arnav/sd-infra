import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { Organization } from './organization';
import { Tool } from './tool';

// ==========================
// CreditWallet Model
// ==========================
// Materialized balance per (organization, tool). One row per org-tool pair.
// Mutations always go through CreditService inside a transaction with FOR UPDATE
// on this row.

export interface CreditWalletAttributes {
  id: string;
  organization_id: string;
  tool_id: string;
  plan_balance: number;
  purchased_balance: number;
  reserved_amount: number;
  next_reset_at?: Date | null;
  last_granted_period_start?: Date | null;
  metadata?: Record<string, unknown>;
  created_at?: Date;
  updated_at?: Date;
}

export type CreditWalletCreationAttributes = Optional<
  CreditWalletAttributes,
  | 'id'
  | 'plan_balance'
  | 'purchased_balance'
  | 'reserved_amount'
  | 'next_reset_at'
  | 'last_granted_period_start'
  | 'metadata'
  | 'created_at'
  | 'updated_at'
>;

export class CreditWallet
  extends Model<CreditWalletAttributes, CreditWalletCreationAttributes>
  implements CreditWalletAttributes
{
  public id!: string;
  public organization_id!: string;
  public tool_id!: string;
  public plan_balance!: number;
  public purchased_balance!: number;
  public reserved_amount!: number;
  public next_reset_at!: Date | null;
  public last_granted_period_start!: Date | null;
  public metadata!: Record<string, unknown>;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly organization?: Organization;
  public readonly tool?: Tool;
}

CreditWallet.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
    },
    tool_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tools', key: 'id' },
    },
    plan_balance: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    purchased_balance: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    reserved_amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    next_reset_at: { type: DataTypes.DATE, allowNull: true },
    last_granted_period_start: { type: DataTypes.DATE, allowNull: true },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    tableName: 'credit_wallets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'tool_id'],
        name: 'credit_wallets_org_tool_unique',
      },
    ],
  },
);
