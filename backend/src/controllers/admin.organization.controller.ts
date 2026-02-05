import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Organization, OrgStatus, OrganizationMember } from '../models/organization';
import { Invitation } from '../models/invitation';
import { User } from '../models/user';
import { Role } from '../models/role';
import sequelize from '../config/db';

export const getOrganizations = async (req: Request, res: Response) => {
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
                { name: { [Op.iLike]: `%${search}%` } },
                { slug: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const { count, rows } = await Organization.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
        });

        // Get member counts for all organizations in this page
        const orgIds = rows.map(org => org.id);
        const memberCounts = await OrganizationMember.findAll({
            where: { organization_id: orgIds },
            attributes: [
                'organization_id',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['organization_id'],
            raw: true
        }) as unknown as { organization_id: string; count: string }[];

        // Create a map for quick lookup
        const countMap = new Map(memberCounts.map(mc => [mc.organization_id, parseInt(mc.count)]));

        // Add memberCount to each organization
        const organizationsWithCount = rows.map(org => ({
            ...org.toJSON(),
            memberCount: countMap.get(org.id) || 0
        }));

        const totalPages = Math.ceil(count / limit);

        res.status(200).json({
            organizations: organizationsWithCount,
            meta: {
                totalItems: count,
                totalPages,
                currentPage: page,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Get Organizations Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateOrganization = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, slug, website, status } = req.body;

        const organization = await Organization.findByPk(id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        await organization.update({
            name: name !== undefined ? name : organization.name,
            slug: slug !== undefined ? slug : organization.slug,
            website: website !== undefined ? website : organization.website,
            status: status !== undefined ? status as OrgStatus : organization.status
        });

        res.status(200).json({ message: 'Organization updated successfully', organization });
    } catch (error) {
        console.error('Update Organization Error:', error);
        if (error instanceof Error && error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Slug already in use' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteOrganization = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Early validation before starting transaction
        const organization = await Organization.findByPk(id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Perform all mutations inside managed transaction
        await sequelize.transaction(async (t) => {
            // Explicitly delete related records for logging
            // (CASCADE will handle this at DB level, but explicit is better for tracking)
            const deletedMembers = await OrganizationMember.destroy({
                where: { organization_id: id },
                transaction: t
            });
            console.log(`Deleted ${deletedMembers} organization members`);

            const deletedInvitations = await Invitation.destroy({
                where: { organization_id: id },
                transaction: t
            });
            console.log(`Deleted ${deletedInvitations} invitations`);

            await organization.destroy({ transaction: t });
        });

        res.status(200).json({ message: 'Organization deleted successfully' });
    } catch (error) {
        console.error('Delete Organization Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getOrganizationDetails = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const organization = await Organization.findByPk(id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Get all members with user and role info
        const members = await OrganizationMember.findAll({
            where: { organization_id: id },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'email', 'full_name']
                },
                {
                    model: Role,
                    as: 'role',
                    attributes: ['id', 'name']
                }
            ]
        });

        // Find the owner (member with 'Owner' role)
        const owner = members.find(m => m.role?.name === 'Owner');

        res.status(200).json({
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                website: organization.website,
                status: organization.status,
                created_at: organization.created_at
            },
            owner: owner ? {
                id: owner.user?.id,
                email: owner.user?.email,
                full_name: owner.user?.full_name
            } : null,
            members: members.map(m => ({
                id: m.user?.id,
                email: m.user?.email,
                full_name: m.user?.full_name,
                role: m.role?.name,
                joined_at: m.joined_at
            })),
            memberCount: members.length
        });
    } catch (error) {
        console.error('Get Organization Details Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
