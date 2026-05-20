import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { CreditReservationStatus } from './enums';
import { Organization } from './organization';
import { Tool } from './tool';

// ==========================
// CreditReservation Model
// ==========================
// Records a "held" amount that was debited from the wallet at reserve time and
// is either settled (committed) or released (refunded) later. Reservation TTL
// is enforced by the cron sweeper.

export interface CreditReservationAttributes {
  id: string;
  organization_id: string;
  tool_id: string;
  amount: number;
  plan_portion: number;
  purchased_portion: number;
  status: CreditReservationStatus;
  idempotency_key: string;
  expires_at: Date;
  settled_at?: Date | null;
  released_at?: Date | null;
  metadata?: Record<string, unknown>;
  created_at?: Date;
}

export type CreditReservationCreationAttributes = Optional<
  CreditReservationAttributes,
  | 'id'
  | 'plan_portion'
  | 'purchased_portion'
  | 'status'
  | 'settled_at'
  | 'released_at'
  | 'metadata'
  | 'created_at'
>;

export class CreditReservation
  extends Model<CreditReservationAttributes, CreditReservationCreationAttributes>
  implements CreditReservationAttributes
{
  public id!: string;
  public organization_id!: string;
  public tool_id!: string;
  public amount!: number;
  public plan_portion!: number;
  public purchased_portion!: number;
  public status!: CreditReservationStatus;
  public idempotency_key!: string;
  public expires_at!: Date;
  public settled_at!: Date | null;
  public released_at!: Date | null;
  public metadata!: Record<string, unknown>;

  public readonly created_at!: Date;

  public readonly organization?: Organization;
  public readonly tool?: Tool;
}

CreditReservation.init(
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
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
    plan_portion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    purchased_portion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(CreditReservationStatus)),
      allowNull: false,
      defaultValue: CreditReservationStatus.HELD,
    },
    idempotency_key: { type: DataTypes.STRING, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    settled_at: { type: DataTypes.DATE, allowNull: true },
    released_at: { type: DataTypes.DATE, allowNull: true },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    tableName: 'credit_reservations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'tool_id', 'idempotency_key'],
        name: 'credit_reservations_org_tool_idem_unique',
      },
    ],
  },
);
