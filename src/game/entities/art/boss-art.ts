import { GameObjects, Scene, Textures } from 'phaser';

import {
    detail,
    drawBody,
    EnemyPoses,
    makeSequence,
    makeTexture,
    PoseDrawer,
    registerEnemyArt,
    Shape
} from './enemy-art-utils';

// Arte dos bosses dedicados, no mesmo frame de 48x48 dos inimigos comuns
// (exigência de syncFacingOffset) e exibida numa escala bem maior. Nenhum
// asset novo: tudo em formas, como bat-art/spider-art já fazem. Todos olham
// para a DIREITA; o flipX cuida do outro lado.
//
// Cada boss tem uma silhueta que o distingue à distância, porque em escala 4+
// o que se lê primeiro é o contorno, não o detalhe:
//   floresta -> sapo-rei: largo, baixo, olhos saltados e coroa.
//   deserto  -> javali: corcunda de cerdas, cabeça baixa e presas.
//   neve     -> maciço e simétrico, com cristais nos ombros.

type G = GameObjects.Graphics;
type Parts = { body: Shape[]; detail: Shape[] };

// --- Sapo-rei (floresta) ----------------------------------------------------
const FR_GREEN = 0x4e9a3c;
const FR_MID = 0x3f8231;
const FR_DARK = 0x2c5e24;
const FR_LIGHT = 0x8fd06a;
const FR_BELLY = 0xeadf9e;
const FR_SAC = 0xf3e2a6;
const FR_EYE = 0xffd447;
const FR_PUPIL = 0x14100c;
const FR_MOUTH = 0x24361a;
const FR_THROAT = 0x5a1830;
const FR_TONGUE = 0xe8708e;
const FR_GOLD = 0xf5c542;
const FR_GEM = 0xd8304a;

type FrogPose = {
    // Agachado (windup do salto, pouso): corpo desce e alarga.
    squash?: number;
    // Papo inflado (windup da língua, engolindo).
    puff?: number;
    // Boca aberta, de 0 a 1.
    mouth?: number;
};

// Cabeça, olhos, coroa e rosto — iguais no chão e no ar, só deslocados.
function frogHead(body: Shape[], details: Shape[], hx: number, hy: number, o: FrogPose): void {
    const mouth = o.mouth ?? 0;

    body.push(
        { kind: 'ellipse', x: 33.5 + hx, y: 30 + hy, w: 22, h: 15, color: FR_GREEN },
        // Olhos saltados: a marca de sapo que se lê de longe.
        { kind: 'circle', x: 28 + hx, y: 22.5 + hy, r: 5.5, color: FR_GREEN },
        { kind: 'circle', x: 37.5 + hx, y: 23.5 + hy, r: 5, color: FR_GREEN },
        // Coroa entre os olhos.
        { kind: 'rect', x: 30 + hx, y: 15.5 + hy, w: 8, h: 3, color: FR_GOLD },
        { kind: 'tri', p: [30 + hx, 15.8 + hy, 31.2 + hx, 11.5 + hy, 32.4 + hx, 15.8 + hy], color: FR_GOLD },
        { kind: 'tri', p: [32.8 + hx, 15.8 + hy, 34 + hx, 10.8 + hy, 35.2 + hx, 15.8 + hy], color: FR_GOLD },
        { kind: 'tri', p: [35.6 + hx, 15.8 + hy, 36.8 + hx, 11.5 + hy, 38 + hx, 15.8 + hy], color: FR_GOLD }
    );

    details.push(
        // Olhos: íris amarela com pupila horizontal, de sapo.
        { kind: 'circle', x: 28 + hx, y: 22.5 + hy, r: 3.7, color: FR_EYE },
        { kind: 'circle', x: 37.5 + hx, y: 23.5 + hy, r: 3.3, color: FR_EYE },
        { kind: 'rect', x: 26.2 + hx, y: 21.7 + hy, w: 3.8, h: 1.7, color: FR_PUPIL },
        { kind: 'rect', x: 35.9 + hx, y: 22.7 + hy, w: 3.4, h: 1.6, color: FR_PUPIL },
        { kind: 'circle', x: 29.2 + hx, y: 21.2 + hy, r: 0.8, color: 0xffffff },
        { kind: 'circle', x: 38.5 + hx, y: 22.3 + hy, r: 0.7, color: 0xffffff },
        // Rubi da coroa e as verrugas claras da cabeça.
        { kind: 'circle', x: 34 + hx, y: 17 + hy, r: 1.1, color: FR_GEM },
        { kind: 'circle', x: 31.5 + hx, y: 26.5 + hy, r: 0.9, color: FR_LIGHT },
        { kind: 'circle', x: 41 + hx, y: 27 + hy, r: 0.8, color: FR_LIGHT },
        // Narina.
        { kind: 'circle', x: 42.8 + hx, y: 28 + hy, r: 0.6, color: FR_MOUTH }
    );

    if (mouth > 0.05) {
        // Bocarra aberta, com a língua enrolada lá dentro.
        details.push(
            { kind: 'tri', p: [29.5 + hx, 32 + hy, 45 + hx, 31 + hy, 45 + hx, 32 + hy + mouth * 6.5], color: FR_THROAT },
            { kind: 'ellipse', x: 40 + hx, y: 33 + hy + mouth * 3, w: 8, h: 1 + mouth * 3, color: FR_TONGUE }
        );
    } else {
        // Sorriso comprido de sapo, virando para cima no canto.
        details.push(
            { kind: 'rect', x: 31 + hx, y: 32.2 + hy, w: 13.2, h: 1.1, color: FR_MOUTH },
            { kind: 'rect', x: 29.8 + hx, y: 31.2 + hy, w: 1.8, h: 1.2, color: FR_MOUTH }
        );
    }
}

