/**
 * Gestion du temps de la scène : temps réel ou simulation.
 *
 * - Mode « temps réel » : la scène suit l'horloge système (Date.now()).
 * - Mode « simulation » : temps simulé = ancre + (temps réel écoulé) × vitesse,
 *   ou figé si la simulation est en pause.
 *
 * Le temps simulé est limité au domaine de validité du modèle astronomique
 * (années −2999 à 2999) : à la limite, la simulation se met en pause.
 */

export const SPEED_STEPS: readonly number[] = [1, 60, 600, 3_600, 21_600, 86_400, 604_800, 2_629_800];

export const MIN_SIM_MS = Date.UTC(-2999, 0, 1);
export const MAX_SIM_MS = Date.UTC(2999, 11, 31);

export type TimeMode = 'live' | 'simulated';

export interface TimeSnapshot {
  /** Instant affiché par la scène (ms UTC). */
  simMs: number;
  /** Instant réel (horloge système). */
  realMs: number;
  mode: TimeMode;
  paused: boolean;
  /** Facteur d'accélération (1 = vitesse réelle). */
  rate: number;
  /** Vrai si la scène montre exactement l'heure réelle. */
  isRealTime: boolean;
  /** Vrai si la limite du modèle a été atteinte. */
  limitReached: boolean;
}

export type Clock = () => number;

export class TimeController {
  private mode: TimeMode = 'live';
  private paused = false;
  private rate = 1;
  private anchorReal = 0;
  private anchorSim = 0;
  private limitReached = false;
  private listeners = new Set<() => void>();

  constructor(private readonly clock: Clock = () => Date.now()) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Instant simulé courant (ms UTC). */
  now(): number {
    const real = this.clock();
    if (this.mode === 'live') return real;
    if (this.paused) return this.anchorSim;
    const sim = this.anchorSim + (real - this.anchorReal) * this.rate;
    if (sim > MAX_SIM_MS || sim < MIN_SIM_MS) {
      this.reanchor(Math.min(MAX_SIM_MS, Math.max(MIN_SIM_MS, sim)));
      this.paused = true;
      this.limitReached = true;
      this.emit();
      return this.anchorSim;
    }
    return sim;
  }

  snapshot(): TimeSnapshot {
    const simMs = this.now();
    return {
      simMs,
      realMs: this.clock(),
      mode: this.mode,
      paused: this.paused,
      rate: this.rate,
      isRealTime: this.mode === 'live',
      limitReached: this.limitReached,
    };
  }

  getRate(): number {
    return this.rate;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isLive(): boolean {
    return this.mode === 'live';
  }

  /** Fixe l'ancre au temps simulé courant (avant tout changement de vitesse). */
  private reanchor(simMs = this.now()): void {
    this.anchorSim = simMs;
    this.anchorReal = this.clock();
  }

  private enterSimulation(): void {
    if (this.mode === 'live') {
      this.reanchor(this.clock());
      this.mode = 'simulated';
    } else {
      this.reanchor();
    }
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.enterSimulation();
    this.paused = paused;
    if (!paused) this.limitReached = false;
    this.emit();
  }

  setRate(rate: number): void {
    this.enterSimulation();
    this.rate = rate;
    this.emit();
  }

  /** Passe au palier de vitesse supérieur. */
  faster(): void {
    const next = SPEED_STEPS.find((s) => s > this.rate);
    if (next !== undefined) this.setRate(next);
    if (this.paused) this.setPaused(false);
  }

  /** Passe au palier de vitesse inférieur (jusqu'à ×1). */
  slower(): void {
    const lower = [...SPEED_STEPS].reverse().find((s) => s < this.rate);
    if (lower !== undefined) this.setRate(lower);
  }

  /** Retour à l'heure actuelle, en temps réel. */
  resetToNow(): void {
    this.mode = 'live';
    this.paused = false;
    this.rate = 1;
    this.limitReached = false;
    this.emit();
  }

  /** Démarre une simulation à un instant donné (en pause si demandé). */
  jumpTo(simMs: number, options: { paused?: boolean; rate?: number } = {}): void {
    this.mode = 'simulated';
    this.anchorSim = Math.min(MAX_SIM_MS, Math.max(MIN_SIM_MS, simMs));
    this.anchorReal = this.clock();
    this.paused = options.paused ?? false;
    this.rate = options.rate ?? this.rate;
    this.limitReached = false;
    this.emit();
  }
}
