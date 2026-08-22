# Plano: spawn em Y variável + o que o mapa/HUD NÃO precisa mudar

## Objetivo

Permitir posicionar inimigos/boss em qualquer Y (não só
`GROUND_Y - 80` fixo), pra popular plataformas em alturas diferentes,
mantendo o comportamento das 6 fases atuais idêntico — todo spawn hoje
sem Y explícito continua nascendo exatamente no mesmo Y de sempre.
Cobre também, de propósito, o que **não** muda no mapa/HUD com
verticalidade — documentado explicitamente pra ninguém "consertar"
isso depois achando que é bug.

Complementa `PLATFORM_SYSTEM_FEATURE_PLAN.md` (dá o que pisar) e
`VERTICAL_WORLD_FEATURE_PLAN.md` (dá espaço vertical pra câmera/mundo).

## 1. Spawns de inimigo com Y opcional

Hoje, em `spawnEnemies()` (`Game.ts:228-271`), o tipo da tabela é:

```ts
Record<string, { type: EnemyType; x: number; minX?: number; maxX?: number }[]>
```

e o spawn sempre usa `createEnemy(this, spawn.type, spawn.x, GROUND_Y - 80, this.player)`
(`Game.ts:261`, Y fixo). Estender pra:

```ts
Record<string, { type: EnemyType; x: number; y?: number; minX?: number; maxX?: number }[]>
```

e o spawn:

```ts
const y = spawn.y ?? GROUND_Y - 80;
const enemy = createEnemy(this, spawn.type, spawn.x, y, this.player);
```

Todas as entradas atuais (nenhuma tem `y`) continuam nascendo
exatamente onde nascem hoje.

## 2. Boss com Y opcional (baixa prioridade)

`spawnBoss()` (`Game.ts:273-296`) hoje só varia por fase no `type`,
com `bossX`/Y fixos (`PHASE_WIDTH - 420`, `GROUND_Y - 120`). Se algum
boss precisar nascer numa plataforma alta (ex.: chefe de uma arena
vertical), generalizar `bossByPhase` do mesmo jeito do item 1 —
`{ type: EnemyType; x?: number; y?: number }` — com fallback pros
valores fixos de hoje quando omitidos. Não é bloqueio pras outras
features deste conjunto; só implementar quando alguma fase vertical
concreta precisar disso.

## 3. Atenção pro Codex: patrulha em plataforma (retomando o aviso do `PLATFORM_SYSTEM_FEATURE_PLAN.md`)

Todo spawn com `y` diferente de `GROUND_Y - 80` **precisa** vir
acompanhado de `minX`/`maxX` (já existem no tipo hoje, só nunca usados
em nenhuma entrada atual) alinhados à largura real da plataforma onde
o inimigo nasce. `BaseEnemy.updatePatrol()` (`BaseEnemy.ts:178-210`)
não faz nenhuma detecção de borda — sem `setPatrolRange` explícito, o
default (`x ± 180`, `BaseEnemy.ts:71-72`) faz o inimigo andar pra fora
de qualquer plataforma mais estreita que 360px e cair. É o jeito mais
provável de "quebrar" essa feature sem querer.

## 4. O que NÃO muda (documentado de propósito)

- **`updateMapMarker()`** (`Game.ts:817-826`) calcula `phaseProgress =
  player.x / PHASE_WIDTH` — só considera X. Isso é **intencional**: o
  mapa-múndi (`M`) mostra em qual bioma/fase o jogador está e o quanto
  avançou ao longo da rota horizontal entre fases, não a posição exata
  dentro da fase — verticalidade dentro de uma fase não deve mudar
  esse indicador. Não "consertar" isso achando que é um bug.
- **`dashIndicator`** (`Game.ts:519-523` e `525-530`) já usa
  `this.player.y - 60` — já segue qualquer Y do jogador, nenhuma
  mudança necessária.
- **`camera.startFollow`** (`Game.ts:139`) já segue X e Y — nenhuma
  mudança necessária (mesmo ponto já confirmado em
  `VERTICAL_WORLD_FEATURE_PLAN.md`).
- **HUD e overlays** (`createHud()`, `createMapOverlay()`,
  `createPauseOverlay()`) são `scrollFactor(0)`, espaço de tela —
  nenhuma mudança necessária.

## 5. Validação cruzada com o boss

`Boss.update()` (`src/game/entities/Boss.ts:118-130`) posiciona a
barra de vida com `this.y + BAR_OFFSET_Y` — já relativo ao Y atual do
boss. Um boss nascendo mais alto (item 2) não quebra a barra de vida,
ela só acompanha a nova posição normalmente, sem código extra.

## Decisões de design em aberto

1. **Spawn "relativo a uma plataforma" (ex.: `platformIndex: 2`) em
   vez de `y` absoluto**, pra não precisar recalcular manualmente o Y
   toda vez que uma plataforma se move no design? Recomendo **não** —
   coordenadas absolutas é o padrão já usado em todo o resto de
   `phases.ts`/`Game.ts` (nenhuma posição no projeto é relativa a
   outra); introduzir um sistema diferente só pra spawns seria
   inconsistente.
2. **Extrair a tabela `spawns`/`bossByPhase` pra um arquivo próprio**
   (ex.: `world/spawns.ts`), no mesmo espírito de `world/phases.ts`,
   se ela crescer muito com fases verticais novas? Não bloqueia esta
   feature — é só uma sugestão de organização pra depois.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Todas as fases atuais: inimigos e boss nascem exatamente nas mesmas
  posições de hoje (nenhuma entrada de spawn tem `y` definido).
- Uma entrada de teste com `y` numa plataforma nova (do
  `PLATFORM_SYSTEM_FEATURE_PLAN.md`) e `minX`/`maxX` corretos: o
  inimigo nasce na plataforma e patrulha sem cair dela.
- Mapa (`M`), indicador de dash e câmera continuam funcionando
  exatamente como antes em qualquer fase, alta ou não.
- Testar respawn (`scene.restart`) do modo Normal com um inimigo/boss
  em Y não-padrão — mesma preocupação já registrada no
  `BOSS_FEATURE_PLAN.md` sobre `this.enemies = []` no início de
  `create()`, agora também cobrindo posições não-padrão.
