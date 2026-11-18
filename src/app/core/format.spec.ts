import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { describe, expect, it } from 'vitest';
import {
    brl,
    formatDateTime,
    formatEventDate,
    initials,
    parseReais,
    progressPercent,
    statusLabel,
    statusTone,
} from './format';

registerLocaleData(localePt);

describe('format helpers', () => {
    it('formats cents as Brazilian reais', () => {
        expect(brl(0)).toContain('0,00');
        expect(brl(5990)).toContain('59,90');
        expect(brl(129900)).toContain('1.299,00');
    });

    it('parses digits from a masked money value', () => {
        expect(parseReais('R$ 1.234,56')).toBe(123456);
        expect(parseReais('')).toBe(0);
    });

    it('formats a date-only value without timezone drift', () => {
        expect(formatEventDate('2026-12-05')).toBe('05 de dezembro de 2026');
    });

    it('formats event timestamps in São Paulo time', () => {
        expect(formatDateTime('2026-11-16T13:09:00.000Z')).toBe('16/11 às 10:09');
    });

    it('caps progress at 100% and handles a zero target', () => {
        expect(progressPercent(1, 2)).toBe(50);
        expect(progressPercent(3, 2)).toBe(100);
        expect(progressPercent(0, 0)).toBe(0);
    });

    it('builds initials from the first two words', () => {
        expect(initials('Ana Clara')).toBe('AC');
        expect(initials('  visitante   teste ')).toBe('VT');
        expect(initials('Ana')).toBe('A');
    });

    it('maps statuses to labels and tones', () => {
        expect(statusLabel('pending')).toBe('Aguardando PIX');
        expect(statusLabel('awaiting_confirmation')).toBe('Aguardando confirmação');
        expect(statusLabel('confirmed')).toBe('Pagamento confirmado');
        expect(statusTone('confirmed')).toBe('success');
        expect(statusTone('cancelled')).toBe('danger');
    });
});
