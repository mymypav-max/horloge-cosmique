#!/usr/bin/env node
/**
 * Éléments orbitaux SGP4 de la Station spatiale internationale, ajustés sur
 * l'éphéméride prévisionnelle officielle de la NASA (outil de préparation des
 * données, exécuté hors de l'application ; l'application n'accède jamais au
 * réseau).
 *
 * Source : fichier CCSDS OEM « ISS.OEM_J2K_EPH.txt » publié par le bureau
 * TOPO de la Flight Operations Directorate (NASA Johnson Space Center) :
 * vecteurs d'état toutes les 4 minutes sur environ 15 jours, repère EME2000,
 * temps UTC. Aucun TLE officiel (CelesTrak, Space-Track) n'était accessible
 * depuis l'environnement de préparation ; les éléments SGP4 sont donc
 * ajustés ici, par moindres carrés, sur ces vecteurs d'état :
 *
 * 1. passage EME2000 → TEME à chaque instant (précession-nutation IAU 2000B
 *    d'astronomy-engine, puis rotation de l'équation des équinoxes) ;
 * 2. ajustement de Levenberg-Marquardt des sept paramètres SGP4 (moyen
 *    mouvement, excentricité, inclinaison, nœud, argument du périgée,
 *    anomalie moyenne, B*) avec la propagation SGP4 de satellite.js ;
 * 3. écart au fichier NASA mesuré sur toute la période, et test de
 *    vieillissement (ajustement sur 3 jours, écart sur les jours suivants).
 *
 * Usage :
 *   curl -o ISS.OEM_J2K_EPH.txt https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt
 *   node scripts/iss/fit-iss-elements.mjs ISS.OEM_J2K_EPH.txt src/data/iss.json [tests/fixtures/iss-oem-sample.json]
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import * as Astronomy from 'astronomy-engine';
import { json2satrec, sgp4 } from 'satellite.js';

const [oemPath, outPath, fixturePath] = process.argv.slice(2);
if (!oemPath || !outPath) {
  console.error('Usage : node scripts/iss/fit-iss-elements.mjs <ISS.OEM_J2K_EPH.txt> <sortie.json> [échantillon.json]');
  process.exit(1);
}

// ------------------------------------------------------------ Lecture OEM

const raw = readFileSync(oemPath);
const text = raw.toString('utf8');
const header = {};
for (const line of text.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m && !(m[1] in header)) header[m[1]] = m[2];
}
if (header.REF_FRAME !== 'EME2000' || header.TIME_SYSTEM !== 'UTC' || header.CENTER_NAME !== 'Earth') {
  throw new Error(`Fichier OEM inattendu (repère ${header.REF_FRAME}, temps ${header.TIME_SYSTEM}, centre ${header.CENTER_NAME})`);
}
const states = [];
for (const line of text.split('\n')) {
  const m = line.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/);
  if (!m) continue;
  states.push({ iso: m[1], utcMs: Date.parse(`${m[1]}Z`), r: [+m[2], +m[3], +m[4]], v: [+m[5], +m[6], +m[7]], line: line.trim() });
}
if (states.length < 100) throw new Error('trop peu de vecteurs d’état');

// ------------------------------------------------------- EME2000 → TEME

function toTeme(utcMs, r) {
  const time = Astronomy.MakeTime(new Date(utcMs));
  const tod = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(time), new Astronomy.Vector(r[0], r[1], r[2], time));
  // Équation des équinoxes (secondes de temps → radians) : TEME = R3(Eq_eq) · TOD.
  const eqeq = ((Astronomy.e_tilt(time).ee * 15) / 3600) * (Math.PI / 180);
  const c = Math.cos(eqeq);
  const s = Math.sin(eqeq);
  return [c * tod.x + s * tod.y, -s * tod.x + c * tod.y, tod.z];
}

const samples = states.map((st) => ({ utcMs: st.utcMs, r: toTeme(st.utcMs, st.r), v: toTeme(st.utcMs, st.v) }));

// ------------------------------------------------------------ Modèle SGP4

const epochMs = states[0].utcMs;
const epochIso = new Date(epochMs).toISOString().replace('Z', '');
const DEG = Math.PI / 180;

/**
 * Paramètres : [moyen mouvement (tours/jour), k = e·cos ω, h = e·sin ω, i (°), Ω (°),
 * u = ω + M (°), B* (1/rayon terrestre)]. Les combinaisons k, h et u restent bien
 * définies pour une orbite presque circulaire (celle de l'ISS : e ≈ 0,0005).
 */
