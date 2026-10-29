#!/usr/bin/env node
/**
 * Convertit le catalogue d'étoiles de d3-celestial (stars.6.json, données
 * XHIP / Hipparcos, magnitude ≤ 6) en un fichier compact embarqué :
 * src/data/stars.json = [[ascension droite °, déclinaison °, magnitude, B−V], …]
 *
 * Usage : node scripts/build-stars.mjs [chemin/vers/stars.6.json]
 * (défaut : .texture-sources/stars.6.json, voir fetch-texture-sources.sh)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] ?? resolve(root, '.texture-sources/stars.6.json');
const output = resolve(root, 'src/data/stars.json');

const catalog = JSON.parse(readFileSync(input, 'utf8'));
const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

const stars = [];
for (const f of catalog.features) {
  const [lon, lat] = f.geometry.coordinates;
  const mag = Number(f.properties.mag);
  const bv = Number.parseFloat(f.properties.bv);
  if (!Number.isFinite(mag)) continue;
  // d3-celestial stocke l'ascension droite comme une longitude dans [−180, 180].
  const ra = (lon + 360) % 360;
  stars.push([round(ra, 3), round(lat, 3), round(mag, 2), Number.isFinite(bv) ? round(bv, 2) : 0.6, f.id]);
}
stars.sort((a, b) => a[2] - b[2]);

// Contrôle de cohérence sur des étoiles connues (numéros Hipparcos).
const known = {
  32349: ['Sirius', 101.287, -16.716],
  11767: ['Polaris', 37.955, 89.264],
  27989: ['Bételgeuse', 88.793, 7.407],
  91262: ['Véga', 279.235, 38.784],
};
for (const [hip, [name, ra, dec]] of Object.entries(known)) {
  const s = stars.find((x) => x[4] === Number(hip));
  if (!s || Math.abs(s[0] - ra) > 0.05 || Math.abs(s[1] - dec) > 0.05) {
    throw new Error(`Position inattendue pour ${name} : ${JSON.stringify(s)}`);
  }
}

const compact = stars.map((s) => s.slice(0, 4));
writeFileSync(output, `${JSON.stringify(compact)}\n`);
console.log(`${compact.length} étoiles écrites dans ${output}`);
