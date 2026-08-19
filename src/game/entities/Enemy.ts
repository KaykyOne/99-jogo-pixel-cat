import { Math as PhaserMath, Physics, Scene } from 'phaser';

import { DamageSource } from '../damage/damage';
import { Health } from '../damage/Health';
import { ENEMY_STATS } from '../damage/health-config';

export type EnemyType = 'graverobber' | 'steamman';

export type EnemyState = 'alive' | 'hurt' | 'dead';

// Inimigo com máquina de estados simples (alive/hurt/dead). Todo o HP, dano de
// contato, defesa e resistência vem de ENEMY_STATS, preparando o terreno para
// inimigos futuros com valores próprios e ataques próprios.
export class Enemy extends Physics.Arcade.Sprite {
    private readonly kind: EnemyType;
    private readonly speed = 80;

    private readonly health: Health;

    private enemyState: EnemyState = 'alive';
    private direction = 1;
    private patrolMinX: number;
    private patrolMaxX: number;

    private isPaused = false;
    private pauseTimer: number;

    private hurtTimer = 0;

    // Garante que o inimigo não receba mais de um dano no mesmo frame (várias
    // hitboxes/contatos resolvidos no mesmo tick).
    private lastDamageFrame = -1;

    constructor(scene: Scene, x: number, y: number, type: EnemyType) {
        super(scene, x, y, `${type}-idle`, 0);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.kind = type;
        this.setScale(3);

        const stats = ENEMY_STATS[type];
        this.health = new Health(stats.hp, { defense: stats.defense, resistance: stats.resistance });

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

    get currentState(): EnemyState {
        return this.enemyState;
    }

    get isAlive(): boolean {
        return this.enemyState !== 'dead';
    }

    // Dano que o jogador sofre ao encostar neste inimigo.
    get contactDamage(): DamageSource {
        return ENEMY_STATS[this.kind].contactDamage;
    }

    get healthInfo(): Health {
        return this.health;
    }

    setPatrolRange(minX: number, maxX: number): this {
        this.patrolMinX = minX;
        this.patrolMaxX = maxX;
        return this;
    }

    update(_time: number, delta: number): void {
        if (this.enemyState === 'dead') {
            return;
        }

        if (this.enemyState === 'hurt') {
            this.updateHurt(delta);
            return;
        }

        this.updatePatrol(delta);
    }

    // Recebe dano de um ataque (com knockback e direção). Retorna o dano aplicado
    // ou 0 se o golpe foi ignorado (mesmo frame ou inimigo já morto).
    takeHit(source: DamageSource, direction: number): number {
        if (this.enemyState === 'dead') {
            return 0;
        }

        const frame = this.scene.game.getFrame();
        if (frame === this.lastDamageFrame) {
            return 0;
        }
        this.lastDamageFrame = frame;

        const damage = this.health.takeDamage(source);
        if (damage <= 0) {
            return 0;
        }

        const body = this.body as Physics.Arcade.Body;

        if (this.health.isDead) {
            this.die(direction, source);
        } else {
            this.enemyState = 'hurt';
            this.hurtTimer = 220;

            // Knockback: o impulso vertical negativo evita que a gravidade o
            // prenda no chão durante o recuo.
            body.setVelocity(
                (source.knockbackX ?? 0) * direction,
                source.knockbackY ?? -120
            );
            this.setTint(0xff7d6e);
            this.setTintFill();
            this.play(`${this.kind}-idle`, true);
        }

        return damage;
    }

    private updatePatrol(delta: number): void {
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

    private updateHurt(delta: number): void {
        // Durante o estado hurt a física continua, mantendo o recuo. Ao fim da
        // janela o inimigo volta a patrulhar.
        this.hurtTimer -= delta;
        if (this.hurtTimer <= 0) {
            this.enemyState = 'alive';
            this.clearTint();
        }
    }

    private die(direction: number, source: DamageSource): void {
        this.enemyState = 'dead';
        this.setTint(0xffd6d6);
        this.setTintFill();

        const body = this.body as Physics.Arcade.Body;
        body.enable = false;

        // Reação de morte com recuo do golpe para vender o impacto.
        const recoil = source.knockbackX ? Math.sign(source.knockbackX) * 36 : 36;

        this.scene.tweens.add({
            targets: this,
            x: this.x + direction * recoil,
            y: this.y - 18,
            alpha: 0,
            duration: 220,
            ease: 'Quad.out',
            onComplete: () => this.destroy()
        });
    }
}