import { GameObjects, Math as PhaserMath, Physics, Scene } from 'phaser';

import { DamageSource } from '../../damage/damage';
import { GROUND_Y } from '../../world/phases';
import { Player } from '../Player';
import { BossBase } from './BossBase';
import { BOSSES, FROG_BOSS_BEHAVIOR as FROG } from './boss-config';

// Boca do sapo no frame de 48x48 (arte olhando para a direita) e o centro do
// frame, para converter em coordenada de mundo.
const MOUTH_FRAME_X = 44;
const MOUTH_FRAME_Y = 33;
const FRAME_CENTER = 24;

type TongueState = 'none' | 'extending' | 'retracting' | 'pulling' | 'holding';

// Boss 1 — floresta. Um sapo de verdade: caça parado com a língua e se move
// aos saltos.
//
// A língua e o salto rodam no update PRÓPRIO desta classe, e não só dentro
// da janela de execução do BossBase: um golpe no sapo (estado 'hurt') ou o
// jogador subindo numa plataforma pausam a coreografia, e uma língua
// congelada no ar — ou pior, o jogador preso nela sem controle — seria um
// travamento. Enquanto a ação dura, isActionLocked() segura o BossBase.
export class FrogBoss extends BossBase {
    // --- Língua ---
    private tongue: TongueState = 'none';
    private tongueLength = 0;
    private tongueAngle = 0;
    private tongueSpeed: number = FROG.tongueSpeed;
    private holdTimer = 0;
    private caughtAt = 0;
    private readonly tongueGraphics: GameObjects.Graphics;

