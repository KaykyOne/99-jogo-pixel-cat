import { Math as PhaserMath } from 'phaser';

// Quantidade de variantes visuais de ataque disponíveis por personagem
// (player e cada tipo de inimigo têm 3 spritesheets de golpe, mesmo timing de
// 6 frames cada — a escolha entre elas é só estética).
const ATTACK_VARIANT_COUNT = 3;

// Sorteia a chave de animação `${prefix}-attack-${1..3}`. Único ponto usado
// tanto pelo PlayerCombat quanto pelo BaseEnemy para escolher a variante do
// golpe a cada novo ataque.
export function randomAttackAnimationKey(prefix: string): string {
    return `${prefix}-attack-${PhaserMath.Between(1, ATTACK_VARIANT_COUNT)}`;
}

// Tempo (ms) até o instante de impacto do golpe do inimigo, usado pra
// sincronizar quando o dano é aplicado com a animação (~frame 3 de 6 a
// frameRate 10, mesmo ponto de impacto usado nas variantes do player).
export const ENEMY_ATTACK_IMPACT_DELAY_MS = 300;
