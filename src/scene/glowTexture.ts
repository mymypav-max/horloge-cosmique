/**
 * Textures procédurales (halo du Soleil, anneau de sélection), générées en
 * mémoire sans canvas : utilisables aussi dans les tests (Node).
 */

import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three';

function makeTexture(size: number, alphaAt: (r: number) => number, rgb: [number, number, number]): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, Math.min(1, alphaAt(r)));
      const k = (y * size + x) * 4;
      data[k] = rgb[0] * 255;
      data[k + 1] = rgb[1] * 255;
      data[k + 2] = rgb[2] * 255;
      data[k + 3] = a * 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Halo radial du Soleil (décroissance douce, sans effet de post-traitement). */
export function makeSunGlowTexture(): DataTexture {
  return makeTexture(
    128,
    (r) => {
      if (r >= 1) return 0;
      const core = Math.exp(-r * r * 9) * 0.85;
      const halo = Math.pow(1 - r, 2.2) * 0.45;
      return core + halo;
    },
    [1, 0.82, 0.55],
  );
}

/** Anneau fin et lumineux signalant la planète sélectionnée. */
export function makeFocusRingTexture(): DataTexture {
  return makeTexture(
    128,
    (r) => {
      const ring = Math.exp(-Math.pow((r - 0.86) / 0.035, 2));
      const glow = Math.exp(-Math.pow((r - 0.86) / 0.12, 2)) * 0.25;
      return r > 1 ? 0 : ring + glow;
    },
    [0.75, 0.88, 1],
  );
}
