import { Math as PhaserMath, Physics, Scene } from 'phaser';

import { ENEMY_ATTACK_IMPACT_DELAY_MS, randomAttackAnimationKey } from '../combat/attack-variants';
import { DamageSource } from '../damage/damage';
import { Health } from '../damage/Health';
import { EnemyType, ENEMY_STATS } from '../damage/health-config';
import { isPathBlocked } from '../world/line-of-sight';
import { Player } from './Player';
import { syncFacingOffset } from './physics-utils';
import { PLAYER_PARRY } from './player-config';

export type EnemyState = 'patrol' | 'chase' | 'attack' | 'hurt' | 'dead';

type EnemyTypeStats = (typeof ENEMY_STATS)[EnemyType];

// Classe base de inimigo: concentra tudo que é comportamento comum (vida,
// corpo, patrulha, perseguir o jogador dentro de um raio, atacar quando perto
// o bastante, reagir a dano e morrer). Subclasses (Graverobber, Steamman) só
// informam o tipo/estatísticas — nenhuma delas precisa reimplementar chase,
// ataque ou dano.
export abstract class BaseEnemy extends Physics.Arcade.Sprite {
    protected readonly stats: EnemyTypeStats;
    protected readonly typeKey: EnemyType;
    protected readonly target: Player;

    // --- Ganchos para subclasses -------------------------------------------
    // Voador: o corpo nasce sem gravidade e a subclasse controla os dois eixos
    // (ver Bat). Precisa ser lido no construtor, então é um método e não um
    // campo: um campo de subclasse ainda não foi inicializado nesse momento.
    protected isFlying(): boolean {
        return false;
    }

    // Enquanto true, takeHit é ignorado por completo — nem dano, nem knockback,
    // nem piscada. É o ouriço enrolado na bola de espinhos.
    protected isDamageImmune(): boolean {
        return false;
    }

    private readonly health: Health;

    private enemyState: EnemyState = 'patrol';
    protected direction = 1;
    protected patrolMinX: number;
    protected patrolMaxX: number;

    private isPaused = false;
    private pauseTimer: number;

    private hurtTimer = 0;
    protected attackCooldownUntil = 0;

    // Garante que o inimigo não receba mais de um dano no mesmo frame (várias
    // hitboxes/contatos resolvidos no mesmo tick).
    private lastDamageFrame = -1;

    protected constructor(
        scene: Scene,
        x: number,
        y: number,
        typeKey: EnemyType,
        target: Player,
        stats: EnemyTypeStats = ENEMY_STATS[typeKey],
        scale = 3
    ) {
        super(scene, x, y, `${typeKey}-idle`, 0);

        this.typeKey = typeKey;
        this.stats = stats;
        this.target = target;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setScale(scale);

        this.health = new Health(this.stats.hp, { defense: this.stats.defense, resistance: this.stats.resistance });

        // Dimensões medidas a partir do bounding box real do sprite de cada
        // tipo (ver ENEMY_STATS[type].body), em vez de um corpo genérico.
        this.body!.setSize(this.stats.body.width, this.stats.body.height);
        this.body!.setOffset(this.stats.body.offsetX, this.stats.body.offsetY);

        this.setCollideWorldBounds(true);

        if (this.isFlying()) {
            (this.body as Physics.Arcade.Body).setAllowGravity(false);
        }

        const worldWidth = scene.physics.world.bounds.width;
        this.patrolMinX = Math.max(0, x - 180);
        this.patrolMaxX = Math.min(worldWidth, x + 180);

        this.direction = PhaserMath.RND.pick([-1, 1]);
        this.pauseTimer = PhaserMath.Between(1600, 3600);
    }

    get currentState(): EnemyState {
        return this.enemyState;
    }

    get isAlive(): boolean {
        return this.enemyState !== 'dead';
    }

    // Dano que o jogador sofre ao encostar neste inimigo (fallback passivo;
    // o dano "de verdade" vem do ataque ativo em performAttack).
    get contactDamage(): DamageSource {
        return this.stats.contactDamage;
    }

    get healthInfo(): Health {
        return this.health;
    }

    setPatrolRange(minX: number, maxX: number): this {
        this.patrolMinX = minX;
        this.patrolMaxX = maxX;
        return this;
    }

