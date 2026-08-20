import { AUTO, Game, Scale, Types } from 'phaser';

import { PreloadScene } from './scenes/PreloadScene';
import { PhaseScene } from './scenes/Game';
import { MenuScene } from './scenes/MenuScene';
import { PHASES } from './world/phases';

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const scenes = [
    PreloadScene,
    MenuScene,
    ...PHASES.map((phase, index) => new PhaseScene(phase, index))
];

const config: Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: '#028af8',
    scale: {
        // FIT: nunca corta nada, só sobra barra preta fina quando a janela
        // não é exatamente 4:3 (1024x768). ENVELOP foi testado e cortava
        // demais (HUD e cenário) em janelas widescreen — como todo o layout
        // do jogo usa posições fixas pensadas pra essa resolução, não dá pra
        // preencher a janela inteira sem cortar ou distorcer algo.
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
