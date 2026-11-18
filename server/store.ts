import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import type {
    Category,
    CheckoutConflict,
    Item,
    Purchase,
    PurchaseItemLine,
    PurchaseStatus,
    WishlistMeta,
} from '../shared/types';
import { createSeed } from './seed';

export interface StoreState {
    meta: WishlistMeta;
    categories: Category[];
    items: Item[];
    purchases: Purchase[];
}

export interface CreatePurchaseResult {
    ok: boolean;
    purchase?: Purchase;
    conflicts?: CheckoutConflict[];
}

export interface Store {
    loadMeta(): Promise<WishlistMeta>;
    saveMeta(meta: WishlistMeta): Promise<void>;

    listCategories(): Promise<Category[]>;
    upsertCategory(category: Category): Promise<void>;
    deleteCategory(id: string): Promise<void>;

    listItems(): Promise<Item[]>;
    getItem(id: string): Promise<Item | null>;
    upsertItem(item: Item): Promise<void>;
    deleteItem(id: string): Promise<void>;

    listPurchases(): Promise<Purchase[]>;
    getPurchase(id: string): Promise<Purchase | null>;
    getClaimed(): Promise<Record<string, number>>;
    createPurchase(purchase: Purchase, itemLines: PurchaseItemLine[]): Promise<CreatePurchaseResult>;
    updatePurchaseStatus(id: string, status: PurchaseStatus): Promise<Purchase | null>;
    updatePurchase(id: string, patch: Partial<Purchase>): Promise<Purchase | null>;
    sweepExpired(): Promise<void>;
}

export const ACTIVE_STATUSES: PurchaseStatus[] = ['pending', 'awaiting_confirmation', 'confirmed'];

export function isActiveStatus(status: PurchaseStatus): boolean {
    return ACTIVE_STATUSES.includes(status);
}

export function effectiveStatus(purchase: Purchase, now = Date.now()): PurchaseStatus {
    if (purchase.status === 'pending' && Date.parse(purchase.expiresAt) <= now) {
        return 'expired';
    }
    return purchase.status;
}

function withEffectiveStatus(purchase: Purchase, now = Date.now()): Purchase {
    const status = effectiveStatus(purchase, now);
    return status === purchase.status ? purchase : { ...purchase, status };
}

function itemLinesOf(purchase: Purchase): PurchaseItemLine[] {
    return purchase.lines.filter((line): line is PurchaseItemLine => line.kind === 'item');
}

function sumClaims(purchases: Purchase[]): Record<string, number> {
    const now = Date.now();
    const claims: Record<string, number> = {};

    for (const purchase of purchases) {
        if (!isActiveStatus(effectiveStatus(purchase, now))) continue;
        for (const line of itemLinesOf(purchase)) {
            claims[line.itemId] = (claims[line.itemId] ?? 0) + line.quantity;
        }
    }

    return claims;
}

function findConflicts(
    state: StoreState,
    lines: PurchaseItemLine[],
): CheckoutConflict[] {
    const claims = sumClaims(state.purchases);
    const conflicts: CheckoutConflict[] = [];

    for (const line of lines) {
        const item = state.items.find((candidate) => candidate.id === line.itemId);
        if (!item || item.status !== 'active') {
            conflicts.push({
                itemId: line.itemId,
                code: 'unavailable',
                message: `"${item?.name ?? line.name}" não está mais disponível na lista.`,
            });
            continue;
        }

        const remaining = item.neededQuantity - (claims[item.id] ?? 0);
        if (remaining <= 0) {
            conflicts.push({
                itemId: item.id,
                code: 'sold_out',
                message: `"${item.name}" já foi esgotado.`,
                remaining: 0,
            });
            continue;
        }

        if (line.quantity > remaining) {
            conflicts.push({
                itemId: item.id,
                code: 'insufficient_stock',
                message: `Restam apenas ${remaining} de "${item.name}".`,
                remaining,
            });
        }
    }

    return conflicts;
}

