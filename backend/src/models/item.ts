import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

interface ItemAttributes {
    id: number;
    name: string;
    description?: string;
    created_at?: Date;
    // updatedAt is automatically handled by Sequelize if timestamps: true, but existing schema used created_at only maybe?
    // The old migration showed created_at using default current_timestamp.
    // We can enable timestamps: true (adds createdAt and updatedAt) or map them.
}

// We need to define CreationAttributes for optional fields on creation
interface ItemCreationAttributes extends Optional<ItemAttributes, 'id' | 'created_at'> { }

export class Item extends Model<ItemAttributes, ItemCreationAttributes> implements ItemAttributes {
    public id!: number;
    public name!: string;
    public description!: string;
    public readonly created_at!: Date;
    // public readonly updatedAt!: Date; // Sequelize default
}

Item.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        created_at: {
            type: DataTypes.DATE, // 'timestamp' in postgres maps to DATE in Sequelize
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'created_at' // Map to snake_case column name
        },
    },
    {
        sequelize,
        tableName: 'items',
        timestamps: false, // Disabling default timestamps (createdAt, updatedAt) to match existing schema strictly for now, or we can enable them.
        // Existing schema only had created_at. Let's keep it simple and control it manually or via mapping.
        // Actually, let's use timestamps: false for exact control since we defined created_at manually.
    }
);

export default Item;
