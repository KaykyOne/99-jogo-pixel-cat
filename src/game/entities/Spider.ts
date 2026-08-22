import { Math as PhaserMath, Scene } from 'phaser';

import { ENEMY_ATTACK_IMPACT_DELAY_MS } from '../combat/attack-variants';
import { ProjectileManager } from '../combat/Projectile';
import { ENEMY_STATS } from '../damage/health-config';
import { isPathBlocked } from '../world/line-of-sight';
import { BaseEnemy } from './BaseEnemy';
import { Player } from './Player';

// Comportamento da aranha: nasce em bando, fraca sozinha, escolhe entre teia
// (ranged, lentidão) e bote (melee, impulso rápido). Padrão de movimento
// errático simula bando em vez de fileira.
const SPIDER_BEHAVIOR = {
    // Distância limite pra mudar estilo de ataque. Longe: teia. Perto: bote.
    // Corresponde a aproximadamente 5-6 larguras de corpo.
    tackleThresholdDistance: 150,
    // Velocidade do impulso do bote: o dobro da velocidade de perseguição para
    // parecer uma investida agressiva e rápida.
    tackleSpeed: 280,
    // Duração do impulso do bote (ms). Cai num pico logo no começo pra parecer
    // uma "facada" explosiva, não um empurrão sustentado.
    tackleDurationMs: 180,
    // Faixa de variação no movimento errático da perseguição: pequenos desvios
    // aleatórios para simular movimento de bando sem parecer aleatório demais.
    erraticVariationRange: 0.35
} as const;

export class Spider extends BaseEnemy {
    // Controla quando termina o impulso do bote.
    private tackleUntil = 0;

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, 'spider', target);
    }

    protected updateChase(): void {
        // Se ainda está no meio de um bote, continua o impulso em vez de andar
        // para trás ou parar.
        if (this.scene.time.now < this.tackleUntil) {
            return;
        }

        // Movimento errático: em vez de ir em linha reta, varia levemente a direção
        // para simular comportamento de bando. Uma aranha sozinha não seria tão
        // zigzagueante, mas muitas juntas parecem bando mesmo que cada uma se
        // mova com pequenas oscilações.
        const dir = this.target.x >= this.x ? 1 : -1;
        const variation =
            (PhaserMath.Between(-100, 100) / 100) * SPIDER_BEHAVIOR.erraticVariationRange;
        const speedModifier = 1 + variation;

        this.direction = dir;

        this.setVelocityX(this.stats.combat.chaseSpeed * dir * speedModifier);
        this.setFlipX(dir < 0);
        this.play(`${this.typeKey}-walk`, true);
    }

    protected updateAttack(time: number): void {
        // Se ainda está tackling, deixa a física (já impressa no updateChase)
        // fazer o trabalho.
        if (this.scene.time.now < this.tackleUntil) {
            return;
        }

        const dir = this.target.x >= this.x ? 1 : -1;
        this.direction = dir;

        this.setVelocityX(0);
        this.setFlipX(dir < 0);

        if (this.isPlayingAttackAnimation()) {
            return;
        }

        if (time >= this.attackCooldownUntil) {
            this.attackCooldownUntil = time + this.stats.combat.cooldownMs;
            this.chooseAttack(dir);
        } else {
            this.play(`${this.typeKey}-idle`, true);
        }
    }

    // Escolhe entre teia (projétil) ou bote (impulso melee). Quanto mais perto,
    // mais provável é um bote.
    private chooseAttack(direction: number): void {
        const distance = Math.abs(this.target.x - this.x);

        // Pesos de probabilidade: perto de bote, longe de teia.
        let tackleChance = 0.2; // Padrão: 20% bote
        if (distance < SPIDER_BEHAVIOR.tackleThresholdDistance) {
            tackleChance = 0.7; // Perto: 70% bote, 30% teia
        }

        // PhaserMath em vez de Math.random: o projeto inteiro usa o RNG do Phaser,
        // que é semeável e reproduz a mesma sequência num replay.
        const willTackle = PhaserMath.FloatBetween(0, 1) < tackleChance;

        if (willTackle) {
            this.performTackle(direction);
        } else {
            this.performWebAttack(direction);
        }
    }

    // Bote: avanço rápido curto na direção do jogador durante o golpe.
    private performTackle(direction: number): void {
        this.play(`${this.typeKey}-attack-1`);

        // Começa o impulso imediatamente para parecer explosivo.
        this.setVelocityX(SPIDER_BEHAVIOR.tackleSpeed * direction);
        this.tackleUntil = this.scene.time.now + SPIDER_BEHAVIOR.tackleDurationMs;

        // Dano é aplicado no meio da animação, igualzinho ao BaseEnemy.
        this.scene.time.delayedCall(ENEMY_ATTACK_IMPACT_DELAY_MS, () => {
            if (this.currentState === 'dead' || this.currentState === 'hurt') {
                return;
            }

            const stillInRange =
                Math.abs(this.target.x - this.x) <= this.stats.combat.attackRange + 20 &&
                Math.abs(this.target.y - this.y) <= this.stats.combat.verticalRange;
            if (!stillInRange) {
                return;
            }

            if (isPathBlocked(this.scene, this.x, this.y, this.target.x, this.target.y)) {
                return;
            }

            this.target.takeDamage(
                {
                    amount: this.stats.combat.amount,
                    kind: this.stats.combat.kind,
                    knockbackX: this.stats.combat.knockbackX,
                    knockbackY: this.stats.combat.knockbackY
                },
                direction
            );
        });
    }

    // Teia: projétil que reduz a velocidade do jogador. Aranha tem projectile
    // na config.
    private performWebAttack(direction: number): void {
        this.play(`${this.typeKey}-attack-2`);

        this.scene.time.delayedCall(ENEMY_ATTACK_IMPACT_DELAY_MS, () => {
            if (this.currentState === 'dead' || this.currentState === 'hurt') {
                return;
            }

            const stillInRange =
                Math.abs(this.target.x - this.x) <= this.stats.combat.attackRange + 20 &&
                Math.abs(this.target.y - this.y) <= this.stats.combat.verticalRange;
            if (!stillInRange) {
                return;
            }

            if (isPathBlocked(this.scene, this.x, this.y, this.target.x, this.target.y)) {
                return;
            }

            // Mesmo motivo da lhama: `this.stats` é a união de todos os inimigos e
            // não expõe `projectile`; o catálogo do próprio tipo expõe, já tipado.
            const projectiles = this.scene.registry.get('projectiles') as ProjectileManager | undefined;
            projectiles?.spawn(this.x, this.y - 5, direction, ENEMY_STATS.spider.projectile, {
                amount: this.stats.combat.amount,
                kind: this.stats.combat.kind,
                knockbackX: this.stats.combat.knockbackX,
                knockbackY: this.stats.combat.knockbackY
            });
        });
    }
}
