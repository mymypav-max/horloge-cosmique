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
 *     simulé (touche Retour, sortie, mise en arrière-plan) ;
 *  7. (V2) lunes : liste par planète, aucune pour Mercure et Vénus, vue
 *     d'une lune avec sa planète visible derrière, retour à la planète ;
 *  8. (V2) ISS : présente dans la vue de la Terre seulement, sélection,
 *     Terre visible derrière, suivi du temps (pause, accélération), règle
 *     de validité (prévision NASA, extrapolation 7 jours, puis ISS masquée
 *     avec indication de mise à jour), y compris quand le temps accéléré
 *     franchit la limite ;
 *  9. (V2) taille apparente du Soleil dans les vues rapprochées (Terre,
 *     Neptune), vue générale inchangée, vue « Soleil ».
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

  // 7. Lunes (V2).
  {
    const T = '&t=2026-10-29T18:00:00Z';
    const { page, errors } = await openPage(`${T}&vue=mercure`);
    await page.waitForTimeout(2600);
    await page.keyboard.press('Enter');
    let items = await page.$$eval('.bar__item', (n) => n.map((e) => e.dataset.item));
    check('Mercure : aucune entrée « Satellites »', !items.includes('satellites') && items.includes('sun'), items.join(','));
    await page.close();

    const venus = await openPage(`${T}&vue=venus`);
    await venus.page.waitForTimeout(2600);
    await venus.page.keyboard.press('Enter');
    items = await venus.page.$$eval('.bar__item', (n) => n.map((e) => e.dataset.item));
    check('Vénus : aucune entrée « Satellites »', !items.includes('satellites'), items.join(','));
    await venus.page.close();

    const jup = await openPage(`${T}&vue=jupiter`);
    const p = jup.page;
    await p.waitForTimeout(2600);
    let s = await api(p, 'state');
    check(
      'Jupiter : 4 lunes placées autour de la planète',
      ['io', 'europa', 'ganymede', 'callisto'].every((id) => s.satelliteLayouts[id]),
      Object.keys(s.satelliteLayouts).join(','),
    );
    await p.keyboard.press('Enter'); // barre (1re entrée : Satellites)
    await p.keyboard.press('Enter'); // liste
    const names = await p.$$eval('.satellites .panel__item', (n) => n.map((e) => e.textContent));
    check('liste des lunes de Jupiter', names.join(',') === 'Io,Europe,Ganymède,Callisto', names.join(','));
    await p.keyboard.press('Enter'); // Io
    await p.waitForTimeout(3500);
    s = await api(p, 'state');
    const io = s.satelliteLayouts.io;
    const jupiter = s.planetPositions.jupiter;
    check('OK : vue d’Io', s.satellite === 'io' && s.cameraMode === 'satellite' && s.title === 'Io', `${s.cameraMode} ${s.title}`);
    check(
      'fiche d’Io en français (diamètre, distance, période, inclinaison)',
      ['Diamètre', 'Distance à Jupiter', 'Période orbitale', 'Inclinaison', 'Sens du mouvement'].every((l) => s.info.some((r) => r.startsWith(l))),
      s.info.join(' | '),
    );
    const camToJupiter = Math.hypot(...s.cameraPosition.map((v, k) => v - jupiter[k]));
    const coverage = await api(p, 'sphereCoverage', [...jupiter, 0.92]);
    check('Jupiter visible derrière Io, caméra hors de la planète', coverage > 0.05 && camToJupiter > 0.92, `Jupiter couvre ${(coverage * 100).toFixed(1)} % de l’image`);
    const ioCover = await api(p, 'sphereCoverage', [...io.position, io.radius]);
    check('Io cadrée au centre de l’image', ioCover > 0.08, `Io couvre ${(ioCover * 100).toFixed(1)} % de l’image`);
    await p.screenshot({ path: resolve(outDir, 'v2-io.png') });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(3500);
    s = await api(p, 'state');
    check('Retour : retour à Jupiter', s.satellite === null && s.cameraMode === 'detail' && s.nav.detail === 'jupiter', `${s.cameraMode}`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(4000);
    s = await api(p, 'state');
    check('Retour : vue générale, sans lune affichée', s.cameraMode === 'overview' && Object.keys(s.satelliteLayouts).length === 0);
    check('aucune erreur (lunes)', errors.length === 0 && jup.errors.length === 0, [...errors, ...jup.errors].join(' | '));
    await p.close();

    const sat = await openPage(`${T}&vue=saturne&satellite=titan`);
    await sat.page.waitForTimeout(6500);
    s = await api(sat.page, 'state');
    check('Saturne : 7 lunes, vue de Titan par l’adresse', Object.keys(s.satelliteLayouts).length === 7 && s.satellite === 'titan', Object.keys(s.satelliteLayouts).join(','));
    await sat.page.screenshot({ path: resolve(outDir, 'v2-titan.png') });
    const moon = await openPage(`${T}&vue=terre&satellite=lune`);
    await moon.page.waitForTimeout(6500);
    s = await api(moon.page, 'state');
    const earthCover = await api(moon.page, 'sphereCoverage', [...s.planetPositions.earth, 0.45]);
    check('vue de la Lune : Terre visible derrière', s.satellite === 'moon' && earthCover > 0.02, `Terre ${(earthCover * 100).toFixed(1)} % de l’image`);
    await moon.page.screenshot({ path: resolve(outDir, 'v2-lune.png') });
    check('aucune erreur (Titan, Lune)', sat.errors.length === 0 && moon.errors.length === 0, [...sat.errors, ...moon.errors].join(' | '));
    await sat.page.close();
    await moon.page.close();
  }

  // 8. ISS (V2).
  {
    const { page, errors } = await openPage('&t=2026-10-29T18:00:00Z&vue=terre');
    await page.waitForTimeout(2600);
    let s = await api(page, 'state');
    check('ISS affichée dans la vue de la Terre', s.issShown === true && !!s.satelliteLayouts.iss);
    const list = await api(page, 'satellitesFor', ['earth']);
    const listJupiter = await api(page, 'satellitesFor', ['jupiter']);
    check('ISS proposée pour la Terre seulement', list.includes('iss') && !listJupiter.includes('iss'), list.join(','));
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight'); // Satellites (après Régions)
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown'); // ISS
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3500);
    s = await api(page, 'state');
    check('sélection de l’ISS', s.satellite === 'iss' && s.cameraMode === 'satellite', `${s.satellite} ${s.cameraMode}`);
    check(
      'fiche de l’ISS : altitude, vitesse, période, inclinaison, époque, validité',
      ['Altitude calculée', 'Vitesse', 'Période orbitale', 'Inclinaison', 'Éléments', 'Validité'].every((l) => s.info.some((r) => r.startsWith(l))) &&
        s.info.some((r) => r.includes('Prévision NASA du')),
      s.info.join(' | '),
    );
    const earthCover = await api(page, 'sphereCoverage', [...s.planetPositions.earth, 0.45]);
    check('Terre visible derrière l’ISS', earthCover > 0.1, `${(earthCover * 100).toFixed(1)} % de l’image`);
    await page.screenshot({ path: resolve(outDir, 'v2-iss.png') });
    // Pause : position figée ; accélération : la station avance.
    const a = (await api(page, 'state')).satelliteLayouts.iss.position;
    await page.waitForTimeout(1000);
    const b = (await api(page, 'state')).satelliteLayouts.iss.position;
    const paused = Math.hypot(...a.map((v, k) => v - b[k]));
    await page.keyboard.press(' '); // reprise
    await page.keyboard.press('Enter');
    for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter'); // Accélérer
    await page.keyboard.press('Escape');
    const c = (await api(page, 'state')).satelliteLayouts.iss.position;
    await page.waitForTimeout(1000);
    const d = (await api(page, 'state')).satelliteLayouts.iss.position;
    const moving = Math.hypot(...c.map((v, k) => v - d[k]));
    check('ISS : immobile en pause, en mouvement quand le temps avance', paused === 0 && moving > 0, `pause ${paused}, en marche ${moving.toExponential(2)}`);
    // Règle de validité : prévision NASA (nominal) → extrapolation (7 jours) → ISS masquée, données à actualiser.
    const STOP = Date.parse('2026-11-12T12:00:00Z');
    const DAY = 86_400_000;
    const panel = () =>
      page.evaluate(() => ({
        items: Array.from(document.querySelectorAll('.satellites .panel__item')).map((e) => e.textContent),
        note: document.querySelector('.satellites .panel__note')?.hidden ? '' : document.querySelector('.satellites .panel__note')?.textContent ?? '',
        toast: document.querySelector('.toast.is-visible')?.textContent ?? '',
      }));
    check('fiche (instant nominal) : « Prévision NASA du 28 octobre 2026 »', s.info.some((r) => r === 'ValiditéPrévision NASA du 28 octobre 2026'), s.info.join(' | '));
    await api(page, 'jumpTo', [STOP, true]);
    await page.waitForTimeout(1500);
    s = await api(page, 'state');
    check(
      'dernier instant nominal (12 nov. 12:00 UTC) : ISS affichée, prévision NASA',
      s.issShown && s.satellite === 'iss' && s.info.some((r) => r.includes('Prévision NASA du 28 octobre 2026')),
      s.info.join(' | '),
    );
    await api(page, 'jumpTo', [STOP + 60_000, true]);
    await page.waitForTimeout(1500);
    s = await api(page, 'state');
    let pnl = await panel();
    check(
      'première minute après expiration : statut « Extrapolation », ISS toujours affichée',
      s.issShown && s.satellite === 'iss' && s.info.some((r) => r === 'ValiditéExtrapolation') && s.info.some((r) => r.startsWith('Prévision expirée depuis')),
      s.info.join(' | '),
    );
    check('liste des satellites : ISS marquée « Extrapolation »', pnl.items.some((t) => t.includes('ISS') && t.includes('Extrapolation')), pnl.items.join(','));
    await page.screenshot({ path: resolve(outDir, 'v2-iss-extrapolation.png') });
    await api(page, 'jumpTo', [STOP + 7 * DAY - 60_000, true]);
    await page.waitForTimeout(1500);
    s = await api(page, 'state');
    check('dernier jour d’extrapolation (19 nov. 11:59 UTC) : ISS affichée', s.issShown && s.satellite === 'iss', `${s.cameraMode}`);
    // En pause, l'ISS reste affichée ; en accélérant (×3 600), le temps franchit la limite et l'ISS disparaît d'elle-même.
    await page.waitForTimeout(1500);
    s = await api(page, 'state');
    check('en pause juste avant la limite : ISS toujours affichée', s.issShown && s.satellite === 'iss');
    await api(page, 'jumpTo', [STOP + 7 * DAY - 60_000, false]);
    await api(page, 'setRate', [3600]);
    await page.waitForTimeout(1500); // 1,5 s à ×3 600 : 1 h 30 simulées, la limite est franchie après 1 min ; le message dure 2,8 s.
    s = await api(page, 'state');
    pnl = await panel();
    check(
      'accélération au-delà du 7e jour : ISS masquée, vue de l’ISS fermée, message',
      s.issShown === false && s.satellite === null && s.time.simMs > STOP + 7 * DAY && pnl.toast.includes('à actualiser'),
      `${s.cameraMode}, ${new Date(s.time.simMs).toISOString()}, message « ${pnl.toast} »`,
    );
    await page.waitForTimeout(3500); // fin de la transition de la caméra vers la Terre
    s = await api(page, 'state');
    check('… puis retour à la vue de la Terre', s.cameraMode === 'detail' && s.nav.detail === 'earth' && s.issShown === false, s.cameraMode);
    await api(page, 'setRate', [1]);
    await api(page, 'jumpTo', [STOP + 7 * DAY + 60_000, true]);
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight'); // Satellites (après Régions)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    pnl = await panel();
    const listAfter = await api(page, 'satellitesFor', ['earth']);
    check(
      'première minute après la limite (19 nov. 12:01) : ISS absente de la liste, indication « données à actualiser »',
      !listAfter.includes('iss') && pnl.items.join(',') === 'Lune' && pnl.note.includes('doivent être actualisées'),
      `liste ${pnl.items.join(',')} — « ${pnl.note} »`,
    );
    await page.screenshot({ path: resolve(outDir, 'v2-iss-masquee.png') });
    // Changement de date pendant que la liste est ouverte : elle se met à jour aussitôt.
    await api(page, 'jumpTo', [STOP - DAY, true]);
    await page.waitForTimeout(800);
    pnl = await panel();
    check('retour dans la période nominale : ISS de nouveau proposée', pnl.items.some((t) => t.startsWith('ISS')) && pnl.note === '', pnl.items.join(','));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    for (const [label, ms, expected] of [
      ['avant le lancement (1990)', Date.UTC(1990, 0, 1), 'pas encore en orbite'],
      ['après la dernière période autorisée (12 déc. 2026, ancien seuil de 30 jours)', Date.UTC(2026, 11, 12, 12), 'doivent être actualisées'],
      ['2030', Date.UTC(2030, 0, 1), 'doivent être actualisées'],
    ]) {
      await api(page, 'jumpTo', [ms, true]);
      await page.waitForTimeout(600);
      s = await api(page, 'state');
      const l = await api(page, 'satellitesFor', ['earth']);
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      pnl = await panel();
      check(`${label} : pas d’ISS, explication affichée`, !l.includes('iss') && s.issShown === false && pnl.note.includes(expected), `« ${pnl.note} »`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    }
    check('aucune erreur (ISS)', errors.length === 0, errors.join(' | '));
    await page.close();
  }

  // 9. Taille apparente du Soleil (V2).
  {
    const { page, errors } = await openPage('&t=2026-10-29T18:00:00Z');
    let s = await api(page, 'state');
    check('vue générale : taille du Soleil inchangée', Math.abs(s.sunRadius - 1.35) < 1e-9, `${s.sunRadius}`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3200);
    s = await api(page, 'state');
    const dEarth = Math.hypot(...s.cameraPosition);
    const thetaEarth = (2 * Math.asin(s.sunRadius / dEarth) * 180) / Math.PI;
    check('vue de la Terre : Soleil de 0,53° à 0,55°', thetaEarth > 0.53 && thetaEarth < 0.55, `${thetaEarth.toFixed(4)}°`);
    // Vue « Soleil » : le Soleil apparaît à gauche du globe, dans l'image.
    await page.keyboard.press('Enter');
    for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2600);
    const sun = await api(page, 'projectScene', [0, 0, 0]);
    const png = decodePng(await page.screenshot({ path: resolve(outDir, 'v2-soleil-terre.png') }));
    check(
      'vue « Soleil » : Soleil visible à gauche de la Terre',
      sun.z < 1 && sun.x > 0 && sun.x < png.width / 2 && png.luminance(sun.x, sun.y, 1) > 180,
      `x = ${sun.x.toFixed(0)} px, luminosité ${png.luminance(sun.x, sun.y, 1).toFixed(0)}`,
    );
    await page.close();
    const nep = await openPage('&t=2026-10-29T18:00:00Z&vue=neptune');
    await nep.page.waitForTimeout(3200);
    s = await api(nep.page, 'state');
    const dNep = Math.hypot(...s.cameraPosition);
    const thetaNep = (2 * Math.asin(s.sunRadius / dNep) * 180) / Math.PI;
    check('vue de Neptune : Soleil d’environ 0,018°', thetaNep > 0.017 && thetaNep < 0.0185, `${thetaNep.toFixed(5)}°`);
    check('aucune erreur (Soleil)', errors.length === 0 && nep.errors.length === 0, [...errors, ...nep.errors].join(' | '));
    await nep.page.close();
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
