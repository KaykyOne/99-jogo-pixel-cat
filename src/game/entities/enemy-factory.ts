import { Scene } from 'phaser';

import { EnemyType } from '../damage/health-config';
import { BaseEnemy } from './BaseEnemy';
import { Graverobber } from './Graverobber';
import { Player } from './Player';
import { Steamman } from './Steamman';

// Ponto único que liga a string de tipo (vinda da tabela de spawn da fase) à
// classe concreta do inimigo. Novos tipos entram aqui e em ENEMY_STATS.
export function createEnemy(scene: Scene, type: EnemyType, x: number, y: number, target: Player): BaseEnemy {
    switch (type) {
        case 'graverobber':
            return new Graverobber(scene, x, y, target);
        case 'steamman':
            return new Steamman(scene, x, y, target);
    }
}
