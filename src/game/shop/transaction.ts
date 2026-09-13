import { DifficultyModifiers } from '../config/difficulty';
import { CoinSystem } from '../items/CoinSystem';
import { Inventory } from '../items/Inventory';
import { ITEMS } from '../items/item-catalog';
import { ShopEntry } from './shop-config';

// Transação da loja: função PURA sobre o inventário, fora da UI. O painel só
// mostra o resultado — assim a regra de compra e venda pode ser lida (e
// testada) sem abrir uma cena.

export type TransactionResult =
    | { ok: true; message: string }
    | { ok: false; message: string; reason: 'no-funds' | 'no-items' | 'no-space' };

// Preço efetivo de uma linha, já com o multiplicador da dificuldade.
// Compra arredonda para CIMA e venda para BAIXO: em qualquer arredondamento,
// quem ganha a fração é a loja, nunca o jogador — o contrário abre a porta de
// comprar e revender no lucro.
export function effectivePrice(entry: ShopEntry, modifiers: DifficultyModifiers): number {
    if (entry.mode === 'buy') {
        return Math.max(1, Math.ceil(entry.price * modifiers.shopBuyPrice));
    }

    return Math.max(1, Math.floor(entry.price * modifiers.shopSellValue));
}

// Toda validação acontece ANTES de qualquer mutação.
export function executeTransaction(
    inventory: Inventory,
    coins: CoinSystem,
    entry: ShopEntry,
    modifiers: DifficultyModifiers
): TransactionResult {
    const price = effectivePrice(entry, modifiers);
    const itemName = ITEMS[entry.item].name;

    if (entry.mode === 'buy') {
        if (coins.current < price) {
            return { ok: false, reason: 'no-funds', message: `Moedas insuficientes (${price})` };
        }

        if (!inventory.hasSpaceFor(entry.item, entry.quantity)) {
            return { ok: false, reason: 'no-space', message: 'Inventário cheio' };
        }

        coins.remove(price);
        inventory.add(entry.item, entry.quantity);

        return { ok: true, message: `${itemName} comprada por ${price}` };
    }

    if (inventory.count(entry.item) < entry.lot) {
        return {
            ok: false,
            reason: 'no-items',
            message: `Você não tem ${entry.lot} ${itemName.toLowerCase()}`
        };
    }

    inventory.remove(entry.item, entry.lot);
    coins.add(price);

    return { ok: true, message: `${entry.lot} ${itemName.toLowerCase()} por ${price} moeda(s)` };
}
