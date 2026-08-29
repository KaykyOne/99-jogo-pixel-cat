import { Input, Physics, Scene } from 'phaser';

import { PlayerCombat } from '../combat/PlayerCombat';
import { getDifficultyModifiersFor } from '../config/difficulty';
import { GROUND_Y } from '../world/phases';
import { PlayerWeapons } from '../combat/PlayerWeapons';
import { DamageSource } from '../damage/damage';
import { Health } from '../damage/Health';
import { PLAYER_HEALTH } from '../damage/health-config';
import { Mana } from '../damage/Mana';
import { PLAYER_BODY, PLAYER_MOVEMENT } from './player-config';
import { PlayerClimb } from './PlayerClimb';
import { PlayerDash } from './PlayerDash';
import { Parryable, PlayerParry } from './PlayerParry';
import { syncFacingOffset } from './physics-utils';

type PlayerKeys = {
    attack: Input.Keyboard.Key;
    parry: Input.Keyboard.Key;
    dash: Input.Keyboard.Key;
    // Agarrar/escalar parede. Tecla própria: o Espaço já é o dash.
    climb: Input.Keyboard.Key;
    right: Input.Keyboard.Key;
    left: Input.Keyboard.Key;
    up: Input.Keyboard.Key;
    down: Input.Keyboard.Key;

    // Troca direta de arma. Z/X/C e não 1/2/3 porque as teclas numéricas
    // pertencem aos slots do inventário.
    weaponSword: Input.Keyboard.Key;
    weaponBow: Input.Keyboard.Key;
    weaponStaff: Input.Keyboard.Key;

    // Seleção de magia. Ficou SO no R: 1/2/3 são slots do inventário, e
    // guardar as duas coisas na mesma tecla fazia o 1 lançar a magia E beber a
    // poção do slot 1 no mesmo frame — os dois sistemas escutam a tecla, e
    // nenhum consegue "consumir" o input do outro.
    spellCycle: Input.Keyboard.Key;
};

type PlayerState = 'alive' | 'hurt' | 'dead';

export class Player extends Physics.Arcade.Sprite {
    // Componente de combate. Mantido público para que a cena configure o
    // overlap da hitbox ativa e leia o resultado dos impactos.
    readonly combat: PlayerCombat;
    readonly weapons: PlayerWeapons;
    readonly dash: PlayerDash;
    readonly climb: PlayerClimb;
    readonly parry: PlayerParry;

    private keys: PlayerKeys;

    private controlsEnabled = true;

    // Diálogo/loja aberto (evento 'ui:modal'). Bloqueia TODO input de combate:
    // sem isto, conversar com um NPC dispararia golpe e magia junto.
    private modalOpen = false;

    // Vida, mana e estados de dano.
    private readonly health: Health;
    readonly mana: Mana;
    private playerState: PlayerState = 'alive';

    // Janela de invencibilidade após receber dano (com piscada) e o pequeno
    // hitstun em que o recuo (knockback) acontece sem controle horizontal.
    private invulnerabilityTimer = 0;
    private blinkTimer = 0;
    private hurtTimer = 0;

    // Janelas de tempo (ms) para pulo: mantém a sensação responsiva ao pisar
    // perto da borda (coyote) e ao apertar W instantes antes de tocar o chão.
    private coyoteTimer = 0;
    private jumpBufferTimer = 0;

