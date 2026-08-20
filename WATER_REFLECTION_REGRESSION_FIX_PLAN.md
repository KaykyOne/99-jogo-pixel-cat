# Fix: reflexo do lago sumiu depois da tela cheia (RESIZE)

## Causa

`setupLakeReflection()` (`Game.ts:539`) cria a câmera do reflexo **uma
única vez**, em `create()`:
```ts
const cam = this.cameras.add(0, viewportY, this.scale.width, viewportHeight);
```
Isso lê `this.scale.width` **no momento da criação**. Antes (com
`Scale.FIT`), a largura do jogo era sempre `1024`, fixa — não tinha
problema. Agora, com `Scale.RESIZE` (feature de tela cheia implementada
depois), `this.scale.width` é dinâmico e muda com o tamanho da janela — e
pode nem estar com o valor final ainda no instante em que `create()` roda
(o layout/CSS pode assentar um instante depois do Phaser inicializar).

A câmera **principal** (`this.cameras.main`) o Phaser já resincroniza
sozinho automaticamente em todo resize — é comportamento embutido do modo
`RESIZE`. Mas uma câmera **criada manualmente** via `this.cameras.add(...)`
não ganha esse tratamento automático — ela fica travada no tamanho que
tinha quando foi criada. Resultado: a câmera do reflexo fica estreita
demais (ou desalinhada) comparada à largura real da tela, e o que aparece
na água é majoritariamente só o retângulo de base sólida
(`drawWaterBase`), sem o reflexo por cima cobrindo a largura toda — daí
parecer "chapado".

Esse é um buraco que ficou entre os dois planos anteriores: o
`FULLSCREEN_LAYOUT_PLAN.md` só cuidou de reposicionar HUD/mapa no resize,
não mencionou a câmera do reflexo.

## Fix 1: câmera do reflexo acompanha o resize

Em `Game.ts`, guardar a chamada de setup numa função que também roda no
evento de resize (mesmo padrão do `this.scale.on('resize', ...)` já usado
pro HUD/mapa):

```ts
private setupLakeReflection() {
    // ...cria a câmera como já é feito hoje, mas guarda a referência...
    this.reflectionCam = cam;

    this.scale.on('resize', () => this.resizeLakeReflection());
}

private resizeLakeReflection() {
    if (!this.reflectionCam) return;
    this.reflectionCam.setSize(this.scale.width, HEIGHT - FOREST_WATER_TOP_Y);
}
```
Chamar `resizeLakeReflection()` deve rodar sempre que a largura mudar,
mantendo a câmera do reflexo com a largura real da tela.

## Fix 2: só duas camadas — terreno e água-que-é-o-reflexo

Hoje existem 3 elementos na área da água: o retângulo de base sólida
(`drawWaterBase`, cor `0x2972a4`), a tira de espuma (`forest-water-edge`) e
a câmera do reflexo por cima com alpha 0.8. A base sólida sempre vai
competir visualmente com o reflexo, mesmo depois do fix 1 — é exatamente
esse "chapado" que você não quer. Simplificar pra bater com o pedido ("água
é o reflexo", não "água = cor sólida + reflexo por cima"):

- **Tira embaixo dela** (grama/chão) continua exatamente como está — essa é
  a camada "terreno", já funciona.
- **Câmera do reflexo** passa a ser a própria água, praticamente opaca:
  ```ts
  cam.setAlpha(0.96); // era 0.8 — a câmera passa a SER a água, não um efeito por cima dela
  ```
- **Retângulo de base sólida** (`drawWaterBase` em `phases.ts`) deixa de
  ser uma cor "cheia" competindo com o reflexo — vira só uma rede de
  segurança fina, praticamente invisível, pro caso da câmera do reflexo
  atrasar um frame no resize ou não cobrir 100% da largura por algum motivo
  de arredondamento. Baixar o próprio retângulo de alpha em vez de contar
  com a câmera pra "tampar" ele:
  ```ts
  scene.add
      .rectangle(x0, FOREST_WATER_TOP_Y, PHASE_WIDTH, HEIGHT - FOREST_WATER_TOP_Y, 0x123449, 0.35)
      .setOrigin(0, 0)
      .setDepth(0.5);
  ```
  (Alpha `0.35` — só um tom escuro de fundo/profundidade, não uma segunda
  camada visualmente competindo com o reflexo.)
- Tira de espuma (`forest-water-edge`) continua igual, é só a linha de
  transição entre grama e água, não faz parte dessa mudança.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Reflexo cobre a largura inteira da tela em qualquer tamanho de janela
  (testar redimensionando com o jogo aberto, não só recarregando).
- Reflexo lê como reflexo (árvore/casa reconhecíveis), não como um
  retângulo de cor sólida.
- Chão/grama (a camada "terreno") não mudou nada.
- Testar especificamente carregar o jogo já numa janela grande (não
  redimensionar depois de aberto) — esse é o caso que quebrou antes, tem
  que confirmar que o `resizeLakeReflection()` roda cedo o suficiente ou
  que o valor inicial já vem certo.
