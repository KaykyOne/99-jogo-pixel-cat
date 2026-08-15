import { Scene } from 'phaser';

import { EnemyType } from '../entities/Enemy';

export function createEnemyAnimations(scene: Scene): void {
    const kinds: EnemyType[] = ['graverobber', 'steamman'];

    for (const kind of kinds) {
        scene.anims.create({
            key: `${kind}-idle`,
            frames: scene.anims.generateFrameNumbers(`${kind}-idle`, { start: 0, end: 3 }),
            frameRate: 4,
            repeat: -1
        });

        scene.anims.create({
            key: `${kind}-walk`,
            frames: scene.anims.generateFrameNumbers(`${kind}-walk`, { start: 0, end: 5 }),
            frameRate: 8,
            repeat: -1
        });
    }
}