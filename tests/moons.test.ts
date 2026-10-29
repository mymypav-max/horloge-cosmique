import { describe, expect, it } from 'vitest';
import fixture from './fixtures/horizons-moons.json';
import { equatorialJ2000ToEcliptic } from '../src/astro/frames';
import { type Vec3, mulVec, sub } from '../src/astro/math';
import { lunarCoordinates } from '../src/astro/moon';
import {
  FITTED_ORBITS,
  moonSemiMajorAxisKm,
  type FittedMoonId,
  isRetrograde,
  moonInclinationDeg,
  moonOrbitPath,
  moonPeriodDays,
  moonPosition,
} from '../src/astro/moons';
import { MOONS, MOONS_BY_PLANET, MOON_IDS } from '../src/data/moons';
import { PLANET_IDS } from '../src/data/planets';
import { angularDistanceDeg, referenceGalileanEquatorial, referenceGeoMoonEcliptic } from './helpers/reference';

const ECL = equatorialJ2000ToEcliptic();
const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const FITTED = MOON_IDS.filter((id) => id !== 'moon') as FittedMoonId[];

describe('catalogue des lunes', () => {
  it('contient les 22 lunes demandées, rattachées à la bonne planète', () => {
    expect(MOON_IDS).toHaveLength(22);
    expect(FITTED).toHaveLength(21);
    expect(MOONS_BY_PLANET.mercury).toEqual([]);
    expect(MOONS_BY_PLANET.venus).toEqual([]);
    expect(MOONS_BY_PLANET.earth).toEqual(['moon']);
    expect([...MOONS_BY_PLANET.mars].sort()).toEqual(['deimos', 'phobos']);
    expect(MOONS_BY_PLANET.jupiter).toHaveLength(4);
    expect(MOONS_BY_PLANET.saturn).toHaveLength(7);
    expect(MOONS_BY_PLANET.uranus).toHaveLength(5);
    expect(MOONS_BY_PLANET.neptune).toHaveLength(3);
    for (const planet of PLANET_IDS) for (const id of MOONS_BY_PLANET[planet]) expect(MOONS[id].parent).toBe(planet);
  });

  it('a des éléments orbitaux ajustés pour chaque lune sauf la Lune', () => {
    for (const id of FITTED) {
      const o = FITTED_ORBITS[id];
      expect(o, id).toBeDefined();
      expect(o.parent).toBe(MOONS[id].parent);
      expect(o.aKm).toBeGreaterThan(MOONS[id].radiusKm * 10);
      expect(o.e).toBeGreaterThanOrEqual(0);
      expect(o.e).toBeLessThan(1);
    }
    expect(Object.keys(FITTED_ORBITS).sort()).toEqual([...FITTED].sort());
  });

  it('classe les lunes de chaque planète par distance croissante', () => {
    for (const planet of PLANET_IDS) {
      const a = MOONS_BY_PLANET[planet].filter((id) => id !== 'moon').map((id) => FITTED_ORBITS[id as FittedMoonId].aKm);
      for (let k = 1; k < a.length; k++) expect(a[k]).toBeGreaterThan(a[k - 1]);
    }
  });
});

