/**
 * Catalogue des lunes affichées : noms français, rayons, découverte et courte
 * description. Les éléments orbitaux sont dans moonOrbits.json (lunes autres
 * que la Lune, ajustés sur JPL Horizons) et dans src/astro/moon.ts (Lune).
 *
 * Sources des rayons moyens :
 * - JPL Solar System Dynamics, « Planetary Satellite Physical Parameters »
 *   (https://ssd.jpl.nasa.gov/sats/phys_par/), valeurs relevées dans le
 *   catalogue du paquet astraeus 0.3.0 (data/moons/*.json, 2026-10-20) ;
 * - Phobos et Déimos : dimensions triaxiales de l'en-tête JPL Horizons
 *   (mar099, révision du 2 juin 2025) ; rayon moyen = rayon de la sphère de
 *   même volume, (a·b·c)^(1/3) ;
 * - Lune : 1737,4 km, rapport IAU WGCCRE 2015 (Archinal et al. 2018).
 * Années de découverte : JPL SSD « Planetary Satellite Discovery
 * Circumstances » (même catalogue) ; Phobos et Déimos : 1877 (A. Hall).
 *
 * Mercure et Vénus n'ont aucune lune.
 */

import type { PlanetId } from './planets';

export type MoonId =
  | 'moon'
  | 'phobos'
  | 'deimos'
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'mimas'
  | 'enceladus'
  | 'tethys'
  | 'dione'
  | 'rhea'
  | 'titan'
  | 'iapetus'
  | 'miranda'
  | 'ariel'
  | 'umbriel'
  | 'titania'
  | 'oberon'
  | 'proteus'
  | 'triton'
  | 'nereid';

/**
 * Limites de la représentation visuelle d'une lune, affichées dans sa fiche
 * (provenance des cartes : docs/RESSOURCES.md) :
 * - photoMap : carte photographique (mosaïque d'images de sondes) ;
 * - partialMap : carte dont des zones sans données ont été remplies d'une
 *   teinte moyenne, sans relief inventé ;
 * - unseenRegions : une partie de la surface n'a jamais été photographiée ;
 * - approximate : représentation approximative (carte dessinée, teinte
 *   interprétée) ;
 * - noMap : aucune carte photographique publiée (couleur uniforme) ;
 * - infrared : carte issue d'observations infrarouges ;
 * - sphere : corps irrégulier représenté par une sphère.
 */
export type RepresentationNote = 'photoMap' | 'partialMap' | 'unseenRegions' | 'approximate' | 'noMap' | 'infrared' | 'sphere';

export interface MoonInfo {
  id: MoonId;
  name: string;
  parent: PlanetId;
  /** Rayon moyen (km). */
  radiusKm: number;
  /** Dimensions (km) des lunes très irrégulières : demi-axes a × b × c. */
  semiAxesKm?: readonly [number, number, number];
  discovery: string;
  description: string;
  /** Couleur de repli (et teinte moyenne) si aucune carte n'est disponible. */
  fallbackColor: number;
  /** Limites de la représentation visuelle (carte, forme), dans l'ordre d'affichage. */
  representation: readonly RepresentationNote[];
}

/** Lunes de chaque planète, de la plus proche à la plus éloignée. */
export const MOONS_BY_PLANET: Record<PlanetId, readonly MoonId[]> = {
  mercury: [],
  venus: [],
  earth: ['moon'],
  mars: ['phobos', 'deimos'],
  jupiter: ['io', 'europa', 'ganymede', 'callisto'],
  saturn: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'],
  uranus: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'],
  neptune: ['proteus', 'triton', 'nereid'],
};

// (concaténation explicite : Array.prototype.flat n'existe pas dans les WebView Chromium < 69)
export const MOON_IDS: readonly MoonId[] = ([] as MoonId[]).concat(...Object.values(MOONS_BY_PLANET));

