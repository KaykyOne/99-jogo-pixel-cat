import { GameObjects, Geom, Input, Physics, Scene } from 'phaser';

// === [A: combate] ===
import { CombatHud } from '../combat/CombatHud';
import { MeleeHitbox } from '../combat/MeleeHitbox';
import { ProjectileManager } from '../combat/Projectile';
import { ProjectileTarget } from '../combat/types';
import { createBoss } from '../entities/bosses/boss-factory';
import { BossBase } from '../entities/bosses/BossBase';
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

type MapPhaseState = 'locked' | 'reached' | 'cleared';

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
    private mapOverlay!: GameObjects.Container;
    private mapMarker!: GameObjects.Star;
    private mapLocationText!: GameObjects.Text;
    private hpText!: GameObjects.Text;
    private lastHp = -1;
    private dashIndicator!: GameObjects.Arc;
    private controlsText!: GameObjects.Text;
    private mapPanel!: GameObjects.Graphics;
    private mapRoute!: GameObjects.Graphics;
    private mapTitle!: GameObjects.Text;
    private mapHint!: GameObjects.Text;
    private mapPhaseNodes: { icon: GameObjects.Graphics; label: GameObjects.Text; x: number }[] = [];
    private pausePanel!: GameObjects.Container;
    private pausePanelGraphics!: GameObjects.Graphics;
    private pauseTitle!: GameObjects.Text;
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
        this.mapPhaseNodes = [];
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
            this.events.off('combat:impact', this.applyImpactFeel, this);
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
            if (this.mapOverlay.visible) {
                this.mapOverlay.setVisible(false);
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

        if (Input.Keyboard.JustDown(this.mapKey)) {
            this.mapOverlay.setVisible(!this.mapOverlay.visible);
            if (this.mapOverlay.visible) {
                this.refreshMapNodes();
            }
        }

        if (this.mapOverlay.visible) {
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
                { type: 'spider', x: 500, minX: 300, maxX: 700, count: 2 },
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
                { type: 'hedgehog', x: 450, minX: 250, maxX: 650 },
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
        boss.setPatrolRange(bossX - 260, bossX + 260);
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
        this.hpText.setText(this.heartString(hp, this.player.maxHp));
    }

    private heartString(current: number, max: number): string {
        return '♥'.repeat(current) + '♡'.repeat(Math.max(0, max - current));
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
        const ui = this.add.graphics().setDepth(30).setScrollFactor(0);
        ui.fillStyle(0x10212b, 0.75).fillRoundedRect(24, 22, 320, 74, 6);
        ui.lineStyle(2, 0xb8cc84, 0.55).strokeRoundedRect(24, 22, 320, 74, 6);

        const nameText = this.add
            .text(43, 45, this.phase.name, { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#f7e7b0' })
            .setDepth(31)
            .setScrollFactor(0);

        this.hpText = this.add
            .text(300, 50, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ff6b6b' })
            .setOrigin(1, 0)
            .setDepth(31)
            .setScrollFactor(0);
        this.lastHp = -1;

        const subtitleText = this.add
            .text(43, 72, this.phase.subtitle, { fontFamily: 'monospace', fontSize: '11px', color: '#9db68d' })
            .setDepth(31)
            .setScrollFactor(0);

        // === [B: mundo/vila] === (só o trecho "·  E interagir" no fim da linha)
        const controlsHint =
            'A/D mover  ·  W pular  ·  F atacar  ·  Q segurar p/ defender  ·  Espaço dash  ·  Shift na parede: escalar  ·  E interagir';
        // === [/B] ===

        this.controlsText = this.add
            .text(this.scale.width - 44, 30, controlsHint, {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#c0d9b1'
            })
            .setOrigin(1, 0)
            .setDepth(31)
            .setScrollFactor(0);

        this.hudObjects.push(ui, nameText, this.hpText, subtitleText, this.controlsText);

        this.dashIndicator = this.add
            .circle(this.player.x, this.player.y - 60, 6, 0x4ade80)
            .setDepth(21)
            .setStrokeStyle(2, 0xffffff, 0.6);

        // === [A: combate] ===
        // Encosta logo abaixo do painel de vida (PANEL_Y = 104, contra os 22+74
        // deste) para os dois lerem como um bloco único de informação. Entra em
        // hudObjects pelo mesmo motivo que o resto: o reflexo do lago captura a
        // cena e não pode reproduzir HUD dentro d'água.
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

        this.mapPanel = this.add.graphics();

        this.mapTitle = this.add
            .text(0, 154, 'MAPA DO MUNDO', { fontFamily: 'Georgia, serif', fontSize: '30px', color: '#f7e7b0' })
            .setOrigin(0.5);
        this.mapHint = this.add
            .text(0, 194, 'Pressione M para fechar', { fontFamily: 'monospace', fontSize: '13px', color: '#b9cbb1' })
            .setOrigin(0.5);

        this.mapRoute = this.add.graphics();
        const mapY = 365;

        const children: GameObjects.GameObject[] = [this.mapPanel, this.mapTitle, this.mapHint, this.mapRoute];
        PHASES.forEach((phase) => {
            const icon = this.add.graphics();
            const label = this.add
                .text(0, mapY + 39, phase.name, {
                    fontFamily: 'monospace', fontSize: '10px', color: '#b9cbb1',
                    align: 'center', wordWrap: { width: 100 }
                })
                .setOrigin(0.5, 0);
            this.mapPhaseNodes.push({ icon, label, x: 0 });
            children.push(icon, label);
        });

        this.mapMarker = this.add.star(0, mapY, 5, 5, 11, 0xff6b4a).setStrokeStyle(2, 0xfff2c2);
        this.mapLocationText = this.add
            .text(0, 535, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
            .setOrigin(0.5);
        children.push(this.mapMarker, this.mapLocationText);

        this.mapOverlay = this.add.container(0, 0, children).setDepth(100).setScrollFactor(0).setVisible(false);
        this.tweens.add({
            targets: this.mapMarker,
            scale: 1.15,
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });
        this.repositionResponsiveUI();
        this.refreshMapNodes();
        this.updateMapMarker();
    }

    private createPauseOverlay() {
        this.pausePanelGraphics = this.add.graphics().setScrollFactor(0).setDepth(101);
        this.pauseTitle = this.add
            .text(0, 340, 'PAUSADO', {
                fontFamily: 'Georgia, serif',
                fontSize: '28px',
                color: '#f7e7b0'
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(102);
        this.pauseHint = this.add
            .text(0, 400, 'ESC para continuar', {
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#b9cbb1'
            })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(102);

        this.pausePanel = this.add
            .container(0, 0, [this.pausePanelGraphics, this.pauseTitle, this.pauseHint])
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

        this.mapPhaseNodes.forEach(({ icon, label, x }, index) => {
            const state: MapPhaseState = index > reachedPhase
                ? 'locked'
                : clearedPhases.has(index)
                    ? 'cleared'
                    : 'reached';

            this.drawMapPhaseIcon(icon, x, 365, PHASES[index].key, state);
            label.setColor(state === 'locked' ? '#66707a' : state === 'cleared' ? '#f7e7b0' : '#b9cbb1');
            label.setAlpha(state === 'locked' ? 0.5 : 1);
        });
    }

    private drawMapPhaseIcon(
        graphics: GameObjects.Graphics,
        x: number,
        y: number,
        phaseKey: string,
        state: MapPhaseState
    ) {
        const isLocked = state === 'locked';
        const color = isLocked ? 0x3a3a3a : this.mapBiomeColor(phaseKey);

        graphics.clear();
        graphics.setAlpha(isLocked ? 0.5 : 1);
        graphics.fillStyle(color, 1);
        graphics.lineStyle(2, isLocked ? 0x59616b : 0x10212b, 0.95);

        switch (phaseKey) {
            // === [B: mundo/vila] ===
            // Casinha. Sem este case a vila ficaria com ícone invisível no
            // mapa: o switch não tem default.
            case 'village':
                graphics.fillRect(x - 12, y - 4, 24, 18);
                graphics.strokeRect(x - 12, y - 4, 24, 18);
                graphics.fillTriangle(x - 16, y - 4, x + 16, y - 4, x, y - 18);
                graphics.strokeTriangle(x - 16, y - 4, x + 16, y - 4, x, y - 18);
                graphics.fillStyle(isLocked ? 0x3a3a3a : 0x4a3524, 1);
                graphics.fillRect(x - 4, y + 4, 8, 10);
                break;
            // === [/B] ===
            case 'forest':
                graphics.fillTriangle(x, y - 17, x - 12, y + 9, x + 12, y + 9);
                graphics.fillRect(x - 3, y + 7, 6, 7);
                graphics.strokeTriangle(x, y - 17, x - 12, y + 9, x + 12, y + 9);
                break;
            case 'desert':
                graphics.fillTriangle(x, y - 14, x - 14, y, x + 14, y);
                graphics.fillTriangle(x, y + 14, x - 14, y, x + 14, y);
                graphics.strokeTriangle(x, y - 14, x - 14, y, x + 14, y);
                graphics.strokeTriangle(x, y + 14, x - 14, y, x + 14, y);
                break;
            case 'snow':
                graphics.fillCircle(x, y, 12);
                graphics.lineStyle(2, isLocked ? 0x59616b : 0xffffff, 0.9);
                graphics.lineBetween(x - 14, y, x + 14, y);
                graphics.lineBetween(x, y - 14, x, y + 14);
                graphics.lineBetween(x - 10, y - 10, x + 10, y + 10);
                graphics.lineBetween(x + 10, y - 10, x - 10, y + 10);
                break;
            case 'cave':
                graphics.fillTriangle(x, y - 15, x - 14, y + 10, x + 14, y + 10);
                graphics.fillTriangle(x, y + 15, x - 14, y - 10, x + 14, y - 10);
                graphics.strokeTriangle(x, y - 15, x - 14, y + 10, x + 14, y + 10);
                graphics.strokeTriangle(x, y + 15, x - 14, y - 10, x + 14, y - 10);
                break;
            case 'volcano':
                graphics.fillTriangle(x, y - 16, x - 15, y + 12, x + 15, y + 12);
                graphics.strokeTriangle(x, y - 16, x - 15, y + 12, x + 15, y + 12);
                graphics.fillStyle(isLocked ? 0x3a3a3a : 0xffc847, 1).fillCircle(x, y + 3, 4);
                break;
            case 'ruins':
                graphics.fillRect(x - 7, y - 15, 14, 30);
                graphics.fillRect(x - 11, y - 15, 22, 5);
                graphics.strokeRect(x - 7, y - 15, 14, 30);
                break;
        }

        if (state === 'cleared') {
            graphics.lineStyle(2, 0xf7e7b0, 1).strokeCircle(x, y, 20);
            graphics.lineBetween(x - 7, y + 1, x - 1, y + 7);
            graphics.lineBetween(x - 1, y + 7, x + 10, y - 7);
        }
    }

    private mapBiomeColor(phaseKey: string): number {
        switch (phaseKey) {
            // === [B: mundo/vila] ===
            case 'village': return 0xc9a227;
            // === [/B] ===
            case 'forest': return 0x4f9b5a;
            case 'desert': return 0xe0b15c;
            case 'snow': return 0x9ed6f5;
            case 'cave': return 0x9a7bc0;
            case 'volcano': return 0xe2683c;
            case 'ruins': return 0xa8a286;
            default: return 0x6f8b71;
        }
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

        const excluded = new Set<GameObjects.GameObject>([
            rt,
            this.dashIndicator,
            ...this.hudObjects,
            this.mapOverlay,
            this.pausePanel
        ]);
        const toDraw = this.children.list.filter(object => !excluded.has(object));
        rt.draw(toDraw);
        // No Phaser 4, draw apenas grava comandos. render os aplica ao
        // framebuffer; sem isso a RenderTexture fica transparente.
        rt.render();
    }

    private repositionResponsiveUI() {
        this.controlsText.x = this.scale.width - 44;

        const centerX = this.scale.width / 2;
        const panelX = centerX - 400;
        const mapStartX = centerX - 324;
        const mapEndX = centerX + 324;
        const mapY = 365;
        const segmentWidth = (mapEndX - mapStartX) / (PHASES.length - 1);

        this.mapPanel.clear();
        this.mapPanel.fillStyle(0x08111d, 0.94).fillRoundedRect(panelX, 118, 800, 532, 14);
        this.mapPanel.lineStyle(2, 0xb8cc84, 0.85).strokeRoundedRect(panelX, 118, 800, 532, 14);

        this.mapRoute.clear();
        this.mapRoute.fillStyle(0x3e5266, 1);
        for (let x = mapStartX; x <= mapEndX; x += 14) {
            this.mapRoute.fillCircle(x, mapY, 3);
        }
        this.mapRoute.fillStyle(0xc8d897, 0.72);
        for (let x = mapStartX + 3; x <= mapEndX; x += 14) {
            this.mapRoute.fillCircle(x, mapY, 1);
        }

        this.mapTitle.x = centerX;
        this.mapHint.x = centerX;
        this.mapLocationText.x = centerX;

        this.mapPhaseNodes.forEach((entry, index) => {
            const x = mapStartX + segmentWidth * index;
            entry.x = x;
            entry.label.x = x;
        });

        this.refreshMapNodes();
        this.repositionPauseOverlay();
        this.updateMapMarker();
    }

    private repositionPauseOverlay() {
        if (!this.pausePanelGraphics) {
            return;
        }

        const centerX = this.scale.width / 2;
        const panelX = centerX - 150;

        this.pausePanelGraphics.clear();
        this.pausePanelGraphics.fillStyle(0x08111d, 0.92).fillRoundedRect(panelX, 284, 300, 200, 14);
        this.pausePanelGraphics.lineStyle(2, 0xb8cc84, 0.85).strokeRoundedRect(panelX, 284, 300, 200, 14);
        this.pauseTitle.x = centerX;
        this.pauseHint.x = centerX;
    }

    private updateMapMarker() {
        const centerX = this.scale.width / 2;
        const mapStartX = centerX - 324;
        const mapEndX = centerX + 324;
        const phaseProgress = Math.max(0, Math.min(1, this.player.x / this.phaseWidth));
        const worldProgress = (this.phaseIndex + phaseProgress) / (PHASES.length - 1);

        this.mapMarker.x = mapStartX + (mapEndX - mapStartX) * worldProgress;
        this.mapLocationText.setText(`${this.phase.name} - ${Math.round(phaseProgress * 100)}% explorado`);
    }

}