function frogBackSpots(details: Shape[], dy: number): void {
    details.push(
        { kind: 'circle', x: 18.5, y: 29 + dy, r: 2.4, color: FR_DARK },
        { kind: 'circle', x: 24, y: 26.5 + dy, r: 1.8, color: FR_DARK },
        { kind: 'circle', x: 13.5, y: 34 + dy, r: 1.7, color: FR_DARK },
        { kind: 'circle', x: 21, y: 34 + dy, r: 1.3, color: FR_DARK },
        { kind: 'circle', x: 27, y: 25.5 + dy, r: 1, color: FR_LIGHT }
    );
}

// Sentado: pernas traseiras dobradas, o formato clássico de sapo.
function frogGround(o: FrogPose = {}): Parts {
    const sq = o.squash ?? 0;
    const puff = o.puff ?? 0;
    const dy = sq * 2.5;
    const footY = 46;

    const body: Shape[] = [
        // Perna de trás do lado de lá, mais escura.
        { kind: 'ellipse', x: 18, y: footY, w: 16 + sq * 2, h: 3.5, color: FR_DARK },
        { kind: 'ellipse', x: 13, y: 40 + sq * 1.5, w: 15, h: 12 - sq, color: FR_DARK },
        // Corpo: alarga e achata agachado.
        { kind: 'ellipse', x: 25, y: 35 + dy, w: 36 + sq * 5, h: 21 - sq * 4, color: FR_GREEN },
        // Coxa do lado de cá, dobrada por cima do corpo.
        { kind: 'ellipse', x: 16, y: 40 + sq * 1.5, w: 17 + sq * 2, h: 13 - sq, color: FR_MID },
        { kind: 'ellipse', x: 21, y: footY + 0.3, w: 17 + sq * 2, h: 3.6, color: FR_MID },
        // Braço da frente e a mão espalmada no chão.
        { kind: 'rect', x: 38, y: 36 + dy, w: 4, h: 9 - dy, color: FR_MID },
        { kind: 'ellipse', x: 41.5, y: footY + 0.3, w: 8, h: 3, color: FR_MID }
    ];
    const details: Shape[] = [
        // Sombra da barriga e brilho do dorso: volume em vez de chapado.
        { kind: 'ellipse', x: 24, y: 42 + dy, w: 28 + sq * 4, h: 5, color: FR_MID },
        { kind: 'ellipse', x: 20, y: 27.5 + dy, w: 10, h: 2.2, color: FR_LIGHT },
        { kind: 'ellipse', x: 30, y: 39 + dy, w: 20 + sq * 3, h: 10 - sq * 2, color: FR_BELLY },
        // Listra clara na coxa: separa a perna do corpo em escala grande.
        { kind: 'ellipse', x: 15, y: 38 + sq * 1.5, w: 9, h: 2, color: FR_LIGHT }
    ];
    frogBackSpots(details, dy);
    frogHead(body, details, 0, sq * 3, o);

    if (puff > 0.05) {
        // Papo inflado por baixo da boca: o aviso da língua.
        // Contorno próprio (o detalhe não leva o contorno do corpo), para o
        // papo não se fundir com a barriga da mesma cor.
        const sacR = 1.5 + puff * 6;
        details.push(
            { kind: 'circle', x: 38, y: 39 + dy, r: sacR + 1, color: 0xb89a5c },
            { kind: 'circle', x: 38, y: 39 + dy, r: sacR, color: FR_SAC },
            { kind: 'circle', x: 36 + puff, y: 37 + dy - puff * 2, r: 0.6 + puff * 1.3, color: 0xffffff }
        );
    }

    return { body, detail: details };
}

