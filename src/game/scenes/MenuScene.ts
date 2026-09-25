import { GameObjects, Input, Scene } from 'phaser';

import {
    CONTROL_GROUPS,
    ControlAction,
    ControlBindings,
    DEFAULT_CONTROLS,
    keyLabel,
    loadControls,
    rebind,
    saveControls
} from '../config/controls';
import { BOSS_INTROS_SEEN_KEY } from '../entities/bosses/boss-config';
import { Difficulty, loadSave, writeSave } from '../state/save';
import { drawIcon, drawParchment, drawWoodFrame, UI_COLORS, UI_CSS, uiText, uiTextOutlined } from '../ui/ui-theme';
import { PHASES } from '../world/phases';

const MENU_WIDTH = 1024;

export class MenuScene extends Scene {
    private mainPanel!: GameObjects.Container;
    private difficultyPanel!: GameObjects.Container;
    private controlsPanel!: GameObjects.Container;
    private controlsHint!: GameObjects.Text;
    private controlKeyTexts = new Map<ControlAction, GameObjects.Text>();
    private bindings!: ControlBindings;
    // Ação esperando a nova tecla (depois do clique no botão dela).
    private listeningFor: ControlAction | null = null;
    private background!: GameObjects.Rectangle;
    private content!: GameObjects.Container;

    constructor() {
        super('Menu');
    }

    create() {
        this.controlKeyTexts = new Map();
        this.listeningFor = null;

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

        this.mainPanel = this.createPanel(512, 410, 500, 300);
        this.difficultyPanel = this.createPanel(512, 410, 500, 300).setVisible(false);
        this.controlsPanel = this.createPanel(512, 500, 900, 470).setVisible(false);

        this.createMainOptions();
        this.createDifficultyOptions();
        this.createControlsOptions();
        this.content.add([crown, title, subtitle, this.mainPanel, this.difficultyPanel, this.controlsPanel]);

        this.input.keyboard!.on('keydown', this.handleRebindKey, this);
        this.input.on('pointerdown', this.handleClickOutside, this);

        this.scale.off('resize', this.repositionLayout, this);
        this.scale.on('resize', this.repositionLayout, this);
        this.events.once('shutdown', () => {
            this.scale.off('resize', this.repositionLayout, this);
            this.input.keyboard?.off('keydown', this.handleRebindKey, this);
            this.input.off('pointerdown', this.handleClickOutside, this);
        });
    }

