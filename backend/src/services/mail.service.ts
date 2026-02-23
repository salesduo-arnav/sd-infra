import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import Logger from '../utils/logger';

// Ensure env vars are loaded if this service is used locally outside of server context (in dev)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface MailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: SendMailOptions['attachments'];
}

export class MailService {
    private transporter: Transporter;
    private from: string;

    constructor() {
        const isProduction = process.env.NODE_ENV === 'production';
        const smtpHost = process.env.SMTP_HOST;

        if (isProduction && (!smtpHost || !process.env.SMTP_USER || !process.env.SMTP_PASS)) {
            throw new Error('SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) must be set in production environment.');
        }

        this.transporter = nodemailer.createTransport({
            host: smtpHost || 'smtp.ethereal.email',
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER || 'test_user',
                pass: process.env.SMTP_PASS || 'test_pass',
            },
        });

        this.from = process.env.SMTP_FROM || '"SalesDuo Support" <support@salesduo.com>';
    }

    public async sendMail(options: MailOptions): Promise<void> {
        try {
            await this.transporter.sendMail({
                from: this.from,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
                attachments: options.attachments,
            });
        } catch (error) {
            Logger.error('Error sending email:', { error, to: options.to, subject: options.subject });
            throw new Error('Failed to send email');
        }
    }
}

export const mailService = new MailService();