// No ar: pernas esticadas para trás e braços à frente, pronto para cair.
function frogAir(o: FrogPose = {}): Parts {
    const lift = 3;
    const body: Shape[] = [
        { kind: 'ellipse', x: 14, y: 36 - lift, w: 13, h: 9, color: FR_DARK },
        { kind: 'ellipse', x: 8.5, y: 41 - lift, w: 12, h: 4.5, color: FR_DARK },
        { kind: 'ellipse', x: 5.5, y: 44 - lift, w: 6, h: 3, color: FR_DARK },
        { kind: 'ellipse', x: 26, y: 32 - lift, w: 34, h: 20, color: FR_GREEN },
        { kind: 'ellipse', x: 16.5, y: 38 - lift, w: 14, h: 9, color: FR_MID },
        { kind: 'ellipse', x: 10, y: 43.5 - lift, w: 13, h: 4.5, color: FR_MID },
        { kind: 'ellipse', x: 6, y: 46 - lift, w: 7, h: 3, color: FR_MID },
        // Braços abertos para a frente e para baixo: a pose do "esmagão".
        { kind: 'rect', x: 37, y: 34 - lift, w: 4, h: 9, color: FR_MID },
        { kind: 'ellipse', x: 40.5, y: 43.5 - lift, w: 9, h: 3, color: FR_MID }
    ];
    const details: Shape[] = [
        { kind: 'ellipse', x: 31, y: 37 - lift, w: 20, h: 9, color: FR_BELLY }
    ];
    frogBackSpots(details, -3 - lift);
    frogHead(body, details, 0.5, -4 - lift, o);

    return { body, detail: details };
}

// --- Javali (deserto) -------------------------------------------------------
const BO_HIDE = 0x7a5236;
const BO_HIDE_DARK = 0x4f3322;
const BO_LEG = 0x5e3d28;
const BO_BRISTLE = 0x2f1d14;
const BO_SNOUT = 0xc08a6e;
const BO_SNOUT_DARK = 0x8a5a45;
const BO_TUSK = 0xf2ead2;
const BO_TUSK_SHADE = 0xcfc4a4;
const BO_EYE = 0xff3b2f;
const BO_HOOF = 0x22150f;
const BO_PAINT = 0xc9412c;
const BO_BONE = 0xe8dfc4;
const BO_BELLY = 0x946a4c;

type BoarPose = {
    // Fase do galope: pernas da frente e de trás se afastam/juntam.
    step?: number;
    // Cabeça baixa (investida) e traseiro erguido (preparando o bote).
    head?: number;
    rump?: number;
    // Pata da frente levantada, cavando o chão.
    paw?: number;
    // Cabeça jogada para cima na chifrada.
    gore?: number;
    // Sacudida do corpo no galope.
    bob?: number;
    // Tonto depois de bater na parede.
    dizzy?: boolean;
};

