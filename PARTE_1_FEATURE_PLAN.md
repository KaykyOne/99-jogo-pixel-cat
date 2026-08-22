# Plano: Parte 1 — terreno, inventário, economia e vila

> **Ordem de execução (não é ordem de dificuldade):**
> `1. Terreno` → `2. Inventário` → `3. Drops/moedas` → `4. Vila` → `5. NPCs` → `6. Loja`
>
> A ordem é ditada por dependência, não por esforço. Simplificar o terreno
> **primeiro** evita redesenhar mapas que serão jogados fora. O inventário vem
> antes dos drops porque moeda sem onde guardar não tem para onde ir. A vila
> vem antes dos NPCs porque eles precisam de um lugar para existir, e a loja
> vem por último porque consome os cinco anteriores.
>
> Cada etapa é entregável e testável sozinha. Não comece a seguinte antes da
> anterior rodar.

---

## Contexto: o que já existe

Leia antes de tocar em qualquer coisa.

| Sistema | Onde | Estado |
| --- | --- | --- |
| Movimento, pulo, coyote/buffer | `src/game/entities/Player.ts` | Pronto |
| Dash | `src/game/entities/PlayerDash.ts` | Pronto |
| Escalada agarrada (estilo Celeste) | `src/game/entities/PlayerClimb.ts` | Pronto |
| Combate corpo-a-corpo com hitbox temporal | `src/game/combat/PlayerCombat.ts` | Pronto |
| Vida / dano / defesa / resistência | `src/game/damage/` | Pronto (`Health` já tem `heal()`) |
| Inimigos com patrulha/perseguição/ataque | `src/game/entities/BaseEnemy.ts` | Pronto (2 tipos + boss) |
| 6 fases, portais, mapa (M), pausa (ESC) | `src/game/world/phases.ts`, `src/game/scenes/Game.ts` | Pronto |
| Save em localStorage | `src/game/state/save.ts` | Pronto |
| **Inventário, itens, moedas, NPC, diálogo, loja** | — | **Não existe** |

Constantes de física que TODO level design desta parte deve respeitar
(`src/game/entities/player-config.ts` + `Game.ts`):

```
gravidade da cena ....... 1400 px/s²
jumpVelocity ............ -620 px/s
maxSpeed ................ 320 px/s
fastFallAcceleration .... 800 px/s²
```

Disso saem os dois únicos números que importam para desenhar plataforma:

```
ALTURA MÁXIMA DE PULO ... 620² / (2 · 1400) ≈ 137 px
ALCANCE HORIZONTAL ...... ≈ 255 px de pulo completo (com fast-fall na descida)
```

---

## Convenções compartilhadas por todas as etapas

1. **Sem asset novo.** Nada nesta parte depende de arte. NPCs, moedas, maçãs,
   poções e o cenário da vila são desenhados com `Graphics`/formas, no mesmo
   espírito de `drawPine`/`drawCactus` que `phases.ts` já usa.
2. **Dados fora da lógica.** Todo número novo (preço, drop, stack, alcance)
   entra num arquivo de config, nunca solto dentro de uma classe — igual a
   `ATTACKS`, `ENEMY_STATS` e `PLAYER_MOVEMENT` já fazem.
3. **Componentes, não métodos gigantes.** `Game.ts` já tem 992 linhas. Nada
   novo entra como método privado dela: cada sistema vira classe/arquivo
   próprio, e a cena só instancia e delega — o padrão de `PlayerCombat`,
   `PlayerDash` e `PlayerClimb`.
4. **Depths reservados** (o projeto já usa 0..102):

   ```
   pickups .................. 12
   NPC ...................... 14
   ícone flutuante "E" ...... 22
   diálogo / loja ........... 103  (acima da pausa, que é 101/102)
   HUD do inventário ........ 32   (junto do HUD atual, 30/31)
   ```
5. **Teclas novas:** `E` = interagir, `1..6` = usar slot do inventário.
   Registrar sempre na cena (`this.input.keyboard!.addKey`) quando for
   interação com o mundo, e no `Player` só quando for ação do personagem.

---

## Etapa 1 — Simplificação do terreno

### Objetivo

Reduzir o mundo ao vocabulário de um Mario: **chão plano + plataformas +
alguns trechos de escalada**. Sai tudo que é hazard ambiental e efeito
visual caro; fica só o que o jogador pisa.

Esta etapa é majoritariamente **subtrativa**. O trabalho não é escrever
código novo, é apagar código e redesenhar 6 layouts.

### 1.1 O que sai

| Sistema | Arquivos | Por quê |
| --- | --- | --- |
| Armadilhas de espinho | `TrapDef`, `drawTraps` em `phases.ts`; `trapRects`, `checkTraps()` em `Game.ts`; array `traps` da floresta | Hazard ambiental não faz parte de "parkour + escalada". O dano do jogo passa a vir só de inimigo. |
| Reflexo do lago | `setupLakeReflection`, `updateLakeReflection`, `resizeLakeReflection`, campo `lakeReflection`, const `FOREST_WATER_TOP_Y` | ~90 linhas + uma `RenderTexture` redesenhada todo frame, para um efeito puramente decorativo de uma única fase. |
| Mundo vertical estendido da floresta | `worldTop: FOREST_WORLD_TOP` / `worldHeight` na floresta, `FOREST_WORLD_TOP` | Sem o desfiladeiro de 280px, a floresta volta aos 768px das outras 5 fases e o parallax para de precisar de compensação em Y. |
| Monte alto escalável + monte em terraço | array `platforms` da floresta | Substituídos pelo layout novo do item 1.3. |

