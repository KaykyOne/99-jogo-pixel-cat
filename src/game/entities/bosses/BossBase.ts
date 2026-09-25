import { GameObjects, Math as PhaserMath, Scene } from 'phaser';

import { BaseEnemy } from '../BaseEnemy';
import { Player } from '../Player';
import { drawIcon, drawWoodFrame, HUD_PANEL, UI_COLORS, UI_CSS, uiTextOutlined } from '../../ui/ui-theme';
import { BOSS_INTROS_SEEN_KEY, BossDefinition, BossPatternDef } from './boss-config';

// Etapas de um padrão. É esta separação em três tempos que diferencia um boss
// de um inimigo comum com muita vida: o jogador SEMPRE tem uma janela para ler
// o que vem (telegraph) e uma para revidar (recover).
type PatternStage = 'idle' | 'telegraph' | 'execute' | 'recover';

// Distância em que a barra do boss acende. Um pouco mais que meia tela: o
// jogador vê a barra aparecer quando o boss entra no campo de visão.
const ENGAGE_DISTANCE = 620;

const BAR_WIDTH = 360;
const BAR_HEIGHT = 16;

// Respiro entre fechar a fala de abertura e o primeiro golpe: fechar o
// diálogo e já levar uma investida na cara seria injusto.
const POST_INTRO_GRACE_MS = 700;

// Payload de 'boss:intro'. A cena abre o diálogo, pausa o mundo e chama
// onDone ao fechar — o boss não conhece a caixa de diálogo.
export type BossIntroRequest = {
    speaker: string;
    lines: string[];
    bossX: number;
    onDone: () => void;
};

// Base dos bosses dedicados: máquina de estados com padrões alternados,
// telegrafo visível, duas fases de luta e barra de vida com nome.
//
// O que cada boss implementa é só o EFEITO de cada padrão; toda a coreografia
// (escolher, telegrafar, executar, se recuperar, virar a fase) mora aqui.
export abstract class BossBase extends BaseEnemy {
    protected readonly definition: BossDefinition;

    // Fase da LUTA (1 ou 2), não a fase do mundo. Nomeada assim porque é o
    // vocabulário do briefing; `phaseIndex` do jogo é outra coisa.
    protected bossPhase: 1 | 2 = 1;

    private stage: PatternStage = 'idle';
    private stageTimer = 0;
    private currentPattern: BossPatternDef | null = null;
    // Cursor de rodízio. Alternar em ordem, e não sortear, é o que torna a
    // luta aprendível: sorteio puro produz três investidas seguidas e o
    // jogador conclui, com razão, que o boss é injusto.
    private patternCursor = 0;
    private nextPatternAt = 0;
    // Marca que o efeito de execução já saiu neste padrão (o golpe acontece
    // uma vez, não a cada frame da janela de execução).
    private executed = false;
    // Fala de abertura: 'pending' até o jogador chegar perto, 'playing'
    // enquanto o diálogo está aberto, 'done' libera os padrões.
    private introState: 'pending' | 'playing' | 'done' = 'pending';

    private readonly barFrame: GameObjects.Graphics;
    private readonly barFill: GameObjects.Rectangle;
    private readonly barLabel: GameObjects.Text;
    private readonly barPhaseTag: GameObjects.Text;
    private telegraphTween?: Phaser.Tweens.Tween;

    // Recuperação extra somada à do padrão atual (o javali tonto depois de
    // bater na parede). Consumida ao entrar em 'recover'.
    protected extraRecoverMs = 0;

    protected constructor(scene: Scene, x: number, y: number, definition: BossDefinition, target: Player) {
        super(scene, x, y, definition.artKey, target, definition.stats, definition.scale);

        this.definition = definition;

        // Barra fixa no topo da tela (e não flutuando sobre a cabeça): um boss
        // que atravessa a arena inteira levaria a barra para fora do campo de
        // visão bem na hora em que ela mais importa.
        this.barFrame = scene.add.graphics().setScrollFactor(0).setDepth(30);
        this.barFill = scene.add
            .rectangle(0, 0, BAR_WIDTH, BAR_HEIGHT, UI_COLORS.red)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(31);
        this.barLabel = scene.add
            .text(0, 0, definition.name, uiTextOutlined(17, UI_CSS.cream))
            .setOrigin(0.5, 1)
            .setScrollFactor(0)
            .setDepth(31);
        this.barPhaseTag = scene.add
            .text(0, 0, '', uiTextOutlined(13, '#ff9a3c'))
            .setOrigin(1, 1)
            .setScrollFactor(0)
            .setDepth(31)
            .setVisible(false);

        this.layoutBar();
        scene.scale.on('resize', this.layoutBar, this);
    }

