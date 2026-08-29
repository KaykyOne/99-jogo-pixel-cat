import { DamageKind } from '../damage/damage';
import { AttackDefinition, ProjectileConfig } from './types';

// Catálogo de armas. Mesmo espírito de ATTACKS: dado puro, sem nenhuma lógica.
// Quem resolve o que cada arma faz é PlayerWeapons; quem executa o golpe
// corpo-a-corpo continua sendo PlayerCombat.
export type WeaponId = 'sword' | 'bow' | 'staff';
export type WeaponKind = 'melee' | 'ranged' | 'magic';

// Tiro de arma à distância do jogador (arco). As magias têm catálogo próprio
// (spells.ts) porque carregam custo de mana e efeito, que uma flecha não tem.
export type WeaponShot = {
    projectile: ProjectileConfig;
    damage: number;
    kind: DamageKind;
    knockbackX: number;
    knockbackY: number;

    // Altura do ponto de saída em relação ao centro do jogador (negativo sobe).
    muzzleOffsetY: number;
    // Espera até o tiro sair, sincronizada com o meio da animação — a mesma
    // ideia do ENEMY_ATTACK_IMPACT_DELAY_MS dos inimigos.
    releaseDelayMs: number;
};

export type WeaponDefinition = {
    id: WeaponId;
    name: string;
    kind: WeaponKind;

    // Cooldown base da arma. Para a espada é o descanso APÓS o combo inteiro;
    // cada golpe tem o seu próprio em AttackDefinition.cooldownMs.
    cooldownMs: number;

    // Se o golpe sai no ar. É dado da ARMA, e não uma regra fixa do Player:
    // a espada e o arco funcionam pulando, o cajado exige os pés no chão para
    // a magia continuar tendo um custo de posicionamento.
    allowAirborne: boolean;

    // Chave da animação usada quando não há golpe de combo definindo a sua
    // (arco e cajado não têm arte própria: reaproveitam uma das 3 variantes de
    // golpe do jogador, como toda a arte deste projeto já faz).
    castAnimationKey: string;
    // Duração do travamento durante o disparo/conjuração.
    castLockMs: number;

    // Sequência de golpes corpo-a-corpo. Só armas 'melee'.
    combo?: AttackDefinition[];
    // Parâmetros do projétil. Só armas 'ranged'.
    shot?: WeaponShot;
};

// Hitbox da espada. Herdada da medição do machado original: a arma só se
// estende de fato no frame 4 da animação de 6 frames, cobrindo de 13 a 63px de
// mundo à frente do centro do jogador. Alcance CURTO de propósito — é o preço
// de ter o menor cooldown do arsenal.
const SWORD_HITBOX = {
    offsetX: 38,
    offsetY: 6,
    width: 50,
    height: 66,
    activeStartFrame: 4,
    activeEndFrame: 5
} as const;

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
    // --- Espada -------------------------------------------------------------
    // Substitui o antigo golpe `basic` (o machado). Três golpes encadeados com
    // dano e recuo crescentes: o primeiro é rápido e barato, o terceiro é o que
    // arremessa. A recompensa por encadear é o dano; o risco é que o terceiro
    // golpe tem o maior tempo de recuperação de todos.
    sword: {
        id: 'sword',
        name: 'Espada',
        kind: 'melee',
        cooldownMs: 380,
        allowAirborne: true,
        castAnimationKey: 'player-attack-1',
        castLockMs: 0,

        combo: [
            {
                id: 'sword-1',
                // Cooldown curto: é o que faz o primeiro golpe parecer leve.
                cooldownMs: 240,
                damage: 1,
                knockbackX: 170,
                knockbackY: -130,
                hitbox: { ...SWORD_HITBOX },
                animationKey: 'player-attack-1',
                comboWindowMs: 320,
                hitStopMs: 45,
                shakeMs: 80,
                shakeIntensity: 0.003
            },
            {
                id: 'sword-2',
                cooldownMs: 260,
                damage: 1,
                knockbackX: 210,
                knockbackY: -150,
                // Segundo golpe avança um pouco mais: o combo "ganha terreno".
                hitbox: { ...SWORD_HITBOX, offsetX: 44, width: 56 },
                animationKey: 'player-attack-2',
                comboWindowMs: 340,
                hitStopMs: 60,
                shakeMs: 95,
                shakeIntensity: 0.0045
            },
            {
                id: 'sword-3',
                // O finalizador cobra caro: quase o dobro do descanso dos dois
                // primeiros. Sem isso, encadear seria puro ganho sem risco.
                cooldownMs: 520,
                damage: 2,
                knockbackX: 320,
                knockbackY: -240,
                hitbox: { ...SWORD_HITBOX, offsetX: 46, width: 64, height: 74 },
                animationKey: 'player-attack-3',
                // Sem janela: o combo termina aqui e recomeça do primeiro golpe.
                comboWindowMs: 0,
                hitStopMs: 95,
                shakeMs: 150,
                shakeIntensity: 0.008
            }
        ]
    },

    // --- Arco ---------------------------------------------------------------
    // Reto e rápido, com só um pingo de gravidade para a flecha cair no fim do
    // voo em vez de viajar a fase inteira na horizontal. Dano médio e cooldown
    // bem maior que o da espada: a troca é alcance por cadência.
    bow: {
        id: 'bow',
        name: 'Arco',
        kind: 'ranged',
        cooldownMs: 620,
        allowAirborne: true,
        castAnimationKey: 'player-attack-2',
        castLockMs: 280,

        shot: {
            projectile: {
                textureKey: 'player-arrow',
                speed: 720,
                lifespanMs: 1600,
                gravity: true,
                // Bem menor que os -220 da cusparada da lhama: a flecha é uma
                // linha quase reta que só cede no fim.
                launchVelocityY: -40
            },
            damage: 2,
            kind: 'physical',
            knockbackX: 200,
            knockbackY: -140,
            muzzleOffsetY: -12,
            releaseDelayMs: 160
        }
    },

    // --- Cajado -------------------------------------------------------------
    // Não tem golpe próprio: o que ele dispara é a magia selecionada (ver
    // spells.ts). Exige os pés no chão — conjurar pulando tiraria o único custo
    // de posicionamento que as magias têm.
    staff: {
        id: 'staff',
        name: 'Cajado',
        kind: 'magic',
        cooldownMs: 300,
        allowAirborne: false,
        castAnimationKey: 'player-attack-3',
        castLockMs: 320
    }
};

// Ordem de ciclagem das armas (teclas Z/X/C e o ciclo por evento).
export const WEAPON_ORDER: WeaponId[] = ['sword', 'bow', 'staff'];

export function isWeaponId(value: unknown): value is WeaponId {
    return typeof value === 'string' && value in WEAPONS;
}
