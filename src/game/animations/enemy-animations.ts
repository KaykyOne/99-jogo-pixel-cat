import { Scene } from 'phaser';

import { registerBatArt } from '../entities/art/bat-art';
import { registerBossArt } from '../entities/art/boss-art';
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
    registerBossArt(scene);

    // Projéteis. Ficam aqui, e não nos módulos de cada inimigo, porque a
    // chave é declarada no catálogo de stats (ENEMY_STATS[...].projectile) —
    // quem atira e com o quê é balanceamento, não arte.
    registerProjectileArt(scene, 'llama-spit', 14, g => {
        g.fillStyle(0x9ecf6b).fillCircle(7, 7, 6);
        g.fillStyle(0xd6f0a8).fillCircle(5, 5, 2.5);
    });

    // Projéteis do JOGADOR (arco e magias do cajado). Ficam junto dos demais
    // por serem a mesma coisa — arte gerada de projétil — e para haver um
    // ponto único onde toda textura de tiro do jogo é registrada.
    registerProjectileArt(scene, 'player-arrow', 22, g => {
        // Haste, ponta e empena. Desenhada apontando para a DIREITA: o
        // Projectile espelha via flipX quando o tiro sai para a esquerda.
        g.fillStyle(0x6b4a2a).fillRect(3, 9, 13, 3);
        g.fillStyle(0xd9d4c8).fillTriangle(15, 6, 22, 10.5, 15, 15);
        g.fillStyle(0xb8cc84).fillTriangle(2, 5, 7, 10.5, 2, 16);
    });

    registerProjectileArt(scene, 'spell-arcane', 18, g => {
        g.fillStyle(0x9d7bff, 0.45).fillCircle(9, 9, 8);
        g.fillStyle(0x9d7bff).fillCircle(9, 9, 5);
        g.fillStyle(0xe4d9ff).fillCircle(7.5, 7.5, 2.2);
    });

    registerProjectileArt(scene, 'spell-fireball', 24, g => {
        // Três camadas concêntricas: o miolo claro é o que faz ler como fogo
        // e não como uma bola laranja chapada.
        g.fillStyle(0xff3d1f, 0.4).fillCircle(12, 12, 11);
        g.fillStyle(0xff7a2f).fillCircle(12, 12, 8);
        g.fillStyle(0xffc247).fillCircle(12, 12, 5);
        g.fillStyle(0xfff3c4).fillCircle(10.5, 10.5, 2.4);
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
