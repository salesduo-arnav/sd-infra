import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

// ==========================
// Tool Model
// ==========================

export interface ToolAttributes {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type ToolCreationAttributes = Optional<ToolAttributes, 'id' | 'description' | 'is_active' | 'created_at' | 'updated_at'>;

export class Tool extends Model<ToolAttributes, ToolCreationAttributes> implements ToolAttributes {
  public id!: string;
  public name!: string;
  public slug!: string;
  public description!: string;
  public is_active!: boolean;
  
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Tool.init(
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
      comment: 'e.g. image-generator',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'tools',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);
