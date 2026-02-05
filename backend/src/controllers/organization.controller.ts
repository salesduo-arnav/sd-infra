import { Request, Response } from 'express';
import { Organization, OrganizationMember, OrgStatus } from '../models/organization';
import { Role } from '../models/role';
import { User } from '../models/user'; // Import User if needed for typing or checks
import sequelize from '../config/db';

export const createOrganization = async (req: Request, res: Response) => {
    try {
        const { name, website } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const result = await sequelize.transaction(async (t) => {
            // Generate slug from name
            let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            // Append random string if slug exists (simple collision handling)
            const slugExists = await Organization.findOne({ where: { slug }, transaction: t });
            if (slugExists) {
                slug = `${slug}-${Math.floor(Math.random() * 10000)}`;
            }

            // Create Organization
            const organization = await Organization.create({
                name,
                website,
                slug,
                status: OrgStatus.ACTIVE
            }, { transaction: t });

            // Find or Create Owner Role
            // Ideally roles are seeded, but fail-safe here
            let ownerRole = await Role.findOne({ where: { name: 'Owner' }, transaction: t });
            if (!ownerRole) {
                ownerRole = await Role.create({ name: 'Owner', description: 'Organization Owner' }, { transaction: t });
            }

            // Add User as Owner
            await OrganizationMember.create({
                organization_id: organization.id,
                user_id: userId,
                role_id: ownerRole.id,
                is_active: true
            }, { transaction: t });

            return organization;
        });

        res.status(201).json({
            message: 'Organization created successfully',
            organization: result
        });

    } catch (error) {
        console.error('Create Org Error:', error);
        res.status(500).json({ message: 'Server error creating organization' });
    }
};

export const getMyOrganization = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const orgId = req.headers['x-organization-id'] as string;

        let membership;

        if (orgId) {
            membership = await OrganizationMember.findOne({
                where: { user_id: userId, organization_id: orgId },
                include: [
                    {
                        model: Organization,
                        as: 'organization'
                    },
                    {
                        model: Role,
                        as: 'role'
                    }
                ]
            });
        }

        // Fallback to first found if no specific org requested (or invalid)
        if (!membership) {
            membership = await OrganizationMember.findOne({
                where: { user_id: userId },
                include: [
                    {
                        model: Organization,
                        as: 'organization'
                    },
                    {
                        model: Role,
                        as: 'role'
                    }
                ]
            });
        }

        if (!membership) {
            return res.json({ organization: null });
        }

        res.json({
            organization: membership.organization,
            role: membership.role
        });

    } catch (error) {
        console.error('Get Org Error:', error);
        res.status(500).json({ message: 'Server error fetching organization' });
    }
};

export const getOrganizationMembers = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const orgId = req.headers['x-organization-id'] as string;

        // Pagination and sorting params
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const search = req.query.search as string || '';
        const sortBy = req.query.sortBy as string || 'joined_at';
        const sortOrder = (req.query.sortOrder as string || 'desc').toUpperCase();
        const offset = (page - 1) * limit;

        // Get user's organization
        // Must filter by the active organization context
        const whereClause: { user_id: string; organization_id?: string } = { user_id: userId };
        if (orgId) {
            whereClause.organization_id = orgId;
        }

        const membership = await OrganizationMember.findOne({
            where: whereClause
        });

        if (!membership) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Build the query with search
        const { Op } = await import('sequelize');

        // Get total count first
        const totalCount = await OrganizationMember.count({
            where: { organization_id: membership.organization_id },
            include: search ? [
                {
                    model: User,
                    as: 'user',
                    where: {
                        [Op.or]: [
                            { full_name: { [Op.iLike]: `%${search}%` } },
                            { email: { [Op.iLike]: `%${search}%` } }
                        ]
                    }
                }
            ] : undefined
        });

        // Determine order based on sortBy
        let order: [string, string][] | [[{ model: typeof User; as: string }, string, string]] = [['joined_at', sortOrder]];
        if (sortBy === 'full_name' || sortBy === 'email') {
            order = [[{ model: User, as: 'user' }, sortBy, sortOrder]] as [[{ model: typeof User; as: string }, string, string]];
        } else if (sortBy === 'role') {
            order = [[{ model: Role, as: 'role' }, 'name', sortOrder]] as unknown as [[{ model: typeof User; as: string }, string, string]];
        }

        const members = await OrganizationMember.findAll({
            where: { organization_id: membership.organization_id },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'full_name', 'email'],
                    where: search ? {
                        [Op.or]: [
                            { full_name: { [Op.iLike]: `%${search}%` } },
                            { email: { [Op.iLike]: `%${search}%` } }
                        ]
                    } : undefined
                },
                {
                    model: Role,
                    as: 'role'
                }
            ],
            order,
            limit,
            offset
        });

        res.json({
            members,
            meta: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        console.error('Get Members Error:', error);
        res.status(500).json({ message: 'Server error fetching members' });
    }
};


