# Plano: mini-boss no fim de cada fase

## Objetivo

Cada fase ganha **um inimigo boss** posicionado perto do portal de saída
(fim da fase). Ele:
- Usa a **mesma animação/sprite** dos inimigos já existentes (graverobber ou
  steamman — sem arte nova).
- É visivelmente maior e tem muito mais HP que um inimigo comum.
- Mostra uma **barra de vida** (isso não existe pros inimigos normais hoje).
- Conta pra condição de portal já implementada ("matar todos os inimigos
  destrava o portal") — **sem precisar mudar essa lógica**, porque o boss
  é só mais um item dentro de `this.enemies`.

A última fase (`ruins`) não tem portal de saída — o boss dela vira,
naturalmente, o **chefe final do jogo**, sem precisar de nenhum caso
especial no código.

## 1. `BaseEnemy`: aceitar stats por parâmetro (em vez de só por tipo)

Hoje, em `src/game/entities/BaseEnemy.ts:41-51`, o construtor sempre deriva
as estatísticas do `typeKey`:
```ts
protected constructor(scene: Scene, x: number, y: number, typeKey: EnemyType, target: Player) {
    super(scene, x, y, `${typeKey}-idle`, 0);
    this.typeKey = typeKey;
    this.stats = ENEMY_STATS[typeKey];
    ...
    this.setScale(3);
```
Pro boss usar a **mesma animação** do graverobber mas com **números de
boss**, o construtor precisa aceitar as stats e a escala como parâmetros
opcionais, com o comportamento atual como default (então `Graverobber` e
`Steamman` não mudam nada):

```ts
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
    ...
    this.setScale(scale);
```
`Graverobber`/`Steamman` continuam chamando `super(scene, x, y, 'graverobber', target)` sem o 5º/6º argumento — nada muda pra eles.

## 2. `BOSS_STATS` (novo, em `src/game/damage/health-config.ts`)

Mesma forma de `ENEMY_STATS`, só que reaproveitando o tipo `EnemyCombat`/
`EnemyBody` já existentes. Números são ponto de partida, ajustar jogando:

```ts
export const BOSS_STATS: Record<EnemyType, typeof ENEMY_STATS[EnemyType]> = {
    graverobber: {
        ...ENEMY_STATS.graverobber,
        hp: 40,              // vs 3 do graverobber normal
        defense: 1,
        combat: {
            ...ENEMY_STATS.graverobber.combat,
            amount: 2,
            aggroRange: 420,  // agrota de mais longe
            attackRange: 70,  // alcance maior (personagem visualmente maior)
            cooldownMs: 650   // ataca mais seguido que o normal (850ms)
        }
    },
    steamman: {
        ...ENEMY_STATS.steamman,
        hp: 60,
        defense: 2,
        combat: {
            ...ENEMY_STATS.steamman.combat,
            amount: 3,
            aggroRange: 380,
            attackRange: 75,
            cooldownMs: 900
        }
    }
};
```
Note que `body` **não muda** — as dimensões do corpo são medidas em pixels
de fonte (dentro do frame 48×48), independente da escala final; o corpo em
px de mundo já cresce sozinho junto com o `scale` maior (ver seção 1), não
precisa duplicar esses números.

## 3. Classe `Boss` (novo arquivo `src/game/entities/Boss.ts`)

Estende `BaseEnemy`, passando `BOSS_STATS[typeKey]` e uma escala maior
(ex.: `5` em vez de `3`), e adiciona a barra de vida por cima:

```ts
import { GameObjects, Scene } from 'phaser';
import { BaseEnemy } from './BaseEnemy';
import { BOSS_STATS, EnemyType } from '../damage/health-config';
import { Player } from './Player';

const BAR_WIDTH = 90;
const BAR_HEIGHT = 10;
const BAR_OFFSET_Y = -160; // acima da cabeça; ajustar olhando o boss em jogo (escala 5x fica bem mais alto que um inimigo normal)

export class Boss extends BaseEnemy {
    private readonly barBg: GameObjects.Rectangle;
    private readonly barFill: GameObjects.Rectangle;

    constructor(scene: Scene, x: number, y: number, typeKey: EnemyType, target: Player) {
        super(scene, x, y, typeKey, target, BOSS_STATS[typeKey], 5);

        this.barBg = scene.add.rectangle(x, y + BAR_OFFSET_Y, BAR_WIDTH + 4, BAR_HEIGHT + 4, 0x0b0b0b, 0.8).setDepth(16);
        this.barFill = scene.add.rectangle(x, y + BAR_OFFSET_Y, BAR_WIDTH, BAR_HEIGHT, 0xd94f4f).setDepth(17);
    }

    update(time: number, delta: number): void {
        super.update(time, delta);

        this.barBg.setPosition(this.x, this.y + BAR_OFFSET_Y);
        this.barFill.setPosition(this.x, this.y + BAR_OFFSET_Y);

        const ratio = Math.max(0, this.healthInfo.current / this.healthInfo.max);
        this.barFill.width = BAR_WIDTH * ratio;
        // Rectangle ancora no centro por padrão — encolher a largura pela
        // direita fica estranho sem realinhar a origem/x. Testar visualmente;
        // se ficar errado, trocar setOrigin(0, 0.5) na barFill e ajustar x
        // pra esquerda fixa em vez de centralizado.
    }

    // Some as barras junto com o boss quando ele morre (BaseEnemy.die() já
    // faz um tween de fade + destroy no sprite; a barra não é filha dele,
    // então precisa ser limpa separadamente).
    destroy(fromScene?: boolean): void {
        this.barBg.destroy();
        this.barFill.destroy();
        super.destroy(fromScene);
    }
}
```

**Atenção pro Codex**: `BaseEnemy.die()` (linha ~284-303 hoje) só chama
`this.destroy()` dentro do `onComplete` de um tween, **depois** de um
fade/recuo de 220ms — então a barra de vida vai continuar visível (parada)
durante essa animação de morte e só some quando `destroy()` roda de fato no
final. Isso é aceitável (a barra "morre junto" com o boss, só com uma
fração de segundo de atraso) — não precisa antecipar a remoção da barra.

## 4. Spawn do boss (em `src/game/scenes/Game.ts`)

Um boss por fase, perto do portal de saída. Nova tabela ao lado de
`spawns` em `spawnEnemies()` (ou um método novo `spawnBoss()` chamado logo
depois de `spawnEnemies()` em `create()`):

```ts
private spawnBoss() {
    const bossByPhase: Record<string, EnemyType> = {
        forest: 'graverobber',
        desert: 'steamman',
        snow: 'graverobber',
        cave: 'steamman',
        volcano: 'steamman',
        ruins: 'graverobber' // chefe final
    };

    const type = bossByPhase[this.phase.key];
    if (!type) return;

    // Perto do portal de saída (PHASE_WIDTH - 120), com espaço suficiente
    // pra não ficar colado nele.
    const bossX = PHASE_WIDTH - 420;
    const boss = new Boss(this, bossX, GROUND_Y - 80, type, this.player);
    boss.setDepth(15);

    // Patrulha curta — o boss deve ficar perto de onde nasceu, não vagar
    // pela fase inteira como os inimigos comuns (180px de patrulha padrão
    // do BaseEnemy já dá conta disso, mas dá pra apertar mais):
    boss.setPatrolRange(bossX - 100, bossX + 100);

    this.enemies.push(boss);

    // Collider igual aos outros inimigos — reaproveita o mesmo laço que já
    // existe em create() pra ground/walls e pro dano de contato com dash.
}
```
Chamar `this.spawnBoss()` logo depois de `this.spawnEnemies()` em
`create()`. Importante: o collider jogador↔inimigo em `create()` hoje é
montado **dentro do loop que itera `this.enemies`, logo depois de
`spawnEnemies()`** — se `spawnBoss()` rodar **antes** desse loop (empurrando
o boss pra dentro de `this.enemies` a tempo), o boss ganha collider
automaticamente sem código extra. Só cuidar da ordem: `spawnEnemies()` →
`spawnBoss()` → loop que cria os colliders.

Nenhuma mudança é necessária na condição de portal (`this.enemies.every(e
=> !e.isAlive)`, já implementada) — o boss é só mais uma entrada no array.

## Decisões de design em aberto

1. **Posição exata (`PHASE_WIDTH - 420`)**: chute inicial pra deixar um
   "corredor de chefe" antes do portal. Ajustar olhando cada fase — pode
   variar por fase se alguma tiver decoração no caminho (ex.: o lago da
   floresta).
2. **Barra de vida sempre visível, ou só aparece quando o boss entra em
   `chase`/`attack`** (estilo "boss acordou")? A versão acima deixa sempre
   visível desde o spawn — mais simples, e já sinaliza "isso aqui é
   diferente" assim que o jogador entra na área. Dá pra trocar depois pra
   só aparecer com `setVisible(true)` quando `currentState !== 'patrol'`.
3. **Boss precisa de tint/cor diferente pra se destacar visualmente do
   inimigo comum do mesmo tipo?** Recomendo **não** mexer nisso agora: o
   `BaseEnemy` já usa `setTint`/`clearTint` pros estados de dano e morte
   (`takeHit`/`updateHurt`/`die`), e se o boss tivesse uma tint "permanente"
   ela seria apagada todo `clearTint()` desses estados — geraria um bug
   visual (tint sumindo depois do primeiro hit). O tamanho maior (escala 5)
   + a barra de vida já deixam claro que é um boss; se quiser cor
   diferenciada depois, é uma mudança à parte no `BaseEnemy` (guardar uma
   "tint base" e reaplicar em vez de só limpar).
4. **`ruins` (chefe final) merece stats ainda maiores que os outros
   bosses?** Hoje usei os mesmos `BOSS_STATS.graverobber` de qualquer outro
   boss graverobber. Se quiser que o final seja notavelmente mais difícil,
   criar uma entrada separada (`BOSS_STATS.graverobberFinal` ou um
   multiplicador extra só pro spawn de `ruins`).

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Boss nasce perto do portal de saída, patrulha numa área curta (não some
  fase afora).
- Barra de vida acompanha o boss e encolhe corretamente ao bater nele.
- Matar o boss (e os demais inimigos da fase) destrava o portal — mesma
  lógica de sempre, sem exigir código novo pra isso.
- Barra de vida some quando o boss morre (não fica "flutuando" sozinha na
  tela).
- Fase `ruins` (sem portal de saída): boss nasce e funciona normalmente,
  só não há portal pra destravar — sem crash por causa disso.
- Testar respawn do modo Normal (`scene.restart`) com o boss: como o fix do
  `NORMAL_RESPAWN_FIX_PLAN.md` já limpa `this.enemies = []` no início de
  `create()`, o boss não deve duplicar entre vidas — mas vale conferir
  especificamente, já que é uma classe nova interagindo com aquele fix.
