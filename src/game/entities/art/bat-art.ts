import { Scene } from 'phaser';

import { EnemyPoses, registerEnemyArt } from './enemy-art-utils';

// Morcego: pequeno, roxo, voador. Corpo no meio do frame (voa, não toca o chão).
// Asas mudam de posição a cada pose de walk para simular batida de asa.
const BODY = 0x4a3560;   // Roxo-cinza
const DARK = 0x2a1e38;   // Roxo muito escuro
const ACCENT = 0x6b4a8c; // Roxo mais claro (olhos, detalhe)

// Pose 1 de idle: parado, asas repouso meia altura.
const idle1 = (g: Phaser.GameObjects.Graphics) => {
    // Corpo (elipse pequena, no meio-alto do frame).
    g.fillStyle(BODY).fillEllipse(24, 18, 12, 10);

    // Cabeça (círculo).
    g.fillStyle(DARK).fillCircle(24, 12, 6);

    // Orelhas pontudas (triângulos).
    g.fillStyle(DARK).fillTriangle(19, 10, 22, 6, 22, 10);
    g.fillTriangle(29, 10, 26, 6, 26, 10);

    // Olhos.
    g.fillStyle(ACCENT).fillCircle(22, 11, 1.5);
    g.fillCircle(26, 11, 1.5);

    // Asas (meia altura, repouso).
    // Asa esquerda.
    g.fillStyle(BODY).fillTriangle(12, 18, 8, 15, 10, 22);
    // Asa direita.
    g.fillTriangle(36, 18, 40, 15, 38, 22);

    // Pés (pequenos).
    g.fillStyle(DARK).fillRect(20, 27, 2, 3);
    g.fillRect(26, 27, 2, 3);
};

// Pose 2 de idle: respiração (corpo sobe um pouco, asas levemente mais altas).
const idle2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillEllipse(24, 16, 12, 10);
    g.fillStyle(DARK).fillCircle(24, 10, 6);

    g.fillStyle(DARK).fillTriangle(19, 8, 22, 4, 22, 8);
    g.fillTriangle(29, 8, 26, 4, 26, 8);

    g.fillStyle(ACCENT).fillCircle(22, 9, 1.5);
    g.fillCircle(26, 9, 1.5);

    // Asas mais altas (simulando respiração).
    g.fillStyle(BODY).fillTriangle(12, 16, 8, 12, 10, 20);
    g.fillTriangle(36, 16, 40, 12, 38, 20);

    g.fillStyle(DARK).fillRect(20, 26, 2, 3);
    g.fillRect(26, 26, 2, 3);
};

// Walk 1: asas para cima.
const walk1 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillEllipse(24, 18, 12, 10);
    g.fillStyle(DARK).fillCircle(24, 12, 6);

    g.fillStyle(DARK).fillTriangle(19, 10, 22, 6, 22, 10);
    g.fillTriangle(29, 10, 26, 6, 26, 10);

    g.fillStyle(ACCENT).fillCircle(22, 11, 1.5);
    g.fillCircle(26, 11, 1.5);

    // Asas para cima (batida).
    g.fillStyle(BODY).fillTriangle(12, 16, 6, 10, 10, 18);
    g.fillTriangle(36, 16, 42, 10, 38, 18);

    g.fillStyle(DARK).fillRect(20, 27, 2, 3);
    g.fillRect(26, 27, 2, 3);
};

// Walk 2: asas em repouso.
const walk2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillEllipse(24, 18, 12, 10);
    g.fillStyle(DARK).fillCircle(24, 12, 6);

    g.fillStyle(DARK).fillTriangle(19, 10, 22, 6, 22, 10);
    g.fillTriangle(29, 10, 26, 6, 26, 10);

    g.fillStyle(ACCENT).fillCircle(22, 11, 1.5);
    g.fillCircle(26, 11, 1.5);

    g.fillStyle(BODY).fillTriangle(12, 18, 8, 15, 10, 22);
    g.fillTriangle(36, 18, 40, 15, 38, 22);

    g.fillStyle(DARK).fillRect(20, 27, 2, 3);
    g.fillRect(26, 27, 2, 3);
};

// Walk 3: asas para cima novamente (animação contínua).
const walk3 = walk1;

