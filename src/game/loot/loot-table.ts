import { ItemId } from '../items/item-catalog';

// Tabela de drop: DADOS. A regra do briefing é literal — ao morrer, uma
// criatura dropa de 5 a 30 moedas, 1 maçã (rara), ou NADA. As três saídas são
// entradas da mesma tabela, inclusive o vazio: sem um peso explícito para
// `null`, todo inimigo sempre dropa alguma coisa.

// Carga do evento 'enemy:died' (scene.events), emitido pelo Agente A na morte
// de qualquer inimigo. Declarado aqui, estruturalmente igual ao EnemyDiedEvent
// de BaseEnemy, para que o sistema de loot não dependa do arquivo de outro
// agente para compilar.
export type EnemyDiedInfo = {
    x: number;
    y: number;
    type: string;
    isBoss: boolean;
};

export type LootEntry = {
    // null = nada. Precisa de peso próprio (ver acima).
    id: ItemId | null;
    // Peso RELATIVO, não porcentagem: a soma não precisa dar 100.
    weight: number;
    min: number;
    max: number;
};

export type LootTable = {
    entries: LootEntry[];
};

export type LootRoll = { id: ItemId; quantity: number };

// Faixas do briefing, isoladas para nunca serem redigitadas errado numa tabela.
const COIN_MIN = 5;
const COIN_MAX = 30;
// A maçã cai sempre UMA por vez, e raramente (ver pesos abaixo).
const APPLE_MIN = 1;
const APPLE_MAX = 1;

// Usada por qualquer tipo sem tabela própria (inclusive um inimigo novo que o
// Agente A adicione depois): 60% moeda, 8% maçã, 32% nada.
//
// A maçã é item de troca (não cura) e é rara de propósito: vale 8 moedas na
// capivara, então cair sempre inflaria a economia.
export const DEFAULT_LOOT_TABLE: LootTable = {
    entries: [
        { id: null, weight: 32, min: 0, max: 0 },
        { id: 'coin', weight: 60, min: COIN_MIN, max: COIN_MAX },
        { id: 'apple', weight: 8, min: APPLE_MIN, max: APPLE_MAX }
    ]
};

// Tabelas por tipo. O eixo de variação é o esforço que o inimigo custa: a
// aranha nasce em bando de 3 ou 4, então cada uma paga pouco (senão limpar um
// ninho pagaria mais que o boss); lhama e ouriço são caros de matar e pagam a
// faixa cheia.
export const LOOT_TABLES: Record<string, LootTable> = {
    spider: {
        entries: [
            { id: null, weight: 45, min: 0, max: 0 },
            { id: 'coin', weight: 50, min: COIN_MIN, max: 15 },
            { id: 'apple', weight: 5, min: APPLE_MIN, max: APPLE_MAX }
        ]
    },

    bat: {
        entries: [
            { id: null, weight: 35, min: 0, max: 0 },
            { id: 'coin', weight: 57, min: COIN_MIN, max: 20 },
            { id: 'apple', weight: 8, min: APPLE_MIN, max: APPLE_MAX }
        ]
    },

    llama: {
        entries: [
            { id: null, weight: 30, min: 0, max: 0 },
            { id: 'coin', weight: 60, min: 10, max: COIN_MAX },
            { id: 'apple', weight: 10, min: APPLE_MIN, max: APPLE_MAX }
        ]
    },

    hedgehog: {
        entries: [
            { id: null, weight: 30, min: 0, max: 0 },
            { id: 'coin', weight: 60, min: 10, max: COIN_MAX },
            { id: 'apple', weight: 10, min: APPLE_MIN, max: APPLE_MAX }
        ]
    }
};

// Boss: faixa maior e SEM entrada de vazio. Uma luta de boss que termina em
// nada é uma punição por vencer; e 40..90 moedas (≈ 3 a 6 mortes comuns) é o
// suficiente para pagar 3 a 6 poções, que é o que a fase seguinte vai custar.
export const BOSS_LOOT_TABLE: LootTable = {
    entries: [
        { id: 'coin', weight: 80, min: 40, max: 90 },
        { id: 'apple', weight: 20, min: APPLE_MIN, max: APPLE_MAX }
    ]
};

export function lootTableFor(type: string, isBoss: boolean): LootTable {
    if (isBoss) {
        return BOSS_LOOT_TABLE;
    }

    return LOOT_TABLES[type] ?? DEFAULT_LOOT_TABLE;
}

// Uma rolagem por morte. `random` é injetável para a rolagem poder ser testada
// sem depender do RNG do Phaser. `quantityMultiplier` vem da dificuldade.
export function rollLoot(
    table: LootTable,
    quantityMultiplier = 1,
    random: () => number = Math.random
): LootRoll | null {
    const total = table.entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (total <= 0) {
        return null;
    }

    let ticket = random() * total;
    for (const entry of table.entries) {
        ticket -= Math.max(0, entry.weight);
        if (ticket > 0) {
            continue;
        }

        if (entry.id === null) {
            return null;
        }

        const span = Math.max(0, entry.max - entry.min);
        const rolled = entry.min + Math.floor(random() * (span + 1));

        // A faixa declarada na tabela é uma GARANTIA, não uma sugestão: a regra
        // do briefing é "de 5 a 30 moedas, 1 a 3 maçãs", e ela vale nos dois
        // níveis de dificuldade. O multiplicador desloca a distribuição dentro
        // da faixa (no Difícil os drops tendem ao piso), nunca para fora dela —
        // senão o Difícil dropava 3 moedas onde o jogo promete no mínimo 5.
        const scaled = Math.ceil(rolled * quantityMultiplier);
        const quantity = Math.min(entry.max, Math.max(entry.min, scaled));

        return { id: entry.id, quantity };
    }

    return null;
}
