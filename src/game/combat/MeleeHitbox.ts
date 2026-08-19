import { GameObjects, Physics, Scene } from 'phaser';

import { HitboxDefinition } from './types';

// Hitbox temporária de golpe corpo a corpo. É uma Zone invisível criada na
// frente do dono, na direção em que ele está virado. A cena usa overlap entre
// esta zona e os inimigos; as dimensões vêm da definição do ataque, permitindo
// armas diferentes com alcances diferentes.
export class MeleeHitbox extends GameObjects.Zone {
    readonly hitboxDefinition: HitboxDefinition;
    readonly hitDirection: number;

    constructor(scene: Scene, owner: Physics.Arcade.Sprite, hitbox: HitboxDefinition) {
        // 1 = direita (padrão), -1 = esquerda (sprite virado).
        const hitDirection = owner.flipX ? -1 : 1;

        const centerX = owner.x + hitbox.offsetX * hitDirection;
        const centerY = owner.y + hitbox.offsetY;

        super(scene, centerX, centerY, hitbox.width, hitbox.height);

        this.hitboxDefinition = hitbox;
        this.hitDirection = hitDirection;

        // A Zone fica invisível (não chama fill/draw por padrão) e recebe um
        // corpo estático para poder participar de overlap sem aplicar física.
        scene.add.existing(this);
        scene.physics.add.existing(this, true);
    }

    // Mantém a hitbox posicionada na frente do dono, seguindo-o enquanto o golpe
    // estiver ativo. A direção é fixa após a criação para evitar inverter o alvo
    // de impacto caso o jogador vire no meio da animação.
    follow(owner: Physics.Arcade.Sprite): this {
        this.x = owner.x + this.hitboxDefinition.offsetX * this.hitDirection;
        this.y = owner.y + this.hitboxDefinition.offsetY;

        // O corpo estático não segue automaticamente o game object; sincroniza
        // manualmente para que o overlap acompanhe a nova posição da zona.
        (this.body as Physics.Arcade.StaticBody).updateFromGameObject();
        return this;
    }
}