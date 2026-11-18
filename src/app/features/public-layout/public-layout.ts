import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CartStore } from '../../core/cart-store';
import { formatEventDate } from '../../core/format';
import { WishlistStore } from '../../core/wishlist-store';

@Component({
    selector: 'app-public-layout',
    standalone: false,
    templateUrl: './public-layout.html',
    styleUrl: './public-layout.scss',
})
export class PublicLayout {
    protected readonly store = inject(WishlistStore);
    protected readonly cart = inject(CartStore);
    protected readonly year = new Date().getFullYear();

    protected readonly owner = computed(() => this.store.wishlist()?.meta.ownerName ?? 'Lista de presentes');
    protected readonly eventDate = computed(() =>
        formatEventDate(this.store.wishlist()?.meta.eventDate),
    );

    constructor() {
        void this.store.load();
    }
}
