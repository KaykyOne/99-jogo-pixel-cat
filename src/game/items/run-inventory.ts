import { Scene } from 'phaser';

import { loadSave } from '../state/save';
import { Inventory, INVENTORY_REGISTRY_KEY } from './Inventory';

// Estado de run do inventário. Ele precisa sobreviver a scene.start() entre
// fases e a scene.restart() no respawn — o registry do Phaser é global ao jogo
// e já é usado assim para 'difficulty'.

// Devolve o inventário da run, criando-o a partir do save na primeira chamada.
export function getInventory(scene: Scene): Inventory {
    const existing = scene.registry.get(INVENTORY_REGISTRY_KEY) as Inventory | undefined;
    if (existing) {
        return existing;
    }

    const inventory = Inventory.deserialize(loadSave()?.inventory);
    scene.registry.set(INVENTORY_REGISTRY_KEY, inventory);
    return inventory;
}

// Chamada UMA vez no create() da fase, ANTES de qualquer gravação de save.
//
// O registry vive enquanto a aba estiver aberta, então ele não zera sozinho ao
// começar um jogo novo — e sem isto o jogador levaria as moedas da run anterior
// para dentro do "Novo Jogo". O sinal de run nova é o save: o menu grava um
// save SEM o campo `inventory` ao começar de novo, e a morte no modo Difícil
// apaga o save inteiro. Nos dois casos o inventário em memória tem que morrer
// junto; em todo o resto (troca de fase, respawn no Normal, F5) ele continua.
export function syncRunInventory(scene: Scene): Inventory {
    const save = loadSave();
    const stored = scene.registry.get(INVENTORY_REGISTRY_KEY) as Inventory | undefined;

    if (!save || save.inventory === undefined) {
        const fresh = Inventory.deserialize(save?.inventory);
        scene.registry.set(INVENTORY_REGISTRY_KEY, fresh);
        return fresh;
    }

    if (!stored) {
        const restored = Inventory.deserialize(save.inventory);
        scene.registry.set(INVENTORY_REGISTRY_KEY, restored);
        return restored;
    }

    return stored;
}
