# Contexto técnico do projeto para outra IA

## Objetivo e estado atual

Este repositório contém um protótipo de jogo de plataforma 2D em pixel art. O jogador percorre seis fases lineares, encontra inimigos patrulhando, pode atacá-los e usa portais nas extremidades para viajar entre as fases. Não há sistema de vida, inventário, objetivo final, salvamento ou tela de vitória/derrota.

O projeto está funcional como protótipo, mas ainda possui várias decisões rápidas e dados embutidos em código. Antes de adicionar sistemas grandes, leia as seções **Arquitetura**, **Fluxos atuais** e **Pontos fracos**.

## Stack e execução

| Item | Valor |
| --- | --- |
| Linguagem | TypeScript 5.7 |
| Engine | Phaser 4, Arcade Physics |
| Build/dev server | Vite 6 |
| Resolução lógica | 1024 × 768 |
| Escala | `Scale.FIT`, centralizada na janela |

Comandos relevantes:

```bash
npm install
npm run dev-nolog
npx tsc --noEmit
npm run build-nolog
```

Use as variantes `*-nolog` se não quiser executar `log.js`, que faz telemetria anônima do template Phaser. O build escreve o resultado em `dist/`.

## Estrutura de arquivos

| Caminho | Responsabilidade |
| --- | --- |
| `src/main.ts` | Inicializa o jogo no elemento `#game-container`. |
| `src/game/main.ts` | Configuração global do Phaser e registro das cenas. |
| `src/game/scenes/PreloadScene.ts` | Carrega spritesheets e registra animações. Inicia `forest`. |
| `src/game/scenes/Game.ts` | Classe `PhaseScene`: ciclo da fase, HUD, inimigos, portais, combate e mapa. |
| `src/game/world/phases.ts` | Catálogo das seis fases e desenho procedural de céu, terreno e decoração. |
| `src/game/entities/Player.ts` | Entrada, movimento, pulo e emissão do evento de ataque. |
| `src/game/entities/Enemy.ts` | Patrulha, pausa e remoção ao receber um acerto. |
| `src/game/animations/*.ts` | Registro das animações de jogador e inimigos. |
| `public/assets/` | Sprites e imagens estáticas servidas diretamente pelo Vite. |
| `public/style.css` | Centralização do canvas e fundo da página. |

O `README.md` ainda é, em grande parte, o README do template Phaser. Não trate-o como documentação fiel de gameplay.

## Mundo e fases

As fases estão declaradas em `PHASES` dentro de `src/game/world/phases.ts`. Todas têm a mesma largura (`PHASE_WIDTH = 2560`) e a mesma altura (`HEIGHT = 768`). O chão começa em `GROUND_Y = 654`.

Ordem atual:

1. `forest` — FLORESTA VERDE
2. `desert` — DESERTO DOURADO
3. `snow` — PICOS DE NEVE
4. `cave` — CAVERNA PROFUNDA
5. `volcano` — VALE DO VULCÃO
6. `ruins` — RUÍNAS DO TEMPLO

Cada fase é uma instância de `PhaseScene`, criada em `src/game/main.ts`. A função `draw` de sua definição desenha o cenário usando `Graphics`; não há tilemap nem dados externos de level design.

## Fluxo de uma fase

1. `PreloadScene` carrega assets e animações e abre `forest` na posição X = 200.
2. `PhaseScene.create` configura o mundo de física, desenha a fase e cria chão e paredes invisíveis estáticos.
3. Cria `Player`, registra seu evento `attack` e adiciona colisão entre jogador e corpos estáticos.
4. Cria inimigos de acordo com a tabela local de `spawnEnemies` e adiciona colisões deles contra chão, paredes e jogador.
5. Desenha portais, HUD e mapa; a câmera passa a seguir o jogador.
6. Em cada frame, atualiza jogador, inimigos, portais e, quando aberto, o marcador do mapa.

Trocar de fase chama `scene.start(targetKey, { spawnX })`. Isso descarta a cena atual e cria outra do zero.

## Controles e comportamento esperado

| Tecla | Ação | Observações |
| --- | --- | --- |
| `A` / `D` | Mover esquerda/direita | Velocidade horizontal atual: 300. |
| `W` | Pular | Apenas no chão; velocidade vertical inicial: -590. |
| `F` | Atacar | Apenas no chão; interrompe o movimento durante a animação. |
| `M` | Abrir/fechar mapa | O jogo continua rodando; o marcador atualiza em tempo real. |

A gravidade efetiva é configurada por cena como 1400 em `PhaseScene.create`. A configuração global em `src/game/main.ts` ainda diz 900, mas é sobrescrita no jogo normal.

## Física atual

