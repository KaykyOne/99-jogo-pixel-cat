import { GameObjects, Geom, Input, Physics, Scene } from 'phaser';

// === [A: combate] ===
import { CombatHud } from '../combat/CombatHud';
import { MeleeHitbox } from '../combat/MeleeHitbox';
import { ProjectileManager } from '../combat/Projectile';
import { ProjectileTarget } from '../combat/types';
import { createBoss } from '../entities/bosses/boss-factory';
import { BossBase, BossIntroRequest } from '../entities/bosses/BossBase';
import { ForestBoss } from '../entities/bosses/ForestBoss';
// === [/A] ===
import { DamageSource } from '../damage/damage';
import { EnemyType } from '../damage/health-config';
import { BaseEnemy } from '../entities/BaseEnemy';
import { createEnemy } from '../entities/enemy-factory';
import { Player } from '../entities/Player';
// === [C: itens/economia] ===
// saveProgress no lugar de writeSave: a cena não monta mais o objeto do save
// na mão. Todo campo esquecido ali (o inventário, por exemplo) sumia do save na
// primeira porta atravessada — ver state/save.ts.
import { EconomySystem } from '../items/EconomySystem';
import { syncRunInventory } from '../items/run-inventory';
// === [/C] ===
import { clearSave, Difficulty, loadSave, saveProgress } from '../state/save';
import {
    drawIcon,
    drawParchment,
    drawWoodFrame,
    HUD_PANEL,
    UI_COLORS,
    UI_CSS,
    uiText,
    uiTextOutlined
} from '../ui/ui-theme';
import { MapPhaseState, WorldMapOverlay } from '../ui/WorldMapOverlay';
import { isPathBlocked, setLineOfSightBlockers } from '../world/line-of-sight';
// === [B: mundo/vila] ===
import { NpcManager } from '../world/NpcManager';
// === [/B] ===
import {
    drawPlatforms,
    FOREST_WATER_TOP_Y,
    GROUND_Y,
    HEIGHT,
    PHASES,
    PhaseDefinition,
    PlatformDef,
    TERRAIN
} from '../world/phases';

type Portal = {
    zoneX: number;
    targetKey: string;
    spawnX: number;
    direction: 1 | -1;
    requiresClear: boolean;
    sprite: GameObjects.Sprite;
};

type SceneData = {
    spawnX: number;
};

type EnemySpawn = {
    type: EnemyType;
    x: number;
    y?: number;
    minX?: number;
    maxX?: number;
    // Quantas unidades nascem neste ponto, espalhadas pela faixa de patrulha.
    // É o que faz a aranha aparecer em bando. Ausente = 1.
    count?: number;
};

// Altura de cruzeiro do morcego. Fica acima do topo de 3 STEPs (o ponto mais
// alto que o terreno alcança) para ele sobrevoar a fase inteira sem nascer
// dentro de plataforma nenhuma.
const BAT_FLIGHT_Y = GROUND_Y - 250;

// Ponto de entrada da fase: onde se surge vindo do portal anterior e onde o
// jogador renasce ao morrer.
const PHASE_START_X = 200;

// Duração da animação de morte do jogador (player-death: 6 frames a 10fps).
const DEATH_ANIMATION_MS = 600;

// Controles listados na pausa. O HUD não repete isto: só aponta para a pausa.
const PAUSE_CONTROLS: readonly [label: string, keys: string][] = [
    ['Andar', 'A / D'],
    ['Pular', 'Espaço'],
    ['Dash', 'K'],
    ['Escalar', 'W ou ↑ encostado na parede'],
    ['Atacar', 'Clique esquerdo'],
    ['Defender', 'Clique direito (segurar)'],
    ['Trocar arma', '1 / 2 / 3'],
    ['Trocar magia', 'Q (com o cajado)'],
    ['Mochila', 'Roda do mouse ou Tab escolhe'],
    ['Usar / largar', 'F usa  ·  G larga  ·  Shift+G tudo'],
    ['Cura rápida', 'R'],
    ['Conversar', 'E'],
    ['Mapa', 'M']
];

export class PhaseScene extends Scene {
    private phase: PhaseDefinition;
    private phaseIndex: number;
    // Largura desta fase. A vila e as fases de combate têm tamanhos
    // diferentes, então nada na cena pode mais ler a constante global.
    private readonly phaseWidth: number;

    private player!: Player;
    private enemies: BaseEnemy[] = [];
    private portals: Portal[] = [];
    private teleporting = false;
    private phaseCleared = false;
    private mapKey!: Input.Keyboard.Key;
    private pauseKey!: Input.Keyboard.Key;
    private isPaused = false;
    private worldMap!: WorldMapOverlay;
    private hpHearts!: GameObjects.Graphics;
    private lastHp = -1;
    private dashIndicator!: GameObjects.Rectangle;
    private controlsText!: GameObjects.Text;
    private pausePanel!: GameObjects.Container;
    private pausePanelGraphics!: GameObjects.Graphics;
    private pauseTitle!: GameObjects.Text;
    private pauseLabels!: GameObjects.Text;
    private pauseKeys!: GameObjects.Text;
    private pauseHint!: GameObjects.Text;

    // Projéteis vivos da fase (cusparada da lhama, teia da aranha, flecha e
    // magias do jogador).
    private projectiles!: ProjectileManager;

    // === [A: combate] ===
    // Barra de mana e arma equipada. A cena só instancia e chama update().
    private combatHud!: CombatHud;
    // Boss da floresta, guardado para a cena adotar os inimigos que ele invoca
    // na fase 2 — sem collider e sem entrar em `enemies`, um invocado
    // atravessaria o chão e nunca contaria para a fase ficar limpa.
    private forestBoss?: ForestBoss;
    // Colliders da fase, guardados para poder aplicá-los a um inimigo que
    // nasce DEPOIS do create (os invocados do boss).
    private solidColliders: GameObjects.GameObject[] = [];
    private oneWayColliders: GameObjects.GameObject[] = [];
    private canLandOnOneWay: (actor: unknown, platform: unknown) => boolean = () => true;
    // === [/A] ===

    // Paredes escaláveis da fase (ver updateWallProximity).
    private climbableWalls: GameObjects.GameObject[] = [];

    // === [B: mundo/vila] ===
    // NPCs, ícone de interação e diálogo da fase. A cena só instancia, chama
    // update() e consulta isModalOpen.
    private npcs!: NpcManager;
    // === [/B] ===

    // === [C: itens/economia] ===
    // Inventário, HUD de itens, drops e loja. A cena só instancia, chama
    // update() e consulta isModalOpen.
    private economy!: EconomySystem;
    // === [/C] ===

