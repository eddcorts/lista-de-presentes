export type Cents = number;

export type PixKeyType = 'random' | 'email' | 'cpf' | 'cnpj' | 'phone';

export interface PixSettings {
    key: string;
    keyType: PixKeyType;
    merchantName: string;
    merchantCity: string;
}

export interface DonationSettings {
    enabled: boolean;
    title: string;
    description?: string;
    minCents: number;
    suggestedCents: number[];
}

export interface WishlistMeta {
    title: string;
    subtitle?: string;
    description?: string;
    coverImageUrl?: string;
    ownerName: string;
    ownerImageUrl?: string;
    eventDate: string;
    thankYouMessage?: string;
    pix: PixSettings;
    donation: DonationSettings;
    updatedAt: string;
}

export interface Category {
    id: string;
    name: string;
    color?: string;
    createdAt: string;
}

export type PriceMode = 'unit' | 'share';
export type ItemStatus = 'active' | 'archived';

export interface Item {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    neededQuantity: number;
    unitPriceCents: number;
    priceMode: PriceMode;
    categoryIds: string[];
    externalUrl?: string;
    status: ItemStatus;
    createdAt: string;
    updatedAt: string;
}

export interface PublicItem extends Item {
    claimedQuantity: number;
    remaining: number;
    soldOut: boolean;
}

export interface PublicWishlist {
    meta: WishlistMeta;
    categories: Category[];
    items: PublicItem[];
    generatedAt: string;
}

export type PurchaseStatus =
    | 'pending'
    | 'awaiting_confirmation'
    | 'confirmed'
    | 'cancelled'
    | 'expired';

export interface PurchaseItemLine {
    kind: 'item';
    itemId: string;
    name: string;
    imageUrl?: string;
    unitPriceCents: number;
    priceMode: PriceMode;
    quantity: number;
}

export interface PurchaseDonationLine {
    kind: 'donation';
    label: string;
    amountCents: number;
}

export type PurchaseLine = PurchaseItemLine | PurchaseDonationLine;

export interface Purchase {
    id: string;
    token: string;
    buyerName: string;
    buyerEmail: string;
    giftMessage?: string;
    proofPathname?: string;
    lines: PurchaseLine[];
    itemsTotalCents: number;
    donationCents: number;
    totalCents: number;
    pixTxid: string;
    status: PurchaseStatus;
    createdAt: string;
    claimedAt?: string;
    confirmedAt?: string;
    expiresAt: string;
    adminNotes?: string;
}

export type PublicPurchase = Omit<
    Purchase,
    'token' | 'buyerEmail' | 'adminNotes' | 'proofPathname'
> & {
    hasProof: boolean;
};

export interface CheckoutItemInput {
    itemId: string;
    quantity: number;
}

export interface CheckoutRequest {
    checkoutId: string;
    buyerName: string;
    buyerEmail: string;
    giftMessage?: string;
    items: CheckoutItemInput[];
    donationCents?: number;
}

export type ConflictCode =
    | 'sold_out'
    | 'insufficient_stock'
    | 'unavailable'
    | 'invalid_donation'
    | 'empty_cart'
    | 'expired';

export interface CheckoutConflict {
    itemId?: string;
    code: ConflictCode;
    message: string;
    remaining?: number;
}

export interface CheckoutResponse {
    purchase: Purchase;
    pixPayload: string;
    pixQrDataUrl: string;
}

export interface PixResponse {
    payload: string;
    txid: string;
    amountCents: number;
    qrDataUrl: string;
}

export interface AdminTotals {
    purchases: number;
    pending: number;
    awaitingConfirmation: number;
    confirmed: number;
    itemsCents: number;
    donationCents: number;
    totalCents: number;
}

export interface AdminWishlist {
    meta: WishlistMeta;
    categories: Category[];
    items: PublicItem[];
    totals: AdminTotals;
}
