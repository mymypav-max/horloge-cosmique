import { describe, expect, it } from 'vitest';
import {
  JD_J2000,
  longTermDeltaTSeconds,
  centuriesTT,
  daysUT1,
  julianDateTT,
  julianDateUtc,
  taiMinusUtcSeconds,
  ttMinusUtcSeconds,
  utcMsFromJulianDate,
} from '../src/astro/time';

describe('échelles de temps', () => {
  it('convertit un instant Unix en jour julien UTC', () => {
    // Époque Unix : JD 2440587.5 (référence classique).
    expect(julianDateUtc(0)).toBe(2440587.5);
    // 2000-01-01T12:00:00Z → JD 2451545.0.
    expect(julianDateUtc(Date.UTC(2000, 0, 1, 12))).toBe(JD_J2000);
    // Meeus, exemple 7.a : 1957-10-04 19:26:24 UT → JD 2436116.31.
    expect(julianDateUtc(Date.UTC(1957, 9, 4, 19, 26, 24))).toBeCloseTo(2436116.31, 6);
  });

  it('est réversible', () => {
    const t = Date.UTC(2026, 9, 29, 21, 47, 13, 250);
    expect(utcMsFromJulianDate(julianDateUtc(t))).toBeCloseTo(t, 1);
  });

  it('applique la table des secondes intercalaires', () => {
    expect(taiMinusUtcSeconds(Date.UTC(1972, 0, 1))).toBe(10);
    expect(taiMinusUtcSeconds(Date.UTC(2000, 0, 1))).toBe(32);
    // Dernière seconde intercalaire : 31 décembre 2016 → TAI − UTC = 37 s.
    expect(taiMinusUtcSeconds(Date.UTC(2016, 11, 31, 23, 59, 59))).toBe(36);
    expect(taiMinusUtcSeconds(Date.UTC(2017, 0, 1))).toBe(37);
    expect(taiMinusUtcSeconds(Date.UTC(2026, 9, 29))).toBe(37);
  });

  it('calcule TT − UTC = TAI − UTC + 32,184 s', () => {
    expect(ttMinusUtcSeconds(Date.UTC(2000, 0, 1, 12))).toBeCloseTo(64.184, 9);
    expect(ttMinusUtcSeconds(Date.UTC(2026, 0, 1))).toBeCloseTo(69.184, 9);
  });

  it('estime ΔT avant 1972 (Morrison & Stephenson 2004)', () => {
    // Minimum de la parabole en 1820 : −20 s.
    expect(longTermDeltaTSeconds(Date.UTC(1820, 0, 1))).toBeCloseTo(-20, 0);
    // Vers 1900, ΔT réel ≈ −3 s ; la parabole donne ≈ 0,5 s.
    expect(Math.abs(ttMinusUtcSeconds(Date.UTC(1900, 0, 1)) - -2.8)).toBeLessThan(5);
    // Vers l'an 1000 : ΔT de l'ordre de 25 à 35 minutes.
    const dt1000 = ttMinusUtcSeconds(Date.UTC(1000, 0, 1));
    expect(dt1000).toBeGreaterThan(1500);
    expect(dt1000).toBeLessThan(2200);
  });

  it('place J2000.0 (TT) 64,184 s avant midi UTC le 1er janvier 2000', () => {
    const j2000Utc = Date.UTC(2000, 0, 1, 12) - 64_184;
    expect(julianDateTT(j2000Utc)).toBeCloseTo(JD_J2000, 9);
    expect(centuriesTT(j2000Utc)).toBeCloseTo(0, 12);
  });

  it('compte les siècles juliens et les jours UT1', () => {
    const t = Date.UTC(2100, 0, 1, 12) - 69_184;
    expect(centuriesTT(t)).toBeCloseTo(1, 6);
    expect(daysUT1(Date.UTC(2000, 0, 2, 12))).toBe(1);
  });
});
