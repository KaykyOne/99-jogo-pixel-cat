import { PLAYER_MANA } from './health-config';

// Recurso de mana do jogador. Puro, no mesmo espírito de Health: não conhece
// cena, input nem HUD — só guarda o valor e a regra de regeneração. Quem gasta
// decide o que fazer quando não dá.
export class Mana {
    private currentMana: number = PLAYER_MANA.max;

    // Enquanto este contador não zera, a regeneração fica parada. É ele que
    // impede a mana de simplesmente pagar a magia mais barata em tempo real e
    // deixar de ser uma decisão.
    private regenBlockedFor = 0;

    get current(): number {
        return this.currentMana;
    }

    get max(): number {
        return PLAYER_MANA.max;
    }

    get ratio(): number {
        return this.currentMana / PLAYER_MANA.max;
    }

    canSpend(cost: number): boolean {
        return this.currentMana >= cost;
    }

    // Gasta e devolve se coube. Atômico de propósito: nunca deixa a mana
    // negativa nem cobra parcialmente por uma magia que não saiu.
    spend(cost: number): boolean {
        if (!this.canSpend(cost)) {
            return false;
        }

        this.currentMana -= cost;
        this.regenBlockedFor = PLAYER_MANA.regenDelayMs;
        return true;
    }

    update(delta: number): void {
        if (this.regenBlockedFor > 0) {
            this.regenBlockedFor -= delta;
            return;
        }

        if (this.currentMana >= PLAYER_MANA.max) {
            return;
        }

        this.currentMana = Math.min(
            PLAYER_MANA.max,
            this.currentMana + (PLAYER_MANA.regenPerSecond * delta) / 1000
        );
    }

    restoreFull(): void {
        this.currentMana = PLAYER_MANA.max;
        this.regenBlockedFor = 0;
    }
}
