import { DamageSource } from '../../damage/damage';
import { EnemyCombat, EnemyStatsShape } from '../../damage/health-config';

// Dados dos bosses dedicados. Todo número da luta mora aqui: vida, dano,
// tempo de telegrafo, alcance de padrão. A classe só lê — mesmo princípio de
// ENEMY_STATS e PLAYER_MOVEMENT.
//
// Os bosses são indexados por CHAVE DE FASE, nunca por índice: a ordem das
// fases muda (a vila entra como PHASES[0]) e um índice chumbado apontaria para
// o boss errado no dia seguinte.
export type BossKey = 'forest' | 'desert' | 'snow';

// Um padrão é uma ação completa do boss, em três tempos:
//   telegraph -> o windup VISÍVEL. É a janela em que o jogador lê o que vem.
//   execute   -> o golpe acontecendo.
//   recover   -> a abertura. É aqui que o jogador ataca de volta.
// Sem os três, um boss vira um inimigo comum com muita vida.
export type BossPatternDef = {
    id: string;
    // A partir de qual fase da luta este padrão entra no rodízio.
    minBossPhase: 1 | 2;

    telegraphMs: number;
    executeMs: number;
    recoverMs: number;

    // Faixa de distância horizontal em que o padrão é escolhido. Fora dela o
    // boss se reposiciona em vez de atacar o vazio.
    minRange: number;
    maxRange: number;
};

export type BossDefinition = {
    key: BossKey;
    name: string;
    // Chave da arte gerada (ver entities/art/boss-art.ts).
    artKey: string;
    scale: number;

    stats: EnemyStatsShape;

    // Fração de vida em que a fase 2 começa.
    phase2HpRatio: number;
    // Quanto os tempos de padrão encolhem na fase 2. 0.7 = 30% mais rápido.
    phase2TimeScale: number;

    patterns: BossPatternDef[];
};

const BOSS_BODY = { width: 34, height: 40, offsetX: 7, offsetY: 8 } as const;

// Combate base compartilhado: o alcance de ataque dos bosses é enorme de
// propósito. Não é o alcance do GOLPE (cada padrão tem o seu) e sim o raio em
// que a máquina de estados assume o controle — a arena inteira.
function bossCombat(overrides: Partial<EnemyCombat> = {}): EnemyCombat {
    return {
        amount: 2,
        kind: 'physical',
        knockbackX: 320,
        knockbackY: -260,
        aggroRange: 900,
        attackRange: 850,
        verticalRange: 260,
        chaseSpeed: 130,
        cooldownMs: 1200,
        ...overrides
    };
}

function contact(amount: number): DamageSource {
    return { amount, kind: 'physical', knockbackX: 300, knockbackY: -240 };
}

// --- Boss 1: floresta -------------------------------------------------------
// Corpo-a-corpo pesado. Dois padrões na fase 1 (investida e salto com onda de
// impacto) e, abaixo de 50%, acelera e passa a invocar reforços.
export const FOREST_BOSS_BEHAVIOR = {
    // Investida: velocidade e distância máxima antes de frear.
    chargeSpeed: 430,
    chargeMaxDistance: 620,
    // Dano do atropelo. Só acerta uma vez por investida.
    chargeHitRange: 90,
    chargeDamage: { amount: 2, kind: 'physical', knockbackX: 420, knockbackY: -300 } satisfies DamageSource,

    // Salto: impulso vertical e horizontal em direção ao jogador.
    leapVelocityY: -760,
    leapSpeedX: 260,
    // Onda de impacto ao aterrissar: raio no chão e dano.
    shockwaveRadius: 260,
    shockwaveDamage: { amount: 2, kind: 'physical', knockbackX: 360, knockbackY: -380 } satisfies DamageSource,
    // Altura máxima acima do chão em que a onda ainda alcança o jogador —
    // pular na hora certa é a esquiva, senão a onda seria inescapável.
    shockwaveVerticalRange: 120,

    // Fase 2: quantos inimigos comuns são invocados por vez e a que distância.
    summonCount: 2,
    summonSpreadX: 220,
    // Teto de invocados VIVOS ao mesmo tempo. Sem ele o padrão de invocação
    // volta ao rodízio a cada ciclo e a arena entope de aranhas até a luta
    // virar impossível — o jogador nunca chega a bater no boss.
    maxAliveSummons: 2
} as const;

// --- Boss 2: deserto --------------------------------------------------------
// Luta de distância. Salva em leque, reposicionamento por dash e, na fase 2,
// um projétil que persegue.
export const DESERT_BOSS_BEHAVIOR = {
    // Leque: quantos tiros e a abertura total do arco, em graus.
    fanShots: 5,
    fanSpreadDegrees: 54,
    fanProjectileSpeed: 420,

    // Dash de reposicionamento: velocidade e para onde ele tenta ir.
    dashSpeed: 620,
    // Distância que ele considera confortável para atirar.
    preferredRange: 420,

    // Projétil teleguiado da fase 2.
    homingSpeed: 300,
    homingAccel: 900,
    homingLifespanMs: 3200
} as const;

