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
  created_at?: Date;
  updated_at?: Date;
}

export type InvitationCreationAttributes = Optional<InvitationAttributes, 'id' | 'status' | 'created_at' | 'updated_at'>;

export class Invitation extends Model<InvitationAttributes, InvitationCreationAttributes> implements InvitationAttributes {
  public id!: string;
  public organization_id!: string;
  public email!: string;
  public role_id!: number;
  public token!: string;
  public invited_by!: string;
  public status!: InvitationStatus;
  public expires_at!: Date;
  
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
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    invited_by: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User ID of sender',
      references: {
        model: 'users',
        key: 'id',
      },
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
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['organization_id', 'email'],
        name: 'invitations_organization_id_email', // Explicit naming to prevent duplicate invites
      },
    ],
  }
);
