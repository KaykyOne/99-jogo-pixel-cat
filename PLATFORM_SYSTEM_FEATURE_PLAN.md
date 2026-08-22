# Plano: sistema de plataformas (base da verticalidade)

## Objetivo

Permitir que uma fase declare plataformas extras (flutuantes, salientes,
em alturas diferentes do chão) além do único chão reto que existe hoje —
sem alterar em nada as 6 fases atuais, que continuam sem nenhuma
plataforma declarada = comportamento idêntico ao de hoje.

Este é o plano **base**: `VERTICAL_WORLD_FEATURE_PLAN.md`,
`WALL_CLIMB_FEATURE_PLAN.md` e `VERTICAL_SPAWN_MAP_FEATURE_PLAN.md`
dependem do tipo `PlatformDef` definido aqui.

## 1. Tipo de dado `PlatformDef` (novo, em `src/game/world/phases.ts`)

```ts
export type PlatformDef = {
    x: number;       // canto esquerdo, mesma convenção de x0 já usada no draw()
    y: number;        // topo da plataforma — é onde o personagem pisa
    width: number;
    height: number;    // espessura visual/física do bloco (não afeta onde se pisa, isso é sempre `y`)
    oneWay?: boolean;   // true = pode subir atravessando por baixo e pousar em cima (padrão: false = sólida em todos os lados)
    climbable?: boolean; // true = superfície de escalada (ver WALL_CLIMB_FEATURE_PLAN.md); ignorado por este plano
};
```

Adicionar `platforms?: PlatformDef[]` em `PhaseDefinition`. Campo
**opcional** — não precisa (nem deve) reescrever as 6 fases existentes.
Todo lugar que ler esse campo usa `this.phase.platforms ?? []`, nunca
`this.phase.platforms!`.

## 2. Extrair um helper genérico de desenho a partir de `drawGround`

Hoje `drawGround(scene, x0, base, top, speckle, accent)`
(`phases.ts:36-46`) sempre desenha usando `GROUND_Y` e `PHASE_WIDTH`
fixos internamente. Pra desenhar uma plataforma em posição/tamanho
arbitrários sem duplicar a lógica de textura (faixa +"grama" speckle),
extrair um helper genérico e fazer `drawGround` chamá-lo:

```ts
function drawSurface(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    base: number,
    top: number,
    speckle: number,
    accent: number
) {
    const g = scene.add.graphics().setDepth(0);
    g.fillStyle(base).fillRect(x, y, width, height);
    g.fillStyle(top).fillRect(x, y, width, 9);
    g.fillStyle(accent).fillRect(x, y, width, 3);
    g.fillStyle(speckle);
    for (let px = x + 18; px < x + width; px += 38) {
        const variation = (px * 17) % 13;
        g.fillRect(px, y - variation, 18, variation + 8);
    }
}

function drawGround(scene: Scene, x0: number, base: number, top: number, speckle: number, accent: number) {
    drawSurface(scene, x0, GROUND_Y, PHASE_WIDTH, HEIGHT - GROUND_Y, base, top, speckle, accent);
}
```

Isso é um refactor mecânico: `drawGround` passa a chamar `drawSurface`
com exatamente os mesmos parâmetros que já usava — **zero mudança
visual** nas 6 fases atuais. A textura de "grama" desenhada acima do
topo (`y - variation`) funciona tanto pro chão quanto pra uma
plataforma flutuante (fica parecendo vegetação crescendo na borda de
cima do bloco).

## 3. Física em `buildPhysics()` (`src/game/scenes/Game.ts:372-389`)

Adicionar um loop, no mesmo método que já cria chão e paredes, criando
um corpo estático invisível por plataforma:

```ts
for (const platform of this.phase.platforms ?? []) {
    const rect = this.add.rectangle(platform.x, platform.y, platform.width, platform.height, 0x000000);
    rect.setOrigin(0, 0);
    rect.setAlpha(0);
    this.physics.add.existing(rect, true);
    rect.setData('platformDef', platform); // consumido pelo processCallback de oneWay (seção 4) e pelo WALL_CLIMB_FEATURE_PLAN.md
}
```

Como `create()` monta a lista de colisão lendo
`Array.from(this.physics.world.staticBodies)` **depois** de
`buildPhysics()` rodar (`Game.ts:105`), **nenhuma outra mudança é
necessária** ali — as plataformas entram automaticamente nessa lista,
tanto pro collider do player quanto pro loop que cria o collider de
cada inimigo (`Game.ts:115-125`). É por isso que este plano é a base:
o sistema de colisão já está "aberto" a novos corpos estáticos.

## 4. Plataformas de mão única (`oneWay`)

