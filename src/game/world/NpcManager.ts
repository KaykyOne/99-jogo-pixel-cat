import { Input, Physics, Scene } from 'phaser';

import { loadControls } from '../config/controls';
import { Npc } from '../entities/Npc';
import { Player } from '../entities/Player';
import { DialogueBox, DialogueRequest } from '../ui/DialogueBox';
import { INTERACT_RANGE, NpcDef } from './npc-config';

// Cola entre os NPCs, o diálogo e o resto do jogo. Existe para a cena não
// crescer: PhaseScene instancia, chama update() e lê isModalOpen — três
// linhas, não quarenta (mesma ideia do LootManager do plano).
//
// CONTRATO DE EVENTOS (scene.events), combinado com os outros dois agentes:
//   emite 'ui:modal'  { open }  -> combate e inventário travam o próprio input
//   emite 'shop:open' { shopId } -> a loja (Agente C) monta o painel
//   escuta 'shop:closed'        -> devolve o controle ao jogador
export class NpcManager {
    private scene: Scene;
    private player: Player;
    private npcs: Npc[] = [];
    private dialogue: DialogueBox;
    private interactKey: Input.Keyboard.Key;

    private nearest: Npc | null = null;
    // Verdadeiro entre disparar 'shop:open' e receber 'shop:closed': o jogador
    // continua travado enquanto o painel da loja estiver na tela.
    private shopOpen = false;

    constructor(scene: Scene, player: Player, defs: NpcDef[]) {
        this.scene = scene;
        this.player = player;
        this.dialogue = new DialogueBox(scene);
        this.interactKey = scene.input.keyboard!.addKey(loadControls().interact);

        for (const def of defs) {
            this.npcs.push(new Npc(scene, def));
        }

        scene.events.on('shop:closed', this.handleShopClosed, this);
    }

    // Enquanto isto for verdadeiro, a cena entrega TODO o input para cá e não
    // roda mais nada — nem pausa, nem mapa, nem jogador (ver Etapa 5.6).
    get isModalOpen(): boolean {
        return this.dialogue.isOpen || this.shopOpen;
    }

    update(): void {
        if (this.dialogue.isOpen) {
            this.dialogue.update();
            return;
        }

        if (this.shopOpen) {
            // A loja é do Agente C e tem o próprio input; aqui só se espera.
            return;
        }

        this.updateNearest();

        if (this.nearest && Input.Keyboard.JustDown(this.interactKey)) {
            this.openDialogue(this.nearest);
        }
    }

    // Diálogo sem NPC (fala de boss). Usa a mesma trava de modal da conversa:
    // enquanto estiver aberto, a cena para de rodar o mundo.
    openScripted(request: DialogueRequest, onClose: () => void): void {
        if (this.isModalOpen) {
            onClose();
            return;
        }

        this.nearest?.setPromptVisible(false);
        this.nearest = null;

        this.setModal(true);
        this.dialogue.open(request, () => {
            this.setModal(false);
            onClose();
        });
    }

    destroy(): void {
        this.scene.events.off('shop:closed', this.handleShopClosed, this);

        for (const npc of this.npcs) {
            npc.destroy();
        }
        this.npcs = [];
        this.nearest = null;

        this.dialogue.destroy();
    }

    // UM NPC POR VEZ: com dois no alcance, só o mais próximo mostra o ícone —
    // dois "E" na tela não dizem qual deles responde à tecla.
    private updateNearest(): void {
        let closest: Npc | null = null;
        let closestDistance = INTERACT_RANGE;

        for (const npc of this.npcs) {
            const distance = npc.distanceTo(this.player.x, this.player.y);
            if (distance <= closestDistance) {
                closest = npc;
                closestDistance = distance;
            }
        }

        if (closest === this.nearest) {
            return;
        }

        this.nearest?.setPromptVisible(false);
        closest?.setPromptVisible(true);
        this.nearest = closest;
    }

    private openDialogue(npc: Npc): void {
        // O ícone some ao abrir: quem está lendo a fala já sabe com quem fala.
        npc.setPromptVisible(false);
        this.nearest = null;

        const shopId = npc.def.shopId;
        // Só oferece "Negociar" se existir de fato alguém ouvindo 'shop:open'.
        // Sem esta checagem, com a loja ainda não implementada, o jogador
        // escolheria a opção e ficaria travado esperando um 'shop:closed' que
        // nunca chega.
        const shopReady = !!shopId && this.scene.events.listenerCount('shop:open') > 0;

        this.setModal(true);
        this.dialogue.open(
            {
                speaker: npc.def.name,
                lines: shopId && !shopReady
                    ? [...npc.def.lines, 'Hoje a banca tá fechada. Volta depois que eu arrumo o estoque.']
                    : npc.def.lines,
                options: shopReady
                    ? [
                        { label: 'Negociar', value: 'shop' },
                        { label: 'Fica pra próxima', value: 'leave' }
                    ]
                    : undefined
            },
            value => this.handleDialogueResult(value, shopId)
        );
    }

    private handleDialogueResult(value: string | null, shopId?: string): void {
        if (value === 'shop' && shopId) {
            // O modal continua aberto: a loja assume a vez sem devolver o
            // controle ao jogador no meio do caminho.
            this.shopOpen = true;
            this.scene.events.emit('shop:open', { shopId });
            return;
        }

        this.setModal(false);
    }

    private handleShopClosed(): void {
        if (!this.shopOpen) {
            return;
        }

        this.shopOpen = false;
        this.setModal(false);
    }

    private setModal(open: boolean): void {
        this.player.setControlsEnabled(!open);

        if (open) {
            // setControlsEnabled(false) zera a velocidade a cada update — mas
            // a cena para de chamar player.update() enquanto o modal está
            // aberto, então o zero tem que ser dado aqui, uma vez. E a
            // animação não para sozinha: sem tocar o idle, o jogador conversa
            // congelado no meio de uma passada.
            (this.player.body as Physics.Arcade.Body).setVelocity(0, 0);
            this.player.play('player-idle', true);
        }

        this.scene.events.emit('ui:modal', { open });
    }
}
