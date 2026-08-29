import { Scene } from 'phaser';

import { randomAttackAnimationKey } from '../combat/attack-variants';
import { ENEMY_STATS } from '../damage/health-config';
import { BaseEnemy } from './BaseEnemy';
import { Player } from './Player';

// Ouriço: enrola numa bola de espinhos e atropela. Imune a dano enquanto rola,
// mas vulnerável durante o desenrolar.
const HEDGEHOG_BEHAVIOR = {
    // Tempo de preparação antes de começar a rolar. Serve como telegraph: o
    // jogador precisa ver a indicação visual de que o ataque vem.
    CURLING_MS: 400,

    // Distância máxima de um rolo antes de voltar. Sem este limite, o ouriço
    // ficaria rolando indefinidamente e seria impossível de derrotar.
    ROLL_DISTANCE: 260,

    // Velocidade durante o rolo. Bem alta para ser uma ameaça real, mas não
    // tão rápida que o jogador não consegue esquivar.
    ROLL_SPEED: 280,

    // Distância em que a bola atropela de fato. Casa com o corpo do ouriço em
    // escala 3 (28 * 3 = 84px de largura) mais uma folga.
    ROLL_HIT_RANGE: 60,

    // Número de rolos completos (ida + volta) antes de desenrolar. Mais que isso
    // fica tedioso; menos que isso o torna fraco demais.
    ROLLS_TOTAL: 3,

    // Tempo de vulnerabilidade após desenrolar. Precisa ser longo o bastante
    // para o jogador ter tempo de atacar, mas não tão longo que o ouriço fica
    // indefeso demais.
    UNROLLING_MS: 1200,

    // Rotação do sprite durante rolo (graus por frame). Quanto mais alto, mais
    // rápido ele "gira" visualmente.
    ROTATION_PER_FRAME: 8
} as const;

type HedgehogState = 'walking' | 'curling' | 'rolling' | 'unrolling';

export class Hedgehog extends BaseEnemy {
    private hedgehogState: HedgehogState = 'walking';

    // Timer para as transições de estado (curling e unrolling são baseadas em tempo).
    private stateTimer = 0;

    // Variante da animação de bola sorteada no início de cada ciclo de ataque.
    private ballAnimationKey = 'hedgehog-attack-1';

    // Posição inicial do rolo (usado pra calcular distância e saber quando virar).
    private rollStartX = 0;

    // Número de rolos completados nesta sequência de ataque.
    private rollsCompleted = 0;

    // Direção do rolo atual (1 = direita, -1 = esquerda).
    private rollDirection = 1;

