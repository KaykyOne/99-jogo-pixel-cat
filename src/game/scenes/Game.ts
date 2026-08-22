import { GameObjects, Geom, Input, Physics, Scene } from 'phaser';

import { MeleeHitbox } from '../combat/MeleeHitbox';
import { DamageSource } from '../damage/damage';
import { EnemyType } from '../damage/health-config';
import { BaseEnemy } from '../entities/BaseEnemy';
import { Boss } from '../entities/Boss';
import { createEnemy } from '../entities/enemy-factory';
import { Player } from '../entities/Player';
import { clearSave, Difficulty, loadSave, writeSave } from '../state/save';
import { isPathBlocked, setLineOfSightBlockers } from '../world/line-of-sight';
import {
    drawPlatforms,
    FOREST_WATER_TOP_Y,
    GROUND_Y,
    HEIGHT,
    PHASES,
    PHASE_WIDTH,
    PhaseDefinition,
    PlatformDef
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
};

export class PhaseScene extends Scene {
    private phase: PhaseDefinition;
    private phaseIndex: number;

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

    // Textura espelhada do lago, criada apenas na floresta.
    private lakeReflection?: GameObjects.RenderTexture;
    // Objetos de HUD que o espelho não pode capturar (senão o painel de vida
    // apareceria refletido dentro da água).
    private hudObjects: GameObjects.GameObject[] = [];

    constructor(phase: PhaseDefinition, phaseIndex: number) {
        super(phase.key);

        this.phase = phase;
        this.phaseIndex = phaseIndex;
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

        const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';
        writeSave({
            phaseIndex: this.phaseIndex,
            difficulty,
            clearedPhases: loadSave()?.clearedPhases ?? []
        });

        // Mundo plano de 768px em todas as fases: o terreno simplificado não
        // tem mais nada acima do topo da tela.
        this.physics.world.setBounds(0, 0, PHASE_WIDTH, HEIGHT);
        // Uma gravidade mais firme deixa os saltos responsivos sem o personagem
        // parecer flutuar.
        this.physics.world.gravity.y = 1400;

        // Esta cena desenha APENAS a sua própria fase (x0 = 0).
        this.phase.draw(this, 0);
        drawPlatforms(this, this.phase);

        this.buildPhysics();

        const spawnX =
            data && typeof data.spawnX === 'number' ? data.spawnX : PHASE_WIDTH / 2;

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
        this.physics.add.collider(this.player, solidColliders, (_playerObj, wallObj) => {
            const wall = wallObj as GameObjects.GameObject;
            if (!platformDefOf(wall)?.climbable) {
                return;
            }

            const wallBody = wall.body as Physics.Arcade.StaticBody;
            const playerBody = this.player.body as Physics.Arcade.Body;
            const direction = wallBody.center.x < playerBody.center.x ? -1 : 1;
            this.player.climb.markTouchingWall(direction, wallBody.top);
        });
        this.physics.add.collider(this.player, oneWayColliders, undefined, canLandOnOneWay);

        this.spawnEnemies();
        this.spawnBoss();

        for (const enemy of this.enemies) {
            this.physics.add.collider(enemy, solidColliders);
            this.physics.add.collider(enemy, oneWayColliders, undefined, canLandOnOneWay);
            this.physics.add.collider(
                this.player,
                enemy,
                () => this.handleContactDamage(enemy),
                // false evita dano e separação física durante o dash.
                () => !this.player.dash.isDashing,
                this
            );
        }

        // Reinicia a fase quando o jogador morre.
        this.player.once('player-died', () => this.handlePlayerDeath());

        this.buildPortals();
        this.createHud();
        this.createMapOverlay();
        this.createPauseOverlay();

        this.pauseKey = this.input.keyboard!.addKey(Input.Keyboard.KeyCodes.ESC);

        const camera = this.cameras.main;
        camera.setBounds(0, 0, PHASE_WIDTH, HEIGHT);
        camera.startFollow(this.player, true, 0.1, 0.1);
        camera.fadeIn(220, 0, 0, 0);

        if (this.phase.key === 'forest') {
            this.setupLakeReflection();
        }

        // A escala pode mudar enquanto a cena continua ativa. Remove antes de
        // registrar porque scene.restart reutiliza esta mesma instância.
        this.scale.off('resize', this.repositionResponsiveUI, this);
        this.scale.on('resize', this.repositionResponsiveUI, this);
        this.events.once('shutdown', () => {
            this.scale.off('resize', this.repositionResponsiveUI, this);
            this.scale.off('resize', this.resizeLakeReflection, this);
        });
    }

    update(time: number, delta: number) {
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

        this.player.update(time, delta);
        this.refreshHudHp();
        this.updateDashIndicator();

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
            writeSave({ phaseIndex: this.phaseIndex, difficulty, clearedPhases });
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

        if (this.lakeReflection) {
            this.updateLakeReflection();
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
                { type: 'graverobber', x: 500, minX: 300, maxX: 700 },
                // Sobre o degrau de 1 STEP (x 760..980, topo 284).
                { type: 'graverobber', x: 870, y: 204, minX: 800, maxX: 940 },
                // Sobre o monte de 1 STEP após o vão longo (x 1500..1680, topo 284).
                { type: 'graverobber', x: 1590, y: 204, minX: 1540, maxX: 1640 }
            ],
            desert: [
                { type: 'steamman', x: 450, minX: 250, maxX: 650 },
                { type: 'steamman', x: 1520, minX: 1320, maxX: 1780 }
            ],
            snow: [
                { type: 'graverobber', x: 400, minX: 220, maxX: 600 },
                { type: 'graverobber', x: 1420, minX: 1240, maxX: 1700 }
            ],
            cave: [
                { type: 'graverobber', x: 400, minX: 220, maxX: 580 },
                { type: 'steamman', x: 1400, minX: 1180, maxX: 1660 }
            ],
            volcano: [
                { type: 'steamman', x: 400, minX: 220, maxX: 620 },
                { type: 'steamman', x: 1150, minX: 980, maxX: 1340 }
            ],
            ruins: [
                { type: 'graverobber', x: 400, minX: 220, maxX: 600 },
                { type: 'steamman', x: 1300, minX: 1220, maxX: 1700 },
                // Sobre o degrau de 1 STEP (x 1760..2000, topo 284).
                { type: 'steamman', x: 1880, y: 204, minX: 1800, maxX: 1960 }
            ]
        };

