import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
    FormBuilder,
    Validators,
} from '@angular/forms';
import { toApiFailure } from '../../../core/api';
import { AdminApi, type MetaPayload } from '../../../core/admin-api';
import { brl } from '../../../core/format';
import { Toast } from '../../../core/toast';

const PIX_TYPES: { value: MetaPayload['pix']['keyType']; label: string; hint: string }[] = [
    { value: 'email', label: 'E-mail', hint: 'ana@exemplo.com' },
    { value: 'phone', label: 'Telefone', hint: '+5511999998888' },
    { value: 'cpf', label: 'CPF', hint: '12345678900' },
    { value: 'cnpj', label: 'CNPJ', hint: '12345678000199' },
    { value: 'random', label: 'Chave aleatória', hint: 'Cole a chave completa' },
];

@Component({
    selector: 'app-admin-settings-page',
    standalone: false,
    templateUrl: './settings-page.html',
    styleUrl: './settings-page.scss',
})
export class AdminSettingsPage {
    private readonly api = inject(AdminApi);
    private readonly toast = inject(Toast);
    private readonly formBuilder = inject(FormBuilder);

    protected readonly pixTypes = PIX_TYPES;

    protected readonly saving = signal(false);
    protected readonly uploading = signal<'cover' | 'owner' | null>(null);
    protected readonly coverImageUrl = signal<string | undefined>(undefined);
    protected readonly ownerImageUrl = signal<string | undefined>(undefined);
    protected readonly donationEnabled = signal(true);

    protected readonly wishlist = this.api.wishlist;
    protected readonly ownerName = computed(() => this.wishlist()?.meta.ownerName ?? 'lista');

    protected readonly form = this.formBuilder.nonNullable.group({
        title: ['', [Validators.required, Validators.maxLength(80)]],
        subtitle: ['', [Validators.maxLength(120)]],
        description: ['', [Validators.maxLength(1200)]],
        ownerName: ['', [Validators.required, Validators.maxLength(80)]],
        eventDate: ['', [Validators.required]],
        thankYouMessage: ['', [Validators.maxLength(600)]],
        pixKey: ['', [Validators.required, Validators.maxLength(77)]],
        pixKeyType: ['email' as MetaPayload['pix']['keyType'], [Validators.required]],
        pixMerchantName: ['', [Validators.required, Validators.maxLength(25)]],
        pixMerchantCity: ['', [Validators.required, Validators.maxLength(15)]],
        donationTitle: ['', [Validators.required, Validators.maxLength(60)]],
        donationDescription: ['', [Validators.maxLength(280)]],
        donationMinCents: [500, [Validators.required, Validators.min(100)]],
        suggested: this.formBuilder.nonNullable.array([2500, 5000, 10000, 25000]),
    });

    constructor() {
        void this.load();
    }

    protected hintForType(): string {
        return this.pixTypes.find((type) => type.value === this.form.controls.pixKeyType.value)?.hint ?? '';
    }

    protected addSuggested(): void {
        if (this.form.controls.suggested.length >= 6) return;
        this.form.controls.suggested.push(this.formBuilder.nonNullable.control(2500));
    }

    protected removeSuggested(index: number): void {
        if (this.form.controls.suggested.length <= 1) {
            this.toast.show('Mantenha ao menos um valor sugerido.', 'error');
            return;
        }
        this.form.controls.suggested.removeAt(index);
    }

    protected setSuggested(index: number, cents: number): void {
        this.form.controls.suggested.at(index)?.setValue(cents);
    }

    protected suggestionsPreview(): string {
        return this.form.controls.suggested.controls
            .map((control) => brl(control.value as number))
            .join(' · ');
    }

    protected async load(): Promise<void> {
        try {
            const wishlist = await this.api.refresh();
            const meta = wishlist.meta;

            this.coverImageUrl.set(meta.coverImageUrl);
            this.ownerImageUrl.set(meta.ownerImageUrl);
            this.donationEnabled.set(meta.donation.enabled);

            this.form.patchValue({
                title: meta.title,
                subtitle: meta.subtitle ?? '',
                description: meta.description ?? '',
                ownerName: meta.ownerName,
                eventDate: meta.eventDate,
                thankYouMessage: meta.thankYouMessage ?? '',
                pixKey: meta.pix.key,
                pixKeyType: meta.pix.keyType,
                pixMerchantName: meta.pix.merchantName,
                pixMerchantCity: meta.pix.merchantCity,
                donationTitle: meta.donation.title,
                donationDescription: meta.donation.description ?? '',
                donationMinCents: meta.donation.minCents,
            });

            const suggested = this.form.controls.suggested;
            suggested.clear();
            for (const cents of meta.donation.suggestedCents) {
                suggested.push(this.formBuilder.nonNullable.control(cents));
            }
            if (suggested.length === 0) {
                suggested.push(this.formBuilder.nonNullable.control(2500));
            }
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        }
    }

    protected async upload(kind: 'cover' | 'owner', event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            this.toast.show('A imagem deve ter no máximo 5 MB.', 'error');
            input.value = '';
            return;
        }

        this.uploading.set(kind);
        try {
            const stored = await this.api.upload(kind, file);
            if (kind === 'cover') this.coverImageUrl.set(stored.url);
            else this.ownerImageUrl.set(stored.url);
            this.toast.show('Imagem enviada. Salve para publicar.');
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.uploading.set(null);
            input.value = '';
        }
    }

    protected removeImage(kind: 'cover' | 'owner'): void {
        if (kind === 'cover') this.coverImageUrl.set(undefined);
        else this.ownerImageUrl.set(undefined);
    }

    protected async submit(): Promise<void> {
        this.form.markAllAsTouched();

        if (this.form.invalid) {
            this.toast.show('Confira os campos destacados.', 'error');
            return;
        }

        const value = this.form.getRawValue();
        const suggestedCents = this.form.controls.suggested.controls
            .map((control) => Math.round(control.value as number))
            .filter((cents) => cents > 0);

        if (suggestedCents.length === 0) {
            this.toast.show('Informe ao menos um valor sugerido.', 'error');
            return;
        }

        const payload: MetaPayload = {
            title: value.title.trim(),
            subtitle: value.subtitle.trim() || undefined,
            description: value.description.trim() || undefined,
            coverImageUrl: this.coverImageUrl(),
            ownerName: value.ownerName.trim(),
            ownerImageUrl: this.ownerImageUrl(),
            eventDate: value.eventDate,
            thankYouMessage: value.thankYouMessage.trim() || undefined,
            pix: {
                key: value.pixKey.trim(),
                keyType: value.pixKeyType,
                merchantName: value.pixMerchantName.trim(),
                merchantCity: value.pixMerchantCity.trim(),
            },
            donation: {
                enabled: this.donationEnabled(),
                title: value.donationTitle.trim(),
                description: value.donationDescription.trim() || undefined,
                minCents: Math.round(value.donationMinCents),
                suggestedCents: [...new Set(suggestedCents)].sort((a, b) => a - b),
            },
        };

        this.saving.set(true);
        try {
            await this.api.saveMeta(payload);
            this.toast.show('Configurações salvas.');
        } catch (error) {
            const failure = toApiFailure(error);
            const details = Array.isArray(failure.details)
                ? failure.details
                    .map((entry) => (entry as { message?: string }).message)
                    .filter(Boolean)
                    .join(' ')
                : '';
            this.toast.show(details || failure.message, 'error');
        } finally {
            this.saving.set(false);
        }
    }
}
