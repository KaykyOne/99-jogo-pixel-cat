import { DamageableStats, DamageSource } from './damage';

// Vida e invencibilidade do jogador.
export const PLAYER_HEALTH = {
    maxHp: 6,

    // Janela de invencibilidade após receber dano e valores do knockback sofrido.
    invulnerabilityMs: 900,
    hurtKnockbackX: 260,
    hurtKnockbackY: -260
} as const;

// Corpo de colisão por tipo de inimigo, em px de fonte (frames 48x48).
// Medido a partir do bounding box real de cada sprite (idle/walk); o corpo
// antigo (42x42 fixo para todos) era bem maior que qualquer um dos dois
// desenhos, fazendo o inimigo "encostar" no jogador antes de tocar visualmente.
export type EnemyBody = {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
};

// Comportamento de combate ativo (perseguir + atacar), usado pelo BaseEnemy.
// aggroRange: distância em que o inimigo detecta e passa a perseguir o player.
// attackRange: distância em que ele para de perseguir e passa a atacar.
// chaseSpeed: velocidade horizontal durante a perseguição (patrulha usa
// patrolSpeed, mais lenta, para diferenciar visualmente os dois estados).
export type EnemyCombat = DamageSource & {
    aggroRange: number;
    attackRange: number;
    chaseSpeed: number;
    cooldownMs: number;
};

// Estatísticas base por tipo de inimigo. Centraliza HP, dano de contato, defesa,
// resistência, corpo físico e o comportamento de perseguição/ataque, pronto
// para novos inimigos com valores distintos sem tocar no BaseEnemy.
const ENEMY_STATS_TABLE = {
    graverobber: {
        hp: 3,
        defense: 0,
        resistance: {},

        patrolSpeed: 80,

        // Dano de contato passivo: fallback para quando o jogador esbarra no
        // inimigo fora do golpe deliberado (ex.: durante a perseguição).
        contactDamage: {
            amount: 1,
            kind: 'physical',
            knockbackX: 200,
            knockbackY: -200
        } satisfies DamageSource,

        combat: {
            amount: 1,
            kind: 'physical',
            knockbackX: 200,
            knockbackY: -200,
            aggroRange: 260,
            attackRange: 50,
            chaseSpeed: 130,
            cooldownMs: 850
        } satisfies EnemyCombat,

        body: { width: 20, height: 33, offsetX: 5, offsetY: 15 } satisfies EnemyBody
    },
    steamman: {
        hp: 5,
        defense: 1,
        resistance: { fire: 0.5 },

        patrolSpeed: 70,

        contactDamage: {
            amount: 2,
            kind: 'physical',
            knockbackX: 260,
            knockbackY: -240
        } satisfies DamageSource,

        combat: {
            amount: 2,
            kind: 'physical',
            knockbackX: 260,
            knockbackY: -240,
            aggroRange: 220,
            attackRange: 55,
            chaseSpeed: 95,
            cooldownMs: 1100
        } satisfies EnemyCombat,

        body: { width: 21, height: 36, offsetX: 3, offsetY: 12 } satisfies EnemyBody
    }
} satisfies Record<string, DamageableStats & {
    hp: number;
    patrolSpeed: number;
    contactDamage: DamageSource;
    combat: EnemyCombat;
    body: EnemyBody;
}>;

export const ENEMY_STATS = ENEMY_STATS_TABLE;
export type EnemyType = keyof typeof ENEMY_STATS_TABLE;
