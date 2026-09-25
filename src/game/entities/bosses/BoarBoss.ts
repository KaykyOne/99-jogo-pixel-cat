import { GameObjects, Math as PhaserMath, Physics, Scene } from 'phaser';

import { DamageSource } from '../../damage/damage';
import { Player } from '../Player';
import { BossBase } from './BossBase';
import { BOAR_BOSS_BEHAVIOR as BOAR, BOSSES } from './boss-config';

type BoarAction = 'none' | 'charging' | 'skidding' | 'turning' | 'goring';

// Duração da estocada da chifrada.
const GORE_MS = 300;
// Cor da poeira: areia do deserto.
const DUST = 0xd9c08c;

// Boss 2 — deserto. Um javali: pesado e em linha reta.
//
// Investida: cava o chão bufando (o telegrafo, com poeira saindo da pata) e
// dispara na direção do jogador, passando dele antes de conseguir frear. Se
// bater na parede, fica tonto — é a grande abertura da luta, e ensina a
// atraí-lo para a borda da arena. Colado nele, a chifrada joga para o alto.
//
// Como no sapo, a ação roda no update próprio e trava o BossBase enquanto
// dura: levar um golpe no meio da corrida não pode deixá-lo parado no meio
// da arena com a investida "pela metade".
export class BoarBoss extends BossBase {
    private action: BoarAction = 'none';
    private chargeDir = 1;
    private passStartX = 0;
    private passesLeft = 0;
    private hitThisPass = false;
    // Onde foi o último pulo de degrau. Travar de novo no MESMO ponto depois
    // de pular é sinal de parede alta: aí ele bate.
    private hopX: number | null = null;
    private actionTimer = 0;
    private dustTimer = 0;

