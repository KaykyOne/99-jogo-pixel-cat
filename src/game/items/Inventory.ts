import { isItemId, ItemId, ITEMS } from './item-catalog';

// Chave do inventário no registry do Phaser (global ao jogo, sobrevive a
// scene.start entre fases). Fica aqui, e não em run-inventory.ts, para que
// state/save.ts possa lê-la sem importar o helper de cena — evitando o ciclo
// save -> run-inventory -> save.
export const INVENTORY_REGISTRY_KEY = 'inventory';

export const INVENTORY_SLOTS = 6;

export type Slot = { id: ItemId; quantity: number } | null;

// Classe PURA: sem cena, sem input, sem desenho — no mesmo espírito de Health.
// Quem desenha assina onChange; nada aqui conhece Phaser.
export class Inventory {
    private readonly items: Slot[] = new Array(INVENTORY_SLOTS).fill(null);
    private readonly listeners = new Set<() => void>();

    get slots(): readonly Slot[] {
        return this.items;
    }

    slotAt(index: number): Slot {
        return this.items[index] ?? null;
    }

    // O HUD redesenha só aqui, nunca no update() da cena. Devolve a função de
    // cancelamento: assinatura que sobrevive a scene.restart sem vazar.
    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    count(id: ItemId): number {
        let total = 0;
        for (const slot of this.items) {
            if (slot && slot.id === id) {
                total += slot.quantity;
            }
        }
        return total;
    }

    // Quanto ainda cabe deste item, somando o espaço livre dos stacks parciais
    // com os slots vazios.
    spaceFor(id: ItemId): number {
        const stackSize = ITEMS[id].stackSize;
        let space = 0;

        for (const slot of this.items) {
            if (!slot) {
                space += stackSize;
            } else if (slot.id === id) {
                space += stackSize - slot.quantity;
            }
        }

        return space;
    }

    hasSpaceFor(id: ItemId, quantity: number): boolean {
        return this.spaceFor(id) >= quantity;
    }

    // Preenche stacks parciais existentes primeiro, depois ocupa slots vazios.
    // Retorna quanto NÃO coube — quem chama decide o que fazer (deixar o pickup
    // no chão, avisar "inventário cheio"). Nunca descarta em silêncio.
    add(id: ItemId, quantity: number): number {
        if (quantity <= 0) {
            return 0;
        }

        const stackSize = ITEMS[id].stackSize;
        let remaining = quantity;

        for (let index = 0; index < this.items.length && remaining > 0; index++) {
            const slot = this.items[index];
            if (!slot || slot.id !== id || slot.quantity >= stackSize) {
                continue;
            }

            const room = stackSize - slot.quantity;
            const moved = Math.min(room, remaining);
            slot.quantity += moved;
            remaining -= moved;
        }

        for (let index = 0; index < this.items.length && remaining > 0; index++) {
            if (this.items[index]) {
                continue;
            }

            const moved = Math.min(stackSize, remaining);
            this.items[index] = { id, quantity: moved };
            remaining -= moved;
        }

        if (remaining !== quantity) {
            this.emitChange();
        }

        return remaining;
    }

    // Remove de qualquer combinação de slots. Retorna false e NÃO altera nada
    // se não houver a quantidade pedida — a transação é atômica, senão uma
    // compra parcial deixa o jogador sem moeda e sem item.
    remove(id: ItemId, quantity: number): boolean {
        if (quantity <= 0) {
            return true;
        }

        if (this.count(id) < quantity) {
            return false;
        }

        let remaining = quantity;
        for (let index = this.items.length - 1; index >= 0 && remaining > 0; index--) {
            const slot = this.items[index];
            if (!slot || slot.id !== id) {
                continue;
            }

            const taken = Math.min(slot.quantity, remaining);
            slot.quantity -= taken;
            remaining -= taken;

            if (slot.quantity <= 0) {
                this.items[index] = null;
            }
        }

        this.emitChange();
        return true;
    }

    serialize(): Slot[] {
        return this.items.map(slot => (slot ? { id: slot.id, quantity: slot.quantity } : null));
    }

    // Tolerante de propósito: save antigo (sem o campo), save de outra versão
    // do catálogo ou localStorage adulterado devolvem um inventário vazio em
    // vez de derrubar a cena.
    static deserialize(data: unknown): Inventory {
        const inventory = new Inventory();
        if (!Array.isArray(data)) {
            return inventory;
        }

        for (let index = 0; index < INVENTORY_SLOTS; index++) {
            const raw = data[index] as unknown;
            if (!raw || typeof raw !== 'object') {
                continue;
            }

            const candidate = raw as { id?: unknown; quantity?: unknown };
            if (!isItemId(candidate.id) || typeof candidate.quantity !== 'number') {
                continue;
            }

            const quantity = Math.floor(candidate.quantity);
            if (quantity <= 0) {
                continue;
            }

            inventory.items[index] = {
                id: candidate.id,
                quantity: Math.min(quantity, ITEMS[candidate.id].stackSize)
            };
        }

        return inventory;
    }

    private emitChange(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
