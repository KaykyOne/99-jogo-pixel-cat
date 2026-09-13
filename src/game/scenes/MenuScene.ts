import { GameObjects, Scene } from 'phaser';

import { BOSS_INTROS_SEEN_KEY } from '../entities/bosses/boss-config';
import { Difficulty, loadSave, writeSave } from '../state/save';
import { drawIcon, drawParchment, drawWoodFrame, UI_COLORS, UI_CSS, uiText, uiTextOutlined } from '../ui/ui-theme';
import { PHASES } from '../world/phases';

const MENU_WIDTH = 1024;

export class MenuScene extends Scene {
    private mainPanel!: GameObjects.Container;
    private difficultyPanel!: GameObjects.Container;
    private background!: GameObjects.Rectangle;
    private content!: GameObjects.Container;

    constructor() {
        super('Menu');
    }

    create() {
        this.background = this.add
            .rectangle(0, 0, this.scale.width, this.scale.height, 0x140d08, 0.96)
            .setOrigin(0);
        this.content = this.add.container(this.menuOffsetX, 0);

        const crown = this.add.graphics();
        drawIcon(crown, 'crown', MENU_WIDTH / 2, 110, 54);

        const title = this.add
            .text(MENU_WIDTH / 2, 175, 'JOGO 99', uiTextOutlined(56, UI_CSS.gold, { strokeThickness: 6 }))
            .setOrigin(0.5);
        const subtitle = this.add
            .text(MENU_WIDTH / 2, 228, 'A jornada entre os mundos', uiTextOutlined(17, UI_CSS.cream))
            .setOrigin(0.5);

        this.mainPanel = this.createPanel(512, 390, 500, 250);
        this.difficultyPanel = this.createPanel(512, 390, 500, 250).setVisible(false);

        this.createMainOptions();
        this.createDifficultyOptions();
        this.content.add([crown, title, subtitle, this.mainPanel, this.difficultyPanel]);

        this.scale.off('resize', this.repositionLayout, this);
        this.scale.on('resize', this.repositionLayout, this);
        this.events.once('shutdown', () => {
            this.scale.off('resize', this.repositionLayout, this);
        });
    }

    private createMainOptions() {
        const save = loadSave();
        const title = this.add
            .text(512, 312, save ? 'RETOMAR JORNADA' : 'NOVA JORNADA', uiText(24, UI_CSS.ink))
            .setOrigin(0.5);
        this.mainPanel.add(title);

        if (save) {
            // A vila entrou como PHASES[0] e deslocou todos os índices. A chave
            // do save muda junto (invalidando os antigos), mas um índice fora
            // da lista não pode virar `scene.start(undefined)`: cai na vila.
            const phase = PHASES[save.phaseIndex] ?? PHASES[0];
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
            .text(512, 312, 'ESCOLHA A DIFICULDADE', uiText(24, UI_CSS.ink))
            .setOrigin(0.5);
        const subtitle = this.add
            .text(512, 346, 'Normal reinicia a fase; Difícil reinicia a jornada.', uiText(13, UI_CSS.inkSoft))
            .setOrigin(0.5);

        this.difficultyPanel.add([title, subtitle]);
        this.difficultyPanel.add(
            this.createButton(512, 405, 'Normal', () => this.startNewRun('normal'))
        );
        this.difficultyPanel.add(
            this.createButton(512, 470, 'Difícil', () => this.startNewRun('hard'))
        );
    }

    // Pergaminho emoldurado em madeira.
    private createPanel(x: number, y: number, width: number, height: number): GameObjects.Container {
        const graphics = this.add.graphics();
        const left = x - width / 2;
        const top = y - height / 2;
        drawWoodFrame(graphics, left - 12, top - 12, width + 24, height + 24);
        drawParchment(graphics, left, top, width, height);
        return this.add.container(0, 0, [graphics]);
    }

    // Tábua de madeira clicável.
    private createButton(x: number, y: number, label: string, action: () => void): GameObjects.Container {
        const background = this.add
            .rectangle(x, y, 380, 48, UI_COLORS.woodMid, 1)
            .setStrokeStyle(3, UI_COLORS.woodDark, 1)
            .setInteractive({ useHandCursor: true });
        const text = this.add.text(x, y, label, uiTextOutlined(17, UI_CSS.cream)).setOrigin(0.5);

        background.on('pointerover', () => {
            background.setFillStyle(UI_COLORS.woodLight);
            text.setColor(UI_CSS.gold);
        });
        background.on('pointerout', () => {
            background.setFillStyle(UI_COLORS.woodMid);
            text.setColor(UI_CSS.cream);
        });
        background.on('pointerdown', action);

        return this.add.container(0, 0, [background, text]);
    }

    private showDifficultySelection() {
        this.mainPanel.setVisible(false);
        this.difficultyPanel.setVisible(true);
    }

    private startNewRun(difficulty: Difficulty) {
        this.registry.set('difficulty', difficulty);
        // Run nova: as falas de abertura dos bosses voltam a aparecer.
        this.registry.remove(BOSS_INTROS_SEEN_KEY);
        writeSave({ phaseIndex: 0, difficulty, clearedPhases: [] });
        this.scene.start(PHASES[0].key, { spawnX: 200 });
    }

    private get menuOffsetX(): number {
        return (this.scale.width - MENU_WIDTH) / 2;
    }

    private repositionLayout() {
        this.background.setSize(this.scale.width, this.scale.height);
        this.content.x = this.menuOffsetX;
    }
}
