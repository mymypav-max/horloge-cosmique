/**
 * Ombre d'une planète sur ses satellites (éclipses de Lune, passages de
 * l'ISS dans l'ombre de la Terre, éclipses des satellites galiléens…).
 *
 * Modèle géométrique à deux cônes (ombre et pénombre) : à la distance d
 * derrière la planète (le long de l'axe Soleil-planète), le rayon de l'ombre
 * vaut Rp − d·(R☉ − Rp)/D et celui de la pénombre Rp + d·(R☉ + Rp)/D, où D
 * est la distance Soleil-planète. La fraction de lumière reçue passe
 * linéairement de 0 (dans l'ombre) à 1 (hors de la pénombre). La réfraction
 * dans l'atmosphère de la planète (teinte rouge de la Lune éclipsée) et
 * l'aplatissement de la planète sont négligés.
 */

import { SUN_RADIUS_KM } from '../data/planets';
import type { Vec3 } from './math';

/**
 * Fraction (0 à 1) de la lumière solaire reçue par un point.
 * @param positionKm position du point par rapport au centre de la planète (km)
 * @param toSun direction unitaire planète → Soleil
 * @param sunDistanceKm distance planète-Soleil (km)
 * @param planetRadiusKm rayon de la planète (km)
 */
export function sunlightFraction(positionKm: Vec3, toSun: Vec3, sunDistanceKm: number, planetRadiusKm: number): number {
  const x = positionKm[0] * toSun[0] + positionKm[1] * toSun[1] + positionKm[2] * toSun[2];
  if (x >= 0) return 1;
  const d = -x;
  const rho = Math.hypot(positionKm[0] - x * toSun[0], positionKm[1] - x * toSun[1], positionKm[2] - x * toSun[2]);
  const umbra = Math.max(0, planetRadiusKm - (d * (SUN_RADIUS_KM - planetRadiusKm)) / sunDistanceKm);
  const penumbra = planetRadiusKm + (d * (SUN_RADIUS_KM + planetRadiusKm)) / sunDistanceKm;
  if (rho >= penumbra) return 1;
  if (rho <= umbra) return 0;
  return (rho - umbra) / (penumbra - umbra);
}
