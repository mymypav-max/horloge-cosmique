import { describe, expect, it } from 'vitest';
import { allHeliocentricPositions, eclipticCoordinates, heliocentricPosition, isWithinModelValidity, selectTable } from '../src/astro/ephemeris';
import { centuriesTT } from '../src/astro/time';
import { PLANET_IDS, type PlanetId } from '../src/data/planets';
import { angularDistanceDeg, longitudeDiffDeg, referenceHelioEcliptic } from './helpers/reference';

/**
 * Tolérances (degrés) sur la direction héliocentrique, choisies d'après les
 * erreurs publiées par Standish pour 1800–2050, avec une marge. Les écarts
 * réellement mesurés sont consignés dans docs/TESTS.md.
 */
const TOL_1800_2050: Record<PlanetId, number> = {
  mercury: 0.02,
  venus: 0.02,
  earth: 0.02,
  mars: 0.03,
  jupiter: 0.2,
  saturn: 0.3,
  uranus: 0.05,
  neptune: 0.03,
};

const TOL_1000_3000: Record<PlanetId, number> = {
  mercury: 0.05,
  venus: 0.05,
  earth: 0.05,
  mars: 0.1,
  jupiter: 0.3,
  saturn: 0.5,
  uranus: 0.6,
  neptune: 0.2,
};

function dates(startYear: number, endYear: number, count: number): number[] {
  const t0 = Date.UTC(startYear, 0, 1);
  const t1 = Date.UTC(endYear, 0, 1);
  return Array.from({ length: count }, (_, k) => t0 + ((t1 - t0) * (k + 0.37)) / count);
}

describe('positions planétaires comparées à astronomy-engine', () => {
  it.each(PLANET_IDS)('%s : direction et distance correctes de 1800 à 2050', (id) => {
    for (const t of dates(1800, 2050, 120)) {
      const ours = heliocentricPosition(id, t);
      const ref = referenceHelioEcliptic(id, t);
      expect(angularDistanceDeg(ours, ref)).toBeLessThan(TOL_1800_2050[id]);
      expect(Math.abs(Math.hypot(...ours) / Math.hypot(...ref) - 1)).toBeLessThan(0.005);
    }
  });

  it.each(PLANET_IDS)('%s : direction correcte de 1000 à 3000 (tables 2a/2b)', (id) => {
    for (const t of dates(1000, 2999, 60)) {
      const ours = heliocentricPosition(id, t);
      const ref = referenceHelioEcliptic(id, t);
      expect(angularDistanceDeg(ours, ref)).toBeLessThan(TOL_1000_3000[id]);
    }
  });
});

describe('événements astronomiques documentés', () => {
  // Aux oppositions, Terre et planète ont la même longitude héliocentrique.
  // Dates : NASA / IMCCE (heures arrondies).
  it.each([
    ['mars', Date.UTC(2025, 0, 16, 2, 38)],
    ['jupiter', Date.UTC(2024, 11, 7, 21)],
    ['saturn', Date.UTC(2024, 8, 8, 4)],
    ['uranus', Date.UTC(2024, 10, 17, 3)],
    ['neptune', Date.UTC(2024, 8, 21, 0)],
  ] as const)('opposition de %s', (id, t) => {
    const p = allHeliocentricPositions(t);
    const lonPlanet = eclipticCoordinates(p[id]).lonDeg;
    const lonEarth = eclipticCoordinates(p.earth).lonDeg;
    expect(longitudeDiffDeg(lonPlanet, lonEarth)).toBeLessThan(0.5);
  });

  it('conjonction inférieure de Vénus (23 mars 2025)', () => {
    const p = allHeliocentricPositions(Date.UTC(2025, 2, 23, 1));
    expect(longitudeDiffDeg(eclipticCoordinates(p.venus).lonDeg, eclipticCoordinates(p.earth).lonDeg)).toBeLessThan(0.5);
  });

  it('périhélie de la Terre début janvier, aphélie début juillet', () => {
    const r = (t: number) => eclipticCoordinates(heliocentricPosition('earth', t)).distanceAu;
    const perihelion = Date.UTC(2025, 0, 4, 13);
    const aphelion = Date.UTC(2025, 6, 3, 20);
    expect(r(perihelion)).toBeCloseTo(0.9833, 3);
    expect(r(aphelion)).toBeCloseTo(1.0167, 3);
    // Minimum local autour du périhélie.
    expect(r(perihelion)).toBeLessThan(r(perihelion - 10 * 86_400_000));
    expect(r(perihelion)).toBeLessThan(r(perihelion + 10 * 86_400_000));
  });

  it('place la Terre à 180° de l’équinoxe de la date à l’équinoxe de mars', () => {
    // Équinoxe de mars 2024 : 20 mars 03:06 UTC. Le Soleil est alors à la
    // longitude géocentrique 0° comptée depuis l'équinoxe DE LA DATE, donc la
    // Terre à 180°. Nos coordonnées sont rapportées à l'équinoxe J2000 : il
    // faut retrancher la précession générale accumulée (5028,8″ par siècle).
    const t = Date.UTC(2024, 2, 20, 3, 6);
    const precessionDeg = (5028.796 * centuriesTT(t)) / 3600;
    const lon = eclipticCoordinates(heliocentricPosition('earth', t)).lonDeg;
    expect(precessionDeg).toBeCloseTo(0.338, 2);
    expect(longitudeDiffDeg(lon, 180 - precessionDeg)).toBeLessThan(0.02);
  });
});

describe('choix de la table d’éléments', () => {
  it('utilise la table 1 entre 1800 et 2050 et la table 2 au-delà', () => {
    expect(selectTable(centuriesTT(Date.UTC(2026, 0, 1)))).toBe('table1');
    expect(selectTable(centuriesTT(Date.UTC(1700, 0, 1)))).toBe('table2');
    expect(selectTable(centuriesTT(Date.UTC(2100, 0, 1)))).toBe('table2');
  });

  it('reste continu au changement de table (2050)', () => {
    const t = Date.UTC(2050, 0, 1, 12) - 69_184;
    for (const id of PLANET_IDS) {
      const before = heliocentricPosition(id, t - 1000);
      const after = heliocentricPosition(id, t + 1000);
      expect(angularDistanceDeg(before, after)).toBeLessThan(0.5);
    }
  });

  it('signale le domaine de validité (−3000 à +3000)', () => {
    expect(isWithinModelValidity(centuriesTT(Date.UTC(2026, 0, 1)))).toBe(true);
    expect(isWithinModelValidity(10.5)).toBe(false);
    expect(isWithinModelValidity(-50.5)).toBe(false);
  });
});
