import { DifficultyModifiers } from '../config/difficulty';
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

// Toda validação acontece ANTES de qualquer mutação. Inventory.remove é
// atômico, mas a sequência remove -> add não é: se o add falhasse depois do
// remove, o jogador perderia o item e não receberia nada.
export function executeTransaction(
    inventory: Inventory,
    entry: ShopEntry,
    modifiers: DifficultyModifiers
): TransactionResult {
    const price = effectivePrice(entry, modifiers);
    const itemName = ITEMS[entry.item].name;

    // A validação de espaço roda numa CÓPIA do inventário, não com
    // hasSpaceFor direto: pagar esvazia slots (o stack de moeda pode zerar, o
    // lote de maçãs pode limpar o slot inteiro), e um teste feito antes do
    // pagamento recusaria trocas que na verdade cabem. Copiar 6 slots é
    // barato; recusar uma venda legítima na cara do jogador, não.
    const simulated = Inventory.deserialize(inventory.serialize());

    if (entry.mode === 'buy') {
        if (inventory.count('coin') < price) {
            return { ok: false, reason: 'no-funds', message: `Moedas insuficientes (${price})` };
        }

        simulated.remove('coin', price);
        if (simulated.add(entry.item, entry.quantity) > 0) {
            return { ok: false, reason: 'no-space', message: 'Inventário cheio' };
        }

        inventory.remove('coin', price);
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

    simulated.remove(entry.item, entry.lot);
    if (simulated.add('coin', price) > 0) {
        return { ok: false, reason: 'no-space', message: 'Sem espaço para as moedas' };
    }

    inventory.remove(entry.item, entry.lot);
    inventory.add('coin', price);

    return { ok: true, message: `${entry.lot} ${itemName.toLowerCase()} por ${price} moeda(s)` };
}
