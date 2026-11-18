import { z } from 'zod';

const shortText = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
    shortText(max)
        .optional()
        .transform((value) => (value === '' ? undefined : value));

const mediaUrl = optionalText(600);

export const pixKeyTypeSchema = z.enum(['random', 'email', 'cpf', 'cnpj', 'phone']);

export const pixSchema = z.object({
    key: z.string().trim().min(1, 'Informe a chave PIX.').max(77),
    keyType: pixKeyTypeSchema,
    merchantName: z.string().trim().min(1, 'Informe o nome do recebedor.').max(25),
    merchantCity: z.string().trim().min(1, 'Informe a cidade do recebedor.').max(15),
});

export const donationSchema = z.object({
    enabled: z.boolean(),
    title: z.string().trim().min(1).max(60),
    description: optionalText(280),
    minCents: z.number().int().min(100).max(1_000_000),
    suggestedCents: z.array(z.number().int().min(100).max(10_000_000)).min(1).max(6),
});

export const metaSchema = z.object({
    title: z.string().trim().min(1, 'Informe o título da lista.').max(80),
    subtitle: optionalText(120),
    description: optionalText(1200),
    coverImageUrl: mediaUrl,
    ownerName: z.string().trim().min(1, 'Informe o nome do aniversariante.').max(80),
    ownerImageUrl: mediaUrl,
    eventDate: z.string().trim().min(1, 'Informe a data do evento.').max(40),
    thankYouMessage: optionalText(600),
    pix: pixSchema,
    donation: donationSchema,
});

export const categorySchema = z.object({
    name: z.string().trim().min(1, 'Informe o nome da categoria.').max(40),
    color: z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB.')
        .optional()
        .or(z.literal('').transform(() => undefined)),
});

export const itemSchema = z.object({
    name: z.string().trim().min(1, 'Informe o nome do presente.').max(80),
    description: optionalText(600),
    imageUrl: mediaUrl,
    neededQuantity: z.number().int().min(1).max(999),
    unitPriceCents: z.number().int().min(1).max(100_000_000),
    priceMode: z.enum(['unit', 'share']),
    categoryIds: z.array(z.string().min(1)).max(10).default([]),
    externalUrl: optionalText(600),
    status: z.enum(['active', 'archived']).default('active'),
});

export const checkoutSchema = z.object({
    checkoutId: z.uuid('Identificador de checkout inválido.'),
    buyerName: z.string().trim().min(2, 'Informe seu nome.').max(80),
    buyerEmail: z.email('Informe um e-mail válido.').max(160),
    giftMessage: optionalText(500),
    items: z
        .array(
            z.object({
                itemId: z.string().min(1),
                quantity: z.number().int().min(1).max(99),
            }),
        )
        .max(50)
        .default([]),
    donationCents: z.number().int().min(0).max(100_000_000).optional(),
});

export const loginSchema = z.object({
    password: z.string().min(1, 'Informe a senha.').max(200),
});

export const purchaseStatusSchema = z.object({
    status: z.enum(['pending', 'awaiting_confirmation', 'confirmed', 'cancelled', 'expired']),
});

export const adminNotesSchema = z.object({
    adminNotes: optionalText(1000),
});

export const uploadKindSchema = z.enum(['cover', 'owner', 'item', 'proof']);

export type MetaInput = z.infer<typeof metaSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type ItemInput = z.infer<typeof itemSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
