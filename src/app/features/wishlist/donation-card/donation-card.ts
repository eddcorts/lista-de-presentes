import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { DonationSettings } from '@shared/types';
import { CartStore } from '../../../core/cart-store';
import { brl } from '../../../core/format';
import { Toast } from '../../../core/toast';

@Component({
    selector: 'app-donation-card',
    standalone: false,
    templateUrl: './donation-card.html',
    styleUrl: './donation-card.scss',
})
export class DonationCard {
    readonly settings = input.required<DonationSettings>();

    protected readonly cart = inject(CartStore);
    private readonly toast = inject(Toast);

    protected readonly custom = signal(0);

    protected readonly current = computed(() => this.cart.donationCents());
    protected readonly minLabel = computed(() => brl(this.settings().minCents));

    protected select(amount: number): void {
        this.cart.setDonation(amount);
        this.toast.show(`Contribuição de ${brl(amount)} no carrinho.`);
    }

    protected addCustom(): void {
        const amount = this.custom();
        if (amount < this.settings().minCents) {
            this.toast.show(`A contribuição mínima é de ${this.minLabel()}.`, 'error');
            return;
        }

        this.select(amount);
        this.custom.set(0);
    }

    protected remove(): void {
        this.cart.setDonation(0);
        this.toast.show('Contribuição removida do carrinho.', 'info');
    }
}
