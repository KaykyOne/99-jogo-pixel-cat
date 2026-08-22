import { Scene } from 'phaser';

import { ENEMY_FRAME, EnemyPoses, registerEnemyArt } from './enemy-art-utils';

// Lhama — PLACEHOLDER. Uma silhueta chapada só para o inimigo existir na tela
// e a física poder ser testada. Precisa virar um desenho que se leia como
// Lhama, com poses distintas de parado/andando/atacando.
const BODY = 0xd9c9a8;
const DARK = 0x8a7a5c;

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

export function registerLlamaArt(scene: Scene): void {
    registerEnemyArt(scene, 'llama', POSES);
}
