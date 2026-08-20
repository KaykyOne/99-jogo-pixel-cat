export type Difficulty = 'normal' | 'hard';

export type SaveData = {
    phaseIndex: number;
    difficulty: Difficulty;
    clearedPhases: number[];
};

const STORAGE_KEY = 'jogo-99:save';

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
                : []
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

export function clearSave(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Falhar ao limpar não deve interromper a partida.
    }
}

function isSaveData(value: unknown): value is Omit<SaveData, 'clearedPhases'> & { clearedPhases?: unknown } {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const data = value as Record<string, unknown>;
    return (
        typeof data.phaseIndex === 'number' &&
        (data.difficulty === 'normal' || data.difficulty === 'hard')
    );
}
