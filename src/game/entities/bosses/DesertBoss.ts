import { Math as PhaserMath, Physics, Scene } from 'phaser';

import { ProjectileManager } from '../../combat/Projectile';
import { ProjectileConfig } from '../../combat/types';
import { DamageSource } from '../../damage/damage';
import { Player } from '../Player';
import { BossBase } from './BossBase';
import { BOSSES, DESERT_BOSS_BEHAVIOR } from './boss-config';

// Projéteis do boss do deserto. Ficam aqui, e não em ENEMY_STATS, porque não
// pertencem a nenhum tipo de inimigo comum — são a arma de UM boss.
const FAN_SHOT: ProjectileConfig = {
    textureKey: 'llama-spit',
    speed: DESERT_BOSS_BEHAVIOR.fanProjectileSpeed,
    lifespanMs: 2400,
    gravity: false
};

const HOMING_SHOT: ProjectileConfig = {
    textureKey: 'spell-fireball',
    speed: DESERT_BOSS_BEHAVIOR.homingSpeed,
    lifespanMs: DESERT_BOSS_BEHAVIOR.homingLifespanMs,
    gravity: false,
    homingAccel: DESERT_BOSS_BEHAVIOR.homingAccel,
    scale: 0.9
};

// Boss 2 — deserto. Luta de distância: nunca deixa o jogador colado. Alterna
// salva em leque (que cobre um arco, não uma linha) com um dash de
// reposicionamento; na fase 2 entra o teleguiado, que obriga a usar o cenário.
export class DesertBoss extends BossBase {
    private dashDirection = 1;
    private homingReleased = false;

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, BOSSES.desert, target);
    }

    protected onPatternStart(patternId: string): void {
        switch (patternId) {
            case 'fan':
                this.fireFan();
                break;

            case 'reposition':
                this.beginReposition();
                break;

            case 'homing':
                this.homingReleased = false;
                break;
        }
    }

    protected onPatternUpdate(patternId: string, _delta: number): void {
        if (patternId === 'reposition') {
            this.setVelocityX(DESERT_BOSS_BEHAVIOR.dashSpeed * this.dashDirection);
            this.play(`${this.artAnimationPrefix}-walk`, true);
            return;
        }

        if (patternId === 'homing' && !this.homingReleased) {
            this.homingReleased = true;
            this.fireHoming();
        }
    }

    protected onPatternEnd(patternId: string): void {
        if (patternId === 'reposition') {
            this.setVelocityX(0);
        }
    }

    // Salva em leque: os tiros saem do mesmo ponto abrindo num arco. Cobrir um
    // arco (e não uma linha) é o que impede o jogador de resolver a luta
    // ficando parado num único ponto seguro.
    private fireFan(): void {
        const manager = this.projectiles();
        if (!manager) {
            return;
        }

        this.play(`${this.artAnimationPrefix}-attack-1`, true);

        const direction = this.facingDirection;
        this.setFlipX(direction < 0);

        const { fanShots, fanSpreadDegrees } = DESERT_BOSS_BEHAVIOR;
        const damage = this.shotDamage();

        // Aponta o centro do leque para o jogador; a abertura se distribui em
        // torno dessa mira. Mirando sempre na horizontal, o leque erraria
        // qualquer alvo em cima de plataforma.
        const aim = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const spread = PhaserMath.DegToRad(fanSpreadDegrees);
        const step = fanShots > 1 ? spread / (fanShots - 1) : 0;

        for (let index = 0; index < fanShots; index++) {
            const angle = aim - spread / 2 + step * index;

            // spawn() só aceita direção horizontal; o ângulo é aplicado depois,
            // reescrevendo a velocidade do corpo. É o preço de reaproveitar o
            // mesmo Projectile em vez de escrever um sistema de tiro radial.
            const projectile = manager.spawn(
                this.x + direction * 30,
                this.y - 30,
                direction,
                FAN_SHOT,
                damage,
                this
            );

            const body = projectile.body as Physics.Arcade.Body;
            body.setVelocity(
                Math.cos(angle) * FAN_SHOT.speed,
                Math.sin(angle) * FAN_SHOT.speed
            );
            projectile.setRotation(angle);
        }
    }

    private fireHoming(): void {
        const manager = this.projectiles();
        if (!manager) {
            return;
        }

        this.play(`${this.artAnimationPrefix}-attack-2`, true);
        const direction = this.facingDirection;

        manager.spawn(this.x + direction * 30, this.y - 40, direction, HOMING_SHOT, this.shotDamage(), this);
    }

    // O dash NÃO machuca: é reposicionamento puro. Ele foge de quem chegou
    // perto e se aproxima de quem fugiu, sempre tentando parar na distância em
    // que atira confortavelmente.
    private beginReposition(): void {
        const towardPlayer = this.facingDirection;
        const tooClose = this.distanceToTarget < DESERT_BOSS_BEHAVIOR.preferredRange;

        this.dashDirection = tooClose ? -towardPlayer : towardPlayer;

        // Encurralado na borda, inverte: senão ele passaria o dash inteiro
        // empurrando o muro do mundo.
        const worldWidth = this.scene.physics.world.bounds.width;
        if ((this.x < 200 && this.dashDirection < 0) || (this.x > worldWidth - 200 && this.dashDirection > 0)) {
            this.dashDirection *= -1;
        }

        // Continua encarando o jogador enquanto se desloca de costas — mesma
        // leitura do recuo da lhama comum.
        this.setFlipX(towardPlayer < 0);
    }

    private shotDamage(): DamageSource {
        return {
            amount: this.stats.combat.amount,
            kind: this.stats.combat.kind,
            knockbackX: this.stats.combat.knockbackX,
            knockbackY: this.stats.combat.knockbackY
        };
    }

    private projectiles(): ProjectileManager | undefined {
        return this.scene.registry.get('projectiles') as ProjectileManager | undefined;
    }
}
