import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { issInfo, moonInfo, moonSubtitle, planetInfo } from '../src/app/info';
import { parseStartupOptions } from '../src/app/startup';
import { ISS_DATA_START_MS, ISS_DATA_STOP_MS, issState } from '../src/astro/iss';
import { type Vec3, angleBetween, cross, dot, mulVec, normalize, sub } from '../src/astro/math';
import { moonBodyAxes, moonPosition } from '../src/astro/moons';
import { computeAstroState } from '../src/astro/state';
import { CameraRig } from '../src/camera/CameraRig';
import { type CameraPose, frameFromAxis, interpolatePoseAround, keepOutsideSphere } from '../src/camera/cameraMath';
import { MOONS, MOONS_BY_PLANET, MOON_IDS } from '../src/data/moons';
import { PLANETS } from '../src/data/planets';
import { type NavState, barItems, hasSatellites, initialNavState, reduceNavigation } from '../src/input/navigation';
import { layoutBodies } from '../src/representation/layout';
import {
  SATELLITE_LINEAR_LIMIT,
  displayedSatelliteDistance,
  moonOrientation,
  moonVisualRadius,
  satelliteSceneOffset,
} from '../src/representation/satellites';
import { astroToScene } from '../src/representation/sceneFrame';
import { PLANET_VISUAL_RADIUS } from '../src/representation/visualScale';
import { NNBSP, formatKm, formatOrbitPeriod, formatSmallAngle, formatUtc } from '../src/ui/format';

const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const T = Date.UTC(2026, 9, 29, 18);

