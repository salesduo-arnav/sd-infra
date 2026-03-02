import { Request, Response } from 'express';
import { Feature } from '../models/feature';
import { Tool } from '../models/tool';
import { Op } from 'sequelize';
import sequelize from '../config/db';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';
import Logger from '../utils/logger';

// ==========================
// Feature Config Controllers
// ==========================

export const getFeatures = async (req: Request, res: Response) => {
    try {
        const { page, limit, offset, sortBy, sortOrder } = getPaginationOptions(req);
        const search = req.query.search as string;
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

        res.status(200).json(formatPaginationResponse(rows, count, page, limit, 'features'));
    } catch (error) {
        handleError(res, error, 'Get Features Error');
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
        handleError(res, error, 'Get Feature Error');
    }
};

export const createFeature = async (req: Request, res: Response) => {
    Logger.info('Creating feature', { ...req.body, userId: req.user?.id });
    try {
        const { tool_id, name, slug, description } = req.body;

        if (!tool_id || !name || !slug) {
            return res.status(400).json({ message: 'Tool ID, Name, and Slug are required' });
        }

        const tool = await Tool.findByPk(tool_id);
        if (!tool) {
            return res.status(400).json({ message: 'Tool not found' });
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
                description
            }, { transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'CREATE_FEATURE',
            entityType: 'Feature',
            entityId: feature.id,
            details: { name, slug, tool_id },
            req
        });

        res.status(201).json(feature);
    } catch (error) {
        handleError(res, error, 'Create Feature Error');
    }
};

export const updateFeature = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, slug, description } = req.body;
        Logger.info('Updating feature', { id, name, slug, userId: req.user?.id });

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
                description: description ?? feature.description
            }, { transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'UPDATE_FEATURE',
            entityType: 'Feature',
            entityId: id,
            details: { updates: { name, slug, description } },
            req
        });

        res.status(200).json(updatedFeature);
    } catch (error) {
        handleError(res, error, 'Update Feature Error');
    }
};

export const deleteFeature = async (req: Request, res: Response) => {
    const { id } = req.params;
    Logger.info('Deleting feature', { id, userId: req.user?.id });
    try {
        const { id } = req.params;

        await sequelize.transaction(async (t) => {
            const feature = await Feature.findByPk(id, { transaction: t });

            if (!feature) {
                throw new Error('NOT_FOUND');
            }

            await feature.destroy({ transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'DELETE_FEATURE',
            entityType: 'Feature',
            entityId: id,
            details: {},
            req
        });

        res.status(200).json({ message: 'Feature deleted successfully' });
    } catch (error) {
        handleError(res, error, 'Delete Feature Error');
    }
};
