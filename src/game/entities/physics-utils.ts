import { Physics } from 'phaser';

// Largura de frame das spritesheets do projeto (player e inimigos usam 48x48).
const FRAME_WIDTH = 48;

// O Arcade Physics do Phaser NÃO espelha `body.offset` quando o sprite usa
// `flipX` — o offset continua ancorado ao frame original (sem flip). Como os
// personagens deste jogo ocupam a metade esquerda do frame de 48px (não o
// centro), isso fazia a caixa de colisão "sobrar" pra frente ou pra trás
// dependendo da direção: virado para a esquerda, a caixa continuava com o
// deslocamento pensado para quando o sprite olha para a direita.
//
// Esta função recalcula offset.x a cada chamada, espelhando manualmente
// quando flipX está ativo. Deve ser chamada todo frame, depois de qualquer
// `setFlipX`, para o corpo físico acompanhar a direção visual.
export function syncFacingOffset(
    body: Physics.Arcade.Body,
    flipX: boolean,
    base: { offsetX: number; width: number }
): void {
    body.offset.x = flipX ? FRAME_WIDTH - base.offsetX - base.width : base.offsetX;
}
