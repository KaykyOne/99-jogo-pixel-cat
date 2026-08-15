import { AUTO, Game, Scale, Types } from 'phaser';

import { PreloadScene } from './scenes/PreloadScene';
import { PhaseScene } from './scenes/Game';
import { PHASES } from './world/phases';

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const scenes = [
    PreloadScene,
    ...PHASES.map((phase, index) => new PhaseScene(phase, index))
];

const config: Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: '#028af8',
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 900 },
            debug: false
        }
    },
    scene: scenes
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
}

export default StartGame;