    private stunned = false;
    private stunTimer = 0;
    private stars: GameObjects.Star[] = [];
    private starAngle = 0;

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, BOSSES.desert, target);
    }

    update(time: number, delta: number): void {
        super.update(time, delta);
        if (!this.isAlive) {
            this.clearStars();
            return;
        }

        this.updateAction(delta);
        this.updateTelegraphDust(delta);
        this.updateStars(delta);
    }

    destroy(fromScene?: boolean): void {
        this.clearStars();
        super.destroy(fromScene);
    }

    protected isActionLocked(): boolean {
        return this.action !== 'none';
    }

    protected telegraphAnimationKey(patternId: string): string {
        return patternId === 'gore' ? `${this.artAnimationPrefix}-gore-windup` : `${this.artAnimationPrefix}-attack-1`;
    }

    protected recoverAnimationKey(): string {
        return this.stunned ? `${this.artAnimationPrefix}-dizzy` : `${this.artAnimationPrefix}-idle`;
    }

    protected onPatternStart(patternId: string): void {
        this.stunned = false;
        this.clearStars();

        switch (patternId) {
            case 'charge':
                this.passesLeft = BOAR.passes[this.bossPhase];
                this.startPass();
                break;

            case 'gore':
                this.startGore();
                break;
        }
    }

    // ------------------------------------------------------------------------
    // Investida
    // ------------------------------------------------------------------------
    private startPass(): void {
        this.chargeDir = this.target.x >= this.x ? 1 : -1;
        this.setFlipX(this.chargeDir < 0);
        this.passStartX = this.x;
        this.hitThisPass = false;
        this.hopX = null;
        this.action = 'charging';
        this.play(`${this.artAnimationPrefix}-charge`, true);
        this.scene.cameras.main.shake(140, 0.004);
        this.puffDust(this.x - this.chargeDir * 60, 6, 1.2);
    }

    private updateAction(delta: number): void {
        const dt = delta / 1000;
        const body = this.arcadeBody;

        switch (this.action) {
            case 'charging': {
                const topSpeed = this.bossPhase === 2 ? BOAR.phase2ChargeSpeed : BOAR.chargeSpeed;
                const next = PhaserMath.Clamp(
                    body.velocity.x + BOAR.chargeAccel * this.chargeDir * dt,
                    -topSpeed,
                    topSpeed
                );
                body.setVelocityX(next);
                this.setFlipX(this.chargeDir < 0);
                this.play(`${this.artAnimationPrefix}-charge`, true);
                this.trailDust(delta);
                this.tryChargeHit();

                const hitWall = this.chargeDir === 1 ? body.blocked.right : body.blocked.left;
                if (hitWall && this.handleObstacle()) {
                    break;
                }

                const passedBy = (this.x - this.target.x) * this.chargeDir;
                const travelled = Math.abs(this.x - this.passStartX);
                if (passedBy > BOAR.chargeOvershoot || travelled > BOAR.chargeMaxDistance) {
                    this.action = 'skidding';
                    this.play(`${this.artAnimationPrefix}-skid`, true);
                }
                break;
            }

            case 'skidding': {
                // Freia arrastando as patas: a abertura para bater nas costas.
                const speed = Math.max(0, Math.abs(body.velocity.x) - BOAR.skidDecel * dt);
                body.setVelocityX(speed * this.chargeDir);
                this.trailDust(delta);
                this.tryChargeHit();

                if (speed > 20) {
                    break;
                }

                body.setVelocityX(0);
                this.passesLeft--;
                if (this.passesLeft > 0) {
                    // Fase 2: vira e investe de novo, com uma cavada curta.
                    this.action = 'turning';
                    this.actionTimer = BOAR.turnPauseMs;
                    this.setFlipX(this.target.x < this.x);
                    this.play(`${this.artAnimationPrefix}-attack-1`, true);
                } else {
                    this.finishAction();
                }
                break;
            }

            case 'turning':
                body.setVelocityX(0);
                this.actionTimer -= delta;
                this.trailDust(delta);
                if (this.actionTimer <= 0) {
                    this.startPass();
                }
                break;

            case 'goring':
                this.actionTimer -= delta;
                this.tryGoreHit();
                if (this.actionTimer <= 0) {
                    body.setVelocityX(0);
                    this.finishAction();
                }
                break;
        }
    }

    private tryChargeHit(): void {
        // Margem generosa: o acerto precisa sair ANTES dos corpos se tocarem,
        // senão o dano de contato (1) chega primeiro e a invencibilidade que
        // ele dá engole o dano da investida.
        if (this.hitThisPass || !this.touchingTarget(40)) {
            return;
        }
        this.hitThisPass = true;
        this.strike(BOAR.chargeDamage, this.chargeDir);
        // Atropelou: freia em vez de seguir empurrando. Continuar correndo
        // prensava o jogador contra a parede até ele atravessar o chão.
        if (this.action === 'charging') {
            this.action = 'skidding';
            this.play(`${this.artAnimationPrefix}-skid`, true);
        }
    }

    // Aplica o golpe respeitando dash (atravessa) e defesa: defendido, o
    // javali leva o revide e a investida acaba ali.
    private strike(damage: DamageSource, direction: number): void {
        if (this.target.isDead || this.target.dash.isDashing) {
            return;
        }

        const parried = this.target.parry.isActive;
        this.target.takeDamage(damage, direction, this);
        if (parried) {
            this.arcadeBody.setVelocityX(0);
            this.finishAction();
        } else {
            this.scene.cameras.main.shake(200, 0.01);
        }
    }

    // Algo travou a corrida. Degrau: pula por cima e segue. Parede de
    // verdade (borda da arena, ou o que o pulo não venceu): bate e fica
    // tonto. Devolve true se a investida acabou ali.
    private handleObstacle(): boolean {
        const body = this.arcadeBody;
        const worldWidth = this.scene.physics.world.bounds.width;
        const atWorldEdge = this.chargeDir === 1 ? body.right >= worldWidth - 4 : body.left <= 4;

        if (!atWorldEdge && !body.blocked.down) {
            // Ainda subindo o degrau: continua empurrando.
            return false;
        }

        const retryingSameSpot = this.hopX !== null && Math.abs(this.x - this.hopX) < 40;
        if (!atWorldEdge && !retryingSameSpot) {
            this.hopX = this.x;
            body.setVelocityY(-BOAR.stepHopVelocity);
            this.puffDust(this.x, 4, 1);
            return false;
        }

        this.crashIntoWall();
        return true;
    }

    // Bateu na parede: tremor forte, poeira e tontura longa.
    private crashIntoWall(): void {
        this.arcadeBody.setVelocity(-this.chargeDir * 160, -220);
        this.scene.cameras.main.shake(320, 0.018);
        this.puffDust(this.x + this.chargeDir * 70, 12, 1.8);

        this.stunned = true;
        // A tontura dura a recuperação inteira (a normal + a extra).
        this.stunTimer = BOAR.wallStunMs + this.definition.patterns[0].recoverMs;
        this.extraRecoverMs = BOAR.wallStunMs;
        this.createStars();
        this.finishAction();
    }

    // ------------------------------------------------------------------------
    // Chifrada
    // ------------------------------------------------------------------------
    private startGore(): void {
        this.chargeDir = this.target.x >= this.x ? 1 : -1;
        this.setFlipX(this.chargeDir < 0);
        this.hitThisPass = false;
        this.action = 'goring';
        this.actionTimer = GORE_MS;
        this.arcadeBody.setVelocityX(BOAR.goreLungeSpeed * this.chargeDir);
        this.play(`${this.artAnimationPrefix}-gore`, true);
    }

    private tryGoreHit(): void {
        if (this.hitThisPass) {
            return;
        }

        const inFront = (this.target.x - this.x) * this.chargeDir > -20;
        const horizontal = Math.abs(this.target.x - this.x);
        const vertical = Math.abs(this.target.y - this.y);
        if (!inFront || horizontal > BOAR.goreRange || vertical > 140) {
            return;
        }

        this.hitThisPass = true;
        this.strike(BOAR.goreDamage, this.chargeDir);
    }

    private finishAction(): void {
        this.action = 'none';
        this.endExecuteEarly();
    }

    // ------------------------------------------------------------------------
    // Efeitos
    // ------------------------------------------------------------------------
    private touchingTarget(margin: number): boolean {
        const own = this.arcadeBody;
        const other = this.target.body as Physics.Arcade.Body;
        return (
            own.right + margin > other.left &&
            own.left - margin < other.right &&
            // Na vertical, sem margem: pular por cima da investida é a esquiva.
            own.bottom > other.top &&
            own.top < other.bottom
        );
    }

    // Poeira da pata cavando o chão durante o windup da investida.
    private updateTelegraphDust(delta: number): void {
        if (this.telegraphingPatternId !== 'charge') {
            return;
        }
        this.dustTimer -= delta;
        if (this.dustTimer > 0) {
            return;
        }
        this.dustTimer = 130;
        // A pata cava pra trás: a poeira voa na direção oposta à que ele olha.
        const facing = this.flipX ? -1 : 1;
        this.puffDust(this.x + facing * 30, 2, 0.9, -facing);
    }

    private trailDust(delta: number): void {
        this.dustTimer -= delta;
        if (this.dustTimer > 0) {
            return;
        }
        this.dustTimer = 55;
        this.puffDust(this.x - this.chargeDir * 50, 1, 1);
    }

    private puffDust(x: number, count: number, size: number, towards?: number): void {
        const groundY = this.arcadeBody.bottom;
        for (let index = 0; index < count; index++) {
            const side = towards ?? (index % 2 === 0 ? -1 : 1);
            const puff = this.scene.add
                .circle(x + PhaserMath.Between(-12, 12), groundY - 8, PhaserMath.Between(5, 9) * size, DUST, 0.75)
                .setDepth(16);
            this.scene.tweens.add({
                targets: puff,
                x: puff.x + side * PhaserMath.Between(20, 70) * size,
                y: puff.y - PhaserMath.Between(12, 34) * size,
                alpha: 0,
                scale: 1.7,
                duration: PhaserMath.Between(300, 480),
                ease: 'Quad.out',
                onComplete: () => puff.destroy()
            });
        }
    }

    // Estrelinhas girando sobre a cabeça enquanto está tonto.
    private createStars(): void {
        this.clearStars();
        for (let index = 0; index < 3; index++) {
            this.stars.push(this.scene.add.star(this.x, this.y, 5, 5, 11, 0xfff27a).setStrokeStyle(2, 0x5a3a00).setDepth(22));
        }
    }

    private updateStars(delta: number): void {
        if (this.stars.length === 0) {
            return;
        }
        this.stunTimer -= delta;
        if (!this.stunned || this.stunTimer <= 0) {
            this.stunned = false;
            this.clearStars();
            return;
        }

        this.starAngle += delta * 0.006;
        const facing = this.flipX ? -1 : 1;
        const headX = this.x + facing * 55;
        const headY = this.arcadeBody.top - 22;
        this.stars.forEach((star, index) => {
            const angle = this.starAngle + (index * Math.PI * 2) / this.stars.length;
            star.setPosition(headX + Math.cos(angle) * 42, headY + Math.sin(angle) * 12);
            star.setAngle(star.angle + delta * 0.3);
        });
    }

    private clearStars(): void {
        this.stars.forEach(star => star.destroy());
        this.stars = [];
    }
}
