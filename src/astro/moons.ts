/**
 * Positions des lunes autour de leur planète.
 *
 * - Lune : formules de l'Astronomical Almanac (moon.ts).
 * - Autres lunes : ellipse képlérienne dont le nœud et le péricentre tournent
 *   uniformément, avec, pour quelques lunes en résonance, une libration
 *   sinusoïdale de la longitude moyenne. Les éléments (moonOrbits.json) ont
 *   été ajustés par scripts/moons/fit-moon-elements.mjs sur les vecteurs
 *   d'état JPL Horizons de 2010 à 2030 ; l'écart maximal au modèle JPL sur
 *   cette période est donné pour chaque lune dans le fichier (champ « fit »).
 *   Hors de 2010–2030, les positions sont extrapolées et de plus en plus
 *   approximatives.
 *
 * Toutes les positions sont planétocentriques, en km, dans le repère
 * écliptique J2000 du projet. Ce module ne contient aucune grandeur visuelle.
 */

import orbitData from '../data/moonOrbits.json';
import { MOONS, type MoonId } from '../data/moons';
import { PLANETS } from '../data/planets';
import { bodyPoleEcliptic } from './bodyRotation';
import { equatorialJ2000ToEcliptic } from './frames';
import { solveKepler } from './kepler';
import { DEG, type Vec3, angleBetween, cross, mulVec, normalize, scale } from './math';
import { MOON_SIDEREAL_PERIOD_DAYS, geocentricMoon, lunarMeanDirection } from './moon';
import { daysTT } from './time';

/** Lunes dont l'orbite est ajustée sur JPL Horizons (toutes sauf la Lune). */
export type FittedMoonId = Exclude<MoonId, 'moon'>;

export interface FittedOrbit {
  parent: string;
  poleRaDeg: number;
  poleDecDeg: number;
  aKm: number;
  meanMotionDegPerDay: number;
  e: number;
  varpiDeg: number;
  varpiRateDegPerDay: number;
  iDeg: number;
  nodeDeg: number;
  nodeRateDegPerDay: number;
  lambdaDeg: number;
  libration: { amplitudeDeg: number; periodDays: number; phaseDeg: number } | null;
  fit: { rmsKm: number; maxKm: number; maxAngleDeg: number; samples: number };
  extrapolation10y: { rmsKm: number; maxKm: number; maxAngleDeg: number; samples: number };
}

export const FITTED_ORBITS = orbitData.moons as Record<FittedMoonId, FittedOrbit>;

/** Époque des éléments ajustés : 2020-01-01 00:00 TT, en jours TT depuis J2000. */
export const MOON_ELEMENTS_EPOCH_DAYS = orbitData.epoch.jdTT - 2_451_545.0;
/** Période couverte par les données JPL ayant servi à l'ajustement (UTC). */
export const MOON_FIT_SPAN_MS: readonly [number, number] = [Date.UTC(2010, 0, 1), Date.UTC(2030, 0, 1)];

const EQJ_TO_ECL = equatorialJ2000ToEcliptic();

/** Base (x, y, z) du plan de référence, exprimée dans le repère EQJ. */
function referenceBasis(raDeg: number, decDeg: number): [Vec3, Vec3, Vec3] {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const z: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const x = normalize([-z[1], z[0], 0]);
  return [x, cross(z, x), z];
}

const BASES = {} as Record<FittedMoonId, [Vec3, Vec3, Vec3]>;
for (const id of Object.keys(FITTED_ORBITS) as FittedMoonId[]) {
  BASES[id] = referenceBasis(FITTED_ORBITS[id].poleRaDeg, FITTED_ORBITS[id].poleDecDeg);
}

export interface MoonElements {
  aKm: number;
  e: number;
  /** Inclinaison, nœud et argument du péricentre sur le plan de référence (rad). */
  i: number;
  node: number;
  argPeri: number;
  /** Anomalie moyenne (rad). */
  M: number;
}

/** Éléments osculateurs du modèle à l'instant donné (plan de référence propre à la lune). */
export function fittedElements(id: FittedMoonId, utcMs: number): MoonElements {
  const o = FITTED_ORBITS[id];
  const t = daysTT(utcMs) - MOON_ELEMENTS_EPOCH_DAYS;
  const varpi = o.varpiDeg + o.varpiRateDegPerDay * t;
  const node = o.nodeDeg + o.nodeRateDegPerDay * t;
  const lib = o.libration ? o.libration.amplitudeDeg * Math.sin((2 * Math.PI * t) / o.libration.periodDays + o.libration.phaseDeg * DEG) : 0;
  const lambda = o.lambdaDeg + o.meanMotionDegPerDay * t + lib;
  return { aKm: o.aKm, e: o.e, i: o.iDeg * DEG, node: node * DEG, argPeri: (varpi - node) * DEG, M: (lambda - varpi) * DEG };
}

