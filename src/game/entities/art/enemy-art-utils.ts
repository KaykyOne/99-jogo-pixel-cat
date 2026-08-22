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

// --- Corpo em duas passadas ------------------------------------------------
// Sem contorno, um bicho chapado some contra o terreno (a arte anterior tinha
// exatamente esse problema). A solução clássica de pixel art é uma silhueta
// escura por baixo, um pouco maior que o desenho.
//
// Precisa ser em DUAS passadas — primeiro todos os contornos, depois todos os
// preenchimentos. Desenhando peça por peça (contorno+preenchimento de cada
// uma), o contorno da peça seguinte corta a que já estava pintada e o bicho
// fica riscado por dentro.
export type Shape =
    | { kind: 'circle'; x: number; y: number; r: number; color: number }
    | { kind: 'rect'; x: number; y: number; w: number; h: number; color: number }
    | { kind: 'tri'; p: [number, number, number, number, number, number]; color: number };

const OUTLINE = 0x171019;

function drawShape(g: GameObjects.Graphics, s: Shape, grow: number, color: number): void {
    g.fillStyle(color);

    if (s.kind === 'circle') {
        g.fillCircle(s.x, s.y, s.r + grow);
        return;
    }

    if (s.kind === 'rect') {
        g.fillRect(s.x - grow, s.y - grow, s.w + grow * 2, s.h + grow * 2);
        return;
    }

    // Triângulo cresce a partir do próprio centro, para o contorno acompanhar
    // a forma em vez de deslocá-la.
    const [x1, y1, x2, y2, x3, y3] = s.p;
    const cx = (x1 + x2 + x3) / 3;
    const cy = (y1 + y2 + y3) / 3;
    const push = (x: number, y: number): [number, number] => {
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        return [x + (dx / len) * grow, y + (dy / len) * grow];
    };
    const [ax, ay] = push(x1, y1);
    const [bx, by] = push(x2, y2);
    const [dx2, dy2] = push(x3, y3);
    g.fillTriangle(ax, ay, bx, by, dx2, dy2);
}

// Desenha o corpo inteiro com contorno. `grow` é a espessura do contorno.
export function drawBody(g: GameObjects.Graphics, shapes: Shape[], grow = 2): void {
    for (const s of shapes) {
        drawShape(g, s, grow, OUTLINE);
    }
    for (const s of shapes) {
        drawShape(g, s, 0, s.color);
    }
}

// Detalhe pintado por cima do corpo já montado (olho, brilho, listra). Não
// leva contorno: é o que dá o volume depois que a silhueta está fechada.
export function detail(g: GameObjects.Graphics, shapes: Shape[]): void {
    for (const s of shapes) {
        drawShape(g, s, 0, s.color);
    }
}
