import { ItemId } from '../items/item-catalog';

// Economia e catálogo das duas lojas: DADOS. Nenhum preço aparece dentro do
// painel nem dentro da transação.
//
// Interpretação do briefing:
//   "1 pack de moedas = 50"  -> 1 moeda vale 1, e um slot cheio de moeda é 50.
//   "1 pack de maçãs = 10"   -> um slot cheio de maçã é 10.
//
// A maçã é deliberadamente barata: a venda existe para dar um destino ao drop
// de maçã, não para ser a fonte principal de moeda (que é matar inimigo).
// APPLE_LOT/APPLE_LOT_PRICE estão isolados justamente para virar 1 moeda por
// maçã assim que o balanceamento real for testado — ver Decisão de design #3
// do plano.
export const ECONOMY = {
    // Preço de uma poção em moedas. ~1 morte comum de sorte, ou 2 na média.
    POTION_PRICE: 15,

    // Lote de venda da maçã: 5 maçãs -> 1 moeda. Vender em lote evita moeda
    // fracionada e evita obrigar o jogador a encher um slot antes de vender.
    APPLE_LOT: 5,
    APPLE_LOT_PRICE: 1
} as const;

export type ShopId = 'rabbit-shop' | 'capybara-shop';

export type ShopEntry =
    // O NPC VENDE ao jogador: ele paga `price` moedas e recebe `quantity` item.
    | { mode: 'buy'; item: ItemId; price: number; quantity: number }
    // O NPC COMPRA do jogador: ele entrega `lot` itens e recebe `price` moedas.
    | { mode: 'sell'; item: ItemId; lot: number; price: number };

export type ShopDef = {
    id: ShopId;
    // Nome do balcão, mostrado no cabeçalho do painel.
    name: string;
    greeting: string;
    entries: ShopEntry[];
};

export const SHOPS: Record<ShopId, ShopDef> = {
    // Coelho boticário: VENDE poções.
    'rabbit-shop': {
        id: 'rabbit-shop',
        name: 'COELHO BOTICÁRIO',
        greeting: 'Poção fresquinha, saída da panela!',
        entries: [
            { mode: 'buy', item: 'potion', price: ECONOMY.POTION_PRICE, quantity: 1 }
        ]
    },

    // Capivara quitandeira: COMPRA maçãs.
    'capybara-shop': {
        id: 'capybara-shop',
        name: 'CAPIVARA QUITANDEIRA',
        greeting: 'Traz maçã que eu troco por moeda.',
        entries: [
            { mode: 'sell', item: 'apple', lot: ECONOMY.APPLE_LOT, price: ECONOMY.APPLE_LOT_PRICE }
        ]
    }
};

export function isShopId(value: unknown): value is ShopId {
    return value === 'rabbit-shop' || value === 'capybara-shop';
}
