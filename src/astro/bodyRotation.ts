/**
 * Orientation des corps autres que la Terre (modèles IAU WGCCRE).
 *
 * Repère propre d'un corps : axe z vers le pôle nord IAU (α0, δ0), axe x vers
 * le méridien origine, situé à l'angle W du nœud ascendant de l'équateur du
 * corps sur l'équateur céleste J2000 :
 *
 *   r_corps = R3(W) · R1(90° − δ0) · R3(90° + α0) · r_EQJ
 *
 * Remarque : pour les géantes gazeuses, le méridien origine (système III ou
 * équivalent) ne correspond à aucune structure fixe des textures ; seules
 * l'inclinaison de l'axe et la vitesse de rotation ont un sens visuel.
 */

import type { RotationModel } from '../data/planets';
import { equatorialJ2000ToEcliptic } from './frames';
import { DEG, type Mat3, type Vec3, mulMat, mulVec, normalizeDegrees, rotX, rotZ, transpose } from './math';
import { daysTT } from './time';

export function rotationAngleDeg(model: RotationModel, utcMs: number): number {
  return normalizeDegrees(model.W0 + model.Wd * daysTT(utcMs));
}

/** Matrice EQJ → repère propre du corps. */
export function equatorialToBodyMatrix(model: RotationModel, utcMs: number): Mat3 {
  const T = daysTT(utcMs) / 36_525;
  const alpha = (model.alpha0 + model.alphaT * T) * DEG;
  const delta = (model.delta0 + model.deltaT * T) * DEG;
  const W = rotationAngleDeg(model, utcMs) * DEG;
  return mulMat(rotZ(W), mulMat(rotX(Math.PI / 2 - delta), rotZ(Math.PI / 2 + alpha)));
}

/** Matrice écliptique J2000 → repère propre du corps. */
export function eclipticToBodyMatrix(model: RotationModel, utcMs: number): Mat3 {
  // ECL → EQJ est l'inverse (transposée) de EQJ → ECL.
  return mulMat(equatorialToBodyMatrix(model, utcMs), transpose(equatorialJ2000ToEcliptic()));
}

/** Direction du pôle nord IAU du corps, dans le repère écliptique J2000. */
export function bodyPoleEcliptic(model: RotationModel, utcMs: number): Vec3 {
  return mulVec(transpose(eclipticToBodyMatrix(model, utcMs)), [0, 0, 1]);
}
