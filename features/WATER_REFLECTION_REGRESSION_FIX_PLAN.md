# Plano: reflexo 1:1 (metade da tela) + reescala das outras fases

## Conceito

A raiz de todo problema anterior com o reflexo era tentar mostrar cenário
demais (árvore + casa + montanha) numa faixa fininha de água (84-99px),
sempre exigindo compressão vertical (zoom bem menor que 1) — daí "achatado".

A solução real: **`GROUND_Y` vira exatamente `HEIGHT / 2` (384, em vez de
654)**. Metade de cima da tela = jogo normal. Metade de baixo = reflexo da
metade de cima, **sem nenhuma compressão** — porque as duas metades têm
exatamente o mesmo tamanho (384px cada), o zoom do espelho é `1:1` (só
inverte verticalmente, não encolhe nada). A divisão entre as duas metades é
literalmente a linha do chão (`GROUND_Y`) — "o terreno" que você pediu.

**Escopo**: só a fase `forest` ganha o efeito de água/reflexo (é a única com
tema de lago). As outras 5 fases (deserto, neve, caverna, vulcão, ruínas)
**não** ganham água — mas como `GROUND_Y` é uma constante **compartilhada**
por todas as fases, baixar ela de 654 pra 384 encolhe a "área de céu" de
todo mundo pela metade. Sem ajustar as outras fases, o céu delas ficaria
cortado no meio do degradê (a cor mais próxima do chão nunca apareceria,
porque começaria a 480-654px do topo, e o chão agora está em 384). Por
isso a maior parte deste plano é uma auditoria de reescala nas outras 5
fases — ver seção 3.

## 1. `GROUND_Y` e o helper de reescala (`src/game/world/phases.ts`)

```ts
export const HEIGHT = 768;
export const GROUND_Y = HEIGHT / 2; // era 654 — agora exatamente a metade da tela
export const PHASE_WIDTH = 2560;

// Deserto/neve/caverna/vulcão/ruínas foram desenhados originalmente com o
// chão em Y=654. Como GROUND_Y agora é a metade da tela (384), qualquer
// coordenada Y ABSOLUTA dessas fases (medida a partir do topo, y=0) precisa
// encolher na mesma proporção, senão o céu/decoração fica cortado antes de
// chegar na cor/elemento pensado pra ficar perto do chão.
//
// Regra usada nesta reescala: SÓ posição Y absoluta é multiplicada por
// V_SCALE. Tamanho de forma (altura de cacto, raio de sol, comprimento de
// estalactite etc.) fica igual — só a "altura do céu disponível" encolheu,
// os objetos dentro dele não.
const LEGACY_GROUND_Y = 654;
const V_SCALE = GROUND_Y / LEGACY_GROUND_Y; // ≈ 0.587
function scaleY(y: number): number {
    return y * V_SCALE;
}
```

## 2. `FOREST_WATER_TOP_Y` vira só `GROUND_Y`

Hoje: `export const FOREST_WATER_TOP_Y = GROUND_Y + 15;` (deixava uma tira
de grama de 15px antes da água). Você pediu que **a divisão seja o
terreno** — sem essa tira:

```ts
export const FOREST_WATER_TOP_Y = GROUND_Y;
```
(Ou, mais simples ainda: apagar a constante e usar `GROUND_Y` direto nos
dois lugares que a referenciam — `drawWaterBase` aqui em `phases.ts` e
`setupLakeReflection` em `Game.ts`. Qualquer uma das duas formas funciona;
manter a constante só documenta melhor a intenção.)

## 3. Auditoria linha a linha das outras 5 fases

Para cada `654` **literal** (não a constante `GROUND_Y`, a palavra "654"
digitada direto) usado como **posição absoluta no céu/decoração**, envolver
com `scaleY(...)`. Para cada `654` literal usado como **a própria linha do
chão**, trocar por `GROUND_Y` (sem `scaleY`, porque `GROUND_Y` já É o valor
novo — `scaleY(654)` daria o mesmo resultado, mas usar a constante deixa
mais claro que é "o chão", não "uma altura calculada").

