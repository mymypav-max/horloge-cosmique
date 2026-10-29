/**
 * Mécanique képlérienne : résolution de l'équation de Kepler et passage des
 * éléments orbitaux aux coordonnées cartésiennes héliocentriques.
 *
 * Méthode : E. M. Standish, « Keplerian Elements for Approximate Positions of
 * the Major Planets » (JPL), section « Formulae ».
 */

import { type Vec3, wrapRadiansPi } from './math';

/**
 * Résout E − e·sin E = M par la méthode de Newton.
 * @param M anomalie moyenne (radians)
 * @param e excentricité (0 ≤ e < 1)
 * @returns anomalie excentrique E (radians)
 */
export function solveKepler(M: number, e: number): number {
  const m = wrapRadiansPi(M);
  let E = m + e * Math.sin(m);
  for (let k = 0; k < 30; k++) {
    const f = E - e * Math.sin(E) - m;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-13) break;
  }
  return E;
}

/** Éléments orbitaux instantanés (angles en radians, a en UA). */
export interface OrbitalElements {
  a: number;
  e: number;
  /** Inclinaison sur l'écliptique J2000. */
  i: number;
  /** Longitude du nœud ascendant Ω. */
  node: number;
  /** Argument du périhélie ω = ϖ − Ω. */
  argPeri: number;
  /** Anomalie moyenne M. */
  M: number;
}

/**
 * Position dans le plan de l'orbite (x' vers le périhélie) à partir de
 * l'anomalie excentrique E.
 */
export function orbitalPlanePosition(a: number, e: number, E: number): [number, number] {
  return [a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E)];
}

/**
 * Passage du plan orbital au repère écliptique J2000 (rotations −ω, −I, −Ω).
 */
export function orbitalPlaneToEcliptic(xp: number, yp: number, el: Pick<OrbitalElements, 'i' | 'node' | 'argPeri'>): Vec3 {
  const cw = Math.cos(el.argPeri);
  const sw = Math.sin(el.argPeri);
  const cO = Math.cos(el.node);
  const sO = Math.sin(el.node);
  const cI = Math.cos(el.i);
  const sI = Math.sin(el.i);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** Position héliocentrique écliptique J2000 (UA) pour des éléments donnés. */
export function positionFromElements(el: OrbitalElements): Vec3 {
  const E = solveKepler(el.M, el.e);
  const [xp, yp] = orbitalPlanePosition(el.a, el.e, E);
  return orbitalPlaneToEcliptic(xp, yp, el);
}

/**
 * Points régulièrement répartis (en anomalie excentrique) le long de l'ellipse
 * décrite par les éléments : sert au tracé des orbites.
 */
export function sampleOrbit(el: Omit<OrbitalElements, 'M'>, count: number): Vec3[] {
  const points: Vec3[] = [];
  for (let k = 0; k < count; k++) {
    const E = (k / count) * Math.PI * 2;
    const [xp, yp] = orbitalPlanePosition(el.a, el.e, E);
    points.push(orbitalPlaneToEcliptic(xp, yp, el));
  }
  return points;
}
