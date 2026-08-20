# Plano: menu inicial, save em localStorage e dificuldade

## Objetivo

1. Ao abrir o jogo, mostrar um painel/menu em vez de cair direto na fase
   `forest`.
2. Progresso (até onde o jogador chegou) é salvo em `localStorage`, então
   fechar e reabrir o navegador não perde o avanço.
3. Ao começar uma run nova, perguntar **Normal** ou **Difícil**.
   - **Normal**: ao morrer, respawna na fase atual (do início dela) — **isso
     já é o comportamento atual do jogo** (`handlePlayerDeath` já faz
     `scene.restart`), só precisa continuar existindo pra esse modo.
   - **Difícil**: ao morrer, não respawna na fase — volta pro **início do
     jogo** (fase 1).

## Arquitetura: onde guardar o quê

Duas coisas diferentes, não confundir:

- **`localStorage`**: persiste entre sessões do navegador (fechar/abrir de
  novo). Usado só pra "até onde o jogador chegou", lido no menu pra oferecer
  "Continuar".
- **`this.registry`** (o registry global do Phaser, acessível de qualquer
  Scene via `this.registry.get/set`, sobrevive a `scene.start`/`scene.restart`
  dentro da mesma sessão do jogo aberto): guarda a **dificuldade da run
  atual**. Não precisa ficar passando dificuldade manualmente em todo
  `scene.start(...)` (nos portais, por exemplo) — o registry já é global.

Não usar Redux/state manager externo nem inventar um segundo mecanismo; o
Phaser já resolve isso com o registry.

## 1. Módulo de save (novo arquivo)

`src/game/state/save.ts`:
```ts
export type Difficulty = 'normal' | 'hard';

export type SaveData = {
    phaseIndex: number;
    difficulty: Difficulty;
};

const STORAGE_KEY = 'jogo-99:save';

export function loadSave(): SaveData | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.phaseIndex !== 'number' || (parsed.difficulty !== 'normal' && parsed.difficulty !== 'hard')) {
            return null; // dado corrompido/formato antigo — trata como "sem save"
        }
        return parsed;
    } catch {
        return null; // localStorage indisponível (ex.: modo privado) — degrada pra "sem save"
    }
}

export function writeSave(data: SaveData): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // Sem localStorage disponível: o jogo continua funcionando, só não
        // persiste entre sessões. Não é motivo pra quebrar o jogo.
    }
}

export function clearSave(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // idem
    }
}
```

## 2. `MenuScene` (novo arquivo `src/game/scenes/MenuScene.ts`)

Cena nova, roda **depois** do `PreloadScene` (assets já carregados) e
**antes** de qualquer `PhaseScene`. Fica com key `'Menu'`.

Fluxo dela:

- Lê `loadSave()`.
- **Se existe save**: mostra dois botões — `Continuar (Fase N — Normal/Difícil)`
  e `Novo Jogo`.
  - Continuar: `this.registry.set('difficulty', save.difficulty)`, depois
    `this.scene.start(PHASES[save.phaseIndex].key, { spawnX: 200 })`.
  - Novo Jogo: abre o sub-painel de dificuldade (ver abaixo).
- **Se não existe save**: mostra só o botão `Novo Jogo`, que já abre o
  sub-painel de dificuldade direto.
- **Sub-painel de dificuldade**: dois botões, `Normal` e `Difícil`. Ao
  escolher:
  ```ts
  this.registry.set('difficulty', escolhida);
  writeSave({ phaseIndex: 0, difficulty: escolhida });
  this.scene.start(PHASES[0].key, { spawnX: 200 });
  ```

Visual: reaproveitar a mesma linguagem visual do HUD já existente (painel
escuro semi-transparente com borda `0xb8cc84`, fonte `Georgia, serif` pro
título, `monospace` pro resto — ver `createHud()` em `Game.ts` como
referência de estilo). Não precisa de arte nova pra essa etapa; um painel
com texto e botões clicáveis (`setInteractive()` + `on('pointerdown', ...)`)
já resolve. Fundo pode ser só a cor `backgroundColor` do jogo (`#028af8`) ou
um retângulo escuro cobrindo a tela — decisão de design #3.

## 3. `src/game/main.ts`

