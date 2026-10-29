import { type OMMJsonObject, sgp4, twoline2satrec } from '../src/astro/sgp4lib';
import { describe, expect, it } from 'vitest';
import oem from './fixtures/iss-oem-sample.json';
import vallado from './fixtures/sgp4-verification.json';
import { equatorialJ2000ToEcliptic } from '../src/astro/frames';
import {
  ISS_DATA,
  ISS_DATA_START_MS,
  ISS_DATA_STOP_MS,
  ISS_FIRST_MODULE_LAUNCH_MS,
  ISS_INCLINATION_DEG,
  ISS_PERIOD_MINUTES,
  issOrbitPath,
  issState,
  issValidity,
} from '../src/astro/iss';
import { type Vec3, mulVec, sub } from '../src/astro/math';

const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const DAY = 86_400_000;

describe('propagation SGP4 (satellite.js)', () => {
  it('reproduit les cas de vérification officiels de Vallado (2006)', () => {
    for (const [satnum, c] of Object.entries(vallado.cases)) {
      const rec = twoline2satrec(c.line1, c.line2);
      for (const [minutes, x, y, z, vx, vy, vz] of c.expected) {
        const out = sgp4(rec, minutes);
        expect(out, `${satnum} t=${minutes}`).not.toBeNull();
        const p = out!.position;
        const v = out!.velocity;
        expect(Math.hypot(p.x - x, p.y - y, p.z - z), `${satnum} t=${minutes}`).toBeLessThan(1e-5);
        expect(Math.hypot(v.x - vx, v.y - vy, v.z - vz)).toBeLessThan(1e-8);
      }
    }
  });
});

describe('données de l’ISS', () => {
  it('documente la source, l’époque et la période de validité', () => {
    expect(ISS_DATA.source.url).toContain('nasa-public-data');
    expect(ISS_DATA.source.originator).toBe('NASA/JSC/FOD/TOPO');
    expect(ISS_DATA.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ISS_DATA.omm.REF_FRAME).toBe('TEME');
    expect(ISS_DATA.omm.NORAD_CAT_ID).toBe(25544);
    expect(ISS_DATA_STOP_MS - ISS_DATA_START_MS).toBeGreaterThan(10 * DAY);
    expect(ISS_DATA.fit.maxKm).toBeLessThan(5);
  });

  it('donne une orbite basse réaliste (altitude, vitesse, période, inclinaison)', () => {
    for (let k = 0; k < 50; k++) {
      const s = issState(ISS_DATA_START_MS + k * 0.3 * DAY)!;
      expect(s.altitudeKm).toBeGreaterThan(400);
      expect(s.altitudeKm).toBeLessThan(440);
      expect(s.speedKmS).toBeGreaterThan(7.6);
      expect(s.speedKmS).toBeLessThan(7.7);
    }
    expect(ISS_PERIOD_MINUTES).toBeGreaterThan(92);
    expect(ISS_PERIOD_MINUTES).toBeLessThan(94);
    expect(ISS_INCLINATION_DEG).toBeCloseTo(51.6, 1);
  });

  it('suit l’éphéméride NASA à quelques kilomètres près sur sa période de validité', () => {
    const ecl = equatorialJ2000ToEcliptic();
    let max = 0;
    for (const line of oem.lines) {
      const [iso, x, y, z] = line.split(/\s+/);
      const t = Date.parse(`${iso}Z`);
      const ref = mulVec(ecl, [+x, +y, +z]);
      const s = issState(t)!;
      max = Math.max(max, norm(sub(s.position, ref)));
    }
    // Écart d'ajustement SGP4 (≤ 2,2 km) + nutation négligée (≤ 0,6 km).
    expect(max).toBeLessThan(3);
    expect(oem.sha256OfSource).toBe(ISS_DATA.source.sha256);
  });
});

describe('validité des données de l’ISS', () => {
  it('distingue les états prévision, approximatif, indicatif et indisponible', () => {
    expect(issValidity(ISS_DATA_START_MS + DAY).status).toBe('nominal');
    expect(issValidity(ISS_DATA_STOP_MS + 3 * DAY).status).toBe('approximate');
    expect(issValidity(ISS_DATA_STOP_MS + 20 * DAY).status).toBe('indicative');
    expect(issValidity(ISS_DATA_STOP_MS + 31 * DAY)).toMatchObject({ status: 'unavailable', reason: 'tooOld' });
    expect(issValidity(ISS_DATA_START_MS - 10 * DAY).status).toBe('indicative');
    expect(issValidity(ISS_DATA_START_MS - 40 * DAY)).toMatchObject({ status: 'unavailable', reason: 'tooEarly' });
    expect(issValidity(ISS_FIRST_MODULE_LAUNCH_MS - 1)).toMatchObject({ status: 'unavailable', reason: 'beforeLaunch' });
    expect(issValidity(Date.UTC(1969, 6, 20)).reason).toBe('beforeLaunch');
  });

  it('ne fournit aucune position hors des limites', () => {
    expect(issState(ISS_DATA_STOP_MS + 60 * DAY)).toBeNull();
    expect(issState(Date.UTC(1990, 0, 1))).toBeNull();
    expect(issState(ISS_DATA_STOP_MS + 10 * DAY)).not.toBeNull();
  });
});

describe('cohérence temporelle de l’ISS', () => {
  const t = ISS_DATA_START_MS + 2.37 * DAY;

  it('est déterministe (pause : même instant, même position)', () => {
    expect(issState(t)).toEqual(issState(t));
  });

  it('avance conformément à sa vitesse (accélération du temps)', () => {
    const a = issState(t)!;
    const b = issState(t + 1000)!;
    const predicted: Vec3 = [a.position[0] + a.velocity[0], a.position[1] + a.velocity[1], a.position[2] + a.velocity[2]];
    expect(norm(sub(b.position, predicted))).toBeLessThan(0.01);
    // Une révolution plus tard, l'ISS est revenue près du même point de l'espace inertiel.
    const c = issState(t + ISS_PERIOD_MINUTES * 60_000)!;
    expect(norm(sub(c.position, a.position))).toBeLessThan(150);
  });

  it('trace une orbite qui passe par la position de la station', () => {
    const s = issState(t)!;
    const path = issOrbitPath(t, 180);
    expect(path).toHaveLength(180);
    const nearest = Math.min(...path.map((p) => norm(sub(p, s.position))));
    expect(nearest).toBeLessThan(150);
    for (const p of path) expect(norm(p)).toBeGreaterThan(6700);
  });

  it('lit les éléments au format OMM de satellite.js', () => {
    const omm = ISS_DATA.omm as unknown as OMMJsonObject;
    expect(omm.EPOCH).toBe('2026-10-28T12:00:00.000');
  });
});
