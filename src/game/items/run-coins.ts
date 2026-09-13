import { Scene } from 'phaser';

import { loadSave } from '../state/save';
import { CoinSystem, COINS_REGISTRY_KEY } from './CoinSystem';
import { Inventory } from './Inventory';

// Estado de run das moedas. Mesmas regras de syncRunInventory (ver
// run-inventory.ts): chamada UMA vez no create() da fase, DEPOIS dela.
//
// Save sem `inventory` (Novo Jogo) ou sem save (morte no Difícil) = run nova:
// o contador em memória morre junto, senão as moedas da run anterior
// entrariam no "Novo Jogo".
export function syncRunCoins(scene: Scene, inventory: Inventory): CoinSystem {
    const save = loadSave();
    const stored = scene.registry.get(COINS_REGISTRY_KEY) as CoinSystem | undefined;

    if (!save || save.inventory === undefined) {
        const fresh = new CoinSystem();
        scene.registry.set(COINS_REGISTRY_KEY, fresh);
        return fresh;
    }

    if (stored) {
        return stored;
    }

    const restored = CoinSystem.deserialize(save.coins);

    // Saves de antes do contador guardavam as moedas como item num slot.
    // Migra para o contador e libera o espaço, para não sumirem nem ocuparem
    // slot para sempre.
    const legacyCoins = inventory.count('coin');
    if (legacyCoins > 0 && inventory.remove('coin', legacyCoins)) {
        restored.add(legacyCoins);
    }

    scene.registry.set(COINS_REGISTRY_KEY, restored);
    return restored;
}
