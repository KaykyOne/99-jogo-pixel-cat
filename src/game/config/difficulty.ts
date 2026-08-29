import { Scene } from 'phaser';

import { Difficulty } from '../state/save';

// A dificuldade já existia como 'normal' | 'hard' escolhida no menu, mas só
// mudava o que acontece na morte (Normal reinicia a fase, Difícil apaga o
// save). Isto transforma a escolha em MULTIPLICADORES DE DADOS num lugar só:
// nenhum sistema pergunta "se difícil, então..." — todos pedem os
// multiplicadores e multiplicam.
//
// Regra de leitura de todos os campos: 1 = igual ao Normal. Acima de 1 é MAIS
// daquilo; abaixo de 1 é menos. Nenhum campo inverte esse sentido.
export type DifficultyModifiers = {
    // Dano que o JOGADOR recebe de qualquer fonte. > 1 dói mais.
    incomingDamage: number;
    // Vida máxima dos inimigos (e dos bosses) ao nascer. > 1 aguentam mais.
    enemyHealth: number;
    // Quantidade rolada na tabela de drop. < 1 cai menos moeda/maçã.
    lootQuantity: number;
    // Preço do que o jogador COMPRA na loja. > 1 custa mais caro.
    shopBuyPrice: number;
    // Valor do que o jogador VENDE na loja. Campo separado de propósito: um
    // multiplicador único de "preço" deixaria o modo difícil PAGANDO mais pela
    // maçã, que é o contrário do que dificultar significa.
    shopSellValue: number;
};

const MODIFIERS: Record<Difficulty, DifficultyModifiers> = {
    normal: {
        incomingDamage: 1,
        enemyHealth: 1,
        lootQuantity: 1,
        shopBuyPrice: 1,
        shopSellValue: 1
    },

    // Difícil já custa a jornada inteira na morte; os multiplicadores são
    // firmes mas não brutais, para o modo continuar sendo jogável e não virar
    // uma corrida de sorte.
    hard: {
        incomingDamage: 1.5,
        enemyHealth: 1.35,
        lootQuantity: 0.75,
        shopBuyPrice: 1.25,
        shopSellValue: 0.8
    }
};

// Função PURA: entra a dificuldade, sai a tabela. Sem cena, sem registry — quem
// tem a cena resolve a dificuldade e chama esta função (ver
// getDifficultyModifiersFor).
export function getDifficultyModifiers(difficulty: Difficulty): DifficultyModifiers {
    return MODIFIERS[difficulty] ?? MODIFIERS.normal;
}

// Atalho para quem já está dentro de uma cena: a dificuldade da run mora no
// registry ('difficulty'), gravado pelo MenuScene.
export function getDifficultyModifiersFor(scene: Scene): DifficultyModifiers {
    const difficulty = (scene.registry.get('difficulty') as Difficulty) ?? 'normal';
    return getDifficultyModifiers(difficulty);
}
