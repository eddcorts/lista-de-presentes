import { inject, Injectable } from '@angular/core';
import type {
    CheckoutRequest,
    CheckoutResponse,
    PixResponse,
    PublicPurchase,
    PublicWishlist,
} from '@shared/types';
import { Api } from './api';

@Injectable({ providedIn: 'root' })
export class WishlistApi {
    private readonly api = inject(Api);

    getWishlist(): Promise<PublicWishlist> {
        return this.api.get<PublicWishlist>('/wishlist');
    }

    checkout(input: CheckoutRequest): Promise<CheckoutResponse> {
        return this.api.post<CheckoutResponse>('/checkout', input);
    }

    getPurchase(token: string): Promise<PublicPurchase> {
        return this.api
            .get<{ purchase: PublicPurchase }>(`/purchases/${encodeURIComponent(token)}`)
            .then((response) => response.purchase);
    }

    getPix(token: string): Promise<PixResponse> {
        return this.api.get<PixResponse>(`/purchases/${encodeURIComponent(token)}/pix`);
    }

    confirm(
        token: string,
        input: { giftMessage?: string; proof?: File | null },
    ): Promise<PublicPurchase> {
        const form = new FormData();
        if (input.giftMessage) form.set('giftMessage', input.giftMessage);
        if (input.proof) form.set('proof', input.proof);

        return this.api
            .postForm<{ purchase: PublicPurchase }>(
                `/purchases/${encodeURIComponent(token)}/confirm`,
                form,
            )
            .then((response) => response.purchase);
    }

    cancel(token: string): Promise<PublicPurchase> {
        return this.api
            .post<{ purchase: PublicPurchase }>(`/purchases/${encodeURIComponent(token)}/cancel`)
            .then((response) => response.purchase);
    }
}