    protected isBossEnemy(): boolean {
        return true;
    }

    get displayName(): string {
        return this.definition.name;
    }

    // Mesma razão do resto do HUD: sem isto a barra do boss aparece espelhada
    // dentro d'água na floresta, que é justamente onde ele mora.
    get hudObjects(): GameObjects.GameObject[] {
        return [this.barFrame, this.barFill, this.barLabel, this.barPhaseTag];
    }

    update(time: number, delta: number): void {
        super.update(time, delta);
        this.refreshBar();
        this.checkPhaseTransition();
    }

    // O BaseEnemy chama isto quando o jogador está dentro do attackRange — que
    // para um boss é a arena inteira (ver bossCombat em boss-config). Ou seja:
    // a partir daqui a máquina de estados do boss assume o controle.
    protected updateAttack(time: number): void {
        const delta = this.scene.game.loop.delta;
        // Ação física em andamento (sapo no ar, língua esticada): a subclasse
        // é dona do corpo e a coreografia espera, sem mexer na velocidade.
        if (this.isActionLocked()) {
            return;
        }
        if (this.introState !== 'done') {
            this.updateIntro(time, delta);
            return;
        }

        const scale = this.bossPhase === 2 ? this.definition.phase2TimeScale : 1;

        switch (this.stage) {
            case 'idle':
                this.runIdle(time);
                break;

            case 'telegraph':
                this.stageTimer -= delta;
                this.setVelocityX(0);
                if (this.stageTimer <= 0) {
                    this.enterStage('execute', (this.currentPattern?.executeMs ?? 400) * scale);
                    this.clearTelegraph();
                }
                break;

            case 'execute':
                this.stageTimer -= delta;
                if (this.currentPattern) {
                    if (!this.executed) {
                        this.executed = true;
                        this.onPatternStart(this.currentPattern.id);
                    }
                    this.onPatternUpdate(this.currentPattern.id, delta);
                }
                if (this.stageTimer <= 0) {
                    this.currentPattern && this.onPatternEnd(this.currentPattern.id);
                    const recover = (this.currentPattern?.recoverMs ?? 600) * scale + this.extraRecoverMs;
                    this.extraRecoverMs = 0;
                    this.enterStage('recover', recover);
                }
                break;

            case 'recover':
                this.stageTimer -= delta;
                // Freia, mas não trava: parar de imediato faria a investida
                // terminar como se tivesse batido numa parede invisível.
                this.setVelocityX(this.arcadeBody.velocity.x * 0.86);
                this.play(this.recoverAnimationKey(), true);
                if (this.stageTimer <= 0) {
                    this.stage = 'idle';
                    this.currentPattern = null;
                }
                break;
        }
    }

    // Fora do alcance (ou com o jogador morto) o boss volta a andar de um lado
    // para o outro na arena, em vez de congelar.
    protected updatePatrol(delta: number): void {
        if (this.isActionLocked()) {
            return;
        }
        this.stage = 'idle';
        this.currentPattern = null;
        this.clearTelegraph();
        super.updatePatrol(delta);
    }

    // --- Ganchos das subclasses ---------------------------------------------
    // Chamado uma vez, no primeiro frame da execução do padrão.
    protected abstract onPatternStart(patternId: string): void;
    // Chamado todo frame enquanto o padrão executa (a investida usa isto).
    protected onPatternUpdate(_patternId: string, _delta: number): void {}
    // Chamado ao fim da janela de execução.
    protected onPatternEnd(_patternId: string): void {}
    // Chamado uma vez, ao cruzar o limiar da fase 2.
    protected onEnterPhase2(): void {}
    // Verdadeiro enquanto a subclasse controla o corpo sozinha (ver
    // updateAttack). Nada de coreografia, patrulha ou freio nesse meio-tempo.
    protected isActionLocked(): boolean {
        return false;
    }
    // Animação do windup de cada padrão. Padrão: a sequência de ataque.
    protected telegraphAnimationKey(_patternId: string): string {
        return `${this.artAnimationPrefix}-attack-1`;
    }
    // Animação da abertura depois do golpe.
    protected recoverAnimationKey(): string {
        return `${this.artAnimationPrefix}-idle`;
    }

