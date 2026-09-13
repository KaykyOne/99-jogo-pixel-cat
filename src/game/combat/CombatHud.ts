import { GameObjects, Scene } from 'phaser';

import { Player } from '../entities/Player';
import { drawItemBlocks } from '../items/item-art';
import { ItemId } from '../items/item-catalog';
import { drawIcon, HUD_PANEL, UI_COLORS, UI_CSS, uiTextOutlined } from '../ui/ui-theme';

// A cena desenha a tábua do canto superior esquerdo, o nome da fase e os
// corações (Game.createHud); este HUD põe dentro dela a mana, a arma e a magia.

const MANA_BAR = { x: HUD_PANEL.x + 42, y: HUD_PANEL.y + 80, width: 158, height: 10 } as const;
const WEAPON_SLOT = { x: HUD_PANEL.x + HUD_PANEL.width - 78, y: HUD_PANEL.y + 50, size: 60 } as const;

// HUD de combate: barra de mana, arma equipada (ícone num encaixe) e a magia
// selecionada quando o cajado está na mão. Vive aqui, e não na cena, pelo
// mesmo motivo que PlayerCombat vive fora do Player.
export class CombatHud {
    private readonly manaBar: GameObjects.Graphics;
    private readonly weaponSlot: GameObjects.Graphics;
    private readonly label: GameObjects.Text;

    // Só redesenha quando o valor MUDA: a mana varia por fração de ponto todo
    // frame, e repintar sempre seria trabalho por nada visível.
    private lastManaStep = -1;
    private lastLabel = '';

    constructor(
        scene: Scene,
        private player: Player
    ) {
        this.manaBar = scene.add.graphics().setDepth(31).setScrollFactor(0);
        this.weaponSlot = scene.add.graphics().setDepth(31).setScrollFactor(0);
        this.label = scene.add
            .text(HUD_PANEL.x + 22, HUD_PANEL.y + 96, '', uiTextOutlined(13))
            .setDepth(31)
            .setScrollFactor(0);
    }

    // Objetos que o reflexo do lago (e qualquer captura de cena) não pode pegar.
    get gameObjects(): GameObjects.GameObject[] {
        return [this.manaBar, this.weaponSlot, this.label];
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
        const label = `${weapons.equippedWeaponId}|${spell?.id ?? ''}`;
        if (label === this.lastLabel) {
            return;
        }
        this.lastLabel = label;

        // Os ids de arma do combate e do catálogo de itens são os mesmos.
        this.drawWeaponSlot(weapons.equippedWeaponId as ItemId);

        if (spell) {
            this.label.setText(`${spell.name} · ${spell.manaCost}`);
            this.label.setColor(colorToCss(spell.color));
        } else {
            this.label.setText(weapons.equipped.name);
            this.label.setColor(UI_CSS.cream);
        }
    }

    private drawManaBar(ratio: number): void {
        const g = this.manaBar;
        const bar = MANA_BAR;

        g.clear();
        g.fillStyle(UI_COLORS.woodDark, 1).fillRect(bar.x - 2, bar.y - 2, bar.width + 4, bar.height + 4);
        g.fillStyle(0x10151f, 1).fillRect(bar.x, bar.y, bar.width, bar.height);
        g.fillStyle(UI_COLORS.mana, 1).fillRect(bar.x, bar.y, bar.width * ratio, bar.height);
        // Faixa clara no topo: dá volume à barra sem custar um segundo objeto.
        g.fillStyle(UI_COLORS.manaLight, 0.8).fillRect(bar.x, bar.y, bar.width * ratio, 3);
        drawIcon(g, 'gem', bar.x - 18, bar.y + bar.height / 2, 18);
    }

    private drawWeaponSlot(id: ItemId): void {
        const g = this.weaponSlot;
        const slot = WEAPON_SLOT;

        g.clear();
        g.fillStyle(UI_COLORS.woodDark, 1).fillRect(slot.x, slot.y, slot.size, slot.size);
        g.fillStyle(0x3a2618, 1).fillRect(slot.x + 3, slot.y + 3, slot.size - 6, slot.size - 6);
        g.lineStyle(2, UI_COLORS.goldDark, 1).strokeRect(slot.x + 1, slot.y + 1, slot.size - 2, slot.size - 2);
        drawItemBlocks(g, id, slot.x + slot.size / 2, slot.y + slot.size / 2, 38);
    }

    destroy(): void {
        this.manaBar.destroy();
        this.weaponSlot.destroy();
        this.label.destroy();
    }
}

function colorToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}
