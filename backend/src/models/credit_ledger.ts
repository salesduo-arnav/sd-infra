import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { CreditBucket, CreditEntryType } from './enums';
import { Organization } from './organization';
import { Tool } from './tool';
import { CreditReservation } from './credit_reservation';

// ==========================
// CreditLedgerEntry Model
// ==========================
// Append-only audit log for every credit-wallet mutation.

export interface CreditLedgerEntryAttributes {
  id: number;
  organization_id: string;
  tool_id: string;
  entry_type: CreditEntryType;
  bucket: CreditBucket;
  amount: number;
  balance_after_plan: number;
  balance_after_purchased: number;
  reservation_id?: string | null;
  idempotency_key?: string | null;
  source: string;
  related_subscription_id?: string | null;
  related_plan_id?: string | null;
  related_purchase_id?: string | null;
  related_credit_pack_id?: string | null;
  admin_user_id?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  operation_slug?: string | null;
  created_at?: Date;
}

export type CreditLedgerEntryCreationAttributes = Optional<
  CreditLedgerEntryAttributes,
  | 'id'
  | 'reservation_id'
  | 'idempotency_key'
  | 'related_subscription_id'
  | 'related_plan_id'
  | 'related_purchase_id'
  | 'related_credit_pack_id'
  | 'admin_user_id'
  | 'reason'
  | 'metadata'
  | 'operation_slug'
  | 'created_at'
>;

export class CreditLedgerEntry
  extends Model<CreditLedgerEntryAttributes, CreditLedgerEntryCreationAttributes>
  implements CreditLedgerEntryAttributes
{
  public id!: number;
  public organization_id!: string;
  public tool_id!: string;
  public entry_type!: CreditEntryType;
  public bucket!: CreditBucket;
  public amount!: number;
  public balance_after_plan!: number;
  public balance_after_purchased!: number;
  public reservation_id!: string | null;
  public idempotency_key!: string | null;
  public source!: string;
  public related_subscription_id!: string | null;
  public related_plan_id!: string | null;
  public related_purchase_id!: string | null;
  public related_credit_pack_id!: string | null;
  public admin_user_id!: string | null;
  public reason!: string | null;
  public metadata!: Record<string, unknown>;
  public operation_slug!: string | null;

  public readonly created_at!: Date;

  public readonly organization?: Organization;
  public readonly tool?: Tool;
  public readonly reservation?: CreditReservation;
}

CreditLedgerEntry.init(
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
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
    entry_type: {
      type: DataTypes.ENUM(...Object.values(CreditEntryType)),
      allowNull: false,
    },
    bucket: {
      type: DataTypes.ENUM(...Object.values(CreditBucket)),
      allowNull: false,
    },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    balance_after_plan: { type: DataTypes.INTEGER, allowNull: false },
    balance_after_purchased: { type: DataTypes.INTEGER, allowNull: false },
    reservation_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'credit_reservations', key: 'id' },
    },
    idempotency_key: { type: DataTypes.STRING, allowNull: true },
    source: { type: DataTypes.STRING(64), allowNull: false },
    related_subscription_id: { type: DataTypes.UUID, allowNull: true },
    related_plan_id: { type: DataTypes.UUID, allowNull: true },
    related_purchase_id: { type: DataTypes.UUID, allowNull: true },
    related_credit_pack_id: { type: DataTypes.UUID, allowNull: true },
    admin_user_id: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    operation_slug: { type: DataTypes.STRING(128), allowNull: true },
  },
  {
    sequelize,
    tableName: 'credit_ledger',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);
