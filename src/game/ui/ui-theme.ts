import { GameObjects, Types } from 'phaser';

// Tema visual único da UI (inspirado em Kingdom Two Crowns): madeira,
// pergaminho, tinta e ouro, com ícones em pixel art desenhados por blocos.
// Sem assets de UI — todo painel é Graphics, no mesmo espírito da arte dos
// itens (items/item-art.ts). Mudar o visual da UI é mudar ESTE arquivo.

// Tábua do HUD no canto superior esquerdo (nome da fase, vida, mana, arma).
// Aqui, e não no CombatHud, porque a barra do boss também precisa desviar dela.
export const HUD_PANEL = { x: 20, y: 18, width: 300, height: 128 } as const;

// Fonte pixel carregada em public/style.css e aguardada no PreloadScene. Se
// ela não estiver disponível, o monospace do sistema assume.
export const UI_FONT = '"Pixelify Sans", monospace';

export const UI_COLORS = {
    woodDark: 0x24160d,
    woodMid: 0x5b3a22,
    woodLight: 0x7d5230,
    woodHighlight: 0xa8713f,
    nail: 0xd2bb7f,

    parchment: 0xead9ac,
    parchmentShade: 0xd4bc86,
    parchmentEdge: 0x8f6d40,

    ink: 0x3a2716,
    gold: 0xf5c542,
    goldDark: 0xa8741a,
    red: 0xc23b2e,
    redDark: 0x6e1c16,
    mana: 0x3f78d0,
    manaLight: 0x9fd0ff,
    bone: 0xefe6cf
} as const;

// As mesmas cores em CSS, para os textos.
export const UI_CSS = {
    ink: '#3a2716',
    inkSoft: '#6b5236',
    cream: '#f7e7b0',
    gold: '#f5c542',
    red: '#e0503f',
    green: '#9ccc6a',
    mana: '#9fd0ff',
    muted: '#c9b58c',
    outline: '#1a0f08'
} as const;

// Estilo de texto da UI. `outlined` dá o contorno escuro que mantém o texto
// legível direto sobre o cenário (sem painel atrás).
export function uiText(
    size: number,
    color: string = UI_CSS.cream,
    extra: Types.GameObjects.Text.TextStyle = {}
): Types.GameObjects.Text.TextStyle {
    return { fontFamily: UI_FONT, fontSize: `${size}px`, color, ...extra };
}

export function uiTextOutlined(
    size: number,
    color: string = UI_CSS.cream,
    extra: Types.GameObjects.Text.TextStyle = {}
): Types.GameObjects.Text.TextStyle {
    return uiText(size, color, { stroke: UI_CSS.outline, strokeThickness: 3, ...extra });
}

// Retângulo com os cantos cortados em degrau de `step` px: é o que faz um
// painel ler como pixel art em vez de caixa arredondada de interface web.
function fillSteppedRect(
    g: GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    step: number
): void {
    g.fillRect(x + step, y, width - step * 2, height);
    g.fillRect(x, y + step, width, height - step * 2);
}

// Tábua de madeira: contorno escuro, miolo com veios, realce no topo e pregos
// nos cantos. `inner` devolve a área útil de dentro.
export function drawWoodFrame(
    g: GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 1
): { x: number; y: number; width: number; height: number } {
    const c = UI_COLORS;

    g.fillStyle(0x000000, 0.28 * alpha);
    fillSteppedRect(g, x + 3, y + 4, width, height, 4);

    g.fillStyle(c.woodDark, alpha);
    fillSteppedRect(g, x, y, width, height, 4);

    g.fillStyle(c.woodMid, alpha);
    fillSteppedRect(g, x + 3, y + 3, width - 6, height - 6, 3);

    // Veios horizontais, espaçados irregularmente.
    g.fillStyle(c.woodLight, 0.55 * alpha);
    for (let row = y + 9, index = 0; row < y + height - 6; row += 7 + (index % 3) * 3, index++) {
        const inset = 10 + ((index * 23) % 30);
        g.fillRect(x + inset, row, Math.max(0, width - inset * 2 - ((index * 17) % 20)), 1);
    }

    g.fillStyle(c.woodHighlight, 0.8 * alpha);
    g.fillRect(x + 6, y + 3, width - 12, 2);

    g.fillStyle(c.nail, alpha);
    const nails: [number, number][] = [
        [x + 6, y + 6],
        [x + width - 9, y + 6],
        [x + 6, y + height - 9],
        [x + width - 9, y + height - 9]
    ];
    for (const [nx, ny] of nails) {
        g.fillRect(nx, ny, 3, 3);
    }

    return { x: x + 8, y: y + 8, width: width - 16, height: height - 16 };
}

