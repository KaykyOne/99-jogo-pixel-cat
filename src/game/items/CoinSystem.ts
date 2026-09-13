// Sistema de moedas separado do inventário. As moedas não ocupam espaço,
// funcionam como um contador tipo Mario.
//
// Vive no registry do Phaser (global, sobrevive a cena) e pode ser salvo.

export const COINS_REGISTRY_KEY = 'coins';

export class CoinSystem {
    private amount = 0;
    private readonly listeners = new Set<(amount: number) => void>();

    get current(): number {
        return this.amount;
    }

    onChange(listener: (amount: number) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    add(quantity: number): void {
        if (quantity <= 0) {
            return;
        }

        this.amount += quantity;
        this.emitChange();
    }

    remove(quantity: number): boolean {
        if (quantity <= 0) {
            return true;
        }

        if (this.amount < quantity) {
            return false;
        }

        this.amount -= quantity;
        this.emitChange();
        return true;
    }

    serialize(): number {
        return this.amount;
    }

    static deserialize(data: unknown): CoinSystem {
        const system = new CoinSystem();
        if (typeof data === 'number' && data > 0) {
            system.amount = Math.floor(data);
        }
        return system;
    }

    private emitChange(): void {
        for (const listener of this.listeners) {
            listener(this.amount);
        }
    }
}
