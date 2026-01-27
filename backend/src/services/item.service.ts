import Item from '../models/item';

export const ItemService = {
    async getAllItems() {
        return await Item.findAll({
            order: [['created_at', 'DESC']]
        });
    },

    async getItemById(id: number) {
        const item = await Item.findByPk(id);
        if (!item) {
            throw new Error('Item not found'); // This will be caught by error middleware
        }
        return item;
    },

    async createItem(name: string, description: string) {
        if (!name) {
            throw new Error('Item name is required');
        }
        return await Item.create({ name, description });
    }
};
