import { Math as PhaserMath, Physics, Scene } from 'phaser';

import { DamageSource } from '../damage/damage';
import { Mana } from '../damage/Mana';
import { PlayerCombat } from './PlayerCombat';
import { ProjectileManager } from './Projectile';
import { SPELLS, SpellDefinition, SpellId, SPELL_ORDER } from './spells';
import { ProjectileTarget } from './types';
import { isWeaponId, WeaponDefinition, WeaponId, WEAPONS, WEAPON_ORDER } from './weapons';

// Buffer de input de ataque. Apertar até 120ms antes de o cooldown acabar
// ainda conta: sem isto, jogar no ritmo do combo exige acertar o frame exato em
// que a arma libera, e o golpe simplesmente some quando o jogador erra por
// pouco. É o mesmo remédio que o jumpBufferTime já dá ao pulo.
export const ATTACK_BUFFER_MS = 120;

// Componente que guarda a arma equipada, resolve qual ataque executar e delega:
// corpo-a-corpo para o PlayerCombat, tiro e magia para o ProjectileManager.
// O Player só entrega intenção — mesmo padrão de PlayerDash/PlayerClimb.
export class PlayerWeapons {
    private equippedId: WeaponId = 'sword';
    private selectedSpellId: SpellId = 'arcane';

    // Cooldowns separados por magia: cada uma recarrega no seu ritmo, senão a
    // bola de fogo (1,1s) e o dardo (0,34s) dividiriam o mesmo relógio e a
    // escolha entre elas deixaria de existir.
    private spellCooldowns: Partial<Record<SpellId, number>> = {};
    private weaponCooldownUntil = 0;

    // Enquanto a conjuração/disparo dura, o jogador fica plantado. É o custo de
    // atirar: não dá para sair correndo no meio da flechada.
    private castUntil = 0;

    private bufferedUntil = 0;

    constructor(
        private scene: Scene,
        private owner: Physics.Arcade.Sprite,
        private combat: PlayerCombat,
        private mana: Mana
    ) {
        // Contrato com o inventário (Agente C): equipar um item de arma vira
        // este evento, e nada além dele precisa conhecer o sistema de combate.
        scene.events.on('weapon:equip', this.onEquipEvent, this);
        scene.events.once('shutdown', () => {
            scene.events.off('weapon:equip', this.onEquipEvent, this);
        });
    }

    get equipped(): WeaponDefinition {
        return WEAPONS[this.equippedId];
    }

    get equippedWeaponId(): WeaponId {
        return this.equippedId;
    }

    get selectedSpell(): SpellDefinition {
        return SPELLS[this.selectedSpellId];
    }

    // O cajado é a única arma em que a seleção de magia faz sentido; o HUD e as
    // teclas 1/2/3 usam isto para decidir se sequer aparecem/respondem.
    get isStaffEquipped(): boolean {
        return this.equippedId === 'staff';
    }

    get isCasting(): boolean {
        return this.scene.time.now < this.castUntil;
    }

    // Ocupado atacando de qualquer forma (golpe, tiro ou conjuro). O Player usa
    // isto onde antes olhava só para combat.isAttacking.
    get isBusy(): boolean {
        return this.combat.isAttacking || this.isCasting;
    }

    equip(id: WeaponId): void {
        if (this.equippedId === id) {
            return;
        }

        // Trocar de arma no meio de um golpe cancelaria a hitbox no ar; o
        // combate já sabe se limpar, então basta pedir.
        this.combat.cancel();
        this.equippedId = id;
        this.castUntil = 0;
        this.scene.events.emit('weapon:changed', { weaponId: id });
    }

    cycleWeapon(step = 1): void {
        const index = WEAPON_ORDER.indexOf(this.equippedId);
        const next = (index + step + WEAPON_ORDER.length) % WEAPON_ORDER.length;
        this.equip(WEAPON_ORDER[next]);
    }

    // Só responde com o cajado na mão. As teclas 1..6 pertencem ao inventário
    // (Agente C); restringir a seleção ao cajado é o que permite as duas coisas
    // conviverem na mesma tecla sem uma roubar a outra.
    selectSpell(id: SpellId): void {
        if (!this.isStaffEquipped) {
            return;
        }

        this.selectedSpellId = id;
    }

    cycleSpell(): void {
        if (!this.isStaffEquipped) {
            return;
        }

        const index = SPELL_ORDER.indexOf(this.selectedSpellId);
        this.selectedSpellId = SPELL_ORDER[(index + 1) % SPELL_ORDER.length];
    }

    // Registra a intenção de atacar. NÃO tenta executar aqui: quem executa é o
    // update, todo frame, consumindo o buffer assim que a arma liberar.
    queueAttack(now: number): void {
        this.bufferedUntil = now + ATTACK_BUFFER_MS;
    }

    clearBuffer(): void {
        this.bufferedUntil = 0;
    }

    // Chamado todo frame pelo Player. Duas coisas acontecem aqui: o
    // encadeamento do combo (que corta o fim da animação) e o consumo do buffer.
    update(now: number, onGround: boolean): void {
        if (now > this.bufferedUntil) {
            return;
        }

        const weapon = this.equipped;

        // Golpe no ar é DADO da arma, não regra fixa do Player: o cajado exige
        // chão, a espada e o arco não.
        if (!onGround && !weapon.allowAirborne) {
            return;
        }

        // Encadeamento: o golpe atual já passou do impacto e a arma tem combo.
        if (this.combat.canChain(weapon)) {
            this.bufferedUntil = 0;
            this.combat.chain(now, weapon);
            return;
        }

        if (this.isBusy || now < this.weaponCooldownUntil || !this.combat.canAttack(now)) {
            return;
        }

        if (this.execute(now, weapon)) {
            this.bufferedUntil = 0;
        }
    }

