# Plano: Dash do jogador

## Objetivo

Adicionar um dash ao jogador, ativado por `Espaço`:
- Impulso rápido na direção em que o personagem está virado (mesmo sentido do `flipX`, igual ao ataque já usa).
- Durante o dash, o jogador **atravessa inimigos sem sofrer dano de contato** (não é dano geral — só ignora o contato com inimigo).
- Depois de usar, entra em cooldown de ~2s antes de poder usar de novo.
- Indicador visual estilo Zelda (bolinha ao lado do personagem): **verde = pronto**, **amarelo = carregando**.
- Usa a animação `Woodcutter_run.png` só como visual do dash — o jogo não ganha uma mecânica de "correr" separada.

## 1. Asset

`public/craftpix-net-127655-free-3-character-sprite-sheets-pixel-art/1 Woodcutter/Woodcutter_run.png` (288×48, 6 frames de 48×48, mesmo padrão de `idle.png`/`walk.png`/`attack.png`) precisa ser copiado para:

```
public/assets/player/run.png
```

(mantendo o padrão de nomes já usado nos outros arquivos de `public/assets/player/`).

Opcional (polish, não bloqueia o resto): `public/craftpix-net-127655.../4 Effects/Run_dust_8x38.png` é um efeito de poeira que pode ser usado como rastro do dash. Pode ficar pra depois.

## 2. Preload e animação

Em `src/game/scenes/PreloadScene.ts`, junto dos outros `this.load.spritesheet('player-...', ...)`:
```ts
this.load.spritesheet('player-run', 'player/run.png', { frameWidth: 48, frameHeight: 48 });
```

Em `src/game/animations/player-animations.ts`, junto das outras `scene.anims.create`:
```ts
scene.anims.create({
    key: 'player-run',
    frames: scene.anims.generateFrameNumbers('player-run', { start: 0, end: 5 }),
    frameRate: 14, // mais rápido que o walk (que usa frameRate padrão do template)
    repeat: -1
});
```

## 3. Config (dados)

Novo objeto em `src/game/entities/player-config.ts`, ao lado de `PLAYER_MOVEMENT`:

```ts
export const PLAYER_DASH = {
    speed: 780,           // px/s, bem acima do maxSpeed (320) do PLAYER_MOVEMENT
    durationMs: 200,       // quanto tempo o impulso dura
    cooldownMs: 2000,      // tempo de "carregando" até poder usar de novo
    freezeGravityDuringDash: true // ver decisão de design #1 abaixo
} as const;
```

## 4. Componente `PlayerDash` (novo arquivo)

Seguir o mesmo padrão de separação já usado no projeto: `PlayerCombat` (em `src/game/combat/PlayerCombat.ts`) é um componente à parte que o `Player` possui e delega input pra ele — o dash deve seguir a mesma estrutura, não virar lógica solta dentro do `Player`.

Criar `src/game/entities/PlayerDash.ts`:

```ts
export type DashReadiness = 'ready' | 'charging';

export class PlayerDash {
    private state: 'idle' | 'dashing' = 'idle';
    private dashEndAt = 0;
    private cooldownUntil = 0;

    constructor(private scene: Phaser.Scene, private owner: Physics.Arcade.Sprite) {}

    get isDashing(): boolean { return this.state === 'dashing'; }
    get readiness(): DashReadiness {
        return this.scene.time.now >= this.cooldownUntil ? 'ready' : 'charging';
    }

    // Chamado pelo Player quando Espaço é apertado (JustDown).
    attemptDash(time: number, direction: 1 | -1): boolean {
        if (this.state === 'dashing' || this.readiness !== 'ready') return false;

        this.state = 'dashing';
        this.dashEndAt = time + PLAYER_DASH.durationMs;
        this.cooldownUntil = time + PLAYER_DASH.cooldownMs;

        const body = this.owner.body as Physics.Arcade.Body;
        body.setVelocityX(PLAYER_DASH.speed * direction);
        if (PLAYER_DASH.freezeGravityDuringDash) {
            body.setVelocityY(0);
            body.setAllowGravity(false);
        }

        this.owner.play('player-run', true);
        return true;
    }

    // Chamado todo frame pelo Player.update, ANTES da lógica normal de
    // movimento (pra saber se deve pular o input de movimento/ataque nesse
    // frame).
    update(time: number): void {
        if (this.state !== 'dashing') return;

        if (time >= this.dashEndAt) {
            this.state = 'idle';
            if (PLAYER_DASH.freezeGravityDuringDash) {
                (this.owner.body as Physics.Arcade.Body).setAllowGravity(true);
            }
        }
    }
}
```

(Pseudocódigo — Codex deve ajustar aos imports/tipos reais do projeto, mas a estrutura de estado é essa.)

## 5. Mudanças no `Player.ts`

- Adicionar `space` ao objeto de `keys` (mesmo padrão de `attack: F`):
  ```ts
  dash: Input.Keyboard.KeyCodes.SPACE
  ```
