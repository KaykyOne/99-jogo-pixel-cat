import { GameObjects } from 'phaser';

// Arte dos NPCs da vila, desenhada por blocos — não há asset e não haverá
// nesta parte (ver "Convenções compartilhadas" do plano).
//
// Por que um vocabulário de formas PRÓPRIO, e não o de enemy-art-utils:
// aquele existe para gerar TEXTURAS de 48x48 e só conhece círculo, retângulo
// e triângulo. O NPC é desenhado ao vivo num Graphics dentro de um Container,
// em tamanho real, e a especificação da capivara e do coelho é toda em
// retângulos ARREDONDADOS — com cantos duros os dois viram caixas empilhadas.
//
// Convenção de coordenadas: a origem (0,0) é o chão ENTRE OS PÉS do bicho.
// Tudo cresce para cima (y negativo). É isso que deixa o NPC assentar em
// GROUND_Y como qualquer outra coisa do jogo, sem cálculo de altura no
// chamador.

export type NpcShape =
    | { kind: 'circle'; x: number; y: number; r: number; color: number }
    | { kind: 'rect'; x: number; y: number; w: number; h: number; color: number }
    | { kind: 'rrect'; x: number; y: number; w: number; h: number; r: number; color: number }
    | { kind: 'tri'; p: [number, number, number, number, number, number]; color: number };

// Contorno escuro fino, num marrom quase preto: preto puro brigaria com a
// paleta terrosa do resto do jogo.
const OUTLINE = 0x2a1f16;

function drawShape(g: GameObjects.Graphics, s: NpcShape, grow: number, color: number): void {
    g.fillStyle(color);

    if (s.kind === 'circle') {
        g.fillCircle(s.x, s.y, s.r + grow);
        return;
    }

    if (s.kind === 'rect') {
        g.fillRect(s.x - grow, s.y - grow, s.w + grow * 2, s.h + grow * 2);
        return;
    }

    if (s.kind === 'rrect') {
        g.fillRoundedRect(s.x - grow, s.y - grow, s.w + grow * 2, s.h + grow * 2, s.r + grow);
        return;
    }

    // Triângulo cresce a partir do próprio centro, para o contorno acompanhar
    // a forma em vez de deslocá-la.
    const [x1, y1, x2, y2, x3, y3] = s.p;
    const cx = (x1 + x2 + x3) / 3;
    const cy = (y1 + y2 + y3) / 3;
    const push = (x: number, y: number): [number, number] => {
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        return [x + (dx / len) * grow, y + (dy / len) * grow];
    };
    const [ax, ay] = push(x1, y1);
    const [bx, by] = push(x2, y2);
    const [tx, ty] = push(x3, y3);
    g.fillTriangle(ax, ay, bx, by, tx, ty);
}

// Silhueta em DUAS passadas: primeiro todos os contornos, depois todos os
// preenchimentos. Desenhando peça por peça (contorno + preenchimento de cada
// uma), o contorno da peça seguinte risca a que já estava pintada.
export function drawNpcBody(g: GameObjects.Graphics, shapes: NpcShape[], grow = 2): void {
    for (const s of shapes) {
        drawShape(g, s, grow, OUTLINE);
    }
    for (const s of shapes) {
        drawShape(g, s, 0, s.color);
    }
}

// Detalhe por cima da silhueta fechada (olho, miolo da orelha, brilho). Sem
// contorno: é o que dá volume depois que a forma já está legível.
export function npcDetail(g: GameObjects.Graphics, shapes: NpcShape[]): void {
    for (const s of shapes) {
        drawShape(g, s, 0, s.color);
    }
}

// --- Capivara --------------------------------------------------------------
// Baixa e comprida (~106 x 88). Olha para a direita; o facing -1 é resolvido
// com scaleX no Graphics (ver Npc.ts), então aqui só existe uma versão.
const CAPY_FUR = 0x8a6a45;
const CAPY_HEAD = 0x9c7a50;
const CAPY_DARK = 0x6b5136;

