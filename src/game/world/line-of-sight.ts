import { Geom, Scene } from 'phaser';

// Geometria sólida que corta golpes: um ataque não deve atravessar a parede
// que o corpo do atacante não atravessa.
//
// Fica num módulo à parte, e não como método da cena, para que o BaseEnemy
// possa consultar sem importar PhaseScene — o que criaria import circular
// (PhaseScene já importa BaseEnemy).
//
// A lista é indexada por cena e reescrita a cada create(); scene.restart()
// reaproveita a mesma instância, então sobrescrever é o comportamento certo.
const blockersByScene = new WeakMap<Scene, Geom.Rectangle[]>();

export function setLineOfSightBlockers(scene: Scene, blockers: Geom.Rectangle[]): void {
    blockersByScene.set(scene, blockers);
}

// Verdadeiro se o segmento entre os dois pontos cruza alguma superfície
// sólida. Plataformas one-way ficam de fora de propósito: como o corpo já as
// atravessa por baixo, bloquear golpes nelas seria incoerente.
export function isPathBlocked(
    scene: Scene,
    x1: number,
    y1: number,
    x2: number,
    y2: number
): boolean {
    const blockers = blockersByScene.get(scene);
    if (!blockers || blockers.length === 0) {
        return false;
    }

    const line = new Geom.Line(x1, y1, x2, y2);
    return blockers.some(rectangle => Geom.Intersects.LineToRectangle(line, rectangle));
}