    update(time: number, delta: number): void {
        if (this.enemyState === 'dead') {
            return;
        }

        if (this.enemyState === 'hurt') {
            this.updateHurt(delta);
            this.syncOffset();
            return;
        }

        const distance = Math.abs(this.target.x - this.x);
        const combat = this.stats.combat;
        // Alcance é medido na horizontal; sem checar a altura, um inimigo numa
        // saliência perseguiria e acertaria quem está muito abaixo dele.
        const sameLevel = Math.abs(this.target.y - this.y) <= combat.verticalRange;

        if (this.target.isDead || !sameLevel) {
            // Sem alvo vivo (ou com o alvo noutro nível), volta a patrulhar em
            // vez de ficar plantado.
            this.updatePatrol(delta);
        } else if (distance <= combat.attackRange) {
            this.updateAttack(time);
        } else if (distance <= combat.aggroRange) {
            this.updateChase();
        } else {
            this.updatePatrol(delta);
        }

        this.syncOffset();
    }

    // Recebe dano de um ataque (com knockback e direção). Retorna o dano aplicado
    // ou 0 se o golpe foi ignorado (mesmo frame ou inimigo já morto).
    takeHit(source: DamageSource, direction: number): number {
        if (this.enemyState === 'dead') {
            return 0;
        }

        // Imunidade total (ouriço em bola). Devolver 0 faz a cena tratar o
        // golpe como não aplicado: sem hit-stop, sem shake, sem marcar o alvo
        // como já atingido — o jogador sente que bateu em pedra e pode tentar
        // de novo assim que ele desenrolar.
        if (this.isDamageImmune()) {
            return 0;
        }

        const frame = this.scene.game.getFrame();
        if (frame === this.lastDamageFrame) {
            return 0;
        }
        this.lastDamageFrame = frame;

        const damage = this.health.takeDamage(source);
        if (damage <= 0) {
            return 0;
        }

        const body = this.arcadeBody;

        if (this.health.isDead) {
            this.die(direction, source);
        } else {
            this.enemyState = 'hurt';
            this.hurtTimer = 220;

            // Knockback: o impulso vertical negativo evita que a gravidade o
            // prenda no chão durante o recuo.
            body.setVelocity(
                (source.knockbackX ?? 0) * direction,
                source.knockbackY ?? -120
            );
            this.setTint(0xff7d6e);
            this.setTintFill();
            this.play(`${this.typeKey}-idle`, true);
        }

        return damage;
    }

    // Reação a um golpe DEFENDIDO pelo jogador (parry, tecla Q): a mesma
    // reação visual de dano, mas sem tirar vida, mais uma janela sem poder
    // atacar. Ignora de propósito isDamageImmune(): defender é justamente a
    // resposta ao ouriço enrolado, que nenhum golpe machuca.
    stagger(durationMs: number): void {
        if (this.enemyState === 'dead') {
            return;
        }

        this.enemyState = 'hurt';
        this.hurtTimer = 220;
        this.attackCooldownUntil = this.scene.time.now + durationMs;

        // Recuo na direção contrária ao jogador, para a defesa abrir espaço.
        const away = this.x >= this.target.x ? 1 : -1;
        this.arcadeBody.setVelocity(PLAYER_PARRY.staggerKnockbackX * away, PLAYER_PARRY.staggerKnockbackY);

        this.setTint(0xfff2a8);
        this.setTintFill();
        this.play(`${this.typeKey}-idle`, true);
    }

    protected get arcadeBody(): Physics.Arcade.Body {
        return this.body as Physics.Arcade.Body;
    }

    protected syncOffset(): void {
        syncFacingOffset(this.arcadeBody, this.flipX, this.stats.body);
    }

    protected updatePatrol(delta: number): void {
        this.pauseTimer -= delta;

        if (this.isPaused) {
            this.setVelocityX(0);
            this.setFlipX(this.direction < 0);
            this.play(`${this.typeKey}-idle`, true);

            if (this.pauseTimer <= 0) {
                this.isPaused = false;
                this.direction = this.direction === 1 ? -1 : 1;
                this.pauseTimer = PhaserMath.Between(1800, 4000);
            }

            return;
        }

        if (this.x <= this.patrolMinX) {
            this.direction = 1;
        }
        else if (this.x >= this.patrolMaxX) {
            this.direction = -1;
        }

        this.setVelocityX(this.stats.patrolSpeed * this.direction);
        this.setFlipX(this.direction < 0);
        this.play(`${this.typeKey}-walk`, true);

        if (this.pauseTimer <= 0) {
            this.isPaused = true;
            this.pauseTimer = PhaserMath.Between(800, 1800);
        }
    }

