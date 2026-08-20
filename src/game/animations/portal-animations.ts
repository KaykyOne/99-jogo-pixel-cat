import { Scene } from 'phaser';

export function createPortalAnimations(scene: Scene): void {
    scene.anims.create({
        key: 'portal-activating',
        frames: scene.anims.generateFrameNumbers('portal-activate', { start: 0, end: 7 }),
        frameRate: 10,
        repeat: 0
    });

    scene.anims.create({
        key: 'portal-active-loop',
        frames: scene.anims.generateFrameNumbers('portal-activate', { start: 6, end: 7 }),
        frameRate: 6,
        repeat: -1,
        yoyo: true
    });
}
