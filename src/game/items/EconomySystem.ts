import { GameObjects, Input, Scene } from 'phaser';

import { loadControls } from '../config/controls';
import { LootManager, TargetPosition } from '../loot/LootManager';
import { isShopId } from '../shop/shop-config';
import { ShopPanel } from '../shop/ShopPanel';
import { loadSave, saveProgress } from '../state/save';
import { InventoryHud } from '../ui/InventoryHud';
import { CoinSystem } from './CoinSystem';
import { Inventory, INVENTORY_SLOTS } from './Inventory';
import { isItemId, itemDef } from './item-catalog';
import { syncRunCoins } from './run-coins';
import { syncRunInventory } from './run-inventory';

// Fachada de itens/economia para a cena. Game.ts já tem ~1000 linhas: ela
// instancia esta classe e chama dois métodos — todo o resto (inventário, HUD,
// drops, loja, persistência) mora aqui e nos módulos abaixo.
//
// Controles do inventário (barra de 6 slots no rodapé). Um slot fica
// ESCOLHIDO (destacado) e as ações valem sobre ele:
//   Roda do mouse / Tab   escolhe o slot (C volta)
//   F                     usa o item escolhido (cura consome 1, arma equipa)
//   G                     larga 1 unidade no chão (H larga o slot todo)
//   R                     cura rápida: usa a primeira cura da mochila, sem
//                         precisar escolher — é a tecla do aperto no combate
//   4 / 5 / 6             usam direto os slots 1, 2 e 3
// Todas as teclas acima são as padrão e mudam no menu (config/controls.ts).
// Nenhuma é modificador: o Shift é do dash, e Shift+tecla aqui dava um dash
// junto.
//
// Contrato de eventos (scene.events):
//   escuta  'enemy:died'     -> drops (dentro do LootManager)
//   escuta  'shop:open'      -> abre o painel da loja
//   escuta  'ui:modal'       -> diálogo aberto bloqueia as teclas do inventário
//   escuta  'weapon:changed' -> destaca no HUD a arma equipada
//   emite   'player:heal'    -> cura usada (o Player cura)
//   emite   'weapon:equip'   -> arma usada (o PlayerWeapons troca a arma)
//   emite   'drop:item'      -> item largado (o LootManager cria o pickup)

// De quanto em quanto tempo, no máximo, o inventário é gravado no save. Sem o
// intervalo, uma chuva de 30 moedas escreveria no localStorage 30 vezes no
// mesmo segundo.
const SAVE_FLUSH_MS = 800;

// Trackpad dispara dezenas de eventos de roda por gesto: sem o intervalo, um
// deslize pularia a barra inteira.
const WHEEL_STEP_MS = 90;

type InventoryKeys = {
    next: Input.Keyboard.Key;
    prev: Input.Keyboard.Key;
    use: Input.Keyboard.Key;
    drop: Input.Keyboard.Key;
    dropStack: Input.Keyboard.Key;
    quickHeal: Input.Keyboard.Key;
    // Uso direto dos três primeiros slots.
    slots: Input.Keyboard.Key[];
};

export class EconomySystem {
    readonly inventory: Inventory;
    readonly coins: CoinSystem;

    private readonly hud: InventoryHud;
    private readonly loot: LootManager;
    private readonly shop: ShopPanel;
    private readonly keys: InventoryKeys;

    private selectedIndex = 0;
    private nextWheelAt = 0;

    // Diálogo aberto: as teclas do inventário param de responder.
    private externalModalOpen = false;

    private saveDirty = false;
    private nextSaveAt = 0;
    private unsubscribeInventory?: () => void;
    private unsubscribeCoins?: () => void;