/** Position dans le plan de référence pour une anomalie excentrique donnée. */
function positionFromElements(id: FittedMoonId, el: MoonElements, E: number): Vec3 {
  const xp = el.aKm * (Math.cos(E) - el.e);
  const yp = el.aKm * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const cO = Math.cos(el.node);
  const sO = Math.sin(el.node);
  const cw = Math.cos(el.argPeri);
  const sw = Math.sin(el.argPeri);
  const ci = Math.cos(el.i);
  const si = Math.sin(el.i);
  const xr = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
  const yr = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
  const zr = sw * si * xp + cw * si * yp;
  const [bx, by, bz] = BASES[id];
  const eq: Vec3 = [bx[0] * xr + by[0] * yr + bz[0] * zr, bx[1] * xr + by[1] * yr + bz[1] * zr, bx[2] * xr + by[2] * yr + bz[2] * zr];
  return mulVec(EQJ_TO_ECL, eq);
}

/** Normale (unitaire) au plan de l'orbite, sens du mouvement, écliptique J2000. */
function fittedOrbitNormal(id: FittedMoonId, el: MoonElements): Vec3 {
  const n: Vec3 = [Math.sin(el.i) * Math.sin(el.node), -Math.sin(el.i) * Math.cos(el.node), Math.cos(el.i)];
  const [bx, by, bz] = BASES[id];
  const eq: Vec3 = [bx[0] * n[0] + by[0] * n[1] + bz[0] * n[2], bx[1] * n[0] + by[1] * n[1] + bz[1] * n[2], bx[2] * n[0] + by[2] * n[1] + bz[2] * n[2]];
  return mulVec(EQJ_TO_ECL, eq);
}

/** Position planétocentrique d'une lune (km, écliptique J2000). */
export function moonPosition(id: MoonId, utcMs: number): Vec3 {
  if (id === 'moon') return geocentricMoon(utcMs);
  const el = fittedElements(id, utcMs);
  return positionFromElements(id, el, solveKepler(el.M, el.e));
}

/** Toutes les positions planétocentriques (km, écliptique J2000). */
export function allMoonPositions(utcMs: number, ids: readonly MoonId[]): Record<MoonId, Vec3> {
  const out = {} as Record<MoonId, Vec3>;
  for (const id of ids) out[id] = moonPosition(id, utcMs);
  return out;
}

/**
 * Points de l'orbite actuelle (km, écliptique J2000), qui passe par la
 * position de la lune : ellipse osculatrice du modèle pour les lunes ajustées,
 * positions sur une révolution sidérale centrée sur l'instant pour la Lune.
 */
export function moonOrbitPath(id: MoonId, utcMs: number, count: number): Vec3[] {
  const points: Vec3[] = [];
  if (id === 'moon') {
    const period = MOON_SIDEREAL_PERIOD_DAYS * 86_400_000;
    for (let k = 0; k < count; k++) points.push(geocentricMoon(utcMs + ((k / count) - 0.5) * period));
    return points;
  }
  const el = fittedElements(id, utcMs);
  for (let k = 0; k < count; k++) points.push(positionFromElements(id, el, (2 * Math.PI * k) / count));
  return points;
}

/** Période de révolution sidérale (jours). */
export function moonPeriodDays(id: MoonId): number {
  return id === 'moon' ? MOON_SIDEREAL_PERIOD_DAYS : 360 / FITTED_ORBITS[id].meanMotionDegPerDay;
}

/** Demi-grand axe (km) ; pour la Lune, valeur moyenne du modèle de l'Almanac sur une révolution. */
export function moonSemiMajorAxisKm(id: MoonId, utcMs: number): number {
  if (id !== 'moon') return FITTED_ORBITS[id].aKm;
  const pts = moonOrbitPath('moon', utcMs, 72);
  const r = pts.map((p) => Math.hypot(p[0], p[1], p[2]));
  return (Math.min(...r) + Math.max(...r)) / 2;
}