Ao remover `checkTraps`, apagar também a chamada dentro de `update()`
(`Game.ts`) e o import de `Geom` se ele ficar sem uso.

### 1.2 O que fica

- `PlatformDef` inteiro, incluindo `oneWay` e `climbable` — o tipo é a base
  do level design e da vila (Etapa 4).
- `drawTexturedPlatform` e o terreno de textura da floresta (`grama-topo.png`
  + `terra-tile.png`). É o que dá acabamento sem custo.
- `PlayerClimb` **como está**. Ver Decisão de design #1.
- Portais, boss, mapa, pausa.

### 1.3 Gramática de level design (nova, aplicada às 6 fases)

Criar em `phases.ts`, logo abaixo de `PHASE_WIDTH`:

```ts
// Vocabulário único de level design. Toda plataforma de toda fase usa estes
// números — é o que faz o mundo ficar legível como um Mario, em vez de cada
// fase inventar a própria altura.
//
// Derivados da física do jogador (ver player-config.ts):
//   altura máxima de pulo ≈ 137 px  -> STEP fica com folga de ~37 px
//   alcance horizontal    ≈ 255 px  -> GAP_LONG fica com folga de ~55 px
export const TERRAIN = {
    STEP: 100,        // desnível de um pulo simples
    STEP_HIGH: 130,   // desnível apertado (exige pulo cheio) — usar com parcimônia
    GAP_SHORT: 120,   // vão que dá pra passar andando+pulando
    GAP_LONG: 200,    // vão que exige pulo com corrida
    THICKNESS: 40,    // espessura padrão de plataforma solta
    MIN_LANDING: 120  // largura mínima de qualquer superfície de pouso
} as const;
```

**Regras (obrigatórias, não sugestões):**

1. Todo `y` de plataforma é `GROUND_Y - (n · STEP)`. Nada de altura arbitrária.
2. Toda superfície onde se pode pousar tem `width >= MIN_LANDING`. Pouso que
   exige precisão de pixel não é Mario.
3. Vãos horizontais: `GAP_SHORT` ou `GAP_LONG`. Nada entre eles, nada acima.
4. `climbable: true` só em parede com `width <= 80` e `height > STEP_HIGH` —
   ou seja, escalada é **exceção pontual** para vencer um degrau que o pulo
   não vence, nunca o traçado principal. Máximo **uma** por fase.
5. Uma fase inteira deve ser atravessável só andando, pulando e dando dash.
   A escalada abre atalho ou área opcional; nunca é o único caminho — exceto
   no bloqueio proposital antes do boss da floresta.

### 1.4 Layout de referência (floresta)

Substitui o array `platforms` atual. Serve de modelo para as outras 5:

```ts
platforms: [
    // Aquecimento: dois degraus de pulo simples, largos, sem risco.
    { x: 760,  y: GROUND_Y - TERRAIN.STEP,     width: 220, height: TERRAIN.STEP },
    { x: 1080, y: GROUND_Y - TERRAIN.STEP * 2, width: 200, height: TERRAIN.STEP * 2 },

    // Vão de GAP_LONG: a primeira coisa que exige compromisso com o pulo.
    { x: 1480, y: GROUND_Y - TERRAIN.STEP * 2, width: 180, height: TERRAIN.STEP * 2 },

    // Plataforma solta one-way, alcançada por baixo.
    { x: 1760, y: GROUND_Y - TERRAIN.STEP * 3, width: 160, height: TERRAIN.THICKNESS, oneWay: true },

    // ÚNICA parede escalável da fase: 2 STEPs de uma vez, acima do pulo.
    // É o que separa o trecho final da arena do boss.
    { x: 1980, y: GROUND_Y - TERRAIN.STEP * 3, width: 70, height: TERRAIN.STEP * 3, climbable: true }
],
// traps: removido
```

As outras 5 fases hoje **não declaram plataforma nenhuma** (só a floresta
tem). Cada uma recebe 3 a 5 plataformas montadas com o mesmo vocabulário —
sem armadilha, sem parede escalável (a floresta guarda a única).

### 1.5 Ajustes de spawn

`spawnEnemies()` (`Game.ts`) tem spawns elevados com `y`/`minX`/`maxX`
casados nas coordenadas dos montes antigos. Ao trocar o layout, **recalcular
todos**: `y = topo_da_plataforma - 80`, e `minX`/`maxX` com 40px de folga de
cada lado da plataforma — a patrulha não detecta borda sozinha e o inimigo
cai se a faixa passar do fim da superfície.

### 1.6 Critério de pronto

- `npx tsc --noEmit` limpo.
- As 6 fases são atravessáveis de ponta a ponta sem escalar (exceto o
  bloqueio do boss da floresta).
- Nenhuma referência restante a `TrapDef`, `drawTraps`, `checkTraps`,
  `lakeReflection` ou `FOREST_WATER_TOP_Y`.
- `worldTop`/`worldHeight` não aparecem em nenhuma fase.

---

## Etapa 2 — Inventário de 6 itens

### Objetivo