    // `target` é só uma posição (x, y): tipo estrutural de propósito, para o
    // sistema de itens não importar a classe Player nem mexer no estado dela —
    // a comunicação com combate e mundo acontece toda por evento.
    constructor(private readonly scene: Scene, private readonly target: TargetPosition) {
        this.inventory = syncRunInventory(scene);
        this.coins = syncRunCoins(scene, this.inventory);

        this.hud = new InventoryHud(scene, this.inventory, this.coins);
        this.loot = new LootManager(scene, target, this.inventory, this.coins);
        this.loot.onWarning = message => this.hud.showMessage(message);
        this.shop = new ShopPanel(scene, this.inventory, this.coins);

        // O PlayerWeapons nasce com a espada; trocas depois chegam por evento.
        this.hud.setEquippedWeapon('sword');

        const keyboard = scene.input.keyboard!;
        const controls = loadControls();
        this.keys = {
            next: keyboard.addKey(controls.nextSlot),
            prev: keyboard.addKey(controls.prevSlot),
            use: keyboard.addKey(controls.useItem),
            drop: keyboard.addKey(controls.dropItem),
            dropStack: keyboard.addKey(controls.dropStack),
            quickHeal: keyboard.addKey(controls.quickHeal),
            slots: [controls.slot1, controls.slot2, controls.slot3].map(code => keyboard.addKey(code))
        };

        // O Inventory e CoinSystem vivem no registry e sobrevivem à cena; sem guardar o
        // cancelamento, cada troca de fase deixaria mais um listener grudado
        // neles apontando para uma cena morta.
        this.unsubscribeInventory = this.inventory.onChange(() => {
            this.saveDirty = true;
        });
        this.unsubscribeCoins = this.coins.onChange(() => {
            this.saveDirty = true;
        });

        scene.input.on('wheel', this.handleWheel, this);
        scene.events.on('shop:open', this.handleShopOpen, this);
        scene.events.on('ui:modal', this.handleModal, this);
        scene.events.on('weapon:changed', this.handleWeaponChanged, this);
        scene.events.once('shutdown', () => this.shutdown());
    }

    // Repassado para a cena excluir a barra de inventário da captura do reflexo
    // do lago — senão ela aparece espelhada dentro d'água na floresta.
    get hudObjects(): GameObjects.GameObject[] {
        return this.hud.gameObjects;
    }

    // A loja consome TODO o input enquanto está aberta (inclusive ESC, que aqui
    // fecha o painel em vez de pausar). A cena testa isto antes de tudo.
    get isModalOpen(): boolean {
        return this.shop.isOpen;
    }

    updateModal(): void {
        this.shop.update();
    }

    update(): void {
        this.loot.update();
        this.hud.update();
        this.handleInventoryKeys();
        this.flushSave();
    }

    private get inputBlocked(): boolean {
        return this.externalModalOpen || this.shop.isOpen;
    }

    private handleInventoryKeys(): void {
        // Lê TODAS antes do gate: JustDown só zera quando é consultado, então
        // um F apertado com o diálogo aberto dispararia sozinho ao fechar.
        const next = Input.Keyboard.JustDown(this.keys.next);
        const prev = Input.Keyboard.JustDown(this.keys.prev);
        const use = Input.Keyboard.JustDown(this.keys.use);
        const drop = Input.Keyboard.JustDown(this.keys.drop);
        const dropStack = Input.Keyboard.JustDown(this.keys.dropStack);
        const quickHeal = Input.Keyboard.JustDown(this.keys.quickHeal);
        const slotPressed = this.keys.slots.findIndex(key => Input.Keyboard.JustDown(key));

        if (this.inputBlocked) {
            return;
        }

        if (slotPressed >= 0) {
            this.selectSlot(slotPressed);
            this.useSlot(slotPressed);
        }

        if (next) {
            this.selectSlot(this.selectedIndex + 1);
        }
        if (prev) {
            this.selectSlot(this.selectedIndex - 1);
        }
        if (use) {
            this.useSlot(this.selectedIndex);
        }
        if (drop || dropStack) {
            this.dropSlot(this.selectedIndex, dropStack);
        }
        if (quickHeal) {
            this.useQuickHeal();
        }
    }

    private handleWheel(_pointer: unknown, _over: unknown, _dx: number, dy: number): void {
        const now = this.scene.time.now;
        if (this.inputBlocked || dy === 0 || now < this.nextWheelAt) {
            return;
        }

        this.nextWheelAt = now + WHEEL_STEP_MS;
        this.selectSlot(this.selectedIndex + Math.sign(dy));
    }

    private selectSlot(index: number): void {
        this.selectedIndex = (index + INVENTORY_SLOTS) % INVENTORY_SLOTS;
        this.hud.setSelectedSlot(this.selectedIndex);
    }

    private handleShopOpen(payload: unknown): void {
        const shopId = (payload as { shopId?: unknown } | undefined)?.shopId;
        if (!isShopId(shopId)) {
            return;
        }

        this.shop.open(shopId);
    }

