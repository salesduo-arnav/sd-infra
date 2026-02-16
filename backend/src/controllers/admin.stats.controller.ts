
import { Request, Response } from 'express';
import { Op, Sequelize } from 'sequelize';
import { User, Organization, Subscription, ToolUsage, OneTimePurchase, Tool, Plan } from '../models';
import { SubStatus } from '../models/enums';
import { handleError } from '../utils/error';
import { getStartOfMonth, calculateGrowth, calculateMRR } from '../utils/stats';
import Logger from '../utils/logger';

export const getOverviewStats = async (req: Request, res: Response) => {
    Logger.info('Fetching overview stats');
    try {
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


        res.status(200).json({
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
        });
    } catch (error) {
        Logger.error('Get Overview Stats Error', { error });
        handleError(res, error, 'Get Overview Stats Error');
    }
};

export const getRevenueChart = async (req: Request, res: Response) => {
    try {
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

        res.status(200).json(revenueData);
    } catch (error) {
        Logger.error('Get Revenue Chart Error', { error });
        handleError(res, error, 'Get Revenue Chart Error');
    }
}

export const getUserGrowthChart = async (req: Request, res: Response) => {
    try {
        const growthData = await User.findAll({
            attributes: [
                [Sequelize.fn('date_trunc', 'month', Sequelize.col('created_at')), 'month'],
                [Sequelize.fn('count', Sequelize.col('id')), 'count']
            ],
            group: ['month'],
            order: [[Sequelize.col('month'), 'ASC']],
            raw: true
        });

        res.status(200).json(growthData);
    } catch (error) {
        Logger.error('Get User Growth Chart Error', { error });
        handleError(res, error, 'Get User Growth Chart Error');
    }
};

export const getToolUsageChart = async (req: Request, res: Response) => {
    try {
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

        res.status(200).json(usageData);
    } catch (error) {
        Logger.error('Get Tool Usage Chart Error', { error });
        handleError(res, error, 'Get Tool Usage Chart Error');
    }
}
