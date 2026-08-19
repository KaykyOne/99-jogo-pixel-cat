import { Scene } from 'phaser';

import { EnemyType } from '../damage/health-config';

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

        // 3 variantes de golpe (sorteadas a cada ataque, ver attack-variants.ts).
        for (let variant = 1; variant <= 3; variant++) {
            scene.anims.create({
                key: `${kind}-attack-${variant}`,
                frames: scene.anims.generateFrameNumbers(`${kind}-attack-${variant}`, { start: 0, end: 5 }),
                frameRate: 10,
                repeat: 0
            });
        }
    }
}