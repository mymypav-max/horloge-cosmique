/**
 * Machine d'états de la navigation à la télécommande.
 *
 * Fonction pure : (état, action) → (nouvel état, effets). Elle ne touche ni au
 * DOM ni à la scène 3D ; l'application exécute les effets retournés. Cela
 * permet de tester toute la logique de navigation sans affichage.
 *
 * Couches de focus :
 * - « scene »    : les flèches agissent sur la scène (changer de planète en vue
 *                  générale, faire pivoter la caméra en vue rapprochée) ;
 * - « bar »      : barre d'actions en bas de l'écran ;
 * - « regions »  : liste des régions de la Terre ;
 * - « satellites » : liste des satellites de la planète observée (lunes,
 *                  et ISS pour la Terre) ;
 * - « settings » : panneau de réglages.
 *
 * Vues : vue générale, vue rapprochée d'une planète, et vue d'un satellite
 * (state.satellite non nul) dont on revient à la planète par Retour.
 */

import { MOONS_BY_PLANET } from '../data/moons';
import { PLANET_IDS, type PlanetId } from '../data/planets';
import { REGIONS } from '../data/regions';
import type { SatelliteId } from '../representation/satellites';

export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'menu'
  | 'playPause'
  | 'rewind'
  | 'fastForward';

export type Layer = 'scene' | 'bar' | 'regions' | 'satellites' | 'settings';
export type View = 'overview' | 'detail';

export type BarItem =
  | 'pause'
  | 'slower'
  | 'faster'
  | 'now'
  | 'settings'
  | 'regions'
  | 'zoomIn'
  | 'zoomOut'
  | 'recenter'
  | 'satellites'
  | 'sun'
  | 'parent'
  | 'overview';

export interface NavState {
  view: View;
  /** Planète mise en évidence dans la vue générale. */
  focused: PlanetId;
  /** Planète affichée en vue rapprochée. */
  detail: PlanetId | null;
  /** Satellite observé (vue d'un satellite de la planète `detail`). */
  satellite: SatelliteId | null;
  layer: Layer;
  barIndex: number;
  regionIndex: number;
  satelliteIndex: number;
  settingsIndex: number;
  /** Instant (ms) du premier appui sur Retour à la racine, pour confirmer la sortie. */
  exitArmedAt: number | null;
}

export type Effect =
  | { type: 'openPlanet'; id: PlanetId }
  | { type: 'closePlanet' }
  | { type: 'focus'; id: PlanetId }
  | { type: 'time'; op: 'togglePause' | 'faster' | 'slower' | 'now' }
  | { type: 'zoom'; direction: 1 | -1 }
  | { type: 'recenter' }
  | { type: 'centerRegion'; regionId: string }
  | { type: 'openSatellite'; id: SatelliteId }
  | { type: 'closeSatellite' }
  | { type: 'sunView' }
  | { type: 'setting'; index: number; delta: 1 | -1 }
  | { type: 'armExit' }
  | { type: 'exit' };

export interface NavContext {
  /** Instant courant (ms), pour la double pression sur Retour. */
  now: number;
  /** Nombre d'entrées du panneau de réglages. */
  settingsCount: number;
  /**
   * Satellites proposés pour la planète observée, dans l'ordre de la liste
   * (par défaut : ses lunes). L'application y ajoute l'ISS pour la Terre
   * lorsque des données valables existent pour l'instant affiché.
   */
  satellites?: readonly SatelliteId[];
}

export interface NavResult {
  state: NavState;
  effects: Effect[];
}

/** Délai pour confirmer la sortie par un second appui sur Retour. */
export const EXIT_CONFIRM_MS = 3_000;

export function initialNavState(): NavState {
  return {
    view: 'overview',
    focused: 'earth',
    detail: null,
    satellite: null,
    layer: 'scene',
    barIndex: 0,
    regionIndex: 0,
    satelliteIndex: 0,
    settingsIndex: 0,
    exitArmedAt: null,
  };
}

/** Vrai si la planète a des satellites à proposer (Mercure et Vénus n'en ont pas). */
export function hasSatellites(planet: PlanetId | null): boolean {
  return planet !== null && MOONS_BY_PLANET[planet].length > 0;
}