const CAPYBARA_BODY: NpcShape[] = [
    // Patas primeiro: ficam atrás do tronco e só aparecem abaixo dele.
    { kind: 'rect', x: -44, y: -14, w: 12, h: 14, color: CAPY_DARK },
    { kind: 'rect', x: -26, y: -14, w: 12, h: 14, color: CAPY_DARK },
    { kind: 'rect', x: -2, y: -14, w: 12, h: 14, color: CAPY_DARK },
    { kind: 'rect', x: 14, y: -14, w: 12, h: 14, color: CAPY_DARK },

    { kind: 'rrect', x: -52, y: -62, w: 78, h: 50, r: 16, color: CAPY_FUR },

    // Orelhas atrás da cabeça, para a cabeça cobrir a base delas.
    { kind: 'circle', x: 12, y: -76, r: 6, color: CAPY_DARK },
    { kind: 'circle', x: 30, y: -78, r: 6, color: CAPY_DARK },

    { kind: 'rrect', x: 4, y: -74, w: 44, h: 36, r: 12, color: CAPY_HEAD },
    { kind: 'rrect', x: 38, y: -52, w: 18, h: 13, r: 5, color: CAPY_DARK }
];

const CAPYBARA_DETAIL: NpcShape[] = [
    { kind: 'circle', x: 34, y: -62, r: 3, color: 0x1a1410 },
    // Barriga clara: separa o tronco das patas escuras.
    { kind: 'rrect', x: -44, y: -26, w: 60, h: 12, r: 6, color: CAPY_HEAD },
    { kind: 'circle', x: 47, y: -46, r: 2, color: 0x1a1410 }
];

export function drawCapybara(g: GameObjects.Graphics): void {
    drawNpcBody(g, CAPYBARA_BODY);
    npcDetail(g, CAPYBARA_DETAIL);
}

// --- Coelho ----------------------------------------------------------------
// Alto e estreito (~58 x 116).
const RABBIT_FUR = 0xe8e4dc;
const RABBIT_TAIL = 0xf5f2ee;
const RABBIT_PAW = 0xd8d2c8;
const RABBIT_PINK = 0xe6a8b0;

const RABBIT_BODY: NpcShape[] = [
    { kind: 'circle', x: -28, y: -26, r: 9, color: RABBIT_TAIL },

    // Orelhas antes da cabeça: nascem atrás dela.
    { kind: 'rrect', x: -16, y: -114, w: 12, h: 42, r: 6, color: RABBIT_FUR },
    { kind: 'rrect', x: 2, y: -118, w: 12, h: 42, r: 6, color: RABBIT_FUR },

    { kind: 'circle', x: 0, y: -72, r: 17, color: RABBIT_FUR },
    { kind: 'rrect', x: -23, y: -58, w: 46, h: 54, r: 18, color: RABBIT_FUR },

    { kind: 'rrect', x: -20, y: -12, w: 14, h: 12, r: 5, color: RABBIT_PAW },
    { kind: 'rrect', x: 4, y: -12, w: 14, h: 12, r: 5, color: RABBIT_PAW }
];

const RABBIT_DETAIL: NpcShape[] = [
    { kind: 'rrect', x: -14, y: -110, w: 8, h: 32, r: 4, color: RABBIT_PINK },
    { kind: 'rrect', x: 4, y: -114, w: 8, h: 32, r: 4, color: RABBIT_PINK },
    { kind: 'circle', x: 8, y: -75, r: 3, color: 0x1a1410 },
    { kind: 'circle', x: 15, y: -68, r: 3, color: RABBIT_PINK },
    // Avental do boticário: é o que o separa de "coelho genérico".
    { kind: 'rrect', x: -16, y: -44, w: 32, h: 34, r: 10, color: 0xa8c0d8 }
];

export function drawRabbit(g: GameObjects.Graphics): void {
    drawNpcBody(g, RABBIT_BODY);
    npcDetail(g, RABBIT_DETAIL);
}

// --- Tatu ferreiro ---------------------------------------------------------
// Casco em faixas empilhadas: lê como armadura mesmo parado (~78 x 70).
const ARMA_SHELL = 0x7a6152;
const ARMA_BAND = 0x5c4536;
const ARMA_SKIN = 0xb08a5e;

const ARMADILLO_BODY: NpcShape[] = [
    { kind: 'rect', x: -26, y: -12, w: 11, h: 12, color: ARMA_BAND },
    { kind: 'rect', x: -8, y: -12, w: 11, h: 12, color: ARMA_BAND },
    { kind: 'rect', x: 8, y: -12, w: 11, h: 12, color: ARMA_BAND },

    { kind: 'rrect', x: -34, y: -52, w: 62, h: 42, r: 18, color: ARMA_SHELL },
    { kind: 'rrect', x: 22, y: -46, w: 30, h: 28, r: 11, color: ARMA_SKIN },
    { kind: 'tri', p: [-34, -34, -52, -22, -34, -14], color: ARMA_SKIN }
];

