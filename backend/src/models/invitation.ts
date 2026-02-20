import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { Role } from './role';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
}

export interface InvitationAttributes {
  id: string;
  organization_id: string;
  email: string;
  role_id: number;
  token: string;
  invited_by: string;
  status: InvitationStatus;
  expires_at: Date;
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type InvitationCreationAttributes = Optional<InvitationAttributes, 'id' | 'status' | 'created_at' | 'updated_at' | 'deleted_at'>;

export class Invitation extends Model<InvitationAttributes, InvitationCreationAttributes> implements InvitationAttributes {
  public id!: string;
  public organization_id!: string;
  public email!: string;
  public role_id!: number;
  public token!: string;
  public invited_by!: string;
  public status!: InvitationStatus;
  public expires_at!: Date;
  public readonly deleted_at!: Date | null;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly role?: Role;
}

Invitation.init(
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
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id',
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: false, // Managed by partial index
    },
    invited_by: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User ID of sender (nullable if user is deleted)',
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    status: {
      type: DataTypes.ENUM(...Object.values(InvitationStatus)),
      defaultValue: InvitationStatus.PENDING,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'invitations',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'email'],
        name: 'invitations_org_email_deleted_at_unique',
        where: {
          deleted_at: null,
        },
      },
      {
        unique: true,
        fields: ['token'],
        name: 'invitations_token_deleted_at_unique',
        where: {
          deleted_at: null,
        },
      },
      {
        unique: true,
        fields: ['organization_id', 'token'],
        name: 'invitations_org_token_deleted_at_unique',
        where: {
          deleted_at: null,
        },
      }
    ],
  }
);
