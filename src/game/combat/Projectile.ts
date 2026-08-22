import { Physics, Scene } from 'phaser';

import { DamageSource } from '../damage/damage';
import { EnemyProjectile } from '../damage/health-config';
import { Player } from '../entities/Player';
import { Parryable } from '../entities/PlayerParry';

// Projétil disparado por um inimigo. Serve tanto para a cusparada da lhama
// (com gravidade, arco) quanto para a teia da aranha (reta, sem dano real mas
// com lentidão) — a diferença toda mora em EnemyProjectile, não aqui.
export class Projectile extends Physics.Arcade.Sprite {
    readonly config: EnemyProjectile;
    readonly damage: DamageSource;
    // Quem atirou, para o parry poder revidar em quem disparou. Opcional
    // porque o atirador pode ter morrido antes do tiro chegar.
    readonly owner?: Parryable;

    private expiresAt: number;

    constructor(
        scene: Scene,
        x: number,
        y: number,
        directionX: number,
        config: EnemyProjectile,
        damage: DamageSource,
        owner?: Parryable
    ) {
        super(scene, x, y, config.textureKey);

        this.config = config;
        this.damage = damage;
        this.owner = owner;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        const body = this.body as Physics.Arcade.Body;
        body.setAllowGravity(config.gravity);
        body.setVelocityX(config.speed * directionX);

        // Tiro em arco: um empurrão inicial para cima faz a parábola passar
        // por cima de um jogador próximo e cair sobre um distante, em vez de
        // ser uma linha reta com gravidade grudando no chão na hora.
        if (config.gravity) {
            body.setVelocityY(-220);
        }

        this.setFlipX(directionX < 0);
        this.setDepth(18);
        this.expiresAt = scene.time.now + config.lifespanMs;
    }

    get isExpired(): boolean {
        return this.scene.time.now >= this.expiresAt;
    }
}

// Guarda os projéteis vivos de uma fase e resolve o que acontece com eles.
// Fica fora da PhaseScene pelo mesmo motivo que PlayerCombat fica fora do
// Player: a cena já é grande demais.
export class ProjectileManager {
    private projectiles: Projectile[] = [];

    constructor(
        private scene: Scene,
        private player: Player,
        private solids: Phaser.GameObjects.GameObject[]
    ) {}

    spawn(
        x: number,
        y: number,
        directionX: number,
        config: EnemyProjectile,
        damage: DamageSource,
        owner?: Parryable
    ): Projectile {
        const projectile = new Projectile(this.scene, x, y, directionX, config, damage, owner);

        // Bater numa plataforma sólida consome o tiro. Sem isto o projétil
        // atravessaria o monte e acertaria quem está atrás dele — o mesmo
        // problema que isPathBlocked resolve para o golpe corpo a corpo.
        this.scene.physics.add.collider(projectile, this.solids, () => this.consume(projectile));

        this.projectiles.push(projectile);
        return projectile;
    }

    update(): void {
        for (const projectile of [...this.projectiles]) {
            if (!projectile.active) {
                continue;
            }

            if (projectile.isExpired) {
                this.consume(projectile);
                continue;
            }

            if (this.player.isDead) {
                continue;
            }

            this.scene.physics.world.overlap(projectile, this.player, () => {
                if (!projectile.active) {
                    return;
                }

                const direction = this.player.x >= projectile.x ? 1 : -1;
                const tookDamage = this.player.takeDamage(projectile.damage, direction, projectile.owner);

                // A lentidão da teia só cola se o tiro NÃO foi defendido —
                // senão defender anularia o dano mas o jogador sairia lento
                // do mesmo jeito, o que tornaria a defesa quase inútil contra
                // a aranha.
                const { slowFactor, slowDurationMs } = projectile.config;
                if (tookDamage && slowFactor !== undefined && slowDurationMs !== undefined) {
                    this.player.applySlow(slowFactor, slowDurationMs);
                }

                this.consume(projectile);
            });
        }
    }

    // Some com um efeito curto em vez de desaparecer no meio do ar.
    private consume(projectile: Projectile): void {
        if (!projectile.active) {
            return;
        }

        const index = this.projectiles.indexOf(projectile);
        if (index >= 0) {
            this.projectiles.splice(index, 1);
        }

        const body = projectile.body as Physics.Arcade.Body;
        body.enable = false;

        this.scene.tweens.add({
            targets: projectile,
            alpha: 0,
            scale: 1.6,
            duration: 110,
            onComplete: () => projectile.destroy()
        });
    }

    destroyAll(): void {
        for (const projectile of this.projectiles) {
            projectile.destroy();
        }
        this.projectiles = [];
    }
}