- O chão é um retângulo estático invisível a partir de `GROUND_Y` até o fim do mundo.
- Há paredes estáticas invisíveis em X = 0 e X = `PHASE_WIDTH`.
- Jogador e inimigos usam sprites Arcade escalados em 3×, com corpo configurado como 42 × 42 e offset `(3, 6)`.
- Jogador possui velocidade máxima vertical de 900 e colide com o chão/muros. Esta colisão foi adicionada recentemente; sem ela o personagem caía até o limite do mundo.
- Inimigos patrulham aproximadamente 180 px de cada lado do ponto de spawn, pausando em tempos aleatórios.
- Jogador e inimigos colidem fisicamente. Não existe dano por contato, empurrão controlado, invencibilidade ou resposta especial a colisões.

## Combate atual

`Player.attack()` toca a animação `player-attack` e emite o evento `attack`. `PhaseScene.handlePlayerAttack()` recebe o evento e procura inimigos:

- ativos;
- até 155 px do centro do jogador;
- na direção para a qual o sprite está virado;
- com diferença vertical menor que 75 px.

Um inimigo elegível chama `Enemy.takeHit(direction)`, tem o corpo Arcade desabilitado, recebe tint, é movido 36 px na direção do golpe, some em 220 ms e é destruído. Não há HP: um único acerto derrota qualquer inimigo.

## Portais e navegação

- O portal de saída fica em X = `PHASE_WIDTH - 120` e leva à próxima fase.
- O portal de retorno fica em X = 120 e leva à anterior.
- A ativação exige distância menor que 58 px do centro e velocidade horizontal no sentido do portal. Essa regra evita retornar instantaneamente ao nascer perto do portal de volta.
- A transição aplica `fadeOut` de 220 ms, desativa os controles e inicia a cena alvo com spawn em X = 200 ou X = `PHASE_WIDTH - 200`.

## Mapa em tempo real

O mapa é uma `Container` fixa na câmera, criada em `PhaseScene.createMapOverlay`.

- É aberto/fechado por `M`.
- Mostra um trajeto horizontal com os seis nomes de fase.
- O marcador vermelho representa a posição global aproximada: `phaseIndex + player.x / PHASE_WIDTH`.
- O texto inferior apresenta a fase e a porcentagem explorada dela.
- O mapa não pausa input, física ou inimigos. Isso é intencional para manter a posição atualizando em tempo real, mas pode ser inadequado se o mapa virar uma tela de navegação estratégica.

## Assets

Sprites do jogador estão em `public/assets/player`; inimigos em `public/assets/enemies`. As animações pressupõem frames de 48 × 48.

Existem imagens em `public/assets/background/Clouds`, carregadas por `PreloadScene`. Contudo, o fundo de nuvens atual foi refeito com `Graphics` em `drawClouds`, pois os PNGs disponíveis exibiam bordas cortadas/emendas quando posicionados no cenário. Portanto, essas texturas são atualmente carregadas sem uso ativo e podem ser removidas do preload ou substituídas por assets adequados.

## Pontos fracos e riscos técnicos

### 1. Estado do jogo não persiste entre fases — crítico

`scene.start` destrói e recria a fase. Inimigos derrotados reaparecem quando o jogador sai e retorna; não há registro de posição, progresso, pickups ou checkpoints. O mapa também infere progresso somente pela fase aberta e posição X atual. Para transformar o protótipo em jogo, criar um estado central (por exemplo, `GameState` ou plugin Phaser) é prioridade.

### 2. Combate é uma checagem instantânea e ampla — crítico

O dano ocorre no primeiro frame da animação, não no frame visual do golpe. O alcance de 155 px foi escolhido para compensar sprites/corpos grandes e pode acertar através de uma distância visualmente estranha. Um ataque também pode derrotar todos os inimigos válidos no alcance ao mesmo tempo. Não há hitbox explícita, cooldown por alvo, HP, reação de inimigo, dano ao jogador nem feedback de impacto.

Melhoria recomendada: criar uma hitbox temporária anexada ao jogador em um frame específico da animação, usar grupos Arcade/overlap, adicionar componentes de vida e estados de dano/morte.

### 3. Layout das fases é totalmente hard-coded — crítico para escala

Geometria, inimigos, decoração, cores, portais e textos ficam em funções e tabelas TypeScript. Adicionar uma fase exige editar código; não há editor de mapas, tilemap, camadas de colisão ou formato de dados. Isso limita o design e aumenta o risco de regressão visual.

Melhoria recomendada: migrar fases para Tiled/LDtk ou ao menos JSON tipado, separando dados de spawn, colisão, parallax e decoração do código de renderização.

### 4. Física pouco refinada — alta

Apesar da colisão com chão ter sido corrigida, o movimento ainda define velocidade horizontal diretamente a cada frame. Não há aceleração, desaceleração, coyote time, buffer de pulo, altura variável, queda mais rápida, rampas, plataformas, one-way platforms ou ajuste de colisão fino. O corpo de 42 × 42 escalado depende do comportamento de escala do Phaser e deve ser validado visualmente após atualizar a engine.

