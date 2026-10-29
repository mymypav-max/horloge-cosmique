import { describe, expect, it } from 'vitest';
import {
  NNBSP,
  describeRate,
  formatGeo,
  formatLongDate,
  formatNumber,
  formatOffset,
  formatPeriod,
  formatRate,
  formatRotation,
  formatTime,
  formatTimeWithSeconds,
  formatYear,
} from '../src/ui/format';

describe('mise en forme française', () => {
  it('affiche l’heure locale sur 24 h', () => {
    const d = new Date(2026, 9, 29, 7, 5, 9);
    expect(formatTime(d)).toBe('07:05');
    expect(formatTimeWithSeconds(d)).toBe('07:05:09');
  });

  it('affiche la date longue avec le jour de la semaine', () => {
    expect(formatLongDate(new Date(2026, 9, 29))).toBe('jeudi 29 octobre 2026');
    expect(formatLongDate(new Date(2026, 10, 1))).toBe('dimanche 1er novembre 2026');
    expect(formatLongDate(new Date(2024, 1, 29))).toBe('jeudi 29 février 2024');
  });

  it('gère les années avant notre ère', () => {
    expect(formatYear(2026)).toBe('2026');
    expect(formatYear(0)).toBe('1 av. J.-C.');
    expect(formatYear(-2999)).toBe('3000 av. J.-C.');
  });

  it('formate les nombres à la française', () => {
    expect(formatNumber(3600)).toBe(`3${NNBSP}600`);
    expect(formatNumber(147.6543, 1)).toBe('147,7');
    expect(formatNumber(-0.5, 2)).toBe('−0,50');
    expect(formatRate(2_629_800)).toBe(`×2${NNBSP}629${NNBSP}800`);
  });

  it('décrit les vitesses de simulation', () => {
    expect(describeRate(1)).toBe('vitesse réelle');
    expect(describeRate(3600)).toBe('1 h par seconde');
    expect(describeRate(86_400)).toBe('1 jour par seconde');
  });

  it('formate les décalages de temps', () => {
    expect(formatOffset(2 * 86_400_000 + 3 * 3_600_000)).toBe('+2 j 3 h');
    expect(formatOffset(-45 * 60_000)).toBe('−45 min');
    expect(formatOffset(20_000)).toBe('moins d’une minute');
    expect(formatOffset(3 * 31_557_600_000 + 5 * 86_400_000)).toBe('+3 ans 5 j');
  });

  it('formate les coordonnées géographiques', () => {
    expect(formatGeo(23.44, -132.4)).toBe('23,4° N · 132,4° O');
    expect(formatGeo(-13.6, 42.1)).toBe('13,6° S · 42,1° E');
  });

  it('formate rotations et périodes', () => {
    expect(formatRotation(23.9345)).toBe('23 h 56 min');
    expect(formatRotation(-5832.5)).toBe('243,0 jours');
    expect(formatPeriod(365.256)).toBe('365 jours');
    expect(formatPeriod(87.969)).toBe('88,0 jours');
    expect(formatPeriod(4332.59)).toBe('11,86 ans');
  });
});
