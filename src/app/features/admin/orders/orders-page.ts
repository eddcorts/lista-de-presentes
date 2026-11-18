import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Purchase, PurchaseStatus } from '@shared/types';
import { toApiFailure } from '../../../core/api';
import { AdminApi } from '../../../core/admin-api';
import { formatDateTime, initials, statusLabel, statusTone } from '../../../core/format';
import { Toast } from '../../../core/toast';

type Filter = 'all' | PurchaseStatus;

const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Aguardando PIX' },
    { value: 'awaiting_confirmation', label: 'A confirmar' },
    { value: 'confirmed', label: 'Confirmados' },
    { value: 'cancelled', label: 'Cancelados' },
    { value: 'expired', label: 'Expirados' },
];

function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

@Component({
    selector: 'app-admin-orders-page',
    standalone: false,
    templateUrl: './orders-page.html',
    styleUrl: './orders-page.scss',
})
export class AdminOrdersPage {
    private readonly api = inject(AdminApi);
    private readonly toast = inject(Toast);

    protected readonly filters = FILTERS;
    protected readonly filter = signal<Filter>('all');
    protected readonly search = signal('');
    protected readonly expanded = signal<string | null>(null);
    protected readonly busy = signal<string | null>(null);
    protected readonly armedCancel = signal<string | null>(null);
    protected readonly notes = signal<Record<string, string>>({});
    protected readonly savingNotes = signal<string | null>(null);

    protected readonly purchases = this.api.purchases;

    protected readonly filtered = computed(() => {
        const filter = this.filter();
        const search = normalize(this.search());

        return this.purchases().filter((purchase) => {
            if (filter !== 'all' && purchase.status !== filter) return false;
            if (
                search &&
                !normalize(`${purchase.buyerName} ${purchase.buyerEmail} ${purchase.id}`).includes(search)
            ) {
                return false;
            }
            return true;
        });
    });

    protected readonly counts = computed(() => {
        const counts: Record<Filter, number> = {
            all: 0,
            pending: 0,
            awaiting_confirmation: 0,
            confirmed: 0,
            cancelled: 0,
            expired: 0,
        };

        for (const purchase of this.purchases()) {
            counts.all += 1;
            counts[purchase.status] += 1;
        }

        return counts;
    });

    protected readonly statusLabel = statusLabel;
    protected readonly statusTone = statusTone;
    protected readonly formatDateTime = formatDateTime;
    protected readonly initials = initials;

    protected plural(count: number, singular: string, plural: string): string {
        return `${count} ${count === 1 ? singular : plural}`;
    }

    constructor() {
        void this.refresh();
    }

    protected async refresh(): Promise<void> {
        try {
            await this.api.refreshPurchases();
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        }
    }

    protected toggle(purchase: Purchase): void {
        this.expanded.update((current) => (current === purchase.id ? null : purchase.id));
        if (this.expanded() === purchase.id) {
            this.notes.update((notes) => ({
                ...notes,
                [purchase.id]: notes[purchase.id] ?? purchase.adminNotes ?? '',
            }));
        }
    }

    protected noteFor(purchase: Purchase): string {
        return this.notes()[purchase.id] ?? purchase.adminNotes ?? '';
    }

    protected updateNote(purchase: Purchase, value: string): void {
        this.notes.update((notes) => ({ ...notes, [purchase.id]: value }));
    }

    protected canConfirm(purchase: Purchase): boolean {
        return purchase.status === 'pending' || purchase.status === 'awaiting_confirmation';
    }

    protected canCancel(purchase: Purchase): boolean {
        return purchase.status !== 'cancelled' && purchase.status !== 'expired';
    }

    protected proofUrl(purchase: Purchase): string {
        return `/api/admin/purchases/${purchase.id}/proof`;
    }

    protected lineTotal(value: Purchase['lines'][number]): number {
        return value.kind === 'donation' ? value.amountCents : value.unitPriceCents * value.quantity;
    }

    protected async confirm(purchase: Purchase): Promise<void> {
        this.busy.set(purchase.id);
        try {
            await this.api.setPurchaseStatus(purchase.id, 'confirmed');
            this.toast.show(`Pedido de ${purchase.buyerName} confirmado.`);
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.busy.set(null);
        }
    }

    protected async cancel(purchase: Purchase): Promise<void> {
        if (this.armedCancel() !== purchase.id) {
            this.armedCancel.set(purchase.id);
            return;
        }

        this.busy.set(purchase.id);
        try {
            await this.api.setPurchaseStatus(purchase.id, 'cancelled');
            this.toast.show(`Pedido de ${purchase.buyerName} cancelado.`, 'info');
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.busy.set(null);
            this.armedCancel.set(null);
        }
    }

    protected async saveNotes(purchase: Purchase): Promise<void> {
        this.savingNotes.set(purchase.id);
        try {
            await this.api.savePurchaseNotes(purchase.id, this.noteFor(purchase));
            this.toast.show('Anotação salva.');
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.savingNotes.set(null);
        }
    }
}
