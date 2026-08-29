import { GameObjects, Scene } from 'phaser';

import { ItemDef, ItemId, ITEM_ART_GRID, ITEMS } from './item-catalog';

// Desenho por blocos dos itens. Um único lugar traduz a grade 8x8 do catálogo
// em fillRect — HUD, item caído e loja chamam a mesma função, então mudar o
// desenho de um item é mudar oito strings no catálogo, e nada mais.

const OUTLINE = 0x1a1410;

// Clareia uma cor em direção ao branco. É o 'h' da grade: sem um realce o
// desenho fica chapado, e com um segundo campo de cor no catálogo cada item
// teria mais um número para manter em sincronia à toa.
function lighten(color: number, amount = 0.45): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
    return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

function colorOf(code: string, def: ItemDef): number | null {
    switch (code) {
        case 'o': return OUTLINE;
        case 'b': return def.color;
        case 'a': return def.accent;
        case 'h': return lighten(def.color);
        default: return null;
    }
}

// Pinta o item dentro de um quadrado de lado `size` centrado em (cx, cy).
// Não limpa o Graphics: quem chama decide se acumula vários itens no mesmo.
export function drawItemBlocks(
    graphics: GameObjects.Graphics,
    id: ItemId,
    cx: number,
    cy: number,
    size: number
): void {
    const def = ITEMS[id];
    const cell = size / ITEM_ART_GRID;
    const originX = cx - size / 2;
    const originY = cy - size / 2;

    for (let row = 0; row < def.art.length; row++) {
        const line = def.art[row];
        for (let column = 0; column < line.length; column++) {
            const color = colorOf(line[column], def);
            if (color === null) {
                continue;
            }

            graphics.fillStyle(color, 1);
            // +0.5 na largura fecha a costura de subpixel entre blocos vizinhos
            // quando `size` não é múltiplo exato de 8.
            graphics.fillRect(originX + column * cell, originY + row * cell, cell + 0.5, cell + 0.5);
        }
    }
}

// Gera (uma única vez por item) a textura usada pelos itens caídos no chão.
// Um Graphics por moeda no chão seria um objeto de desenho por drop; a textura
// transforma todos eles em sprites baratos do mesmo atlas interno.
export function ensureItemTexture(scene: Scene, id: ItemId, size = 24): string {
    const key = `item-${id}-${size}`;
    if (scene.textures.exists(key)) {
        return key;
    }

    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    drawItemBlocks(graphics, id, size / 2, size / 2, size);
    graphics.generateTexture(key, size, size);
    graphics.destroy();

    return key;
}
