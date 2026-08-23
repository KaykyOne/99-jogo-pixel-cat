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

// Escalada agarrada (ver PlayerClimb). A descida é mais rápida que a subida
// para o retorno não ser arrastado. O mantle precisa erguer o corpo inteiro
// (34 * 3 = 102 px) acima da borda: 600 px/s com gravidade 1400 sobem ~128 px.
export const PLAYER_CLIMB = {
    upSpeed: 190,
    downSpeed: 260,
    mantleVelocityY: -600,
    mantlePushX: 120,
    // Empurrão constante contra a parede que mantém o contato vivo (ver
    // PlayerClimb). ~1px por frame, anulado pela separação do collider.
    wallStickSpeed: 60
} as const;

// Parry (tecla Q). É uma POSTURA sustentada: fica ativa enquanto Q estiver
// pressionado, sem limite de tempo. O custo não é a duração e sim a
// imobilidade — defendendo, o jogador não anda, não pula e não ataca, então
// segurar Q para sempre trava o avanço em vez de ganhar a luta.
export const PLAYER_PARRY = {
    // Tempo travado depois de SOLTAR a tecla. É a brecha para o inimigo: não
    // dá para largar a defesa e atacar no mesmo instante.
    recoveryMs: 220,
    // Contado a partir da soltura, não do toque — senão bastaria soltar e
    // apertar de novo para ter defesa contínua sem nenhuma abertura.
    cooldownMs: 900,

    // Quanto tempo o inimigo defendido fica sem atacar. Pedido do design: 2s.
    staggerMs: 2000,

    // Recuo aplicado a quem teve o golpe defendido.
    staggerKnockbackX: 260,
    staggerKnockbackY: -180
} as const;
