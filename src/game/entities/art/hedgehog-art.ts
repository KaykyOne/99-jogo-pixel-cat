import { Scene } from 'phaser';

import { EnemyPoses, registerEnemyArt } from './enemy-art-utils';

// Ouriço: andando é uma criatura redonda com patas; attack é uma BOLA DE
// ESPINHOS completamente diferente, isso é o telegraph visual.
const BODY = 0x8a6a45;    // Marrom claro
const DARK = 0x4a3524;    // Marrom muito escuro
const SPINES = 0xa08a6f;  // Marrom mais claro (espinhos)
const ACCENT = 0x2a1a14;  // Preto-marrom (olhos)

// Idle 1: parado, corpo relaxado.
const idle1 = (g: Phaser.GameObjects.Graphics) => {
    // Corpo redondo.
    g.fillStyle(BODY).fillCircle(24, 22, 11);

    // Cabeça (topo do corpo).
    g.fillStyle(DARK).fillCircle(24, 14, 7);

    // Olhos.
    g.fillStyle(ACCENT).fillCircle(20, 12, 1.5);
    g.fillCircle(28, 12, 1.5);

    // Focinho (pequeno triângulo).
    g.fillStyle(BODY).fillTriangle(24, 18, 22, 20, 26, 20);

    // Patas (4 retângulos pequenos embaixo).
    g.fillStyle(DARK).fillRect(15, 31, 3, 5);
    g.fillRect(21, 32, 3, 4);
    g.fillRect(26, 32, 3, 4);
    g.fillRect(33, 31, 3, 5);
};

// Idle 2: respiração (corpo sobe um pouco).
const idle2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 20, 11);
    g.fillStyle(DARK).fillCircle(24, 12, 7);

    g.fillStyle(ACCENT).fillCircle(20, 10, 1.5);
    g.fillCircle(28, 10, 1.5);

    g.fillStyle(BODY).fillTriangle(24, 16, 22, 18, 26, 18);

    g.fillStyle(DARK).fillRect(15, 30, 3, 5);
    g.fillRect(21, 31, 3, 4);
    g.fillRect(26, 31, 3, 4);
    g.fillRect(33, 30, 3, 5);
};

// Walk 1: começando a andar (corpo relaxado, pata dianteira levantada).
const walk1 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 22, 11);
    g.fillStyle(DARK).fillCircle(24, 14, 7);

    g.fillStyle(ACCENT).fillCircle(20, 12, 1.5);
    g.fillCircle(28, 12, 1.5);

    g.fillStyle(BODY).fillTriangle(24, 18, 22, 20, 26, 20);

    // Patas: dianteira esquerda levantada.
    g.fillStyle(DARK).fillRect(15, 29, 3, 5);
    g.fillRect(21, 31, 3, 4);
    g.fillRect(26, 32, 3, 4);
    g.fillRect(33, 30, 3, 5);
};

// Walk 2: andando (patas traseiras pra trás).
const walk2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 21, 11);
    g.fillStyle(DARK).fillCircle(24, 13, 7);

    g.fillStyle(ACCENT).fillCircle(20, 11, 1.5);
    g.fillCircle(28, 11, 1.5);

    g.fillStyle(BODY).fillTriangle(24, 17, 22, 19, 26, 19);

    // Patas em movimento.
    g.fillStyle(DARK).fillRect(15, 30, 3, 5);
    g.fillRect(20, 32, 3, 4);
    g.fillRect(27, 31, 3, 4);
    g.fillRect(33, 30, 3, 5);
};

// Walk 3: pata dianteira direita levantada.
const walk3 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 22, 11);
    g.fillStyle(DARK).fillCircle(24, 14, 7);

    g.fillStyle(ACCENT).fillCircle(20, 12, 1.5);
    g.fillCircle(28, 12, 1.5);

    g.fillStyle(BODY).fillTriangle(24, 18, 22, 20, 26, 20);

    // Patas: dianteira direita levantada.
    g.fillStyle(DARK).fillRect(15, 30, 3, 5);
    g.fillRect(21, 32, 3, 4);
    g.fillRect(26, 30, 3, 4);
    g.fillRect(33, 31, 3, 5);
};

// Walk 4: patas traseiras pra frente.
const walk4 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 21, 11);
    g.fillStyle(DARK).fillCircle(24, 13, 7);

    g.fillStyle(ACCENT).fillCircle(20, 11, 1.5);
    g.fillCircle(28, 11, 1.5);

    g.fillStyle(BODY).fillTriangle(24, 17, 22, 19, 26, 19);

    g.fillStyle(DARK).fillRect(15, 30, 3, 5);
    g.fillRect(21, 31, 3, 4);
    g.fillRect(26, 32, 3, 4);
    g.fillRect(33, 30, 3, 5);
};