    // Termina a execução do padrão agora (o golpe acabou antes da janela).
    protected endExecuteEarly(): void {
        if (this.stage === 'execute') {
            this.stageTimer = 0;
        }
    }

    // Padrão em windup neste instante, ou null. O javali levanta poeira
    // enquanto cava o chão, por exemplo.
    protected get telegraphingPatternId(): string | null {
        return this.stage === 'telegraph' ? this.currentPattern?.id ?? null : null;
    }

    protected get artAnimationPrefix(): string {
        return this.definition.artKey;
    }

    protected get facingDirection(): number {
        return this.target.x >= this.x ? 1 : -1;
    }

    // Distância horizontal até o alvo, usada pela escolha de padrão e por
    // praticamente todo padrão concreto.
    protected get distanceToTarget(): number {
        return Math.abs(this.target.x - this.x);
    }

    destroy(fromScene?: boolean): void {
        this.scene?.scale.off('resize', this.layoutBar, this);
        this.telegraphTween?.remove();
        this.barFrame.destroy();
        this.barFill.destroy();
        this.barLabel.destroy();
        this.barPhaseTag.destroy();
        super.destroy(fromScene);
    }

    // --- Coreografia --------------------------------------------------------
    // Antes do primeiro golpe: patrulha até o jogador entrar no campo de visão
    // (a mesma distância que acende a barra) e então pede a fala de abertura.
    private updateIntro(time: number, delta: number): void {
        if (this.introState === 'playing') {
            this.setVelocityX(0);
            return;
        }

        const seen = (this.scene.registry.get(BOSS_INTROS_SEEN_KEY) as string[] | undefined) ?? [];
        // Sem ninguém ouvindo o evento, a fala nunca fecharia e o boss ficaria
        // parado para sempre: nesse caso a luta começa direto.
        if (seen.includes(this.definition.key) || this.scene.events.listenerCount('boss:intro') === 0) {
            this.finishIntro(time);
            return;
        }

        if (this.distanceToTarget > ENGAGE_DISTANCE) {
            this.updatePatrol(delta);
            return;
        }

        this.scene.registry.set(BOSS_INTROS_SEEN_KEY, [...seen, this.definition.key]);
        this.introState = 'playing';
        this.setVelocityX(0);
        this.setFlipX(this.facingDirection < 0);
        this.play(`${this.artAnimationPrefix}-idle`, true);

        const request: BossIntroRequest = {
            speaker: this.definition.name,
            lines: this.definition.intro,
            bossX: this.x,
            onDone: () => this.finishIntro(this.scene.game.loop.time)
        };
        this.scene.events.emit('boss:intro', request);
    }

    private finishIntro(time: number): void {
        this.introState = 'done';
        this.nextPatternAt = time + POST_INTRO_GRACE_MS;
    }

    private runIdle(time: number): void {
        const direction = this.facingDirection;
        this.setFlipX(direction < 0);

        if (time < this.nextPatternAt) {
            this.approachIdealRange(direction);
            return;
        }

        const pattern = this.pickPattern();
        if (!pattern) {
            // Nenhum padrão serve para a distância atual: se aproxima até que
            // um sirva, em vez de ficar parado à espera de nada.
            this.approachIdealRange(direction);
            return;
        }

        this.currentPattern = pattern;
        this.executed = false;
        this.nextPatternAt = time + this.stats.combat.cooldownMs;

        const scale = this.bossPhase === 2 ? this.definition.phase2TimeScale : 1;
        this.enterStage('telegraph', pattern.telegraphMs * scale);
        this.startTelegraph(pattern.id);
    }

    // Rodízio: percorre a lista a partir do cursor e pega o primeiro padrão
    // liberado pela fase atual e compatível com a distância. Volta null se
    // nenhum serve.
    private pickPattern(): BossPatternDef | null {
        const patterns = this.definition.patterns;
        const distance = this.distanceToTarget;

        for (let offset = 0; offset < patterns.length; offset++) {
            const index = (this.patternCursor + offset) % patterns.length;
            const candidate = patterns[index];

            if (candidate.minBossPhase > this.bossPhase) {
                continue;
            }
            if (distance < candidate.minRange || distance > candidate.maxRange) {
                continue;
            }

            this.patternCursor = (index + 1) % patterns.length;
            return candidate;
        }

        return null;
    }

    private approachIdealRange(direction: number): void {
        this.setVelocityX(this.stats.combat.chaseSpeed * direction);
        this.play(`${this.artAnimationPrefix}-walk`, true);
    }

