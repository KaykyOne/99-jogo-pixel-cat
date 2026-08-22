# Plano: escalada de parede (wall-slide + wall-jump)

> **Status: superado pelo que foi implementado.** O jogo NÃO usa o
> wall-slide + wall-jump descrito abaixo. `src/game/entities/PlayerClimb.ts`
> implementa escalada agarrada estilo Celeste: segurar o direcional contra a
> parede prende o jogador nela (gravidade desligada), W sobe, S desce, e há
> um mantle automático no topo. A decisão de design #1 daqui foi revertida
> na prática — o wall-slide sozinho não atendia o pedido de "escalar as
> paredes e descer". O restante do documento fica como registro do
> raciocínio original; para o comportamento atual, leia `PlayerClimb.ts`.

## Objetivo

Dar ao jogador uma mecânica leve de escalada: grudar numa parede
marcada como escalável, deslizar mais devagar que numa queda livre, e
dar um pulo de parede pra alcançar a próxima saliência. **Não** é
mantle/ledge-grab completo (subir a borda "de mão" com animação
própria) — é o equivalente a wall-slide + wall-jump de qualquer
metroidvania, suficiente pro parkour "não perfeito" que motivou esse
conjunto de planos. Ver decisão de design #1 pra justificativa de não
ir direto pro ledge-grab.

Depende do tipo `PlatformDef` (campo `climbable`) definido em
`PLATFORM_SYSTEM_FEATURE_PLAN.md`.

## 1. Marcar superfícies escaláveis

Reaproveita o campo `climbable?: boolean` de `PlatformDef` (já
definido no plano de plataformas, ignorado por ele — este plano é quem
consome). Além de plataformas horizontais, escalada também faz
sentido em paredes verticais: o mesmo tipo serve (`width` pequeno,
`height` grande = uma "parede" fina em pé).

Em `buildPhysics()` (já alterado pelo `PLATFORM_SYSTEM_FEATURE_PLAN.md`
pra criar um corpo estático por `PlatformDef` com
`rect.setData('platformDef', platform)`), separar os corpos
escaláveis num grupo à parte, junto de onde os grupos `solidColliders`/
`oneWayColliders` já são montados:

```ts
const climbableColliders = colliders.filter(
    body => (body.gameObject?.getData('platformDef') as PlatformDef | undefined)?.climbable === true
);
```

## 2. Detectar contato com parede escalável

Arcade Physics não expõe "estou encostado nesta parede específica" via
bounds genéricos — precisa de um collider dedicado cujo callback marca
uma flag no componente novo do player:

```ts
this.physics.add.collider(this.player, climbableColliders, () => {
    const body = this.player.body as Physics.Arcade.Body;
    if (body.blocked.left) this.player.climb.markTouchingWall(-1);
    else if (body.blocked.right) this.player.climb.markTouchingWall(1);
});
```

Usar `body.blocked.left`/`body.blocked.right` (não `flipX`) pra saber
de que lado é o contato real — são coisas independentes (o jogador
pode estar de costas pra parede). Isso roda automaticamente dentro do
step de física do Phaser a cada frame, não precisa ser chamado
manualmente em lugar nenhum.

## 3. Componente `PlayerClimb` (novo arquivo `src/game/entities/PlayerClimb.ts`)

Mesmo padrão de composição que `PlayerCombat`/`PlayerDash` já usam — o
`Player` possui uma instância e delega, não vira lógica solta dentro
de `Player.update()`.

```ts
export type ClimbState = 'none' | 'sliding';

export class PlayerClimb {
    private state: ClimbState = 'none';
    private wallDirection: 1 | -1 = 1; // lado da parede em relação ao jogador
    private touchingWallThisFrame = false;

    constructor(
        private scene: Phaser.Scene,
        private owner: Physics.Arcade.Sprite
    ) {}

    get isSliding(): boolean {
        return this.state === 'sliding';
    }

    // Chamado pelo collider dedicado (seção 2), até uma vez por lado por frame.
    markTouchingWall(direction: 1 | -1): void {
        this.touchingWallThisFrame = true;
        this.wallDirection = direction;
    }

    // Chamado uma vez por frame pelo Player.update, depois da física do
    // frame já ter resolvido colisões.
    update(onGround: boolean, holdingIntoWall: boolean): void {
        const shouldSlide = !onGround && this.touchingWallThisFrame && holdingIntoWall;
        this.state = shouldSlide ? 'sliding' : 'none';
        // Reseta pro próximo frame; o collider marca de novo se ainda encostado.
        this.touchingWallThisFrame = false;

        if (this.state === 'sliding') {
            const body = this.owner.body as Physics.Arcade.Body;
            body.setVelocityY(Math.min(body.velocity.y, PLAYER_CLIMB.slideMaxFallSpeed));
        }
    }

    // Chamado quando W é pressionado (JustDown) enquanto isSliding.
    wallJump(): void {
        const body = this.owner.body as Physics.Arcade.Body;
        body.setVelocity(
            PLAYER_CLIMB.jumpPushX * -this.wallDirection, // empurra pra longe da parede
            PLAYER_CLIMB.jumpVelocityY
        );
        this.state = 'none';
    }
}
```

(Pseudocódigo — Codex ajusta imports/tipos reais ao projeto, mas a
estrutura de estado é essa, mesma ressalva que o
`DASH_FEATURE_PLAN-ok.md` já documentou pro dash.)

