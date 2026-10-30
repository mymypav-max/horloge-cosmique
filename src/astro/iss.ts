/**
 * Station spatiale internationale : position calculée par le modèle SGP4
 * (bibliothèque satellite.js) à partir d'éléments orbitaux embarqués
 * (src/data/iss.json), au temps de l'application (temps réel ou simulé).
 *
 * Ces éléments ont été ajustés par le projet sur l'éphéméride prévisionnelle
 * publiée par la NASA (voir scripts/iss/fit-iss-elements.mjs) ; ce n'est pas
 * un TLE officiel. Ils décrivent l'orbite sur la quinzaine de jours couverte
 * par cette prévision. Au-delà, la position n'est qu'une extrapolation, que
 * toute manœuvre orbitale non intégrée (rehaussement, évitement de débris)
 * peut fausser ; après 7 jours, l'ISS n'est plus affichée. Ce n'est jamais
 * une position mesurée en temps réel.
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
/** Date de production de la prévision NASA (« prévision NASA du … »). */
export const ISS_FORECAST_CREATED_MS = Date.parse(`${issData.source.creationDate}Z`);

/**
 * Règle de validité (choix du projet, documentée dans
 * docs/MODELE-ASTRONOMIQUE.md) :
 * - pendant la période couverte par la prévision NASA : position « nominale »
 *   (écart mesuré à cette prévision, pas à la station réelle) ;
 * - jusqu'à 7 jours hors de cette période : « extrapolation », sans précision
 *   garantie (une manœuvre non intégrée peut décaler la station de centaines
 *   de kilomètres le long de son orbite dès le premier jour) ;
 * - au-delà : ISS masquée, données à actualiser.
 * 14 jours est le plafond d'utilisation des données retenu par le projet : la
 * règle de 7 jours reste en deçà (vérifié par les tests).
 */
export const ISS_EXTRAPOLATION_DAYS = 7;
export const ISS_MAX_DATA_USE_DAYS = 14;

export type IssValidityStatus = 'nominal' | 'extrapolation' | 'unavailable';

export interface IssValidity {
  status: IssValidityStatus;
  /** Jours écoulés hors de la période couverte par les données (0 à l'intérieur). */
  daysOutside: number;
  /** Instant situé avant (et non après) la période couverte par les données. */
  beforeData?: boolean;
  /** Raison de l'indisponibilité, le cas échéant. */
  reason?: 'beforeLaunch' | 'expired' | 'beforeData';
}

export function issValidity(utcMs: number): IssValidity {
  if (utcMs < ISS_FIRST_MODULE_LAUNCH_MS) return { status: 'unavailable', daysOutside: Number.POSITIVE_INFINITY, reason: 'beforeLaunch' };
  const beforeData = utcMs < ISS_DATA_START_MS;
  const outside = beforeData ? (ISS_DATA_START_MS - utcMs) / DAY_MS : utcMs > ISS_DATA_STOP_MS ? (utcMs - ISS_DATA_STOP_MS) / DAY_MS : 0;
  if (outside === 0) return { status: 'nominal', daysOutside: 0 };
  if (outside <= ISS_EXTRAPOLATION_DAYS) return { status: 'extrapolation', daysOutside: outside, beforeData };
  return { status: 'unavailable', daysOutside: outside, beforeData, reason: beforeData ? 'beforeData' : 'expired' };
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