export const updateOrganization = async (req: Request, res: Response) => {
    try {
        const { name, website } = req.body;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const orgId = req.headers['x-organization-id'] as string;

        const updatedOrg = await sequelize.transaction(async (t) => {
            const whereClause: { user_id: string; organization_id?: string } = { user_id: userId };
            if (orgId) {
                whereClause.organization_id = orgId;
            }

            const membership = await OrganizationMember.findOne({
                where: whereClause,
                include: [{ model: Role, as: 'role' }],
                transaction: t
            });

            if (!membership) {
                throw new Error('ORG_NOT_FOUND');
            }

            // Check permissions (Owner only)
            if (membership.role?.name !== 'Owner') {
                throw new Error('FORBIDDEN');
            }

            const organization = await Organization.findByPk(membership.organization_id, { transaction: t });
            if (!organization) {
                throw new Error('ORG_NOT_FOUND');
            }

            if (name) organization.name = name;
            if (website !== undefined) organization.website = website;

            await organization.save({ transaction: t });

            return organization;
        });

        res.json({
            message: 'Organization updated successfully',
            organization: updatedOrg
        });

    } catch (error: any) {
        if (error.message === 'ORG_NOT_FOUND') {
            return res.status(404).json({ message: 'Organization not found' });
        }
        if (error.message === 'FORBIDDEN') {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        console.error('Update Org Error:', error);
        res.status(500).json({ message: 'Server error updating organization' });
    }
};

// Helper to get user's role in an organization
const getUserMembership = async (userId: string, orgId: string) => {
    return OrganizationMember.findOne({
        where: { user_id: userId, organization_id: orgId },
        include: [{ model: Role, as: 'role' }]
    });
};

export const removeMember = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { memberId } = req.params;
        const orgId = req.headers['x-organization-id'] as string;

        if (!orgId) {
            return res.status(400).json({ message: 'Organization ID required' });
        }

        // Get current user's membership
        const currentUserMembership = await getUserMembership(userId, orgId);
        if (!currentUserMembership) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Only Owner or Admin can remove members
        const currentRole = currentUserMembership.role?.name;
        if (currentRole !== 'Owner' && currentRole !== 'Admin') {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        // Get the member to remove
        const memberToRemove = await OrganizationMember.findOne({
            where: { id: memberId, organization_id: orgId },
            include: [{ model: Role, as: 'role' }]
        });

        if (!memberToRemove) {
            return res.status(404).json({ message: 'Member not found' });
        }

        // Cannot remove the Owner
        if (memberToRemove.role?.name === 'Owner') {
            return res.status(403).json({ message: 'Cannot remove the organization owner' });
        }

        // Admin cannot remove other Admins (only Owner can)
        if (currentRole === 'Admin' && memberToRemove.role?.name === 'Admin') {
            return res.status(403).json({ message: 'Only the owner can remove admins' });
        }

        // Cannot remove yourself
        if (memberToRemove.user_id === userId) {
            return res.status(403).json({ message: 'Cannot remove yourself from the organization' });
        }

        await memberToRemove.destroy();

        res.json({ message: 'Member removed successfully' });

    } catch (error) {
        console.error('Remove Member Error:', error);
        res.status(500).json({ message: 'Server error removing member' });
    }
};

