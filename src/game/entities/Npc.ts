import { GameObjects, Scene, Tweens } from 'phaser';

import { NpcDef, NPC_UI } from '../world/npc-config';
import { GROUND_Y } from '../world/phases';

// Profundidades reservadas (ver plano): o NPC fica entre o cenário e o
// jogador; o ícone da tecla precisa passar por cima de tudo que é mundo.
const NPC_DEPTH = 14;
const ICON_DEPTH = 22;

// NPC da vila: um Container com o desenho por blocos, plantado com os pés em
// GROUND_Y.
//
// SEM CORPO FÍSICO, de propósito. O NPC não anda, não colide e não recebe
// dano; um StaticBody aqui só serviria para o jogador ficar entalado nele ao
// tentar conversar. A proximidade é medida por distância, do mesmo jeito que
// handlePortals() já faz na cena.
export class Npc extends GameObjects.Container {
    readonly def: NpcDef;

    private art: GameObjects.Graphics;
    private icon: GameObjects.Container;
    private iconBaseY: number;

    private breathTween?: Tweens.Tween;
    private floatTween?: Tweens.Tween;
    private revealTween?: Tweens.Tween;

    private promptVisible = false;

    constructor(scene: Scene, def: NpcDef) {
        super(scene, def.x, GROUND_Y);

        this.def = def;

        this.art = scene.add.graphics();
        def.draw(this.art);
        // O facing é só um espelho horizontal do desenho. Fica no Graphics e
        // não no Container porque o ícone da tecla não pode sair espelhado
        // junto (um "E" ao contrário não se lê).
        this.art.setScale(def.facing, 1);
        this.add(this.art);

        scene.add.existing(this);
        this.setDepth(NPC_DEPTH);

        // Respiração: 6 linhas que fazem mais pela sensação de "vivo" do que
        // um sprite parado faria. Escala só em Y, a partir dos pés.
        this.breathTween = scene.tweens.add({
            targets: this.art,
            scaleY: 1.03,
            duration: 1400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });

        this.iconBaseY = GROUND_Y - def.height - NPC_UI.iconGap;
        this.icon = this.createIcon(scene);
    }

    // Distância usada para decidir quem responde à tecla. Horizontal, com um
    // corte vertical: o jogador em cima da plataforma da vila não deve
    // conversar com quem está no chão embaixo dele.
    distanceTo(x: number, y: number): number {
        const dy = Math.abs(y - (this.y - this.def.height / 2));
        if (dy > 120) {
            return Number.POSITIVE_INFINITY;
        }

        return Math.abs(x - this.x);
    }

    setPromptVisible(visible: boolean): void {
        if (visible === this.promptVisible) {
            return;
        }

        this.promptVisible = visible;
        this.revealTween?.remove();

        if (visible) {
            this.icon.setVisible(true);
            this.icon.y = this.iconBaseY + 8;
            this.revealTween = this.scene.tweens.add({
                targets: this.icon,
                alpha: 1,
                y: this.iconBaseY,
                duration: 180,
                ease: 'Back.out',
                // A flutuação só começa depois da subida: as duas mexem no
                // mesmo y e brigariam se rodassem juntas. `play` (e não
                // `resume`) porque o tween nasce pausado — é o método que o
                // Phaser documenta para esse caso, e ele também serve para
                // retomar depois de um pause.
                onComplete: () => this.floatTween?.play()
            });
            return;
        }

        this.floatTween?.pause();
        this.revealTween = this.scene.tweens.add({
            targets: this.icon,
            alpha: 0,
            duration: 140,
            onComplete: () => this.icon.setVisible(false)
        });
    }

    destroy(fromScene?: boolean): void {
        // Tween com repeat: -1 que não é destruído vaza a cada respawn — e a
        // cena reinicia a fase inteira a cada morte.
        this.breathTween?.remove();
        this.floatTween?.remove();
        this.revealTween?.remove();
        this.icon.destroy();

        super.destroy(fromScene);
    }

    private createIcon(scene: Scene): GameObjects.Container {
        const box = scene.add.graphics();
        box.fillStyle(0x10212b, 0.85).fillRoundedRect(-13, -13, 26, 26, 6);
        box.lineStyle(2, 0xb8cc84, 1).strokeRoundedRect(-13, -13, 26, 26, 6);

        const label = scene.add
            .text(0, 0, 'E', { fontFamily: 'monospace', fontSize: '15px', color: '#f7e7b0' })
            .setOrigin(0.5);

        // Objeto de cena, e não filho do NPC: dentro de um Container o depth do
        // filho é ignorado (vale o do pai), e o ícone precisa do seu próprio
        // (22, acima do jogador em 20).
        const icon = scene.add
            .container(this.x, this.iconBaseY, [box, label])
            .setDepth(ICON_DEPTH)
            .setAlpha(0)
            .setVisible(false);

        this.floatTween = scene.tweens.add({
            targets: icon,
            y: this.iconBaseY - 5,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut',
            paused: true
        });

        return icon;
    }
}
