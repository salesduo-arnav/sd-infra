
import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { User } from './user';
import { Organization } from './organization';
import { Tool } from './tool';

// ==========================
// ToolUsage Model
// ==========================

export interface ToolUsageAttributes {
    id: string;
    tool_id: string;
    user_id: string;
    organization_id: string;
    date: string; // YYYY-MM-DD
    count: number;
    created_at?: Date;
    updated_at?: Date;
}

export type ToolUsageCreationAttributes = Optional<ToolUsageAttributes, 'id' | 'count' | 'created_at' | 'updated_at'>;

export class ToolUsage extends Model<ToolUsageAttributes, ToolUsageCreationAttributes> implements ToolUsageAttributes {
    public id!: string;
    public tool_id!: string;
    public user_id!: string;
    public organization_id!: string;
    public date!: string;
    public count!: number;

    public readonly created_at!: Date;
    public readonly updated_at!: Date;

    public readonly tool?: Tool;
    public readonly user?: User;
    public readonly organization?: Organization;
}

ToolUsage.init(
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
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'organizations',
                key: 'id',
            },
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        count: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
            allowNull: false,
            comment: 'Incremented via findOrCreate + increment pattern: a row is created per (tool, user, org, date) and the count is atomically incremented on each subsequent usage.',
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize,
        tableName: 'tool_usages',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                unique: true,
                fields: ['tool_id', 'user_id', 'organization_id', 'date'],
                name: 'unique_usage_per_day',
            },
        ],
    }
);
