import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    computed,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    AbstractControl,
    FormBuilder,
    ValidationErrors,
    Validators,
} from '@angular/forms';
import type { Category, Item, PriceMode } from '@shared/types';
import { toApiFailure } from '../../../../core/api';
import { AdminApi, type ItemPayload } from '../../../../core/admin-api';
import { Toast } from '../../../../core/toast';

function positive(control: AbstractControl): ValidationErrors | null {
    return Number(control.value) > 0 ? null : { positive: true };
}

@Component({
    selector: 'app-item-dialog',
    standalone: false,
    templateUrl: './item-dialog.html',
    styleUrl: './item-dialog.scss',
})
export class ItemDialog {
    private readonly api = inject(AdminApi);
    private readonly toast = inject(Toast);
    private readonly formBuilder = inject(FormBuilder);

    readonly categories = input<Category[]>([]);
    readonly saved = output<void>();

    protected readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialogRef');

    protected readonly editing = signal(false);
    protected readonly itemId = signal<string | null>(null);
    protected readonly priceMode = signal<PriceMode>('unit');
    protected readonly imageUrl = signal<string | undefined>(undefined);
    protected readonly uploading = signal(false);
    protected readonly saving = signal(false);
    protected readonly selectedCategories = signal<string[]>([]);
    protected readonly priceCents = signal(0);
    protected readonly needed = signal(1);
    protected readonly active = signal(true);

    protected readonly totalPreview = computed(() => this.priceCents() * this.needed());

    protected readonly form = this.formBuilder.nonNullable.group({
        name: ['', [Validators.required, Validators.maxLength(80)]],
        description: ['', [Validators.maxLength(600)]],
        neededQuantity: [1, [Validators.required, Validators.min(1), Validators.max(999)]],
        unitPriceCents: [0, [positive]],
        priceMode: ['unit' as PriceMode],
        externalUrl: ['', [Validators.maxLength(600)]],
        status: ['active' as 'active' | 'archived'],
    });

    constructor() {
        this.form.controls.unitPriceCents.valueChanges
            .pipe(takeUntilDestroyed())
            .subscribe((value) => this.priceCents.set(value ?? 0));

        this.form.controls.neededQuantity.valueChanges
            .pipe(takeUntilDestroyed())
            .subscribe((value) => this.needed.set(value ?? 1));

        this.form.controls.priceMode.valueChanges
            .pipe(takeUntilDestroyed())
            .subscribe((value) => this.priceMode.set(value));
    }

    open(item: Item | null): void {
        this.editing.set(Boolean(item));
        this.itemId.set(item?.id ?? null);
        this.imageUrl.set(item?.imageUrl);
        this.selectedCategories.set(item?.categoryIds ?? []);
        this.priceMode.set(item?.priceMode ?? 'unit');
        this.active.set((item?.status ?? 'active') === 'active');

        this.form.reset({
            name: item?.name ?? '',
            description: item?.description ?? '',
            neededQuantity: item?.neededQuantity ?? 1,
            unitPriceCents: item?.unitPriceCents ?? 0,
            priceMode: item?.priceMode ?? 'unit',
            externalUrl: item?.externalUrl ?? '',
            status: item?.status ?? 'active',
        });

        this.priceCents.set(item?.unitPriceCents ?? 0);
        this.needed.set(item?.neededQuantity ?? 1);
        this.dialogRef().nativeElement.showModal();
    }

    protected close(): void {
        this.dialogRef().nativeElement.close();
    }

    protected isSelected(id: string): boolean {
        return this.selectedCategories().includes(id);
    }

    protected toggleCategory(id: string): void {
        this.selectedCategories.update((ids) =>
            ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id],
        );
    }

    protected async uploadImage(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            this.toast.show('A imagem deve ter no máximo 5 MB.', 'error');
            input.value = '';
            return;
        }

        this.uploading.set(true);
        try {
            const stored = await this.api.upload('item', file);
            this.imageUrl.set(stored.url);
            this.toast.show('Imagem enviada.');
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.uploading.set(false);
            input.value = '';
        }
    }

    protected removeImage(): void {
        this.imageUrl.set(undefined);
    }

    protected async submit(): Promise<void> {
        if (this.form.invalid || this.priceCents() < 1) {
            this.form.markAllAsTouched();
            if (this.priceCents() < 1) {
                this.toast.show('Informe um preço maior que zero.', 'error');
            }
            return;
        }

        const value = this.form.getRawValue();
        const payload: ItemPayload = {
            name: value.name.trim(),
            description: value.description.trim() || undefined,
            imageUrl: this.imageUrl(),
            neededQuantity: value.neededQuantity,
            unitPriceCents: value.unitPriceCents,
            priceMode: value.priceMode,
            categoryIds: this.selectedCategories(),
            externalUrl: value.externalUrl.trim() || undefined,
            status: this.active() ? 'active' : 'archived',
        };

        this.saving.set(true);
        try {
            if (this.editing() && this.itemId()) {
                await this.api.updateItem(this.itemId()!, payload);
                this.toast.show('Presente atualizado.');
            } else {
                await this.api.createItem(payload);
                this.toast.show('Presente adicionado à lista.');
            }

            this.saved.emit();
            this.close();
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.saving.set(false);
        }
    }
}
