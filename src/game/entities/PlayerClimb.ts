import { Physics } from 'phaser';

import { PLAYER_CLIMB } from './player-config';

export type ClimbState = 'none' | 'gripping';

// Escalada estilo Celeste: encostar numa parede marcada como `climbable` e
// segurar o direcional contra ela prende o jogador nela (sem gravidade); W
// sobe, S desce. Soltar o direcional, tocar o chão ou dar dash larga a parede.
export class PlayerClimb {
    private state: ClimbState = 'none';
    private wallDirection: 1 | -1 = 1;
    private wallTop = 0;
    private touchingWallThisFrame = false;
    private verticalInput = 0;

    // O dash também liga/desliga a gravidade do mesmo corpo. Só devolvemos a
    // gravidade se foi esta classe que a desligou, senão um dash iniciado a
    // partir da parede seria atropelado no frame seguinte.
    private gravityHeld = false;

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

    // O collider dedicado chama este método a cada frame de contato com uma
    // plataforma marcada como escalável. `direction` é o lado em que a parede
    // está em relação ao jogador (-1 = parede à esquerda).
    markTouchingWall(direction: 1 | -1, wallTop: number): void {
        this.touchingWallThisFrame = true;
        this.wallDirection = direction;
        this.wallTop = wallTop;
    }

    update(onGround: boolean, holdingIntoWall: boolean, verticalInput: number): void {
        const body = this.owner.body as Physics.Arcade.Body;
        const touching = this.touchingWallThisFrame;
        // O contato precisa ser renovado pelo collider no próximo frame.
        this.touchingWallThisFrame = false;

        // Só agarra chegando devagar ou caindo: assim o impulso do mantle (e um
        // pulo em disparada rente à parede) não gruda de novo no mesmo instante.
        // Já agarrado, a subida controlada não derruba o próprio grip.
        const canGrab = this.state === 'gripping' || body.velocity.y >= -50;

        if (!touching || !holdingIntoWall || onGround || !canGrab) {
            this.release();
            return;
        }

        this.verticalInput = verticalInput;

        // No topo não sobra o que agarrar. Um impulso curto joga o jogador
        // acima da borda e PARA CIMA DA SUPERFÍCIE — o topo fica do lado da
        // parede, então o empurrão vai na direção dela, não para longe. Sem
        // isso ele emperraria no último palmo e escorregaria de volta.
        if (verticalInput < 0 && body.top <= this.wallTop + 8) {
            this.release();
            body.setVelocityY(PLAYER_CLIMB.mantleVelocityY);
            body.setVelocityX(PLAYER_CLIMB.mantlePushX * this.wallDirection);
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

    release(): void {
        this.state = 'none';
        this.verticalInput = 0;

        if (this.gravityHeld) {
            (this.owner.body as Physics.Arcade.Body).setAllowGravity(true);
            this.gravityHeld = false;
        }
    }
}
