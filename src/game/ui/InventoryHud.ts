import { GameObjects, Scene } from 'phaser';

import { controlLabel } from '../config/controls';
import { CoinSystem } from '../items/CoinSystem';
import { Inventory, INVENTORY_SLOTS } from '../items/Inventory';
import { drawItemBlocks } from '../items/item-art';
import { ItemId, itemDef } from '../items/item-catalog';
import { drawIcon, drawParchment, drawWoodFrame, UI_COLORS, UI_CSS, uiText, uiTextOutlined } from './ui-theme';

// Barra fixa de 6 slots de madeira no rodapé (Decisão de design #4: barra, não
// painel que abre — um modal a mais concorreria com pausa, mapa, diálogo e
// loja).
//
// Um slot fica ESCOLHIDO: moldura dourada, levemente erguido, e o nome do item
// com a ação disponível aparece num pergaminho logo acima da barra. As teclas
// ficam listadas na pausa. Quem decide o que elas fazem é o EconomySystem.
//
// Depth 32: junto do HUD atual (30/31) e abaixo do mapa (100) e da loja (103).
const HUD = {
    depth: 32,
    slotSize: 56,
    gap: 8,
    bottomMargin: 22,
    selectedLift: 5,
    messageMs: 1800
} as const;

export class InventoryHud {
    private readonly container: GameObjects.Container;
    private readonly frames: GameObjects.Graphics;
    private readonly icons: GameObjects.Graphics;
    private readonly quantities: GameObjects.Text[] = [];
    private readonly coinCounter: GameObjects.Text;
    private readonly itemInfo: GameObjects.Text;
    private readonly message: GameObjects.Text;

    private equippedWeapon: ItemId | null = null;
    private selectedIndex = 0;
    private messageUntil = 0;
    private readonly unsubscribeInventory: () => void;
    private readonly unsubscribeCoins: () => void;

    constructor(
        private readonly scene: Scene,
        private readonly inventory: Inventory,
        private readonly coins: CoinSystem
    ) {
        this.frames = scene.add.graphics();
        this.icons = scene.add.graphics();

        for (let index = 0; index < INVENTORY_SLOTS; index++) {
            this.quantities.push(
                scene.add.text(0, 0, '', uiTextOutlined(13, UI_CSS.cream)).setOrigin(1, 1)
            );
        }

        this.coinCounter = scene.add.text(0, 0, '0', uiTextOutlined(18, UI_CSS.gold)).setOrigin(0, 0.5);
        this.itemInfo = scene.add.text(0, 0, '', uiText(13, UI_CSS.ink)).setOrigin(0.5, 1);
        this.message = scene.add.text(0, 0, '', uiTextOutlined(14, UI_CSS.red)).setOrigin(0.5, 1);

        this.container = scene.add
            .container(0, 0, [
                this.frames,
                this.icons,
                ...this.quantities,
                this.coinCounter,
                this.itemInfo,
                this.message
            ])
            .setDepth(HUD.depth)
            .setScrollFactor(0);

        // Redesenha SÓ quando o inventário, as moedas ou a seleção mudam,
        // nunca no update() da cena.
        this.unsubscribeInventory = inventory.onChange(() => this.redraw());
        this.unsubscribeCoins = coins.onChange(() => this.updateCoinCounter());

        this.scene.scale.on('resize', this.redraw, this);
        this.scene.events.once('shutdown', () => this.destroy());

        this.redraw();
    }

    // Objetos que o reflexo do lago (e qualquer captura de cena) NÃO pode
    // pegar. É um Container só, então excluir ele exclui a barra inteira.
    get gameObjects(): GameObjects.GameObject[] {
        return [this.container];
    }

    // A arma equipada ganha uma marca no slot dela, para o jogador saber com o
    // que está batendo sem abrir nada.
    setEquippedWeapon(id: ItemId | null): void {
        if (this.equippedWeapon === id) {
            return;
        }
        this.equippedWeapon = id;
        this.redraw();
    }

    setSelectedSlot(index: number): void {
        if (this.selectedIndex === index) {
            return;
        }
        this.selectedIndex = index;
        this.redraw();
    }

    // Aviso curto ("Inventário cheio", "Vida cheia"). Vive acima do nome do
    // item e some sozinho — quem chama não precisa limpar.
    showMessage(text: string, color: string = UI_CSS.red): void {
        this.message.setColor(color);
        this.message.setText(text);
        this.messageUntil = this.scene.time.now + HUD.messageMs;
    }

