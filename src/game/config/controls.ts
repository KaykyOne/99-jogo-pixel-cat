import { Input } from 'phaser';

// Controles configuráveis. Fonte ÚNICA de TODAS as teclas do jogo: o
// Player, o inventário, os painéis e os textos (pausa, falas dos NPCs) leem
// daqui. O menu edita e grava; as cenas de fase leem ao nascer, então uma
// troca feita no menu vale a partir da próxima fase carregada.
//
// Guardado separado do save da jornada de propósito: "Novo Jogo" e a morte no
// Difícil apagam o save, e ninguém espera perder as teclas junto.

const KeyCodes = Input.Keyboard.KeyCodes;

export type ControlAction =
    | 'left'
    | 'right'
    | 'up'
    | 'down'
    | 'jump'
    | 'climb'
    | 'attack'
    | 'dash'
    | 'parry'
    | 'weaponSword'
    | 'weaponBow'
    | 'weaponStaff'
    | 'spellCycle'
    | 'slot1'
    | 'slot2'
    | 'slot3'
    | 'nextSlot'
    | 'prevSlot'
    | 'useItem'
    | 'dropItem'
    | 'dropStack'
    | 'quickHeal'
    | 'interact'
    | 'map'
    | 'pause';

export type ControlBindings = Record<ControlAction, number>;

export const DEFAULT_CONTROLS: Readonly<ControlBindings> = {
    left: KeyCodes.A,
    right: KeyCodes.D,
    up: KeyCodes.W,
    down: KeyCodes.S,
    jump: KeyCodes.SPACE,
    climb: KeyCodes.U,
    attack: KeyCodes.J,
    dash: KeyCodes.SHIFT,
    parry: KeyCodes.L,
    weaponSword: KeyCodes.ONE,
    weaponBow: KeyCodes.TWO,
    weaponStaff: KeyCodes.THREE,
    spellCycle: KeyCodes.Q,
    slot1: KeyCodes.FOUR,
    slot2: KeyCodes.FIVE,
    slot3: KeyCodes.SIX,
    nextSlot: KeyCodes.TAB,
    prevSlot: KeyCodes.C,
    useItem: KeyCodes.F,
    dropItem: KeyCodes.G,
    dropStack: KeyCodes.H,
    quickHeal: KeyCodes.R,
    interact: KeyCodes.E,
    map: KeyCodes.M,
    pause: KeyCodes.ESC
};

// Grupos e rótulos da tela de controles (e da lista da pausa).
export const CONTROL_GROUPS: readonly { title: string; actions: readonly [ControlAction, string][] }[] = [
    {
        title: 'MOVIMENTO',
        actions: [
            ['left', 'Mover esquerda'],
            ['right', 'Mover direita'],
            ['up', 'Subir'],
            ['down', 'Descer'],
            ['jump', 'Pular'],
            ['climb', 'Agarrar / Escalar']
        ]
    },
    {
        title: 'COMBATE',
        actions: [
            ['attack', 'Atacar'],
            ['dash', 'Dash / Esquiva'],
            ['parry', 'Defesa / Bloqueio']
        ]
    },
    {
        title: 'ARMAS',
        actions: [
            ['weaponSword', 'Espada'],
            ['weaponBow', 'Arco'],
            ['weaponStaff', 'Magia']
        ]
    },
    {
        title: 'MAGIA',
        actions: [['spellCycle', 'Ciclar feitiço']]
    },
    {
        title: 'INVENTÁRIO',
        actions: [
            ['slot1', 'Usar slot 1'],
            ['slot2', 'Usar slot 2'],
            ['slot3', 'Usar slot 3'],
            ['nextSlot', 'Próximo slot'],
            ['prevSlot', 'Slot anterior'],
            ['useItem', 'Usar item'],
            ['dropItem', 'Largar 1'],
            ['dropStack', 'Largar pilha'],
            ['quickHeal', 'Cura rápida']
        ]
    },
    {
        title: 'SISTEMA',
        actions: [
            ['interact', 'Conversar'],
            ['map', 'Mapa'],
            ['pause', 'Pausa / Fechar']
        ]
    }
];

const STORAGE_KEY = 'jogo-99:controls:v1';

let cached: ControlBindings | null = null;

