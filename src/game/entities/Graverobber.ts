import { Scene } from 'phaser';

import { BaseEnemy } from './BaseEnemy';
import { Player } from './Player';

// Inimigo padrão: só liga o tipo 'graverobber' ao comportamento genérico do
// BaseEnemy. Estatísticas (HP, corpo, alcance de agro/ataque etc.) vêm de
// ENEMY_STATS.graverobber, não daqui.
export class Graverobber extends BaseEnemy {
    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, 'graverobber', target);
    }
}
