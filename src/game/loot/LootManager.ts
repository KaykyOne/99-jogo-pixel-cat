import { GameObjects, Math as PhaserMath, Scene } from 'phaser';

const { Clamp } = PhaserMath;
const { Distance } = PhaserMath;

import { getDifficultyModifiersFor } from '../config/difficulty';
import { CoinSystem } from '../items/CoinSystem';
import { Inventory } from '../items/Inventory';
import { ItemId, ITEMS, isItemId } from '../items/item-catalog';
import { EnemyDiedInfo, lootTableFor, rollLoot } from './loot-table';
import { Pickup, PICKUP_CONFIG } from './Pickup';

// Item descartado nasce no jogador: fica fora do ímã este tempo, o bastante
// para ele se afastar em vez de recolher o que acabou de largar.
const DROP_PICKUP_DELAY_MS = 1500;

// Posição do jogador. Tipo estrutural de propósito: o loot não precisa (e não
// deve) importar a classe Player, que é de outro agente.
export type TargetPosition = {
    x: number;
    y: number;
    // Caixa de colisão do jogador. Estrutural de propósito (o Arcade Body já
    // tem estes quatro campos), para o loot continuar sem importar Player.
    // Sem ela a coleta cai no centro do sprite, que fica alto demais.
    body?: { left: number; right: number; top: number; bottom: number } | null;
    // Vida atual/máxima, pelo mesmo motivo: a poção não pode ser gasta com a
    // vida cheia.
    currentHp?: number;
    maxHp?: number;
};

// Dono da lista de itens caídos da fase. A cena só instancia e chama update() —
// uma linha, não quarenta.
//
// ARMADILHA conhecida: pickups NÃO podem entrar no array `enemies` da cena. O
// teste de fase limpa é `enemies.every(e => !e.isAlive)`; um pickup ali dentro
// tranca o portal para sempre.
export class LootManager {
    private readonly pickups: Pickup[] = [];
    private readonly solids: GameObjects.GameObject[];
    private readonly lootMultiplier: number;

    // Aviso curto para o HUD ("Inventário cheio"), sem o loot conhecer a UI.
    onWarning?: (message: string) => void;

    constructor(
        private readonly scene: Scene,
        private readonly target: TargetPosition,
        private readonly inventory: Inventory,
        private readonly coins: CoinSystem
    ) {
        this.lootMultiplier = getDifficultyModifiersFor(scene).lootQuantity;

        // Os mesmos corpos estáticos com que o jogador colide. Lidos do mundo
        // (e não recebidos da cena) para o LootManager não obrigar Game.ts a
        // exportar a lista de colliders — quanto menos o arquivo compartilhado
        // souber do loot, melhor.
        this.solids = Array.from(scene.physics.world.staticBodies)
            .map(body => body.gameObject)
            .filter((object): object is GameObjects.GameObject => !!object)
            .filter(object => (object.getData('platformDef') as { oneWay?: boolean } | undefined)?.oneWay !== true);

        // Entrada de drops: contrato de eventos com o Agente A. Escutar em
        // scene.events (e não no inimigo) é o que permite ao loot funcionar sem
        // segurar referência a um objeto que já está a caminho do destroy().
        this.scene.events.on('enemy:died', this.handleEnemyDied, this);
        this.scene.events.on('drop:item', this.handleDropItem, this);
        this.scene.events.once('shutdown', () => this.destroyAll());
    }

    // Rola a tabela e cria o item caído. Público para permitir teste manual e
    // para que qualquer sistema possa premiar o jogador com um drop.
    dropFrom(info: EnemyDiedInfo): void {
        const table = lootTableFor(info.type, info.isBoss);
        const roll = rollLoot(table, this.lootMultiplier);
        if (!roll) {
            return;
        }

        this.spawn(roll.id, roll.quantity, info.x, info.y);
    }

    spawn(id: ItemId, quantity: number, x: number, y: number): Pickup {
        const pickup = new Pickup(this.scene, x, y, id, quantity);
        this.scene.physics.add.collider(pickup, this.solids);
        this.pickups.push(pickup);
        return pickup;
    }