### `sunsetStripes` (função compartilhada, linha 68-74, usada só por `volcano`)
```ts
// antes:
let prev = 654;
// depois:
let prev = GROUND_Y;
```

### `desert` (linha 183-214)
- Linha 185 — `fillSky(sky, x0, [[170,...],[330,...],[480,...],[654,...]])`
  → `[[scaleY(170), 0xfbe3a2], [scaleY(330), 0xf3b45d], [scaleY(480), 0xe9843a], [GROUND_Y, 0xd9692f]]`
- Linha 194 — `const peakY = 460 + (di % 3) * 40;`
  → `const peakY = scaleY(460 + (di % 3) * 40);`
- Linha 196 — `dunes.fillTriangle(x, 654, x + 210, peakY, x + 420, 654);`
  → `dunes.fillTriangle(x, GROUND_Y, x + 210, peakY, x + 420, GROUND_Y);`
- Linha 202 — `drawCactus(cacti, x0 + x, 654, 48 + (ci % 4) * 12, 14 + (ci % 2) * 4);`
  → `drawCactus(cacti, x0 + x, GROUND_Y, 48 + (ci % 4) * 12, 14 + (ci % 2) * 4);`
  (os dois últimos parâmetros são altura/largura do cacto — tamanho, não
  posição, não mexer.)
- Linhas 208-213 (`sand.lineBetween(..., GROUND_Y + 14, ...)`): **não
  mexer** — já usam a constante `GROUND_Y`, se ajustam sozinhas.

### `snow` (linha 217-252)
- Linha 223 — mesmo padrão do desert: envolver os 4 stops, último vira
  `GROUND_Y`.
- Linha 228 — `const peakY = 320 + (mi % 3) * 30;`
  → `const peakY = scaleY(320 + (mi % 3) * 30);`
- Linha 231 — `mts.fillTriangle(x, 554, cx, peakY, x + 420, 554);`
  → `mts.fillTriangle(x, scaleY(554), cx, peakY, x + 420, scaleY(554));`
  (**atenção**: `554` aqui não é o chão — é a base da montanha, que fica
  100px acima do chão original de propósito, pra floresta de pinheiros na
  frente cobrir a emenda. Por isso é `scaleY(554)`, não `GROUND_Y`.)
- Linha 233 — `mts.fillTriangle(cx - 34, peakY + 54, cx, peakY, cx + 34, peakY + 54);`
  **não mexer** — `peakY` já foi escalado acima, e o `+54` é o tamanho do
  "gorro de neve" do pico, não posição absoluta.
- Linha 240 — `const ty = 500 + ((ti * 17) % 46);`
  → `const ty = scaleY(500 + ((ti * 17) % 46));`
- Linha 250 (`snow.fillCircle(x, GROUND_Y + 22, 5)`): **não mexer**, já usa
  a constante.

### `cave` (linha 255-291)
- Linha 261 — `fillSky(sky, x0, [[300,...],[500,...],[654,...]])`
  → `[[scaleY(300), 0x15101e], [scaleY(500), 0x241836], [GROUND_Y, 0x332243]]`
  (só 3 stops nessa fase, não 4 — atenção pra não copiar o padrão de 4 do
  desert/snow sem olhar.)
- Linha 264 — `glow.fillCircle(x0 + PHASE_WIDTH / 2, 180, 320);`
  → `glow.fillCircle(x0 + PHASE_WIDTH / 2, scaleY(180), 320);`
  (raio `320` é tamanho, não mexer.)
- Linhas 271-274 — dentro do `.forEach`, os dois `drawCrystal(...)`:
  ```ts
  // antes:
  drawCrystal(x0 + px, 300 + (i % 3) * 16, 70 + (i % 4) * 18, 30 + (i % 3) * 10);
  drawCrystal(x0 + px + 46, 318 + (i % 3) * 14, 52 + (i % 4) * 12, 24 + (i % 3) * 8);
  // depois (só o 2º argumento de cada chamada, que é a posição Y da base do cristal):
  drawCrystal(x0 + px, scaleY(300 + (i % 3) * 16), 70 + (i % 4) * 18, 30 + (i % 3) * 10);
  drawCrystal(x0 + px + 46, scaleY(318 + (i % 3) * 14), 52 + (i % 4) * 12, 24 + (i % 3) * 8);
  ```
