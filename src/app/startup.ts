/**
 * Paramètres de démarrage facultatifs passés dans l'URL (développement,
 * démonstration, tests) :
 *
 *   ?t=2024-06-20T20:51:00Z   démarre une simulation à cet instant (en pause)
 *   &vitesse=3600             démarre la simulation à ×3600 (au lieu de la pause)
 *   &vue=terre                ouvre directement la vue rapprochée d'une planète
 *   &qualite=economy|standard|high   force un niveau de qualité
 *   &debug=1                  affiche la cadence et expose une API de test
 */

import { PLANET_IDS, PLANETS, type PlanetId } from '../data/planets';
import type { QualityLevel } from '../perf/quality';

export interface StartupOptions {
  startTime: number | null;
  startRate: number | null;
  view: PlanetId | null;
  quality: QualityLevel | null;
  debug: boolean;
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function parseStartupOptions(search: string): StartupOptions {
  const params = new URLSearchParams(search);
  const t = params.get('t');
  const parsedTime = t ? Date.parse(t) : NaN;
  const rate = Number(params.get('vitesse') ?? params.get('speed'));
  const viewParam = params.get('vue') ?? params.get('view');
  let view: PlanetId | null = null;
  if (viewParam) {
    const wanted = normalizeName(viewParam);
    view = PLANET_IDS.find((id) => id === wanted || normalizeName(PLANETS[id].name) === wanted) ?? null;
  }
  const q = params.get('qualite') ?? params.get('quality');
  const quality = q === 'economy' || q === 'standard' || q === 'high' ? q : null;
  return {
    startTime: Number.isFinite(parsedTime) ? parsedTime : null,
    startRate: Number.isFinite(rate) && rate > 0 ? rate : null,
    view,
    quality,
    debug: params.get('debug') === '1',
  };
}
