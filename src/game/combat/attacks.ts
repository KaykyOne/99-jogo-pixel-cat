import { AttackDefinition } from './types';

// Catálogo de ataques disponíveis. Cada ataque é um dado puro: a lógica de
// execução vive no PlayerCombat. Para adicionar armas, golpes ou combos no
// futuro, basta criar novas entradas aqui (ou trocar este catálogo por dados de
// equipamento), sem tocar na entidade Player.
//
// A animação `player-attack` tem 6 frames (índices 0..5). O frame 3 é o momento
// visual do impacto, portanto a hitbox fica ativa apenas nos frames 3..5.
export const ATTACKS: Record<string, AttackDefinition> = {
    basic: {
        id: 'basic',
        animationKey: 'player-attack',
        cooldownMs: 380,

        damage: 1,
        knockbackX: 180,
        knockbackY: -140,

        hitbox: {
            offsetX: 70,
            offsetY: -8,
            width: 90,
            height: 82,
            activeStartFrame: 3,
            activeEndFrame: 5
        }
    }
};