import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import type { CheckoutConflict, PublicItem } from '@shared/types';
import { ApiClientError } from '../../core/api';
import { CartStore } from '../../core/cart-store';
import { brl, formatEventDate } from '../../core/format';
import { OrdersStore } from '../../core/orders-store';
import { Toast } from '../../core/toast';
import { WishlistApi } from '../../core/wishlist-api';
import { WishlistStore } from '../../core/wishlist-store';

function newCheckoutId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const random = (Math.random() * 16) | 0;
        const value = char === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

@Component({
    selector: 'app-cart-page',
    standalone: false,
    templateUrl: './cart-page.html',
    styleUrl: './cart-page.scss',
})
export class CartPage {
    private readonly wishlistApi = inject(WishlistApi);
    private readonly router = inject(Router);
    private readonly formBuilder = inject(FormBuilder);

    protected readonly store = inject(WishlistStore);
    protected readonly cart = inject(CartStore);
    protected readonly toast = inject(Toast);
    private readonly orders = inject(OrdersStore);

    protected readonly submitting = signal(false);
    protected readonly conflicts = signal<CheckoutConflict[]>([]);
    protected readonly errorMessage = signal<string | null>(null);

    protected readonly data = this.store.wishlist;
    protected readonly eventDate = computed(() => formatEventDate(this.data()?.meta.eventDate));

    protected readonly form = this.formBuilder.nonNullable.group({
        buyerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
        buyerEmail: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    });

    protected readonly itemMap = computed(
        () => new Map<string, PublicItem>((this.data()?.items ?? []).map((item) => [item.id, item])),
    );

    protected readonly cartLines = computed(() =>
        this.cart
            .lines()
            .map((line) => ({ line, item: this.itemMap().get(line.itemId) }))
            .filter(
                (entry): entry is { line: { itemId: string; quantity: number }; item: PublicItem } =>
                    Boolean(entry.item),
            ),
    );

    protected readonly itemsTotal = computed(() =>
        this.cartLines().reduce(
            (total, entry) => total + entry.item.unitPriceCents * entry.line.quantity,
            0,
        ),
    );

    protected readonly total = computed(() => this.itemsTotal() + this.cart.donationCents());
    protected readonly donationTitle = computed(
        () => this.data()?.meta.donation.title ?? 'Contribuição',
    );
    protected readonly donationMin = computed(() => this.data()?.meta.donation.minCents ?? 500);
    protected readonly isEmpty = computed(() => this.cartLines().length === 0 && this.cart.donationCents() === 0);

    constructor() {
        void this.store.load().then((wishlist) => {
            if (!wishlist) return;
            this.cart.reconcile(wishlist.items);
            if (this.cart.donationCents() > 0 && !wishlist.meta.donation.enabled) {
                this.cart.setDonation(0);
            }
        });
    }

    protected categoryNames(item: PublicItem): string {
        const categories = this.data()?.categories ?? [];
        const names = new Map(categories.map((category) => [category.id, category.name]));
        return item.categoryIds
            .map((id) => names.get(id))
            .filter((name): name is string => Boolean(name))
            .join(' · ');
    }

    protected increment(entry: { line: { quantity: number }; item: PublicItem }): void {
        this.cart.setQuantity(
            entry.item.id,
            entry.line.quantity + 1,
            Math.max(1, entry.item.remaining),
        );
    }

    protected decrement(entry: { line: { quantity: number }; item: PublicItem }): void {
        this.cart.setQuantity(entry.item.id, entry.line.quantity - 1, entry.item.remaining);
    }

    protected remove(item: PublicItem): void {
        this.cart.remove(item.id);
        this.toast.show(`${item.name} removido dos escolhidos.`, 'info');
    }

    protected removeDonation(): void {
        this.cart.setDonation(0);
        this.toast.show('Contribuição removida dos escolhidos.', 'info');
    }

    protected fieldInvalid(name: 'buyerName' | 'buyerEmail'): boolean {
        const control = this.form.controls[name];
        return control.invalid && (control.dirty || control.touched);
    }

    protected async submit(): Promise<void> {
        this.conflicts.set([]);
        this.errorMessage.set(null);

        if (this.isEmpty()) {
            this.toast.show('Escolha ao menos um presente.', 'error');
            return;
        }

        if (this.cart.donationCents() > 0 && this.cart.donationCents() < this.donationMin()) {
            this.toast.show(`A contribuição mínima é de ${brl(this.donationMin())}.`, 'error');
            return;
        }

        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.toast.show('Confira seu nome e e-mail antes de continuar.', 'error');
            return;
        }

        this.submitting.set(true);

        try {
            const response = await this.wishlistApi.checkout({
                checkoutId: newCheckoutId(),
                buyerName: this.form.controls.buyerName.value.trim(),
                buyerEmail: this.form.controls.buyerEmail.value.trim(),
                items: this.cart.lines().map((line) => ({
                    itemId: line.itemId,
                    quantity: line.quantity,
                })),
                donationCents: this.cart.donationCents() || undefined,
            });

            const label =
                response.purchase.lines.find((line) => line.kind === 'item')?.name ??
                'Contribuição';

            this.orders.remember({
                token: response.purchase.token,
                createdAt: response.purchase.createdAt,
                totalCents: response.purchase.totalCents,
                label,
            });

            this.cart.clear();
            await this.router.navigate(['/pedido', response.purchase.token]);
        } catch (error) {
            if (error instanceof ApiClientError) {
                this.errorMessage.set(error.failure.message);
                const details = error.failure.details;
                if (Array.isArray(details)) {
                    this.conflicts.set(details as CheckoutConflict[]);
                }
                if (error.failure.status === 409) {
                    await this.store.load(true);
                    this.cart.reconcile(this.store.wishlist()?.items ?? []);
                }
            } else {
                this.errorMessage.set('Não foi possível concluir o pedido.');
            }
        } finally {
            this.submitting.set(false);
        }
    }
}
