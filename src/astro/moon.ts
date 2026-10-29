/**
 * Position géocentrique de la Lune : formules de faible précision de
 * l'Astronomical Almanac (section D, « Low-precision formulae for the Moon's
 * coordinates »), valables de 1900 à 2100 avec une précision d'environ 0,3°
 * en longitude, 0,2° en latitude et 0,003° sur la parallaxe horizontale
 * (soit environ 0,3 % sur la distance).
 *
 * Les coordonnées obtenues sont rapportées à l'écliptique et à l'équinoxe
 * moyens de la date ; elles sont ramenées dans l'écliptique J2000 par la
 * précession IAU 1976. Hors de 1900–2100, l'erreur croît lentement (termes
 * séculaires omis) : la position reste indicative.
 */

import { OBLIQUITY_J2000_RAD, inversePrecessionMatrix } from './frames';
import { ARCSEC, DEG, type Vec3, fromSpherical, mulMat, mulVec, rotX, scale } from './math';
import { centuriesTT } from './time';

/** Rayon équatorial terrestre utilisé par l'Almanac pour la parallaxe (km). */
const EARTH_RADIUS_PARALLAX_KM = 6378.14;

const sinDeg = (x: number) => Math.sin(x * DEG);
const cosDeg = (x: number) => Math.cos(x * DEG);

export interface LunarCoordinates {
  /** Longitude écliptique de la date (°). */
  lonDeg: number;
  /** Latitude écliptique de la date (°). */
  latDeg: number;
  /** Distance Terre–Lune (km). */
  distanceKm: number;
}

/** Coordonnées écliptiques de la date (formules de l'Astronomical Almanac). */
export function lunarCoordinates(T: number): LunarCoordinates {
  const lon =
    218.32 +
    481267.881 * T +
    6.29 * sinDeg(135.0 + 477198.87 * T) -
    1.27 * sinDeg(259.3 - 413335.36 * T) +
    0.66 * sinDeg(235.7 + 890534.22 * T) +
    0.21 * sinDeg(269.9 + 954397.74 * T) -
    0.19 * sinDeg(357.5 + 35999.05 * T) -
    0.11 * sinDeg(186.5 + 966404.03 * T);
  const lat =
    5.13 * sinDeg(93.3 + 483202.02 * T) +
    0.28 * sinDeg(228.2 + 960400.89 * T) -
    0.28 * sinDeg(318.3 + 6003.15 * T) -
    0.17 * sinDeg(217.6 - 407332.21 * T);
  const parallax =
    0.9508 +
    0.0518 * cosDeg(135.0 + 477198.87 * T) +
    0.0095 * cosDeg(259.3 - 413335.36 * T) +
    0.0078 * cosDeg(235.7 + 890534.22 * T) +
    0.0028 * cosDeg(269.9 + 954397.74 * T);
  return { lonDeg: lon, latDeg: lat, distanceKm: EARTH_RADIUS_PARALLAX_KM / sinDeg(parallax) };
}

/** Obliquité moyenne de la date (IAU 1976), en radians. */
export function meanObliquity(T: number): number {
  return (84381.448 - 46.815 * T - 0.00059 * T * T + 0.001813 * T * T * T) * ARCSEC;
}

/** Position géocentrique de la Lune (km), écliptique J2000. */
export function geocentricMoon(utcMs: number): Vec3 {
  const T = centuriesTT(utcMs);
  const c = lunarCoordinates(T);
  const ofDate = scale(fromSpherical(c.lonDeg * DEG, c.latDeg * DEG), c.distanceKm);
  // Écliptique de la date → équateur moyen de la date → EQJ → écliptique J2000.
  const toJ2000 = mulMat(rotX(OBLIQUITY_J2000_RAD), mulMat(inversePrecessionMatrix(T), rotX(-meanObliquity(T))));
  return mulVec(toJ2000, ofDate);
}

/** Direction (unitaire, écliptique J2000) de la « Lune moyenne » : longitude moyenne, latitude nulle. */
export function lunarMeanDirection(utcMs: number): Vec3 {
  const T = centuriesTT(utcMs);
  const meanLon = (218.32 + 481267.881 * T) * DEG;
  const toJ2000 = mulMat(rotX(OBLIQUITY_J2000_RAD), mulMat(inversePrecessionMatrix(T), rotX(-meanObliquity(T))));
  return mulVec(toJ2000, fromSpherical(meanLon, 0));
}

/**
 * Révolution sidérale moyenne (jours) : la longitude moyenne avance de
 * 481 267,881° par siècle par rapport à l'équinoxe de la date, dont 1,397°
 * dus à la précession (5 029″ par siècle) ; soit 27,3217 jours.
 */
export const MOON_SIDEREAL_PERIOD_DAYS = (360 * 36525) / (481267.881 - 5029.0966 / 3600);
