import { GameObjects, Input, Scene } from 'phaser';

import { getDifficultyModifiersFor } from '../config/difficulty';
import { CoinSystem } from '../items/CoinSystem';
import { Inventory } from '../items/Inventory';
import { drawItemBlocks } from '../items/item-art';
import { ITEMS } from '../items/item-catalog';
import { ShopDef, ShopEntry, ShopId, SHOPS } from './shop-config';
import { effectivePrice, executeTransaction } from './transaction';

// Painel da loja. Herda a linguagem visual do resto da UI (mesma paleta, mesmo
// arredondamento) e vive no depth 103, acima da pausa (101/102).
//
// SEM MOUSE, de propósito: o resto do jogo é teclado, e misturar os dois é pior
// que escolher um. Setas ou W/S escolhem, E confirma, ESC fecha.
const PANEL = {
    depth: 103,
    width: 560,
    height: 276,
    rowHeight: 38,
    messageMs: 1500
} as const;

export class ShopPanel {
    private readonly container: GameObjects.Container;
    private readonly panel: GameObjects.Graphics;
    private readonly selection: GameObjects.Graphics;
    private readonly icons: GameObjects.Graphics;
    private readonly title: GameObjects.Text;
    private readonly coinText: GameObjects.Text;
    private readonly greeting: GameObjects.Text;
    private readonly hint: GameObjects.Text;
    private readonly message: GameObjects.Text;
    private rows: GameObjects.Text[] = [];

    private readonly keys: Record<'up' | 'down' | 'altUp' | 'altDown' | 'confirm' | 'close', Input.Keyboard.Key>;

    private shop: ShopDef | null = null;
    private selectedIndex = 0;
    private messageUntil = 0;
    private unsubscribeInventory?: () => void;