export class JsonStore implements Store {
    private readonly file: string;
    private queue: Promise<unknown> = Promise.resolve();

    constructor(dataDir: string) {
        this.file = path.join(dataDir, 'store.json');
    }

    private async readState(): Promise<StoreState> {
        try {
            const raw = await readFile(this.file, 'utf8');
            const parsed = JSON.parse(raw) as Partial<StoreState>;
            return {
                meta: parsed.meta ?? createSeed().meta,
                categories: parsed.categories ?? [],
                items: parsed.items ?? [],
                purchases: parsed.purchases ?? [],
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            const seed = createSeed();
            const state: StoreState = { ...seed, purchases: [] };
            await this.writeState(state);
            return state;
        }
    }

    private async writeState(state: StoreState): Promise<void> {
        await mkdir(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
        await rename(temporary, this.file);
    }

    private mutate<T>(operation: (state: StoreState) => Promise<T> | T): Promise<T> {
        const task = this.queue.then(async () => {
            const state = await this.readState();
            const result = await operation(state);
            await this.writeState(state);
            return result;
        });

        this.queue = task.then(
            () => undefined,
            () => undefined,
        );

        return task;
    }

    async loadMeta(): Promise<WishlistMeta> {
        const state = await this.readState();
        return state.meta;
    }

    async saveMeta(meta: WishlistMeta): Promise<void> {
        await this.mutate((state) => {
            state.meta = meta;
        });
    }

    async listCategories(): Promise<Category[]> {
        const state = await this.readState();
        return [...state.categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    async upsertCategory(category: Category): Promise<void> {
        await this.mutate((state) => {
            const index = state.categories.findIndex((candidate) => candidate.id === category.id);
            if (index === -1) state.categories.push(category);
            else state.categories[index] = category;
        });
    }

    async deleteCategory(id: string): Promise<void> {
        await this.mutate((state) => {
            state.categories = state.categories.filter((category) => category.id !== id);
            state.items = state.items.map((item) =>
                item.categoryIds.includes(id)
                    ? { ...item, categoryIds: item.categoryIds.filter((categoryId) => categoryId !== id) }
                    : item,
            );
        });
    }

    async listItems(): Promise<Item[]> {
        const state = await this.readState();
        return [...state.items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    async getItem(id: string): Promise<Item | null> {
        const state = await this.readState();
        return state.items.find((item) => item.id === id) ?? null;
    }

    async upsertItem(item: Item): Promise<void> {
        await this.mutate((state) => {
            const index = state.items.findIndex((candidate) => candidate.id === item.id);
            if (index === -1) state.items.push(item);
            else state.items[index] = item;
        });
    }

    async deleteItem(id: string): Promise<void> {
        await this.mutate((state) => {
            state.items = state.items.filter((item) => item.id !== id);
        });
    }

    async listPurchases(): Promise<Purchase[]> {
        const state = await this.readState();
        const now = Date.now();
        return [...state.purchases]
            .map((purchase) => withEffectiveStatus(purchase, now))
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    async getPurchase(id: string): Promise<Purchase | null> {
        const state = await this.readState();
        const purchase = state.purchases.find((candidate) => candidate.id === id);
        return purchase ? withEffectiveStatus(purchase) : null;
    }

    async getClaimed(): Promise<Record<string, number>> {
        const state = await this.readState();
        return sumClaims(state.purchases);
    }

    async createPurchase(
        purchase: Purchase,
        itemLines: PurchaseItemLine[],
    ): Promise<CreatePurchaseResult> {
        return this.mutate((state) => {
            const existing = state.purchases.find((candidate) => candidate.id === purchase.id);
            if (existing) {
                return { ok: true, purchase: withEffectiveStatus(existing) };
            }

            const conflicts = findConflicts(state, itemLines);
            if (conflicts.length > 0) {
                return { ok: false, conflicts };
            }

            state.purchases.push(purchase);
            return { ok: true, purchase };
        });
    }

    async updatePurchaseStatus(id: string, status: PurchaseStatus): Promise<Purchase | null> {
        return this.mutate((state) => {
            const purchase = state.purchases.find((candidate) => candidate.id === id);
            if (!purchase) return null;

            const now = new Date().toISOString();
            purchase.status = status;
            if (status === 'awaiting_confirmation') purchase.claimedAt = purchase.claimedAt ?? now;
            if (status === 'confirmed') purchase.confirmedAt = now;

            return withEffectiveStatus(purchase);
        });
    }

    async updatePurchase(id: string, patch: Partial<Purchase>): Promise<Purchase | null> {
        return this.mutate((state) => {
            const purchase = state.purchases.find((candidate) => candidate.id === id);
            if (!purchase) return null;

            Object.assign(purchase, patch);
            return withEffectiveStatus(purchase);
        });
    }

    async sweepExpired(): Promise<void> {
        await this.mutate((state) => {
            const now = Date.now();
            for (const purchase of state.purchases) {
                if (purchase.status === 'pending' && Date.parse(purchase.expiresAt) <= now) {
                    purchase.status = 'expired';
                }
            }
        });
    }
}

const CHECKOUT_SCRIPT = `
local itemsKey = KEYS[1]
local claimsKey = KEYS[2]
local purchasesKey = KEYS[3]
local expiryKey = KEYS[4]

local purchaseId = ARGV[1]
local purchaseJson = ARGV[2]
local linesJson = ARGV[3]
local expiresAt = ARGV[4]

if redis.call('HEXISTS', purchasesKey, purchaseId) == 1 then
    return cjson.encode({ ok = false, code = 'duplicate' })
end

local lines = cjson.decode(linesJson)

for i, line in ipairs(lines) do
    local raw = redis.call('HGET', itemsKey, line.id)
    if not raw then
        return cjson.encode({ ok = false, code = 'unavailable', itemId = line.id })
    end

    local item = cjson.decode(raw)
    if item.status ~= 'active' then
        return cjson.encode({ ok = false, code = 'unavailable', itemId = line.id })
    end

    local claimed = tonumber(redis.call('HGET', claimsKey, line.id) or '0')
    local remaining = tonumber(item.neededQuantity) - claimed
    if remaining <= 0 then
        return cjson.encode({ ok = false, code = 'sold_out', itemId = line.id, remaining = 0 })
    end

    if tonumber(line.quantity) > remaining then
        return cjson.encode({ ok = false, code = 'insufficient_stock', itemId = line.id, remaining = remaining })
    end
end

for i, line in ipairs(lines) do
    redis.call('HINCRBY', claimsKey, line.id, line.quantity)
end

redis.call('HSET', purchasesKey, purchaseId, purchaseJson)
redis.call('ZADD', expiryKey, expiresAt, purchaseId)

return cjson.encode({ ok = true })
`;

const STATUS_SCRIPT = `
local purchasesKey = KEYS[1]
local claimsKey = KEYS[2]
local expiryKey = KEYS[3]

local purchaseId = ARGV[1]
local newStatus = ARGV[2]

local raw = redis.call('HGET', purchasesKey, purchaseId)
if not raw then
    return cjson.encode({ ok = false, code = 'not_found' })
end

local purchase = cjson.decode(raw)
local previous = purchase.status
local wasActive = previous == 'pending' or previous == 'awaiting_confirmation' or previous == 'confirmed'
local isTerminal = newStatus == 'cancelled' or newStatus == 'expired'

if wasActive and isTerminal then
    for i, line in ipairs(purchase.lines) do
        if line.kind == 'item' then
            local remaining = redis.call('HINCRBY', claimsKey, line.itemId, -tonumber(line.quantity))
            if remaining <= 0 then
                redis.call('HDEL', claimsKey, line.itemId)
            end
        end
    end
end

purchase.status = newStatus
if newStatus == 'confirmed' then
    purchase.confirmedAt = purchase.confirmedAt or ARGV[3]
end
if newStatus == 'awaiting_confirmation' then
    purchase.claimedAt = purchase.claimedAt or ARGV[3]
end

redis.call('HSET', purchasesKey, purchaseId, cjson.encode(purchase))
redis.call('ZREM', expiryKey, purchaseId)

return cjson.encode({ ok = true, purchase = purchase })
`;

interface RedisKeys {
    meta: string;
    categories: string;
    items: string;
    purchases: string;
    claims: string;
    expiry: string;
}

interface RedisCheckoutReply {
    ok: boolean;
    code?: string;
    itemId?: string;
    remaining?: number;
}

interface RedisStatusReply {
    ok: boolean;
    code?: string;
    purchase?: Purchase;
}

export class RedisStore implements Store {
    private readonly redis: Redis;
    private readonly keys: RedisKeys = {
        meta: 'niver:meta',
        categories: 'niver:categories',
        items: 'niver:items',
        purchases: 'niver:purchases',
        claims: 'niver:claims',
        expiry: 'niver:expiry',
    };

    constructor(url: string, token: string) {
        this.redis = new Redis({ url, token, automaticDeserialization: false });
    }

    private decode<T>(value: unknown): T | null {
        if (typeof value !== 'string' || value.length === 0) return null;
        return JSON.parse(value) as T;
    }

    private async hashValues<T>(key: string): Promise<T[]> {
        const raw = await this.redis.hgetall<Record<string, string>>(key);
        if (!raw) return [];
        return Object.values(raw)
            .map((value) => this.decode<T>(value))
            .filter((value): value is T => value !== null);
    }

    async loadMeta(): Promise<WishlistMeta> {
        const raw = await this.redis.get<string>(this.keys.meta);
        const meta = this.decode<WishlistMeta>(raw);
        if (meta) return meta;

        const seed = createSeed();
        await this.saveMeta(seed.meta);
        for (const category of seed.categories) await this.upsertCategory(category);
        for (const item of seed.items) await this.upsertItem(item);
        return seed.meta;
    }

    async saveMeta(meta: WishlistMeta): Promise<void> {
        await this.redis.set(this.keys.meta, JSON.stringify(meta));
    }

    async listCategories(): Promise<Category[]> {
        const categories = await this.hashValues<Category>(this.keys.categories);
        return categories.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    async upsertCategory(category: Category): Promise<void> {
        await this.redis.hset(this.keys.categories, { [category.id]: JSON.stringify(category) });
    }

    async deleteCategory(id: string): Promise<void> {
        await this.redis.hdel(this.keys.categories, id);
        const items = await this.listItems();
        for (const item of items) {
            if (!item.categoryIds.includes(id)) continue;
            await this.upsertItem({
                ...item,
                categoryIds: item.categoryIds.filter((categoryId) => categoryId !== id),
                updatedAt: new Date().toISOString(),
            });
        }
    }

    async listItems(): Promise<Item[]> {
        const items = await this.hashValues<Item>(this.keys.items);
        return items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    async getItem(id: string): Promise<Item | null> {
        const raw = await this.redis.hget<string>(this.keys.items, id);
        return this.decode<Item>(raw);
    }

    async upsertItem(item: Item): Promise<void> {
        await this.redis.hset(this.keys.items, { [item.id]: JSON.stringify(item) });
    }

    async deleteItem(id: string): Promise<void> {
        await this.redis.hdel(this.keys.items, id);
    }

    async listPurchases(): Promise<Purchase[]> {
        await this.sweepExpired();
        const purchases = await this.hashValues<Purchase>(this.keys.purchases);
        return purchases.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    async getPurchase(id: string): Promise<Purchase | null> {
        const raw = await this.redis.hget<string>(this.keys.purchases, id);
        return this.decode<Purchase>(raw);
    }

    async getClaimed(): Promise<Record<string, number>> {
        await this.sweepExpired();
        const raw = await this.redis.hgetall<Record<string, string>>(this.keys.claims);
        const claims: Record<string, number> = {};
        if (!raw) return claims;

        for (const [itemId, value] of Object.entries(raw)) {
            const quantity = Number(value);
            if (Number.isFinite(quantity) && quantity > 0) claims[itemId] = quantity;
        }

        return claims;
    }

    async createPurchase(
        purchase: Purchase,
        itemLines: PurchaseItemLine[],
    ): Promise<CreatePurchaseResult> {
        const reply = await this.redis.eval<unknown[], string>(
            CHECKOUT_SCRIPT,
            [this.keys.items, this.keys.claims, this.keys.purchases, this.keys.expiry],
            [
                purchase.id,
                JSON.stringify(purchase),
                JSON.stringify(itemLines.map((line) => ({ id: line.itemId, quantity: line.quantity }))),
                String(Date.parse(purchase.expiresAt)),
            ],
        );

        const parsed = typeof reply === 'string' ? (JSON.parse(reply) as RedisCheckoutReply) : reply;
        if (parsed?.ok) return { ok: true, purchase };

        if (parsed?.code === 'duplicate') {
            const existing = await this.getPurchase(purchase.id);
            if (existing) return { ok: true, purchase: existing };
            return { ok: false, conflicts: [{ code: 'unavailable', message: 'Não foi possível concluir.' }] };
        }

        const item = parsed?.itemId ? await this.getItem(parsed.itemId) : null;
        const name = item?.name ?? itemLines.find((line) => line.itemId === parsed?.itemId)?.name ?? 'Item';

        const conflict: CheckoutConflict = {
            itemId: parsed?.itemId,
            code: (parsed?.code as CheckoutConflict['code']) ?? 'unavailable',
            message: name,
            remaining: parsed?.remaining,
        };

        return { ok: false, conflicts: [conflict] };
    }

    async updatePurchaseStatus(id: string, status: PurchaseStatus): Promise<Purchase | null> {
        const reply = await this.redis.eval<unknown[], string>(
            STATUS_SCRIPT,
            [this.keys.purchases, this.keys.claims, this.keys.expiry],
            [id, status, new Date().toISOString()],
        );

        const parsed = typeof reply === 'string' ? (JSON.parse(reply) as RedisStatusReply) : reply;
        return parsed?.purchase ?? null;
    }

    async updatePurchase(id: string, patch: Partial<Purchase>): Promise<Purchase | null> {
        const current = await this.getPurchase(id);
        if (!current) return null;

        const updated: Purchase = { ...current, ...patch, id: current.id };
        await this.redis.hset(this.keys.purchases, { [id]: JSON.stringify(updated) });
        return updated;
    }

    async sweepExpired(): Promise<void> {
        const ids = await this.redis.zrange<string[]>(this.keys.expiry, 0, Date.now(), {
            byScore: true,
        });

        for (const id of ids) {
            const purchase = await this.getPurchase(id);
            if (!purchase) {
                await this.redis.zrem(this.keys.expiry, id);
                continue;
            }

            if (purchase.status === 'pending') {
                await this.updatePurchaseStatus(id, 'expired');
            } else {
                await this.redis.zrem(this.keys.expiry, id);
            }
        }
    }
}

let storeInstance: Store | undefined;

export function getStore(env: {
    redisUrl?: string;
    redisToken?: string;
    dataDir: string;
}): Store {
    if (storeInstance) return storeInstance;

    storeInstance =
        env.redisUrl && env.redisToken
            ? new RedisStore(env.redisUrl, env.redisToken)
            : new JsonStore(env.dataDir);

    return storeInstance;
}

export function resetStore(): void {
    storeInstance = undefined;
}