describe('positions des lunes comparées à JPL Horizons', () => {
  it('reproduit les positions Horizons à l’écart d’ajustement annoncé près', () => {
    const moons = fixture.moons as Record<string, number[][]>;
    for (const id of FITTED) {
      const announced = FITTED_ORBITS[id].fit;
      for (const [utcMs, x, y, z] of moons[id]) {
        const ref = mulVec(ECL, [x, y, z]);
        const model = moonPosition(id, utcMs);
        // L'écart maximal annoncé a été mesuré sur 20 000 instants ; 2 % de marge pour l'arrondi.
        expect(norm(sub(model, ref)), `${id} ${new Date(utcMs).toISOString()}`).toBeLessThanOrEqual(announced.maxKm * 1.02);
        expect(angularDistanceDeg(model, ref)).toBeLessThanOrEqual(announced.maxAngleDeg * 1.02);
      }
    }
  });

  it('annonce un écart maximal inférieur à 0,6° pour chaque lune sur 2010–2030', () => {
    for (const id of FITTED) expect(FITTED_ORBITS[id].fit.maxAngleDeg, id).toBeLessThan(0.6);
  });

  it('retrouve les périodes sidérales de l’en-tête Horizons', () => {
    // Périodes (jours) des en-têtes JPL Horizons (données orbitales moyennes).
    const header: Record<FittedMoonId, number> = {
      phobos: 0.319, deimos: 1.263, io: 1.77, europa: 3.55, ganymede: 7.155, callisto: 16.691,
      mimas: 0.9424218, enceladus: 1.370218, tethys: 1.888, dione: 2.736915, rhea: 4.518, titan: 15.945421,
      iapetus: 79.33, miranda: 1.413, ariel: 2.52, umbriel: 4.144, titania: 8.706, oberon: 13.463,
      triton: 5.876994, proteus: 1.122315, nereid: 360.1403,
    };
    for (const id of FITTED) expect(Math.abs(moonPeriodDays(id) / header[id] - 1), id).toBeLessThan(0.005);
  });

  it('respecte la 3e loi de Kepler entre les lunes d’une même planète (à 1 % près)', () => {
    for (const planet of ['mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const) {
      const gm = MOONS_BY_PLANET[planet].map((id) => {
        const o = FITTED_ORBITS[id as FittedMoonId];
        const n = (o.meanMotionDegPerDay * Math.PI) / 180 / 86400;
        return n * n * o.aKm ** 3;
      });
      for (const g of gm) expect(Math.abs(g / gm[gm.length - 1] - 1), planet).toBeLessThan(0.01);
    }
  });
});

describe('comparaison à une théorie indépendante (astronomy-engine)', () => {
  it('place les satellites galiléens à moins de 0,3° de la théorie E5 de Lieske', () => {
    for (const name of ['io', 'europa', 'ganymede', 'callisto'] as const) {
      for (let k = 0; k < 40; k++) {
        const t = Date.UTC(2010, 0, 1) + k * 182.6 * 86_400_000;
        const ref = mulVec(ECL, referenceGalileanEquatorial(name, t));
        const model = moonPosition(name, t);
        expect(angularDistanceDeg(model, ref), `${name} ${new Date(t).toISOString()}`).toBeLessThan(0.3);
        expect(Math.abs(norm(model) / norm(ref) - 1)).toBeLessThan(0.01);
      }
    }
  });

  it('place la Lune à la précision annoncée par l’Almanac (1900–2100)', () => {
    for (let k = 0; k <= 400; k++) {
      const t = Date.UTC(1900, 0, 1) + k * 182.6 * 86_400_000 + k * 3_600_000;
      const ref = referenceGeoMoonEcliptic(t);
      const model = moonPosition('moon', t);
      expect(angularDistanceDeg(model, ref), new Date(t).toISOString()).toBeLessThan(0.4);
      expect(Math.abs(norm(model) / norm(ref) - 1)).toBeLessThan(0.004);
    }
  });

  it('donne une distance Terre-Lune entre 356 000 et 407 000 km', () => {
    for (let k = 0; k < 500; k++) {
      const d = lunarCoordinates((k - 250) / 1000).distanceKm;
      expect(d).toBeGreaterThan(356_000);
      expect(d).toBeLessThan(407_000);
    }
  });
});

describe('sens du mouvement et inclinaisons', () => {
  const t = Date.UTC(2026, 9, 29);

  it('reconnaît l’orbite rétrograde de Triton et seulement elle', () => {
    for (const id of MOON_IDS) expect(isRetrograde(id, t), id).toBe(id === 'triton');
    expect(moonInclinationDeg('triton', t)).toBeGreaterThan(150);
    expect(moonInclinationDeg('triton', t)).toBeLessThan(160);
  });

  it('considère les lunes d’Uranus comme progrades (même sens que la rotation de la planète)', () => {
    for (const id of MOONS_BY_PLANET.uranus) expect(moonInclinationDeg(id, t), id).toBeLessThan(5);
  });

  it('donne à la Lune une inclinaison d’environ 5,1° sur l’écliptique', () => {
    for (let k = 0; k < 40; k++) {
      const i = moonInclinationDeg('moon', Date.UTC(2000, 0, 1) + k * 50 * 86_400_000);
      expect(i).toBeGreaterThan(4.8);
      expect(i).toBeLessThan(5.5);
    }
  });

  it('garde les grandes lunes régulières près de l’équateur de leur planète', () => {
    for (const id of ['io', 'europa', 'ganymede', 'callisto', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'phobos', 'deimos', 'ariel', 'umbriel', 'titania', 'oberon', 'proteus'] as const) {
      expect(moonInclinationDeg(id, t), id).toBeLessThan(3);
    }
    // Japet : orbite inclinée sur l'équateur de Saturne (plan de Laplace incliné d'environ 15°).
    expect(moonInclinationDeg('iapetus', t)).toBeGreaterThan(5);
    expect(moonInclinationDeg('iapetus', t)).toBeLessThan(25);
  });
});

describe('cohérence temporelle', () => {
  it('est déterministe', () => {
    const t = Date.UTC(2031, 4, 5, 6, 7, 8);
    for (const id of MOON_IDS) expect(moonPosition(id, t)).toEqual(moonPosition(id, t));
  });

  it('évolue continûment (pas de saut d’une seconde à l’autre, y compris aux bornes 2010 et 2030)', () => {
    for (const t of [Date.UTC(2010, 0, 1), Date.UTC(2030, 0, 1), Date.UTC(2026, 9, 29, 12)]) {
      for (const id of MOON_IDS) {
        const a = moonPosition(id, t - 1000);
        const b = moonPosition(id, t + 1000);
        // Vitesse orbitale bornée par sa valeur au péricentre : 2πa/P · √((1 + e)/(1 − e)), avec 20 % de marge.
        const p = moonPeriodDays(id) * 86400;
        const e = id === 'moon' ? 0.07 : FITTED_ORBITS[id].e;
        const vmax = ((2 * Math.PI * moonSemiMajorAxisKm(id, t)) / p) * Math.sqrt((1 + e) / (1 - e)) * 1.2;
        expect(norm(sub(a, b)) / 2, id).toBeLessThan(vmax);
      }
    }
  });

  it('fait avancer chaque lune dans le sens de son orbite tracée', () => {
    const t = Date.UTC(2026, 9, 29);
    for (const id of MOON_IDS) {
      const p0 = moonPosition(id, t);
      const p1 = moonPosition(id, t + moonPeriodDays(id) * 86_400_000 * 0.01);
      expect(angularDistanceDeg(p0, p1), id).toBeGreaterThan(1);
      expect(angularDistanceDeg(p0, p1), id).toBeLessThan(15);
    }
  });

  it('trace une orbite qui passe par la position de la lune', () => {
    const t = Date.UTC(2026, 9, 29, 5);
    for (const id of MOON_IDS) {
      const pos = moonPosition(id, t);
      const path = moonOrbitPath(id, t, 360);
      const nearest = Math.min(...path.map((p) => norm(sub(p, pos))));
      expect(nearest / norm(pos), id).toBeLessThan(0.02);
    }
  });

  it('extrapole hors de 2010–2030 sans erreur numérique', () => {
    for (const t of [Date.UTC(-2999, 0, 1), Date.UTC(1800, 0, 1), Date.UTC(2999, 11, 31)]) {
      for (const id of MOON_IDS) {
        const p = moonPosition(id, t);
        p.forEach((v) => expect(Number.isFinite(v)).toBe(true));
      }
    }
  });
});
