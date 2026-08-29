import { Math as PhaserMath, Scene } from 'phaser';

import { isPathBlocked } from '../../world/line-of-sight';
import { BaseEnemy } from '../BaseEnemy';
import { createEnemy } from '../enemy-factory';
import { Player } from '../Player';
import { BossBase } from './BossBase';
import { BOSSES, FOREST_BOSS_BEHAVIOR } from './boss-config';

// Boss 1 — floresta. Corpo-a-corpo pesado, sem nenhum tiro: a luta inteira é
// sobre distância. Ele atravessa a arena numa investida e cai de cima com uma
// onda de impacto; a resposta a ambos é a mesma (sair da linha), o que faz a
// luta ensinar uma coisa só, bem feita.
export class ForestBoss extends BossBase {
    // Cada padrão só acerta UMA vez. Sem estes controles a investida aplicaria
    // dano a cada frame em que encostasse no jogador.
    private chargeHitApplied = false;
    private chargeDirection = 1;
    private chargeStartX = 0;

    private leapLaunched = false;
    private shockwaveDone = false;

    // Reforços invocados na fase 2. Guardados para a cena poder adotá-los —
    // um inimigo que a fase não conhece não recebe collider nem conta para o
    // "fase limpa", e o portal nunca abriria.
    private pendingSummons: BaseEnemy[] = [];

    // Todos os invocados já criados (a cena adota os de `pendingSummons` e
    // esvazia aquela lista). Serve para contar quantos continuam VIVOS.
    private spawnedSummons: BaseEnemy[] = [];

    constructor(scene: Scene, x: number, y: number, target: Player) {
        super(scene, x, y, BOSSES.forest, target);
    }

    // A cena recolhe os invocados a cada frame. Devolver e limpar (em vez de
    // deixar a lista crescer) evita a cena registrar o mesmo inimigo duas vezes.
    collectSummons(): BaseEnemy[] {
        const summons = this.pendingSummons;
        this.pendingSummons = [];
        return summons;
    }

    protected onPatternStart(patternId: string): void {
        switch (patternId) {
            case 'charge':
                this.chargeHitApplied = false;
                this.chargeDirection = this.facingDirection;
                this.chargeStartX = this.x;
                this.setFlipX(this.chargeDirection < 0);
                this.play(`${this.artAnimationPrefix}-attack-2`, true);
                break;

            case 'leap':
                this.leapLaunched = false;
                this.shockwaveDone = false;
                break;

            case 'summon':
                this.summonReinforcements();
                break;
        }
    }

    protected onPatternUpdate(patternId: string, _delta: number): void {
        if (patternId === 'charge') {
            this.updateCharge();
            return;
        }

        if (patternId === 'leap') {
            this.updateLeap();
        }
    }

    protected onPatternEnd(patternId: string): void {
        if (patternId === 'charge') {
            this.setVelocityX(0);
        }
    }

    protected onEnterPhase2(): void {
        // Chamado uma vez no limiar de 50%: a virada de fase já entra com o
        // primeiro grupo de reforços, para o beat ser sentido na hora.
        this.summonReinforcements();
    }

    // --- Investida ----------------------------------------------------------
    private updateCharge(): void {
        const travelled = Math.abs(this.x - this.chargeStartX);
        const blocked =
            this.chargeDirection === 1 ? this.arcadeBody.blocked.right : this.arcadeBody.blocked.left;

        if (travelled >= FOREST_BOSS_BEHAVIOR.chargeMaxDistance || blocked) {
            this.setVelocityX(0);
            return;
        }

        this.setVelocityX(FOREST_BOSS_BEHAVIOR.chargeSpeed * this.chargeDirection);
        this.play(`${this.artAnimationPrefix}-attack-2`, true);

        if (this.chargeHitApplied) {
            return;
        }

        if (this.distanceToTarget > FOREST_BOSS_BEHAVIOR.chargeHitRange) {
            return;
        }

        this.chargeHitApplied = true;
        this.target.takeDamage(
            FOREST_BOSS_BEHAVIOR.chargeDamage,
            this.chargeDirection,
            this
        );
    }

