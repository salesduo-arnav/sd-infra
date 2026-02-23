
import { Request, Response } from 'express';
import { Op, Sequelize } from 'sequelize';
import { User, Organization, Subscription, ToolUsage, OneTimePurchase, Tool, Plan } from '../models';
import { SubStatus } from '../models/enums';
import { handleError } from '../utils/error';
import { getStartOfMonth, calculateGrowth, calculateMRR } from '../utils/stats';
import Logger from '../utils/logger';

const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const statsCache = new Map<string, { data: any; timestamp: number }>();

function getCached(key: string) {
    const cached = statsCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        Logger.info(`[Cache] HIT for stats key: ${key}`);
        return cached.data;
    }
    Logger.info(`[Cache] MISS for stats key: ${key}`);
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setCache(key: string, data: any) {
    statsCache.set(key, { data, timestamp: Date.now() });
}

export const getOverviewStats = async (req: Request, res: Response) => {
    Logger.info('Fetching overview stats');
    try {
        const cached = getCached('overview');
        if (cached) {
            return res.status(200).json(cached);
        }

        const totalUsers = await User.count();
        const totalOrgs = await Organization.count();

        const startOfCurrentMonth = getStartOfMonth();

        const activeSubs = await Subscription.count({
            where: {
                status: { [Op.or]: [SubStatus.ACTIVE, SubStatus.TRIALING] },
            },
        });

        const subscriptions = await Subscription.findAll({
            where: {
                status: SubStatus.ACTIVE,
            },
            include: [
                { model: Plan, as: 'plan', attributes: ['price', 'interval'] }
            ]
        });

        const mrr = calculateMRR(subscriptions);

        const newActiveTrialingSubsCount = await Subscription.count({
            where: {
                status: { [Op.or]: [SubStatus.ACTIVE, SubStatus.TRIALING] },
                created_at: { [Op.gte]: startOfCurrentMonth }
            }
        });

        const newActiveSubscriptions = subscriptions.filter(sub => {
            const createdAt = new Date(sub.created_at || new Date());
            return createdAt >= startOfCurrentMonth;
        });

        const newMrrValue = calculateMRR(newActiveSubscriptions);

        const activeSubsGrowthAbsolute = newActiveTrialingSubsCount;
        const previousActiveSubs = activeSubs - newActiveTrialingSubsCount;
        const activeSubsGrowth = calculateGrowth(activeSubs, previousActiveSubs);

        const mrrGrowthAbsolute = newMrrValue;
        const previousMrr = mrr - newMrrValue;
        const mrrGrowth = calculateGrowth(mrr, previousMrr);

        const oneTimeRevenue = await OneTimePurchase.sum('amount_paid', {
            where: { status: 'succeeded' }
        }) || 0;

        const usersCurrentMonth = await User.count({
            where: {
                created_at: { [Op.gte]: startOfCurrentMonth }
            }
        });

        const orgsCurrentMonth = await Organization.count({
            where: {
                created_at: { [Op.gte]: startOfCurrentMonth }
            }
        });

        const totalUsersStartOfMonth = totalUsers - usersCurrentMonth;
        const userGrowthPercentage = calculateGrowth(totalUsers, totalUsersStartOfMonth);

        const totalOrgsStartOfMonth = totalOrgs - orgsCurrentMonth;
        const orgGrowthPercentage = calculateGrowth(totalOrgs, totalOrgsStartOfMonth);

        const responseData = {
            totalUsers,
            totalOrgs,
            activeSubs,
            mrr,
            oneTimeRevenue,
            userGrowth: userGrowthPercentage,
            userGrowthAbsolute: usersCurrentMonth,
            orgGrowth: orgGrowthPercentage,
            orgGrowthAbsolute: orgsCurrentMonth,
            activeSubsGrowth,
            activeSubsGrowthAbsolute,
            mrrGrowth,
            mrrGrowthAbsolute
        };

        setCache('overview', responseData);
        res.status(200).json(responseData);
    } catch (error) {
        handleError(res, error, 'Get Overview Stats Error');
    }
};

export const getRevenueChart = async (req: Request, res: Response) => {
    try {
        const cached = getCached('revenueChart');
        if (cached) {
            return res.status(200).json(cached);
        }

        const revenueData = await OneTimePurchase.findAll({
            attributes: [
                [Sequelize.fn('date_trunc', 'month', Sequelize.col('created_at')), 'month'],
                [Sequelize.fn('sum', Sequelize.col('amount_paid')), 'revenue']
            ],
            where: { status: 'succeeded' },
            group: ['month'],
            order: [[Sequelize.col('month'), 'ASC']],
            raw: true
        });

        setCache('revenueChart', revenueData);
        res.status(200).json(revenueData);
    } catch (error) {
        handleError(res, error, 'Get Revenue Chart Error');
    }
}

export const getUserGrowthChart = async (req: Request, res: Response) => {
    try {
        const cached = getCached('userGrowthChart');
        if (cached) {
            return res.status(200).json(cached);
        }

        const growthData = await User.findAll({
            attributes: [
                [Sequelize.fn('date_trunc', 'month', Sequelize.col('created_at')), 'month'],
                [Sequelize.fn('count', Sequelize.col('id')), 'count']
            ],
            group: ['month'],
            order: [[Sequelize.col('month'), 'ASC']],
            raw: true
        });

        setCache('userGrowthChart', growthData);
        res.status(200).json(growthData);
    } catch (error) {
        handleError(res, error, 'Get User Growth Chart Error');
    }
};

export const getToolUsageChart = async (req: Request, res: Response) => {
    try {
        const cached = getCached('toolUsageChart');
        if (cached) {
            return res.status(200).json(cached);
        }

        const usageData = await ToolUsage.findAll({
            attributes: [
                'tool_id',
                [Sequelize.fn('sum', Sequelize.col('count')), 'total_usage']
            ],
            include: [
                { model: Tool, as: 'tool', attributes: ['name'] }
            ],
            group: ['tool_id', 'tool.name', 'tool.id'],
            order: [[Sequelize.col('total_usage'), 'DESC']],
            limit: 5
        });

        setCache('toolUsageChart', usageData);
        res.status(200).json(usageData);
    } catch (error) {
        handleError(res, error, 'Get Tool Usage Chart Error');
    }
}
