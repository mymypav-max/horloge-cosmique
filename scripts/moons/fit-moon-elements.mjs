#!/usr/bin/env node
/**
 * Ajustement des éléments orbitaux moyens des lunes sur les vecteurs d'état
 * JPL Horizons (outil de préparation des données, exécuté une fois ; jamais
 * pendant le fonctionnement de l'application).
 *
 * Source : paquets npm « astraeus-data-<planète> » 0.3.0 (licence MIT), qui
 * distribuent des ajustements de Tchebychev par morceaux des vecteurs d'état
 * produits par l'API JPL Horizons (repère ICRF/EQJ, km, TDB, 2010–2030,
 * erreur d'ajustement inférieure au mètre selon leur index). Ce script relit
 * ces séries (décodeur réécrit ici, format « ACF1 » documenté dans le paquet
 * astraeus), en déduit les positions planétocentriques et ajuste, par
 * moindres carrés (Levenberg-Marquardt), un modèle d'ellipse képlérienne dont
 * le nœud et le périapside tournent uniformément :
 *
 *   λ(t) = λ0 + n·t, ϖ(t) = ϖ0 + ϖ'·t, Ω(t) = Ω0 + Ω'·t, a, e, i constants,
 *
 * dans un plan de référence fixe (pôle = direction moyenne du moment
 * cinétique de l'orbite sur 2010–2030). t est compté en jours TT depuis
 * l'époque 2020-01-01 00:00 TT.
 *
 * Usage :
 *   sh scripts/moons/fetch-horizons-fits.sh <dossier>
 *   node scripts/moons/fit-moon-elements.mjs <dossier> src/data/moonOrbits.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DAY_S = 86_400;
/** Époque des éléments : 2020-01-01 00:00 TT, en secondes TDB depuis J2000 (TDB − TT < 2 ms, négligé). */
const EPOCH_TDB_S = (2_458_849.5 - 2_451_545.0) * DAY_S;
const SPAN_FROM_DAYS = (Date.UTC(2010, 0, 1) - Date.UTC(2020, 0, 1)) / 86_400_000 + 0.01;
const SPAN_TO_DAYS = (Date.UTC(2030, 0, 1) - Date.UTC(2020, 0, 1)) / 86_400_000 - 0.01;

/** Lunes retenues, par planète (identifiants des paquets astraeus). */
const SYSTEMS = {
  mars: ['phobos', 'deimos'],
  jupiter: ['io', 'europa', 'ganymede', 'callisto'],
  saturn: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'],
  uranus: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'],
  neptune: ['triton', 'proteus', 'nereid'],
};

// ------------------------------------------------------------ Décodage

function decodeChunk(bytes, quantumKm) {
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'ACF1') throw new Error('format de bloc inconnu');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segmentCount = view.getUint32(4, true);
  const coefficientCount = view.getUint16(8, true);
  const startTdbS = view.getFloat64(12, true);
  const total = segmentCount * 3 * coefficientCount;
  const coefficients = new Float64Array(total);
  let pos = 20;
  for (let k = 0; k < total; k++) {
    let value = 0;
    let scale = 1;
    let byte;
    do {
      byte = bytes[pos++];
      value += (byte & 0x7f) * scale;
      scale *= 128;
    } while (byte & 0x80);
    coefficients[k] = (value % 2 === 0 ? value / 2 : -(value + 1) / 2) * quantumKm;
  }
  if (pos !== bytes.byteLength) throw new Error('bloc de taille incohérente');
  return { segmentCount, coefficientCount, startTdbS, coefficients };
}

function chebyshev(c, offset, count, x) {
  let b1 = 0;
  let b2 = 0;
  for (let k = count - 1; k >= 1; k--) {
    const b0 = 2 * x * b1 - b2 + c[offset + k];
    b2 = b1;
    b1 = b0;
  }
  return x * b1 - b2 + c[offset];
}

