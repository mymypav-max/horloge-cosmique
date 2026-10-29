import { describe, expect, it } from 'vitest';
import { cycleSetting, DEFAULT_SETTINGS, SETTINGS_ENTRIES } from '../src/app/settings';
import { parseStartupOptions } from '../src/app/startup';
import { northernSeason } from '../src/app/info';
import { computeAstroState } from '../src/astro/state';
import { AdaptiveResolution } from '../src/perf/FrameScheduler';
import { detectQuality, isFireTv, QUALITY_PRESETS, resolveQuality } from '../src/perf/quality';
import { SceneView } from '../src/scene/SceneView';

describe('paramètres de démarrage', () => {
  it('lit l’instant, la vitesse, la vue et la qualité', () => {
    const o = parseStartupOptions('?t=2024-06-20T20:51:00Z&vitesse=3600&vue=Terre&qualite=economy&debug=1');
    expect(o.startTime).toBe(Date.UTC(2024, 5, 20, 20, 51));
    expect(o.startRate).toBe(3600);
    expect(o.view).toBe('earth');
    expect(o.quality).toBe('economy');
    expect(o.debug).toBe(true);
  });

  it('accepte les noms français accentués et ignore les valeurs invalides', () => {
    expect(parseStartupOptions('?vue=v%C3%A9nus').view).toBe('venus');
    const o = parseStartupOptions('?t=pas-une-date&vitesse=-3&qualite=ultra');
    expect(o.startTime).toBeNull();
    expect(o.startRate).toBeNull();
    expect(o.quality).toBeNull();
  });
});

describe('réglages', () => {
  it('fait défiler les valeurs en boucle', () => {
    let s = { ...DEFAULT_SETTINGS };
    s = cycleSetting(s, 0, 1);
    expect(s.quality).toBe('economy');
    s = cycleSetting(s, 0, -1);
    s = cycleSetting(s, 0, -1);
    expect(s.quality).toBe('high');
    s = cycleSetting(s, 1, 1);
    expect(s.clouds).toBe(false);
    expect(SETTINGS_ENTRIES.length).toBe(4);
  });
});

describe('qualité graphique', () => {
  const fireTvUa = 'Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

  it('reconnaît un Fire TV', () => {
    expect(isFireTv(fireTvUa)).toBe(true);
    expect(isFireTv('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0')).toBe(false);
  });

  it('choisit un niveau adapté à l’appareil', () => {
    expect(detectQuality({ userAgent: fireTvUa, webgl2: true, maxTextureSize: 4096 })).toBe('standard');
    expect(detectQuality({ userAgent: fireTvUa, webgl2: false, maxTextureSize: 4096 })).toBe('economy');
    expect(detectQuality({ userAgent: 'Windows Chrome', webgl2: true, maxTextureSize: 16384, deviceMemory: 8 })).toBe('high');
  });

  it('n’utilise jamais une texture plus grande que le maximum du GPU', () => {
    const p = resolveQuality('high', { userAgent: '', webgl2: true, maxTextureSize: 2048 });
    expect(p.earthDayWidth).toBe(2048);
  });

  it('calcule en 1920 × 1080 sur un Fire TV qui expose 960 × 540 px CSS', () => {
    const ratio = SceneView.baseRatio(2, 540, QUALITY_PRESETS.standard.maxRenderHeight);
    expect(ratio * 540).toBe(1080);
    expect(SceneView.baseRatio(1, 1080, QUALITY_PRESETS.standard.maxRenderHeight)).toBe(1);
    expect(SceneView.baseRatio(2, 540, QUALITY_PRESETS.economy.maxRenderHeight) * 540).toBe(720);
  });

  it('réduit la résolution si les images sont trop lentes, puis la rétablit', () => {
    const a = new AdaptiveResolution(0.6, 1);
    let scale = 1;
    let now = 0;
    for (let k = 0; k < 400 && scale === 1; k++) {
      now += 33;
      scale = a.sample(33, 60, now, scale) ?? scale;
    }
    expect(scale).toBeCloseTo(0.9, 6);
    for (let k = 0; k < 2000 && scale < 1; k++) {
      now += 16;
      scale = a.sample(16, 60, now, scale) ?? scale;
    }
    expect(scale).toBeCloseTo(1, 6);
  });
});

describe('informations affichées', () => {
  it('donne la saison astronomique de l’hémisphère nord', () => {
    expect(northernSeason(computeAstroState(Date.UTC(2026, 3, 15)))).toBe('printemps');
    expect(northernSeason(computeAstroState(Date.UTC(2026, 6, 15)))).toBe('été');
    expect(northernSeason(computeAstroState(Date.UTC(2026, 9, 29)))).toBe('automne');
    expect(northernSeason(computeAstroState(Date.UTC(2026, 11, 25)))).toBe('hiver');
    // Équinoxe de mars 2026 : 20 mars vers 14 h 46 UTC.
    expect(northernSeason(computeAstroState(Date.UTC(2026, 2, 20, 13)))).toBe('hiver');
    expect(northernSeason(computeAstroState(Date.UTC(2026, 2, 20, 16)))).toBe('printemps');
  });
});