// Pergaminho: borda escura em degrau, papel com manchas e sombra embaixo, e
// uma serrilha nas bordas de cima e de baixo ("rasgado").
export function drawParchment(
    g: GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    alpha = 1
): void {
    const c = UI_COLORS;

    g.fillStyle(0x000000, 0.25 * alpha);
    fillSteppedRect(g, x + 3, y + 4, width, height, 4);

    g.fillStyle(c.parchmentEdge, alpha);
    fillSteppedRect(g, x, y, width, height, 4);

    g.fillStyle(c.parchment, alpha);
    fillSteppedRect(g, x + 2, y + 2, width - 4, height - 4, 3);

    g.fillStyle(c.parchmentShade, alpha);
    g.fillRect(x + 4, y + height - 8, width - 8, 5);

    // Serrilha: pequenos dentes da cor da borda, em passo irregular.
    g.fillStyle(c.parchmentEdge, 0.8 * alpha);
    for (let px = x + 10, index = 0; px < x + width - 10; px += 11 + (index % 4) * 3, index++) {
        g.fillRect(px, y + 2, 3, 2 + (index % 2));
        g.fillRect(px + 5, y + height - 4 - (index % 2), 3, 2 + (index % 2));
    }

    // Manchas de envelhecimento.
    g.fillStyle(c.parchmentShade, 0.6 * alpha);
    for (let index = 0; index < Math.floor(width / 60); index++) {
        const sx = x + 14 + ((index * 97) % Math.max(1, width - 40));
        const sy = y + 10 + ((index * 53) % Math.max(1, height - 26));
        g.fillRect(sx, sy, 6 + (index % 3) * 2, 2);
    }
}

// Rolo de madeira do pergaminho (vertical), centrado em cx.
export function drawScrollRoller(g: GameObjects.Graphics, cx: number, top: number, height: number): void {
    const c = UI_COLORS;

    g.fillStyle(c.woodDark).fillRect(cx - 9, top + 6, 18, height - 12);
    g.fillStyle(c.woodLight).fillRect(cx - 6, top + 6, 12, height - 12);
    g.fillStyle(c.woodHighlight).fillRect(cx - 3, top + 6, 3, height - 12);

    // Pontas torneadas.
    for (const capY of [top, top + height - 10]) {
        g.fillStyle(c.woodDark).fillRect(cx - 12, capY, 24, 10);
        g.fillStyle(c.goldDark).fillRect(cx - 9, capY + 2, 18, 6);
        g.fillStyle(c.gold).fillRect(cx - 9, capY + 2, 18, 2);
    }
}

// --- Ícones por blocos -------------------------------------------------------
// Mesma ideia da arte dos itens: cada caractere é um bloco, '.' é vazio.
export type BlockArt = readonly string[];
export type BlockPalette = Readonly<Record<string, number>>;

