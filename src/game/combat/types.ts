import { Physics } from 'phaser';

// Um ataque é uma definição de dados. Ter isto desacoplado da entidade Player
// permite, no futuro, catalogar armas, golpes e combos sem alterar o Player.
export type AttackDefinition = {
    id: string;
    animationKey: string;
    cooldownMs: number;

    // Dano e reação aplicados ao atingido.
    damage: number;
    knockbackX: number;
    knockbackY: number;

    hitbox: HitboxDefinition;
};

// Hitbox descrita em unidades de mundo, relativa ao centro do dono do ataque.
// A direção (esquerda/direita) é resolvida em tempo de execução pelo flipX.
export type HitboxDefinition = {
    // Distância do centro do dono até o centro da hitbox (sempre para a "frente").
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;

    // Frames da animação em que a hitbox fica ativa, inclusive. Torna o golpe
    // temporal: só acerta no instante visual do impacto.
    activeStartFrame: number;
    activeEndFrame: number;
};

// Evento de impacto emitido pelo sistema de combate. A cena escuta este evento
// para aplicar dano, knockback, hit-stop e screen shake, sem depender do Player.
export type ImpactResult = {
    attackId: string;
    target: Physics.Arcade.Sprite;
    damage: number;
    knockbackX: number;
    knockbackY: number;

    // Direção do golpe: 1 = direita, -1 = esquerda.
    hitDirection: number;
};