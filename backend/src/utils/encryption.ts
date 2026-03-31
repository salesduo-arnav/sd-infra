import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') }); // ensure .env is valid
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) {
        throw new Error('ENCRYPTION_KEY environment variable is required (64 hex characters)');
    }
    return Buffer.from(hex, 'hex');
}

export const encrypt = (text: string): string => {
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag().toString('hex');

        // Format: iv:authTag:encryptedText
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error) {
        console.error('Encryption failing', error);
        throw new Error('Encryption failed');
    }
};

export const decrypt = (encryptedData: string): string => {
    try {
        const parts = encryptedData.split(':');

        if (parts.length !== 3) {
            return encryptedData; // Might be unencrypted legacy data
        }

        const [ivHex, authTagHex, encryptedTextHex] = parts;

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const key = getEncryptionKey();
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedTextHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption failing', error);
        return encryptedData; // fallback
    }
};
