import { inject, Injectable, computed, effect, signal } from '@angular/core';
import type { PublicItem } from '@shared/types';

export interface CartLine {
    itemId: string;
    quantity: number;
}

interface StoredCart {
    lines: CartLine[];
    donationCents: number;
}

const STORAGE_KEY = 'niver:cart:v1';

@Injectable({ providedIn: 'root' })
export class CartStore {
    private readonly initial = CartStore.readCart();
    private readonly linesState = signal<CartLine[]>(this.initial.lines);
    private readonly donationState = signal<number>(this.initial.donationCents);

    readonly lines = this.linesState.asReadonly();
    readonly donationCents = this.donationState.asReadonly();

    readonly count = computed(() =>
        this.linesState().reduce((total, line) => total + line.quantity, 0),
    );

    readonly hasItems = computed(() => this.linesState().length > 0);

    constructor() {
        effect(() => {
            const payload: StoredCart = {
                lines: this.linesState(),
                donationCents: this.donationState(),
            };

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            } catch {
                // Armazenamento indisponível (modo privado); os escolhidos seguem em memória.
            }
        });
    }

    quantityFor(itemId: string): number {
        return this.linesState().find((line) => line.itemId === itemId)?.quantity ?? 0;
    }

    add(itemId: string, quantity = 1, max = 99): void {
        const limit = Math.max(1, max);
        this.linesState.update((lines) => {
            const index = lines.findIndex((line) => line.itemId === itemId);
            if (index === -1) {
                return [...lines, { itemId, quantity: Math.min(limit, quantity) }];
            }

            const next = [...lines];
            next[index] = {
                ...next[index],
                quantity: Math.min(limit, next[index].quantity + quantity),
            };
            return next;
        });
    }

    setQuantity(itemId: string, quantity: number, max = 99): void {
        this.linesState.update((lines) => {
            if (quantity <= 0) return lines.filter((line) => line.itemId !== itemId);
            return lines.map((line) =>
                line.itemId === itemId ? { ...line, quantity: Math.min(max, Math.floor(quantity)) } : line,
            );
        });
    }

    remove(itemId: string): void {
        this.linesState.update((lines) => lines.filter((line) => line.itemId !== itemId));
    }

    setDonation(cents: number): void {
        this.donationState.set(Math.max(0, Math.floor(cents)));
    }

    clear(): void {
        this.linesState.set([]);
        this.donationState.set(0);
    }

    reconcile(items: PublicItem[]): void {
        const byId = new Map(items.map((item) => [item.id, item]));

        this.linesState.update((lines) =>
            lines
                .map((line) => {
                    const item = byId.get(line.itemId);
                    if (!item) return null;
                    return {
                        itemId: line.itemId,
                        quantity: Math.max(0, Math.min(line.quantity, item.remaining)),
                    };
                })
                .filter((line): line is CartLine => line !== null && line.quantity > 0),
        );
    }

    private static readCart(): StoredCart {
        if (typeof localStorage === 'undefined') return { lines: [], donationCents: 0 };

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { lines: [], donationCents: 0 };

            const parsed = JSON.parse(raw) as Partial<StoredCart>;
            const lines = Array.isArray(parsed.lines)
                ? parsed.lines
                        .filter(
                            (line): line is CartLine =>
                                !!line &&
                                typeof line.itemId === 'string' &&
                                typeof line.quantity === 'number' &&
                                line.quantity > 0,
                        )
                        .map((line) => ({ itemId: line.itemId, quantity: Math.min(99, Math.floor(line.quantity)) }))
                : [];

            const donationCents =
                typeof parsed.donationCents === 'number' && parsed.donationCents > 0
                    ? Math.floor(parsed.donationCents)
                    : 0;

            return { lines, donationCents };
        } catch {
            return { lines: [], donationCents: 0 };
        }
    }
}
