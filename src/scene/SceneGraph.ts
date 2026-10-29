/**
 * Assemblage de la scène 3D (sans moteur de rendu, donc testable sous Node).
 */

import { AdditiveBlending, Scene, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { AstroState } from '../astro/state';
import { PLANET_IDS, type PlanetId } from '../data/planets';
import type { QualityPreset } from '../perf/quality';
import { type BodyLayout, layoutBodies, layoutSunOrientation } from '../representation/layout';
import { EarthBody, PlanetBody, SunBody } from './bodies';
import { makeFocusRingTexture } from './glowTexture';
import { Orbits } from './orbits';
import { SatelliteSystem } from './satellites';
import { createStarfield } from './starfield';
import type { TextureSet } from './textures';

/** Recalcul des orbites quand le temps simulé a varié de plus de 30 jours. */
const ORBIT_REFRESH_MS = 30 * 86_400_000;

export class SceneGraph {
  readonly scene = new Scene();
  readonly sun: SunBody;
  readonly planets: Record<PlanetId, PlanetBody>;
  readonly earth: EarthBody;
  readonly orbits = new Orbits();
  readonly satellites: SatelliteSystem;
  readonly stars;
  readonly focusRing: Sprite;
  layout: Record<PlanetId, BodyLayout> | null = null;
  lastState: AstroState | null = null;
  private orbitsComputedAt = Number.NaN;

  constructor(textures: TextureSet, quality: QualityPreset) {
    this.scene.name = 'horloge-cosmique';
    this.stars = createStarfield(quality.maxStars);
    this.scene.add(this.stars);
    this.scene.add(this.orbits.group);

    this.sun = new SunBody(textures.sun, quality.sphereSegments);
    this.scene.add(this.sun.root);

    this.earth = new EarthBody(textures.earthDay, textures.earthData, quality.earthSegments);
    const planets = {} as Record<PlanetId, PlanetBody>;
    for (const id of PLANET_IDS) {
      const body = id === 'earth' ? this.earth : new PlanetBody(id, textures.planets[id] ?? null, quality.sphereSegments);
      if (id === 'saturn') body.addRings(textures.saturnRing, quality.sphereSegments);
      planets[id] = body;
      this.scene.add(body.root);
    }
    this.planets = planets;

    this.satellites = new SatelliteSystem(quality);
    this.scene.add(this.satellites.group);

    this.focusRing = new Sprite(
      new SpriteMaterial({
        map: makeFocusRingTexture(),
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        opacity: 0,
      }),
    );
    this.focusRing.name = 'focus-ring';
    this.focusRing.renderOrder = 10;
    this.scene.add(this.focusRing);
  }

  /** Applique un nouvel état astronomique à tous les objets. */
  applyAstroState(state: AstroState): void {
    this.lastState = state;
    this.layout = layoutBodies(state);
    for (const id of PLANET_IDS) this.planets[id].applyLayout(this.layout[id]);
    this.sun.setOrientation(layoutSunOrientation(state));
    if (!(Math.abs(state.utcMs - this.orbitsComputedAt) < ORBIT_REFRESH_MS)) {
      this.orbits.update(state.utcMs);
      this.orbitsComputedAt = state.utcMs;
    }
  }

  /**
   * Estompe les autres planètes et leurs orbites (fade = 0 : vue générale,
   * fade = 1 : vue rapprochée, où seuls la planète observée, ses satellites,
   * le Soleil — à sa taille apparente réelle — et les étoiles restent).
   */
  setDetailFade(subject: PlanetId | null, fade: number): void {
    const others = 1 - fade;
    for (const id of PLANET_IDS) this.planets[id].setOpacity(id === subject ? 1 : others);
    this.orbits.setOpacityScale(others);
  }

  /** Taille d'affichage du Soleil (vue générale : taille fixe ; vues rapprochées : taille apparente réelle). */
  setSunDisplaySize(radius: number, glowDiameter: number): void {
    this.sun.setDisplaySize(radius, glowDiameter);
  }

  /** Distance de la caméra à la surface la plus proche (planètes et satellites affichés). */
  nearestSurfaceDistance(camera: Vector3): number {
    let nearest = Infinity;
    for (const body of Object.values(this.planets)) {
      if (!body.root.visible) continue;
      nearest = Math.min(nearest, body.root.position.distanceTo(camera) - body.radius * 2.4);
    }
    return Math.min(nearest, this.satellites.nearestSurfaceDistance(camera));
  }

  planetPosition(id: PlanetId, target = new Vector3()): Vector3 {
    return target.copy(this.planets[id].root.position);
  }
}
