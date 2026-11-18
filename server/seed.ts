import type { Category, Item, PurchaseLine, WishlistMeta } from '../shared/types.js';

export interface SeedData {
    meta: WishlistMeta;
    categories: Category[];
    items: Item[];
}

const now = new Date().toISOString();

function item(partial: Omit<Item, 'createdAt' | 'updatedAt' | 'status'> & Partial<Item>): Item {
    return {
        status: 'active',
        createdAt: now,
        updatedAt: now,
        ...partial,
    };
}

export function createSeed(): SeedData {
    const categories: Category[] = [
        { id: 'cat-cozinha', name: 'Cozinha', color: '#c2703d', createdAt: now },
        { id: 'cat-casa', name: 'Casa', color: '#4d7c6f', createdAt: now },
        { id: 'cat-livros', name: 'Livros', color: '#7c5b9e', createdAt: now },
        { id: 'cat-experiencias', name: 'Experiências', color: '#b5536b', createdAt: now },
    ];

    const items: Item[] = [
        item({
            id: 'item-airfryer',
            name: 'Air fryer 5L',
            description: 'Aquela que promete batata frita crocante sem culpa. Preto fosco combina com tudo.',
            neededQuantity: 1,
            unitPriceCents: 49_990,
            priceMode: 'unit',
            categoryIds: ['cat-cozinha'],
        }),
        item({
            id: 'item-panelas',
            name: 'Jogo de panelas antiaderente',
            description: 'Conjunto com cinco peças e tampas de vidro, para aposentar as panelas riscadas.',
            neededQuantity: 1,
            unitPriceCents: 89_900,
            priceMode: 'unit',
            categoryIds: ['cat-cozinha'],
        }),
        item({
            id: 'item-tacas',
            name: 'Kit 6 taças de vinho',
            description: 'Cristal resistente para os brindes de domingo. Cada taça é uma cota.',
            neededQuantity: 6,
            unitPriceCents: 4_500,
            priceMode: 'share',
            categoryIds: ['cat-cozinha'],
        }),
        item({
            id: 'item-cafeteira',
            name: 'Cafeteira italiana 6 xícaras',
            description: 'Para o café da manhã ficar mais barulhento e cheiroso.',
            neededQuantity: 1,
            unitPriceCents: 12_990,
            priceMode: 'unit',
            categoryIds: ['cat-cozinha'],
        }),
        item({
            id: 'item-manta',
            name: 'Manta de sofá',
            description: 'Tecido macio, tom terroso, tamanho generoso para duas pessoas.',
            neededQuantity: 1,
            unitPriceCents: 18_900,
            priceMode: 'unit',
            categoryIds: ['cat-casa'],
        }),
        item({
            id: 'item-toalhas',
            name: 'Jogo de toalhas de banho',
            description: 'Duas toalhas grandes e felpudas. Uma unidade por cota.',
            neededQuantity: 2,
            unitPriceCents: 9_900,
            priceMode: 'share',
            categoryIds: ['cat-casa'],
        }),
        item({
            id: 'item-livro',
            name: 'A cidade e as serras',
            description: 'Eça de Queirós em edição de capa dura. Para a estante ficar mais bonita.',
            neededQuantity: 1,
            unitPriceCents: 5_990,
            priceMode: 'unit',
            categoryIds: ['cat-livros'],
        }),
        item({
            id: 'item-massagem',
            name: 'Vale massagem relaxante',
            description: 'Sessão de 60 minutos em uma casa de massagem parceira. Escolha a data depois.',
            neededQuantity: 1,
            unitPriceCents: 25_000,
            priceMode: 'unit',
            categoryIds: ['cat-experiencias'],
            externalUrl: 'https://example.com/vale-massagem',
        }),
    ];

    const meta: WishlistMeta = {
        title: 'Lista de presentes da Ana',
        subtitle: 'Trinta anos, muita comida e boa companhia',
        description:
            'Escolhi alguns presentes que vão deixar a casa mais gostosa. Fique à vontade para escolher uma cota, dividir um item com alguém ou apenas contribuir com a festa. Obrigada por fazer parte deste ano!',
        ownerName: 'Ana Clara',
        eventDate: '2026-12-05',
        thankYouMessage:
            'Recebi seu carinho! Assim que o pagamento aparecer no extrato, confirmo aqui na lista. Obrigada de coração.',
        pix: {
            key: 'ana.clara@exemplo.com',
            keyType: 'email',
            merchantName: 'Ana Clara',
            merchantCity: 'Sao Paulo',
        },
        donation: {
            enabled: true,
            title: 'Contribuir com a festa',
            description:
                'Prefere não escolher um presente? Qualquer valor ajuda com o buffet, as bebidas e a decoração.',
            minCents: 500,
            suggestedCents: [2_500, 5_000, 10_000, 25_000],
        },
        updatedAt: now,
    };

    return { meta, categories, items };
}

export function purchaseLineLabel(line: PurchaseLine): string {
    if (line.kind === 'donation') return line.label;
    return line.name;
}
