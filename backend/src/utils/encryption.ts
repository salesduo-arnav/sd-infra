import crypto from 'crypto';

// Note: Ensure ENCRYPTION_KEY is exactly 32 bytes (64 hex characters)
const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY || '0000000000000000000000000000000000000000000000000000000000000000';
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
const ALGORITHM = 'aes-256-gcm';

export const encrypt = (text: string): string => {
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

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

        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedTextHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption failing', error);
        return encryptedData; // fallback
    }
};
