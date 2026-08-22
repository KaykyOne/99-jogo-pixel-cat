import { GameObjects, Scene } from 'phaser';

export const HEIGHT = 768;
export const GROUND_Y = HEIGHT / 2;
export const PHASE_WIDTH = 2560;

// Vocabulário único de level design. Toda plataforma de toda fase usa estes
// números — é o que faz o mundo ficar legível como um Mario, em vez de cada
// fase inventar a própria altura.
//
// Derivados da física do jogador (ver player-config.ts e a gravidade de 1400
// definida em Game.create):
//   altura máxima de pulo = 620² / (2 · 1400) ≈ 137 px  -> STEP com folga de ~37
//   alcance horizontal    ≈ 255 px a 320 px/s           -> GAP_LONG com folga de ~55
//
// Regras que acompanham estes números:
//   1. Todo `y` de plataforma é GROUND_Y - (n · STEP).
//   2. Superfície de pouso tem width >= MIN_LANDING.
//   3. Vão horizontal é GAP_SHORT ou GAP_LONG, nunca um valor entre eles.
//   4. `climbable` só em parede estreita e alta, no máximo uma por fase.
export const TERRAIN = {
    STEP: 100,
    GAP_SHORT: 120,
    GAP_LONG: 200,
    THICKNESS: 40,
    MIN_LANDING: 120
} as const;

export type PlatformDef = {
    x: number;
    y: number;
    width: number;
    height: number;
    oneWay?: boolean;
    climbable?: boolean;
    // Capa de grama no topo. Desligar em superfícies cujo topo já fica coberto
    // por outra plataforma, senão as duas capas se sobrepõem no mesmo lugar.
    grassCap?: boolean;
};

// As fases não-floresta foram desenhadas originalmente com o chão em 654.
// Somente posições Y absolutas do céu são reescaladas; tamanhos permanecem.
const LEGACY_GROUND_Y = 654;
const V_SCALE = GROUND_Y / LEGACY_GROUND_Y;

function scaleY(y: number): number {
    return y * V_SCALE;
}

// Linha d'água do lago da floresta: só a faixa abaixo dela vira reflexo de
// câmera (ver PhaseScene.setupLakeReflection em Game.ts). Mantém uma margem
// inteira de 40 px do próprio terreno entre o chão andável e a água.
export const FOREST_WATER_TOP_Y = GROUND_Y + 40;

export type PhaseDefinition = {
    key: string;
    name: string;
    subtitle: string;
    draw: (scene: Scene, x0: number) => void;
    platforms?: PlatformDef[];
    // Terreno das plataformas da fase (ver drawPlatforms). Sem ele, elas caem
    // na paleta pintada de PHASE_SURFACE_PALETTES.
    platformTexture?: { grassKey: string; dirtKey: string; scale: number };
};

function fillSky(g: GameObjects.Graphics, x0: number, stops: [number, number][]) {
    let prev = 0;
    for (const [stop, color] of stops) {
        g.fillStyle(color).fillRect(x0, prev, PHASE_WIDTH, stop - prev);
        prev = stop;
    }
}

function drawSurface(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    base: number,
    top: number,
    speckle: number,
    accent: number
) {
    const g = scene.add.graphics().setDepth(0);
    g.fillStyle(base).fillRect(x, y, width, height);
    g.fillStyle(top).fillRect(x, y, width, 9);
    g.fillStyle(accent).fillRect(x, y, width, 3);
    g.fillStyle(speckle);
    for (let px = x + 18; px < x + width; px += 38) {
        const variation = (px * 17) % 13;
        g.fillRect(px, y - variation, 18, variation + 8);
    }

    // Devolvido para quem desenha plataforma poder ajustar a profundidade sem
    // duplicar o desenho (ver drawPlatforms).
    return g;
}

function drawGround(scene: Scene, x0: number, base: number, top: number, speckle: number, accent: number) {
    drawSurface(scene, x0, GROUND_Y, PHASE_WIDTH, HEIGHT - GROUND_Y, base, top, speckle, accent);
}

type SurfacePalette = readonly [base: number, top: number, speckle: number, accent: number];

