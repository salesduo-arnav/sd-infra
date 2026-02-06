import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

export type UserAttributes = {
  id: string;
  email: string;
  password_hash: string | null;
  full_name?: string;
  is_superuser: boolean;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export type UserCreationAttributes = Optional<UserAttributes, 'id' | 'is_superuser' | 'created_at' | 'updated_at' | 'deleted_at'>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public email!: string;
  public password_hash!: string | null;
  public full_name!: string;
  public is_superuser!: boolean;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  public readonly deleted_at!: Date | null;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: false, // Managed by partial index
      validate: {
        isEmail: true,
      },
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    full_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_superuser: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
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
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at',
    },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      {
        unique: true,
        fields: ['email'],
        where: {
          deleted_at: null,
        },
      },
    ],
    hooks: {
      afterDestroy: async (user, options) => {
        const { OrganizationMember } = await import('./organization'); // Dynamic import to avoid circular dependency
        await OrganizationMember.destroy({
          where: { user_id: user.id },
          transaction: options.transaction,
        });
      },
    },
  }
);

export default User;