    // Textura espelhada do lago, criada apenas na floresta.
    private lakeReflection?: GameObjects.RenderTexture;
    private lakeReflectionExcluded = new Set<GameObjects.GameObject>();
    private lakeReflectionExcludedFor?: GameObjects.RenderTexture;
    private readonly lakeReflectionDrawList: GameObjects.GameObject[] = [];
    private wantsLakeReflection = false;
    // Objetos de HUD que o espelho não pode capturar (senão o painel de vida
    // apareceria refletido dentro da água).
    private hudObjects: GameObjects.GameObject[] = [];

    constructor(phase: PhaseDefinition, phaseIndex: number) {
        super(phase.key);

        this.phase = phase;
        this.phaseIndex = phaseIndex;
        this.phaseWidth = phase.width;
    }

    create(data: SceneData) {
        // O Phaser reaproveita esta mesma instância em scene.restart() (o
        // respawn do modo Normal). Sem resetar esses campos, objetos e flags
        // da vida anterior acumulam ou ficam presos na nova vida.
        this.enemies = [];
        this.portals = [];
        this.hudObjects = [];
        this.teleporting = false;
        this.phaseCleared = false;
        this.lastHp = -1;
        this.isPaused = false;
        this.lakeReflection = undefined;
        this.wantsLakeReflection = false;
        // === [A: combate] ===
        this.forestBoss = undefined;
        // === [/A] ===

        const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';

        // === [C: itens/economia] ===
        // ANTES da gravação, e não junto com o resto da montagem: o inventário
        // vive no registry (global ao jogo) e não zera sozinho ao começar uma
        // partida nova. Quem decide se ele continua ou morre é o save, e o save
        // é reescrito na linha seguinte — sincronizar depois disso leria o
        // estado que acabamos de gravar e o "Novo Jogo" herdaria as moedas da
        // run anterior.
        syncRunInventory(this);
        // === [/C] ===

        saveProgress(this, {
            phaseIndex: this.phaseIndex,
            difficulty,
            clearedPhases: loadSave()?.clearedPhases ?? []
        });

        // Mundo plano de 768px em todas as fases: o terreno simplificado não
        // tem mais nada acima do topo da tela.
        this.physics.world.setBounds(0, 0, this.phaseWidth, HEIGHT);
        // Uma gravidade mais firme deixa os saltos responsivos sem o personagem
        // parecer flutuar.
        this.physics.world.gravity.y = 1400;

        // Esta cena desenha APENAS a sua própria fase (x0 = 0).
        this.phase.draw(this, 0, this.phaseWidth);
        drawPlatforms(this, this.phase);

        this.buildPhysics();

        const spawnX =
            data && typeof data.spawnX === 'number' ? data.spawnX : this.phaseWidth / 2;

        this.player = new Player(this, spawnX, GROUND_Y - 80);
        this.player.setDepth(20);

        // physics.world.staticBodies guarda CORPOS; os colliders (e os callbacks
        // deles) trabalham com GameObjects. Converter aqui evita entregar um
        // StaticBody onde o callback espera um GameObject — era isso que
        // estourava já na primeira colisão com o chão e travava a fase.
        const staticObjects = Array.from(this.physics.world.staticBodies)
            .map(body => body.gameObject)
            .filter((object): object is GameObjects.GameObject => !!object);

        const platformDefOf = (object: GameObjects.GameObject) =>
            object.getData('platformDef') as PlatformDef | undefined;

        const solidColliders = staticObjects.filter(object => platformDefOf(object)?.oneWay !== true);
        const oneWayColliders = staticObjects.filter(object => platformDefOf(object)?.oneWay === true);

        // Superfícies que cortam golpes. Só as plataformas sólidas declaradas
        // pela fase entram: o chão e os muros de borda do mundo nunca ficam
        // entre dois combatentes, e as one-way são atravessáveis de propósito.
        setLineOfSightBlockers(
            this,
            staticObjects
                .filter(object => {
                    const def = platformDefOf(object);
                    return !!def && def.oneWay !== true;
                })
                .map(object => {
                    const body = object.body as Physics.Arcade.StaticBody;
                    return new Geom.Rectangle(body.x, body.y, body.width, body.height);
                })
        );

        const canLandOnOneWay = (actor: unknown, platform: unknown) => {
            const actorBody = (actor as GameObjects.GameObject).body as Physics.Arcade.Body;
            const platformBody = (platform as GameObjects.GameObject).body as Physics.Arcade.StaticBody;
            return actorBody.velocity.y >= 0 && actorBody.bottom <= platformBody.top + 1;
        };

        // O jogador tamb\u00e9m precisa colidir com o ch\u00e3o e com as paredes da fase.
        // Sem este collider ele apenas ca\u00eda at\u00e9 o limite do mundo, o que fazia
        // pulo, movimento e encontros com inimigos parecerem quebrados.
        // O contato com a parede escalável é registrado DENTRO do collider
        // sólido, não num collider próprio: o primeiro collider a rodar separa
        // os corpos, e um segundo sobre o mesmo par já não encontraria
        // sobreposição nenhuma para disparar o callback. O lado vem da
        // geometria, não de body.blocked, pelo mesmo motivo de ordem.
        this.physics.add.collider(this.player, solidColliders);

        // Paredes que dão para escalar: toda plataforma sólida com pelo menos um
        // STEP de altura. NÃO basta a que a fase marcou com `climbable` — com
        // uma única marcada no jogo inteiro, segurar a tecla em qualquer outro
        // bloco não fazia nada e a mecânica parecia quebrada. A flag continua
        // no dado como intenção de level design (é ela que tranca a arena do
        // boss da floresta). Chão e muros de borda ficam de fora: não têm
        // `platformDef`, e escalar o fim do mundo não leva a lugar nenhum.
        this.climbableWalls = staticObjects.filter(object => {
            const def = platformDefOf(object);
            const body = object.body as Physics.Arcade.StaticBody;
            return !!def && def.oneWay !== true && body.height >= TERRAIN.STEP;
        });
        this.physics.add.collider(this.player, oneWayColliders, undefined, canLandOnOneWay);

        // Precisa existir ANTES de spawnEnemies: os inimigos que atiram pegam
        // uma referência dele no construtor.
        this.projectiles = new ProjectileManager(this, this.player, solidColliders);
        this.registry.set('projectiles', this.projectiles);

        // === [A: combate] ===
        // Os tiros do JOGADOR (flecha, magias) precisam saber em quem bater. É
        // uma função, e não a lista pronta: o manager nasce antes dos inimigos,
        // então uma lista capturada aqui nasceria vazia para sempre.
        this.projectiles.bindTargets(() => this.enemies as unknown as ProjectileTarget[]);
        // Acerto de tiro reaproveita o MESMO hit-stop/shake do golpe corpo a
        // corpo, em vez de o sistema de projétil inventar o seu.
        this.projectiles.onPlayerProjectileHit(() =>
            this.applyImpactFeel({ hitStopMs: 45, shakeMs: 90, shakeIntensity: 0.004 })
        );
        // Efeitos de área sem projétil (onda de gelo do cajado, ver
        // PlayerWeapons) chegam por evento pelo mesmo caminho.
        this.events.on('combat:impact', this.applyImpactFeel, this);
        // === [/A] ===

        // Guardados em campo para os inimigos INVOCADOS em runtime (fase 2 do
        // boss da floresta) receberem exatamente os mesmos colliders.
        this.solidColliders = solidColliders;
        this.oneWayColliders = oneWayColliders;
        this.canLandOnOneWay = canLandOnOneWay;

        this.spawnEnemies();
        this.spawnBoss();

        for (const enemy of this.enemies) {
            this.attachEnemyPhysics(enemy);
        }

        // Reinicia a fase quando o jogador morre.
        this.player.once('player-died', () => this.handlePlayerDeath());

        this.buildPortals();

        // === [B: mundo/vila] ===
        // Depois do jogador (precisa dele para medir distância) e antes da HUD,
        // que já é a última coisa da montagem.
        this.npcs = new NpcManager(this, this.player, this.phase.npcs ?? []);
        // === [/B] ===

        // === [C: itens/economia] ===
        // Depois do jogador (o ímã dos itens caídos mede distância até ele) e
        // depois de buildPhysics (o LootManager lê os corpos estáticos da cena
        // para fazer os drops quicarem no chão).
        //
        // Não mexe nos controles do jogador: quem abre o modal é o NpcManager
        // (a loja só é alcançada pelo diálogo), e ele já desliga e devolve o
        // controle ao receber 'shop:closed'. Duas mãos no mesmo interruptor é
        // como ele acaba ficando na posição errada.
        this.economy = new EconomySystem(this, this.player);
        // === [/C] ===

        this.createHud();
        this.createMapOverlay();
        this.createPauseOverlay();

        this.pauseKey = this.input.keyboard!.addKey(Input.Keyboard.KeyCodes.ESC);

        // Fala de abertura dos bosses (ver BossBase.updateIntro).
        this.events.on('boss:intro', this.handleBossIntro, this);

        const camera = this.cameras.main;
        camera.setBounds(0, 0, this.phaseWidth, HEIGHT);
        camera.startFollow(this.player, true, 0.1, 0.1);
        camera.fadeIn(220, 0, 0, 0);

        // Fase com lago. O RT em si nasce no primeiro update (ver
        // setupLakeReflection).
        this.wantsLakeReflection = this.phase.key === 'forest';

        // A escala pode mudar enquanto a cena continua ativa. Remove antes de
        // registrar porque scene.restart reutiliza esta mesma instância.
        this.scale.off('resize', this.repositionResponsiveUI, this);
        this.scale.on('resize', this.repositionResponsiveUI, this);
        this.events.once('shutdown', () => {
            // === [B: mundo/vila] ===
            // Tween com repeat: -1 (respiração do NPC, flutuação do ícone) que
            // sobrevive à troca de fase é vazamento clássico.
            this.npcs.destroy();
            // === [/B] ===
            // === [A: combate] ===
            this.combatHud.destroy();
            this.worldMap.destroy();
            this.events.off('combat:impact', this.applyImpactFeel, this);
            this.events.off('boss:intro', this.handleBossIntro, this);
            // === [/A] ===
            this.projectiles.destroyAll();
            this.scale.off('resize', this.repositionResponsiveUI, this);
            this.scale.off('resize', this.resizeLakeReflection, this);
        });
    }