    private handleModal(payload: unknown): void {
        this.externalModalOpen = !!(payload as { open?: unknown } | undefined)?.open;
    }

    private handleWeaponChanged(payload: unknown): void {
        const weaponId = (payload as { weaponId?: unknown } | undefined)?.weaponId;
        // Os ids de arma do combate e do catálogo de itens são os mesmos.
        if (isItemId(weaponId)) {
            this.hud.setEquippedWeapon(weaponId);
        }
    }

    private useQuickHeal(): void {
        const index = this.inventory.slots.findIndex(slot => {
            if (!slot) {
                return false;
            }
            const def = itemDef(slot.id);
            return def.kind === 'consumable' && !!def.healAmount;
        });

        if (index < 0) {
            this.hud.showMessage('Sem cura na mochila');
            return;
        }

        this.useSlot(index);
    }

    private useSlot(index: number): void {
        const slot = this.inventory.slotAt(index);
        if (!slot) {
            this.hud.showMessage('Slot vazio');
            return;
        }

        const def = itemDef(slot.id);
        if (!def.usable) {
            this.hud.showMessage(`${def.name} não se usa — serve para a loja`);
            return;
        }

        if (def.kind === 'weapon' && def.weaponId) {
            // Equipar NÃO consome o item: a arma continua no slot. O destaque
            // no HUD vem pelo 'weapon:changed' que o PlayerWeapons emite.
            this.scene.events.emit('weapon:equip', { weaponId: def.weaponId });
            this.hud.showMessage(`${def.name} equipada`, '#b8cc84');
            return;
        }

        if (def.kind === 'consumable' && def.healAmount) {
            // Vida cheia não gasta a cura. Antes ela sumia do inventário sem
            // curar nada — a leitura óbvia era "a poção não funciona".
            const { currentHp, maxHp } = this.target;
            if (currentHp !== undefined && maxHp !== undefined && currentHp >= maxHp) {
                this.hud.showMessage('Vida cheia');
                return;
            }

            // Remove ANTES de emitir: o contrário (curar e não gastar) viraria
            // cura infinita se a remoção falhasse.
            if (!this.inventory.remove(slot.id, 1)) {
                return;
            }

            this.scene.events.emit('player:heal', { amount: def.healAmount });
            this.hud.showMessage(`${def.name} usada (+${def.healAmount} vida)`, '#b8cc84');
        }
    }

    private dropSlot(index: number, wholeStack: boolean): void {
        const slot = this.inventory.slotAt(index);
        if (!slot) {
            this.hud.showMessage('Slot vazio');
            return;
        }

        const quantity = wholeStack ? slot.quantity : 1;
        const { id } = slot;
        if (!this.inventory.remove(id, quantity)) {
            return;
        }

        this.scene.events.emit('drop:item', {
            itemId: id,
            x: this.target.x,
            y: this.target.y,
            quantity
        });

        const label = quantity > 1 ? `${quantity}x ${itemDef(id).name}` : itemDef(id).name;
        this.hud.showMessage(`${label} no chão`, '#f5c542');
    }

    private flushSave(): void {
        if (!this.saveDirty || this.scene.time.now < this.nextSaveAt) {
            return;
        }

        this.saveDirty = false;
        this.nextSaveAt = this.scene.time.now + SAVE_FLUSH_MS;
        saveProgress(this.scene, {});
    }

    private shutdown(): void {
        this.scene.input.off('wheel', this.handleWheel, this);
        this.scene.events.off('shop:open', this.handleShopOpen, this);
        this.scene.events.off('ui:modal', this.handleModal, this);
        this.scene.events.off('weapon:changed', this.handleWeaponChanged, this);
        this.unsubscribeInventory?.();
        this.unsubscribeInventory = undefined;
        this.unsubscribeCoins?.();
        this.unsubscribeCoins = undefined;

        // Última gravação: trocar de fase ou morrer não pode perder o que foi
        // coletado nos últimos milissegundos antes do corte.
        //
        // O `loadSave()` no meio da condição NÃO é redundante: a morte no modo
        // Difícil chama clearSave() e só então troca de cena, e esta gravação
        // acontece depois disso. Sem o teste, o shutdown ressuscitaria o save
        // recém-apagado — com o inventário inteiro dentro dele.
        if (this.saveDirty && loadSave()) {
            saveProgress(this.scene, {});
            this.saveDirty = false;
        }
    }
}
