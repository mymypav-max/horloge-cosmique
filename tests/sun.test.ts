import { describe, expect, it } from 'vitest';
import { heliocentricPosition } from '../src/astro/ephemeris';
import { angularDiameter, sunAngularDiameterDeg } from '../src/astro/sun';
import { PLANET_IDS } from '../src/data/planets';
import { apparentSunRadius, displayedSunGlow, displayedSunRadius } from '../src/representation/sunScale';
import { SUN_VISUAL_RADIUS } from '../src/representation/visualScale';

const dist = (id: (typeof PLANET_IDS)[number], t: number) => Math.hypot(...heliocentricPosition(id, t));

describe('taille apparente du Soleil', () => {
  it('applique θ = 2·arcsin(D / 2r)', () => {
    expect(angularDiameter(2, 1)).toBeCloseTo(Math.PI, 12);
    expect(angularDiameter(1, 1e6)).toBeCloseTo(1e-6, 15);
    // D = 1 391 400 km (rayon nominal IAU 2015 : 695 700 km), r = 1 UA : 0,5329°.
    expect(sunAngularDiameterDeg(1)).toBeCloseTo(0.5329, 4);
    expect((2 * Math.asin(695_700 / 149_597_870.7) * 180) / Math.PI).toBeCloseTo(sunAngularDiameterDeg(1), 12);
  });

  it('varie entre périhélie et aphélie terrestres (0,524° à 0,542°)', () => {
    let min = Infinity;
    let max = 0;
    for (let k = 0; k < 365; k++) {
      const theta = sunAngularDiameterDeg(dist('earth', Date.UTC(2026, 0, 1) + k * 86_400_000));
      min = Math.min(min, theta);
      max = Math.max(max, theta);
    }
    expect(min).toBeGreaterThan(0.523);
    expect(min).toBeLessThan(0.526);
    expect(max).toBeGreaterThan(0.54);
    expect(max).toBeLessThan(0.543);
  });

  it('classe les planètes : Mercure > Vénus > Terre > Mars > … > Neptune', () => {
    const t = Date.UTC(2026, 9, 29);
    const sizes = PLANET_IDS.map((id) => sunAngularDiameterDeg(dist(id, t)));
    for (let k = 1; k < sizes.length; k++) expect(sizes[k]).toBeLessThan(sizes[k - 1]);
    expect(sizes[0]).toBeGreaterThan(1.1); // Mercure : 1,1° à 1,7°
    expect(sizes[7]).toBeLessThan(0.02); // Neptune : environ 1′
  });

  it('est déterministe', () => {
    const t = Date.UTC(2031, 2, 3, 4, 5);
    expect(sunAngularDiameterDeg(dist('mars', t))).toBe(sunAngularDiameterDeg(dist('mars', t)));
  });
});

describe('affichage du Soleil (représentation)', () => {
  it('donne exactement la taille apparente réelle vue de la caméra en vue rapprochée', () => {
    for (const [d, r] of [
      [6, 1],
      [3.3, 0.387],
      [19.9, 30.07],
    ]) {
      const R = apparentSunRadius(d, r);
      const seen = (angularDiameter(2 * R, d) * 180) / Math.PI;
      expect(seen).toBeCloseTo(sunAngularDiameterDeg(r), 9);
    }
  });

  it('ne change pas la vue générale et passe progressivement à la taille réelle', () => {
    expect(displayedSunRadius(0, 25, 1)).toBe(SUN_VISUAL_RADIUS);
    expect(displayedSunRadius(1, 6, 1)).toBeCloseTo(apparentSunRadius(6, 1), 12);
    let previous = displayedSunRadius(0, 6, 1);
    for (let k = 1; k <= 100; k++) {
      const r = displayedSunRadius(k / 100, 6, 1);
      expect(r).toBeLessThanOrEqual(previous);
      // Pas de saut : au plus 6 % de variation par centième de transition.
      expect(r / previous).toBeGreaterThan(0.94);
      previous = r;
    }
  });

  it('garde un halo visible même lorsque le disque est minuscule (Neptune)', () => {
    const radius = displayedSunRadius(1, 19.9, 30.07);
    const glow = displayedSunGlow(1, radius, 19.9);
    expect(glow).toBeGreaterThan(radius * 6.2);
    expect(displayedSunGlow(0, SUN_VISUAL_RADIUS, 30)).toBeCloseTo(SUN_VISUAL_RADIUS * 6.2, 12);
  });
});
