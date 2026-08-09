import { GameObjects, Input, Scene } from 'phaser';

type PlayerKeys = {
    attack: Input.Keyboard.Key;
    right: Input.Keyboard.Key;
    left: Input.Keyboard.Key;
    up: Input.Keyboard.Key;
    down: Input.Keyboard.Key;
};

export class Player extends GameObjects.Sprite {
    private keys: PlayerKeys;

    private speed = 3;
    private isAttacking = false;
    private isJumping = false;

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'player-idle', 0);

        scene.add.existing(this);

        this.setScale(3);

        this.keys = scene.input.keyboard!.addKeys({
            attack: Input.Keyboard.KeyCodes.F,

            right: Input.Keyboard.KeyCodes.D,
            left: Input.Keyboard.KeyCodes.A,

            up: Input.Keyboard.KeyCodes.W,
            down: Input.Keyboard.KeyCodes.S
        }) as PlayerKeys;

        this.on('animationcomplete-player-attack', () => {
            this.isAttacking = false;
        });
    }

    update() {
        if (
            Input.Keyboard.JustDown(this.keys.attack) &&
            !this.isAttacking &&
            !this.isJumping
        ) {
            this.attack();
        }

        if (
            Input.Keyboard.JustDown(this.keys.up) &&
            !this.isJumping &&
            !this.isAttacking
        ) {
            console.log('jump');
            this.jump();
        }


        if (this.isAttacking || this.isJumping) {
            return;
        }

        if (this.keys.left.isDown) {
            this.x -= this.speed;

            this.setFlipX(true);

            this.play('player-walk', true);
        }
        else if (this.keys.right.isDown) {
            this.x += this.speed;

            this.setFlipX(false);

            this.play('player-walk', true);
        }
        else {
            this.play('player-idle', true);
        }
    }

    private attack() {
        this.isAttacking = true;

        this.play('player-attack');

        this.once('animationcomplete-player-attack', () => {
            this.isAttacking = false;
        });
    }

    private jump() {
        this.isJumping = true;

        this.play('player-jump');

        const startY = this.y;

        this.scene.tweens.add({
            targets: this,

            y: startY - 100,

            duration: 300,

            ease: 'Sine.Out',

            yoyo: true,

            onComplete: () => {
                this.isJumping = false;
            }
        });
    }
}