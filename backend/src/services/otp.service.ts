import crypto from 'crypto';
import redisClient from '../config/redis';
import Logger from '../utils/logger';

const OTP_LENGTH = 6;
const OTP_TTL = 300; // 5 minutes
const MAX_ATTEMPTS = 5;

interface OtpData {
    otp: string;
    attempts: number;
}

interface SignupOtpData extends OtpData {
    email: string;
    password: string;
    full_name: string;
    token?: string; // Invitation token
}

// Helper fn to generate a cryptographically secure OTP
const generateOtp = (): string => {
    // Generate random bytes and convert to a 6-digit number
    const bytes = crypto.randomBytes(4);
    const num = bytes.readUInt32BE(0);
    // Ensure it's always 6 digits by using modulo and padding
    const otp = (num % 1000000).toString().padStart(OTP_LENGTH, '0');
    return otp;
};

// Generate and store OTP for login
export const createLoginOtp = async (email: string): Promise<string> => {
    Logger.debug('Creating login OTP', { email });
    const otp = generateOtp();
    const key = `login_otp:${email.toLowerCase()}`;

    const data: OtpData = {
        otp,
        attempts: 0
    };

    await redisClient.set(key, JSON.stringify(data), { EX: OTP_TTL });

    return otp;
};

// Verify OTP for login
export const verifyLoginOtp = async (email: string, inputOtp: string): Promise<{ valid: boolean; message: string }> => {
    Logger.debug('Verifying login OTP', { email });
    const key = `login_otp:${email.toLowerCase()}`;
    const storedData = await redisClient.get(key);

    if (!storedData) {
        return { valid: false, message: 'OTP expired or not found. Please request a new one.' };
    }

    const data: OtpData = JSON.parse(storedData);

    // Check max attempts
    if (data.attempts >= MAX_ATTEMPTS) {
        await redisClient.del(key);
        return { valid: false, message: 'Too many attempts. Please request a new OTP.' };
    }

    // Increment attempts
    data.attempts += 1;
    await redisClient.set(key, JSON.stringify(data), { KEEPTTL: true });

    // Verify OTP
    if (data.otp !== inputOtp) {
        return { valid: false, message: 'Invalid OTP. Please try again.' };
    }

    // Success - delete the OTP
    await redisClient.del(key);
    return { valid: true, message: 'OTP verified successfully.' };
};

// Generate and store OTP for signup with user data
export const createSignupOtp = async (
    email: string,
    password: string,
    full_name: string,
    token?: string
): Promise<string> => {
    Logger.debug('Creating signup OTP', { email });
    const otp = generateOtp();
    const key = `signup_otp:${email.toLowerCase()}`;

    const data: SignupOtpData = {
        otp,
        attempts: 0,
        email,
        password,
        full_name,
        token
    };

    await redisClient.set(key, JSON.stringify(data), { EX: OTP_TTL });

    return otp;
};

// Verify OTP for signup and return stored user data
export const verifySignupOtp = async (
    email: string,
    inputOtp: string
): Promise<{ valid: boolean; message: string; userData?: Omit<SignupOtpData, 'otp' | 'attempts'> }> => {
    Logger.debug('Verifying signup OTP', { email });
    const key = `signup_otp:${email.toLowerCase()}`;
    const storedData = await redisClient.get(key);

    if (!storedData) {
        return { valid: false, message: 'OTP expired or not found. Please request a new one.' };
    }

    const data: SignupOtpData = JSON.parse(storedData);

    // Check max attempts
    if (data.attempts >= MAX_ATTEMPTS) {
        await redisClient.del(key);
        return { valid: false, message: 'Too many attempts. Please start over.' };
    }

    // Increment attempts
    data.attempts += 1;
    await redisClient.set(key, JSON.stringify(data), { KEEPTTL: true });

    // Verify OTP
    if (data.otp !== inputOtp) {
        return { valid: false, message: 'Invalid OTP. Please try again.' };
    }

    // Success - delete the OTP and return user data
    await redisClient.del(key);
    return {
        valid: true,
        message: 'OTP verified successfully.',
        userData: {
            email: data.email,
            password: data.password,
            full_name: data.full_name,
            token: data.token
        }
    };
};

// Check if OTP was recently sent (rate limiting)
export const canSendOtp = async (email: string, type: 'login' | 'signup'): Promise<boolean> => {
    const key = `${type}_otp:${email.toLowerCase()}`;
    const exists = await redisClient.exists(key);

    // If OTP exists and was created recently, don't allow resend
    // The TTL check happens naturally - if key exists, user needs to wait
    // We could add a separate rate limit key if we want to allow immediate resends
    return exists === 0;
};

export const otpService = {
    generateOtp,
    createLoginOtp,
    verifyLoginOtp,
    createSignupOtp,
    verifySignupOtp,
    canSendOtp
};
