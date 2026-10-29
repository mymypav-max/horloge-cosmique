/**
 * Accès ciblé aux fonctions SGP4 de satellite.js 7.1.0 (licence MIT).
 *
 * Le point d'entrée du paquet réexporte aussi un module WebAssembly
 * (propagation parallèle par lots) qui crée des « workers » : il est inutile
 * ici, alourdirait l'application et n'est pas compatible avec les WebView
 * anciennes. On importe donc directement les fichiers JavaScript du
 * propagateur (sans dépendance au module WebAssembly). La fonction
 * `propagate` n'est pas utilisée : elle emploie Array.prototype.at, absent
 * des WebView Chromium antérieures à la version 92 ; on appelle `sgp4` avec
 * le temps écoulé depuis l'époque des éléments.
 */

export { json2satrec, twoline2satrec } from '../../node_modules/satellite.js/dist/io.js';
export { sgp4 } from '../../node_modules/satellite.js/dist/propagation/sgp4.js';
export { gstime } from '../../node_modules/satellite.js/dist/propagation/gstime.js';
export { eciToGeodetic } from '../../node_modules/satellite.js/dist/transforms.js';
export type { OMMJsonObject } from '../../node_modules/satellite.js/dist/common-types.js';
export type { SatRec } from '../../node_modules/satellite.js/dist/propagation/SatRec.js';
