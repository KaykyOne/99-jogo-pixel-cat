import { GameObjects, Scene } from 'phaser';

import { Inventory, INVENTORY_SLOTS } from '../items/Inventory';
import { drawItemBlocks } from '../items/item-art';
import { ItemId, ITEMS } from '../items/item-catalog';

// Barra fixa de 6 slots no rodapé (Decisão de design #4: barra, não painel que
// abre — um modal a mais concorreria com pausa, mapa, diálogo e loja).
//
// Depth 32: junto do HUD atual (30/31) e abaixo do mapa (100) e da loja (103).
const HUD = {
    depth: 32,
    slotSize: 56,
    gap: 10,
    bottomMargin: 26,
    messageMs: 1800
} as const;

export class InventoryHud {
    private readonly container: GameObjects.Container;
    private readonly frames: GameObjects.Graphics;
    private readonly icons: GameObjects.Graphics;
    private readonly quantities: GameObjects.Text[] = [];
    private readonly slotKeys: GameObjects.Text[] = [];
    private readonly coinCounter: GameObjects.Text;
    private readonly message: GameObjects.Text;

    private equippedWeapon: ItemId | null = null;
    private messageUntil = 0;
    private readonly unsubscribe: () => void;

    constructor(
        private readonly scene: Scene,
        private readonly inventory: Inventory
    ) {
        this.frames = scene.add.graphics();
        this.icons = scene.add.graphics();

        for (let index = 0; index < INVENTORY_SLOTS; index++) {
            this.slotKeys.push(
                scene.add.text(0, 0, `${index + 1}`, {
                    fontFamily: 'monospace',
                    fontSize: '9px',
                    color: '#9db68d'
                })
            );
            this.quantities.push(
                scene.add
                    .text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#f7e7b0' })
                    .setOrigin(1, 1)
            );
        }

        this.coinCounter = scene.add
            .text(0, 0, '0', { fontFamily: 'monospace', fontSize: '14px', color: '#f5c542' })
            .setOrigin(0, 0.5);

        this.message = scene.add
            .text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ff6b6b' })
            .setOrigin(0.5, 1);

        this.container = scene.add
            .container(0, 0, [
                this.frames,
                this.icons,
                ...this.slotKeys,
                ...this.quantities,
                this.coinCounter,
                this.message
            ])
            .setDepth(HUD.depth)
            .setScrollFactor(0);

        // Redesenha SÓ quando o inventário muda, nunca no update() da cena.
        this.unsubscribe = inventory.onChange(() => this.redraw());

        this.scene.scale.on('resize', this.redraw, this);
        this.scene.events.once('shutdown', () => this.destroy());

        this.redraw();
    }

    // Objetos que o reflexo do lago (e qualquer captura de cena) NÃO pode
    // pegar: sem isto a barra de inventário aparece espelhada dentro d'água,
    // do mesmo jeito que o resto do HUD apareceria. É um Container só, então
    // excluir ele exclui os seis slots, os avisos e o contador de moedas.
    get gameObjects(): GameObjects.GameObject[] {
        return [this.container];
    }

    // A arma equipada não sai do inventário; o slot dela ganha uma borda
    // destacada para o jogador saber com o que está batendo sem abrir nada.
    setEquippedWeapon(id: ItemId | null): void {
        this.equippedWeapon = id;
        this.redraw();
    }

    // Aviso curto ("Inventário cheio", "Moedas insuficientes"). Vive acima da
    // barra e some sozinho — quem chama não precisa limpar.
    showMessage(text: string, color = '#ff6b6b'): void {
        this.message.setColor(color);
        this.message.setText(text);
        this.message.setAlpha(1);
        this.messageUntil = this.scene.time.now + HUD.messageMs;
    }

    // Único trabalho por frame: apagar o aviso na hora certa. O desenho da
    // barra continua acontecendo apenas no onChange.
    update(): void {
        if (this.messageUntil === 0 || this.scene.time.now < this.messageUntil) {
            return;
        }

        this.messageUntil = 0;
        this.message.setText('');
    }

    destroy(): void {
        this.unsubscribe();
        this.scene.scale.off('resize', this.redraw, this);
        this.container.destroy(true);
    }

    private redraw(): void {
        const barWidth = INVENTORY_SLOTS * HUD.slotSize + (INVENTORY_SLOTS - 1) * HUD.gap;
        const startX = (this.scene.scale.width - barWidth) / 2;
        const top = this.scene.scale.height - HUD.slotSize - HUD.bottomMargin;

        this.frames.clear();
        this.icons.clear();

        for (let index = 0; index < INVENTORY_SLOTS; index++) {
            const x = startX + index * (HUD.slotSize + HUD.gap);
            const slot = this.inventory.slotAt(index);
            const isEquipped = !!slot && slot.id === this.equippedWeapon;

            // Mesma paleta do HUD atual (createHud em Game.ts).
            this.frames.fillStyle(0x10212b, 0.75).fillRoundedRect(x, top, HUD.slotSize, HUD.slotSize, 6);
            this.frames
                .lineStyle(2, isEquipped ? 0xf7e7b0 : 0xb8cc84, isEquipped ? 0.95 : 0.55)
                .strokeRoundedRect(x, top, HUD.slotSize, HUD.slotSize, 6);

            this.slotKeys[index].setPosition(x + 5, top + 4);

            if (!slot) {
                this.quantities[index].setText('');
                continue;
            }

            drawItemBlocks(this.icons, slot.id, x + HUD.slotSize / 2, top + HUD.slotSize / 2 + 3, 30);

            const def = ITEMS[slot.id];
            // Arma não mostra "x1": o número só existe para quem empilha.
            this.quantities[index].setText(def.stackSize > 1 ? `${slot.quantity}` : '');
            this.quantities[index].setPosition(x + HUD.slotSize - 5, top + HUD.slotSize - 3);
        }

        // Contador de moedas ao lado da barra: as moedas ocupam slot (Decisão
        // #5), mas o total precisa ser legível de relance para a loja fazer
        // sentido sem contar stack por stack.
        const coinIconX = startX + barWidth + 18;
        const coinIconY = top + HUD.slotSize / 2;
        drawItemBlocks(this.icons, 'coin', coinIconX, coinIconY, 20);
        this.coinCounter.setPosition(coinIconX + 16, coinIconY);
        this.coinCounter.setText(`${this.inventory.count('coin')}`);

        this.message.setPosition(this.scene.scale.width / 2, top - 8);
    }
}