- Instanciar `readonly dash: PlayerDash` no construtor, igual a `this.combat = new PlayerCombat(...)`.
- No `update()`:
  - Chamar `this.dash.update(time)` cedo no ciclo.
  - Detectar `Input.Keyboard.JustDown(this.keys.dash)` e chamar `this.dash.attemptDash(time, this.flipX ? -1 : 1)` — **mesma convenção de direção que o combate já usa** (`hitDirection`), não inventar uma nova.
  - Enquanto `this.dash.isDashing`, pular a lógica normal de `applyHorizontalMovement` (o dash já setou a velocidade) e bloquear `handleAttack`/`handleJumpQueue`, do mesmo jeito que o `hurtTimer > 0` já bloqueia essas ações hoje (reaproveitar o padrão, não duplicar).
  - Ainda precisa chamar `syncFacingOffset` no fim do frame (isso já é incondicional).
- Decidir se dash é permitido no ar ou só no chão (ver decisão de design #2).

## 6. Mudanças no `Game.ts`

### 6.1 Atravessar o inimigo sem dano

Hoje o collider jogador↔inimigo é:
```ts
this.physics.add.collider(this.player, enemy, () => {
    this.handleContactDamage(enemy);
});
```
Um `collider` (diferente de `overlap`) sempre resolve a separação física entre os corpos **antes** de chamar o callback — só pular o dano dentro do callback não é suficiente, o jogador ainda vai ser fisicamente bloqueado pelo inimigo (não "atravessa").

A correção é usar o **4º parâmetro** do `collider` (`processCallback`), que decide se a colisão deve ser processada:
```ts
this.physics.add.collider(
    this.player,
    enemy,
    () => this.handleContactDamage(enemy),
    () => !this.player.dash.isDashing, // processCallback: false = ignora a colisão inteira nesse frame
    this
);
```
Isso precisa ser aplicado em **todos** os colliders jogador↔inimigo (é criado um por inimigo no loop de `spawnEnemies`).

### 6.2 Indicador visual (bolinha estilo Zelda)

Criar em `createHud()` ou em um novo método `createDashIndicator()`:
```ts
this.dashIndicator = this.add.circle(0, 0, 6, 0x4ade80).setDepth(21).setStrokeStyle(2, 0xffffff, 0.6);
```
No `update()`, todo frame:
```ts
this.dashIndicator.setPosition(this.player.x, this.player.y - 60); // ajustar offset visualmente
this.dashIndicator.setFillStyle(this.player.dash.readiness === 'ready' ? 0x4ade80 : 0xfbbf24);
```
Importante: **não** é HUD fixo (`scrollFactor(0)`) — precisa se mover com o jogador no mundo, senão "do lado do player" não faz sentido. Depth deve ficar acima do player (20) mas isso é só um detalhe visual, ajustar testando.

## Decisões de design em aberto (Codex deve perguntar ou escolher e documentar)

1. **Gravidade durante o dash**: o pseudocódigo acima congela a gravidade (`setAllowGravity(false)`) pra um dash reto/decisivo, tipo Hollow Knight. Alternativa: deixar a gravidade normal rolar (dash vira só um "boost" horizontal que ainda cai) — mais simples, mas menos "dash de verdade". Recomendo a primeira opção.
2. **Dash no ar**: permitir ou só no chão? O ataque atual (`PlayerCombat.attemptAttack`) só funciona no chão; o dash não tem esse motivo claro pra restringir, e como serve de esquiva, funcionar no ar tem valor. Recomendo permitir em ambos.
3. **Invulnerabilidade**: o pedido foi especificamente "atravessar o inimigo sem tomar dano" (contato), não invulnerabilidade geral. Se quiser blindar contra qualquer dano durante o dash (ex.: se no futuro tiver ataque à distância de inimigo), a forma correta é usar o mesmo `invulnerabilityTimer` que já existe em `Player.ts` para os i-frames pós-dano, setando-o durante o dash — mas isso é escopo a mais do que foi pedido; deixar de fora por padrão e comentar a opção no código.
4. **Offset exato da bolinha**: `y - 60` é um chute; precisa ajuste visual olhando o jogo rodando (o personagem tem ~144px de altura na tela, 48×3).

## Critérios de regressão (testar depois de implementado)

- `npx tsc --noEmit` sem erro.
- Espaço aciona o dash só quando a bolinha está verde; enquanto amarela, não faz nada.
- Durante o dash, o jogador atravessa um inimigo sem tomar dano nem ser barrado fisicamente.
- Fora do dash, o jogador continua colidindo e tomando dano de contato normalmente.
- W/F não fazem nada enquanto `isDashing` (mesma lógica de bloqueio que já existe pro hitstun).
- Depois do dash acabar, o jogador volta ao controle normal (inclusive gravidade, se a opção 1 escolhida for "congelar").
- Testar dash perto de um portal — não deve quebrar a troca de fase.
