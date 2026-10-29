/**
 * Modèle de représentation : passage des données astronomiques aux grandeurs
 * visuelles de la scène.
 *
 * Principe fondamental du projet : les DIRECTIONS sont exactes, les DISTANCES
 * et les TAILLES sont adaptées à l'écran.
 *
 * 1. Distances au Soleil : une position héliocentrique r (UA) est affichée en
 *    f(|r|) · r/|r|. La direction (longitude ET latitude héliocentriques) est
 *    donc strictement conservée ; seule la distance est remplacée par f(|r|).
 *    f est une interpolation cubique monotone (Fritsch-Carlson) entre des
 *    rayons de référence (tableau RADIAL_CONTROL_POINTS) : strictement
 *    croissante, elle conserve l'ordre des distances et les excentricités
 *    restent visibles (Mercure, Mars).
 * 2. Tailles : rayons fixes choisis pour la lisibilité (PLANET_VISUAL_RADIUS),
 *    sans rapport d'échelle avec les distances ni avec les rayons réels.
 *
 * Aucune donnée astronomique n'est modifiée par ce module : il ne fait que
 * lire les positions calculées par src/astro.
 */

import type { PlanetId } from '../data/planets';
import type { Vec3 } from '../astro/math';

/** Points de contrôle (distance réelle en UA → distance affichée en unités de scène). */
export const RADIAL_CONTROL_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.387, 3.3], // Mercure
  [0.723, 4.75], // Vénus
  [1.0, 6.0], // Terre
  [1.524, 7.5], // Mars
  [5.203, 10.4], // Jupiter
  [9.537, 13.9], // Saturne
  [19.19, 17.1], // Uranus
  [30.07, 19.9], // Neptune
];

/** Rayon affiché du Soleil (unités de scène). */
export const SUN_VISUAL_RADIUS = 1.35;

/** Rayons affichés des planètes (unités de scène) — non proportionnels aux rayons réels. */
export const PLANET_VISUAL_RADIUS: Record<PlanetId, number> = {
  mercury: 0.23,
  venus: 0.36,
  earth: 0.4,
  mars: 0.29,
  jupiter: 0.85,
  saturn: 0.72,
  uranus: 0.55,
  neptune: 0.54,
};

/** Rayons des anneaux de Saturne, en rayons équatoriaux de Saturne (valeurs réelles : anneau C intérieur → anneau A extérieur). */
export const SATURN_RING_INNER = 74_658 / 60_268;
export const SATURN_RING_OUTER = 136_775 / 60_268;

/** Pentes de l'interpolation monotone (méthode de Fritsch-Carlson), calculées une fois. */
const SLOPES: number[] = (() => {
  const p = RADIAL_CONTROL_POINTS;
  const n = p.length;
  const delta: number[] = [];
  for (let k = 0; k < n - 1; k++) delta.push((p[k + 1][1] - p[k][1]) / (p[k + 1][0] - p[k][0]));
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let k = 1; k < n - 1; k++) {
    m[k] = delta[k - 1] * delta[k] <= 0 ? 0 : (delta[k - 1] + delta[k]) / 2;
  }
  for (let k = 0; k < n - 1; k++) {
    if (delta[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / delta[k];
    const b = m[k + 1] / delta[k];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[k] = t * a * delta[k];
      m[k + 1] = t * b * delta[k];
    }
  }
  return m;
})();

/** Distance affichée (unités de scène) pour une distance héliocentrique réelle (UA). */
export function displayedDistance(rAu: number): number {
  const p = RADIAL_CONTROL_POINTS;
  const n = p.length;
  if (rAu <= 0) return 0;
  if (rAu >= p[n - 1][0]) return p[n - 1][1] + SLOPES[n - 1] * (rAu - p[n - 1][0]);
  let k = 0;
  while (rAu > p[k + 1][0]) k++;
  const h = p[k + 1][0] - p[k][0];
  const t = (rAu - p[k][0]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p[k][1] +
    (t3 - 2 * t2 + t) * h * SLOPES[k] +
    (-2 * t3 + 3 * t2) * p[k + 1][1] +
    (t3 - t2) * h * SLOPES[k + 1]
  );
}

/**
 * Position affichée (repère écliptique J2000, unités de scène) d'une position
 * héliocentrique réelle (UA) : même direction, distance f(|r|).
 */
export function displayedPosition(helioAu: Vec3): Vec3 {
  const r = Math.hypot(helioAu[0], helioAu[1], helioAu[2]);
  if (r === 0) return [0, 0, 0];
  const k = displayedDistance(r) / r;
  return [helioAu[0] * k, helioAu[1] * k, helioAu[2] * k];
}

/** Rayon extérieur occupé par un corps (anneaux compris), utile au cadrage. */
export function visualExtent(id: PlanetId): number {
  return id === 'saturn' ? PLANET_VISUAL_RADIUS.saturn * SATURN_RING_OUTER : PLANET_VISUAL_RADIUS[id];
}
