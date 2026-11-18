import { inject, Injectable, signal } from '@angular/core';
import type {
    AdminWishlist,
    Category,
    Item,
    Purchase,
    PurchaseStatus,
} from '@shared/types';
import { Api } from './api';

export interface ItemPayload {
    name: string;
    description?: string;
    imageUrl?: string;
    neededQuantity: number;
    unitPriceCents: number;
    priceMode: 'unit' | 'share';
    categoryIds: string[];
    externalUrl?: string;
    status: 'active' | 'archived';
}

export interface CategoryPayload {
    name: string;
    color?: string;
}

export interface MetaPayload {
    title: string;
    subtitle?: string;
    description?: string;
    coverImageUrl?: string;
    ownerName: string;
    ownerImageUrl?: string;
    eventDate: string;
    thankYouMessage?: string;
    pix: { key: string; keyType: 'random' | 'email' | 'cpf' | 'cnpj' | 'phone'; merchantName: string; merchantCity: string };
    donation: {
        enabled: boolean;
        title: string;
        description?: string;
        minCents: number;
        suggestedCents: number[];
    };
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
    private readonly api = inject(Api);

    private readonly wishlistState = signal<AdminWishlist | null>(null);
    private readonly purchasesState = signal<Purchase[]>([]);
    readonly wishlist = this.wishlistState.asReadonly();
    readonly purchases = this.purchasesState.asReadonly();

    async refresh(): Promise<AdminWishlist> {
        const wishlist = await this.api.get<AdminWishlist>('/admin/wishlist');
        this.wishlistState.set(wishlist);
        return wishlist;
    }

    async refreshPurchases(): Promise<Purchase[]> {
        const response = await this.api.get<{ purchases: Purchase[] }>('/admin/purchases');
        this.purchasesState.set(response.purchases);
        return response.purchases;
    }

    async saveMeta(input: MetaPayload): Promise<void> {
        await this.api.put('/admin/meta', input);
        await this.refresh();
    }

    async createItem(input: ItemPayload): Promise<Item> {
        const response = await this.api.post<{ item: Item }>('/admin/items', input);
        await this.refresh();
        return response.item;
    }

    async updateItem(id: string, input: ItemPayload): Promise<Item> {
        const response = await this.api.put<{ item: Item }>(`/admin/items/${id}`, input);
        await this.refresh();
        return response.item;
    }

    async deleteItem(id: string): Promise<void> {
        await this.api.delete(`/admin/items/${id}`);
        await this.refresh();
    }

    async createCategory(input: CategoryPayload): Promise<Category> {
        const response = await this.api.post<{ category: Category }>('/admin/categories', input);
        await this.refresh();
        return response.category;
    }

    async updateCategory(id: string, input: CategoryPayload): Promise<Category> {
        const response = await this.api.put<{ category: Category }>(
            `/admin/categories/${id}`,
            input,
        );
        await this.refresh();
        return response.category;
    }

    async deleteCategory(id: string): Promise<void> {
        await this.api.delete(`/admin/categories/${id}`);
        await this.refresh();
    }

    async setPurchaseStatus(id: string, status: PurchaseStatus): Promise<Purchase> {
        const response = await this.api.post<{ purchase: Purchase }>(
            `/admin/purchases/${id}/status`,
            { status },
        );
        await this.refreshPurchases();
        await this.refresh();
        return response.purchase;
    }

    async savePurchaseNotes(id: string, adminNotes: string): Promise<Purchase> {
        const response = await this.api.patch<{ purchase: Purchase }>(`/admin/purchases/${id}`, {
            adminNotes,
        });
        await this.refreshPurchases();
        return response.purchase;
    }

    upload(kind: 'cover' | 'owner' | 'item' | 'proof', file: File): Promise<{ url: string; pathname: string }> {
        const form = new FormData();
        form.set('kind', kind);
        form.set('file', file);
        return this.api.postForm<{ url: string; pathname: string }>('/admin/uploads', form);
    }
}
