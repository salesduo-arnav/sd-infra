import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import { Marketplace } from './integration_account';

// ==========================
// Integration Account Group Model
// ==========================

export interface IntegrationAccountGroupAttributes {
    id: string;
    organization_id: string;
    account_name: string;
    marketplace: Marketplace;
    region: string;
    deleted_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
}

export type IntegrationAccountGroupCreationAttributes = Optional<
    IntegrationAccountGroupAttributes,
    'id' | 'marketplace' | 'deleted_at' | 'created_at' | 'updated_at'
>;

export class IntegrationAccountGroup
    extends Model<IntegrationAccountGroupAttributes, IntegrationAccountGroupCreationAttributes>
    implements IntegrationAccountGroupAttributes {
    public id!: string;
    public organization_id!: string;
    public account_name!: string;
    public marketplace!: Marketplace;
    public region!: string;
    public readonly deleted_at!: Date | null;
    public readonly created_at!: Date;
    public readonly updated_at!: Date;
}

IntegrationAccountGroup.init(
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
        tableName: 'integration_account_groups',
        timestamps: true,
        paranoid: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        indexes: [
            {
                unique: true,
                fields: ['organization_id', 'marketplace', 'account_name', 'region'],
                where: { deleted_at: null },
                name: 'unique_org_marketplace_account_region',
            },
        ],
    }
);
