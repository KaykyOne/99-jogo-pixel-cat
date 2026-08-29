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
        // Mantém a altura de design e deixa a largura acompanhar a janela,
        // exibindo uma fatia maior do mundo em telas widescreen sem cortes.
        mode: Scale.RESIZE,
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
    const game = new Game({ ...config, parent });

    // Só no dev: dá acesso à instância pelo console do navegador
    // (`__game.scene.getScene('forest')`), que é como se inspeciona corpo,
    // inventário e máquina de estados sem encher o código de log. O build de
    // produção elimina este trecho: `import.meta.env.DEV` vira `false` literal.
    if (import.meta.env.DEV) {
        (window as unknown as { __game?: Game }).__game = game;
    }

    return game;
}

export default StartGame;
