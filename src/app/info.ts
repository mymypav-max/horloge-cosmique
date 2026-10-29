/**
 * Contenu du panneau d'informations de la vue rapprochée.
 * Toutes les valeurs proviennent du modèle astronomique (données réelles),
 * jamais de la représentation visuelle.
 */

import { eclipticCoordinates } from '../astro/ephemeris';
import { centuriesTT } from '../astro/time';
import type { AstroState } from '../astro/state';
import { AU_KM, PLANETS, type PlanetId } from '../data/planets';
import { formatGeo, formatNumber, formatPeriod, formatRotation } from '../ui/format';
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

export function planetInfo(id: PlanetId, state: AstroState): { lines: InfoLine[]; note: string } {
  const info = PLANETS[id];
  const p = state.positions[id];
  const lines: InfoLine[] = [{ label: 'Distance au Soleil', value: distance(Math.hypot(p[0], p[1], p[2])) }];

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
