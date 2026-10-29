/**
 * Représentation des satellites (lunes et ISS) autour de leur planète.
 *
 * Même principe que pour les planètes : les DIRECTIONS sont exactes, les
 * DISTANCES et les TAILLES sont adaptées à l'écran.
 *
 * 1. Distance à la planète : un satellite à la distance réelle r d'une
 *    planète de rayon réel Rp est affiché, dans la même direction, à
 *    Rv · g(r / Rp), où Rv est le rayon affiché de la planète et
 *      g(x) = x               si x ≤ 3 (échelle respectée près de la planète :
 *                             Phobos, ISS),
 *      g(x) = 3 + ln(x / 3)   au-delà (compression logarithmique).
 *    g est continue et strictement croissante : l'ordre des distances et la
 *    forme des orbites excentriques (Néréide) restent lisibles. Exemples :
 *    Lune 60 Rp → 6,0 Rv ; Titan 21 Rp → 4,9 Rv ; Japet 61 Rp → 6,0 Rv.
 * 2. Taille des lunes : Rv · 0,6 · √(R / Rp), ce qui conserve l'ordre des
 *    tailles et grossit les petites lunes (Phobos, Mimas) pour qu'on les voie.
 * 3. ISS : maquette agrandie (envergure affichée ISS_VISUAL_SPAN, soit
 *    environ 1 500 fois sa taille réelle de 109 m) ; son altitude, elle, est à
 *    l'échelle de la Terre.
 *
 * Ce module ne modifie aucune donnée astronomique.
 */

import type { Mat3, Vec3 } from '../astro/math';
import { cross, normalize } from '../astro/math';
import { MOONS, type MoonId } from '../data/moons';
import { PLANETS, type PlanetId } from '../data/planets';
import { astroToScene } from './sceneFrame';
import { PLANET_VISUAL_RADIUS } from './visualScale';

export type SatelliteId = MoonId | 'iss';

/** Rapport distance / rayon de la planète jusqu'auquel l'échelle est respectée. */
export const SATELLITE_LINEAR_LIMIT = 3;
/** Facteur de taille des lunes. */
export const MOON_SIZE_FACTOR = 0.6;
/** Envergure affichée de la maquette de l'ISS (unités de scène). */
export const ISS_VISUAL_SPAN = 0.012;
/** Envergure réelle de l'ISS (km), d'après la NASA (109 m). */
export const ISS_REAL_SPAN_KM = 0.109;

/** Distance affichée (en rayons affichés de la planète) pour un rapport réel distance / rayon. */
export function displayedSatelliteDistance(ratio: number): number {
  if (ratio <= SATELLITE_LINEAR_LIMIT) return ratio;
  return SATELLITE_LINEAR_LIMIT + Math.log(ratio / SATELLITE_LINEAR_LIMIT);
}

/** Décalage (scène) d'un satellite par rapport au centre de sa planète, pour une position planétocentrique réelle (km, écliptique). */
export function satelliteSceneOffset(parent: PlanetId, positionKm: Vec3): Vec3 {
  const r = Math.hypot(positionKm[0], positionKm[1], positionKm[2]);
  if (r === 0) return [0, 0, 0];
  const k = (PLANET_VISUAL_RADIUS[parent] * displayedSatelliteDistance(r / PLANETS[parent].radiusKm)) / r;
  return astroToScene([positionKm[0] * k, positionKm[1] * k, positionKm[2] * k]);
}

/** Rayon affiché d'une lune (unités de scène). */
export function moonVisualRadius(id: MoonId): number {
  const moon = MOONS[id];
  return PLANET_VISUAL_RADIUS[moon.parent] * MOON_SIZE_FACTOR * Math.sqrt(moon.radiusKm / PLANETS[moon.parent].radiusKm);
}

/**
 * Orientation (repère local du maillage → scène) d'une lune synchrone, à
 * partir de la direction de la planète et du pôle nord (écliptique) : la
 * longitude 0° de la carte (+x local) regarde la planète, le nord est +y
 * local et la longitude 90° E est −z local, comme pour les planètes.
 */
export function moonOrientation(toParent: Vec3, north: Vec3): Mat3 {
  const x = normalize(astroToScene(toParent));
  const yRaw = astroToScene(north);
  const z = normalize(cross(x, yRaw));
  const y = cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

export interface SatelliteLayout {
  id: SatelliteId;
  parent: PlanetId;
  /** Position dans la scène. */
  position: Vec3;
  /** Rayon affiché (pour l'ISS : demi-envergure de la maquette). */
  radius: number;
  /** Orientation du maillage (local → scène). */
  orientation: Mat3;
  /** Direction du Soleil (scène). */
  sunDirection: Vec3;
  /** Normale au plan de l'orbite (scène, sens du mouvement). */
  orbitNormal: Vec3;
}
