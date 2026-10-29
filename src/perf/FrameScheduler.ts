/**
 * Boucle d'animation avec plafond d'images par seconde et ajustement
 * dynamique de la résolution.
 *
 * - En mode horloge (rien ne bouge vite), la cadence est réduite (idleFps),
 *   ce qui limite l'échauffement et la consommation du Fire TV.
 * - Quand l'application est masquée (mise en arrière-plan), requestAnimationFrame
 *   est suspendu par le navigateur et la boucle s'arrête d'elle-même.
 */

export class FrameScheduler {
  private handle = 0;
  private lastRender = 0;
  private running = false;

  constructor(
    private readonly onFrame: (dtSeconds: number, now: number) => void,
    private readonly targetFps: () => number,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastRender = 0;
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.handle = requestAnimationFrame(this.tick);
    const interval = 1000 / this.targetFps();
    const elapsed = now - this.lastRender;
    // Tolérance de 3 ms pour ne pas sauter d'image à cause de la gigue de vsync.
    if (this.lastRender !== 0 && elapsed < interval - 3) return;
    const dt = this.lastRender === 0 ? 1 / 60 : Math.min(0.1, elapsed / 1000);
    this.lastRender = now;
    this.onFrame(dt, now);
  };
}

/**
 * Ajustement dynamique de la résolution (logique pure, testable).
 * Si les images arrivent nettement plus lentement que visé, on réduit
 * l'échelle de rendu ; si la marge redevient confortable, on l'augmente.
 */
export class AdaptiveResolution {
  private avgMs = 0;
  private slowSince: number | null = null;
  private fastSince: number | null = null;

  constructor(
    private readonly minScale: number,
    private readonly maxScale: number,
  ) {}

  /** Retourne la nouvelle échelle, ou null si inchangée. */
  sample(frameMs: number, targetFps: number, now: number, scale: number): number | null {
    this.avgMs = this.avgMs === 0 ? frameMs : this.avgMs * 0.92 + frameMs * 0.08;
    const budget = 1000 / targetFps;
    if (this.avgMs > budget * 1.35) {
      this.fastSince = null;
      this.slowSince ??= now;
      if (now - this.slowSince > 4_000 && scale > this.minScale + 1e-3) {
        this.slowSince = now;
        return Math.max(this.minScale, scale - 0.1);
      }
    } else if (this.avgMs < budget * 1.1) {
      this.slowSince = null;
      this.fastSince ??= now;
      if (now - this.fastSince > 15_000 && scale < this.maxScale - 1e-3) {
        this.fastSince = now;
        return Math.min(this.maxScale, scale + 0.05);
      }
    } else {
      this.slowSince = null;
      this.fastSince = null;
    }
    return null;
  }

  reset(): void {
    this.avgMs = 0;
    this.slowSince = null;
    this.fastSince = null;
  }

  get averageFrameMs(): number {
    return this.avgMs;
  }
}