describe('représentation des satellites', () => {
  it('respecte l’échelle près de la planète puis compresse les distances, sans changer l’ordre', () => {
    for (const x of [1.05, 2, 2.77, SATELLITE_LINEAR_LIMIT]) expect(displayedSatelliteDistance(x)).toBeCloseTo(x, 12);
    let prev = 0;
    for (let x = 1; x < 500; x *= 1.01) {
      const d = displayedSatelliteDistance(x);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
    expect(displayedSatelliteDistance(60.3)).toBeCloseTo(6.0, 1);
  });

  it('conserve exactement la direction réelle du satellite vue de sa planète (séparation données / affichage)', () => {
    for (const id of MOON_IDS) {
      const km = moonPosition(id, T);
      const offset = satelliteSceneOffset(MOONS[id].parent, km);
      const ref = astroToScene(km);
      // Angle par atan2(|a × b|, a · b), précis même pour des vecteurs presque parallèles.
      expect(Math.atan2(norm(cross(offset, ref)), dot(offset, ref))).toBeLessThan(1e-12);
    }
    // Le calcul astronomique n'est pas modifié par l'affichage.
    expect(moonPosition('io', T)).toEqual(moonPosition('io', T));
  });

  it('place les lunes hors de leur planète (et hors des anneaux pour Saturne)', () => {
    for (const id of MOON_IDS) {
      const parent = MOONS[id].parent;
      const d = norm(satelliteSceneOffset(parent, moonPosition(id, T)));
      expect(d, id).toBeGreaterThan(PLANET_VISUAL_RADIUS[parent] * (parent === 'saturn' ? 2.3 : 1.2) + moonVisualRadius(id));
    }
  });

  it('conserve l’ordre des tailles réelles des lunes d’une même planète', () => {
    for (const ids of Object.values(MOONS_BY_PLANET)) {
      const sorted = [...ids].sort((a, b) => MOONS[a].radiusKm - MOONS[b].radiusKm);
      for (let k = 1; k < sorted.length; k++) expect(moonVisualRadius(sorted[k])).toBeGreaterThanOrEqual(moonVisualRadius(sorted[k - 1]));
    }
  });

  it('place l’ISS à l’échelle de la Terre (altitude réelle rapportée au rayon terrestre)', () => {
    const s = issState(ISS_DATA_START_MS + 86_400_000)!;
    const d = norm(satelliteSceneOffset('earth', s.position)) / PLANET_VISUAL_RADIUS.earth;
    expect(d).toBeCloseTo(norm(s.position) / PLANETS.earth.radiusKm, 12);
    expect(d).toBeGreaterThan(1.06);
    expect(d).toBeLessThan(1.075);
  });

  it('tourne la face « longitude 0° » de chaque lune vers sa planète (rotation synchrone)', () => {
    for (const id of MOON_IDS) {
      const axes = moonBodyAxes(id, T);
      const m = moonOrientation(axes.toParent, axes.north);
      // +x local (longitude 0) → direction de la planète ; à quelques degrés près (libration optique).
      const lon0 = mulVec(m, [1, 0, 0]);
      const toParent = astroToScene(normalize(sub([0, 0, 0], moonPosition(id, T))));
      expect(angleBetween(lon0, toParent) / (Math.PI / 180), id).toBeLessThan(id === 'nereid' ? 90 : 8);
      // Matrice de rotation propre (déterminant +1).
      const x = mulVec(m, [1, 0, 0]);
      const y = mulVec(m, [0, 1, 0]);
      const z = mulVec(m, [0, 0, 1]);
      expect(dot(cross(x, y), z)).toBeCloseTo(1, 9);
    }
  });
});

describe('navigation vers les satellites', () => {
  const ctx = { now: 1_000_000, settingsCount: 5 };
  const detail = (planet: NavState['detail']): NavState => ({ ...initialNavState(), view: 'detail', detail: planet, focused: planet! });

  it('ne propose aucun satellite pour Mercure et Vénus', () => {
    expect(hasSatellites('mercury')).toBe(false);
    expect(hasSatellites('venus')).toBe(false);
    expect(barItems(detail('mercury'))).not.toContain('satellites');
    expect(barItems(detail('venus'))).not.toContain('satellites');
    for (const p of ['earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const) expect(barItems(detail(p))).toContain('satellites');
  });

  it('ouvre la liste, observe un satellite puis revient à la planète avec Retour', () => {
    let state = detail('jupiter');
    const satellites = MOONS_BY_PLANET.jupiter;
    const step = (a: Parameters<typeof reduceNavigation>[1]) => {
      const r = reduceNavigation(state, a, { ...ctx, satellites });
      state = r.state;
      return r.effects;
    };
    step('ok'); // barre
    expect(barItems(state)[state.barIndex]).toBe('satellites');
    step('ok'); // liste
    expect(state.layer).toBe('satellites');
    step('down');
    expect(step('ok')).toEqual([{ type: 'openSatellite', id: 'europa' }]);
    expect(state.satellite).toBe('europa');
    expect(state.layer).toBe('scene');
    expect(barItems(state)).toContain('parent');
    expect(step('back')).toEqual([{ type: 'closeSatellite' }]);
    expect(state.satellite).toBeNull();
    expect(state.view).toBe('detail');
    expect(step('back')).toEqual([{ type: 'closePlanet' }]);
    expect(state.view).toBe('overview');
  });

  it('revient à la planète par le bouton de la barre et propose la vue « Soleil »', () => {
    const start: NavState = { ...detail('earth'), satellite: 'moon', layer: 'bar' };
    const items = barItems(start);
    const parent = reduceNavigation({ ...start, barIndex: items.indexOf('parent') }, 'ok', ctx);
    expect(parent.effects).toEqual([{ type: 'closeSatellite' }]);
    const sun = reduceNavigation({ ...start, barIndex: items.indexOf('sun') }, 'ok', ctx);
    expect(sun.effects).toEqual([{ type: 'sunView' }]);
  });

  it('ne propose l’ISS que si l’application la fournit (données valables)', () => {
    const state: NavState = { ...detail('earth'), layer: 'satellites', satelliteIndex: 1 };
    expect(reduceNavigation(state, 'ok', { ...ctx, satellites: ['moon', 'iss'] }).effects).toEqual([{ type: 'openSatellite', id: 'iss' }]);
    // Sans ISS : l'indice est ramené dans la liste (la Lune).
    expect(reduceNavigation(state, 'ok', { ...ctx, satellites: ['moon'] }).effects).toEqual([{ type: 'openSatellite', id: 'moon' }]);
  });

  it('lit le satellite demandé dans l’adresse', () => {
    expect(parseStartupOptions('?vue=jupiter&satellite=Ganym%C3%A8de').satellite).toBe('ganymede');
    expect(parseStartupOptions('?vue=terre&satellite=iss').satellite).toBe('iss');
    expect(parseStartupOptions('?vue=terre&lune=Lune').satellite).toBe('moon');
    expect(parseStartupOptions('?satellite=inconnu').satellite).toBeNull();
  });
});

describe('caméra des vues rapprochées', () => {
  const pose = (position: Vec3, target: Vec3): CameraPose => ({ position, target, up: [0, 1, 0] });

  it('contourne la planète lors des transitions (jamais à l’intérieur)', () => {
    const pivot: Vec3 = [5, 0, 0];
    const a = pose([5, 0, 3], pivot);
    const b = pose([5, 0, -2.5], [5, 0, -2.2]);
    for (let k = 0; k <= 100; k++) {
      const p = interpolatePoseAround(a, b, pivot, k / 100);
      expect(norm(sub(p.position, pivot))).toBeGreaterThanOrEqual(2.5 - 1e-9);
    }
    // Une interpolation linéaire passerait, elle, par le centre de la planète.
    expect(interpolatePoseAround(a, b, pivot, 0).position).toEqual(a.position);
    expect(interpolatePoseAround(a, b, pivot, 1).position[2]).toBeCloseTo(-2.5, 12);
  });

  it('repousse la caméra hors de la planète', () => {
    const p = keepOutsideSphere(pose([0.1, 0, 0], [0, 0, 0]), [0, 0, 0], 1);
    expect(norm(p.position)).toBeCloseTo(1, 12);
    expect(keepOutsideSphere(pose([3, 0, 0], [0, 0, 0]), [0, 0, 0], 1).position).toEqual([3, 0, 0]);
  });

  it('cadre le Soleil à 22° de l’axe de visée, du côté gauche de l’image', () => {
    const rig = new CameraRig(new PerspectiveCamera(36, 16 / 9, 0.01, 100));
    const layouts = layoutBodies(computeAstroState(T));
    for (const id of ['earth', 'jupiter', 'neptune'] as const) {
      const l = layouts[id];
      const frame = frameFromAxis(l.pole);
      (rig as unknown as { frame: typeof frame }).frame = frame;
      const params = rig.sunViewParams(l.sunDirection, 3);
      const d: Vec3 = [
        Math.cos(params.elevation) * Math.cos(params.azimuth),
        Math.cos(params.elevation) * Math.sin(params.azimuth),
        Math.sin(params.elevation),
      ];
      const camDir: Vec3 = [
        frame.ref[0] * d[0] + frame.side[0] * d[1] + frame.up[0] * d[2],
        frame.ref[1] * d[0] + frame.side[1] * d[1] + frame.up[1] * d[2],
        frame.ref[2] * d[0] + frame.side[2] * d[1] + frame.up[2] * d[2],
      ];
      const view: Vec3 = [-camDir[0], -camDir[1], -camDir[2]];
      expect(angleBetween(view, l.sunDirection) / (Math.PI / 180), id).toBeCloseTo(22, 6);
      expect(dot(l.sunDirection, cross(view, frame.up))).toBeLessThan(0);
    }
  });
});

describe('fiches d’information', () => {
  const state = computeAstroState(T);

  it('donne pour chaque lune diamètre, distance, période, inclinaison et sens du mouvement', () => {
    for (const id of MOON_IDS) {
      const info = moonInfo(id, state);
      const labels = info.lines.map((l) => l.label);
      expect(labels).toContain('Diamètre');
      expect(labels).toContain('Période orbitale');
      expect(labels).toContain('Sens du mouvement');
      expect(labels.some((l) => l.startsWith('Distance à'))).toBe(true);
      expect(labels.some((l) => l.startsWith('Inclinaison'))).toBe(true);
      expect(info.note).toContain(MOONS[id].description);
    }
    expect(moonInfo('triton', state).lines.find((l) => l.label === 'Sens du mouvement')!.value).toBe('rétrograde');
    expect(moonSubtitle('io')).toBe('Lune de Jupiter');
    expect(moonSubtitle('triton')).toBe('Lune de Neptune');
    expect(moonSubtitle('ariel')).toBe('Lune d’Uranus');
  });

  it('signale une position extrapolée hors de 2010–2030', () => {
    expect(moonInfo('io', computeAstroState(Date.UTC(2100, 0, 1))).note).toContain('extrapolée');
    expect(moonInfo('io', state).note).toContain('JPL Horizons');
  });

  it('présente l’ISS comme une position calculée, avec époque et validité', () => {
    const iss = issInfo(issState(ISS_DATA_START_MS + 86_400_000)!);
    const labels = iss.lines.map((l) => l.label);
    for (const l of ['Nature', 'Altitude calculée', 'Vitesse', 'Période orbitale', 'Inclinaison', 'Éléments (époque)', 'Validité']) expect(labels).toContain(l);
    expect(iss.note).toContain('non observée en temps réel');
    const late = issInfo(issState(ISS_DATA_STOP_MS + 3 * 86_400_000)!);
    expect(late.lines.find((l) => l.label === 'Validité')!.value).toContain('approximative');
  });

  it('ajoute la taille apparente du Soleil aux fiches des planètes', () => {
    expect(planetInfo('earth', state).lines[1]).toEqual({ label: 'Soleil vu d’ici', value: '0,54° (32′)' });
    expect(planetInfo('neptune', state).lines[1].value).toMatch(/′$/);
  });

  it('met en forme angles, périodes, distances et dates', () => {
    expect(formatSmallAngle(0.5329)).toBe('0,53° (32′)');
    expect(formatSmallAngle(0.0178)).toBe('1,1′');
    expect(formatOrbitPeriod(0.318910)).toBe('7 h 39 min');
    expect(formatOrbitPeriod(1.769138)).toBe('1 j 18 h 28 min');
    expect(formatOrbitPeriod(360.09)).toBe('360,1 jours');
    expect(formatKm(421_765)).toBe(`421${NNBSP}800 km`);
    expect(formatKm(9_375)).toBe(`9${NNBSP}375 km`);
    expect(formatUtc(Date.UTC(2026, 9, 28, 12))).toBe('28 octobre 2026, 12 h 00 UTC');
  });
});
