export interface PixPayloadInput {
    key: string;
    merchantName: string;
    merchantCity: string;
    amountCents: number;
    txid: string;
}

export function stripAccents(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function alphanumeric(value: string): string {
    return stripAccents(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

export function merchantText(value: string, maxLength: number, fallback: string): string {
    const text = stripAccents(value)
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);

    return text || fallback;
}

/**
 * The only receiver-visible free text in a static PIX BR Code is the txid
 * (field 62-05, max 25 alphanumeric characters). We prefix a short order
 * reference so the host can match the bank statement.
 */
export function buildTxid(ref: string, itemNames: string[], donation: boolean): string {
    const base = alphanumeric(ref).slice(0, 6).padEnd(6, '0');
    const names = itemNames.map((name) => alphanumeric(name).slice(0, 8)).join('');
    const suffix = donation ? 'DOACAO' : '';
    const txid = (base + names + suffix).slice(0, 25);
    return txid || 'PIX';
}

export function formatPixAmount(amountCents: number): string {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error('O valor do PIX deve ser maior que zero.');
    }

    const value = (amountCents / 100).toFixed(2);
    if (value.length > 13) {
        throw new Error('O valor excede o limite do campo PIX.');
    }

    return value;
}

export function crc16(payload: string): string {
    let crc = 0xffff;

    for (let i = 0; i < payload.length; i += 1) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }

    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function field(id: string, value: string): string {
    if (value.length > 99) {
        throw new Error(`Campo PIX ${id} excede 99 caracteres.`);
    }

    return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

export function buildPixPayload(input: PixPayloadInput): string {
    const key = input.key.trim();
    if (!key) {
        throw new Error('Chave PIX não configurada.');
    }

    const merchantAccount =
        field('00', 'br.gov.bcb.pix') + field('01', key.slice(0, 77));

    const payload = [
        field('00', '01'),
        field('26', merchantAccount),
        field('52', '0000'),
        field('53', '986'),
        field('54', formatPixAmount(input.amountCents)),
        field('58', 'BR'),
        field('59', merchantText(input.merchantName, 25, 'RECEBEDOR')),
        field('60', merchantText(input.merchantCity, 15, 'BRASIL')),
        field('62', field('05', alphanumeric(input.txid).slice(0, 25) || 'PIX')),
    ].join('');

    return `${payload}6304${crc16(`${payload}6304`)}`;
}
