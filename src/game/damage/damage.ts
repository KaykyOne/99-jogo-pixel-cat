// Tipos e funções puras de dano. Mantêm o cálculo de dano desacoplado das
// entidades, para que Player e Enemy (e futuros inimigos) compartilhem a mesma
// regra de defesa/resistência sem espalhar a lógica.
export type DamageKind = 'physical' | 'fire' | 'poison' | 'magic';

// Fonte de dano entregue por um ataque ou pelo contato com um inimigo.
// `direction` indica o sentido do golpe: 1 = direita, -1 = esquerda.
export type DamageSource = {
    amount: number;
    kind?: DamageKind;
    knockbackX?: number;
    knockbackY?: number;
    direction?: number;
};

// Estatísticas defensivas de um alvo. `defense` reduz dano em valor fixo;
// `resistance` reduz uma fração (0..1) por tipo de dano.
export type DamageableStats = {
    defense: number;
    resistance: Partial<Record<DamageKind, number>>;
};

// Aplica defesa e resistência: primeiro desconta a defesa, depois a fração de
// resistência do tipo. Nunca retorna valor negativo e arredonda para facilitar
// danos inteiros nos HPs.
//
// Garante 1 de dano mínimo sempre que o golpe tinha alguma quantidade de dano
// (amount > 0): defesa/resistência somadas não podem zerar completamente um
// ataque válido, senão o alvo fica efetivamente imortal (foi o que aconteceu
// com o steamman: defense=1 contra um ataque básico de damage=1 resultava em
// 0 sempre).
export function resolveDamage(source: DamageSource, stats: DamageableStats): number {
    if (source.amount <= 0) {
        return 0;
    }

    const afterDefense = Math.max(0, source.amount - stats.defense);
    const resistance = source.kind ? (stats.resistance[source.kind] ?? 0) : 0;
    const clamped = Math.min(1, Math.max(0, resistance));

    const raw = afterDefense * (1 - clamped);
    return Math.max(1, Math.round(raw));
}