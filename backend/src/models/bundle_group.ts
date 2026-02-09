import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

// ==========================
// BundleGroup Model
// ==========================

export interface BundleGroupAttributes {
  id: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export type BundleGroupCreationAttributes = Optional<BundleGroupAttributes, 'id' | 'description' | 'active' | 'created_at' | 'updated_at' | 'deleted_at'>;

export class BundleGroup extends Model<BundleGroupAttributes, BundleGroupCreationAttributes> implements BundleGroupAttributes {
  public id!: string;
  public name!: string;
  public slug!: string;
  public description!: string;
  public active!: boolean;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public readonly deleted_at!: Date | null;
}

BundleGroup.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: false, // Managed by partial index
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'bundle_groups',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    paranoid: true,
    indexes: [
      {
        unique: true,
        fields: ['slug'],
        where: {
          deleted_at: null,
        },
      },
    ],
  }
);
