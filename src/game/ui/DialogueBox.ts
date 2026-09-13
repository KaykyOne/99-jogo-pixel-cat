import { GameObjects, Input, Scene, Time, Types } from 'phaser';

import { NPC_UI } from '../world/npc-config';
import { drawParchment, drawWoodFrame, UI_COLORS, UI_CSS, uiText, uiTextOutlined } from './ui-theme';

// Caixa de diálogo. Pergaminho no rodapé com o nome de quem fala numa
// plaquinha de madeira sobre a borda, no depth 103 — acima da pausa
// (101/102), porque diálogo e pausa nunca coexistem e, se coexistissem, quem
// tem que aparecer é o diálogo.
const PANEL_DEPTH = 103;
const PANEL_HEIGHT = 150;
const PANEL_MARGIN_X = 60;
// Acima da barra de inventário E do pergaminho com o nome do item escolhido.
const PANEL_BOTTOM_GAP = 132;

export type DialogueOption = {
    label: string;
    // Devolvido em onResult quando a opção é escolhida.
    value: string;
};

export type DialogueRequest = {
    speaker: string;
    lines: string[];
    // Exibidas depois da última página. Sem elas, a última página fecha.
    options?: DialogueOption[];
};

type Phase = 'closed' | 'typing' | 'page-done' | 'choosing';

export class DialogueBox {
    private scene: Scene;

    private panel: GameObjects.Graphics;
    private speakerText: GameObjects.Text;
    private bodyText: GameObjects.Text;
    private footerText: GameObjects.Text;
    private optionTexts: GameObjects.Text[] = [];
    private optionCursor: GameObjects.Graphics;

    private advanceKey: Input.Keyboard.Key;
    private closeKey: Input.Keyboard.Key;
    private upKey: Input.Keyboard.Key;
    private downKey: Input.Keyboard.Key;

    private phase: Phase = 'closed';
    private lines: string[] = [];
    private options: DialogueOption[] = [];
    private pageIndex = 0;
    private selected = 0;
    private typedChars = 0;
    private typer?: Time.TimerEvent;
    private onResult?: (value: string | null) => void;

    constructor(scene: Scene) {
        this.scene = scene;

        this.panel = scene.add.graphics().setScrollFactor(0).setDepth(PANEL_DEPTH).setVisible(false);
        this.speakerText = this.makeText(uiTextOutlined(16, UI_CSS.cream));
        this.bodyText = this.makeText(uiText(16, UI_CSS.ink, { lineSpacing: 4 }));
        this.footerText = this.makeText(uiText(12, UI_CSS.inkSoft));
        this.optionCursor = scene.add
            .graphics()
            .setScrollFactor(0)
            .setDepth(PANEL_DEPTH)
            .setVisible(false);

        const keyboard = scene.input.keyboard!;
        this.advanceKey = keyboard.addKey(Input.Keyboard.KeyCodes.E);
        this.closeKey = keyboard.addKey(Input.Keyboard.KeyCodes.ESC);
        this.upKey = keyboard.addKey(Input.Keyboard.KeyCodes.W);
        this.downKey = keyboard.addKey(Input.Keyboard.KeyCodes.S);

        scene.scale.on('resize', this.layout, this);
    }

    get isOpen(): boolean {
        return this.phase !== 'closed';
    }

    open(request: DialogueRequest, onResult: (value: string | null) => void): void {
        this.lines = request.lines.length > 0 ? request.lines : ['...'];
        this.options = request.options ?? [];
        this.onResult = onResult;
        this.pageIndex = 0;
        this.selected = 0;

        this.speakerText.setText(request.speaker);
        this.setVisible(true);
        // A fase sai de 'closed' ANTES do layout: ele não desenha nada com o
        // diálogo fechado, e chamá-lo antes deixaria o painel invisível.
        this.phase = 'typing';
        this.layout();
        this.startPage();
    }

    // Lida com as teclas do diálogo. Só é chamada quando a cena já decidiu que
    // o diálogo consome o input (ver o gate no update de PhaseScene).
    update(): void {
        if (this.phase === 'closed') {
            return;
        }

        if (Input.Keyboard.JustDown(this.closeKey)) {
            this.finish(null);
            return;
        }

        if (this.phase === 'choosing') {
            if (Input.Keyboard.JustDown(this.upKey)) {
                this.moveSelection(-1);
            }
            if (Input.Keyboard.JustDown(this.downKey)) {
                this.moveSelection(1);
            }
            if (Input.Keyboard.JustDown(this.advanceKey)) {
                this.finish(this.options[this.selected].value);
            }
            return;
        }

        if (!Input.Keyboard.JustDown(this.advanceKey)) {
            return;
        }

        // E durante a revelação completa a linha na hora; com a linha inteira
        // na tela, avança.
        if (this.phase === 'typing') {
            this.completePage();
            return;
        }

        if (this.pageIndex < this.lines.length - 1) {
            this.pageIndex++;
            this.startPage();
            return;
        }

        if (this.options.length > 0) {
            this.showOptions();
            return;
        }

        this.finish(null);
    }

