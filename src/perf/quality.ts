/**
 * Niveaux de qualité graphique et détection automatique.
 *
 * Le Fire TV Stick dispose d'un GPU d'entrée de gamme (PowerVR GE8300 /
 * GE9215 ou Mali selon les modèles) et de 1 à 2 Go de mémoire partagée :
 * le niveau « standard » est conçu pour lui. Voir docs/ARCHITECTURE.md.
 */

export type QualityLevel = 'economy' | 'standard' | 'high';
export type QualitySetting = 'auto' | QualityLevel;

export interface QualityPreset {
  level: QualityLevel;
  /** Largeur de la texture de surface de la Terre. */
  earthDayWidth: 2048 | 4096;
  /** Segments des sphères (longitude) ; la latitude utilise la moitié. */
  sphereSegments: number;
  earthSegments: number;
  /**
   * Hauteur maximale de l'image calculée, en pixels physiques. Sur Fire TV, la
   * WebView expose souvent 960 × 540 px CSS avec un rapport de pixels de 2 :
   * c'est la hauteur physique qui compte, pas le rapport de pixels.
   */
  maxRenderHeight: number;
  /** Échelle de rendu maximale (1 = résolution native de la fenêtre). */
  maxRenderScale: number;
  /** Échelle de rendu minimale autorisée par l'ajustement dynamique. */
  minRenderScale: number;
  antialias: boolean;
  /** Nombre maximal d'étoiles affichées (les plus brillantes d'abord). */
  maxStars: number;
  anisotropy: number;
  /** Images par seconde visées pendant les animations et interactions. */
  activeFps: number;
  /** Images par seconde en mode horloge (rien ne bouge rapidement). */
  idleFps: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  economy: {
    level: 'economy',
    earthDayWidth: 2048,
    sphereSegments: 32,
    earthSegments: 64,
    maxRenderHeight: 720,
    maxRenderScale: 1,
    minRenderScale: 0.6,
    antialias: false,
    maxStars: 1500,
    anisotropy: 1,
    activeFps: 30,
    idleFps: 20,
  },
  standard: {
    level: 'standard',
    earthDayWidth: 2048,
    sphereSegments: 48,
    earthSegments: 96,
    maxRenderHeight: 1080,
    maxRenderScale: 1,
    minRenderScale: 0.6,
    antialias: true,
    maxStars: 5000,
    anisotropy: 2,
    activeFps: 60,
    idleFps: 30,
  },
  high: {
    level: 'high',
    earthDayWidth: 4096,
    sphereSegments: 64,
    earthSegments: 128,
    maxRenderHeight: 2160,
    maxRenderScale: 1,
    minRenderScale: 0.7,
    antialias: true,
    maxStars: 6000,
    anisotropy: 4,
    activeFps: 60,
    idleFps: 30,
  },
};

export interface DeviceInfo {
  userAgent: string;
  webgl2: boolean;
  maxTextureSize: number;
  /** navigator.deviceMemory (Go), si disponible. */
  deviceMemory?: number;
}

/** Vrai pour les appareils Amazon Fire TV (modèles « AFT… »). */
export function isFireTv(userAgent: string): boolean {
  return /\bAFT[A-Z0-9]+\b/.test(userAgent);
}

export function detectQuality(info: DeviceInfo): QualityLevel {
  if (!info.webgl2 || info.maxTextureSize < 4096) return 'economy';
  if (info.deviceMemory !== undefined && info.deviceMemory <= 1) return 'economy';
  if (isFireTv(info.userAgent) || /Android/i.test(info.userAgent)) return 'standard';
  if (info.deviceMemory !== undefined && info.deviceMemory <= 2) return 'standard';
  return 'high';
}

export function resolveQuality(setting: QualitySetting, info: DeviceInfo): QualityPreset {
  const level = setting === 'auto' ? detectQuality(info) : setting;
  // Jamais de texture plus grande que ce que le GPU accepte.
  const preset = { ...QUALITY_PRESETS[level] };
  if (info.maxTextureSize < preset.earthDayWidth) preset.earthDayWidth = 2048;
  return preset;
}
