import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import type { PublicItem } from '@shared/types';
import { AdminApi } from '../../../../core/admin-api';
import { progressPercent } from '../../../../core/format';
import { Toast } from '../../../../core/toast';
import type { ItemDialog } from '../item-dialog/item-dialog';

function normalize(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

type StatusFilter = 'all' | 'active' | 'archived';

@Component({
    selector: 'app-admin-items-page',
    standalone: false,
    templateUrl: './items-page.html',
    styleUrl: './items-page.scss',
})
export class AdminItemsPage {
    private readonly api = inject(AdminApi);
    private readonly toast = inject(Toast);

    protected readonly dialog = viewChild.required<ItemDialog>('itemDialog');

    protected readonly search = signal('');
    protected readonly statusFilter = signal<StatusFilter>('all');
    protected readonly armedDelete = signal<string | null>(null);
    protected readonly deleting = signal<string | null>(null);

    protected readonly wishlist = this.api.wishlist;
    protected readonly categories = computed(() => this.wishlist()?.categories ?? []);
    protected readonly items = computed(() => this.wishlist()?.items ?? []);

    protected readonly filtered = computed(() => {
        const search = normalize(this.search());
        const status = this.statusFilter();

        return this.items().filter((item) => {
            if (status !== 'all' && item.status !== status) return false;
            if (search && !normalize(`${item.name} ${item.description ?? ''}`).includes(search)) {
                return false;
            }
            return true;
        });
    });

    protected readonly activeCount = computed(
        () => this.items().filter((item) => item.status === 'active').length,
    );
    protected readonly archivedCount = computed(() => this.items().length - this.activeCount());

    protected readonly categoryNames = computed(() => {
        const names = new Map(this.categories().map((category) => [category.id, category.name]));
        return names;
    });

    constructor() {
        void this.api.refresh().catch(() => {
            this.toast.show('Não foi possível carregar os presentes.', 'error');
        });
    }

    protected openCreate(): void {
        this.dialog().open(null);
    }

    protected openEdit(item: PublicItem): void {
        this.armedDelete.set(null);
        this.dialog().open(item);
    }

    protected onSaved(): void {
        this.toast.show('Lista atualizada.');
    }

    protected percent(item: PublicItem): number {
        return progressPercent(item.claimedQuantity, item.neededQuantity);
    }

    protected labels(item: PublicItem): string {
        return item.categoryIds
            .map((id) => this.categoryNames().get(id))
            .filter((name): name is string => Boolean(name))
            .join(' · ');
    }

    protected async remove(item: PublicItem): Promise<void> {
        if (this.armedDelete() !== item.id) {
            this.armedDelete.set(item.id);
            return;
        }

        this.deleting.set(item.id);
        try {
            await this.api.deleteItem(item.id);
            this.toast.show(`${item.name} removido da lista.`, 'info');
        } catch (error) {
            this.toast.show(
                error instanceof Error ? error.message : 'Não foi possível remover o presente.',
                'error',
            );
        } finally {
            this.deleting.set(null);
            this.armedDelete.set(null);
        }
    }

    protected cancelArm(): void {
        this.armedDelete.set(null);
    }
}
