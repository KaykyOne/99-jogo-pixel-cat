import { Scene } from 'phaser';

import { BaseEnemy } from './BaseEnemy';
import { Player } from './Player';

// Ouriço — PLACEHOLDER. Hoje só liga o tipo 'hedgehog' ao comportamento genérico
// do BaseEnemy (patrulha, persegue, encosta e bate). O comportamento próprio
// ainda não está implementado.
export class Hedgehog extends BaseEnemy {
    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, 'hedgehog', target);
    }
}
