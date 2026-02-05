import { Request, Response } from 'express';
import { Op } from 'sequelize';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import sequelize from '../config/db';

export const getUsers = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const search = req.query.search as string;
        const sortBy = (req.query.sortBy as string) || 'created_at';
        const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

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

        const totalPages = Math.ceil(count / limit);

        res.status(200).json({
            users: rows,
            meta: {
                totalItems: count,
                totalPages,
                currentPage: page,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Get Users Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { full_name, is_superuser } = req.body;

        const user = await User.findByPk(id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent admin from removing their own superuser status
        if (req.user?.id === user.id && is_superuser === false) {
            return res.status(403).json({ message: 'You cannot revoke your own admin privileges' });
        }

        await user.update({
            full_name: full_name !== undefined ? full_name : user.full_name,
            is_superuser: is_superuser !== undefined ? is_superuser : user.is_superuser
        });

        res.status(200).json({ message: 'User updated successfully', user });
    } catch (error) {
        console.error('Update User Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;

        const user = await User.findByPk(id, { transaction });

        if (!user) {
            await transaction.rollback();
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent admin from deleting themselves
        if (req.user?.id === user.id) {
            await transaction.rollback();
            return res.status(403).json({ message: 'You cannot delete your own account' });
        }

        // Check for organization ownerships
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
            }],
            transaction
        });

        const distinctOwnedOrgs = ownedMemberships.map(m => m.organization!);
        const conflicts: { id: string; name: string }[] = [];

        for (const org of distinctOwnedOrgs) {
            // Count other members
            const otherMembersCount = await OrganizationMember.count({
                where: {
                    organization_id: org.id,
                    user_id: { [Op.ne]: id }
                },
                transaction
            });

            if (otherMembersCount > 0) {
                // Transfer ownership to oldest member
                const oldestMember = await OrganizationMember.findOne({
                    where: {
                        organization_id: org.id,
                        user_id: { [Op.ne]: id }
                    },
                    order: [['created_at', 'ASC']],
                    transaction
                });

                if (oldestMember) {
                    await oldestMember.update({ role_id: ownedMemberships[0].role_id }, { transaction });
                    console.log(`Transferred ownership of org ${org.id} to user ${oldestMember.user_id}`);
                }
            } else {
                // No other members - this is a sole owner situation
                conflicts.push({ id: org.id, name: org.name });
            }
        }

        if (conflicts.length > 0) {
            const force = req.query.force === 'true';
            if (!force) {
                await transaction.rollback();
                return res.status(409).json({
                    message: 'User is the sole owner of one or more organizations.',
                    organizations: conflicts
                });
            }

            // Force delete: Delete the organizations
            for (const conflict of conflicts) {
                await Organization.destroy({ where: { id: conflict.id }, transaction });
                console.log(`Force deleted organization ${conflict.id}`);
            }
        }

        // Clean up user's organization memberships
        // (CASCADE will handle this at DB level, but explicit is better for tracking)
        const deletedMemberships = await OrganizationMember.destroy({
            where: { user_id: id },
            transaction
        });
        console.log(`Deleted ${deletedMemberships} organization memberships for user`);

        await user.destroy({ transaction });

        await transaction.commit();
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        await transaction.rollback();
        console.error('Delete User Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
