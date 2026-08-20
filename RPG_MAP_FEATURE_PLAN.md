# Plano: mapa com cara de RPG

## Objetivo

O mapa atual (`createMapOverlay()` em `Game.ts`) funciona, mas é só um
painel escuro com uma linha reta, bolinhas coloridas e texto — quero deixar
com cara de mapa-múndi de RPG: ícone por bioma, status de cada fase
(bloqueada / atual / concluída) e um marcador mais temático.

## 1. Rastrear fases concluídas (não só a mais avançada)

Hoje o save (`src/game/state/save.ts`) guarda só `phaseIndex` (a fase mais
avançada alcançada). Pra mostrar "concluída" vs "alcançada mas não
limpa" no mapa, precisa saber **quais** fases já foram limpas, não só até
onde chegou.

Estender `SaveData`:
```ts
export type SaveData = {
    phaseIndex: number;
    difficulty: Difficulty;
    clearedPhases: number[]; // índices das fases já limpas (todos os inimigos/boss mortos)
};
```
`loadSave()` precisa aceitar saves antigos sem esse campo (tratar como
`[]` em vez de rejeitar o save inteiro — não obrigar todo mundo a perder
progresso por causa de um campo novo).

Em `Game.ts`, onde a fase já é marcada como limpa (`this.phaseCleared =
true`, dentro do bloco que chama `unlockExitPortal()` no `update()`),
persistir isso também:
```ts
const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';
const save = loadSave();
const clearedPhases = Array.from(new Set([...(save?.clearedPhases ?? []), this.phaseIndex]));
writeSave({ phaseIndex: this.phaseIndex, difficulty, clearedPhases });
```

Com isso, o mapa tem os 3 estados que interessam:
- **Bloqueada**: `index > save.phaseIndex` (nunca chegou lá — o sistema de
  portal já impede isso, mas o mapa deve refletir visualmente).
- **Atual/alcançada, não limpa**: `index <= save.phaseIndex` e não está em
  `clearedPhases`.
- **Concluída**: está em `clearedPhases`.

## 2. Ícone por bioma em vez de bolinha lisa

Cada fase já tem um elemento visual característico desenhado no próprio
cenário procedural (`phases.ts`): pinheiro (`drawPine`, floresta/neve),
cacto (`drawCactus`, deserto), cristal (inline em `cave`), vulcão/lava
(inline em `volcano`), pilar (inline em `ruins`). Em vez de inventar ícones
novos do zero, dá pra reaproveitar essas mesmas formas numa escala
minúscula como ícone do nó no mapa.

- `drawPine`/`drawCactus` já são funções à parte — só chamar com um `scale`
  bem pequeno (ex.: `0.15`) na posição do nó do mapa.
- O desenho do cristal (`cave`), do vulcão (`volcano`) e do pilar (`ruins`)
  hoje são funções **inline**, fechadas dentro do `draw()` de cada fase —
  precisam virar funções soltas no topo do arquivo (mesmo nível de
  `drawPine`/`drawCactus`) pra poderem ser chamadas também do mapa. É
  refactor mecânico (mover a função pra fora, sem mudar o que ela desenha),
  não lógica nova.
- Se isso for mais trabalho do que vale a pena agora, alternativa mais
  simples: um glифo geométrico distinto por bioma (triângulo verde =
  floresta, losango dourado = deserto, hexágono azul = neve, etc.) desenhado
  direto no mapa, sem depender do cenário. Decisão de design #1.

## 3. Visual por estado

- **Bloqueada**: ícone em cinza/preto e fosco (baixa opacidade, tipo
  `0x3a3a3a` com alpha 0.5), talvez um "?" ou cadeado simples desenhado por
  cima (dois retângulos formando um cadeado — não precisa de asset).
- **Alcançada, não limpa**: ícone colorido normal (como já é hoje).
- **Concluída**: ícone colorido **com uma borda dourada** (`strokeStyle`
  ao redor do nó, cor `0xf7e7b0` — já é a cor de destaque usada no resto do
  HUD) e talvez um pequeno check (✓, dá pra desenhar com duas linhas ou usar
  texto mesmo, a fonte já suporta esse caractere).

## 4. Marcador do jogador mais temático

Trocar o círculo vermelho liso (`this.mapMarker`) por algo que pulsa
suavemente (tween de `scale` entre 1 e 1.15, `yoyo: true, repeat: -1`,
mesmo padrão de tween já usado no brilho do portal em
`drawPortalGate`/`createPortalSprite`) — dá uma sensação de "farol"/"você
está aqui" bem mais viva que um ponto estático.

## 5. Caminho entre os nós

Trocar a linha reta sólida (`route.lineStyle(8, 0x3e5266, 1).lineBetween(...)`)
por um traço pontilhado/segmentado — Phaser não tem "dashed line" pronto no
`Graphics`, mas dá pra simular desenhando vários `fillCircle` pequenos
espaçados ao longo do trajeto (efeito de "trilha de passos"), reaproveitando
o mesmo `segmentWidth` já calculado pra distribuir os nós.

## Decisões de design em aberto

1. **Ícones reaproveitados do cenário (mais trabalho, visual mais coeso) ou
   glifos geométricos simples (menos trabalho)?** Recomendo começar pelos
   glifos simples se o tempo for curto — dá pra trocar pelos ícones "de
   verdade" depois sem mexer no resto do mapa (é só a função que desenha
   cada nó).
2. **Fundo do painel**: continuar com o retângulo escuro atual, ou vale a
   pena pedir uma textura de pergaminho/mapa antigo (mesmo processo de pedir
   asset que fizemos com a floresta e o portal)? Não obrigatório pra "cara
   de RPG" — o ícone + estados já resolvem boa parte disso — mas é o que
   mais mudaria a "primeira impressão" do painel. Deixo como extensão
   futura, não bloqueia esta task.
3. **Cadeado nas fases bloqueadas**: vale desenhar um ícone de cadeado, ou
   só a cor apagada/dessaturada já comunica bem o suficiente? Recomendo só
   a cor apagada pra MVP — cadeado é polish, não essencial.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Save antigo (sem `clearedPhases`) continua carregando sem erro — não pode
  quebrar quem já tem progresso salvo.
- Mapa mostra fases além da alcançada como bloqueadas (cor apagada).
- Limpar uma fase (matar boss/inimigos) atualiza o mapa na próxima vez que
  abrir (não precisa ser em tempo real durante o combate, só refletir depois
  de `phaseCleared` virar `true`).
- Marcador do jogador continua se movendo em tempo real conforme anda
  (comportamento atual, não pode regredir — o mapa não pausa o jogo, isso
  é intencional e documentado).
