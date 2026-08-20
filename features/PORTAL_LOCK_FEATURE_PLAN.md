# Plano: portal bloqueado até limpar a fase

## Objetivo

O portal de **saída** (o que leva pra próxima fase) começa desativado. Ele só
ativa quando **todos os inimigos da fase atual forem derrotados** — nesse
momento, toca a animação de "ligando" (spritesheet gerado, 8 frames: arco
vazio → faísca → vórtice crescendo → portal ativo) uma vez, e depois passa a
**repetir em loop só a parte final** (o vórtice já formado, frames 6-7) em vez
de congelar num frame só — o portal "ligado" fica vivo/animado, não estático.

O portal de **retorno** (o que leva pra fase anterior) **não é afetado** —
continua sempre utilizável, já que a fase anterior já foi concluída pra
chegar até aqui. Ver decisão de design #1 se quiser mudar isso.

## 0. Pré-requisito: salvar o asset

O spritesheet do portal (gerado no chat, 8 frames, fundo transparente
confirmado) ainda não está no repositório. Antes de implementar:

1. Salvar o arquivo em `public/assets/portal/portal-activate.png`.
2. Medir a largura de cada frame (`largura_total / 8`) e a altura — **não
   tenho esse número ainda porque não tenho o arquivo em disco**, então quem
   for implementar precisa conferir isso (abrindo o PNG e dividindo a largura
   por 8) antes de escrever o `frameWidth` no preload. Não adivinhar o
   valor.

## 1. Preload e animação

Em `src/game/scenes/PreloadScene.ts`:
```ts
this.load.spritesheet('portal-activate', 'portal/portal-activate.png', {
    frameWidth: /* medir */,
    frameHeight: /* medir */
});
```

Novo arquivo `src/game/animations/portal-animations.ts` (seguindo o padrão de
`player-animations.ts`/`enemy-animations.ts`, não misturar com eles).
Duas animações a partir do mesmo spritesheet: a de ligar (toca uma vez) e a
de "ligado" (loop só do vórtice já formado):
```ts
export function createPortalAnimations(scene: Scene): void {
    scene.anims.create({
        key: 'portal-activating',
        frames: scene.anims.generateFrameNumbers('portal-activate', { start: 0, end: 7 }),
        frameRate: 10,
        repeat: 0 // toca uma vez só, não em loop
    });

    scene.anims.create({
        key: 'portal-active-loop',
        // Só os frames finais (vórtice já formado, olhando a referência que
        // você gerou: 6 e 7 são os dois mais "cheios"/brilhantes). Ajustar
        // o range depois de ver o resultado — se ficar um "pulo" feio entre
        // o frame 7 e voltar pro 6, é sinal de que precisa de mais frames
        // nessa faixa ou de um frameRate mais lento aqui.
        frames: scene.anims.generateFrameNumbers('portal-activate', { start: 6, end: 7 }),
        frameRate: 6,
        repeat: -1,
        yoyo: true // vai e volta entre os 2 frames em vez de "piscar" cortado
    });
}
```
Chamar `createPortalAnimations(this)` em `PreloadScene.create()`, junto das
outras duas chamadas já existentes.

## 2. Trocar o desenho procedural do portal por sprite

Hoje, em `src/game/scenes/Game.ts`, `drawPortalGate(bx)` desenha o portal
inteiro com `Graphics` (pilares, viga, elipse de brilho com tween de alpha).
Isso precisa virar um `Sprite` usando o novo spritesheet:

```ts
private createPortalSprite(bx: number): GameObjects.Sprite {
    const sprite = this.add.sprite(bx, GROUND_Y, 'portal-activate', 0).setDepth(4);
    sprite.setOrigin(0.5, 1); // base do arco encostando no chão — ajustar
                              // depois de ver o sprite renderizado
    return sprite;
}
```
- Frame `0` (arco vazio, sem luz) é o estado "desativado".
- Quando destravado: `sprite.play('portal-activating')`, e ao terminar essa
  animação encadeia pro loop (ver seção 4 — é lá que o `animationcomplete`
  troca pra `portal-active-loop`, não aqui).

O portal de retorno (nunca bloqueado) pode nascer direto tocando
`sprite.play('portal-active-loop')` — ver decisão de design #2.

Isso substitui o `drawPortalGate` atual; `buildPortals()` passa a chamar
`createPortalSprite` no lugar dele.

## 3. Modelo de dados do portal

Em `Game.ts`, o tipo `Portal` precisa guardar se está travado e a referência
do sprite pra poder tocar a animação nele depois:

