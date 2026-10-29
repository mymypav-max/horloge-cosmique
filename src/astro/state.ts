/**
 * État astronomique complet à un instant : point d'entrée unique du modèle
 * astronomique pour le reste de l'application.
 *
 * Toutes les grandeurs sont exprimées dans le repère écliptique J2000
 * (positions en UA, orientations sous forme de matrices de rotation).
 */

import { MOON_IDS, type MoonId } from '../data/moons';
import { PLANET_IDS, PLANETS, SUN_ROTATION, type PlanetId } from '../data/planets';
import { eclipticToBodyMatrix } from './bodyRotation';
import { computeEarthState, type EarthState } from './earth';
import { allHeliocentricPositions, isWithinModelValidity } from './ephemeris';
import type { Mat3, Vec3 } from './math';
import { allMoonPositions } from './moons';
import { centuriesTT } from './time';

export interface AstroState {
  utcMs: number;
  /** Positions héliocentriques (UA). */
  positions: Record<PlanetId, Vec3>;
  /** Matrices écliptique → repère propre de chaque planète. */
  orientations: Record<PlanetId, Mat3>;
  earth: EarthState;
  /** Matrice écliptique → repère propre du Soleil (rotation de sa surface). */
  sunOrientation: Mat3;
  /** Positions planétocentriques des lunes (km, écliptique J2000). */
  moons: Record<MoonId, Vec3>;
  /** Faux si l'instant sort du domaine de validité des éléments de Standish. */
  valid: boolean;
}

export function computeAstroState(utcMs: number): AstroState {
  const positions = allHeliocentricPositions(utcMs);
  const earth = computeEarthState(utcMs, positions.earth);
  const orientations = {} as Record<PlanetId, Mat3>;
  for (const id of PLANET_IDS) {
    orientations[id] = id === 'earth' ? earth.eclToEarth : eclipticToBodyMatrix(PLANETS[id].rotation, utcMs);
  }
  return {
    utcMs,
    positions,
    orientations,
    earth,
    sunOrientation: eclipticToBodyMatrix(SUN_ROTATION, utcMs),
    moons: allMoonPositions(utcMs, MOON_IDS),
    valid: isWithinModelValidity(centuriesTT(utcMs)),
  };
}
