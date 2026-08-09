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

    scene.anims.create({
        key: 'player-attack',

        frames: scene.anims.generateFrameNumbers('player-attack', {
            start: 0,
            end: 5
        }),

        frameRate: 10,

        repeat: 0
    });

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
}