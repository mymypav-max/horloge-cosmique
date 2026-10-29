import { describe, expect, it } from 'vitest';
import { bodyPoleEcliptic, eclipticToBodyMatrix, rotationAngleDeg } from '../src/astro/bodyRotation';
import { elementsAt } from '../src/astro/ephemeris';
import { DEG, type Vec3, dot, mulMat, transpose } from '../src/astro/math';
import { centuriesTT } from '../src/astro/time';
import { PLANETS, type PlanetId } from '../src/data/planets';

/** Normale au plan de l'orbite (écliptique J2000). */
function orbitNormal(id: PlanetId, t: number): Vec3 {
  const el = elementsAt(id, centuriesTT(t));
  return [Math.sin(el.i) * Math.sin(el.node), -Math.sin(el.i) * Math.cos(el.node), Math.cos(el.i)];
}

describe('orientation des planètes (modèles IAU)', () => {
  const t = Date.UTC(2026, 0, 1);

  it.each(['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const)(
    '%s : inclinaison de l’axe conforme à la valeur connue',
    (id) => {
      // Le pôle « nord » IAU est celui situé au nord du plan invariable ; pour
      // les rotations rétrogrades (Vénus, Uranus), le pôle du moment cinétique
      // est l'opposé, et l'inclinaison usuelle dépasse 90°.
      const iauPole = bodyPoleEcliptic(PLANETS[id].rotation, t);
      const pole: Vec3 = PLANETS[id].rotation.Wd < 0 ? [-iauPole[0], -iauPole[1], -iauPole[2]] : iauPole;
      const tilt = Math.acos(Math.max(-1, Math.min(1, dot(pole, orbitNormal(id, t))))) / DEG;
      expect(Math.abs(tilt - PLANETS[id].axialTiltDeg)).toBeLessThan(0.6);
    },
  );

  it.each(['mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'venus'] as const)(
    '%s : période de rotation conforme',
    (id) => {
      const hours = (360 / PLANETS[id].rotation.Wd) * 24;
      expect(Math.abs(hours / PLANETS[id].rotationPeriodHours - 1)).toBeLessThan(0.01);
    },
  );

  it('fait tourner Jupiter d’un tour en 9 h 55 min environ', () => {
    const model = PLANETS.jupiter.rotation;
    const a = rotationAngleDeg(model, t);
    const b = rotationAngleDeg(model, t + 9.925 * 3_600_000);
    expect(Math.abs(((b - a + 540) % 360) - 180)).toBeLessThan(0.5);
  });

  it('produit des matrices orthonormées', () => {
    const m = eclipticToBodyMatrix(PLANETS.saturn.rotation, t);
    const p = mulMat(m, transpose(m));
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, k) => expect(p[k]).toBeCloseTo(v, 12));
  });
});
