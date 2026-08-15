import { Input, Physics, Scene } from 'phaser';

type PlayerKeys = {
    attack: Input.Keyboard.Key;
    right: Input.Keyboard.Key;
    left: Input.Keyboard.Key;
    up: Input.Keyboard.Key;
    down: Input.Keyboard.Key;
};

export class Player extends Physics.Arcade.Sprite {
    private keys: PlayerKeys;

    private speed = 300;
    private isAttacking = false;
    private controlsEnabled = true;

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'player-idle', 0);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setScale(3);

        // O corpo do Arcade multiplica o tamanho (fonte) pelo scale do sprite (3x).
        // 42x42 fonte -> ~126x126 px de mundo, alinhado aos pés do sprite.
        this.body!.setSize(42, 42);
        this.body!.setOffset(3, 6);
        (this.body as Physics.Arcade.Body).setMaxVelocity(this.speed, 900);

        this.setCollideWorldBounds(true);

        this.keys = scene.input.keyboard!.addKeys({
            attack: Input.Keyboard.KeyCodes.F,

            right: Input.Keyboard.KeyCodes.D,
            left: Input.Keyboard.KeyCodes.A,

            up: Input.Keyboard.KeyCodes.W,
            down: Input.Keyboard.KeyCodes.S
        }) as PlayerKeys;
    }

    update() {
        if (!this.controlsEnabled) {
            this.setVelocity(0, 0);
            return;
        }

        if (
            Input.Keyboard.JustDown(this.keys.attack) &&
            !this.isAttacking &&
            this.body!.blocked.down
        ) {
            this.attack();
        }

        if (
            Input.Keyboard.JustDown(this.keys.up) &&
            this.body!.blocked.down &&
            !this.isAttacking
        ) {
            this.jump();
        }

        if (this.isAttacking) {
            this.setVelocityX(0);
            return;
        }

        if (this.keys.left.isDown) {
            this.setVelocityX(-this.speed);
            this.setFlipX(true);
        }
        else if (this.keys.right.isDown) {
            this.setVelocityX(this.speed);
            this.setFlipX(false);
        }
        else {
            this.setVelocityX(0);
        }

        const onGround = this.body!.blocked.down;
        if (onGround && this.body!.velocity.x !== 0) {
            this.play('player-walk', true);
        }
        else if (onGround) {
            this.play('player-idle', true);
        }
    }

    setControlsEnabled(enabled: boolean) {
        this.controlsEnabled = enabled;
    }

    private attack() {
        this.isAttacking = true;

        this.play('player-attack');
        // A anima\u00e7\u00e3o por si s\u00f3 n\u00e3o causa dano. A cena usa este evento para
        // testar uma pequena \u00e1rea em frente ao personagem.
        this.emit('attack', this);

        this.once('animationcomplete-player-attack', () => {
            this.isAttacking = false;
        });
    }

    private jump() {
        this.setVelocityY(-590);

        this.play('player-jump');
    }
}
