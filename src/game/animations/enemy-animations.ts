import { Scene } from 'phaser';

import { EnemyType } from '../damage/health-config';
import { registerBatArt } from '../entities/art/bat-art';
import { registerHedgehogArt } from '../entities/art/hedgehog-art';
import { registerLlamaArt } from '../entities/art/llama-art';
import { registerProjectileArt } from '../entities/art/enemy-art-utils';
import { registerSpiderArt } from '../entities/art/spider-art';

// Inimigos com spritesheet de verdade em public/assets/enemies. Os quatro
// novos (lhama, morcego, ouriço, aranha) não têm arte pronta e são desenhados
// por Graphics em entities/art/ — ver registerGeneratedEnemyArt abaixo.
const SPRITESHEET_KINDS: EnemyType[] = ['graverobber', 'steamman'];

export function createEnemyAnimations(scene: Scene): void {
    for (const kind of SPRITESHEET_KINDS) {
        scene.anims.create({
            key: `${kind}-idle`,
            frames: scene.anims.generateFrameNumbers(`${kind}-idle`, { start: 0, end: 3 }),
            frameRate: 4,
            repeat: -1
        });

        scene.anims.create({
            key: `${kind}-walk`,
            frames: scene.anims.generateFrameNumbers(`${kind}-walk`, { start: 0, end: 5 }),
            frameRate: 8,
            repeat: -1
        });

        // 3 variantes de golpe (sorteadas a cada ataque, ver attack-variants.ts).
        for (let variant = 1; variant <= 3; variant++) {
            scene.anims.create({
                key: `${kind}-attack-${variant}`,
                frames: scene.anims.generateFrameNumbers(`${kind}-attack-${variant}`, { start: 0, end: 5 }),
                frameRate: 10,
                repeat: 0
            });
        }
    }

    registerGeneratedEnemyArt(scene);
}

// Arte gerada em tempo de carga, sem asset em disco. Cada módulo registra as
// texturas e as animações do seu bicho no formato que o BaseEnemy espera.
function registerGeneratedEnemyArt(scene: Scene): void {
    registerLlamaArt(scene);
    registerBatArt(scene);
    registerHedgehogArt(scene);
    registerSpiderArt(scene);

    // Projéteis. Ficam aqui, e não nos módulos de cada inimigo, porque a
    // chave é declarada no catálogo de stats (ENEMY_STATS[...].projectile) —
    // quem atira e com o quê é balanceamento, não arte.
    registerProjectileArt(scene, 'llama-spit', 14, g => {
        g.fillStyle(0x9ecf6b).fillCircle(7, 7, 6);
        g.fillStyle(0xd6f0a8).fillCircle(5, 5, 2.5);
    });

    registerProjectileArt(scene, 'spider-web', 16, g => {
        g.fillStyle(0xffffff, 0.85).fillCircle(8, 8, 6);
        g.lineStyle(1.5, 0xc9d4e0, 0.9);
        for (let i = 0; i < 4; i++) {
            const angle = (Math.PI / 4) * i;
            g.lineBetween(
                8 - Math.cos(angle) * 7,
                8 - Math.sin(angle) * 7,
                8 + Math.cos(angle) * 7,
                8 + Math.sin(angle) * 7
            );
        }
    });
}