const ARMADILLO_DETAIL: NpcShape[] = [
    { kind: 'rect', x: -20, y: -50, w: 5, h: 38, color: ARMA_BAND },
    { kind: 'rect', x: -6, y: -52, w: 5, h: 40, color: ARMA_BAND },
    { kind: 'rect', x: 8, y: -50, w: 5, h: 38, color: ARMA_BAND },
    { kind: 'circle', x: 40, y: -36, r: 2.6, color: 0x1a1410 },
    { kind: 'circle', x: 50, y: -30, r: 2.4, color: 0x2a1a14 },
    // Martelo apoiado no ombro: o ofício aparece na silhueta.
    { kind: 'rect', x: 6, y: -84, w: 5, h: 34, color: 0x6b4a33 },
    { kind: 'rrect', x: -4, y: -92, w: 26, h: 12, r: 3, color: 0x8f8978 }
];

export function drawArmadillo(g: GameObjects.Graphics): void {
    drawNpcBody(g, ARMADILLO_BODY);
    npcDetail(g, ARMADILLO_DETAIL);
}

// --- Rã vigia --------------------------------------------------------------
// Larga e agachada, olhos altos (~66 x 58).
const FROG_SKIN = 0x5f8f4b;
const FROG_BELLY = 0x9dc177;
const FROG_DARK = 0x3f6633;

const FROG_BODY: NpcShape[] = [
    { kind: 'rrect', x: -32, y: -14, w: 18, h: 14, r: 6, color: FROG_DARK },
    { kind: 'rrect', x: 14, y: -14, w: 18, h: 14, r: 6, color: FROG_DARK },
    { kind: 'rrect', x: -30, y: -44, w: 60, h: 36, r: 17, color: FROG_SKIN },
    { kind: 'circle', x: -13, y: -48, r: 10, color: FROG_SKIN },
    { kind: 'circle', x: 13, y: -48, r: 10, color: FROG_SKIN }
];

const FROG_DETAIL: NpcShape[] = [
    { kind: 'rrect', x: -20, y: -26, w: 40, h: 16, r: 8, color: FROG_BELLY },
    { kind: 'circle', x: -13, y: -50, r: 4, color: 0xf2e9c9 },
    { kind: 'circle', x: 13, y: -50, r: 4, color: 0xf2e9c9 },
    { kind: 'circle', x: -12, y: -50, r: 2, color: 0x1a1410 },
    { kind: 'circle', x: 14, y: -50, r: 2, color: 0x1a1410 },
    { kind: 'rect', x: -14, y: -32, w: 28, h: 2, color: FROG_DARK }
];

export function drawFrog(g: GameObjects.Graphics): void {
    drawNpcBody(g, FROG_BODY);
    npcDetail(g, FROG_DETAIL);
}

// --- Passarinho batedor ----------------------------------------------------
// Pequeno e redondo, com bico e cauda em triângulo (~52 x 50).
const BIRD_FEATHER = 0xd98a4a;
const BIRD_WING = 0xa8602f;
const BIRD_BELLY = 0xf2d9a8;

const BIRD_BODY: NpcShape[] = [
    { kind: 'rect', x: -8, y: -10, w: 4, h: 10, color: 0x6b4a33 },
    { kind: 'rect', x: 4, y: -10, w: 4, h: 10, color: 0x6b4a33 },
    { kind: 'tri', p: [-14, -34, -36, -22, -14, -16], color: BIRD_WING },
    { kind: 'circle', x: 0, y: -28, r: 18, color: BIRD_FEATHER },
    { kind: 'circle', x: 12, y: -40, r: 11, color: BIRD_FEATHER },
    { kind: 'tri', p: [22, -42, 36, -37, 22, -32], color: 0xe0b15c }
];

const BIRD_DETAIL: NpcShape[] = [
    { kind: 'circle', x: 2, y: -22, r: 10, color: BIRD_BELLY },
    { kind: 'circle', x: -2, y: -30, r: 7, color: BIRD_WING },
    { kind: 'circle', x: 15, y: -43, r: 2.6, color: 0x1a1410 }
];

export function drawBird(g: GameObjects.Graphics): void {
    drawNpcBody(g, BIRD_BODY);
    npcDetail(g, BIRD_DETAIL);
}
