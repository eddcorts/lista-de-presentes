import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadEnvFile(file: string): void {
    let raw: string;
    try {
        raw = readFileSync(file, 'utf8');
    } catch {
        return;
    }

    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const separator = trimmed.indexOf('=');
        if (separator === -1) continue;

        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if (!key) continue;

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (process.env[key] === undefined) process.env[key] = value;
    }
}

let envLoaded = false;

export function loadLocalEnv(): void {
    if (envLoaded) return;
    envLoaded = true;

    const cwd = process.cwd();
    loadEnvFile(path.join(cwd, '.env.local'));
    loadEnvFile(path.join(cwd, '.env'));
}

function readEnv(name: string): string | undefined {
    return process.env[name];
}

export interface AppEnv {
    isProduction: boolean;
    adminPassword: string;
    adminPasswordHash?: string;
    authSecret: string;
    appOrigin: string;
    dataDir: string;
    redisUrl?: string;
    redisToken?: string;
    blobToken?: string;
    blobPrivateToken?: string;
    holdHours: number;
    maxUploadBytes: number;
}

export class MissingConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingConfigError';
    }
}

let cached: AppEnv | undefined;

export function resetEnvCache(): void {
    cached = undefined;
}

export function getEnv(): AppEnv {
    if (cached) return cached;
    loadLocalEnv();

    const isProduction = readEnv('NODE_ENV') === 'production' || readEnv('VERCEL') === '1';

    const authSecret = readEnv('AUTH_SECRET')?.trim() ?? '';
    if (!authSecret && isProduction) {
        throw new MissingConfigError(
            'Defina AUTH_SECRET (uma string longa e aleatória) nas variáveis de ambiente.',
        );
    }

    const adminPassword = readEnv('ADMIN_PASSWORD') ?? '';
    const adminPasswordHash = readEnv('ADMIN_PASSWORD_HASH')?.trim() || undefined;
    if (!adminPassword && !adminPasswordHash && isProduction) {
        throw new MissingConfigError(
            'Defina ADMIN_PASSWORD ou ADMIN_PASSWORD_HASH nas variáveis de ambiente.',
        );
    }

    const redisUrl = readEnv('UPSTASH_REDIS_REST_URL')?.trim() || undefined;
    const redisToken = readEnv('UPSTASH_REDIS_REST_TOKEN')?.trim() || undefined;
    if (isProduction && (!redisUrl || !redisToken)) {
        throw new MissingConfigError(
            'Um banco Redis da Upstash é obrigatório em produção. Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.',
        );
    }

    const vercelHost =
        readEnv('VERCEL_PROJECT_PRODUCTION_URL')?.trim() || readEnv('VERCEL_URL')?.trim();
    const appOrigin =
        readEnv('APP_ORIGIN')?.trim() ||
        (vercelHost ? `https://${vercelHost}` : 'http://localhost:4200');

    const holdHoursRaw = Number(readEnv('HOLD_HOURS') ?? 24);
    const holdHours = Number.isFinite(holdHoursRaw) && holdHoursRaw > 0 ? holdHoursRaw : 24;

    const maxUploadMbRaw = Number(readEnv('MAX_UPLOAD_MB') ?? 8);
    const maxUploadMb = Number.isFinite(maxUploadMbRaw) && maxUploadMbRaw > 0 ? maxUploadMbRaw : 8;

    cached = {
        isProduction,
        adminPassword,
        adminPasswordHash,
        authSecret: authSecret || 'dev-secret-nao-use-em-producao-0123456789',
        appOrigin: appOrigin.replace(/\/+$/, ''),
        dataDir: readEnv('DATA_DIR')?.trim() || path.join(process.cwd(), '.data'),
        redisUrl,
        redisToken,
        blobToken: readEnv('BLOB_READ_WRITE_TOKEN')?.trim() || undefined,
        blobPrivateToken: readEnv('BLOB_PRIVATE_READ_WRITE_TOKEN')?.trim() || undefined,
        holdHours,
        maxUploadBytes: Math.round(maxUploadMb * 1024 * 1024),
    };

    return cached;
}