    update(time: number, delta: number) {
        // === [C: itens/economia] ===
        // A loja consome TODA tecla e sai — inclusive ESC, que aqui fecha o
        // painel em vez de pausar (JustDown é consumido na própria Key, que é a
        // mesma instância de pauseKey). Vem antes do gate do diálogo porque a
        // loja é aberta A PARTIR dele: com os dois abertos, quem responde tem
        // que ser o painel que está por cima.
        if (this.economy.isModalOpen) {
            this.economy.updateModal();
            return;
        }
        // === [/C] ===

        // === [B: mundo/vila] ===
        // Diálogo/loja aberto consome TODA tecla e sai: nem ESC, nem M, nem
        // ataque, nem movimento passam. O gate vem antes da pausa e é
        // excludente de propósito — togglePause faz `time.paused = true`, e o
        // efeito de máquina de escrever do diálogo roda em time.addEvent: se
        // os dois pudessem coexistir, o texto congelaria e o E não responderia.
        //
        // O ESC que fecha o diálogo é consumido aqui dentro (JustDown zera a
        // flag na PRÓPRIA Key, que é a mesma instância de pauseKey), então ele
        // não vira pausa no frame seguinte.
        if (this.npcs.isModalOpen) {
            this.npcs.update();
            return;
        }
        // === [/B] ===

        if (Input.Keyboard.JustDown(this.pauseKey)) {
            // ESC fecha primeiro o painel que já está aberto, em vez de
            // empilhar pausa por cima do mapa.
            if (this.worldMap.isOpen) {
                this.worldMap.close();
            } else {
                this.togglePause();
            }
        }

        if (this.isPaused) {
            return;
        }

        // ANTES do player: é ele quem lê, no próprio update, se há parede ao
        // alcance para decidir se a tecla de escalar responde.
        this.updateWallProximity();

        this.player.update(time, delta);
        this.refreshHudHp();
        this.updateDashIndicator();

        // === [A: combate] ===
        // Mana regenera todo frame; o próprio HUD só redesenha quando o valor
        // muda de passo visível.
        this.combatHud.update();
        // === [/A] ===

        // === [B: mundo/vila] ===
        // Aproximação dos NPCs (ícone "E") e a própria tecla de interagir.
        // Fase sem NPC nenhum sai daqui na primeira linha.
        this.npcs.update();
        // === [/B] ===

        // === [C: itens/economia] ===
        // Ímã/coleta dos itens caídos e as teclas 1..6 do inventário.
        this.economy.update();
        // === [/C] ===

        // Verifica, a cada frame, o overlap entre a hitbox ativa do golpe e os
        // inimigos. A hitbox só existe durante os frames de impacto da animação.
        const activeHitbox = this.player.combat.activeHitboxGameObject;
        if (activeHitbox) {
            for (const enemy of this.enemies) {
                if (!enemy.active) {
                    continue;
                }

                this.physics.world.overlap(activeHitbox, enemy, () => {
                    this.handleImpact(activeHitbox, enemy);
                });
            }
        }

        for (const enemy of this.enemies) {
            enemy.update(time, delta);
        }

        this.projectiles.update();

        // === [A: combate] ===
        // Antes do teste de fase limpa, e não depois: um invocado que nasceu
        // neste frame precisa já estar em `enemies` quando a cena pergunta se
        // sobrou alguém vivo, senão o portal abre no meio da fase 2 do boss.
        this.adoptBossSummons();
        // === [/A] ===

        if (
            !this.phaseCleared &&
            this.enemies.length > 0 &&
            this.enemies.every(enemy => !enemy.isAlive)
        ) {
            this.phaseCleared = true;
            const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';
            const save = loadSave();
            const clearedPhases = Array.from(
                new Set([...(save?.clearedPhases ?? []), this.phaseIndex])
            );
            // === [C: itens/economia] ===
            // saveProgress preserva o inventário; writeSave direto o apagava.
            saveProgress(this, { phaseIndex: this.phaseIndex, difficulty, clearedPhases });
            // === [/C] ===
            this.refreshMapNodes();
            this.unlockExitPortal();
        }

        this.handlePortals();

        if (Input.Keyboard.JustDown(this.mapKey) && this.worldMap.toggle()) {
            this.refreshMapNodes();
        }

        if (this.worldMap.isOpen) {
            this.updateMapMarker();
        }

        if (this.wantsLakeReflection) {
            this.updateLakeReflection();
        }
    }

