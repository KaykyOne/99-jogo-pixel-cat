import { Scene } from 'phaser';

import { BaseEnemy } from './BaseEnemy';
import { Player } from './Player';

// Inimigo pesado: só liga o tipo 'steamman' ao comportamento genérico do
// BaseEnemy. Estatísticas (HP, defesa, corpo, alcance de agro/ataque etc.)
// vêm de ENEMY_STATS.steamman, não daqui.
export class Steamman extends BaseEnemy {
    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, 'steamman', target);
    }
}
