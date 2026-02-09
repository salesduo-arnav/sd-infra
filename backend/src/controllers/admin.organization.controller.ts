import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Organization, OrgStatus, OrganizationMember } from '../models/organization';
import { User } from '../models/user';
import { Role } from '../models/role';
import sequelize from '../config/db';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';

export const getOrganizations = async (req: Request, res: Response) => {
    try {
        const { page, limit, offset, sortBy, sortOrder } = getPaginationOptions(req);
        const search = req.query.search as string;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: any = {};

        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { slug: { [Op.iLike]: `%${search}%` } },
                { website: { [Op.iLike]: `%${search}%` } }
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

        res.status(200).json(formatPaginationResponse(organizationsWithCount, count, page, limit, 'organizations'));
    } catch (error) {
        handleError(res, error, 'Get Organizations Error');
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
        handleError(res, error, 'Update Organization Error');
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
            await organization.destroy({ transaction: t });
        });

        res.status(200).json({ message: 'Organization deleted successfully' });
    } catch (error) {
        handleError(res, error, 'Delete Organization Error');
    }
};

export const getOrganizationDetails = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // Using "membersPage" etc explicitly because it's a nested pagination which getPaginationOptions might not handle perfectly if it just looks at page/limit. 
        // But getPaginationOptions looks at req.query.page. 
        // Here we have specific query params for members. 
        // Let's keep manual parsing for nested membersPagination to avoid conflict if main resource was paginated (though here it's a detail view).
        // Standardizing it slightly.
        
        const membersPage = parseInt(req.query.membersPage as string) || 1;
        const membersLimit = parseInt(req.query.membersLimit as string) || 10;
        const membersOffset = (membersPage - 1) * membersLimit;

        const organization = await Organization.findByPk(id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Get total member count first
        const totalMemberCount = await OrganizationMember.count({
            where: { organization_id: id }
        });

        // Get paginated members with user and role info
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
            ],
            order: [['joined_at', 'DESC']],
            limit: membersLimit,
            offset: membersOffset
        });

        // Find the owner - need separate query to ensure we always get the owner
        const ownerMember = await OrganizationMember.findOne({
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
                    attributes: ['id', 'name'],
                    where: { name: 'Owner' }
                }
            ]
        });

        res.status(200).json({
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                website: organization.website,
                status: organization.status,
                created_at: organization.created_at
            },
            owner: ownerMember ? {
                id: ownerMember.user?.id,
                email: ownerMember.user?.email,
                full_name: ownerMember.user?.full_name
            } : null,
            members: members.map(m => ({
                id: m.user?.id,
                email: m.user?.email,
                full_name: m.user?.full_name,
                role: m.role?.name,
                joined_at: m.joined_at
            })),
            memberCount: totalMemberCount,
            membersPagination: {
                currentPage: membersPage,
                itemsPerPage: membersLimit,
                totalItems: totalMemberCount,
                hasMore: membersOffset + members.length < totalMemberCount
            }
        });
    } catch (error) {
        handleError(res, error, 'Get Organization Details Error');
    }
};
