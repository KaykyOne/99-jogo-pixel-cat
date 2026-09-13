import { Scene } from 'phaser';

import { COINS_REGISTRY_KEY, CoinSystem } from '../items/CoinSystem';
import { Inventory, INVENTORY_REGISTRY_KEY, Slot } from '../items/Inventory';

export type Difficulty = 'normal' | 'hard';

export type SaveData = {
    phaseIndex: number;
    difficulty: Difficulty;
    clearedPhases: number[];
    // Os 6 slots do inventário (não inclui moedas, que são separadas).
    //
    // Opcional de propósito: quem grava um save novo do menu ("Novo Jogo") não
    // precisa conhecer o inventário, e é justamente a AUSÊNCIA deste campo que
    // sinaliza "run nova" para items/run-inventory.ts.
    inventory?: Slot[];
    // Moedas do jogador (contador separado, não ocupa espaço no inventário).
    coins?: number;
};

// v2: a vila entrou como PHASES[0] e deslocou TODOS os índices de fase — um
// save v1 com phaseIndex 2 (caverna) passaria a apontar para outro bioma. Além
// disso SaveData ganhou `inventory`. Saves v1 não são migráveis de forma
// confiável, então a chave muda e eles são simplesmente ignorados (ver Decisão
// de design #6 do plano).
const STORAGE_KEY = 'jogo-99:save:v2';

export function loadSave(): SaveData | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed: unknown = JSON.parse(raw);
        if (
            !isSaveData(parsed)
        ) {
            return null;
        }

        return {
            phaseIndex: parsed.phaseIndex,
            difficulty: parsed.difficulty,
            // Saves criados antes do mapa RPG não tinham este campo.
            clearedPhases: Array.isArray(parsed.clearedPhases)
                ? parsed.clearedPhases.filter((index): index is number => typeof index === 'number')
                : [],
            // Leitura tolerante: sem o campo, `inventory` continua undefined —
            // e não vira um array vazio. A diferença importa: undefined é "run
            // nova / save de antes do inventário", vazio é "o jogador gastou
            // tudo". Só quem tem o campo passa pela validação de Inventory.
            inventory: Array.isArray(parsed.inventory)
                ? Inventory.deserialize(parsed.inventory).serialize()
                : undefined,
            // Moedas do save anterior (optional, padrão 0).
            coins: typeof parsed.coins === 'number' ? parsed.coins : undefined
        };
    } catch {
        // localStorage pode não estar disponível (por exemplo, em navegação
        // privada). O jogo continua normalmente, apenas sem persistência.
        return null;
    }
}

export function writeSave(data: SaveData): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Falhar ao persistir não deve interromper a partida.
    }
}

// Ponto ÚNICO de gravação a partir de uma cena em jogo. Existe por causa de uma
// armadilha concreta: PhaseScene grava o save a cada troca de fase montando o
// objeto na mão, e todo campo esquecido nesse objeto (o inventário, por
// exemplo) some do save na primeira porta que o jogador atravessa. Aqui os
// campos não passados são herdados do save atual e o inventário vem sempre do
// registry, que é a fonte de verdade em memória.
export function saveProgress(scene: Scene, patch: Partial<SaveData>): void {
    const current = loadSave();
    const inventory = scene.registry.get(INVENTORY_REGISTRY_KEY) as Inventory | undefined;
    const coins = scene.registry.get(COINS_REGISTRY_KEY) as CoinSystem | undefined;

    writeSave({
        phaseIndex: current?.phaseIndex ?? 0,
        difficulty: (scene.registry.get('difficulty') as Difficulty) ?? current?.difficulty ?? 'normal',
        clearedPhases: current?.clearedPhases ?? [],
        inventory: inventory ? inventory.serialize() : current?.inventory,
        coins: coins ? coins.serialize() : current?.coins,
        ...patch
    });
}

export function clearSave(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Falhar ao limpar não deve interromper a partida.
    }
}

function isSaveData(
    value: unknown
): value is Omit<SaveData, 'clearedPhases' | 'inventory'> & { clearedPhases?: unknown; inventory?: unknown } {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const data = value as Record<string, unknown>;
    return (
        typeof data.phaseIndex === 'number' &&
        (data.difficulty === 'normal' || data.difficulty === 'hard')
    );
}
