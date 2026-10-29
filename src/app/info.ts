/**
 * Contenu du panneau d'informations de la vue rapprochée.
 * Toutes les valeurs proviennent du modèle astronomique (données réelles),
 * jamais de la représentation visuelle.
 */

import { eclipticCoordinates } from '../astro/ephemeris';
import {
  ISS_DATA,
  ISS_DATA_STOP_MS,
  ISS_ELEMENTS_EPOCH_MS,
  ISS_INCLINATION_DEG,
  ISS_PERIOD_MINUTES,
  type IssState,
  type IssValidity,
} from '../astro/iss';
import {
  FITTED_ORBITS,
  isRetrograde,
  isWithinMoonFitSpan,
  moonInclinationDeg,
  moonPeriodDays,
} from '../astro/moons';
import { sunAngularDiameterDeg } from '../astro/sun';
import { centuriesTT } from '../astro/time';
import type { AstroState } from '../astro/state';
import { MOONS, type MoonId } from '../data/moons';
import { AU_KM, PLANETS, type PlanetId } from '../data/planets';
import {
  formatGeo,
  formatKm,
  formatNumber,
  formatOrbitPeriod,
  formatPeriod,
  formatRotation,
  formatSmallAngle,
  formatUtc,
} from '../ui/format';
import type { InfoLine } from '../ui/Overlay';

/** Précession générale en longitude (″ par siècle julien). */
const GENERAL_PRECESSION_ARCSEC = 5028.796;

function distance(au: number): string {
  const km = au * AU_KM;
  const kmText = km >= 1e9 ? `${formatNumber(km / 1e9, 2)} Md km` : `${formatNumber(km / 1e6, 1)} M km`;
  return `${formatNumber(au, au < 10 ? 3 : 2)} UA · ${kmText}`;
}

/** Saison astronomique de l'hémisphère nord d'après la longitude du Soleil (équinoxe de la date). */
export function northernSeason(state: AstroState): string {
  const e = state.positions.earth;
  const lonJ2000 = eclipticCoordinates([-e[0], -e[1], -e[2]]).lonDeg;
  const lon = (lonJ2000 + (GENERAL_PRECESSION_ARCSEC * centuriesTT(state.utcMs)) / 3600 + 360) % 360;
  if (lon < 90) return 'printemps';
  if (lon < 180) return 'été';
  if (lon < 270) return 'automne';
  return 'hiver';
}

/** Diamètre apparent du Soleil vu depuis une planète (distance réelle à l'instant affiché). */
export function sunSizeLine(id: PlanetId, state: AstroState): InfoLine {
  const p = state.positions[id];
  return { label: 'Soleil vu d’ici', value: formatSmallAngle(sunAngularDiameterDeg(Math.hypot(p[0], p[1], p[2]))) };
}

export function planetInfo(id: PlanetId, state: AstroState): { lines: InfoLine[]; note: string } {
  const info = PLANETS[id];
  const p = state.positions[id];
  const lines: InfoLine[] = [{ label: 'Distance au Soleil', value: distance(Math.hypot(p[0], p[1], p[2])) }, sunSizeLine(id, state)];

  if (id === 'earth') {
    lines.push(
      { label: 'Soleil au zénith', value: formatGeo(state.earth.subsolar.latDeg, state.earth.subsolar.lonDeg) },
      { label: 'Saison (hém. nord)', value: northernSeason(state) },
      { label: 'Rotation sidérale', value: '23 h 56 min 4 s' },
      { label: 'Inclinaison de l’axe', value: '23,44°' },
    );
    return { lines, note: 'Jour, nuit et terminateur calculés pour l’instant affiché, d’après la position réelle du Soleil.' };
  }

  const e = state.positions.earth;
  const toEarth = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
  const rotation = formatRotation(info.rotationPeriodHours) + (info.rotationPeriodHours < 0 ? ' (rétrograde)' : '');
  lines.push(
    { label: 'Distance à la Terre', value: distance(toEarth) },
    { label: 'Période orbitale', value: formatPeriod(info.orbitalPeriodDays) },
    { label: 'Rotation', value: rotation },
    { label: 'Diamètre réel', value: `${formatNumber(info.radiusKm * 2)} km` },
    { label: 'Inclinaison de l’axe', value: `${formatNumber(info.axialTiltDeg, info.axialTiltDeg < 1 ? 2 : 1)}°` },
  );
  return { lines, note: 'Tailles et distances de la vue générale ne sont pas à l’échelle ; les directions sont exactes.' };
}

