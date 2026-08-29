import { Scene } from 'phaser';

import { randomAttackAnimationKey } from '../combat/attack-variants';
import { ENEMY_STATS } from '../damage/health-config';
import { GROUND_Y } from '../world/phases';
import { BaseEnemy } from './BaseEnemy';
import { Player } from './Player';

// Morcego: voa e mergulha no jogador em ciclos completos (mergulho + subida).
// Toda decisão de velocidade é manual (sem gravidade), inclusive o Y.
const BAT_BEHAVIOR = {
    // Ondulação senoide durante patrulha: sem ela, o movimento fica mecânico.
    // Amplitude de ~16px acima/abaixo da linha de cruzeiro.
    WAVE_AMPLITUDE: 16,
    WAVE_FREQUENCY: 0.006, // radianos por ms

    // Fase de mergulho: aceleração diagonal em direção ao jogador. Valores baixos
    // demais e o mergulho fica lento demais; muito altos e ele passa direto do
    // jogador sem encostar.
    DIVE_ACCELERATION_X: 280,
    DIVE_ACCELERATION_Y: 320,

    // Fase de subida: velocidade fixa para subir de novo. Precisa ser rápida o
    // bastante para sair do alcance de contraataque do jogador.
    RETURN_SPEED_X: 60,
    RETURN_SPEED_Y: -200,

    // Piso do mergulho, em Y de mundo. Y cresce para BAIXO no Phaser: o
    // mergulho termina quando o morcego DESCE até aqui. Fica 40px acima do
    // chão para ele arrematar a curva sem encostar no terreno — o collider o
    // prenderia lá embaixo, já que voador não tem gravidade para cair nem
    // impulso automático para subir.
    DIVE_FLOOR_Y: GROUND_Y - 40,

    // Raio de detecção para "passou do jogador": se a distância horizontal for
    // menor que isso e ele estiver descendo, é hora de virar pra subir.
    PASS_DISTANCE: 40,

    // Lerp suave pra alturas-alvo (cruzeiro e perseguição), de forma que o
    // movimento não seja teleporte.
    HEIGHT_LERP_FACTOR: 0.08
} as const;

type BatState = 'cruise' | 'diving' | 'returning';

export class Bat extends BaseEnemy {
    private batState: BatState = 'cruise';
    private cruiseY: number;

    // Onda senoide durante patrulha (acumula ms para calcular o deslocamento Y).
    private wavePhase = 0;

