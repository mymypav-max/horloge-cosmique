import { describe, expect, it } from 'vitest';
import { subsolarPoint } from '../src/astro/earth';
import { elementsAt, eclipticCoordinates } from '../src/astro/ephemeris';
import { DEG, type Vec3, angleBetween } from '../src/astro/math';
import { computeAstroState } from '../src/astro/state';
import { centuriesTT } from '../src/astro/time';
import { PLANET_IDS } from '../src/data/planets';
import { layoutBodies, layoutOrbit, sunDirectionInBodyLocal } from '../src/representation/layout';
import { astroToScene, sceneToAstro } from '../src/representation/sceneFrame';
import {
  PLANET_VISUAL_RADIUS,
  RADIAL_CONTROL_POINTS,
  SUN_VISUAL_RADIUS,
  displayedDistance,
  displayedPosition,
  visualExtent,
} from '../src/representation/visualScale';
import { longitudeDiffDeg } from './helpers/reference';

describe('transformation radiale', () => {
  it('passe par les points de contrôle', () => {
    for (const [r, d] of RADIAL_CONTROL_POINTS) expect(displayedDistance(r)).toBeCloseTo(d, 10);
  });

  it('est strictement croissante (l’ordre des distances est conservé)', () => {
    let prev = -1;
    for (let r = 0.001; r < 40; r += 0.005) {
      const d = displayedDistance(r);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('conserve exactement la direction héliocentrique (longitude et latitude)', () => {
    const state = computeAstroState(Date.UTC(2026, 9, 29, 20));
    for (const id of PLANET_IDS) {
      const real = state.positions[id];
      const shown = displayedPosition(real);
      // acos limite la précision numérique à ~1e-8 rad.
      expect(angleBetween(real, shown)).toBeLessThan(1e-7);
      const a = eclipticCoordinates(real);
      const b = eclipticCoordinates(shown);
      expect(longitudeDiffDeg(a.lonDeg, b.lonDeg)).toBeLessThan(1e-9);
      expect(Math.abs(a.latDeg - b.latDeg)).toBeLessThan(1e-9);
    }
  });

  it('ne fait jamais se chevaucher deux planètes ou une planète et le Soleil (1800–2200)', () => {
    for (let year = 1800; year <= 2200; year += 25) {
      const T = centuriesTT(Date.UTC(year, 0, 1));
      const range = PLANET_IDS.map((id) => {
        const el = elementsAt(id, T);
        return { id, inner: displayedDistance(el.a * (1 - el.e)), outer: displayedDistance(el.a * (1 + el.e)) };
      });
      expect(range[0].inner - SUN_VISUAL_RADIUS - visualExtent('mercury')).toBeGreaterThan(0.8);
      for (let k = 0; k < range.length - 1; k++) {
        const gap = range[k + 1].inner - range[k].outer - visualExtent(range[k].id) - visualExtent(range[k + 1].id);
        expect(gap, `${range[k].id} / ${range[k + 1].id} en ${year}`).toBeGreaterThan(0.15);
      }
    }
  });

  it('rend Jupiter visuellement plus grande que les planètes telluriques', () => {
    for (const id of ['mercury', 'venus', 'earth', 'mars'] as const) {
      expect(PLANET_VISUAL_RADIUS.jupiter).toBeGreaterThan(2 * PLANET_VISUAL_RADIUS[id]);
    }
  });
});

describe('repère de la scène', () => {
  it('place le pôle de l’écliptique vers le haut (+y) et reste réversible', () => {
    expect(astroToScene([0, 0, 1])).toEqual([0, 1, -0]);
    const v: Vec3 = [0.3, -1.2, 2.5];
    expect(sceneToAstro(astroToScene(v))).toEqual(v);
  });
});

describe('mise en page des corps', () => {
  it('place chaque planète sur son orbite affichée', () => {
    const t = Date.UTC(2026, 9, 29);
    const layout = layoutBodies(computeAstroState(t));
    for (const id of PLANET_IDS) {
      const orbit = layoutOrbit(id, t, 6000);
      const p = layout[id].position;
      const d = Math.min(...orbit.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])));
      // Écart maximal lié à l'échantillonnage de l'orbite.
      expect(d).toBeLessThan(0.05);
    }
  });

  it('transmet au maillage terrestre une direction solaire cohérente avec le point subsolaire', () => {
    for (const t of [Date.UTC(2024, 5, 20, 20, 51), Date.UTC(2026, 9, 29, 7, 15), Date.UTC(2031, 0, 3, 23, 40)]) {
      const earth = layoutBodies(computeAstroState(t)).earth;
      const s = sunDirectionInBodyLocal(earth);
      // Repère local du maillage : +x = longitude 0°, −z = 90° E, +y = nord.
      const lat = Math.asin(s[1]) / DEG;
      const lon = Math.atan2(-s[2], s[0]) / DEG;
      const ref = subsolarPoint(t);
      expect(lat).toBeCloseTo(ref.latDeg, 9);
      expect(longitudeDiffDeg(lon, ref.lonDeg)).toBeLessThan(1e-9);
    }
  });

  it('incline l’axe affiché de la Terre de 23,44° par rapport au haut de la scène', () => {
    const earth = layoutBodies(computeAstroState(Date.UTC(2026, 0, 1))).earth;
    expect(Math.acos(earth.pole[1]) / DEG).toBeCloseTo(23.44, 1);
  });

  it('déplace réellement les planètes quand la date change', () => {
    const a = layoutBodies(computeAstroState(Date.UTC(2026, 0, 1)));
    const b = layoutBodies(computeAstroState(Date.UTC(2026, 3, 1)));
    for (const id of PLANET_IDS) {
      expect(angleBetween(a[id].position, b[id].position)).toBeGreaterThan(0);
    }
    // Du 1er janvier au 1er avril, la Terre (proche du périhélie, donc plus
    // rapide que la moyenne) parcourt environ 90,7°.
    expect(angleBetween(a.earth.position, b.earth.position) / DEG).toBeCloseTo(90.7, 0);
  });
});
