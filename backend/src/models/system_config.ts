import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/db';

export class SystemConfig extends Model {
  public key!: string;
  public value!: string;
  public description?: string;
  public category!: string; // e.g., 'payment', 'general', 'email'

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

SystemConfig.init(
  {
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'general',
    },
  },
  {
    sequelize,
    tableName: 'system_configs',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);
