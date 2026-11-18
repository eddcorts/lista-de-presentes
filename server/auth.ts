import { createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AppEnv } from './env.js';

export const SESSION_COOKIE = 'niver_admin';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const textEncoder = new TextEncoder();

function safeEqual(a: string, b: string): boolean {
    const hashA = createHash('sha256').update(a, 'utf8').digest();
    const hashB = createHash('sha256').update(b, 'utf8').digest();
    return timingSafeEqual(hashA, hashB);
}

/**
 * Accepts either a plain password (`ADMIN_PASSWORD`) or a scrypt hash in the
 * form `scrypt:<saltHex>:<hashHex>` (`ADMIN_PASSWORD_HASH`).
 */
export function verifyPassword(env: AppEnv, candidate: string): boolean {
    if (env.adminPasswordHash) {
        const [algorithm, saltHex, hashHex] = env.adminPasswordHash.split(':');
        if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;

        const expected = Buffer.from(hashHex, 'hex');
        const actual = scryptSync(candidate, Buffer.from(saltHex, 'hex'), expected.length);
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    }

    if (!env.adminPassword) return false;
    return safeEqual(candidate, env.adminPassword);
}

function secretKey(env: AppEnv): Uint8Array {
    return textEncoder.encode(env.authSecret);
}

export async function createSessionToken(env: AppEnv): Promise<string> {
    return new SignJWT({ role: 'admin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
        .setSubject('admin')
        .sign(secretKey(env));
}

export async function verifySessionToken(env: AppEnv, token: string | undefined): Promise<boolean> {
    if (!token) return false;
    try {
        const { payload } = await jwtVerify(token, secretKey(env), { algorithms: ['HS256'] });
        return payload['role'] === 'admin';
    } catch {
        return false;
    }
}

interface Attempt {
    count: number;
    resetAt: number;
}

const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 6;

export function loginRateStatus(clientKey: string): {
    allowed: boolean;
    retryAfterSeconds: number;
} {
    const record = attempts.get(clientKey);
    const now = Date.now();

    if (!record || record.resetAt <= now) {
        attempts.delete(clientKey);
        return { allowed: true, retryAfterSeconds: 0 };
    }

    if (record.count >= MAX_ATTEMPTS) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
        };
    }

    return { allowed: true, retryAfterSeconds: 0 };
}

export function registerLoginFailure(clientKey: string): void {
    const now = Date.now();
    const record = attempts.get(clientKey);

    if (!record || record.resetAt <= now) {
        attempts.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
        return;
    }

    record.count += 1;
}

export function clearLoginFailures(clientKey: string): void {
    attempts.delete(clientKey);
}

export function hashPassword(password: string): string {
    const salt = createHash('sha256').update(`${Date.now()}-${password}`).digest().subarray(0, 16);
    const hash = scryptSync(password, salt, 64);
    return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}