Seis slots. Cada slot guarda um empilhamento de um item. Persiste no save e
sobrevive à troca de fase.

### 2.1 Catálogo de itens (novo)

`src/game/items/item-catalog.ts`:

```ts
export type ItemKind = 'currency' | 'consumable' | 'material';

export type ItemDef = {
    id: string;
    name: string;
    kind: ItemKind;
    // Quantos cabem num slot. "1 pack" do briefing = 1 slot cheio.
    stackSize: number;
    // Cor base para o desenho por Graphics (não há arte nesta fase).
    color: number;
    accent: number;
    // Só para consumíveis: quanto de HP restaura ao usar.
    healAmount?: number;
};

export const ITEMS = {
    coin: {
        id: 'coin',
        name: 'Moeda',
        kind: 'currency',
        stackSize: 50,
        color: 0xf5c542,
        accent: 0xb8860b
    },
    apple: {
        id: 'apple',
        name: 'Maçã',
        kind: 'material',
        stackSize: 50,
        color: 0xd94f4f,
        accent: 0x4f7a3d
    },
    potion: {
        id: 'potion',
        name: 'Poção',
        kind: 'consumable',
        stackSize: 50,
        color: 0xe05a8a,
        accent: 0xf2c4d8,
        healAmount: 2
    }
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;
```

### 2.2 A classe `Inventory` (novo)

`src/game/items/Inventory.ts`. Pura — sem cena, sem input, sem desenho, no
mesmo espírito de `Health`:

```ts
export type Slot = { id: ItemId; quantity: number } | null;

export const INVENTORY_SLOTS = 6;

export class Inventory {
    private slots: Slot[] = new Array(INVENTORY_SLOTS).fill(null);

    // Adiciona respeitando o stackSize: preenche stacks parciais existentes
    // primeiro, depois ocupa slots vazios. Retorna quanto NÃO coube — quem
    // chama decide o que fazer (não spawnar o pickup, avisar "inventário
    // cheio", etc.). Nunca descarta em silêncio.
    add(id: ItemId, quantity: number): number { /* ... */ }

    // Remove de qualquer combinação de slots. Retorna false e NÃO altera nada
    // se não houver a quantidade pedida — a transação é atômica, senão uma
    // compra parcial deixa o jogador sem moeda e sem item.
    remove(id: ItemId, quantity: number): boolean { /* ... */ }

    count(id: ItemId): number { /* ... */ }
    hasSpaceFor(id: ItemId, quantity: number): boolean { /* ... */ }
    slotAt(index: number): Slot { /* ... */ }

    serialize(): Slot[] { /* ... */ }
    static deserialize(data: unknown): Inventory { /* ... */ }
}
```

`add` e `remove` disparam um evento (`Phaser.Events.EventEmitter` interno ou
um callback `onChange`) para o HUD não precisar checar todo frame.

### 2.3 Estado de run (novo)

`src/game/state/run-state.ts`. O inventário precisa sobreviver a
`scene.start()` entre fases; o `registry` do Phaser é global ao jogo e já é
usado assim para `difficulty` (`Game.ts:103`):

```ts
const KEY = 'inventory';

export function getInventory(scene: Scene): Inventory {
    let inv = scene.registry.get(KEY) as Inventory | undefined;
    if (!inv) {
        inv = Inventory.deserialize(loadSave()?.inventory);
        scene.registry.set(KEY, inv);
    }
    return inv;
}
```

### 2.4 Persistência

`SaveData` (`src/game/state/save.ts`) ganha `inventory: Slot[]`.

> **ARMADILHA:** `PhaseScene.create()` chama `writeSave({...})` a cada troca
> de fase (`Game.ts:104`) montando o objeto na mão. Se o campo `inventory`
> não for incluído ali, **todo item some ao trocar de fase**. A correção não
> é lembrar de incluir: é centralizar num helper e nunca mais chamar
> `writeSave` direto da cena.

```ts
// src/game/state/save.ts
export function saveProgress(scene: Scene, patch: Partial<SaveData>): void {
    const current = loadSave();
    writeSave({
        phaseIndex: current?.phaseIndex ?? 0,
        difficulty: (scene.registry.get('difficulty') as Difficulty) ?? 'normal',
        clearedPhases: current?.clearedPhases ?? [],
        inventory: getInventory(scene).serialize(),
        ...patch
    });
}
```

Trocar as chamadas de `writeSave` em `Game.ts` e em `MenuScene.ts` por
`saveProgress`.

### 2.5 HUD do inventário (novo)

`src/game/ui/InventoryHud.ts`. Barra fixa de 6 slots no rodapé, sempre
visível (mais simples e mais legível que um painel que abre/fecha):

- Container com `setScrollFactor(0).setDepth(32)`.
- Cada slot: `fillRoundedRect` 56x56 em `0x10212b` a 0.75 com borda
  `0xb8cc84` — mesma paleta do HUD atual (`createHud`, `Game.ts:625`).
- Ícone do item desenhado por `Graphics` a partir de `color`/`accent`:
  moeda = círculo, maçã = círculo + cabinho, poção = frasco (retângulo
  arredondado + gargalo).
- Quantidade em `monospace 11px` no canto inferior direito do slot.
- Número da tecla (`1`..`6`) em `9px` no canto superior esquerdo.
- Redesenha **só** no evento `onChange` do `Inventory`, nunca no `update()`.

