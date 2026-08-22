import { Scene } from 'phaser';

import { EnemyPoses, registerEnemyArt } from './enemy-art-utils';

// Paleta: lhama creme/bege com detalhes escuros.
const LIGHT = 0xd9c9a8; // Creme/bege
const DARK = 0x8a7a5c;  // Escuro, detalhes

// Corpo da lhama: pescoço longo, cabeça pequena, corpo lanoso, 4 pernas finas.
// Frame: 48x48. Corpo: x=[12,36), y=[18,48) — altura de 30px na parte de baixo.

// Pose idle 1: relaxado, respiração inicial.
const idle1 = (g: Phaser.GameObjects.Graphics) => {
    // Patas: 4 finas, separadas.
    g.fillStyle(DARK).fillRect(14, 42, 3, 6);
    g.fillStyle(DARK).fillRect(23, 42, 3, 6);
    g.fillStyle(DARK).fillRect(32, 42, 3, 6);
    g.fillStyle(DARK).fillRect(32, 42, 3, 6); // Erro proposital pra simular 4 patas com espaçamento

    // Ajuste: 4 patas bem espaçadas.
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);  // Frente esquerda
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);  // Trás esquerda
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);  // Trás direita
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);  // Frente direita

    // Corpo: corte redondo, lanoso.
    g.fillStyle(LIGHT).fillRoundedRect(12, 28, 24, 16, 4);

    // Pescoço longo, fino.
    g.fillStyle(LIGHT).fillRect(20, 18, 8, 12);

    // Cabeça pequena no topo.
    g.fillStyle(LIGHT).fillCircle(24, 15, 5);

    // Orelhas pequenas.
    g.fillStyle(DARK).fillCircle(21, 10, 2);
    g.fillStyle(DARK).fillCircle(27, 10, 2);

    // Olho.
    g.fillStyle(DARK).fillCircle(25, 14, 1.5);
};

// Pose idle 2: respiração, ligeiro movimento.
const idle2 = (g: Phaser.GameObjects.Graphics) => {
    // Patas (mesmas).
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);

    // Corpo ligeiramente diferente (respiração).
    g.fillStyle(LIGHT).fillRoundedRect(12, 27, 24, 17, 4);

    // Pescoço.
    g.fillStyle(LIGHT).fillRect(20, 17, 8, 12);

    // Cabeça ligeiramente mais baixa.
    g.fillStyle(LIGHT).fillCircle(24, 16, 5);

    // Orelhas.
    g.fillStyle(DARK).fillCircle(21, 11, 2);
    g.fillStyle(DARK).fillCircle(27, 11, 2);

    // Olho.
    g.fillStyle(DARK).fillCircle(25, 15, 1.5);
};

// Walk 1: pata esquerda frente.
const walk1 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 41, 2, 7);  // Frente esq, levantada
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);  // Trás esq
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);  // Trás dir
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);  // Frente dir

    g.fillStyle(LIGHT).fillRoundedRect(12, 28, 24, 16, 4);
    g.fillStyle(LIGHT).fillRect(20, 18, 8, 12);
    g.fillStyle(LIGHT).fillCircle(24, 15, 5);
    g.fillStyle(DARK).fillCircle(21, 10, 2);
    g.fillStyle(DARK).fillCircle(27, 10, 2);
    g.fillStyle(DARK).fillCircle(25, 14, 1.5);
};

// Walk 2: pata direita frente.
const walk2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);
    g.fillStyle(DARK).fillRect(37, 41, 2, 7);  // Frente dir, levantada

    g.fillStyle(LIGHT).fillRoundedRect(12, 27, 24, 17, 4);
    g.fillStyle(LIGHT).fillRect(20, 17, 8, 12);
    g.fillStyle(LIGHT).fillCircle(24, 16, 5);
    g.fillStyle(DARK).fillCircle(21, 11, 2);
    g.fillStyle(DARK).fillCircle(27, 11, 2);
    g.fillStyle(DARK).fillCircle(25, 15, 1.5);
};

