# Plano: pausar com ESC

## Objetivo

Apertar `ESC` pausa o jogo de verdade (física, inimigos, timers parados —
diferente do mapa, que é intencionalmente "ao vivo") e mostra um painel de
pausa. Apertar `ESC` de novo (ou um botão no painel) retoma.

## 1. Diferença importante em relação ao mapa

O mapa (`M`) **não pausa nada** — é documentado como intencional (o
jogador continua se movendo, inimigos continuam patrulhando, o marcador do
mapa atualiza em tempo real). O pause precisa ser o oposto: **tudo para**.
Não dá pra reaproveitar a mesma abordagem do mapa (só `setVisible` num
overlay) — pause precisa parar a simulação mesmo.

## 2. Congelar o jogo

Duas coisas do Phaser resolvem isso sem precisar mexer em cada sistema
individualmente:

```ts
private isPaused = false;

private togglePause() {
    this.isPaused = !this.isPaused;

    if (this.isPaused) {
        this.physics.world.pause();  // para toda a física (jogador, inimigos, hitboxes)
        this.time.paused = true;     // para delayedCall e tweens (ex.: dano do boss
                                      // com atraso, brilho do portal, barra de vida)
        this.pausePanel.setVisible(true);
    } else {
        this.physics.world.resume();
        this.time.paused = false;
        this.pausePanel.setVisible(false);
    }
}
```

No `update()`, no topo (antes de qualquer outra lógica), tratar a tecla e
sair cedo se estiver pausado:
```ts
if (Input.Keyboard.JustDown(this.pauseKey)) {
    // Se o mapa estiver aberto, ESC fecha o mapa primeiro em vez de pausar
    // por cima dele (ver decisão de design #1).
    if (this.mapOverlay.visible) {
        this.mapOverlay.setVisible(false);
    } else {
        this.togglePause();
    }
}

if (this.isPaused) {
    return; // nada de player.update(), enemy.update(), handlePortals(), etc.
}
```
Isso precisa vir **antes** de `this.player.update(...)` e do loop de
`enemy.update(...)` no `update()` atual — todo o resto do método já
continua funcionando sem mudança nenhuma, só fica pulado enquanto pausado.

## 3. Painel de pausa (novo, `createPauseOverlay()`)

Mesma linguagem visual do resto do HUD/mapa (painel escuro
semi-transparente, borda `0xb8cc84`, título em `Georgia, serif`):

```ts
private createPauseOverlay() {
    const panel = this.add.graphics().setScrollFactor(0).setDepth(101);
    panel.fillStyle(0x08111d, 0.92).fillRoundedRect(362, 284, 300, 200, 14);
    panel.lineStyle(2, 0xb8cc84, 0.85).strokeRoundedRect(362, 284, 300, 200, 14);

    const title = this.add
        .text(512, 340, 'PAUSADO', { fontFamily: 'Georgia, serif', fontSize: '28px', color: '#f7e7b0' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(102);

    const hint = this.add
        .text(512, 400, 'ESC para continuar', { fontFamily: 'monospace', fontSize: '13px', color: '#b9cbb1' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(102);

    this.pausePanel = this.add.container(0, 0, [panel, title, hint]).setVisible(false);
}
```
Chamar `this.createPauseOverlay()` em `create()`, junto de `createHud()`/
`createMapOverlay()`.

**Atenção pro Codex**: se a feature de tela cheia (`Scale.RESIZE`) já
estiver implementada, os números fixos acima (`512`, `362`) têm o mesmo
problema que HUD/mapa já tiveram — devem usar `this.scale.width / 2` como
centro em vez de `512` fixo, pelo mesmo motivo documentado em
`FULLSCREEN_LAYOUT_PLAN.md`.

## 4. Tecla

Junto de `this.mapKey` em `create()`:
```ts
this.pauseKey = this.input.keyboard!.addKey(Input.Keyboard.KeyCodes.ESC);
```

## Decisões de design em aberto

1. **ESC com o mapa aberto**: fecha o mapa primeiro (comportamento padrão
   de "ESC fecha o que está na frente"), ou pausa por cima do mapa aberto?
   Recomendo fechar o mapa primeiro — é o esperado na maioria dos jogos.
2. **Botão "Menu principal" no painel de pausa?** Como o `MenuScene` já
   existe (da feature de save), é barato adicionar um botão clicável que
   chama `this.scene.start('Menu')` a partir do pause. Não foi pedido
   explicitamente — trato como extensão opcional, não bloqueia o pedido
   original ("criar o pause").
3. **Som/HUD continuam visíveis atrás do painel de pausa?** Recomendo
   deixar o HUD (coração de vida, nome da fase) visível atrás do painel
   semi-transparente — só o painel de pausa cobre o centro da tela, não a
   tela toda.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- ESC pausa: jogador para de se mover mesmo segurando A/D, inimigos param
  de patrulhar/perseguir, animações param.
- ESC de novo: tudo volta a se mover exatamente de onde parou (sem "pulo"
  de física ao retomar).
- ESC com o mapa aberto fecha o mapa em vez de empilhar os dois painéis.
- Timers com atraso (dano do boss ~300ms depois do golpe, brilho pulsante
  do portal) não avançam enquanto pausado, e continuam corretamente depois
  de despausar (não devem "descontar" o tempo que ficaram pausados).
- Pausar não quebra o fade de transição de portal nem o fade de morte (não
  deveria ser possível pausar no meio de uma teleportação — `this.teleporting`
  já bloqueia a maior parte da interação nesse momento, mas vale conferir).
