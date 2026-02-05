import { Request, Response } from 'express';
import { Op } from 'sequelize';
import User from '../models/user';
import { Organization } from '../models/organization';

export const getUsers = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const search = req.query.search as string;
        const sortBy = (req.query.sortBy as string) || 'created_at';
        const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

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
    try {
        const { id } = req.params;

        const user = await User.findByPk(id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent admin from deleting themselves
        if (req.user?.id === user.id) {
            return res.status(403).json({ message: 'You cannot delete your own account' });
        }

        await user.destroy();

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete User Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
