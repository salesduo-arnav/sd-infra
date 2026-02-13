import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

// ==========================
// Global Integration Model
// ==========================

export enum GlobalIntegrationStatus {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
}

export interface GlobalIntegrationAttributes {
    id: string;
    organization_id: string;
    service_name: string;
    status: GlobalIntegrationStatus;
    config?: Record<string, unknown> | null;
    credentials?: Record<string, unknown> | null;
    connected_at?: Date | null;
    deleted_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
}

export type GlobalIntegrationCreationAttributes = Optional<
    GlobalIntegrationAttributes,
    'id' | 'status' | 'config' | 'credentials' | 'connected_at' | 'deleted_at' | 'created_at' | 'updated_at'
>;

export class GlobalIntegration
    extends Model<GlobalIntegrationAttributes, GlobalIntegrationCreationAttributes>
    implements GlobalIntegrationAttributes {
    public id!: string;
    public organization_id!: string;
    public service_name!: string;
    public status!: GlobalIntegrationStatus;
    public config!: Record<string, unknown> | null;
    public credentials!: Record<string, unknown> | null;
    public connected_at!: Date | null;
    public readonly deleted_at!: Date | null;
    public readonly created_at!: Date;
    public readonly updated_at!: Date;
}

GlobalIntegration.init(
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
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        service_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM(...Object.values(GlobalIntegrationStatus)),
            defaultValue: GlobalIntegrationStatus.DISCONNECTED,
        },
        config: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: null,
        },
        credentials: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: null,
        },
        connected_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        deleted_at: {
            type: DataTypes.DATE,
            allowNull: true,
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
        tableName: 'global_integrations',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        indexes: [
            {
                unique: true,
                fields: ['organization_id', 'service_name'],
                where: { deleted_at: null },
                name: 'unique_org_service',
            },
        ],
    }
);