Registrar a nova cena entre `PreloadScene` e as fases:
```ts
const scenes = [
    PreloadScene,
    MenuScene,
    ...PHASES.map((phase, index) => new PhaseScene(phase, index))
];
```

## 4. `src/game/scenes/PreloadScene.ts`

Trocar o final do `create()`:
```ts
// antes:
this.scene.start('forest', { spawnX: 200 });
// depois:
this.scene.start('Menu');
```

## 5. `src/game/scenes/Game.ts` (`PhaseScene`)

### 5.1 Salvar progresso ao entrar numa fase

No começo de `create()`, depois que `this.phaseIndex` já está definido:
```ts
import { writeSave } from '../state/save';
// ...
const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';
writeSave({ phaseIndex: this.phaseIndex, difficulty });
```
Isso roda toda vez que uma fase começa (inclusive em respawn do modo Normal
— salvar de novo o mesmo `phaseIndex` não causa problema, é idempotente).

### 5.2 Morte: comportamento por dificuldade

`handlePlayerDeath()` hoje:
```ts
private handlePlayerDeath() {
    this.cameras.main.fadeOut(420, 0, 0, 0, () => {
        this.scene.restart({ spawnX: PHASE_WIDTH / 2 });
    });
}
```
Passa a ramificar por dificuldade:
```ts
private handlePlayerDeath() {
    const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';

    this.cameras.main.fadeOut(420, 0, 0, 0, () => {
        if (difficulty === 'hard') {
            // Ver decisão de design #2 sobre resetar ou não o save aqui.
            this.scene.start(PHASES[0].key, { spawnX: 200 });
        } else {
            this.scene.restart({ spawnX: PHASE_WIDTH / 2 });
        }
    });
}
```

## Decisões de design em aberto

1. **Fechar o navegador no meio de uma run Difícil: o "Continuar" no menu
   deve voltar pra fase mais avançada alcançada, ou o modo Difícil não
   deveria persistir entre sessões (forçar terminar numa sentada só)?**
   Recomendo deixar persistir normalmente (fechar o navegador não é a mesma
   coisa que morrer) — a regra "sem respawn" deveria valer só pra morte
   dentro da run, não pra fechar a aba. Se quiser o comportamento mais hardcore
   (perde tudo ao fechar), é só não chamar `writeSave` quando
   `difficulty === 'hard'`.
2. **Morrer no modo Difícil deve limpar o save (`clearSave()`) ou só mandar o
   jogador de volta pra fase 1 sem mexer no que está salvo?** Recomendo
   limpar (`clearSave()` antes do `scene.start`), senão o menu mostraria
   "Continuar (Fase 4)" depois de uma morte que resetou a run pra fase 1,
   inconsistente com o que o jogador está vendo na tela.
3. **Visual do menu**: painel simples reaproveitando o estilo do HUD (cores/
   fontes já usadas) é suficiente pra essa etapa, ou você quer que eu peça um
   background ilustrado (como fizemos com a floresta) antes de implementar
   isso? Recomendo ir com o painel simples agora — dá pra trocar o fundo
   depois sem mexer na lógica.
4. **Botão de "resetar progresso" no menu?** Não foi pedido; deixo de fora
   por padrão, mas é barato adicionar (`clearSave()` + refresh do menu) se
   quiser depois.

## Critérios de regressão

- `npx tsc --noEmit` sem erro.
- Abrir o jogo pela primeira vez (sem save): cai no menu, só com "Novo Jogo"
  → escolher dificuldade → começa na fase 1.
- Fechar e reabrir depois de chegar em outra fase: menu mostra "Continuar" na
  fase certa, com a dificuldade certa.
- Modo Normal: morrer respawna na mesma fase (comportamento que já existe
  hoje — não pode regredir).
- Modo Difícil: morrer manda de volta pra fase 1, e (se a decisão #2 for
  "limpar") o save não oferece mais "Continuar" numa fase avançada depois
  disso.
- Trocar de fase pelo portal preserva a dificuldade corretamente nas duas
  direções (não precisa passar nada manualmente — é o registry fazendo isso).
- `localStorage` indisponível (ex.: alguém testando em aba anônima com
  bloqueio) não deve quebrar o jogo — só não persiste (ver os `try/catch` em
  `save.ts`).