Registrar no `resize` junto de `repositionResponsiveUI()` (`Game.ts:945`),
que já é o ponto único de reposicionamento de UI.

### 2.6 Usar item

No `update()` de `PhaseScene`, teclas `1..6`: se o slot tem um item
`kind === 'consumable'`, chama `player.heal(def.healAmount)` e
`inventory.remove(id, 1)`. `Health` já expõe `heal()`
(`src/game/damage/Health.ts:41`) — falta só um método `heal` no `Player` que
delegue e permita ao HUD atualizar (o HUD só redesenha quando o HP muda, ver
`lastHp` em `refreshHudHp`).

### 2.7 Critério de pronto

- Item adicionado por console aparece no HUD, sobrevive a trocar de fase e a
  recarregar a página.
- O inventário persiste na morte no modo normal e é zerado no modo difícil
  (que já chama `clearSave()`, `Game.ts:479`).
- Empilhamento respeita 50 e transborda para o slot seguinte.
- Inventário cheio: `add` devolve o resto em vez de engolir.

---

## Etapa 3 — Drops e moedas

### Objetivo

Inimigo morto larga **5 a 30 moedas**, **1 a 3 maçãs**, ou **nada**.

### 3.1 Tabela de drop (novo)

`src/game/items/loot.ts`:

```ts
export type LootRoll = { id: ItemId; quantity: number };

export type LootTable = {
    // Pesos relativos, não porcentagens — somar não precisa dar 100.
    entries: { id: ItemId | null; weight: number; min: number; max: number }[];
};

// Uma rolagem por morte. `null` = nada, e precisa de peso próprio: sem uma
// entrada de vazio explícita, todo inimigo sempre dropa algo.
export const LOOT_TABLES: Record<EnemyType | 'boss', LootTable> = {
    graverobber: {
        entries: [
            { id: null,    weight: 25, min: 0, max: 0 },
            { id: 'coin',  weight: 50, min: 5, max: 30 },
            { id: 'apple', weight: 25, min: 1, max: 3 }
        ]
    },
    steamman: { /* mais moeda, menos vazio */ },
    boss:     { /* sem vazio; moeda garantida no topo da faixa */ }
};

export function rollLoot(table: LootTable): LootRoll | null { /* ... */ }
```

### 3.2 Quem avisa que morreu

`BaseEnemy.die()` (`BaseEnemy.ts:295`) **não deve conhecer loot**. Ele já é
um `Sprite`, então já é um `EventEmitter`:

```ts
// dentro de die(), ANTES do tween que chama destroy()
this.emit('enemy-died', { x: this.x, y: this.y, typeKey: this.typeKey, isBoss: this instanceof Boss });
```

> **ARMADILHA:** o tween de morte tem `onComplete: () => this.destroy()`. Se
> o evento for emitido no `onComplete`, os listeners já foram removidos junto
> com o objeto. Emitir **antes** do tween.

Na cena, onde os inimigos já são iterados para criar colliders
(`Game.ts:196`):

```ts
enemy.once('enemy-died', (info) => this.lootManager.dropFrom(info));
```

### 3.3 A entidade `Pickup` (novo)

`src/game/entities/Pickup.ts`. Sprite físico sem arte — a textura é gerada
uma única vez no `PreloadScene`
(`this.make.graphics(...).generateTexture('pickup-coin', 20, 20)`), para não
existir um `Graphics` por moeda no chão:

- Nasce com `setVelocity(Between(-120, 120), Between(-260, -180))` — o
  "pop" que dá vida ao drop.
- Colide com os mesmos `solidColliders`/`oneWayColliders` da cena.
- **Ímã:** dentro de 110px do jogador, interpola a posição em direção a ele
  (`Phaser.Math.Linear`, fator ~0.15/frame). Sem isso o jogador tem que
  pisar em cima de cada moeda, o que é irritante em drops de 30.
- `overlap` com o jogador → `inventory.add(id, quantity)`. Se `add` devolver
  resto > 0, o pickup **permanece no chão** com a quantidade restante.
- Auto-destrói após 30s (`scene.time.delayedCall`), com pisca-pisca nos
  últimos 5s, para não acumular objeto em fase longa.

Empilhar quantidade **num único pickup** (uma moeda visual valendo 17) em
vez de spawnar 17 objetos. Um texto pequeno `x17` ao lado.

### 3.4 `LootManager` (novo)

`src/game/items/LootManager.ts`: guarda a lista de pickups vivos, faz o
`overlap` no `update()` da cena e limpa tudo no `shutdown`. A cena chama
`this.lootManager.update()` — uma linha, não 40.

> **ARMADILHA:** o teste de fase limpa é
> `this.enemies.every(enemy => !enemy.isAlive)` (`Game.ts:270`). Pickups
> **não** entram no array `enemies`. Se entrarem, o portal nunca abre.

### 3.5 Critério de pronto

- Matar 20 inimigos produz uma distribuição visivelmente próxima dos pesos.
- Moeda cai, quica, assenta no chão e é atraída ao chegar perto.
- Com inventário cheio, o drop fica no chão em vez de sumir.
- Trocar de fase com pickups no chão não vaza objeto nem estoura.

---

## Etapa 4 — Vila (mapa inicial)

### Objetivo