// As plataformas usam a paleta do terreno da respectiva fase sem exigir que
// cada definição repita cores. A floresta usa tons equivalentes ao seu chão
// pintado, que não é desenhado por drawGround.
const PHASE_SURFACE_PALETTES: Record<string, SurfacePalette> = {
    forest: [0x294b35, 0x5d8a45, 0x3c6b35, 0x8eb85b],
    desert: [0xc78b36, 0xd9a441, 0xa9702a, 0xe0b15c],
    snow: [0xcfe0ef, 0xeaf3fb, 0xb0c7db, 0xffffff],
    cave: [0x251a30, 0x4a3a5a, 0x332442, 0x9a7bc0],
    volcano: [0x3f2117, 0x6b3220, 0x54281a, 0xe2683c],
    ruins: [0x4c473c, 0x6f6a5c, 0x5d584c, 0xa8a286]
};

// Profundidade das plataformas: acima do cenário de fundo e abaixo do
// jogador (20), para ele aparecer pisando em cima delas.
const PLATFORM_DEPTH = 5;

// Alturas medidas no próprio grama-topo.png: os tufos ocupam as primeiras 52
// linhas (alpha parcial) e são desenhados ACIMA da superfície sólida, como
// vegetação passando da borda; a grama densa segue até a linha 150.
const GRASS_SRC_TUFT_H = 52;
const GRASS_SRC_H = 150;

// Quanto a terra desenhada desce ABAIXO do corpo físico da plataforma. O topo
// (onde se pisa) não se mexe — só a base afunda, enterrando o corte reto na
// faixa do chão em vez de deixá-lo à vista como se o monte estivesse pousado
// solto. Em plataforma flutuante vira uma saia de terra pendurada, que também
// lê melhor que um bloco fino cortado no meio do ar.
const PLATFORM_SKIRT = 50;

// Monta a plataforma com o mesmo terreno do chão da fase, em três partes:
// terra no corpo, capa de grama no topo e sombra nas laterais. Vale igual
// para saliências deitadas e paredes em pé — a terra é espelhada na vertical
// no próprio arquivo, então repete sem emenda em qualquer altura.
function drawTexturedPlatform(
    scene: Scene,
    platform: PlatformDef,
    texture: { grassKey: string; dirtKey: string; scale: number }
) {
    const { grassKey, dirtKey, scale } = texture;
    // Alinhar o recorte da textura à posição no mundo evita que todas as
    // plataformas saiam com exatamente o mesmo desenho de terra.
    const tileOffset = Math.round(platform.x / scale);
    const drawnHeight = platform.height + PLATFORM_SKIRT;

    scene.add
        .tileSprite(platform.x, platform.y, platform.width, drawnHeight, dirtKey)
        .setOrigin(0, 0)
        .setTileScale(scale, scale)
        .setTilePosition(tileOffset, 0)
        .setDepth(PLATFORM_DEPTH);

    if (platform.grassCap !== false) {
        scene.add
            .tileSprite(
                platform.x,
                platform.y - GRASS_SRC_TUFT_H * scale,
                platform.width,
                GRASS_SRC_H * scale,
                grassKey
            )
            .setOrigin(0, 0)
            .setTileScale(scale, scale)
            .setTilePosition(tileOffset, 0)
            .setDepth(PLATFORM_DEPTH + 0.1);
    }

    // Fecha o corte reto da terra nas pontas e por baixo, dando volume à
    // borda — importante em plataformas soltas e no muro que fica suspenso
    // sobre a entrada da chaminé.
    const edges = scene.add.graphics().setDepth(PLATFORM_DEPTH + 0.2);
    edges.fillStyle(0x000000, 0.28);
    edges.fillRect(platform.x, platform.y, 3, drawnHeight);
    edges.fillRect(platform.x + platform.width - 3, platform.y, 3, drawnHeight);
    edges.fillRect(platform.x, platform.y + drawnHeight - 3, platform.width, 3);
}