```ts
type Portal = {
    zoneX: number;
    targetKey: string;
    spawnX: number;
    direction: 1 | -1;
    requiresClear: boolean; // true só no portal de saída (direction: 1)
    sprite: GameObjects.Sprite;
};
```

Em `buildPortals()`, ao montar o portal de saída (`direction: 1`), setar
`requiresClear: true`; no de retorno (`direction: -1`), `requiresClear: false`.

## 4. Detectar quando a fase foi limpa

Adicionar um campo de controle na cena:
```ts
private phaseCleared = false; // vira true uma única vez, quando o último inimigo morre
```

No `update()`, antes de `handlePortals()`, um check simples (a lista de
inimigos é pequena — 2 ou 3 por fase — então checar todo frame é barato, não
precisa de sistema de eventos):
```ts
if (!this.phaseCleared && this.enemies.length > 0 && this.enemies.every(e => !e.isAlive)) {
    this.phaseCleared = true;
    this.unlockExitPortal();
}
```
(`this.enemies.length > 0` evita disparar em fases sem inimigo, hoje não
existe nenhuma assim, mas é uma guarda barata.)

```ts
private unlockExitPortal() {
    const exitPortal = this.portals.find(p => p.requiresClear);
    if (!exitPortal) return;

    const sprite = exitPortal.sprite;
    sprite.play('portal-activating');

    // Ao terminar o "ligando" (uma vez só), encadeia pro loop do vórtice
    // ativo — sem isso o portal congelaria no último frame da animação de
    // ligar em vez de ficar animado.
    sprite.once('animationcomplete-portal-activating', () => {
        sprite.play('portal-active-loop');
    });

    // Não precisa de flag "unlocked" separada além de phaseCleared, ver
    // handlePortals() abaixo — phaseCleared já é a fonte da verdade.
}
```

## 5. Bloquear a travessia enquanto não limpou

Em `handlePortals()`, o loop que testa `Math.abs(px - portal.zoneX) < 58 &&
isMovingIntoPortal` precisa pular o portal de saída enquanto a fase não foi
limpa:

```ts
for (const portal of this.portals) {
    if (portal.requiresClear && !this.phaseCleared) {
        continue; // portal travado, ignora mesmo se o jogador estiver na zona
    }
    // ...resto igual
}
```

## Decisões de design em aberto

1. **Portal de retorno também trava?** Assumi que não (é sempre a fase que
   você já passou). Se quiser travar os dois até limpar a fase atual, é só
   tirar a condição `direction === 1` do `requiresClear` em `buildPortals()`.
2. **Portal de retorno usa o sprite parado no frame final, ou o desenho
   antigo (`drawPortalGate`)?** Recomendo usar o sprite igual, só que já
   "ligado" desde o início (visual consistente entre os dois portais). Dá pra
   manter o `drawPortalGate` antigo só pro de retorno se preferir menos
   trabalho, mas fica inconsistente (um portal desenhado, outro sprite).
3. **Feedback ao esbarrar no portal travado?** Hoje, andar até um portal
   travado simplesmente não faz nada (o jogador atravessa o arco vazio sem
   reação nenhuma). Pode valer a pena um pequeno feedback (texto tipo "Derrote
   todos os inimigos" por 1s, ou um leve shake) — não pedido explicitamente,
   deixo como extra opcional, não bloqueia o resto.
4. **Última fase (`ruins`) não tem portal de saída** — `buildPortals()` já
   não cria portal de saída quando `phaseIndex === PHASES.length - 1`, então
   nada muda ali; nenhum ajuste extra necessário.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Entrar numa fase nova: portal de saída aparece "desligado" (frame 0), não
  teleporta mesmo parado em cima e andando na direção dele.
- Derrotar todos os inimigos da fase: portal de saída toca a animação de
  ligar uma única vez (não fica repetindo essa parte) e, ao terminar, entra
  no loop do vórtice ativo (fica visivelmente animado, não congelado) — e
  passa a funcionar (teleporta).
- Portal de retorno já nasce no loop do vórtice ativo, sem passar pela
  animação de ligar.
- Portal de retorno continua funcionando desde o início, nas duas fases
  vizinhas (ida e volta).
- Fase sem inimigos vivos ao reentrar (ex.: já limpou antes e voltou) — como
  cada troca de fase recria a cena do zero (`scene.start`/`scene.restart`),
  os inimigos e o `phaseCleared` também são recriados; o jogador vai
  encontrar os inimigos vivos de novo e o portal travado de novo. Isso é
  esperado dado como o jogo já funciona hoje (estado não persiste entre
  visitas — ponto fraco já documentado em AI_CONTEXT.md), não é regressão
  nova introduzida por essa feature.
