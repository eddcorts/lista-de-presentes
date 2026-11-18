import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import QRCode from 'qrcode';
import type { ZodType } from 'zod';
import { buildPixPayload, buildTxid } from '../shared/pix.js';
import type {
    AdminTotals,
    AdminWishlist,
    CheckoutConflict,
    CheckoutResponse,
    Category,
    Item,
    PixResponse,
    PublicItem,
    PublicPurchase,
    PublicWishlist,
    Purchase,
    PurchaseItemLine,
    PurchaseLine,
    PurchaseStatus,
} from '../shared/types.js';
import {
    clearLoginFailures,
    createSessionToken,
    loginRateStatus,
    registerLoginFailure,
    SESSION_COOKIE,
    SESSION_MAX_AGE_SECONDS,
    verifyPassword,
    verifySessionToken,
} from './auth.js';
import { getEnv, MissingConfigError, type AppEnv } from './env.js';
import {
    adminNotesSchema,
    categorySchema,
    checkoutSchema,
    itemSchema,
    loginSchema,
    metaSchema,
    purchaseStatusSchema,
    uploadKindSchema,
} from './schemas.js';
import { ACTIVE_STATUSES, effectiveStatus, getStore, isActiveStatus, type Store } from './store.js';
import { getUploader, uploadLimitBytes, validateUpload, type UploadKind } from './uploads.js';

export class ApiError extends Error {
    constructor(
        readonly status: ContentfulStatusCode,
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

function conflict(status: ContentfulStatusCode, message: string, details?: unknown): never {
    throw new ApiError(status, message, details);
}

async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        throw new ApiError(400, 'Corpo da requisição inválido.');
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
        throw new ApiError(
            422,
            'Confira os dados enviados.',
            parsed.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
            })),
        );
    }

    return parsed.data;
}

function nowIso(): string {
    return new Date().toISOString();
}

