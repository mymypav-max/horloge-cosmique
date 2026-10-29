/**
 * Correspondance entre les repères astronomiques et les axes de Three.js.
 *
 * Three.js utilise un repère direct « y vers le haut ». Les repères
 * astronomiques (écliptique J2000, repère terrestre, repères des planètes)
 * sont des repères directs « z vers le nord ». On passe de l'un à l'autre par
 * la rotation propre (déterminant +1) :
 *
 *   (x, y, z)_astro → (x, z, −y)_scène
 *
 * Ainsi le pôle nord de l'écliptique pointe vers +y (le « haut » de la scène).
 * La même correspondance relie le repère terrestre (x vers Greenwich, z vers
 * le pôle Nord) au repère local du maillage de la Terre : avec la
 * paramétrisation de SphereGeometry, la longitude 0° de la texture
 * équirectangulaire tombe sur +x local et la longitude 90° E sur −z local.
 */

import type { Mat3, Vec3 } from '../astro/math';
import { mulMat, transpose } from '../astro/math';

/** Matrice de passage astro → scène. */
export const ASTRO_TO_SCENE: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
export const SCENE_TO_ASTRO: Mat3 = transpose(ASTRO_TO_SCENE);

export function astroToScene(v: Vec3): Vec3 {
  return [v[0], v[2], -v[1]];
}

export function sceneToAstro(v: Vec3): Vec3 {
  return [v[0], -v[2], v[1]];
}

/**
 * Matrice d'orientation (repère local du maillage → scène) d'un corps dont on
 * connaît la matrice écliptique → repère propre du corps.
 * local_scène = M · R⁻¹ · M⁻¹, où M = ASTRO_TO_SCENE.
 */
export function bodyOrientationInScene(eclipticToBody: Mat3): Mat3 {
  return mulMat(ASTRO_TO_SCENE, mulMat(transpose(eclipticToBody), SCENE_TO_ASTRO));
}
