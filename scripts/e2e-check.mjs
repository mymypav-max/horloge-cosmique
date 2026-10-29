#!/usr/bin/env node
/**
 * Vérification de bout en bout dans un vrai navigateur (Chromium, WebGL).
 *
 * Prérequis : `npm run build`, puis `npx playwright install chromium` (une
 * fois). Usage : `npm run test:e2e` (options : --headed, --keep).
 *
 * Contrôles effectués :
 *  1. démarrage sans erreur JavaScript, image non vide ;
 *  2. navigation à la télécommande (sélection, vue rapprochée, retour) ;
 *  3. cohérence du terminateur RENDU : la luminosité des pixels du globe
 *     correspond au jour / à la nuit calculés par le modèle astronomique ;
 *  4. un changement d'heure déplace réellement le terminateur à l'écran ;
 *  5. indication explicite du mode simulation ;
 *  6. fonctionnement sous l'origine locale de l'APK Android
 *     (https://appassets.androidplatform.net, mêmes types MIME que
 *     LocalAssetWebViewClient.java, tout autre hôte bloqué) et pont Android
 *     simulé (touche Retour, sortie, mise en arrière-plan).
 * Les captures sont enregistrées dans test-results/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'test-results');
mkdirSync(outDir, { recursive: true });
const headed = process.argv.includes('--headed');

/** Décodeur PNG minimal (8 bits RGB/RGBA, non entrelacé : format des captures Chromium). */
function decodePng(buffer) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return {
    width,
    height,
    luminance(x, y, r = 2) {
      let sum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const px = Math.round(x) + dx;
          const py = Math.round(y) + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          const k = py * stride + px * channels;
          sum += 0.2126 * out[k] + 0.7152 * out[k + 1] + 0.0722 * out[k + 2];
          n++;
        }
      }
      return n ? sum / n : 0;
    },
  };
}

