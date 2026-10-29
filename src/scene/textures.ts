/**
 * Chargement des textures locales (aucun accès réseau : les fichiers sont
 * servis depuis le paquet de l'application).
 */

import { LinearFilter, LinearMipmapLinearFilter, NoColorSpace, type Texture, TextureLoader, type WebGLRenderer } from 'three';
import type { PlanetId } from '../data/planets';
import type { QualityPreset } from '../perf/quality';

export interface TextureSet {
  earthDay: Texture | null;
  earthData: Texture | null;
  planets: Partial<Record<PlanetId, Texture | null>>;
  sun: Texture | null;
  saturnRing: Texture | null;
}

export function emptyTextureSet(): TextureSet {
  return { earthDay: null, earthData: null, planets: {}, sun: null, saturnRing: null };
}

const BASE = `${import.meta.env.BASE_URL}textures/`;

export async function loadTextures(
  quality: QualityPreset,
  renderer: WebGLRenderer,
  onProgress: (loaded: number, total: number) => void,
): Promise<TextureSet> {
  const loader = new TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const files: Array<[string, (t: Texture | null) => void, number]> = [];
  const set = emptyTextureSet();

  const add = (file: string, assign: (t: Texture | null) => void, anisotropy = 1) => files.push([file, assign, anisotropy]);
  add(`earth-day-${quality.earthDayWidth}.jpg`, (t) => (set.earthDay = t), quality.anisotropy);
  add('earth-data-2048.jpg', (t) => (set.earthData = t), quality.anisotropy);
  add('sun.jpg', (t) => (set.sun = t));
  add('saturn-ring.png', (t) => (set.saturnRing = t));
  for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const) {
    add(`${id}.jpg`, (t) => (set.planets[id] = t));
  }

  let loaded = 0;
  onProgress(0, files.length);
  await Promise.all(
    files.map(
      ([file, assign, anisotropy]) =>
        new Promise<void>((resolve) => {
          loader.load(
            BASE + file,
            (texture) => {
              // Échantillonnage brut : la conversion sRGB → linéaire est faite dans les shaders.
              texture.colorSpace = NoColorSpace;
              texture.anisotropy = Math.min(anisotropy, maxAniso);
              texture.minFilter = file === 'saturn-ring.png' ? LinearFilter : LinearMipmapLinearFilter;
              texture.generateMipmaps = file !== 'saturn-ring.png';
              assign(texture);
              onProgress(++loaded, files.length);
              resolve();
            },
            undefined,
            () => {
              // Texture absente : le shader utilisera une couleur de repli.
              console.warn(`Texture introuvable : ${file}`);
              assign(null);
              onProgress(++loaded, files.length);
              resolve();
            },
          );
        }),
    ),
  );
  return set;
}