    // Quem abre um modal é quem emite 'ui:modal'. A cena escuta para desligar
    // os controles do jogador, e o inventário escuta para não consumir 1..6.
    constructor(
        private readonly scene: Scene,
        private readonly inventory: Inventory,
        private readonly coins: CoinSystem
    ) {
        this.panel = scene.add.graphics();
        this.selection = scene.add.graphics();
        this.icons = scene.add.graphics();

        this.title = scene.add
            .text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '19px', color: '#f7e7b0' });
        this.coinText = scene.add
            .text(0, 0, '', { fontFamily: 'monospace', fontSize: '14px', color: '#f5c542' })
            .setOrigin(1, 0);
        this.greeting = scene.add
            .text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#9db68d' });
        this.message = scene.add
            .text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ff6b6b' });
        this.hint = scene.add
            .text(0, 0, 'W/S ou setas escolher  ·  E confirmar  ·  ESC sair', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#b9cbb1'
            });

        this.container = scene.add
            .container(0, 0, [
                this.panel,
                this.selection,
                this.icons,
                this.title,
                this.coinText,
                this.greeting,
                this.message,
                this.hint
            ])
            .setDepth(PANEL.depth)
            .setScrollFactor(0)
            .setVisible(false);

        const keyboard = scene.input.keyboard!;
        // addKey devolve a MESMA Key quando ela já existe na cena (ESC é do
        // pause, W/S são do jogador). Isso é o desejado: o painel roda antes da
        // cena no update e consome o JustDown, então ESC fecha a loja em vez de
        // pausar por baixo dela.
        this.keys = {
            up: keyboard.addKey(Input.Keyboard.KeyCodes.UP),
            down: keyboard.addKey(Input.Keyboard.KeyCodes.DOWN),
            altUp: keyboard.addKey(Input.Keyboard.KeyCodes.W),
            altDown: keyboard.addKey(Input.Keyboard.KeyCodes.S),
            confirm: keyboard.addKey(Input.Keyboard.KeyCodes.E),
            close: keyboard.addKey(Input.Keyboard.KeyCodes.ESC)
        };

        this.scene.scale.on('resize', this.layout, this);
        this.scene.events.once('shutdown', () => this.destroy());
    }

    get isOpen(): boolean {
        return this.shop !== null;
    }

    open(shopId: ShopId): void {
        if (this.isOpen) {
            return;
        }

        this.shop = SHOPS[shopId];
        this.selectedIndex = 0;
        this.messageUntil = 0;
        this.message.setText('');

        this.buildRows();
        this.container.setVisible(true);
        this.layout();

        // O saldo no cabeçalho tem que acompanhar cada transação sem o painel
        // reler o inventário todo frame.
        this.unsubscribeInventory = this.inventory.onChange(() => this.refreshTexts());

        this.scene.events.emit('ui:modal', { open: true });
    }

    close(): void {
        if (!this.isOpen) {
            return;
        }

        this.shop = null;
        this.container.setVisible(false);
        this.unsubscribeInventory?.();
        this.unsubscribeInventory = undefined;

        this.scene.events.emit('shop:closed');
        this.scene.events.emit('ui:modal', { open: false });
    }

    // Chamado pela cena ANTES de qualquer outro input enquanto isOpen for true.
    update(): void {
        if (!this.shop) {
            return;
        }

        if (this.messageUntil > 0 && this.scene.time.now >= this.messageUntil) {
            this.messageUntil = 0;
            this.message.setText('');
        }

        if (Input.Keyboard.JustDown(this.keys.close)) {
            this.close();
            return;
        }

        const rowCount = this.shop.entries.length;
        if (rowCount > 1) {
            if (Input.Keyboard.JustDown(this.keys.up) || Input.Keyboard.JustDown(this.keys.altUp)) {
                this.selectedIndex = (this.selectedIndex - 1 + rowCount) % rowCount;
                this.layout();
            } else if (Input.Keyboard.JustDown(this.keys.down) || Input.Keyboard.JustDown(this.keys.altDown)) {
                this.selectedIndex = (this.selectedIndex + 1) % rowCount;
                this.layout();
            }
        }

        if (Input.Keyboard.JustDown(this.keys.confirm)) {
            this.confirm();
        }
    }

    destroy(): void {
        this.scene.scale.off('resize', this.layout, this);
        this.unsubscribeInventory?.();
        this.container.destroy(true);
    }

    private confirm(): void {
        const entry = this.shop?.entries[this.selectedIndex];
        if (!entry) {
            return;
        }

        const result = executeTransaction(this.inventory, this.coins, entry, getDifficultyModifiersFor(this.scene));

        // Falha nunca é silenciosa: a recusa aparece escrita, e nada é perdido.
        this.message.setColor(result.ok ? '#b8cc84' : '#ff6b6b');
        this.message.setText(result.message);
        this.messageUntil = this.scene.time.now + PANEL.messageMs;

        this.refreshTexts();
    }

    private buildRows(): void {
        for (const row of this.rows) {
            row.destroy();
        }
        this.rows = [];

        for (const entry of this.shop?.entries ?? []) {
            const text = this.scene.add.text(0, 0, this.rowLabel(entry), {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#e8e4dc'
            });
            this.rows.push(text);
            this.container.add(text);
        }
    }

    private rowLabel(entry: ShopEntry): string {
        const price = effectivePrice(entry, getDifficultyModifiersFor(this.scene));
        const name = ITEMS[entry.item].name;

        if (entry.mode === 'buy') {
            return `${name} x${entry.quantity}   —   ${price} moedas   [comprar]`;
        }

        return `${name} x${entry.lot}   —   ${price} moeda(s)   [vender]`;
    }

    private refreshTexts(): void {
        this.coinText.setText(`${this.coins.current} moedas`);
        this.rows.forEach((row, index) => {
            const entry = this.shop?.entries[index];
            if (entry) {
                row.setText(this.rowLabel(entry));
            }
        });
    }

    private layout(): void {
        if (!this.shop) {
            return;
        }

        const left = (this.scene.scale.width - PANEL.width) / 2;
        const top = Math.max(60, (this.scene.scale.height - PANEL.height) / 2);

        this.panel.clear();
        this.panel.fillStyle(0x08111d, 0.94).fillRoundedRect(left, top, PANEL.width, PANEL.height, 14);
        this.panel.lineStyle(2, 0xb8cc84, 0.85).strokeRoundedRect(left, top, PANEL.width, PANEL.height, 14);
        // Separadores do cabeçalho e do rodapé.
        this.panel.lineStyle(1, 0xb8cc84, 0.35);
        this.panel.lineBetween(left + 18, top + 78, left + PANEL.width - 18, top + 78);
        this.panel.lineBetween(left + 18, top + PANEL.height - 44, left + PANEL.width - 18, top + PANEL.height - 44);

        this.title.setPosition(left + 24, top + 22);
        this.title.setText(this.shop.name);

        // Ícone de moeda por blocos ao lado do saldo (sem asset).
        this.icons.clear();
        drawItemBlocks(this.icons, 'coin', left + PANEL.width - 24 - 108, top + 32, 18);
        this.coinText.setPosition(left + PANEL.width - 24, top + 24);

        this.greeting.setPosition(left + 24, top + 50);
        this.greeting.setText(this.shop.greeting);

        const rowsTop = top + 94;
        this.selection.clear();
        this.rows.forEach((row, index) => {
            const y = rowsTop + index * PANEL.rowHeight;
            row.setPosition(left + 46, y + 9);
            row.setColor(index === this.selectedIndex ? '#f7e7b0' : '#e8e4dc');

            if (index === this.selectedIndex) {
                // Mesmo destaque dos botões do menu.
                this.selection
                    .fillStyle(0x294b35, 1)
                    .fillRoundedRect(left + 20, y, PANEL.width - 40, PANEL.rowHeight - 6, 6);
                this.selection
                    .fillStyle(0xf7e7b0, 1)
                    .fillTriangle(left + 30, y + 10, left + 30, y + 22, left + 39, y + 16);
            }
        });

        this.message.setPosition(left + 24, top + PANEL.height - 74);
        this.hint.setPosition(left + 24, top + PANEL.height - 32);

        this.refreshTexts();
    }
}
