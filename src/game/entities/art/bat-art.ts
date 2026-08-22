import { Scene } from 'phaser';

import { ENEMY_FRAME, EnemyPoses, registerEnemyArt } from './enemy-art-utils';

// Morcego — PLACEHOLDER. Uma silhueta chapada só para o inimigo existir na tela
// e a física poder ser testada. Precisa virar um desenho que se leia como
// Morcego, com poses distintas de parado/andando/atacando.
const BODY = 0x4a3560;
const DARK = 0x2a1e38;

const blob = (g: Phaser.GameObjects.Graphics) => {
    g.fillStyle(BODY).fillRoundedRect(10, ENEMY_FRAME - 30, 28, 26, 8);
    g.fillStyle(DARK).fillRect(12, ENEMY_FRAME - 6, 6, 6);
    g.fillStyle(DARK).fillRect(30, ENEMY_FRAME - 6, 6, 6);
};

const POSES: EnemyPoses = {
    idle: [blob],
    walk: [blob],
    attack: [blob]
};

export function registerBatArt(scene: Scene): void {
    registerEnemyArt(scene, 'bat', POSES);
}
