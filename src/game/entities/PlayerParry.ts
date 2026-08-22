import { Physics, Scene } from 'phaser';

import { PLAYER_PARRY } from './player-config';

export type ParryReadiness = 'ready' | 'active' | 'recovering' | 'charging';

// Quem pode ser defendido. Declarado como forma estrutural em vez de importar
// BaseEnemy de propósito: BaseEnemy importa Player, que importa este arquivo —
// importar de volta fecharia um ciclo em tempo de execução.
export type Parryable = {
    stagger(durationMs: number): void;
};

// Defesa do jogador (tecla Q). Anula o dano do golpe que chegar dentro da
// janela ativa e devolve o revide: quem foi defendido leva a reação de dano
// (sem perder vida) e fica sem atacar por PLAYER_PARRY.staggerMs.
//
// Segue o mesmo padrão de PlayerDash e PlayerClimb: o Player só entrega a
// intenção, o componente controla janela, cooldown e efeito.
export class PlayerParry {
    private state: 'idle' | 'active' | 'recovering' = 'idle';
    private activeUntil = 0;
    private recoveringUntil = 0;
    private cooldownUntil = 0;

    constructor(
        private scene: Scene,
        private owner: Physics.Arcade.Sprite
    ) {}

    get isActive(): boolean {
        return this.state === 'active';
    }

    // Enquanto defende ou se recupera, o jogador fica plantado: é o custo de
    // apertar Q na hora errada.
    get isBusy(): boolean {
        return this.state !== 'idle';
    }

    get readiness(): ParryReadiness {
        if (this.state === 'active') {
            return 'active';
        }
        if (this.state === 'recovering') {
            return 'recovering';
        }
        return this.scene.time.now >= this.cooldownUntil ? 'ready' : 'charging';
    }

    attempt(time: number): boolean {
        if (this.state !== 'idle' || time < this.cooldownUntil) {
            return false;
        }

        this.state = 'active';
        this.activeUntil = time + PLAYER_PARRY.activeMs;
        this.cooldownUntil = time + PLAYER_PARRY.cooldownMs;

        // Não há asset de defesa: congela o frame de salto (mesma solução
        // pragmática já usada na escalada) e pinta de azul-claro para o estado
        // ficar legível.
        this.owner.play('player-jump', true);
        this.owner.anims.pause();
        this.owner.setTint(0x7fd4ff);

        return true;
    }

    update(time: number): void {
        if (this.state === 'active' && time >= this.activeUntil) {
            this.state = 'recovering';
            this.recoveringUntil = time + PLAYER_PARRY.recoveryMs;
            this.owner.clearTint();
            return;
        }

        if (this.state === 'recovering' && time >= this.recoveringUntil) {
            this.state = 'idle';
            this.owner.anims.resume();
        }
    }

    // Chamado pelo Player quando um dano chega com a defesa ativa. `attacker`
    // pode faltar (armadilha, projétil de dono já morto): nesse caso o dano é
    // anulado do mesmo jeito, só não há em quem revidar.
    absorb(attacker?: Parryable): void {
        attacker?.stagger(PLAYER_PARRY.staggerMs);

        this.flash();

        // Mesmo vocabulário de impacto que a cena usa ao acertar um inimigo:
        // congela a simulação por um instante e sacode a câmera. Sem isso a
        // defesa acerta e não se sente nada.
        this.scene.physics.world.pause();
        this.scene.time.delayedCall(70, () => this.scene.physics.world.resume());
        this.scene.cameras.main.shake(140, 0.006);
    }

    // Interrompe a defesa (usado quando o jogador morre).
    cancel(): void {
        if (this.state === 'idle') {
            return;
        }

        this.state = 'idle';
        this.owner.clearTint();
        this.owner.anims.resume();
    }

    // Clarão branco curto em volta do jogador, marcando o instante da defesa.
    private flash(): void {
        const ring = this.scene.add
            .circle(this.owner.x, this.owner.y, 26, 0xffffff, 0.55)
            .setDepth(22);

        this.scene.tweens.add({
            targets: ring,
            radius: 74,
            alpha: 0,
            duration: 260,
            ease: 'Quad.out',
            onComplete: () => ring.destroy()
        });
    }
}