    private createMainOptions() {
        const save = loadSave();
        const title = this.add
            .text(512, 300, save ? 'RETOMAR JORNADA' : 'NOVA JORNADA', uiText(24, UI_CSS.ink))
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
                    370,
                    `Continuar (Fase ${save.phaseIndex + 1} — ${difficulty})`,
                    () => {
                        this.registry.set('difficulty', save.difficulty);
                        this.scene.start(phase.key, { spawnX: 200 });
                    }
                )
            );
            this.mainPanel.add(
                this.createButton(512, 435, 'Novo Jogo', () => this.showDifficultySelection())
            );
            this.mainPanel.add(this.createButton(512, 500, 'Controles', () => this.showControls()));
            return;
        }

        this.mainPanel.add(
            this.createButton(512, 400, 'Novo Jogo', () => this.showDifficultySelection())
        );
        this.mainPanel.add(this.createButton(512, 470, 'Controles', () => this.showControls()));
    }

    private createDifficultyOptions() {
        const title = this.add
            .text(512, 300, 'ESCOLHA A DIFICULDADE', uiText(24, UI_CSS.ink))
            .setOrigin(0.5);
        const subtitle = this.add
            .text(512, 334, 'Normal reinicia a fase; Difícil reinicia a jornada.', uiText(13, UI_CSS.inkSoft))
            .setOrigin(0.5);

        this.difficultyPanel.add([title, subtitle]);
        this.difficultyPanel.add(
            this.createButton(512, 395, 'Normal', () => this.startNewRun('normal'))
        );
        this.difficultyPanel.add(
            this.createButton(512, 460, 'Difícil', () => this.startNewRun('hard'))
        );
        this.difficultyPanel.add(this.createButton(512, 525, 'Voltar', () => this.showMain()));
    }

    // Tela de controles: duas colunas de grupos (ver CONTROL_GROUPS). Clicar
    // na tecla de uma ação e apertar outra troca; ESC cancela.
    private createControlsOptions() {
        this.bindings = loadControls();

        const title = this.add.text(512, 292, 'CONTROLES', uiText(24, UI_CSS.ink)).setOrigin(0.5);
        this.controlsHint = this.add.text(512, 322, '', uiText(13, UI_CSS.inkSoft)).setOrigin(0.5);
        this.controlsPanel.add([title, this.controlsHint]);

        // Três colunas: movimento + combate; armas + magia + sistema;
        // inventário.
        const byTitle = (title: string) => CONTROL_GROUPS.filter(group => group.title === title);
        const columns = [
            [...byTitle('MOVIMENTO'), ...byTitle('COMBATE')],
            [...byTitle('ARMAS'), ...byTitle('MAGIA'), ...byTitle('SISTEMA')],
            byTitle('INVENTÁRIO')
        ];
        columns.forEach((groups, column) => {
            const x = 90 + column * 290;
            let y = 352;
            for (const group of groups) {
                this.controlsPanel.add(
                    this.add.text(x, y, group.title, uiText(15, UI_CSS.ink)).setOrigin(0, 0.5)
                );
                y += 28;
                for (const [action, label] of group.actions) {
                    this.controlsPanel.add(this.createControlRow(x, y, action, label));
                    y += 27;
                }
                y += 10;
            }
        });

        this.controlsPanel.add(
            this.createButton(
                370,
                700,
                'Restaurar padrão',
                () => {
                    this.listeningFor = null;
                    this.bindings = { ...DEFAULT_CONTROLS };
                    saveControls(this.bindings);
                    this.refreshControls('Controles padrão restaurados.');
                },
                240
            )
        );
        this.controlsPanel.add(this.createButton(654, 700, 'Voltar', () => this.showMain(), 240));

        this.refreshControls();
    }

    private createControlRow(x: number, y: number, action: ControlAction, label: string): GameObjects.Container {
        const labelText = this.add.text(x + 8, y, label, uiText(13, UI_CSS.inkSoft)).setOrigin(0, 0.5);
        const keyX = x + 215;
        const background = this.add
            .rectangle(keyX, y, 90, 25, UI_COLORS.woodMid, 1)
            .setStrokeStyle(2, UI_COLORS.woodDark, 1)
            .setInteractive({ useHandCursor: true });
        const keyText = this.add.text(keyX, y, '', uiTextOutlined(14, UI_CSS.cream)).setOrigin(0.5);
        this.controlKeyTexts.set(action, keyText);

        background.on('pointerover', () => background.setFillStyle(UI_COLORS.woodLight));
        background.on('pointerout', () => background.setFillStyle(UI_COLORS.woodMid));
        background.on('pointerdown', () => {
            this.listeningFor = action;
            // ESC cancela a escolha — exceto na própria pausa, que pode
            // querer justamente o ESC de volta.
            const cancel = action === 'pause' ? 'clique fora para cancelar' : 'ESC cancela';
            this.refreshControls(`Aperte a nova tecla para "${label}" (${cancel})`);
        });

        return this.add.container(0, 0, [labelText, background, keyText]);
    }

    private handleRebindKey(event: KeyboardEvent) {
        const action = this.listeningFor;
        if (!action || !this.controlsPanel.visible) {
            return;
        }

        const keyCode = event.keyCode;
        if (keyCode === Input.Keyboard.KeyCodes.ESC && action !== 'pause') {
            this.listeningFor = null;
            this.refreshControls();
            return;
        }

        // Se outra ação usava a tecla, as duas trocam (ver rebind).
        this.listeningFor = null;
        this.bindings = rebind(this.bindings, action, keyCode);
        saveControls(this.bindings);
        this.refreshControls();
    }

    // Clique fora de qualquer botão cancela a escolha de tecla.
    private handleClickOutside(_pointer: unknown, currentlyOver: unknown[]) {
        if (this.listeningFor && currentlyOver.length === 0) {
            this.listeningFor = null;
            this.refreshControls();
        }
    }

    private refreshControls(message?: string) {
        for (const [action, text] of this.controlKeyTexts) {
            const listening = this.listeningFor === action;
            text.setText(listening ? '...' : keyLabel(this.bindings[action]));
            text.setColor(listening ? UI_CSS.gold : UI_CSS.cream);
        }
        this.controlsHint.setText(
            message ?? 'Clique numa tecla para trocar. O mouse também ataca (esq.) e defende (dir.).'
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
    private createButton(
        x: number,
        y: number,
        label: string,
        action: () => void,
        width = 380
    ): GameObjects.Container {
        const background = this.add
            .rectangle(x, y, width, 48, UI_COLORS.woodMid, 1)
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

    private showControls() {
        this.mainPanel.setVisible(false);
        this.difficultyPanel.setVisible(false);
        this.controlsPanel.setVisible(true);
        this.listeningFor = null;
        this.refreshControls();
    }

    private showMain() {
        this.listeningFor = null;
        this.controlsPanel.setVisible(false);
        this.difficultyPanel.setVisible(false);
        this.mainPanel.setVisible(true);
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