export function loadControls(): ControlBindings {
    if (cached) {
        return { ...cached };
    }

    const bindings: ControlBindings = { ...DEFAULT_CONTROLS };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
            for (const action of Object.keys(DEFAULT_CONTROLS) as ControlAction[]) {
                const code = (parsed as Record<string, unknown>)[action];
                if (typeof code === 'number') {
                    bindings[action] = code;
                }
            }
        }
    } catch {
        // Sem localStorage: fica com os padrões.
    }

    cached = bindings;
    return { ...bindings };
}

export function saveControls(bindings: ControlBindings): void {
    cached = { ...bindings };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    } catch {
        // Falhar ao persistir não impede de jogar com as teclas desta sessão.
    }
}

// Troca a tecla de uma ação. Se outra ação já usava a tecla nova, ela fica
// com a tecla antiga (troca), para nunca haver duas ações na mesma tecla.
export function rebind(bindings: ControlBindings, action: ControlAction, keyCode: number): ControlBindings {
    const next = { ...bindings };
    const previous = next[action];
    for (const other of Object.keys(next) as ControlAction[]) {
        if (other !== action && next[other] === keyCode) {
            next[other] = previous;
        }
    }
    next[action] = keyCode;
    return next;
}

const KEY_NAMES: Record<number, string> = {
    [KeyCodes.SPACE]: 'Espaço',
    [KeyCodes.ESC]: 'ESC',
    [KeyCodes.TAB]: 'Tab',
    [KeyCodes.ENTER]: 'Enter',
    [KeyCodes.SHIFT]: 'Shift',
    [KeyCodes.CTRL]: 'Ctrl',
    [KeyCodes.ALT]: 'Alt',
    [KeyCodes.BACKSPACE]: 'Backspace',
    [KeyCodes.CAPS_LOCK]: 'Caps Lock',
    [KeyCodes.LEFT]: '←',
    [KeyCodes.RIGHT]: '→',
    [KeyCodes.UP]: '↑',
    [KeyCodes.DOWN]: '↓',
    [KeyCodes.COMMA]: ',',
    [KeyCodes.PERIOD]: '.',
    [KeyCodes.SEMICOLON]: ';',
    [KeyCodes.FORWARD_SLASH]: '/',
    [KeyCodes.BACK_SLASH]: '\\',
    [KeyCodes.OPEN_BRACKET]: '[',
    [KeyCodes.CLOSED_BRACKET]: ']',
    [KeyCodes.QUOTES]: "'",
    [KeyCodes.MINUS]: '-',
    [KeyCodes.PLUS]: '=',
    [KeyCodes.BACKTICK]: '`'
};

export function keyLabel(keyCode: number): string {
    if (KEY_NAMES[keyCode]) {
        return KEY_NAMES[keyCode];
    }
    // Letras e números: o keyCode é o próprio código ASCII.
    if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 65 && keyCode <= 90)) {
        return String.fromCharCode(keyCode);
    }
    if (keyCode >= 96 && keyCode <= 105) {
        return `Num ${keyCode - 96}`;
    }
    if (keyCode >= 112 && keyCode <= 123) {
        return `F${keyCode - 111}`;
    }
    const name = Object.entries(KeyCodes).find(([, code]) => code === keyCode)?.[0];
    return name ? name.replace(/_/g, ' ') : `#${keyCode}`;
}

// Tecla ainda não usada por nenhuma ação. As setas ↑/↓ são atalhos extras de
// subir/descer, e só valem se o jogador não tiver dado outra função a elas.
export function isKeyFree(keyCode: number, bindings: ControlBindings = loadControls()): boolean {
    return !Object.values(bindings).includes(keyCode);
}

export function controlLabel(action: ControlAction, bindings: ControlBindings = loadControls()): string {
    return keyLabel(bindings[action]);
}

// Troca `{acao}` pelo nome da tecla atual. Usado nas falas dos NPCs, que
// ensinam os controles e ficariam mentindo depois de uma troca de tecla.
export function formatControls(text: string, bindings: ControlBindings = loadControls()): string {
    return text.replace(/\{(\w+)\}/g, (match, action: string) =>
        action in bindings ? keyLabel(bindings[action as ControlAction]) : match
    );
}
