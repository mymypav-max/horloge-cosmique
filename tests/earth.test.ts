import { describe, expect, it } from 'vitest';
import {
  SIDEREAL_DAY_SECONDS,
  computeEarthState,
  eclipticToEarthFixedMatrix,
  earthPoleEcliptic,
  gmstDegrees,
  solarElevationCosine,
  subsolarPoint,
} from '../src/astro/earth';
import { OBLIQUITY_J2000_RAD, eclipticToEquatorialJ2000, precessionMatrix } from '../src/astro/frames';
import { DEG, type Mat3, mulMat, mulVec, transpose } from '../src/astro/math';
import { longitudeDiffDeg, referenceGastDegrees, referenceSeasons, referenceSubsolar } from './helpers/reference';

function expectOrthonormal(m: Mat3) {
  const p = mulMat(m, transpose(m));
  const id = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  p.forEach((v, k) => expect(v).toBeCloseTo(id[k], 12));
}

describe('transformations de repère', () => {
  it('produit des matrices de rotation orthonormées', () => {
    expectOrthonormal(eclipticToEquatorialJ2000());
    expectOrthonormal(precessionMatrix(0.27));
    expectOrthonormal(eclipticToEarthFixedMatrix(Date.UTC(2026, 9, 29)));
  });

  it('envoie le pôle de l’écliptique à 23,44° du pôle céleste', () => {
    const pole = mulVec(eclipticToEquatorialJ2000(), [0, 0, 1]);
    expect(Math.acos(pole[2]) / DEG).toBeCloseTo(23.4393, 4);
    expect(OBLIQUITY_J2000_RAD / DEG).toBeCloseTo(23.4392911, 6);
    // Le pôle écliptique est à l’ascension droite 18 h (y < 0).
    expect(pole[1]).toBeLessThan(0);
  });

  it('a une précession nulle à J2000 et d’environ 20″ par an pour le pôle', () => {
    const P0 = precessionMatrix(0);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, k) => expect(P0[k]).toBeCloseTo(v, 14));
    // Déplacement du pôle céleste en un siècle : θ ≈ 2004,3″.
    const pole = mulVec(transpose(precessionMatrix(1)), [0, 0, 1]);
    expect((Math.acos(pole[2]) / DEG) * 3600).toBeCloseTo(2004.3, 0);
  });
});