function omm(P) {
  const e = Math.hypot(P[1], P[2]);
  const argp = (Math.atan2(P[2], P[1]) * 180) / Math.PI;
  const wrap = (x) => ((x % 360) + 360) % 360;
  return {
    CCSDS_OMM_VERS: '3.0',
    OBJECT_NAME: 'ISS (ZARYA)',
    OBJECT_ID: '1998-067A',
    CENTER_NAME: 'EARTH',
    REF_FRAME: 'TEME',
    TIME_SYSTEM: 'UTC',
    MEAN_ELEMENT_THEORY: 'SGP4',
    EPOCH: epochIso,
    MEAN_MOTION: P[0],
    ECCENTRICITY: e,
    INCLINATION: P[3],
    RA_OF_ASC_NODE: wrap(P[4]),
    ARG_OF_PERICENTER: wrap(argp),
    MEAN_ANOMALY: wrap(P[5] - argp),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: 25544,
    BSTAR: P[6],
    MEAN_MOTION_DOT: 0,
    MEAN_MOTION_DDOT: 0,
  };
}

function propagateAll(P, set) {
  const satrec = json2satrec(omm(P));
  return set.map((s) => {
    const out = sgp4(satrec, (s.utcMs - epochMs) / 60_000);
    if (!out || !out.position) return [Number.NaN, Number.NaN, Number.NaN];
    return [out.position.x, out.position.y, out.position.z];
  });
}

function costOf(P, set) {
  const pos = propagateAll(P, set);
  let c = 0;
  set.forEach((s, k) => {
    c += (pos[k][0] - s.r[0]) ** 2 + (pos[k][1] - s.r[1]) ** 2 + (pos[k][2] - s.r[2]) ** 2;
  });
  return Number.isFinite(c) ? c : Number.POSITIVE_INFINITY;
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

const STEPS = [1e-7, 1e-7, 1e-7, 1e-5, 1e-5, 1e-5, 1e-7];

function fit(P0, set, iterations = 80) {
  let P = [...P0];
  let c = costOf(P, set);
  let mu = 1e-3;
  for (let it = 0; it < iterations; it++) {
    const base = propagateAll(P, set);
    const cols = STEPS.map((h, j) => {
      const Q = [...P];
      Q[j] += h;
      const pos = propagateAll(Q, set);
      return pos.map((p, k) => [(p[0] - base[k][0]) / h, (p[1] - base[k][1]) / h, (p[2] - base[k][2]) / h]);
    });
    const n = STEPS.length;
    const JtJ = Array.from({ length: n }, () => new Array(n).fill(0));
    const Jtr = new Array(n).fill(0);
    set.forEach((s, k) => {
      const res = [base[k][0] - s.r[0], base[k][1] - s.r[1], base[k][2] - s.r[2]];
      for (let u = 0; u < n; u++) {
        const cu = cols[u][k];
        Jtr[u] += cu[0] * res[0] + cu[1] * res[1] + cu[2] * res[2];
        for (let v = u; v < n; v++) {
          const cv = cols[v][k];
          JtJ[u][v] += cu[0] * cv[0] + cu[1] * cv[1] + cu[2] * cv[2];
        }
      }
    });
    for (let u = 0; u < n; u++) for (let v = 0; v < u; v++) JtJ[u][v] = JtJ[v][u];
    let improved = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const A = JtJ.map((row, u) => row.map((v, w) => (u === w ? v * (1 + mu) : v)));
      const d = solve(A, Jtr.map((v) => -v));
      const Q = P.map((p, j) => p + d[j]);
      const cq = costOf(Q, set);
      if (cq < c) {
        const gain = (c - cq) / c;
        P = Q;
        c = cq;
        mu = Math.max(1e-12, mu / 4);
        improved = true;
        if (gain < 1e-12) return P;
        break;
      }
      mu *= 8;
    }
    if (!improved) break;
  }
  return P;
}

function stats(P, set) {
  const pos = propagateAll(P, set);
  let s = 0;
  let max = 0;
  set.forEach((x, k) => {
    const d = Math.hypot(pos[k][0] - x.r[0], pos[k][1] - x.r[1], pos[k][2] - x.r[2]);
    s += d * d;
    max = Math.max(max, d);
  });
  return { rmsKm: +Math.sqrt(s / set.length).toFixed(3), maxKm: +max.toFixed(3), samples: set.length };
}

// ------------------------------------------------- Estimation initiale

