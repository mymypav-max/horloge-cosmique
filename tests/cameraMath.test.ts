import { describe, expect, it } from 'vitest';
import {
  MAX_ELEVATION,
  clampElevation,
  directionFromOrbit,
  distanceForScreenFraction,
  easeInOutCubic,
  frameFromAxis,
  interpolatePose,
  orbitFromDirection,
  orbitPose,
  shortestAngle,
  smoothingFactor,
} from '../src/camera/cameraMath';
import { type Vec3, dot } from '../src/astro/math';

describe('repère orbital de la caméra', () => {
  it('est orthonormé, même pour un axe incliné', () => {
    for (const axis of [[0, 1, 0], [0.3, 0.9, -0.2], [1, 0, 0], [0.01, -1, 0]] as Vec3[]) {
      const f = frameFromAxis(axis);
      expect(dot(f.up, f.up)).toBeCloseTo(1, 12);
      expect(dot(f.ref, f.ref)).toBeCloseTo(1, 12);
      expect(dot(f.up, f.ref)).toBeCloseTo(0, 12);
      expect(dot(f.side, f.ref)).toBeCloseTo(0, 12);
      expect(dot(f.side, f.up)).toBeCloseTo(0, 12);
    }
  });

  it('convertit direction ↔ (azimut, élévation) sans perte', () => {
    const f = frameFromAxis([0.2, 0.95, 0.1]);
    for (const [az, el] of [[0, 0], [1.2, 0.4], [-2.5, -0.9], [3.0, 1.2]]) {
      const back = orbitFromDirection(f, directionFromOrbit(f, az, el));
      expect(back.azimuth).toBeCloseTo(az, 10);
      expect(back.elevation).toBeCloseTo(el, 10);
    }
  });

  it('place la caméra à la distance demandée du centre', () => {
    const f = frameFromAxis([0, 1, 0]);
    const center: Vec3 = [5, 0.2, -3];
    const pose = orbitPose(center, f, { azimuth: 0.7, elevation: 0.3, distance: 2.5 });
    const d = Math.hypot(pose.position[0] - 5, pose.position[1] - 0.2, pose.position[2] + 3);
    expect(d).toBeCloseTo(2.5, 12);
    expect(pose.target).toEqual(center);
  });
});

describe('indépendance de la caméra', () => {
  it('ne dépend que de ses paramètres : la rotation du globe ne la déplace pas', () => {
    // La pose de la caméra est calculée à partir du centre, de l'axe et des
    // paramètres orbitaux ; aucune grandeur liée à la rotation de la planète
    // (angle W, temps sidéral) n'intervient.
    const f = frameFromAxis([0, 1, 0]);
    const p = { azimuth: 1, elevation: 0.2, distance: 3 };
    expect(orbitPose([0, 0, 0], f, p)).toEqual(orbitPose([0, 0, 0], f, p));
  });

  it('limite l’élévation pour éviter le basculement aux pôles', () => {
    expect(clampElevation(2)).toBe(MAX_ELEVATION);
    expect(clampElevation(-2)).toBe(-MAX_ELEVATION);
    expect(clampElevation(0.3)).toBe(0.3);
  });
});

describe('transitions', () => {
  it('utilise une courbe douce de 0 à 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    let prev = 0;
    for (let t = 0.01; t <= 1; t += 0.01) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('interpole les poses en partant de la vue générale et en arrivant sur la planète', () => {
    const a = { position: [0, 20, 40] as Vec3, target: [0, 0, 0] as Vec3, up: [0, 1, 0] as Vec3 };
    const b = { position: [6, 0.5, 1] as Vec3, target: [5.4, 0, 0] as Vec3, up: [0.2, 0.98, 0] as Vec3 };
    expect(interpolatePose(a, b, 0).position).toEqual(a.position);
    expect(interpolatePose(a, b, 1).position).toEqual(b.position);
    expect(interpolatePose(a, b, 1).target).toEqual(b.target);
    const mid = interpolatePose(a, b, 0.5);
    expect(Math.hypot(...mid.up)).toBeCloseTo(1, 12);
  });

  it('prend le plus court chemin angulaire', () => {
    expect(shortestAngle(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2, 12);
    expect(shortestAngle(3, -3)).toBeCloseTo(2 * Math.PI - 6, 12);
  });

  it('lisse indépendamment de la cadence d’images', () => {
    // Deux pas de 1/60 s ≡ un pas de 1/30 s.
    const a = 1 - (1 - smoothingFactor(1 / 60, 0.2)) ** 2;
    expect(a).toBeCloseTo(smoothingFactor(1 / 30, 0.2), 12);
  });

  it('calcule la distance pour qu’une planète remplisse l’écran', () => {
    const fov = (36 * Math.PI) / 180;
    const d = distanceForScreenFraction(1, fov, 0.7);
    // Demi-angle apparent de la sphère = atan(tan(fov/2) × 0,7).
    expect(Math.asin(1 / d)).toBeCloseTo(Math.atan(Math.tan(fov / 2) * 0.7), 12);
  });
});