Uma fase nova, **sem inimigos**, à esquerda da floresta, que passa a ser
o ponto de partida do jogo.

### 4.1 Zona segura — o bug que isso destrava

O portal de saída exige `phaseCleared` (`buildPortals`, `Game.ts:540`), e
`phaseCleared` só vira `true` quando **todos os inimigos morrem** — mas a
condição é guardada por `this.enemies.length > 0` (`Game.ts:268`). Numa fase
sem inimigos, `phaseCleared` **nunca** fica `true` e **o jogador fica preso
na vila para sempre**.

Correção, em `PhaseDefinition` (`phases.ts`):

```ts
// Fase sem combate. O portal de saída já nasce aberto: sem isto, uma fase
// sem inimigos nunca satisfaz a condição de "limpa" e tranca o jogador.
safeZone?: boolean;
```

E em `buildPortals()`:

```ts
requiresClear: !this.phase.safeZone,
```

### 4.2 A definição da vila

Entra como **`PHASES[0]`**, antes da floresta:

```ts
{
    key: 'village',
    name: 'VILA DO CARVALHO',
    subtitle: 'O último lugar seguro antes da mata',
    safeZone: true,
    platformTexture: { grassKey: 'forest-grass-top', dirtKey: 'forest-dirt', scale: 0.3 },
    draw: (scene, x0) => { /* ver 4.3 */ },
    platforms: [
        // Um único degrau decorativo. A vila é plana de propósito: é onde
        // o jogador aprende os controles sem risco.
        { x: 1500, y: GROUND_Y - TERRAIN.STEP, width: 260, height: TERRAIN.STEP }
    ],
    npcs: [ /* Etapa 5 */ ]
}
```

### 4.3 Cenário por blocos

Reaproveita as camadas de parallax da floresta (`forest-sky`,
`forest-mountains`, `forest-trees`) — já estão carregadas e dão continuidade
visual entre vila e mata. Por cima, **casas desenhadas com blocos**, no
mesmo padrão de `drawPine`:

```ts
// Casa por blocos: corpo retangular + telhado triangular + porta + janela.
// Três instâncias com escala e cor levemente diferentes bastam pra ler
// como vila, sem nenhum asset.
function drawHouse(g: GameObjects.Graphics, x: number, baseY: number, scale: number,
                   wall: number, roof: number) {
    const w = 140 * scale, h = 110 * scale;
    g.fillStyle(wall).fillRect(x - w / 2, baseY - h, w, h);
    g.fillStyle(roof).fillTriangle(x - w / 2 - 12 * scale, baseY - h,
                                   x + w / 2 + 12 * scale, baseY - h,
                                   x, baseY - h - 55 * scale);
    g.fillStyle(0x4a3524).fillRect(x - 18 * scale, baseY - 52 * scale, 36 * scale, 52 * scale);
    g.fillStyle(0xf7e7b0, 0.85).fillRect(x + 26 * scale, baseY - 86 * scale, 28 * scale, 28 * scale);
}
```

Três casas, uma fogueira (círculo laranja + tween de alpha), umas cercas
(retângulos finos). Total: ~40 linhas de `Graphics`.

### 4.4 Reindexação — a parte perigosa

Inserir em `PHASES[0]` **desloca todos os índices**. Consequências:

1. **Saves existentes quebram.** Um save com `phaseIndex: 2` (caverna) passa
   a apontar para a neve. Solução mais honesta e mais barata: **trocar a
   chave de storage**, invalidando saves antigos:

   ```ts
   // src/game/state/save.ts
   // v2: a vila entrou como PHASES[0] e deslocou todos os índices; além
   // disso SaveData ganhou `inventory`. Saves v1 não são migráveis de
   // forma confiável, então a chave muda e eles são simplesmente ignorados.
   const STORAGE_KEY = 'jogo-99:save:v2';
   ```

2. **O ícone do mapa.** `drawMapPhaseIcon` (`Game.ts:801`) tem um `switch`
   por `phaseKey` sem `default` — fase sem `case` fica com ícone invisível.
   Adicionar o caso `'village'` (uma casinha: `fillRect` + `fillTriangle`) e
   `case 'village': return 0xc9a227;` em `mapBiomeColor` (`Game.ts:868`).

3. **`spawnEnemies` / `spawnBoss`** usam `Record<string, ...>` indexado por
   `phase.key`. `'village'` não está em nenhum dos dois → devolvem vazio /
   retornam cedo. **Nada a fazer**, funciona por construção.

4. **`updateMapMarker`** divide por `PHASES.length - 1`. Com 7 fases continua
   correto.

### 4.5 Critério de pronto

- Novo jogo começa na vila.
- O portal da direita já nasce aberto e leva à floresta.
- O portal da floresta para a esquerda volta para a vila.
- Nenhum inimigo, nenhum dano possível na vila.
- O mapa (M) mostra 7 nós, com o ícone da vila no início.

---

## Etapa 5 — NPCs (capivara e coelho)

### Objetivo

Dois NPCs na vila, **desenhados com blocos** (não há arte), que exibem um
**ícone flutuante com a tecla `E`** quando o jogador chega perto e abrem um
diálogo ao apertar.

### 5.1 Design por blocos — especificação

