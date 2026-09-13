import { GameObjects, Scene } from 'phaser';

import { CoinSystem } from '../items/CoinSystem';
import { Inventory, INVENTORY_SLOTS } from '../items/Inventory';
import { drawItemBlocks } from '../items/item-art';
import { ItemId, itemDef } from '../items/item-catalog';

// Barra fixa de 6 slots no rodapé (Decisão de design #4: barra, não painel que
// abre — um modal a mais concorreria com pausa, mapa, diálogo e loja).
//
// Um slot fica ESCOLHIDO: borda dourada, levemente erguido, e o nome do item
// com a ação disponível aparece logo acima da barra. Embaixo, uma linha fixa
// lembra as teclas. Quem decide o que as teclas fazem é o EconomySystem.
//
// Depth 32: junto do HUD atual (30/31) e abaixo do mapa (100) e da loja (103).
const HUD = {
    depth: 32,
    slotSize: 56,
    gap: 10,
    bottomMargin: 26,
    selectedLift: 4,
    messageMs: 1800
} as const;

const CONTROLS_HINT = 'Roda do mouse / Tab escolhe  ·  F usa  ·  G larga (Shift+G tudo)  ·  R cura rápida';

export class InventoryHud {
    private readonly container: GameObjects.Container;
    private readonly frames: GameObjects.Graphics;
    private readonly icons: GameObjects.Graphics;
    private readonly quantities: GameObjects.Text[] = [];
    private readonly coinCounter: GameObjects.Text;
    private readonly itemInfo: GameObjects.Text;
    private readonly message: GameObjects.Text;
    private readonly controlsHint: GameObjects.Text;

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
                scene.add
                    .text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#f7e7b0' })
                    .setOrigin(1, 1)
            );
        }

        this.coinCounter = scene.add
            .text(0, 0, '0', { fontFamily: 'monospace', fontSize: '14px', color: '#f5c542' })
            .setOrigin(0, 0.5);

        this.itemInfo = scene.add
            .text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#f7e7b0' })
            .setOrigin(0.5, 1);

        this.message = scene.add
            .text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ff6b6b' })
            .setOrigin(0.5, 1);

        this.controlsHint = scene.add
            .text(0, 0, CONTROLS_HINT, { fontFamily: 'monospace', fontSize: '10px', color: '#9db68d' })
            .setOrigin(0.5, 0);

        this.container = scene.add
            .container(0, 0, [
                this.frames,
                this.icons,
                ...this.quantities,
                this.coinCounter,
                this.itemInfo,
                this.message,
                this.controlsHint
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
    showMessage(text: string, color = '#ff6b6b'): void {
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

            // Mesma paleta do HUD atual (createHud em Game.ts).
            this.frames
                .fillStyle(selected ? 0x1d3a2c : 0x10212b, selected ? 0.92 : 0.75)
                .fillRoundedRect(x, y, HUD.slotSize, HUD.slotSize, 6);
            if (selected) {
                this.frames.lineStyle(3, 0xf5c542, 1);
            } else {
                this.frames.lineStyle(2, 0xb8cc84, 0.55);
            }
            this.frames.strokeRoundedRect(x, y, HUD.slotSize, HUD.slotSize, 6);

            if (isEquipped) {
                // Marca de "na mão": um triângulo no canto do slot.
                this.frames.fillStyle(0xf7e7b0, 0.95).fillTriangle(x + 4, y + 4, x + 14, y + 4, x + 4, y + 14);
            }

            if (!slot) {
                this.quantities[index].setText('');
                continue;
            }

            drawItemBlocks(this.icons, slot.id, x + HUD.slotSize / 2, y + HUD.slotSize / 2 + 3, 30);

            // Arma não mostra "x1": o número só existe para quem empilha.
            this.quantities[index].setText(itemDef(slot.id).stackSize > 1 ? `${slot.quantity}` : '');
            this.quantities[index].setPosition(x + HUD.slotSize - 5, y + HUD.slotSize - 3);
        }

        // Contador de moedas ao lado da barra (não ocupa espaço de inventário).
        const coinIconX = startX + barWidth + 18;
        const coinIconY = top + HUD.slotSize / 2;
        drawItemBlocks(this.icons, 'coin', coinIconX, coinIconY, 20);
        this.coinCounter.setPosition(coinIconX + 16, coinIconY);
        this.updateCoinCounter();

        this.itemInfo.setPosition(centerX, top - HUD.selectedLift - 6);
        this.itemInfo.setText(this.describeSelected());
        this.message.setPosition(centerX, top - HUD.selectedLift - 26);
        this.controlsHint.setPosition(centerX, top + HUD.slotSize + 6);
    }

    // Nome do item escolhido e o que o F faz com ele.
    private describeSelected(): string {
        const slot = this.inventory.slotAt(this.selectedIndex);
        if (!slot) {
            return 'Slot vazio';
        }

        const def = itemDef(slot.id);
        const name = def.stackSize > 1 ? `${def.name} x${slot.quantity}` : def.name;

        if (def.kind === 'weapon') {
            return slot.id === this.equippedWeapon ? `${name} (na mão)` : `${name}  ·  F equipar`;
        }
        if (def.kind === 'consumable' && def.healAmount) {
            return `${name}  ·  F usar (+${def.healAmount} vida)`;
        }
        return `${name}  ·  serve para a loja`;
    }

    private updateCoinCounter(): void {
        this.coinCounter.setText(`${this.coins.current}`);
    }
}
