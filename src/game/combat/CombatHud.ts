import { GameObjects, Scene } from 'phaser';

import { Player } from '../entities/Player';

// HUD de combate: barra de mana e arma equipada (com a magia selecionada
// quando o cajado está na mão). Vive aqui, e não na cena, pelo mesmo motivo
// que PlayerCombat vive fora do Player — Game.ts só instancia e chama update.
//
// Depths 30/31, os mesmos do HUD de vida; encosta no painel existente para os
// dois lerem como um bloco só de informação.
const PANEL_X = 24;
const PANEL_Y = 104;
const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 52;

const BAR_X = PANEL_X + 19;
const BAR_Y = PANEL_Y + 14;
const BAR_WIDTH = 180;
const BAR_HEIGHT = 9;

export class CombatHud {
    private readonly panel: GameObjects.Graphics;
    private readonly manaBar: GameObjects.Graphics;
    private readonly weaponText: GameObjects.Text;
    private readonly spellText: GameObjects.Text;

    // O HUD só redesenha quando o valor MUDA — a barra de mana varia por
    // fração de ponto todo frame, e redesenhar sempre seria um Graphics
    // limpo/repintado 60 vezes por segundo por nada visível.
    private lastManaStep = -1;
    private lastLabel = '';

    constructor(
        scene: Scene,
        private player: Player
    ) {
        this.panel = scene.add.graphics().setDepth(30).setScrollFactor(0);
        this.panel.fillStyle(0x10212b, 0.75).fillRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 6);
        this.panel.lineStyle(2, 0xb8cc84, 0.55).strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 6);

        this.manaBar = scene.add.graphics().setDepth(31).setScrollFactor(0);

        this.weaponText = scene.add
            .text(PANEL_X + 19, PANEL_Y + 30, '', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#f7e7b0'
            })
            .setDepth(31)
            .setScrollFactor(0);

        this.spellText = scene.add
            .text(PANEL_X + PANEL_WIDTH - 19, PANEL_Y + 30, '', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#9d7bff'
            })
            .setOrigin(1, 0)
            .setDepth(31)
            .setScrollFactor(0);
    }

    // Objetos que o reflexo do lago (e qualquer captura de cena) não pode
    // pegar, pela mesma razão do resto do HUD.
    get gameObjects(): GameObjects.GameObject[] {
        return [this.panel, this.manaBar, this.weaponText, this.spellText];
    }

    update(): void {
        const weapons = this.player.weapons;

        // Passos inteiros de 1%: é o que a barra consegue mostrar de fato.
        const step = Math.round(this.player.mana.ratio * 100);
        if (step !== this.lastManaStep) {
            this.lastManaStep = step;
            this.drawManaBar(step / 100);
        }

        const spell = weapons.isStaffEquipped ? weapons.selectedSpell : null;
        const label = `${weapons.equipped.name}|${spell?.id ?? ''}`;
        if (label === this.lastLabel) {
            return;
        }
        this.lastLabel = label;

        this.weaponText.setText(`ARMA: ${weapons.equipped.name}   Z/X/C trocar`);

        if (spell) {
            this.spellText.setText(`${spell.name}  ${spell.manaCost} mana  ·  R troca`);
            this.spellText.setColor(colorToCss(spell.color));
            this.spellText.setVisible(true);
        } else {
            this.spellText.setVisible(false);
        }
    }

    private drawManaBar(ratio: number): void {
        this.manaBar.clear();
        this.manaBar.fillStyle(0x08111d, 0.9).fillRect(BAR_X, BAR_Y, BAR_WIDTH, BAR_HEIGHT);
        this.manaBar.fillStyle(0x4a7fd6, 1).fillRect(BAR_X, BAR_Y, BAR_WIDTH * ratio, BAR_HEIGHT);
        // Faixa clara no topo: dá volume à barra sem custar um segundo objeto.
        this.manaBar.fillStyle(0x8fc4ff, 0.8).fillRect(BAR_X, BAR_Y, BAR_WIDTH * ratio, 3);
        this.manaBar.lineStyle(1, 0xb8cc84, 0.45).strokeRect(BAR_X, BAR_Y, BAR_WIDTH, BAR_HEIGHT);
    }

    destroy(): void {
        this.panel.destroy();
        this.manaBar.destroy();
        this.weaponText.destroy();
        this.spellText.destroy();
    }
}

function colorToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}
