import { Physics } from 'phaser';

import { DamageKind, DamageSource } from '../damage/damage';

// Um ataque é uma definição de dados. Ter isto desacoplado da entidade Player
// permite catalogar armas, golpes e combos sem alterar o Player.
export type AttackDefinition = {
    id: string;
    cooldownMs: number;

    // Dano e reação aplicados ao atingido.
    damage: number;
    knockbackX: number;
    knockbackY: number;

    hitbox: HitboxDefinition;

    // Chave da animação do jogador para este golpe. Ausente = sorteia entre as
    // variantes (comportamento antigo). O combo usa uma variante fixa por
    // golpe: sorteando, dois golpes seguidos podiam sair idênticos e a
    // sequência deixava de ser legível.
    animationKey?: string;

    // Janela, contada a partir do fim do golpe, em que o próximo golpe da
    // sequência ainda encadeia. Zerada/ausente encerra o combo neste golpe.
    comboWindowMs?: number;

    // Game feel do impacto. Proporcionais ao peso do golpe: o terceiro golpe
    // do combo trava e sacode mais que o primeiro.
    hitStopMs?: number;
    shakeMs?: number;
    shakeIntensity?: number;
};

// Hitbox descrita em unidades de mundo, relativa ao centro do dono do ataque.
// A direção (esquerda/direita) é resolvida em tempo de execução pelo flipX.
export type HitboxDefinition = {
    // Distância do centro do dono até o centro da hitbox (sempre para a "frente").
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;

    // Frames da animação em que a hitbox fica ativa, inclusive. Torna o golpe
    // temporal: só acerta no instante visual do impacto.
    activeStartFrame: number;
    activeEndFrame: number;
};

// Evento de impacto emitido pelo sistema de combate. A cena escuta este evento
// para aplicar dano, knockback, hit-stop e screen shake, sem depender do Player.
export type ImpactResult = {
    attackId: string;
    target: Physics.Arcade.Sprite;
    damage: number;
    knockbackX: number;
    knockbackY: number;

    // Direção do golpe: 1 = direita, -1 = esquerda.
    hitDirection: number;
};

// Descrição de um projétil, usada tanto pelos inimigos (via
// ENEMY_STATS[...].projectile, que é um subconjunto desta forma) quanto pelo
// arco e pelas magias do jogador. Um tipo só evita dois sistemas de tiro
// paralelos fazendo quase a mesma coisa.
export type ProjectileConfig = {
    textureKey: string;
    speed: number;
    lifespanMs: number;
    // Tiro em arco (cusparada, flecha) versus reto (teia, projétil arcano).
    gravity: boolean;

    // Empurrão inicial para cima em tiro com gravidade. A flecha usa um valor
    // bem menor que a cusparada: ela é rápida e quase reta, só cai um pouco no
    // fim do voo.
    launchVelocityY?: number;

    // Lentidão aplicada a quem for atingido. Ausente = só dano.
    slowFactor?: number;
    slowDurationMs?: number;

    // --- Exclusivos das magias -----------------------------------------------
    // Ao ser consumido, explode e atinge todo mundo neste raio.
    explosionRadius?: number;
    // Aceleração (px/s²) com que persegue o inimigo vivo mais próximo.
    homingAccel?: number;
    // Escala do sprite. Ausente = 1.
    scale?: number;
};

// Quem um projétil do jogador pode atingir. Declarado como forma estrutural
// (mesmo truque de Parryable) porque importar BaseEnemy aqui fecharia o ciclo
// BaseEnemy -> Player -> PlayerWeapons -> Projectile -> BaseEnemy.
export type ProjectileTarget = Physics.Arcade.Sprite & {
    readonly isAlive: boolean;
    takeHit(source: DamageSource, direction: number): number;
    applyChill(factor: number, durationMs: number): void;
};

// Time do projétil: define contra quem ele testa colisão. Sem isto, a flecha
// do jogador machucaria o próprio jogador.
export type ProjectileTeam = 'player' | 'enemy';

export type { DamageKind };