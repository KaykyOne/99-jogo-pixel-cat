import { GameObjects, Scene } from 'phaser';

import { detail, drawBody, EnemyPoses, registerEnemyArt, Shape } from './enemy-art-utils';

// Aranha. Corpo de colisão 26x18, offset 11/26 -> faixa y 26..44. O abdome
// fica nessa faixa e as pernas descem até o chão do frame.
const SHELL = 0x3c3050;      // abdome iluminado
const SHELL_DARK = 0x241c33; // abdome na sombra
const LEG = 0x6b5590;      // pernas CLARAS de propósito: escuras somem no fundo da caverna
const LEG_DARK = 0x4a3a68;
const EYE = 0xff5d7a;        // olhos vermelhos: a leitura de "venenosa"
const MARK = 0xc94f7c;       // marca no dorso

type G = GameObjects.Graphics;

// Uma perna em dois segmentos, articulada — reta demais lê como palito.
// `dir` -1 = lado esquerdo. `spread` afasta a perna do corpo, `lift` sobe o pé.
function leg(dir: number, index: number, spread: number, lift: number): Shape[] {
    // Os quadris se espalham ao longo do corpo e os joelhos sobem ACIMA dele:
    // é esse arco que faz ler como aranha. Antes todas as pernas saíam do
    // mesmo ponto e se amontoavam num borrão embaixo do abdome.
    const hipX = 22 + dir * (2 + index * 2);
    const hipY = 31;
    // Joelhos bem separados nos dois eixos: agrupados, as oito coxas viravam
    // um bloco sólido em cima do abdome em vez de oito pernas.
    const kneeX = 22 + dir * (9 + index * 3.5);
    const kneeY = 27 - index * 2.5;
    // Teto de 22px de afastamento: além disso o pé sai do frame de 48 e é
    // cortado no meio.
    const footX = 22 + dir * Math.min(12 + index * 3 + spread, 22);
    const footY = 46 - lift;

    return [
        // Coxa subindo até o "joelho" alto, marca registrada de aranha.
        { kind: 'tri', p: [hipX, hipY - 1, hipX, hipY + 2, kneeX, kneeY], color: LEG },
        // Canela descendo ao chão, mais escura para dar profundidade.
        { kind: 'tri', p: [kneeX - 1.5, kneeY - 1, kneeX + 1.5, kneeY + 1, footX, footY], color: LEG_DARK }
    ];
}

// 4 pernas de cada lado. `phase` alterna quais pares estão levantados.
function legs(phase: number): Shape[] {
    const out: Shape[] = [];
    for (let i = 0; i < 4; i++) {
        const lift = (i + phase) % 2 === 0 ? 3 : 0;
        out.push(...leg(-1, i, i, lift), ...leg(1, i, i, (i + phase + 1) % 2 === 0 ? 3 : 0));
    }
    return out;
}

function spider(phase: number, rear: number, fangsOut: boolean): { body: Shape[]; detail: Shape[] } {
    return {
        // `rear` levanta a frente do corpo — é o bote.
        body: [
            ...legs(phase),
            // Abdome (bola de trás) e cefalotórax (frente, menor).
            { kind: 'circle', x: 17, y: 31 - rear * 0.5, r: 8, color: SHELL },
            { kind: 'circle', x: 28, y: 32 - rear, r: 6, color: SHELL },
            // Quelíceras.
            { kind: 'tri', p: [32, 31 - rear, 38, 33 - rear, 32, 35 - rear], color: SHELL_DARK }
        ],
        detail: [
            { kind: 'circle', x: 17, y: 34 - rear * 0.5, r: 5, color: SHELL_DARK },
            // Marca em ampulheta no dorso.
            { kind: 'tri', p: [17, 26 - rear * 0.5, 14, 31 - rear * 0.5, 20, 31 - rear * 0.5], color: MARK },
            // Quatro olhos em duas fileiras, como aranha de verdade.
            { kind: 'circle', x: 29, y: 29 - rear, r: 1.4, color: EYE },
            { kind: 'circle', x: 32, y: 30 - rear, r: 1.1, color: EYE },
            { kind: 'circle', x: 29, y: 33 - rear, r: 1.1, color: EYE },
            { kind: 'circle', x: 32, y: 34 - rear, r: 0.9, color: EYE },
            ...(fangsOut
                ? [
                      { kind: 'tri', p: [35, 32 - rear, 42, 34 - rear, 35, 35 - rear], color: EYE } as Shape
                  ]
                : [])
        ]
    };
}

function pose(phase: number, rear: number, fangsOut: boolean): (g: G) => void {
    const parts = spider(phase, rear, fangsOut);
    return g => {
        drawBody(g, parts.body, 1);
        detail(g, parts.detail);
    };
}

const idle1 = pose(0, 0, false);
const idle2 = pose(1, 0, false);

// Corrida: as pernas alternam em dois tempos, e o corpo sobe/desce 1px junto.
const walk1 = pose(0, 0, false);
const walk2 = pose(1, 1, false);
const walk3 = pose(0, 0, false);
const walk4 = pose(1, 1, false);

// Ataque: recua, empina a frente e dá o bote com as presas à mostra.
const atk1 = pose(0, -1, false);
const atk2 = pose(1, 3, false);
const atk3 = pose(0, 4, true);
const atk4 = pose(1, 1, true);
const atk5 = pose(0, 0, false);

const POSES: EnemyPoses = {
    idle: [idle1, idle2],
    walk: [walk1, walk2, walk3, walk4],
    attack: [atk1, atk2, atk3, atk4, atk5]
};

export function registerSpiderArt(scene: Scene): void {
    registerEnemyArt(scene, 'spider', POSES);
}
