/**
 * Fond d'étoiles réelles (catalogue XHIP, magnitude ≤ 6), placées à leur
 * position J2000 dans le même repère écliptique que les planètes.
 * Les étoiles sont « à l'infini » : la sphère qui les porte suit la caméra.
 */

import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three';
import { equatorialJ2000ToEcliptic } from '../astro/frames';
import { DEG, fromSpherical, mulVec } from '../astro/math';
import starCatalog from '../data/stars.json';
import { astroToScene } from '../representation/sceneFrame';
import { STAR_FRAGMENT, STAR_VERTEX } from './shaders';

export const STAR_SPHERE_RADIUS = 900;

/** Couleur approximative d'une étoile d'après son indice B−V (désaturée). */
export function colorFromBV(bv: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [-0.4, [0.64, 0.73, 1.0]],
    [0.0, [0.82, 0.87, 1.0]],
    [0.4, [1.0, 0.98, 0.95]],
    [0.8, [1.0, 0.9, 0.75]],
    [1.2, [1.0, 0.8, 0.6]],
    [2.0, [1.0, 0.68, 0.45]],
  ];
  const x = Math.max(-0.4, Math.min(2.0, bv));
  let k = 0;
  while (k < stops.length - 2 && x > stops[k + 1][0]) k++;
  const [x0, c0] = stops[k];
  const [x1, c1] = stops[k + 1];
  const t = (x - x0) / (x1 - x0);
  return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
}

export function createStarfield(maxStars: number): Points {
  const stars = (starCatalog as number[][]).slice(0, maxStars);
  const positions = new Float32Array(stars.length * 3);
  const colors = new Float32Array(stars.length * 3);
  const sizes = new Float32Array(stars.length);
  const eqToEcl = equatorialJ2000ToEcliptic();
  stars.forEach(([ra, dec, mag, bv], k) => {
    const ecl = mulVec(eqToEcl, fromSpherical(ra * DEG, dec * DEG));
    const p = astroToScene(ecl);
    positions.set([p[0] * STAR_SPHERE_RADIUS, p[1] * STAR_SPHERE_RADIUS, p[2] * STAR_SPHERE_RADIUS], k * 3);
    // Flux relatif ∝ 10^(−0,4·m) ; on le répartit entre taille et luminosité.
    const flux = Math.pow(10, -0.4 * (mag - 1.0));
    sizes[k] = Math.max(1.6, Math.min(6.5, 2.2 + 2.4 * Math.sqrt(flux)));
    const lum = Math.max(0.16, Math.min(1.0, 0.25 + 0.75 * Math.sqrt(flux)));
    const c = colorFromBV(bv);
    colors.set([c[0] * lum, c[1] * lum, c[2] * lum], k * 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('size', new BufferAttribute(sizes, 1));
  const material = new ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { pixelRatio: { value: 1 }, brightness: { value: 0.85 } },
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const points = new Points(geometry, material);
  points.name = 'stars';
  points.frustumCulled = false;
  points.renderOrder = -10;
  return points;
}
