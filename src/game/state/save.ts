export type Difficulty = 'normal' | 'hard';

export type SaveData = {
    phaseIndex: number;
    difficulty: Difficulty;
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

        return parsed;
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

function isSaveData(value: unknown): value is SaveData {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const data = value as Record<string, unknown>;
    return (
        typeof data.phaseIndex === 'number' &&
        (data.difficulty === 'normal' || data.difficulty === 'hard')
    );
}
