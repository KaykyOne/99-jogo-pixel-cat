import { Scene } from 'phaser';

import { createEnemyAnimations } from '../animations/enemy-animations';
import { createPlayerAnimations } from '../animations/player-animations';

export class PreloadScene extends Scene {
    constructor() {
        super('Preload');
    }

    preload() {
        this.load.setPath('assets');

        this.load.image('sky-stars', 'background/Clouds/1.png');
        this.load.image('sky-clouds-far', 'background/Clouds/2.png');
        this.load.image('sky-clouds-near', 'background/Clouds/3.png');

        this.load.spritesheet('player-jump', 'player/jump.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('player-idle', 'player/idle.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('player-walk', 'player/walk.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('player-attack', 'player/attack.png', { frameWidth: 48, frameHeight: 48 });

        this.load.spritesheet('graverobber-idle', 'enemies/graverobber-idle.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('graverobber-walk', 'enemies/graverobber-walk.png', { frameWidth: 48, frameHeight: 48 });

        this.load.spritesheet('steamman-idle', 'enemies/steamman-idle.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('steamman-walk', 'enemies/steamman-walk.png', { frameWidth: 48, frameHeight: 48 });
    }

    create() {
        createPlayerAnimations(this);
        createEnemyAnimations(this);
        this.scene.start('forest', { spawnX: 200 });
    }
}