    // Dano já aplicado nesta passada do rolo. Sem este controle, performAttack
    // era chamado a CADA frame enquanto rolava: 60 animações reiniciadas e 60
    // callbacks de dano agendados por segundo. Zera a cada inversão de sentido,
    // então cada passada pode acertar uma vez.
    private damageAppliedThisPass = false;

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, 'hedgehog', target, ENEMY_STATS.hedgehog);
    }

    protected isDamageImmune(): boolean {
        // Imune durante curling (preparação) e rolling (bola de espinhos).
        // Vulnerável durante walking e unrolling.
        return this.hedgehogState === 'curling' || this.hedgehogState === 'rolling';
    }

    // Ser defendido quebra a bola na hora: ele desenrola e entra na janela
    // vulnerável. Sem isto, o parry marcaria o cooldown mas o ouriço seguiria
    // rolando imune, e a defesa não teria servido para nada justamente contra
    // o inimigo em que ela mais importa.
    stagger(durationMs: number): void {
        super.stagger(durationMs);

        this.hedgehogState = 'unrolling';
        this.stateTimer = 0;
        this.rollsCompleted = 0;
        this.damageAppliedThisPass = false;
        this.setRotation(0);
    }

    protected updatePatrol(delta: number): void {
        // Patrulha normal (herança do BaseEnemy). Ao ficar à toa, o ouriço continua
        // andando, não fica parado esperando. O ataque vem só quando persegue ou
        // está no alcance.
        this.hedgehogState = 'walking';
        this.stateTimer = 0;
        this.rollsCompleted = 0;
        this.setRotation(0); // Garantir que está desrotacionado

        super.updatePatrol(delta);
    }

    protected updateChase(): void {
        // Perseguição normal, andando. Ainda não é hora de atacar — isso vem em
        // updateAttack.
        this.hedgehogState = 'walking';
        this.stateTimer = 0;
        this.rollsCompleted = 0;
        this.setRotation(0);

        super.updateChase();
    }

    protected updateAttack(time: number): void {
        // Máquina de estados de ataque. Diferente do Bat, o ouriço segue um ciclo
        // linear: curling -> rolling (ida) -> rolling (volta) -> ... -> unrolling
        // -> volta a walking (na próxima frame, pq updateAttack é chamado enquanto
        // estamos no alcance de ataque).

        const dir = this.target.x >= this.x ? 1 : -1;
        this.direction = dir;
        this.setFlipX(dir < 0);

        if (this.hedgehogState === 'walking') {
            // Começar o ciclo de ataque se o cooldown permitir.
            if (time >= this.attackCooldownUntil) {
                this.attackCooldownUntil = time + this.stats.combat.cooldownMs;
                this.hedgehogState = 'curling';
                this.stateTimer = 0;
                this.rollDirection = dir;
                this.rollsCompleted = 0;
                this.damageAppliedThisPass = false;
                // Sorteia a variante uma vez por ciclo: sortear a cada frame trocaria
                // a animação constantemente e ela nunca sairia do primeiro frame.
                this.ballAnimationKey = randomAttackAnimationKey(this.typeKey);
            } else {
                // Ainda em cooldown: andar normalmente.
                this.setVelocityX(this.stats.combat.chaseSpeed * dir);
                this.play(`${this.typeKey}-walk`, true);
            }
        } else if (this.hedgehogState === 'curling') {
            // Preparação visual (telegraph). Para de andar e muda pra pose de ataque
            // (a bola de espinhos no desenho).
            this.stateTimer += this.scene.game.loop.delta;

            this.setVelocityX(0);
            this.play(this.ballAnimationKey, true);

            if (this.stateTimer >= HEDGEHOG_BEHAVIOR.CURLING_MS) {
                this.hedgehogState = 'rolling';
                this.stateTimer = 0;
                this.rollStartX = this.x;
            }
        } else if (this.hedgehogState === 'rolling') {
            // Rolo: velocidade alta na direção escolhida, rotação visual, dano de
            // contato.
            this.stateTimer += this.scene.game.loop.delta;

            this.setVelocityX(HEDGEHOG_BEHAVIOR.ROLL_SPEED * this.rollDirection);
            this.rotation += (HEDGEHOG_BEHAVIOR.ROTATION_PER_FRAME * Math.PI) / 180;

            this.play(this.ballAnimationKey, true);

            // Calcular distância do início do rolo.
            const distanceFromStart = Math.abs(this.x - this.rollStartX);

            // Se atingiu a distância máxima OU passou do jogador, virar.
            const passedTarget = this.rollDirection === 1 ? this.x > this.target.x : this.x < this.target.x;

            // Bater numa parede inverte o sentido na hora. Sem isto o ouriço ficava
            // empurrando o muro para sempre: com o corpo travado, o X não avança,
            // `distanceFromStart` congela e o limite de distância nunca chega.
            const hitWall =
                this.rollDirection === 1 ? this.arcadeBody.blocked.right : this.arcadeBody.blocked.left;

            if (distanceFromStart >= HEDGEHOG_BEHAVIOR.ROLL_DISTANCE || passedTarget || hitWall) {
                this.rollDirection *= -1;
                this.rollsCompleted += 0.5; // Cada ida/volta é meia sequência
                this.rollStartX = this.x;
                // Nova passada, novo direito de acertar.
                this.damageAppliedThisPass = false;

                // Se já completou todos os rolos, desenrolar.
                if (this.rollsCompleted >= HEDGEHOG_BEHAVIOR.ROLLS_TOTAL) {
                    this.hedgehogState = 'unrolling';
                    this.stateTimer = 0;
                    this.setRotation(0); // Volta à pose normal
                }
            }

            // Uma investida acerta no máximo uma vez, e só quando de fato alcança o
            // jogador. A condição anterior era a distância percorrida desde o início
            // do rolo, que não tem relação nenhuma com onde o jogador está.
            const distanceToPlayer = Math.abs(this.target.x - this.x);
            if (!this.damageAppliedThisPass && distanceToPlayer < HEDGEHOG_BEHAVIOR.ROLL_HIT_RANGE) {
                this.damageAppliedThisPass = true;
                this.performAttack(this.rollDirection);
            }
        } else if (this.hedgehogState === 'unrolling') {
            // Desenrolar: vulnerável. Fica parado ou anda lentamente enquanto se
            // recupera.
            this.stateTimer += this.scene.game.loop.delta;

            this.setVelocityX(this.stats.patrolSpeed * this.rollDirection);
            this.play(`${this.typeKey}-walk`, true);

            if (this.stateTimer >= HEDGEHOG_BEHAVIOR.UNROLLING_MS) {
                // Fim do unroll, volta a walking. A próxima frame updateAttack vai
                // checar cooldown e decidir se atacar de novo.
                this.hedgehogState = 'walking';
                this.stateTimer = 0;
                this.rollsCompleted = 0;
            }
        }
    }
}