## 4. Config em `src/game/entities/player-config.ts`

```ts
export const PLAYER_CLIMB = {
    slideMaxFallSpeed: 120, // bem abaixo do maxFallSpeed (900) normal — desliza devagar
    jumpPushX: 420,          // impulso horizontal pra longe da parede
    jumpVelocityY: -560      // similar ao jumpVelocity normal (-620), levemente menor
} as const;
```

## 5. Mudanças em `Player.ts`

- Instanciar `readonly climb: PlayerClimb` no construtor, igual
  `this.dash = new PlayerDash(scene, this)` (`Player.ts:69`).
- No `update()`, decidir `holdingIntoWall` a partir do input
  horizontal atual (`this.keys.right.isDown`/`this.keys.left.isDown`)
  apontando pro mesmo lado da parede — ou seja, só desliza se o
  jogador está segurando o direcional **contra** a parede, não em
  qualquer contato passageiro (evita grudar sem querer ao só passar
  raspando).
- Chamar `this.climb.update(onGround, holdingIntoWall)` no mesmo bloco
  onde `this.dash.update(time)` já roda hoje (`Player.ts:115`).
- Detectar `Input.Keyboard.JustDown(this.keys.up)` enquanto
  `this.climb.isSliding` pra chamar `this.climb.wallJump()` —
  **antes** do `handleJumpQueue()` normal (`Player.ts:130`), e quando
  acontecer, pular a chamada normal de pulo nesse mesmo frame (senão
  os dois competem pela mesma velocidade Y).
- Enquanto `this.climb.isSliding`: bloquear `handleAttack` (mesmo
  padrão de bloqueio que `hurtTimer > 0` e `dash.isDashing` já usam
  hoje), mas **sem** bloquear o dash em si — um dash lateral pra sair
  da parede é um movimento válido (ver decisão de design #2).
- Animação: sem asset de "escalando" — reaproveitar `player-jump` ou
  `player-idle` congelada, mesma solução pragmática já usada pra
  hurt/death (`Player.ts:197-198` e `380-381`, que documentam
  explicitamente "não há asset X, reaproveita Y").

## Atenção pro Codex: ordem de resolução física

`markTouchingWall` é setado pelo callback do collider, que roda dentro
do step de física do Phaser, antes do `update()` das cenas no mesmo
frame (ordem padrão do loop do Phaser) — quando `Player.update()` lê o
estado de `PlayerClimb`, o contato já reflete a colisão deste frame,
sem atraso. Mas se o jogador **não** está mais encostado (saiu da
parede), o collider simplesmente não dispara o callback naquele frame
— por isso `touchingWallThisFrame` precisa ser resetado pra `false` no
**início** de `PlayerClimb.update()` (chamado uma vez por frame pelo
`Player`), e não pode ficar "grudado" em `true` de um frame anterior.

## Decisões de design em aberto

1. **Ledge-grab/mantle completo vs. wall-slide + wall-jump (este
   plano)**: recomendo começar pelo wall-slide/jump — é o padrão mais
   simples e mais testado em metroidvanias 2D, não exige detecção do
   "topo da parede" (bem mais complicada de acertar em Arcade Physics)
   nem asset de animação novo. Ledge-grab fica como extensão futura se
   o resultado não for satisfatório.
2. **Dash permitido durante o wall-slide?** Recomendo sim — dá uma
   opção de escape rápida da parede além do wall-jump; o dash já
   ignora dano de contato, não colisão sólida, então em tese não
   deveria conflitar com a física da parede (testar isso
   especificamente na regressão).
3. **Tecla dedicada vs. reaproveitar W/direcional**: a spec acima
   reaproveita W (pulo) pro wall-jump e o direcional horizontal pra
   "segurar" na parede, sem tecla nova — recomendo manter assim pra
   não precisar mexer no texto de controles do HUD (`controlsText`,
   `Game.ts:508-517`) nem introduzir input novo. Se o design quiser um
   botão dedicado (ex. `Shift`), é uma troca pequena, mas motivo pra
   atualizar o HUD também.
4. **Wall-jumps seguidos entre duas paredes permitem escalar
   infinito?** Sem limite, o jogador pode "ping-pong" entre duas
   paredes próximas indefinidamente pra ganhar altura ilimitada — se
   isso for indesejado, adicionar um cooldown curto (~150-200ms)
   reaproveitando o mesmo padrão de timer que `coyoteTimer`/
   `jumpBufferTimer` já usam em `Player.ts`.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Fases sem nenhuma `PlatformDef` com `climbable: true` (as 6 atuais):
  o jogador nunca entra em `isSliding`, nenhuma mudança de
  comportamento perceptível.
- Encostar numa parede escalável segurando o direcional contra ela
  ativa o slide (queda visivelmente mais lenta); soltar o direcional
  ou tocar o chão cancela.
- W durante o slide empurra o jogador pra longe da parede e pra cima
  (wall-jump), sem travar em loop preso na parede.
- Dash, ataque e dano continuam funcionando normalmente fora do estado
  de slide.
- Pular contra uma parede escalável vindo de um pulo normal não deve
  "grudar" instantaneamente sem querer — só ativa ao cair/deslizar
  encostado nela segurando o direcional.
