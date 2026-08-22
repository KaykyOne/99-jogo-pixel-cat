import { Scene } from 'phaser';

import { registerBatArt } from '../entities/art/bat-art';
import { registerHedgehogArt } from '../entities/art/hedgehog-art';
import { registerLlamaArt } from '../entities/art/llama-art';
import { registerProjectileArt } from '../entities/art/enemy-art-utils';
import { registerSpiderArt } from '../entities/art/spider-art';

// Todo inimigo do jogo é desenhado por Graphics em entities/art/ — não há
// mais nenhum carregado de spritesheet.
export function createEnemyAnimations(scene: Scene): void {
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
