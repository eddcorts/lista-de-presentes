import { describe, expect, it } from 'vitest';
import {
    alphanumeric,
    buildPixPayload,
    buildTxid,
    crc16,
    formatPixAmount,
    merchantText,
    stripAccents,
} from '@shared/pix';

describe('pix helpers', () => {
    it('strips accents and keeps only allowed characters', () => {
        expect(stripAccents('Coração')).toBe('Coracao');
        expect(alphanumeric('Pix da Ana-Clara!')).toBe('PIXDAANACLARA');
    });

    it('normalizes merchant text and applies fallbacks', () => {
        expect(merchantText('Ana Clara', 25, 'RECEBEDOR')).toBe('ANA CLARA');
        expect(merchantText('  São   Paulo  ', 15, 'BRASIL')).toBe('SAO PAULO');
        expect(merchantText('***', 15, 'BRASIL')).toBe('BRASIL');
    });

    it('formats the amount as a two-decimal string', () => {
        expect(formatPixAmount(5)).toBe('0.05');
        expect(formatPixAmount(5990)).toBe('59.90');
        expect(() => formatPixAmount(0)).toThrow();
        expect(() => formatPixAmount(-100)).toThrow();
        expect(() => formatPixAmount(12.5)).toThrow();
    });

    it('builds a short, alphanumeric txid with the item names', () => {
        const txid = buildTxid('dee0800e', ['A cidade e as serras', 'Air fryer 5L'], false);
        expect(txid).toMatch(/^[A-Z0-9]{1,25}$/);
        expect(txid.startsWith('DEE080')).toBe(true);
        expect(txid).toContain('ACIDADE');
        expect(txid.length).toBeLessThanOrEqual(25);

        const donation = buildTxid('dee0800e', [], true);
        expect(donation.endsWith('DOACAO')).toBe(true);
    });

    it('computes the CRC-16/CCITT-FALSE check value', () => {
        expect(crc16('123456789')).toBe('29B1');
        expect(crc16('')).toBe('FFFF');
    });

    it('builds a valid BR Code payload with a matching CRC', () => {
        const payload = buildPixPayload({
            key: 'ana.clara@exemplo.com',
            merchantName: 'Ana Clara',
            merchantCity: 'Sao Paulo',
            amountCents: 10990,
            txid: 'DEE080ACIDADE',
        });

        expect(payload.startsWith('000201')).toBe(true);
        expect(payload).toContain('br.gov.bcb.pix');
        expect(payload).toContain('ana.clara@exemplo.com');
        expect(payload).toContain('5406109.90');
        expect(payload).toContain('5303986');
        expect(payload).toContain('DEE080ACIDADE');
        expect(payload.slice(-8, -4)).toBe('6304');

        const crc = payload.slice(-4);
        expect(crc).toBe(crc16(payload.slice(0, -4)));
    });

    it('rejects an empty PIX key', () => {
        expect(() =>
            buildPixPayload({
                key: '   ',
                merchantName: 'Ana',
                merchantCity: 'Sao Paulo',
                amountCents: 1000,
                txid: 'TESTE',
            }),
        ).toThrow();
    });
});
