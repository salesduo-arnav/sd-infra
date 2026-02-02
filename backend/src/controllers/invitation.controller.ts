import { Request, Response } from 'express';
import { Invitation, InvitationStatus } from '../models/invitation';
import { OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import User from '../models/user';
import crypto from 'crypto';
import { mailService } from '../services/mail.service';
import { Organization } from '../models/organization';

export const inviteMember = async (req: Request, res: Response) => {
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

        // Check if already invited
        const existingInvite = await Invitation.findOne({
            where: { organization_id: orgId, email, status: InvitationStatus.PENDING }
        });

        if (existingInvite) {
            return res.status(400).json({ message: 'User already invited' });
        }

        // Check if already a member
        const existingMember = await OrganizationMember.findOne({
            where: { organization_id: orgId },
            include: [{ model: User, as: 'user', where: { email } }]
        });

        if (existingMember) {
            return res.status(400).json({ message: 'User is already a member' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        const invitation = await Invitation.create({
            organization_id: orgId,
            email,
            role_id,
            token,
            invited_by: userId,
            status: InvitationStatus.PENDING,
            expires_at: expiresAt
        });

        // Send Email (Mocked or Real)
        try {
             // Construct invite link (adjust frontend URL)
             const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
             const inviteLink = `${frontendUrl}/accept-invite?token=${token}`;
 
             await mailService.sendMail({
                 to: email,
                 subject: 'You have been invited to join an organization',
                 html: `<p>Click here to join: <a href="${inviteLink}">${inviteLink}</a></p>`
             });
        } catch (mailError) {
            console.error('Mail Error:', mailError);
            // Don't fail the request, just log it. 
            // In production, we might want to return a warning or retry.
        }

        res.status(201).json({ message: 'Invitation sent', invitation });

    } catch (error) {
        console.error('Invite Error:', error);
        res.status(500).json({ message: 'Server error sending invitation' });
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
        console.error('Get Invites Error:', error);
        res.status(500).json({ message: 'Server error fetching invitations' });
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

        await invitation.destroy();

        res.json({ message: 'Invitation revoked' });

    } catch (error) {
        console.error('Revoke Error:', error);
        res.status(500).json({ message: 'Server error revoking invitation' });
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
        console.error('Validate Invite Error:', error);
        res.status(500).json({ message: 'Server error validating invitation' });
    }
};

export const acceptInvitation = async (req: Request, res: Response) => {
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
        await OrganizationMember.create({
            user_id: userId,
            organization_id: invitation.organization_id,
            role_id: invitation.role_id
        });

        // Mark invite as accepted
        invitation.status = InvitationStatus.ACCEPTED;
        await invitation.save();

        res.json({ message: 'Invitation accepted' });

    } catch (error) {
        console.error('Accept Invite Error:', error);
        res.status(500).json({ message: 'Server error accepting invitation' });
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
        console.error('Get My Invites Error:', error);
        res.status(500).json({ message: 'Server error fetching your invitations' });
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

        await invitation.destroy();

        res.json({ message: 'Invitation declined' });

    } catch (error) {
        console.error('Decline Invite Error:', error);
        res.status(500).json({ message: 'Server error declining invitation' });
    }
};
