import { Scene } from 'phaser';

import { ENEMY_ATTACK_IMPACT_DELAY_MS } from '../combat/attack-variants';
import { ProjectileManager } from '../combat/Projectile';
import { ENEMY_STATS } from '../damage/health-config';
import { isPathBlocked } from '../world/line-of-sight';
import { BaseEnemy } from './BaseEnemy';
import { Player } from './Player';

// Comportamento da lhama: recua quando o jogador chega perto, mantendo
// distância para atirar com segurança. Frágil de perto, forte de longe.
const LLAMA_BEHAVIOR = {
    // Distância mínima confortável; se o jogador encosta nela, ela recua.
    // Corresponde a aproximadamente 5 larguras de corpo (24px) + espaço extra.
    retreatRange: 160,
    // Velocidade de recuo é maior que a velocidade de patrulha para o
    // comportamento ser visível: ela "sai correndo" em vez de andar.
    retreatSpeed: 160
} as const;

export class Llama extends BaseEnemy {

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, 'llama', target, ENEMY_STATS.llama);
    }

    // Sobrescreve updateAttack para implementar comportamento de recuo.
    // Se o jogador estiver dentro de RETREAT_RANGE, a lhama recua em vez de
    // atacar no mesmo lugar.
    protected updateAttack(time: number): void {
        const distance = Math.abs(this.target.x - this.x);

        // Jogador está perto demais: entra em modo recuo.
        if (distance < LLAMA_BEHAVIOR.retreatRange) {
            this.updateRetreat(time);
            return;
        }

        // Volta ao ataque normal: planta e atira.
        super.updateAttack(time);
    }

    // Caminha para longe do jogador (de costas), continuando a encarar o alvo.
    // Respira o cooldown enquanto recua se o tempo permitir.
    private updateRetreat(time: number): void {

        const dir = this.target.x >= this.x ? 1 : -1;
        // Ela recua em direção OPOSTA ao jogador, mas continua virada pro alvo.
        const retreatDir = -dir;

        // Respeita os limites de patrulha: recua até o máximo, depois para.
        const nextX =
            this.x + retreatDir * LLAMA_BEHAVIOR.retreatSpeed * (this.scene.game.loop.delta / 1000);
        const withinBounds =
            nextX >= this.patrolMinX && nextX <= this.patrolMaxX;

        if (withinBounds) {
            this.setVelocityX(LLAMA_BEHAVIOR.retreatSpeed * retreatDir);
        } else {
            // Encurralada no limite: para de andar, só atira.
            this.setVelocityX(0);
        }

        // Virada para o ALVO enquanto anda de costas (flipX segue o alvo, não o
        // movimento). Deste jeito ela parece estar "olhando" pro jogador enquanto
        // sai correndo.
        this.setFlipX(dir < 0);

        // Só volta para a animação de caminhada se NÃO houver um golpe tocando:
        // sem esta guarda, o walk era retomado no frame seguinte ao disparo e a
        // animação de cuspir nunca aparecia.
        if (!this.isPlayingAttackAnimation()) {
            this.play(`${this.typeKey}-walk`, true);
        }

        // Se o cooldown permitir, tira um tiro enquanto recua.
        if (time >= this.attackCooldownUntil) {
            this.attackCooldownUntil = time + this.stats.combat.cooldownMs;
            this.performAttack(dir);
        }
    }

    protected performAttack(direction: number): void {
        this.play(`${this.typeKey}-attack-1`);

        // Dispara o projétil no meio da animação (300ms), sincronizado com o
        // instante de impacto visual. Vê a descrição no BaseEnemy.
        this.scene.time.delayedCall(ENEMY_ATTACK_IMPACT_DELAY_MS, () => {
            if (this.currentState === 'dead' || this.currentState === 'hurt') {
                return;
            }

            // Dupla checagem: alvo ainda por perto e sem parede no caminho.
            const stillInRange =
                Math.abs(this.target.x - this.x) <= this.stats.combat.attackRange + 20 &&
                Math.abs(this.target.y - this.y) <= this.stats.combat.verticalRange;
            if (!stillInRange) {
                return;
            }

            if (isPathBlocked(this.scene, this.x, this.y, this.target.x, this.target.y)) {
                return;
            }

            // Lido direto do catálogo do próprio tipo: `this.stats` é a união de
            // todos os inimigos e o TypeScript não sabe que esta é a lhama, então
            // por ali só daria com cast. ENEMY_STATS.llama.projectile já vem com o
            // tipo exato.
            const projectiles = this.scene.registry.get('projectiles') as ProjectileManager | undefined;
            projectiles?.spawn(this.x, this.y - 10, direction, ENEMY_STATS.llama.projectile, {
                amount: this.stats.combat.amount,
                kind: this.stats.combat.kind,
                knockbackX: this.stats.combat.knockbackX,
                knockbackY: this.stats.combat.knockbackY
            }, this);
        });
    }
}