    // Persegue o alvo em linha reta dentro do raio de agro. Sai do estado de
    // pausa da patrulha (não faz sentido continuar "descansando" perseguindo).
    protected updateChase(): void {
        this.isPaused = false;

        const dir = this.target.x >= this.x ? 1 : -1;
        this.direction = dir;

        this.setVelocityX(this.stats.combat.chaseSpeed * dir);
        this.setFlipX(dir < 0);
        this.play(`${this.typeKey}-walk`, true);
    }

    // Planta (para de andar) e golpeia o alvo quando o cooldown permite,
    // tocando uma das 3 variantes de animação de ataque do tipo (sorteada em
    // attack-variants.ts). Enquanto o golpe está tocando não reinicia nem
    // troca pra idle — só decide de novo quando a animação termina.
    protected updateAttack(time: number): void {
        const dir = this.target.x >= this.x ? 1 : -1;
        this.direction = dir;

        this.setVelocityX(0);
        this.setFlipX(dir < 0);

        if (this.isPlayingAttackAnimation()) {
            return;
        }

        if (time >= this.attackCooldownUntil) {
            this.attackCooldownUntil = time + this.stats.combat.cooldownMs;
            this.performAttack(dir);
        } else {
            this.play(`${this.typeKey}-idle`, true);
        }
    }

    protected isPlayingAttackAnimation(): boolean {
        const key = this.anims.currentAnim?.key;
        return !!key && key.startsWith(`${this.typeKey}-attack-`) && this.anims.isPlaying;
    }

    protected performAttack(direction: number): void {
        this.play(randomAttackAnimationKey(this.typeKey));

        // Sincroniza o dano com o instante aproximado do golpe em vez de
        // aplicar no frame 0 da animação (mesma ideia da hitbox temporal do
        // player, mas sem precisar de uma hitbox física própria pro inimigo).
        this.scene.time.delayedCall(ENEMY_ATTACK_IMPACT_DELAY_MS, () => {
            if (this.enemyState === 'dead' || this.enemyState === 'hurt') {
                return;
            }

            // Só acerta se o jogador ainda estiver por perto no instante do
            // impacto (evita golpe fantasma em quem já se afastou), no mesmo
            // nível, e sem parede no caminho — o golpe não pode atravessar o
            // que o corpo do inimigo não atravessa.
            const stillInRange =
                Math.abs(this.target.x - this.x) <= this.stats.combat.attackRange + 20 &&
                Math.abs(this.target.y - this.y) <= this.stats.combat.verticalRange;
            if (!stillInRange) {
                return;
            }

            if (isPathBlocked(this.scene, this.x, this.y, this.target.x, this.target.y)) {
                return;
            }

            const source: DamageSource = {
                amount: this.stats.combat.amount,
                kind: this.stats.combat.kind,
                knockbackX: this.stats.combat.knockbackX,
                knockbackY: this.stats.combat.knockbackY
            };

            this.target.takeDamage(source, direction, this);
        });
    }

    private updateHurt(delta: number): void {
        // Durante o estado hurt a física continua, mantendo o recuo. Ao fim da
        // janela o inimigo volta a decidir patrulha/perseguição/ataque.
        this.hurtTimer -= delta;
        if (this.hurtTimer <= 0) {
            this.enemyState = 'patrol';
            this.clearTint();
        }
    }

    private die(direction: number, source: DamageSource): void {
        this.enemyState = 'dead';
        this.setTint(0xffd6d6);
        this.setTintFill();

        const body = this.arcadeBody;
        body.enable = false;

        // Reação de morte com recuo do golpe para vender o impacto.
        const recoil = source.knockbackX ? Math.sign(source.knockbackX) * 36 : 36;

        this.scene.tweens.add({
            targets: this,
            x: this.x + direction * recoil,
            y: this.y - 18,
            alpha: 0,
            duration: 220,
            ease: 'Quad.out',
            onComplete: () => this.destroy()
        });
    }
}
