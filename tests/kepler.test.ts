import { describe, expect, it } from 'vitest';
import { orbitalPlanePosition, positionFromElements, sampleOrbit, solveKepler } from '../src/astro/kepler';
import { elementsAt, heliocentricPosition, eclipticCoordinates } from '../src/astro/ephemeris';
import { ELEMENTS_1800_2050 } from '../src/data/orbitalElements';
import { PLANETS, PLANET_IDS } from '../src/data/planets';
import { longitudeDiffDeg } from './helpers/reference';

describe('équation de Kepler', () => {
  it('vérifie E − e sin E = M pour des excentricités variées', () => {
    for (const e of [0, 0.0167, 0.0934, 0.2056, 0.5, 0.9]) {
      for (let k = -12; k <= 12; k++) {
        const M = (k / 12) * Math.PI * 0.999;
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 12);
      }
    }
  });

  it('donne une orbite circulaire triviale pour e = 0', () => {
    expect(solveKepler(1.234, 0)).toBeCloseTo(1.234, 14);
  });

  it('place le périhélie à a(1 − e) et l’aphélie à a(1 + e)', () => {
    const [xp, yp] = orbitalPlanePosition(2, 0.25, 0);
    expect(Math.hypot(xp, yp)).toBeCloseTo(1.5, 12);
    const [xa, ya] = orbitalPlanePosition(2, 0.25, Math.PI);
    expect(Math.hypot(xa, ya)).toBeCloseTo(2.5, 12);
  });

  it('conserve la distance lors de la rotation vers l’écliptique', () => {
    const el = { a: 1.5, e: 0.09, i: 0.03, node: 0.86, argPeri: 5.0, M: 2.0 };
    const p = positionFromElements(el);
    const E = solveKepler(el.M, el.e);
    expect(Math.hypot(...p)).toBeCloseTo(el.a * (1 - el.e * Math.cos(E)), 12);
  });

  it('échantillonne une orbite dont tous les points sont sur l’ellipse', () => {
    const el = elementsAt('mars', 0.25);
    const pts = sampleOrbit(el, 64);
    for (const p of pts) {
      const r = Math.hypot(...p);
      expect(r).toBeGreaterThanOrEqual(el.a * (1 - el.e) - 1e-9);
      expect(r).toBeLessThanOrEqual(el.a * (1 + el.e) + 1e-9);
    }
  });
});

describe('périodes orbitales', () => {
  it('déduit des taux de longitude moyenne des périodes conformes aux valeurs connues (±0,5 %)', () => {
    for (const id of PLANET_IDS) {
      const periodDays = (360 / ELEMENTS_1800_2050[id].LDot) * 36525;
      expect(Math.abs(periodDays / PLANETS[id].orbitalPeriodDays - 1)).toBeLessThan(0.005);
    }
  });

  it('ramène chaque planète à la même longitude après une période sidérale', () => {
    const t0 = Date.UTC(2001, 0, 1);
    for (const id of ['mercury', 'venus', 'earth', 'mars'] as const) {
      const periodMs = (360 / ELEMENTS_1800_2050[id].LDot) * 36525 * 86_400_000;
      const a = eclipticCoordinates(heliocentricPosition(id, t0)).lonDeg;
      const b = eclipticCoordinates(heliocentricPosition(id, t0 + periodMs)).lonDeg;
      // Seule la lente précession du périhélie et du nœud subsiste.
      expect(longitudeDiffDeg(a, b)).toBeLessThan(0.05);
    }
  });

  it('fait tourner les planètes à des vitesses angulaires différentes (Mercure ≫ Neptune)', () => {
    const t0 = Date.UTC(2026, 0, 1);
    const t1 = t0 + 30 * 86_400_000;
    const speed = (id: (typeof PLANET_IDS)[number]) =>
      longitudeDiffDeg(
        eclipticCoordinates(heliocentricPosition(id, t1)).lonDeg,
        eclipticCoordinates(heliocentricPosition(id, t0)).lonDeg,
      );
    const speeds = PLANET_IDS.map(speed);
    for (let k = 1; k < speeds.length; k++) expect(speeds[k]).toBeLessThan(speeds[k - 1]);
    // Mercure parcourt environ 120° en 30 jours (selon la position sur son orbite excentrique).
    expect(speeds[0]).toBeGreaterThan(90);
    expect(speeds[0]).toBeLessThan(190);
    // Neptune : environ 0,18°.
    expect(speeds[7]).toBeGreaterThan(0.15);
    expect(speeds[7]).toBeLessThan(0.21);
  });
});
