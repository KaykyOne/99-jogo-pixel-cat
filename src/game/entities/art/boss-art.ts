import { GameObjects, Scene } from 'phaser';

import { detail, drawBody, EnemyPoses, registerEnemyArt, Shape } from './enemy-art-utils';

// Arte dos três bosses dedicados, no mesmo frame de 48x48 dos inimigos comuns
// (exigência de syncFacingOffset) e exibida numa escala bem maior. Nenhum
// asset novo: tudo em formas, como bat-art/spider-art já fazem.
//
// Cada boss tem uma silhueta que o distingue à distância, porque em escala 4+
// o que se lê primeiro é o contorno, não o detalhe:
//   floresta -> largo e baixo, com chifres. Um bloco que atropela.
//   deserto  -> alto e fino, com carapaça e cauda erguida. Uma torre que atira.
//   neve     -> maciço e simétrico, com cristais nos ombros.

type G = GameObjects.Graphics;

// --- Boss da floresta -------------------------------------------------------
const F_HIDE = 0x5a7a3c;
const F_HIDE_DARK = 0x3a5226;
const F_HORN = 0xd8cfae;
const F_EYE = 0xffd447;

// `crouch` afunda o corpo (windup da investida e do salto), `swing` avança os
// braços. Os dois juntos são o telegrafo lido a olho nu.
function forest(crouch: number, swing: number, step: number): { body: Shape[]; detail: Shape[] } {
    const baseY = 46 - crouch;

    return {
        body: [
            // Pernas curtas e grossas, alternando com `step`.
            { kind: 'rect', x: 13, y: baseY - 12 + step, w: 9, h: 12 - step, color: F_HIDE_DARK },
            { kind: 'rect', x: 26, y: baseY - 12 - step, w: 9, h: 12 + step, color: F_HIDE_DARK },
            // Tronco largo: é ele que dá o volume de "muro".
            { kind: 'rect', x: 9, y: baseY - 30, w: 30, h: 20, color: F_HIDE },
            // Braços pendurados à frente, avançando no golpe.
            { kind: 'rect', x: 33 + swing, y: baseY - 28, w: 9, h: 18, color: F_HIDE_DARK },
            { kind: 'rect', x: 6 + swing * 0.4, y: baseY - 27, w: 8, h: 16, color: F_HIDE_DARK },
            // Cabeça baixa, encaixada nos ombros.
            { kind: 'circle', x: 28, y: baseY - 34, r: 9, color: F_HIDE },
            // Chifres para a frente.
            { kind: 'tri', p: [33, baseY - 40, 44, baseY - 44, 35, baseY - 34], color: F_HORN },
            { kind: 'tri', p: [23, baseY - 41, 14, baseY - 46, 22, baseY - 35], color: F_HORN }
        ],
        detail: [
            { kind: 'circle', x: 31, y: baseY - 35, r: 2.2, color: F_EYE },
            { kind: 'circle', x: 25, y: baseY - 36, r: 1.8, color: F_EYE },
            // Placas dorsais: quebram o bloco de cor do tronco.
            { kind: 'tri', p: [14, baseY - 30, 19, baseY - 38, 24, baseY - 30], color: F_HIDE_DARK },
            { kind: 'tri', p: [22, baseY - 30, 27, baseY - 37, 32, baseY - 30], color: F_HIDE_DARK }
        ]
    };
}

// --- Boss do deserto --------------------------------------------------------
const D_SHELL = 0xc8a05a;
const D_SHELL_DARK = 0x8a6a34;
const D_CHITIN = 0x6b4f22;
const D_GLOW = 0xff8c3a;

// `aim` levanta a cauda (o telegrafo do leque), `lean` inclina o corpo (dash).
function desert(aim: number, lean: number, step: number): { body: Shape[]; detail: Shape[] } {
    return {
        body: [
            // Pernas em ângulo, de artrópode.
            { kind: 'tri', p: [14, 36, 10 - step, 47, 17, 38], color: D_CHITIN },
            { kind: 'tri', p: [22, 37, 20, 47, 25, 38], color: D_CHITIN },
            { kind: 'tri', p: [29, 36, 33 + step, 47, 26, 38], color: D_CHITIN },
            // Corpo alto, inclinado por `lean`.
            { kind: 'rect', x: 16 + lean, y: 20, w: 17, h: 18, color: D_SHELL },
            // Cauda subindo por trás e curvando à frente: a "arma".
            { kind: 'rect', x: 10, y: 22 - aim, w: 7, h: 12, color: D_SHELL_DARK },
            { kind: 'rect', x: 9, y: 12 - aim, w: 6, h: 12, color: D_SHELL_DARK },
            { kind: 'tri', p: [12, 10 - aim, 24, 6 - aim * 1.4, 18, 16 - aim], color: D_SHELL_DARK },
            // Cabeça achatada, à frente.
            { kind: 'rect', x: 30 + lean, y: 22, w: 12, h: 11, color: D_SHELL },
            // Garras.
            { kind: 'tri', p: [40 + lean, 30, 47 + lean, 27, 40 + lean, 25], color: D_CHITIN }
        ],
        detail: [
            { kind: 'circle', x: 37 + lean, y: 26, r: 2, color: D_GLOW },
            { kind: 'circle', x: 33 + lean, y: 26, r: 1.6, color: D_GLOW },
            // Ferrão aceso quando a cauda está armada.
            { kind: 'circle', x: 23, y: 8 - aim * 1.4, r: 2.4 + aim * 0.3, color: D_GLOW },
            { kind: 'rect', x: 19 + lean, y: 24, w: 11, h: 3, color: D_SHELL_DARK },
            { kind: 'rect', x: 19 + lean, y: 30, w: 11, h: 3, color: D_SHELL_DARK }
        ]
    };
}

