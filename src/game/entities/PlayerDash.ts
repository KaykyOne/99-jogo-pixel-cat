import { Physics } from 'phaser';

import { PLAYER_DASH, PLAYER_MOVEMENT } from './player-config';

export type DashReadiness = 'ready' | 'charging';

// Invulnerabilidade geral permanece fora deste componente: durante o dash a
// cena ignora exclusivamente a colisão de contato com inimigos.
export class PlayerDash {
    private state: 'idle' | 'dashing' = 'idle';
    private dashEndAt = 0;
    private cooldownUntil = 0;

    constructor(
        private scene: Phaser.Scene,
        private owner: Physics.Arcade.Sprite
    ) {}

    get isDashing(): boolean {
        return this.state === 'dashing';
    }

    get readiness(): DashReadiness {
        return this.scene.time.now >= this.cooldownUntil ? 'ready' : 'charging';
    }

    attemptDash(time: number, direction: 1 | -1): boolean {
        if (this.state === 'dashing' || this.readiness !== 'ready') {
            return false;
        }

        this.state = 'dashing';
        this.dashEndAt = time + PLAYER_DASH.durationMs;
        this.cooldownUntil = time + PLAYER_DASH.cooldownMs;

        const body = this.owner.body as Physics.Arcade.Body;
        // O limite normal é menor que a velocidade do dash e precisa ser
        // elevado temporariamente para o Arcade Physics não cortar o impulso.
        body.setMaxVelocity(PLAYER_DASH.speed, PLAYER_MOVEMENT.maxFallSpeed);
        body.setVelocityX(PLAYER_DASH.speed * direction);

        if (PLAYER_DASH.freezeGravityDuringDash) {
            body.setVelocityY(0);
            body.setAllowGravity(false);
        }

        this.owner.play('player-run', true);
        return true;
    }

    update(time: number): void {
        if (this.state !== 'dashing' || time < this.dashEndAt) {
            return;
        }

        this.state = 'idle';
        const body = this.owner.body as Physics.Arcade.Body;
        body.setMaxVelocity(PLAYER_MOVEMENT.maxSpeed, PLAYER_MOVEMENT.maxFallSpeed);

        if (PLAYER_DASH.freezeGravityDuringDash) {
            body.setAllowGravity(true);
        }
    }
}
