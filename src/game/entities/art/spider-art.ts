import { Scene } from 'phaser';

import { EnemyPoses, registerEnemyArt } from './enemy-art-utils';

// Paleta: aranha escura com detalhes roxos.
const DARK = 0x2e2438;   // Corpo escuro
const ACCENT = 0x6b4a8a; // Roxo, detalhes

// Aranha: corpo baixo e largo, 8 pernas (4 de cada lado), olhos.
// Frame: 48x48. Corpo: x=[11,37), y=[26,44) — altura de 18px na parte de baixo.

// Pose idle 1: relaxado.
const idle1 = (g: Phaser.GameObjects.Graphics) => {
    // Corpo: óvalo baixo e largo.
    g.fillStyle(DARK).fillEllipse(24, 36, 13, 8);

    // 8 pernas: 4 de cada lado, ligeiramente diagonais.
    // Lado esquerdo (esquerda do corpo).
    g.fillStyle(DARK).fillRect(10, 30, 2, 8);   // Perna 1, superior
    g.fillStyle(DARK).fillRect(9, 35, 2, 8);    // Perna 2, inferior
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);    // Perna 3, base

    // Lado direito.
    g.fillStyle(DARK).fillRect(36, 30, 2, 8);   // Perna 5, superior
    g.fillStyle(DARK).fillRect(37, 35, 2, 8);   // Perna 6, inferior
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);   // Perna 7, base

    // Cabeça: círculo pequeno no topo do corpo.
    g.fillStyle(DARK).fillCircle(24, 26, 4);

    // Olhos: dois pontos roxos.
    g.fillStyle(ACCENT).fillCircle(22, 25, 1);
    g.fillStyle(ACCENT).fillCircle(26, 25, 1);
};

// Pose idle 2: respiração, corpo ligeiramente diferente.
const idle2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 35, 13, 9);

    g.fillStyle(DARK).fillRect(10, 30, 2, 8);
    g.fillStyle(DARK).fillRect(9, 34, 2, 9);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 30, 2, 8);
    g.fillStyle(DARK).fillRect(37, 34, 2, 9);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 26, 4);
    g.fillStyle(ACCENT).fillCircle(22, 25, 1);
    g.fillStyle(ACCENT).fillCircle(26, 25, 1);
};

// Walk 1: perna esquerda 1 levantada.
const walk1 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 36, 13, 8);

    g.fillStyle(DARK).fillRect(10, 28, 2, 10); // Levantada
    g.fillStyle(DARK).fillRect(9, 35, 2, 8);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 30, 2, 8);
    g.fillStyle(DARK).fillRect(37, 35, 2, 8);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 26, 4);
    g.fillStyle(ACCENT).fillCircle(22, 25, 1);
    g.fillStyle(ACCENT).fillCircle(26, 25, 1);
};

// Walk 2: perna esquerda 2 levantada.
const walk2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 35, 13, 9);

    g.fillStyle(DARK).fillRect(10, 30, 2, 8);
    g.fillStyle(DARK).fillRect(9, 33, 2, 10); // Levantada
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 30, 2, 8);
    g.fillStyle(DARK).fillRect(37, 35, 2, 8);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 26, 4);
    g.fillStyle(ACCENT).fillCircle(22, 25, 1);
    g.fillStyle(ACCENT).fillCircle(26, 25, 1);
};

// Walk 3: perna direita 1 levantada.
const walk3 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 36, 13, 8);

    g.fillStyle(DARK).fillRect(10, 30, 2, 8);
    g.fillStyle(DARK).fillRect(9, 35, 2, 8);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 28, 2, 10); // Levantada
    g.fillStyle(DARK).fillRect(37, 35, 2, 8);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 26, 4);
    g.fillStyle(ACCENT).fillCircle(22, 25, 1);
    g.fillStyle(ACCENT).fillCircle(26, 25, 1);
};

// Walk 4: perna direita 2 levantada.
const walk4 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 35, 13, 9);

    g.fillStyle(DARK).fillRect(10, 30, 2, 8);
    g.fillStyle(DARK).fillRect(9, 35, 2, 8);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 30, 2, 8);
    g.fillStyle(DARK).fillRect(37, 33, 2, 10); // Levantada
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 26, 4);
    g.fillStyle(ACCENT).fillCircle(22, 25, 1);
    g.fillStyle(ACCENT).fillCircle(26, 25, 1);
};

// Attack 1 (teia): cabeça baixada, preparação.
const attack1 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 37, 12, 8);

    g.fillStyle(DARK).fillRect(10, 30, 2, 8);
    g.fillStyle(DARK).fillRect(9, 35, 2, 8);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 30, 2, 8);
    g.fillStyle(DARK).fillRect(37, 35, 2, 8);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 27, 3);
    g.fillStyle(ACCENT).fillCircle(22, 26, 1);
    g.fillStyle(ACCENT).fillCircle(26, 26, 1);
};

// Attack 2 (teia): corpo contraído, cuspe.
const attack2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 37, 11, 7);

    g.fillStyle(DARK).fillRect(10, 30, 2, 8);
    g.fillStyle(DARK).fillRect(9, 35, 2, 8);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 30, 2, 8);
    g.fillStyle(DARK).fillRect(37, 35, 2, 8);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 28, 3);
    g.fillStyle(ACCENT).fillCircle(22, 27, 1);
    g.fillStyle(ACCENT).fillCircle(26, 27, 1);
};

// Attack 3 (teia): MID-POINT. Teia disparada, corpo contraído.
const attack3 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 37, 10, 7);

    g.fillStyle(DARK).fillRect(10, 30, 2, 8);
    g.fillStyle(DARK).fillRect(9, 35, 2, 8);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 30, 2, 8);
    g.fillStyle(DARK).fillRect(37, 35, 2, 8);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 28, 3);
    g.fillStyle(ACCENT).fillCircle(22, 27, 1);
    g.fillStyle(ACCENT).fillCircle(26, 27, 1);
};

// Attack 4 (bote): corpo expandido, pernas tensionadas.
const attack4 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 36, 14, 9);

    g.fillStyle(DARK).fillRect(10, 28, 2, 10);
    g.fillStyle(DARK).fillRect(9, 34, 2, 9);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 28, 2, 10);
    g.fillStyle(DARK).fillRect(37, 34, 2, 9);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 26, 4);
    g.fillStyle(ACCENT).fillCircle(22, 25, 1);
    g.fillStyle(ACCENT).fillCircle(26, 25, 1);
};

// Attack 5: recuperação, voltando ao normal.
const attack5 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillEllipse(24, 35, 13, 8);

    g.fillStyle(DARK).fillRect(10, 30, 2, 8);
    g.fillStyle(DARK).fillRect(9, 35, 2, 8);
    g.fillStyle(DARK).fillRect(9, 40, 2, 6);

    g.fillStyle(DARK).fillRect(36, 30, 2, 8);
    g.fillStyle(DARK).fillRect(37, 35, 2, 8);
    g.fillStyle(DARK).fillRect(37, 40, 2, 6);

    g.fillStyle(DARK).fillCircle(24, 26, 4);
    g.fillStyle(ACCENT).fillCircle(22, 25, 1);
    g.fillStyle(ACCENT).fillCircle(26, 25, 1);
};

const POSES: EnemyPoses = {
    idle: [idle1, idle2],
    walk: [walk1, walk2, walk3, walk4],
    attack: [attack1, attack2, attack3, attack4, attack5]
};

export function registerSpiderArt(scene: Scene): void {
    registerEnemyArt(scene, 'spider', POSES);
}
