import { formatDate } from '@angular/common';
import type { PurchaseStatus } from '@shared/types';

const brlFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

export function brl(cents: number): string {
    return brlFormatter.format((cents ?? 0) / 100);
}

export function brlCompact(cents: number): string {
    return `R$ ${numberFormatter.format(Math.round((cents ?? 0) / 100))}`;
}

export function parseReais(value: string): number {
    const digits = value.replace(/\D/g, '');
    if (!digits) return 0;
    return Number(digits);
}

export function formatCentsInput(cents: number): string {
    return brl(cents).replace(/\s/g, ' ');
}

export function formatEventDate(value: string | undefined): string {
    if (!value) return '';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
    if (Number.isNaN(dateOnly.getTime())) return value;

    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(dateOnly);
}

export function formatShortDate(value: string | undefined): string {
    if (!value) return '';
    return formatDate(value, 'dd/MM/yyyy', 'pt-BR', 'America/Sao_Paulo');
}

export function formatDateTime(value: string | undefined): string {
    if (!value) return '';
    return formatDate(value, "dd/MM 'às' HH:mm", 'pt-BR', 'America/Sao_Paulo');
}

export function progressPercent(claimed: number, needed: number): number {
    if (!needed) return 0;
    return Math.min(100, Math.round((claimed / needed) * 100));
}

export function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
}

export function statusLabel(status: PurchaseStatus): string {
    switch (status) {
        case 'pending':
            return 'Aguardando PIX';
        case 'awaiting_confirmation':
            return 'Aguardando confirmação';
        case 'confirmed':
            return 'Pagamento confirmado';
        case 'cancelled':
            return 'Cancelado';
        case 'expired':
            return 'Expirado';
    }
}

export function statusTone(
    status: PurchaseStatus,
): 'accent' | 'success' | 'warning' | 'danger' | 'neutral' {
    switch (status) {
        case 'pending':
            return 'warning';
        case 'awaiting_confirmation':
            return 'accent';
        case 'confirmed':
            return 'success';
        case 'cancelled':
        case 'expired':
            return 'danger';
        default:
            return 'neutral';
    }
}
