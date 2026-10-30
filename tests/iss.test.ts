import { type OMMJsonObject, sgp4, twoline2satrec } from '../src/astro/sgp4lib';
import { describe, expect, it } from 'vitest';
import oem from './fixtures/iss-oem-sample.json';
import vallado from './fixtures/sgp4-verification.json';
import { equatorialJ2000ToEcliptic } from '../src/astro/frames';
import {
  ISS_DATA,
  ISS_DATA_START_MS,
  ISS_DATA_STOP_MS,
  ISS_EXTRAPOLATION_DAYS,
  ISS_FIRST_MODULE_LAUNCH_MS,
  ISS_INCLINATION_DEG,
  ISS_MAX_DATA_USE_DAYS,
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
  const MIN = 60_000;
  const STOP = ISS_DATA_STOP_MS;

  it('est nominale sur toute la période de la prévision NASA, dernier instant compris', () => {
    expect(issValidity(ISS_DATA_START_MS)).toEqual({ status: 'nominal', daysOutside: 0 });
    expect(issValidity(ISS_DATA_START_MS + DAY).status).toBe('nominal');
    expect(issValidity(STOP)).toEqual({ status: 'nominal', daysOutside: 0 });
  });

  it('passe en extrapolation dès la première minute après l’expiration de la prévision', () => {
    expect(issValidity(STOP + 1).status).toBe('extrapolation');
    const v = issValidity(STOP + MIN);
    expect(v).toMatchObject({ status: 'extrapolation', beforeData: false });
    expect(v.daysOutside * 1440).toBeCloseTo(1, 9);
    expect(issState(STOP + MIN)).not.toBeNull();
  });

  it('reste en extrapolation jusqu’au dernier instant du 7e jour', () => {
    expect(issValidity(STOP + 6.5 * DAY).status).toBe('extrapolation');
    expect(issValidity(STOP + ISS_EXTRAPOLATION_DAYS * DAY - MIN).status).toBe('extrapolation');
    expect(issValidity(STOP + ISS_EXTRAPOLATION_DAYS * DAY).status).toBe('extrapolation');
    expect(issState(STOP + ISS_EXTRAPOLATION_DAYS * DAY)).not.toBeNull();
  });

  it('masque l’ISS dès l’instant suivant (données expirées, à actualiser)', () => {
    const first = STOP + ISS_EXTRAPOLATION_DAYS * DAY + 1;
    expect(issValidity(first)).toMatchObject({ status: 'unavailable', reason: 'expired' });
    expect(issState(first)).toBeNull();
    expect(issState(STOP + ISS_EXTRAPOLATION_DAYS * DAY + MIN)).toBeNull();
  });

  it('ne propose aucune position au-delà de la dernière période autorisée (ancien seuil de 30 jours supprimé)', () => {
    for (const t of [STOP + 8 * DAY, STOP + 14 * DAY, STOP + 20 * DAY, STOP + 30 * DAY, Date.UTC(2030, 0, 1)]) {
      expect(issValidity(t)).toMatchObject({ status: 'unavailable', reason: 'expired' });
      expect(issState(t)).toBeNull();
    }
  });

  it('respecte le plafond de 14 jours d’utilisation des données', () => {
    expect(ISS_EXTRAPOLATION_DAYS).toBe(7);
    expect(ISS_MAX_DATA_USE_DAYS).toBe(14);
    expect(ISS_EXTRAPOLATION_DAYS).toBeLessThanOrEqual(ISS_MAX_DATA_USE_DAYS);
  });

  it('traite de même les instants antérieurs à la prévision (extrapolation 7 jours, puis aucune donnée)', () => {
    expect(issValidity(ISS_DATA_START_MS - MIN)).toMatchObject({ status: 'extrapolation', beforeData: true });
    expect(issValidity(ISS_DATA_START_MS - ISS_EXTRAPOLATION_DAYS * DAY).status).toBe('extrapolation');
    expect(issValidity(ISS_DATA_START_MS - ISS_EXTRAPOLATION_DAYS * DAY - 1)).toMatchObject({ status: 'unavailable', reason: 'beforeData' });
    expect(issState(Date.UTC(2020, 0, 1))).toBeNull();
  });

  it('n’existe pas avant le lancement de son premier module (20 novembre 1998)', () => {
    expect(ISS_FIRST_MODULE_LAUNCH_MS).toBe(Date.UTC(1998, 10, 20, 6, 40));
    expect(issValidity(ISS_FIRST_MODULE_LAUNCH_MS - 1)).toMatchObject({ status: 'unavailable', reason: 'beforeLaunch' });
    expect(issValidity(Date.UTC(1969, 6, 20)).reason).toBe('beforeLaunch');
    expect(issState(Date.UTC(1990, 0, 1))).toBeNull();
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

  it('lit les éléments au format OMM de satellite.js (époque = début de l’éphéméride NASA)', () => {
    const omm = ISS_DATA.omm as unknown as OMMJsonObject;
    expect(Date.parse(`${omm.EPOCH}Z`)).toBe(ISS_DATA_START_MS);
  });
});
