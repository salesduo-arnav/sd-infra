import { configService } from '../services/config.service';

function getBranding() {
    return {
        name: configService.get('brand_name', 'SalesDuo')!,
        color: configService.get('brand_color', '#ff9900')!,
        supportEmail: configService.get('support_email', 'support@salesduo.com')!,
    };
}

function resolveSubject(templateKey: string, defaultTemplate: string, vars: Record<string, string> = {}): string {
    let subject = configService.get(templateKey, defaultTemplate)!;
    const brand = getBranding();
    subject = subject.replace(/\{brand_name\}/g, brand.name);
    for (const [key, value] of Object.entries(vars)) {
        subject = subject.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return subject;
}

export function passwordResetEmail(resetLink: string): { subject: string; html: string } {
    const brand = getBranding();
    const subject = resolveSubject('email_subject_password_reset', `Reset Your Password - ${brand.name}`);

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${brand.color};">Password Reset Request</h2>
        <p>You requested to reset your ${brand.name} password.</p>

        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <a
            href="${resetLink}"
            style="display: inline-block; padding: 12px 24px; background-color: ${brand.color}; color: #fff; text-decoration: none; font-weight: bold; border-radius: 4px;"
            >
            Reset Password
            </a>
        </div>

        <p>This link is valid for <strong>1 hour</strong>.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message from ${brand.name}.</p>
        </div>
    `;

    return { subject, html };
}

export function loginOtpEmail(otp: string): { subject: string; html: string } {
    const brand = getBranding();
    const subject = resolveSubject('email_subject_login_otp', 'Your Login OTP');

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${brand.color};">Login Verification</h2>
            <p>Your one-time password (OTP) for login is:</p>
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
            </div>
            <p>This OTP is valid for <strong>5 minutes</strong>.</p>
            <p>If you didn't request this OTP, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">This is an automated message from ${brand.name}.</p>
        </div>
    `;

    return { subject, html };
}

export function signupOtpEmail(otp: string): { subject: string; html: string } {
    const brand = getBranding();
    const subject = resolveSubject('email_subject_signup_otp', `Verify Your Email - ${brand.name}`);

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${brand.color};">Welcome to ${brand.name}!</h2>
            <p>To complete your registration, please verify your email with this one-time password:</p>
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
            </div>
            <p>This OTP is valid for <strong>5 minutes</strong>.</p>
            <p>If you didn't create an account, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">This is an automated message from ${brand.name}.</p>
        </div>
    `;

    return { subject, html };
}

export function invitationEmail(orgName: string, inviteLink: string): { subject: string; html: string } {
    const brand = getBranding();
    const subject = resolveSubject('email_subject_invitation', `You've Been Invited to Join {org_name} on ${brand.name}`, { org_name: orgName });

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${brand.color};">Organization Invitation</h2>
        <p>You've been invited to join <strong>${orgName}</strong> on <strong>${brand.name}</strong>.</p>

        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <a
            href="${inviteLink}"
            style="display: inline-block; padding: 12px 24px; background-color: ${brand.color}; color: #fff; text-decoration: none; font-weight: bold; border-radius: 4px;"
            >
            Accept Invitation
            </a>
        </div>

        <p>If you weren't expecting this invite, you can ignore this email.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message from ${brand.name}.</p>
        </div>
    `;

    return { subject, html };
}
