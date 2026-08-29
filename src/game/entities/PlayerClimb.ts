import { Physics } from 'phaser';

import { PLAYER_CLIMB } from './player-config';

export type ClimbState = 'none' | 'gripping';

// Escalada: encostar numa parede marcada como `climbable` e segurar SHIFT (ou o
// direcional contra ela) prende o jogador nela, sem gravidade. Shift sobe
// sozinho; W/S dão o controle fino. Soltar a tecla ou dar dash larga a parede.
//
// Agarrar funciona TAMBÉM com os pés no chão. Antes exigia estar no ar, o que
// na prática significava pular rente à parede e acertar uma janela de poucos
// frames — quem chegava andando simplesmente não escalava.
export class PlayerClimb {
    private state: ClimbState = 'none';
    private wallDirection: 1 | -1 = 1;
    private wallTop = 0;
    private wallLeft = 0;
    private wallRight = 0;
    // Impede reagarrar no mesmo frame em que acaba de subir na borda.
    private regripBlockedUntil = 0;
    private touchingWallThisFrame = false;
    private verticalInput = 0;

    // O dash também liga/desliga a gravidade do mesmo corpo. Só devolvemos a
    // gravidade se foi esta classe que a desligou, senão um dash iniciado a
    // partir da parede seria atropelado no frame seguinte.
    private gravityHeld = false;

    // Janela em que o empurrão do mantle continua sendo reaplicado (ver
    // PLAYER_CLIMB.mantleDurationMs).
    private mantleTimer = 0;
    private mantleDirection: 1 | -1 = 1;

    constructor(private owner: Physics.Arcade.Sprite) {}

    get isGripping(): boolean {
        return this.state === 'gripping';
    }

    get isClimbingVertically(): boolean {
        return this.state === 'gripping' && this.verticalInput !== 0;
    }

    get touchingWallDirection(): 1 | -1 {
        return this.wallDirection;
    }

    // Verdadeiro no frame em que o collider encostou numa parede escalável.
    // Lido pelo Player ANTES de update() (que consome a marcação) para decidir
    // se o Espaço escala ou dá dash.
    get isTouchingWall(): boolean {
        return this.touchingWallThisFrame;
    }

    // A cena chama isto a cada frame em que há parede escalável ao alcance (ver
    // PhaseScene.updateWallProximity). `direction` é o lado em que a parede está
    // em relação ao jogador (-1 = parede à esquerda).
    markTouchingWall(direction: 1 | -1, wallTop: number, wallLeft: number, wallRight: number): void {
        this.touchingWallThisFrame = true;
        this.wallDirection = direction;
        this.wallTop = wallTop;
        this.wallLeft = wallLeft;
        this.wallRight = wallRight;
    }

    // `onGround` continua chegando por causa do mantle e da leitura de estado,
    // mas NÃO impede mais o agarre — ver o comentário do topo.
    update(onGround: boolean, holdingIntoWall: boolean, verticalInput: number, delta: number): void {
        const body = this.owner.body as Physics.Arcade.Body;

        // Mantle em andamento: reaplica o empurrão até o corpo passar da borda.
        // Enquanto ele estiver ao lado da parede a separação zera este valor
        // todo frame; assim que o topo é vencido, o mesmo empurrão finalmente
        // desloca o jogador para cima da superfície.
        if (this.mantleTimer > 0) {
            this.mantleTimer -= delta;
            body.setVelocityX(PLAYER_CLIMB.mantlePushX * this.mantleDirection);

            if (onGround) {
                this.mantleTimer = 0;
            }
            return;
        }
        const touching = this.touchingWallThisFrame;
        // O contato precisa ser renovado pelo collider no próximo frame.
        this.touchingWallThisFrame = false;

        // Só agarra chegando devagar ou caindo: assim o impulso do mantle (e um
        // pulo em disparada rente à parede) não gruda de novo no mesmo instante.
        // Já agarrado, a subida controlada não derruba o próprio grip.
        const canGrab = this.state === 'gripping' || body.velocity.y >= -50;

        if (this.owner.scene.time.now < this.regripBlockedUntil) {
            this.release();
            return;
        }

        if (!touching || !holdingIntoWall || !canGrab) {
            this.release();
            return;
        }

        // No chão, só vale agarrar para SUBIR. Sem isto, encostar na parede
        // segurando a tecla prenderia o jogador parado nela, de pé, sem que ele
        // tenha pedido nada.
        if (onGround && verticalInput >= 0) {
            this.release();
            return;
        }

        this.verticalInput = verticalInput;

        // Chegou ao topo: sobe na borda. É uma colocação DIRETA, e não um
        // impulso: com impulso o jogador passava da altura da borda mas voltava
        // a cair antes de entrar por cima dela — a desaceleração do ar comia o
        // empurrão, e ainda dava tempo de reagarrar na descida, virando um
        // sobe-e-desce infinito no último palmo da parede.
        if (verticalInput < 0 && body.top <= this.wallTop + 8) {
            const feetOffset = body.bottom - this.owner.y;
            const halfWidth = body.halfWidth;
            const margem = 4;

            this.owner.setPosition(
                this.wallDirection === 1
                    ? this.wallLeft + halfWidth + margem
                    : this.wallRight - halfWidth - margem,
                this.wallTop - feetOffset - 1
            );

            this.release();
            body.updateFromGameObject();
            body.setVelocity(0, 0);
            // Sem esta trava, a tecla ainda pressionada reagarra a mesma parede
            // no frame seguinte e o jogador nunca sai de cima dela.
            this.regripBlockedUntil = this.owner.scene.time.now + PLAYER_CLIMB.regripBlockMs;
            return;
        }

        this.state = 'gripping';

        if (!this.gravityHeld) {
            body.setAllowGravity(false);
            this.gravityHeld = true;
        }

        // Continua empurrando de leve CONTRA a parede. O collider só dispara
        // quando há sobreposição de fato; com velocidade zero o corpo pararia
        // de encostar no frame seguinte e o grip se soltaria sozinho. A
        // separação anula esse empurrão, então não há deslocamento visível.
        body.setVelocityX(PLAYER_CLIMB.wallStickSpeed * this.wallDirection);
        body.setVelocityY(
            verticalInput < 0
                ? -PLAYER_CLIMB.upSpeed
                : verticalInput > 0
                    ? PLAYER_CLIMB.downSpeed
                    : 0
        );
    }

    get isMantling(): boolean {
        return this.mantleTimer > 0;
    }

    release(): void {
        this.state = 'none';
        this.verticalInput = 0;

        if (this.gravityHeld) {
            (this.owner.body as Physics.Arcade.Body).setAllowGravity(true);
            this.gravityHeld = false;
        }
    }
}
