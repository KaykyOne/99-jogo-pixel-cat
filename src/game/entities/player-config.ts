// Corpo de colisão do jogador, medido a partir do sprite real (frames de
// 48x48). O silhueta parado/andando ocupa ~26x34 px de fonte, alinhada aos
// pés (y até 48); o corpo antigo (42x42) cobria quase o frame inteiro,
// causando colisões/contato com inimigo muito maiores que o desenho.
export const PLAYER_BODY = {
    width: 26,
    height: 34,
    offsetX: 1,
    offsetY: 14
} as const;

// Parâmetros centralizados da movimentação do jogador.
// Acelerações estão em px/s², velocidades em px/s e tempos em ms.
export const PLAYER_MOVEMENT = {
    // Horizontal no chão.
    maxSpeed: 320,
    groundAcceleration: 2400,
    groundDeceleration: 3400,
    groundTurnAcceleration: 3800,

    // Horizontal no ar (controle levemente menor que no chão).
    airAcceleration: 1800,
    airDeceleration: 600,
    airTurnAcceleration: 2600,

    // Vertical.
    jumpVelocity: -620,
    jumpCutMultiplier: 0.45,
    maxFallSpeed: 900,
    fastFallAcceleration: 800,

    // Janelas de tempo.
    coyoteTime: 110,
    jumpBufferTime: 130
} as const;

// O dash mantém uma trajetória reta, inclusive quando iniciado no ar.
export const PLAYER_DASH = {
    speed: 780,
    durationMs: 200,
    cooldownMs: 2000,
    freezeGravityDuringDash: true
} as const;