/** Copie de LocalAssetWebViewClient.mimeType (Java). */
function androidMimeType(path) {
  const p = path.toLowerCase();
  if (p.endsWith('.html')) return 'text/html';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'text/javascript';
  if (p.endsWith('.css')) return 'text/css';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.woff2')) return 'font/woff2';
  if (p.endsWith('.woff')) return 'font/woff';
  if (p.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

const results = [];
function check(name, ok, details = '') {
  results.push({ name, ok, details });
  console.log(`${ok ? '✔' : '✘'} ${name}${details ? ` — ${details}` : ''}`);
}

const server = await preview({ root, preview: { port: 4179, strictPort: false, open: false }, logLevel: 'silent' });
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function openPage(query) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${baseUrl}?debug=1${query}`);
  await page.waitForFunction(() => !!window.__horlogeCosmique, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return { page, errors };
}

const api = (page, fn, arg) => page.evaluate(([f, a]) => window.__horlogeCosmique[f](...(a ?? [])), [fn, arg]);

/**
 * Compare la luminosité rendue du globe au jour/nuit calculé.
 * Critère : AUC = probabilité qu'un point « jour » (Soleil à plus de 15° au-dessus
 * de l'horizon) soit plus lumineux qu'un point « nuit » (Soleil à plus de 15°
 * sous l'horizon). 1 = séparation parfaite, 0,5 = aucun lien.
 */
async function terminatorCheck(page, label) {
  const png = decodePng(await page.screenshot({ path: resolve(outDir, `${label}.png`) }));
  const day = [];
  const night = [];
  for (let lat = -70; lat <= 70; lat += 5) {
    for (let lon = -180; lon < 180; lon += 5) {
      const p = await api(page, 'projectGeo', [lat, lon]);
      if (p.facing < 0.3) continue;
      const lum = png.luminance(p.x, p.y);
      if (p.sunCos > 0.26) day.push({ lat, lon, lum, p });
      else if (p.sunCos < -0.26) night.push({ lat, lon, lum, p });
    }
  }
  let wins = 0;
  for (const d of day) for (const n of night) wins += d.lum > n.lum ? 1 : d.lum === n.lum ? 0.5 : 0;
  const auc = wins / Math.max(1, day.length * night.length);
  const mean = (a) => a.reduce((s, v) => s + v.lum, 0) / Math.max(1, a.length);
  return { day, night, png, dayMean: mean(day), nightMean: mean(night), auc };
}

/** Centre la caméra sur le terminateur (équateur, 90° à l'est du point subsolaire). */
async function lookAtTerminator(page) {
  const s = await api(page, 'state');
  await api(page, 'centerOn', [0, s.subsolar.lonDeg + 90, 3.4]);
  await page.waitForTimeout(2200);
}

try {
  // 1. Démarrage, vue générale.
  {
    const { page, errors } = await openPage('');
    const png = decodePng(await page.screenshot({ path: resolve(outDir, 'vue-generale.png') }));
    let bright = 0;
    for (let y = 0; y < png.height; y += 20) for (let x = 0; x < png.width; x += 20) if (png.luminance(x, y, 0) > 40) bright++;
    check('démarrage sans erreur JavaScript', errors.length === 0, errors.join(' | '));
    check('la scène est réellement dessinée', bright > 50, `${bright} points lumineux échantillonnés`);
    const state = await api(page, 'state');
    check('8 planètes positionnées', Object.keys(state.planetPositions).length === 8);
    check('temps réel par défaut', state.time.isRealTime === true);

    // 2. Navigation.
    await page.keyboard.press('ArrowRight');
    let s = await api(page, 'state');
    check('flèche droite : Mars sélectionnée', s.nav.focused === 'mars', s.nav.focused);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2600);
    s = await api(page, 'state');
    check('OK : vue rapprochée de la Terre', s.nav.view === 'detail' && s.cameraMode === 'detail', `${s.nav.view}/${s.cameraMode}`);
    await page.screenshot({ path: resolve(outDir, 'vue-terre.png') });
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowRight');
    const quatBefore = s.earthQuaternion;
    s = await api(page, 'state');
    check(
      'pivoter la caméra ne fait pas tourner le globe',
      // En temps réel, la Terre tourne de ~0,004° par seconde : quaternions quasi identiques.
      quatBefore.every((v, k) => Math.abs(v - s.earthQuaternion[k]) < 1e-3),
    );
    await page.keyboard.press('Enter');
    s = await api(page, 'state');
    check('OK en vue rapprochée : barre d’actions', s.nav.layer === 'bar');
    await page.keyboard.press('Enter'); // Régions
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter'); // France
    await page.waitForTimeout(2000);
    s = await api(page, 'state');
    check('région sélectionnée et centrée', s.nav.layer === 'scene');
    await page.screenshot({ path: resolve(outDir, 'region-france.png') });
    await page.keyboard.press('Escape');
    // Le rendu logiciel est lent : on laisse à la transition (1,7 s) une marge confortable.
    await page.waitForTimeout(4000);
    s = await api(page, 'state');
    check('Retour : vue générale', s.nav.view === 'overview' && s.cameraMode === 'overview', `${s.nav.view}/${s.cameraMode}`);
    check('aucune erreur pendant la navigation', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 3–5. Terminateur au solstice de juin 2024 puis 6 h plus tard.
  {
    const t0 = Date.parse('2024-06-20T20:51:00Z');
    const { page, errors } = await openPage(`&t=2024-06-20T20:51:00Z&vue=terre`);
    await page.waitForTimeout(2600);
    // Éclairage solaire seul : nuages et lumières urbaines désactivés.
    await api(page, 'setClouds', [false]);
    await api(page, 'setCityLights', [0]);
    await lookAtTerminator(page);
    const a = await terminatorCheck(page, 'terminateur-solstice');
    check(
      'jour/nuit rendus conformes au calcul (solstice)',
      a.auc > 0.98 && a.dayMean > 3 * a.nightMean && a.day.length > 20 && a.night.length > 20,
      `AUC ${a.auc.toFixed(3)}, luminosité jour ${a.dayMean.toFixed(0)} / nuit ${a.nightMean.toFixed(0)} (${a.day.length} / ${a.night.length} points)`,
    );
    // Les lumières urbaines ne doivent rien changer côté jour.
    await api(page, 'setCityLights', [1.1]);
    await page.waitForTimeout(600);
    const lit = decodePng(await page.screenshot({ path: resolve(outDir, 'terminateur-solstice-lumieres.png') }));
    const dayDelta = a.day.reduce((m, d) => Math.max(m, Math.abs(lit.luminance(d.p.x, d.p.y) - d.lum)), 0);
    const nightGain = a.night.reduce((s, n) => s + (lit.luminance(n.p.x, n.p.y) - n.lum), 0) / Math.max(1, a.night.length);
    check(
      'les lumières urbaines n’éclairent pas le côté jour',
      dayDelta < 1.5,
      `écart maximal côté jour ${dayDelta.toFixed(2)} niveau(x), gain moyen côté nuit ${nightGain.toFixed(2)}`,
    );
    await api(page, 'setCityLights', [0]);
    const s0 = await api(page, 'state');
    await api(page, 'jumpTo', [t0 + 6 * 3_600_000, true]);
    await page.waitForTimeout(800);
    const s1 = await api(page, 'state');
    const dLon = ((s1.subsolar.lonDeg - s0.subsolar.lonDeg + 540) % 360) - 180;
    check('6 h plus tard, le point subsolaire a reculé de 90° vers l’ouest', Math.abs(dLon + 90) < 1, `${dLon.toFixed(2)}°`);
    // Caméra immobile (inertielle) : le globe a tourné, le terminateur rendu doit avoir suivi.
    const b = await terminatorCheck(page, 'terminateur-plus-6h');
    check(
      'le terminateur rendu a suivi le changement d’heure',
      b.auc > 0.98 && b.day.length > 20 && b.night.length > 20,
      `AUC ${b.auc.toFixed(3)} (${b.day.length} / ${b.night.length} points)`,
    );
    const badge = await page.textContent('.clock__badge');
    check('mode simulation signalé à l’écran', /Simulation/.test(badge ?? ''), badge ?? '');
    check('aucune erreur (terminateur)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 6. Environnement de l'APK Android simulé.
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    const missing = [];
    const external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.addInitScript(() => {
      window.__bridgeCalls = [];
      window.AndroidBridge = { exitApp: () => window.__bridgeCalls.push('exitApp') };
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol !== 'https:' || url.host !== 'appassets.androidplatform.net') {
        external.push(url.href);
        return route.abort();
      }
      const path = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = resolve(root, `dist${path}`);
      if (!existsSync(file)) {
        missing.push(path);
        return route.fulfill({ status: 404, body: '' });
      }
      return route.fulfill({ status: 200, contentType: androidMimeType(path), body: readFileSync(file) });
    });
    await page.goto('https://appassets.androidplatform.net/index.html?debug=1');
    await page.waitForFunction(() => !!window.__horlogeCosmique, null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    check(
      'chargement depuis l’origine locale de l’APK, sans aucun accès externe',
      missing.length === 0 && external.length === 0 && errors.length === 0,
      `fichiers manquants : ${missing.length}, requêtes externes : ${external.length}, erreurs : ${errors.join(' | ')}`,
    );
    const r1 = await page.evaluate(() => window.HorlogeCosmique.key('back'));
    const r2 = await page.evaluate(() => window.HorlogeCosmique.key('back'));
    const calls = await page.evaluate(() => window.__bridgeCalls);
    check('Retour ×2 en vue générale : sortie demandée à Android', r1 === 'ok' && r2 === 'ok' && calls.includes('exitApp'));
    await page.evaluate(() => window.HorlogeCosmique.key('menu'));
    let s = await api(page, 'state');
    check('touche Menu relayée : barre d’actions ouverte', s.nav.layer === 'bar');
    await page.evaluate(() => window.HorlogeCosmique.key('back'));
    await page.evaluate(() => window.HorlogeCosmique.lifecycle('pause'));
    const paused = await api(page, 'state');
    await page.evaluate(() => window.HorlogeCosmique.lifecycle('resume'));
    await page.waitForTimeout(1500);
    s = await api(page, 'state');
    check(
      'mise en arrière-plan : rendu suspendu puis repris',
      paused.rendering === false && s.rendering === true && errors.length === 0,
      `en pause : ${paused.rendering ? 'rendu actif' : 'rendu arrêté'} ; après reprise : ${s.rendering ? 'rendu actif' : 'rendu arrêté'}`,
    );
    await page.close();
  }

  // Cadence observée (rendu logiciel SwiftShader : NON représentatif d'un Fire TV).
  {
    const { page } = await openPage('&vitesse=86400');
    await page.waitForTimeout(5000);
    const s = await api(page, 'state');
    results.push({ name: 'cadence en rendu logiciel (indicatif)', ok: true, details: `${s.fps.toFixed(1)} i/s, qualité ${s.quality}` });
    console.log(`ℹ cadence en rendu logiciel (indicatif) : ${s.fps.toFixed(1)} i/s, qualité ${s.quality}`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

writeFileSync(resolve(outDir, 'e2e-results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} contrôles réussis.`);
process.exit(failed.length ? 1 : 0);
