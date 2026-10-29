/**
 * Réglages utilisateur, conservés localement (localStorage) quand c'est
 * possible. En cas d'indisponibilité du stockage, les valeurs par défaut
 * s'appliquent sans erreur.
 */

import type { QualitySetting } from '../perf/quality';

export interface Settings {
  quality: QualitySetting;
  clouds: boolean;
  ambientMotion: boolean;
  labels: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  clouds: true,
  ambientMotion: true,
  labels: true,
};

export interface SettingEntry {
  key: keyof Settings;
  label: string;
  values: readonly unknown[];
  describe(value: unknown): string;
}

const yesNo = (v: unknown) => (v ? 'Oui' : 'Non');
const QUALITY_LABELS: Record<QualitySetting, string> = {
  auto: 'Automatique',
  economy: 'Économie',
  standard: 'Standard',
  high: 'Haute',
};

export const SETTINGS_ENTRIES: readonly SettingEntry[] = [
  {
    key: 'quality',
    label: 'Qualité graphique',
    values: ['auto', 'economy', 'standard', 'high'],
    describe: (v) => QUALITY_LABELS[v as QualitySetting],
  },
  { key: 'clouds', label: 'Nuages sur la Terre', values: [true, false], describe: yesNo },
  { key: 'ambientMotion', label: 'Mouvement lent de la caméra', values: [true, false], describe: yesNo },
  { key: 'labels', label: 'Noms des planètes', values: [true, false], describe: yesNo },
];

/** Passe à la valeur suivante (ou précédente) d'un réglage, en boucle. */
export function cycleSetting(settings: Settings, index: number, delta: 1 | -1): Settings {
  const entry = SETTINGS_ENTRIES[index];
  if (!entry) return settings;
  const values = entry.values;
  const k = values.indexOf(settings[entry.key]);
  const next = values[(k + delta + values.length) % values.length];
  return { ...settings, [entry.key]: next } as Settings;
}

const STORAGE_KEY = 'horloge-cosmique.reglages.v1';

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const out = { ...DEFAULT_SETTINGS };
    for (const entry of SETTINGS_ENTRIES) {
      const v = parsed[entry.key];
      if (entry.values.includes(v)) (out as Record<string, unknown>)[entry.key] = v;
    }
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Stockage indisponible (navigation privée, WebView restreinte) : sans conséquence.
  }
}
