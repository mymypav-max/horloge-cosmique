/**
 * Échelles de temps astronomiques.
 *
 * Convention du projet (voir docs/MODELE-ASTRONOMIQUE.md) :
 * - L'application manipule des instants en millisecondes Unix (UTC), comme
 *   `Date.now()`. L'heure *affichée* est l'heure locale de l'appareil.
 * - Les éphémérides planétaires utilisent le Temps Terrestre (TT) :
 *   · depuis 1972 : TT = UTC + (TAI − UTC) + 32,184 s, avec la table officielle
 *     des secondes intercalaires (valeur figée à 69,184 s après 2017, les
 *     futures secondes intercalaires étant inconnues) ;
 *   · avant 1972 : TT = UT + ΔT, ΔT estimé par la parabole de Morrison et
 *     Stephenson (2004), ΔT = −20 + 32·u² s avec u = (année − 1820)/100.
 *   TDB et TT diffèrent de moins de 2 ms : la différence est ignorée.
 * - La rotation de la Terre utilise UT1, approché par UTC (|UT1 − UTC| < 0,9 s).
 */

export const MS_PER_DAY = 86_400_000;
/** Jour julien de l'époque Unix (1970-01-01T00:00:00Z). */
export const JD_UNIX_EPOCH = 2_440_587.5;
/** Jour julien de l'époque J2000.0 (2000-01-01T12:00:00 TT). */
export const JD_J2000 = 2_451_545.0;
export const DAYS_PER_JULIAN_CENTURY = 36_525;

/**
 * Secondes intercalaires : instant UTC de prise d'effet → TAI − UTC (s).
 * Source : IERS Bulletin C (dernière seconde intercalaire au 1er janvier 2017,
 * aucune annoncée depuis à la date de rédaction).
 */
const LEAP_SECONDS: ReadonlyArray<readonly [number, number]> = [
  [Date.UTC(1972, 0, 1), 10],
  [Date.UTC(1972, 6, 1), 11],
  [Date.UTC(1973, 0, 1), 12],
  [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14],
  [Date.UTC(1976, 0, 1), 15],
  [Date.UTC(1977, 0, 1), 16],
  [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18],
  [Date.UTC(1980, 0, 1), 19],
  [Date.UTC(1981, 6, 1), 20],
  [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22],
  [Date.UTC(1985, 6, 1), 23],
  [Date.UTC(1988, 0, 1), 24],
  [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26],
  [Date.UTC(1992, 6, 1), 27],
  [Date.UTC(1993, 6, 1), 28],
  [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30],
  [Date.UTC(1997, 6, 1), 31],
  [Date.UTC(1999, 0, 1), 32],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2017, 0, 1), 37],
];

/** TT − TAI, constante par définition. */
export const TT_MINUS_TAI_SECONDS = 32.184;

/**
 * TAI − UTC en secondes depuis 1972 (10 s retournées avant cette date, où UTC
 * au sens moderne n'existait pas ; voir ttMinusUtcSeconds).
 */
export function taiMinusUtcSeconds(utcMs: number): number {
  let value = 10;
  for (const [start, offset] of LEAP_SECONDS) {
    if (utcMs >= start) value = offset;
    else break;
  }
  return value;
}

const MS_PER_JULIAN_YEAR = 365.25 * 86_400_000;

/**
 * Estimation à long terme de ΔT = TT − UT (secondes), Morrison & Stephenson
 * (2004). Incertitude : quelques secondes au XIXe siècle, quelques minutes au
 * Moyen Âge — sans effet visible pour l'application.
 */
export function longTermDeltaTSeconds(utcMs: number): number {
  const year = 1970 + utcMs / MS_PER_JULIAN_YEAR;
  const u = (year - 1820) / 100;
  return -20 + 32 * u * u;
}

/** TT − UTC en secondes (69,184 s depuis 2017). */
export function ttMinusUtcSeconds(utcMs: number): number {
  if (utcMs < LEAP_SECONDS[0][0]) return longTermDeltaTSeconds(utcMs);
  return taiMinusUtcSeconds(utcMs) + TT_MINUS_TAI_SECONDS;
}

/** Jour julien UTC d'un instant Unix (ms). */
export function julianDateUtc(utcMs: number): number {
  return utcMs / MS_PER_DAY + JD_UNIX_EPOCH;
}

/** Jour julien en Temps Terrestre. */
export function julianDateTT(utcMs: number): number {
  return julianDateUtc(utcMs) + ttMinusUtcSeconds(utcMs) / 86_400;
}

/** Siècles juliens TT écoulés depuis J2000.0 (argument T des éphémérides). */
export function centuriesTT(utcMs: number): number {
  return (julianDateTT(utcMs) - JD_J2000) / DAYS_PER_JULIAN_CENTURY;
}

/** Jours TT écoulés depuis J2000.0 (argument d des modèles de rotation IAU). */
export function daysTT(utcMs: number): number {
  return julianDateTT(utcMs) - JD_J2000;
}

/** Jours UT1 (≈ UTC) écoulés depuis J2000.0, pour la rotation terrestre. */
export function daysUT1(utcMs: number): number {
  return julianDateUtc(utcMs) - JD_J2000;
}

/** Instant Unix (ms) correspondant à un jour julien UTC. */
export function utcMsFromJulianDate(jd: number): number {
  return (jd - JD_UNIX_EPOCH) * MS_PER_DAY;
}
