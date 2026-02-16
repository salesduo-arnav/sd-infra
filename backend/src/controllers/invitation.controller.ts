import { Request, Response } from 'express';
import { Invitation, InvitationStatus } from '../models/invitation';
import { OrganizationMember } from '../models/organization';
import { Role } from '../models/role';

import { Organization } from '../models/organization';
import sequelize from '../config/db';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';
import { invitationService } from '../services/invitation.service';
import Logger from '../utils/logger';

export const inviteMember = async (req: Request, res: Response) => {
    Logger.info('Inviting member', { email: req.body.email, role_id: req.body.role_id, userId: req.user?.id });
    try {
        const { email, role_id } = req.body;
        const userId = req.user?.id;

        // Check permission
        const membership = await OrganizationMember.findOne({
            where: { user_id: userId },
            include: [{ model: Role, as: 'role' }]
        });

        if (!membership || (membership.role?.name !== 'Owner' && membership.role?.name !== 'Admin')) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        const orgId = membership.organization_id;

        const invitation = await invitationService.sendInvitation(orgId, email, role_id, userId);

        await AuditService.log({
            actorId: userId,
            action: 'INVITE_MEMBER',
            entityType: 'Invitation',
            entityId: invitation.id,
            details: { email, role_id, organization_id: orgId },
            req
        });

        res.status(201).json({ message: 'Invitation sent', invitation });

    } catch (error) {
        if (error instanceof Error && (error.message === 'User already invited' || error.message === 'User is already a member')) {
            return res.status(400).json({ message: error.message });
        }
        handleError(res, error, 'Invite Error');
    }
};

export const getPendingInvitations = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        // Check permission (Reader/Viewer might not see invites, but Admin/Owner should)
        const membership = await OrganizationMember.findOne({
            where: { user_id: userId }
        });

        if (!membership) return res.status(403).json({ message: 'Not in organization' });

        const invitations = await Invitation.findAll({
            where: {
                organization_id: membership.organization_id,
                status: InvitationStatus.PENDING
            },
            include: [{ model: Role, as: 'role' }] // Include role details
        });

        res.json(invitations);
    } catch (error) {
        handleError(res, error, 'Get Invites Error');
    }
};

export const revokeInvitation = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const membership = await OrganizationMember.findOne({
            where: { user_id: userId },
            include: [{ model: Role, as: 'role' }]
        });

        if (!membership || (membership.role?.name !== 'Owner' && membership.role?.name !== 'Admin')) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        const invitation = await Invitation.findOne({
            where: { id, organization_id: membership.organization_id }
        });

        if (!invitation) return res.status(404).json({ message: 'Invitation not found' });

        const invitationId = invitation.id;
        const invitedEmail = invitation.email;
        await invitation.destroy();

        await AuditService.log({
            actorId: userId,
            action: 'REVOKE_INVITATION',
            entityType: 'Invitation',
            entityId: invitationId,
            details: { email: invitedEmail },
            req
        });

        res.json({ message: 'Invitation revoked' });

    } catch (error) {
        handleError(res, error, 'Revoke Error');
    }
};

export const validateInvitation = async (req: Request, res: Response) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ message: 'Token is required' });
        }

        const invitation = await Invitation.findOne({
            where: {
                token: token as string,
                status: InvitationStatus.PENDING
            },
            include: [{ model: Role, as: 'role' }]
        });

        if (!invitation) {
            return res.status(404).json({ message: 'Invalid or expired invitation' });
        }

        // Check expiry
        if (new Date() > invitation.expires_at) {
            return res.status(400).json({ message: 'Invitation expired' });
        }

        // Get organization name
        const organization = await Organization.findByPk(invitation.organization_id);

        res.json({
            email: invitation.email,
            role: invitation.role?.name,
            organization_id: invitation.organization_id,
            organization_name: organization?.name
        });

    } catch (error) {
        handleError(res, error, 'Validate Invite Error');
    }
};

export const acceptInvitation = async (req: Request, res: Response) => {
    Logger.info('Accepting invitation', { token: req.body.token, userId: req.user?.id });
    try {
        const { token } = req.body;
        const userId = req.user?.id;

        if (!token) return res.status(400).json({ message: 'Token is required' });
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const invitation = await Invitation.findOne({
            where: { token, status: InvitationStatus.PENDING }
        });

        if (!invitation) return res.status(404).json({ message: 'Invalid invitation' });

        if (new Date() > invitation.expires_at) {
            return res.status(400).json({ message: 'Invitation expired' });
        }

        // Idempotency check
        const existingMember = await OrganizationMember.findOne({
            where: { user_id: userId, organization_id: invitation.organization_id }
        });

        if (existingMember) {
            // Mark invite as accepted if user is already a member
            invitation.status = InvitationStatus.ACCEPTED;
            await invitation.save();
            return res.json({ message: 'Already a member' });
        }

        // Add user to organization
        await sequelize.transaction(async (t) => {
            await OrganizationMember.create({ user_id: userId, organization_id: invitation.organization_id, role_id: invitation.role_id }, { transaction: t });
            invitation.status = InvitationStatus.ACCEPTED;
            await invitation.save({ transaction: t });
        });

        await AuditService.log({
            actorId: userId,
            action: 'ACCEPT_INVITATION',
            entityType: 'Invitation',
            entityId: invitation.id,
            details: { organization_id: invitation.organization_id },
            req
        });

        res.json({ message: 'Invitation accepted' });

    } catch (error) {
        handleError(res, error, 'Accept Invite Error');
    }
};


export const getMyPendingInvitations = async (req: Request, res: Response) => {
    try {
        const user = req.user;
        if (!user) return res.status(401).json({ message: 'Not authenticated' });

        const invitations = await Invitation.findAll({
            where: {
                email: user.email,
                status: InvitationStatus.PENDING
            },
            include: [
                { model: Organization, as: 'organization' },
                { model: Role, as: 'role' }
            ]
        });

        res.json(invitations);
    } catch (error) {
        handleError(res, error, 'Get My Invites Error');
    }
};

export const declineInvitation = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        const user = req.user;

        if (!token) return res.status(400).json({ message: 'Token is required' });
        if (!user) return res.status(401).json({ message: 'Unauthorized' });

        const invitation = await Invitation.findOne({
            where: { token, status: InvitationStatus.PENDING }
        });

        if (!invitation) return res.status(404).json({ message: 'Invalid invitation' });

        if (invitation.email !== user.email) {
            return res.status(403).json({ message: 'This invitation does not belong to you' });
        }

        const invitationId = invitation.id;
        const orgId = invitation.organization_id;
        await invitation.destroy();

        await AuditService.log({
            actorId: user.id,
            action: 'DECLINE_INVITATION',
            entityType: 'Invitation',
            entityId: invitationId,
            details: { organization_id: orgId },
            req
        });

        res.json({ message: 'Invitation declined' });

    } catch (error) {
        handleError(res, error, 'Decline Invite Error');
    }
};
