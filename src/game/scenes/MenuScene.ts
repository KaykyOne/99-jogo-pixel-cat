import { GameObjects, Scene } from 'phaser';

import { Difficulty, loadSave, writeSave } from '../state/save';
import { PHASES } from '../world/phases';

const MENU_WIDTH = 1024;
const MENU_HEIGHT = 768;

export class MenuScene extends Scene {
    private mainPanel!: GameObjects.Container;
    private difficultyPanel!: GameObjects.Container;

    constructor() {
        super('Menu');
    }

    create() {
        this.add.rectangle(0, 0, MENU_WIDTH, MENU_HEIGHT, 0x08111d, 0.94).setOrigin(0);
        this.add
            .text(MENU_WIDTH / 2, 170, 'JOGO 99', {
                fontFamily: 'Georgia, serif',
                fontSize: '48px',
                color: '#f7e7b0'
            })
            .setOrigin(0.5);
        this.add
            .text(MENU_WIDTH / 2, 230, 'A jornada entre os mundos', {
                fontFamily: 'monospace',
                fontSize: '15px',
                color: '#9db68d'
            })
            .setOrigin(0.5);

        this.mainPanel = this.createPanel(512, 390, 500, 245);
        this.difficultyPanel = this.createPanel(512, 390, 500, 245).setVisible(false);

        this.createMainOptions();
        this.createDifficultyOptions();
    }

    private createMainOptions() {
        const save = loadSave();
        const title = this.add
            .text(512, 315, save ? 'RETOMAR JORNADA' : 'NOVA JORNADA', {
                fontFamily: 'Georgia, serif',
                fontSize: '25px',
                color: '#f7e7b0'
            })
            .setOrigin(0.5);
        this.mainPanel.add(title);

        if (save) {
            const phase = PHASES[save.phaseIndex];
            const difficulty = save.difficulty === 'hard' ? 'Difícil' : 'Normal';
            this.mainPanel.add(
                this.createButton(
                    512,
                    375,
                    `Continuar (Fase ${save.phaseIndex + 1} — ${difficulty})`,
                    () => {
                        this.registry.set('difficulty', save.difficulty);
                        this.scene.start(phase.key, { spawnX: 200 });
                    }
                )
            );
            this.mainPanel.add(
                this.createButton(512, 455, 'Novo Jogo', () => this.showDifficultySelection())
            );
            return;
        }

        this.mainPanel.add(
            this.createButton(512, 415, 'Novo Jogo', () => this.showDifficultySelection())
        );
    }

    private createDifficultyOptions() {
        const title = this.add
            .text(512, 315, 'ESCOLHA A DIFICULDADE', {
                fontFamily: 'Georgia, serif',
                fontSize: '25px',
                color: '#f7e7b0'
            })
            .setOrigin(0.5);
        const subtitle = this.add
            .text(512, 350, 'Normal reinicia a fase; Difícil reinicia a jornada.', {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#c0d9b1'
            })
            .setOrigin(0.5);

        this.difficultyPanel.add([title, subtitle]);
        this.difficultyPanel.add(
            this.createButton(512, 405, 'Normal', () => this.startNewRun('normal'))
        );
        this.difficultyPanel.add(
            this.createButton(512, 470, 'Difícil', () => this.startNewRun('hard'))
        );
    }

    private createPanel(x: number, y: number, width: number, height: number): GameObjects.Container {
        const background = this.add.rectangle(x, y, width, height, 0x10212b, 0.9);
        const border = this.add
            .rectangle(x, y, width, height, 0x10212b, 0)
            .setStrokeStyle(2, 0xb8cc84, 0.7);
        return this.add.container(0, 0, [background, border]);
    }

    private createButton(x: number, y: number, label: string, action: () => void): GameObjects.Container {
        const background = this.add
            .rectangle(x, y, 380, 48, 0x294b35, 1)
            .setStrokeStyle(2, 0xb8cc84, 0.8)
            .setInteractive({ useHandCursor: true });
        const text = this.add
            .text(x, y, label, {
                fontFamily: 'monospace',
                fontSize: '15px',
                color: '#f7e7b0'
            })
            .setOrigin(0.5);

        background.on('pointerover', () => background.setFillStyle(0x3e5266));
        background.on('pointerout', () => background.setFillStyle(0x294b35));
        background.on('pointerdown', action);

        return this.add.container(0, 0, [background, text]);
    }

    private showDifficultySelection() {
        this.mainPanel.setVisible(false);
        this.difficultyPanel.setVisible(true);
    }

    private startNewRun(difficulty: Difficulty) {
        this.registry.set('difficulty', difficulty);
        writeSave({ phaseIndex: 0, difficulty });
        this.scene.start(PHASES[0].key, { spawnX: 200 });
    }
}