// --- Boss da neve -----------------------------------------------------------
const S_ICE = 0x8fc4e8;
const S_ICE_DARK = 0x4f7f9e;
const S_CRYSTAL = 0xd8f2ff;
const S_CORE = 0x3aa8ff;

// `raise` ergue os braços (windol do soco no chão), `glow` engorda o núcleo.
function snow(raise: number, glow: number, step: number): { body: Shape[]; detail: Shape[] } {
    return {
        body: [
            { kind: 'rect', x: 14, y: 36 + step, w: 9, h: 12 - step, color: S_ICE_DARK },
            { kind: 'rect', x: 26, y: 36 - step, w: 9, h: 12 + step, color: S_ICE_DARK },
            // Tronco em bloco, simétrico: a leitura de "estátua".
            { kind: 'rect', x: 13, y: 18, w: 22, h: 20, color: S_ICE },
            // Braços erguidos por `raise`.
            { kind: 'rect', x: 6, y: 20 - raise, w: 8, h: 18, color: S_ICE_DARK },
            { kind: 'rect', x: 34, y: 20 - raise, w: 8, h: 18, color: S_ICE_DARK },
            // Cabeça pequena para o corpo parecer maior.
            { kind: 'rect', x: 19, y: 8, w: 11, h: 11, color: S_ICE },
            // Cristais nos ombros.
            { kind: 'tri', p: [11, 20, 16, 6, 20, 20], color: S_CRYSTAL },
            { kind: 'tri', p: [28, 20, 33, 7, 37, 20], color: S_CRYSTAL }
        ],
        detail: [
            { kind: 'circle', x: 24, y: 28, r: 4 + glow, color: S_CORE },
            { kind: 'circle', x: 24, y: 28, r: 2 + glow * 0.6, color: S_CRYSTAL },
            { kind: 'circle', x: 22, y: 13, r: 1.8, color: S_CORE },
            { kind: 'circle', x: 27, y: 13, r: 1.8, color: S_CORE }
        ]
    };
}

function pose(parts: { body: Shape[]; detail: Shape[] }): (g: G) => void {
    return g => {
        // Contorno mais grosso que o dos inimigos comuns: em escala 4+ um
        // contorno de 1px vira um fiozinho e a silhueta se perde no fundo.
        drawBody(g, parts.body, 2);
        detail(g, parts.detail);
    };
}

const FOREST_POSES: EnemyPoses = {
    idle: [pose(forest(0, 0, 0)), pose(forest(1, 0, 0))],
    walk: [pose(forest(0, 0, 0)), pose(forest(1, 1, 2)), pose(forest(0, 0, 0)), pose(forest(1, 1, -2))],
    // O ataque começa AFUNDANDO (o windup) e só depois avança: é o telegrafo
    // desenhado, e não só o tint que a máquina de estados aplica por cima.
    attack: [
        pose(forest(4, -2, 0)),
        pose(forest(5, -3, 0)),
        pose(forest(0, 5, 0)),
        pose(forest(-2, 7, 1)),
        pose(forest(0, 2, 0))
    ]
};

const DESERT_POSES: EnemyPoses = {
    idle: [pose(desert(0, 0, 0)), pose(desert(1, 0, 0))],
    walk: [pose(desert(0, 0, 0)), pose(desert(0, 1, 2)), pose(desert(1, 0, 0)), pose(desert(0, 1, -2))],
    attack: [
        pose(desert(3, -1, 0)),
        pose(desert(5, -2, 0)),
        pose(desert(6, 0, 0)),
        pose(desert(1, 2, 1)),
        pose(desert(0, 0, 0))
    ]
};

const SNOW_POSES: EnemyPoses = {
    idle: [pose(snow(0, 0, 0)), pose(snow(0, 0.6, 0))],
    walk: [pose(snow(0, 0, 0)), pose(snow(1, 0.3, 2)), pose(snow(0, 0, 0)), pose(snow(1, 0.3, -2))],
    attack: [
        pose(snow(6, 0.4, 0)),
        pose(snow(8, 0.9, 0)),
        pose(snow(-2, 1.6, 0)),
        pose(snow(-1, 0.8, 1)),
        pose(snow(0, 0.2, 0))
    ]
};

export function registerBossArt(scene: Scene): void {
    registerEnemyArt(scene, 'boss-forest', FOREST_POSES);
    registerEnemyArt(scene, 'boss-desert', DESERT_POSES);
    registerEnemyArt(scene, 'boss-snow', SNOW_POSES);
}
