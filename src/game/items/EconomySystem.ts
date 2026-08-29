import { GameObjects, Input, Scene } from 'phaser';

import { LootManager, TargetPosition } from '../loot/LootManager';
import { isShopId } from '../shop/shop-config';
import { ShopPanel } from '../shop/ShopPanel';
import { loadSave, saveProgress } from '../state/save';
import { InventoryHud } from '../ui/InventoryHud';
import { Inventory } from './Inventory';
import { ItemId, ITEMS } from './item-catalog';
import { syncRunInventory } from './run-inventory';

// Fachada de itens/economia para a cena. Game.ts já tem ~1000 linhas: ela
// instancia esta classe e chama dois métodos — todo o resto (inventário, HUD,
// drops, loja, persistência) mora aqui e nos módulos abaixo.
//
// Contrato de eventos (scene.events):
//   escuta  'enemy:died'   -> drops (dentro do LootManager)
//   escuta  'shop:open'    -> abre o painel da loja
//   escuta  'ui:modal'     -> diálogo aberto bloqueia as teclas 1..6
//   emite   'player:heal'  -> poção usada (o Agente A cura)
//   emite   'weapon:equip' -> arma usada (o Agente A troca a arma)
//   emite   'shop:closed' / 'ui:modal'

// De quanto em quanto tempo, no máximo, o inventário é gravado no save. Sem o
// intervalo, uma chuva de 30 moedas escreveria no localStorage 30 vezes no
// mesmo segundo.
const SAVE_FLUSH_MS = 800;

export class EconomySystem {
    readonly inventory: Inventory;

    private readonly hud: InventoryHud;
    private readonly loot: LootManager;
    private readonly shop: ShopPanel;
    private readonly slotKeys: Input.Keyboard.Key[] = [];

    // Diálogo (Agente B) aberto: as teclas do inventário param de responder.
    private externalModalOpen = false;

    private saveDirty = false;
    private nextSaveAt = 0;
    private unsubscribeInventory?: () => void;

    // `target` é só uma posição (x, y): tipo estrutural de propósito, para o
    // sistema de itens não importar a classe Player nem mexer no estado dela —
    // a comunicação com combate e mundo acontece toda por evento.
    constructor(private readonly scene: Scene, private readonly target: TargetPosition) {
        this.inventory = syncRunInventory(scene);

        this.hud = new InventoryHud(scene, this.inventory);
        this.loot = new LootManager(scene, target, this.inventory);
        this.loot.onWarning = message => this.hud.showMessage(message);
        this.shop = new ShopPanel(scene, this.inventory);

        const keyboard = scene.input.keyboard!;
        const codes = [
            Input.Keyboard.KeyCodes.ONE,
            Input.Keyboard.KeyCodes.TWO,
            Input.Keyboard.KeyCodes.THREE,
            Input.Keyboard.KeyCodes.FOUR,
            Input.Keyboard.KeyCodes.FIVE,
            Input.Keyboard.KeyCodes.SIX
        ];
        for (const code of codes) {
            this.slotKeys.push(keyboard.addKey(code));
        }

        // O Inventory vive no registry e sobrevive à cena; sem guardar o
        // cancelamento, cada troca de fase deixaria mais um listener grudado
        // nele apontando para uma cena morta.
        this.unsubscribeInventory = this.inventory.onChange(() => {
            this.saveDirty = true;
        });

        scene.events.on('shop:open', this.handleShopOpen, this);
        scene.events.on('ui:modal', this.handleModal, this);
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
        this.handleSlotKeys();
        this.flushSave();
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

    private handleSlotKeys(): void {
        if (this.externalModalOpen || this.shop.isOpen) {
            return;
        }

        for (let index = 0; index < this.slotKeys.length; index++) {
            if (Input.Keyboard.JustDown(this.slotKeys[index])) {
                this.useSlot(index);
            }
        }
    }

    private useSlot(index: number): void {
        const slot = this.inventory.slotAt(index);
        // Slot vazio é NO-OP silencioso, e isso é deliberado: as teclas 1/2/3
        // também são candidatas às magias do cajado (Agente A), então um aviso
        // aqui apareceria toda vez que o jogador lançasse uma magia.
        if (!slot) {
            return;
        }

        const def = ITEMS[slot.id];
        if (!def.usable) {
            this.hud.showMessage(`${def.name} não se usa — é para vender/gastar`);
            return;
        }

        if (def.kind === 'weapon' && def.weaponId) {
            // Equipar NÃO consome o item: a arma continua no slot.
            this.scene.events.emit('weapon:equip', { weaponId: def.weaponId });
            this.hud.setEquippedWeapon(slot.id as ItemId);
            this.hud.showMessage(`${def.name} equipada`, '#b8cc84');
            return;
        }

        if (def.kind === 'consumable' && def.healAmount) {
            // Vida cheia não gasta a poção. Antes ela sumia do inventário sem
            // curar nada — o jogador aperta a tecla, o item some, e a leitura
            // óbvia é "a poção não funciona".
            const { currentHp, maxHp } = this.target;
            if (currentHp !== undefined && maxHp !== undefined && currentHp >= maxHp) {
                this.hud.showMessage('Vida cheia');
                return;
            }

            // Remove ANTES de emitir: se o Agente A ainda não escuta o evento,
            // o item some do inventário e o efeito não acontece — o contrário
            // (curar e não gastar) seria cura infinita.
            if (!this.inventory.remove(slot.id, 1)) {
                return;
            }

            this.scene.events.emit('player:heal', { amount: def.healAmount });
            this.hud.showMessage(`${def.name} usada (+${def.healAmount})`, '#b8cc84');
        }
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
        this.scene.events.off('shop:open', this.handleShopOpen, this);
        this.scene.events.off('ui:modal', this.handleModal, this);
        this.unsubscribeInventory?.();
        this.unsubscribeInventory = undefined;

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
