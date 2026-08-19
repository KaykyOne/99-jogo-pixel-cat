import { DamageableStats, DamageSource } from './damage';

// Vida e invencibilidade do jogador.
export const PLAYER_HEALTH = {
    maxHp: 6,

    // Janela de invencibilidade após receber dano e valores do knockback sofrido.
    invulnerabilityMs: 900,
    hurtKnockbackX: 260,
    hurtKnockbackY: -260
} as const;

// Estatísticas base por tipo de inimigo. Centraliza HP, dano de contato, defesa
// e resistência, ficando pronto para novos inimigos com valores distintos.
export const ENEMY_STATS: Record<string, DamageableStats & { hp: number; contactDamage: DamageSource }> = {
    graverobber: {
        hp: 3,
        defense: 0,
        resistance: {},

        contactDamage: {
            amount: 1,
            kind: 'physical',
            knockbackX: 200,
            knockbackY: -200
        }
    },
    steamman: {
        hp: 5,
        defense: 1,
        resistance: { fire: 0.5 },

        contactDamage: {
            amount: 2,
            kind: 'physical',
            knockbackX: 260,
            knockbackY: -240
        }
    }
};