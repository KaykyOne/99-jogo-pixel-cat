import { Scene } from 'phaser';

import { BaseEnemy } from '../BaseEnemy';
import { Boss } from '../Boss';
import { Player } from '../Player';
import { BossBase } from './BossBase';
import { bossDefinitionFor } from './boss-config';
import { DesertBoss } from './DesertBoss';
import { ForestBoss } from './ForestBoss';
import { SnowBoss } from './SnowBoss';

// Boss genérico das fases que ainda não têm um dedicado. É o inimigo comum
// ampliado que já existia — mantido de propósito para nenhuma fase ficar sem
// chefe enquanto os outros três não são escritos.
const GENERIC_BOSS_BY_PHASE: Record<string, 'llama' | 'hedgehog' | 'spider'> = {
    cave: 'spider',
    volcano: 'hedgehog',
    ruins: 'llama'
};

// Ponto único que liga uma CHAVE DE FASE ao seu boss. Nunca por índice: a
// ordem das fases muda (a vila entra como PHASES[0]) e um índice chumbado
// apontaria para o boss errado sem nenhum erro de compilação avisando.
export function createBoss(
    scene: Scene,
    phaseKey: string,
    x: number,
    y: number,
    target: Player
): BaseEnemy | null {
    if (bossDefinitionFor(phaseKey)) {
        switch (phaseKey) {
            case 'forest':
                return new ForestBoss(scene, x, y, target);
            case 'desert':
                return new DesertBoss(scene, x, y, target);
            case 'snow':
                return new SnowBoss(scene, x, y, target);
        }
    }

    const generic = GENERIC_BOSS_BY_PHASE[phaseKey];
    if (!generic) {
        return null;
    }

    return new Boss(scene, x, y, generic, target);
}

export { BossBase };
