import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { PixResponse, PublicPurchase, PurchaseLine } from '@shared/types';
import { toApiFailure } from '../../core/api';
import { brl, formatDateTime, statusLabel, statusTone } from '../../core/format';
import { OrdersStore } from '../../core/orders-store';
import { Toast } from '../../core/toast';
import { WishlistApi } from '../../core/wishlist-api';
import { WishlistStore } from '../../core/wishlist-store';

const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_PROOF_BYTES = 8 * 1024 * 1024;

@Component({
    selector: 'app-order-page',
    standalone: false,
    templateUrl: './order-page.html',
    styleUrl: './order-page.scss',
})
export class OrderPage {
    private readonly route = inject(ActivatedRoute);
    private readonly api = inject(WishlistApi);
    private readonly toast = inject(Toast);
    private readonly orders = inject(OrdersStore);

    protected readonly store = inject(WishlistStore);

    protected readonly token = this.route.snapshot.paramMap.get('token') ?? '';
    protected readonly purchase = signal<PublicPurchase | null>(null);
    protected readonly pix = signal<PixResponse | null>(null);
    protected readonly loading = signal(true);
    protected readonly refreshing = signal(false);
    protected readonly error = signal<string | null>(null);
    protected readonly copied = signal(false);
    protected readonly confirming = signal(false);
    protected readonly cancelling = signal(false);
    protected readonly cancelArmed = signal(false);
    protected readonly acknowledged = signal(false);
    protected readonly giftMessage = signal('');
    protected readonly selectedFile = signal<File | null>(null);
    protected readonly fileError = signal<string | null>(null);

    protected readonly status = computed(() => this.purchase()?.status ?? 'pending');
    protected readonly isPending = computed(() => this.status() === 'pending');
    protected readonly isAwaiting = computed(() => this.status() === 'awaiting_confirmation');
    protected readonly isConfirmed = computed(() => this.status() === 'confirmed');
    protected readonly isClosed = computed(
        () => this.status() === 'cancelled' || this.status() === 'expired',
    );

    protected readonly tone = computed(() => statusTone(this.status()));
    protected readonly label = computed(() => statusLabel(this.status()));
    protected readonly ownerName = computed(
        () => this.store.wishlist()?.meta.ownerName ?? 'e aniversariante',
    );
    protected readonly thankYou = computed(
        () => this.store.wishlist()?.meta.thankYouMessage ?? 'Obrigada pelo carinho!',
    );
    protected readonly expiresLabel = computed(() =>
        formatDateTime(this.purchase()?.expiresAt),
    );
    protected readonly createdLabel = computed(() =>
        formatDateTime(this.purchase()?.createdAt),
    );
    protected readonly shortId = computed(() =>
        (this.purchase()?.id ?? '').slice(0, 8).toUpperCase(),
    );

    constructor() {
        void this.store.load();
        void this.load(true);
    }

    protected lineTotal(line: PurchaseLine): number {
        return line.kind === 'donation' ? line.amountCents : line.unitPriceCents * line.quantity;
    }

    protected lineDetail(line: PurchaseLine): string {
        if (line.kind === 'donation') return 'Contribuição';
        return `${line.quantity} × ${brl(line.unitPriceCents)}`;
    }

    protected async load(initial = false): Promise<void> {
        if (!this.token) {
            this.error.set('Pedido não encontrado.');
            this.loading.set(false);
            return;
        }

        if (initial) this.loading.set(true);
        else this.refreshing.set(true);

        try {
            const purchase = await this.api.getPurchase(this.token);
            this.purchase.set(purchase);
            this.error.set(null);

            this.orders.remember({
                token: this.token,
                createdAt: purchase.createdAt,
                totalCents: purchase.totalCents,
                label:
                    purchase.lines.find((line) => line.kind === 'item')?.name ?? 'Contribuição',
            });

            if (purchase.status === 'pending' || purchase.status === 'awaiting_confirmation') {
                try {
                    this.pix.set(await this.api.getPix(this.token));
                } catch {
                    this.pix.set(null);
                }
            }
        } catch (error) {
            this.error.set(toApiFailure(error).message);
        } finally {
            this.loading.set(false);
            this.refreshing.set(false);
        }
    }

    protected async copyPix(): Promise<void> {
        const payload = this.pix()?.payload;
        if (!payload) return;

        try {
            await navigator.clipboard.writeText(payload);
            this.copied.set(true);
            this.toast.show('Código PIX copiado.');
            setTimeout(() => this.copied.set(false), 3000);
        } catch {
            this.toast.show('Não foi possível copiar. Selecione o código manualmente.', 'error');
        }
    }

    protected onMessageInput(event: Event): void {
        this.giftMessage.set((event.target as HTMLTextAreaElement).value);
    }

    protected onFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] ?? null;
        this.fileError.set(null);

        if (!file) {
            this.selectedFile.set(null);
            return;
        }

        if (!PROOF_TYPES.includes(file.type)) {
            this.fileError.set('Envie um PDF, JPG, PNG, WEBP ou AVIF.');
            this.selectedFile.set(null);
            input.value = '';
            return;
        }

        if (file.size > MAX_PROOF_BYTES) {
            this.fileError.set('O arquivo deve ter no máximo 8 MB.');
            this.selectedFile.set(null);
            input.value = '';
            return;
        }

        this.selectedFile.set(file);
    }

    protected fileSizeLabel(file: File): string {
        return file.size > 1024 * 1024
            ? `${(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
            : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    }

    protected async confirmPayment(): Promise<void> {
        const purchase = this.purchase();
        if (!purchase) return;

        if (!this.acknowledged()) {
            this.toast.show('Marque que você já fez o PIX para continuar.', 'error');
            return;
        }

        this.confirming.set(true);

        try {
            const updated = await this.api.confirm(this.token, {
                giftMessage: this.giftMessage().trim() || undefined,
                proof: this.selectedFile(),
            });

            this.purchase.set(updated);
            this.acknowledged.set(false);
            this.selectedFile.set(null);
            this.toast.show('Pagamento informado. Agora é só aguardar a confirmação.');
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.confirming.set(false);
        }
    }

    protected async cancelOrder(): Promise<void> {
        if (!this.cancelArmed()) {
            this.cancelArmed.set(true);
            return;
        }

        this.cancelling.set(true);
        try {
            const updated = await this.api.cancel(this.token);
            this.purchase.set(updated);
            this.pix.set(null);
            this.toast.show('Pedido cancelado. Os itens voltaram para a lista.', 'info');
        } catch (error) {
            this.toast.show(toApiFailure(error).message, 'error');
        } finally {
            this.cancelling.set(false);
            this.cancelArmed.set(false);
        }
    }
}
