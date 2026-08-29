import { GameObjects, Math as PhaserMath, Physics, Scene, Time, Tweens } from 'phaser';

import { ensureItemTexture } from '../items/item-art';
import { ItemId, ITEMS } from '../items/item-catalog';

// Todo número do item caído no chão mora aqui: alcance do ímã, tempo de vida,
// força do pop. Ajustar a sensação da coleta é mexer nesta tabela, não na
// classe.
export const PICKUP_CONFIG = {
    depth: 12,
    // Lado do sprite gerado a partir da arte por blocos do item.
    size: 24,

    // "Pop" inicial: o item salta do corpo de quem morreu em vez de aparecer
    // parado no chão. É o que faz a morte render alguma coisa visualmente.
    popVelocityX: 130,
    popVelocityYMin: -280,
    popVelocityYMax: -190,
    // Quique curto: dois toques no chão e assenta.
    bounce: 0.38,
    dragX: 180,

    // Ímã suave nos últimos 60px (pedido do usuário): sem isso o jogador teria
    // que pisar em cima de cada item, o que é irritante num drop de 30 moedas.
    magnetRange: 60,
    // Fração da distância percorrida por frame enquanto o ímã atua.
    magnetLerp: 0.18,
    collectRange: 18,

    // Some depois de alguns segundos para não acumular objeto no chão de uma
    // fase longa; os últimos segundos piscam para avisar.
    lifespanMs: 12000,
    blinkMs: 3500,
    blinkIntervalMs: 160,

    // Brilho pulsante atrás do item, na cor dele.
    glowRadius: 15,
    glowAlpha: 0.32,
    pulseMs: 900,

    // Depois de uma coleta recusada (inventário cheio) o item para de ser
    // atraído por um instante, senão ele tentaria de novo a cada frame,
    // grudado no jogador, cuspindo o aviso sem parar.
    rejectCooldownMs: 1200
} as const;

export class Pickup extends Physics.Arcade.Sprite {
    readonly itemId: ItemId;

    private quantity: number;
    private readonly label: GameObjects.Text;
    private readonly glow: GameObjects.Arc;
    private readonly pulseTween: Tweens.Tween;
    private blinkEvent?: Time.TimerEvent;
    private expireEvent?: Time.TimerEvent;
    private magnetBlockedUntil = 0;
    private collected = false;

    constructor(scene: Scene, x: number, y: number, itemId: ItemId, quantity: number) {
        super(scene, x, y, ensureItemTexture(scene, itemId, PICKUP_CONFIG.size));

        this.itemId = itemId;
        this.quantity = quantity;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setDepth(PICKUP_CONFIG.depth);

        const body = this.body as Physics.Arcade.Body;
        body.setBounce(0, PICKUP_CONFIG.bounce);
        body.setDragX(PICKUP_CONFIG.dragX);
        body.setCollideWorldBounds(true);
        body.setVelocity(
            PhaserMath.Between(-PICKUP_CONFIG.popVelocityX, PICKUP_CONFIG.popVelocityX),
            PhaserMath.Between(PICKUP_CONFIG.popVelocityYMin, PICKUP_CONFIG.popVelocityYMax)
        );

        this.glow = scene.add
            .circle(x, y, PICKUP_CONFIG.glowRadius, ITEMS[itemId].color, PICKUP_CONFIG.glowAlpha)
            .setDepth(PICKUP_CONFIG.depth - 1);

        this.label = scene.add
            .text(x, y - 18, '', { fontFamily: 'monospace', fontSize: '11px', color: '#f7e7b0' })
            .setOrigin(0.5, 1)
            .setDepth(PICKUP_CONFIG.depth);
        this.refreshLabel();

        // Pulsa o brilho, não o item: o sprite é a leitura do que caiu, e vê-lo
        // mudando de tamanho o tempo todo atrapalha reconhecer moeda de maçã.
        this.pulseTween = scene.tweens.add({
            targets: this.glow,
            scale: 1.35,
            alpha: PICKUP_CONFIG.glowAlpha * 0.45,
            duration: PICKUP_CONFIG.pulseMs,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });

        this.expireEvent = scene.time.delayedCall(PICKUP_CONFIG.lifespanMs, () => this.destroy());
        this.blinkEvent = scene.time.delayedCall(
            Math.max(0, PICKUP_CONFIG.lifespanMs - PICKUP_CONFIG.blinkMs),
            () => this.startBlinking()
        );
    }

