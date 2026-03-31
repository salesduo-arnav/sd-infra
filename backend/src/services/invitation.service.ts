import { Invitation } from '../models/invitation';
import { InvitationStatus } from '../models/enums';
import { OrganizationMember } from '../models/organization';

import User from '../models/user';
import crypto from 'crypto';
import { mailService } from '../services/mail.service';
import { Organization } from '../models/organization';
import { Transaction } from 'sequelize';
import Logger from '../utils/logger';
import { configService } from './config.service';
import { invitationEmail } from '../utils/email-templates';

class InvitationService {
    async sendInvitation(
        orgId: string,
        email: string,
        roleId: number,
        invitedBy: string,
        transaction?: Transaction
    ) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }

        // Check if already invited
        const existingInvite = await Invitation.findOne({
            where: { organization_id: orgId, email, status: InvitationStatus.PENDING },
            transaction
        });

        if (existingInvite) {
            throw new Error('User already invited');
        }

        // Check if already a member
        const existingMember = await OrganizationMember.findOne({
            where: { organization_id: orgId },
            include: [{ model: User, as: 'user', where: { email } }],
            transaction
        });

        if (existingMember) {
            throw new Error('User is already a member');
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        const expiryDays = configService.getNumber('invitation_expiry_days', 7);
        expiresAt.setDate(expiresAt.getDate() + expiryDays);

        const invitation = await Invitation.create({
            organization_id: orgId,
            email,
            role_id: roleId,
            token,
            invited_by: invitedBy,
            status: InvitationStatus.PENDING,
            expires_at: expiresAt
        }, { transaction });

        // Send Email
        try {
            // Construct invite link
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const inviteLink = `${frontendUrl}/accept-invite?token=${token}`;

            // Get Org Name for the email
            const org = await Organization.findByPk(orgId, { transaction });
            const orgName = org?.name || configService.get('brand_name', 'SalesDuo')!;

            const invite = invitationEmail(orgName, inviteLink);
            await mailService.sendMail({
                to: email,
                subject: invite.subject,
                html: invite.html,
            });
        } catch (mailError) {
            Logger.error('Mail Error during invitation:', { error: mailError });
            throw new Error('Failed to send invitation email');
        }

        return invitation;
    }
}

export const invitationService = new InvitationService();
