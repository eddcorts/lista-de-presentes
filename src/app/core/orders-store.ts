import { Injectable, signal } from '@angular/core';

export interface StoredOrder {
    token: string;
    createdAt: string;
    totalCents: number;
    label: string;
}

const STORAGE_KEY = 'niver:orders:v1';

@Injectable({ providedIn: 'root' })
export class OrdersStore {
    private readonly ordersState = signal<StoredOrder[]>(OrdersStore.readOrders());
    readonly orders = this.ordersState.asReadonly();

    remember(order: StoredOrder): void {
        this.ordersState.update((orders) => {
            const next = [order, ...orders.filter((entry) => entry.token !== order.token)].slice(0, 8);
            this.persist(next);
            return next;
        });
    }

    forget(token: string): void {
        this.ordersState.update((orders) => {
            const next = orders.filter((entry) => entry.token !== token);
            this.persist(next);
            return next;
        });
    }

    private persist(orders: StoredOrder[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
        } catch {
            // Sem armazenamento, mantém apenas em memória.
        }
    }

    private static readOrders(): StoredOrder[] {
        if (typeof localStorage === 'undefined') return [];

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw) as StoredOrder[];
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(
                (order) =>
                    order && typeof order.token === 'string' && typeof order.createdAt === 'string',
            );
        } catch {
            return [];
        }
    }
}
