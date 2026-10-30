import { PerspectiveCamera, SphereGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { ISS_FORECAST_LABEL, issInfo, issUnavailableText, moonInfo, moonSubtitle, planetInfo } from '../src/app/info';
import { parseStartupOptions } from '../src/app/startup';
import { ISS_DATA, ISS_DATA_START_MS, ISS_DATA_STOP_MS, issState, issValidity } from '../src/astro/iss';
import { type Vec3, angleBetween, cross, dot, mulVec, normalize, scale as scaleVec, sub } from '../src/astro/math';
import { moonBodyAxes, moonOrbitNormal, moonPosition } from '../src/astro/moons';
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
import { NNBSP, formatElapsed, formatKm, formatOrbitPeriod, formatSmallAngle, formatUtc, formatUtcDate } from '../src/ui/format';

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

describe('orientation des cartes des lunes', () => {
  /** Point du maillage (sphère de Three.js) correspondant à une longitude est et une latitude de la carte. */
  function meshPoint(lonDeg: number, latDeg: number): Vec3 {
    const geo = new SphereGeometry(1, 72, 36);
    const uv = geo.getAttribute('uv');
    const pos = geo.getAttribute('position');
    // Convention des cartes du projet : longitude 0 au centre (u = 0,5), est vers la droite, nord en haut.
    const u = 0.5 + lonDeg / 360;
    const v = 0.5 + latDeg / 180;
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < uv.count; k++) {
      const d = Math.hypot(uv.getX(k) - u, uv.getY(k) - v);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return [pos.getX(best), pos.getY(best), pos.getZ(best)];
  }

  it('place la longitude 0 vers la planète, le nord IAU en haut et l’est dans le sens direct autour du nord, y compris pour les rotations rétrogrades', () => {
    // Le maillage est stocké en flottants 32 bits (≈ 1e-7 près) ; une erreur d'orientation serait de 90° ou 180°.
    const FLOAT32_RAD = 1e-6;
    // Lunes d'Uranus et Triton : rotation rétrograde par rapport à leur pôle nord IAU (côté nord du plan invariable).
    for (const id of MOON_IDS) {
      const axes = moonBodyAxes(id, T);
      const m = moonOrientation(axes.toParent, axes.north);
      const toScene = (lon: number, lat: number) => mulVec(m, meshPoint(lon, lat));
      expect(angleBetween(toScene(0, 0), astroToScene(axes.toParent)), id).toBeLessThan(FLOAT32_RAD);
      expect(angleBetween(toScene(0, 90), astroToScene(axes.north)), id).toBeLessThan(FLOAT32_RAD);
      // Longitude 90° E = nord × (direction de la longitude 0) : longitudes est (planétocentriques) de la nomenclature UAI.
      const east = astroToScene(normalize(cross(axes.north, axes.toParent)));
      expect(angleBetween(toScene(90, 0), east), id).toBeLessThan(FLOAT32_RAD);
      expect(angleBetween(toScene(-90, 0), scaleVec(east, -1)), id).toBeLessThan(FLOAT32_RAD);
      // Pôle nord IAU : du côté nord de l'écliptique (proche du plan invariable).
      expect(axes.north[2], id).toBeGreaterThan(0);
    }
    // Rotation rétrograde autour du pôle nord pour les lunes d'Uranus et Triton (mouvement orbital opposé au nord).
    for (const id of ['miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton'] as const) {
      expect(dot(moonOrbitNormal(id, T), moonBodyAxes(id, T).north), id).toBeLessThan(0);
    }
    for (const id of ['moon', 'io', 'enceladus', 'titan'] as const) {
      expect(dot(moonOrbitNormal(id, T), moonBodyAxes(id, T).north), id).toBeGreaterThan(0);
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

describe('rotation de la caméra aux flèches', () => {
  const layouts = layoutBodies(computeAstroState(T));
  const jupiter = layouts.jupiter;
  // Io, à 3 rayons de Jupiter, rayon affiché 0,05 (seule la géométrie compte ici).
  const io = {
    id: 'io' as const,
    parent: 'jupiter' as const,
    position: [jupiter.position[0] + 3 * jupiter.radius, jupiter.position[1], jupiter.position[2]] as Vec3,
    radius: 0.05,
    orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] as [number, number, number, number, number, number, number, number, number],
    sunDirection: jupiter.sunDirection,
    orbitNormal: [0, 1, 0] as Vec3,
  };
  const run = (rig: CameraRig, from: number, seconds: number, h = 0) => {
    let now = from;
    for (let k = 0; k < seconds * 30; k++) {
      now += 1000 / 30;
      rig.setRotationInput(h, 0);
      rig.update(1 / 30, now, 16 / 9, layouts, { io });
    }
    return now;
  };
  const camera = (rig: CameraRig): Vec3 => (rig as unknown as { camera: PerspectiveCamera }).camera.position.toArray() as Vec3;

  it('n’accepte la rotation qu’en vue stable d’une planète ou d’un satellite (pas en vue générale ni pendant les transitions)', () => {
    const rig = new CameraRig(new PerspectiveCamera(36, 16 / 9, 0.01, 100));
    expect(rig.mode).toBe('overview');
    expect(rig.acceptsRotationInput).toBe(false);
    rig.openPlanet(jupiter, 0);
    expect(rig.mode).toBe('toDetail');
    expect(rig.acceptsRotationInput).toBe(false);
    let now = run(rig, 0, 3);
    expect(rig.mode).toBe('detail');
    expect(rig.acceptsRotationInput).toBe(true);
    rig.openSatellite(io, jupiter, now);
    expect(rig.mode).toBe('toSatellite');
    expect(rig.acceptsRotationInput).toBe(false);
    now = run(rig, now, 3);
    expect(rig.mode).toBe('satellite');
    expect(rig.acceptsRotationInput).toBe(true);
  });

  it('fait pivoter la caméra autour du satellite observé, à distance constante, et s’arrête au relâchement', () => {
    const rig = new CameraRig(new PerspectiveCamera(36, 16 / 9, 0.01, 100));
    rig.openPlanet(jupiter, 0);
    let now = run(rig, 0, 3);
    rig.openSatellite(io, jupiter, now);
    now = run(rig, now, 3);
    expect(rig.mode).toBe('satellite');
    const before = sub(camera(rig), io.position);
    now = run(rig, now, 1.5, 1); // flèche droite maintenue 1,5 s
    const after = sub(camera(rig), io.position);
    expect(angleBetween(before, after) / (Math.PI / 180)).toBeGreaterThan(20);
    expect(norm(after)).toBeCloseTo(norm(before), 6);
    expect(rig.satellite).toBe('io');
    // Relâchement : la caméra ralentit puis s'immobilise (aucune dérive).
    now = run(rig, now, 2, 0);
    const still = sub(camera(rig), io.position);
    run(rig, now, 1, 0);
    expect(angleBetween(still, sub(camera(rig), io.position)) / (Math.PI / 180)).toBeLessThan(0.05);
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

  it('indique pour chaque lune la qualité de sa représentation, sans mention superflue', () => {
    const texts = (id: (typeof MOON_IDS)[number]) => moonInfo(id, state).representation;
    for (const id of MOON_IDS) {
      const r = texts(id);
      expect(r.length, id).toBeGreaterThan(0);
      expect(r.length, id).toBeLessThanOrEqual(3);
      expect(new Set(r).size, id).toBe(r.length);
      // Une carte photographique complète exclut toute autre réserve sur la carte.
      if (r.includes('Carte photographique')) expect(r, id).toEqual(['Carte photographique']);
    }
    for (const id of ['proteus', 'nereid'] as const) {
      expect(texts(id)).toEqual(['Aucune carte photographique disponible', 'Forme représentée par une sphère']);
    }
    for (const id of ['miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton'] as const) {
      expect(texts(id)).toEqual(['Carte partiellement reconstituée', 'Certaines régions n’ont jamais été photographiées']);
    }
    expect(texts('europa')).toEqual(['Carte partiellement reconstituée']);
    expect(texts('callisto')).toEqual(['Carte partiellement reconstituée']);
    expect(texts('titan')).toEqual(['Texture issue d’observations infrarouges', 'Représentation approximative']);
    expect(texts('deimos')).toEqual(['Représentation approximative', 'Carte partiellement reconstituée', 'Forme représentée par une sphère']);
    expect(texts('phobos')).toEqual(['Représentation approximative', 'Forme représentée par une sphère']);
    for (const id of ['moon', 'io', 'ganymede', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'iapetus'] as const) {
      expect(texts(id)).toEqual(['Carte photographique']);
    }
    // Les fiches astronomiques sont conservées : la mention s'ajoute, elle ne remplace rien.
    expect(moonInfo('triton', state).lines).toHaveLength(7);
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
  });

  it('affiche la prévision NASA d’origine, et un écart mesuré par rapport à elle (pas à la station réelle)', () => {
    expect(ISS_FORECAST_LABEL).toBe(`Prévision NASA du ${formatUtcDate(Date.parse(`${ISS_DATA.source.creationDate}Z`))}`);
    expect(ISS_FORECAST_LABEL).toMatch(/^Prévision NASA du \d{1,2} [a-zéû]+ \d{4}$/);
    for (const t of [ISS_DATA_START_MS, ISS_DATA_STOP_MS]) {
      const info = issInfo(issState(t)!);
      expect(info.lines.find((l) => l.label === 'Validité')!.value).toBe(ISS_FORECAST_LABEL);
      expect(info.note).toContain('ajustés par le projet');
      expect(info.note).toContain('pas avec la position réelle de la station');
      expect(info.note).toMatch(/Écart ≤ \d km avec cette prévision/);
    }
  });

  it('signale l’extrapolation, sans précision garantie, après expiration de la prévision', () => {
    const minuteAfter = issInfo(issState(ISS_DATA_STOP_MS + 60_000)!);
    expect(minuteAfter.lines.find((l) => l.label === 'Validité')!.value).toBe('Extrapolation');
    expect(minuteAfter.lines.find((l) => l.label === 'Prévision expirée depuis')!.value).toBe('moins d’une heure');
    expect(minuteAfter.note).toContain('manœuvre orbitale non intégrée');
    expect(minuteAfter.note).toContain('Aucune précision n’est garantie');
    expect(minuteAfter.note).not.toMatch(/≤ \d km/);
    const lastDay = issInfo(issState(ISS_DATA_STOP_MS + 7 * 86_400_000)!);
    expect(lastDay.lines.find((l) => l.label === 'Prévision expirée depuis')!.value).toBe('7 j');
    expect(issInfo(issState(ISS_DATA_STOP_MS + 5 * 3_600_000)!).lines.find((l) => l.label === 'Prévision expirée depuis')!.value).toBe('5 h');
    expect(issInfo(issState(ISS_DATA_START_MS - 3_600_000)!).lines.find((l) => l.label === 'Avant la prévision de')!.value).toBe('1 h');
  });

  it('explique pourquoi l’ISS est masquée (données expirées à actualiser, absentes, ou station pas encore lancée)', () => {
    const expired = issUnavailableText(issValidity(ISS_DATA_STOP_MS + 8 * 86_400_000));
    expect(expired.note).toContain('doivent être actualisées');
    expect(expired.note).toContain('plus de 7 jours');
    expect(expired.toast).toContain('à actualiser');
    expect(issUnavailableText(issValidity(Date.UTC(2020, 0, 1))).note).toContain('aucune donnée orbitale embarquée');
    expect(issUnavailableText(issValidity(Date.UTC(1990, 0, 1))).note).toContain('pas encore en orbite');
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
    expect(formatUtcDate(Date.UTC(2026, 9, 28, 15, 3))).toBe('28 octobre 2026');
    expect(formatUtcDate(Date.UTC(2026, 10, 1))).toBe('1er novembre 2026');
    expect(formatElapsed(1 / 1440)).toBe('moins d’une heure');
    expect(formatElapsed(47.9 / 24)).toBe('47 h');
    expect(formatElapsed(2)).toBe('2 j');
    expect(formatElapsed(7)).toBe('7 j');
  });
});
