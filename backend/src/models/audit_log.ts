import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { User } from './user';

export interface AuditLogAttributes {
    id: string;
    actor_id?: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    details?: object;
    ip_address?: string | null;
    created_at?: Date;
}

export type AuditLogCreationAttributes = Optional<AuditLogAttributes, 'id' | 'created_at'>;

export class AuditLog extends Model<AuditLogAttributes, AuditLogCreationAttributes> implements AuditLogAttributes {
    public id!: string;
    public actor_id!: string | null;
    public action!: string;
    public entity_type!: string;
    public entity_id!: string;
    public details!: object;
    public ip_address!: string | null;
    public readonly created_at!: Date;

    public readonly actor?: User;
}

AuditLog.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        actor_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        action: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        entity_type: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        entity_id: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        details: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
        ip_address: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            field: 'created_at',
        }
    },
    {
        sequelize,
        tableName: 'audit_logs',
        timestamps: true,
        updatedAt: false, // Audit logs are immutable
        createdAt: 'created_at'
    }
);

// Define associations
AuditLog.belongsTo(User, { foreignKey: 'actor_id', as: 'actor' });

export default AuditLog;