// Attack 1: começando a enrolar (corpo fica mais redondo, espinhos aparecem).
const attack1 = (g: Phaser.GameObjects.Graphics) => {
    // Bola de espinhos: círculo grande no centro.
    g.fillStyle(BODY).fillCircle(24, 22, 13);

    // Espinhos em volta (triângulos apontados pra fora).
    g.fillStyle(SPINES);
    // Topo.
    g.fillTriangle(24, 8, 20, 12, 28, 12);
    // Cima-direita.
    g.fillTriangle(34, 14, 32, 20, 38, 18);
    // Direita.
    g.fillTriangle(39, 22, 36, 26, 40, 28);
    // Baixo-direita.
    g.fillTriangle(34, 30, 38, 26, 32, 34);
    // Baixo.
    g.fillTriangle(24, 36, 28, 32, 20, 32);
    // Baixo-esquerda.
    g.fillTriangle(14, 30, 10, 26, 16, 34);
    // Esquerda.
    g.fillTriangle(9, 22, 12, 26, 8, 28);
    // Cima-esquerda.
    g.fillTriangle(14, 14, 10, 18, 16, 20);
};

// Attack 2-4: bola de espinhos em diferentes ângulos (simulando rotação).
const attack2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 22, 13);

    g.fillStyle(SPINES);
    // Espinhos rotacionados (um pouco mais para a direita).
    g.fillTriangle(28, 9, 25, 13, 32, 11);
    g.fillTriangle(38, 16, 35, 22, 42, 20);
    g.fillTriangle(37, 28, 40, 34, 36, 36);
    g.fillTriangle(28, 35, 32, 32, 26, 38);
    g.fillTriangle(20, 35, 16, 32, 18, 38);
    g.fillTriangle(10, 28, 6, 34, 12, 36);
    g.fillTriangle(11, 16, 6, 22, 14, 20);
    g.fillTriangle(20, 9, 17, 13, 24, 11);
};

const attack3 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 22, 13);

    g.fillStyle(SPINES);
    // Espinhos mais pra direita ainda.
    g.fillTriangle(32, 10, 30, 14, 36, 12);
    g.fillTriangle(39, 18, 36, 24, 44, 22);
    g.fillTriangle(36, 30, 40, 36, 34, 38);
    g.fillTriangle(24, 36, 30, 34, 22, 40);
    g.fillTriangle(16, 36, 14, 34, 18, 40);
    g.fillTriangle(12, 30, 8, 36, 14, 38);
    g.fillTriangle(13, 18, 8, 24, 16, 22);
    g.fillTriangle(16, 10, 14, 14, 22, 12);
};

// Attack 4: bola vista de cima ou em rotação completa.
const attack4 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 22, 13);

    g.fillStyle(SPINES);
    // Espinhos em volta uniformemente.
    const centerX = 24;
    const centerY = 22;
    const radius = 15;
    const spineLength = 6;
    const spineCount = 8;

    for (let i = 0; i < spineCount; i++) {
        const angle = (i / spineCount) * Math.PI * 2;
        const tipX = centerX + Math.cos(angle) * (radius + spineLength);
        const tipY = centerY + Math.sin(angle) * (radius + spineLength);
        const sideX1 = centerX + Math.cos(angle + 0.3) * radius;
        const sideY1 = centerY + Math.sin(angle + 0.3) * radius;
        const sideX2 = centerX + Math.cos(angle - 0.3) * radius;
        const sideY2 = centerY + Math.sin(angle - 0.3) * radius;

        g.fillTriangle(tipX, tipY, sideX1, sideY1, sideX2, sideY2);
    }
};

// Attack 5: desacelerando (espinhos ainda fora, mas bola começa a voltar ao normal).
const attack5 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 22, 12);

    g.fillStyle(SPINES);
    g.fillTriangle(24, 9, 20, 13, 28, 13);
    g.fillTriangle(36, 15, 34, 21, 40, 19);
    g.fillTriangle(38, 29, 35, 35, 39, 37);
    g.fillTriangle(24, 35, 28, 33, 20, 33);
    g.fillTriangle(10, 29, 12, 35, 8, 37);
    g.fillTriangle(12, 15, 8, 21, 14, 19);
};

// Attack 6: espinhos pra dentro (unrolling começou).
const attack6 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillCircle(24, 22, 11);

    // Espinhos menores/mais para dentro.
    g.fillStyle(SPINES);
    g.fillTriangle(24, 11, 22, 14, 26, 14);
    g.fillTriangle(34, 16, 32, 21, 38, 19);
    g.fillTriangle(35, 28, 34, 33, 38, 35);
    g.fillTriangle(24, 33, 26, 31, 22, 31);
    g.fillTriangle(14, 28, 14, 33, 10, 35);
    g.fillTriangle(14, 16, 10, 19, 16, 21);
};

const POSES: EnemyPoses = {
    idle: [idle1, idle2],
    walk: [walk1, walk2, walk3, walk4],
    attack: [attack1, attack2, attack3, attack4, attack5, attack6]
};

export function registerHedgehogArt(scene: Scene): void {
    registerEnemyArt(scene, 'hedgehog', POSES);
}