    // Lentidão da teia da aranha. Multiplica a velocidade horizontal alvo; 1 =
    // sem efeito. Guardado como fator (e não como velocidade absoluta) para
    // continuar valendo se PLAYER_MOVEMENT.maxSpeed for rebalanceado.
    private slowFactor = 1;
    private slowTimer = 0;

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'player-idle', 0);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setScale(3);

        this.health = new Health(PLAYER_HEALTH.maxHp, { defense: 0, resistance: {} });
        this.mana = new Mana();

        // O corpo do Arcade multiplica o tamanho (fonte) pelo scale do sprite (3x).
        // Dimensões medidas a partir do bounding box real do sprite (ver PLAYER_BODY).
        this.arcadeBody.setSize(PLAYER_BODY.width, PLAYER_BODY.height);
        this.arcadeBody.setOffset(PLAYER_BODY.offsetX, PLAYER_BODY.offsetY);
        this.arcadeBody.setMaxVelocity(
            PLAYER_MOVEMENT.maxSpeed,
            PLAYER_MOVEMENT.maxFallSpeed
        );

        this.setCollideWorldBounds(true);

        this.combat = new PlayerCombat(scene, this);
        this.weapons = new PlayerWeapons(scene, this, this.combat, this.mana);
        this.dash = new PlayerDash(scene, this);
        this.climb = new PlayerClimb(this);
        this.parry = new PlayerParry(scene, this);

        this.keys = scene.input.keyboard!.addKeys({
            attack: Input.Keyboard.KeyCodes.F,
            parry: Input.Keyboard.KeyCodes.Q,
            dash: Input.Keyboard.KeyCodes.SPACE,
            climb: Input.Keyboard.KeyCodes.SHIFT,

            right: Input.Keyboard.KeyCodes.D,
            left: Input.Keyboard.KeyCodes.A,

            up: Input.Keyboard.KeyCodes.W,
            down: Input.Keyboard.KeyCodes.S,

            weaponSword: Input.Keyboard.KeyCodes.Z,
            weaponBow: Input.Keyboard.KeyCodes.X,
            weaponStaff: Input.Keyboard.KeyCodes.C,

            spellCycle: Input.Keyboard.KeyCodes.R
        }) as PlayerKeys;

        // Contratos com os outros sistemas. Ficam aqui, e não na cena, para o
        // Game.ts não virar o roteador de eventos de todo mundo.
        scene.events.on('player:heal', this.onHealEvent, this);
        scene.events.on('ui:modal', this.onModalEvent, this);
        scene.events.once('shutdown', () => {
            scene.events.off('player:heal', this.onHealEvent, this);
            scene.events.off('ui:modal', this.onModalEvent, this);
        });
    }

    // Cura vinda do inventário (poção). Health já resolve o teto de HP.
    heal(amount: number): void {
        if (this.playerState === 'dead' || amount <= 0) {
            return;
        }

        this.health.heal(amount);
    }

    private onHealEvent(payload: { amount?: number }): void {
        this.heal(payload?.amount ?? 0);
    }

    private onModalEvent(payload: { open?: boolean }): void {
        this.modalOpen = payload?.open === true;

        // Fecha qualquer intenção pendente: com o diálogo abrindo no mesmo
        // frame em que F foi apertado, o golpe sairia por trás do painel.
        if (this.modalOpen) {
            this.weapons.clearBuffer();
        }
    }

    get currentHp(): number {
        return this.health.current;
    }

    get maxHp(): number {
        return this.health.max;
    }

    get isDead(): boolean {
        return this.playerState === 'dead';
    }

    update(time: number, delta: number) {
        if (this.playerState === 'dead') {
            this.setVelocity(0, 0);
            return;
        }

        this.updateInvulnerability(delta);
        this.updateHurt(delta);
        this.updateSlow(delta);
        // A mana regenera mesmo com o controle desligado (teleporte, diálogo):
        // ela é um relógio, não uma ação do jogador.
        this.mana.update(delta);

        if (!this.controlsEnabled) {
            this.setVelocity(0, 0);
            this.coyoteTimer = 0;
            this.jumpBufferTimer = 0;
            return;
        }

        const dt = delta / 1000;
        this.keepAboveFloor();
        const onGround = this.arcadeBody.blocked.down;

        // Lido AGORA porque climb.update() consome a marcação do collider: o
        // teste do dash, mais abaixo, precisa do valor deste frame.
        const nearClimbableWall = this.climb.isTouchingWall;
        // SHIFT encostado na parede escala. É a forma primária: chegar, segurar
        // e subir. Segurar o direcional CONTRA a parede continua valendo, e W/S
        // seguem dando o controle fino de subir e descer.
        const holdingClimbKey = this.keys.climb.isDown && nearClimbableWall;
        const holdingIntoWall =
            holdingClimbKey ||
            (this.climb.touchingWallDirection === -1 && this.keys.left.isDown) ||
            (this.climb.touchingWallDirection === 1 && this.keys.right.isDown);
        // Sem W/S, o Shift sozinho já sobe — senão o jogador ficaria pendurado
        // sem entender que falta uma segunda tecla.
        const manualClimb = (this.keys.up.isDown ? -1 : 0) + (this.keys.down.isDown ? 1 : 0);
        const climbInput = manualClimb !== 0 ? manualClimb : holdingClimbKey ? -1 : 0;

        this.updateTimers(delta, onGround);
        this.parry.update(time, this.keys.parry.isDown);
        this.dash.update(time);
        // O dash controla o corpo inteiro (inclusive a gravidade) enquanto dura.
        if (!this.dash.isDashing) {
            this.climb.update(onGround, holdingIntoWall, climbInput, delta);
        }
        this.combat.update(this.currentAnimFrameIndex);
        this.handleWeaponSwitch();

        // Durante o hitstun o jogador não pode atacar nem pular; apenas sofre o
        // recuo do knockback.
        if (this.hurtTimer <= 0 && !this.isSwinging) {
            // O dash é permitido no ar. Um ataque já iniciado não é
            // interrompido, preservando o ciclo da hitbox de combate.
            // O dash vale em qualquer lugar, inclusive colado na parede: com a
            // escalada no Shift, as duas ações deixaram de disputar a tecla.
            // Dar dash agarrado larga a parede de propósito — é a saída rápida.
            if (Input.Keyboard.JustDown(this.keys.dash)) {
                // Larga a parede antes: senão a escalada devolveria a gravidade
                // por cima do dash, que a desliga logo em seguida.
                this.climb.release();
                this.dash.attemptDash(time, this.flipX ? -1 : 1);
            }
        }

        // Q defende, e a defesa dura enquanto a tecla estiver pressionada (a
        // soltura é tratada em parry.update). Lê `isDown` e não `JustDown`:
        // sendo uma postura sustentada, apertar Q no ar e aterrissar segurando
        // deve entrar em guarda ao tocar o chão, em vez de exigir soltar e
        // apertar de novo. O componente ignora a chamada se já estiver em
        // guarda ou em cooldown, então chamar todo frame é inofensivo.
        //
        // Só do chão e fora de qualquer outra ação: no ar ou no meio de um
        // golpe a defesa viraria um cancelamento universal.
        if (
            this.hurtTimer <= 0 &&
            onGround &&
            !this.modalOpen &&
            !this.dash.isDashing &&
            !this.climb.isGripping &&
            !this.isSwinging &&
            this.keys.parry.isDown
        ) {
            this.parry.attempt(time);
        }

        if (this.parry.isBusy) {
            // Defendendo: plantado, sem atacar e sem pular.
            this.jumpBufferTimer = 0;
            this.coyoteTimer = 0;
        } else if (this.climb.isGripping) {
            // W está sendo usado para subir, não para pular. Zerar as janelas
            // evita que o pulo saia sozinho no instante em que soltar a parede.
            this.jumpBufferTimer = 0;
            this.coyoteTimer = 0;
        } else if (this.hurtTimer <= 0 && !this.dash.isDashing) {
            this.handleAttack(time, onGround);
            this.handleJumpQueue();
        }

        if (this.dash.isDashing) {
            // PlayerDash controla a velocidade horizontal durante o impulso.
        } else if (this.parry.isBusy) {
            // Defesa prende o jogador no lugar, encarando a direção atual.
            this.setVelocityX(0);
        } else if (this.climb.isGripping) {
            // PlayerClimb controla os dois eixos; aqui só encara a parede.
            this.setFlipX(this.climb.touchingWallDirection < 0);
        } else if (this.isSwinging && onGround) {
            // O golpe interrompe o deslocamento horizontal durante a animação.
            // Só no CHÃO: no ar, travar o X mataria o impulso do pulo no meio e
            // o ataque aéreo viraria uma queda vertical.
            this.setVelocityX(0);
        } else if (this.hurtTimer > 0) {
            // Hitstun: mantém o recuo do knockback sem aplicar controle
            // horizontal, para o golpe ser sentido de fato.
        } else {
            const moveX = (this.keys.right.isDown ? 1 : 0) - (this.keys.left.isDown ? 1 : 0);

            // Virar no meio de um golpe aéreo deixaria o sprite olhando para um
            // lado e a hitbox (cuja direção é travada na criação) para o outro.
            if (moveX !== 0 && !this.isSwinging) {
                this.setFlipX(moveX < 0);
            }

            this.applyHorizontalMovement(moveX, onGround, dt);
        }

        if (!this.dash.isDashing && !this.climb.isGripping) {
            this.applyVerticalMovement(dt);
        }
        this.updateAnimation(onGround);

        // O corpo físico não acompanha flipX sozinho (ver physics-utils);
        // resincroniza todo frame com a direção atual do sprite.
        syncFacingOffset(this.arcadeBody, this.flipX, PLAYER_BODY);
    }

    setControlsEnabled(enabled: boolean) {
        this.controlsEnabled = enabled;
    }

    // Aplica lentidão (teia da aranha). Dois acertos não somam: fica valendo o
    // efeito mais forte e a maior duração restante, senão um bando de aranhas
    // empilharia o fator até deixar o jogador parado, sem chance de reagir.
    applySlow(factor: number, durationMs: number): void {
        if (this.playerState === 'dead') {
            return;
        }

        this.slowFactor = Math.min(this.slowFactor, factor);
        this.slowTimer = Math.max(this.slowTimer, durationMs);
    }

    get isSlowed(): boolean {
        return this.slowTimer > 0;
    }

    // Mesma rede de segurança dos inimigos (ver BaseEnemy.keepAboveFloor): o
    // Arcade DESCARTA a separação quando a penetração passa do que o corpo andou
    // no frame, e a partir daí nada segura a queda. Com o jogador isso é pior
    // que um bug visual: ele cai para fora do mundo e a run acaba ali.
    private keepAboveFloor(): void {
        const body = this.arcadeBody;
        if (body.bottom <= GROUND_Y) {
            return;
        }

        this.y -= body.bottom - GROUND_Y;
        body.updateFromGameObject();
        if (body.velocity.y > 0) {
            body.setVelocityY(0);
        }
    }

    // Aplica dano ao jogador. Retorna true se o dano foi efetivamente recebido.
    // `direction` (1 = direita, -1 = esquerda) indica o sentido do recuo.
    takeDamage(source: DamageSource, direction: number, attacker?: Parryable): boolean {
        if (this.playerState === 'dead') {
            return false;
        }

        // Defesa ativa: o dano é anulado por inteiro e quem atacou leva o
        // revide (reação de dano, sem perder vida, e sem atacar por 2s).
        // Vem ANTES dos i-frames: defender com sucesso não deve consumir a
        // invencibilidade que o jogador ainda pode precisar.
        if (this.parry.isActive) {
            this.parry.absorb(attacker);
            return false;
        }

        // I-frames: ignora dano enquanto a invencibilidade está ativa.
        if (this.invulnerabilityTimer > 0) {
            return false;
        }

        // Dificuldade aplicada na ENTRADA do dano, um ponto só: contato,
        // projétil e boss chegam todos por aqui, então nenhuma fonte precisa
        // lembrar de multiplicar (e nenhuma pode esquecer). O mínimo de 1
        // impede que um arredondamento para baixo torne um golpe inofensivo.
        const scaled: DamageSource = {
            ...source,
            amount: Math.max(1, Math.round(source.amount * getDifficultyModifiersFor(this.scene).incomingDamage))
        };

        const damage = this.health.takeDamage(scaled);
        if (damage <= 0) {
            return false;
        }

        this.invulnerabilityTimer = PLAYER_HEALTH.invulnerabilityMs;
        this.blinkTimer = 0;

        if (this.health.isDead) {
            this.die(source, direction);
        } else {
            this.playerState = 'hurt';
            this.hurtTimer = 280;
            this.setTint(0xff6b6b);

            // Knockback do jogador, com direção definida por quem causou o dano.
            const knockbackX = source.knockbackX ?? PLAYER_HEALTH.hurtKnockbackX;
            const knockbackY = source.knockbackY ?? PLAYER_HEALTH.hurtKnockbackY;
            this.arcadeBody.setVelocity(knockbackX * direction, knockbackY);

            // Um golpe em andamento precisa ser cancelado ANTES de trocar a
            // animação: o fim do ataque depende do evento 'animationcomplete'
            // da animação do golpe, e tocar 'player-hurt' por cima faria esse
            // evento nunca disparar — o combate ficaria travado em "atacando"
            // para sempre. Levar dano interrompendo o próprio golpe também é o
            // comportamento certo: dá peso ao acerto do inimigo.
            this.combat.cancel();
            this.play('player-hurt');
        }

        return true;
    }

    private get arcadeBody(): Physics.Arcade.Body {
        return this.body as Physics.Arcade.Body;
    }

    // Frame atual da animação, usado pelo combate para controlar a janela ativa
    // da hitbox (começa/termina o golpe no instante visual do impacto).
    private get currentAnimFrameIndex(): number | null {
        return this.anims.currentFrame?.index ?? null;
    }

    private updateInvulnerability(delta: number) {
        if (this.invulnerabilityTimer <= 0) {
            return;
        }

        this.invulnerabilityTimer -= delta;
        this.blinkTimer += delta;

        // Piscada: alterna a opacidade a cada 90ms durante a invencibilidade.
        const blinkOn = Math.floor(this.blinkTimer / 90) % 2 === 0;
        this.setAlpha(blinkOn ? 1 : 0.3);

        if (this.invulnerabilityTimer <= 0) {
            this.setAlpha(1);
            this.clearTint();
        }
    }

    private updateSlow(delta: number) {
        if (this.slowTimer <= 0) {
            return;
        }

        this.slowTimer -= delta;
        if (this.slowTimer <= 0) {
            this.slowFactor = 1;

            // Só limpa o tom da teia se nenhum outro estado estiver pintando o
            // sprite — o vermelho do dano tem prioridade sobre o azul da teia.
            if (this.hurtTimer <= 0 && this.invulnerabilityTimer <= 0) {
                this.clearTint();
            }
            return;
        }

        if (this.hurtTimer <= 0 && this.invulnerabilityTimer <= 0) {
            this.setTint(0xa8d8ff);
        }
    }

    private updateHurt(delta: number) {
        if (this.hurtTimer <= 0) {
            return;
        }

        this.hurtTimer -= delta;
        if (this.hurtTimer <= 0) {
            this.playerState = 'alive';
            this.clearTint();
            this.anims.resume();
        }
    }

    private updateTimers(delta: number, onGround: boolean) {
        if (onGround) {
            this.coyoteTimer = PLAYER_MOVEMENT.coyoteTime;
        } else {
            this.coyoteTimer = Math.max(0, this.coyoteTimer - delta);
        }

        if (Input.Keyboard.JustDown(this.keys.up)) {
            this.jumpBufferTimer = PLAYER_MOVEMENT.jumpBufferTime;
        } else {
            this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - delta);
        }
    }

    private handleJumpQueue() {
        if (
            this.jumpBufferTimer > 0 &&
            this.coyoteTimer > 0 &&
            !this.isSwinging
        ) {
            this.jump();
            this.jumpBufferTimer = 0;
            this.coyoteTimer = 0;
        }
    }

    // Ocupado em qualquer forma de ataque: golpe corpo-a-corpo, flechada ou
    // conjuração. Ponto único, porque o Player consulta este estado em seis
    // lugares diferentes e esquecer um deles trava o personagem.
    private get isSwinging(): boolean {
        return this.weapons.isBusy;
    }

    private handleAttack(time: number, onGround: boolean) {
        if (this.modalOpen) {
            return;
        }

        // Só REGISTRA a intenção. Quem executa é o update do PlayerWeapons, a
        // cada frame, consumindo o buffer assim que a arma libera — é o que
        // salva o golpe apertado um instante cedo demais.
        if (Input.Keyboard.JustDown(this.keys.attack)) {
            this.weapons.queueAttack(time);
        }

        this.weapons.update(time, onGround);
    }

    // Troca de arma (Z/X/C) e seleção de magia (1/2/3, ou R para ciclar).
    // As numéricas são compartilhadas com os slots do inventário: por isso
    // PlayerWeapons ignora a seleção quando o cajado NÃO está equipado, e R
    // existe como caminho sem nenhuma disputa.
    private handleWeaponSwitch() {
        if (this.modalOpen) {
            return;
        }

        if (Input.Keyboard.JustDown(this.keys.weaponSword)) {
            this.weapons.equip('sword');
        } else if (Input.Keyboard.JustDown(this.keys.weaponBow)) {
            this.weapons.equip('bow');
        } else if (Input.Keyboard.JustDown(this.keys.weaponStaff)) {
            this.weapons.equip('staff');
        }

        if (Input.Keyboard.JustDown(this.keys.spellCycle)) {
            this.weapons.cycleSpell();
        }
    }

    // Lógica de movimento horizontal: acelera, desacelera e troca de direção
    // com constantes separadas para chão e ar, sem tocar em animação.
    private applyHorizontalMovement(moveX: number, onGround: boolean, dt: number) {
        const body = this.arcadeBody;
        const current = body.velocity.x;
        const target = moveX * PLAYER_MOVEMENT.maxSpeed * this.slowFactor;

        let acceleration: number;
        if (moveX === 0) {
            acceleration = onGround
                ? PLAYER_MOVEMENT.groundDeceleration
                : PLAYER_MOVEMENT.airDeceleration;
        } else if (current === 0 || Math.sign(current) === moveX) {
            acceleration = onGround
                ? PLAYER_MOVEMENT.groundAcceleration
                : PLAYER_MOVEMENT.airAcceleration;
        } else {
            acceleration = onGround
                ? PLAYER_MOVEMENT.groundTurnAcceleration
                : PLAYER_MOVEMENT.airTurnAcceleration;
        }

        const step = acceleration * dt;
        let next: number;

        if (moveX === 0) {
            if (Math.abs(current) <= step) {
                next = 0;
            } else {
                next = current - Math.sign(current) * step;
            }
        } else {
            next = current + moveX * step;
            next = moveX > 0 ? Math.min(next, target) : Math.max(next, target);
        }

        this.setVelocityX(next);
    }

    // Lógica de movimento vertical: altura variável de pulo e queda mais rápida
    // após o ápice. A gravidade base continua vindo da cena.
    private applyVerticalMovement(dt: number) {
        const body = this.arcadeBody;

        // Soltar W durante a subida corta o impulso (altura variável).
        if (Input.Keyboard.JustUp(this.keys.up) && body.velocity.y < 0) {
            this.setVelocityY(body.velocity.y * PLAYER_MOVEMENT.jumpCutMultiplier);
        }

        // Após o ápice, adiciona um impulso extra para baixo até o limite.
        if (body.velocity.y > 0) {
            const fall = Math.min(
                body.velocity.y + PLAYER_MOVEMENT.fastFallAcceleration * dt,
                PLAYER_MOVEMENT.maxFallSpeed
            );
            this.setVelocityY(fall);
        }
    }

    // Lógica de animação: só decide qual animação tocar com base no estado.
    private updateAnimation(onGround: boolean) {
        if (this.dash.isDashing || this.isSwinging) {
            return;
        }

        // A defesa congela o próprio frame; deixar o idle/walk voltar por cima
        // apagaria a pose e o tint que sinalizam que ele está protegido.
        if (this.parry.isBusy) {
            return;
        }

        // Mantém o frame de dano durante o hitstun.
        if (this.hurtTimer > 0) {
            return;
        }

        // Não há asset de escalada: subindo/descendo reaproveita o ciclo de
        // caminhada (lê como braçada na parede) e, parado nela, congela o
        // frame de salto — mesma solução pragmática já usada em hurt/morte.
        if (this.climb.isGripping) {
            if (this.climb.isClimbingVertically) {
                this.play('player-walk', true);
                if (this.anims.isPaused) {
                    this.anims.resume();
                }
            } else {
                this.play('player-jump', true);
                this.anims.pause();
            }
            return;
        }

        if (this.anims.isPaused) {
            this.anims.resume();
        }

        if (onGround && this.arcadeBody.velocity.x !== 0) {
            this.play('player-walk', true);
        } else if (onGround) {
            this.play('player-idle', true);
        }
    }

    private jump() {
        this.setVelocityY(PLAYER_MOVEMENT.jumpVelocity);

        this.play('player-jump');
    }

    private die(source: DamageSource, direction: number) {
        this.playerState = 'dead';
        this.setControlsEnabled(false);
        this.parry.cancel();
        this.combat.cancel();

        this.setAlpha(1);
        this.clearTint();

        // Desativa o corpo para o personagem não cair nem colidir durante a
        // animação de morte, e aplica um pequeno recuo para vender o impacto.
        const knockbackX = source.knockbackX ?? PLAYER_HEALTH.hurtKnockbackX;
        const knockbackY = source.knockbackY ?? PLAYER_HEALTH.hurtKnockbackY;
        this.arcadeBody.setVelocity(knockbackX * direction, knockbackY);

        this.scene.time.delayedCall(60, () => {
            const body = this.body as Physics.Arcade.Body;
            body.enable = false;
        });

        // Anima a morte com o asset carregado em PreloadScene (6 frames a 10fps
        // = 600ms). Sem tint: pintar o sprite de vermelho esconderia justamente
        // o desenho que a animação existe para mostrar.
        this.play('player-death');

        // O fade só começa DEPOIS da animação terminar. Antes ele durava 260ms
        // e apagava o personagem antes da metade da morte — a animação nunca
        // chegava a ser vista.
        this.once('animationcomplete-player-death', () => {
            this.scene.tweens.add({
                targets: this,
                alpha: 0,
                duration: 200,
                ease: 'Quad.out'
            });
        });

        // A cena escuta este evento para reiniciar (respawn) após a animação.
        this.emit('player-died');
    }
}
