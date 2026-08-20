# Plano: reflexo via RenderTexture (troca de técnica)

## Diagnóstico — por que o reflexo sumiu

O mecanismo atual (`setupLakeReflection` em `Game.ts`) usa uma **segunda
câmera ao vivo** com `cam.setZoom(1, -1)` pra tentar espelhar verticalmente,
e mexe em `cam.scrollY = GROUND_Y` pra "escolher" a metade de cima do mundo
como fonte. Dois problemas, um confirmado e um suspeito:

1. **Confirmado**: as camadas `forest-sky`, `forest-mountains`,
   `forest-trees` (em `phases.ts`, dentro do `draw` da fase `forest`) usam
   `.setScrollFactor(fator, 0)`. O segundo argumento (`0`) é o
   `scrollFactorY` — zero significa "esta camada nunca se move
   verticalmente, não importa o `scrollY` de nenhuma câmera". Isso foi
   proposital quando essas camadas foram criadas (o jogo não tem scroll
   vertical na câmera principal, então parecia inofensivo) — mas quebra
   completamente o mecanismo de reflexo, que **depende** de manipular
   `scrollY` pra "puxar" a metade de cima pra dentro da janela do espelho.
   Essas três camadas — que são o cenário inteiro (céu, montanha, árvore,
   casa) — simplesmente nunca respondem a isso e não aparecem no reflexo.

