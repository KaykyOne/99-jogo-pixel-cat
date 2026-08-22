import { GameObjects, Scene } from 'phaser';

// Todo inimigo do jogo é desenhado num frame de 48x48 e exibido em escala 3
// (ver BaseEnemy). Esse tamanho não é escolha estética: `syncFacingOffset`
// (physics-utils.ts) espelha o offset do corpo assumindo exatamente 48px de
// largura de frame. Desenhar fora dessa caixa desalinha a colisão ao virar.
export const ENEMY_FRAME = 48;

// Uma pose é só um desenho de Graphics dentro do frame de 48x48. A origem
// (0,0) é o canto superior esquerdo do frame; os pés do bicho devem encostar
// perto de y=48 para ele não parecer flutuando sobre o chão.
export type PoseDrawer = (g: GameObjects.Graphics) => void;

export type EnemyPoses = {
    // Parado. 2 poses já dão respiração; 1 também funciona.
    idle: PoseDrawer[];
    // Andando/voando.
    walk: PoseDrawer[];
    // Golpe. O BaseEnemy aplica o dano em ENEMY_ATTACK_IMPACT_DELAY_MS (300ms)
    // depois do início, então o instante do impacto deve cair no meio da lista.
    attack: PoseDrawer[];
};

// Converte um desenho de Graphics numa textura registrada no TextureManager.
// Graphics é destruído em seguida: ele serviu de molde, não fica na cena.
function makeTexture(scene: Scene, key: string, draw: PoseDrawer): void {
    // Regenerar a mesma textura a cada troca de fase vaza memória de GPU e o
    // Phaser reclama de chave duplicada.
    if (scene.textures.exists(key)) {
        return;
    }

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, ENEMY_FRAME, ENEMY_FRAME);
    g.destroy();
}

function makeSequence(scene: Scene, prefix: string, poses: PoseDrawer[]): string[] {
    return poses.map((draw, index) => {
        const key = `${prefix}-${index}`;
        makeTexture(scene, key, draw);
        return key;
    });
}

// Registra a arte de um inimigo no formato que o BaseEnemy espera, sem que ele
// precise saber que a arte é gerada em vez de carregada de um spritesheet:
//
//   textura `${typeKey}-idle`          -> a que o construtor do Sprite usa
//   animação `${typeKey}-idle`         -> loop parado
//   animação `${typeKey}-walk`         -> loop andando
//   animação `${typeKey}-attack-1..3`  -> golpe (attack-variants sorteia entre
//                                         as três; aqui as três são a mesma
//                                         sequência, já que não há variação
//                                         visual desenhada)
export function registerEnemyArt(scene: Scene, typeKey: string, poses: EnemyPoses): void {
    if (scene.anims.exists(`${typeKey}-idle`)) {
        return;
    }

    // O construtor de BaseEnemy faz `super(scene, x, y, \`${typeKey}-idle\`, 0)`,
    // ou seja, precisa de uma TEXTURA com esse nome exato — o nome da animação
    // homônima não serve. Textura e animação vivem em registros separados no
    // Phaser, então as duas podem se chamar igual.
    makeTexture(scene, `${typeKey}-idle`, poses.idle[0]);

    const idleFrames = makeSequence(scene, `${typeKey}-idle-frame`, poses.idle);
    const walkFrames = makeSequence(scene, `${typeKey}-walk-frame`, poses.walk);
    const attackFrames = makeSequence(scene, `${typeKey}-attack-frame`, poses.attack);

    scene.anims.create({
        key: `${typeKey}-idle`,
        frames: idleFrames.map(key => ({ key })),
        frameRate: 3,
        repeat: -1
    });

    scene.anims.create({
        key: `${typeKey}-walk`,
        frames: walkFrames.map(key => ({ key })),
        frameRate: 8,
        repeat: -1
    });

    // frameRate 10 sobre uma sequência de ~6 poses coloca o meio da animação
    // por volta dos 300ms, casando com ENEMY_ATTACK_IMPACT_DELAY_MS.
    for (let variant = 1; variant <= 3; variant++) {
        scene.anims.create({
            key: `${typeKey}-attack-${variant}`,
            frames: attackFrames.map(key => ({ key })),
            frameRate: 10,
            repeat: 0
        });
    }
}

// Textura de projétil: um desenho pequeno e centrado, sem a caixa de 48x48 dos
// personagens (projétil não usa syncFacingOffset).
export function registerProjectileArt(
    scene: Scene,
    key: string,
    size: number,
    draw: PoseDrawer
): void {
    if (scene.textures.exists(key)) {
        return;
    }

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, size, size);
    g.destroy();
}
