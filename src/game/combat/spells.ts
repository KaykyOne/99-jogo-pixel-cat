import { DamageKind } from '../damage/damage';
import { ProjectileConfig } from './types';

// Catálogo de magias do cajado. Cada magia é dado puro; PlayerWeapons executa.
// Todas custam mana (ver PLAYER_MANA em health-config.ts) e têm cooldown
// próprio, além do cooldown da arma — é o que impede alternar as três em
// sequência e transformar o cajado numa metralhadora.
export type SpellId = 'arcane' | 'fireball' | 'frost';

export type SpellDefinition = {
    id: SpellId;
    name: string;
    // Cor do indicador no HUD. Cada magia lê pela cor antes de ler pelo nome.
    color: number;

    manaCost: number;
    cooldownMs: number;

    damage: number;
    kind: DamageKind;
    knockbackX: number;
    knockbackY: number;

    // Magia de projétil (arcano, bola de fogo). Ausente na onda de gelo, que é
    // uma área instantânea em volta do jogador.
    projectile?: ProjectileConfig;
    muzzleOffsetY?: number;

    // Magia de área imediata (onda de gelo).
    burst?: {
        radius: number;
        // Fração da velocidade do inimigo enquanto durar.
        slowFactor: number;
        slowDurationMs: number;
    };

    // Atraso até o efeito sair, sincronizado com o meio da animação de conjuro.
    releaseDelayMs: number;

    hitStopMs: number;
    shakeMs: number;
    shakeIntensity: number;
};

export const SPELLS: Record<SpellId, SpellDefinition> = {
    // Tecla 1 — o tiro de sempre. Barato, rápido e reto: serve para manter
    // pressão enquanto as outras duas recarregam.
    arcane: {
        id: 'arcane',
        name: 'Dardo Arcano',
        color: 0x9d7bff,

        manaCost: 8,
        cooldownMs: 340,

        damage: 1,
        kind: 'magic',
        knockbackX: 140,
        knockbackY: -110,

        projectile: {
            textureKey: 'spell-arcane',
            speed: 780,
            lifespanMs: 1400,
            gravity: false
        },
        muzzleOffsetY: -16,

        releaseDelayMs: 140,
        hitStopMs: 35,
        shakeMs: 70,
        shakeIntensity: 0.0025
    },

    // Tecla 2 — lenta e cara, explode numa área com empurrão forte. É a
    // resposta para bando (aranhas) e para quem se aglomera perto do boss.
    fireball: {
        id: 'fireball',
        name: 'Bola de Fogo',
        color: 0xff7a2f,

        manaCost: 28,
        cooldownMs: 1100,

        damage: 3,
        kind: 'fire',
        knockbackX: 380,
        knockbackY: -300,

        projectile: {
            textureKey: 'spell-fireball',
            // Deliberadamente lenta: dá tempo de o inimigo se mexer, então
            // acertar com ela é uma leitura, não um reflexo.
            speed: 340,
            lifespanMs: 2000,
            gravity: true,
            launchVelocityY: -110,
            explosionRadius: 120,
            scale: 1.4
        },
        muzzleOffsetY: -14,

        releaseDelayMs: 200,
        hitStopMs: 110,
        shakeMs: 220,
        shakeIntensity: 0.011
    },

    // Tecla 3 — não é um tiro: é uma onda em volta do jogador. Dano baixo, mas
    // empurra e lentifica todo mundo por perto. É a magia de "saia de cima de
    // mim", não a de matar.
    frost: {
        id: 'frost',
        name: 'Onda de Gelo',
        color: 0x7fd4ff,

        manaCost: 20,
        cooldownMs: 2400,

        damage: 1,
        kind: 'magic',
        knockbackX: 300,
        knockbackY: -260,

        burst: {
            radius: 190,
            slowFactor: 0.4,
            slowDurationMs: 2600
        },

        releaseDelayMs: 120,
        hitStopMs: 80,
        shakeMs: 180,
        shakeIntensity: 0.007
    }
};

// Ordem das teclas 1/2/3 (e do ciclo por R).
export const SPELL_ORDER: SpellId[] = ['arcane', 'fireball', 'frost'];