Isso precisa de tratamento especial porque muda o *processCallback* do
collider — hoje o collider entre player/inimigo e a lista de corpos
estáticos é criado de uma vez só, sem processCallback nenhum
(`Game.ts:110` e `116`).

**Abordagem recomendada**: separar os corpos estáticos em dois grupos
(sólidos vs. one-way) e criar dois colliders distintos, tanto pro
player quanto pra cada inimigo:

```ts
const isOneWay = (body: Physics.Arcade.StaticBody) =>
    (body.gameObject?.getData('platformDef') as PlatformDef | undefined)?.oneWay === true;

const solidColliders = colliders.filter(body => !isOneWay(body));
const oneWayColliders = colliders.filter(isOneWay);

this.physics.add.collider(this.player, solidColliders);
this.physics.add.collider(
    this.player,
    oneWayColliders,
    undefined,
    (playerObj, platformObj) => {
        const body = (playerObj as Physics.Arcade.Sprite).body as Physics.Arcade.Body;
        const platformBody = (platformObj as Physics.Arcade.Sprite).body as Physics.Arcade.StaticBody;
        // Só colide se o jogador está caindo/parado E os pés estão acima do topo da plataforma.
        return body.velocity.y >= 0 && body.bottom <= platformBody.top + 1;
    }
);
```

O mesmo par de colliders precisa substituir o único
`this.physics.add.collider(enemy, colliders)` de hoje
(`Game.ts:116`), dentro do loop que já itera `this.enemies`.

**Alternativa mais simples** (menos fiel a "parkour de verdade", mas
bem menos código): todas as plataformas ficam sólidas nos 4 lados
(nunca usar `oneWay: true`), então só dá pra alcançá-las pulando por
cima ou pelo lado, nunca atravessando por baixo. Ver decisão de design
#2.

## 5. Atenção pro Codex: patrulha de inimigo em plataforma estreita

`BaseEnemy` define o range de patrulha padrão como `x - 180` até
`x + 180` a partir do spawn (`BaseEnemy.ts:71-72`), e `updatePatrol()`
(`BaseEnemy.ts:178-210`) não tem **nenhuma** detecção de borda/vazio —
ele só anda até bater no `patrolMinX`/`patrolMaxX` configurado. Um
inimigo colocado em cima de uma plataforma nova mais estreita que
360px, sem que quem o posicionou tenha chamado
`enemy.setPatrolRange(...)` com limites dentro da largura real da
plataforma, vai andar pra fora dela e cair no vazio — algo que hoje
**nunca** acontece, porque o chão é sempre a fase inteira. Isso é
responsabilidade de quem cria os spawns
(`VERTICAL_SPAWN_MAP_FEATURE_PLAN.md`), não deste plano, mas é a
causa-raiz mais provável se aparecer um bug de "inimigo caindo da
plataforma" depois que este sistema existir.

## Decisões de design em aberto

1. **Unidade de medida**: coordenadas absolutas de mundo (mesma
   convenção já usada em todo `phases.ts`), não relativas/percentuais.
   Recomendo manter assim — introduzir um sistema de coordenadas
   diferente só pra plataformas seria inconsistente com o resto do
   arquivo.
2. **One-way vs. sólida por padrão** (seção 4): recomendo `oneWay:
   true` pras plataformas pensadas como parkour (pra poder pular por
   baixo e subir) e sólida só pra saliências de parede onde não faz
   sentido atravessar por baixo. Como o campo é por-plataforma, não
   precisa escolher um modelo único pro jogo inteiro.
3. **Paleta de cor das plataformas**: reaproveitar as mesmas 4 cores
   (`base/top/speckle/accent`) já usadas pelo chão da fase (visual
   combinando automaticamente), ou permitir cor customizada por
   plataforma? MVP: mesma paleta da fase — menos parâmetro pra
   especificar por plataforma. Dá pra estender depois com um campo
   opcional `palette?: [number, number, number, number]` em
   `PlatformDef` sem quebrar nada.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- As 6 fases atuais (sem `platforms` definido) rodam idênticas a hoje
  — chão, colisão, spawn de inimigo, tudo igual.
- Uma fase de teste com 1-2 plataformas novas: o player consegue
  pousar em cima; colide com os lados/embaixo se `oneWay` for
  `false`/omitido, ou atravessa por baixo e pousa em cima se
  `oneWay: true`.
- Um inimigo posicionado em cima de uma plataforma nova, com
  `setPatrolRange` configurado corretamente, não cai dela.
- Dash (`PlayerDash`) continua funcionando perto/sobre as plataformas
  novas, sem atravessar indevidamente uma plataforma sólida.
