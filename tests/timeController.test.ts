import { describe, expect, it } from 'vitest';
import { MAX_SIM_MS, SPEED_STEPS, TimeController } from '../src/time/TimeController';

function fakeClock(start = Date.UTC(2026, 9, 29, 20, 0)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('TimeController', () => {
  it('suit l’horloge système en temps réel', () => {
    const c = fakeClock();
    const tc = new TimeController(c.now);
    expect(tc.now()).toBe(c.now());
    c.advance(12_345);
    expect(tc.now()).toBe(c.now());
    expect(tc.snapshot().isRealTime).toBe(true);
  });

  it('fige le temps en pause et signale la simulation', () => {
    const c = fakeClock();
    const tc = new TimeController(c.now);
    tc.setPaused(true);
    const frozen = tc.now();
    c.advance(60_000);
    expect(tc.now()).toBe(frozen);
    const s = tc.snapshot();
    expect(s.isRealTime).toBe(false);
    expect(s.paused).toBe(true);
    tc.setPaused(false);
    c.advance(1_000);
    expect(tc.now()).toBe(frozen + 1_000);
  });

  it('accélère le temps selon le facteur choisi', () => {
    const c = fakeClock();
    const tc = new TimeController(c.now);
    const start = tc.now();
    tc.setRate(3_600);
    c.advance(2_000);
    expect(tc.now()).toBe(start + 2 * 3_600_000);
    expect(tc.snapshot().mode).toBe('simulated');
  });

  it('change de vitesse sans saut de temps', () => {
    const c = fakeClock();
    const tc = new TimeController(c.now);
    tc.setRate(60);
    c.advance(10_000);
    const before = tc.now();
    tc.faster();
    expect(tc.now()).toBe(before);
    expect(tc.getRate()).toBe(600);
    c.advance(1_000);
    expect(tc.now()).toBe(before + 600_000);
  });

  it('parcourt les paliers de vitesse dans les deux sens', () => {
    const tc = new TimeController(fakeClock().now);
    for (let k = 1; k < SPEED_STEPS.length; k++) {
      tc.faster();
      expect(tc.getRate()).toBe(SPEED_STEPS[k]);
    }
    tc.faster();
    expect(tc.getRate()).toBe(SPEED_STEPS[SPEED_STEPS.length - 1]);
    for (let k = SPEED_STEPS.length - 2; k >= 0; k--) {
      tc.slower();
      expect(tc.getRate()).toBe(SPEED_STEPS[k]);
    }
  });

  it('revient à l’heure actuelle', () => {
    const c = fakeClock();
    const tc = new TimeController(c.now);
    tc.setRate(86_400);
    c.advance(5_000);
    expect(tc.now()).not.toBe(c.now());
    tc.resetToNow();
    expect(tc.now()).toBe(c.now());
    expect(tc.snapshot().isRealTime).toBe(true);
    expect(tc.getRate()).toBe(1);
  });

  it('permet de démarrer à un instant donné, en pause', () => {
    const c = fakeClock();
    const tc = new TimeController(c.now);
    const target = Date.UTC(2024, 5, 20, 20, 51);
    tc.jumpTo(target, { paused: true });
    c.advance(10_000);
    expect(tc.now()).toBe(target);
  });

  it('s’arrête à la limite de validité du modèle', () => {
    const c = fakeClock();
    const tc = new TimeController(c.now);
    tc.jumpTo(MAX_SIM_MS - 1_000, { rate: 2_629_800 });
    let notified = 0;
    tc.onChange(() => notified++);
    c.advance(10_000);
    expect(tc.now()).toBe(MAX_SIM_MS);
    const s = tc.snapshot();
    expect(s.paused).toBe(true);
    expect(s.limitReached).toBe(true);
    expect(notified).toBeGreaterThan(0);
  });
});
