/**
 * Taille d'affichage du Soleil.
 *
 * - Vue générale : rayon fixe (SUN_VISUAL_RADIUS), choisi pour la lisibilité.
 * - Vues rapprochées (planète, lune, ISS) : le Soleil est affiché avec sa
 *   taille apparente RÉELLE vue depuis le corps observé. Le Soleil étant
 *   placé à l'origine de la scène, une sphère de rayon R vue de la caméra à
 *   la distance d sous-tend 2·arcsin(R/d) ; on choisit donc
 *   R = d · R☉ / r, où r est la distance réelle Soleil–corps : l'angle obtenu
 *   est exactement le diamètre apparent θ = 2·arcsin(R☉/r) = 2·arcsin(D/2r).
 * - Entre les deux, interpolation logarithmique selon l'avancement de la
 *   transition : pas de saut brusque.
 *
 * Ce module ne modifie aucune donnée astronomique.
 */

import { AU_KM, SUN_RADIUS_KM } from '../data/planets';
import { SUN_VISUAL_RADIUS } from './visualScale';

/** Rayon (unités de scène) donnant au Soleil son diamètre apparent réel vu d'une distance r (UA), caméra à d. */
export function apparentSunRadius(cameraDistance: number, observerDistanceAu: number): number {
  return (cameraDistance * SUN_RADIUS_KM) / (observerDistanceAu * AU_KM);
}

/**
 * Rayon affiché du Soleil : `fade` = 0 en vue générale, 1 en vue rapprochée.
 * `observerDistanceAu` : distance héliocentrique du corps observé.
 */
export function displayedSunRadius(fade: number, cameraDistance: number, observerDistanceAu: number): number {
  const f = Math.max(0, Math.min(1, fade));
  if (f === 0) return SUN_VISUAL_RADIUS;
  const apparent = apparentSunRadius(cameraDistance, observerDistanceAu);
  return Math.exp(Math.log(SUN_VISUAL_RADIUS) * (1 - f) + Math.log(apparent) * f);
}

/** Diamètre angulaire minimal du halo en vue rapprochée (°), pour que le Soleil reste visible comme une étoile brillante de loin. */
export const SUN_GLOW_MIN_ANGLE_DEG = 0.9;
/** Rapport halo / rayon du disque (identique à la vue générale). */
export const SUN_GLOW_RATIO = 6.2;

/** Diamètre (unités de scène) du halo du Soleil. */
export function displayedSunGlow(fade: number, radius: number, cameraDistance: number): number {
  const f = Math.max(0, Math.min(1, fade));
  const minGlow = 2 * cameraDistance * Math.tan(((SUN_GLOW_MIN_ANGLE_DEG / 2) * Math.PI) / 180);
  return radius * SUN_GLOW_RATIO * (1 - f) + Math.max(radius * SUN_GLOW_RATIO, minGlow) * f;
}
