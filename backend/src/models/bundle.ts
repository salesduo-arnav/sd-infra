import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { PriceInterval } from './enums';

// ==========================
// Bundle Model
// ==========================

export interface BundleAttributes {
  id: string;
  name: string;
  slug: string;
  bundle_group_id?: string;
  tier_label?: string;
  price: number;
  currency: string;
  interval: PriceInterval;
  description?: string;
  active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type BundleCreationAttributes = Optional<BundleAttributes, 'id' | 'description' | 'active' | 'created_at' | 'updated_at'>;

export class Bundle extends Model<BundleAttributes, BundleCreationAttributes> implements BundleAttributes {
  public id!: string;
  public name!: string;
  public slug!: string;
  public bundle_group_id!: string;
  public tier_label!: string;
  public price!: number;
  public currency!: string;
  public interval!: PriceInterval;
  public description!: string;
  public active!: boolean;
  
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Bundle.init(
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
      unique: true,
    },
    bundle_group_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'bundle_groups',
        key: 'id',
      },
    },
    tier_label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Billing Info (Overrides individual plan prices)',
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    interval: {
      type: DataTypes.ENUM(...Object.values(PriceInterval)),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'bundles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);
