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
// verticalRange: diferença de altura máxima para considerar que os dois estão
//   no mesmo nível. aggroRange/attackRange são medidos SÓ na horizontal; sem
//   este limite, um inimigo numa saliência alta perseguia e acertava quem
//   estivesse muito abaixo, bastando o x coincidir — inofensivo num mapa
//   plano, mas quebrado assim que a fase ganhou altura.
export type EnemyCombat = DamageSource & {
    aggroRange: number;
    attackRange: number;
    verticalRange: number;
    chaseSpeed: number;
    cooldownMs: number;
};

// Inimigos que atiram (lhama, aranha) descrevem aqui o projétil. Fica no
// catálogo de stats, e não na classe, pelo mesmo motivo de todo o resto:
// balanceamento é dado, não código.
export type EnemyProjectile = {
    textureKey: string;
    speed: number;
    lifespanMs: number;
    // Projétil de arco (a cusparada da lhama) versus reto (a teia).
    gravity: boolean;
    // Fração da velocidade do jogador enquanto o efeito dura. Ausente = sem
    // lentidão, só dano.
    slowFactor?: number;
    slowDurationMs?: number;
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
            // Precisa ficar ACIMA da altura máxima de pulo (137px) para o
            // inimigo não perder o alvo toda vez que o jogador pula na frente
            // dele, e ABAIXO do espaçamento entre saliências (200px) para não
            // alcançar quem está noutro nível. 150 fica nessa folga.
            verticalRange: 150,
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
            verticalRange: 150,
            chaseSpeed: 95,
            cooldownMs: 1100
        } satisfies EnemyCombat,

        body: { width: 21, height: 36, offsetX: 3, offsetY: 12 } satisfies EnemyBody
    },

    // --- Os quatro inimigos base novos -------------------------------------
    // Todos usam textura gerada por Graphics (48x48, ver entities/art/), então
    // o corpo é medido contra o desenho de cada um, não contra um spritesheet.
    // O que é COMPORTAMENTO (recuo da lhama, mergulho do morcego, bola do
    // ouriço, bando da aranha) mora na classe de cada um; aqui só o que é
    // balanceamento comum a qualquer inimigo.

    // Atira de longe e recua quando o jogador encosta. Frágil de perto.
    llama: {
        hp: 3,
        defense: 0,
        resistance: {},

        patrolSpeed: 55,

        contactDamage: {
            amount: 1,
            kind: 'physical',
            knockbackX: 180,
            knockbackY: -180
        } satisfies DamageSource,

        combat: {
            amount: 1,
            kind: 'physical',
            knockbackX: 160,
            knockbackY: -160,
            // Enxerga e atira de muito longe; o attackRange é grande de
            // propósito — ela nunca quer chegar perto.
            aggroRange: 460,
            attackRange: 380,
            verticalRange: 150,
            chaseSpeed: 110,
            cooldownMs: 1500
        } satisfies EnemyCombat,

        projectile: {
            textureKey: 'llama-spit',
            speed: 420,
            lifespanMs: 2200,
            gravity: true
        } satisfies EnemyProjectile,

        body: { width: 24, height: 30, offsetX: 12, offsetY: 18 } satisfies EnemyBody
    },

    // Voa (sem gravidade), mergulha no jogador e volta a subir.
    bat: {
        hp: 2,
        defense: 0,
        resistance: {},

        patrolSpeed: 90,

        contactDamage: {
            amount: 1,
            kind: 'physical',
            knockbackX: 200,
            knockbackY: -220
        } satisfies DamageSource,

        combat: {
            amount: 1,
            kind: 'physical',
            knockbackX: 220,
            knockbackY: -240,
            aggroRange: 320,
            attackRange: 300,
            // Voando, o alcance vertical é a razão de existir: ele ataca de
            // cima, então precisa enxergar bem abaixo de si.
            verticalRange: 320,
            chaseSpeed: 150,
            cooldownMs: 1800
        } satisfies EnemyCombat,

        body: { width: 22, height: 16, offsetX: 13, offsetY: 20 } satisfies EnemyBody
    },

    // Enrola numa bola de espinhos e atropela. Imune a dano enquanto rola.
    hedgehog: {
        hp: 4,
        defense: 1,
        resistance: {},

        patrolSpeed: 50,

        // Encostar nele já dói mais que nos outros — são espinhos.
        contactDamage: {
            amount: 1,
            kind: 'physical',
            knockbackX: 240,
            knockbackY: -200
        } satisfies DamageSource,

        combat: {
            amount: 2,
            kind: 'physical',
            knockbackX: 320,
            knockbackY: -260,
            aggroRange: 300,
            attackRange: 240,
            verticalRange: 120,
            chaseSpeed: 80,
            cooldownMs: 2200
        } satisfies EnemyCombat,

        body: { width: 28, height: 24, offsetX: 10, offsetY: 24 } satisfies EnemyBody
    },

    // Nasce em bando. Fraca sozinha; cospe teia que reduz a velocidade.
    spider: {
        hp: 1,
        defense: 0,
        resistance: {},

        patrolSpeed: 100,

        contactDamage: {
            amount: 1,
            kind: 'physical',
            knockbackX: 160,
            knockbackY: -180
        } satisfies DamageSource,

        combat: {
            amount: 1,
            kind: 'poison',
            knockbackX: 140,
            knockbackY: -160,
            aggroRange: 300,
            attackRange: 220,
            verticalRange: 130,
            chaseSpeed: 140,
            cooldownMs: 1600
        } satisfies EnemyCombat,

        projectile: {
            textureKey: 'spider-web',
            speed: 300,
            lifespanMs: 1400,
            gravity: false,
            // Não dá dano de verdade; o custo é perder mobilidade.
            slowFactor: 0.45,
            slowDurationMs: 2000
        } satisfies EnemyProjectile,

        body: { width: 26, height: 18, offsetX: 11, offsetY: 26 } satisfies EnemyBody
    }
} satisfies Record<string, DamageableStats & {
    hp: number;
    patrolSpeed: number;
    contactDamage: DamageSource;
    combat: EnemyCombat;
    body: EnemyBody;
    projectile?: EnemyProjectile;
}>;

export const ENEMY_STATS = ENEMY_STATS_TABLE;
export type EnemyType = keyof typeof ENEMY_STATS_TABLE;

// Só os dois inimigos com spritesheet completo viram boss. Os quatro novos
// têm comportamento próprio demais (voa, rola, atira, anda em bando) para
// funcionarem só ampliados 5x — virariam um boss quebrado, não um boss.
export type BossType = 'graverobber' | 'steamman';

// Variantes de boss: reutilizam arte e corpo dos inimigos comuns, mas com
// vida e comportamento de combate próprios.
export const BOSS_STATS: Record<BossType, typeof ENEMY_STATS[BossType]> = {
    graverobber: {
        ...ENEMY_STATS.graverobber,
        hp: 40,
        defense: 1,
        combat: {
            ...ENEMY_STATS.graverobber.combat,
            amount: 2,
            aggroRange: 420,
            attackRange: 70,
            // O boss usa escala 5 (170px de altura), então o alcance vertical
            // acompanha o próprio corpo em vez de herdar o do inimigo comum.
            verticalRange: 180,
            cooldownMs: 650
        }
    },
    steamman: {
        ...ENEMY_STATS.steamman,
        hp: 60,
        defense: 2,
        combat: {
            ...ENEMY_STATS.steamman.combat,
            amount: 3,
            aggroRange: 380,
            attackRange: 75,
            verticalRange: 180,
            cooldownMs: 900
        }
    }
};
