# Plano: tela cheia sem cortar nada

## Diagnóstico

Já tentamos duas vezes:
- `Scale.FIT` (atual): nunca corta, mas sobra barra preta nos lados sempre
  que a proporção da janela não é exatamente 1024×768 (4:3) — é o que
  aparece no print.
- `Scale.ENVELOP`: preenche a janela, mas **corta** conteúdo (testado antes,
  cortava HUD e cenário) porque o jogo inteiro é desenhado em posições
  absolutas pensadas pra 1024×768.

Essas duas opções são "tudo ou nada" porque tratam o jogo como uma imagem
retangular fixa. A saída real é diferente: **travar a altura em 768
(exatamente o design atual) e deixar só a largura acompanhar a janela**.
Como o jogo é um side-scroller (chão sempre na mesma altura, câmera só anda
pros lados), isso elimina a barra preta lateral (o caso comum de monitor
widescreen) sem cortar nada verticalmente nem mexer numa linha sequer de
física/mundo — `HEIGHT = 768`, `GROUND_Y`, `PHASE_WIDTH` continuam
exatamente como são hoje.

Efeito colateral (positivo, não é bug): em janelas mais largas, a câmera
mostra uma fatia maior do mundo de uma vez (mais cenário visível ao mesmo
tempo) — isso já funciona hoje porque os `TileSprite` de parallax da
floresta foram construídos com margem enorme (`parallaxWidth = PHASE_WIDTH +
2000`) e o `camera.setBounds` já cobre a fase inteira.

Limite honesto: se a janela for mais **baixa** que 768px de altura (raro em
desktop, comum em notebook pequeno com barra de endereço/favoritos
ocupando espaço), ainda sobra uma barra preta fininha em cima/embaixo — não
tem como fugir disso sem also cortar ou distorcer o jogo. Não é regressão
em relação a hoje, só não é 100% dos casos.

## 1. `public/style.css`

Hoje `#app` é `width:100%; height:100vh` com flex centralizando o
`#game-container`. Trocar pra deixar o container travado em 768 de altura e
livre na largura:

```css
#game-container {
    width: 100vw;
    height: 768px;
    max-height: 100vh; /* evita ultrapassar em janelas baixas — vira o caso do parágrafo acima */
}
```

## 2. `src/game/main.ts`

Trocar o modo de escala pra `Scale.RESIZE`, que faz o canvas acompanhar o
tamanho do elemento pai (`#game-container`) automaticamente — como o CSS
acima já define esse tamanho como "largura da janela, altura travada em
768", o resultado é exatamente "só a largura estica":

```ts
scale: {
    mode: Scale.RESIZE,
    autoCenter: Scale.CENTER_BOTH
},
```

## 3. Posições de HUD/mapa que hoje assumem 1024 fixo (`src/game/scenes/Game.ts`)

Com `Scale.RESIZE`, `this.scale.width` deixa de ser sempre `1024` — passa a
ser a largura real da janela. Dois pontos de `createHud()`/
`createMapOverlay()` têm número fixo baseado nisso e precisam virar
relativo:

- **Texto de controles** (`this.add.text(980, 30, 'A/D mover...')` com
  `.setOrigin(1, 0)`): trocar `980` por `this.scale.width - 44` (44 é a
  margem original, `1024 - 980`).
- **Painel do mapa** (`createMapOverlay()`): hoje centralizado assumindo
  `512` (`1024 / 2`) — `mapStartX`, `mapEndX`, a posição X do painel
  (`112`), título e texto de localização todos partem desse centro fixo.
  Trocar pra:
  ```ts
  const centerX = this.scale.width / 2;
  const mapStartX = centerX - 324;
  const mapEndX = centerX + 324;
  // painel: x = centerX - 400 (era 112 = 512 - 400)
  // título/hint/localização: x = centerX (era 512)
  ```
  O painel do mapa **não precisa crescer** com a janela — só recentralizar.

O resto (HUD à esquerda, `dashIndicator`, portais, barra de vida do boss)
já está em posição relativa ao mundo ou à borda esquerda/topo, que não
mudam — não precisa tocar.

## 4. Reposicionar ao vivo se a janela for redimensionada durante o jogo

`Scale.RESIZE` dispara um evento `'resize'` no `this.scale` toda vez que o
tamanho muda (arrastar a borda da janela, não só no carregamento). Sem
tratar isso, quem redimensionar no meio do jogo fica com o texto de
controles e o mapa desalinhados até trocar de fase. Em `create()`:

```ts
this.scale.on('resize', () => this.repositionResponsiveUI());
```
Onde `repositionResponsiveUI()` só recalcula os X guardados como campo
(`controlsText.x`, e os elementos do mapa) — não precisa recriar HUD/mapa
inteiros, só reposicionar.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Janela larga (widescreen comum, ex. 1920×1080): sem barra preta lateral.
- Redimensionar a janela com o jogo já aberto: texto de controles e mapa
  recentralizam sem precisar trocar de fase.
- HUD da esquerda, portais, boss, dash indicator continuam nas posições
  certas (não usam número fixo de largura, não deveriam ter mudado).
- Janela estreita/quase quadrada: ainda funciona, só mostra menos mundo de
  uma vez (não corta HUD).
