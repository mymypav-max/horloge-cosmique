/**
 * Taille apparente du Soleil vue depuis un corps du système solaire.
 *
 * Diamètre angulaire d'une sphère de diamètre D vue à la distance r (entre
 * les centres) : θ = 2·arcsin(D / 2r). Avec r variable (orbites elliptiques),
 * la taille apparente change au cours de l'année (Terre : 0,524° à l'aphélie,
 * 0,542° au périhélie).
 */

import { AU_KM, SUN_RADIUS_KM } from '../data/planets';

/** Diamètre angulaire (radians) d'une sphère de diamètre D vue à la distance r (mêmes unités). */
export function angularDiameter(diameter: number, distance: number): number {
  return 2 * Math.asin(Math.min(1, diameter / (2 * distance)));
}

/** Diamètre angulaire du Soleil (degrés) vu à une distance héliocentrique donnée (UA). */
export function sunAngularDiameterDeg(distanceAu: number): number {
  return (angularDiameter(2 * SUN_RADIUS_KM, distanceAu * AU_KM) * 180) / Math.PI;
}
