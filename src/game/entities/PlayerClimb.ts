import { Math as PhaserMath, Physics } from 'phaser';

import { PLAYER_CLIMB } from './player-config';

// 'mantle-rise' e 'mantle-over' são as duas etapas da subida por cima da borda.
export type ClimbState = 'none' | 'gripping' | 'mantle-rise' | 'mantle-over';

// Escalada: encostar numa parede marcada como `climbable` e segurar W/seta pra
// cima (ou o direcional contra ela) prende o jogador nela, sem gravidade. Cima
// sobe, baixo desce. Soltar a tecla ou dar dash larga a parede.
//
// Agarrar funciona TAMBÉM com os pés no chão. Antes exigia estar no ar, o que
// na prática significava pular rente à parede e acertar uma janela de poucos
// frames — quem chegava andando simplesmente não escalava.
//
// Chegando ao topo, o jogador sobe na borda por movimento contínuo (ergue o
// corpo, depois desliza para cima). Antes era um setPosition direto, que
// lia como teletransporte da altura do corpo inteiro num frame.
export class PlayerClimb {
    private state: ClimbState = 'none';
    private wallDirection: 1 | -1 = 1;
    private wallTop = 0;
    private wallLeft = 0;
    private wallRight = 0;
    // Impede reagarrar logo depois de subir na borda.
    private regripBlockedUntil = 0;
    private touchingWallThisFrame = false;
    private verticalInput = 0;
    // Velocidade vertical agarrado, acelerada aos poucos até upSpeed/downSpeed.
    private climbVelocityY = 0;
    private mantleUntil = 0;

    // O dash também liga/desliga a gravidade do mesmo corpo. Só devolvemos a
    // gravidade se foi esta classe que a desligou, senão um dash iniciado a
    // partir da parede seria atropelado no frame seguinte.
    private gravityHeld = false;

    constructor(private owner: Physics.Arcade.Sprite) {}

    get isGripping(): boolean {
        return this.state === 'gripping';
    }

    get isMantling(): boolean {
        return this.state === 'mantle-rise' || this.state === 'mantle-over';
    }

    // Agarrado OU subindo na borda: em ambos esta classe é dona do corpo, e o
    // Player não aplica movimento, pulo nem defesa por cima.
    get isBusy(): boolean {
        return this.state !== 'none';
    }

    get isClimbingVertically(): boolean {
        return this.state === 'gripping' && this.verticalInput !== 0;
    }

    get touchingWallDirection(): 1 | -1 {
        return this.wallDirection;
    }

    // Verdadeiro no frame em que há parede escalável ao alcance. Lido pelo
    // Player ANTES de update() (que consome a marcação).
    get isTouchingWall(): boolean {
        return this.touchingWallThisFrame;
    }

    // A cena chama isto a cada frame em que há parede escalável ao alcance (ver
    // Game.updateWallProximity). `direction` é o lado em que a parede está em
    // relação ao jogador (-1 = parede à esquerda).
    markTouchingWall(direction: 1 | -1, wallTop: number, wallLeft: number, wallRight: number): void {
        this.touchingWallThisFrame = true;
        this.wallDirection = direction;
        this.wallTop = wallTop;
        this.wallLeft = wallLeft;
        this.wallRight = wallRight;
    }