    // Flag: dano já foi aplicado neste mergulho? Limpa ao voltar pra 'cruise'.
    private damageAppliedThisDive = false;

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, 'bat', target, ENEMY_STATS.bat);
        this.cruiseY = y;
    }

    protected isFlying(): boolean {
        return true;
    }

    protected updatePatrol(delta: number): void {
        // Herda a lógica horizontal de patrulha do BaseEnemy (pauseTimer, direção,
        // limites), mas adiciona o movimento vertical próprio de voador. Lê a
        // velocityX já setada por super.updatePatrol() e substitui apenas Y.

        this.wavePhase += delta * BAT_BEHAVIOR.WAVE_FREQUENCY;

        // Chamar super primeiro: isso seta velocityX e toca a animação.
        super.updatePatrol(delta);

        // Ondulação vertical: oscila em volta de cruiseY, suave. Sobrescreve
        // o velocityY (que super não usa porque voadores não têm gravidade).
        const waveOffset = Math.sin(this.wavePhase) * BAT_BEHAVIOR.WAVE_AMPLITUDE;
        this.setVelocityY((this.cruiseY + waveOffset - this.y) * BAT_BEHAVIOR.HEIGHT_LERP_FACTOR);
    }

    protected updateChase(): void {
        // Perseguição: voa em linha reta em direção ao jogador, altura consistente.
        // Não mergulha automaticamente — só em updateAttack quando está no alcance.

        const dir = this.target.x >= this.x ? 1 : -1;
        this.direction = dir;

        this.setVelocityX(this.stats.combat.chaseSpeed * dir);

        // Altura: alvo é o Y do jogador (um pouco acima). Usa a mesma técnica de
        // lerp suave: atrai o Y pra perto do alvo sem teletransportar.
        const targetY = this.target.y - 40;
        this.setVelocityY((targetY - this.y) * BAT_BEHAVIOR.HEIGHT_LERP_FACTOR * 1.5);

        this.setFlipX(dir < 0);
        this.play(`${this.typeKey}-walk`, true);
    }

    protected updateAttack(time: number): void {
        // Máquina de estados de ataque. O BaseEnemy já garante que estamos no
        // alcance de ataque e que é hora de atacar (tempo >= cooldownUntil). Aqui
        // só gerenciamos o mergulho em 3 fases.

        const dir = this.target.x >= this.x ? 1 : -1;
        this.direction = dir;
        this.setFlipX(dir < 0);

        if (this.batState === 'cruise') {
            // Estado inicial de ataque: começar o mergulho se não estiver em cooldown.
            if (time >= this.attackCooldownUntil) {
                this.attackCooldownUntil = time + this.stats.combat.cooldownMs;
                this.batState = 'diving';
                this.damageAppliedThisDive = false;
            } else {
                // Esperando cooldown: flutuação no lugar.
                this.setVelocityX(0);
                const waveOffset = Math.sin(this.wavePhase) * BAT_BEHAVIOR.WAVE_AMPLITUDE;
                this.setVelocityY((this.cruiseY + waveOffset - this.y) * BAT_BEHAVIOR.HEIGHT_LERP_FACTOR);
                this.play(`${this.typeKey}-walk`, true);
            }
        } else if (this.batState === 'diving') {
            // Mergulho: acelera na diagonal em direção ao jogador.
            const accelX = BAT_BEHAVIOR.DIVE_ACCELERATION_X * dir;
            const accelY = BAT_BEHAVIOR.DIVE_ACCELERATION_Y;

            const vx = this.body?.velocity.x ?? 0;
            const vy = this.body?.velocity.y ?? 0;

            // Delta real do loop: com 0.016 chumbado, a aceleração do mergulho
            // mudava de força conforme o frame rate da máquina.
            const dt = this.scene.game.loop.delta / 1000;
            this.setVelocityX(vx + accelX * dt);
            this.setVelocityY(vy + accelY * dt);

            // Condições para parar o mergulho:
            // 1. Passou do jogador (distância < PASS_DISTANCE e descendo)
            // 2. Atingiu o Y mínimo (chão virtual ou limite)
            const distanceToPlayer = Math.abs(this.target.x - this.x);
            const isDiving = (vy ?? 0) > 0;

            // Encostar em qualquer superfície também encerra o mergulho. Sem esta
            // condição, mergulhar em cima de uma plataforma prendia o morcego: o
            // collider segura o corpo, o Y para de crescer, o piso do mergulho nunca
            // é atingido, e voador não tem gravidade para se soltar sozinho.
            const touchedSurface =
                this.arcadeBody.blocked.down || this.arcadeBody.blocked.left || this.arcadeBody.blocked.right;

            if (
                (distanceToPlayer < BAT_BEHAVIOR.PASS_DISTANCE && isDiving) ||
                this.y >= BAT_BEHAVIOR.DIVE_FLOOR_Y ||
                touchedSurface
            ) {
                this.batState = 'returning';
            }

            // Aplicar dano uma única vez durante o mergulho (se não foi aplicado ainda).
            if (!this.damageAppliedThisDive && distanceToPlayer < 50) {
                this.damageAppliedThisDive = true;
                this.performAttack(dir);
            }

            // A chave é `bat-attack-1..3`; `bat-attack` puro não existe e o Phaser
            // simplesmente ignorava a chamada, deixando o mergulho sem animação.
            this.play(randomAttackAnimationKey(this.typeKey), true);
        } else if (this.batState === 'returning') {
            // Subida: velocidade fixa para sair do mergulho e voltar à altura de
            // cruzeiro.
            this.setVelocityX(BAT_BEHAVIOR.RETURN_SPEED_X * dir);
            this.setVelocityY(BAT_BEHAVIOR.RETURN_SPEED_Y);

            // Quando volta à altura de cruzeiro, encerrar ataque.
            if (this.y <= this.cruiseY + 20) {
                this.batState = 'cruise';
            }

            this.play(`${this.typeKey}-walk`, true);
        }

        this.wavePhase += this.scene.game.loop.delta * BAT_BEHAVIOR.WAVE_FREQUENCY;
    }
}
