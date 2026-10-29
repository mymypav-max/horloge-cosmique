#!/usr/bin/env node
/**
 * Génère l'icône (mipmap) et la bannière Fire TV (drawable-xhdpi, 320 × 180)
 * de l'application Android à partir d'un dessin vectoriel, avec Chromium
 * (Playwright). Usage : npm run assets:icons
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const res = resolve(root, 'android/app/src/main/res');
// Police intégrée en data URL (une page générée ne peut pas lire file://).
const fontData = readFileSync(resolve(root, 'node_modules/@fontsource/jost/files/jost-latin-300-normal.woff2')).toString('base64');
const font = `data:font/woff2;base64,${fontData}`;

/** Petit système solaire stylisé (coordonnées 0–100). */
const emblem = `
  <defs>
    <radialGradient id="sun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff4c9"/>
      <stop offset="45%" stop-color="#ffc35c"/>
      <stop offset="100%" stop-color="#f07d1c"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffcf7a" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffcf7a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="earth" cx="35%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#9fd3ff"/>
      <stop offset="55%" stop-color="#2f6db5"/>
      <stop offset="100%" stop-color="#0b2246"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="30" fill="url(#glow)"/>
  <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="#9fc2ff" stroke-opacity="0.55" stroke-width="1.2" transform="rotate(-14 50 50)"/>
  <ellipse cx="50" cy="50" rx="27" ry="10" fill="none" stroke="#9fc2ff" stroke-opacity="0.35" stroke-width="0.9" transform="rotate(-14 50 50)"/>
  <circle cx="50" cy="50" r="11.5" fill="url(#sun)"/>
  <circle cx="86.5" cy="40.5" r="5.2" fill="url(#earth)"/>
  <circle cx="26" cy="59" r="2.6" fill="#d6a46b"/>
  <g fill="#ffffff">
    <circle cx="14" cy="17" r="0.7" opacity="0.8"/><circle cx="80" cy="14" r="0.6" opacity="0.7"/>
    <circle cx="90" cy="80" r="0.7" opacity="0.6"/><circle cx="22" cy="86" r="0.5" opacity="0.7"/>
    <circle cx="64" cy="88" r="0.5" opacity="0.5"/><circle cx="38" cy="9" r="0.5" opacity="0.6"/>
  </g>`;

const page = (body, w, h) => `<!doctype html><html><head><style>
  @font-face { font-family: Jost; src: url('${font}') format('woff2'); font-weight: 300; }
  html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
  body { background: radial-gradient(ellipse at 40% 45%, #13224a 0%, #050a1a 60%, #02040b 100%); }
</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
const tab = await browser.newPage();

async function render(html, w, h, file) {
  mkdirSync(dirname(file), { recursive: true });
  await tab.setViewportSize({ width: w, height: h });
  await tab.setContent(html, { waitUntil: 'load' });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: file, omitBackground: false });
  console.log(`${file.replace(`${root}/`, '')} (${w}×${h})`);
}

const icons = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(icons)) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${emblem}</svg>`;
  await render(page(svg, size, size), size, size, resolve(res, `mipmap-${density}/ic_launcher.png`));
}

const banner = `
  <div style="display:flex;align-items:center;height:180px;padding:0 14px;box-sizing:border-box">
    <svg width="132" height="132" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${emblem}</svg>
    <div style="font-family:Jost;font-weight:300;color:#eef3ff;margin-left:8px;line-height:1.02;letter-spacing:1.5px">
      <div style="font-size:31px">Horloge</div>
      <div style="font-size:31px">Cosmique</div>
    </div>
  </div>`;
await render(page(banner, 320, 180), 320, 180, resolve(res, 'drawable-xhdpi/banner.png'));

await browser.close();
