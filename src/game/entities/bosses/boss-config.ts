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

// Registry: bosses cuja fala de abertura já foi vista nesta run. Morrer e
// voltar no Normal não repete a fala; o menu apaga a lista no Novo Jogo.
export const BOSS_INTROS_SEEN_KEY = 'boss-intros-seen';

export type BossDefinition = {
    key: BossKey;
    name: string;
    // Fala de abertura: o jogo pausa quando o boss nota o jogador, antes do
    // primeiro golpe. Curta de propósito — uma página por linha.
    intro: string[];
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

// --- Boss 1: floresta — SAPO-REI -------------------------------------------
// Um sapo de verdade: fica parado no lugar e caça com a língua, e se move aos
// saltos. A língua gruda em quem acerta, puxa até a boca e cospe longe; o
// salto é alto e cai EM CIMA do jogador (a sombra no chão marca onde). Na
// fase 2 os saltos viram uma sequência de pulos seguidos.
export const FROG_BOSS_BEHAVIOR = {
    // Língua: alcance, velocidade de ida/volta e o raio da ponta que gruda.
    tongueRange: 470,
    tongueSpeed: 1500,
    tongueRetractSpeed: 1300,
    tongueHitRadius: 44,
    // A língua mira no jogador, mas não sai a mais que isto da horizontal:
    // sapo não lambe o teto.
    tongueMaxAngleDegrees: 32,
    // Na fase 2 a língua sai mais rápido.
    phase2TongueSpeedScale: 1.3,
    // Quem é pego leva o dano do toque, é puxado até a boca, fica preso um
    // instante (tempo de acabar a invencibilidade do toque) e é cuspido.
    tongueCatchDamage: { amount: 1, kind: 'physical', knockbackX: 0, knockbackY: 0 } satisfies DamageSource,
    pullSpeed: 1000,
    holdMs: 620,
    spitDamage: { amount: 1, kind: 'physical', knockbackX: 460, knockbackY: -360 } satisfies DamageSource,

    // Salto: impulso vertical e teto do impulso horizontal. O horizontal é
    // calculado para cair exatamente onde o jogador estava na decolagem.
    // Alto, mas sem sumir pelo topo da tela (o mundo tem 768px de altura).
    leapVelocityY: -760,
    leapMaxSpeedX: 640,
    // Esmagamento: quem estiver debaixo dele na queda ou colado no pouso.
    stompRadius: 115,
    stompVerticalRange: 130,
    stompDamage: { amount: 2, kind: 'physical', knockbackX: 380, knockbackY: -420 } satisfies DamageSource,
    // Onda do pouso: mais larga, mais fraca, e só pega quem está no chão —
    // pular na hora certa escapa dela.
    shockwaveRadius: 250,
    shockwaveDamage: { amount: 1, kind: 'physical', knockbackX: 300, knockbackY: -300 } satisfies DamageSource,

    // Fase 2: sequência de pulos mais baixos e rápidos, cada um mirando de novo.
    hopCount: 3,
    hopVelocityY: -640,
    hopPauseMs: 260
} as const;

// --- Boss 2: deserto — JAVALI -----------------------------------------------
// Pesado e em linha reta. Cava o chão (levantando poeira: é o aviso) e dispara
// numa investida que passa do jogador; batendo na parede, fica tonto e abre a
// guarda. Colado nele, dá uma chifrada que joga para cima. Na fase 2 a
// investida vira ida e volta.
export const BOAR_BOSS_BEHAVIOR = {
    chargeSpeed: 580,
    phase2ChargeSpeed: 660,
    // Aceleração até a velocidade máxima: arrancar do zero ao máximo num
    // frame lia como teleporte.
    chargeAccel: 2600,
    // Quanto ele passa do jogador antes de frear, e o teto de uma passada.
    chargeOvershoot: 260,
    chargeMaxDistance: 1100,
    chargeDamage: { amount: 2, kind: 'physical', knockbackX: 540, knockbackY: -380 } satisfies DamageSource,
    // Derrapagem ao frear: desaceleração e pausa antes de virar para a volta.
    skidDecel: 2400,
    turnPauseMs: 340,
    // Passadas por investida em cada fase da luta.
    passes: { 1: 1, 2: 2 },
    // Bater na parede: tontura somada à recuperação normal.
    wallStunMs: 1900,
    // Degrau no caminho (a arena do deserto tem blocos de areia): ele pula
    // por cima e segue correndo. Só é "parede" o que esse pulo não vence.
    stepHopVelocity: 660,

    // Chifrada de perto: estocada curta e dano que arremessa para o alto.
    goreRange: 175,
    goreLungeSpeed: 380,
    goreDamage: { amount: 2, kind: 'physical', knockbackX: 260, knockbackY: -620 } satisfies DamageSource
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
        name: 'SAPO-REI DO BREJO',
        intro: [
            'Croooac... Quem pisa no meu brejo sem pedir licença?',
            'Minha língua alcança longe. E o que ela pega, eu engulo.'
        ],
        artKey: 'boss-frog',
        scale: 4.5,

        stats: {
            // 38 com defesa 0: com defesa 1, todo golpe de espada valia o
            // mínimo de 1 e a luta virava 60 acertos iguais.
            hp: 38,
            defense: 0,
            resistance: { physical: 0.1 },
            patrolSpeed: 60,
            // Encostar no sapo machuca pouco: o perigo é a língua e o pulo.
            contactDamage: contact(1),
            combat: bossCombat({ chaseSpeed: 110 }),
            // Largo e baixo (o corpo inclui a cabeça, sem a coroa).
            body: { width: 38, height: 28, offsetX: 5, offsetY: 19 }
        },

        phase2HpRatio: 0.5,
        phase2TimeScale: 0.72,

        patterns: [
            // Língua: o windup é o papo inflando e a boca abrindo. Só de média
            // distância — colado nele, a resposta é o salto.
            {
                id: 'tongue',
                minBossPhase: 1,
                telegraphMs: 720,
                executeMs: 4000,
                recoverMs: 750,
                minRange: 130,
                maxRange: 480
            },
            // Salto em cima do jogador: agachado e tremendo é o aviso; no ar,
            // a sombra no chão mostra onde ele vai cair.
            {
                id: 'leap',
                minBossPhase: 1,
                telegraphMs: 620,
                executeMs: 4000,
                recoverMs: 900,
                minRange: 0,
                maxRange: 900
            },
            // Fase 2: três pulos seguidos, cada um mirando de novo.
            {
                id: 'hops',
                minBossPhase: 2,
                telegraphMs: 680,
                executeMs: 7000,
                recoverMs: 1150,
                minRange: 0,
                maxRange: 900
            }
        ]
    },

    desert: {
        key: 'desert',
        name: 'JAVALI PRESA-DE-OSSO',
        intro: [
            'Hrrmf... HRMF! Cheiro de forasteiro na minha areia.',
            'Aqui no deserto não tem onde se esconder. Corre, que eu corro mais.'
        ],
        artKey: 'boss-boar',
        scale: 4.0,

        stats: {
            hp: 48,
            defense: 1,
            resistance: { fire: 0.3 },
            patrolSpeed: 80,
            contactDamage: contact(1),
            combat: bossCombat({ amount: 2, chaseSpeed: 150, knockbackX: 280 }),
            // Só pernas e a metade de baixo do corpo: a crina e a corcunda não
            // colidem. Com o corpo inteiro (~110px) o pulo do jogador passava
            // raspando só no ápice e pular a investida era quase impossível.
            body: { width: 40, height: 20, offsetX: 3, offsetY: 27 }
        },

        phase2HpRatio: 0.5,
        phase2TimeScale: 0.75,

        patterns: [
            // Investida: cava o chão bufando (telegrafo longo, porque o golpe
            // é rápido e forte) e dispara em linha reta.
            {
                id: 'charge',
                minBossPhase: 1,
                telegraphMs: 900,
                executeMs: 6000,
                recoverMs: 850,
                minRange: 150,
                maxRange: 1000
            },
            // Chifrada: só colado. Pune quem fica grudado batendo.
            {
                id: 'gore',
                minBossPhase: 1,
                telegraphMs: 480,
                executeMs: 420,
                recoverMs: 750,
                minRange: 0,
                maxRange: 190
            }
        ]
    },

    snow: {
        key: 'snow',
        name: 'COLOSSO DE GELO',
        intro: [
            'Ninguém sobe estes picos e volta aquecido.',
            'Fica. Vira gelo junto comigo.'
        ],
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
