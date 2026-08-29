// Catálogo de itens: DADOS puros, sem cena, sem Phaser, sem desenho.
// Todo número de item (empilhamento, cura, cor) mora aqui — a mesma regra que
// ATTACKS e ENEMY_STATS já seguem. Quem desenha é items/item-art.ts, quem
// guarda é items/Inventory.ts.

export type ItemKind = 'currency' | 'consumable' | 'material' | 'weapon';

// Ids das armas do contrato com o Agente A (evento 'weapon:equip').
export type WeaponId = 'sword' | 'bow' | 'staff';

// Arte por blocos. Cada item é uma grade 8x8 de caracteres, e cada caractere
// vira um fillRect. É o "sem asset novo" levado a sério: o desenho é dado,
// não código, e o mesmo padrão serve para o HUD, para o item caído no chão e
// para a lista da loja, sem redesenhar nada três vezes.
//
//   '.' = vazio        'o' = contorno escuro
//   'b' = color        'a' = accent          'h' = realce (clareia color)
export type ItemBlockArt = readonly string[];

export const ITEM_ART_GRID = 8;

export type ItemDef = {
    id: string;
    name: string;
    kind: ItemKind;
    // Quantos cabem num slot. "1 pack" do briefing = 1 slot cheio.
    stackSize: number;
    color: number;
    accent: number;
    art: ItemBlockArt;
    // Se responde às teclas 1..6. Moeda e maçã existem para gastar/vender, não
    // para usar — apertar a tecla nelas não deve fazer nada.
    usable: boolean;
    // Só para consumíveis: quanto de HP restaura (vira o payload de
    // 'player:heal', que o Agente A escuta).
    healAmount?: number;
    // Só para armas: vira o payload de 'weapon:equip'.
    weaponId?: WeaponId;
};

export const ITEMS = {
    // STACK EXIGIDO PELO USUÁRIO: 1 pack de moedas = 50.
    coin: {
        id: 'coin',
        name: 'Moeda',
        kind: 'currency',
        stackSize: 50,
        color: 0xf5c542,
        accent: 0xb8860b,
        usable: false,
        art: [
            '..oooo..',
            '.obbbbo.',
            'obhbbbbo',
            'obhbaabo',
            'obbbaabo',
            'obbbbbbo',
            '.obbbbo.',
            '..oooo..'
        ]
    },

    // STACK EXIGIDO PELO USUÁRIO: 1 pack de maçãs = 10.
    apple: {
        id: 'apple',
        name: 'Maçã',
        kind: 'material',
        stackSize: 10,
        color: 0xd94f4f,
        accent: 0x4f7a3d,
        usable: false,
        art: [
            '...o....',
            '..oaa...',
            '.obbbbo.',
            'obhbbbbo',
            'obhbbbbo',
            'obbbbbbo',
            '.obbbbo.',
            '..oooo..'
        ]
    },

    // Empilha pouco de propósito: com 6 slots, estocar cura tem que custar
    // espaço, senão a poção some como decisão.
    potion: {
        id: 'potion',
        name: 'Poção',
        kind: 'consumable',
        stackSize: 5,
        color: 0xe05a8a,
        accent: 0xf2c4d8,
        usable: true,
        healAmount: 2,
        art: [
            '...aa...',
            '...oo...',
            '..obbo..',
            '.obbbbo.',
            'obhbbbbo',
            'obbbbbbo',
            'obbbbbbo',
            '.oooooo.'
        ]
    },

    // Armas ocupam um slot inteiro cada (stackSize 1): carregar as três custa
    // metade do inventário, que é justamente a escolha que o jogador deve
    // fazer. Usar (tecla do slot) equipa, não consome.
    sword: {
        id: 'sword',
        name: 'Espada',
        kind: 'weapon',
        stackSize: 1,
        color: 0xc8d2dc,
        accent: 0x8a5a2b,
        usable: true,
        weaponId: 'sword',
        art: [
            '...oo...',
            '...hb...',
            '...hb...',
            '...hb...',
            '.aaaaaa.',
            '...aa...',
            '...aa...',
            '..aaaa..'
        ]
    },

    bow: {
        id: 'bow',
        name: 'Arco',
        kind: 'weapon',
        stackSize: 1,
        color: 0x8a5a2b,
        accent: 0xe8e4dc,
        usable: true,
        weaponId: 'bow',
        art: [
            '...bb...',
            '..b..a..',
            '.b...a..',
            '.b...a..',
            '.b...a..',
            '.b...a..',
            '..b..a..',
            '...bb...'
        ]
    },

    staff: {
        id: 'staff',
        name: 'Cajado',
        kind: 'weapon',
        stackSize: 1,
        color: 0x8a5a2b,
        accent: 0x8be0f5,
        usable: true,
        weaponId: 'staff',
        art: [
            '..aaa...',
            '.aaaaa..',
            '.aahaa..',
            '..aaa...',
            '...b....',
            '...b....',
            '...b....',
            '...b....'
        ]
    }
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

export function itemDef(id: ItemId): ItemDef {
    return ITEMS[id];
}

// Guarda de tipo usada ao ler o save: um localStorage editado à mão (ou de uma
// versão anterior do catálogo) não pode virar um slot com id inexistente, que
// estouraria no primeiro desenho do HUD.
export function isItemId(value: unknown): value is ItemId {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, value);
}
