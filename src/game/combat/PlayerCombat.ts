import { Physics } from 'phaser';

import { randomAttackAnimationKey } from './attack-variants';
import { MeleeHitbox } from './MeleeHitbox';
import { AttackDefinition } from './types';
import { WeaponDefinition } from './weapons';

// Componente de combate corpo-a-corpo do jogador. Desacopla todo o ataque da
// entidade Player: o Player delega a intenção e este componente controla
// cooldown, combo, animação e o ciclo de vida da hitbox temporal.
//
// A hitbox só existe nos frames ativos definidos no catálogo. Quem detecta o
// impacto é a cena, via overlap com a hitbox.
export class PlayerCombat {
    private activeAttack: AttackDefinition | null = null;
    // Guardada para poder remover o listener de 'animationcomplete' em cancel().
    private activeAnimationKey = '';
    private hitTargets = new Set<Physics.Arcade.Sprite>();
    private activeHitbox: MeleeHitbox | null = null;

    private cooldownUntil = 0;

    // --- Estado do combo ----------------------------------------------------
    // Índice do PRÓXIMO golpe da sequência. Zera quando a janela de
    // encadeamento expira ou quando o finalizador sai.
    private comboIndex = 0;
    private comboExpiresAt = 0;
    // Arma que iniciou a sequência: trocar de arma no meio dela recomeça o
    // combo, senão o segundo golpe da espada sairia depois de uma flechada.
    private comboWeaponId = '';

    // Só encadeia DEPOIS da janela de impacto do golpe atual. Antes disso, o
    // encadeamento cancelaria a própria hitbox e o combo daria menos dano que
    // três golpes soltos.
    private passedActiveWindow = false;

    constructor(
        private scene: Phaser.Scene,
        private owner: Physics.Arcade.Sprite
    ) {}

    get isAttacking(): boolean {
        return this.activeAttack !== null;
    }

    get activeHitboxGameObject(): MeleeHitbox | null {
        return this.activeHitbox;
    }

    get activeAttackDefinition(): AttackDefinition | null {
        return this.activeAttack;
    }

    canAttack(now: number): boolean {
        return this.activeAttack === null && now >= this.cooldownUntil;
    }

    // Verdadeiro quando o golpe em andamento já passou do instante de impacto e
    // pode ser cortado pelo próximo da sequência. É este cancelamento do fim da
    // animação que faz o combo parecer fluido em vez de três golpes esperando
    // cada um terminar por inteiro.
    canChain(weapon: WeaponDefinition): boolean {
        if (!this.activeAttack || !this.passedActiveWindow) {
            return false;
        }

        if (this.comboWeaponId !== weapon.id) {
            return false;
        }

        // O finalizador (comboWindowMs 0) não encadeia em mais nada.
        const combo = weapon.combo ?? [];
        return (this.activeAttack.comboWindowMs ?? 0) > 0 && this.comboIndex < combo.length;
    }

    // Executa o golpe seguinte da sequência da arma. Retorna o golpe iniciado,
    // ou null se a arma não tem combo.
    swing(now: number, weapon: WeaponDefinition): AttackDefinition | null {
        const combo = weapon.combo;
        if (!combo || combo.length === 0) {
            return null;
        }

        // Sequência morta (janela expirou ou trocou de arma) recomeça do golpe 1.
        if (now > this.comboExpiresAt || this.comboWeaponId !== weapon.id) {
            this.comboIndex = 0;
        }

        const definition = combo[Math.min(this.comboIndex, combo.length - 1)];
        this.comboWeaponId = weapon.id;
        this.comboIndex = (this.comboIndex + 1) % combo.length;

        this.beginAttack(definition);
        return definition;
    }

    // Corta o golpe atual e emenda o próximo, sem esperar a animação terminar.
    chain(now: number, weapon: WeaponDefinition): AttackDefinition | null {
        if (!this.activeAttack) {
            return null;
        }

        this.owner.off('animationcomplete-' + this.activeAnimationKey);
        this.destroyHitbox();
        this.activeAttack = null;

        return this.swing(now, weapon);
    }

