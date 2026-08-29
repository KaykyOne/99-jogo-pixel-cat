import { GameObjects, Math as PhaserMath, Physics, Scene } from 'phaser';

import { ProjectileManager } from '../../combat/Projectile';
import { ProjectileConfig } from '../../combat/types';
import { isPathBlocked } from '../../world/line-of-sight';
import { Player } from '../Player';
import { BossBase } from './BossBase';
import { BOSSES, SNOW_BOSS_BEHAVIOR } from './boss-config';

const SHARD_SHOT: ProjectileConfig = {
    textureKey: 'spell-arcane',
    speed: SNOW_BOSS_BEHAVIOR.shardSpeed,
    lifespanMs: 2000,
    gravity: false,
    slowFactor: 0.6,
    slowDurationMs: 1200
};

// Uma poça de gelo no chão: enquanto viva, lentifica quem estiver em cima.
type IceField = {
    graphic: GameObjects.Arc;
    x: number;
    expiresAt: number;
};

// Boss 3 — neve. Mistura os dois anteriores: soco de perto, estilhaços de
// longe. A assinatura dele é o campo de gelo da fase 2, que transforma o CHÃO
// em problema — dá para evitar cada golpe individualmente, mas não dá para
// evitar todos enquanto se anda em câmera lenta.
export class SnowBoss extends BossBase {
    private fields: IceField[] = [];

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, BOSSES.snow, target);
    }

    update(time: number, delta: number): void {
        super.update(time, delta);
        this.updateFields(time);
    }

    protected onPatternStart(patternId: string): void {
        switch (patternId) {
            case 'slam':
                this.slam();
                break;

            case 'shards':
                this.fireShards();
                break;

            case 'icefield':
                this.dropIceField();
                break;
        }
    }

    protected onEnterPhase2(): void {
        // A fase 2 abre com um campo debaixo do próprio jogador: é o anúncio
        // de que a regra da luta mudou.
        this.dropIceField(this.target.x);
    }

    destroy(fromScene?: boolean): void {
        // Tween com repeat -1 e Graphics soltos são vazamento clássico ao
        // trocar de fase: limpa tudo junto com o boss.
        for (const field of this.fields) {
            field.graphic.destroy();
        }
        this.fields = [];
        super.destroy(fromScene);
    }

    private slam(): void {
        this.play(`${this.artAnimationPrefix}-attack-1`, true);
        this.setVelocityX(0);

        const { slamRange, slamDamage } = SNOW_BOSS_BEHAVIOR;

        const ring = this.scene.add.circle(this.x, this.y + 40, 18, 0xd8f2ff, 0.55).setDepth(14);
        this.scene.tweens.add({
            targets: ring,
            radius: slamRange,
            alpha: 0,
            duration: 300,
            ease: 'Quad.out',
            onComplete: () => ring.destroy()
        });
        this.scene.cameras.main.shake(200, 0.009);

        if (this.distanceToTarget > slamRange) {
            return;
        }

        if (isPathBlocked(this.scene, this.x, this.y, this.target.x, this.target.y)) {
            return;
        }

        this.target.takeDamage(slamDamage, this.facingDirection, this);
    }

    private fireShards(): void {
        const manager = this.projectiles();
        if (!manager) {
            return;
        }

        this.play(`${this.artAnimationPrefix}-attack-2`, true);

        const direction = this.facingDirection;
        this.setFlipX(direction < 0);

        const { shardShots, shardSpreadDegrees } = SNOW_BOSS_BEHAVIOR;
        const aim = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const spread = PhaserMath.DegToRad(shardSpreadDegrees);
        const step = shardShots > 1 ? spread / (shardShots - 1) : 0;

        for (let index = 0; index < shardShots; index++) {
            const angle = aim - spread / 2 + step * index;

            const projectile = manager.spawn(
                this.x + direction * 26,
                this.y - 40,
                direction,
                SHARD_SHOT,
                {
                    amount: this.stats.combat.amount,
                    kind: 'magic',
                    knockbackX: this.stats.combat.knockbackX,
                    knockbackY: this.stats.combat.knockbackY
                },
                this
            );

            const body = projectile.body as Physics.Arcade.Body;
            body.setVelocity(Math.cos(angle) * SHARD_SHOT.speed, Math.sin(angle) * SHARD_SHOT.speed);
            projectile.setRotation(angle);
        }
    }

    // Campo de gelo: nasce sob o jogador (não sob o boss), senão bastaria
    // manter distância para ele nunca importar.
    private dropIceField(atX = this.target.x): void {
        this.play(`${this.artAnimationPrefix}-attack-3`, true);

        const { fieldRadius, fieldDurationMs } = SNOW_BOSS_BEHAVIOR;
        const groundY = this.y + 40;

        const graphic = this.scene.add
            .circle(atX, groundY, fieldRadius, 0x8fc4e8, 0.28)
            .setStrokeStyle(2, 0xd8f2ff, 0.7)
            .setDepth(3);

        // Pulso lento: um disco parado no chão lê como decoração; pulsando,
        // lê como perigo ativo.
        this.scene.tweens.add({
            targets: graphic,
            alpha: 0.5,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });

        this.fields.push({
            graphic,
            x: atX,
            expiresAt: this.scene.time.now + fieldDurationMs
        });
    }

    private updateFields(time: number): void {
        for (const field of [...this.fields]) {
            if (time >= field.expiresAt) {
                this.scene.tweens.killTweensOf(field.graphic);
                field.graphic.destroy();
                this.fields.splice(this.fields.indexOf(field), 1);
                continue;
            }

            // A lentidão é reaplicada em pulsos curtos enquanto o jogador
            // estiver em cima: sair do campo devolve a velocidade quase na
            // hora, em vez de arrastar um debuff longo pela arena inteira.
            if (Math.abs(this.target.x - field.x) <= SNOW_BOSS_BEHAVIOR.fieldRadius) {
                this.target.applySlow(
                    SNOW_BOSS_BEHAVIOR.fieldSlowFactor,
                    SNOW_BOSS_BEHAVIOR.fieldSlowDurationMs
                );
            }
        }
    }

    private projectiles(): ProjectileManager | undefined {
        return this.scene.registry.get('projectiles') as ProjectileManager | undefined;
    }
}
