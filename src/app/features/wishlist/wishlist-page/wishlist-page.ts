import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { DomSanitizer, SafeStyle } from '@angular/platform-browser';
import type { PublicItem } from '@shared/types';
import { CartStore } from '../../../core/cart-store';
import { formatEventDate, brl } from '../../../core/format';
import { OrdersStore } from '../../../core/orders-store';
import { WishlistStore } from '../../../core/wishlist-store';
import { ItemDetailDialog } from '../item-detail-dialog/item-detail-dialog';

type SortMode = 'featured' | 'price-asc' | 'price-desc' | 'name' | 'category';

function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

@Component({
    selector: 'app-wishlist-page',
    standalone: false,
    templateUrl: './wishlist-page.html',
    styleUrl: './wishlist-page.scss',
})
export class WishlistPage {
    protected readonly store = inject(WishlistStore);
    protected readonly cart = inject(CartStore);
    protected readonly orders = inject(OrdersStore);
    private readonly sanitizer = inject(DomSanitizer);
    private readonly detailDialog = viewChild(ItemDetailDialog);

    protected openDetails(item: PublicItem): void {
        this.detailDialog()?.open(item);
    }

    protected readonly backdrop = computed<SafeStyle | ''>(() => {
        const url = this.data()?.meta.coverImageUrl;
        return url ? this.sanitizer.bypassSecurityTrustStyle(`url("${url}")`) : '';
    });

    protected readonly search = signal('');
    protected readonly selectedCategories = signal<string[]>([]);
    protected readonly hideSoldOut = signal(false);
    protected readonly sort = signal<SortMode>('featured');
    protected readonly priceCap = signal<number | null>(null);

    protected readonly data = this.store.wishlist;
    protected readonly items = computed(() => this.data()?.items ?? []);
    protected readonly categories = computed(() => this.data()?.categories ?? []);
    protected readonly eventDate = computed(() => formatEventDate(this.data()?.meta.eventDate));
    protected readonly donation = computed(() => this.data()?.meta.donation ?? null);
    protected readonly recentOrder = computed(() => this.orders.orders()[0] ?? null);

    protected readonly priceBounds = computed(() =>
        Math.max(100, ...this.items().map((item) => item.unitPriceCents)),
    );

    protected readonly sliderValue = computed(() => this.priceCap() ?? this.priceBounds());

    protected readonly filteredItems = computed<PublicItem[]>(() => {
        const search = normalize(this.search());
        const selected = new Set(this.selectedCategories());
        const cap = this.priceCap();
        const hideSoldOut = this.hideSoldOut();
        const categoryOrder = new Map(
            this.categories()
                .filter((category) => selected.size === 0 || selected.has(category.id))
                .map((category, index) => [category.id, index]),
        );

        const filtered = this.items().filter((item) => {
            if (hideSoldOut && item.soldOut) return false;
            if (cap !== null && item.unitPriceCents > cap) return false;
            if (selected.size > 0 && !item.categoryIds.some((id) => selected.has(id))) return false;
            if (search && !normalize(`${item.name} ${item.description ?? ''}`).includes(search)) {
                return false;
            }
            return true;
        });

        const sort = this.sort();
        return [...filtered].sort((a, b) => {
            if (sort === 'price-asc') return a.unitPriceCents - b.unitPriceCents;
            if (sort === 'price-desc') return b.unitPriceCents - a.unitPriceCents;
            if (sort === 'name') return a.name.localeCompare(b.name, 'pt-BR');
            if (sort === 'category') {
                const orderA = categoryOrder.get(a.categoryIds[0] ?? '') ?? 999;
                const orderB = categoryOrder.get(b.categoryIds[0] ?? '') ?? 999;
                if (orderA !== orderB) return orderA - orderB;
                return a.name.localeCompare(b.name, 'pt-BR');
            }

            if (a.soldOut !== b.soldOut) return a.soldOut ? 1 : -1;
            return a.name.localeCompare(b.name, 'pt-BR');
        });
    });

    protected readonly hasFilters = computed(
        () =>
            this.search().trim().length > 0 ||
            this.selectedCategories().length > 0 ||
            this.hideSoldOut() ||
            this.priceCap() !== null,
    );

    protected readonly availableCount = computed(
        () => this.items().filter((item) => !item.soldOut).length,
    );

    protected readonly priceCapLabel = computed(() => brl(this.sliderValue()));

    protected isCategorySelected(id: string): boolean {
        return this.selectedCategories().includes(id);
    }

    protected toggleCategory(id: string): void {
        this.selectedCategories.update((ids) =>
            ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id],
        );
    }

    protected updateSearch(value: string): void {
        this.search.set(value);
    }

    protected updateSort(value: string): void {
        this.sort.set(value as SortMode);
    }

    protected toggleSoldOut(): void {
        this.hideSoldOut.update((value) => !value);
    }

    protected updatePriceCap(input: Event): void {
        const element = input.target as HTMLInputElement;
        const value = Number(element.value);
        this.priceCap.set(value >= this.priceBounds() ? null : value);
    }

    protected clearFilters(): void {
        this.search.set('');
        this.selectedCategories.set([]);
        this.hideSoldOut.set(false);
        this.priceCap.set(null);
    }
}