// --- Boss 3: neve -----------------------------------------------------------
// Mistura os dois: golpe de perto, tiro de longe, e um campo de gelo no chão
// que lentifica quem pisar nele.
export const SNOW_BOSS_BEHAVIOR = {
    slamRange: 150,
    slamDamage: { amount: 2, kind: 'physical', knockbackX: 340, knockbackY: -300 } satisfies DamageSource,

    shardShots: 3,
    shardSpreadDegrees: 28,
    shardSpeed: 460,

    // Poça de gelo: dura um tempo, lentifica quem está em cima e some.
    fieldRadius: 150,
    fieldDurationMs: 6000,
    fieldSlowFactor: 0.45,
    fieldSlowDurationMs: 700
} as const;

export const BOSSES: Record<BossKey, BossDefinition> = {
    forest: {
        key: 'forest',
        name: 'GUARDIÃO DO CARVALHO',
        artKey: 'boss-forest',
        scale: 4.5,

        stats: {
            // 60 de vida com defesa 1 fazia TODO golpe de espada valer 1 (o
            // mínimo garantido por resolveDamage): 60 acertos limpos, ~40s
            // pendurado no boss sem errar um. 38 com defesa 0 devolve o peso do
            // combo (1+1+2 por ciclo) sem tirar a resistência física, que é o
            // que ainda favorece arco e magia contra ele.
            hp: 38,
            defense: 0,
            resistance: { physical: 0.1 },
            patrolSpeed: 70,
            contactDamage: contact(2),
            combat: bossCombat({ chaseSpeed: 150 }),
            body: { ...BOSS_BODY }
        },

        phase2HpRatio: 0.5,
        phase2TimeScale: 0.68,

        patterns: [
            // Investida: telegrafo longo porque o golpe é rápido e forte. Se o
            // windup fosse curto, não haveria como reagir.
            {
                id: 'charge',
                minBossPhase: 1,
                telegraphMs: 700,
                executeMs: 1500,
                recoverMs: 900,
                minRange: 160,
                maxRange: 760
            },
            // Salto: alcança quem fugiu para longe e pune quem ficou colado.
            {
                id: 'leap',
                minBossPhase: 1,
                telegraphMs: 560,
                executeMs: 1400,
                recoverMs: 1000,
                minRange: 0,
                maxRange: 620
            },
            // Fase 2: chama reforço. O jogador passa a ter que escolher entre
            // limpar os invocados e continuar batendo no boss.
            {
                id: 'summon',
                minBossPhase: 2,
                telegraphMs: 620,
                executeMs: 400,
                recoverMs: 1100,
                minRange: 0,
                maxRange: 900
            }
        ]
    },

    desert: {
        key: 'desert',
        name: 'SENTINELA DAS DUNAS',
        artKey: 'boss-desert',
        scale: 4.2,

        stats: {
            hp: 48,
            defense: 1,
            resistance: { fire: 0.3 },
            patrolSpeed: 80,
            contactDamage: contact(2),
            combat: bossCombat({ amount: 2, chaseSpeed: 170, knockbackX: 280 }),
            body: { ...BOSS_BODY }
        },

        phase2HpRatio: 0.5,
        phase2TimeScale: 0.7,

        patterns: [
            {
                id: 'fan',
                minBossPhase: 1,
                telegraphMs: 620,
                executeMs: 700,
                recoverMs: 950,
                minRange: 180,
                maxRange: 900
            },
            // O dash não machuca: é reposicionamento. Serve para ele nunca
            // deixar o jogador colado, que é onde a luta seria trivial.
            {
                id: 'reposition',
                minBossPhase: 1,
                telegraphMs: 320,
                executeMs: 420,
                recoverMs: 380,
                minRange: 0,
                maxRange: 900
            },
            {
                id: 'homing',
                minBossPhase: 2,
                telegraphMs: 720,
                executeMs: 500,
                recoverMs: 1000,
                minRange: 120,
                maxRange: 900
            }
        ]
    },

    snow: {
        key: 'snow',
        name: 'COLOSSO DE GELO',
        artKey: 'boss-snow',
        scale: 4.6,

        stats: {
            hp: 55,
            defense: 2,
            resistance: { fire: -0.5, magic: 0.2 },
            patrolSpeed: 60,
            contactDamage: contact(2),
            combat: bossCombat({ chaseSpeed: 120 }),
            body: { ...BOSS_BODY }
        },

        phase2HpRatio: 0.45,
        phase2TimeScale: 0.72,

        patterns: [
            {
                id: 'slam',
                minBossPhase: 1,
                telegraphMs: 640,
                executeMs: 500,
                recoverMs: 900,
                minRange: 0,
                maxRange: 240
            },
            {
                id: 'shards',
                minBossPhase: 1,
                telegraphMs: 560,
                executeMs: 600,
                recoverMs: 850,
                minRange: 200,
                maxRange: 900
            },
            {
                id: 'icefield',
                minBossPhase: 2,
                telegraphMs: 700,
                executeMs: 400,
                recoverMs: 1000,
                minRange: 0,
                maxRange: 900
            }
        ]
    }
};

export function bossDefinitionFor(phaseKey: string): BossDefinition | undefined {
    return BOSSES[phaseKey as BossKey];
}