Sem arte. Cada NPC é um `GameObjects.Container` com formas de `Graphics`,
com origem **nos pés** (para assentar em `GROUND_Y` como qualquer outra
coisa). Mesma linguagem visual do resto do jogo: formas cheias, contorno
escuro fino, paleta terrosa.

**Capivara** (baixa e comprida — ~90 × 86 px):

```
corpo ....... roundedRect 84 × 48, raio 16   #8a6a45
cabeça ...... roundedRect 46 × 38, raio 12   #9c7a50   (à frente, sobreposta ao corpo)
focinho ..... roundedRect 18 × 13, raio 5    #6b5136
orelhas ..... 2 × circle r=6                 #6b5136
patas ....... 4 × rect 12 × 14               #6b5136
olho ........ circle r=3                     #1a1410
```

**Coelho** (alto e estreito — ~50 × 110 px):

```
orelhas ..... 2 × roundedRect 12 × 42, raio 6  #e8e4dc, miolo #e6a8b0 (8 × 32)
cabeça ...... circle r=17                       #e8e4dc
corpo ....... roundedRect 46 × 54, raio 18      #e8e4dc
cauda ....... circle r=9                        #f5f2ee
patas ....... 2 × roundedRect 14 × 12, raio 5   #d8d2c8
olho ........ circle r=3                        #1a1410
focinho ..... circle r=3                        #e6a8b0
```

Ambos ganham um **tween de respiração** (`scaleY` 1 → 1.03, `yoyo`,
`repeat: -1`, `duration: 1400`, `ease: Sine.inOut`) — 6 linhas que fazem
mais pela sensação de "vivo" do que um sprite parado faria.

> Quando houver arte, só o método `drawBody()` muda. Nada mais do sistema de
> NPC conhece a forma do bicho.

### 5.2 A entidade `Npc` (novo)

`src/game/entities/Npc.ts`:

```ts
export type NpcDef = {
    id: string;
    name: string;
    x: number;
    // Facing inicial: pra onde o NPC olha antes de o jogador chegar.
    facing: 1 | -1;
    draw: (g: GameObjects.Graphics) => void;   // ver 5.1
    lines: string[];                            // fala de abertura
    // Preenchido na Etapa 6. Sem loja, o NPC só conversa.
    shop?: ShopDef;
};

export const INTERACT_RANGE = 90;
```

`PhaseDefinition` ganha `npcs?: NpcDef[]`.

O NPC **não tem corpo físico**. Ele não anda, não colide, não recebe dano —
um `StaticBody` só serviria para o jogador ficar preso nele. A proximidade é
medida por distância, exatamente como `handlePortals()` já faz
(`Game.ts:585`).

### 5.3 O ícone flutuante da tecla

Requisito explícito do briefing. Um `Container` filho do NPC, posicionado
acima da cabeça:

```
- roundedRect 26 × 26, raio 6, fill #10212b a 0.85, borda #b8cc84 2px
- texto "E", monospace 15px, cor #f7e7b0, centralizado
- setDepth(22)
```

Comportamento:

- **Escondido** por padrão (`setVisible(false)`, `alpha: 0`).
- Ao jogador entrar em `INTERACT_RANGE`: tween de `alpha` 0→1 e `y` -8, em
  180ms, `ease: Back.out`.
- Enquanto visível: tween de flutuação (`y` ±5, `yoyo`, `repeat: -1`,
  `duration: 900`) — é isso que faz o ícone parecer flutuante, não estático.
- Ao sair do alcance ou ao abrir o diálogo: `alpha` → 0 em 140ms.
- Guardar a referência dos tweens e matá-los no `shutdown` da cena. Tween
  com `repeat: -1` que não é destruído é vazamento clássico.

**Um NPC por vez.** Se o jogador estiver no alcance de dois, só o mais
próximo mostra o ícone — senão são dois "E" na tela e nenhuma pista de qual
responde à tecla.

### 5.4 Diálogo (novo)

`src/game/ui/DialogueBox.ts`. Painel inferior fixo, mesma paleta do resto:

- `fillRoundedRect` na largura da tela menos 120px, altura 150px, ancorado a
  100px do rodapé, `0x08111d` a 0.94, borda `0xb8cc84` — idêntico ao painel
  de pausa (`repositionPauseOverlay`, `Game.ts:965`).
- Nome do NPC em `Georgia 18px #f7e7b0`; fala em `monospace 14px #e8e4dc`
  com `wordWrap`.
- Efeito de máquina de escrever: revela a fala caractere a caractere
  (`scene.time.addEvent` a 22ms). `E` durante a revelação **completa a linha
  na hora**; `E` com a linha completa avança para a próxima; na última,
  fecha.
- Rodapé com "E continuar" / "E fechar", `monospace 11px`.

### 5.5 Integração na cena

`src/game/world/NpcManager.ts` — mesma ideia do `LootManager`, para não
inchar `Game.ts`:

```ts
// no create() da PhaseScene
this.npcs = new NpcManager(this, this.player, this.phase.npcs ?? []);

// no update()
this.npcs.update();
```

### 5.6 Gates de input — a parte que sempre quebra

O `update()` de `PhaseScene` tem uma cadeia de estados que se atropelam.
A ordem correta:

