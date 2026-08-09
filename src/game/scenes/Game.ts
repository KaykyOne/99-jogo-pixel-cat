import { Scene } from 'phaser';

import { Player } from '../entities/Player';
import { createPlayerAnimations } from '../animations/player-animations';

export class Game extends Scene {
    private player!: Player;

    constructor() {
        super('Game');
    }

    preload() {
        this.load.setPath('assets');

        this.load.spritesheet(
            'player-jump',
            'player/jump.png',
            {
                frameWidth: 48,
                frameHeight: 48
            }
        );

        this.load.spritesheet(
            'player-idle',
            'player/idle.png',
            {
                frameWidth: 48,
                frameHeight: 48
            }
        );

        this.load.spritesheet(
            'player-walk',
            'player/walk.png',
            {
                frameWidth: 48,
                frameHeight: 48
            }
        );

        this.load.spritesheet(
            'player-attack',
            'player/attack.png',
            {
                frameWidth: 48,
                frameHeight: 48
            }
        );
    }

    create() {
        createPlayerAnimations(this);

        this.player = new Player(
            this,
            512,
            600
        );
    }


    update() {
        this.player.update();
    }
}