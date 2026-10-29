/**
 * Mise en page de la scène : transforme un AstroState en grandeurs visuelles
 * (repère de la scène Three.js), sans dépendre de Three.js.
 */

import { orbitPath } from '../astro/ephemeris';
import type { Mat3, Vec3 } from '../astro/math';
import { mulVec, normalize } from '../astro/math';
import type { AstroState } from '../astro/state';
import { PLANET_IDS, type PlanetId } from '../data/planets';
import { astroToScene, bodyOrientationInScene } from './sceneFrame';
import { PLANET_VISUAL_RADIUS, displayedPosition } from './visualScale';

export interface BodyLayout {
  id: PlanetId;
  /** Position dans la scène. */
  position: Vec3;
  radius: number;
  /** Matrice d'orientation du maillage (local → scène). */
  orientation: Mat3;
  /** Axe de rotation (pôle nord IAU) dans la scène. */
  pole: Vec3;
  /** Direction du Soleil vue du corps, dans la scène (exacte). */
  sunDirection: Vec3;
}

export function layoutBodies(state: AstroState): Record<PlanetId, BodyLayout> {
  const out = {} as Record<PlanetId, BodyLayout>;
  for (const id of PLANET_IDS) {
    const helio = state.positions[id];
    const orientation = bodyOrientationInScene(state.orientations[id]);
    out[id] = {
      id,
      position: astroToScene(displayedPosition(helio)),
      radius: PLANET_VISUAL_RADIUS[id],
      orientation,
      // Colonne 2 de la matrice locale → scène : image de l'axe local +y (nord).
      pole: [orientation[1], orientation[4], orientation[7]],
      sunDirection: astroToScene(normalize([-helio[0], -helio[1], -helio[2]])),
    };
  }
  return out;
}

/** Orientation du Soleil dans la scène (rotation de sa surface). */
export function layoutSunOrientation(state: AstroState): Mat3 {
  return bodyOrientationInScene(state.sunOrientation);
}

/** Points d'une orbite dans la scène (même transformation que les planètes). */
export function layoutOrbit(id: PlanetId, utcMs: number, count: number): Vec3[] {
  return orbitPath(id, utcMs, count).map((p) => astroToScene(displayedPosition(p)));
}

/** Direction du Soleil dans le repère local du maillage d'un corps. */
export function sunDirectionInBodyLocal(layout: BodyLayout): Vec3 {
  const o = layout.orientation;
  // Inverse d'une rotation = transposée.
  const t: Mat3 = [o[0], o[3], o[6], o[1], o[4], o[7], o[2], o[5], o[8]];
  return mulVec(t, layout.sunDirection);
}
