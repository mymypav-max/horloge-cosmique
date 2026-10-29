/**
 * Orientation de la Terre et direction du Soleil vue de la Terre.
 *
 * Chaîne de transformation (repère écliptique J2000 → repère terrestre) :
 *
 *   r_terrestre = R3(TSMG) · P(T) · R1(−ε0) · r_écliptique
 *
 * - R1(−ε0) : écliptique J2000 → équateur J2000 ;
 * - P(T)    : précession IAU 1976 vers l'équateur moyen de la date ;
 * - R3(TSMG): rotation de la Terre d'un angle égal au temps sidéral moyen de
 *             Greenwich (formule IAU 1982 / Meeus 12.4, en UT1 ≈ UTC).
 *
 * Le repère terrestre obtenu a son axe x vers le méridien de Greenwich
 * (longitude 0°, latitude 0°), son axe y vers 90° E et son axe z vers le pôle
 * Nord. Sont négligés : nutation (≤ 1,1 s de temps sur l'angle horaire),
 * mouvement du pôle (quelques mètres), UT1 − UTC (< 0,9 s), aberration
 * annuelle (20″) et décalage Terre / barycentre Terre-Lune (< 7″).
 * Erreur totale sur la position du terminateur : très inférieure à 0,1°.
 */

import { allHeliocentricPositions, heliocentricPosition } from './ephemeris';
import { eclipticToEquatorialJ2000, precessionMatrix } from './frames';
import { DEG, type Mat3, type Vec3, mulMat, mulVec, normalize, normalizeDegrees, rotZ, scale, toSpherical, transpose, wrapDegrees180, fromSpherical } from './math';
import { centuriesTT, daysUT1 } from './time';

/** Durée du jour sidéral moyen (s) : 23 h 56 min 4,0905 s. */
export const SIDEREAL_DAY_SECONDS = 86_164.0905;

/**
 * Temps sidéral moyen de Greenwich (degrés, dans [0, 360[).
 * Formule de Meeus (Astronomical Algorithms, éq. 12.4), d'après l'IAU 1982.
 */
export function gmstDegrees(utcMs: number): number {
  const d = daysUT1(utcMs);
  const T = d / 36_525;
  const theta = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38_710_000;
  return normalizeDegrees(theta);
}

/** Matrice écliptique J2000 → repère terrestre (lié à la Terre). */
export function eclipticToEarthFixedMatrix(utcMs: number): Mat3 {
  const P = precessionMatrix(centuriesTT(utcMs));
  const R = rotZ(gmstDegrees(utcMs) * DEG);
  return mulMat(R, mulMat(P, eclipticToEquatorialJ2000()));
}

/** Matrice repère terrestre → écliptique J2000. */
export function earthFixedToEclipticMatrix(utcMs: number): Mat3 {
  return transpose(eclipticToEarthFixedMatrix(utcMs));
}

/** Direction (unitaire, écliptique J2000) de l'axe de rotation terrestre. */
export function earthPoleEcliptic(utcMs: number): Vec3 {
  return mulVec(earthFixedToEclipticMatrix(utcMs), [0, 0, 1]);
}

/**
 * Direction du Soleil vue du centre de la Terre (unitaire, écliptique J2000).
 * Le Soleil étant au centre du repère héliocentrique, c'est l'opposé de la
 * position de la Terre.
 */
export function sunDirectionFromEarth(utcMs: number, earthHelio?: Vec3): Vec3 {
  const e = earthHelio ?? heliocentricPosition('earth', utcMs);
  return normalize(scale(e, -1));
}

export interface GeoPoint {
  /** Latitude géographique (°), positive au nord. */
  latDeg: number;
  /** Longitude géographique (°) dans [−180, 180[, positive à l'est. */
  lonDeg: number;
}

/**
 * Point subsolaire : lieu de la Terre où le Soleil est au zénith.
 * C'est le centre de l'hémisphère éclairé ; le terminateur est le grand cercle
 * situé à 90° de ce point.
 */
export function subsolarPoint(utcMs: number, earthHelio?: Vec3): GeoPoint {
  const s = mulVec(eclipticToEarthFixedMatrix(utcMs), sunDirectionFromEarth(utcMs, earthHelio));
  const { lon, lat } = toSpherical(s);
  return { latDeg: lat / DEG, lonDeg: wrapDegrees180(lon / DEG) };
}

/** Vecteur unitaire terrestre d'un point géographique. */
export function geoToEarthFixed(p: GeoPoint): Vec3 {
  return fromSpherical(p.lonDeg * DEG, p.latDeg * DEG);
}

/** Direction écliptique J2000 d'un point géographique à l'instant donné. */
export function geoToEcliptic(p: GeoPoint, utcMs: number): Vec3 {
  return mulVec(earthFixedToEclipticMatrix(utcMs), geoToEarthFixed(p));
}

/**
 * Cosinus de l'angle zénithal du Soleil en un point : > 0 de jour, < 0 de nuit,
 * 0 sur le terminateur géométrique.
 */
export function solarElevationCosine(p: GeoPoint, utcMs: number, earthHelio?: Vec3): number {
  const n = geoToEarthFixed(p);
  const s = mulVec(eclipticToEarthFixedMatrix(utcMs), sunDirectionFromEarth(utcMs, earthHelio));
  return n[0] * s[0] + n[1] * s[1] + n[2] * s[2];
}

/** Hauteur du Soleil (°) au-dessus de l'horizon géométrique en un point. */
export function solarElevationDeg(p: GeoPoint, utcMs: number): number {
  return Math.asin(Math.max(-1, Math.min(1, solarElevationCosine(p, utcMs)))) / DEG;
}

/** Ensemble cohérent de données terrestres pour un instant (utilisé par la scène). */
export interface EarthState {
  utcMs: number;
  /** Écliptique J2000 → repère terrestre. */
  eclToEarth: Mat3;
  /** Direction du Soleil depuis la Terre, écliptique J2000. */
  sunDirection: Vec3;
  subsolar: GeoPoint;
  /** Distance Terre-Soleil (UA). */
  distanceAu: number;
}

export function computeEarthState(utcMs: number, earthHelio?: Vec3): EarthState {
  const e = earthHelio ?? allHeliocentricPositions(utcMs).earth;
  const eclToEarth = eclipticToEarthFixedMatrix(utcMs);
  const sunDirection = sunDirectionFromEarth(utcMs, e);
  const s = mulVec(eclToEarth, sunDirection);
  const { lon, lat } = toSpherical(s);
  return {
    utcMs,
    eclToEarth,
    sunDirection,
    subsolar: { latDeg: lat / DEG, lonDeg: wrapDegrees180(lon / DEG) },
    distanceAu: Math.hypot(e[0], e[1], e[2]),
  };
}