        const phaseSpawns = spawns[this.phase.key] ?? [];

        for (const spawn of phaseSpawns) {
            // Spawns sem Y explícito preservam a altura original do chão.
            // Spawns elevados devem informar minX/maxX conforme a plataforma
            // onde estão, pois a patrulha não detecta bordas automaticamente.
            const y = spawn.y ?? GROUND_Y - 80;
            const enemy = createEnemy(this, spawn.type, spawn.x, y, this.player);

            enemy.setDepth(15);

            if (spawn.minX !== undefined && spawn.maxX !== undefined) {
                enemy.setPatrolRange(spawn.minX, spawn.maxX);
            }

            this.enemies.push(enemy);
        }
    }

    private spawnBoss() {
        const bossByPhase: Record<string, EnemyType> = {
            forest: 'graverobber',
            desert: 'steamman',
            snow: 'graverobber',
            cave: 'steamman',
            volcano: 'steamman',
            ruins: 'graverobber'
        };

        const type = bossByPhase[this.phase.key];
        if (!type) {
            return;
        }

        const bossX = PHASE_WIDTH - 420;
        // O boss usa escala 5 (em vez de 3 dos inimigos comuns). Ajusta o
        // centro inicial para que o corpo ampliado comece apoiado no chão,
        // sem nascer enterrado nele.
        const boss = new Boss(this, bossX, GROUND_Y - 120, type, this.player);
        boss.setDepth(15);
        boss.setPatrolRange(bossX - 100, bossX + 100);
        this.enemies.push(boss);
    }

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

        // Hit-stop breve: congela a simulação para dar peso ao impacto.
        this.physics.world.pause();
        this.time.delayedCall(50, () => this.physics.world.resume());

        this.cameras.main.shake(90, 0.004);
    }

    // Dano por contato: o jogador recebe o dano do inimigo ao encostar nele.
    private handleContactDamage(enemy: BaseEnemy) {
        if (!enemy.isAlive) {
            return;
        }

        const direction = this.player.x >= enemy.x ? 1 : -1;
        this.player.takeDamage(enemy.contactDamage, direction);
    }

    // Reinicia a fase após a morte do jogador, com um breve fade-out.
    private handlePlayerDeath() {
        const difficulty = (this.registry.get('difficulty') as Difficulty) ?? 'normal';

        this.cameras.main.fadeOut(420, 0, 0, 0, () => {
            if (difficulty === 'hard') {
                clearSave();
                this.scene.start(PHASES[0].key, { spawnX: 200 });
                return;
            }

            this.scene.restart({ spawnX: PHASE_WIDTH / 2 });
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
        const ground = this.add.rectangle(0, GROUND_Y, PHASE_WIDTH, HEIGHT - GROUND_Y, 0x294b35);
        ground.setOrigin(0, 0);
        ground.setAlpha(0);
        this.physics.add.existing(ground, true);

        // Muros invisíveis nas bordas da fase (só dá para sair pelo portal).
        const leftWall = this.add.rectangle(0, 0, 30, HEIGHT, 0x000000);
        leftWall.setOrigin(0.5, 0);
        leftWall.setAlpha(0);
        this.physics.add.existing(leftWall, true);

        const rightWall = this.add.rectangle(PHASE_WIDTH, 0, 30, HEIGHT, 0x000000);
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
            const bx = PHASE_WIDTH - 120;
            const sprite = this.createPortalSprite(bx);
            this.portals.push({
                zoneX: bx,
                targetKey: PHASES[this.phaseIndex + 1].key,
                spawnX: 200,
                direction: 1,
                requiresClear: true,
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
                spawnX: PHASE_WIDTH - 200,
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

        this.controlsText = this.add
            .text(this.scale.width - 44, 30, 'A/D mover  ·  W pular  ·  F atacar  ·  Espaço dash  ·  A/D na parede + W/S escalar', {
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
    private setupLakeReflection() {
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
    }

    private resizeLakeReflection() {
        if (!this.lakeReflection) {
            return;
        }

        // RenderTexture possui um framebuffer próprio. setSize muda só a imagem
        // exibida; resize mantém a área de captura sincronizada ao viewport.
        this.lakeReflection.resize(this.scale.width, HEIGHT - FOREST_WATER_TOP_Y);
    }

    private updateLakeReflection() {
        const rt = this.lakeReflection!;
        const camera = this.cameras.main;

        rt.clear();
        // A captura sai do topo do mundo: é a faixa que o espelho reflete.
        rt.camera.setScroll(camera.scrollX, 0);

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
        const phaseProgress = Math.max(0, Math.min(1, this.player.x / PHASE_WIDTH));
        const worldProgress = (this.phaseIndex + phaseProgress) / (PHASES.length - 1);

        this.mapMarker.x = mapStartX + (mapEndX - mapStartX) * worldProgress;
        this.mapLocationText.setText(`${this.phase.name} - ${Math.round(phaseProgress * 100)}% explorado`);
    }

}
