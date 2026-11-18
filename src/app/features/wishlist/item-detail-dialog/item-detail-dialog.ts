import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    computed,
    inject,
    input,
    signal,
    viewChild,
} from '@angular/core';
import type { Category, PublicItem } from '@shared/types';
import { CartStore } from '../../../core/cart-store';
import { progressPercent } from '../../../core/format';
import { Toast } from '../../../core/toast';

@Component({
    selector: 'app-item-detail-dialog',
    standalone: false,
    templateUrl: './item-detail-dialog.html',
    styleUrl: './item-detail-dialog.scss',
})
export class ItemDetailDialog {
    private readonly cart = inject(CartStore);
    private readonly toast = inject(Toast);

    readonly categories = input<Category[]>([]);

    private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialogRef');

    protected readonly item = signal<PublicItem | null>(null);

    protected readonly quantity = signal(1);

    protected readonly categoryNames = computed(() => {
        const current = this.item();
        const names = new Map(this.categories().map((category) => [category.id, category.name]));
        return current
            ? current.categoryIds
                  .map((id) => names.get(id))
                  .filter((name): name is string => Boolean(name))
                  .slice(0, 2)
            : [];
    });

    protected readonly percent = computed(() => {
        const current = this.item();
        return current ? progressPercent(current.claimedQuantity, current.neededQuantity) : 0;
    });

    protected readonly inCart = computed(() => {
        const current = this.item();
        return current ? this.cart.quantityFor(current.id) : 0;
    });

    protected readonly maxAdd = computed(() => {
        const current = this.item();
        return current ? Math.max(0, current.remaining - this.inCart()) : 0;
    });

    protected readonly hasStepper = computed(() => {
        const current = this.item();
        return Boolean(
            current && current.remaining > 1 && (current.priceMode === 'share' || current.neededQuantity > 1),
        );
    });

    protected readonly stockLabel = computed(() => {
        const current = this.item();
        if (!current) return '';
        return current.priceMode === 'share'
            ? `${current.claimedQuantity} de ${current.neededQuantity} cotas`
            : `${current.claimedQuantity} de ${current.neededQuantity} unidades`;
    });

    open(item: PublicItem): void {
        this.item.set(item);
        this.quantity.set(1);
        this.dialogRef().nativeElement.showModal();
    }

    protected close(): void {
        this.dialogRef().nativeElement.close();
    }

    protected onBackdropClick(event: MouseEvent): void {
        if (event.target === this.dialogRef().nativeElement) this.close();
    }

    protected increment(): void {
        this.quantity.update((value) => Math.min(Math.max(1, this.maxAdd()), value + 1));
    }

    protected decrement(): void {
        this.quantity.update((value) => Math.max(1, value - 1));
    }

    protected add(): void {
        const current = this.item();
        if (!current || current.soldOut || this.maxAdd() <= 0) return;

        const quantity = Math.min(this.quantity(), this.maxAdd());
        this.cart.add(current.id, quantity, current.remaining);
        this.toast.show(`${current.name} adicionado aos escolhidos.`);
        this.quantity.set(1);
    }
}
