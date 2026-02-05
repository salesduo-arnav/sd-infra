import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { FeatureType } from './enums';
import { Tool } from './tool';

// ==========================
// Feature Model
// ==========================

export interface FeatureAttributes {
  id: string;
  tool_id: string;
  name: string;
  slug: string;
  type: FeatureType;
  description?: string;
  created_at?: Date;
  updated_at?: Date;
}

export type FeatureCreationAttributes = Optional<FeatureAttributes, 'id' | 'description' | 'created_at' | 'updated_at'>;

export class Feature extends Model<FeatureAttributes, FeatureCreationAttributes> implements FeatureAttributes {
  public id!: string;
  public tool_id!: string;
  public name!: string;
  public slug!: string;
  public type!: FeatureType;
  public description!: string;
  
  public readonly created_at!: Date;
  public readonly updated_at!: Date;

  public readonly tool?: Tool;
}

Feature.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tool_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tools',
        key: 'id',
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'Unique key for code checks: e.g. "img_gen_count"',
    },
    type: {
      type: DataTypes.ENUM(...Object.values(FeatureType)),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'features',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);
