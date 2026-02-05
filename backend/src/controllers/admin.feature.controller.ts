import { Request, Response } from 'express';
import { Feature } from '../models/feature';
import { Tool } from '../models/tool';
import { FeatureType } from '../models/enums';
import { Op } from 'sequelize';
import sequelize from '../config/db';

// ==========================
// Feature Config Controllers
// ==========================

export const getFeatures = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const search = req.query.search as string;
        const sortBy = (req.query.sortBy as string) || 'created_at';
        const sortOrder = (req.query.sortOrder as string) === 'desc' ? 'DESC' : 'ASC'; // Default ASC for features usually

        const { tool_id } = req.query;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: any = {};
        if (tool_id) {
            whereClause.tool_id = tool_id;
        }

        if (search) {
             whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { slug: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const { count, rows } = await Feature.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
            include: [{ model: Tool, as: 'tool', attributes: ['name', 'slug'] }],
            distinct: true
        });

        res.status(200).json({
            features: rows,
            meta: {
                totalItems: count,
                totalPages: Math.ceil(count / limit),
                currentPage: page,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Get Features Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getFeatureById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const feature = await Feature.findByPk(id, {
             include: [{ model: Tool, as: 'tool', attributes: ['name', 'slug'] }]
        });

        if (!feature) {
            return res.status(404).json({ message: 'Feature not found' });
        }

        res.status(200).json(feature);
    } catch (error) {
        console.error('Get Feature Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createFeature = async (req: Request, res: Response) => {
    try {
        const { tool_id, name, slug, type, description } = req.body;

        if (!tool_id || !name || !slug || !type) {
            return res.status(400).json({ message: 'Tool ID, Name, Slug, and Type are required' });
        }

        // Validate Type
        if (!Object.values(FeatureType).includes(type)) {
             return res.status(400).json({ message: 'Invalid feature type' });
        }

        const feature = await sequelize.transaction(async (t) => {
            const existingFeature = await Feature.findOne({ where: { slug }, transaction: t });
            if (existingFeature) {
                throw new Error('ALREADY_EXISTS');
            }

            return await Feature.create({
                tool_id,
                name,
                slug,
                type,
                description
            }, { transaction: t });
        });

        res.status(201).json(feature);
    } catch (error: any) {
        if (error.message === 'ALREADY_EXISTS') {
             return res.status(400).json({ message: 'Feature with this slug already exists globally' });
        }
        console.error('Create Feature Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateFeature = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, slug, type, description } = req.body;

        const updatedFeature = await sequelize.transaction(async (t) => {
            const feature = await Feature.findByPk(id, { transaction: t });

            if (!feature) {
                throw new Error('NOT_FOUND');
            }

            if (slug && slug !== feature.slug) {
                const existingFeature = await Feature.findOne({ where: { slug }, transaction: t });
                if (existingFeature) {
                    throw new Error('SLUG_EXISTS');
                }
            }

            return await feature.update({
                name: name ?? feature.name,
                slug: slug ?? feature.slug,
                type: type ?? feature.type, // Be careful updating type if data depends on it
                description: description ?? feature.description
            }, { transaction: t });
        });

        res.status(200).json(updatedFeature);
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ message: 'Feature not found' });
        }
        if (error.message === 'SLUG_EXISTS') {
            return res.status(400).json({ message: 'Feature with this slug already exists' });
        }
        console.error('Update Feature Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteFeature = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        await sequelize.transaction(async (t) => {
            const feature = await Feature.findByPk(id, { transaction: t });

            if (!feature) {
                throw new Error('NOT_FOUND');
            }

            await feature.destroy({ transaction: t });
        });
        
        res.status(200).json({ message: 'Feature deleted successfully' });
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ message: 'Feature not found' });
        }
        console.error('Delete Feature Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
