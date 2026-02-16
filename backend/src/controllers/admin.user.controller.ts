import { Request, Response } from 'express';
import { Op } from 'sequelize';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import sequelize from '../config/db';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';
import Logger from '../utils/logger';

export const getUsers = async (req: Request, res: Response) => {
    try {
        const { page, limit, offset, sortBy, sortOrder } = getPaginationOptions(req);
        const search = req.query.search as string;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: any = {};

        if (search) {
            whereClause[Op.or] = [
                { full_name: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const { count, rows } = await User.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
            include: [
                {
                    model: Organization,
                    as: 'organizations',
                    attributes: ['name'],
                    through: { attributes: [] }
                }
            ],
            distinct: true
        });

        res.status(200).json(formatPaginationResponse(rows, count, page, limit, 'users'));
    } catch (error) {
        Logger.error('Get Users Error', { error });
        handleError(res, error, 'Get Users Error');
    }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { full_name, is_superuser } = req.body;
        Logger.info('Updating user', { id, full_name, is_superuser, userId: req.user?.id });

        const user = await User.findByPk(id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent admin from removing their own superuser status
        if (req.user?.id === user.id && is_superuser === false) {
            return res.status(403).json({ message: 'You cannot revoke your own admin privileges' });
        }

        const oldValues = {
            full_name: user.full_name,
            is_superuser: user.is_superuser
        };

        await user.update({
            full_name: full_name !== undefined ? full_name : user.full_name,
            is_superuser: is_superuser !== undefined ? is_superuser : user.is_superuser
        });

        // Log the audit
        await AuditService.log({
            actorId: req.user?.id,
            action: 'UPDATE_USER',
            entityType: 'User',
            entityId: user.id,
            details: {
                old_values: oldValues,
                new_values: { full_name, is_superuser }
            },
            req
        });

        res.status(200).json({ message: 'User updated successfully', user });
    } catch (error) {
        Logger.error('Update User Error', { error });
        handleError(res, error, 'Update User Error');
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    Logger.info('Deleting user', { id, userId: req.user?.id });
    try {

        // Early validation before starting transaction
        const user = await User.findByPk(id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent admin from deleting themselves
        if (req.user?.id === user.id) {
            return res.status(403).json({ message: 'You cannot delete your own account' });
        }

        // Check for organization ownerships before transaction
        const ownedMemberships = await OrganizationMember.findAll({
            where: {
                user_id: id
            },
            include: [{
                model: Role,
                as: 'role',
                where: { name: 'Owner' }
            }, {
                model: Organization,
                as: 'organization'
            }]
        });

        const distinctOwnedOrgs = ownedMemberships.map(m => m.organization!);
        const conflicts: { id: string; name: string }[] = [];

        for (const org of distinctOwnedOrgs) {
            // Count other members
            const otherMembersCount = await OrganizationMember.count({
                where: {
                    organization_id: org.id,
                    user_id: { [Op.ne]: id }
                }
            });

            if (otherMembersCount === 0) {
                // No other members - this is a sole owner situation
                conflicts.push({ id: org.id, name: org.name });
            }
        }

        // Check for conflicts before starting transaction
        if (conflicts.length > 0) {
            const force = req.query.force === 'true';
            if (!force) {
                return res.status(409).json({
                    message: 'User is the sole owner of one or more organizations.',
                    organizations: conflicts
                });
            }
        }

        // Perform all mutations inside managed transaction
        await sequelize.transaction(async (t) => {
            // Transfer ownership for orgs with other members
            for (const org of distinctOwnedOrgs) {
                const otherMembersCount = await OrganizationMember.count({
                    where: {
                        organization_id: org.id,
                        user_id: { [Op.ne]: id }
                    },
                    transaction: t
                });

                if (otherMembersCount > 0) {
                    // Transfer ownership to oldest member
                    const oldestMember = await OrganizationMember.findOne({
                        where: {
                            organization_id: org.id,
                            user_id: { [Op.ne]: id }
                        },
                        order: [['created_at', 'ASC']],
                        transaction: t
                    });

                    if (oldestMember) {
                        await oldestMember.update({ role_id: ownedMemberships[0].role_id }, { transaction: t });
                        Logger.info(`Transferred ownership of org ${org.id} to user ${oldestMember.user_id}`);
                    }
                }
            }

            // Force delete organizations where user is sole owner
            // This will trigger Organization hooks to soft delete its data
            for (const conflict of conflicts) {
                await Organization.destroy({ where: { id: conflict.id }, individualHooks: true, transaction: t });
                Logger.info(`Force deleted organization ${conflict.id}`);
            }

            // Delete the user
            // This will trigger User hooks to soft delete memberships
            await user.destroy({ transaction: t });
        });

        res.status(200).json({ message: 'User deleted successfully' });

        // Log after successful transaction
        await AuditService.log({
            actorId: req.user?.id,
            action: 'DELETE_USER',
            entityType: 'User',
            entityId: id,
            details: {
                deleted_user_email: user.email,
                reason: 'Admin deletion'
            },
            req
        });
    } catch (error) {
        Logger.error('Delete User Error', { error });
        handleError(res, error, 'Delete User Error');
    }
};