function normalizeText(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function withClaims(items: Item[], claims: Record<string, number>): PublicItem[] {
    return items.map((item) => {
        const claimed = Math.min(item.neededQuantity, claims[item.id] ?? 0);
        const remaining = Math.max(0, item.neededQuantity - claimed);
        return { ...item, claimedQuantity: claimed, remaining, soldOut: remaining === 0 };
    });
}

function toPublicItems(items: Item[], claims: Record<string, number>): PublicItem[] {
    return withClaims(
        items.filter((item) => item.status === 'active'),
        claims,
    );
}

function toPublicPurchase(purchase: Purchase): PublicPurchase {
    const { token, buyerEmail, adminNotes, proofPathname, ...rest } = purchase;
    void token;
    void buyerEmail;
    void adminNotes;
    return { ...rest, hasProof: Boolean(proofPathname) };
}

function computeTotals(purchases: Purchase[]): AdminTotals {
    const totals: AdminTotals = {
        purchases: purchases.length,
        pending: 0,
        awaitingConfirmation: 0,
        confirmed: 0,
        itemsCents: 0,
        donationCents: 0,
        totalCents: 0,
    };

    for (const purchase of purchases) {
        if (purchase.status === 'pending') totals.pending += 1;
        else if (purchase.status === 'awaiting_confirmation') totals.awaitingConfirmation += 1;
        else if (purchase.status === 'confirmed') {
            totals.confirmed += 1;
            totals.itemsCents += purchase.itemsTotalCents;
            totals.donationCents += purchase.donationCents;
            totals.totalCents += purchase.totalCents;
        }
    }

    return totals;
}

async function findPurchaseByToken(store: Store, token: string): Promise<Purchase> {
    const purchases = await store.listPurchases();
    const purchase = purchases.find((candidate) => candidate.token === token);
    if (!purchase) throw new ApiError(404, 'Pedido não encontrado.');
    return purchase;
}

async function pixForPurchase(
    env: AppEnv,
    purchase: Purchase,
): Promise<{ payload: string; qrDataUrl: string }> {
    const meta = await getStore(env).loadMeta();
    const payload = buildPixPayload({
        key: meta.pix.key,
        merchantName: meta.pix.merchantName,
        merchantCity: meta.pix.merchantCity,
        amountCents: purchase.totalCents,
        txid: purchase.pixTxid,
    });

    const qrDataUrl = await QRCode.toDataURL(payload, {
        margin: 1,
        width: 360,
        errorCorrectionLevel: 'M',
        color: { dark: '#1f2a24', light: '#ffffff' },
    });

    return { payload, qrDataUrl };
}

function clientKey(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return request.headers.get('x-real-ip') ?? 'local';
}

const ALLOWED_TRANSITIONS: Record<PurchaseStatus, PurchaseStatus[]> = {
    pending: ['awaiting_confirmation', 'confirmed', 'cancelled'],
    awaiting_confirmation: ['confirmed', 'cancelled'],
    confirmed: ['cancelled'],
    cancelled: [],
    expired: [],
};

export function createApp() {
    const env = getEnv();
    const store = getStore(env);
    const uploader = getUploader(env);

    const app = new Hono().basePath('/api');

    app.onError((error, c) => {
        if (error instanceof ApiError) {
            return c.json({ error: error.message, details: error.details }, error.status);
        }

        if (error instanceof MissingConfigError) {
            return c.json({ error: error.message }, 500);
        }

        console.error('[api] erro inesperado', error);
        return c.json({ error: 'Erro interno. Tente novamente em instantes.' }, 500);
    });

    app.notFound((c) => c.json({ error: 'Rota não encontrada.' }, 404));

    app.get('/health', (c) => c.json({ ok: true, at: nowIso() }));

    // ---------------------------------------------------------------- público

    app.get('/wishlist', async (c) => {
        await store.sweepExpired();
        const [meta, categories, items, claims] = await Promise.all([
            store.loadMeta(),
            store.listCategories(),
            store.listItems(),
            store.getClaimed(),
        ]);

        const wishlist: PublicWishlist = {
            meta,
            categories,
            items: toPublicItems(items, claims),
            generatedAt: nowIso(),
        };

        c.header('Cache-Control', 'no-store');
        return c.json(wishlist);
    });

    app.post('/checkout', async (c) => {
        const input = await readJson(c.req.raw, checkoutSchema);
        await store.sweepExpired();

        const existing = await store.getPurchase(input.checkoutId);
        if (existing && isActiveStatus(effectiveStatus(existing))) {
            const pix = await pixForPurchase(env, existing);
            c.header('Cache-Control', 'no-store');
            return c.json<CheckoutResponse>({
                purchase: existing,
                pixPayload: pix.payload,
                pixQrDataUrl: pix.qrDataUrl,
            });
        }

        const meta = await store.loadMeta();
        const items = await store.listItems();
        const byId = new Map(items.map((item) => [item.id, item]));

        const quantities = new Map<string, number>();
        for (const line of input.items) {
            const total = (quantities.get(line.itemId) ?? 0) + line.quantity;
            quantities.set(line.itemId, Math.min(99, total));
        }

        const conflicts: CheckoutConflict[] = [];
        const itemLines: PurchaseItemLine[] = [];

        for (const [itemId, quantity] of quantities) {
            const item = byId.get(itemId);
            if (!item || item.status !== 'active') {
                conflicts.push({
                    itemId,
                    code: 'unavailable',
                    message: `"${item?.name ?? 'Um dos presentes'}" não está mais disponível.`,
                });
                continue;
            }

            itemLines.push({
                kind: 'item',
                itemId: item.id,
                name: item.name,
                imageUrl: item.imageUrl,
                unitPriceCents: item.unitPriceCents,
                priceMode: item.priceMode,
                quantity,
            });
        }

        const donationCents = Math.max(0, Math.round(input.donationCents ?? 0));
        if (donationCents > 0) {
            if (!meta.donation.enabled) {
                conflicts.push({
                    code: 'invalid_donation',
                    message: 'As contribuições estão desativadas nesta lista.',
                });
            } else if (donationCents < meta.donation.minCents) {
                conflicts.push({
                    code: 'invalid_donation',
                    message: `A contribuição mínima é de R$ ${(meta.donation.minCents / 100).toFixed(2).replace('.', ',')}.`,
                });
            }
        }

        if (itemLines.length === 0 && donationCents === 0) {
            conflicts.push({ code: 'empty_cart', message: 'Escolha ao menos um presente ou contribuição.' });
        }

        if (conflicts.length > 0) {
            conflict(409, 'Não foi possível concluir o pedido.', conflicts);
        }

        const itemsTotalCents = itemLines.reduce(
            (total, line) => total + line.unitPriceCents * line.quantity,
            0,
        );

        const lines: PurchaseLine[] = [...itemLines];
        if (donationCents > 0) {
            lines.push({ kind: 'donation', label: meta.donation.title, amountCents: donationCents });
        }

        const totalCents = itemsTotalCents + donationCents;
        const purchaseId = existing ? randomUUID() : input.checkoutId;
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + env.holdHours * 60 * 60 * 1000);

        const purchase: Purchase = {
            id: purchaseId,
            token: randomBytes(24).toString('hex'),
            buyerName: input.buyerName,
            buyerEmail: input.buyerEmail,
            giftMessage: normalizeText(input.giftMessage),
            lines,
            itemsTotalCents,
            donationCents,
            totalCents,
            pixTxid: buildTxid(
                purchaseId,
                itemLines.map((line) => line.name),
                donationCents > 0,
            ),
            status: 'pending',
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
        };

        const result = await store.createPurchase(purchase, itemLines);
        if (!result.ok || !result.purchase) {
            const enriched = (result.conflicts ?? []).map((entry) => {
                const found = entry.itemId ? byId.get(entry.itemId) : undefined;
                if (!found) return entry;

                if (entry.code === 'sold_out') {
                    return { ...entry, message: `"${found.name}" já foi esgotado.` };
                }
                if (entry.code === 'insufficient_stock') {
                    return {
                        ...entry,
                        message: `Restam apenas ${entry.remaining ?? 0} de "${found.name}".`,
                    };
                }
                return { ...entry, message: `"${found.name}" não está mais disponível.` };
            });

            conflict(409, 'Alguém chegou antes em um dos presentes.', enriched);
        }

        const pix = await pixForPurchase(env, result.purchase);
        c.header('Cache-Control', 'no-store');
        return c.json<CheckoutResponse>({
            purchase: result.purchase,
            pixPayload: pix.payload,
            pixQrDataUrl: pix.qrDataUrl,
        });
    });

    app.get('/purchases/:token', async (c) => {
        const purchase = await findPurchaseByToken(store, c.req.param('token'));
        c.header('Cache-Control', 'no-store');
        return c.json({ purchase: toPublicPurchase(purchase) });
    });

    app.get('/purchases/:token/pix', async (c) => {
        const purchase = await findPurchaseByToken(store, c.req.param('token'));
        if (!ACTIVE_STATUSES.includes(purchase.status)) {
            throw new ApiError(409, 'Este pedido não está mais ativo.');
        }

        const pix = await pixForPurchase(env, purchase);
        c.header('Cache-Control', 'no-store');
        return c.json<PixResponse>({
            payload: pix.payload,
            txid: purchase.pixTxid,
            amountCents: purchase.totalCents,
            qrDataUrl: pix.qrDataUrl,
        });
    });

    app.post('/purchases/:token/confirm', async (c) => {
        const purchase = await findPurchaseByToken(store, c.req.param('token'));

        if (purchase.status === 'cancelled' || purchase.status === 'expired') {
            throw new ApiError(409, 'Este pedido expirou. Escolha os presentes novamente.');
        }

        let form: Record<string, string | File | (string | File)[]>;
        try {
            form = await c.req.parseBody();
        } catch {
            throw new ApiError(400, 'Não foi possível ler os dados enviados.');
        }

        const rawMessage = form['giftMessage'];
        const giftMessage =
            typeof rawMessage === 'string' ? normalizeText(rawMessage.slice(0, 500)) : undefined;

        let proofPathname = purchase.proofPathname;
        const proof = form['proof'];

        if (proof instanceof File && proof.size > 0) {
            const invalid = validateUpload(proof, 'proof');
            if (invalid) throw new ApiError(422, invalid);
            if (proof.size > uploadLimitBytes(env, 'proof')) {
                throw new ApiError(413, 'O comprovante é maior que o limite permitido.');
            }

            const stored = await uploader.save('proof', proof);
            proofPathname = stored.pathname;
        }

        const updated =
            (await store.updatePurchase(purchase.id, {
                giftMessage: giftMessage ?? purchase.giftMessage,
                proofPathname,
            })) ?? purchase;

        const finalPurchase =
            updated.status === 'pending'
                ? ((await store.updatePurchaseStatus(updated.id, 'awaiting_confirmation')) ?? updated)
                : updated;

        c.header('Cache-Control', 'no-store');
        return c.json({ purchase: toPublicPurchase(finalPurchase) });
    });

    app.post('/purchases/:token/cancel', async (c) => {
        const purchase = await findPurchaseByToken(store, c.req.param('token'));

        if (purchase.status !== 'pending' && purchase.status !== 'awaiting_confirmation') {
            throw new ApiError(409, 'Este pedido não pode mais ser cancelado por aqui.');
        }

        const updated = await store.updatePurchaseStatus(purchase.id, 'cancelled');
        if (!updated) throw new ApiError(404, 'Pedido não encontrado.');

        c.header('Cache-Control', 'no-store');
        return c.json({ purchase: toPublicPurchase(updated) });
    });

    app.get('/files/public/:name', async (c) => {
        const name = c.req.param('name');
        if (!/^[a-zA-Z0-9-_.]+$/.test(name)) throw new ApiError(404, 'Arquivo não encontrado.');

        const file = await uploader.read(`public/${name}`);
        if (!file) throw new ApiError(404, 'Arquivo não encontrado.');

        const headers: Record<string, string> = {
            'Content-Type': file.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
        };
        if (file.size !== undefined) headers['Content-Length'] = String(file.size);

        return c.body(file.body as unknown as ReadableStream, 200, headers);
    });

    // ------------------------------------------------------------------ admin

    app.post('/admin/login', async (c) => {
        const key = clientKey(c.req.raw);
        const rate = loginRateStatus(key);
        if (!rate.allowed) {
            c.header('Retry-After', String(rate.retryAfterSeconds));
            throw new ApiError(429, 'Muitas tentativas. Aguarde alguns minutos.');
        }

        const { password } = await readJson(c.req.raw, loginSchema);
        if (!verifyPassword(env, password)) {
            registerLoginFailure(key);
            throw new ApiError(401, 'Senha incorreta.');
        }

        clearLoginFailures(key);
        const token = await createSessionToken(env);
        setCookie(c, SESSION_COOKIE, token, {
            httpOnly: true,
            sameSite: 'Lax',
            secure: env.isProduction,
            path: '/',
            maxAge: SESSION_MAX_AGE_SECONDS,
        });

        return c.json({ authenticated: true });
    });

    app.post('/admin/logout', (c) => {
        deleteCookie(c, SESSION_COOKIE, { path: '/' });
        return c.json({ authenticated: false });
    });

    app.get('/admin/session', async (c) => {
        const authenticated = await verifySessionToken(env, getCookie(c, SESSION_COOKIE));
        return c.json({ authenticated });
    });

    app.use('/admin/*', async (c, next) => {
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
            const origin = c.req.header('origin');
            if (origin) {
                const requestOrigin = new URL(c.req.url).origin;
                if (origin !== env.appOrigin && origin !== requestOrigin) {
                    throw new ApiError(403, 'Origem não permitida.');
                }
            }
        }

        const authenticated = await verifySessionToken(env, getCookie(c, SESSION_COOKIE));
        if (!authenticated) throw new ApiError(401, 'Faça login para continuar.');

        await next();
    });

    app.get('/admin/wishlist', async (c) => {
        await store.sweepExpired();
        const [meta, categories, items, claims, purchases] = await Promise.all([
            store.loadMeta(),
            store.listCategories(),
            store.listItems(),
            store.getClaimed(),
            store.listPurchases(),
        ]);

        const wishlist: AdminWishlist = {
            meta,
            categories,
            items: withClaims(items, claims),
            totals: computeTotals(purchases),
        };

        c.header('Cache-Control', 'no-store');
        return c.json(wishlist);
    });

    app.put('/admin/meta', async (c) => {
        const input = await readJson(c.req.raw, metaSchema);
        const current = await store.loadMeta();
        const meta = {
            ...current,
            ...input,
            description: normalizeText(input.description),
            subtitle: normalizeText(input.subtitle),
            coverImageUrl: normalizeText(input.coverImageUrl),
            ownerImageUrl: normalizeText(input.ownerImageUrl),
            thankYouMessage: normalizeText(input.thankYouMessage),
            donation: {
                ...input.donation,
                description: normalizeText(input.donation.description),
            },
            updatedAt: nowIso(),
        };

        await store.saveMeta(meta);
        return c.json({ meta });
    });

    app.post('/admin/categories', async (c) => {
        const input = await readJson(c.req.raw, categorySchema);
        const category: Category = {
            id: randomUUID(),
            name: input.name,
            color: input.color,
            createdAt: nowIso(),
        };
        await store.upsertCategory(category);
        return c.json({ category }, 201);
    });

    app.put('/admin/categories/:id', async (c) => {
        const id = c.req.param('id');
        const input = await readJson(c.req.raw, categorySchema);
        const current = (await store.listCategories()).find((category) => category.id === id);
        if (!current) throw new ApiError(404, 'Categoria não encontrada.');

        const category: Category = { ...current, name: input.name, color: input.color };
        await store.upsertCategory(category);
        return c.json({ category });
    });

    app.delete('/admin/categories/:id', async (c) => {
        const id = c.req.param('id');
        const current = (await store.listCategories()).find((category) => category.id === id);
        if (!current) throw new ApiError(404, 'Categoria não encontrada.');

        await store.deleteCategory(id);
        return c.json({ ok: true });
    });

    app.post('/admin/items', async (c) => {
        const input = await readJson(c.req.raw, itemSchema);
        const timestamp = nowIso();
        const item: Item = {
            id: randomUUID(),
            ...input,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        await store.upsertItem(item);
        return c.json({ item }, 201);
    });

    app.put('/admin/items/:id', async (c) => {
        const id = c.req.param('id');
        const input = await readJson(c.req.raw, itemSchema);
        const current = await store.getItem(id);
        if (!current) throw new ApiError(404, 'Presente não encontrado.');

        const item: Item = { ...current, ...input, updatedAt: nowIso() };
        await store.upsertItem(item);
        return c.json({ item });
    });

    app.delete('/admin/items/:id', async (c) => {
        const id = c.req.param('id');
        const current = await store.getItem(id);
        if (!current) throw new ApiError(404, 'Presente não encontrado.');

        const claims = await store.getClaimed();
        if ((claims[id] ?? 0) > 0) {
            throw new ApiError(
                409,
                'Este presente já tem cotas reservadas. Cancele os pedidos antes de removê-lo.',
            );
        }

        await store.deleteItem(id);
        return c.json({ ok: true });
    });

    app.get('/admin/purchases', async (c) => {
        await store.sweepExpired();
        const purchases = await store.listPurchases();
        return c.json({ purchases, totals: computeTotals(purchases) });
    });

    app.patch('/admin/purchases/:id', async (c) => {
        const id = c.req.param('id');
        const input = await readJson(c.req.raw, adminNotesSchema);
        const updated = await store.updatePurchase(id, {
            adminNotes: normalizeText(input.adminNotes),
        });
        if (!updated) throw new ApiError(404, 'Pedido não encontrado.');
        return c.json({ purchase: updated });
    });

    app.post('/admin/purchases/:id/status', async (c) => {
        const id = c.req.param('id');
        const input = await readJson(c.req.raw, purchaseStatusSchema);
        const current = await store.getPurchase(id);
        if (!current) throw new ApiError(404, 'Pedido não encontrado.');

        const status = effectiveStatus(current);
        if (!ALLOWED_TRANSITIONS[status].includes(input.status)) {
            throw new ApiError(409, 'Essa mudança de status não é permitida.');
        }

        const updated = await store.updatePurchaseStatus(id, input.status);
        if (!updated) throw new ApiError(404, 'Pedido não encontrado.');

        return c.json({ purchase: updated });
    });

    app.get('/admin/purchases/:id/proof', async (c) => {
        const id = c.req.param('id');
        const purchase = await store.getPurchase(id);
        if (!purchase?.proofPathname) throw new ApiError(404, 'Comprovante não enviado.');

        const file = await uploader.read(purchase.proofPathname);
        if (!file) throw new ApiError(404, 'Comprovante não encontrado.');

        const filename = `comprovante-${purchase.id.slice(0, 8)}`;

        return c.body(file.body as unknown as ReadableStream, 200, {
            'Content-Type': file.contentType,
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'private, no-store',
        });
    });

    app.post('/admin/uploads', async (c) => {
        let form: Record<string, string | File | (string | File)[]>;
        try {
            form = await c.req.parseBody();
        } catch {
            throw new ApiError(400, 'Não foi possível ler o arquivo enviado.');
        }

        const kindRaw = form['kind'];
        const kindParsed = uploadKindSchema.safeParse(typeof kindRaw === 'string' ? kindRaw : '');
        if (!kindParsed.success) throw new ApiError(422, 'Tipo de imagem inválido.');

        const kind = kindParsed.data as UploadKind;
        const file = form['file'];
        if (!(file instanceof File) || file.size === 0) {
            throw new ApiError(422, 'Nenhum arquivo enviado.');
        }

        const invalid = validateUpload(file, kind);
        if (invalid) throw new ApiError(422, invalid);
        if (file.size > uploadLimitBytes(env, kind)) {
            throw new ApiError(413, 'O arquivo é maior que o limite permitido.');
        }

        const stored = await uploader.save(kind, file);
        return c.json({ url: stored.url, pathname: stored.pathname }, 201);
    });

    app.get('/admin/local-uploads', async (c) => {
        return c.json({ files: [] });
    });

    return app;
}