    // --- Salto ---
    private airborne = false;
    private airTime = 0;
    private stompApplied = false;
    private hopsLeft = 0;
    private hopPauseTimer = 0;
    private landingShadow?: GameObjects.Ellipse;
    private landingX = 0;
    private landingY = GROUND_Y;

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, BOSSES.forest, target);

        // Na frente do jogador (20) e do sapo (15): a língua enrola por cima.
        this.tongueGraphics = scene.add.graphics().setDepth(21);
    }

    update(time: number, delta: number): void {
        super.update(time, delta);
        if (!this.isAlive) {
            // Morreu com o jogador na língua: solta na hora, sem esperar a
            // animação de morte acabar.
            if (this.tongue !== 'none') {
                this.releaseTarget();
                this.tongue = 'none';
                this.tongueGraphics.clear();
            }
            this.hideLandingShadow();
            return;
        }

        this.updateTongue(delta);
        this.updateLeap(delta);
    }

    destroy(fromScene?: boolean): void {
        this.releaseTarget();
        this.tongueGraphics?.destroy();
        this.landingShadow?.destroy();
        super.destroy(fromScene);
    }

    protected isActionLocked(): boolean {
        return this.tongue !== 'none' || this.airborne || this.hopsLeft > 0;
    }

    protected telegraphAnimationKey(patternId: string): string {
        return patternId === 'tongue' ? `${this.artAnimationPrefix}-attack-1` : `${this.artAnimationPrefix}-crouch`;
    }

    protected onPatternStart(patternId: string): void {
        switch (patternId) {
            case 'tongue':
                this.shootTongue();
                break;

            case 'leap':
                this.hopsLeft = 0;
                this.launch(FROG.leapVelocityY);
                break;

            case 'hops':
                // O primeiro pulo sai agora; os outros encadeiam no pouso.
                this.hopsLeft = FROG.hopCount - 1;
                this.launch(FROG.hopVelocityY);
                break;
        }
    }

    // ------------------------------------------------------------------------
    // Língua
    // ------------------------------------------------------------------------
    private shootTongue(): void {
        const mouth = this.mouthPosition();
        const facing = this.facingDirection;
        this.setFlipX(facing < 0);

        // Mira no jogador, limitada perto da horizontal (sapo não lambe o teto).
        const aim = Math.atan2(this.target.y - mouth.y, (this.target.x - mouth.x) * facing);
        const limit = PhaserMath.DegToRad(FROG.tongueMaxAngleDegrees);
        this.tongueAngle = PhaserMath.Clamp(aim, -limit, limit);

        this.tongueLength = 0;
        this.tongueSpeed = FROG.tongueSpeed * (this.bossPhase === 2 ? FROG.phase2TongueSpeedScale : 1);
        this.tongue = 'extending';
        this.setVelocityX(0);
        this.play(`${this.artAnimationPrefix}-tongue-out`, true);
    }

    private updateTongue(delta: number): void {
        if (this.tongue === 'none') {
            return;
        }

        const dt = delta / 1000;
        this.setVelocityX(0);

        switch (this.tongue) {
            case 'extending': {
                this.tongueLength += this.tongueSpeed * dt;
                if (this.tryCatchTarget()) {
                    break;
                }
                if (this.tongueLength >= FROG.tongueRange || this.tongueTipBlocked()) {
                    this.tongue = 'retracting';
                }
                break;
            }

            case 'retracting':
                this.tongueLength -= FROG.tongueRetractSpeed * dt;
                if (this.tongueLength <= 0) {
                    this.finishTongue();
                }
                break;

            case 'pulling': {
                // O jogador vem grudado na ponta até a boca.
                this.tongueLength = Math.max(0, this.tongueLength - FROG.pullSpeed * dt);
                const tip = this.tonguePoint(this.tongueLength);
                this.holdTargetAt(tip.x, tip.y);
                if (this.tongueLength <= 0) {
                    this.tongue = 'holding';
                    // Segura pelo menos até a invencibilidade do toque acabar,
                    // senão o cuspe não daria dano nem empurrão.
                    const sinceCatch = this.scene.time.now - this.caughtAt;
                    this.holdTimer = Math.max(FROG.holdMs, 960 - sinceCatch);
                    this.play(`${this.artAnimationPrefix}-gulp`, true);
                }
                break;
            }

            case 'holding': {
                // Preso na boca até a invencibilidade do toque acabar; então
                // é cuspido longe, levando o segundo dano.
                const mouth = this.mouthPosition();
                this.holdTargetAt(mouth.x + this.facingSign * 10, mouth.y);
                this.holdTimer -= delta;
                if (this.holdTimer <= 0) {
                    this.spitTarget();
                }
                break;
            }
        }

        this.drawTongue();
    }

    // Ponta da língua encostou no jogador. Passa por takeDamage, que decide
    // tudo que não é problema do sapo: defesa (o sapo leva o revide),
    // invencibilidade e dash (a língua passa direto).
    private tryCatchTarget(): boolean {
        // Dash atravessa a língua, do mesmo jeito que atravessa inimigo.
        if (this.target.isDead || this.target.dash.isDashing) {
            return false;
        }

        const tip = this.tonguePoint(this.tongueLength);
        const targetBody = this.target.body as Physics.Arcade.Body;
        const distance = PhaserMath.Distance.Between(tip.x, tip.y, targetBody.center.x, targetBody.center.y);
        if (distance > FROG.tongueHitRadius) {
            return false;
        }

        const caught = this.target.takeDamage(FROG.tongueCatchDamage, -this.facingSign, this);
        if (!caught || this.target.isDead) {
            // Defendido, esquivado ou fatal: a língua só volta.
            this.tongue = 'retracting';
            return true;
        }

        this.tongue = 'pulling';
        this.caughtAt = this.scene.time.now;
        this.target.setControlsEnabled(false);
        this.scene.cameras.main.shake(120, 0.005);
        return true;
    }

    private spitTarget(): void {
        this.releaseTarget();
        this.tongue = 'none';
        this.tongueGraphics.clear();
        this.play(`${this.artAnimationPrefix}-tongue-out`, true);

        const spit: DamageSource = FROG.spitDamage;
        if (!this.target.takeDamage(spit, this.facingSign, this) && !this.target.isDead) {
            // Sem dano (ainda invencível): cospe do mesmo jeito.
            (this.target.body as Physics.Arcade.Body).setVelocity(
                (spit.knockbackX ?? 0) * this.facingSign,
                spit.knockbackY ?? 0
            );
        }
        this.scene.cameras.main.shake(180, 0.008);

        this.endExecuteEarly();
    }

    private finishTongue(): void {
        this.tongue = 'none';
        this.tongueLength = 0;
        this.tongueGraphics.clear();
        this.play(`${this.artAnimationPrefix}-idle`, true);
        this.endExecuteEarly();
    }

    // Devolve o controle ao jogador. Chamado ao cuspir e em qualquer saída
    // anormal (sapo morto ou destruído com o jogador ainda preso).
    private releaseTarget(): void {
        if ((this.tongue === 'pulling' || this.tongue === 'holding') && this.target?.active) {
            const body = this.target?.body as Physics.Arcade.Body | undefined;
            body?.setAllowGravity(true);
            if (!this.target.isDead) {
                this.target.setControlsEnabled(true);
            }
        }
    }

    private holdTargetAt(x: number, y: number): void {
        const body = this.target.body as Physics.Arcade.Body;
        body.setAllowGravity(false);
        // reset() move o CORPO junto com o sprite e zera a velocidade — só
        // mexer em x/y do sprite deixaria o corpo para trás.
        body.reset(x, y);
    }

    // A língua não atravessa parede: bate e volta.
    private tongueTipBlocked(): boolean {
        const tip = this.tonguePoint(this.tongueLength);
        return tip.y >= GROUND_Y || tip.x <= 0 || tip.x >= this.scene.physics.world.bounds.width;
    }

    private drawTongue(): void {
        const g = this.tongueGraphics;
        g.clear();
        if (this.tongue === 'none' || this.tongue === 'holding' || this.tongueLength <= 2) {
            return;
        }

        const mouth = this.mouthPosition();
        const tip = this.tonguePoint(this.tongueLength);

        // Contorno escuro, depois o rosa, depois o brilho: a mesma leitura de
        // três camadas do resto da arte.
        g.lineStyle(26, 0x2a0d18, 1).lineBetween(mouth.x, mouth.y, tip.x, tip.y);
        g.lineStyle(18, 0xe8708e, 1).lineBetween(mouth.x, mouth.y, tip.x, tip.y);
        g.lineStyle(5, 0xffb3c6, 0.9).lineBetween(mouth.x, mouth.y - 4, tip.x, tip.y - 4);
        // Ponta mais grossa e grudenta.
        g.fillStyle(0x2a0d18, 1).fillCircle(tip.x, tip.y, 21);
        g.fillStyle(0xd94f73, 1).fillCircle(tip.x, tip.y, 17);
        g.fillStyle(0xffb3c6, 1).fillCircle(tip.x - 5, tip.y - 6, 5);
    }

    private mouthPosition(): { x: number; y: number } {
        const scale = this.definition.scale;
        return {
            x: this.x + (MOUTH_FRAME_X - FRAME_CENTER) * scale * this.facingSign,
            y: this.y + (MOUTH_FRAME_Y - FRAME_CENTER) * scale
        };
    }

    private tonguePoint(length: number): { x: number; y: number } {
        const mouth = this.mouthPosition();
        return {
            x: mouth.x + Math.cos(this.tongueAngle) * length * this.facingSign,
            y: mouth.y + Math.sin(this.tongueAngle) * length
        };
    }

    // Para onde o sprite está virado AGORA (e não para onde está o jogador):
    // a língua sai da boca desenhada, mesmo que o jogador passe por trás.
    private get facingSign(): number {
        return this.flipX ? -1 : 1;
    }

    // ------------------------------------------------------------------------
    // Salto em cima do jogador
    // ------------------------------------------------------------------------
    private launch(velocityY: number): void {
        const direction = this.facingDirection;
        this.setFlipX(direction < 0);

        const worldWidth = this.scene.physics.world.bounds.width;
        this.landingX = PhaserMath.Clamp(this.target.x, 120, worldWidth - 120);
        // A sombra vai no piso em que o JOGADOR está (degrau, plataforma), e
        // não no chão da fase — lá embaixo ela ficaria escondida pelo terreno.
        const targetBody = this.target.body as Physics.Arcade.Body;
        this.landingY = targetBody.blocked.down ? targetBody.bottom : GROUND_Y;

        // Tempo de voo de ida e volta à mesma altura: 2·|vy|/g. O impulso
        // horizontal é o que faz ele cair exatamente onde o jogador estava.
        const gravity = this.scene.physics.world.gravity.y;
        const flightTime = (2 * Math.abs(velocityY)) / gravity;
        const speedX = PhaserMath.Clamp((this.landingX - this.x) / flightTime, -FROG.leapMaxSpeedX, FROG.leapMaxSpeedX);

        // Impulso direto no corpo: setVelocityX passa pela lentidão do gelo e
        // um salto pela metade erraria o alvo que a sombra mostra.
        this.arcadeBody.setVelocity(speedX, velocityY);
        this.landingX = PhaserMath.Clamp(this.x + speedX * flightTime, 120, worldWidth - 120);

        this.airborne = true;
        this.airTime = 0;
        this.stompApplied = false;
        this.play(`${this.artAnimationPrefix}-air`, true);
        this.showLandingShadow();
    }

    private updateLeap(delta: number): void {
        if (this.hopPauseTimer > 0) {
            this.hopPauseTimer -= delta;
            this.setVelocityX(0);
            if (this.hopPauseTimer <= 0) {
                this.hopsLeft--;
                this.launch(FROG.hopVelocityY);
            }
            return;
        }

        if (!this.airborne) {
            return;
        }

        this.airTime += delta;
        const body = this.arcadeBody;
        this.updateLandingShadow(body.velocity.y);

        // Caindo EM CIMA do jogador: esmaga já na queda, antes do pouso.
        if (body.velocity.y > 0 && !this.stompApplied && this.overlapsTarget()) {
            this.applyStomp();
        }

        // Tocar o chão na descida é o pouso. O tempo mínimo evita contar o
        // frame da decolagem, em que ele ainda está apoiado.
        if (this.airTime > 120 && body.velocity.y >= 0 && body.blocked.down) {
            this.land();
        }
    }

    private land(): void {
        this.airborne = false;
        this.setVelocityX(0);
        this.hideLandingShadow();
        this.play(`${this.artAnimationPrefix}-land`, true);
        this.scene.cameras.main.shake(240, this.hopsLeft > 0 ? 0.008 : 0.013);

        if (!this.stompApplied && this.targetNearLanding(FROG.stompRadius)) {
            this.applyStomp();
        }
        this.releaseShockwave();
        this.kickUpDust();

        if (this.hopsLeft > 0) {
            this.hopPauseTimer = FROG.hopPauseMs;
            this.play(`${this.artAnimationPrefix}-crouch`, true);
            return;
        }

        this.endExecuteEarly();
    }

    private applyStomp(): void {
        if (this.target.dash.isDashing) {
            return;
        }
        this.stompApplied = true;
        const direction = this.target.x >= this.x ? 1 : -1;
        this.target.takeDamage(FROG.stompDamage, direction, this);
    }

    // Onda no chão: mais larga que o esmagamento, mais fraca, e só pega quem
    // está com os pés no chão — pular na hora do pouso é a esquiva.
    private releaseShockwave(): void {
        const groundY = this.arcadeBody.bottom;
        const ring = this.scene.add.ellipse(this.x, groundY - 6, 60, 18, 0xcfe3a0, 0.6).setDepth(19);
        this.scene.tweens.add({
            targets: ring,
            scaleX: (FROG.shockwaveRadius * 2) / 60,
            scaleY: 2.2,
            alpha: 0,
            duration: 360,
            ease: 'Quad.out',
            onComplete: () => ring.destroy()
        });

        if (this.stompApplied) {
            return;
        }

        const targetBody = this.target.body as Physics.Arcade.Body;
        const onGround = targetBody.blocked.down;
        if (onGround && this.targetNearLanding(FROG.shockwaveRadius)) {
            const direction = this.target.x >= this.x ? 1 : -1;
            this.target.takeDamage(FROG.shockwaveDamage, direction, this);
        }
    }

    private targetNearLanding(radius: number): boolean {
        const horizontal = Math.abs(this.target.x - this.x);
        const vertical = Math.abs(this.target.y - this.y);
        return horizontal <= radius && vertical <= FROG.stompVerticalRange;
    }

    private overlapsTarget(): boolean {
        const own = this.arcadeBody;
        const other = this.target.body as Physics.Arcade.Body;
        // Um pouco abaixo dos pés: o esmagamento precisa sair antes do contato
        // físico, cujo dano de 1 daria invencibilidade e engoliria o de 2.
        return (
            own.right > other.left &&
            own.left < other.right &&
            own.bottom + 30 > other.top &&
            own.top < other.bottom
        );
    }

    // Sombra no chão onde ele vai cair: cresce e escurece conforme ele desce.
    // É o telegrafo do salto depois que ele já saiu do chão.
    private showLandingShadow(): void {
        this.landingShadow?.destroy();
        this.landingShadow = this.scene.add
            .ellipse(this.landingX, this.landingY - 4, 100, 22, 0x000000, 0.35)
            // Contorno vermelho: preto sozinho sumia em terra escura.
            .setStrokeStyle(3, 0xff4a3a, 0.9)
            // Logo abaixo do jogador (20): por baixo dele, mas por cima do
            // terreno e da decoração, que escondiam a sombra.
            .setDepth(19);
    }

    private updateLandingShadow(velocityY: number): void {
        if (!this.landingShadow) {
            return;
        }

        // 0 subindo no começo, 1 chegando ao chão.
        const falling = velocityY > 0 ? PhaserMath.Clamp(velocityY / 760, 0, 1) : 0.15;
        // Escala, e não setSize: no Phaser 4 redimensionar a elipse depois de
        // criada deixava a forma sem desenhar nada.
        this.landingShadow.setScale(0.9 + falling * 1.1, 0.9 + falling * 0.45);
        this.landingShadow.setFillStyle(0x000000, 0.35 + falling * 0.3);
    }

    private hideLandingShadow(): void {
        this.landingShadow?.destroy();
        this.landingShadow = undefined;
    }

    private kickUpDust(): void {
        const groundY = this.arcadeBody.bottom;
        for (let index = 0; index < 8; index++) {
            const side = index % 2 === 0 ? -1 : 1;
            const puff = this.scene.add
                .circle(this.x + side * PhaserMath.Between(20, 70), groundY - 6, PhaserMath.Between(6, 11), 0x9c8a62, 0.7)
                .setDepth(16);
            this.scene.tweens.add({
                targets: puff,
                x: puff.x + side * PhaserMath.Between(40, 90),
                y: puff.y - PhaserMath.Between(10, 30),
                alpha: 0,
                scale: 1.6,
                duration: PhaserMath.Between(320, 480),
                ease: 'Quad.out',
                onComplete: () => puff.destroy()
            });
        }
    }
}
