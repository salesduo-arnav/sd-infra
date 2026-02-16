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
  tool_link?: string;
  is_active: boolean;
  trial_card_required: boolean;
  trial_days: number;
  required_integrations?: string[];
  deleted_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type ToolCreationAttributes = Optional<ToolAttributes, 'id' | 'description' | 'tool_link' | 'is_active' | 'trial_card_required' | 'required_integrations' | 'created_at' | 'updated_at' | 'deleted_at'>;

export class Tool extends Model<ToolAttributes, ToolCreationAttributes> implements ToolAttributes {
  public id!: string;
  public name!: string;
  public slug!: string;
  public description!: string;
  public tool_link!: string;
  public is_active!: boolean;
  public trial_card_required!: boolean;
  public trial_days!: number;
  public required_integrations!: string[];
  public readonly deleted_at!: Date | null;

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
      unique: false, // Managed by partial index
      comment: 'e.g. image-generator',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tool_link: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    trial_card_required: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether a credit card is required to start a free trial',
    },
    trial_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Default trial period in days for this tool',
    },
    required_integrations: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of integration type slugs required for this tool, e.g. ["sp_api_sc", "ads_api"]',
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'tools',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    indexes: [
      {
        unique: true,
        fields: ['slug'],
        where: {
          deleted_at: null,
        },
      },
    ],
    hooks: {
      afterDestroy: async (tool, options) => {
        const { Feature } = await import('./feature');
        const { Plan } = await import('./plan');
        const { OrganizationEntitlement } = await import('./organization_entitlement');

        await Feature.destroy({ where: { tool_id: tool.id }, transaction: options.transaction, individualHooks: true });
        await Plan.destroy({ where: { tool_id: tool.id }, transaction: options.transaction, individualHooks: true }); // individualHooks for Plan cascade
        await OrganizationEntitlement.destroy({ where: { tool_id: tool.id }, transaction: options.transaction });
      }
    }
  }
);