    // --- Salto com onda de impacto ------------------------------------------
    private updateLeap(): void {
        if (!this.leapLaunched) {
            this.leapLaunched = true;
            const direction = this.facingDirection;
            this.setFlipX(direction < 0);
            // Impulso direto no corpo: setVelocityX passa pelo fator de
            // lentidão do gelo, e um salto pela metade deixaria o boss
            // pendurado no meio do caminho sem nunca aterrissar.
            this.arcadeBody.setVelocity(
                FOREST_BOSS_BEHAVIOR.leapSpeedX * direction,
                FOREST_BOSS_BEHAVIOR.leapVelocityY
            );
            this.play(`${this.artAnimationPrefix}-attack-3`, true);
            return;
        }

        if (this.shockwaveDone) {
            return;
        }

        // Tocar o chão na descida é o gatilho. Testar só `blocked.down`
        // dispararia no frame do lançamento, quando ele ainda está apoiado.
        if (this.arcadeBody.velocity.y >= 0 && this.arcadeBody.blocked.down) {
            this.shockwaveDone = true;
            this.releaseShockwave();
        }
    }

    private releaseShockwave(): void {
        const { shockwaveRadius, shockwaveDamage, shockwaveVerticalRange } = FOREST_BOSS_BEHAVIOR;

        const ring = this.scene.add.circle(this.x, this.y + 40, 24, 0xd8cfae, 0.5).setDepth(14);
        this.scene.tweens.add({
            targets: ring,
            radius: shockwaveRadius,
            alpha: 0,
            duration: 340,
            ease: 'Quad.out',
            onComplete: () => ring.destroy()
        });
        this.scene.cameras.main.shake(260, 0.012);

        // A onda corre pelo CHÃO: quem está no ar escapa. É essa regra que dá
        // ao jogador uma esquiva de verdade em vez de um dano inevitável.
        const horizontal = Math.abs(this.target.x - this.x);
        const vertical = this.target.y - this.y;
        if (horizontal > shockwaveRadius || vertical < -shockwaveVerticalRange) {
            return;
        }

        if (isPathBlocked(this.scene, this.x, this.y, this.target.x, this.target.y)) {
            return;
        }

        const direction = this.target.x >= this.x ? 1 : -1;
        this.target.takeDamage(shockwaveDamage, direction, this);
    }

    // --- Reforços (fase 2) --------------------------------------------------
    private summonReinforcements(): void {
        const { summonCount, summonSpreadX, maxAliveSummons } = FOREST_BOSS_BEHAVIOR;
        const worldWidth = this.scene.physics.world.bounds.width;

        // O padrão de invocação volta ao rodízio a cada ciclo da fase 2. Sem o
        // teto, cada volta somava duas aranhas às que ainda estavam vivas.
        this.spawnedSummons = this.spawnedSummons.filter(summon => summon.active && summon.isAlive);
        const room = maxAliveSummons - this.spawnedSummons.length;
        if (room <= 0) {
            return;
        }

        const total = Math.min(summonCount, room);
        for (let index = 0; index < total; index++) {
            // Um de cada lado, para o jogador não conseguir posicionar-se de
            // forma a nunca ver os dois.
            const side = index % 2 === 0 ? -1 : 1;
            // PhaserMath, e não `Phaser.Math`: o jogo importa Phaser como módulo
            // ES, então NÃO existe global `Phaser` em runtime. O TypeScript aceita
            // (o namespace é declarado globalmente nos tipos) e o erro só
            // aparecia ao vivo, na virada para a fase 2 — a exceção estourava a
            // cada frame dentro do update da cena e travava o jogo.
            const x = PhaserMath.Clamp(this.x + side * summonSpreadX, 120, worldWidth - 120);

            const summon = createEnemy(this.scene, 'spider', x, this.y - 60, this.target);
            summon.setDepth(15);
            summon.setPatrolRange(Math.max(60, x - 200), Math.min(worldWidth - 60, x + 200));
            this.pendingSummons.push(summon);
            this.spawnedSummons.push(summon);

            // Nascem com um clarão: aparecer do nada, sem aviso, leria como bug.
            const spark = this.scene.add.circle(x, this.y - 60, 10, 0xb8cc84, 0.6).setDepth(19);
            this.scene.tweens.add({
                targets: spark,
                radius: 70,
                alpha: 0,
                duration: 320,
                ease: 'Quad.out',
                onComplete: () => spark.destroy()
            });
        }
    }
}
