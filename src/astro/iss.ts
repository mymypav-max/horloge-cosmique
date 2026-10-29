/**
 * Station spatiale internationale : position calculée par le modèle SGP4
 * (bibliothèque satellite.js) à partir d'éléments orbitaux embarqués
 * (src/data/iss.json), au temps de l'application (temps réel ou simulé).
 *
 * Ces éléments ont été ajustés sur l'éphéméride prévisionnelle publiée par la
 * NASA (voir scripts/iss/fit-iss-elements.mjs) ; ils décrivent l'orbite sur
 * une quinzaine de jours. En dehors de cette période, l'erreur croît vite
 * (freinage atmosphérique, manœuvres de rehaussement imprévisibles) : la
 * position devient approximative, puis indicative, puis n'est plus affichée.
 * Ce n'est jamais une position mesurée en temps réel.
 *
 * Repères : SGP4 fournit des positions dans le repère TEME (équateur vrai,
 * équinoxe moyen de la date). Elles sont ramenées dans l'écliptique J2000 par
 * la précession inverse (IAU 1976) ; la nutation (≤ 17″, soit moins de 0,6 km
 * à l'altitude de l'ISS) est négligée, comme dans le reste du projet.
 */

import { type OMMJsonObject, type SatRec, eciToGeodetic, gstime, json2satrec, sgp4 } from './sgp4lib';
import issData from '../data/iss.json';
import { equatorialJ2000ToEcliptic, inversePrecessionMatrix } from './frames';
import { type Mat3, type Vec3, mulMat, mulVec } from './math';
import { centuriesTT, julianDateUtc } from './time';

export const ISS_DATA = issData;

const DAY_MS = 86_400_000;

/** Lancement du premier module (Zarya) : 20 novembre 1998, 06 h 40 UTC. Avant, la station n'existait pas. */
export const ISS_FIRST_MODULE_LAUNCH_MS = Date.UTC(1998, 10, 20, 6, 40);
/** Période couverte par l'éphéméride NASA ayant servi à l'ajustement (UTC). */
export const ISS_DATA_START_MS = Date.parse(`${issData.source.usableStartUtc}Z`);
export const ISS_DATA_STOP_MS = Date.parse(`${issData.source.usableStopUtc}Z`);
export const ISS_ELEMENTS_EPOCH_MS = Date.parse(`${issData.omm.EPOCH}Z`);

/**
 * Seuils de validité (choix du projet, documentés dans
 * docs/MODELE-ASTRONOMIQUE.md) : un test de vieillissement des éléments
 * (ajustés sur 3 jours) donne un écart d'environ 6 km après 2 jours,
 * 11 km après 4 jours, 26 km après 7 jours et 58 km après 12 jours ; une
 * manœuvre de rehaussement non prévue fausse en outre la position le long de
 * l'orbite de centaines de kilomètres.
 */
export const ISS_APPROXIMATE_DAYS = 7;
export const ISS_INDICATIVE_DAYS = 30;

export type IssValidityStatus = 'nominal' | 'approximate' | 'indicative' | 'unavailable';

export interface IssValidity {
  status: IssValidityStatus;
  /** Jours écoulés hors de la période couverte par les données (0 à l'intérieur). */
  daysOutside: number;
  /** Raison de l'indisponibilité, le cas échéant. */
  reason?: 'beforeLaunch' | 'tooOld' | 'tooEarly' | 'propagation';
}

export function issValidity(utcMs: number): IssValidity {
  if (utcMs < ISS_FIRST_MODULE_LAUNCH_MS) return { status: 'unavailable', daysOutside: Number.POSITIVE_INFINITY, reason: 'beforeLaunch' };
  const outside =
    utcMs < ISS_DATA_START_MS ? (ISS_DATA_START_MS - utcMs) / DAY_MS : utcMs > ISS_DATA_STOP_MS ? (utcMs - ISS_DATA_STOP_MS) / DAY_MS : 0;
  if (outside === 0) return { status: 'nominal', daysOutside: 0 };
  if (outside <= ISS_APPROXIMATE_DAYS) return { status: 'approximate', daysOutside: outside };
  if (outside <= ISS_INDICATIVE_DAYS) return { status: 'indicative', daysOutside: outside };
  return { status: 'unavailable', daysOutside: outside, reason: utcMs > ISS_DATA_STOP_MS ? 'tooOld' : 'tooEarly' };
}

let cachedSatrec: SatRec | null = null;

function satrec(): SatRec {
  if (!cachedSatrec) cachedSatrec = json2satrec(issData.omm as unknown as OMMJsonObject);
  return cachedSatrec;
}

/** Matrice TEME (assimilé à l'équateur moyen de la date) → écliptique J2000. */
function temeToEcliptic(utcMs: number): Mat3 {
  return mulMat(equatorialJ2000ToEcliptic(), inversePrecessionMatrix(centuriesTT(utcMs)));
}

export interface IssState {
  utcMs: number;
  /** Position géocentrique (km), écliptique J2000. */
  position: Vec3;
  /** Vitesse inertielle (km/s), écliptique J2000. */
  velocity: Vec3;
  /** Altitude au-dessus de l'ellipsoïde WGS-84 (km). */
  altitudeKm: number;
  /** Vitesse dans le repère inertiel (km/s). */
  speedKmS: number;
  validity: IssValidity;
}

/** Position TEME brute (km) ou null si SGP4 échoue. */
function propagateTeme(utcMs: number): { r: Vec3; v: Vec3 } | null {
  const out = sgp4(satrec(), (utcMs - ISS_ELEMENTS_EPOCH_MS) / 60_000);
  if (!out || !out.position || !out.velocity) return null;
  const { position: p, velocity: v } = out;
  if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) return null;
  return { r: [p.x, p.y, p.z], v: [v.x, v.y, v.z] };
}

/** État de l'ISS à l'instant donné, ou null si la position n'est pas disponible. */
export function issState(utcMs: number): IssState | null {
  const validity = issValidity(utcMs);
  if (validity.status === 'unavailable') return null;
  const teme = propagateTeme(utcMs);
  if (!teme) return null;
  const m = temeToEcliptic(utcMs);
  const geodetic = eciToGeodetic({ x: teme.r[0], y: teme.r[1], z: teme.r[2] }, gstime(julianDateUtc(utcMs)));
  return {
    utcMs,
    position: mulVec(m, teme.r),
    velocity: mulVec(m, teme.v),
    altitudeKm: geodetic.height,
    speedKmS: Math.hypot(teme.v[0], teme.v[1], teme.v[2]),
    validity,
  };
}

/** Période de révolution (minutes) déduite du moyen mouvement. */
export const ISS_PERIOD_MINUTES = 1440 / issData.omm.MEAN_MOTION;
/** Inclinaison de l'orbite sur l'équateur (°). */
export const ISS_INCLINATION_DEG = issData.omm.INCLINATION;

/** Points de l'orbite (km, écliptique J2000) sur une révolution centrée sur l'instant. */
export function issOrbitPath(utcMs: number, count: number): Vec3[] {
  const period = ISS_PERIOD_MINUTES * 60_000;
  const m = temeToEcliptic(utcMs);
  const points: Vec3[] = [];
  for (let k = 0; k < count; k++) {
    const p = propagateTeme(utcMs + (k / count - 0.5) * period);
    if (p) points.push(mulVec(m, p.r));
  }
  return points;
}