/** « Lune de Jupiter », « Satellite naturel de la Terre ». */
export function moonSubtitle(id: MoonId): string {
  const parent = MOONS[id].parent;
  if (parent === 'earth') return 'Satellite naturel de la Terre';
  const name = PLANETS[parent].name;
  return `Lune ${/^[AEIOUÉ]/.test(name) ? 'd’' : 'de '}${name}`;
}

function diameter(id: MoonId): string {
  const moon = MOONS[id];
  const mean = formatNumber(Math.round(moon.radiusKm * 2));
  if (!moon.semiAxesKm) return `${mean} km`;
  const [a, b, c] = moon.semiAxesKm.map((r) => formatNumber(Math.round(r * 2)));
  return `≈ ${mean} km (${a} × ${b} × ${c})`;
}

export function moonInfo(id: MoonId, state: AstroState): { lines: InfoLine[]; note: string } {
  const moon = MOONS[id];
  const parentName = PLANETS[moon.parent].name;
  const p = state.moons[id];
  const inclination = moonInclinationDeg(id, state.utcMs);
  const retro = isRetrograde(id, state.utcMs);
  const tilt = retro ? 180 - inclination : inclination;
  const lines: InfoLine[] = [
    { label: 'Diamètre', value: diameter(id) },
    { label: `Distance à ${id === 'moon' ? 'la Terre' : parentName}`, value: formatKm(Math.hypot(p[0], p[1], p[2])) },
    { label: 'Période orbitale', value: formatOrbitPeriod(moonPeriodDays(id)) },
    {
      label: id === 'moon' ? 'Inclinaison / écliptique' : `Inclinaison / équateur`,
      value: `${formatNumber(tilt, tilt < 1 ? 2 : 1)}°`,
    },
    { label: 'Sens du mouvement', value: retro ? 'rétrograde' : 'direct' },
    { label: 'Excentricité', value: formatNumber(id === 'moon' ? 0.0549 : FITTED_ORBITS[id].e, id === 'nereid' ? 2 : 4) },
    { label: 'Découverte', value: moon.discovery },
  ];
  let precision: string;
  if (id === 'moon') {
    precision = 'Position : formules de l’Astronomical Almanac (précision ≈ 0,4°).';
  } else if (isWithinMoonFitSpan(state.utcMs)) {
    precision = `Position : modèle ajusté sur JPL Horizons (écart ≤ ${formatNumber(FITTED_ORBITS[id].fit.maxAngleDeg, 2)}°).`;
  } else {
    precision = 'Position extrapolée hors de 2010–2030 : approximative.';
  }
  return { lines, note: `${moon.description} ${precision} Taille et distance affichées non à l’échelle.` };
}

const ISS_STATUS: Record<IssValidity['status'], string> = {
  nominal: 'prévision NASA à jour',
  approximate: 'approximative',
  indicative: 'indicative',
  unavailable: 'indisponible',
};

export function issValidityText(v: IssValidity): string {
  if (v.status === 'nominal') return ISS_STATUS.nominal;
  if (v.status === 'unavailable') return ISS_STATUS.unavailable;
  return `${ISS_STATUS[v.status]} (données à ${formatNumber(Math.ceil(v.daysOutside))} j)`;
}

export function issInfo(state: IssState): { lines: InfoLine[]; note: string } {
  const lines: InfoLine[] = [
    { label: 'Nature', value: 'station habitée (satellite artificiel)' },
    { label: 'Altitude calculée', value: `${formatNumber(state.altitudeKm, 0)} km` },
    { label: 'Vitesse', value: `${formatNumber(state.speedKmS, 2)} km/s` },
    { label: 'Période orbitale', value: `${formatNumber(ISS_PERIOD_MINUTES, 1)} min` },
    { label: 'Inclinaison', value: `${formatNumber(ISS_INCLINATION_DEG, 1)}°` },
    { label: 'Éléments (époque)', value: formatUtc(ISS_ELEMENTS_EPOCH_MS) },
    { label: 'Validité', value: issValidityText(state.validity) },
  ];
  const until = formatUtc(ISS_DATA_STOP_MS);
  const precision =
    state.validity.status === 'nominal'
      ? `écart ≤ ${formatNumber(Math.ceil(ISS_DATA.fit.maxKm), 0)} km à l’éphéméride NASA (valable jusqu’au ${until})`
      : state.validity.status === 'approximate'
        ? 'l’écart peut atteindre quelques dizaines de kilomètres'
        : 'la position le long de l’orbite est incertaine (centaines de kilomètres ou plus)';
  return {
    lines,
    note:
      `Position calculée par le modèle SGP4 à partir de données NASA embarquées, et non observée en temps réel : ${precision}. ` +
      'Maquette agrandie environ 1 500 fois (envergure réelle : 109 m).',
  };
}
