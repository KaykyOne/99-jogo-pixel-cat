import { GameObjects, Scene } from 'phaser';

import { BOSS_STATS, EnemyType } from '../damage/health-config';
import { BaseEnemy } from './BaseEnemy';
import { Player } from './Player';

const BAR_WIDTH = 90;
const BAR_HEIGHT = 10;
const BAR_OFFSET_Y = -160;

// Um inimigo normal ampliado, com estatísticas de boss e uma barra de vida
// própria. As animações continuam sendo as do tipo escolhido.
export class Boss extends BaseEnemy {
    private readonly barBg: GameObjects.Rectangle;
    private readonly barFill: GameObjects.Rectangle;

    constructor(scene: Scene, x: number, y: number, typeKey: EnemyType, target: Player) {
        super(scene, x, y, typeKey, target, BOSS_STATS[typeKey], 5);

        this.barBg = scene.add
            .rectangle(x, y + BAR_OFFSET_Y, BAR_WIDTH + 4, BAR_HEIGHT + 4, 0x0b0b0b, 0.8)
            .setDepth(16);
        this.barFill = scene.add
            .rectangle(x - BAR_WIDTH / 2, y + BAR_OFFSET_Y, BAR_WIDTH, BAR_HEIGHT, 0xd94f4f)
            .setOrigin(0, 0.5)
            .setDepth(17);
    }

    update(time: number, delta: number): void {
        super.update(time, delta);

        const barY = this.y + BAR_OFFSET_Y;
        this.barBg.setPosition(this.x, barY);
        this.barFill.setPosition(this.x - BAR_WIDTH / 2, barY);

        const ratio = Math.max(0, this.healthInfo.current / this.healthInfo.max);
        this.barFill.width = BAR_WIDTH * ratio;
    }

    destroy(fromScene?: boolean): void {
        this.barBg.destroy();
        this.barFill.destroy();
        super.destroy(fromScene);
    }
}
