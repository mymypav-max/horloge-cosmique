/**
 * Régions géographiques proposées dans la vue rapprochée de la Terre.
 *
 * Chaque région est définie par un point central (latitude, longitude en
 * degrés, longitudes positives à l'est) et une distance de caméra exprimée en
 * rayons terrestres affichés. Le zoom est volontairement limité : les textures
 * (2048 à 4096 pixels de large, soit 10 à 20 km par pixel) ne permettent pas
 * de montrer davantage de détails.
 */

export interface Region {
  id: string;
  name: string;
  latDeg: number;
  lonDeg: number;
  /** Distance caméra-centre de la Terre, en rayons du globe. */
  distance: number;
}

export const REGIONS: readonly Region[] = [
  { id: 'europe', name: 'Europe', latDeg: 50, lonDeg: 14, distance: 2.6 },
  { id: 'france', name: 'France', latDeg: 46.6, lonDeg: 2.4, distance: 2.15 },
  { id: 'afrique', name: 'Afrique', latDeg: 2, lonDeg: 20, distance: 2.9 },
  { id: 'moyen-orient', name: 'Moyen-Orient', latDeg: 27, lonDeg: 45, distance: 2.5 },
  { id: 'asie-sud', name: 'Asie du Sud', latDeg: 22, lonDeg: 80, distance: 2.5 },
  { id: 'asie-est', name: 'Asie de l’Est', latDeg: 36, lonDeg: 115, distance: 2.6 },
  { id: 'asie-sud-est', name: 'Asie du Sud-Est', latDeg: 5, lonDeg: 112, distance: 2.5 },
  { id: 'oceanie', name: 'Océanie', latDeg: -25, lonDeg: 140, distance: 2.8 },
  { id: 'amerique-nord', name: 'Amérique du Nord', latDeg: 45, lonDeg: -100, distance: 2.9 },
  { id: 'amerique-sud', name: 'Amérique du Sud', latDeg: -17, lonDeg: -60, distance: 2.9 },
  { id: 'arctique', name: 'Arctique', latDeg: 85, lonDeg: 0, distance: 2.7 },
  { id: 'antarctique', name: 'Antarctique', latDeg: -85, lonDeg: 0, distance: 2.7 },
];
