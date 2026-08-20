# Plano: legibilidade do reflexo do lago

## Diagnóstico

Olhando o print, o reflexo está tecnicamente funcionando (o mecanismo de
câmera espelhada, implementado antes, está certo), mas fica **escuro e
achatado demais pra ler como reflexo** — dá pra perceber que tem alguma
coisa ali, mas não bate o olho reconhecendo "ah, é a árvore/casa
espelhada". Três causas, todas de **ajuste de número**, não de lógica
quebrada:

1. **Alpha baixo sobre base escura**: `cam.setAlpha(0.55)` (`Game.ts:550`)
   por cima de um retângulo de água em `0x1c4258` (`phases.ts:82`) — cor bem
   escura + mistura em 55% deixa o conteúdo refletido murcho.
2. **Compressão vertical forte**: `reflectedWorldHeight = 550`
   (`Game.ts:538`) dentro de uma faixa de só 84px de tela
   (`viewportHeight = HEIGHT - FOREST_WATER_TOP_Y`) — proporção de
   compressão de **~6.5x** (550 → 84). É bastante achatamento; dá pra
   melhorar reduzindo quanto cenário tenta caber ali.
3. **Faixa de água disponível é pequena**: só 84px porque
   `FOREST_WATER_TOP_Y = GROUND_Y + 30` (`phases.ts`) deixa 30px de grama
   antes da água começar. Reduzir essa margem devolve pixels pro reflexo.

## Mudanças recomendadas

### 1. Cor base da água mais próxima da arte real (`phases.ts:82`)

Troquei a cor por um valor "de cabeça" na primeira versão; a cor real da
água no asset `borda-agua-strip.png` (medida pixel a pixel no arquivo
original) é `rgb(41, 114, 164)` = `0x2972a4` — bem mais clara que o
`0x1c4258` atual. Trocar pra essa:
```ts
.rectangle(x0, FOREST_WATER_TOP_Y, PHASE_WIDTH, HEIGHT - FOREST_WATER_TOP_Y, 0x2972a4)
```

### 2. Alpha do reflexo mais alto (`Game.ts:550`)

```ts
cam.setAlpha(0.8); // era 0.55
```
Com a base mais clara do item 1, subir o alpha não deixa a água "sumir" —
o objetivo é o reflexo competir melhor com a cor de fundo em vez de ficar
lavado.

### 3. Reduzir a compressão vertical (`Game.ts:538`)

```ts
const reflectedWorldHeight = 380; // era 550
```
Mostra um pouco menos de montanha no reflexo (a árvore/casa inteira ainda
cabe — ela tem 450px de altura em tela, ver `treesHeight` em `phases.ts`,
então mesmo 380 já é apertado; se cortar demais a copa da árvore, subir pra
420-450 é o próximo passo). A proporção de compressão cai de ~6.5x pra
~4.5x — ainda vai parecer "achatado" (é físicamente inevitável com só
84-99px de faixa), mas bem menos que hoje.

### 4. Recuperar pixels de altura pra faixa d'água (`phases.ts`)

```ts
export const FOREST_WATER_TOP_Y = GROUND_Y + 15; // era GROUND_Y + 30
```
Isso aumenta `viewportHeight` de 84 pra 99px (a base sólida da água e o
`drawWaterBase` já usam essa constante, então acompanham automaticamente —
não precisa mexer noutro lugar). Ganho pequeno mas gratuito na proporção de
compressão do item 3.

## Ordem sugerida de implementação/teste

Fazer as 4 mudanças juntas de uma vez é razoável (são todas no mesmo
sistema, baixo risco de interagir mal entre si), mas testar visualmente
depois — os números acima são pontos de partida, não valores finais. Se
ainda estiver escuro depois do item 1+2, subir mais o alpha antes de mexer
em mais nada; se a árvore ainda estiver cortada, subir
`reflectedWorldHeight` antes de mexer no `FOREST_WATER_TOP_Y`.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Reflexo da árvore/casa reconhecível a olho (não precisa ficar olhando de
  perto pra perceber que é reflexo).
- Chão/grama ainda parece grudado certo no chão físico (essa parte não deve
  ter mudado — só a faixa de água abaixo dele ficou 15px maior).
- Testar em pelo menos duas posições diferentes da fase (perto do início e
  perto do meio) pra confirmar que o reflexo acompanha o scroll horizontal
  sem desalinhar (isso já funcionava antes, só confirmar que não quebrou).