/** Éléments osculateurs képlériens du premier état (constante WGS-72 de SGP4). */
function osculating(r, v) {
  const mu = 398600.8;
  const rn = Math.hypot(...r);
  const vn2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
  const hn = Math.hypot(...h);
  const nodeVec = [-h[1], h[0], 0];
  const nn = Math.hypot(...nodeVec);
  const rv = r[0] * v[0] + r[1] * v[1] + r[2] * v[2];
  const ev = r.map((x, k) => ((vn2 - mu / rn) * x - rv * v[k]) / mu);
  const e = Math.hypot(...ev);
  const a = 1 / (2 / rn - vn2 / mu);
  const i = Math.acos(h[2] / hn);
  let node = Math.acos(nodeVec[0] / nn);
  if (nodeVec[1] < 0) node = 2 * Math.PI - node;
  let argp = Math.acos((nodeVec[0] * ev[0] + nodeVec[1] * ev[1]) / (nn * e));
  if (ev[2] < 0) argp = 2 * Math.PI - argp;
  let nu = Math.acos((ev[0] * r[0] + ev[1] * r[1] + ev[2] * r[2]) / (e * rn));
  if (rv < 0) nu = 2 * Math.PI - nu;
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
  const M = E - e * Math.sin(E);
  const nRevDay = (Math.sqrt(mu / a ** 3) * 86400) / (2 * Math.PI);
  return [nRevDay, e * Math.cos(argp), e * Math.sin(argp), i / DEG, node / DEG, (argp + M) / DEG, 2e-4];
}

// ------------------------------------------------------------ Ajustement

const every = (set, step) => set.filter((_, k) => k % step === 0);
const fitSet = every(samples, 3); // un point toutes les 12 minutes
let P = osculating(samples[0].r, samples[0].v);
// Fenêtres croissantes : 1 jour, 3 jours, puis toute la période.
for (const days of [1, 3, 1e9]) {
  const set = fitSet.filter((s) => s.utcMs - epochMs <= days * 86_400_000);
  P = fit(P, set);
}
const full = stats(P, samples);

// Vieillissement : éléments ajustés sur les 3 premiers jours seulement.
const firstDays = fitSet.filter((s) => s.utcMs - epochMs <= 3 * 86_400_000);
const P3 = fit(P, firstDays);
const ageing = {};
for (const day of [3, 5, 7, 10, 15]) {
  const set = samples.filter((s) => Math.abs((s.utcMs - epochMs) / 86_400_000 - day) < 0.5);
  if (set.length) ageing[`jour${day}`] = stats(P3, set).maxKm;
}

const sha256 = createHash('sha256').update(raw).digest('hex');
const result = {
  description:
    "Éléments moyens SGP4 (repère TEME) de l'ISS, ajustés par scripts/iss/fit-iss-elements.mjs sur l'éphéméride prévisionnelle de la NASA. Ce n'est PAS un TLE publié par le NORAD ou CelesTrak : aucun n'était accessible lors de la préparation des données.",
  object: { name: 'Station spatiale internationale (ISS)', noradId: 25544, cosparId: '1998-067A' },
  omm: omm(P),
  source: {
    title: 'NASA JSC Flight Operations Directorate (TOPO), ISS Trajectory Data — fichier CCSDS OEM ISS.OEM_J2K_EPH.txt',
    url: 'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt',
    originator: header.ORIGINATOR,
    creationDate: header.CREATION_DATE,
    frame: header.REF_FRAME,
    timeSystem: header.TIME_SYSTEM,
    usableStartUtc: header.USEABLE_START_TIME,
    usableStopUtc: header.USEABLE_STOP_TIME,
    stateVectors: states.length,
    sha256,
    bytes: statSync(oemPath).size,
    retrievedUtc: process.env.ISS_RETRIEVED_UTC ?? null,
  },
  method:
    "EME2000 → TEME (précession-nutation IAU 2000B et équation des équinoxes, astronomy-engine), puis ajustement de Levenberg-Marquardt des 7 paramètres SGP4 (satellite.js) sur un vecteur d'état toutes les 12 minutes.",
  fit: { ...full, fromUtc: states[0].iso, toUtc: states[states.length - 1].iso },
  ageingFromThreeDayFit: { description: "Écart maximal (km) d'éléments ajustés sur les 3 premiers jours seulement, autour du jour indiqué.", ...ageing },
};
writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(`Écart au fichier NASA : rms ${full.rmsKm} km, max ${full.maxKm} km (${full.samples} vecteurs)`);
console.log('Vieillissement (ajustement sur 3 jours) :', ageing);
console.log(`Écrit : ${outPath}`);

if (fixturePath) {
  // Échantillon de vérification : un vecteur d'état toutes les 6 heures, recopié tel quel.
  const picked = states.filter((_, k) => k % 90 === 0).map((s) => s.line);
  writeFileSync(
    fixturePath,
    JSON.stringify(
      {
        description: `Extrait (un vecteur toutes les 6 h) de ${result.source.title}, créé le ${header.CREATION_DATE} ; colonnes : instant UTC, x, y, z (km, EME2000), vx, vy, vz (km/s).`,
        sha256OfSource: sha256,
        lines: picked,
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`Écrit : ${fixturePath}`);
}
