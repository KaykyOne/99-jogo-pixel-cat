import { Math as PhaserMath, Physics, Scene } from 'phaser';

import { DamageSource } from '../damage/damage';
import { Player } from '../entities/Player';
import { Parryable } from '../entities/PlayerParry';
import { ProjectileConfig, ProjectileTarget, ProjectileTeam } from './types';

// Projétil. Serve para os três casos do jogo — a cusparada da lhama (arco, com
// gravidade), a teia da aranha (reta, com lentidão) e agora os tiros do
// jogador (flecha, dardo arcano, bola de fogo). A diferença toda mora em
// ProjectileConfig, não aqui.
export class Projectile extends Physics.Arcade.Sprite {
    readonly config: ProjectileConfig;
    readonly damage: DamageSource;
    // Quem atirou, para o parry poder revidar em quem disparou. Opcional
    // porque o atirador pode ter morrido antes do tiro chegar.
    readonly owner?: Parryable;
    // Contra quem este tiro testa colisão. Sem isto a flecha do jogador
    // machucaria o próprio jogador.
    readonly team: ProjectileTeam;

    private expiresAt: number;

    constructor(
        scene: Scene,
        x: number,
        y: number,
        directionX: number,
        config: ProjectileConfig,
        damage: DamageSource,
        team: ProjectileTeam = 'enemy',
        owner?: Parryable
    ) {
        super(scene, x, y, config.textureKey);

        this.config = config;
        this.damage = damage;
        this.owner = owner;
        this.team = team;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        const body = this.body as Physics.Arcade.Body;
        body.setAllowGravity(config.gravity);
        body.setVelocityX(config.speed * directionX);

        // Tiro em arco: um empurrão inicial para cima faz a parábola passar
        // por cima de um alvo próximo e cair sobre um distante, em vez de ser
        // uma linha reta com gravidade grudando no chão na hora. A flecha usa
        // um valor muito menor (ver WEAPONS.bow) justamente por ser rápida.
        if (config.gravity) {
            body.setVelocityY(config.launchVelocityY ?? -220);
        }

        if (config.scale !== undefined) {
            this.setScale(config.scale);
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

    // De onde saem os alvos dos tiros do JOGADOR. É uma função, e não a lista
    // pronta, porque o manager nasce antes dos inimigos (os que atiram pegam
    // uma referência dele no construtor) — uma lista capturada aqui nasceria
    // sempre vazia.
    private targetProvider: () => ProjectileTarget[] = () => [];

    // Efeitos aplicados no impacto de um tiro do jogador. A cena registra o
    // seu para reaproveitar o MESMO hit-stop/shake do golpe corpo a corpo, em
    // vez de o manager inventar um vocabulário de impacto paralelo.
    private onPlayerHit?: (target: ProjectileTarget, projectile: Projectile) => void;

    constructor(
        private scene: Scene,
        private player: Player,
        private solids: Phaser.GameObjects.GameObject[]
    ) {}

    bindTargets(provider: () => ProjectileTarget[]): void {
        this.targetProvider = provider;
    }

    // Mesma lista que os tiros usam, exposta para efeitos de área que não
    // nascem de um projétil (a onda de gelo do cajado).
    currentTargets(): ProjectileTarget[] {
        return this.targetProvider();
    }

    onPlayerProjectileHit(handler: (target: ProjectileTarget, projectile: Projectile) => void): void {
        this.onPlayerHit = handler;
    }

    spawn(
        x: number,
        y: number,
        directionX: number,
        config: ProjectileConfig,
        damage: DamageSource,
        owner?: Parryable
    ): Projectile {
        return this.spawnFor('enemy', x, y, directionX, config, damage, owner);
    }

    // Tiro do jogador (flecha do arco, magias do cajado). Mesma máquina, outro
    // time — era isso ou um segundo sistema de projétil quase idêntico.
    spawnPlayerShot(
        x: number,
        y: number,
        directionX: number,
        config: ProjectileConfig,
        damage: DamageSource
    ): Projectile {
        return this.spawnFor('player', x, y, directionX, config, damage);
    }

    private spawnFor(
        team: ProjectileTeam,
        x: number,
        y: number,
        directionX: number,
        config: ProjectileConfig,
        damage: DamageSource,
        owner?: Parryable
    ): Projectile {
        const projectile = new Projectile(this.scene, x, y, directionX, config, damage, team, owner);

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

            if (projectile.config.homingAccel !== undefined) {
                this.steerHoming(projectile);
            }

            if (projectile.team === 'player') {
                this.updatePlayerShot(projectile);
            } else {
                this.updateEnemyShot(projectile);
            }
        }
    }

    private updateEnemyShot(projectile: Projectile): void {
        if (this.player.isDead) {
            return;
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

    private updatePlayerShot(projectile: Projectile): void {
        for (const target of this.targetProvider()) {
            if (!target.active || !target.isAlive || !projectile.active) {
                continue;
            }

            this.scene.physics.world.overlap(projectile, target, () => {
                if (!projectile.active) {
                    return;
                }

                // Tiro de área não resolve o alvo encostado aqui: quem explode
                // é o consume(), que também cobre o caso de bater na parede.
                // Resolvendo nos dois, o alvo do impacto levaria dano dobrado.
                const radius = projectile.config.explosionRadius;
                if (radius === undefined || radius <= 0) {
                    this.applyShotDamage(projectile, target);
                }

                this.consume(projectile);
            });
        }
    }

    // Bola de fogo: acerta TODO alvo dentro do raio, não só o que encostou.
    private explode(projectile: Projectile, radius: number): void {
        this.spawnBlast(projectile.x, projectile.y, radius, 0xff9a3c);

        for (const target of this.targetProvider()) {
            if (!target.active || !target.isAlive) {
                continue;
            }

            if (PhaserMath.Distance.Between(projectile.x, projectile.y, target.x, target.y) > radius) {
                continue;
            }

            this.applyShotDamage(projectile, target);
        }
    }

    private applyShotDamage(projectile: Projectile, target: ProjectileTarget): void {
        // A direção sai da posição relativa e não da velocidade do tiro: numa
        // explosão, quem está atrás precisa ser empurrado para trás.
        const direction = target.x >= projectile.x ? 1 : -1;
        const applied = target.takeHit(projectile.damage, direction);
        if (applied <= 0) {
            return;
        }

        const { slowFactor, slowDurationMs } = projectile.config;
        if (slowFactor !== undefined && slowDurationMs !== undefined) {
            target.applyChill(slowFactor, slowDurationMs);
        }

        this.onPlayerHit?.(target, projectile);
    }

    // Projétil teleguiado (fase 2 do boss do deserto): curva a velocidade em
    // direção ao jogador sem nunca acelerar além da própria velocidade base —
    // um míssil que ganha velocidade a cada frame vira impossível de esquivar.
    private steerHoming(projectile: Projectile): void {
        const body = projectile.body as Physics.Arcade.Body;
        const accel = projectile.config.homingAccel ?? 0;
        const dt = this.scene.game.loop.delta / 1000;

        const targetX = projectile.team === 'player' ? this.nearestTargetX(projectile) : this.player.x;
        const targetY = projectile.team === 'player' ? this.nearestTargetY(projectile) : this.player.y;
        if (targetX === null || targetY === null) {
            return;
        }

        const angle = Math.atan2(targetY - projectile.y, targetX - projectile.x);
        const vx = body.velocity.x + Math.cos(angle) * accel * dt;
        const vy = body.velocity.y + Math.sin(angle) * accel * dt;

        const speed = Math.hypot(vx, vy) || 1;
        const capped = projectile.config.speed;
        body.setVelocity((vx / speed) * capped, (vy / speed) * capped);
        projectile.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
    }

    private nearestTarget(projectile: Projectile): ProjectileTarget | null {
        let best: ProjectileTarget | null = null;
        let bestDistance = Infinity;

        for (const target of this.targetProvider()) {
            if (!target.active || !target.isAlive) {
                continue;
            }

            const distance = PhaserMath.Distance.Between(projectile.x, projectile.y, target.x, target.y);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = target;
            }
        }

        return best;
    }

    private nearestTargetX(projectile: Projectile): number | null {
        return this.nearestTarget(projectile)?.x ?? null;
    }

    private nearestTargetY(projectile: Projectile): number | null {
        return this.nearestTarget(projectile)?.y ?? null;
    }

    // Clarão de área. Mesma linguagem visual do flash do parry: um anel que
    // cresce e some, em vez de um sprite de explosão que não existe.
    spawnBlast(x: number, y: number, radius: number, color: number): void {
        const ring = this.scene.add.circle(x, y, radius * 0.35, color, 0.5).setDepth(19);

        this.scene.tweens.add({
            targets: ring,
            radius,
            alpha: 0,
            duration: 280,
            ease: 'Quad.out',
            onComplete: () => ring.destroy()
        });
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

        // Um tiro de área que bateu na parede (ou expirou no ar) ainda explode:
        // é o que torna a bola de fogo utilizável contra quem está atrás de uma
        // saliência.
        const radius = projectile.config.explosionRadius;
        if (projectile.team === 'player' && radius !== undefined && radius > 0) {
            this.explode(projectile, radius);
        }

        const body = projectile.body as Physics.Arcade.Body;
        body.enable = false;

        this.scene.tweens.add({
            targets: projectile,
            alpha: 0,
            scale: (projectile.config.scale ?? 1) * 1.6,
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
