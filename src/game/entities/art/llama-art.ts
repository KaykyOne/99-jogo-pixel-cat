import { GameObjects, Scene } from 'phaser';

import { detail, drawBody, EnemyPoses, registerEnemyArt, Shape } from './enemy-art-utils';

// Lhama: pescoço longo e ereto, cabeça pequena com orelhas de banana, corpo
// lanoso e pernas finas. O corpo de colisão (24x30, offset 12/18) cobre do
// pescoço à barriga, então é essa faixa que precisa ficar cheia.
const WOOL = 0xe8dcc0;      // lã ao sol
const WOOL_SHADE = 0xbfae8c; // lã na sombra (barriga, traseira)
const SKIN = 0x9c7a50;      // focinho e patas
const SKIN_DARK = 0x6d5335;
const EYE = 0x241a12;

type G = GameObjects.Graphics;

// Perna: um retângulo fino com casco escuro. `lift` levanta o pé para a
// caminhada — é a diferença entre frames que faz a lhama parecer andar.
function leg(x: number, lift: number): Shape[] {
    return [
        { kind: 'rect', x, y: 34, w: 3, h: 12 - lift, color: SKIN },
        { kind: 'rect', x: x - 1, y: 46 - lift, w: 5, h: 2, color: SKIN_DARK }
    ];
}

// `neckLean` inclina o pescoço (recuo/ataque), `bob` sobe e desce o conjunto.
function llama(neckLean: number, bob: number, mouthOpen: boolean): PoseParts {
    const headX = 30 + neckLean;
    const headY = 10 + bob;

    return {
        body: [
            // Tronco lanoso: dois círculos sobrepostos leem como lã melhor que
            // um retângulo, e a garupa mais baixa dá a silhueta da lhama.
            { kind: 'circle', x: 19, y: 28 + bob, r: 10, color: WOOL },
            { kind: 'circle', x: 27, y: 29 + bob, r: 9, color: WOOL },
            // Pescoço.
            { kind: 'rect', x: headX - 3, y: headY + 4, w: 7, h: 16 + bob, color: WOOL },
            // Cabeça e focinho.
            { kind: 'circle', x: headX, y: headY, r: 5, color: WOOL },
            { kind: 'rect', x: headX + 3, y: headY - 1, w: 7, h: 5, color: SKIN },
            // Orelhas compridas, a marca registrada.
            { kind: 'tri', p: [headX - 3, headY - 4, headX - 1, headY - 13, headX + 1, headY - 4], color: WOOL },
            { kind: 'tri', p: [headX + 1, headY - 4, headX + 4, headY - 12, headX + 5, headY - 4], color: WOOL },
            // Rabinho.
            { kind: 'tri', p: [10, 24 + bob, 6, 20 + bob, 11, 29 + bob], color: WOOL }
        ],
        detail: [
            // Sombra na barriga e na garupa: separa o volume do fundo chapado.
            { kind: 'circle', x: 18, y: 33 + bob, r: 6, color: WOOL_SHADE },
            { kind: 'rect', x: headX - 3, y: headY + 5, w: 2, h: 8, color: WOOL_SHADE },
            // Olho, com brilho.
            { kind: 'circle', x: headX + 2, y: headY - 1, r: 1.6, color: EYE },
            // Boca aberta no instante do cuspe.
            ...(mouthOpen
                ? [{ kind: 'rect', x: headX + 6, y: headY + 1, w: 5, h: 3, color: EYE } as Shape]
                : [])
        ]
    };
}

type PoseParts = { body: Shape[]; detail: Shape[] };

function pose(parts: PoseParts, legs: Shape[]): (g: G) => void {
    return g => {
        // Pernas em passada própria e com contorno de 1px: com os 2px do corpo,
        // as quatro pernas se encostavam e viravam um bloco sólido.
        drawBody(g, legs, 1);
        drawBody(g, parts.body);
        detail(g, parts.detail);
    };
}

// Parado: respira (bob de 1px) com as quatro patas no chão.
const idle1 = pose(llama(0, 0, false), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);
const idle2 = pose(llama(0, 1, false), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);

// Caminhada em 4 tempos: os pares diagonais alternam, como num quadrúpede.
const walk1 = pose(llama(0, 0, false), [...leg(13, 3), ...leg(20, 0), ...leg(29, 3), ...leg(36, 0)]);
const walk2 = pose(llama(0, 1, false), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);
const walk3 = pose(llama(0, 0, false), [...leg(13, 0), ...leg(20, 3), ...leg(29, 0), ...leg(36, 3)]);
const walk4 = pose(llama(0, 1, false), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);

// Ataque: recolhe o pescoço, joga para frente e cospe. O frame 3 (meio da
// lista) é o instante do impacto, que casa com ENEMY_ATTACK_IMPACT_DELAY_MS.
const atk1 = pose(llama(-3, 0, false), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);
const atk2 = pose(llama(-4, -1, false), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);
const atk3 = pose(llama(3, 0, true), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);
const atk4 = pose(llama(4, 1, true), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);
const atk5 = pose(llama(1, 0, false), [...leg(13, 0), ...leg(20, 0), ...leg(29, 0), ...leg(36, 0)]);

const POSES: EnemyPoses = {
    idle: [idle1, idle2],
    walk: [walk1, walk2, walk3, walk4],
    attack: [atk1, atk2, atk3, atk4, atk5]
};

export function registerLlamaArt(scene: Scene): void {
    registerEnemyArt(scene, 'llama', POSES);
}
