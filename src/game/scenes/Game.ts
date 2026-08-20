import { Cameras, GameObjects, Input, Physics, Scene } from 'phaser';

import { MeleeHitbox } from '../combat/MeleeHitbox';
import { DamageSource } from '../damage/damage';
import { EnemyType } from '../damage/health-config';
import { BaseEnemy } from '../entities/BaseEnemy';
import { createEnemy } from '../entities/enemy-factory';
import { Player } from '../entities/Player';
import { FOREST_WATER_TOP_Y, GROUND_Y, HEIGHT, PHASES, PHASE_WIDTH, PhaseDefinition } from '../world/phases';

type Portal = {
    zoneX: number;
    targetKey: string;
    spawnX: number;
    direction: 1 | -1;
};

type SceneData = {
    spawnX: number;
};

export class PhaseScene extends Scene {
    private phase: PhaseDefinition;
    private phaseIndex: number;

    private player!: Player;
    private enemies: BaseEnemy[] = [];
    private portals: Portal[] = [];
    private teleporting = false;
    private mapKey!: Input.Keyboard.Key;
    private mapOverlay!: GameObjects.Container;
    private mapMarker!: GameObjects.Arc;
    private mapLocationText!: GameObjects.Text;
    private hpText!: GameObjects.Text;
    private lastHp = -1;
    private dashIndicator!: GameObjects.Arc;

    // Câmera do reflexo do lago (só existe na fase 'forest', ver
    // setupLakeReflection). Precisa ignorar HUD/mapa, por isso os elementos
    // de UI ficam guardados aqui conforme são criados.
    private reflectionCam?: Cameras.Scene2D.Camera;
    private hudObjects: GameObjects.GameObject[] = [];

    constructor(phase: PhaseDefinition, phaseIndex: number) {
        super(phase.key);

        this.phase = phase;
        this.phaseIndex = phaseIndex;
    }

