import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import type { Category } from '@shared/types';
import { toApiFailure } from '../../../core/api';
import { AdminApi } from '../../../core/admin-api';
import { Toast } from '../../../core/toast';

const PALETTE = ['#c2703d', '#4d7c6f', '#7c5b9e', '#b5536b', '#b98a33', '#3f6f8f'];

@Component({
    selector: 'app-admin-categories-page',
    standalone: false,
    templateUrl: './categories-page.html',
    styleUrl: './categories-page.scss',
})
export class AdminCategoriesPage {
    private readonly api = inject(AdminApi);
    private readonly toast = inject(Toast);
    private readonly formBuilder = inject(FormBuilder);

    protected readonly palette = PALETTE;

    protected readonly wishlist = this.api.wishlist;
    protected readonly categories = computed(() => this.wishlist()?.categories ?? []);

    protected readonly editingId = signal<string | null>(null);
    protected readonly saving = signal(false);
    protected readonly deleting = signal<string | null>(null);
    protected readonly armedDelete = signal<string | null>(null);

    protected readonly color = signal<string | undefined>(undefined);

    protected readonly form = this.formBuilder.nonNullable.group({
        name: ['', [Validators.required, Validators.maxLength(40)]],
    });

    protected readonly counts = computed(() => {
        const counts = new Map<string, number>();
        for (const item of this.wishlist()?.items ?? []) {
            for (const id of item.categoryIds) {
                counts.set(id, (counts.get(id) ?? 0) + 1);
            }
        }
        return counts;
    });

    constructor() {
        void this.api.refresh().catch(() => {
            this.toast.show('Não foi possível carregar as categorias.', 'error');
        });
    }

    protected count(category: Category): number {
        return this.counts().get(category.id) ?? 0;
    }

    protected isEditing(category: Category): boolean {
        return this.editingId() === category.id;
    }

    protected startCreate(): void {
        this.editingId.set(null);
        this.form.reset({ name: '' });
        this.color.set(undefined);
        this.form.controls.name.markAsUntouched();
    }

    protected startEdit(category: Category): void {
        this.armedDelete.set(null);
        this.editingId.set(category.id);
        this.form.reset({ name: category.name });
        this.color.set(category.color);
    }

    protected cancelEdit(): void {
        this.editingId.set(null);
        this.form.reset({ name: '' });
        this.color.set(undefined);
    }

    protected chooseColor(color: string): void {
        this.color.update((current) => (current === color ? undefined : color));
    }

    protected async submit(): Promise<void> {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const name = this.form.controls.name.value.trim();
        if (!name) {
            this.form.markAllAsTouched();
            return;
        }

        const payload = { name, color: this.color() };
        this.saving.set(true);

        try {
            const editingId = this.editingId();
            if (editingId) {
                await this.api.updateCategory(editingId, payload);
                this.toast.show('Categoria atualizada.');
            } else {
                await this.api.createCategory(payload);
                this.toast.show('Categoria criada.');
            }

            this.cancelEdit();
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.saving.set(false);
        }
    }

    protected async remove(category: Category): Promise<void> {
        if (this.armedDelete() !== category.id) {
            this.armedDelete.set(category.id);
            return;
        }

        this.deleting.set(category.id);
        try {
            await this.api.deleteCategory(category.id);
            this.toast.show(`Categoria "${category.name}" removida.`, 'info');
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.deleting.set(null);
            this.armedDelete.set(null);
        }
    }
}