export function drawPlatforms(scene: Scene, phase: PhaseDefinition) {
    const platforms = phase.platforms ?? [];
    if (platforms.length === 0) {
        return;
    }

    const palette = PHASE_SURFACE_PALETTES[phase.key];

    for (const platform of platforms) {
        if (phase.platformTexture) {
            drawTexturedPlatform(scene, platform, phase.platformTexture);
        } else if (palette) {
            // Fases sem textura de terreno própria caem no terreno pintado.
            // Mesma saia da versão texturizada (ver PLATFORM_SKIRT), e acima
            // do chão pintado (depth 0) para as duas superfícies se fundirem.
            const g = drawSurface(
                scene,
                platform.x,
                platform.y,
                platform.width,
                platform.height + PLATFORM_SKIRT,
                ...palette
            );
            g.setDepth(PLATFORM_DEPTH);
        }
    }
}

function drawPine(
    g: GameObjects.Graphics,
    x: number,
    y: number,
    scale: number,
    trunk: number,
    leaf: number,
    shade: number
) {
    const trunkWidth = 10 * scale;
    g.fillStyle(trunk).fillRect(x - trunkWidth / 2, y - 4 * scale, trunkWidth, 70 * scale);
    g.fillStyle(leaf);
    g.fillTriangle(x, y - 116 * scale, x - 46 * scale, y - 18 * scale, x + 46 * scale, y - 18 * scale);
    g.fillTriangle(x, y - 82 * scale, x - 57 * scale, y + 20 * scale, x + 57 * scale, y + 20 * scale);
    g.fillStyle(shade);
    g.fillTriangle(x - 7 * scale, y - 108 * scale, x - 32 * scale, y - 25 * scale, x + 3 * scale, y - 25 * scale);
}

function drawCactus(g: GameObjects.Graphics, x: number, baseY: number, h: number, w: number) {
    g.fillStyle(0x3e7d4a);
    g.fillRoundedRect(x - w / 2, baseY - h, w, h, 4);
    const armY = baseY - h * 0.55;
    g.fillRoundedRect(x - w / 2 - 12, armY, 12, 8, 3);
    g.fillRoundedRect(x - w / 2 - 12, armY - 16, 8, 16, 3);
    g.fillRoundedRect(x + w / 2, armY + 6, 12, 8, 3);
    g.fillRoundedRect(x + w / 2 + 4, armY - 10, 8, 16, 3);
}

function sunsetStripes(g: GameObjects.Graphics, x0: number, stops: [number, number][]) {
    let prev = GROUND_Y;
    for (const [bottom, color] of stops) {
        g.fillStyle(color).fillRect(x0, bottom, PHASE_WIDTH, prev - bottom);
        prev = bottom;
    }
}

// A base azul dá o tom da água por trás do reflexo espelhado.
function drawWaterBase(scene: Scene, x0: number) {
    scene.add
        .rectangle(x0, FOREST_WATER_TOP_Y, PHASE_WIDTH, HEIGHT - FOREST_WATER_TOP_Y, 0x2972a4)
        .setOrigin(0, 0)
        .setDepth(0.5);

    scene.add
        .tileSprite(x0, FOREST_WATER_TOP_Y, PHASE_WIDTH, 16, 'forest-water-edge')
        .setOrigin(0, 0)
        .setTileScale(16 / 207, 16 / 207)
        .setDepth(0.6);
}

function drawClouds(scene: Scene, x0: number, tint: number) {
    // Os PNGs dispon\u00edveis foram exportados com as bordas cortadas; por isso,
    // repet\u00ed-los revelava emendas no c\u00e9u. Estas nuvens s\u00e3o desenhadas inteiras
    // e permanecem no alto do cen\u00e1rio, em duas velocidades de parallax.
    const drawLayer = (scroll: number, y: number, scale: number, alpha: number, offset: number) => {
        const clouds = scene.add.graphics().setDepth(-8).setScrollFactor(scroll, 0);
        clouds.fillStyle(tint, alpha);

        for (let i = 0; i < 9; i++) {
            const cx = x0 + offset + i * 330;
            const cy = y + (i % 3) * 34;
            const width = (118 + (i % 2) * 34) * scale;
            const height = 28 * scale;

            clouds.fillEllipse(cx, cy, width, height);
            clouds.fillCircle(cx - width * 0.25, cy - height * 0.28, height * 0.72);
            clouds.fillCircle(cx, cy - height * 0.52, height * 0.95);
            clouds.fillCircle(cx + width * 0.24, cy - height * 0.24, height * 0.68);
        }
    };

    drawLayer(0.14, 150, 0.7, 0.26, 40);
    drawLayer(0.28, 250, 1, 0.38, 180);
}