### 5. Portais dependem de posição/velocidade, não de um trigger físico — alta

A regra atual funciona para o percurso horizontal, porém usa números fixos (`58`, `120`, `200`) e pode falhar se velocidade, escala do sprite ou largura da fase mudarem. Não existe feedback de que o portal está pronto para ser usado e o jogador precisa estar se movendo na direção correta.

Melhoria recomendada: criar zonas de overlap estáticas, um cooldown curto por portal e uma indicação visual/tecla de interação.

### 6. Cenário procedural ainda precisa de validação visual — alta

As nuvens são desenhadas por círculos/elipses em duas camadas, substituindo imagens que geravam cortes. Isso elimina as emendas, mas não foi desenhado a partir de uma direção de arte consolidada. Os fundos, montanhas, árvores e solo também foram construídos com primitives, por isso podem apresentar sobreposição ou composição visual estranha dependendo da fase e do tamanho da tela.

É necessário testar em resoluções pequenas, largas e altas. O canvas usa escala `FIT`, mas HUD e mapa usam coordenadas absolutas de 1024 × 768.

### 7. Mapa é uma visualização, não um sistema de navegação — média

Os nomes das fases podem se sobrepor porque cada label tem largura fixa de 100 px. O marcador é uma interpolação em uma linha, não uma representação geográfica. Ele não registra áreas visitadas, inimigos, objetivos ou bloqueios. O HUD normal não anuncia a tecla `M`, embora o recurso exista.

### 8. Ausência de testes automatizados — alta

Não há testes unitários, integração, e2e ou snapshots visuais. Os comandos validados até agora são `npx tsc --noEmit` e build Vite. Mudanças em colisão, input, portais e coordenadas precisam de teste manual no navegador.

Prioridade sugerida: testes de lógica pura para spawns/progresso/portal; em seguida testes Playwright para abrir a fase, mover, atacar e trocar de fase.

### 9. Gerenciamento de entidades e desempenho — média

`enemies` mantém referências de objetos destruídos; o código ignora objetos inativos, mas a lista não é limpa. Para o conjunto pequeno atual isso não importa, porém é um padrão ruim para fases maiores. Todo cenário é redesenhado ao entrar em uma fase; não existe pooling, culling explícito ou grupos de entidades.

### 10. Acessibilidade e UX são mínimas — média

Controles são apenas teclado e não há remapeamento, touch/gamepad, tutorial completo, pause, menu, volume, legendas ou feedback de dano. As teclas `S` e o tipo `down` existem no jogador, mas não têm comportamento. A interface usa fontes de sistema e não assegura legibilidade em todas as escalas.

### 11. Codificação de texto deve ser verificada — média

Alguns comentários e strings aparecem com mojibake em certas leituras de terminal, por exemplo sequências como `Ã` e `Â`. Antes de editar conteúdo em português, confirmar que os arquivos estão salvos em UTF-8 e que o editor/terminal está interpretando UTF-8. Evitar regravações em codificação ANSI.

### 12. Documentação de projeto desatualizada — baixa

O `README.md` descreve o template e não explica o jogo, os controles, as fases ou os sistemas recentes. Este arquivo é a fonte de contexto mais específica para agentes; idealmente, um README curto deve apontar para ele.

## Sequência de trabalho recomendada para outra IA

1. Abrir o jogo com `npm run dev-nolog` e testar manualmente: movimentação, pulo, ataque, portal direito, portal esquerdo e mapa.
2. Corrigir qualquer defeito observável antes de ampliar conteúdo; as áreas mais sensíveis são colisão, porta de entrada e coordenadas da câmera.
3. Implementar estado persistente por fase antes de criar colecionáveis, missões ou inimigos com vida.
4. Extrair dados de fase e spawns de `Game.ts`/`phases.ts` para um formato tipado separado.
5. Substituir combate instantâneo por hitbox temporal e sistema de HP/dano.
6. Adicionar testes de lógica e pelo menos um teste de fluxo no navegador.
7. Atualizar HUD para incluir `M mapa` e alinhar README com a realidade do projeto.

## Critérios mínimos de regressão

Após qualquer mudança relevante, confirmar:

- `npx tsc --noEmit` finaliza sem erro;
- `npm run build-nolog` gera `dist/` sem erro;
- jogador repousa sobre o chão e não atravessa bordas;
- `W` só pula quando no chão;
- `F` derrota um inimigo próximo à frente e não um inimigo atrás;
- portais funcionam nos dois sentidos e não causam troca imediata ao entrar na fase;
- `M` abre e fecha o mapa, e o marcador se move durante o deslocamento;
- não há nuvens cortadas ou faixas inesperadas no cenário em pelo menos uma fase de céu aberto.

