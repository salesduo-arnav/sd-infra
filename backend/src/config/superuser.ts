import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const VALID_EMAIL_REGEX = /^\S+@\S+\.\S+$/;

const SUPERUSER_EMAILS = (process.env.SUPERUSER_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => VALID_EMAIL_REGEX.test(email));

export const getSuperuserEmails = () => SUPERUSER_EMAILS;

export const isSuperuserEmail = (email: string): boolean => {
    const superuserEmails = getSuperuserEmails();
    return superuserEmails.includes(email.toLowerCase());
};
