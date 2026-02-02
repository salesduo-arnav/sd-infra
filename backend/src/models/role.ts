import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

// ==========================
// Role Model
// ==========================

export interface RoleAttributes {
  id: number;
  name: string;
  description?: string;
}

export type RoleCreationAttributes = Optional<RoleAttributes, 'id' | 'description'>;

export class Role extends Model<RoleAttributes, RoleCreationAttributes> implements RoleAttributes {
  public id!: number;
  public name!: string;
  public description!: string;

  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Role.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'roles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);


// ==========================
// Permission Model
// ==========================

export interface PermissionAttributes {
  id: string; // e.g. 'org.update'
  description?: string;
  category?: string;
}

export type PermissionCreationAttributes = Optional<PermissionAttributes, 'description' | 'category'>;

export class Permission extends Model<PermissionAttributes, PermissionCreationAttributes> implements PermissionAttributes {
  public id!: string;
  public description!: string;
  public category!: string;
}

Permission.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      comment: 'e.g. org.update, billing.view, members.invite',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'grouping for UI e.g. Billing, Settings',
    },
  },
  {
    sequelize,
    tableName: 'permissions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);


// ==========================
// RolePermission Model
// ==========================

export interface RolePermissionAttributes {
  role_id: number;
  permission_id: string;
}

export class RolePermission extends Model<RolePermissionAttributes> implements RolePermissionAttributes {
  public role_id!: number;
  public permission_id!: string;
}

RolePermission.init(
  {
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'roles',
        key: 'id',
      },
    },
    permission_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'permissions',
        key: 'id',
      },
    },
  },
  {
    sequelize,
    tableName: 'role_permissions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);
