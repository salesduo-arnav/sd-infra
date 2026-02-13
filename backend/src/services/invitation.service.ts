import { Invitation, InvitationStatus } from '../models/invitation';
import { OrganizationMember } from '../models/organization';

import User from '../models/user';
import crypto from 'crypto';
import { mailService } from '../services/mail.service';
import { Organization } from '../models/organization';
import { Transaction } from 'sequelize';

class InvitationService {
    async sendInvitation(
        orgId: string,
        email: string,
        roleId: number,
        invitedBy: string,
        transaction?: Transaction
    ) {
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
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

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
            const orgName = org?.name || 'SalesDuo';

            await mailService.sendMail({
                to: email,
                subject: `You've Been Invited to Join ${orgName} on SalesDuo`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ff9900;">Organization Invitation</h2>
                    <p>You've been invited to join <strong>${orgName}</strong> on <strong>SalesDuo</strong>.</p>

                    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                        <a 
                        href="${inviteLink}"
                        style="display: inline-block; padding: 12px 24px; background-color: #ff9900; color: #fff; text-decoration: none; font-weight: bold; border-radius: 4px;"
                        >
                        Accept Invitation
                        </a>
                    </div>

                    <p>If you weren't expecting this invite, you can ignore this email.</p>

                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">This is an automated message from SalesDuo.</p>
                    </div>
                `,
            });
        } catch (mailError) {
            console.error('Mail Error:', mailError);
            // Don't fail the transaction if email fails, but maybe log it better?
            // Ideally we might want a background job for emails, but for now this is fine.
        }

        return invitation;
    }
}

export const invitationService = new InvitationService();
