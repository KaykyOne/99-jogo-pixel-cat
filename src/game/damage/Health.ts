import { DamageableStats, DamageSource, resolveDamage } from './damage';

// Componente reutilizável de vida. Guarda apenas HP e aplica a resolução de dano
// (defesa + resistência). Não depende de cena, input ou animação: a entidade
// dona decide o que fazer com o resultado (knockback, i-frames, morte).
export class Health {
    private currentHp: number;
    private readonly maxHp: number;
    private readonly stats: DamageableStats;

    constructor(maxHp: number, stats: DamageableStats) {
        this.maxHp = maxHp;
        this.currentHp = maxHp;
        this.stats = stats;
    }

    get current(): number {
        return this.currentHp;
    }

    get max(): number {
        return this.maxHp;
    }

    get isDead(): boolean {
        return this.currentHp <= 0;
    }

    // Aplica o dano já resolvido e retorna a quantidade efetivamente descontada.
    // Retorna 0 quando o alvo já está morto (sem "overkill" registrado).
    takeDamage(source: DamageSource): number {
        if (this.isDead) {
            return 0;
        }

        const amount = resolveDamage(source, this.stats);
        this.currentHp = Math.max(0, this.currentHp - amount);

        return amount;
    }

    heal(amount: number): void {
        this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
    }

    restoreFull(): void {
        this.currentHp = this.maxHp;
    }
}