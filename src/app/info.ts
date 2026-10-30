/**
 * Contenu du panneau d'informations de la vue rapprochée.
 * Toutes les valeurs proviennent du modèle astronomique (données réelles),
 * jamais de la représentation visuelle.
 */

import { eclipticCoordinates } from '../astro/ephemeris';
import {
  ISS_DATA,
  ISS_DATA_START_MS,
  ISS_DATA_STOP_MS,
  ISS_ELEMENTS_EPOCH_MS,
  ISS_EXTRAPOLATION_DAYS,
  ISS_FIRST_MODULE_LAUNCH_MS,
  ISS_FORECAST_CREATED_MS,
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
import { MOONS, type MoonId, type RepresentationNote } from '../data/moons';
import { AU_KM, PLANETS, type PlanetId } from '../data/planets';
import {
  capitalize,
  formatElapsed,
  formatGeo,
  formatKm,
  formatNumber,
  formatOrbitPeriod,
  formatPeriod,
  formatRotation,
  formatSmallAngle,
  formatUtc,
  formatUtcDate,
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

/** Mentions affichées dans les fiches des lunes (qualité de la représentation visuelle). */
export const REPRESENTATION_TEXT: Record<RepresentationNote, string> = {
  photoMap: 'Carte photographique',
  partialMap: 'Carte partiellement reconstituée',
  unseenRegions: 'Certaines régions n’ont jamais été photographiées',
  approximate: 'Représentation approximative',
  noMap: 'Aucune carte photographique disponible',
  infrared: 'Texture issue d’observations infrarouges',
  sphere: 'Forme représentée par une sphère',
};

export function moonInfo(id: MoonId, state: AstroState): { lines: InfoLine[]; note: string; representation: string[] } {
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
  return {
    lines,
    note: `${moon.description} ${precision} Taille et distance affichées non à l’échelle.`,
    representation: moon.representation.map((k) => REPRESENTATION_TEXT[k]),
  };
}

/** « prévision NASA du 28 octobre 2026 » : la source des éléments embarqués. */
const ISS_FORECAST = `prévision NASA du ${formatUtcDate(ISS_FORECAST_CREATED_MS)}`;
export const ISS_FORECAST_LABEL = capitalize(ISS_FORECAST);

/** Statut affiché (fiche et liste des satellites). */
export function issValidityText(v: IssValidity): string {
  if (v.status === 'nominal') return ISS_FORECAST_LABEL;
  return v.status === 'extrapolation' ? 'Extrapolation' : 'Indisponible';
}

/** Message (bref) et explication lorsque l'ISS est masquée. */
export function issUnavailableText(v: IssValidity): { toast: string; note: string } {
  if (v.reason === 'beforeLaunch') {
    return {
      toast: 'ISS : pas encore en orbite à cette date',
      note: `ISS : pas encore en orbite à cette date (premier module lancé le ${formatUtcDate(ISS_FIRST_MODULE_LAUNCH_MS)}).`,
    };
  }
  if (v.reason === 'beforeData') {
    return {
      toast: 'ISS : aucune donnée orbitale pour cette date',
      note: `ISS masquée : aucune donnée orbitale embarquée pour cette date (${ISS_FORECAST}, valable à partir du ${formatUtc(ISS_DATA_START_MS)}).`,
    };
  }
  return {
    toast: 'ISS masquée : données orbitales expirées, à actualiser',
    note:
      `ISS masquée : la ${ISS_FORECAST} a expiré le ${formatUtc(ISS_DATA_STOP_MS)}, ` +
      `il y a plus de ${ISS_EXTRAPOLATION_DAYS} jours. Les données orbitales doivent être actualisées (mise à jour de l’application).`,
  };
}

const ISS_MODEL_SCALE = 'Maquette agrandie environ 1 500 fois (envergure réelle : 109 m).';

export function issInfo(state: IssState): { lines: InfoLine[]; note: string } {
  const v = state.validity;
  const lines: InfoLine[] = [
    { label: 'Nature', value: 'station habitée (satellite artificiel)' },
    { label: 'Altitude calculée', value: `${formatNumber(state.altitudeKm, 0)} km` },
    { label: 'Vitesse', value: `${formatNumber(state.speedKmS, 2)} km/s` },
    { label: 'Période orbitale', value: `${formatNumber(ISS_PERIOD_MINUTES, 1)} min` },
    { label: 'Inclinaison', value: `${formatNumber(ISS_INCLINATION_DEG, 1)}°` },
    { label: 'Éléments (époque)', value: formatUtc(ISS_ELEMENTS_EPOCH_MS) },
    { label: 'Validité', value: issValidityText(v) },
  ];
  if (v.status === 'extrapolation') {
    lines.push(
      v.beforeData
        ? { label: 'Avant la prévision de', value: formatElapsed(v.daysOutside) }
        : { label: 'Prévision expirée depuis', value: formatElapsed(v.daysOutside) },
    );
  }
  const forecast = `${ISS_FORECAST} (valable du ${formatUtc(ISS_DATA_START_MS)} au ${formatUtc(ISS_DATA_STOP_MS)})`;
  const note =
    v.status === 'nominal'
      ? `Position calculée par le modèle SGP4 à partir d’éléments ajustés par le projet sur la ${forecast}, et non observée en temps réel. ` +
        `Écart ≤ ${formatNumber(Math.ceil(ISS_DATA.fit.maxKm), 0)} km avec cette prévision : il s’agit d’une comparaison avec la prévision, pas avec la position réelle de la station.`
      : `Position extrapolée par le modèle SGP4 hors de la ${forecast}, et non observée en temps réel. ` +
        'Aucune précision n’est garantie : une manœuvre orbitale non intégrée (rehaussement, évitement de débris) peut décaler la station de centaines de kilomètres ou davantage.';
  return { lines, note: `${note} ${ISS_MODEL_SCALE}` };
}
