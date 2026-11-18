import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { get, put } from '@vercel/blob';
import type { AppEnv } from './env';

export type UploadKind = 'cover' | 'owner' | 'item' | 'proof';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
export const PROOF_TYPES = ['application/pdf', ...IMAGE_TYPES];

export interface StoredUpload {
    pathname: string;
    url: string;
    contentType: string;
    size: number;
}

export interface ReadUpload {
    body: ReadableStream<Uint8Array>;
    contentType: string;
    size?: number;
}

export interface Uploader {
    save(kind: UploadKind, file: File): Promise<StoredUpload>;
    read(pathname: string): Promise<ReadUpload | null>;
}

const EXTENSIONS: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
};

function safeExtension(file: File): string {
    const fromType = EXTENSIONS[file.type];
    if (fromType) return fromType;

    const raw = path.extname(file.name || '').toLowerCase();
    return /^\.[a-z0-9]{1,5}$/.test(raw) ? raw : '.bin';
}

function safeBaseName(file: File): string {
    const base = path
        .basename(file.name || 'arquivo', path.extname(file.name || ''))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
        .toLowerCase();

    return base || 'arquivo';
}

export function uploadLimitBytes(env: AppEnv, kind: UploadKind): number {
    return kind === 'proof' ? env.maxUploadBytes : Math.min(env.maxUploadBytes, 5 * 1024 * 1024);
}

export function validateUpload(file: File, kind: UploadKind): string | null {
    const allowed = kind === 'proof' ? PROOF_TYPES : IMAGE_TYPES;
    if (!allowed.includes(file.type)) {
        return kind === 'proof'
            ? 'Envie um arquivo PDF, JPG, PNG, WEBP ou AVIF.'
            : 'Envie uma imagem JPG, PNG, WEBP, AVIF ou GIF.';
    }
    return null;
}

class LocalUploader implements Uploader {
    private readonly root: string;

    constructor(dataDir: string) {
        this.root = path.join(dataDir, 'uploads');
    }

    private folder(kind: UploadKind): string {
        return kind === 'proof' ? 'private' : 'public';
    }

    async save(kind: UploadKind, file: File): Promise<StoredUpload> {
        const folder = this.folder(kind);
        const filename = `${kind}-${Date.now()}-${randomUUID().slice(0, 8)}-${safeBaseName(file)}${safeExtension(file)}`;
        const directory = path.join(this.root, folder);
        await mkdir(directory, { recursive: true });

        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(directory, filename), buffer);

        const pathname = `${folder}/${filename}`;
        return {
            pathname,
            url: folder === 'public' ? `/api/files/${pathname}` : '',
            contentType: file.type,
            size: buffer.length,
        };
    }

    async read(pathname: string): Promise<ReadUpload | null> {
        const resolved = path.resolve(this.root, pathname);
        if (!resolved.startsWith(path.resolve(this.root) + path.sep)) return null;

        try {
            const info = await stat(resolved);
            if (!info.isFile()) return null;

            return {
                body: Readable.toWeb(createReadStream(resolved)) as ReadableStream<Uint8Array>,
                contentType: contentTypeFor(resolved),
                size: info.size,
            };
        } catch {
            return null;
        }
    }
}

class BlobUploader implements Uploader {
    constructor(private readonly env: AppEnv) {}

    async save(kind: UploadKind, file: File): Promise<StoredUpload> {
        const isProof = kind === 'proof';
        const token = isProof
            ? (this.env.blobPrivateToken ?? this.env.blobToken)
            : this.env.blobToken;

        if (!token) {
            throw new Error('Vercel Blob não está configurado (BLOB_READ_WRITE_TOKEN).');
        }

        const folder = isProof ? 'comprovantes' : `midia/${kind}`;
        const filename = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeBaseName(file)}${safeExtension(file)}`;

        const blob = await put(`${folder}/${filename}`, file, {
            access: isProof ? 'private' : 'public',
            token,
            addRandomSuffix: false,
            contentType: file.type,
            cacheControlMaxAge: isProof ? 60 : 60 * 60 * 24 * 30,
        });

        return {
            pathname: blob.pathname,
            url: isProof ? '' : blob.url,
            contentType: file.type,
            size: file.size,
        };
    }

    async read(pathname: string): Promise<ReadUpload | null> {
        const token = this.env.blobPrivateToken ?? this.env.blobToken;
        if (!token) return null;

        const result = await get(pathname, { access: 'private', token });
        if (!result || result.statusCode !== 200) return null;

        return {
            body: result.stream,
            contentType: result.blob.contentType || contentTypeFor(pathname),
            size: result.blob.size,
        };
    }
}

function contentTypeFor(filePath: string): string {
    switch (path.extname(filePath).toLowerCase()) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        case '.avif':
            return 'image/avif';
        case '.gif':
            return 'image/gif';
        case '.pdf':
            return 'application/pdf';
        default:
            return 'application/octet-stream';
    }
}

let uploaderInstance: Uploader | undefined;

export function getUploader(env: AppEnv): Uploader {
    if (uploaderInstance) return uploaderInstance;
    uploaderInstance = env.blobToken ? new BlobUploader(env) : new LocalUploader(env.dataDir);
    return uploaderInstance;
}

export function resetUploader(): void {
    uploaderInstance = undefined;
}

export async function listLocalUploads(dataDir: string, folder: 'public' | 'private') {
    try {
        return await readdir(path.join(dataDir, 'uploads', folder));
    } catch {
        return [];
    }
}