    // Ímã + coleta. Percorre de trás para frente porque a coleta remove da
    // lista durante a própria varredura.
    update(): void {
        const time = this.scene.time.now;

        for (let index = this.pickups.length - 1; index >= 0; index--) {
            const pickup = this.pickups[index];

            if (!pickup.active) {
                this.pickups.splice(index, 1);
                continue;
            }

            if (!pickup.updateTowards(this.target.x, this.target.y, time, this.distanceTo(pickup))) {
                continue;
            }

            this.collect(pickup, index);
        }
    }

    destroyAll(): void {
        this.scene.events.off('enemy:died', this.handleEnemyDied, this);
        this.scene.events.off('drop:item', this.handleDropItem, this);

        for (const pickup of this.pickups) {
            pickup.destroy();
        }
        this.pickups.length = 0;
    }

    // Distância do item até o CORPO do jogador (ponto mais próximo da caixa), e
    // não até o centro dele. É a diferença entre "encostou, pegou" e o item que
    // nunca era coletado: o jogador em pé tem o centro ~60px acima do chão, e
    // o item parado no chão nascia sempre fora do alcance.
    private distanceTo(pickup: Pickup): number {
        const body = this.target.body;
        if (!body) {
            return Distance.Between(pickup.x, pickup.y, this.target.x, this.target.y);
        }

        const nearestX = Clamp(pickup.x, body.left, body.right);
        const nearestY = Clamp(pickup.y, body.top, body.bottom);
        return Distance.Between(pickup.x, pickup.y, nearestX, nearestY);
    }

    private handleEnemyDied(info: EnemyDiedInfo): void {
        if (!info || typeof info.x !== 'number' || typeof info.y !== 'number') {
            return;
        }

        this.dropFrom(info);
    }

    private handleDropItem(payload: unknown): void {
        if (!payload || typeof payload !== 'object') {
            return;
        }

        const data = payload as { itemId?: unknown; x?: unknown; y?: unknown; quantity?: unknown };
        if (!isItemId(data.itemId) || typeof data.x !== 'number' || typeof data.y !== 'number') {
            return;
        }

        const quantity = typeof data.quantity === 'number' ? data.quantity : 1;
        this.spawn(data.itemId, quantity, data.x, data.y).blockCollection(DROP_PICKUP_DELAY_MS);
    }

    private collect(pickup: Pickup, index: number): void {
        // Moedas não ocupam espaço: vão direto para o CoinSystem.
        let leftover = 0;
        if (pickup.itemId === 'coin') {
            this.coins.add(pickup.amount);
        } else {
            leftover = this.inventory.add(pickup.itemId, pickup.amount);
        }

        if (leftover >= pickup.amount) {
            // Nada coube: o item CONTINUA no chão, com a quantidade intacta.
            pickup.rejectCollection(this.target.x);
            this.onWarning?.(`Inventário cheio (${ITEMS[pickup.itemId].name})`);
            return;
        }

        if (leftover > 0) {
            // Coube parte: o resto fica no chão, e o objeto é reaproveitado em
            // vez de destruído e recriado.
            pickup.setQuantity(leftover);
            pickup.rejectCollection(this.target.x);
            this.onWarning?.('Inventário cheio — sobrou item no chão');
            return;
        }

        pickup.markCollected();
        this.playCollectFeedback(pickup);
        pickup.destroy();
        this.pickups.splice(index, 1);
    }

    // Faísca de coleta: um círculo na cor do item que cresce e some. Barato, e
    // é o que confirma ao jogador que o item entrou no inventário.
    private playCollectFeedback(pickup: Pickup): void {
        const spark = this.scene.add
            .circle(pickup.x, pickup.y, 10, ITEMS[pickup.itemId].color, 0.5)
            .setDepth(PICKUP_CONFIG.depth);

        this.scene.tweens.add({
            targets: spark,
            scale: 2.2,
            alpha: 0,
            duration: 220,
            ease: 'Quad.out',
            onComplete: () => spark.destroy()
        });
    }
}