describe('rotation de la Terre', () => {
  it('donne le temps sidéral de référence à J2000.0', () => {
    // Meeus : TSMG = 280,46061837° le 1er janvier 2000 à 12 h UT1.
    expect(gmstDegrees(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(280.46061837, 8);
  });

  it('reproduit l’exemple 12.a de Meeus (1987-04-10 0 h UT)', () => {
    // TSMG = 13 h 10 min 46,3668 s = 197,693195°.
    expect(gmstDegrees(Date.UTC(1987, 3, 10))).toBeCloseTo(197.693195, 5);
  });

  it('concorde avec le temps sidéral apparent d’astronomy-engine (à la nutation près)', () => {
    for (let k = 0; k < 50; k++) {
      const t = Date.UTC(1990, 0, 1) + k * 293.7 * 86_400_000;
      // Équation des équinoxes ≤ 1,1 s de temps ≈ 0,005°.
      expect(longitudeDiffDeg(gmstDegrees(t), referenceGastDegrees(t))).toBeLessThan(0.006);
    }
  });

  it('effectue un tour complet en un jour sidéral (23 h 56 min 4 s)', () => {
    const t = Date.UTC(2026, 5, 1);
    const a = gmstDegrees(t);
    const b = gmstDegrees(t + SIDEREAL_DAY_SECONDS * 1000);
    expect(longitudeDiffDeg(a, b)).toBeLessThan(1e-4);
    // Un jour solaire fait tourner la Terre d’environ 360,9856°.
    const c = gmstDegrees(t + 86_400_000);
    expect(longitudeDiffDeg(c, a + 0.98565)).toBeLessThan(1e-4);
  });

  it('incline l’axe terrestre de 23,44° sur l’écliptique', () => {
    const pole = earthPoleEcliptic(Date.UTC(2026, 0, 1));
    expect(Math.acos(pole[2]) / DEG).toBeCloseTo(23.44, 2);
  });
});

describe('direction du Soleil et terminateur', () => {
  it('place le point subsolaire aux tropiques aux solstices et sur l’équateur aux équinoxes', () => {
    for (const year of [2024, 2025, 2026, 2030]) {
      const s = referenceSeasons(year);
      expect(subsolarPoint(s.marchEquinox).latDeg).toBeCloseTo(0, 1);
      expect(subsolarPoint(s.septemberEquinox).latDeg).toBeCloseTo(0, 1);
      expect(subsolarPoint(s.juneSolstice).latDeg).toBeCloseTo(23.44, 1);
      expect(subsolarPoint(s.decemberSolstice).latDeg).toBeCloseTo(-23.44, 1);
    }
  });

  it('cas documenté : solstice de juin 2024 (20 juin, 20 h 51 UTC)', () => {
    const p = subsolarPoint(Date.UTC(2024, 5, 20, 20, 51));
    expect(p.latDeg).toBeCloseTo(23.44, 1);
    // Angle horaire du Soleil à Greenwich = (UTC − 12 h) + équation du temps.
    // Le 20 juin, l'équation du temps vaut ≈ −1,45 min : 8,85 h − 0,024 h =
    // 8,826 h, soit un Soleil au zénith vers 132,4° O.
    expect(longitudeDiffDeg(p.lonDeg, -132.4)).toBeLessThan(0.3);
  });

  it('suit le Soleil vers l’ouest à 15° par heure', () => {
    const t = Date.UTC(2026, 9, 29, 12);
    const a = subsolarPoint(t).lonDeg;
    const b = subsolarPoint(t + 3_600_000).lonDeg;
    expect(longitudeDiffDeg(a - 15, b)).toBeLessThan(0.02);
  });

  it('concorde avec le point subsolaire d’astronomy-engine sur 300 instants', () => {
    let maxErr = 0;
    for (let k = 0; k < 300; k++) {
      const t = Date.UTC(1980, 0, 1) + k * 61.37 * 86_400_000 + k * 3_700_000;
      const ours = subsolarPoint(t);
      const ref = referenceSubsolar(t);
      const err = Math.max(Math.abs(ours.latDeg - ref.latDeg), longitudeDiffDeg(ours.lonDeg, ref.lonDeg));
      maxErr = Math.max(maxErr, err);
    }
    expect(maxErr).toBeLessThan(0.05);
  });

  it('éclaire le point subsolaire, assombrit l’antipode et met à 90° le terminateur', () => {
    const t = Date.UTC(2026, 9, 29, 9, 30);
    const s = subsolarPoint(t);
    expect(solarElevationCosine(s, t)).toBeCloseTo(1, 9);
    expect(solarElevationCosine({ latDeg: -s.latDeg, lonDeg: s.lonDeg + 180 }, t)).toBeCloseTo(-1, 9);
    // Points du grand cercle à 90° : sur le terminateur.
    for (let k = 0; k < 12; k++) {
      const az = (k / 12) * 2 * Math.PI;
      // Point à 90° du point subsolaire dans la direction az.
      const lat0 = s.latDeg * DEG;
      const lat = Math.asin(Math.cos(lat0) * Math.cos(az));
      const lon = s.lonDeg * DEG + Math.atan2(Math.sin(az) * Math.cos(lat0), -Math.sin(lat0) * Math.sin(lat));
      expect(solarElevationCosine({ latDeg: lat / DEG, lonDeg: lon / DEG }, t)).toBeCloseTo(0, 9);
    }
  });

  it('fait jour à Paris à midi et nuit à minuit (heure locale d’hiver)', () => {
    const paris = { latDeg: 48.8566, lonDeg: 2.3522 };
    expect(solarElevationCosine(paris, Date.UTC(2026, 0, 15, 11))).toBeGreaterThan(0.2);
    expect(solarElevationCosine(paris, Date.UTC(2026, 0, 15, 23))).toBeLessThan(-0.5);
  });

  it('change réellement l’éclairage quand l’heure change', () => {
    const a = computeEarthState(Date.UTC(2026, 2, 1, 6));
    const b = computeEarthState(Date.UTC(2026, 2, 1, 18));
    expect(longitudeDiffDeg(a.subsolar.lonDeg, b.subsolar.lonDeg)).toBeGreaterThan(170);
    expect(a.distanceAu).toBeGreaterThan(0.98);
    expect(a.distanceAu).toBeLessThan(1.02);
  });
});
