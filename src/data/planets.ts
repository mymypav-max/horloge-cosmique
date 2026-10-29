/**
 * Données descriptives des corps affichés : noms français, caractéristiques
 * physiques (pour les panneaux d'information) et paramètres de rotation IAU.
 *
 * Ces données ne servent PAS au calcul des positions orbitales (voir
 * orbitalElements.ts) ; elles décrivent les corps et leur orientation propre.
 *
 * Rotation : modèles du groupe de travail IAU WGCCRE (Archinal et al. 2011,
 * « Report of the IAU Working Group on Cartographic Coordinates and Rotational
 * Elements: 2009 »), termes périodiques négligés (< 1°).
 * α0, δ0 : direction du pôle nord (équatorial J2000) ; W : méridien origine.
 * α0 = α + αT·T, δ0 = δ + δT·T (T en siècles), W = W0 + Wd·d (d en jours).
 */

export type PlanetId = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

export const PLANET_IDS: readonly PlanetId[] = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

export interface RotationModel {
  alpha0: number;
  alphaT: number;
  delta0: number;
  deltaT: number;
  W0: number;
  Wd: number;
}

export interface PlanetInfo {
  id: PlanetId;
  name: string;
  /** Rayon équatorial moyen réel (km). */
  radiusKm: number;
  /** Période orbitale sidérale (jours). */
  orbitalPeriodDays: number;
  /** Période de rotation sidérale (heures), négative si rétrograde. */
  rotationPeriodHours: number;
  /** Inclinaison de l'axe sur le plan de l'orbite (°). */
  axialTiltDeg: number;
  rotation: RotationModel;
  /** Couleur de repli si la texture ne peut pas être chargée. */
  fallbackColor: number;
  /** Courte description affichée dans la vue rapprochée. */
  summary: string;
}

export const PLANETS: Record<PlanetId, PlanetInfo> = {
  mercury: {
    id: 'mercury',
    name: 'Mercure',
    radiusKm: 2439.7,
    orbitalPeriodDays: 87.969,
    rotationPeriodHours: 1407.6,
    axialTiltDeg: 0.03,
    rotation: { alpha0: 281.0103, alphaT: -0.0328, delta0: 61.4155, deltaT: -0.0049, W0: 329.5469, Wd: 6.1385025 },
    fallbackColor: 0x9a9590,
    summary: 'Planète la plus proche du Soleil, sans atmosphère notable.',
  },
  venus: {
    id: 'venus',
    name: 'Vénus',
    radiusKm: 6051.8,
    orbitalPeriodDays: 224.701,
    rotationPeriodHours: -5832.5,
    axialTiltDeg: 177.36,
    rotation: { alpha0: 272.76, alphaT: 0, delta0: 67.16, deltaT: 0, W0: 160.2, Wd: -1.4813688 },
    fallbackColor: 0xe0c58f,
    summary: 'Enveloppée d’épais nuages ; rotation lente et rétrograde.',
  },
  earth: {
    id: 'earth',
    name: 'Terre',
    radiusKm: 6371.0,
    orbitalPeriodDays: 365.256,
    rotationPeriodHours: 23.9345,
    axialTiltDeg: 23.44,
    // Orientation calculée séparément (temps sidéral + précession), voir earth.ts.
    rotation: { alpha0: 0, alphaT: -0.641, delta0: 90, deltaT: -0.557, W0: 190.147, Wd: 360.9856235 },
    fallbackColor: 0x2f6db5,
    summary: 'Notre planète.',
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    radiusKm: 3389.5,
    orbitalPeriodDays: 686.98,
    rotationPeriodHours: 24.6229,
    axialTiltDeg: 25.19,
    rotation: { alpha0: 317.68143, alphaT: -0.1061, delta0: 52.8865, deltaT: -0.0609, W0: 176.63, Wd: 350.89198226 },
    fallbackColor: 0xc1673f,
    summary: 'La planète rouge, à la surface riche en oxydes de fer.',
  },
  jupiter: {
    id: 'jupiter',
    name: 'Jupiter',
    radiusKm: 69911,
    orbitalPeriodDays: 4332.59,
    rotationPeriodHours: 9.925,
    axialTiltDeg: 3.13,
    rotation: { alpha0: 268.056595, alphaT: -0.006499, delta0: 64.495303, deltaT: 0.002413, W0: 284.95, Wd: 870.536 },
    fallbackColor: 0xd2b48c,
    summary: 'Géante gazeuse, la plus grande planète du système solaire.',
  },
  saturn: {
    id: 'saturn',
    name: 'Saturne',
    radiusKm: 58232,
    orbitalPeriodDays: 10759.22,
    rotationPeriodHours: 10.656,
    axialTiltDeg: 26.73,
    rotation: { alpha0: 40.589, alphaT: -0.036, delta0: 83.537, deltaT: -0.004, W0: 38.9, Wd: 810.7939024 },
    fallbackColor: 0xe3cf99,
    summary: 'Géante gazeuse entourée d’un vaste système d’anneaux.',
  },
  uranus: {
    id: 'uranus',
    name: 'Uranus',
    radiusKm: 25362,
    orbitalPeriodDays: 30688.5,
    rotationPeriodHours: -17.24,
    axialTiltDeg: 97.77,
    rotation: { alpha0: 257.311, alphaT: 0, delta0: -15.175, deltaT: 0, W0: 203.81, Wd: -501.1600928 },
    fallbackColor: 0xa6e0e8,
    summary: 'Géante de glaces dont l’axe est presque couché sur son orbite.',
  },
  neptune: {
    id: 'neptune',
    name: 'Neptune',
    radiusKm: 24622,
    orbitalPeriodDays: 60182,
    rotationPeriodHours: 16.11,
    axialTiltDeg: 28.32,
    rotation: { alpha0: 299.36, alphaT: 0, delta0: 43.46, deltaT: 0, W0: 253.18, Wd: 536.3128492 },
    fallbackColor: 0x3d5ef0,
    summary: 'Géante de glaces la plus éloignée du Soleil.',
  },
};

/** Modèle de rotation IAU du Soleil (utilisé pour animer sa texture). */
export const SUN_ROTATION: RotationModel = {
  alpha0: 286.13,
  alphaT: 0,
  delta0: 63.87,
  deltaT: 0,
  W0: 84.176,
  Wd: 14.1844,
};

export const SUN_RADIUS_KM = 695_700;

/** Unité astronomique (km), valeur IAU 2012. */
export const AU_KM = 149_597_870.7;