function boar(o: BoarPose = {}): Parts {
    const st = o.step ?? 0;
    const head = o.head ?? 0;
    const rump = o.rump ?? 0;
    const paw = o.paw ?? 0;
    const gore = o.gore ?? 0;
    const bob = o.bob ?? 0;

    // Cabeça baixa desce bem mais do que avança: é a silhueta de aríete da
    // investida, e avançar demais cortaria as presas na borda do frame.
    const hx = head * 0.8;
    const hy = head * 5.5 - gore * 7 + bob;

    const body: Shape[] = [
        // Rabo fino com tufo.
        { kind: 'tri', p: [6, 25 - rump * 2 + bob, 1, 21 - rump * 2 + bob, 3, 28 - rump * 2 + bob], color: BO_HIDE_DARK },
        // Pernas do lado de lá.
        { kind: 'rect', x: 10 - st, y: 37, w: 4, h: 9, color: BO_HIDE_DARK },
        { kind: 'rect', x: 33 + st, y: 38, w: 4, h: 8, color: BO_HIDE_DARK },
        // Traseiro, barriga e a corcunda do ombro: o volume de aríete.
        { kind: 'ellipse', x: 13, y: 30 - rump * 2 + bob, w: 18, h: 17, color: BO_HIDE },
        { kind: 'ellipse', x: 22, y: 31 + bob, w: 30, h: 19, color: BO_HIDE },
        { kind: 'ellipse', x: 30, y: 27 + head + bob, w: 20, h: 19, color: BO_HIDE }
    ];

    // Crina de cerdas ao longo do dorso, mais alta na corcunda e inclinada
    // para trás, como se o vento da corrida a penteasse.
    for (let index = 0; index < 7; index++) {
        const x = 12 + index * 3.8;
        const t = index / 6;
        const baseY = (21.5 - rump * 2) * (1 - t) + (18 + head) * t + bob;
        const tall = 3 + Math.sin(t * Math.PI) * 3;
        body.push({ kind: 'tri', p: [x - 2, baseY + 2, x - 0.5, baseY - tall, x + 2.5, baseY + 2], color: BO_BRISTLE });
    }

    body.push(
        // Pernas do lado de cá.
        { kind: 'ellipse', x: 12, y: 36 - rump + bob, w: 10, h: 10, color: BO_HIDE },
        { kind: 'rect', x: 11.5 + st, y: 38, w: 4.5, h: 8, color: BO_LEG },
        { kind: 'rect', x: 28.5 - st, y: 38 - paw * 5, w: 4.5, h: 8, color: BO_LEG },
        // Cabeça, orelha, focinho e mandíbula.
        { kind: 'ellipse', x: 39 + hx, y: 31 + hy, w: 15, h: 13, color: BO_HIDE },
        { kind: 'tri', p: [33 + hx, 26 + hy, 34.5 + hx - head * 2, 19 + hy, 38 + hx, 25 + hy], color: BO_HIDE_DARK },
        { kind: 'rect', x: 43 + hx, y: 31.5 + hy, w: 4.5, h: 7, color: BO_SNOUT },
        { kind: 'ellipse', x: 42 + hx, y: 38 + hy, w: 9, h: 4, color: BO_HIDE_DARK },
        // Presas: a de lá mais curta e sombreada, a de cá grande, de marfim.
        { kind: 'tri', p: [40.5 + hx, 38 + hy, 43.5 + hx, 31 + hy, 42.5 + hx, 38.6 + hy], color: BO_TUSK_SHADE },
        { kind: 'tri', p: [42.5 + hx, 38.6 + hy, 46.8 + hx, 28.5 + hy, 45 + hx, 39.2 + hy], color: BO_TUSK }
    );

    const details: Shape[] = [
        { kind: 'ellipse', x: 22, y: 38 + bob, w: 24, h: 4.5, color: BO_BELLY },
        // Pintura de guerra no ombro, de tribo do deserto.
        { kind: 'tri', p: [25, 28 + bob, 32, 23.5 + head + bob, 32, 26 + head + bob], color: BO_PAINT },
        { kind: 'tri', p: [25, 32 + bob, 32, 27.5 + head + bob, 32, 30 + head + bob], color: BO_PAINT },
        // Colar de ossinhos no pescoço.
        { kind: 'circle', x: 34 + hx * 0.5, y: 34.5 + hy * 0.5, r: 1, color: BO_BONE },
        { kind: 'circle', x: 35.6 + hx * 0.6, y: 36.4 + hy * 0.6, r: 1, color: BO_BONE },
        { kind: 'circle', x: 37.4 + hx * 0.7, y: 38 + hy * 0.7, r: 1, color: BO_BONE },
        // Disco do focinho e as narinas.
        { kind: 'ellipse', x: 47.3 + hx, y: 35 + hy, w: 2.4, h: 6, color: BO_SNOUT_DARK },
        { kind: 'circle', x: 47.4 + hx, y: 33.6 + hy, r: 0.5, color: BO_BRISTLE },
        { kind: 'circle', x: 47.4 + hx, y: 36.4 + hy, r: 0.5, color: BO_BRISTLE },
        // Cascos.
        { kind: 'rect', x: 11.5 + st, y: 45, w: 4.5, h: 2, color: BO_HOOF },
        { kind: 'rect', x: 28.5 - st, y: 45 - paw * 5, w: 4.5, h: 2, color: BO_HOOF },
        // Bochecha clara e barbicha: separam a cabeça do corpo.
        { kind: 'ellipse', x: 40.5 + hx, y: 34.5 + hy, w: 6, h: 3.5, color: 0x9a6d4f },
        { kind: 'tri', p: [37 + hx, 36 + hy, 39 + hx, 41.5 + hy, 40.5 + hx, 36.5 + hy], color: BO_BRISTLE },
        // Cicatriz clara no flanco.
        { kind: 'tri', p: [16, 27 + bob, 21, 31 + bob, 16.5, 28.5 + bob], color: 0xa9805f }
    ];

    if (o.dizzy) {
        // Olho em X: tonto.
        details.push(
            { kind: 'tri', p: [38 + hx, 27.2 + hy, 41.5 + hx, 30.5 + hy, 38.6 + hx, 30.5 + hy], color: BO_BRISTLE },
            { kind: 'tri', p: [41 + hx, 27.2 + hy, 38 + hx, 30.5 + hy, 41.6 + hx, 30.5 + hy], color: BO_BRISTLE }
        );
    } else {
        details.push(
            // Sobrancelha franzida e olho vermelho brilhando: bravo.
            { kind: 'tri', p: [36.8 + hx, 26.4 + hy, 42.4 + hx, 27.6 + hy, 36.8 + hx, 27.9 + hy], color: BO_BRISTLE },
            { kind: 'circle', x: 39.6 + hx, y: 29 + hy, r: 1.7, color: BO_EYE },
            { kind: 'circle', x: 40.1 + hx, y: 28.5 + hy, r: 0.6, color: 0xffd28a }
        );
    }

    // Tudo 2px para a esquerda: com a cabeça baixa, focinho e presas
    // encostavam na borda direita do frame e o contorno saía cortado.
    return { body: shiftShapes(body, -2), detail: shiftShapes(details, -2) };
}

