import { Scene } from 'phaser';

import { EnemyType } from '../damage/health-config';
import { BaseEnemy } from './BaseEnemy';
import { Bat } from './Bat';
import { Hedgehog } from './Hedgehog';
import { Llama } from './Llama';
import { Player } from './Player';
import { Spider } from './Spider';

// Ponto único que liga a string de tipo (vinda da tabela de spawn da fase) à
// classe concreta do inimigo. Novos tipos entram aqui e em ENEMY_STATS.
export function createEnemy(scene: Scene, type: EnemyType, x: number, y: number, target: Player): BaseEnemy {
    switch (type) {
        case 'llama':
            return new Llama(scene, x, y, target);
        case 'bat':
            return new Bat(scene, x, y, target);
        case 'hedgehog':
            return new Hedgehog(scene, x, y, target);
        case 'spider':
            return new Spider(scene, x, y, target);
    }
}