/** Éléments de la barre d'actions selon la vue. */
export function barItems(state: Pick<NavState, 'view' | 'detail'> & { satellite?: SatelliteId | null }): BarItem[] {
  if (state.view === 'overview') return ['pause', 'slower', 'faster', 'now', 'settings'];
  const time: BarItem[] = ['pause', 'slower', 'faster', 'now'];
  if (state.satellite) return ['zoomIn', 'zoomOut', 'recenter', 'sun', ...time, 'parent', 'overview'];
  const items: BarItem[] = [];
  if (state.detail === 'earth') items.push('regions');
  if (hasSatellites(state.detail)) items.push('satellites');
  return [...items, 'zoomIn', 'zoomOut', 'recenter', 'sun', ...time, 'overview'];
}

/** Satellites proposés dans la liste (contexte fourni par l'application, sinon les lunes de la planète). */
export function satelliteList(state: Pick<NavState, 'detail'>, ctx: Pick<NavContext, 'satellites'>): readonly SatelliteId[] {
  if (ctx.satellites) return ctx.satellites;
  return state.detail ? MOONS_BY_PLANET[state.detail] : [];
}

/** Vrai si les flèches doivent piloter la caméra de la vue rapprochée. */
export function arrowsControlCamera(state: NavState): boolean {
  return state.view === 'detail' && state.layer === 'scene';
}

function cyclePlanet(id: PlanetId, step: 1 | -1): PlanetId {
  const k = PLANET_IDS.indexOf(id);
  return PLANET_IDS[(k + step + PLANET_IDS.length) % PLANET_IDS.length];
}

function timeOp(op: 'togglePause' | 'faster' | 'slower' | 'now'): Effect {
  return { type: 'time', op };
}

function activateBarItem(state: NavState, item: BarItem): NavResult {
  switch (item) {
    case 'pause':
      return { state, effects: [timeOp('togglePause')] };
    case 'slower':
      return { state, effects: [timeOp('slower')] };
    case 'faster':
      return { state, effects: [timeOp('faster')] };
    case 'now':
      return { state, effects: [timeOp('now')] };
    case 'settings':
      return { state: { ...state, layer: 'settings', settingsIndex: 0 }, effects: [] };
    case 'regions':
      return { state: { ...state, layer: 'regions' }, effects: [] };
    case 'zoomIn':
      return { state, effects: [{ type: 'zoom', direction: 1 }] };
    case 'zoomOut':
      return { state, effects: [{ type: 'zoom', direction: -1 }] };
    case 'recenter':
      return { state, effects: [{ type: 'recenter' }] };
    case 'satellites':
      return { state: { ...state, layer: 'satellites' }, effects: [] };
    case 'sun':
      return { state: { ...state, layer: 'scene' }, effects: [{ type: 'sunView' }] };
    case 'parent':
      return { state: { ...state, satellite: null, layer: 'scene', barIndex: 0 }, effects: [{ type: 'closeSatellite' }] };
    case 'overview':
      return {
        state: { ...state, view: 'overview', detail: null, satellite: null, layer: 'scene', barIndex: 0 },
        effects: [{ type: 'closePlanet' }],
      };
  }
}

/** Actions valables dans toutes les couches (touches multimédias). */
function globalAction(state: NavState, action: Action): NavResult | null {
  switch (action) {
    case 'playPause':
      return { state, effects: [timeOp('togglePause')] };
    case 'rewind':
      return state.view === 'detail'
        ? { state, effects: [{ type: 'zoom', direction: -1 }] }
        : { state, effects: [timeOp('slower')] };
    case 'fastForward':
      return state.view === 'detail'
        ? { state, effects: [{ type: 'zoom', direction: 1 }] }
        : { state, effects: [timeOp('faster')] };
    default:
      return null;
  }
}

export function reduceNavigation(previous: NavState, action: Action, ctx: NavContext): NavResult {
  // Toute action autre que Retour annule la demande de sortie.
  const state: NavState = action === 'back' ? previous : { ...previous, exitArmedAt: null };

  const global = globalAction(state, action);
  if (global) return global;

  switch (state.layer) {
    case 'scene':
      return reduceScene(state, action, ctx);
    case 'bar':
      return reduceBar(state, action);
    case 'regions':
      return reduceRegions(state, action);
    case 'satellites':
      return reduceSatellites(state, action, ctx);
    case 'settings':
      return reduceSettings(state, action, ctx);
  }
}