function loadSeries(dir, entry) {
  const chunks = entry.chunks.map((ch) => {
    const decoded = decodeChunk(new Uint8Array(readFileSync(join(dir, ch.path))), entry.fit.quantumKm);
    if (decoded.segmentCount !== ch.segmentCount || decoded.startTdbS !== ch.startTdbS) throw new Error(`bloc ${ch.path} incohérent`);
    return decoded;
  });
  const seg = entry.fit.segmentSeconds;
  return (tdbS) => {
    let lo = 0;
    let hi = chunks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (chunks[mid].startTdbS <= tdbS) lo = mid;
      else hi = mid - 1;
    }
    const ch = chunks[lo];
    const elapsed = (tdbS - ch.startTdbS) / seg;
    if (elapsed < 0 || elapsed > ch.segmentCount) throw new Error('instant hors des séries');
    const s = Math.min(ch.segmentCount - 1, Math.floor(elapsed));
    const x = 2 * (elapsed - s) - 1;
    const n = ch.coefficientCount;
    const o = s * 3 * n;
    return [chebyshev(ch.coefficients, o, n, x), chebyshev(ch.coefficients, o + n, n, x), chebyshev(ch.coefficients, o + 2 * n, n, x)];
  };
}

// --------------------------------------------------------- Vecteurs

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
  const l = norm(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Base du plan de référence : X vers le nœud ascendant du plan sur l'équateur ICRF. */
function referenceBasis(pole) {
  const z = unit(pole);
  const x = unit([-z[1], z[0], 0]);
  return { x, y: cross(z, x), z };
}

function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

// Paramètres : [a, n, k, h, ϖ', q, p, Ω', λ0, αp, δp, A, ν, φ]
// k = e cos ϖ0, h = e sin ϖ0, q = tan(i/2) cos Ω0, p = tan(i/2) sin Ω0 ;
// (αp, δp) : pôle du plan de référence (ICRF) ; A sin(ν t + φ) : libration
// éventuelle de la longitude moyenne (résonances), nulle si A = 0.
const NP = 14;

function poleVector(ra, dec) {
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

function modelPosition(P, t) {
  const [a, n, k, h, wdot, q, p, odot, l0, ra, dec, A, nu, phi] = P;
  const basis = referenceBasis(poleVector(ra, dec));
  const e = Math.min(0.99, Math.hypot(k, h));
  const varpi = Math.atan2(h, k) + wdot * t;
  const node = Math.atan2(p, q) + odot * t;
  const inc = 2 * Math.atan(Math.hypot(p, q));
  const M = l0 + n * t + A * Math.sin(nu * t + phi) - varpi;
  const omega = varpi - node;
  const E = solveKepler(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(node);
  const sO = Math.sin(node);
  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  const xr = (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp;
  const yr = (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp;
  const zr = sw * si * xp + cw * si * yp;
  const { x, y, z } = basis;
  return [x[0] * xr + y[0] * yr + z[0] * zr, x[1] * xr + y[1] * yr + z[1] * zr, x[2] * xr + y[2] * yr + z[2] * zr];
}

// ----------------------------------------------- Moindres carrés (LM)

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) continue;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = Math.abs(M[r][r]) < 1e-300 ? 0 : s / M[r][r];
  }
  return x;
}

function cost(P, samples) {
  let s = 0;
  for (const { t, r } of samples) {
    const m = modelPosition(P, t);
    s += (m[0] - r[0]) ** 2 + (m[1] - r[1]) ** 2 + (m[2] - r[2]) ** 2;
  }
  return s;
}

/** Levenberg-Marquardt (jacobien par différences finies) sur les paramètres libres. */
function levenbergMarquardt(P0, free, samples, scales, iterations = 60) {
  let P = [...P0];
  let c = cost(P, samples);
  let mu = 1e-3;
  const idx = free.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  const m = idx.length;
  for (let it = 0; it < iterations; it++) {
    const JtJ = Array.from({ length: m }, () => new Array(m).fill(0));
    const Jtr = new Array(m).fill(0);
    for (const { t, r } of samples) {
      const base = modelPosition(P, t);
      const res = [base[0] - r[0], base[1] - r[1], base[2] - r[2]];
      const cols = idx.map((j) => {
        const step = scales[j] * 1e-6;
        const Q = [...P];
        Q[j] += step;
        const pm = modelPosition(Q, t);
        return [(pm[0] - base[0]) / step, (pm[1] - base[1]) / step, (pm[2] - base[2]) / step];
      });
      for (let u = 0; u < m; u++) {
        Jtr[u] += cols[u][0] * res[0] + cols[u][1] * res[1] + cols[u][2] * res[2];
        for (let v = u; v < m; v++) JtJ[u][v] += cols[u][0] * cols[v][0] + cols[u][1] * cols[v][1] + cols[u][2] * cols[v][2];
      }
    }
    for (let u = 0; u < m; u++) for (let v = 0; v < u; v++) JtJ[u][v] = JtJ[v][u];
    const maxDiag = Math.max(...JtJ.map((row, u) => row[u]));
    let improved = false;
    for (let attempt = 0; attempt < 14; attempt++) {
      const A = JtJ.map((row, u) => row.map((v, w) => (u === w ? v * (1 + mu) + 1e-14 * maxDiag : v)));
      const delta = solveLinear(A, Jtr.map((v) => -v));
      const Q = [...P];
      idx.forEach((j, u) => (Q[j] += delta[u]));
      const cq = cost(Q, samples);
      if (cq < c) {
        const gain = (c - cq) / c;
        P = Q;
        c = cq;
        mu = Math.max(1e-12, mu / 4);
        improved = true;
        if (gain < 1e-11) return { P, cost: c };
        break;
      }
      mu *= 8;
    }
    if (!improved) break;
  }
  return { P, cost: c };
}

// ---------------------------------------------------- Échantillonnage

/** Générateur pseudo-aléatoire déterministe (reproductibilité de l'ajustement). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Instants (jours depuis l'époque) répartis par strates dans [from, to]. */
function stratified(from, to, count, seed) {
  const rnd = lcg(seed);
  const out = [];
  for (let k = 0; k < count; k++) out.push(from + ((k + rnd()) / count) * (to - from));
  return out;
}

/** Régression linéaire y = y0 + s·x. */
function linearFit(xs, ys) {
  const mx = xs.reduce((a, v) => a + v, 0) / xs.length;
  const my = ys.reduce((a, v) => a + v, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, k) => {
    sxy += (x - mx) * (ys[k] - my);
    sxx += (x - mx) ** 2;
  });
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Déroule une suite d'angles (radians). */
function unwrap(angles) {
  const out = [];
  let offset = 0;
  angles.forEach((a, k) => {
    if (k > 0) {
      const d = a + offset - out[k - 1];
      if (d > Math.PI) offset -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      if (d < -Math.PI) offset += 2 * Math.PI * Math.round(-d / (2 * Math.PI));
    }
    out.push(a + offset);
  });
  return out;
}

// ------------------------------------------------------------ Ajustement

const SCALES = (a, n) => [a, Math.abs(n), 1e-3, 1e-3, 1e-5, 1e-3, 1e-3, 1e-5, 1, 1e-3, 1e-3, 1e-3, 1e-5, 1];
const wrap = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/**
 * Estimation initiale de tous les paramètres à partir des données (vitesse
 * par différences finies, vecteur excentricité, normale de l'orbite), puis
 * ajustement sur des fenêtres croissantes et enfin sur 2010–2030 complet.
 */
function fitMoon(position, periodDays, laplacePole, fixPole) {
  // 1. Moyen mouvement et demi-grand axe approchés sur quelques périodes.
  const W0 = Math.min(SPAN_TO_DAYS, Math.max(4 * periodDays, 2));
  const dense = [];
  for (let t = -W0; t <= W0; t += periodDays / 60) dense.push({ t, r: position(t) });
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  let pole = laplacePole ?? unit(cross(dense[0].r, dense[1].r));
  let basis = referenceBasis(pole);
  const toRef = (r) => [dot(r, basis.x), dot(r, basis.y), dot(r, basis.z)];
  const theta = unwrap(dense.map((d) => Math.atan2(toRef(d.r)[1], toRef(d.r)[0])));
  // Valeur absolue : le sens du mouvement est porté par l'inclinaison (> 90° si rétrograde).
  const n0 = Math.abs(linearFit(dense.map((d) => d.t), theta).slope);
  const radii = dense.map((d) => norm(d.r));
  const a0 = (Math.min(...radii) + Math.max(...radii)) / 2;
  const gm = n0 * n0 * a0 ** 3;

  // 2. Normale et vecteur excentricité sur toute la période.
  const dt = periodDays / 1000;
  const epochs = stratified(SPAN_FROM_DAYS + dt, SPAN_TO_DAYS - dt, 3000, 7);
  const states = epochs.map((t) => {
    const r = position(t);
    const r1 = position(t + dt);
    const r0 = position(t - dt);
    const v = [(r1[0] - r0[0]) / (2 * dt), (r1[1] - r0[1]) / (2 * dt), (r1[2] - r0[2]) / (2 * dt)];
    const hv = cross(r, v);
    const vh = cross(v, hv);
    const rn = norm(r);
    const ev = [vh[0] / gm - r[0] / rn, vh[1] / gm - r[1] / rn, vh[2] / gm - r[2] / rn];
    return { t, h: unit(hv), ev };
  });
  if (!laplacePole) {
    const s = states.reduce((acc, st) => [acc[0] + st.h[0], acc[1] + st.h[1], acc[2] + st.h[2]], [0, 0, 0]);
    pole = unit(s);
    basis = referenceBasis(pole);
  }
  // Passage du plan de référence au plan de l'orbite (rotations −Ω autour de z puis −i autour de x).
  const toOrbitPlane = (v, node, inc) => {
    const c = Math.cos(node);
    const s = Math.sin(node);
    const x1 = c * v[0] + s * v[1];
    const y1 = -s * v[0] + c * v[1];
    return [x1, Math.cos(inc) * y1 + Math.sin(inc) * v[2], -Math.sin(inc) * y1 + Math.cos(inc) * v[2]];
  };
  // Inclinaison et nœud dans le plan de référence : h = (sin i sin Ω, −sin i cos Ω, cos i).
  const hRef = states.map((st) => toRef(st.h));
  const incs = hRef.map((h) => Math.acos(Math.max(-1, Math.min(1, h[2]))));
  const inc0 = mean(incs);
  const nodes = unwrap(hRef.map((h) => Math.atan2(h[0], -h[1])));
  let node0 = 0;
  let nodeRate = 0;
  if (Math.sin(inc0) > 1e-4) {
    const fit = linearFit(states.map((st) => st.t), nodes);
    node0 = fit.intercept;
    nodeRate = fit.slope;
  }
  // Excentricité et longitude du péricentre ϖ = Ω + ω (ω mesuré dans le plan de l'orbite).
  const planeE = states.map((st, k) => toOrbitPlane(toRef(st.ev), nodes[k], incs[k]));
  const e0 = mean(planeE.map((e) => Math.hypot(e[0], e[1])));
  let varpi0 = 0;
  let varpiRate = 0;
  if (e0 > 3e-4) {
    const varpis = unwrap(planeE.map((e, k) => nodes[k] + Math.atan2(e[1], e[0])));
    const fit = linearFit(states.map((st) => st.t), varpis);
    varpi0 = fit.intercept;
    varpiRate = fit.slope;
  }
  // Longitude moyenne à l'époque : λ = M + ϖ.
  const rPlane = toOrbitPlane(toRef(position(0)), node0, inc0);
  const nu = Math.atan2(rPlane[1], rPlane[0]) - (varpi0 - node0);
  const E = 2 * Math.atan(Math.sqrt((1 - e0) / (1 + e0)) * Math.tan(nu / 2));
  const lambda0 = E - e0 * Math.sin(E) + varpi0;
  const tanHalf = Math.tan(inc0 / 2);
  const ra = Math.atan2(pole[1], pole[0]);
  const dec = Math.asin(pole[2]);
  let P = [a0, n0, e0 * Math.cos(varpi0), e0 * Math.sin(varpi0), varpiRate, tanHalf * Math.cos(node0), tanHalf * Math.sin(node0), nodeRate, lambda0, ra, dec, 0, 0, 0];
  const scales = SCALES(a0, n0);

  // 3. Fenêtres croissantes (le moyen mouvement se précise sans ambiguïté de tour).
  const base = [true, true, true, true, true, true, true, true, true, false, false, false, false, false];
  let W = W0;
  let seed = 11;
  let samples;
  for (;;) {
    const from = Math.max(SPAN_FROM_DAYS, -W);
    const to = Math.min(SPAN_TO_DAYS, W);
    const full = from === SPAN_FROM_DAYS && to === SPAN_TO_DAYS;
    samples = stratified(from, to, full ? 3000 : 1200, seed++).map((t) => ({ t, r: position(t) }));
    // Les vitesses de précession ne sont libres qu'une fois la fenêtre assez longue.
    const ratesFree = to - from > 30 * periodDays;
    const free = base.map((f, j) => f && (ratesFree || (j !== 4 && j !== 7)));
    P = levenbergMarquardt(P, free, samples, scales).P;
    if (full) break;
    W *= 4;
  }
  // 4. Pôle libre (sauf plan de Laplace imposé).
  const freePole = base.map((f, j) => f || (!fixPole && (j === 9 || j === 10)));
  P = levenbergMarquardt(P, freePole, samples, scales, 150).P;
  return { P, samples, scales, freePole };
}

/** Ajoute, si elle améliore nettement l'ajustement, une libration de la longitude moyenne. */
function addLibration(fitted, position) {
  const { P, samples, scales, freePole } = fitted;
  // Écart de longitude (dans le plan de l'orbite) entre données et modèle.
  const pts = stratified(SPAN_FROM_DAYS, SPAN_TO_DAYS, 1500, 31).map((t) => {
    const r = position(t);
    const m = modelPosition(P, t);
    const hz = unit(cross(m, modelPosition(P, t + 1e-3)));
    const ang = Math.atan2(dot(cross(m, r), hz), dot(m, r));
    return { t, d: ang };
  });
  const rms = Math.sqrt(pts.reduce((s, p) => s + p.d * p.d, 0) / pts.length);
  if (rms < (0.05 * Math.PI) / 180) return null;
  // Recherche de la période (2 à 200 ans) par moindres carrés linéaires.
  let best = null;
  for (let years = 2; years <= 200; years *= 1.01) {
    const nu = (2 * Math.PI) / (years * 365.25);
    // d ≈ c0 + c1 t + s sin(nu t) + c cos(nu t)
    const rows = pts.map((p) => [1, p.t / 3650, Math.sin(nu * p.t), Math.cos(nu * p.t)]);
    const A = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
    const b = Array.from({ length: 4 }, (_, i) => rows.reduce((s, r, k) => s + r[i] * pts[k].d, 0));
    const x = solveLinear(A, b);
    const res = rows.reduce((s, r, k) => s + (r[0] * x[0] + r[1] * x[1] + r[2] * x[2] + r[3] * x[3] - pts[k].d) ** 2, 0);
    if (!best || res < best.res) best = { res, nu, x };
  }
  const amp = Math.hypot(best.x[2], best.x[3]);
  const phi = Math.atan2(best.x[3], best.x[2]);
  const Q = [...P];
  Q[8] += best.x[0];
  Q[1] += best.x[1] / 3650;
  Q[11] = amp;
  Q[12] = best.nu;
  Q[13] = phi;
  const free = freePole.map((f, j) => f || j >= 11);
  const before = cost(P, samples);
  const { P: R, cost: after } = levenbergMarquardt(Q, free, samples, scales, 200);
  return after < 0.5 * before ? R : null;
}

function residuals(P, position, from, to, count, seed) {
  let s = 0;
  let max = 0;
  let maxDeg = 0;
  for (const t of stratified(from, to, count, seed)) {
    const r = position(t);
    const m = modelPosition(P, t);
    const d = norm(sub(m, r));
    s += d * d;
    max = Math.max(max, d);
    maxDeg = Math.max(maxDeg, (Math.acos(Math.min(1, dot(m, r) / (norm(m) * norm(r)))) * 180) / Math.PI);
  }
  return { rmsKm: Math.sqrt(s / count), maxKm: max, maxAngleDeg: maxDeg, samples: count };
}

/** Erreur d'extrapolation : modèle réajusté sur 2010–2020 seulement, comparé aux données de 2020–2030. */
function extrapolationCheck(P, position, withLibration, fixPole) {
  const samples = stratified(SPAN_FROM_DAYS, 0, 3000, 5).map((t) => ({ t, r: position(t) }));
  const free = new Array(NP).fill(true).map((_, j) => j < 9 || (!fixPole && j < 11) || (withLibration && j >= 11));
  const { P: Q } = levenbergMarquardt(P, free, samples, SCALES(P[0], P[1]), 150);
  return residuals(Q, position, 0, SPAN_TO_DAYS, 5000, 123);
}

// ------------------------------------------------------------ Programme

const [dir, out] = process.argv.slice(2);
if (!dir) {
  console.error('Usage : node scripts/moons/fit-moon-elements.mjs <dossier astraeus> [sortie.json]');
  process.exit(1);
}

/**
 * Pôles des plans de Laplace tabulés par JPL (Planetary Satellite Mean
 * Elements, https://ssd.jpl.nasa.gov/sats/elem/, relevés le 2026-10-17 dans
 * les fichiers data/orbits/*.json du paquet astraeus 0.3.0). Pour ces lunes,
 * dont le nœud précesse en plusieurs siècles, 20 ans de données ne suffisent
 * pas à retrouver l'axe de précession : il est imposé, ce qui rend
 * l'extrapolation hors 2010–2030 physiquement cohérente.
 */
const LAPLACE_POLE = {
  ganymede: { raDec: [268.2, 64.6], fixed: true },
  callisto: { raDec: [268.7, 64.8], fixed: true },
  titan: { raDec: [36.4, 84.0], fixed: true },
  iapetus: { raDec: [288.7, 78.9], fixed: true },
  // Triton : forte inclinaison (157°) sur le plan de Laplace, l'arc de précession parcouru en 20 ans
  // suffit à déterminer l'axe ; le pôle JPL sert de point de départ et le pôle est ensuite ajusté.
  triton: { raDec: [299.8, 43.1], fixed: false },
};

const DEG = 180 / Math.PI;
const result = {
  description:
    "Éléments moyens à précession uniforme ajustés par scripts/moons/fit-moon-elements.mjs sur les vecteurs d'état JPL Horizons (2010–2030). Angles en degrés, temps t en jours TT depuis l'époque, distances en km. Plan de référence : pôle (ascension droite, déclinaison) dans le repère ICRF ; axe x vers le nœud ascendant de ce plan sur l'équateur ICRF.",
  epoch: { tt: '2020-01-01T00:00:00', jdTT: 2_458_849.5 },
  fitSpan: { fromUtc: '2010-01-01', toUtc: '2030-01-01' },
  model:
    "λ = λ0 + n·t + A·sin(ν·t + φ) ; ϖ = ϖ0 + ϖ′·t ; Ω = Ω0 + Ω′·t ; a, e, i fixes ; M = λ − ϖ ; ω = ϖ − Ω",
  source: {
    data: "JPL Horizons API 1.2, vecteurs d'état géométriques ICRF (km, TDB), via les paquets npm astraeus-data-<planète>@0.3.0 (ajustements de Tchebychev des sorties Horizons, licence MIT)",
    url: 'https://ssd.jpl.nasa.gov/horizons/',
    credit: 'NASA/JPL-Caltech Solar System Dynamics',
  },
  moons: {},
};

const only = process.env.MOONS ? process.env.MOONS.split(',') : null;

/**
 * Jeu de référence pour les tests (option FIXTURE=<fichier>) : positions
 * Horizons (EQJ, km) à 16 instants UTC répartis sur 2010–2030. TT − UTC suit
 * les secondes intercalaires de la période (66,184 s avant juillet 2012, puis
 * 67,184 s, 68,184 s en juillet 2015 et 69,184 s depuis 2017).
 */
const fixture = process.env.FIXTURE ? { description: '', moons: {} } : null;
function ttMinusUtc(utcMs) {
  if (utcMs >= Date.UTC(2017, 0, 1)) return 69.184;
  if (utcMs >= Date.UTC(2015, 6, 1)) return 68.184;
  if (utcMs >= Date.UTC(2012, 6, 1)) return 67.184;
  return 66.184;
}
const FIXTURE_DATES = Array.from({ length: 16 }, (_, k) => Date.UTC(2010, 0, 1) + Math.round(((k + 0.37) / 16) * (Date.UTC(2030, 0, 1) - Date.UTC(2010, 0, 1)) / 60_000) * 60_000);
for (const [planet, moons] of Object.entries(SYSTEMS)) {
  const base = join(dir, planet, 'package', 'data', `${planet}-moons`);
  const index = JSON.parse(readFileSync(join(base, 'index.json'), 'utf8'));
  if (index.frame !== 'EQJ') throw new Error('repère inattendu');
  const centreEntry = index.bodies.find((b) => b.id === index.centre);
  const centre = loadSeries(base, centreEntry);
  for (const id of moons) {
    if (only && !only.includes(id)) continue;
    const entry = index.bodies.find((b) => b.id === id);
    const series = loadSeries(base, entry);
    const position = (tDays) => {
      const s = EPOCH_TDB_S + tDays * DAY_S;
      return sub(series(s), centre(s));
    };
    const period = entry.fit.periodDays;
    if (fixture) {
      fixture.moons[id] = FIXTURE_DATES.map((utcMs) => {
        const tdbS = (utcMs - Date.UTC(2000, 0, 1, 12)) / 1000 + ttMinusUtc(utcMs);
        const r = sub(series(tdbS), centre(tdbS));
        return [utcMs, ...r.map((v) => +v.toFixed(3))];
      });
      continue;
    }
    const laplace = LAPLACE_POLE[id];
    const fixPole = Boolean(laplace?.fixed);
    const fitted = fitMoon(position, period, laplace ? poleVector(laplace.raDec[0] / DEG, laplace.raDec[1] / DEG) : null, fixPole);
    let P = fitted.P;
    const plain = residuals(P, position, SPAN_FROM_DAYS, SPAN_TO_DAYS, 20_000, 99);
    const lib = addLibration(fitted, position);
    if (lib) P = lib;
    // Inclinaison nulle sur le plan de référence : le nœud n'a pas de sens, on l'annule (position inchangée).
    if (2 * Math.atan(Math.hypot(P[5], P[6])) < 1e-7) {
      P = [...P];
      P[5] = 0;
      P[6] = 0;
      P[7] = 0;
    }
    const fit = residuals(P, position, SPAN_FROM_DAYS, SPAN_TO_DAYS, 20_000, 99);
    const extra = extrapolationCheck(P, position, Boolean(lib), fixPole);
    const [a, n, k, h, wdot, q, p, odot, l0, ra, dec, A, nu, phi] = P;
    result.moons[id] = {
      parent: planet,
      naifId: entry.naifId,
      horizons: {
        ephemeris: entry.horizons.ephemeris,
        command: entry.horizons.command,
        center: entry.horizons.center,
        fetched: entry.provenance.sources[0].replace(/^.*fetched /, ''),
        header: entry.horizons.headerNotes[0],
      },
      referencePlane: fixPole ? 'plan de Laplace tabulé par JPL (sats/elem)' : 'plan ajusté sur les données',
      poleRaDeg: +(((ra * DEG) % 360 + 360) % 360).toFixed(8),
      poleDecDeg: +(dec * DEG).toFixed(8),
      aKm: +a.toFixed(3),
      meanMotionDegPerDay: +(n * DEG).toPrecision(15),
      e: +Math.hypot(k, h).toFixed(8),
      varpiDeg: +(wrap(Math.atan2(h, k)) * DEG).toFixed(8),
      varpiRateDegPerDay: +(wdot * DEG).toPrecision(10),
      iDeg: +(2 * Math.atan(Math.hypot(p, q)) * DEG).toFixed(8),
      nodeDeg: +(wrap(Math.atan2(p, q)) * DEG).toFixed(8),
      nodeRateDegPerDay: +(odot * DEG).toPrecision(10),
      lambdaDeg: +(wrap(l0) * DEG).toFixed(10),
      libration: lib ? libration(A, nu, phi) : null,
      fit: roundStats(fit),
      extrapolation10y: roundStats(extra),
    };
    console.log(
      `${id.padEnd(10)} a=${a.toFixed(1)} P=${((2 * Math.PI) / n).toFixed(6)} j (Horizons ${period}) e=${Math.hypot(k, h).toFixed(5)} ` +
        `i=${(2 * Math.atan(Math.hypot(p, q)) * DEG).toFixed(3)}° Ω'=${(odot * DEG * 365.25).toFixed(3)}°/an ϖ'=${(wdot * DEG * 365.25).toFixed(3)}°/an` +
        ` | sans libr. max ${plain.maxAngleDeg.toFixed(3)}° | ajust. rms ${fit.rmsKm.toFixed(1)} km max ${fit.maxKm.toFixed(1)} km (${fit.maxAngleDeg.toFixed(3)}°)` +
        (lib ? ` | libr. ${(Math.abs(A) * DEG).toFixed(2)}° / ${((2 * Math.PI) / Math.abs(nu) / 365.25).toFixed(1)} ans` : '') +
        ` | extrapol. 10 ans max ${extra.maxKm.toFixed(0)} km (${extra.maxAngleDeg.toFixed(2)}°)`,
    );
  }
}

/** Libration normalisée : amplitude et période positives, A·sin(2π t / période + phase). */
function libration(A, nu, phi) {
  let amp = A;
  let freq = nu;
  let phase = phi;
  if (amp < 0) {
    amp = -amp;
    phase += Math.PI;
  }
  if (freq < 0) {
    freq = -freq;
    phase = Math.PI - phase;
  }
  return { amplitudeDeg: +(amp * DEG).toPrecision(8), periodDays: +((2 * Math.PI) / freq).toPrecision(8), phaseDeg: +(wrap(phase) * DEG).toFixed(6) };
}

function roundStats(s) {
  return { rmsKm: +s.rmsKm.toPrecision(4), maxKm: +s.maxKm.toPrecision(4), maxAngleDeg: +s.maxAngleDeg.toPrecision(4), samples: s.samples };
}

if (fixture) {
  fixture.description =
    'Positions planétocentriques JPL Horizons (repère ICRF/EQJ, km) relues dans les paquets astraeus-data-*@0.3.0 : [instant UTC (ms), x, y, z]. Généré par scripts/moons/fit-moon-elements.mjs (option FIXTURE).';
  writeFileSync(process.env.FIXTURE, JSON.stringify(fixture) + '\n');
  console.log(`Écrit : ${process.env.FIXTURE}`);
} else if (out) {
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(`Écrit : ${out}`);
}
