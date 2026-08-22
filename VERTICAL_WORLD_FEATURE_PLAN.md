# Plano: mundo mais alto que a tela (bounds verticais por fase)

## Objetivo

Permitir que uma fase específica tenha um mundo físico mais alto que
os 768px atuais (espaço suficiente pra caber uma escalada/torre de
verdade), sem mudar em nada a altura das fases que continuarem
"normais" — as 6 fases existentes devem manter bounds idênticos aos de
hoje.

Não depende de nenhum outro plano pra funcionar (bounds são
independentes de haver ou não plataformas dentro deles), mas só fica
útil combinado com `PLATFORM_SYSTEM_FEATURE_PLAN.md` (que dá o que
pisar no espaço extra) e `VERTICAL_SPAWN_MAP_FEATURE_PLAN.md` (spawn
de inimigo em Y não-padrão).

## 1. Separar "altura da viewport" de "altura do mundo da fase"

Hoje uma única constante faz dois papéis: `HEIGHT = 768`
(`src/game/world/phases.ts:3`) é tanto a altura do design do canvas
(replicada manualmente em `src/game/main.ts:19`, `height: 768`) quanto
a altura do "mundo físico" de cada fase
(`this.physics.world.setBounds(0, 0, PHASE_WIDTH, HEIGHT)`,
`Game.ts:89`, e `camera.setBounds(0, 0, PHASE_WIDTH, HEIGHT)`,
`Game.ts:138`). Enquanto os dois valores forem sempre iguais isso não
importa — mas pra uma fase mais alta que a tela, o mundo precisa poder
ser maior que a viewport (a câmera rola verticalmente dentro dele), e
os dois deixam de ser a mesma coisa.

Adicionar em `PhaseDefinition` (`phases.ts:21-26`):

```ts
export type PhaseDefinition = {
    key: string;
    name: string;
    subtitle: string;
    worldTop?: number;    // default 0 — quanto o mundo se estende ACIMA de y=0 (negativo = mais alto)
    worldHeight?: number; // default HEIGHT — altura total do mundo físico da fase
    draw: (scene: Scene, x0: number) => void;
};
```

`worldTop` negativo é o que permite "subir": em Phaser, `y` cresce pra
baixo, então escalar uma torre significa ir a valores de `y` cada vez
mais negativos em relação ao chão original (`GROUND_Y`). Exemplo pra
uma fase 1000px mais alta que hoje: `worldTop: -1000, worldHeight:
HEIGHT + 1000`.

## 2. Mudanças em `Game.ts` (`create()`)

`Game.ts:89` e `Game.ts:138` precisam ler os novos campos com fallback
exato pro comportamento atual:

```ts
const worldTop = this.phase.worldTop ?? 0;
const worldHeight = this.phase.worldHeight ?? HEIGHT;

this.physics.world.setBounds(0, worldTop, PHASE_WIDTH, worldHeight);
// ... (resto do create() sem mudança) ...
camera.setBounds(0, worldTop, PHASE_WIDTH, worldHeight);
```

Pra qualquer fase que não define os campos novos, `worldTop` vira `0` e
`worldHeight` vira `HEIGHT` — exatamente os valores hardcoded de hoje,
zero mudança de comportamento.

## 3. Fundo/parallax precisa cobrir a altura extra (trabalho manual, não automatizável)

Este é o ponto mais trabalhoso e **não** dá pra resolver com um helper
genérico. Cada fase pinta o próprio céu/montanhas/árvores dentro do
seu `draw()` assumindo uma faixa fixa de `0` a `GROUND_Y`
(ex.: `fillSky(sky, x0, [[scaleY(170), cor], ...])` sempre termina em
`GROUND_Y`, ver qualquer uma das 6 fases em `phases.ts`). Uma fase com
`worldTop: -1000` vai mostrar uma faixa preta/vazia acima de `y = 0`
se o `draw()` dela não for ajustado pra pintar até `worldTop`, não até
`0`.

