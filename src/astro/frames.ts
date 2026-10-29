/**
 * Changements de repère célestes.
 *
 * Repères utilisés :
 * - ECL  : écliptique et équinoxe moyens de J2000 (repère des éphémérides et
 *          de la scène 3D).
 * - EQJ  : équateur et équinoxe moyens de J2000 (≈ ICRF à mieux que 0,1″).
 * - MOD  : équateur et équinoxe moyens de la date (après précession).
 *
 * Précession : modèle IAU 1976 (Lieske et al. 1977), suffisant à quelques
 * dixièmes de seconde d'arc près sur plusieurs siècles autour de J2000.
 * La nutation (≤ 17″) est négligée.
 */

import { ARCSEC, type Mat3, mulMat, rotX, rotY, rotZ, transpose } from './math';

/** Obliquité moyenne de l'écliptique à J2000 (IAU 1976) : 23° 26′ 21,448″. */
export const OBLIQUITY_J2000_RAD = 84381.448 * ARCSEC;

/** Matrice ECL → EQJ : rotation de −ε autour de l'axe x (équinoxe commun). */
export function eclipticToEquatorialJ2000(): Mat3 {
  return rotX(-OBLIQUITY_J2000_RAD);
}

/** Matrice EQJ → ECL. */
export function equatorialJ2000ToEcliptic(): Mat3 {
  return rotX(OBLIQUITY_J2000_RAD);
}

/**
 * Matrice de précession EQJ → MOD (IAU 1976) :
 * P = R3(−z) · R2(θ) · R3(−ζ), T en siècles juliens TT depuis J2000.
 */
export function precessionMatrix(T: number): Mat3 {
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC;
  return mulMat(rotZ(-z), mulMat(rotY(theta), rotZ(-zeta)));
}

/** Matrice MOD → EQJ (inverse de la précession). */
export function inversePrecessionMatrix(T: number): Mat3 {
  return transpose(precessionMatrix(T));
}