- Linhas 276-282 (estalactites, `stalactites.fillTriangle(x0 + x, 0, x0 + x + 14, 0, x0 + x + 7, h)`):
  **não mexer**. Nascem do teto (`y=0`, que não muda) e `h` é o
  comprimento — tamanho, não posição.
- Linha 289 (`pebbles.fillCircle(x, GROUND_Y + 20, 4)`): **não mexer**, já
  usa a constante.

### `volcano` (linha 294-332)
- Linha 300 — mesmo padrão de 4 stops do desert.
- Linha 303 — `sun.fillCircle(x0 + PHASE_WIDTH / 2, 330, 100);`
  → `sun.fillCircle(x0 + PHASE_WIDTH / 2, scaleY(330), 100);`
- Linha 304 — `sun.fillCircle(x0 + PHASE_WIDTH / 2, 340, 70);`
  → `sun.fillCircle(x0 + PHASE_WIDTH / 2, scaleY(340), 70);`
- Linha 307 — `sunsetStripes(stripes, x0, [[560,...], [480,...], [410,...]]);`
  → `sunsetStripes(stripes, x0, [[scaleY(560), 0xe0752f], [scaleY(480), 0xb13a2e], [scaleY(410), 0x64263a]]);`
- Linha 311 — `volcano.fillTriangle(x0 + 480, 654, x0 + 780, 430, x0 + 1080, 654);`
  → `volcano.fillTriangle(x0 + 480, GROUND_Y, x0 + 780, scaleY(430), x0 + 1080, GROUND_Y);`
- Linha 313 — `volcano.fillTriangle(x0 + 760, 654, x0 + 1240, 390, x0 + 1720, 654);`
  → `volcano.fillTriangle(x0 + 760, GROUND_Y, x0 + 1240, scaleY(390), x0 + 1720, GROUND_Y);`
- Linha 314 — `volcano.fillTriangle(x0 + 1240, 390, x0 + 1230, 414, x0 + 1250, 414);`
  → `volcano.fillTriangle(x0 + 1240, scaleY(390), x0 + 1230, scaleY(414), x0 + 1250, scaleY(414));`
- Linha 315 — `volcano.fillCircle(x0 + 1240, 386, 8);`
  → `volcano.fillCircle(x0 + 1240, scaleY(386), 8);`
- Linhas 319-321 — `smoke.fillCircle(x0 + 1220, 340, 16)`, `(..., 324, 20)`,
  `(..., 346, 14)` → envolver o 2º argumento de cada uma com `scaleY(...)`
  (`340`→`scaleY(340)`, `324`→`scaleY(324)`, `346`→`scaleY(346)`). Raios
  (16, 20, 14) não mexem.
- Linhas 327-330 (`lava.fillRect(x0 + x, GROUND_Y + 12, ...)`): **não
  mexer**, já usa a constante.

### `ruins` (linha 335-372)
- Linha 341 — mesmo padrão de 4 stops.
- Linha 344 — `moon.fillCircle(x0 + 2100, 150, 44);`
  → `moon.fillCircle(x0 + 2100, scaleY(150), 44);`
- Linha 345 — `moon.fillCircle(x0 + 2088, 138, 7);`
  → `moon.fillCircle(x0 + 2088, scaleY(138), 7);`
- Linhas 350-354 (`drawPillar`, usa `GROUND_Y - ph`) e linhas 365-367
  (steps, usam `GROUND_Y - 30/50/70`): **não mexer**, já são relativas à
  constante.

## 4. Simplificar o reflexo em `Game.ts` (`setupLakeReflection`)

Como agora `GROUND_Y` é **exatamente** `HEIGHT / 2`, o topo e o reflexo têm
o mesmo tamanho por construção — o zoom vertical do espelho pode (e deve)
ser sempre `1:1`, sem precisar de um número mágico tipo os `380`/`550`
testados antes:

