import { inject, Injectable, signal } from '@angular/core';
import type { PublicWishlist } from '@shared/types';
import { toApiFailure } from './api';
import { WishlistApi } from './wishlist-api';

@Injectable({ providedIn: 'root' })
export class WishlistStore {
    private readonly api = inject(WishlistApi);
    private readonly state = signal<PublicWishlist | null>(null);
    private readonly loadingState = signal(false);
    private readonly errorState = signal<string | null>(null);
    private pending: Promise<PublicWishlist | null> | null = null;

    readonly wishlist = this.state.asReadonly();
    readonly loading = this.loadingState.asReadonly();
    readonly error = this.errorState.asReadonly();

    load(force = false): Promise<PublicWishlist | null> {
        const cached = this.state();
        if (!force && cached) return Promise.resolve(cached);
        if (!force && this.pending) return this.pending;

        this.loadingState.set(true);
        this.errorState.set(null);

        const pending = this.api
            .getWishlist()
            .then((wishlist) => {
                this.state.set(wishlist);
                return wishlist;
            })
            .catch((error) => {
                this.errorState.set(toApiFailure(error).message);
                return null;
            })
            .finally(() => {
                this.loadingState.set(false);
                this.pending = null;
            });

        this.pending = pending;
        return pending;
    }

    retry(): Promise<PublicWishlist | null> {
        return this.load(true);
    }
}