```ts
update(time, delta) {
    // 1. Diálogo/loja aberto consome TODA tecla e sai. Nem ESC, nem M,
    //    nem ataque, nem movimento passam.
    if (this.dialogue.isOpen) {
        this.dialogue.update();
        return;
    }

    // 2. ESC: fecha mapa se aberto, senão pausa. (comportamento atual)
    // 3. if (this.isPaused) return;
    // 4. E: interage com o NPC mais próximo, se houver.
    // 5. resto do update normal
}
```

E ao abrir o diálogo:

```ts
this.player.setControlsEnabled(false);   // já existe, usado no teleporte
```

> **ARMADILHA 1:** `setControlsEnabled(false)` zera a velocidade todo frame
> (`Player.ts:104`), mas **não** para a animação. Tocar `player-idle`
> explicitamente ao abrir o diálogo.
>
> **ARMADILHA 2:** `togglePause()` faz `this.time.paused = true`
> (`Game.ts:764`). O efeito de máquina de escrever usa `time.addEvent`. Se
> pausa e diálogo puderem coexistir, o texto congela e o `E` não responde.
> Por isso o gate do diálogo vem **antes** de tudo e é excludente.

### 5.7 HUD

Acrescentar `·  E interagir` ao `controlsText` (`Game.ts:648`).

### 5.8 Critério de pronto

- Os dois NPCs aparecem na vila, respirando, olhando para o lado certo.
- Chegar perto faz o "E" subir e flutuar; afastar faz sumir.
- Com dois NPCs próximos, só o mais próximo mostra o ícone.
- Durante o diálogo o jogador não anda, não ataca, não pausa, não abre mapa.
- Fechar o diálogo devolve o controle.
- Sair da fase com diálogo aberto não deixa tween nem timer vivos.

---

## Etapa 6 — Loja

### Objetivo

Coelho **vende poções**. Capivara **compra maçãs**. Ambos pelo mesmo painel.

### 6.1 Economia (dados)

`src/game/items/economy.ts`:

```ts
// Interpretação do briefing:
//   "1 pack (50 itens) de moedas é 50"  -> 1 moeda vale 1. Um slot cheio = 50.
//   "1 pack (50 itens) de maçãs é 10"   -> 50 maçãs valem 10 moedas.
//
// 50 maçãs -> 10 moedas é a mesma taxa de 5 maçãs -> 1 moeda. A venda usa a
// taxa em blocos de 5 para o jogador não precisar acumular 50 antes de
// vender qualquer coisa, e para nunca aparecer moeda fracionada.
export const ECONOMY = {
    APPLES_PER_COIN: 5,
    POTION_PRICE: 15
} as const;
```

> **Ver Decisão de design #3** — esta é a leitura literal do briefing, e ela
> deixa a maçã fraca demais. O número está isolado nesta constante justamente
> para ser afinado sem tocar em código.

### 6.2 `ShopDef`

```ts
export type ShopEntry =
    | { mode: 'buy';  item: ItemId; price: number }                   // NPC vende ao jogador
    | { mode: 'sell'; item: ItemId; pricePer: number; lot: number };  // NPC compra do jogador

export type ShopDef = {
    greeting: string;
    entries: ShopEntry[];
};
```

Coelho:
```ts
shop: {
    greeting: 'Poção fresquinha, saída da panela!',
    entries: [{ mode: 'buy', item: 'potion', price: ECONOMY.POTION_PRICE }]
}
```

Capivara:
```ts
shop: {
    greeting: 'Traz maçã que eu troco por moeda.',
    entries: [{ mode: 'sell', item: 'apple', pricePer: 1, lot: ECONOMY.APPLES_PER_COIN }]
}
```

### 6.3 Painel (novo)

`src/game/ui/ShopPanel.ts`. Herda a linguagem visual do `DialogueBox`
(mesmo painel, mesma paleta, mesmo depth 103), com uma lista de linhas:

```
 ┌──────────────────────────────────────────┐
 │  COELHO BOTICÁRIO          ⬤ 87 moedas   │
 ├──────────────────────────────────────────┤
 │ ▸ Poção            15 moedas    [comprar]│
 ├──────────────────────────────────────────┤
 │  W/S escolher · E confirmar · ESC sair   │
 └──────────────────────────────────────────┘
```

- Navegação por `W`/`S`, confirma com `E`, fecha com `ESC`. **Sem mouse** —
  o resto do jogo é teclado; misturar os dois é pior que escolher um.
- A linha selecionada tem fundo `0x294b35` (o mesmo hover dos botões do menu,
  `MenuScene.ts:132`).
- Contador de moedas no cabeçalho, lido de `inventory.count('coin')`.

### 6.4 Transação

`src/game/items/shop.ts` — função pura, testável, fora da UI:

```ts
export type TransactionResult =
    | { ok: true; message: string }
    | { ok: false; reason: 'no-funds' | 'no-items' | 'no-space' };

export function execute(inv: Inventory, entry: ShopEntry): TransactionResult
```

Regras, em ordem:

1. **Compra:** valida moeda (`count >= price`) → valida espaço
   (`hasSpaceFor(item, 1)`) → `remove('coin', price)` → `add(item, 1)`.
2. **Venda:** valida `count(item) >= lot` → valida espaço para a moeda →
   `remove(item, lot)` → `add('coin', pricePer)`.
3. Toda validação acontece **antes** de qualquer mutação. `Inventory.remove`
   já é atômico (Etapa 2.2), mas a sequência remove→add não é: se o `add`
   falhar depois do `remove`, o jogador perde o item e não recebe nada.