// Pinta a arte num quadrado de lado `size` centrado em (cx, cy). O bloco é
// quadrado e dimensionado pelo maior lado da arte.
export function drawBlockArt(
    g: GameObjects.Graphics,
    art: BlockArt,
    palette: BlockPalette,
    cx: number,
    cy: number,
    size: number,
    alpha = 1
): void {
    const rows = art.length;
    const cols = Math.max(...art.map(line => line.length));
    const cell = size / Math.max(rows, cols);
    const originX = cx - (cols * cell) / 2;
    const originY = cy - (rows * cell) / 2;

    for (let row = 0; row < rows; row++) {
        const line = art[row];
        for (let col = 0; col < line.length; col++) {
            const color = palette[line[col]];
            if (color === undefined) {
                continue;
            }
            g.fillStyle(color, alpha);
            g.fillRect(originX + col * cell, originY + row * cell, cell + 0.5, cell + 0.5);
        }
    }
}

const OUTLINE = 0x1a0f08;

export const ICONS = {
    heart: {
        art: [
            '.oo..oo.',
            'orroorro',
            'ohrrrrro',
            'orrrrrro',
            '.orrrro.',
            '..orro..',
            '...oo...'
        ],
        palette: { o: OUTLINE, r: UI_COLORS.red, h: 0xff9a8a }
    },
    heartEmpty: {
        art: [
            '.oo..oo.',
            'oeeooeeo',
            'oeeeeeeo',
            'oeeeeeeo',
            '.oeeeeo.',
            '..oeeo..',
            '...oo...'
        ],
        palette: { o: OUTLINE, e: 0x4a2a22 }
    },
    gem: {
        art: [
            '..oo..',
            '.olmo.',
            'olmmmo',
            'ommmmo',
            '.ommo.',
            '..oo..'
        ],
        palette: { o: OUTLINE, l: UI_COLORS.manaLight, m: UI_COLORS.mana }
    },
    crown: {
        art: [
            'y...y...y',
            'yy.yyy.yy',
            'yyyyyyyyy',
            'yyryyyryy',
            'ddddddddd'
        ],
        palette: { y: UI_COLORS.gold, d: UI_COLORS.goldDark, r: UI_COLORS.red }
    },
    flag: {
        art: [
            'wrrrrr..',
            'wrrrrrr.',
            'wrrrrr..',
            'w.......',
            'w.......',
            'w.......',
            'w.......',
            'w.......'
        ],
        palette: { w: UI_COLORS.woodDark, r: UI_COLORS.red }
    },
    skull: {
        art: [
            '..bbbb..',
            '.bbbbbb.',
            'bbobbobb',
            'bbobbobb',
            'bbbbbbbb',
            '.bbbbbb.',
            '..b.b.b.'
        ],
        palette: { b: UI_COLORS.bone, o: OUTLINE }
    },
    pouch: {
        art: [
            '..oooo..',
            '...ss...',
            '.obbbbo.',
            'obhbbbbo',
            'obbbybbo',
            'obbbbbbo',
            '.oooooo.'
        ],
        palette: { o: OUTLINE, s: UI_COLORS.gold, b: 0x8a5a33, h: 0xb07a48, y: UI_COLORS.gold }
    }
} as const satisfies Record<string, { art: BlockArt; palette: BlockPalette }>;

export type IconKey = keyof typeof ICONS;

export function drawIcon(g: GameObjects.Graphics, icon: IconKey, cx: number, cy: number, size: number, alpha = 1): void {
    drawBlockArt(g, ICONS[icon].art, ICONS[icon].palette, cx, cy, size, alpha);
}

// Tecla em pixel art (ícone "E" do NPC, dicas): tampa de madeira clara com
// sombra embaixo. O texto da letra fica por conta de quem chama.
export function drawKeyCap(g: GameObjects.Graphics, cx: number, cy: number, size: number): void {
    const half = size / 2;
    g.fillStyle(UI_COLORS.woodDark);
    fillSteppedRect(g, cx - half, cy - half, size, size + 3, 3);
    g.fillStyle(UI_COLORS.parchment);
    fillSteppedRect(g, cx - half + 2, cy - half + 2, size - 4, size - 5, 2);
    g.fillStyle(UI_COLORS.parchmentShade);
    g.fillRect(cx - half + 3, cy + half - 6, size - 6, 3);
}