Recomendação prática: **não** tentar "esticar" uma das 6 fases
existentes — o parallax delas foi desenhado e ajustado visualmente
para 768px (ver comentários em `phases.ts:98-121` sobre nuvens
cortadas, por exemplo), retrofitar arrisca regressão visual em
conteúdo que já está pronto. Em vez disso, criar a verticalidade numa
fase **nova e dedicada** (ex.: uma 7ª fase "torre"/"penhasco"), cujo
`draw()` já nasce pensado pra cobrir `worldTop..HEIGHT` desde o
início.

## 4. Spawn do jogador e câmera inicial

`this.player = new Player(this, spawnX, GROUND_Y - 80)`
(`Game.ts:102`) continua correto pra uma fase alta (jogador nasce
embaixo, sobe explorando) — não precisa mudar, a menos que o design
queira nascer em outro Y (aí é o mesmo mecanismo generalizado no
`VERTICAL_SPAWN_MAP_FEATURE_PLAN.md`). `camera.startFollow(this.player,
true, 0.1, 0.1)` (`Game.ts:139`) já segue X **e** Y — nenhuma mudança
necessária, ela só passa a ter mais espaço vertical pra rolar dentro
dos novos bounds.

## 5. HUD/overlays fixos não são afetados

`createHud()`, `createMapOverlay()`, `createPauseOverlay()`
(`Game.ts:482-606`) usam `setScrollFactor(0)` — são espaço de tela, não
de mundo, então continuam funcionando iguais independente da altura do
mundo da fase atual. Só conferir isso na checklist de regressão, não
precisa mudar nada nesses métodos.

## Atenção pro Codex

`FOREST_WATER_TOP_Y = GROUND_Y + 40` (`phases.ts:19`) e o reflexo do
lago (`setupLakeReflection`, só ativo quando `phase.key === 'forest'`,
`Game.ts:717-732`) são cálculos fixos baseados em `GROUND_Y`/`HEIGHT` e
assumem que a metade inferior da tela é água. **Não** aplicar este
plano na fase `forest` sem revisar esse sistema junto.

## Decisões de design em aberto

1. **Qual fase vira vertical?** Recomendo uma fase nova dedicada
   (seção 3), não retrofitar uma das 6 — muito menos risco de
   regressão visual em conteúdo já pronto e ajustado.
2. **`worldTop` fixo por fase ou auto-calculado a partir da plataforma
   mais alta?** Recomendo fixo e explícito no `PhaseDefinition` — mais
   previsível, e dá pra reservar margem de sobra acima da última
   plataforma sem precisar recalcular nada em runtime.
3. **Morte por queda**: com o mundo mais alto, cair de uma plataforma
   alta ainda só resulta em `setCollideWorldBounds(true)` segurando o
   personagem no fundo do mundo (`GROUND_Y` até `HEIGHT`, que continua
   sendo chão sólido normal) — ou seja, cair não mata, só custa a
   altura ganha. É esse o comportamento desejado ("queda segura", só
   perde progresso vertical) ou deveria haver dano/morte ao cair de
   uma certa distância? Não é tratado por este plano; se quiser, é
   feature separada (medir velocidade de queda ao aterrissar e aplicar
   dano, análogo ao `takeDamage` que já existe em `Player.ts`).

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- As 6 fases sem `worldTop`/`worldHeight` continuam com bounds
  idênticos a hoje (`0` a `768`).
- Fase nova com `worldHeight` maior: a câmera rola verticalmente ao
  subir, sem "vazar" pra fora do fundo pintado.
- HUD, mapa (`M`) e pausa (`ESC`) continuam fixos na tela e
  funcionando igual em qualquer fase, alta ou não.
- Reflexo do lago (fase `forest`) continua funcionando sem alteração,
  já que essa fase não deve receber os campos novos.
