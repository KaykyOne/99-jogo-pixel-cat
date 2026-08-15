import { GameObjects, Scene } from 'phaser';

export const HEIGHT = 768;
export const GROUND_Y = 654;
export const PHASE_WIDTH = 2560;

export type PhaseDefinition = {
    key: string;
    name: string;
    subtitle: string;
    draw: (scene: Scene, x0: number) => void;
};

function fillSky(g: GameObjects.Graphics, x0: number, stops: [number, number][]) {
    let prev = 0;
    for (const [stop, color] of stops) {
        g.fillStyle(color).fillRect(x0, prev, PHASE_WIDTH, stop - prev);
        prev = stop;
    }
}

function drawGround(scene: Scene, x0: number, base: number, top: number, speckle: number, accent: number) {
    const g = scene.add.graphics().setDepth(0);
    g.fillStyle(base).fillRect(x0, GROUND_Y, PHASE_WIDTH, HEIGHT - GROUND_Y);
    g.fillStyle(top).fillRect(x0, GROUND_Y, PHASE_WIDTH, 9);
    g.fillStyle(accent).fillRect(x0, GROUND_Y, PHASE_WIDTH, 3);
    g.fillStyle(speckle);
    for (let x = x0 + 18; x < x0 + PHASE_WIDTH; x += 38) {
        const variation = (x * 17) % 13;
        g.fillRect(x, GROUND_Y - variation, 18, variation + 8);
    }
}

