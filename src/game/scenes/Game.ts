import { GameObjects, Input, Physics, Scene } from 'phaser';

import { Enemy, EnemyType } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { GROUND_Y, HEIGHT, PHASES, PHASE_WIDTH, PhaseDefinition } from '../world/phases';

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
    private enemies: Enemy[] = [];
    private portals: Portal[] = [];
    private teleporting = false;
    private mapKey!: Input.Keyboard.Key;
    private mapOverlay!: GameObjects.Container;
    private mapMarker!: GameObjects.Arc;
    private mapLocationText!: GameObjects.Text;

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
        this.player.on('attack', this.handlePlayerAttack, this);

        const colliders = Array.from(this.physics.world.staticBodies);

        // O jogador tamb\u00e9m precisa colidir com o ch\u00e3o e com as paredes da fase.
        // Sem este collider ele apenas ca\u00eda at\u00e9 o limite do mundo, o que fazia
        // pulo, movimento e encontros com inimigos parecerem quebrados.
        this.physics.add.collider(this.player, colliders);

        this.spawnEnemies();

        for (const enemy of this.enemies) {
            this.physics.add.collider(enemy, colliders);
            this.physics.add.collider(this.player, enemy);
        }

        this.buildPortals();
        this.createHud();
        this.createMapOverlay();

        const camera = this.cameras.main;
        camera.setBounds(0, 0, PHASE_WIDTH, HEIGHT);
        camera.startFollow(this.player, true, 0.1, 0.1);
        camera.fadeIn(220, 0, 0, 0);
    }

    update(time: number, delta: number) {
        this.player.update();

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
            const enemy = new Enemy(this, spawn.x, GROUND_Y - 80, spawn.type);

            enemy.setDepth(15);

            if (spawn.minX !== undefined && spawn.maxX !== undefined) {
                enemy.setPatrolRange(spawn.minX, spawn.maxX);
            }

            this.enemies.push(enemy);
        }
    }

    private handlePlayerAttack() {
        const direction = this.player.flipX ? -1 : 1;
        const attackReach = 155;

        for (const enemy of this.enemies) {
            if (!enemy.active) {
                continue;
            }

            const horizontalDistance = enemy.x - this.player.x;
            const isInFront = horizontalDistance * direction > -20;
            const isInRange = Math.abs(horizontalDistance) <= attackReach;
            const isAtSameHeight = Math.abs(enemy.y - this.player.y) < 75;

            if (isInFront && isInRange && isAtSameHeight) {
                enemy.takeHit(direction);
            }
        }
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

        this.add
            .text(43, 45, this.phase.name, { fontFamily: 'Georgia, serif', fontSize: '20px', color: '#f7e7b0' })
            .setDepth(31)
            .setScrollFactor(0);

        this.add
            .text(43, 72, this.phase.subtitle, { fontFamily: 'monospace', fontSize: '11px', color: '#9db68d' })
            .setDepth(31)
            .setScrollFactor(0);

        this.add
            .text(980, 30, 'A/D mover  ·  W pular  ·  F atacar', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#c0d9b1'
            })
            .setOrigin(1, 0)
            .setDepth(31)
            .setScrollFactor(0);
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

    private updateMapMarker() {
        const mapStartX = 188;
        const mapEndX = 836;
        const phaseProgress = Math.max(0, Math.min(1, this.player.x / PHASE_WIDTH));
        const worldProgress = (this.phaseIndex + phaseProgress) / (PHASES.length - 1);

        this.mapMarker.x = mapStartX + (mapEndX - mapStartX) * worldProgress;
        this.mapLocationText.setText(`${this.phase.name} - ${Math.round(phaseProgress * 100)}% explorado`);
    }
}