    private execute(now: number, weapon: WeaponDefinition): boolean {
        switch (weapon.kind) {
            case 'melee':
                return this.combat.swing(now, weapon) !== null;
            case 'ranged':
                return this.fireShot(now, weapon);
            case 'magic':
                return this.castSpell(now, weapon);
        }
    }

    private fireShot(now: number, weapon: WeaponDefinition): boolean {
        const shot = weapon.shot;
        if (!shot) {
            return false;
        }

        this.weaponCooldownUntil = now + weapon.cooldownMs;
        this.beginCast(weapon);

        const direction = this.owner.flipX ? -1 : 1;
        const damage: DamageSource = {
            amount: shot.damage,
            kind: shot.kind,
            knockbackX: shot.knockbackX,
            knockbackY: shot.knockbackY
        };

        // O tiro sai no meio da animação, não no frame 0 — mesma sincronia que
        // a hitbox temporal do golpe corpo a corpo já usa.
        this.scene.time.delayedCall(shot.releaseDelayMs, () => {
            const projectiles = this.projectiles();
            projectiles?.spawnPlayerShot(
                this.owner.x + direction * 26,
                this.owner.y + shot.muzzleOffsetY,
                direction,
                shot.projectile,
                damage
            );
        });

        return true;
    }

    private castSpell(now: number, weapon: WeaponDefinition): boolean {
        const spell = this.selectedSpell;

        const readyAt = this.spellCooldowns[spell.id] ?? 0;
        if (now < readyAt) {
            return false;
        }

        // Valida a mana ANTES de qualquer efeito: gastar e depois descobrir que
        // a magia não sai deixaria o jogador sem mana e sem magia.
        if (!this.mana.spend(spell.manaCost)) {
            this.flashOutOfMana();
            return false;
        }

        this.spellCooldowns[spell.id] = now + spell.cooldownMs;
        this.weaponCooldownUntil = now + weapon.cooldownMs;
        this.beginCast(weapon);

        const direction = this.owner.flipX ? -1 : 1;

        this.scene.time.delayedCall(spell.releaseDelayMs, () => {
            if (spell.burst) {
                this.releaseBurst(spell);
                return;
            }

            this.releaseSpellProjectile(spell, direction);
        });

        return true;
    }

    private releaseSpellProjectile(spell: SpellDefinition, direction: number): void {
        if (!spell.projectile) {
            return;
        }

        this.projectiles()?.spawnPlayerShot(
            this.owner.x + direction * 26,
            this.owner.y + (spell.muzzleOffsetY ?? -14),
            direction,
            spell.projectile,
            {
                amount: spell.damage,
                kind: spell.kind,
                knockbackX: spell.knockbackX,
                knockbackY: spell.knockbackY
            }
        );
    }

    // Onda de gelo: não é um tiro, é uma área em volta do jogador. Resolvida
    // aqui mesmo (e não no ProjectileManager) porque não há projétil nenhum —
    // inventar um projétil de velocidade zero só para reaproveitar a máquina
    // seria mais código, não menos.
    private releaseBurst(spell: SpellDefinition): void {
        const burst = spell.burst!;
        const manager = this.projectiles();
        manager?.spawnBlast(this.owner.x, this.owner.y, burst.radius, spell.color);

        const targets = manager?.currentTargets() ?? [];
        let hitAny = false;

        for (const target of targets) {
            if (!target.active || !target.isAlive) {
                continue;
            }

            const distance = PhaserMath.Distance.Between(
                this.owner.x,
                this.owner.y,
                target.x,
                target.y
            );
            if (distance > burst.radius) {
                continue;
            }

            // Empurra para LONGE do jogador, não na direção em que ele olha:
            // a onda é radial, então quem está atrás precisa voar para trás.
            const away = target.x >= this.owner.x ? 1 : -1;
            const applied = target.takeHit(
                {
                    amount: spell.damage,
                    kind: spell.kind,
                    knockbackX: spell.knockbackX,
                    knockbackY: spell.knockbackY
                },
                away
            );

            // A lentidão cola mesmo em quem é imune a dano (o ouriço em bola):
            // a onda de gelo é exatamente a resposta para ele.
            target.applyChill(burst.slowFactor, burst.slowDurationMs);

            if (applied > 0) {
                hitAny = true;
            }
        }

        if (hitAny) {
            this.scene.events.emit('combat:impact', {
                hitStopMs: spell.hitStopMs,
                shakeMs: spell.shakeMs,
                shakeIntensity: spell.shakeIntensity
            });
        }
    }

    private beginCast(weapon: WeaponDefinition): void {
        this.castUntil = this.scene.time.now + weapon.castLockMs;
        this.owner.play(weapon.castAnimationKey, true);
    }

    // Sinal de "não deu": um lampejo azul curto. Falhar em silêncio faria o
    // jogador achar que a tecla não respondeu.
    private flashOutOfMana(): void {
        const text = this.scene.add
            .text(this.owner.x, this.owner.y - 70, 'sem mana', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#7fd4ff'
            })
            .setOrigin(0.5)
            .setDepth(25);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 22,
            alpha: 0,
            duration: 520,
            ease: 'Quad.out',
            onComplete: () => text.destroy()
        });
    }

    // Lido do registry, e não injetado no construtor, porque o Player nasce
    // ANTES do ProjectileManager (que precisa do player para existir).
    private projectiles(): ProjectileManager | undefined {
        return this.scene.registry.get('projectiles') as ProjectileManager | undefined;
    }

    private onEquipEvent(payload: { weaponId?: string }): void {
        if (isWeaponId(payload?.weaponId)) {
            this.equip(payload.weaponId);
        }
    }
}

// Reexportado só para o HUD não precisar importar de dois lugares.
export type { ProjectileTarget };
