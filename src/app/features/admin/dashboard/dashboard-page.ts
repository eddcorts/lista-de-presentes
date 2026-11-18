import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminApi } from '../../../core/admin-api';
import {
    brl,
    formatDateTime,
    initials,
    statusLabel,
    statusTone,
} from '../../../core/format';
import { Toast } from '../../../core/toast';

@Component({
    selector: 'app-admin-dashboard-page',
    standalone: false,
    templateUrl: './dashboard-page.html',
    styleUrl: './dashboard-page.scss',
})
export class AdminDashboardPage {
    protected readonly api = inject(AdminApi);
    private readonly toast = inject(Toast);

    protected readonly loading = signal(true);
    protected readonly error = signal<string | null>(null);

    protected readonly wishlist = this.api.wishlist;
    protected readonly purchases = this.api.purchases;

    protected readonly owner = computed(() => this.wishlist()?.meta.ownerName ?? '');
    protected readonly totals = computed(() => this.wishlist()?.totals ?? null);
    protected readonly items = computed(() => this.wishlist()?.items ?? []);
    protected readonly soldOut = computed(() => this.items().filter((item) => item.soldOut));

    protected readonly recent = computed(() => this.purchases().slice(0, 5));

    protected readonly attention = computed(() =>
        this.items()
            .filter((item) => item.remaining <= 2)
            .sort((a, b) => a.remaining - b.remaining)
            .slice(0, 5),
    );

    protected readonly turnover = computed(() => {
        const totals = this.totals();
        if (!totals) return 0;
        const potential = this.items().reduce(
            (sum, item) => sum + item.unitPriceCents * item.neededQuantity,
            0,
        );
        return potential > 0 ? Math.min(100, Math.round((totals.totalCents / potential) * 100)) : 0;
    });

    protected readonly statusLabel = statusLabel;
    protected readonly statusTone = statusTone;
    protected readonly formatDateTime = formatDateTime;
    protected readonly initials = initials;
    protected readonly brl = brl;

    protected plural(count: number, singular: string, plural: string): string {
        return `${count} ${count === 1 ? singular : plural}`;
    }

    constructor() {
        void this.reload();
    }

    protected async reload(): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            await Promise.all([this.api.refresh(), this.api.refreshPurchases()]);
        } catch {
            this.error.set('Não foi possível carregar o painel.');
            this.toast.show('Não foi possível carregar o painel.', 'error');
        } finally {
            this.loading.set(false);
        }
    }
}