    private enterStage(stage: PatternStage, durationMs: number): void {
        this.stage = stage;
        this.stageTimer = durationMs;
    }

    // Windup visível: o boss encolhe/pulsa e ganha um contorno claro. É a
    // única informação que o jogador tem antes do golpe, então precisa ser
    // impossível de perder de vista — vale mais que qualquer barra na tela.
    private startTelegraph(patternId: string): void {
        this.setVelocityX(0);
        this.play(this.telegraphAnimationKey(patternId), true);
        this.setTint(0xffe08a);

        this.telegraphTween?.remove();
        this.telegraphTween = this.scene.tweens.add({
            targets: this,
            scaleX: this.definition.scale * 1.08,
            scaleY: this.definition.scale * 0.94,
            duration: 140,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });
    }

    private clearTelegraph(): void {
        this.telegraphTween?.remove();
        this.telegraphTween = undefined;
        this.setScale(this.definition.scale);
        // Só limpa o tint se não houver estado de dano pintando por cima.
        if (this.currentState !== 'hurt') {
            this.clearTint();
        }
    }

    private checkPhaseTransition(): void {
        if (this.bossPhase === 2 || !this.isAlive) {
            return;
        }

        const ratio = this.healthInfo.current / this.healthInfo.max;
        if (ratio > this.definition.phase2HpRatio) {
            return;
        }

        this.bossPhase = 2;
        this.barFill.setFillStyle(0xff7a2f);
        this.barPhaseTag.setText('FASE 2').setVisible(true);

        // Interrompe o que estiver acontecendo: a virada de fase é um beat da
        // luta, não um detalhe que passa por baixo de uma investida em curso.
        this.stage = 'recover';
        this.stageTimer = 600;
        this.clearTelegraph();

        const shock = this.scene.add.circle(this.x, this.y, 30, 0xff7a2f, 0.45).setDepth(19);
        this.scene.tweens.add({
            targets: shock,
            radius: 320,
            alpha: 0,
            duration: 520,
            ease: 'Quad.out',
            onComplete: () => shock.destroy()
        });
        this.scene.cameras.main.shake(320, 0.012);

        this.onEnterPhase2();
    }

    private refreshBar(): void {
        const ratio = PhaserMath.Clamp(this.healthInfo.current / this.healthInfo.max, 0, 1);
        this.barFill.width = BAR_WIDTH * ratio;

        // A barra só aparece com a luta em andamento. Um boss vivo do outro
        // lado da fase deixava a barra ligada desde o spawn, anunciando um
        // combate que ainda está a dois mil pixels de distância.
        const visible = this.isAlive && Math.abs(this.target.x - this.x) <= ENGAGE_DISTANCE;
        this.barFrame.setVisible(visible);
        this.barFill.setVisible(visible);
        this.barLabel.setVisible(visible);
        this.barPhaseTag.setVisible(visible && this.bossPhase === 2);
    }

    private layoutBar(): void {
        // Centralizada, mas sem invadir a tábua do HUD do canto esquerdo em
        // telas estreitas.
        const frameWidth = BAR_WIDTH + 58;
        const centerX = Math.max(
            this.scene.scale.width / 2,
            HUD_PANEL.x + HUD_PANEL.width + 20 + frameWidth / 2
        );
        // Topo, e não rodapé: os seis slots do inventário ocupam a faixa de
        // baixo (altura - 82 até altura - 26) e a barra do boss caía bem em
        // cima deles. Aqui ela fica entre o painel da fase (à esquerda) e a
        // linha de controles (à direita), sem encostar em nenhum dos dois.
        const y = 72;

        // Tábua com a caveira à esquerda e o trilho escuro por baixo da vida.
        const barLeft = centerX - BAR_WIDTH / 2;
        const frameLeft = barLeft - 44;
        this.barFrame.clear();
        drawWoodFrame(this.barFrame, frameLeft, y - 18, frameWidth, 36);
        this.barFrame.fillStyle(0x1a0f08, 1).fillRect(barLeft - 2, y - BAR_HEIGHT / 2 - 2, BAR_WIDTH + 4, BAR_HEIGHT + 4);
        drawIcon(this.barFrame, 'skull', frameLeft + 22, y, 20);

        this.barFill.setPosition(barLeft, y);
        this.barLabel.setPosition(centerX, y - 22);
        this.barPhaseTag.setPosition(centerX + BAR_WIDTH / 2, y - 22);
    }
}
