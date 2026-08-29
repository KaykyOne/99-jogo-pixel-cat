import { GameObjects } from 'phaser';

import { drawArmadillo, drawBird, drawCapybara, drawFrog, drawRabbit } from '../entities/art/npc-art';

// Dados dos NPCs: falas, posições, raios e alturas. Nada disso mora dentro da
// classe Npc — trocar uma fala ou mover um bicho de lugar não deve exigir
// abrir código de comportamento (ver "Convenções compartilhadas" do plano).

// Identificadores de loja combinados com o Agente C. O diálogo apenas dispara
// o evento 'shop:open' com um destes; quem monta o painel é a loja.
export type ShopId = 'rabbit-shop' | 'capybara-shop';

export type NpcDef = {
    id: string;
    name: string;
    x: number;
    // Para onde o NPC olha antes de o jogador chegar (1 = direita).
    facing: 1 | -1;
    // Desenho por blocos com a origem nos pés (ver npc-art.ts).
    draw: (g: GameObjects.Graphics) => void;
    // Altura aproximada da silhueta. Só serve para pendurar o ícone da tecla
    // acima da cabeça sem que cada NPC precise medir o próprio desenho.
    height: number;
    // Fala de abertura, uma página por item.
    lines: string[];
    // Sem isto o NPC só conversa. Com isto, a última página oferece "Negociar".
    shopId?: ShopId;
};

// Distância (px) em que o ícone "E" aparece e a tecla passa a valer. Um pouco
// maior que a largura da capivara, para não exigir encostar no bicho.
export const INTERACT_RANGE = 90;

// Ajuste fino do ícone flutuante e do diálogo, na mesma ideia: número fora da
// lógica.
export const NPC_UI = {
    // Folga entre o topo da cabeça e a base do ícone da tecla.
    iconGap: 26,
    // Velocidade do efeito de máquina de escrever, em ms por caractere.
    typewriterMs: 22
} as const;

export const VILLAGE_NPCS: NpcDef[] = [
    {
        id: 'bird-scout',
        name: 'PIA-PIA',
        x: 380,
        facing: 1,
        draw: drawBird,
        height: 50,
        lines: [
            'Piu! Vi você chegando lá do galho, viu?',
            'A/D anda de um lado pro outro. Parece pouco, mas é o que mais se usa.',
            'Parede alta demais? Segura o direcional CONTRA ela e sobe com W e S. Só tem uma dessas no mundo inteiro, então guarda essa.'
        ]
    },
    {
        id: 'frog-watch',
        name: 'RÃ VIGIA',
        x: 640,
        facing: -1,
        draw: drawFrog,
        height: 58,
        lines: [
            'Croac. Fico aqui olhando a estrada. Alguém tem que olhar.',
            'W pula. Segurando W o pulo sai cheio; soltando no meio, sai curtinho — serve pros dois tipos de vão.',
            'Espaço é o arranco. Atravessa vão que o pulo sozinho não vence, e passa por dentro de bicho sem levar dano.'
        ]
    },
    {
        id: 'rabbit-apothecary',
        name: 'COELHO BOTICÁRIO',
        x: 940,
        facing: 1,
        draw: drawRabbit,
        height: 116,
        shopId: 'rabbit-shop',
        lines: [
            'Poção fresquinha, saída da panela!',
            'Um gole e a costela para de doer. Dois goles e você esquece por que doía.',
            'Moeda na mão, poção na mochila. É assim que funciona aqui.'
        ]
    },
    {
        id: 'capybara-trader',
        name: 'DONA CAPIVARA',
        x: 1240,
        facing: -1,
        draw: drawCapybara,
        height: 88,
        shopId: 'capybara-shop',
        lines: [
            'Ô, forasteiro. Senta aí no sol que a água hoje tá boa.',
            'Eu compro maçã de quem traz da mata. Moeda eu tenho; paciência, mais ainda.',
            'Se a mochila encher lá fora, volta aqui que a gente resolve.'
        ]
    },
    {
        id: 'armadillo-smith',
        name: 'MESTRE TATU',
        x: 1960,
        facing: -1,
        draw: drawArmadillo,
        height: 92,
        lines: [
            'Essa lâmina aí na sua mão? Fui eu que temperei. Cuida dela.',
            'F golpeia. Não fica batendo no ar: o golpe tem peso, e o bicho do outro lado tem paciência.',
            'Segura Q e você defende. Aparar no instante certo devolve o susto pra quem veio te dar.',
            'E as teclas 1 a 6 usam o que estiver na mochila. Poção guardada não cura ninguém.'
        ]
    }
];
