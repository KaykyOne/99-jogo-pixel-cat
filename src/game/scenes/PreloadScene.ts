import { Scene } from 'phaser';

import { createEnemyAnimations } from '../animations/enemy-animations';
import { createPlayerAnimations } from '../animations/player-animations';
import { createPortalAnimations } from '../animations/portal-animations';

export class PreloadScene extends Scene {
    constructor() {
        super('Preload');
    }

    preload() {
        this.load.setPath('assets');

        this.load.image('sky-stars', 'background/Clouds/1.png');
        this.load.image('sky-clouds-far', 'background/Clouds/2.png');
        this.load.image('sky-clouds-near', 'background/Clouds/3.png');

        // Camadas de parallax da floresta (ver phases.ts). chao/borda-agua vêm
        // pré-processadas (fundo branco/preto original trocado por alpha e
        // recortadas pra faixa de conteúdo, ver scripts usados na sessão).
        this.load.image('forest-sky', 'florest/ceu.png');
        this.load.image('forest-mountains', 'florest/montanhas.png');
        this.load.image('forest-trees', 'florest/arvores-casas-trim.png');
        this.load.image('forest-ground', 'florest/chao-strip.png');
        this.load.image('forest-water-edge', 'florest/borda-agua-strip.png');

        // O spritesheet tem 2172×724px. Os oito frames de 271px deixam uma
        // borda excedente de 4px ao fim da imagem, que não faz parte dos frames.
        this.load.spritesheet('portal-activate', 'portal/portal-activate.png', {
            frameWidth: 271,
            frameHeight: 724
        });

        this.load.spritesheet('player-jump', 'player/jump.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('player-idle', 'player/idle.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('player-walk', 'player/walk.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('player-run', 'player/run.png', { frameWidth: 48, frameHeight: 48 });

        // 3 variantes de golpe (sorteadas a cada ataque, ver attack-variants.ts).
        this.load.spritesheet('player-attack-1', 'player/Woodcutter_attack1.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('player-attack-2', 'player/attack.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('player-attack-3', 'player/Woodcutter_attack3.png', { frameWidth: 48, frameHeight: 48 });

        this.load.spritesheet('graverobber-idle', 'enemies/graverobber-idle.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('graverobber-walk', 'enemies/graverobber-walk.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('graverobber-attack-1', 'enemies/GraveRobber_attack1.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('graverobber-attack-2', 'enemies/GraveRobber_attack2.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('graverobber-attack-3', 'enemies/GraveRobber_attack3.png', { frameWidth: 48, frameHeight: 48 });

        this.load.spritesheet('steamman-idle', 'enemies/steamman-idle.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('steamman-walk', 'enemies/steamman-walk.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('steamman-attack-1', 'enemies/SteamMan_attack1.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('steamman-attack-2', 'enemies/SteamMan_attack2.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('steamman-attack-3', 'enemies/SteamMan_attack3.png', { frameWidth: 48, frameHeight: 48 });
    }

    create() {
        createPlayerAnimations(this);
        createEnemyAnimations(this);
        createPortalAnimations(this);
        this.scene.start('Menu');
    }
}
