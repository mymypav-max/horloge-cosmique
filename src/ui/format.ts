/**
 * Mise en forme française des dates, heures et nombres.
 *
 * Implémentation autonome (sans Intl) pour un résultat identique sur toutes
 * les WebView, y compris celles dont les données de localisation sont
 * réduites. L'heure affichée est l'heure LOCALE de l'appareil.
 */

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Espace fine insécable (séparateur de milliers en français). */
export const NNBSP = ' ';

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « 21:47 » */
export function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** « 21:47:05 » */
export function formatTimeWithSeconds(d: Date): string {
  return `${formatTime(d)}:${pad2(d.getSeconds())}`;
}

export function formatWeekday(d: Date): string {
  return DAYS[d.getDay()];
}

/** Année avec gestion des années avant notre ère (calendrier proleptique). */
export function formatYear(year: number): string {
  return year > 0 ? String(year) : `${1 - year} av. J.-C.`;
}

/** « jeudi 29 octobre 2026 », avec « 1er » pour le premier jour du mois. */
export function formatLongDate(d: Date): string {
  const day = d.getDate() === 1 ? '1er' : String(d.getDate());
  return `${formatWeekday(d)} ${day} ${MONTHS[d.getMonth()]} ${formatYear(d.getFullYear())}`;
}

/** Nombre au format français : virgule décimale, espaces fines pour les milliers. */
export function formatNumber(value: number, decimals = 0): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  return `${negative ? '−' : ''}${grouped}${decPart ? `,${decPart}` : ''}`;
}

/** Facteur de vitesse : « ×3 600 ». */
export function formatRate(rate: number): string {
  return `×${formatNumber(rate)}`;
}

/** Équivalence lisible d'un facteur de vitesse : « 1 h par seconde ». */
export function describeRate(rate: number): string {
  if (rate === 1) return 'vitesse réelle';
  const table: Array<[number, string]> = [
    [2_629_800, '1 mois'],
    [604_800, '1 semaine'],
    [86_400, '1 jour'],
    [21_600, '6 h'],
    [3_600, '1 h'],
    [600, '10 min'],
    [60, '1 min'],
  ];
  const hit = table.find(([r]) => r === rate);
  if (hit) return `${hit[1]} par seconde`;
  return `${formatNumber(rate)} s par seconde`;
}

/** Écart de temps compact : « +2 j 3 h », « −45 min ». */
export function formatOffset(ms: number): string {
  const sign = ms < 0 ? '−' : '+';
  let s = Math.round(Math.abs(ms) / 1000);
  const years = Math.floor(s / 31_557_600);
  s -= years * 31_557_600;
  const days = Math.floor(s / 86_400);
  s -= days * 86_400;
  const hours = Math.floor(s / 3_600);
  s -= hours * 3_600;
  const minutes = Math.floor(s / 60);
  const parts: string[] = [];
  if (years) parts.push(`${formatNumber(years)} an${years > 1 ? 's' : ''}`);
  if (days) parts.push(`${days} j`);
  if (hours && !years) parts.push(`${hours} h`);
  if (minutes && !years && !days) parts.push(`${minutes} min`);
  if (parts.length === 0) return 'moins d’une minute';
  return `${sign}${parts.slice(0, 2).join(' ')}`;
}

/** Latitude/longitude : « 23,4° N · 132,4° O ». */
export function formatGeo(latDeg: number, lonDeg: number): string {
  const lat = `${formatNumber(Math.abs(latDeg), 1)}° ${latDeg >= 0 ? 'N' : 'S'}`;
  const lon = `${formatNumber(Math.abs(lonDeg), 1)}° ${lonDeg >= 0 ? 'E' : 'O'}`;
  return `${lat} · ${lon}`;
}

/** Durée en heures : « 23 h 56 min », « 9 h 56 min », « 58,6 jours ». */
export function formatRotation(hours: number): string {
  const h = Math.abs(hours);
  if (h >= 72) return `${formatNumber(h / 24, 1)} jours`;
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  return minutes === 60 ? `${whole + 1} h` : `${whole} h ${pad2(minutes)} min`;
}

/** Période orbitale : « 365,26 jours », « 11,86 ans ». */
export function formatPeriod(days: number): string {
  if (days < 1000) return `${formatNumber(days, days < 100 ? 1 : 0)} jours`;
  return `${formatNumber(days / 365.25, 2)} ans`;
}

/** Petit angle : « 0,53° (32′) », « 1,1′ » (diamètres apparents). */
export function formatSmallAngle(deg: number): string {
  const arcmin = deg * 60;
  if (deg >= 0.1) return `${formatNumber(deg, 2)}° (${formatNumber(arcmin, 0)}′)`;
  if (arcmin >= 1) return `${formatNumber(arcmin, 1)}′`;
  return `${formatNumber(arcmin * 60, 0)}″`;
}

/** Période de révolution d'un satellite : « 7 h 39 min », « 1 j 18 h 28 min », « 360,1 jours ». */
export function formatOrbitPeriod(days: number): string {
  if (days >= 100) return `${formatNumber(days, 1)} jours`;
  let minutes = Math.round(days * 1440);
  const d = Math.floor(minutes / 1440);
  minutes -= d * 1440;
  const h = Math.floor(minutes / 60);
  const m = minutes - h * 60;
  if (d === 0) return `${h} h ${pad2(m)} min`;
  return `${d} j ${h} h ${pad2(m)} min`;
}

/** Distance en kilomètres arrondie à 3 ou 4 chiffres significatifs : « 421 800 km », « 9 375 km ». */
export function formatKm(km: number): string {
  const step = km >= 1e6 ? 1000 : km >= 1e5 ? 100 : km >= 1e4 ? 10 : 1;
  return `${formatNumber(Math.round(km / step) * step)} km`;
}

/** Date et heure UTC : « 28 octobre 2026, 12 h 00 UTC ». */
/** « 28 octobre 2026 » (date UTC). */
export function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  const day = d.getUTCDate() === 1 ? '1er' : String(d.getUTCDate());
  return `${day} ${MONTHS[d.getUTCMonth()]} ${formatYear(d.getUTCFullYear())}`;
}

/** Durée écoulée lisible : « moins d’une heure », « 5 h » (moins de 2 jours), puis « 3 j ». */
export function formatElapsed(days: number): string {
  const hours = days * 24;
  if (hours < 1) return 'moins d’une heure';
  if (hours < 48) return `${Math.floor(hours)} h`;
  return `${Math.floor(days)} j`;
}

export function formatUtc(ms: number): string {
  const d = new Date(ms);
  const day = d.getUTCDate() === 1 ? '1er' : String(d.getUTCDate());
  return `${day} ${MONTHS[d.getUTCMonth()]} ${formatYear(d.getUTCFullYear())}, ${pad2(d.getUTCHours())} h ${pad2(d.getUTCMinutes())} UTC`;
}