function reduceScene(state: NavState, action: Action, ctx: NavContext): NavResult {
  if (state.view === 'overview') {
    switch (action) {
      case 'left':
      case 'right': {
        const focused = cyclePlanet(state.focused, action === 'right' ? 1 : -1);
        return { state: { ...state, focused }, effects: [{ type: 'focus', id: focused }] };
      }
      case 'ok':
        return {
          state: { ...state, view: 'detail', detail: state.focused, satellite: null, layer: 'scene', barIndex: 0, satelliteIndex: 0 },
          effects: [{ type: 'openPlanet', id: state.focused }],
        };
      case 'down':
      case 'menu':
        return { state: { ...state, layer: 'bar', barIndex: 0 }, effects: [] };
      case 'back': {
        if (state.exitArmedAt !== null && ctx.now - state.exitArmedAt <= EXIT_CONFIRM_MS) {
          return { state: { ...state, exitArmedAt: null }, effects: [{ type: 'exit' }] };
        }
        return { state: { ...state, exitArmedAt: ctx.now }, effects: [{ type: 'armExit' }] };
      }
      default:
        return { state, effects: [] };
    }
  }

  // Vue rapprochée : les flèches pilotent la caméra (gérées en continu par l'application).
  switch (action) {
    case 'ok':
    case 'menu':
      return { state: { ...state, layer: 'bar', barIndex: 0 }, effects: [] };
    case 'back':
      // Depuis un satellite : retour à sa planète ; depuis une planète : vue générale.
      if (state.satellite) {
        return { state: { ...state, satellite: null, layer: 'scene', barIndex: 0 }, effects: [{ type: 'closeSatellite' }] };
      }
      return {
        state: { ...state, view: 'overview', detail: null, layer: 'scene', barIndex: 0 },
        effects: [{ type: 'closePlanet' }],
      };
    default:
      return { state, effects: [] };
  }
}

function reduceSatellites(state: NavState, action: Action, ctx: NavContext): NavResult {
  const list = satelliteList(state, ctx);
  const n = list.length;
  if (n === 0) return { state: { ...state, layer: 'bar' }, effects: [] };
  const index = Math.min(state.satelliteIndex, n - 1);
  switch (action) {
    case 'up':
      return { state: { ...state, satelliteIndex: (index - 1 + n) % n }, effects: [] };
    case 'down':
      return { state: { ...state, satelliteIndex: (index + 1) % n }, effects: [] };
    case 'ok': {
      const id = list[index];
      return {
        state: { ...state, satellite: id, layer: 'scene', barIndex: 0, satelliteIndex: index },
        effects: [{ type: 'openSatellite', id }],
      };
    }
    case 'back':
    case 'left':
    case 'menu':
      return { state: { ...state, layer: 'bar' }, effects: [] };
    default:
      return { state, effects: [] };
  }
}

function reduceBar(state: NavState, action: Action): NavResult {
  const items = barItems(state);
  switch (action) {
    case 'left':
      return { state: { ...state, barIndex: Math.max(0, state.barIndex - 1) }, effects: [] };
    case 'right':
      return { state: { ...state, barIndex: Math.min(items.length - 1, state.barIndex + 1) }, effects: [] };
    case 'ok':
      return activateBarItem(state, items[Math.min(state.barIndex, items.length - 1)]);
    case 'up':
    case 'back':
    case 'menu':
      return { state: { ...state, layer: 'scene' }, effects: [] };
    default:
      return { state, effects: [] };
  }
}

function reduceRegions(state: NavState, action: Action): NavResult {
  const n = REGIONS.length;
  switch (action) {
    case 'up':
      return { state: { ...state, regionIndex: (state.regionIndex - 1 + n) % n }, effects: [] };
    case 'down':
      return { state: { ...state, regionIndex: (state.regionIndex + 1) % n }, effects: [] };
    case 'ok':
      return {
        state: { ...state, layer: 'scene' },
        effects: [{ type: 'centerRegion', regionId: REGIONS[state.regionIndex].id }],
      };
    case 'back':
    case 'left':
    case 'menu':
      return { state: { ...state, layer: 'bar' }, effects: [] };
    default:
      return { state, effects: [] };
  }
}

function reduceSettings(state: NavState, action: Action, ctx: NavContext): NavResult {
  const n = Math.max(1, ctx.settingsCount);
  switch (action) {
    case 'up':
      return { state: { ...state, settingsIndex: (state.settingsIndex - 1 + n) % n }, effects: [] };
    case 'down':
      return { state: { ...state, settingsIndex: (state.settingsIndex + 1) % n }, effects: [] };
    case 'left':
      return { state, effects: [{ type: 'setting', index: state.settingsIndex, delta: -1 }] };
    case 'right':
    case 'ok':
      return { state, effects: [{ type: 'setting', index: state.settingsIndex, delta: 1 }] };
    case 'back':
    case 'menu':
      return { state: { ...state, layer: 'bar' }, effects: [] };
    default:
      return { state, effects: [] };
  }
}
