import { Physics } from 'phaser';

import { ATTACKS } from './attacks';
import { randomAttackAnimationKey } from './attack-variants';
import { MeleeHitbox } from './MeleeHitbox';
import { AttackDefinition } from './types';

// Componente de combate do jogador. Desacopla todo o ataque da entidade Player:
// o Player delega para cá a intenção de atacar e este componente controla
// cooldown, animação e o ciclo de vida da hitbox temporal.
//
// A hitbox só existe nos frames ativos definidos no catálogo de ataques. Quem
// detecta o impacto é a cena, via overlap com a hitbox; o dano e o knockback
// trafegam pelo evento 'impact'.
export class PlayerCombat {
    private activeAttack: AttackDefinition | null = null;
    private hitTargets = new Set<Physics.Arcade.Sprite>();
    private activeHitbox: MeleeHitbox | null = null;

    private cooldownUntil = 0;

    constructor(
        private scene: Phaser.Scene,
        private owner: Physics.Arcade.Sprite
    ) {}

    get isAttacking(): boolean {
        return this.activeAttack !== null;
    }

    get activeHitboxGameObject(): MeleeHitbox | null {
        return this.activeHitbox;
    }

    get activeAttackDefinition(): AttackDefinition | null {
        return this.activeAttack;
    }

    canAttack(now: number): boolean {
        return this.activeAttack === null && now >= this.cooldownUntil;
    }

    attemptAttack(now: number, onGround: boolean): boolean {
        if (!this.canAttack(now)) {
            return false;
        }

        // Golpes de chão por enquanto. Se houver ataques aéreos no catálogo,
        // a condição pode ser relaxada por definição sem mexer aqui.
        if (!onGround) {
            return false;
        }

        this.beginAttack(ATTACKS.basic);
        return true;
    }

    // Avança o estado do golpe. Chamado a cada frame pelo Player, que informa o
    // frame atual da animação para saber quando criar/encerrar a hitbox.
    update(currentAnimFrame: number | null): void {
        if (!this.activeAttack) {
            return;
        }

        const { activeStartFrame, activeEndFrame } = this.activeAttack.hitbox;

        if (currentAnimFrame !== null) {
            const inActiveWindow =
                currentAnimFrame >= activeStartFrame && currentAnimFrame <= activeEndFrame;

            if (inActiveWindow && !this.activeHitbox) {
                this.spawnHitbox();
            } else if (!inActiveWindow && this.activeHitbox) {
                this.destroyHitbox();
            }
        }

        // Re-posiciona a hitbox caso ainda exista (segue o dono).
        if (this.activeHitbox) {
            this.activeHitbox.follow(this.owner);
        }
    }

    // Encerra o golpe. Chamado pelo Player quando a animação termina.
    onAttackAnimationComplete(): void {
        this.endAttack();
    }

    // Marca um alvo como já atingido por este golpe, evitando acertar duas vezes.
    markTargetHit(target: Physics.Arcade.Sprite): void {
        this.hitTargets.add(target);
    }

    hasTargetBeenHit(target: Physics.Arcade.Sprite): boolean {
        return this.hitTargets.has(target);
    }

    private beginAttack(definition: AttackDefinition): void {
        this.activeAttack = definition;
        this.hitTargets.clear();

        // O evento 'attack' continua existindo por compatibilidade de assinatura,
        // mas a hitbox é a única fonte de verdade para o impacto agora.
        this.owner.emit('attack', this.owner);

        // Sorteia uma das 3 variantes visuais do golpe (ver attack-variants.ts);
        // todas têm o mesmo timing de 6 frames, então a hitbox não muda.
        const animationKey = randomAttackAnimationKey('player');
        this.owner.play(animationKey);
        this.owner.once('animationcomplete-' + animationKey, () => this.onAttackAnimationComplete());
    }

    private endAttack(): void {
        this.destroyHitbox();
        this.cooldownUntil = this.scene.time.now + (this.activeAttack?.cooldownMs ?? 0);
        this.activeAttack = null;
    }

    private spawnHitbox(): void {
        if (!this.activeAttack) {
            return;
        }

        this.activeHitbox = new MeleeHitbox(this.scene, this.owner, this.activeAttack.hitbox);
    }

    private destroyHitbox(): void {
        this.activeHitbox?.destroy();
        this.activeHitbox = null;
    }
}