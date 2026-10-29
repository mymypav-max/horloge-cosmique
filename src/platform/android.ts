/**
 * Pont avec l'application Android (WebView) du Fire TV.
 *
 * Android → Web : l'activité appelle window.HorlogeCosmique.key(nom) pour les
 * touches que la WebView ne transmet pas d'elle-même (Retour, Menu, touches
 * multimédias), et window.HorlogeCosmique.lifecycle('pause' | 'resume').
 *
 * Web → Android : l'objet AndroidBridge (injecté par addJavascriptInterface)
 * expose exitApp() pour quitter l'application.
 */

import { actionFromBridgeName } from '../input/keymap';
import type { Action } from '../input/navigation';

interface AndroidBridgeApi {
  exitApp(): void;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridgeApi;
    HorlogeCosmique?: {
      key(name: string): string;
      lifecycle(state: string): string;
    };
  }
}

export function isAndroidApp(): boolean {
  return typeof window !== 'undefined' && typeof window.AndroidBridge?.exitApp === 'function';
}

export function exitApp(): void {
  window.AndroidBridge?.exitApp();
}

export function installAndroidBridge(handlers: {
  onAction(action: Action): void;
  onPause(): void;
  onResume(): void;
}): void {
  window.HorlogeCosmique = {
    key(name: string): string {
      const action = actionFromBridgeName(name);
      if (action) handlers.onAction(action);
      return action ? 'ok' : 'unknown';
    },
    lifecycle(state: string): string {
      if (state === 'pause') handlers.onPause();
      else if (state === 'resume') handlers.onResume();
      return 'ok';
    },
  };
}
