import { describe, expect, it } from 'vitest';
import { Quaternion, type ShaderMaterial, Vector3 } from 'three';
import { computeAstroState } from '../src/astro/state';
import { subsolarPoint } from '../src/astro/earth';
import { DEG } from '../src/astro/math';
import { PLANET_IDS } from '../src/data/planets';
import { QUALITY_PRESETS } from '../src/perf/quality';
import { SceneGraph } from '../src/scene/SceneGraph';
import { emptyTextureSet } from '../src/scene/textures';
import { longitudeDiffDeg } from './helpers/reference';

/**
 * Tests de la scène 3D sans GPU : on vérifie que les objets Three.js reçoivent
 * bien les données du modèle astronomique quand la date change.
 */
function graphAt(utcMs: number): SceneGraph {
  const g = new SceneGraph(emptyTextureSet(), QUALITY_PRESETS.economy);
  g.applyAstroState(computeAstroState(utcMs));
  g.scene.updateMatrixWorld(true);
  return g;
}

/** Point subsolaire lu dans la scène : direction du Soleil ramenée dans le repère du globe. */
function subsolarFromScene(g: SceneGraph): { latDeg: number; lonDeg: number } {
  const sun = (g.earth.earthMaterial.uniforms.sunDir.value as Vector3).clone();
  const inv = new Quaternion().copy(g.earth.spin.quaternion).invert();
  sun.applyQuaternion(inv);
  // Repère local du maillage : +x = longitude 0°, −z = 90° E, +y = pôle Nord.
  return { latDeg: Math.asin(sun.y) / DEG, lonDeg: Math.atan2(-sun.z, sun.x) / DEG };
}

describe('scène 3D', () => {
  it('contient le Soleil, les huit planètes, les orbites, les étoiles et les anneaux de Saturne', () => {
    const g = graphAt(Date.UTC(2026, 9, 29));
    for (const id of PLANET_IDS) expect(g.scene.getObjectByName(`planet-${id}`)).toBeDefined();
    expect(g.scene.getObjectByName('sun')).toBeDefined();
    expect(g.scene.getObjectByName('saturn-rings')).toBeDefined();
    expect(g.scene.getObjectByName('stars')).toBeDefined();
    for (const id of PLANET_IDS) expect(g.scene.getObjectByName(`orbit-${id}`)).toBeDefined();
  });

  it('transmet au shader de la Terre une lumière cohérente avec le point subsolaire réel', () => {
    for (const t of [Date.UTC(2024, 5, 20, 20, 51), Date.UTC(2026, 9, 29, 3, 15), Date.UTC(2027, 11, 22, 12)]) {
      const fromScene = subsolarFromScene(graphAt(t));
      const ref = subsolarPoint(t);
      expect(fromScene.latDeg).toBeCloseTo(ref.latDeg, 4);
      expect(longitudeDiffDeg(fromScene.lonDeg, ref.lonDeg)).toBeLessThan(1e-4);
    }
  });

  it('fait tourner le globe et déplace le terminateur quand l’heure change', () => {
    const a = graphAt(Date.UTC(2026, 9, 29, 0));
    const b = graphAt(Date.UTC(2026, 9, 29, 6));
    // Six heures : la Terre a tourné d'environ 90,2° (rotation sidérale).
    expect(a.earth.spin.quaternion.angleTo(b.earth.spin.quaternion) / DEG).toBeCloseTo(90.2, 0);
    expect(longitudeDiffDeg(subsolarFromScene(a).lonDeg, subsolarFromScene(b).lonDeg)).toBeCloseTo(90, 0);
  });

  it('déplace les planètes quand la date change, et pas quand elle reste identique', () => {
    const a = graphAt(Date.UTC(2026, 0, 1));
    const a2 = graphAt(Date.UTC(2026, 0, 1));
    const b = graphAt(Date.UTC(2026, 6, 1));
    for (const id of PLANET_IDS) {
      const pa = a.planets[id].root.position;
      expect(pa.distanceTo(a2.planets[id].root.position)).toBe(0);
      expect(pa.distanceTo(b.planets[id].root.position)).toBeGreaterThan(0.01);
    }
  });

  it('oriente les anneaux de Saturne selon l’axe réel de la planète', () => {
    const g = graphAt(Date.UTC(2026, 9, 29));
    const ringNormal = (g.scene.getObjectByName('saturn-rings') as unknown as { material: ShaderMaterial }).material.uniforms
      .ringNormal.value as Vector3;
    // L'axe de Saturne est incliné de 26,7° sur son orbite (≈ 28° sur l'écliptique).
    const tiltFromEclipticPole = ringNormal.angleTo(new Vector3(0, 1, 0)) / DEG;
    expect(tiltFromEclipticPole).toBeGreaterThan(24);
    expect(tiltFromEclipticPole).toBeLessThan(30);
  });

  it('estompe les autres planètes en vue rapprochée, mais garde le Soleil (taille apparente réelle, V2)', () => {
    const g = graphAt(Date.UTC(2026, 9, 29));
    g.setDetailFade('earth', 1);
    expect(g.planets.earth.root.visible).toBe(true);
    expect(g.planets.mars.root.visible).toBe(false);
    expect(g.sun.root.visible).toBe(true);
    g.setDetailFade(null, 0);
    expect(g.planets.mars.root.visible).toBe(true);
    expect(g.sun.root.visible).toBe(true);
  });
});
