/**
 * Calculs de caméra indépendants de Three.js (testables).
 *
 * La caméra de la vue rapprochée se place en coordonnées sphériques
 * (azimut, élévation, distance) autour du centre de la planète, dans un repère
 * INERTIEL dont l'axe « haut » est l'axe de rotation de la planète. Ce repère
 * ne tourne pas avec la planète : la rotation du globe (temps astronomique) et
 * le mouvement de la caméra (télécommande) restent indépendants.
 */

import type { Vec3 } from '../astro/math';
import { add, cross, dot, normalize, scale } from '../astro/math';

export interface OrbitFrame {
  /** Axe haut (unitaire) : axe de rotation de la planète. */
  up: Vec3;
  /** Axe de référence des azimuts (unitaire, perpendiculaire à up). */
  ref: Vec3;
  /** Troisième axe : up × ref. */
  side: Vec3;
}

export interface OrbitParams {
  azimuth: number;
  elevation: number;
  distance: number;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  up: Vec3;
}

export const MAX_ELEVATION = (82 * Math.PI) / 180;

/**
 * Construit un repère orbital autour d'un axe. La référence d'azimut est la
 * projection de l'axe +x de la scène (direction de l'équinoxe vernal) sur le
 * plan perpendiculaire à l'axe ; elle est donc fixe dans l'espace.
 */
export function frameFromAxis(axis: Vec3): OrbitFrame {
  const up = normalize(axis);
  let ref: Vec3 = [1, 0, 0];
  let proj = add(ref, scale(up, -dot(ref, up)));
  if (Math.hypot(...proj) < 1e-6) {
    ref = [0, 0, -1];
    proj = add(ref, scale(up, -dot(ref, up)));
  }
  ref = normalize(proj);
  return { up, ref, side: cross(up, ref) };
}

/** Direction unitaire correspondant à un azimut et une élévation. */
export function directionFromOrbit(frame: OrbitFrame, azimuth: number, elevation: number): Vec3 {
  const ce = Math.cos(elevation);
  return add(
    add(scale(frame.ref, ce * Math.cos(azimuth)), scale(frame.side, ce * Math.sin(azimuth))),
    scale(frame.up, Math.sin(elevation)),
  );
}

/** Azimut et élévation d'une direction (inverse de directionFromOrbit). */
export function orbitFromDirection(frame: OrbitFrame, direction: Vec3): { azimuth: number; elevation: number } {
  const d = normalize(direction);
  return {
    azimuth: Math.atan2(dot(d, frame.side), dot(d, frame.ref)),
    elevation: Math.asin(Math.max(-1, Math.min(1, dot(d, frame.up)))),
  };
}

export function orbitPose(center: Vec3, frame: OrbitFrame, p: OrbitParams): CameraPose {
  const dir = directionFromOrbit(frame, p.azimuth, p.elevation);
  return { position: add(center, scale(dir, p.distance)), target: center, up: frame.up };
}

export function clampElevation(e: number): number {
  return Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, e));
}

/** Différence angulaire la plus courte (radians) de a vers b. */
export function shortestAngle(a: number, b: number): number {
  const d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) return d - 2 * Math.PI;
  if (d < -Math.PI) return d + 2 * Math.PI;
  return d;
}

export function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Interpolation de deux poses de caméra (t déjà « adouci »). */
export function interpolatePose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const up = normalize(lerpVec(a.up, b.up, t));
  return {
    position: lerpVec(a.position, b.position, t),
    target: lerpVec(a.target, b.target, t),
    up: Math.hypot(...up) > 0 ? up : b.up,
  };
}

/**
 * Lissage exponentiel indépendant de la cadence d'affichage :
 * fraction du chemin restant à parcourir pendant dt pour une constante de
 * temps tau (s).
 */
export function smoothingFactor(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / Math.max(1e-6, tau));
}

/**
 * Distance de caméra pour qu'une sphère de rayon r occupe une fraction donnée
 * de la hauteur de l'écran (fov vertical en radians).
 */
export function distanceForScreenFraction(radius: number, fovY: number, fraction: number): number {
  return radius / Math.sin(Math.atan(Math.tan(fovY / 2) * fraction));
}

/** Distance de la vue générale pour faire tenir un disque de rayon R vu sous l'élévation donnée. */
export function overviewDistance(radius: number, fovY: number, aspect: number, elevation: number): number {
  const tanV = Math.tan(fovY / 2);
  const tanH = tanV * aspect;
  // Cadrage horizontal : le diamètre de l'orbite la plus éloignée, avec 8 % de marge.
  const dH = (radius * 1.08) / tanH + radius * Math.cos(elevation) * 0.35;
  // Cadrage vertical : ellipse aplatie par l'inclinaison de la vue.
  const dV = (radius * Math.sin(elevation) * 1.25) / tanV + radius * 0.5;
  return Math.max(dH, dV);
}

/**
 * Interpolation de deux poses en tournant autour d'un pivot (centre d'une
 * planète) : la direction vue du pivot suit un arc de grand cercle et la
 * distance au pivot varie linéairement. Si les deux poses sont hors d'une
 * sphère centrée sur le pivot, tout le trajet l'est aussi : la caméra ne
 * traverse jamais la planète (contrairement à une interpolation en ligne
 * droite).
 */
export function interpolatePoseAround(a: CameraPose, b: CameraPose, pivot: Vec3, t: number): CameraPose {
  const ra: Vec3 = [a.position[0] - pivot[0], a.position[1] - pivot[1], a.position[2] - pivot[2]];
  const rb: Vec3 = [b.position[0] - pivot[0], b.position[1] - pivot[1], b.position[2] - pivot[2]];
  const da = Math.hypot(ra[0], ra[1], ra[2]);
  const db = Math.hypot(rb[0], rb[1], rb[2]);
  const ua = normalize(ra);
  const ub = normalize(rb);
  const cosTheta = Math.max(-1, Math.min(1, dot(ua, ub)));
  const theta = Math.acos(cosTheta);
  let u: Vec3;
  if (theta < 1e-6) {
    u = ua;
  } else if (Math.sin(theta) < 1e-3) {
    // Directions opposées : arc passant par une direction perpendiculaire quelconque.
    let perp = cross(ua, a.up);
    if (Math.hypot(perp[0], perp[1], perp[2]) < 1e-6) perp = cross(ua, [1, 0, 0]);
    perp = normalize(perp);
    u = add(scale(ua, Math.cos(theta * t)), scale(perp, Math.sin(theta * t)));
  } else {
    const s = Math.sin(theta);
    u = add(scale(ua, Math.sin((1 - t) * theta) / s), scale(ub, Math.sin(t * theta) / s));
  }
  const d = lerp(da, db, t);
  const up = normalize(lerpVec(a.up, b.up, t));
  return {
    position: add(pivot, scale(u, d)),
    target: lerpVec(a.target, b.target, t),
    up: Math.hypot(...up) > 0 ? up : b.up,
  };
}

/** Repousse la caméra hors d'une sphère (centre, rayon) en conservant sa direction vue du centre. */
export function keepOutsideSphere(pose: CameraPose, center: Vec3, radius: number): CameraPose {
  const r: Vec3 = [pose.position[0] - center[0], pose.position[1] - center[1], pose.position[2] - center[2]];
  const d = Math.hypot(r[0], r[1], r[2]);
  if (d >= radius || d === 0) return pose;
  return { ...pose, position: add(center, scale(r, radius / d)) };
}
