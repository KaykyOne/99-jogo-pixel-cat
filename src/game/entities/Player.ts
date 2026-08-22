import { Input, Physics, Scene } from 'phaser';

import { PlayerCombat } from '../combat/PlayerCombat';
import { DamageSource } from '../damage/damage';
import { Health } from '../damage/Health';
import { PLAYER_HEALTH } from '../damage/health-config';
import { PLAYER_BODY, PLAYER_MOVEMENT } from './player-config';
import { PlayerClimb } from './PlayerClimb';
import { PlayerDash } from './PlayerDash';
import { Parryable, PlayerParry } from './PlayerParry';
import { syncFacingOffset } from './physics-utils';

type PlayerKeys = {
    attack: Input.Keyboard.Key;
    parry: Input.Keyboard.Key;
    dash: Input.Keyboard.Key;
    right: Input.Keyboard.Key;
    left: Input.Keyboard.Key;
    up: Input.Keyboard.Key;
    down: Input.Keyboard.Key;
};

type PlayerState = 'alive' | 'hurt' | 'dead';

export class Player extends Physics.Arcade.Sprite {
    // Componente de combate. Mantido público para que a cena configure o
    // overlap da hitbox ativa e leia o resultado dos impactos.
    readonly combat: PlayerCombat;
    readonly dash: PlayerDash;
    readonly climb: PlayerClimb;
    readonly parry: PlayerParry;

    private keys: PlayerKeys;

    private controlsEnabled = true;

    // Vida e estados de dano.
    private readonly health: Health;
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
        this.dash = new PlayerDash(scene, this);
        this.climb = new PlayerClimb(this);
        this.parry = new PlayerParry(scene, this);

        this.keys = scene.input.keyboard!.addKeys({
            attack: Input.Keyboard.KeyCodes.F,
            parry: Input.Keyboard.KeyCodes.Q,
            dash: Input.Keyboard.KeyCodes.SPACE,

            right: Input.Keyboard.KeyCodes.D,
            left: Input.Keyboard.KeyCodes.A,

            up: Input.Keyboard.KeyCodes.W,
            down: Input.Keyboard.KeyCodes.S
        }) as PlayerKeys;
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

        if (!this.controlsEnabled) {
            this.setVelocity(0, 0);
            this.coyoteTimer = 0;
            this.jumpBufferTimer = 0;
            return;
        }

        const dt = delta / 1000;
        const onGround = this.arcadeBody.blocked.down;

        // Segurar o direcional CONTRA a parede é o que prende na escalada;
        // W/S sobem e descem enquanto agarrado.
        const holdingIntoWall =
            (this.climb.touchingWallDirection === -1 && this.keys.left.isDown) ||
            (this.climb.touchingWallDirection === 1 && this.keys.right.isDown);
        const climbInput =
            (this.keys.up.isDown ? -1 : 0) + (this.keys.down.isDown ? 1 : 0);

        this.updateTimers(delta, onGround);
        this.parry.update(time);
        this.dash.update(time);
        // O dash controla o corpo inteiro (inclusive a gravidade) enquanto dura.
        if (!this.dash.isDashing) {
            this.climb.update(onGround, holdingIntoWall, climbInput);
        }
        this.combat.update(this.currentAnimFrameIndex);

        // Durante o hitstun o jogador não pode atacar nem pular; apenas sofre o
        // recuo do knockback.
        if (this.hurtTimer <= 0 && !this.combat.isAttacking) {
            // O dash é permitido no ar. Um ataque já iniciado não é
            // interrompido, preservando o ciclo da hitbox de combate.
            if (Input.Keyboard.JustDown(this.keys.dash)) {
                // Larga a parede antes: senão a escalada devolveria a gravidade
                // por cima do dash, que a desliga logo em seguida.
                this.climb.release();
                this.dash.attemptDash(time, this.flipX ? -1 : 1);
            }
        }

        // Q defende. Só do chão e fora de qualquer outra ação: no ar ou no
        // meio de um golpe a defesa viraria um cancelamento universal.
        if (
            this.hurtTimer <= 0 &&
            onGround &&
            !this.dash.isDashing &&
            !this.climb.isGripping &&
            !this.combat.isAttacking &&
            Input.Keyboard.JustDown(this.keys.parry)
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
        } else if (this.combat.isAttacking) {
            // O golpe interrompe o deslocamento horizontal durante a animação.
            this.setVelocityX(0);
        } else if (this.hurtTimer > 0) {
            // Hitstun: mantém o recuo do knockback sem aplicar controle
            // horizontal, para o golpe ser sentido de fato.
        } else {
            const moveX = (this.keys.right.isDown ? 1 : 0) - (this.keys.left.isDown ? 1 : 0);

            if (moveX !== 0) {
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

        const damage = this.health.takeDamage(source);
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
            !this.combat.isAttacking
        ) {
            this.jump();
            this.jumpBufferTimer = 0;
            this.coyoteTimer = 0;
        }
    }

    private handleAttack(time: number, onGround: boolean) {
        if (Input.Keyboard.JustDown(this.keys.attack)) {
            // O componente valida cooldown, estado e se está no chão.
            this.combat.attemptAttack(time, onGround);
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
        if (this.dash.isDashing || this.combat.isAttacking) {
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
