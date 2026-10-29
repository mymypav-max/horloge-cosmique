/**
 * Accès à la bibliothèque de référence `astronomy-engine` (Don Cross, licence
 * MIT, modèles VSOP87 / NOVAS, précision de l'ordre de la minute d'arc ou
 * mieux). Elle n'est utilisée QUE dans les tests, comme source indépendante
 * pour valider le modèle léger embarqué dans l'application.
 */

import * as Astronomy from 'astronomy-engine';
import type { PlanetId } from '../../src/data/planets';
import { centuriesTT } from '../../src/astro/time';

const BODY: Record<PlanetId, Astronomy.Body> = {
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  // Le modèle de Standish décrit le barycentre Terre-Lune.
  earth: Astronomy.Body.EMB,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
};

const EQJ_TO_ECL = Astronomy.Rotation_EQJ_ECL();

/**
 * Position héliocentrique écliptique J2000 (UA) selon astronomy-engine, au même
 * instant TT que notre modèle (on isole ainsi l'erreur des éphémérides de
 * celle du modèle de ΔT).
 */
export function referenceHelioEcliptic(id: PlanetId, utcMs: number): [number, number, number] {
  const time = Astronomy.AstroTime.FromTerrestrialTime(centuriesTT(utcMs) * 36525);
  const v = Astronomy.HelioVector(BODY[id], time);
  const e = Astronomy.RotateVector(EQJ_TO_ECL, v);
  return [e.x, e.y, e.z];
}

/** Temps sidéral apparent de Greenwich (degrés). */
export function referenceGastDegrees(utcMs: number): number {
  return Astronomy.SiderealTime(new Date(utcMs)) * 15;
}

/** Point subsolaire de référence (latitude, longitude en degrés). */
export function referenceSubsolar(utcMs: number): { latDeg: number; lonDeg: number } {
  const date = new Date(utcMs);
  const observer = new Astronomy.Observer(0, 0, 0);
  // Coordonnées équatoriales de la date, sans aberration (comme notre modèle).
  const eq = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, false);
  const gast = Astronomy.SiderealTime(date);
  let lon = (eq.ra - gast) * 15;
  lon = ((lon + 540) % 360) - 180;
  return { latDeg: eq.dec, lonDeg: lon };
}

/** Instants des équinoxes et solstices d'une année (ms UTC). */
export function referenceSeasons(year: number) {
  const s = Astronomy.Seasons(year);
  return {
    marchEquinox: s.mar_equinox.date.getTime(),
    juneSolstice: s.jun_solstice.date.getTime(),
    septemberEquinox: s.sep_equinox.date.getTime(),
    decemberSolstice: s.dec_solstice.date.getTime(),
  };
}

export function angularDistanceDeg(a: [number, number, number], b: [number, number, number]): number {
  const na = Math.hypot(...a);
  const nb = Math.hypot(...b);
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb);
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

/** Écart angulaire minimal entre deux longitudes (degrés). */
export function longitudeDiffDeg(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return Math.abs(d);
}
