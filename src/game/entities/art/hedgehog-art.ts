import { GameObjects, Scene } from 'phaser';

import { detail, drawBody, EnemyPoses, registerEnemyArt, Shape } from './enemy-art-utils';

// Ouriço. Corpo de colisão 28x24, offset 10/24 -> faixa y 24..48, apoiado no
// chão do frame. Andando ele PRECISA ter espinhos nas costas: sem eles a
// silhueta virava um blob marrom e a transformação em bola não fazia sentido.
const SNOUT = 0xb08a5e;      // focinho e patas, claro
const SNOUT_DARK = 0x7a5c3a;
const SPINE = 0x8a6a45;      // manto de espinhos
const SPINE_LIGHT = 0xc0a077; // pontas iluminadas
const EYE = 0x1d140e;
const NOSE = 0x2a1a14;

type G = GameObjects.Graphics;

// Manto de espinhos em leque sobre as costas. `n` controla quantos e `len` o
// comprimento — na bola eles ficam longos e em volta inteira.
function spines(cx: number, cy: number, from: number, to: number, n: number, len: number, r: number): Shape[] {
    const out: Shape[] = [];
    for (let i = 0; i < n; i++) {
        const a = from + ((to - from) * i) / (n - 1);
        const bx = cx + Math.cos(a) * r;
        const by = cy + Math.sin(a) * r;
        const tx = cx + Math.cos(a) * (r + len);
        const ty = cy + Math.sin(a) * (r + len);
        const px = -Math.sin(a) * 2.2;
        const py = Math.cos(a) * 2.2;
        out.push({
            kind: 'tri',
            p: [bx - px, by - py, tx, ty, bx + px, by + py],
            color: i % 2 === 0 ? SPINE : SPINE_LIGHT
        });
    }
    return out;
}

// Andando: corpo baixo, focinho comprido para a frente, espinhos só no dorso.
function walking(step: number, bob: number): { body: Shape[]; detail: Shape[] } {
    const y = 34 + bob;
    return {
        body: [
            // Patas (duas visíveis de cada lado, alternando).
            { kind: 'rect', x: 15, y: 42 - (step === 0 ? 2 : 0), w: 4, h: 6, color: SNOUT_DARK },
            { kind: 'rect', x: 22, y: 42 - (step === 1 ? 2 : 0), w: 4, h: 6, color: SNOUT_DARK },
            { kind: 'rect', x: 29, y: 42 - (step === 0 ? 2 : 0), w: 4, h: 6, color: SNOUT_DARK },
            // Espinhos do dorso, em leque para trás e para cima.
            ...spines(21, y, Math.PI * 1.05, Math.PI * 1.95, 9, 6, 10),
            // Tronco.
            { kind: 'circle', x: 21, y, r: 11, color: SPINE },
            // Cara: focinho pontudo saindo do manto.
            { kind: 'circle', x: 32, y: y + 2, r: 6, color: SNOUT },
            { kind: 'tri', p: [36, y - 1, 44, y + 3, 36, y + 6], color: SNOUT }
        ],
        detail: [
            // Barriga clara embaixo do manto escuro.
            { kind: 'circle', x: 21, y: y + 6, r: 6, color: SNOUT },
            { kind: 'circle', x: 33, y: y, r: 1.6, color: EYE },
            { kind: 'circle', x: 43, y: y + 3, r: 1.6, color: NOSE },
            // Orelhinha.
            { kind: 'circle', x: 29, y: y - 4, r: 2, color: SNOUT_DARK }
        ]
    };
}

// Bola: círculo cheio com espinhos em VOLTA INTEIRA. É o telegraph visual —
// a silhueta muda por completo, então dá para ler à distância que ele ficou
// intocável. `grow` faz a bola inflar durante o enrolar.
function ball(grow: number, spin: number): { body: Shape[]; detail: Shape[] } {
    const r = 12 + grow;
    return {
        body: [
            ...spines(24, 34, spin, spin + Math.PI * 2, 13, 7 + grow, r),
            { kind: 'circle', x: 24, y: 34, r, color: SPINE }
        ],
        detail: [
            // Espiral clara: dá a leitura de rotação mesmo num frame parado.
            { kind: 'circle', x: 24 + Math.cos(spin) * 5, y: 34 + Math.sin(spin) * 5, r: 4, color: SNOUT },
            { kind: 'circle', x: 24 - Math.cos(spin) * 3, y: 34 - Math.sin(spin) * 3, r: 2.5, color: SPINE_LIGHT }
        ]
    };
}

function pose(parts: { body: Shape[]; detail: Shape[] }): (g: G) => void {
    return g => {
        drawBody(g, parts.body);
        detail(g, parts.detail);
    };
}

const idle1 = pose(walking(0, 0));
const idle2 = pose(walking(0, 1));

const walk1 = pose(walking(0, 0));
const walk2 = pose(walking(1, 1));
const walk3 = pose(walking(0, 0));
const walk4 = pose(walking(1, 1));

// Ataque: enrola (bola crescendo) e rola (espinhos abertos, giro avançando).
const atk1 = pose(ball(-4, 0));
const atk2 = pose(ball(-1, 0.5));
const atk3 = pose(ball(1, 1.1));
const atk4 = pose(ball(1, 1.9));
const atk5 = pose(ball(1, 2.7));
const atk6 = pose(ball(0, 3.4));

const POSES: EnemyPoses = {
    idle: [idle1, idle2],
    walk: [walk1, walk2, walk3, walk4],
    attack: [atk1, atk2, atk3, atk4, atk5, atk6]
};

export function registerHedgehogArt(scene: Scene): void {
    registerEnemyArt(scene, 'hedgehog', POSES);
}
