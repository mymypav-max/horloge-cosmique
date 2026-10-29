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