    // Marca a parede escalável ao alcance do jogador. Isto era feito no callback
    // do collider, e por isso só valia enquanto ele estivesse EMPURRANDO contra
    // a parede: soltar o direcional para apertar a tecla de escalar apagava o
    // contato no mesmo frame, e a escalada simplesmente não começava. Por
    // proximidade, chegar perto basta.
    private updateWallProximity() {
        const body = this.player.body as Physics.Arcade.Body;
        const reach = 16;

        for (const wall of this.climbableWalls) {
            const wallBody = wall.body as Physics.Arcade.StaticBody;

            // Com os pés na altura do topo ele está EM CIMA da plataforma, e
            // abaixo da base não há parede nenhuma na frente dele.
            if (body.bottom <= wallBody.top + 4 || body.top >= wallBody.bottom) {
                continue;
            }

            const wallLeft = wallBody.x;
            const wallRight = wallBody.x + wallBody.width;
            const paredeADireita = body.right >= wallLeft - reach && body.center.x < wallBody.center.x;
            const paredeAEsquerda = body.left <= wallRight + reach && body.center.x > wallBody.center.x;

            if (!paredeADireita && !paredeAEsquerda) {
                continue;
            }

            this.player.climb.markTouchingWall(
                paredeADireita ? 1 : -1,
                wallBody.top,
                wallLeft,
                wallRight
            );
            return;
        }
    }

