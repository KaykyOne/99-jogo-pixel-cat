import { GameObjects, Scene, Tweens } from 'phaser';

import { PhaseDefinition } from '../world/phases';
import {
    drawIcon,
    drawParchment,
    drawScrollRoller,
    UI_COLORS,
    UI_CSS,
    uiText
} from './ui-theme';

export type MapPhaseState = 'locked' | 'reached' | 'cleared';

// Mapa da jornada (tecla M): um pergaminho que desenrola com o mundo visto de
// lado, como uma tapeçaria. Cada fase é uma vinheta pintada numa célula, uma
// trilha pontilhada liga todas, a coroa marca onde o jogador está, fases
// vencidas ganham bandeira e as ainda não alcançadas ficam sob névoa.
//
// Tudo é relativo ao CENTRO do container: o layout de resize só move o
// container, e o "desenrolar" é um tween de scaleX a partir do meio.
const MAP = {
    depth: 100,
    width: 880,
    height: 460,
    stripLeft: -390,
    stripWidth: 780,
    groundY: 30,
    trailY: 72,
    labelY: 96
} as const;

// Mistura a cor do bioma com o pergaminho: o mapa é desenho sobre papel, não
// uma foto do cenário.
function sepia(color: number, amount = 0.3): number {
    const mix = (shift: number) => {
        const from = (color >> shift) & 0xff;
        const to = (UI_COLORS.parchment >> shift) & 0xff;
        return Math.round(from + (to - from) * amount);
    };
    return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export class WorldMapOverlay {
    private readonly container: GameObjects.Container;
    private readonly paper: GameObjects.Graphics;
    private readonly art: GameObjects.Graphics;
    private readonly fog: GameObjects.Graphics;
    private readonly crown: GameObjects.Container;
    private readonly crownArt: GameObjects.Graphics;
    private readonly title: GameObjects.Text;
    private readonly location: GameObjects.Text;
    private readonly hint: GameObjects.Text;
    private readonly labels: GameObjects.Text[] = [];
    private readonly mysteries: GameObjects.Text[] = [];

    private readonly bobTween: Tweens.Tween;
    private openTween?: Tweens.Tween;
    private open = false;

    constructor(
        private readonly scene: Scene,
        private readonly phases: readonly PhaseDefinition[]
    ) {
        this.paper = scene.add.graphics();
        this.art = scene.add.graphics();
        this.fog = scene.add.graphics();

        this.title = scene.add
            .text(0, -MAP.height / 2 + 44, 'MAPA DA JORNADA', uiText(28, UI_CSS.ink))
            .setOrigin(0.5);
        this.location = scene.add.text(0, MAP.height / 2 - 76, '', uiText(16, UI_CSS.ink)).setOrigin(0.5);
        this.hint = scene.add.text(0, MAP.height / 2 - 48, 'M fechar', uiText(12, UI_CSS.inkSoft)).setOrigin(0.5);

        const children: GameObjects.GameObject[] = [this.paper, this.art, this.fog, this.title, this.location, this.hint];

        phases.forEach((phase, index) => {
            const x = this.cellCenter(index);
            const label = scene.add
                .text(x, MAP.labelY, phase.name, uiText(11, UI_CSS.ink, {
                    align: 'center',
                    wordWrap: { width: this.cellWidth - 8 }
                }))
                .setOrigin(0.5, 0);
            const mystery = scene.add.text(x, MAP.groundY - 42, '?', uiText(34, UI_CSS.inkSoft)).setOrigin(0.5);
            this.labels.push(label);
            this.mysteries.push(mystery);
            children.push(label, mystery);
        });

        this.crownArt = scene.add.graphics();
        drawIcon(this.crownArt, 'crown', 0, 0, 28);
        this.crown = scene.add.container(0, 0, [this.crownArt]);
        children.push(this.crown);

        this.container = scene.add
            .container(0, 0, children)
            .setDepth(MAP.depth)
            .setScrollFactor(0)
            .setVisible(false);

        this.bobTween = scene.tweens.add({
            targets: this.crownArt,
            y: -5,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });

        this.drawPaper();
        this.layout();
        scene.scale.on('resize', this.layout, this);
    }

    get isOpen(): boolean {
        return this.open;
    }

    // Objetos que o reflexo do lago não pode capturar.
    get gameObjects(): GameObjects.GameObject[] {
        return [this.container];
    }

    // Alterna e devolve se ficou aberto.
    toggle(): boolean {
        if (this.open) {
            this.close();
        } else {
            this.show();
        }
        return this.open;
    }

    close(): void {
        this.open = false;
        this.openTween?.remove();
        this.container.setVisible(false);
    }

    refresh(states: readonly MapPhaseState[]): void {
        this.art.clear();
        this.fog.clear();
        this.drawTrail();

        this.phases.forEach((phase, index) => {
            const state = states[index] ?? 'locked';
            const cx = this.cellCenter(index);

            this.drawVignette(phase.key, cx);

            const locked = state === 'locked';
            this.mysteries[index].setVisible(locked);
            this.labels[index].setText(locked ? '???' : phase.name);
            this.labels[index].setColor(locked ? UI_CSS.inkSoft : UI_CSS.ink);

            if (locked) {
                this.drawFog(cx);
            } else if (state === 'cleared') {
                drawIcon(this.art, 'flag', cx + 30, MAP.groundY - 26, 30);
            }
        });
    }

    // Posiciona a coroa na trilha: fase atual + quanto dela já foi explorado.
    updateMarker(phaseIndex: number, progress: number, phaseName: string): void {
        const total = Math.max(1, this.phases.length - 1);
        const worldProgress = Math.min(1, (phaseIndex + progress) / total);
        const first = this.cellCenter(0);
        const last = this.cellCenter(this.phases.length - 1);
        const x = first + (last - first) * worldProgress;

        this.crown.setPosition(x, this.trailYAt(x) - 20);
        this.location.setText(`${phaseName} — ${Math.round(progress * 100)}% explorado`);
    }

    destroy(): void {
        this.scene.scale.off('resize', this.layout, this);
        this.bobTween.remove();
        this.openTween?.remove();
        this.container.destroy(true);
    }

    private show(): void {
        this.open = true;
        this.container.setVisible(true);
        this.container.setScale(0.08, 1);
        this.container.setAlpha(0.6);

        this.openTween?.remove();
        this.openTween = this.scene.tweens.add({
            targets: this.container,
            scaleX: 1,
            alpha: 1,
            duration: 260,
            ease: 'Cubic.out'
        });
    }

    private layout(): void {
        this.container.setPosition(this.scene.scale.width / 2, this.scene.scale.height / 2);
    }

    private get cellWidth(): number {
        return MAP.stripWidth / this.phases.length;
    }

    private cellCenter(index: number): number {
        return MAP.stripLeft + this.cellWidth * (index + 0.5);
    }

    private trailYAt(x: number): number {
        return MAP.trailY + Math.sin(x / 46) * 7;
    }

    private drawPaper(): void {
        const g = this.paper;
        const halfW = MAP.width / 2;
        const halfH = MAP.height / 2;

        g.clear();
        drawParchment(g, -halfW + 10, -halfH + 8, MAP.width - 20, MAP.height - 16);
        drawScrollRoller(g, -halfW + 6, -halfH, MAP.height);
        drawScrollRoller(g, halfW - 6, -halfH, MAP.height);

        // Filete de tinta sob o título.
        g.fillStyle(UI_COLORS.parchmentEdge, 0.5);
        g.fillRect(-160, -halfH + 66, 320, 2);

        // Moldura fina em volta da faixa de paisagem.
        g.lineStyle(2, UI_COLORS.parchmentEdge, 0.6);
        g.strokeRect(MAP.stripLeft - 10, -130, MAP.stripWidth + 20, 270);
    }

    private drawTrail(): void {
        const g = this.art;
        const first = this.cellCenter(0);
        const last = this.cellCenter(this.phases.length - 1);

        g.fillStyle(UI_COLORS.ink, 0.55);
        for (let x = first; x <= last; x += 9) {
            g.fillRect(x - 1.5, this.trailYAt(x) - 1.5, 3, 3);
        }
        // Marcos em cada fase.
        for (let index = 0; index < this.phases.length; index++) {
            const cx = this.cellCenter(index);
            g.fillStyle(UI_COLORS.ink, 0.8).fillRect(cx - 4, this.trailYAt(cx) - 4, 8, 8);
            g.fillStyle(UI_COLORS.parchment, 1).fillRect(cx - 2, this.trailYAt(cx) - 2, 4, 4);
        }
    }

    private drawFog(cx: number): void {
        const g = this.fog;
        const half = this.cellWidth / 2 - 2;

        g.fillStyle(UI_COLORS.parchmentShade, 0.92);
        g.fillRect(cx - half, -110, half * 2, 150);
        g.fillStyle(UI_COLORS.parchmentEdge, 0.25);
        for (let row = 0; row < 14; row++) {
            for (let col = 0; col < 8; col++) {
                if ((row + col) % 3 === 0) {
                    g.fillRect(cx - half + 6 + col * ((half * 2 - 12) / 8), -104 + row * 10, 2, 2);
                }
            }
        }
    }

    // Vinheta de cada bioma, desenhada acima da linha de chão da célula.
    private drawVignette(key: string, cx: number): void {
        const g = this.art;
        const ground = MAP.groundY;
        const half = this.cellWidth / 2 - 8;
        const ink = UI_COLORS.ink;

        const groundColor: Record<string, number> = {
            village: 0x6f9b4f,
            forest: 0x4f7a3d,
            desert: 0xd9a441,
            snow: 0xeaf3fb,
            cave: 0x4a3a5a,
            volcano: 0x6b3220,
            ruins: 0x8f8978
        };

        g.fillStyle(sepia(groundColor[key] ?? 0x6f8b71), 1).fillRect(cx - half, ground, half * 2, 8);
        g.fillStyle(ink, 0.6).fillRect(cx - half, ground, half * 2, 1);

        switch (key) {
            case 'village': {
                const house = (hx: number, w: number, h: number, roof: number) => {
                    g.fillStyle(sepia(0xc9a27a), 1).fillRect(hx - w / 2, ground - h, w, h);
                    g.fillStyle(sepia(roof), 1).fillTriangle(hx - w / 2 - 5, ground - h, hx + w / 2 + 5, ground - h, hx, ground - h - 18);
                    g.fillStyle(sepia(0x4a3524), 1).fillRect(hx - 3, ground - 11, 6, 11);
                    g.lineStyle(1, ink, 0.6).strokeRect(hx - w / 2, ground - h, w, h);
                };
                house(cx - 16, 26, 22, 0xa8452e);
                house(cx + 18, 22, 18, 0x8a5a33);
                g.fillStyle(sepia(0x4f7a3d), 1).fillCircle(cx + 2, ground - 40, 12);
                break;
            }
            case 'forest': {
                const pine = (px: number, h: number) => {
                    g.fillStyle(sepia(0x6b4a33), 1).fillRect(px - 2, ground - 8, 4, 8);
                    g.fillStyle(sepia(0x3c5f2d), 1).fillTriangle(px - 12, ground - 6, px + 12, ground - 6, px, ground - h);
                    g.fillStyle(sepia(0x4f7a3d), 1).fillTriangle(px - 9, ground - h * 0.45, px + 9, ground - h * 0.45, px, ground - h - 8);
                };
                pine(cx - 22, 44);
                pine(cx + 2, 58);
                pine(cx + 24, 40);
                break;
            }
            case 'desert': {
                g.fillStyle(sepia(0xd99840), 1).fillTriangle(cx - half, ground, cx + 6, ground, cx - 16, ground - 26);
                g.fillStyle(sepia(0xc47f33), 1).fillTriangle(cx - 12, ground, cx + half, ground, cx + 20, ground - 34);
                g.fillStyle(sepia(0x3e7d4a), 1);
                g.fillRect(cx + 2, ground - 30, 6, 30);
                g.fillRect(cx - 4, ground - 22, 6, 4);
                g.fillRect(cx - 4, ground - 30, 3, 8);
                g.fillRect(cx + 8, ground - 18, 6, 4);
                g.fillRect(cx + 11, ground - 26, 3, 8);
                g.fillStyle(sepia(0xf5c542), 1).fillCircle(cx - 22, ground - 50, 7);
                break;
            }
            case 'snow': {
                g.fillStyle(sepia(0x9fb7cc), 1).fillTriangle(cx - half, ground, cx + 10, ground, cx - 14, ground - 52);
                g.fillStyle(sepia(0x8aa3ba), 1).fillTriangle(cx - 10, ground, cx + half, ground, cx + 18, ground - 40);
                g.fillStyle(0xffffff, 1).fillTriangle(cx - 22, ground - 38, cx - 6, ground - 38, cx - 14, ground - 52);
                g.fillStyle(0xffffff, 1).fillTriangle(cx + 11, ground - 30, cx + 25, ground - 30, cx + 18, ground - 40);
                break;
            }
            case 'cave': {
                g.fillStyle(sepia(0x5a4a66), 1).fillRect(cx - 30, ground - 44, 60, 44);
                g.fillStyle(sepia(0x5a4a66), 1).fillCircle(cx, ground - 44, 30);
                g.fillStyle(0x1c1428, 1).fillRect(cx - 14, ground - 26, 28, 26);
                g.fillStyle(0x1c1428, 1).fillCircle(cx, ground - 26, 14);
                g.fillStyle(sepia(0xb98ae8, 0.15), 1);
                g.fillTriangle(cx - 30, ground, cx - 22, ground, cx - 26, ground - 16);
                g.fillTriangle(cx + 22, ground, cx + 32, ground, cx + 27, ground - 20);
                break;
            }
            case 'volcano': {
                g.fillStyle(sepia(0x512b1c), 1).fillTriangle(cx - half, ground, cx + half, ground, cx, ground - 56);
                g.fillStyle(0xff7a3c, 1).fillTriangle(cx - 7, ground - 44, cx + 7, ground - 44, cx, ground - 56);
                g.fillStyle(sepia(0x5a3a3a), 0.8);
                g.fillCircle(cx - 4, ground - 66, 6);
                g.fillCircle(cx + 6, ground - 76, 8);
                g.fillCircle(cx - 2, ground - 88, 5);
                break;
            }
            case 'ruins': {
                const column = (px: number, h: number) => {
                    g.fillStyle(sepia(0x7a7466), 1).fillRect(px - 5, ground - h, 10, h);
                    g.fillStyle(sepia(0x8f8978), 1).fillRect(px - 8, ground - h, 16, 5);
                    g.lineStyle(1, ink, 0.5).strokeRect(px - 5, ground - h, 10, h);
                };
                column(cx - 22, 44);
                column(cx, 52);
                column(cx + 22, 26);
                g.fillStyle(sepia(0x8f8978), 1).fillRect(cx + 14, ground - 6, 18, 6);
                g.fillStyle(sepia(0xe8d9ff), 1).fillCircle(cx - 26, ground - 66, 6);
                break;
            }
        }
    }
}
