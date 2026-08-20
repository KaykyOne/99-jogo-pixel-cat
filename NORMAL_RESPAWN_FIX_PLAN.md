# Fix: respawn do modo Normal duplicando estado

## Causa raiz

`PhaseScene` é instanciada **uma única vez por fase** em `src/game/main.ts`
(`...PHASES.map((phase, index) => new PhaseScene(phase, index))`). Quando o
modo Normal chama `this.scene.restart({ spawnX: PHASE_WIDTH / 2 })` em
`handlePlayerDeath()`, o Phaser reexecuta `create()` **na mesma instância**
— ele não roda `new PhaseScene(...)` de novo.

Isso significa: qualquer campo da classe que é inicializado como array/flag
na declaração (`private enemies: BaseEnemy[] = []`, `private portals:
Portal[] = []`, `private hudObjects: GameObjects.GameObject[] = []`,
`private teleporting = false`, `private phaseCleared = false`) só recebe
esse valor inicial **uma vez**, na primeira vida da cena. Nas vidas
seguintes (cada respawn), `create()` roda de novo e:

- `spawnEnemies()` faz `this.enemies.push(enemy)` em cima do array antigo —
  os inimigos da vida anterior continuam lá.
- `buildPortals()` faz `this.portals.push(...)` do mesmo jeito — portais
  duplicados.
- `createHud()` empurra pra `this.hudObjects` de novo — acumula.
- `this.teleporting` e `this.phaseCleared`, se tiverem ficado `true` na vida
  anterior, continuam `true` na nova vida (ex.: fase já tinha sido limpa
  antes de morrer → o portal nasceria destravado incorretamente na nova
  vida; ou uma teleportação que ficou "presa" bloquearia todo `handlePortals`
  pra sempre).

Os `GameObjects` (sprites, texto, gráficos) da vida anterior são destruídos
automaticamente pelo Phaser no shutdown do restart — o problema é
especificamente os **campos TypeScript simples** (arrays/flags) que não são
gerenciados pelo Phaser e não se resetam sozinhos.

## Fix

Em `src/game/scenes/Game.ts`, logo no início de `create(data: SceneData)`
(antes de `this.physics.world.setBounds(...)`), resetar todo o estado
mutável por vida da cena:

```ts
create(data: SceneData) {
    // O Phaser reaproveita esta MESMA instância de PhaseScene em todo
    // scene.restart() (respawn do modo Normal) — sem isso, enemies/portals/
    // hudObjects acumulam entre vidas da cena, e teleporting/phaseCleared
    // ficam com o valor "grudado" da vida anterior.
    this.enemies = [];
    this.portals = [];
    this.hudObjects = [];
    this.teleporting = false;
    this.phaseCleared = false;
    this.lastHp = -1;

    const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';
    writeSave({ phaseIndex: this.phaseIndex, difficulty });

    // ...resto do create() continua exatamente igual daqui pra baixo...
}
```

Não precisa resetar `hpText`, `mapOverlay`, `mapMarker`, `mapLocationText`,
`dashIndicator`, `reflectionCam`, `mapKey` — esses são campos de objeto
único que já são **reatribuídos** (`this.hpText = this.add.text(...)`) toda
vez que `createHud()`/`createMapOverlay()`/etc rodam, então não acumulam;
a referência antiga é só substituída pela nova (e o GameObject antigo já
foi destruído pelo Phaser).

## Por que isso não quebrava antes dessa leva de features

O jogo sempre teve esse comportamento de reusar a instância no restart (é
assim desde o template original), mas antes só `enemies` acumulava, e como
inimigos mortos só ficavam "inativos" sem causar efeito visual óbvio, o
problema passava despercebido. Agora, com `portals` guardando `sprite`
(duplicar cria portais visualmente sobrepostos) e `phaseCleared` controlando
se o portal de saída está travado, a duplicação/estado grudado ficou visível
e quebra a experiência.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Morrer no modo Normal **antes** de limpar a fase: respawna com exatamente
  a quantidade certa de inimigos (não duplicados), portais não duplicados
  visualmente, portal de saída continua travado.
- Morrer no modo Normal **depois** de já ter limpado a fase (matou todos,
  não usou o portal, morreu de outra forma — ex. queda ou lava, se existir):
  respawn não deve "herdar" `phaseCleared = true` da vida anterior de um
  jeito que destrave o portal sem os inimigos da nova vida terem sido
  mortos. (Esse é um caso de borda que vale testar explicitamente.)
- Respawnar várias vezes seguidas (3-4x) no modo Normal sem crash e sem
  crescimento perceptível de inimigos/portais a cada vida.
- Modo Difícil continua funcionando (não usa `scene.restart`, não deveria
  ser afetado, mas confirmar que nada quebrou).
