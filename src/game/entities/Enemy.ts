import { Math as PhaserMath, Physics, Scene } from 'phaser';

export type EnemyType = 'graverobber' | 'steamman';

export class Enemy extends Physics.Arcade.Sprite {
    private readonly kind: EnemyType;
    private readonly speed = 80;

    private direction = 1;
    private patrolMinX: number;
    private patrolMaxX: number;

    private isPaused = false;
    private pauseTimer: number;
    private defeated = false;

    constructor(scene: Scene, x: number, y: number, type: EnemyType) {
        super(scene, x, y, `${type}-idle`, 0);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.kind = type;
        this.setScale(3);

        // 42x42 px de fonte, alinhado aos pés do sprite (igual ao jogador).
        this.body!.setSize(42, 42);
        this.body!.setOffset(3, 6);

        this.setCollideWorldBounds(true);

        const worldWidth = scene.physics.world.bounds.width;
        this.patrolMinX = Math.max(0, x - 180);
        this.patrolMaxX = Math.min(worldWidth, x + 180);

        this.direction = PhaserMath.RND.pick([-1, 1]);

        this.pauseTimer = PhaserMath.Between(1600, 3600);
    }

    setPatrolRange(minX: number, maxX: number): this {
        this.patrolMinX = minX;
        this.patrolMaxX = maxX;
        return this;
    }

    update(_time: number, delta: number): void {
        if (this.defeated) {
            return;
        }

        this.pauseTimer -= delta;

        if (this.isPaused) {
            this.setVelocityX(0);
            this.setFlipX(this.direction < 0);
            this.play(`${this.kind}-idle`, true);

            if (this.pauseTimer <= 0) {
                this.isPaused = false;
                this.direction = this.direction === 1 ? -1 : 1;
                this.pauseTimer = PhaserMath.Between(1800, 4000);
            }

            return;
        }

        if (this.x <= this.patrolMinX) {
            this.direction = 1;
        }
        else if (this.x >= this.patrolMaxX) {
            this.direction = -1;
        }

        this.setVelocityX(this.speed * this.direction);
        this.setFlipX(this.direction < 0);
        this.play(`${this.kind}-walk`, true);

        if (this.pauseTimer <= 0) {
            this.isPaused = true;
            this.pauseTimer = PhaserMath.Between(800, 1800);
        }
    }

    takeHit(direction: number): void {
        if (this.defeated) {
            return;
        }

        this.defeated = true;
        this.setTint(0xffd6d6);
        (this.body as Physics.Arcade.Body).enable = false;

        this.scene.tweens.add({
            targets: this,
            x: this.x + direction * 36,
            y: this.y - 18,
            alpha: 0,
            duration: 220,
            ease: 'Quad.out',
            onComplete: () => this.destroy()
        });
    }
}