    get amount(): number {
        return this.quantity;
    }

    // Empilha no MESMO objeto em vez de spawnar 17 moedas: um drop grande não
    // pode custar 17 sprites e 17 corpos físicos.
    setQuantity(quantity: number): void {
        this.quantity = quantity;
        this.refreshLabel();
    }

    // Chamado quando o inventário recusou (cheio): dá um pulinho para trás e
    // segura o ímã por um instante.
    rejectCollection(playerX: number): void {
        this.magnetBlockedUntil = this.scene.time.now + PICKUP_CONFIG.rejectCooldownMs;

        const body = this.body as Physics.Arcade.Body;
        body.setAllowGravity(true);
        body.setVelocity(playerX <= this.x ? 90 : -90, -140);
    }

    // Retorna true quando o jogador está perto o bastante para coletar.
    // O ímã acontece aqui: a aproximação final é interpolada, não física.
    //
    // `distance` vem PRONTA do LootManager, medida até o CORPO do jogador e não
    // até o centro dele. Medir até o centro era o bug que impedia a coleta: um
    // item parado no chão fica ~60px abaixo do centro do jogador em pé, ou
    // seja, na distância exata do alcance do ímã — dava para pisar em cima da
    // maçã a vida inteira sem nunca pegá-la.
    updateTowards(playerX: number, playerY: number, time: number, distance: number): boolean {
        if (this.collected || !this.active) {
            return false;
        }

        this.glow.setPosition(this.x, this.y);
        this.label.setPosition(this.x, this.y - 18);

        if (distance <= PICKUP_CONFIG.collectRange) {
            return true;
        }

        const body = this.body as Physics.Arcade.Body;

        if (distance > PICKUP_CONFIG.magnetRange || time < this.magnetBlockedUntil) {
            // Saiu do alcance: devolve a gravidade. Sem isto, um item que foi
            // atraído e ficou para trás continuaria boiando no ar para sempre.
            if (!body.allowGravity) {
                body.setAllowGravity(true);
            }
            return false;
        }

        // Enquanto o ímã atua o corpo para de cair: gravidade e interpolação
        // disputando o mesmo eixo fazem o item tremer no chão.
        body.setAllowGravity(false);
        body.setVelocity(0, 0);

        this.setPosition(
            PhaserMath.Linear(this.x, playerX, PICKUP_CONFIG.magnetLerp),
            PhaserMath.Linear(this.y, playerY, PICKUP_CONFIG.magnetLerp)
        );

        return false;
    }

    markCollected(): void {
        this.collected = true;
    }

    destroy(fromScene?: boolean): void {
        // Tween com repeat: -1 e TimerEvents pendentes são vazamento clássico:
        // sem isto, cada respawn de fase deixaria um pulso vivo para sempre.
        this.pulseTween?.remove();
        this.blinkEvent?.remove();
        this.expireEvent?.remove();
        this.scene?.tweens.killTweensOf(this);
        this.glow?.destroy();
        this.label?.destroy();

        super.destroy(fromScene);
    }

    private startBlinking(): void {
        this.blinkEvent = this.scene.time.addEvent({
            delay: PICKUP_CONFIG.blinkIntervalMs,
            loop: true,
            callback: () => {
                this.setAlpha(this.alpha < 1 ? 1 : 0.25);
                this.label.setAlpha(this.alpha);
            }
        });
    }

    private refreshLabel(): void {
        this.label.setText(this.quantity > 1 ? `x${this.quantity}` : '');
    }
}