export const MOONS: Record<MoonId, MoonInfo> = {
  moon: {
    id: 'moon',
    name: 'Lune',
    parent: 'earth',
    radiusKm: 1737.4,
    discovery: 'connue depuis l’Antiquité',
    description: 'Seul satellite naturel de la Terre. Sa rotation synchrone lui fait présenter toujours la même face à la Terre.',
    fallbackColor: 0x9a9a96,
    representation: ['photoMap'],
  },
  phobos: {
    id: 'phobos',
    name: 'Phobos',
    parent: 'mars',
    radiusKm: 11.06,
    semiAxesKm: [13.1, 11.1, 9.3],
    discovery: '1877 (Asaph Hall)',
    description:
      'La plus grande et la plus proche des deux lunes de Mars, de forme irrégulière. Elle fait le tour de Mars plus vite que la planète ne tourne sur elle-même et s’en rapproche lentement.',
    fallbackColor: 0x6e655c,
    representation: ['approximate', 'sphere'],
  },
  deimos: {
    id: 'deimos',
    name: 'Déimos',
    parent: 'mars',
    radiusKm: 6.2,
    semiAxesKm: [7.8, 6.0, 5.1],
    discovery: '1877 (Asaph Hall)',
    description: 'La plus petite et la plus éloignée des deux lunes de Mars : un petit corps irrégulier et sombre, couvert de poussière.',
    fallbackColor: 0x857a6c,
    representation: ['approximate', 'partialMap', 'sphere'],
  },
  io: {
    id: 'io',
    name: 'Io',
    parent: 'jupiter',
    radiusKm: 1821.49,
    discovery: '1610 (Galilée)',
    description:
      'Le corps le plus volcanique du Système solaire : des centaines de volcans actifs, entretenus par les effets de marée de Jupiter.',
    fallbackColor: 0xd9c46a,
    representation: ['photoMap'],
  },
  europa: {
    id: 'europa',
    name: 'Europe',
    parent: 'jupiter',
    radiusKm: 1560.8,
    discovery: '1610 (Galilée)',
    description:
      'Une croûte de glace parmi les surfaces les plus lisses du Système solaire ; un océan d’eau salée existe très probablement en dessous.',
    fallbackColor: 0xc8b89a,
    representation: ['partialMap'],
  },
  ganymede: {
    id: 'ganymede',
    name: 'Ganymède',
    parent: 'jupiter',
    radiusKm: 2631.2,
    discovery: '1610 (Galilée)',
    description: 'La plus grande lune du Système solaire, plus grande que Mercure ; la seule connue à posséder son propre champ magnétique.',
    fallbackColor: 0x9a8f80,
    representation: ['photoMap'],
  },
  callisto: {
    id: 'callisto',
    name: 'Callisto',
    parent: 'jupiter',
    radiusKm: 2410.3,
    discovery: '1610 (Galilée)',
    description: 'Une surface sombre, saturée de cratères, parmi les plus anciennes du Système solaire.',
    fallbackColor: 0x6f655a,
    representation: ['partialMap'],
  },
  mimas: {
    id: 'mimas',
    name: 'Mimas',
    parent: 'saturn',
    radiusKm: 198.2,
    discovery: '1789 (William Herschel)',
    description: 'Petite lune glacée marquée par l’immense cratère Herschel, large d’environ un tiers de son diamètre.',
    fallbackColor: 0xb8b4ae,
    representation: ['photoMap'],
  },
  enceladus: {
    id: 'enceladus',
    name: 'Encelade',
    parent: 'saturn',
    radiusKm: 252.1,
    discovery: '1789 (William Herschel)',
    description:
      'Lune glacée très brillante : des geysers de vapeur d’eau jaillissent de fractures proches de son pôle sud et alimentent l’anneau E de Saturne.',
    fallbackColor: 0xe9eef2,
    representation: ['photoMap'],
  },
  tethys: {
    id: 'tethys',
    name: 'Téthys',
    parent: 'saturn',
    radiusKm: 531.1,
    discovery: '1684 (Jean-Dominique Cassini)',
    description: 'Lune de glace de faible densité, marquée par le grand cratère Odyssée et le long canyon Ithaca Chasma.',
    fallbackColor: 0xd6d4cf,
    representation: ['photoMap'],
  },
  dione: {
    id: 'dione',
    name: 'Dioné',
    parent: 'saturn',
    radiusKm: 561.4,
    discovery: '1684 (Jean-Dominique Cassini)',
    description: 'Lune glacée dont l’hémisphère arrière est strié de falaises de glace brillantes.',
    fallbackColor: 0xcac7c2,
    representation: ['photoMap'],
  },
  rhea: {
    id: 'rhea',
    name: 'Rhéa',
    parent: 'saturn',
    radiusKm: 763.5,
    discovery: '1672 (Jean-Dominique Cassini)',
    description: 'Deuxième plus grande lune de Saturne, un corps de glace et de roche très cratérisé.',
    fallbackColor: 0xc2bdb6,
    representation: ['photoMap'],
  },
  titan: {
    id: 'titan',
    name: 'Titan',
    parent: 'saturn',
    radiusKm: 2574.76,
    discovery: '1655 (Christiaan Huygens)',
    description:
      'La plus grande lune de Saturne et la seule lune dotée d’une atmosphère épaisse ; des lacs et des mers de méthane et d’éthane liquides parsèment ses régions polaires.',
    fallbackColor: 0xd9a75a,
    representation: ['infrared', 'approximate'],
  },
  iapetus: {
    id: 'iapetus',
    name: 'Japet',
    parent: 'saturn',
    radiusKm: 734.3,
    discovery: '1671 (Jean-Dominique Cassini)',
    description: 'Lune aux deux visages : un hémisphère très sombre, l’autre très clair ; une crête montagneuse suit une partie de son équateur.',
    fallbackColor: 0x8c8378,
    representation: ['photoMap'],
  },
  miranda: {
    id: 'miranda',
    name: 'Miranda',
    parent: 'uranus',
    radiusKm: 235.8,
    discovery: '1948 (Gerard Kuiper)',
    description: 'La plus petite des cinq grandes lunes d’Uranus, au relief chaotique : canyons, terrains en chevrons et falaises géantes.',
    fallbackColor: 0xa7a59f,
    representation: ['partialMap', 'unseenRegions'],
  },
  ariel: {
    id: 'ariel',
    name: 'Ariel',
    parent: 'uranus',
    radiusKm: 578.9,
    discovery: '1851 (William Lassell)',
    description: 'Surface glacée brillante, parcourue de longues vallées ; probablement la plus jeune des grandes lunes d’Uranus.',
    fallbackColor: 0xb3b1ab,
    representation: ['partialMap', 'unseenRegions'],
  },
  umbriel: {
    id: 'umbriel',
    name: 'Umbriel',
    parent: 'uranus',
    radiusKm: 584.7,
    discovery: '1851 (William Lassell)',
    description: 'La plus sombre des grandes lunes d’Uranus, ancienne et très cratérisée.',
    fallbackColor: 0x6d6b68,
    representation: ['partialMap', 'unseenRegions'],
  },
  titania: {
    id: 'titania',
    name: 'Titania',
    parent: 'uranus',
    radiusKm: 788.9,
    discovery: '1787 (William Herschel)',
    description: 'La plus grande lune d’Uranus, entaillée de grands canyons et de failles.',
    fallbackColor: 0xa29d96,
    representation: ['partialMap', 'unseenRegions'],
  },
  oberon: {
    id: 'oberon',
    name: 'Obéron',
    parent: 'uranus',
    radiusKm: 761.4,
    discovery: '1787 (William Herschel)',
    description: 'La plus éloignée des cinq grandes lunes d’Uranus, ancienne et couverte de cratères.',
    fallbackColor: 0x938b84,
    representation: ['partialMap', 'unseenRegions'],
  },
  proteus: {
    id: 'proteus',
    name: 'Protée',
    parent: 'neptune',
    radiusKm: 208,
    discovery: '1989 (sonde Voyager 2)',
    description: 'Deuxième plus grande lune de Neptune, sombre et de forme irrégulière.',
    fallbackColor: 0x5f5a55,
    representation: ['noMap', 'sphere'],
  },
  triton: {
    id: 'triton',
    name: 'Triton',
    parent: 'neptune',
    radiusKm: 1352.6,
    discovery: '1846 (William Lassell)',
    description:
      'La plus grande lune de Neptune, sur une orbite rétrograde : probablement un objet de la ceinture de Kuiper capturé. Voyager 2 y a observé des panaches actifs.',
    fallbackColor: 0xc9bfb4,
    representation: ['partialMap', 'unseenRegions'],
  },
  nereid: {
    id: 'nereid',
    name: 'Néréide',
    parent: 'neptune',
    radiusKm: 170,
    discovery: '1949 (Gerard Kuiper)',
    description: 'Petite lune à l’orbite extrêmement allongée, l’une des plus excentriques connues.',
    fallbackColor: 0x8a8580,
    representation: ['noMap', 'sphere'],
  },
};
