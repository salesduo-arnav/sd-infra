import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const getSuperuserEmails = (): string[] => {
    const emails = process.env.SUPERUSER_EMAILS || '';
    return emails.split(',').map(email => email.trim().toLowerCase()).filter(email => email.length > 0);
};

export const isSuperuserEmail = (email: string): boolean => {
    const superuserEmails = getSuperuserEmails();
    return superuserEmails.includes(email.toLowerCase());
};
