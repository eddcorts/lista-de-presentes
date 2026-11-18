import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { Category, PublicItem } from '@shared/types';
import { CartStore } from '../../../core/cart-store';
import { progressPercent } from '../../../core/format';
import { Toast } from '../../../core/toast';

@Component({
    selector: 'app-item-card',
    standalone: false,
    templateUrl: './item-card.html',
    styleUrl: './item-card.scss',
})
export class ItemCard {
    readonly item = input.required<PublicItem>();
    readonly categories = input<Category[]>([]);
    readonly details = output<void>();

    private readonly cart = inject(CartStore);
    private readonly toast = inject(Toast);

    protected readonly quantity = signal(1);

    /** Abre o diálogo de detalhes, ignorando cliques em controles internos. */
    protected openDetails(event: Event): void {
        const target = event.target as HTMLElement;
        if (target.closest('button, a, input, label')) return;
        this.details.emit();
    }

    protected readonly categoryNames = computed(() => {
        const names = new Map(this.categories().map((category) => [category.id, category.name]));
        return this.item()
            .categoryIds.map((id) => names.get(id))
            .filter((name): name is string => Boolean(name))
            .slice(0, 2);
    });

    protected readonly percent = computed(() =>
        progressPercent(this.item().claimedQuantity, this.item().neededQuantity),
    );

    protected readonly inCart = computed(() => this.cart.quantityFor(this.item().id));

    protected readonly maxAdd = computed(() =>
        Math.max(0, this.item().remaining - this.inCart()),
    );

    protected readonly hasStepper = computed(
        () => this.item().remaining > 1 && (this.item().priceMode === 'share' || this.item().neededQuantity > 1),
    );

    protected readonly stockLabel = computed(() =>
        this.item().priceMode === 'share'
            ? `${this.item().claimedQuantity} de ${this.item().neededQuantity} cotas`
            : `${this.item().claimedQuantity} de ${this.item().neededQuantity} unidades`,
    );

    protected increment(): void {
        this.quantity.update((value) => Math.min(Math.max(1, this.maxAdd()), value + 1));
    }

    protected decrement(): void {
        this.quantity.update((value) => Math.max(1, value - 1));
    }

    protected add(): void {
        const item = this.item();
        if (item.soldOut || this.maxAdd() <= 0) return;

        const quantity = Math.min(this.quantity(), this.maxAdd());
        this.cart.add(item.id, quantity, item.remaining);
        this.toast.show(`${item.name} adicionado ao carrinho.`);
        this.quantity.set(1);
    }
}
