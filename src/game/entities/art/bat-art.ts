import { GameObjects, Scene } from 'phaser';

import { detail, drawBody, EnemyPoses, registerEnemyArt, Shape } from './enemy-art-utils';

// Morcego. Voa, então o corpo fica no MEIO do frame e não apoiado embaixo — o
// corpo de colisão (22x16, offset 13/20) cobre exatamente a faixa y 20..36.
// As asas passam disso de propósito: envergadura não precisa colidir.
const FUR = 0x6a4c8c;       // corpo iluminado
const FUR_DARK = 0x3d2a56;  // barriga e sombra
const WING = 0x54397a;      // membrana
const WING_DARK = 0x33234a; // membrana na sombra
const EYE = 0xffd45e;       // olhos amarelos: o único ponto quente do bicho
const FANG = 0xf2e9df;

type G = GameObjects.Graphics;

// Asa presa ao ombro. `tipY` é a altura da ponta (negativo = levantada) e é o
// que faz a batida de asa; `dir` é -1 para a asa da esquerda.
// A membrana é montada com dois triângulos partindo do MESMO ombro, para ela
// nascer colada no corpo — as lascas soltas da versão anterior vinham de
// desenhar a asa longe do tronco.
function wing(dir: number, tipY: number): Shape[] {
    const sx = 24 + dir * 6;
    const tipX = 24 + dir * 22;
    const midX = 24 + dir * 14;

    return [
        { kind: 'tri', p: [sx, 24, tipX, 24 + tipY, midX, 32 + tipY * 0.4], color: WING },
        { kind: 'tri', p: [sx, 27, midX, 32 + tipY * 0.4, sx + dir * 3, 34], color: WING_DARK }
    ];
}

function bat(tipY: number, mouthOpen: boolean): { body: Shape[]; detail: Shape[] } {
    return {
        body: [
            ...wing(-1, tipY),
            ...wing(1, tipY),
            // Tronco compacto.
            { kind: 'circle', x: 24, y: 27, r: 7, color: FUR },
            // Orelhas pontudas, altas.
            { kind: 'tri', p: [20, 22, 18, 12, 23, 21], color: FUR },
            { kind: 'tri', p: [28, 22, 30, 12, 25, 21], color: FUR },
            // Pezinhos pendurados.
            { kind: 'rect', x: 21, y: 33, w: 2, h: 4, color: FUR_DARK },
            { kind: 'rect', x: 25, y: 33, w: 2, h: 4, color: FUR_DARK }
        ],
        detail: [
            // Barriga mais escura: separa o corpo das asas, que são da mesma
            // família de roxo.
            { kind: 'circle', x: 24, y: 31, r: 4, color: FUR_DARK },
            // Miolo rosado das orelhas.
            { kind: 'tri', p: [20, 21, 19, 15, 22, 21], color: FUR_DARK },
            { kind: 'tri', p: [28, 21, 29, 15, 26, 21], color: FUR_DARK },
            // Olhos: dois pontos quentes que fazem o bicho ser visto na
            // caverna, onde tudo é escuro.
            { kind: 'circle', x: 21, y: 26, r: 1.6, color: EYE },
            { kind: 'circle', x: 27, y: 26, r: 1.6, color: EYE },
            // Presas, só na boca aberta do mergulho.
            ...(mouthOpen
                ? [
                      { kind: 'tri', p: [22, 30, 23, 34, 24, 30], color: FANG } as Shape,
                      { kind: 'tri', p: [25, 30, 26, 34, 27, 30], color: FANG } as Shape
                  ]
                : [])
        ]
    };
}

function pose(tipY: number, mouthOpen: boolean): (g: G) => void {
    const parts = bat(tipY, mouthOpen);
    return g => {
        drawBody(g, parts.body);
        detail(g, parts.detail);
    };
}

// Parado (pendurado no ar): asas quase paradas.
const idle1 = pose(-2, false);
const idle2 = pose(2, false);

// Voo: a batida percorre um arco grande (de -10 a +8). Amplitude pequena não
// lê como asa batendo, lê como tremor.
const walk1 = pose(-10, false);
const walk2 = pose(-3, false);
const walk3 = pose(5, false);
const walk4 = pose(8, false);

// Mergulho: asas recolhidas para trás (ponta baixa e curta) e boca aberta.
// O frame do meio é o instante do impacto.
const atk1 = pose(-8, false);
const atk2 = pose(0, true);
const atk3 = pose(9, true);
const atk4 = pose(9, true);
const atk5 = pose(2, false);

const POSES: EnemyPoses = {
    idle: [idle1, idle2],
    walk: [walk1, walk2, walk3, walk4],
    attack: [atk1, atk2, atk3, atk4, atk5]
};

export function registerBatArt(scene: Scene): void {
    registerEnemyArt(scene, 'bat', POSES);
}