    private spawnEnemies() {
        // Distribuição de inimigos por fase (key das fases).
        // Todo spawn PRECISA de minX/maxX: a patrulha não detecta borda
        // sozinha. Em cima de plataforma, a faixa é a largura dela com 40px de
        // folga de cada lado (senão o inimigo anda para fora e cai); no chão, a
        // faixa fica num trecho aberto, sem plataforma sólida por cima — um
        // spawn de chão embaixo de um monte nasce ENTERRADO nele.
        //
        // O Y elevado é sempre `topo da plataforma - 80`, a mesma folga de
        // queda usada pelos spawns do chão.
        const spawns: Record<string, EnemySpawn[]> = {
            forest: [
                // Sobre o degrau de 1 STEP (x 760..980, topo 284).
                { type: 'hedgehog', x: 870, y: GROUND_Y - TERRAIN.STEP - 80, minX: 800, maxX: 940 },
                // Bando no trecho aberto antes do vão longo.
                { type: 'spider', x: 1380, minX: 1310, maxX: 1490, count: 3 },
                // Sobre o monte de 1 STEP após o vão longo (x 1500..1680, topo 284).
                { type: 'llama', x: 1590, y: GROUND_Y - TERRAIN.STEP - 80, minX: 1540, maxX: 1640 },

                // --- Segunda metade da fase ---------------------------
                // Spawn de chão só em trecho ABERTO: embaixo de uma
                // plataforma sólida o inimigo nasce enterrado nela.
                { type: 'spider', x: 2600, minX: 2420, maxX: 2800, count: 3 },
                // Sobre a plataforma de 2 STEPs (x 2860..3040).
                { type: 'hedgehog', x: 2950, y: GROUND_Y - TERRAIN.STEP * 2 - 80, minX: 2900, maxX: 3000 },
                { type: 'llama', x: 3900, minX: 3800, maxX: 4080 }
            ],
            desert: [
                // A lhama define o deserto: obriga a aprender a fechar
                // distância contra quem atira e recua.
                { type: 'llama', x: 1400, minX: 1280, maxX: 1820 },
                // Reposicionada com a fase esticada: a faixa antiga (2300..2520)
                // caiu embaixo de uma plataforma nova, e patrulha de chão embaixo
                // de bloco sólido nasce enterrada nele.
                { type: 'llama', x: 2120, minX: 2040, maxX: 2200 },

                // --- Segunda metade da fase ---------------------------
                // Spawn de chão só em trecho ABERTO: embaixo de uma
                // plataforma sólida o inimigo nasce enterrado nela.
                { type: 'llama', x: 2540, minX: 2470, maxX: 2610 },
                // Sobre a plataforma de 1 STEP (x 3320..3560).
                { type: 'hedgehog', x: 3440, y: GROUND_Y - TERRAIN.STEP - 80, minX: 3360, maxX: 3520 },
                // Sobre a de 2 STEPs (x 3760..3960).
                { type: 'llama', x: 3860, y: GROUND_Y - TERRAIN.STEP * 2 - 80, minX: 3800, maxX: 3920 }
            ],
            snow: [
                { type: 'spider', x: 400, minX: 220, maxX: 600, count: 2 },
                { type: 'hedgehog', x: 1420, minX: 1240, maxX: 1740 },
                // Reposicionada com a fase esticada: a faixa antiga (2300..2520)
                // caiu embaixo de uma plataforma nova, e patrulha de chão embaixo
                // de bloco sólido nasce enterrada nele.
                { type: 'llama', x: 2080, minX: 2000, maxX: 2160 },

                // --- Segunda metade da fase ---------------------------
                // Spawn de chão só em trecho ABERTO: embaixo de uma
                // plataforma sólida o inimigo nasce enterrado nela.
                { type: 'hedgehog', x: 2820, minX: 2760, maxX: 2890 },
                // Sobre a plataforma de 2 STEPs (x 3220..3420).
                { type: 'llama', x: 3320, y: GROUND_Y - TERRAIN.STEP * 2 - 80, minX: 3260, maxX: 3380 },
                { type: 'spider', x: 3500, minX: 3440, maxX: 3600, count: 3 },
                { type: 'bat', x: 4250, y: BAT_FLIGHT_Y, minX: 4180, maxX: 4380 }
            ],
            cave: [
                // Caverna é o território do morcego e da aranha.
                { type: 'bat', x: 500, y: BAT_FLIGHT_Y, minX: 260, maxX: 760 },
                { type: 'bat', x: 1400, y: BAT_FLIGHT_Y, minX: 1160, maxX: 1680 },
                { type: 'spider', x: 1420, minX: 1180, maxX: 1660, count: 4 },
                // Reposicionada com a fase esticada: a faixa antiga (2300..2520)
                // caiu embaixo de uma plataforma nova, e patrulha de chão embaixo
                // de bloco sólido nasce enterrada nele.
                { type: 'hedgehog', x: 2040, minX: 1960, maxX: 2120 },

                // --- Segunda metade da fase ---------------------------
                // Spawn de chão só em trecho ABERTO: embaixo de uma
                // plataforma sólida o inimigo nasce enterrado nela.
                { type: 'bat', x: 2700, y: BAT_FLIGHT_Y, minX: 2600, maxX: 2900 },
                { type: 'spider', x: 3100, minX: 3020, maxX: 3180, count: 4 },
                // Sobre a plataforma de 2 STEPs (x 3620..3820).
                { type: 'hedgehog', x: 3720, y: GROUND_Y - TERRAIN.STEP * 2 - 80, minX: 3660, maxX: 3780 },
                { type: 'bat', x: 4250, y: BAT_FLIGHT_Y, minX: 4200, maxX: 4380 }
            ],
            volcano: [
                { type: 'llama', x: 400, minX: 220, maxX: 620 },
                { type: 'hedgehog', x: 1150, minX: 980, maxX: 1340 },
                { type: 'bat', x: 2200, y: BAT_FLIGHT_Y, minX: 2020, maxX: 2460 },

                // --- Segunda metade da fase ---------------------------
                // Spawn de chão só em trecho ABERTO: embaixo de uma
                // plataforma sólida o inimigo nasce enterrado nela.
                { type: 'hedgehog', x: 2500, minX: 2440, maxX: 2570 },
                // Sobre a plataforma de 2 STEPs (x 3280..3480).
                { type: 'llama', x: 3380, y: GROUND_Y - TERRAIN.STEP * 2 - 80, minX: 3320, maxX: 3440 },
                { type: 'bat', x: 3600, y: BAT_FLIGHT_Y, minX: 3500, maxX: 3660 },
                { type: 'llama', x: 4300, minX: 4250, maxX: 4400 }
            ],
            ruins: [
                { type: 'spider', x: 400, minX: 220, maxX: 600, count: 3 },
                { type: 'llama', x: 1300, minX: 1220, maxX: 1700 },
                { type: 'bat', x: 1450, y: BAT_FLIGHT_Y, minX: 1200, maxX: 1740 },
                // Sobre o degrau de 1 STEP (x 1760..2000, topo 284).
                { type: 'hedgehog', x: 1880, y: GROUND_Y - TERRAIN.STEP - 80, minX: 1800, maxX: 1960 },

                // --- Segunda metade da fase ---------------------------
                // Spawn de chão só em trecho ABERTO: embaixo de uma
                // plataforma sólida o inimigo nasce enterrado nela.
                { type: 'spider', x: 2840, minX: 2770, maxX: 2910, count: 3 },
                // Sobre a plataforma de 1 STEP (x 3320..3560).
                { type: 'llama', x: 3440, y: GROUND_Y - TERRAIN.STEP - 80, minX: 3360, maxX: 3520 },
                { type: 'bat', x: 3980, y: BAT_FLIGHT_Y, minX: 3900, maxX: 4060 },
                // Sobre a plataforma de 1 STEP (x 4080..4300).
                { type: 'hedgehog', x: 4190, y: GROUND_Y - TERRAIN.STEP - 80, minX: 4120, maxX: 4260 }
            ]
        };

        const phaseSpawns = spawns[this.phase.key] ?? [];

        for (const spawn of phaseSpawns) {
            // Spawns sem Y explícito preservam a altura original do chão.
            // Spawns elevados devem informar minX/maxX conforme a plataforma
            // onde estão, pois a patrulha não detecta bordas automaticamente.
            const y = spawn.y ?? GROUND_Y - 80;

            // Bando (aranhas). Espalha as unidades pela faixa de patrulha em
            // vez de empilhá-las no mesmo x — nascendo sobrepostas, a
            // separação do Arcade as arremessa para os lados no primeiro frame.
            const count = spawn.count ?? 1;
            const minX = spawn.minX ?? spawn.x - 180;
            const maxX = spawn.maxX ?? spawn.x + 180;
            const step = count > 1 ? (maxX - minX) / (count + 1) : 0;

            for (let index = 0; index < count; index++) {
                const x = count > 1 ? minX + step * (index + 1) : spawn.x;
                const enemy = createEnemy(this, spawn.type, x, y, this.player);

                enemy.setDepth(15);
                enemy.setPatrolRange(minX, maxX);

                this.enemies.push(enemy);
            }
        }
    }

    // === [A: combate] ===
    private spawnBoss() {
        const bossX = this.phaseWidth - 420;

        // Indexado por CHAVE de fase, nunca por número: a vila entrou como
        // PHASES[0] e qualquer índice chumbado apontaria para o boss errado.
        // As fases sem boss dedicado continuam com o genérico (ver
        // bosses/boss-factory.ts).
        const boss = createBoss(this, this.phase.key, bossX, GROUND_Y - 120, this.player);
        if (!boss) {
            return;
        }

        boss.setDepth(15);
        // Arena maior (ver BOSS_ARENA_WIDTH): patrulha mais larga, sem passar
        // da borda da fase.
        boss.setPatrolRange(bossX - 320, Math.min(this.phaseWidth - 80, bossX + 320));
        this.enemies.push(boss);
        // Só os bosses dedicados têm barra presa à tela; a do boss genérico
        // flutua sobre a cabeça, é objeto de mundo, e refletir na água é o
        // comportamento certo para ela.
        if (boss instanceof BossBase) {
            this.hudObjects.push(...boss.hudObjects);
        }

        if (boss instanceof ForestBoss) {
            this.forestBoss = boss;
        }
    }

