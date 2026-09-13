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
// para o retorno não ser arrastado.
export const PLAYER_CLIMB = {
    // Velocidade máxima agarrado na parede (px/s).
    upSpeed: 150,
    downSpeed: 220,
    // Aceleração até essa velocidade (px/s²): arranca e para macio, em vez de
    // sair na velocidade cheia no primeiro frame.
    acceleration: 900,
    // Folga (px) entre o topo do corpo e a borda em que as mãos "pegam" a
    // borda e começa a subida por cima dela.
    ledgeGrabOffset: 6,
    // Subida por cima da borda em duas etapas, movida por velocidade (nada de
    // setPosition, que era o teletransporte): 1) ergue o corpo até os pés
    // passarem da borda, desacelerando no fim; 2) desliza para cima da
    // plataforma.
    mantleRiseSpeed: 170,
    mantleRiseMinSpeed: 70,
    // Quanto a subida desacelera perto do fim: velocidade = distância * isto.
    mantleRiseEase: 6,
    mantleOverSpeed: 120,
    // Rede de segurança: se algo (um teto baixo) impedir a subida de terminar,
    // larga a parede depois deste tempo em vez de travar o jogador.
    mantleTimeoutMs: 1200,
    // Depois de subir na borda, quanto tempo a parede fica "surda" para um
    // novo agarre — senão a tecla ainda pressionada prende de novo na mesma
    // parede e o jogador não consegue sair de cima dela.
    regripBlockMs: 260,
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