Falha não é silenciosa: o painel mostra a mensagem
("Moedas insuficientes", "Inventário cheio", "Você não tem 5 maçãs") em
`#ff6b6b` por 1,5s na área da lista.

### 6.5 Fluxo completo

```
jogador perto do coelho
  → ícone "E" flutua
  → E
  → DialogueBox com greeting
  → E ao fim da fala
  → ShopPanel abre (o gate de input é o mesmo do diálogo — ver 5.6)
  → compra/vende
  → ESC
  → controles devolvidos
```

### 6.6 Critério de pronto

- Comprar poção desconta 15 moedas e ocupa slot.
- Poção comprada cura 2 HP ao usar (tecla do slot).
- Vender 5 maçãs dá 1 moeda; com 4 maçãs a opção recusa com mensagem.
- Sem moeda / sem espaço / sem item: falha explícita, nada é perdido.
- Comprar, sair da vila, voltar: o saldo e os itens continuam corretos.
- Recarregar a página: idem.

---

## Decisões de design

**#1 — `PlayerClimb` fica como está (escalada agarrada), não vira wall-jump.**
O briefing pede "escalada simplificada", mas o pedido é sobre o **terreno**,
não sobre a mecânica. `PlayerClimb` são 104 linhas que já funcionam, já
lidam com o conflito de gravidade contra o dash e já têm mantle. Trocar por
wall-slide + wall-jump seria reescrever uma mecânica testada para chegar em
outra igualmente complexa — e o `WALL_CLIMB_FEATURE_PLAN.md` registra que o
wall-slide já foi tentado e **descartado por não atender**. A simplificação
acontece no level design: uma parede escalável por fase, no máximo, nunca no
caminho obrigatório.

**#2 — As armadilhas de espinho são removidas, não simplificadas.**
"Só parkour e escalada" exclui hazard ambiental. Manter espinhos significaria
manter `TrapDef`, `drawTraps`, `trapRects` e `checkTraps` para um sistema que
duplica a única função que o inimigo já cumpre: tirar HP. Se a intenção era
mantê-los, é a decisão mais barata de reverter de todo este plano — está tudo
isolado.

**#3 — Taxa da maçã: leitura literal, com ressalva.**
`50 maçãs = 10 moedas` significa 1 maçã = 0,2 moeda. Comparado ao drop direto
de 5-30 moedas por inimigo, a maçã fica ~50× menos valiosa que a moeda pelo
mesmo esforço de farm: ~25 a 50 mortes para juntar 50 maçãs e receber 10
moedas, contra ~17 moedas em média de **uma** morte. Na prática ninguém vai
vender maçã. A implementação segue o briefing, mas `ECONOMY.APPLES_PER_COIN`
está isolado para virar 1 ou 2 assim que o balanceamento for testado.

**#4 — Inventário é barra fixa, não painel que abre.**
Seis slots cabem no rodapé sem atrapalhar. Um painel modal exigiria mais um
gate de input concorrendo com pausa, mapa, diálogo e loja — quatro estados
mutuamente excludentes já são o suficiente para dar errado.

**#5 — Moeda ocupa slot do inventário.**
Seria mais simples ter um contador separado, mas o briefing diz "1 pack de
moedas é 50" num inventário de 6 itens — ou seja, a moeda **compete por
espaço**. Isso é uma escolha de design deliberada (limita o farm), não um
detalhe: com 6 slots, carregar moeda, maçã e poção já consome metade.

**#6 — Chave de save nova em vez de migração.**
`SaveData` muda duas vezes nesta parte (ganha `inventory`, e os `phaseIndex`
deslocam com a vila). Escrever migração para um save de protótipo custa mais
do que vale. `jogo-99:save:v2` invalida os antigos de forma limpa e
previsível.

---

## Armadilhas conhecidas (resumo)

| # | Onde | O quê |
| --- | --- | --- |
| 1 | `Game.ts:268` | Fase sem inimigo nunca fica "limpa" → portal trancado. Resolvido por `safeZone`. |
| 2 | `Game.ts:104` | `writeSave` montado à mão a cada troca de fase apaga o inventário. Resolvido por `saveProgress`. |
| 3 | `BaseEnemy.ts:295` | Emitir `enemy-died` no `onComplete` do tween é tarde demais — o objeto já foi destruído. |
| 4 | `Game.ts:270` | Pickup dentro do array `enemies` tranca o portal para sempre. |
| 5 | `Game.ts:764` | `time.paused` congela o typewriter do diálogo. Os gates precisam ser excludentes. |
| 6 | `Player.ts:104` | `setControlsEnabled(false)` zera velocidade mas não para a animação. |
| 7 | `Game.ts:801` | `drawMapPhaseIcon` não tem `default` — fase nova sem `case` fica com ícone invisível. |
| 8 | Etapa 5.3 | Tween com `repeat: -1` não destruído no `shutdown` vaza a cada respawn. |
| 9 | Etapa 6.4 | `remove` → `add` não é atômico. Validar tudo antes de mutar qualquer coisa. |

---

## Comandos

```bash
npm run dev-nolog
```

```bash
npx tsc --noEmit
```

Rodar `npx tsc --noEmit` ao fim de **cada etapa**, não só no fim da parte.
