/**
 * Éphémérides planétaires simplifiées (méthode de Standish, JPL).
 *
 * Résultat : positions héliocentriques dans le repère de l'écliptique et de
 * l'équinoxe moyens de J2000, en unités astronomiques. Pour la Terre, il s'agit
 * du barycentre Terre-Lune (écart < 4 700 km, soit < 7″ vu du Soleil).
 *
 * Précision (d'après Standish, erreurs maximales en ascension droite) :
 * de quelques secondes d'arc (Mercure, Vénus, Terre) à une dizaine de minutes
 * d'arc (Saturne) entre 1800 et 2050 ; un peu moins bonne hors de cet
 * intervalle. Largement suffisant pour une horloge visuelle, mais ce ne sont
 * pas des éphémérides de haute précision (type DE440 ou VSOP87 complet).
 */

import {
  ELEMENTS_1800_2050,
  ELEMENTS_3000BC_3000AD,
  EXTRA_TERMS_3000BC_3000AD,
  TABLE1_RANGE_T,
  TABLE2_RANGE_T,
  type ElementSet,
} from '../data/orbitalElements';
import { PLANET_IDS, type PlanetId } from '../data/planets';
import { type OrbitalElements, positionFromElements, sampleOrbit } from './kepler';
import { DEG, type Vec3 } from './math';
import { centuriesTT } from './time';

export type ElementTable = 'table1' | 'table2';

/** Choisit la table de Standish adaptée à l'instant (T en siècles TT). */
export function selectTable(T: number): ElementTable {
  return T >= TABLE1_RANGE_T[0] && T <= TABLE1_RANGE_T[1] ? 'table1' : 'table2';
}

/** Indique si l'instant est dans le domaine de validité global du modèle. */
export function isWithinModelValidity(T: number): boolean {
  return T >= TABLE2_RANGE_T[0] && T <= TABLE2_RANGE_T[1];
}

function at(set: ElementSet, T: number) {
  return {
    a: set.a + set.aDot * T,
    e: set.e + set.eDot * T,
    i: set.i + set.iDot * T,
    L: set.L + set.LDot * T,
    varpi: set.varpi + set.varpiDot * T,
    node: set.node + set.nodeDot * T,
  };
}

/** Éléments orbitaux d'une planète à l'instant T (siècles TT depuis J2000). */
export function elementsAt(id: PlanetId, T: number, table: ElementTable = selectTable(T)): OrbitalElements {
  const base = table === 'table1' ? ELEMENTS_1800_2050[id] : ELEMENTS_3000BC_3000AD[id];
  const v = at(base, T);
  let Mdeg = v.L - v.varpi;
  if (table === 'table2') {
    const x = EXTRA_TERMS_3000BC_3000AD[id];
    if (x) {
      const fT = x.f * T * DEG;
      Mdeg += x.b * T * T + x.c * Math.cos(fT) + x.s * Math.sin(fT);
    }
  }
  return {
    a: v.a,
    e: v.e,
    i: v.i * DEG,
    node: v.node * DEG,
    argPeri: (v.varpi - v.node) * DEG,
    M: Mdeg * DEG,
  };
}

/** Position héliocentrique écliptique J2000 (UA) d'une planète. */
export function heliocentricPosition(id: PlanetId, utcMs: number): Vec3 {
  return positionFromElements(elementsAt(id, centuriesTT(utcMs)));
}

/** Positions de toutes les planètes au même instant (cohérentes entre elles). */
export function allHeliocentricPositions(utcMs: number): Record<PlanetId, Vec3> {
  const T = centuriesTT(utcMs);
  const table = selectTable(T);
  const out = {} as Record<PlanetId, Vec3>;
  for (const id of PLANET_IDS) out[id] = positionFromElements(elementsAt(id, T, table));
  return out;
}

/** Points de l'orbite d'une planète (UA, écliptique J2000) à l'instant donné. */
export function orbitPath(id: PlanetId, utcMs: number, count: number): Vec3[] {
  const el = elementsAt(id, centuriesTT(utcMs));
  return sampleOrbit(el, count);
}

/** Longitude (°) et latitude (°) héliocentriques écliptiques, distance (UA). */
export function eclipticCoordinates(v: Vec3): { lonDeg: number; latDeg: number; distanceAu: number } {
  const r = Math.hypot(v[0], v[1], v[2]);
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  return { lonDeg: lon, latDeg: Math.asin(v[2] / r) / DEG, distanceAu: r };
}