    // Fala de abertura do boss. O NpcManager já trava a cena inteira enquanto
    // o diálogo está aberto (update sai cedo), mas a física anda sozinha: sem
    // pausá-la, projéteis e corpos seguiriam se movendo atrás da caixa de texto.
    private handleBossIntro(request: BossIntroRequest) {
        const camera = this.cameras.main;
        this.physics.world.pause();

        // Enquadra jogador e boss juntos, com um tremor de "rugido".
        camera.stopFollow();
        camera.pan((this.player.x + request.bossX) / 2, camera.midPoint.y, 500, 'Sine.easeInOut');
        camera.shake(280, 0.006);

        this.npcs.openScripted({ speaker: request.speaker, lines: request.lines }, () => {
            this.physics.world.resume();
            // Pan interrompido não pode brigar com o follow; o lerp do follow
            // desliza a câmera de volta até o jogador.
            camera.panEffect.reset();
            camera.startFollow(this.player, true, 0.1, 0.1);
            request.onDone();
        });
    }

    // Colliders e dano por contato de um inimigo. Extraído do create porque os
    // invocados do boss nascem no meio da luta e precisam exatamente do mesmo
    // tratamento — sem isto eles atravessariam o chão.
    private attachEnemyPhysics(enemy: BaseEnemy) {
        this.physics.add.collider(enemy, this.solidColliders);
        this.physics.add.collider(enemy, this.oneWayColliders, undefined, this.canLandOnOneWay);
        this.physics.add.collider(
            this.player,
            enemy,
            () => this.handleContactDamage(enemy),
            // false evita dano e separação física durante o dash.
            () => !this.player.dash.isDashing,
            this
        );
    }

    // Recolhe os inimigos invocados pelo boss da floresta na fase 2 e os adota
    // como inimigos da fase: senão eles nunca contariam para "fase limpa" e o
    // portal ficaria trancado mesmo com a arena vazia.
    private adoptBossSummons() {
        if (!this.forestBoss) {
            return;
        }

        for (const summon of this.forestBoss.collectSummons()) {
            this.attachEnemyPhysics(summon);
            this.enemies.push(summon);
        }
    }

    // Peso do impacto. Hit-stop e shake vêm da DEFINIÇÃO do golpe (o
    // finalizador do combo trava mais que o primeiro golpe), em vez de dois
    // números fixos que davam a mesma sensação a tudo.
    private applyImpactFeel(feel: { hitStopMs?: number; shakeMs?: number; shakeIntensity?: number }) {
        const hitStop = feel.hitStopMs ?? 50;
        if (hitStop > 0) {
            this.physics.world.pause();
            this.time.delayedCall(hitStop, () => this.physics.world.resume());
        }

        this.cameras.main.shake(feel.shakeMs ?? 90, feel.shakeIntensity ?? 0.004);
    }
    // === [/A] ===

    // Resolve um impacto de golpe: garante que cada inimigo só recebe o golpe uma
    // vez e coordena dano, knockback e os efeitos de game feel (hit-stop e shake).
    private handleImpact(hitbox: MeleeHitbox, enemy: BaseEnemy) {
        const attack = this.player.combat.activeAttackDefinition;
        if (!attack) {
            return;
        }

        if (this.player.combat.hasTargetBeenHit(enemy)) {
            return;
        }

        // A hitbox é um retângulo à frente do jogador e não conhece o cenário:
        // encostado numa parede, ela invade o outro lado. Sem esta checagem o
        // golpe atravessava a parede e acertava quem estava atrás dela.
        if (isPathBlocked(this, this.player.x, this.player.y, enemy.x, enemy.y)) {
            return;
        }

        // Converte a definição do ataque numa fonte de dano para o sistema de
        // Health, preservando o comportamento anterior de dano e knockback.
        const source: DamageSource = {
            amount: attack.damage,
            kind: 'physical',
            knockbackX: attack.knockbackX,
            knockbackY: attack.knockbackY
        };

        const applied = enemy.takeHit(source, hitbox.hitDirection);
        if (applied <= 0) {
            return;
        }

        this.player.combat.markTargetHit(enemy);

        // === [A: combate] ===
        // O peso vem da DEFINIÇÃO do golpe: o finalizador do combo trava e
        // sacode mais que o primeiro. Os dois números fixos que estavam aqui
        // davam a mesma sensação a tudo.
        this.applyImpactFeel(attack);
        // === [/A] ===
    }

    // Dano por contato: o jogador recebe o dano do inimigo ao encostar nele.
    private handleContactDamage(enemy: BaseEnemy) {
        if (!enemy.isAlive) {
            return;
        }

        const direction = this.player.x >= enemy.x ? 1 : -1;
        // Passa o inimigo como atacante: defender no instante em que ele
        // encosta também deve revidar, não só contra o golpe deliberado.
        this.player.takeDamage(enemy.contactDamage, direction, enemy);
    }

    // Reinicia a fase após a morte do jogador, com um breve fade-out.
    private handlePlayerDeath() {
        const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';

        // Espera a animação de morte (6 frames a 10fps = 600ms) antes de
        // começar o fade. Iniciando junto, o escurecimento comia a animação
        // pela metade e a morte passava sem ser vista.
        this.time.delayedCall(DEATH_ANIMATION_MS, () => {
            this.cameras.main.fadeOut(420, 0, 0, 0, () => {
                if (difficulty === 'hard') {
                    clearSave();
                    this.scene.start(PHASES[0].key, { spawnX: PHASE_START_X });
                    return;
                }

                // Respawn no INÍCIO da fase, no mesmo ponto em que se entra
                // por ela vindo do portal anterior — não no meio.
                this.scene.restart({ spawnX: PHASE_START_X });
            });
        });
    }

    private refreshHudHp() {
        const hp = this.player.currentHp;
        if (hp === this.lastHp) {
            return;
        }

        this.lastHp = hp;
        this.hpHearts.clear();
        for (let index = 0; index < this.player.maxHp; index++) {
            drawIcon(
                this.hpHearts,
                index < hp ? 'heart' : 'heartEmpty',
                HUD_PANEL.x + 30 + index * 24,
                HUD_PANEL.y + 60,
                20
            );
        }
    }

    private buildPhysics() {
        // Chão sólido da fase.
        const ground = this.add.rectangle(0, GROUND_Y, this.phaseWidth, HEIGHT - GROUND_Y, 0x294b35);
        ground.setOrigin(0, 0);
        ground.setAlpha(0);
        this.physics.add.existing(ground, true);

        // Muros invisíveis nas bordas da fase (só dá para sair pelo portal).
        const leftWall = this.add.rectangle(0, 0, 30, HEIGHT, 0x000000);
        leftWall.setOrigin(0.5, 0);
        leftWall.setAlpha(0);
        this.physics.add.existing(leftWall, true);

        const rightWall = this.add.rectangle(this.phaseWidth, 0, 30, HEIGHT, 0x000000);
        rightWall.setOrigin(0.5, 0);
        rightWall.setAlpha(0);
        this.physics.add.existing(rightWall, true);

        // Plataformas extras entram nos colliders estáticos da cena. O dado da
        // definição permite distinguir plataformas one-way na criação dos
        // colliders e também será reutilizado pela escalada de paredes.
        for (const platform of this.phase.platforms ?? []) {
            const rect = this.add.rectangle(
                platform.x,
                platform.y,
                platform.width,
                platform.height,
                0x000000
            );
            rect.setOrigin(0, 0);
            rect.setAlpha(0);
            rect.setData('platformDef', platform);
            this.physics.add.existing(rect, true);
        }
    }