    update(onGround: boolean, holdingIntoWall: boolean, verticalInput: number, delta: number): void {
        const body = this.owner.body as Physics.Arcade.Body;
        const touching = this.touchingWallThisFrame;
        // O contato precisa ser renovado pela cena no próximo frame.
        this.touchingWallThisFrame = false;

        // A subida na borda segue sozinha até o fim: soltar a tecla no meio
        // não derruba o jogador de volta.
        if (this.isMantling) {
            this.updateMantle(body);
            return;
        }

        if (this.owner.scene.time.now < this.regripBlockedUntil) {
            this.release();
            return;
        }

        // Só agarra chegando devagar ou caindo: um pulo em disparada rente à
        // parede não gruda nela no meio da subida. Já agarrado, a própria
        // escalada não derruba o grip.
        const canGrab = this.state === 'gripping' || body.velocity.y >= -50;

        if (!touching || !holdingIntoWall || !canGrab) {
            this.release();
            return;
        }

        // No chão, só vale agarrar para SUBIR. Sem isto, encostar na parede
        // segurando o direcional prenderia o jogador parado nela, de pé.
        if (onGround && verticalInput >= 0) {
            this.release();
            return;
        }

        this.verticalInput = verticalInput;

        // Mãos na borda: começa a subir por cima dela.
        if (verticalInput < 0 && body.top <= this.wallTop + PLAYER_CLIMB.ledgeGrabOffset) {
            this.startMantle(body);
            return;
        }

        if (this.state !== 'gripping') {
            // Agarrar para a queda na hora: o jogador sente a mão pegando.
            this.state = 'gripping';
            this.climbVelocityY = 0;
        }
        this.holdGravity(body);

        const targetVelocityY =
            verticalInput < 0 ? -PLAYER_CLIMB.upSpeed : verticalInput > 0 ? PLAYER_CLIMB.downSpeed : 0;
        const step = (PLAYER_CLIMB.acceleration * delta) / 1000;
        this.climbVelocityY =
            this.climbVelocityY < targetVelocityY
                ? Math.min(this.climbVelocityY + step, targetVelocityY)
                : Math.max(this.climbVelocityY - step, targetVelocityY);

        // Continua empurrando de leve CONTRA a parede. Com velocidade zero o
        // corpo deixaria de encostar e o grip se soltaria sozinho; a separação
        // do collider anula o empurrão, então não há deslocamento visível.
        body.setVelocityX(PLAYER_CLIMB.wallStickSpeed * this.wallDirection);
        body.setVelocityY(this.climbVelocityY);
    }

    release(): void {
        this.state = 'none';
        this.verticalInput = 0;
        this.climbVelocityY = 0;

        if (this.gravityHeld) {
            (this.owner.body as Physics.Arcade.Body).setAllowGravity(true);
            this.gravityHeld = false;
        }
    }

    private startMantle(body: Physics.Arcade.Body): void {
        this.state = 'mantle-rise';
        this.verticalInput = 0;
        this.mantleUntil = this.owner.scene.time.now + PLAYER_CLIMB.mantleTimeoutMs;
        this.holdGravity(body);
        this.updateMantle(body);
    }

    private updateMantle(body: Physics.Arcade.Body): void {
        if (this.owner.scene.time.now >= this.mantleUntil) {
            this.finishMantle(body);
            return;
        }

        if (this.state === 'mantle-rise') {
            // Etapa 1: sobe rente à parede (sem empurrar contra ela, senão a
            // quina da borda seguraria o corpo) até os pés passarem do topo.
            const remaining = body.bottom - (this.wallTop - 1);
            if (remaining > 0) {
                const speed = PhaserMath.Clamp(
                    remaining * PLAYER_CLIMB.mantleRiseEase,
                    PLAYER_CLIMB.mantleRiseMinSpeed,
                    PLAYER_CLIMB.mantleRiseSpeed
                );
                body.setVelocity(0, -speed);
                return;
            }

            this.state = 'mantle-over';
        }

        // Etapa 2: desliza para cima da plataforma até o corpo inteiro estar
        // sobre ela.
        const onTop =
            this.wallDirection === 1
                ? body.left >= this.wallLeft + 2
                : body.right <= this.wallRight - 2;
        if (onTop) {
            this.finishMantle(body);
            return;
        }

        body.setVelocity(PLAYER_CLIMB.mantleOverSpeed * this.wallDirection, 0);
    }

    private finishMantle(body: Physics.Arcade.Body): void {
        this.release();
        body.setVelocity(0, 0);
        // Sem esta trava, a tecla ainda pressionada reagarraria a parede no
        // frame seguinte.
        this.regripBlockedUntil = this.owner.scene.time.now + PLAYER_CLIMB.regripBlockMs;
    }

    private holdGravity(body: Physics.Arcade.Body): void {
        if (!this.gravityHeld) {
            body.setAllowGravity(false);
            this.gravityHeld = true;
        }
    }
}
