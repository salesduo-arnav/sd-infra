import { Request, Response, NextFunction } from 'express';
import { ItemService } from '../services/item.service';

export const ItemController = {
    async getItems(req: Request, res: Response, next: NextFunction) {
        try {
            // If you need the user ID from the Gateway:
            // const userId = req.headers['x-user-id']; 

            const items = await ItemService.getAllItems();
            res.json(items);
        } catch (error) {
            next(error);
        }
    },

    async getOneItem(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(req.params.id);
            const item = await ItemService.getItemById(id);
            res.json(item);
        } catch (error) {
            next(error);
        }
    },

    async createItem(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, description } = req.body;
            const newItem = await ItemService.createItem(name, description);
            res.status(201).json(newItem);
        } catch (error) {
            next(error);
        }
    }
};