    // Único trabalho por frame: apagar o aviso na hora certa.
    update(): void {
        if (this.messageUntil === 0 || this.scene.time.now < this.messageUntil) {
            return;
        }

        this.messageUntil = 0;
        this.message.setText('');
    }

    destroy(): void {
        this.unsubscribeInventory();
        this.unsubscribeCoins();
        this.scene.scale.off('resize', this.redraw, this);
        this.container.destroy(true);
    }

    private redraw(): void {
        const barWidth = INVENTORY_SLOTS * HUD.slotSize + (INVENTORY_SLOTS - 1) * HUD.gap;
        const startX = (this.scene.scale.width - barWidth) / 2;
        const top = this.scene.scale.height - HUD.slotSize - HUD.bottomMargin;
        const centerX = this.scene.scale.width / 2;

        this.frames.clear();
        this.icons.clear();

        for (let index = 0; index < INVENTORY_SLOTS; index++) {
            const x = startX + index * (HUD.slotSize + HUD.gap);
            const selected = index === this.selectedIndex;
            const y = selected ? top - HUD.selectedLift : top;
            const slot = this.inventory.slotAt(index);
            const isEquipped = !!slot && slot.id === this.equippedWeapon;

            drawWoodFrame(this.frames, x, y, HUD.slotSize, HUD.slotSize);
            // Fundo rebaixado onde o item fica.
            this.frames.fillStyle(0x2e1d12, 0.9).fillRect(x + 7, y + 7, HUD.slotSize - 14, HUD.slotSize - 14);

            if (selected) {
                this.frames.lineStyle(3, UI_COLORS.gold, 1);
                this.frames.strokeRect(x - 2, y - 2, HUD.slotSize + 4, HUD.slotSize + 4);
            }

            if (isEquipped) {
                // Marca de "na mão": um triângulo dourado no canto do slot.
                this.frames.fillStyle(UI_COLORS.gold, 1).fillTriangle(x + 7, y + 7, x + 17, y + 7, x + 7, y + 17);
            }

            if (!slot) {
                this.quantities[index].setText('');
                continue;
            }

            drawItemBlocks(this.icons, slot.id, x + HUD.slotSize / 2, y + HUD.slotSize / 2 + 2, 30);

            // Arma não mostra "x1": o número só existe para quem empilha.
            this.quantities[index].setText(itemDef(slot.id).stackSize > 1 ? `${slot.quantity}` : '');
            this.quantities[index].setPosition(x + HUD.slotSize - 6, y + HUD.slotSize - 4);
        }

        // Bolsa de moedas ao lado da barra (moeda não ocupa slot).
        const pouchX = startX + barWidth + 30;
        const pouchY = top + HUD.slotSize / 2;
        drawIcon(this.icons, 'pouch', pouchX, pouchY, 32);
        this.coinCounter.setPosition(pouchX + 22, pouchY);
        this.updateCoinCounter();

        // Nome do item escolhido num pergaminho pequeno acima da barra.
        const infoY = top - HUD.selectedLift - 8;
        this.itemInfo.setText(this.describeSelected());
        this.itemInfo.setPosition(centerX, infoY);
        const infoWidth = this.itemInfo.width + 28;
        drawParchment(this.frames, centerX - infoWidth / 2, infoY - this.itemInfo.height - 6, infoWidth, this.itemInfo.height + 10);

        this.message.setPosition(centerX, infoY - this.itemInfo.height - 14);
    }

    // Nome do item escolhido e o que o F faz com ele.
    private describeSelected(): string {
        const slot = this.inventory.slotAt(this.selectedIndex);
        if (!slot) {
            return 'Vazio';
        }

        const def = itemDef(slot.id);
        const name = def.stackSize > 1 ? `${def.name} x${slot.quantity}` : def.name;

        if (def.kind === 'weapon') {
            return slot.id === this.equippedWeapon ? `${name} (na mão)` : `${name}  ·  ${controlLabel('useItem')} equipar`;
        }
        if (def.kind === 'consumable' && def.healAmount) {
            return `${name}  ·  ${controlLabel('useItem')} usar (+${def.healAmount} vida)`;
        }
        return `${name}  ·  serve para a loja`;
    }

    private updateCoinCounter(): void {
        this.coinCounter.setText(`${this.coins.current}`);
    }
}