    destroy(): void {
        this.typer?.remove();
        this.scene.scale.off('resize', this.layout, this);

        this.panel.destroy();
        this.speakerText.destroy();
        this.bodyText.destroy();
        this.footerText.destroy();
        this.optionCursor.destroy();
        this.clearOptionTexts();
    }

    private finish(value: string | null): void {
        const callback = this.onResult;

        this.typer?.remove();
        this.typer = undefined;
        this.phase = 'closed';
        this.onResult = undefined;
        this.clearOptionTexts();
        this.setVisible(false);

        callback?.(value);
    }

    private startPage(): void {
        this.clearOptionTexts();
        this.typedChars = 0;
        this.phase = 'typing';
        this.bodyText.setText('');

        this.typer?.remove();
        this.typer = this.scene.time.addEvent({
            delay: NPC_UI.typewriterMs,
            loop: true,
            callback: () => {
                const line = this.lines[this.pageIndex];
                this.typedChars++;
                this.bodyText.setText(line.slice(0, this.typedChars));

                if (this.typedChars >= line.length) {
                    this.completePage();
                }
            }
        });

        this.refreshFooter();
    }

    private completePage(): void {
        this.typer?.remove();
        this.typer = undefined;
        this.bodyText.setText(this.lines[this.pageIndex]);
        this.phase = 'page-done';
        this.refreshFooter();
    }

    private showOptions(): void {
        this.phase = 'choosing';
        this.selected = 0;
        this.bodyText.setText('');
        this.clearOptionTexts();

        this.optionTexts = this.options.map((option, index) =>
            this.scene.add
                .text(0, 0, option.label, uiText(16, index === 0 ? UI_CSS.ink : UI_CSS.inkSoft))
                .setScrollFactor(0)
                .setDepth(PANEL_DEPTH + 0.2)
        );

        this.layout();
        this.refreshFooter();
    }

    private moveSelection(delta: number): void {
        const total = this.options.length;
        this.selected = (this.selected + delta + total) % total;

        this.optionTexts.forEach((text, index) => {
            text.setColor(index === this.selected ? UI_CSS.ink : UI_CSS.inkSoft);
        });

        this.layout();
    }

    private refreshFooter(): void {
        if (this.phase === 'choosing') {
            this.footerText.setText('W/S escolher  ·  E confirmar  ·  ESC fechar');
            return;
        }

        const isLastPage = this.pageIndex >= this.lines.length - 1;
        const advance = isLastPage && this.options.length === 0 ? 'E fechar' : 'E continuar';
        this.footerText.setText(`${advance}  ·  ESC fechar`);
    }

    private makeText(style: Types.GameObjects.Text.TextStyle): GameObjects.Text {
        return this.scene.add
            .text(0, 0, '', style)
            .setScrollFactor(0)
            .setDepth(PANEL_DEPTH + 0.1)
            .setVisible(false);
    }

    private clearOptionTexts(): void {
        for (const text of this.optionTexts) {
            text.destroy();
        }
        this.optionTexts = [];
        this.optionCursor.clear();
        this.optionCursor.setVisible(false);
    }

    private setVisible(visible: boolean): void {
        this.panel.setVisible(visible);
        this.speakerText.setVisible(visible);
        this.bodyText.setVisible(visible);
        this.footerText.setVisible(visible);
    }

    // Reposiciona tudo a partir da largura atual da tela: a cena roda em
    // Scale.RESIZE, então a UI não pode assumir 1024px.
    private layout(): void {
        if (this.phase === 'closed') {
            return;
        }

        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        const panelWidth = Math.min(900, Math.max(360, width - PANEL_MARGIN_X * 2));
        const x = (width - panelWidth) / 2;
        const y = height - PANEL_BOTTOM_GAP - PANEL_HEIGHT;

        this.panel.clear();
        drawParchment(this.panel, x, y, panelWidth, PANEL_HEIGHT);

        // Plaquinha com o nome, pregada sobre a borda de cima.
        const plateWidth = Math.max(140, this.speakerText.width + 40);
        drawWoodFrame(this.panel, x + 20, y - 20, plateWidth, 38);
        this.speakerText.setPosition(x + 40, y - 11);

        this.bodyText.setPosition(x + 28, y + 34);
        this.bodyText.setWordWrapWidth(panelWidth - 56);
        this.footerText.setPosition(x + 28, y + PANEL_HEIGHT - 30);

        this.optionTexts.forEach((text, index) => {
            text.setPosition(x + 52, y + 34 + index * 28);
        });

        if (this.optionTexts.length > 0) {
            const cursorY = y + 30 + this.selected * 28;
            this.optionCursor.clear();
            this.optionCursor
                .fillStyle(UI_COLORS.parchmentShade, 1)
                .fillRect(x + 22, cursorY, panelWidth - 44, 26);
            this.optionCursor
                .fillStyle(UI_COLORS.goldDark, 1)
                .fillTriangle(x + 32, cursorY + 7, x + 32, cursorY + 19, x + 41, cursorY + 13);
            this.optionCursor.setVisible(true);
        }
    }
}
