import { describe, expect, it } from 'vitest';
import { heliocentricPosition } from '../src/astro/ephemeris';
import { issState } from '../src/astro/iss';
import { type Vec3, normalize, scale } from '../src/astro/math';
import { moonPeriodDays, moonPosition } from '../src/astro/moons';
import { sunlightFraction } from '../src/astro/shadow';
import { AU_KM, PLANETS, type PlanetId } from '../src/data/planets';
import { ISS_DATA_START_MS } from '../src/astro/iss';

function light(parent: PlanetId, position: Vec3, t: number): number {
  const helio = heliocentricPosition(parent, t);
  const dist = Math.hypot(...helio);
  return sunlightFraction(position, normalize(scale(helio, -1)), dist * AU_KM, PLANETS[parent].radiusKm);
}

describe('ombre des planètes', () => {
  it('éclaire entièrement le côté jour et éteint l’axe de l’ombre', () => {
    const toSun: Vec3 = [1, 0, 0];
    expect(sunlightFraction([7000, 0, 0], toSun, AU_KM, 6371)).toBe(1);
    expect(sunlightFraction([-7000, 0, 0], toSun, AU_KM, 6371)).toBe(0);
    expect(sunlightFraction([-7000, 9000, 0], toSun, AU_KM, 6371)).toBe(1);
    const edge = sunlightFraction([-384_400, 6371, 0], toSun, AU_KM, 6371);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });

  it('reproduit l’éclipse totale de Lune du 14 mars 2025 (maximum vers 6 h 59 UTC)', () => {
    const t = Date.UTC(2025, 2, 14, 6, 59);
    expect(light('earth', moonPosition('moon', t), t)).toBeLessThan(0.15);
    // Douze heures plus tôt, la Lune est hors de l'ombre.
    expect(light('earth', moonPosition('moon', t - 12 * 3_600_000), t - 12 * 3_600_000)).toBe(1);
  });

  it('plonge Io dans l’ombre de Jupiter environ 5 % de chaque révolution', () => {
    const t0 = Date.UTC(2026, 9, 29);
    const period = moonPeriodDays('io') * 86_400_000;
    let dark = 0;
    const n = 2000;
    for (let k = 0; k < n; k++) {
      const t = t0 + (k / n) * period;
      if (light('jupiter', moonPosition('io', t), t) < 0.5) dark++;
    }
    expect(dark / n).toBeGreaterThan(0.04);
    expect(dark / n).toBeLessThan(0.07);
  });

  it('fait passer l’ISS dans l’ombre de la Terre pendant une partie de son orbite', () => {
    // Fraction de chaque révolution passée dans l'ombre, sur la période des données : au plus environ 40 %
    // (orbite dont le plan contient la direction du Soleil), parfois 0 (Soleil presque perpendiculaire au plan).
    let maxDark = 0;
    for (let day = 0; day < 14; day++) {
      let dark = 0;
      const n = 300;
      for (let k = 0; k < n; k++) {
        const t = ISS_DATA_START_MS + day * 86_400_000 + (k / n) * 93 * 60_000;
        if (light('earth', issState(t)!.position, t) < 0.5) dark++;
      }
      expect(dark / n).toBeLessThan(0.42);
      maxDark = Math.max(maxDark, dark / n);
    }
    expect(maxDark).toBeGreaterThan(0.25);
  });
});
