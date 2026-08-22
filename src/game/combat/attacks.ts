import { AttackDefinition } from './types';

// Catálogo de ataques disponíveis. Cada ataque é um dado puro: a lógica de
// execução vive no PlayerCombat. Para adicionar armas, golpes ou combos no
// futuro, basta criar novas entradas aqui (ou trocar este catálogo por dados de
// equipamento), sem tocar na entidade Player.
//
// A animação `player-attack` tem 6 frames (índices 0..5). Medindo o bounding
// box de cada frame (48x48): o machado só se estende de fato no frame 4, indo
// até x=45 de um pivô central em x=24 (ou seja, ~21px de fonte = 63px de mundo
// à frente do centro do jogador); nos frames 3 e 5 a arma está recolhida perto
// do corpo. offsetX/width abaixo cobrem essa faixa (13 a 63px de mundo à
// frente do centro) em vez de um alcance genérico maior que o desenho real.
export const ATTACKS: Record<string, AttackDefinition> = {
    basic: {
        id: 'basic',
        cooldownMs: 380,

        damage: 1,
        knockbackX: 180,
        knockbackY: -140,

        hitbox: {
            offsetX: 38,
            offsetY: 6,
            width: 50,
            height: 66,
            // Janela ativa reduzida de 3 frames (300ms) para 2 frames (200ms, frames 4-5)
            // para aumentar peso e precisão do golpe. Frame 4 é o pico visual do impacto.
            // Antes: 3-5 (generoso, 50% da animação). Agora: 4-5 (preciso, 33%).
            activeStartFrame: 4,
            activeEndFrame: 5
        }
    }
};