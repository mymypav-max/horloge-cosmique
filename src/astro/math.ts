/**
 * Petite bibliothèque vectorielle indépendante de Three.js.
 *
 * Le modèle astronomique n'utilise jamais les classes de Three.js : il peut
 * ainsi être testé seul et ne dépend pas du moteur graphique.
 *
 * Conventions :
 * - Vec3 : tableau [x, y, z].
 * - Mat3 : 9 nombres en ordre « ligne par ligne » (row-major).
 * - Les rotations R1, R2, R3 sont des rotations de *repère* (convention IAU /
 *   Meeus) : R3(θ) appliquée à un vecteur donne ses coordonnées dans un repère
 *   tourné de +θ autour de l'axe z.
 */

export type Vec3 = [number, number, number];
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const ARCSEC = DEG / 3600;
export const TAU = Math.PI * 2;

/** Ramène un angle en degrés dans [0, 360[. */
export function normalizeDegrees(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Ramène un angle en degrés dans [-180, 180[. */
export function wrapDegrees180(deg: number): number {
  const r = normalizeDegrees(deg + 180) - 180;
  return r;
}

/** Ramène un angle en radians dans [-π, π[. */
export function wrapRadiansPi(rad: number): number {
  const r = (rad + Math.PI) % TAU;
  return (r < 0 ? r + TAU : r) - Math.PI;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

/** Angle (radians) entre deux vecteurs non nuls. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const c = dot(normalize(a), normalize(b));
  return Math.acos(Math.min(1, Math.max(-1, c)));
}

export function identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function mulMat(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

export function mulVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** Rotation de repère autour de l'axe x (R1). */
export function rotX(theta: number): Mat3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}

/** Rotation de repère autour de l'axe y (R2). */
export function rotY(theta: number): Mat3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

/** Rotation de repère autour de l'axe z (R3). */
export function rotZ(theta: number): Mat3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

/** Vecteur unitaire à partir d'une longitude et d'une latitude (radians). */
export function fromSpherical(lon: number, lat: number): Vec3 {
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
}

/** Longitude [-π, π[ et latitude [-π/2, π/2] (radians) d'un vecteur. */
export function toSpherical(v: Vec3): { lon: number; lat: number; r: number } {
  const r = length(v);
  if (r === 0) return { lon: 0, lat: 0, r: 0 };
  return { lon: Math.atan2(v[1], v[0]), lat: Math.asin(Math.max(-1, Math.min(1, v[2] / r))), r };
}
