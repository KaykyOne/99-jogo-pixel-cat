import { Scene } from 'phaser';

export function createPlayerAnimations(scene: Scene) {

    scene.anims.create({
        key: 'player-jump',

        frames: scene.anims.generateFrameNumbers('player-jump', {
            start: 0,
            end: 5
        }),

        frameRate: 10,

        repeat: 0
    });

    // 3 variantes de golpe (sorteadas a cada ataque, ver attack-variants.ts),
    // todas com o mesmo timing de 6 frames.
    for (let variant = 1; variant <= 3; variant++) {
        scene.anims.create({
            key: `player-attack-${variant}`,

            frames: scene.anims.generateFrameNumbers(`player-attack-${variant}`, {
                start: 0,
                end: 5
            }),

            frameRate: 10,

            repeat: 0
        });
    }

    scene.anims.create({
        key: 'player-idle',

        frames: scene.anims.generateFrameNumbers('player-idle', {
            start: 0,
            end: 3
        }),

        frameRate: 4,

        repeat: -1
    });


    scene.anims.create({
        key: 'player-walk',

        frames: scene.anims.generateFrameNumbers('player-walk', {
            start: 0,
            end: 5
        }),

        frameRate: 10,

        repeat: -1
    });

    scene.anims.create({
        key: 'player-run',

        frames: scene.anims.generateFrameNumbers('player-run', {
            start: 0,
            end: 5
        }),

        frameRate: 14,

        repeat: -1
    });

    scene.anims.create({
        key: 'player-hurt',

        frames: scene.anims.generateFrameNumbers('player-hurt', {
            start: 0,
            end: 1
        }),

        frameRate: 10,

        repeat: 0
    });

    scene.anims.create({
        key: 'player-death',

        frames: scene.anims.generateFrameNumbers('player-death', {
            start: 0,
            end: 5
        }),

        frameRate: 10,

        repeat: 0
    });
}
