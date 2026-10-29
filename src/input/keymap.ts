/**
 * Correspondance entre les touches (clavier, télécommande Fire TV via la
 * WebView, touches multimédias) et les actions de navigation.
 *
 * Sur Fire TV, la WebView traduit le pavé directionnel en touches fléchées et
 * le bouton central en « Enter ». Les touches Retour, Menu et multimédias
 * sont interceptées par l'activité Android, puis transmises explicitement
 * (voir src/platform/android.ts), car la WebView ne les relaie pas toutes.
 */

import type { Action } from './navigation';

const BY_KEY: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
  Enter: 'ok',
  NumpadEnter: 'ok',
  Select: 'ok',
  Escape: 'back',
  Esc: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
  ContextMenu: 'menu',
  Menu: 'menu',
  m: 'menu',
  M: 'menu',
  ' ': 'playPause',
  Spacebar: 'playPause',
  k: 'playPause',
  K: 'playPause',
  MediaPlayPause: 'playPause',
  MediaPlay: 'playPause',
  MediaPause: 'playPause',
  MediaRewind: 'rewind',
  MediaTrackPrevious: 'rewind',
  MediaFastForward: 'fastForward',
  MediaTrackNext: 'fastForward',
  PageDown: 'rewind',
  PageUp: 'fastForward',
  '-': 'rewind',
  _: 'rewind',
  '+': 'fastForward',
  '=': 'fastForward',
};

/** Codes historiques (keyCode) utilisés par certaines WebView anciennes. */
const BY_KEY_CODE: Record<number, Action> = {
  38: 'up',
  40: 'down',
  37: 'left',
  39: 'right',
  13: 'ok',
  23: 'ok', // KEYCODE_DPAD_CENTER
  27: 'back',
  8: 'back',
  4: 'back', // KEYCODE_BACK
  82: 'menu', // KEYCODE_MENU
  93: 'menu',
  179: 'playPause',
  85: 'playPause', // KEYCODE_MEDIA_PLAY_PAUSE
  227: 'rewind',
  89: 'rewind', // KEYCODE_MEDIA_REWIND
  228: 'fastForward',
  90: 'fastForward', // KEYCODE_MEDIA_FAST_FORWARD
};

export function actionFromKey(key: string | undefined, keyCode?: number): Action | null {
  if (key && key in BY_KEY) return BY_KEY[key];
  if (keyCode !== undefined && keyCode in BY_KEY_CODE) return BY_KEY_CODE[keyCode];
  return null;
}

/** Noms d'actions acceptés par le pont Android. */
export function actionFromBridgeName(name: string): Action | null {
  const valid: Action[] = ['up', 'down', 'left', 'right', 'ok', 'back', 'menu', 'playPause', 'rewind', 'fastForward'];
  return (valid as string[]).includes(name) ? (name as Action) : null;
}