export const updateMemberRole = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { memberId } = req.params;
        const { role_id } = req.body;
        const orgId = req.headers['x-organization-id'] as string;

        if (!orgId) {
            return res.status(400).json({ message: 'Organization ID required' });
        }

        if (!role_id) {
            return res.status(400).json({ message: 'Role ID required' });
        }

        // Get current user's membership
        const currentUserMembership = await getUserMembership(userId, orgId);
        if (!currentUserMembership) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Only Owner can change roles
        if (currentUserMembership.role?.name !== 'Owner') {
            return res.status(403).json({ message: 'Only the owner can change member roles' });
        }

        // Get the member to update
        const memberToUpdate = await OrganizationMember.findOne({
            where: { id: memberId, organization_id: orgId },
            include: [{ model: Role, as: 'role' }]
        });

        if (!memberToUpdate) {
            return res.status(404).json({ message: 'Member not found' });
        }

        // Cannot change Owner's role directly (use transfer ownership instead)
        if (memberToUpdate.role?.name === 'Owner') {
            return res.status(403).json({ message: 'Cannot change owner role. Use transfer ownership instead.' });
        }

        // Validate the new role exists and is not Owner
        const newRole = await Role.findByPk(role_id);
        if (!newRole) {
            return res.status(400).json({ message: 'Invalid role' });
        }
        if (newRole.name === 'Owner') {
            return res.status(403).json({ message: 'Cannot assign Owner role. Use transfer ownership instead.' });
        }

        memberToUpdate.role_id = role_id;
        await memberToUpdate.save();

        res.json({
            message: 'Member role updated successfully',
            member: {
                id: memberToUpdate.id,
                role_id: memberToUpdate.role_id,
                role_name: newRole.name
            }
        });

    } catch (error) {
        console.error('Update Member Role Error:', error);
        res.status(500).json({ message: 'Server error updating member role' });
    }
};

export const transferOwnership = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { new_owner_id } = req.body;
        const orgId = req.headers['x-organization-id'] as string;

        if (!orgId) {
            return res.status(400).json({ message: 'Organization ID required' });
        }

        if (!new_owner_id) {
            return res.status(400).json({ message: 'New owner ID required' });
        }

        // Get current user's membership
        const currentOwnerMembership = await getUserMembership(userId, orgId);
        if (!currentOwnerMembership) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Only Owner can transfer ownership
        if (currentOwnerMembership.role?.name !== 'Owner') {
            return res.status(403).json({ message: 'Only the owner can transfer ownership' });
        }

        // Get the new owner's membership
        const newOwnerMembership = await OrganizationMember.findOne({
            where: { user_id: new_owner_id, organization_id: orgId }
        });

        if (!newOwnerMembership) {
            return res.status(404).json({ message: 'New owner must be an existing member of the organization' });
        }

        // Cannot transfer to yourself
        if (new_owner_id === userId) {
            return res.status(400).json({ message: 'You are already the owner' });
        }

        // Get role IDs
        const ownerRole = await Role.findOne({ where: { name: 'Owner' } });
        const adminRole = await Role.findOne({ where: { name: 'Admin' } });

        if (!ownerRole || !adminRole) {
            return res.status(500).json({ message: 'Required roles not found' });
        }

        // Use managed transaction to swap roles atomically
        await sequelize.transaction(async (t) => {
            // Current owner becomes Admin
            currentOwnerMembership.role_id = adminRole.id;
            await currentOwnerMembership.save({ transaction: t });

            // New owner becomes Owner
            newOwnerMembership.role_id = ownerRole.id;
            await newOwnerMembership.save({ transaction: t });
        });

        res.json({ message: 'Ownership transferred successfully' });

    } catch (error) {
        console.error('Transfer Ownership Error:', error);
        res.status(500).json({ message: 'Server error transferring ownership' });
    }
};

export const deleteOrganization = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const orgId = req.headers['x-organization-id'] as string;

        if (!orgId) {
            return res.status(400).json({ message: 'Organization ID required' });
        }

        // Get current user's membership
        const currentUserMembership = await getUserMembership(userId, orgId);
        if (!currentUserMembership) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Only Owner can delete organization
        if (currentUserMembership.role?.name !== 'Owner') {
            return res.status(403).json({ message: 'Only the owner can delete the organization' });
        }

        // Use managed transaction to delete org and all related data
        await sequelize.transaction(async (t) => {
            // Delete the organization (soft delete due to paranoid: true)
            // Cascading hooks will handle members and invitations
            await Organization.destroy({
                where: { id: orgId },
                individualHooks: true,
                transaction: t
            });
        });

        res.json({ message: 'Organization deleted successfully' });

    } catch (error) {
        console.error('Delete Organization Error:', error);
        res.status(500).json({ message: 'Server error deleting organization' });
    }
};