    create(data: SceneData) {
        this.physics.world.setBounds(0, 0, PHASE_WIDTH, HEIGHT);
        // Uma gravidade mais firme deixa os saltos responsivos sem o personagem
        // parecer flutuar.
        this.physics.world.gravity.y = 1400;

        // Esta cena desenha APENAS a sua própria fase (x0 = 0).
        this.phase.draw(this, 0);

        this.buildPhysics();

        const spawnX =
            data && typeof data.spawnX === 'number' ? data.spawnX : PHASE_WIDTH / 2;

        this.player = new Player(this, spawnX, GROUND_Y - 80);
        this.player.setDepth(20);

        const colliders = Array.from(this.physics.world.staticBodies);

        // O jogador tamb\u00e9m precisa colidir com o ch\u00e3o e com as paredes da fase.
        // Sem este collider ele apenas ca\u00eda at\u00e9 o limite do mundo, o que fazia
        // pulo, movimento e encontros com inimigos parecerem quebrados.
        this.physics.add.collider(this.player, colliders);

        this.spawnEnemies();

        for (const enemy of this.enemies) {
            this.physics.add.collider(enemy, colliders);
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

        const camera = this.cameras.main;
        camera.setBounds(0, 0, PHASE_WIDTH, HEIGHT);
        camera.startFollow(this.player, true, 0.1, 0.1);
        camera.fadeIn(220, 0, 0, 0);

        if (this.phase.key === 'forest') {
            this.setupLakeReflection();
        }
    }

    update(time: number, delta: number) {
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

        this.handlePortals();

        if (Input.Keyboard.JustDown(this.mapKey)) {
            this.mapOverlay.setVisible(!this.mapOverlay.visible);
        }

        if (this.mapOverlay.visible) {
            this.updateMapMarker();
        }

        // A câmera do reflexo é um objeto à parte da câmera principal — ela não
        // segue o jogador sozinha, então o scroll horizontal é copiado todo
        // frame pra mostrar a mesma fatia do mundo, só que espelhada.
        if (this.reflectionCam) {
            this.reflectionCam.scrollX = this.cameras.main.scrollX;
        }
    }

    private spawnEnemies() {
        // Distribuição de inimigos por fase (key das fases).
        const spawns: Record<string, { type: EnemyType; x: number; minX?: number; maxX?: number }[]> = {
            forest: [
                { type: 'graverobber', x: 700 },
                { type: 'graverobber', x: 1500 }
            ],
            desert: [
                { type: 'steamman', x: 800 },
                { type: 'steamman', x: 1900 }
            ],
            snow: [
                { type: 'graverobber', x: 1000 },
                { type: 'graverobber', x: 2100 }
            ],
            cave: [
                { type: 'steamman', x: 900 },
                { type: 'graverobber', x: 1600 }
            ],
            volcano: [
                { type: 'steamman', x: 800 },
                { type: 'steamman', x: 1700 }
            ],
            ruins: [
                { type: 'graverobber', x: 900 },
                { type: 'steamman', x: 1500 },
                { type: 'steamman', x: 2200 }
            ]
        };

        const phaseSpawns = spawns[this.phase.key] ?? [];

        for (const spawn of phaseSpawns) {
            const enemy = createEnemy(this, spawn.type, spawn.x, GROUND_Y - 80, this.player);

            enemy.setDepth(15);

            if (spawn.minX !== undefined && spawn.maxX !== undefined) {
                enemy.setPatrolRange(spawn.minX, spawn.maxX);
            }

            this.enemies.push(enemy);
        }
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
        this.cameras.main.fadeOut(420, 0, 0, 0, () => {
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
    }

    private buildPortals() {
        // Portal no fim da fase -> próxima fase.
        if (this.phaseIndex < PHASES.length - 1) {
            const bx = PHASE_WIDTH - 120;
            this.drawPortalGate(bx);
            this.portals.push({
                zoneX: bx,
                targetKey: PHASES[this.phaseIndex + 1].key,
                spawnX: 200,
                direction: 1
            });
        }

        // Portal no início da fase -> fase anterior.
        if (this.phaseIndex > 0) {
            const bx = 120;
            this.drawPortalGate(bx);
            this.portals.push({
                zoneX: bx,
                targetKey: PHASES[this.phaseIndex - 1].key,
                spawnX: PHASE_WIDTH - 200,
                direction: -1
            });
        }
    }

    private drawPortalGate(bx: number) {
        const gate = this.add.graphics().setDepth(4);

        // Pilares de pedra.
        gate.fillStyle(0x6b5f52).fillRect(bx - 58, GROUND_Y - 150, 24, 150);
        gate.fillStyle(0x8a7c6b).fillRect(bx - 58, GROUND_Y - 150, 24, 12);
        gate.fillStyle(0x6b5f52).fillRect(bx + 34, GROUND_Y - 150, 24, 150);
        gate.fillStyle(0x8a7c6b).fillRect(bx + 34, GROUND_Y - 150, 24, 12);

        // Viga superior.
        gate.fillStyle(0x7d6f60).fillRect(bx - 64, GROUND_Y - 166, 128, 16);
        gate.fillStyle(0x5c5147).fillRect(bx - 64, GROUND_Y - 150, 128, 6);

        // Brilho do portal (pulsante).
        const glow = this.add.graphics().setDepth(5);
        glow.fillStyle(0x8ae7ff, 0.35);
        glow.fillEllipse(bx, GROUND_Y - 80, 54, 140);
        glow.fillStyle(0xd9f6ff, 0.5);
        glow.fillEllipse(bx, GROUND_Y - 80, 28, 108);

        this.tweens.add({
            targets: glow,
            alpha: 0.55,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });
    }

    private handlePortals() {
        if (this.teleporting) {
            return;
        }

        const px = this.player.x;
        const velocityX = (this.player.body as Physics.Arcade.Body).velocity.x;

        for (const portal of this.portals) {
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
        this.hudObjects.push(ui);

        const nameText = this.add
            .text(43, 45, this.phase.name, { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#f7e7b0' })
            .setDepth(31)
            .setScrollFactor(0);
        this.hudObjects.push(nameText);

        this.hpText = this.add
            .text(300, 50, '', { fontFamily: 'monospace', fontSize: '18px', color: '#ff6b6b' })
            .setOrigin(1, 0)
            .setDepth(31)
            .setScrollFactor(0);
        this.lastHp = -1;
        this.hudObjects.push(this.hpText);

        const subtitleText = this.add
            .text(43, 72, this.phase.subtitle, { fontFamily: 'monospace', fontSize: '11px', color: '#9db68d' })
            .setDepth(31)
            .setScrollFactor(0);
        this.hudObjects.push(subtitleText);

        const controlsText = this.add
            .text(980, 30, 'A/D mover  ·  W pular  ·  F atacar  ·  Espaço dash', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#c0d9b1'
            })
            .setOrigin(1, 0)
            .setDepth(31)
            .setScrollFactor(0);
        this.hudObjects.push(controlsText);

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

        const panel = this.add.graphics();
        panel.fillStyle(0x08111d, 0.94).fillRoundedRect(112, 118, 800, 532, 14);
        panel.lineStyle(2, 0xb8cc84, 0.85).strokeRoundedRect(112, 118, 800, 532, 14);

        const title = this.add
            .text(512, 154, 'MAPA DO MUNDO', { fontFamily: 'Georgia, serif', fontSize: '30px', color: '#f7e7b0' })
            .setOrigin(0.5);
        const hint = this.add
            .text(512, 194, 'Pressione M para fechar', { fontFamily: 'monospace', fontSize: '13px', color: '#b9cbb1' })
            .setOrigin(0.5);

        const route = this.add.graphics();
        const mapStartX = 188;
        const mapEndX = 836;
        const mapY = 365;
        const segmentWidth = (mapEndX - mapStartX) / (PHASES.length - 1);
        route.lineStyle(8, 0x3e5266, 1).lineBetween(mapStartX, mapY, mapEndX, mapY);
        route.lineStyle(2, 0xc8d897, 0.72).lineBetween(mapStartX, mapY, mapEndX, mapY);

        const children: GameObjects.GameObject[] = [panel, title, hint, route];
        PHASES.forEach((phase, index) => {
            const x = mapStartX + segmentWidth * index;
            const active = index === this.phaseIndex;
            const node = this.add.circle(x, mapY, active ? 16 : 12, active ? 0xf7e7b0 : 0x6f8b71);
            const label = this.add
                .text(x, mapY + 39, phase.name, {
                    fontFamily: 'monospace', fontSize: '10px', color: active ? '#f7e7b0' : '#b9cbb1',
                    align: 'center', wordWrap: { width: 100 }
                })
                .setOrigin(0.5, 0);
            children.push(node, label);
        });

        this.mapMarker = this.add.circle(mapStartX, mapY, 8, 0xff6b4a).setStrokeStyle(3, 0xfff2c2);
        this.mapLocationText = this.add
            .text(512, 535, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
            .setOrigin(0.5);
        children.push(this.mapMarker, this.mapLocationText);

        this.mapOverlay = this.add.container(0, 0, children).setDepth(100).setScrollFactor(0).setVisible(false);
        this.updateMapMarker();
    }

    // Reflexo "de verdade" do lago: uma segunda câmera olhando pra mesma cena
    // ao vivo (cenário, jogador, inimigos), espelhada verticalmente, desenhada
    // por cima da base d'água (ver drawWaterBase em phases.ts). Não é uma
    // imagem congelada — é o jogo rodando duas vezes.
    private setupLakeReflection() {
        const viewportY = FOREST_WATER_TOP_Y;
        const viewportHeight = HEIGHT - FOREST_WATER_TOP_Y;

        // Quanto de cenário (em px de mundo, medidos a partir do GROUND_Y pra
        // cima) cabe "amassado" dentro da faixa fina de água. Cobre a árvore/
        // casa inteira (450px, ver treesHeight em phases.ts) e ainda pega uma
        // fatia da montanha, em vez de só o pé do tronco.
        const reflectedWorldHeight = 550;

        const cam = this.cameras.add(0, viewportY, this.scale.width, viewportHeight);
        cam.setName('lake-reflection');

        // zoomX = 1: mesma largura de mundo que a câmera principal mostra (o
        // reflexo bate exatamente com o que está visível em cima, sem sobrar
        // nem faltar dos lados). zoomY negativo e bem menor que 1: espelha E
        // "afasta" a vertical, encolhendo os 550px de cenário pra caber nos
        // poucos pixels de faixa d'água disponíveis — senão só a base das
        // árvores aparecia, cortada.
        cam.setZoom(1, -viewportHeight / reflectedWorldHeight);
        cam.setAlpha(0.55);

        // scrollY: 654 (GROUND_Y) faz o mundo em y=GROUND_Y aparecer no topo
        // do viewport (a "linha d'água") e o mundo em
        // y=GROUND_Y-reflectedWorldHeight aparecer no fundo — ou seja, reflete
        // a faixa de cenário logo acima do chão, e não o próprio chão/água
        // (que ficam abaixo de GROUND_Y e nunca entram nessa janela). Esse
        // valor não depende do zoom, só do ponto que deve ficar na borda
        // superior do reflexo.
        cam.scrollY = GROUND_Y;

        // HUD e mapa são fixos na tela (scrollFactor 0); sem isso eles
        // vazariam, minúsculos, dentro da janela de reflexo.
        cam.ignore(this.hudObjects);
        cam.ignore(this.mapOverlay);

        this.reflectionCam = cam;
    }

    private updateMapMarker() {
        const mapStartX = 188;
        const mapEndX = 836;
        const phaseProgress = Math.max(0, Math.min(1, this.player.x / PHASE_WIDTH));
        const worldProgress = (this.phaseIndex + phaseProgress) / (PHASES.length - 1);

        this.mapMarker.x = mapStartX + (mapEndX - mapStartX) * worldProgress;
        this.mapLocationText.setText(`${this.phase.name} - ${Math.round(phaseProgress * 100)}% explorado`);
    }
}