function addStars(scene: Scene, x0: number, count: number) {
    const g = scene.add.graphics().setDepth(-9);
    for (let i = 0; i < count; i++) {
        const sx = x0 + ((i * 137.5 + x0 * 0.13) % PHASE_WIDTH);
        const sy = 8 + ((i * 73.3) % 150);
        g.fillStyle(0xffffff, 0.35 + (i % 5) * 0.12).fillRect(sx, sy, 2, 2);
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
    let prev = 654;
    for (const [bottom, color] of stops) {
        g.fillStyle(color).fillRect(x0, bottom, PHASE_WIDTH, prev - bottom);
        prev = bottom;
    }
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
    // 1 - Floresta noturna
    {
        key: 'forest',
        name: 'FLORESTA VERDE',
        subtitle: 'Fronteira da mata noturna',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[170, 0x182b58], [330, 0x274d83], [480, 0x4e78a4], [654, 0xc38d76]]);
            addStars(scene, x0, 120);

            const moon = scene.add.graphics().setDepth(-7);
            moon.fillStyle(0xffe7ae, 0.15).fillCircle(x0 + 2100, 150, 78);
            moon.fillStyle(0xffe2a1, 0.95).fillCircle(x0 + 2100, 150, 42);
            moon.fillStyle(0xe7c78b, 0.55).fillCircle(x0 + 2084, 136, 8);
            moon.fillStyle(0xe7c78b, 0.45).fillCircle(x0 + 2116, 169, 5);

            const far = scene.add.graphics().setDepth(-6);
            far.fillStyle(0x273c59, 0.95);
            let fi = 0;
            for (let x = x0; x < x0 + PHASE_WIDTH; x += 460, fi++) {
                const peak = 250 + (fi % 3) * 55;
                far.fillTriangle(x, 544, x + 230, peak, x + 460, 544);
            }

            const ridge = scene.add.graphics().setDepth(-5);
            ridge.fillStyle(0x183845);
            let ri = 0;
            for (let x = x0 - 40; x < x0 + PHASE_WIDTH; x += 380, ri++) {
                const peak = 390 + (ri % 2) * 30;
                ridge.fillTriangle(x, 600, x + 190, peak, x + 380, 600);
            }

            const forest = scene.add.graphics().setDepth(-3);
            let ti = 0;
            for (let x = 30; x < PHASE_WIDTH - 30; x += 150, ti++) {
                const s = 0.75 + ((ti * 37) % 60) / 100;
                const ty = 500 + ((ti * 19) % 50);
                drawPine(forest, x0 + x, ty, s, 0x213d35, 0x102f31, 0x1d4b43);
            }

            drawClouds(scene, x0, 0xd7e4f2);
            drawGround(scene, x0, 0x294b35, 0x6c9351, 0x3d6a42, 0xa9c66a);

            const details = scene.add.graphics().setDepth(2);
            let di = 0;
            for (let x = 40; x < PHASE_WIDTH; x += 90, di++) {
                details.fillStyle(0x88ad58).fillRect(x0 + x, GROUND_Y - 11 - (di % 3) * 4, 3, 14 + (di % 3) * 4);
                details.fillStyle(0xc2d477).fillRect(x0 + x + 4, GROUND_Y - 7, 3, 9);
            }
        }
    },
    // 2 - Deserto
    {
        key: 'desert',
        name: 'DESERTO DOURADO',
        subtitle: 'Dunas sob o sol escaldante',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[170, 0xfbe3a2], [330, 0xf3b45d], [480, 0xe9843a], [654, 0xd9692f]]);

            const sun = scene.add.graphics().setDepth(-9);
            sun.fillStyle(0xffe08a, 0.25).fillCircle(x0 + 2100, 170, 95);
            sun.fillStyle(0xffe08a, 0.9).fillCircle(x0 + 2100, 170, 58);

            const dunes = scene.add.graphics().setDepth(-6);
            let di = 0;
            for (let x = x0 - 40; x < x0 + PHASE_WIDTH; x += 420, di++) {
                const peakY = 460 + (di % 3) * 40;
                dunes.fillStyle(di % 2 === 0 ? 0xd99840 : 0xc47f33);
                dunes.fillTriangle(x, 654, x + 210, peakY, x + 420, 654);
            }

            const cacti = scene.add.graphics().setDepth(-3);
            let ci = 0;
            for (let x = 160; x < PHASE_WIDTH - 60; x += 320, ci++) {
                drawCactus(cacti, x0 + x, 654, 48 + (ci % 4) * 12, 14 + (ci % 2) * 4);
            }

            drawClouds(scene, x0, 0xffffff);
            drawGround(scene, x0, 0xc78b36, 0xd9a441, 0xa9702a, 0xe0b15c);

            const sand = scene.add.graphics().setDepth(1);
            sand.lineStyle(2, 0x8a5a22, 0.45);
            for (let x = x0 + 20; x < x0 + PHASE_WIDTH; x += 70) {
                sand.lineBetween(x, GROUND_Y + 14, x + 48, GROUND_Y + 14);
                sand.lineBetween(x + 10, GROUND_Y + 28, x + 58, GROUND_Y + 28);
            }
        }
    },
    // 3 - Neve
    {
        key: 'snow',
        name: 'PICOS DE NEVE',
        subtitle: 'Gelo e silêncio nas alturas',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[170, 0x9fc4e8], [330, 0xc7dcf2], [480, 0xe6f2fb], [654, 0xf4fafe]]);

            const mts = scene.add.graphics().setDepth(-6);
            let mi = 0;
            for (let x = x0 - 40; x < x0 + PHASE_WIDTH; x += 420, mi++) {
                const peakY = 320 + (mi % 3) * 30;
                const cx = x + 210;
                mts.fillStyle(0xdcecf7, 0.9);
                mts.fillTriangle(x, 554, cx, peakY, x + 420, 554);
                mts.fillStyle(0xffffff, 0.9);
                mts.fillTriangle(cx - 34, peakY + 54, cx, peakY, cx + 34, peakY + 54);
            }

            const forest = scene.add.graphics().setDepth(-3);
            let ti = 0;
            for (let x = 40; x < PHASE_WIDTH - 40; x += 190, ti++) {
                const s = 0.75 + ((ti * 31) % 55) / 100;
                const ty = 500 + ((ti * 17) % 46);
                drawPine(forest, x0 + x, ty, s, 0x7d634c, 0xeef6fb, 0xcfdfec);
            }

            drawClouds(scene, x0, 0xffffff);
            drawGround(scene, x0, 0xcfe0ef, 0xeaf3fb, 0xb0c7db, 0xffffff);

            const snow = scene.add.graphics().setDepth(1);
            snow.fillStyle(0xffffff, 0.9);
            for (let x = x0 + 24; x < x0 + PHASE_WIDTH; x += 60) {
                snow.fillCircle(x, GROUND_Y + 22, 5);
            }
        }
    },
    // 4 - Caverna
    {
        key: 'cave',
        name: 'CAVERNA PROFUNDA',
        subtitle: 'Ecos na escuridão',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[300, 0x15101e], [500, 0x241836], [654, 0x332243]]);

            const glow = scene.add.graphics().setDepth(-9);
            glow.fillStyle(0xe7b6ff, 0.1).fillCircle(x0 + PHASE_WIDTH / 2, 180, 320);

            const crystals = scene.add.graphics().setDepth(-3);
            const drawCrystal = (cx: number, cy: number, h: number, w: number) => {
                crystals.fillStyle(0x7a4fc0, 0.9).fillTriangle(cx - w / 2, cy, cx, cy - h, cx + w / 2, cy);
                crystals.fillStyle(0xb98ae8, 0.7).fillTriangle(cx - w / 6, cy, cx, cy - h, cx + w / 6, cy);
            };
            [220, 760, 1320, 1880, 2280].forEach((px, i) => {
                drawCrystal(x0 + px, 300 + (i % 3) * 16, 70 + (i % 4) * 18, 30 + (i % 3) * 10);
                drawCrystal(x0 + px + 46, 318 + (i % 3) * 14, 52 + (i % 4) * 12, 24 + (i % 3) * 8);
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
        }
    },
    // 5 - Vulcão (por do sol)
    {
        key: 'volcano',
        name: 'VALE DO VULCÃO',
        subtitle: 'Cinzas queimando o horizonte',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[170, 0x301830], [330, 0x64263a], [480, 0xb13a2e], [654, 0xe0752f]]);

            const sun = scene.add.graphics().setDepth(-9);
            sun.fillStyle(0xff5a3c, 0.5).fillCircle(x0 + PHASE_WIDTH / 2, 330, 100);
            sun.fillStyle(0xffb347, 0.85).fillCircle(x0 + PHASE_WIDTH / 2, 340, 70);

            const stripes = scene.add.graphics().setDepth(-9);
            sunsetStripes(stripes, x0, [[560, 0xe0752f], [480, 0xb13a2e], [410, 0x64263a]]);

            const volcano = scene.add.graphics().setDepth(-6);
            volcano.fillStyle(0x3b241b);
            volcano.fillTriangle(x0 + 480, 654, x0 + 780, 430, x0 + 1080, 654);
            volcano.fillStyle(0x512b1c);
            volcano.fillTriangle(x0 + 760, 654, x0 + 1240, 390, x0 + 1720, 654);
            volcano.fillStyle(0xff7a3c, 0.85).fillTriangle(x0 + 1240, 390, x0 + 1230, 414, x0 + 1250, 414);
            volcano.fillStyle(0xffc847, 0.85).fillCircle(x0 + 1240, 386, 8);

            const smoke = scene.add.graphics().setDepth(-5);
            smoke.fillStyle(0x5a3a3a, 0.4);
            smoke.fillCircle(x0 + 1220, 340, 16);
            smoke.fillCircle(x0 + 1250, 324, 20);
            smoke.fillCircle(x0 + 1280, 346, 14);

            drawClouds(scene, x0, 0xffc9a0);
            drawGround(scene, x0, 0x3f2117, 0x6b3220, 0x54281a, 0xe2683c);

            const lava = scene.add.graphics().setDepth(1);
            lava.fillStyle(0xff8c3a, 0.85);
            let li = 0;
            for (let x = 160; x < PHASE_WIDTH; x += 360, li++) {
                lava.fillRect(x0 + x, GROUND_Y + 12, 26 + (li % 3) * 10, 4);
            }
        }
    },
    // 6 - Ruínas
    {
        key: 'ruins',
        name: 'RUÍNAS DO TEMPLO',
        subtitle: 'A fronteira final',
        draw: (scene, x0) => {
            const sky = scene.add.graphics().setDepth(-10);
            fillSky(sky, x0, [[170, 0x2a2340], [330, 0x3c3157], [480, 0x5c4b70], [654, 0x8a7488]]);

            const moon = scene.add.graphics().setDepth(-7);
            moon.fillStyle(0xe8d9ff, 0.9).fillCircle(x0 + 2100, 150, 44);
            moon.fillStyle(0xc7b3e8, 0.6).fillCircle(x0 + 2088, 138, 7);

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
        }
    }
];