// Walk 3: pata trás esquerda.
const walk3 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 41, 2, 7);  // Trás esq, levantada
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);

    g.fillStyle(LIGHT).fillRoundedRect(12, 28, 24, 16, 4);
    g.fillStyle(LIGHT).fillRect(20, 18, 8, 12);
    g.fillStyle(LIGHT).fillCircle(24, 15, 5);
    g.fillStyle(DARK).fillCircle(21, 10, 2);
    g.fillStyle(DARK).fillCircle(27, 10, 2);
    g.fillStyle(DARK).fillCircle(25, 14, 1.5);
};

// Walk 4: pata trás direita.
const walk4 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);
    g.fillStyle(DARK).fillRect(31, 41, 2, 7);  // Trás dir, levantada
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);

    g.fillStyle(LIGHT).fillRoundedRect(12, 27, 24, 17, 4);
    g.fillStyle(LIGHT).fillRect(20, 17, 8, 12);
    g.fillStyle(LIGHT).fillCircle(24, 16, 5);
    g.fillStyle(DARK).fillCircle(21, 11, 2);
    g.fillStyle(DARK).fillCircle(27, 11, 2);
    g.fillStyle(DARK).fillCircle(25, 15, 1.5);
};

// Attack 1: preparação, cabeça recuada.
const attack1 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);

    g.fillStyle(LIGHT).fillRoundedRect(12, 29, 24, 15, 4);
    g.fillStyle(LIGHT).fillRect(20, 21, 8, 10);
    g.fillStyle(LIGHT).fillCircle(24, 18, 4);
    g.fillStyle(DARK).fillCircle(21, 14, 1.5);
    g.fillStyle(DARK).fillCircle(27, 14, 1.5);
};

// Attack 2: boca aberta, cuspe começando.
const attack2 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);

    g.fillStyle(LIGHT).fillRoundedRect(12, 28, 24, 16, 4);
    g.fillStyle(LIGHT).fillRect(20, 18, 8, 12);
    g.fillStyle(LIGHT).fillCircle(24, 14, 5);
    g.fillStyle(DARK).fillCircle(21, 10, 2);
    g.fillStyle(DARK).fillCircle(27, 10, 2);
    // Boca aberta (arco).
    g.lineStyle(1, DARK).arc(26, 14, 3, 0, Math.PI, false);
};

// Attack 3: MID-POINT (impacto em ~300ms). Cuspe disparado, corpo recuado.
const attack3 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);

    // Corpo recuado (retrocesso do cuspe).
    g.fillStyle(LIGHT).fillRoundedRect(11, 29, 24, 15, 4);
    g.fillStyle(LIGHT).fillRect(19, 21, 8, 10);
    g.fillStyle(LIGHT).fillCircle(23, 18, 4);
    g.fillStyle(DARK).fillCircle(20, 14, 1.5);
    g.fillStyle(DARK).fillCircle(26, 14, 1.5);
};

// Attack 4: recuperação, começando a voltar.
const attack4 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);

    g.fillStyle(LIGHT).fillRoundedRect(12, 27, 24, 17, 4);
    g.fillStyle(LIGHT).fillRect(20, 19, 8, 11);
    g.fillStyle(LIGHT).fillCircle(24, 16, 5);
    g.fillStyle(DARK).fillCircle(21, 11, 2);
    g.fillStyle(DARK).fillCircle(27, 11, 2);
    g.fillStyle(DARK).fillCircle(25, 15, 1.5);
};

// Attack 5: volta ao idle.
const attack5 = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(DARK).fillRect(14, 42, 2, 6);
    g.fillStyle(DARK).fillRect(20, 42, 2, 6);
    g.fillStyle(DARK).fillRect(31, 42, 2, 6);
    g.fillStyle(DARK).fillRect(37, 42, 2, 6);

    g.fillStyle(LIGHT).fillRoundedRect(12, 28, 24, 16, 4);
    g.fillStyle(LIGHT).fillRect(20, 18, 8, 12);
    g.fillStyle(LIGHT).fillCircle(24, 15, 5);
    g.fillStyle(DARK).fillCircle(21, 10, 2);
    g.fillStyle(DARK).fillCircle(27, 10, 2);
    g.fillStyle(DARK).fillCircle(25, 14, 1.5);
};

const POSES: EnemyPoses = {
    idle: [idle1, idle2],
    walk: [walk1, walk2, walk3, walk4],
    attack: [attack1, attack2, attack3, attack4, attack5]
};

export function registerLlamaArt(scene: Scene): void {
    registerEnemyArt(scene, 'llama', POSES);
}