    private buildPortals() {
        // Portal no fim da fase -> próxima fase.
        if (this.phaseIndex < PHASES.length - 1) {
            const bx = this.phaseWidth - 120;
            const sprite = this.createPortalSprite(bx);
            // === [B: mundo/vila] ===
            // Na zona segura o portal já nasce liberado — e precisa PARECER
            // liberado, senão o jogador nem tenta atravessar.
            if (this.phase.safeZone) {
                sprite.play('portal-active-loop');
            }
            // === [/B] ===
            this.portals.push({
                zoneX: bx,
                targetKey: PHASES[this.phaseIndex + 1].key,
                spawnX: 200,
                direction: 1,
                // === [B: mundo/vila] ===
                // Zona segura (vila) não tem inimigo, e "limpa" é medido por
                // matar todos: exigir isso trancaria o jogador nela para
                // sempre. Ver PhaseDefinition.safeZone.
                requiresClear: !this.phase.safeZone,
                // === [/B] ===
                sprite
            });
        }

        // Portal no início da fase -> fase anterior.
        if (this.phaseIndex > 0) {
            const bx = 120;
            const sprite = this.createPortalSprite(bx);
            sprite.play('portal-active-loop');
            this.portals.push({
                zoneX: bx,
                targetKey: PHASES[this.phaseIndex - 1].key,
                spawnX: this.phaseWidth - 200,
                direction: -1,
                requiresClear: false,
                sprite
            });
        }
    }

    private createPortalSprite(bx: number): GameObjects.Sprite {
        return this.add
            .sprite(bx, GROUND_Y +200, 'portal-activate', 0)
            .setOrigin(0.5, 1)
            .setDepth(4);
    }

    private unlockExitPortal() {
        const exitPortal = this.portals.find(portal => portal.requiresClear);
        if (!exitPortal) {
            return;
        }

        const sprite = exitPortal.sprite;
        sprite.play('portal-activating');

        // Ao concluir a sequência de ativação, mantém o vórtice vivo nos
        // frames finais em vez de congelar no último frame.
        sprite.once('animationcomplete-portal-activating', () => {
            sprite.play('portal-active-loop');
        });
    }

    private handlePortals() {
        if (this.teleporting) {
            return;
        }

        const px = this.player.x;
        const velocityX = (this.player.body as Physics.Arcade.Body).velocity.x;

        for (const portal of this.portals) {
            if (portal.requiresClear && !this.phaseCleared) {
                continue;
            }

            const isMovingIntoPortal = velocityX * portal.direction > 0;

            // O sentido evita que o ponto de surgimento (perto do portal de
            // retorno) dispare uma nova troca de fase imediatamente.
            if (Math.abs(px - portal.zoneX) < 58 && isMovingIntoPortal) {
                this.teleportTo(portal);
                break;
            }
        }
    }

    private teleportTo(portal: Portal) {
        if (this.teleporting) {
            return;
        }

        this.teleporting = true;
        this.player.setControlsEnabled(false);

        this.cameras.main.fadeOut(220, 0, 0, 0, () => {
            this.scene.start(portal.targetKey, { spawnX: portal.spawnX });
        });
    }

    private createHud() {
        // Tábua de madeira com o nome da fase num pergaminho; os corações vão
        // logo abaixo e o CombatHud completa com mana e arma.
        const ui = this.add.graphics().setDepth(30).setScrollFactor(0);
        drawWoodFrame(ui, HUD_PANEL.x, HUD_PANEL.y, HUD_PANEL.width, HUD_PANEL.height);
        drawParchment(ui, HUD_PANEL.x + 10, HUD_PANEL.y + 10, HUD_PANEL.width - 20, 30);

        const nameText = this.add
            .text(HUD_PANEL.x + HUD_PANEL.width / 2, HUD_PANEL.y + 25, this.phase.name, uiText(17, UI_CSS.ink))
            .setOrigin(0.5)
            .setDepth(31)
            .setScrollFactor(0);

        // Corações por blocos, redesenhados só quando a vida muda.
        this.hpHearts = this.add.graphics().setDepth(31).setScrollFactor(0);
        this.lastHp = -1;

        // A lista completa de controles fica na pausa; aqui só o caminho até ela.
        this.controlsText = this.add
            .text(this.scale.width - 24, 22, 'M mapa  ·  ESC pausa e controles', uiTextOutlined(14))
            .setOrigin(1, 0)
            .setDepth(31)
            .setScrollFactor(0);

        this.hudObjects.push(ui, nameText, this.hpHearts, this.controlsText);

        // Gema do dash sobre a cabeça: verde pronta, âmbar recarregando.
        this.dashIndicator = this.add
            .rectangle(this.player.x, this.player.y - 60, 9, 9, 0x4ade80)
            .setAngle(45)
            .setDepth(21)
            .setStrokeStyle(2, 0x1a0f08, 0.9);

        // === [A: combate] ===
        // Mana e arma dentro da mesma tábua. Entra em hudObjects pelo mesmo
        // motivo que o resto: o reflexo do lago captura a cena e não pode
        // reproduzir HUD dentro d'água.
        this.combatHud = new CombatHud(this, this.player);
        this.hudObjects.push(...this.combatHud.gameObjects);
        // === [/A] ===

        // === [C: itens/economia] ===
        // A barra de inventário nasce no create do EconomySystem, antes desta
        // lista existir — por isso ela entra aqui, e não lá.
        this.hudObjects.push(...this.economy.hudObjects);
        // === [/C] ===
    }

    private updateDashIndicator() {
        this.dashIndicator.setPosition(this.player.x, this.player.y - 60);
        this.dashIndicator.setFillStyle(
            this.player.dash.readiness === 'ready' ? 0x4ade80 : 0xfbbf24
        );
    }

    private createMapOverlay() {
        this.mapKey = this.input.keyboard!.addKey(Input.Keyboard.KeyCodes.M);

        // Pergaminho da jornada (ver ui/WorldMapOverlay.ts).
        this.worldMap = new WorldMapOverlay(this, PHASES);
        this.refreshMapNodes();
        this.updateMapMarker();
    }