// Walk 4: asas para baixo (descida da batida).
const walk4 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillEllipse(24, 18, 12, 10);
    g.fillStyle(DARK).fillCircle(24, 12, 6);

    g.fillStyle(DARK).fillTriangle(19, 10, 22, 6, 22, 10);
    g.fillTriangle(29, 10, 26, 6, 26, 10);

    g.fillStyle(ACCENT).fillCircle(22, 11, 1.5);
    g.fillCircle(26, 11, 1.5);

    // Asas para baixo.
    g.fillStyle(BODY).fillTriangle(12, 20, 8, 24, 10, 18);
    g.fillTriangle(36, 20, 42, 24, 38, 18);

    g.fillStyle(DARK).fillRect(20, 27, 2, 3);
    g.fillRect(26, 27, 2, 3);
};

// Attack 1-4: mergulho progressivo (corpo inclina para baixo).
const attack1 = (g: Phaser.GameObjects.Graphics) => {
    // Corpo inclinado para baixo (ângulo de mergulho).
    g.fillStyle(BODY).fillEllipse(24, 22, 12, 9);
    g.fillStyle(DARK).fillCircle(24, 16, 6);

    g.fillStyle(DARK).fillTriangle(19, 14, 22, 10, 22, 14);
    g.fillTriangle(29, 14, 26, 10, 26, 14);

    g.fillStyle(ACCENT).fillCircle(22, 15, 1.5);
    g.fillCircle(26, 15, 1.5);

    // Asas para trás (aerodinâmico).
    g.fillStyle(BODY).fillTriangle(12, 20, 5, 18, 8, 23);
    g.fillTriangle(36, 20, 43, 18, 40, 23);

    g.fillStyle(DARK).fillRect(20, 29, 2, 2);
    g.fillRect(26, 29, 2, 2);
};

const attack2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillEllipse(24, 24, 12, 9);
    g.fillStyle(DARK).fillCircle(24, 18, 6);

    g.fillStyle(DARK).fillTriangle(19, 16, 22, 12, 22, 16);
    g.fillTriangle(29, 16, 26, 12, 26, 16);

    g.fillStyle(ACCENT).fillCircle(22, 17, 1.5);
    g.fillCircle(26, 17, 1.5);

    g.fillStyle(BODY).fillTriangle(12, 22, 5, 20, 8, 25);
    g.fillTriangle(36, 22, 43, 20, 40, 25);

    g.fillStyle(DARK).fillRect(20, 31, 2, 2);
    g.fillRect(26, 31, 2, 2);
};

const attack3 = (g: Phaser.GameObjects.Graphics) => {
    // Mais abaixo ainda.
    g.fillStyle(BODY).fillEllipse(24, 26, 12, 9);
    g.fillStyle(DARK).fillCircle(24, 20, 6);

    g.fillStyle(DARK).fillTriangle(19, 18, 22, 14, 22, 18);
    g.fillTriangle(29, 18, 26, 14, 26, 18);

    g.fillStyle(ACCENT).fillCircle(22, 19, 1.5);
    g.fillCircle(26, 19, 1.5);

    g.fillStyle(BODY).fillTriangle(12, 24, 5, 22, 8, 27);
    g.fillTriangle(36, 24, 43, 22, 40, 27);

    g.fillStyle(DARK).fillRect(20, 33, 2, 2);
    g.fillRect(26, 33, 2, 2);
};

// Attack 4: subindo (volta do mergulho).
const attack4 = attack2;

const attack5 = attack1;

const attack6 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillEllipse(24, 20, 12, 10);
    g.fillStyle(DARK).fillCircle(24, 14, 6);

    g.fillStyle(DARK).fillTriangle(19, 12, 22, 8, 22, 12);
    g.fillTriangle(29, 12, 26, 8, 26, 12);

    g.fillStyle(ACCENT).fillCircle(22, 13, 1.5);
    g.fillCircle(26, 13, 1.5);

    g.fillStyle(BODY).fillTriangle(12, 18, 8, 14, 10, 22);
    g.fillTriangle(36, 18, 40, 14, 38, 22);

    g.fillStyle(DARK).fillRect(20, 28, 2, 3);
    g.fillRect(26, 28, 2, 3);
};

const POSES: EnemyPoses = {
    idle: [idle1, idle2],
    walk: [walk1, walk2, walk3, walk4],
    attack: [attack1, attack2, attack3, attack4, attack5, attack6]
};

export function registerBatArt(scene: Scene): void {
    registerEnemyArt(scene, 'bat', POSES);
}