    // Avança o estado do golpe. Chamado a cada frame pelo Player, que informa o
    // frame atual da animação para saber quando criar/encerrar a hitbox.
    update(currentAnimFrame: number | null): void {
        if (!this.activeAttack) {
            return;
        }

        const { activeStartFrame, activeEndFrame } = this.activeAttack.hitbox;

        if (currentAnimFrame !== null) {
            const inActiveWindow =
                currentAnimFrame >= activeStartFrame && currentAnimFrame <= activeEndFrame;

            if (inActiveWindow && !this.activeHitbox) {
                this.spawnHitbox();
            } else if (!inActiveWindow && this.activeHitbox) {
                this.destroyHitbox();
                this.passedActiveWindow = true;
            }

            // O último frame do golpe também libera o encadeamento: numa
            // animação em que a janela ativa vai até o fim, a hitbox só é
            // destruída no endAttack e o combo nunca abriria.
            if (currentAnimFrame >= activeEndFrame) {
                this.passedActiveWindow = true;
            }
        }

        // Re-posiciona a hitbox caso ainda exista (segue o dono).
        if (this.activeHitbox) {
            this.activeHitbox.follow(this.owner);
        }
    }

    // Encerra o golpe. Chamado pelo Player quando a animação termina.
    onAttackAnimationComplete(): void {
        this.endAttack();
    }

    // Interrompe um golpe em andamento. Precisa existir porque o fim normal do
    // ataque depende do evento 'animationcomplete' da animação do golpe: se
    // alguém tocar OUTRA animação por cima (o Player faz isso ao levar dano),
    // aquele evento nunca dispara, `activeAttack` fica preso para sempre e o
    // jogador não consegue mais atacar nem se mover — `isAttacking` zera a
    // velocidade horizontal todo frame.
    cancel(): void {
        if (!this.activeAttack) {
            return;
        }

        this.owner.off('animationcomplete-' + this.activeAnimationKey);
        this.endAttack();

        // Levar dano quebra a sequência: continuar o combo de onde parou depois
        // de ser arremessado não faria sentido nenhum.
        this.comboIndex = 0;
        this.comboExpiresAt = 0;
    }

    // Marca um alvo como já atingido por este golpe, evitando acertar duas vezes.
    markTargetHit(target: Physics.Arcade.Sprite): void {
        this.hitTargets.add(target);
    }

    hasTargetBeenHit(target: Physics.Arcade.Sprite): boolean {
        return this.hitTargets.has(target);
    }

    private beginAttack(definition: AttackDefinition): void {
        this.activeAttack = definition;
        this.passedActiveWindow = false;
        this.hitTargets.clear();

        // O evento 'attack' continua existindo por compatibilidade de assinatura,
        // mas a hitbox é a única fonte de verdade para o impacto agora.
        this.owner.emit('attack', this.owner);

        // Cada golpe do combo tem uma variante fixa (ver WEAPONS.sword): com
        // sorteio, dois golpes seguidos podiam sair iguais e a sequência
        // deixava de ser legível. Sem variante declarada, cai no sorteio antigo.
        const animationKey = definition.animationKey ?? randomAttackAnimationKey('player');
        this.activeAnimationKey = animationKey;
        this.owner.play(animationKey);
        this.owner.once('animationcomplete-' + animationKey, () => this.onAttackAnimationComplete());
    }

    private endAttack(): void {
        this.destroyHitbox();

        const finished = this.activeAttack;
        const now = this.scene.time.now;

        this.cooldownUntil = now + (finished?.cooldownMs ?? 0);

        // A janela de encadeamento conta do FIM do golpe. Zerada, o combo morre
        // aqui e o próximo ataque recomeça do primeiro golpe.
        const window = finished?.comboWindowMs ?? 0;
        this.comboExpiresAt = window > 0 ? now + (finished?.cooldownMs ?? 0) + window : 0;
        if (window <= 0) {
            this.comboIndex = 0;
        }

        this.activeAttack = null;
        this.passedActiveWindow = false;
    }

    private spawnHitbox(): void {
        if (!this.activeAttack) {
            return;
        }

        this.activeHitbox = new MeleeHitbox(this.scene, this.owner, this.activeAttack.hitbox);
    }

    private destroyHitbox(): void {
        this.activeHitbox?.destroy();
        this.activeHitbox = null;
    }
}
