import { Request, Response } from 'express';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import { User } from '../models/user'; // Import User if needed for typing or checks
import sequelize from '../config/db';

export const createOrganization = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
        const { name, website } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Check if user already has an organization (enforcing 1 org per user for now)
        const existingMember = await OrganizationMember.findOne({ where: { user_id: userId } });
        if (existingMember) {
            return res.status(400).json({ message: 'User already belongs to an organization' });
        }

        // Generate slug from name
        let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        // Append random string if slug exists (simple collision handling)
        const slugExists = await Organization.findOne({ where: { slug } });
        if (slugExists) {
            slug = `${slug}-${Math.floor(Math.random() * 10000)}`;
        }

        // Create Organization
        const organization = await Organization.create({
            name,
            website,
            slug,
            status: 'active' as any // Enum casting
        }, { transaction });

        // Find or Create Owner Role
        // Ideally roles are seeded, but fail-safe here
        let ownerRole = await Role.findOne({ where: { name: 'Owner' } });
        if (!ownerRole) {
            ownerRole = await Role.create({ name: 'Owner', description: 'Organization Owner' }, { transaction });
        }

        // Add User as Owner
        await OrganizationMember.create({
            organization_id: organization.id,
            user_id: userId,
            role_id: ownerRole.id,
            is_active: true
        }, { transaction });

        await transaction.commit();

        res.status(201).json({
            message: 'Organization created successfully',
            organization
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Create Org Error:', error);
        res.status(500).json({ message: 'Server error creating organization' });
    }
};

export const getMyOrganization = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const membership = await OrganizationMember.findOne({
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
        }) as any;

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

        // Get user's organization
        const membership = await OrganizationMember.findOne({
            where: { user_id: userId }
        }) as any; // Cast for now

        if (!membership) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        const members = await OrganizationMember.findAll({
            where: { organization_id: membership.organization_id },
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'full_name', 'email']
                },
                {
                    model: Role,
                    as: 'role'
                }
            ]
        });

        res.json(members);

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

        const membership = await OrganizationMember.findOne({
            where: { user_id: userId },
            include: [{ model: Role, as: 'role' }]
        }) as any;

        if (!membership) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        // Check permissions (Owner only)
        if (membership.role?.name !== 'Owner') {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        const organization = await Organization.findByPk(membership.organization_id);
        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        if (name) organization.name = name;
        if (website !== undefined) organization.website = website;

        await organization.save();

        res.json({
            message: 'Organization updated successfully',
            organization
        });

    } catch (error) {
        console.error('Update Org Error:', error);
        res.status(500).json({ message: 'Server error updating organization' });
    }
};
