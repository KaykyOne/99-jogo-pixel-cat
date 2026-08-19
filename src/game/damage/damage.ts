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
export function resolveDamage(source: DamageSource, stats: DamageableStats): number {
    const afterDefense = Math.max(0, source.amount - stats.defense);
    const resistance = source.kind ? (stats.resistance[source.kind] ?? 0) : 0;
    const clamped = Math.min(1, Math.max(0, resistance));

    return Math.round(afterDefense * (1 - clamped));
}