```ts
private setupLakeReflection() {
    const viewportY = FOREST_WATER_TOP_Y; // = GROUND_Y
    const viewportHeight = HEIGHT - FOREST_WATER_TOP_Y; // = GROUND_Y também, já que a água começa exatamente na metade

    const cam = this.cameras.add(0, viewportY, this.scale.width, viewportHeight);
    cam.setName('lake-reflection');

    // zoomX = 1: mesma largura de mundo que a câmera principal.
    // zoomY = -1: espelha SEM encolher — só funciona porque a metade de
    // baixo tem exatamente o mesmo tamanho da metade de cima refletida
    // (viewportHeight === o quanto de mundo está sendo refletido).
    cam.setZoom(1, -1);
    cam.setAlpha(0.8); // ver seção 5 sobre o tom de água

    cam.scrollY = GROUND_Y;

    cam.ignore(this.hudObjects);
    cam.ignore(this.mapOverlay);

    this.reflectionCam = cam;
}
```
Repare que não existe mais a variável `reflectedWorldHeight` separada — ela
sempre seria igual a `viewportHeight` agora, então o `setZoom` fica `(1,
-1)` fixo, sem cálculo.

## 5. Overlay azul de "água" (`drawWaterBase` em `phases.ts`)

A câmera do reflexo é desenhada **por cima** da base sólida (ordem de
câmeras: principal primeiro, reflexo depois) — então a base funciona como
o "tom de água" por trás do reflexo nítido:

```ts
function drawWaterBase(scene: Scene, x0: number) {
    scene.add
        .rectangle(x0, FOREST_WATER_TOP_Y, PHASE_WIDTH, HEIGHT - FOREST_WATER_TOP_Y, 0x2972a4)
        .setOrigin(0, 0)
        .setDepth(0.5);

    scene.add
        .tileSprite(x0, FOREST_WATER_TOP_Y - 8, PHASE_WIDTH, 16, 'forest-water-edge')
        .setOrigin(0, 0)
        .setTileScale(16 / 207, 16 / 207)
        .setDepth(0.6);
}
```
Com `cam.setAlpha(0.8)` (seção 4) por cima dessa base azul sólida, o
resultado final é ~80% reflexo nítido + ~20% do tom azul — lê como "água
com reflexo", não "reflexo murcho tentando aparecer atrás de água escura"
(o problema das tentativas anteriores). Se ainda estiver escuro/claro
demais depois de testar, o único número pra mexer é esse `0.8`.

## Decisões de design em aberto

1. **Só `forest` ganha reflexo, as outras 5 fases só reescalam.** Faz
   sentido termático (só floresta tem lago), mas se você quiser água em
   outra fase depois (ex.: oásis no deserto), o mecanismo de
   `setupLakeReflection`/`drawWaterBase` já está pronto pra reaproveitar —
   só chamar pra outra fase também.
2. **Portal e boss (se já implementado) ficam proporcionalmente maiores**
   na tela agora, porque a área de jogo (céu+chão) encolheu pela metade mas
   o personagem/inimigos não mudaram de tamanho. Isso é consequência direta
   do que você pediu (metade da tela virar água) — vale um play-test rápido
   depois de aplicar pra ver se a composição ainda agrada, especialmente o
   portal (150px de altura, quase 40% da área de jogo agora) e o boss
   (240px de altura na escala 5x planejada, mais de 60%).

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Floresta: divisão exatamente no meio da tela, reflexo nítido (não
  achatado) e reconhecível como espelho da metade de cima, sem tira de
  grama entre o chão e a água.
- Deserto/neve/caverna/vulcão/ruínas: céu ainda com degradê completo (a cor
  mais próxima do chão aparece logo acima da linha do chão, não fica cortada
  no meio); decorações (dunas, montanhas, cristais, vulcão, lua, pilares)
  ainda proporcionalmente no lugar, sem sumir acima do topo da tela nem
  enterradas abaixo do chão.
- Jogador/inimigos ainda pisam exatamente na linha do chão nas 6 fases
  (colisão física não muda, só o visual — mas vale conferir que nada ficou
  flutuando ou afundado por causa da reescala).
- Portais continuam encostados no chão certo nas 6 fases.