2. **Suspeito, e provavelmente a causa do "nem o personagem aparece"**:
   `Camera.setZoom(x, y)` com `y` **negativo** não é uma técnica
   documentada do Phaser pra espelhar verticalmente. Conferi o código-fonte
   de tipos do Phaser (`node_modules/phaser/types/phaser.d.ts`) — existe
   `flipY: boolean` e `setFlipY()` em praticamente todo `GameObject`
   (`Sprite`, `TileSprite`, `RenderTexture`, etc.), mas **não existe em
   `Camera`**. Ou seja: `Camera` não tem um "flip" oficial — `setZoom` com
   valor negativo é algo que eu tentei por analogia, sem confirmar que o
   Phaser realmente renderiza isso como espelho em vez de, por exemplo,
   simplesmente tratar como zoom inválido e não aplicar o efeito. É a
   explicação mais provável de por que a água ficou uma cor lisa: a câmera
   nunca inverteu de verdade, só ficou olhando (sem espelhar) pra uma
   região que já é vazia por natureza (a própria faixa d'água).

## Nova técnica: `RenderTexture` + `setFlipY` (confirmado, documentado)

Em vez de uma segunda câmera **ao vivo** tentando espelhar via zoom
negativo, usar um `RenderTexture`: um objeto que **tira um retrato** de
parte da cena (usando uma câmera interna própria, sem zoom nem inversão —
100% normal) e depois eu **inverto a exibição desse retrato** com
`setFlipY(true)`, que é uma propriedade real e documentada de GameObject.

Isso evita o problema #1 também: como a câmera interna do `RenderTexture`
nunca muda `scrollY` (fica sempre em `0`, igual à câmera principal, que
também nunca sai de `scrollY = 0` nesse jogo — não há scroll vertical), as
camadas com `scrollFactorY: 0` continuam se comportando exatamente como
sempre se comportaram na tela normal — o "retrato" capturado é idêntico ao
que já está sendo desenhado no topo da tela, sem nenhum caso especial.

### Como funciona, passo a passo

1. Um `RenderTexture` do tamanho exato da metade de baixo
   (`this.scale.width × GROUND_Y`) é criado, posicionado na tela em
   `(0, FOREST_WATER_TOP_Y)`, com `setFlipY(true)` permanente.
2. Todo frame (só na fase `forest`): limpa o `RenderTexture` e desenha nele
   uma **cópia da cena atual**, usando a câmera interna do próprio
   `RenderTexture` com o mesmo `scrollX` da câmera principal (pra
   acompanhar o jogador) e `scrollY = 0` (igual à câmera principal, sempre).
3. Como o `RenderTexture` tem `flipY: true` permanente, o que foi capturado
   normal (céu em cima, chão embaixo) aparece **invertido** quando exibido
   — chão no topo (encostando na linha d'água de verdade) e céu embaixo
   (mais longe) — exatamente o comportamento de espelho esperado, sem
   precisar simular isso manualmente.
4. Um retângulo azul semi-transparente por cima (ou tint no próprio
   `RenderTexture`) dá o tom de água.

## 1. Remover o mecanismo antigo (`Game.ts`)

Apagar por completo `setupLakeReflection()` e `resizeLakeReflection()`
(linhas ~719-756 hoje) e a chamada em `create()` (`this.setupLakeReflection()`,
dentro do `if (this.phase.key === 'forest')`), e o campo
`private reflectionCam?: Cameras.Scene2D.Camera;`. Também remover a
sincronização de scroll no `update()`:
```ts
if (this.reflectionCam) {
    this.reflectionCam.scrollX = this.cameras.main.scrollX;
}
```
Tudo isso é substituído pelo que vem a seguir.

## 2. Novo campo e criação (`Game.ts`)

```ts
private lakeReflection?: GameObjects.RenderTexture;
```

No lugar da antiga chamada em `create()`:
```ts
if (this.phase.key === 'forest') {
    this.setupLakeReflection();
}
```

```ts
private setupLakeReflection() {
    const width = this.scale.width;
    const height = HEIGHT - FOREST_WATER_TOP_Y; // = GROUND_Y, as duas metades são iguais

    const rt = this.add.renderTexture(0, FOREST_WATER_TOP_Y, width, height);
    rt.setOrigin(0, 0);
    rt.setScrollFactor(0); // ele mesmo já desenha conteúdo de mundo capturado; não deve rolar de novo
    rt.setFlipY(true);
    rt.setAlpha(0.85);
    rt.setDepth(0.7); // acima da base d'água (drawWaterBase, depth 0.5/0.6)

    this.lakeReflection = rt;

    // Reagir a redimensionamento (tela cheia com Scale.RESIZE já implementada).
    this.scale.off('resize', this.resizeLakeReflection, this);
    this.scale.on('resize', this.resizeLakeReflection, this);
}

private resizeLakeReflection() {
    if (!this.lakeReflection) {
        return;
    }
    this.lakeReflection.setSize(this.scale.width, HEIGHT - FOREST_WATER_TOP_Y);
}
```

## 3. Capturar todo frame (`update()`)

Precisa rodar **depois** que jogador/inimigos/portais já se moveram nesse
frame (senão o reflexo atrasa um frame — imperceptível na prática, mas
mais correto no fim do `update()`). E só quando a fase é `forest`:

```ts
if (this.lakeReflection) {
    this.updateLakeReflection();
}
```

```ts
private updateLakeReflection() {
    const rt = this.lakeReflection!;

    rt.clear();
    rt.camera.setScroll(this.cameras.main.scrollX, 0);

    // Desenha a cena inteira MENOS a UI (HUD, mapa, pausa, indicador de
    // dash) e o próprio RenderTexture (evita recursão — desenhar o espelho
    // dentro do espelho).
    const excluded = new Set<GameObjects.GameObject>([
        rt,
        this.dashIndicator,
        ...this.hudObjects,
        this.mapOverlay,
        this.pausePanel
    ]);

    const toDraw = this.children.list.filter(obj => !excluded.has(obj));
    rt.draw(toDraw);
}
```

**Atenção pro Codex**: `this.children.list` é a lista de TODOS os objetos
da cena, na ordem em que foram adicionados — **não** respeita `depth`
automaticamente do jeito que uma câmera normal respeitaria no desenho
final. Isso significa que a ordem de sobreposição dentro do reflexo pode
ficar sutilmente diferente da cena real (ex.: algo que deveria ficar atrás
podendo desenhar por cima). Para o caso de uso aqui (céu → montanha →
árvore → chão → jogador/inimigos, todos criados nessa mesma ordem no
`draw()` da fase e depois em `create()`) a ordem de criação já bate com a
ordem de profundidade desejada, então não deve ser um problema visível —
mas se algo parecer fora de ordem no reflexo, é o primeiro lugar a olhar
(a correção seria ordenar `toDraw` por `.depth` antes de `rt.draw`).

## 4. Base d'água (sem mudança de conceito, só depth)

`drawWaterBase` em `phases.ts` continua igual — só confirmar que o
`RenderTexture` (depth `0.7`) desenha por cima dela (depth `0.5`/`0.6`).
Não precisa mexer em `phases.ts` nesta task.

## 5. Remover o import não usado

Depois de apagar `setupLakeReflection`, o import `Cameras` no topo de
`Game.ts` (`import { Cameras, GameObjects, ... } from 'phaser';`) pode
ficar sem uso — conferir com `npx tsc --noEmit` (typescript avisa
`'Cameras' is declared but its value is never read` se for o caso) e
remover se necessário.

## Por que isso deve funcionar onde a versão anterior não funcionou

- Não depende de nenhum comportamento não-documentado (`setFlipY` é uma
  API real, testada, usada em dezenas de lugares do próprio Phaser).
- Não depende de manipular `scrollY` de câmera nenhuma — a câmera interna
  do `RenderTexture` fica exatamente como a câmera principal sempre esteve
  (`scrollY: 0`), então **nenhuma** camada com `scrollFactorY: 0` precisa
  de tratamento especial — elas continuam se comportando exatamente como
  sempre, e por isso aparecem certinho no "retrato" capturado.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Reflexo mostra árvore/casa/montanha/céu reconhecíveis, na proporção
  certa (1:1, sem achatar — herda isso do fato de `GROUND_Y = HEIGHT/2`,
  que já está correto e não muda nesta task).
- Jogador e inimigos aparecem refletidos ao se mover perto da água.
- HUD, mapa e painel de pausa **não** aparecem duplicados dentro da faixa
  de água (a exclusão da seção 3 deve cobrir isso — testar especialmente
  com o mapa aberto).
- Redimensionar a janela (tela cheia) mantém o reflexo do tamanho certo,
  sem esticar/cortar.
- Trocar de fase pra fora da floresta e voltar não deixa `RenderTexture`
  duplicado nem erro no console (cada `create()` da fase `forest` cria um
  novo — como as outras fases não entram nesse `if`, não há acumulação
  entre fases diferentes; mas respawn do modo Normal, que reusa a mesma
  instância de `PhaseScene` — ver `NORMAL_RESPAWN_FIX_PLAN.md` — precisa
  ser conferido: o campo `lakeReflection` deve ser recriado do zero a cada
  `create()`, não acumular).
