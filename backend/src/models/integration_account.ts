import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

// ==========================
// Integration Account Model
// ==========================

export enum IntegrationType {
    SP_API_SC = 'sp_api_sc',
    SP_API_VC = 'sp_api_vc',
    ADS_API = 'ads_api',
}

export enum Marketplace {
    AMAZON = 'amazon',
    WALMART = 'walmart',
}

export enum IntegrationStatus {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    ERROR = 'error',
    CONNECTING = 'connecting',
}

export interface IntegrationAccountAttributes {
    id: string;
    organization_id: string;
    account_name: string;
    marketplace: Marketplace;
    region: string;
    integration_type: IntegrationType;
    status: IntegrationStatus;
    oauth_state?: string | null;
    credentials?: Record<string, unknown> | null;
    connected_at?: Date | null;
    deleted_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
}

export type IntegrationAccountCreationAttributes = Optional<
    IntegrationAccountAttributes,
    'id' | 'marketplace' | 'status' | 'credentials' | 'connected_at' | 'deleted_at' | 'created_at' | 'updated_at'
>;

export class IntegrationAccount
    extends Model<IntegrationAccountAttributes, IntegrationAccountCreationAttributes>
    implements IntegrationAccountAttributes {
    public id!: string;
    public organization_id!: string;
    public account_name!: string;
    public marketplace!: Marketplace;
    public region!: string;
    public integration_type!: IntegrationType;
    public status!: IntegrationStatus;
    public oauth_state!: string | null;
    public credentials!: Record<string, unknown> | null;
    public connected_at!: Date | null;
    public readonly deleted_at!: Date | null;
    public readonly created_at!: Date;
    public readonly updated_at!: Date;
}

IntegrationAccount.init(
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
        account_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        marketplace: {
            type: DataTypes.ENUM(...Object.values(Marketplace)),
            allowNull: false,
            defaultValue: Marketplace.AMAZON,
        },
        region: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        integration_type: {
            type: DataTypes.ENUM(...Object.values(IntegrationType)),
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM(...Object.values(IntegrationStatus)),
            defaultValue: IntegrationStatus.DISCONNECTED,
        },
        oauth_state: {
            type: DataTypes.STRING,
            allowNull: true,
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
        tableName: 'integration_accounts',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        indexes: [
            {
                unique: true,
                fields: ['organization_id', 'marketplace', 'account_name', 'integration_type'],
                where: { deleted_at: null },
                name: 'unique_org_marketplace_account_type',
            },
        ],
    }
);