export const PHASES: PhaseDefinition[] = [
    // 1 - Floresta (parallax com arte pintada, ver public/assets/florest)
    {
        key: 'forest',
        name: 'FLORESTA VERDE',
        subtitle: 'Fronteira da mata ao amanhecer',
        platformTexture: { grassKey: 'forest-grass-top', dirtKey: 'forest-dirt', scale: 0.3 },
        draw: (scene, x0) => {
            // Janela bem mais larga que a fase, pra sobrar cobertura nas bordas
            // mesmo nas camadas de parallax mais lentas (scrollFactor baixo faz
            // a camada "atrasar" em relação à câmera).
            const parallaxX = x0 - 1000;
            const parallaxWidth = PHASE_WIDTH + 2000;

            // Parallax só no eixo X: com o mundo de volta aos 768 px planos, a
            // câmera não rola na vertical e um fator em Y não teria efeito
            // nenhum — igual às outras cinco fases.
            const skyScale = HEIGHT / 1086;
            scene.add
                .tileSprite(parallaxX, 0, parallaxWidth, HEIGHT, 'forest-sky')
                .setOrigin(0, 0)
                .setScrollFactor(0.05, 0)
                .setTileScale(skyScale, skyScale)
                .setDepth(-10);

            // Montanhas: camada intermediária, base um pouco acima da linha das
            // árvores pra ficar parcialmente encoberta por elas.
            const mountainsHeight = 500;
            const mountainsScale = mountainsHeight / 887;
            scene.add
                .tileSprite(parallaxX, 620, parallaxWidth, mountainsHeight, 'forest-mountains')
                .setOrigin(0, 1)
                .setScrollFactor(0.2, 0)
                .setTileScale(mountainsScale, mountainsScale)
                .setDepth(-6);

            // Árvores e casas: base encostada exatamente na linha do chão
            // (asset já recortado até o último pixel opaco, sem margem
            // transparente embaixo — senão sobra um vão entre a árvore e o
            // chão, com o personagem "flutuando" nele).
            const treesHeight = 450;
            const treesScale = treesHeight / 548;
            scene.add
                .tileSprite(parallaxX, GROUND_Y + 20, parallaxWidth, treesHeight, 'forest-trees')
                .setOrigin(0, 1)
                .setScrollFactor(0.45, 0)
                .setTileScale(treesScale, treesScale)
                .setDepth(-3);

            // Chão: acompanha o jogo 1:1 (scrollFactor 1), alinhado com o corpo
            // físico invisível criado em Game.buildPhysics (mesmo GROUND_Y).
            // A faixa foi preparada com 359 px de altura. TileSprite já repete
            // o desenho na largura; mantê-la em 1:1 evita aumentar os pixels
            // da vegetação na margem do lago.
            const groundTextureHeight = 60;
            scene.add
                .tileSprite(x0, GROUND_Y - 5, PHASE_WIDTH, groundTextureHeight, 'forest-ground')
                .setOrigin(0, 0)
                .setTileScale(0.3, 0.3)
                // Depth 1 (e não 50): a faixa do chão precisa ficar ABAIXO das
                // plataformas, senão ela corta a base dos montes na linha do
                // chão e cada um deles parece uma peça solta pousada em cima.
                // Continua acima da água (0.5/0.6) e abaixo do jogador (20).
                .setDepth(1);

            // Base d'água por baixo do chão inteiro; o reflexo ao vivo (câmera
            // espelhada) é ligado em Game.ts depois que HUD/mapa existem.
            drawWaterBase(scene, x0);

            // Vegetação em cima dos montes (ver `platforms`), reaproveitando
            // drawPine em vez de arte nova. Depth 4 (abaixo das plataformas,
            // que ficam em 5) esconde a base do tronco dentro do monte.
            const moundFlora = scene.add.graphics().setDepth(4);
            drawPine(moundFlora, x0 + 800, GROUND_Y - TERRAIN.STEP, 0.5, 0x6b4a33, 0x4f7a3d, 0x3c5f2d);
            drawPine(moundFlora, x0 + 1260, GROUND_Y - TERRAIN.STEP * 2, 0.4, 0x6b4a33, 0x4f7a3d, 0x3c5f2d);
            drawPine(moundFlora, x0 + 1650, GROUND_Y - TERRAIN.STEP, 0.45, 0x6b4a33, 0x4f7a3d, 0x3c5f2d);
        },
        // Percurso na ordem em que é atravessado: degrau -> degrau duplo ->
        // vão longo -> plataforma solta -> parede escalável -> arena do boss.
        platforms: [
            // Um degrau. Um inimigo patrulha no topo (ver spawnEnemies).
            { x: 760, y: GROUND_Y - TERRAIN.STEP, width: 220, height: TERRAIN.STEP },

            // Dois degraus, alcançado a partir do anterior (GAP_SHORT).
            { x: 1100, y: GROUND_Y - TERRAIN.STEP * 2, width: 200, height: TERRAIN.STEP * 2 },

            // GAP_LONG descendo um degrau: o primeiro pulo que exige
            // compromisso. Fica em 1 STEP (e não em 2) de propósito — a 2
            // STEPs o topo da parede escalável entraria na altura de pulo, e
            // a única coisa segurando o salto seria a distância, com 25px de
            // margem. Aqui a parede fica 200px acima, fora de alcance.
            { x: 1500, y: GROUND_Y - TERRAIN.STEP, width: 180, height: TERRAIN.STEP },

            // Plataforma solta one-way encostada na parede escalável. É daqui
            // que se agarra a parede: PlayerClimb só prende com o corpo caindo
            // ou perto do ápice (velocity.y >= -50) e solta assim que toca o
            // chão, então saltar do chão deixaria uma janela de agarre curta
            // demais. Pulando daqui, o ápice cai no meio da parede.
            {
                x: 1800,
                y: GROUND_Y - TERRAIN.STEP,
                width: 160,
                height: TERRAIN.THICKNESS,
                oneWay: true
            },

            // ÚNICA parede escalável do jogo. O topo fica 3 STEPs acima do
            // chão e 2 STEPs acima da plataforma vizinha — os dois fora do
            // alcance do pulo (137px), então só se passa escalando. É o que
            // tranca a arena do boss, que nasce em 2140 com patrulha a partir
            // de 2040: a parede termina em 2030 para não invadir a arena.
            {
                x: 1960,
                y: GROUND_Y - TERRAIN.STEP * 3,
                width: 70,
                height: TERRAIN.STEP * 3,
                climbable: true
            }
        ]
    },
    // 2 - Deserto
    {
        key: 'desert',
        name: 'DESERTO DOURADO',
        subtitle: 'Dunas sob o sol escaldante',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[scaleY(170), 0xfbe3a2], [scaleY(330), 0xf3b45d], [scaleY(480), 0xe9843a], [GROUND_Y, 0xd9692f]]);

            const sun = scene.add.graphics().setDepth(-9);
            sun.fillStyle(0xffe08a, 0.25).fillCircle(x0 + 2100, 170, 95);
            sun.fillStyle(0xffe08a, 0.9).fillCircle(x0 + 2100, 170, 58);

            const dunes = scene.add.graphics().setDepth(-6);
            let di = 0;
            for (let x = x0 - 40; x < x0 + PHASE_WIDTH; x += 420, di++) {
                const peakY = scaleY(460 + (di % 3) * 40);
                dunes.fillStyle(di % 2 === 0 ? 0xd99840 : 0xc47f33);
                dunes.fillTriangle(x, GROUND_Y, x + 210, peakY, x + 420, GROUND_Y);
            }

            const cacti = scene.add.graphics().setDepth(-3);
            let ci = 0;
            for (let x = 160; x < PHASE_WIDTH - 60; x += 320, ci++) {
                drawCactus(cacti, x0 + x, GROUND_Y, 48 + (ci % 4) * 12, 14 + (ci % 2) * 4);
            }

            drawClouds(scene, x0, 0xffffff);
            drawGround(scene, x0, 0xc78b36, 0xd9a441, 0xa9702a, 0xe0b15c);

            const sand = scene.add.graphics().setDepth(1);
            sand.lineStyle(2, 0x8a5a22, 0.45);
            for (let x = x0 + 20; x < x0 + PHASE_WIDTH; x += 70) {
                sand.lineBetween(x, GROUND_Y + 14, x + 48, GROUND_Y + 14);
                sand.lineBetween(x + 10, GROUND_Y + 28, x + 58, GROUND_Y + 28);
            }
        },
        platforms: [
            { x: 700, y: GROUND_Y - TERRAIN.STEP, width: 240, height: TERRAIN.STEP },
            { x: 1060, y: GROUND_Y - TERRAIN.STEP * 2, width: 200, height: TERRAIN.STEP * 2 },
            {
                x: 1460,
                y: GROUND_Y - TERRAIN.STEP * 2,
                width: 180,
                height: TERRAIN.THICKNESS,
                oneWay: true
            },
            // Termina em 2020: a partir de 2040 é a patrulha do boss.
            { x: 1840, y: GROUND_Y - TERRAIN.STEP, width: 180, height: TERRAIN.STEP }
        ]
    },
    // 3 - Neve
    {
        key: 'snow',
        name: 'PICOS DE NEVE',
        subtitle: 'Gelo e silêncio nas alturas',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[scaleY(170), 0x9fc4e8], [scaleY(330), 0xc7dcf2], [scaleY(480), 0xe6f2fb], [GROUND_Y, 0xf4fafe]]);

            const mts = scene.add.graphics().setDepth(-6);
            let mi = 0;
            for (let x = x0 - 40; x < x0 + PHASE_WIDTH; x += 420, mi++) {
                const peakY = scaleY(320 + (mi % 3) * 30);
                const cx = x + 210;
                mts.fillStyle(0xdcecf7, 0.9);
                mts.fillTriangle(x, scaleY(554), cx, peakY, x + 420, scaleY(554));
                mts.fillStyle(0xffffff, 0.9);
                mts.fillTriangle(cx - 34, peakY + 54, cx, peakY, cx + 34, peakY + 54);
            }

            const forest = scene.add.graphics().setDepth(-3);
            let ti = 0;
            for (let x = 40; x < PHASE_WIDTH - 40; x += 190, ti++) {
                const s = 0.75 + ((ti * 31) % 55) / 100;
                const ty = scaleY(500 + ((ti * 17) % 46));
                drawPine(forest, x0 + x, ty, s, 0x7d634c, 0xeef6fb, 0xcfdfec);
            }

            drawClouds(scene, x0, 0xffffff);
            drawGround(scene, x0, 0xcfe0ef, 0xeaf3fb, 0xb0c7db, 0xffffff);

            const snow = scene.add.graphics().setDepth(1);
            snow.fillStyle(0xffffff, 0.9);
            for (let x = x0 + 24; x < x0 + PHASE_WIDTH; x += 60) {
                snow.fillCircle(x, GROUND_Y + 22, 5);
            }
        },
        platforms: [
            { x: 640, y: GROUND_Y - TERRAIN.STEP, width: 200, height: TERRAIN.STEP },
            { x: 960, y: GROUND_Y - TERRAIN.STEP * 2, width: 240, height: TERRAIN.STEP * 2 },
            {
                x: 1400,
                y: GROUND_Y - TERRAIN.STEP,
                width: 180,
                height: TERRAIN.THICKNESS,
                oneWay: true
            },
            { x: 1780, y: GROUND_Y - TERRAIN.STEP * 2, width: 200, height: TERRAIN.STEP * 2 }
        ]
    },
    // 4 - Caverna
    {
        key: 'cave',
        name: 'CAVERNA PROFUNDA',
        subtitle: 'Ecos na escuridão',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[scaleY(300), 0x15101e], [scaleY(500), 0x241836], [GROUND_Y, 0x332243]]);

            const glow = scene.add.graphics().setDepth(-9);
            glow.fillStyle(0xe7b6ff, 0.1).fillCircle(x0 + PHASE_WIDTH / 2, scaleY(180), 320);

            const crystals = scene.add.graphics().setDepth(-3);
            const drawCrystal = (cx: number, cy: number, h: number, w: number) => {
                crystals.fillStyle(0x7a4fc0, 0.9).fillTriangle(cx - w / 2, cy, cx, cy - h, cx + w / 2, cy);
                crystals.fillStyle(0xb98ae8, 0.7).fillTriangle(cx - w / 6, cy, cx, cy - h, cx + w / 6, cy);
            };
            [220, 760, 1320, 1880, 2280].forEach((px, i) => {
                drawCrystal(x0 + px, scaleY(300 + (i % 3) * 16), 70 + (i % 4) * 18, 30 + (i % 3) * 10);
                drawCrystal(x0 + px + 46, scaleY(318 + (i % 3) * 14), 52 + (i % 4) * 12, 24 + (i % 3) * 8);
            });

            const stalactites = scene.add.graphics().setDepth(2);
            stalactites.fillStyle(0x1c1428);
            let si = 0;
            for (let x = 40; x < PHASE_WIDTH; x += 180, si++) {
                const h = 50 + ((si * 23) % 70);
                stalactites.fillTriangle(x0 + x, 0, x0 + x + 14, 0, x0 + x + 7, h);
            }

            drawGround(scene, x0, 0x251a30, 0x4a3a5a, 0x332442, 0x9a7bc0);

            const pebbles = scene.add.graphics().setDepth(1);
            pebbles.fillStyle(0x4a3a5a, 0.9);
            for (let x = x0 + 40; x < x0 + PHASE_WIDTH; x += 80) {
                pebbles.fillCircle(x, GROUND_Y + 20, 4);
            }
        },
        platforms: [
            { x: 620, y: GROUND_Y - TERRAIN.STEP, width: 220, height: TERRAIN.STEP },
            { x: 960, y: GROUND_Y - TERRAIN.STEP * 2, width: 180, height: TERRAIN.STEP * 2 },
            {
                x: 1340,
                y: GROUND_Y - TERRAIN.STEP * 2,
                width: 160,
                height: TERRAIN.THICKNESS,
                oneWay: true
            },
            { x: 1700, y: GROUND_Y - TERRAIN.STEP, width: 240, height: TERRAIN.STEP }
        ]
    },
    // 5 - Vulcão (por do sol)
    {
        key: 'volcano',
        name: 'VALE DO VULCÃO',
        subtitle: 'Cinzas queimando o horizonte',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[scaleY(170), 0x301830], [scaleY(330), 0x64263a], [scaleY(480), 0xb13a2e], [GROUND_Y, 0xe0752f]]);

            const sun = scene.add.graphics().setDepth(-9);
            sun.fillStyle(0xff5a3c, 0.5).fillCircle(x0 + PHASE_WIDTH / 2, scaleY(330), 100);
            sun.fillStyle(0xffb347, 0.85).fillCircle(x0 + PHASE_WIDTH / 2, scaleY(340), 70);

            const stripes = scene.add.graphics().setDepth(-9);
            sunsetStripes(stripes, x0, [[scaleY(560), 0xe0752f], [scaleY(480), 0xb13a2e], [scaleY(410), 0x64263a]]);

            const volcano = scene.add.graphics().setDepth(-6);
            volcano.fillStyle(0x3b241b);
            volcano.fillTriangle(x0 + 480, GROUND_Y, x0 + 780, scaleY(430), x0 + 1080, GROUND_Y);
            volcano.fillStyle(0x512b1c);
            volcano.fillTriangle(x0 + 760, GROUND_Y, x0 + 1240, scaleY(390), x0 + 1720, GROUND_Y);
            volcano.fillStyle(0xff7a3c, 0.85).fillTriangle(x0 + 1240, scaleY(390), x0 + 1230, scaleY(414), x0 + 1250, scaleY(414));
            volcano.fillStyle(0xffc847, 0.85).fillCircle(x0 + 1240, scaleY(386), 8);

            const smoke = scene.add.graphics().setDepth(-5);
            smoke.fillStyle(0x5a3a3a, 0.4);
            smoke.fillCircle(x0 + 1220, scaleY(340), 16);
            smoke.fillCircle(x0 + 1250, scaleY(324), 20);
            smoke.fillCircle(x0 + 1280, scaleY(346), 14);

            drawClouds(scene, x0, 0xffc9a0);
            drawGround(scene, x0, 0x3f2117, 0x6b3220, 0x54281a, 0xe2683c);

            const lava = scene.add.graphics().setDepth(1);
            lava.fillStyle(0xff8c3a, 0.85);
            let li = 0;
            for (let x = 160; x < PHASE_WIDTH; x += 360, li++) {
                lava.fillRect(x0 + x, GROUND_Y + 12, 26 + (li % 3) * 10, 4);
            }
        },
        platforms: [
            { x: 700, y: GROUND_Y - TERRAIN.STEP, width: 240, height: TERRAIN.STEP },
            {
                x: 1060,
                y: GROUND_Y - TERRAIN.STEP,
                width: 180,
                height: TERRAIN.THICKNESS,
                oneWay: true
            },
            { x: 1360, y: GROUND_Y - TERRAIN.STEP * 2, width: 200, height: TERRAIN.STEP * 2 },
            { x: 1760, y: GROUND_Y - TERRAIN.STEP, width: 220, height: TERRAIN.STEP }
        ]
    },
    // 6 - Ruínas
    {
        key: 'ruins',
        name: 'RUÍNAS DO TEMPLO',
        subtitle: 'A fronteira final',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[scaleY(170), 0x2a2340], [scaleY(330), 0x3c3157], [scaleY(480), 0x5c4b70], [GROUND_Y, 0x8a7488]]);

            const moon = scene.add.graphics().setDepth(-7);
            moon.fillStyle(0xe8d9ff, 0.9).fillCircle(x0 + 2100, scaleY(150), 44);
            moon.fillStyle(0xc7b3e8, 0.6).fillCircle(x0 + 2088, scaleY(138), 7);

            const pillars = scene.add.graphics().setDepth(-3);
            const drawPillar = (px: number, pw: number, ph: number) => {
                pillars.fillStyle(0x7a7466);
                pillars.fillRect(px, GROUND_Y - ph, pw, ph);
                pillars.fillStyle(0x8f8978).fillRect(px - 6, GROUND_Y - ph, pw + 12, 14);
                pillars.fillStyle(0x5c574c, 0.6);
                for (let r = 0; r < ph; r += 26) {
                    pillars.fillRect(px, GROUND_Y - ph + 14 + r, pw, 3);
                }
            };
            let pi = 0;
            for (let x = 120; x < PHASE_WIDTH; x += 520, pi++) {
                drawPillar(x0 + x, 26 + (pi % 2) * 6, 110 + (pi % 3) * 20);
            }

            const steps = scene.add.graphics().setDepth(2);
            const cx = x0 + PHASE_WIDTH / 2;
            steps.fillStyle(0x8f8978);
            steps.fillRect(cx - 60, GROUND_Y - 30, 120, 14);
            steps.fillRect(cx - 44, GROUND_Y - 50, 88, 14);
            steps.fillRect(cx - 28, GROUND_Y - 70, 56, 14);

            drawClouds(scene, x0, 0xd9c9ea);
            drawGround(scene, x0, 0x4c473c, 0x6f6a5c, 0x5d584c, 0xa8a286);
        },
        platforms: [
            { x: 640, y: GROUND_Y - TERRAIN.STEP, width: 200, height: TERRAIN.STEP },
            { x: 960, y: GROUND_Y - TERRAIN.STEP * 2, width: 220, height: TERRAIN.STEP * 2 },
            {
                x: 1380,
                y: GROUND_Y - TERRAIN.STEP * 2,
                width: 180,
                height: TERRAIN.THICKNESS,
                oneWay: true
            },
            // Um inimigo patrulha no topo deste (ver spawnEnemies).
            { x: 1760, y: GROUND_Y - TERRAIN.STEP, width: 240, height: TERRAIN.STEP }
        ]
    }
];
