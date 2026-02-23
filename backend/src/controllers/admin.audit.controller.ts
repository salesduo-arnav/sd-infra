import { Request, Response } from 'express';
import { Op } from 'sequelize';
import AuditLog from '../models/audit_log';
import { User } from '../models/user';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';

export const getAuditLogs = async (req: Request, res: Response) => {
    try {
        const { page, limit, offset, sortBy, sortOrder } = getPaginationOptions(req);
        const { action, entity_type, actor_id, start_date, end_date, search } = req.query;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: any = {};

        // Search across multiple fields
        if (search && typeof search === 'string' && search.trim()) {
            whereClause[Op.or] = [
                { action: { [Op.iLike]: `%${search}%` } },
                { entity_type: { [Op.iLike]: `%${search}%` } },
                { entity_id: { [Op.iLike]: `%${search}%` } },
                { '$actor.email$': { [Op.iLike]: `%${search}%` } },
                { '$actor.full_name$': { [Op.iLike]: `%${search}%` } },
            ];
        }

        if (action) {
            whereClause.action = action;
        }

        if (entity_type) {
            whereClause.entity_type = entity_type;
        }

        if (actor_id) {
            whereClause.actor_id = actor_id;
        }

        if (start_date || end_date) {
            whereClause.created_at = {};
            if (start_date) {
                const parsedStart = new Date(start_date as string);
                if (isNaN(parsedStart.getTime())) {
                    return res.status(400).json({ message: 'Invalid start_date format' });
                }
                whereClause.created_at[Op.gte] = parsedStart;
            }
            if (end_date) {
                const parsedEnd = new Date(end_date as string);
                if (isNaN(parsedEnd.getTime())) {
                    return res.status(400).json({ message: 'Invalid end_date format' });
                }
                whereClause.created_at[Op.lte] = parsedEnd;
            }
        }

        const { count, rows } = await AuditLog.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
            include: [
                {
                    model: User,
                    as: 'actor',
                    attributes: ['id', 'full_name', 'email']
                }
            ]
        });

        res.status(200).json(formatPaginationResponse(rows, count, page, limit, 'audit_logs'));
    } catch (error) {
        handleError(res, error, 'Get Audit Logs Error');
    }
};

export const getAuditLogById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const log = await AuditLog.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'actor',
                    attributes: ['id', 'full_name', 'email']
                }
            ]
        });

        if (!log) {
            return res.status(404).json({ message: 'Audit log not found' });
        }

        res.status(200).json(log);
    } catch (error) {
        handleError(res, error, 'Get Audit Log Details Error');
    }
};