function shiftShapes(shapes: Shape[], dx: number): Shape[] {
    return shapes.map(shape =>
        shape.kind === 'tri'
            ? { ...shape, p: shape.p.map((value, index) => (index % 2 === 0 ? value + dx : value)) as typeof shape.p }
            : { ...shape, x: shape.x + dx }
    );
}

// --- Boss da neve -----------------------------------------------------------
const S_ICE = 0x8fc4e8;
const S_ICE_DARK = 0x4f7f9e;
const S_CRYSTAL = 0xd8f2ff;
const S_CORE = 0x3aa8ff;

// `raise` ergue os braços (windol do soco no chão), `glow` engorda o núcleo.
function snow(raise: number, glow: number, step: number): Parts {
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

function pose(parts: Parts): PoseDrawer {
    return (g: G) => {
        // Contorno mais grosso que o dos inimigos comuns: em escala 4+ um
        // contorno de 1px vira um fiozinho e a silhueta se perde no fundo.
        drawBody(g, parts.body, 2);
        detail(g, parts.detail);
    };
}

// Animações de boss: além de idle/walk/attack-1 (as que o BossBase e o
// BaseEnemy tocam por conta própria), cada boss tem animações NOMEADAS por
// golpe — `${key}-${nome}` — que a própria classe escolhe. Com uma sequência
// única de ataque, a língua do sapo e o salto teriam a mesma cara.
type AnimDef = { poses: PoseDrawer[]; frameRate: number; repeat: number };

function registerBossAnims(scene: Scene, key: string, anims: Record<string, AnimDef>): void {
    if (scene.anims.exists(`${key}-idle`)) {
        return;
    }

    // O construtor do sprite pede uma TEXTURA `${key}-idle`.
    makeTexture(scene, `${key}-idle`, anims.idle.poses[0]);
    scene.textures.get(`${key}-idle`).setFilter(Textures.FilterMode.NEAREST);

    for (const [name, def] of Object.entries(anims)) {
        const frames = makeSequence(scene, `${key}-${name}-frame`, def.poses);
        // Filtro de pixel nítido: a arte é desenhada a 48px e exibida a 4x+;
        // suavizada, ela virava um borrão ao lado do cenário em pixel art.
        frames.forEach(frame => scene.textures.get(frame).setFilter(Textures.FilterMode.NEAREST));
        scene.anims.create({
            key: `${key}-${name}`,
            frames: frames.map(frame => ({ key: frame })),
            frameRate: def.frameRate,
            repeat: def.repeat
        });
    }
}

const f = (o?: FrogPose) => pose(frogGround(o));
const fa = (o?: FrogPose) => pose(frogAir(o));

const FROG_ANIMS: Record<string, AnimDef> = {
    // Respira pelo papo, devagar.
    idle: { poses: [f({ puff: 0.15 }), f({ puff: 0.4 }), f({ puff: 0.25 })], frameRate: 3, repeat: -1 },
    // Anda aos saltinhos.
    walk: { poses: [f({ squash: 0.6 }), fa(), fa(), f({ squash: 0.5 }), f()], frameRate: 9, repeat: -1 },
    // Windup da língua: papo enchendo e boca entreabrindo.
    'attack-1': {
        poses: [f({ puff: 0.5, mouth: 0.1 }), f({ puff: 0.9, mouth: 0.25 }), f({ puff: 1, mouth: 0.35 }), f({ puff: 0.85, mouth: 0.3 })],
        frameRate: 8,
        repeat: -1
    },
    'tongue-out': { poses: [f({ puff: 0.2, mouth: 1 })], frameRate: 1, repeat: -1 },
    // Engolindo quem a língua trouxe: papo cheio, boca fechada.
    gulp: { poses: [f({ puff: 1, squash: 0.2 }), f({ puff: 0.8, squash: 0.3 })], frameRate: 7, repeat: -1 },
    // Agachado tremendo antes do salto.
    crouch: { poses: [f({ squash: 1 }), f({ squash: 0.85 })], frameRate: 14, repeat: -1 },
    air: { poses: [fa()], frameRate: 1, repeat: -1 },
    land: { poses: [f({ squash: 1 }), f({ squash: 0.55 }), f()], frameRate: 10, repeat: 0 }
};

const b = (o?: BoarPose) => pose(boar(o));

const BOAR_ANIMS: Record<string, AnimDef> = {
    // Bufando parado.
    idle: { poses: [b(), b({ head: 0.35 })], frameRate: 3, repeat: -1 },
    walk: {
        poses: [b({ step: -1.5 }), b({ bob: -0.6 }), b({ step: 1.5 }), b({ bob: -0.6 })],
        frameRate: 8,
        repeat: -1
    },
    // Cavando o chão, cabeça baixa e traseiro erguido: o aviso da investida.
    'attack-1': {
        poses: [b({ head: 1, rump: 1, paw: 1 }), b({ head: 1, rump: 1, paw: 0 })],
        frameRate: 8,
        repeat: -1
    },
    // Galope a toda, com o corpo sacudindo.
    charge: {
        poses: [
            b({ head: 1, rump: 0.4, step: -2.5, bob: 0 }),
            b({ head: 1, rump: 0.4, step: 0, bob: -1.4 }),
            b({ head: 1, rump: 0.4, step: 2.5, bob: 0 }),
            b({ head: 1, rump: 0.4, step: 0, bob: -1.4 })
        ],
        frameRate: 14,
        repeat: -1
    },
    // Freando com as patas da frente fincadas.
    skid: { poses: [b({ head: 0.4, rump: -0.5, step: -3 })], frameRate: 1, repeat: -1 },
    // Chifrada: abaixa e joga a cabeça para cima.
    'gore-windup': { poses: [b({ head: 1, rump: 1 }), b({ head: 1.2, rump: 1.1 })], frameRate: 10, repeat: -1 },
    gore: { poses: [b({ gore: 0.5 }), b({ gore: 1 })], frameRate: 12, repeat: 0 },
    dizzy: { poses: [b({ head: 0.9, dizzy: true }), b({ head: 0.6, dizzy: true })], frameRate: 4, repeat: -1 }
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
    registerBossAnims(scene, 'boss-frog', FROG_ANIMS);
    registerBossAnims(scene, 'boss-boar', BOAR_ANIMS);
    registerEnemyArt(scene, 'boss-snow', SNOW_POSES);
}