/** Normale à l'orbite actuelle (sens du mouvement), écliptique J2000. */
export function moonOrbitNormal(id: MoonId, utcMs: number): Vec3 {
  if (id === 'moon') {
    // Deux positions séparées d'un quart de révolution (environ 90°) : leur produit vectoriel suit le mouvement.
    const quarter = (MOON_SIDEREAL_PERIOD_DAYS * 86_400_000) / 4;
    return normalize(cross(geocentricMoon(utcMs - quarter / 2), geocentricMoon(utcMs + quarter / 2)));
  }
  return fittedOrbitNormal(id, fittedElements(id, utcMs));
}

/**
 * Inclinaison de l'orbite (°) : sur l'écliptique pour la Lune, sur l'équateur
 * de la planète pour les autres lunes, mesurée par rapport au sens de
 * rotation de la planète (au-delà de 90°, l'orbite est rétrograde).
 */
export function moonInclinationDeg(id: MoonId, utcMs: number): number {
  const normal = moonOrbitNormal(id, utcMs);
  if (id === 'moon') return angleBetween(normal, [0, 0, 1]) / DEG;
  const planet = PLANETS[MOONS[id].parent];
  const pole = bodyPoleEcliptic(planet.rotation, utcMs);
  // Pôle IAU « nord » ; pour une rotation rétrograde (Uranus), le moment cinétique pointe à l'opposé.
  const spin = planet.rotation.Wd < 0 ? scale(pole, -1) : pole;
  return angleBetween(normal, spin) / DEG;
}

/** Vrai si la lune tourne autour de sa planète dans le sens inverse de la rotation de celle-ci. */
export function isRetrograde(id: MoonId, utcMs: number): boolean {
  return moonInclinationDeg(id, utcMs) > 90;
}

/** Vrai si l'instant est dans la période des données JPL ayant servi à l'ajustement. */
export function isWithinMoonFitSpan(utcMs: number): boolean {
  return utcMs >= MOON_FIT_SPAN_MS[0] && utcMs < MOON_FIT_SPAN_MS[1];
}

/** Écart angulaire maximal (°) au modèle JPL sur 2010–2030, vu de la planète. */
export function moonFitMaxAngleDeg(id: FittedMoonId): number {
  return FITTED_ORBITS[id].fit.maxAngleDeg;
}

/**
 * Axes du corps d'une lune en rotation synchrone (écliptique J2000) :
 * - `toParent` : direction de la planète vue depuis la « lune moyenne »
 *   (mouvement uniforme), qui définit le méridien origine des lunes
 *   synchrones ; la face visible oscille donc légèrement (libration optique
 *   en longitude) comme dans la réalité ;
 * - `north` : pôle nord au sens de l'UAI (du côté nord du plan invariable,
 *   assimilé ici à l'écliptique), pris perpendiculaire au plan de l'orbite.
 * Simplification documentée : l'inclinaison réelle de l'axe de rotation sur
 * l'orbite (1,5° pour la Lune) et la libration physique sont négligées.
 */
export function moonBodyAxes(id: MoonId, utcMs: number): { toParent: Vec3; north: Vec3 } {
  const normal = moonOrbitNormal(id, utcMs);
  const north = normal[2] >= 0 ? normal : scale(normal, -1);
  let mean: Vec3;
  if (id === 'moon') {
    mean = lunarMeanDirection(utcMs);
  } else {
    const el = fittedElements(id, utcMs);
    // Lune moyenne : longitude dans l'orbite ω + M (au lieu de ω + anomalie vraie).
    const u = el.argPeri + el.M;
    const cO = Math.cos(el.node);
    const sO = Math.sin(el.node);
    const ci = Math.cos(el.i);
    const r: Vec3 = [cO * Math.cos(u) - sO * Math.sin(u) * ci, sO * Math.cos(u) + cO * Math.sin(u) * ci, Math.sin(u) * Math.sin(el.i)];
    const [bx, by, bz] = BASES[id];
    mean = mulVec(EQJ_TO_ECL, [bx[0] * r[0] + by[0] * r[1] + bz[0] * r[2], bx[1] * r[0] + by[1] * r[1] + bz[1] * r[2], bx[2] * r[0] + by[2] * r[1] + bz[2] * r[2]]);
  }
  // Direction de la planète, rendue perpendiculaire à l'axe nord.
  const toParent = scale(mean, -1);
  const k = toParent[0] * north[0] + toParent[1] * north[1] + toParent[2] * north[2];
  return { toParent: normalize([toParent[0] - k * north[0], toParent[1] - k * north[1], toParent[2] - k * north[2]]), north };
}