    private createPauseOverlay() {
        this.pausePanelGraphics = this.add.graphics().setScrollFactor(0).setDepth(101);
        this.pauseTitle = this.add
            .text(0, 0, 'PAUSADO', uiText(30, UI_CSS.ink))
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(102);
        // Duas colunas (ação e tecla): a fonte pixel não é monoespaçada, então
        // alinhar com espaços no mesmo texto não funcionaria.
        this.pauseLabels = this.add
            .text(0, 0, PAUSE_CONTROLS.map(([label]) => label).join('\n'), uiText(15, UI_CSS.inkSoft, { lineSpacing: 8 }))
            .setScrollFactor(0)
            .setDepth(102);
        this.pauseKeys = this.add
            .text(0, 0, PAUSE_CONTROLS.map(([, keys]) => keys).join('\n'), uiText(15, UI_CSS.ink, { lineSpacing: 8 }))
            .setScrollFactor(0)
            .setDepth(102);
        this.pauseHint = this.add
            .text(0, 0, 'ESC para continuar', uiText(13, UI_CSS.inkSoft))
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(102);

        this.pausePanel = this.add
            .container(0, 0, [this.pausePanelGraphics, this.pauseTitle, this.pauseLabels, this.pauseKeys, this.pauseHint])
            .setDepth(101)
            .setVisible(false);
        this.repositionPauseOverlay();
    }

    private togglePause() {
        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            this.physics.world.pause();
            this.time.paused = true;
            this.pausePanel.setVisible(true);
            return;
        }

        this.physics.world.resume();
        this.time.paused = false;
        this.pausePanel.setVisible(false);
    }

    private refreshMapNodes() {
        const save = loadSave();
        const reachedPhase = Math.max(this.phaseIndex, save?.phaseIndex ?? 0);
        const clearedPhases = new Set(save?.clearedPhases ?? []);
        if (this.phaseCleared) {
            clearedPhases.add(this.phaseIndex);
        }

        const states = PHASES.map((_, index): MapPhaseState =>
            index > reachedPhase ? 'locked' : clearedPhases.has(index) ? 'cleared' : 'reached'
        );
        this.worldMap.refresh(states);
    }

    // Captura a metade superior da cena e a exibe invertida na metade inferior.
    // O RenderTexture NÃO pode nascer dentro do create(): no Phaser 4 ele sai de
    // lá com o framebuffer inutilizável — entra no display list, fica visível,
    // não dá erro nenhum e desenha NADA (testado: um RT idêntico criado um frame
    // depois desenha normalmente). Por isso a criação é preguiçosa, no primeiro
    // update, e o resize destrói em vez de redimensionar.
    private setupLakeReflection(): GameObjects.RenderTexture {
        const width = this.scale.width;
        const height = HEIGHT - FOREST_WATER_TOP_Y;
        const rt = this.add.renderTexture(0, FOREST_WATER_TOP_Y, width, height);
        rt.setOrigin(0, 0);
        // Fixo na horizontal (a captura já acompanha scrollX) e ancorado ao
        // mundo na vertical, onde a superfície da água de fato está.
        rt.setScrollFactor(0, 1);
        rt.setFlipY(true);
        rt.setAlpha(0.85);
        // Fica acima da base azul (0.5), mas abaixo da borda/espuma (0.6),
        // preservando visualmente a transição entre terreno e água.
        rt.setDepth(0.55);

        this.lakeReflection = rt;
        this.scale.off('resize', this.resizeLakeReflection, this);
        this.scale.on('resize', this.resizeLakeReflection, this);

        return rt;
    }

    private resizeLakeReflection() {
        // Descarta e deixa o próximo frame recriar no tamanho novo: `resize()`
        // mantém o mesmo framebuffer, e é justamente ele que não sobrevive.
        this.lakeReflection?.destroy();
        this.lakeReflection = undefined;
    }

    private updateLakeReflection() {
        const rt = this.lakeReflection ?? this.setupLakeReflection();
        const camera = this.cameras.main;

        rt.clear();
        // A captura sai da faixa imediatamente ACIMA da linha d'água, com a
        // mesma altura da poça. Capturar a partir do topo do mundo (que era o
        // que estava aqui) só funcionava por acidente, quando a água ocupava
        // metade da tela: com ela em um terço, o espelho passou a refletir o
        // CÉU — os 216px de cima do mundo — e a água virou um azul chapado.
        const waterHeight = HEIGHT - FOREST_WATER_TOP_Y;
        rt.camera.setScroll(camera.scrollX, FOREST_WATER_TOP_Y - waterHeight);

        // Roda todo frame: o conjunto de exclusão só é remontado quando o RT
        // muda (resize), em vez de alocar Set + spread a cada frame.
        if (this.lakeReflectionExcludedFor !== rt) {
            this.lakeReflectionExcluded = new Set<GameObjects.GameObject>([
                rt,
                this.dashIndicator,
                ...this.hudObjects,
                ...this.worldMap.gameObjects,
                this.pausePanel
            ]);
            this.lakeReflectionExcludedFor = rt;
        }
        const excluded = this.lakeReflectionExcluded;
        this.lakeReflectionDrawList.length = 0;
        for (const object of this.children.list) {
            if (!excluded.has(object)) {
                this.lakeReflectionDrawList.push(object);
            }
        }
        rt.draw(this.lakeReflectionDrawList);
        // No Phaser 4, draw apenas grava comandos. render os aplica ao
        // framebuffer; sem isso a RenderTexture fica transparente.
        rt.render();
    }

    private repositionResponsiveUI() {
        // O mapa se reposiciona sozinho (WorldMapOverlay escuta o resize).
        this.controlsText.x = this.scale.width - 24;
        this.repositionPauseOverlay();
    }

    private repositionPauseOverlay() {
        if (!this.pausePanelGraphics) {
            return;
        }

        const width = 560;
        const height = 440;
        const centerX = this.scale.width / 2;
        const left = centerX - width / 2;
        const top = Math.max(24, this.scale.height / 2 - height / 2);

        const g = this.pausePanelGraphics;
        g.clear();
        drawWoodFrame(g, left - 12, top - 12, width + 24, height + 24);
        drawParchment(g, left, top, width, height);
        g.fillStyle(UI_COLORS.parchmentEdge, 0.5).fillRect(left + 40, top + 62, width - 80, 2);

        this.pauseTitle.setPosition(centerX, top + 36);
        this.pauseLabels.setPosition(left + 48, top + 82);
        this.pauseKeys.setPosition(left + 200, top + 82);
        this.pauseHint.setPosition(centerX, top + height - 26);
    }

    private updateMapMarker() {
        const phaseProgress = Math.max(0, Math.min(1, this.player.x / this.phaseWidth));
        this.worldMap.updateMarker(this.phaseIndex, phaseProgress, this.phase.name);
    }

}
