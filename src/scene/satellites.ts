/**
 * Satellites affichés autour de la planète observée : lunes (sphères
 * texturées, rotation synchrone), orbites, et maquette de l'ISS.
 *
 * Ces objets n'apparaissent qu'en vue rapprochée de leur planète : la vue
 * générale reste inchangée. Les cartes des lunes ne sont chargées qu'à
 * l'ouverture du système concerné (mémoire graphique limitée du Fire TV) ;
 * celles du système précédent sont alors libérées.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  TextureLoader,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ISS_PERIOD_MINUTES, issOrbitPath, issState } from '../astro/iss';
import type { Mat3, Vec3 } from '../astro/math';
import { cross, normalize } from '../astro/math';
import { moonBodyAxes, moonOrbitNormal, moonOrbitPath, moonPeriodDays, moonPosition } from '../astro/moons';
import { sunlightFraction } from '../astro/shadow';
import { MOONS, MOONS_BY_PLANET, MOON_IDS, type MoonId } from '../data/moons';
import { AU_KM, PLANETS, type PlanetId } from '../data/planets';
import type { QualityPreset } from '../perf/quality';
import type { BodyLayout } from '../representation/layout';
import { astroToScene } from '../representation/sceneFrame';
import {
  ISS_VISUAL_SPAN,
  type SatelliteId,
  type SatelliteLayout,
  moonOrientation,
  moonVisualRadius,
  satelliteSceneOffset,
} from '../representation/satellites';
import { setRotationFromMat3 } from './bodies';
import { ISS_FRAGMENT, ISS_VERTEX, PLANET_FRAGMENT, SURFACE_VERTEX } from './shaders';

const BASE = `${import.meta.env.BASE_URL}textures/moons/`;
/** Lunes sans carte globale publiée : couleur uniforme. */
const NO_MAP: ReadonlySet<MoonId> = new Set<MoonId>(['proteus', 'nereid']);
const ORBIT_POINTS = 160;
const ORBIT_COLOR = new Color(0.55, 0.68, 0.9);
const ISS_ORBIT_COLOR = new Color(1.0, 0.78, 0.45);
const ORBIT_OPACITY = 0.32;
const ORBIT_SELECTED_OPACITY = 0.75;

function setVec(target: Vector3, v: Vec3): void {
  target.set(v[0], v[1], v[2]);
}

class MoonBody {
  readonly root = new Group();
  readonly spin = new Group();
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly radius: number;

  constructor(
    readonly id: MoonId,
    segments: number,
  ) {
    const info = MOONS[id];
    this.radius = moonVisualRadius(id);
    // Titan : brume orangée au limbe.
    const rim = id === 'titan' ? [1.0, 0.65, 0.3, 0.5] : [0, 0, 0, 0];
    this.material = new ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: PLANET_FRAGMENT,
      uniforms: {
        map: { value: null },
        hasMap: { value: 0 },
        fallbackColor: { value: new Color(info.fallbackColor) },
        sunDir: { value: new Vector3(1, 0, 0) },
        ambient: { value: 0.012 },
        rimColor: { value: new Color(rim[0], rim[1], rim[2]) },
        rimStrength: { value: rim[3] },
        opacity: { value: 1 },
        sunLight: { value: 1 },
        // Lune éclipsée : faible lumière rouge réfractée par l'atmosphère terrestre (teinte indicative).
        shadowTint: { value: id === 'moon' ? new Color(0.06, 0.016, 0.006) : new Color(0, 0, 0) },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(1, segments, Math.max(12, segments / 2)), this.material);
    this.mesh.name = `moon-${id}`;
    this.spin.add(this.mesh);
    this.root.add(this.spin);
    this.root.scale.setScalar(this.radius);
    this.root.visible = false;
  }

  setTexture(texture: Texture | null): void {
    const u = this.material.uniforms;
    u.map.value = texture;
    u.hasMap.value = texture ? 1 : 0;
  }

  setOpacity(opacity: number): void {
    this.root.visible = opacity > 0.01;
    this.material.uniforms.opacity.value = opacity;
    this.material.transparent = opacity < 0.999;
  }
}

/** Maquette simplifiée de l'ISS : poutre, modules pressurisés, radiateurs et panneaux solaires orientables. */
class IssModel {
  readonly root = new Group();
  /** Panneaux solaires : tournent autour de l'axe de la poutre (joints rotatifs) pour faire face au Soleil. */
  readonly arrays = new Group();
  readonly material: ShaderMaterial;

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: ISS_VERTEX,
      fragmentShader: ISS_FRAGMENT,
      uniforms: { sunDir: { value: new Vector3(1, 0, 0) }, opacity: { value: 1 }, sunLight: { value: 1 } },
      side: DoubleSide,
    });
    // Repère local : x = sens du mouvement, z = axe de la poutre (normale à l'orbite), y = z × x.
    const truss: [number, number, number] = [0.62, 0.62, 0.6];
    const module: [number, number, number] = [0.86, 0.86, 0.83];
    const radiator: [number, number, number] = [0.95, 0.95, 0.95];
    const panel: [number, number, number] = [0.42, 0.33, 0.24];
    const parts: BufferGeometry[] = [];
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, tint: [number, number, number]) => {
      const g = new BoxGeometry(sx, sy, sz);
      g.translate(x, y, z);
      parts.push(withTint(g, tint));
    };
    const tube = (radius: number, length: number, axis: 'x' | 'z', x: number, y: number, z: number) => {
      const g = new CylinderGeometry(radius, radius, length, 12, 1);
      if (axis === 'x') g.rotateZ(Math.PI / 2);
      else g.rotateX(Math.PI / 2);
      g.translate(x, y, z);
      parts.push(withTint(g, module));
    };
    box(0.03, 0.03, 1.0, 0, 0, 0, truss);
    // Modules pressurisés (segment américain à l'avant, russe à l'arrière) et nœuds transversaux.
    tube(0.024, 0.62, 'x', -0.04, 0.04, 0);
    tube(0.02, 0.16, 'z', 0.2, 0.04, 0);
    tube(0.02, 0.12, 'z', 0.05, 0.04, 0);
    // Radiateurs.
    box(0.004, 0.2, 0.07, 0, -0.12, 0.2, radiator);
    box(0.004, 0.2, 0.07, 0, -0.12, -0.2, radiator);
    // Petits panneaux du module russe.
    box(0.01, 0.003, 0.2, -0.3, 0.04, 0.12, panel);
    box(0.01, 0.003, 0.2, -0.3, 0.04, -0.12, panel);
    const structure = new Mesh(mergeGeometries(parts), this.material);
    structure.name = 'iss-structure';
    this.root.add(structure);

    const wings: BufferGeometry[] = [];
    for (const z of [-0.47, -0.35, 0.35, 0.47]) {
      for (const side of [1, -1]) {
        const g = new BoxGeometry(0.004, 0.34, 0.1);
        g.translate(0, side * (0.03 + 0.17), z);
        wings.push(withTint(g, panel));
      }
    }
    const arrayMesh = new Mesh(mergeGeometries(wings), this.material);
    arrayMesh.name = 'iss-arrays';
    this.arrays.add(arrayMesh);
    this.root.add(this.arrays);
    this.root.scale.setScalar(ISS_VISUAL_SPAN);
    this.root.name = 'iss';
    this.root.visible = false;
  }

  /** Oriente la maquette (vitesse, normale à l'orbite) et ses panneaux vers le Soleil (vecteurs de la scène). */
  orient(velocity: Vec3, normal: Vec3, sun: Vec3): Mat3 {
    const x = normalize(velocity);
    const z = normalize(normal);
    const y = cross(z, x);
    const m: Mat3 = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
    setRotationFromMat3(this.root, m);
    // Normale des panneaux (+x local des ailes) tournée vers la projection du Soleil dans le plan (x, y).
    const sx = sun[0] * x[0] + sun[1] * x[1] + sun[2] * x[2];
    const sy = sun[0] * y[0] + sun[1] * y[1] + sun[2] * y[2];
    this.arrays.rotation.set(0, 0, Math.atan2(sy, sx));
    setVec(this.material.uniforms.sunDir.value, sun);
    return m;
  }

  setOpacity(opacity: number): void {
    this.root.visible = opacity > 0.01;
    this.material.uniforms.opacity.value = opacity;
    this.material.transparent = opacity < 0.999;
  }
}

function withTint(geometry: BufferGeometry, tint: [number, number, number]): BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) data.set(tint, k * 3);
  geometry.setAttribute('tint', new BufferAttribute(data, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

function makeOrbitLine(name: string, color: Color): LineLoop {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(ORBIT_POINTS * 3), 3));
  geometry.setDrawRange(0, 0);
  const line = new LineLoop(geometry, new LineBasicMaterial({ color, transparent: true, opacity: ORBIT_OPACITY, depthWrite: false }));
  line.name = name;
  line.frustumCulled = false;
  line.renderOrder = -1;
  line.visible = false;
  return line;
}

export class SatelliteSystem {
  readonly group = new Group();
  /** Orbites, exprimées par rapport au centre de la planète (groupe positionné sur elle). */
  readonly orbitGroup = new Group();
  readonly moons = {} as Record<MoonId, MoonBody>;
  readonly iss = new IssModel();
  /** Mises en page de l'image courante (positions de la scène). */
  layouts: Partial<Record<SatelliteId, SatelliteLayout>> = {};
  active: PlanetId | null = null;
  private readonly orbits = new Map<SatelliteId, LineLoop>();
  private readonly orbitTimes = new Map<SatelliteId, number>();
  private readonly textures = new Map<MoonId, Texture | null>();
  private readonly loader = new TextureLoader();
  private issVisible = false;

  constructor(quality: QualityPreset) {
    this.group.name = 'satellites';
    this.group.add(this.orbitGroup);
    for (const id of MOON_IDS) {
      const big = MOONS[id].radiusKm > 1000;
      const body = new MoonBody(id, big ? quality.sphereSegments : Math.max(24, quality.sphereSegments / 2));
      this.moons[id] = body;
      this.group.add(body.root);
      const line = makeOrbitLine(`orbit-${id}`, ORBIT_COLOR);
      this.orbits.set(id, line);
      this.orbitGroup.add(line);
    }
    this.group.add(this.iss.root);
    const issLine = makeOrbitLine('orbit-iss', ISS_ORBIT_COLOR);
    this.orbits.set('iss', issLine);
    this.orbitGroup.add(issLine);
  }

  /** Système affiché : charge ses cartes et libère celles du système précédent. */
  activate(planet: PlanetId | null): void {
    if (planet === this.active) return;
    if (planet) {
      for (const [id, texture] of this.textures) {
        if (MOONS[id].parent !== planet && texture) {
          texture.dispose();
          this.moons[id].setTexture(null);
          this.textures.delete(id);
        }
      }
      for (const id of MOONS_BY_PLANET[planet]) this.loadTexture(id);
    }
    this.active = planet;
    this.orbitTimes.clear();
  }

  private loadTexture(id: MoonId): void {
    if (this.textures.has(id) || NO_MAP.has(id)) return;
    this.textures.set(id, null);
    this.loader.load(
      `${BASE}${id}.jpg`,
      (texture) => {
        texture.colorSpace = NoColorSpace;
        texture.minFilter = LinearMipmapLinearFilter;
        if (this.textures.has(id) && MOONS[id].parent === this.active) {
          this.textures.set(id, texture);
          this.moons[id].setTexture(texture);
        } else {
          texture.dispose();
        }
      },
      undefined,
      () => console.warn(`Carte introuvable : ${id}`),
    );
  }

  /** Vrai si la carte d'une lune est chargée (ou si elle n'en a pas). */
  isReady(id: MoonId): boolean {
    return NO_MAP.has(id) || Boolean(this.textures.get(id));
  }

  /**
   * Met à jour le système actif pour l'instant simulé : positions (calculées
   * à chaque image pour un mouvement fluide), orientations, éclairage,
   * orbites et opacité.
   */
  update(
    utcMs: number,
    parent: BodyLayout | null,
    parentHelioAu: Vec3 | null,
    opacity: number,
    selected: SatelliteId | null,
    showIss: boolean,
  ): void {
    this.layouts = {};
    const visible = Boolean(parent) && opacity > 0.01;
    for (const id of MOON_IDS) {
      if (!visible || MOONS[id].parent !== this.active) this.moons[id].setOpacity(0);
    }
    for (const [id, line] of this.orbits) {
      if (!visible || (id === 'iss' ? this.active !== 'earth' : MOONS[id].parent !== this.active)) line.visible = false;
    }
    this.issVisible = false;
    if (!visible || !parent || parent.id !== this.active) {
      this.iss.setOpacity(0);
      return;
    }
    const center = parent.position;
    this.orbitGroup.position.set(center[0], center[1], center[2]);
    const sun = parent.sunDirection;
    // Ombre de la planète (géométrie réelle, en km).
    const helio = parentHelioAu ?? [1, 0, 0];
    const helioDist = Math.hypot(helio[0], helio[1], helio[2]);
    const toSun: Vec3 = [-helio[0] / helioDist, -helio[1] / helioDist, -helio[2] / helioDist];
    const light = (p: Vec3) => (parentHelioAu ? sunlightFraction(p, toSun, helioDist * AU_KM, PLANETS[parent.id].radiusKm) : 1);

    for (const id of MOONS_BY_PLANET[parent.id]) {
      const km = moonPosition(id, utcMs);
      const offset = satelliteSceneOffset(parent.id, km);
      const position: Vec3 = [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]];
      const axes = moonBodyAxes(id, utcMs);
      const orientation = moonOrientation(axes.toParent, axes.north);
      const body = this.moons[id];
      setVec(body.root.position, position);
      setRotationFromMat3(body.spin, orientation);
      setVec(body.material.uniforms.sunDir.value, sun);
      body.material.uniforms.sunLight.value = light(km);
      body.setOpacity(opacity);
      const normal = astroToScene(moonOrbitNormal(id, utcMs));
      this.layouts[id] = { id, parent: parent.id, position, radius: body.radius, orientation, sunDirection: sun, orbitNormal: normal };
      this.updateOrbit(id, utcMs, moonPeriodDays(id) * 86_400_000, () => moonOrbitPath(id, utcMs, ORBIT_POINTS), opacity, selected);
    }

    const iss = parent.id === 'earth' && showIss ? issState(utcMs) : null;
    if (iss) {
      const offset = satelliteSceneOffset('earth', iss.position);
      const position: Vec3 = [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]];
      const velocity = astroToScene(iss.velocity);
      const normal = normalize(cross(astroToScene(iss.position), velocity));
      setVec(this.iss.root.position, position);
      const orientation = this.iss.orient(velocity, normal, sun);
      this.iss.material.uniforms.sunLight.value = light(iss.position);
      this.iss.setOpacity(opacity);
      this.issVisible = true;
      this.layouts.iss = { id: 'iss', parent: 'earth', position, radius: ISS_VISUAL_SPAN / 2, orientation, sunDirection: sun, orbitNormal: normal };
      this.updateOrbit('iss', utcMs, ISS_PERIOD_MINUTES * 60_000, () => issOrbitPath(utcMs, ORBIT_POINTS), opacity, selected);
    } else {
      this.iss.setOpacity(0);
      this.orbits.get('iss')!.visible = false;
    }
  }

  /** Recalcule une orbite si le temps simulé a avancé de plus de 1/400 de période (l'astre reste sur sa courbe). */
  private updateOrbit(id: SatelliteId, utcMs: number, periodMs: number, path: () => Vec3[], opacity: number, selected: SatelliteId | null): void {
    const line = this.orbits.get(id)!;
    const last = this.orbitTimes.get(id);
    if (last === undefined || Math.abs(utcMs - last) > periodMs / 400) {
      const parent = id === 'iss' ? 'earth' : MOONS[id].parent;
      const pts = path().map((p) => satelliteSceneOffset(parent, p));
      const attr = line.geometry.getAttribute('position') as BufferAttribute;
      const arr = attr.array as Float32Array;
      pts.forEach((p, k) => arr.set(p, k * 3));
      attr.needsUpdate = true;
      line.geometry.setDrawRange(0, pts.length);
      line.geometry.computeBoundingSphere();
      this.orbitTimes.set(id, utcMs);
    }
    const material = line.material as LineBasicMaterial;
    material.opacity = (id === selected ? ORBIT_SELECTED_OPACITY : ORBIT_OPACITY) * opacity;
    line.visible = opacity > 0.01;
  }

  get issShown(): boolean {
    return this.issVisible;
  }

  /** Distance de la caméra à la surface du satellite visible le plus proche (pour le plan de coupe proche). */
  nearestSurfaceDistance(camera: Vector3): number {
    let nearest = Infinity;
    for (const layout of Object.values(this.layouts)) {
      if (!layout) continue;
      const d = Math.hypot(camera.x - layout.position[0], camera.y - layout.position[1], camera.z - layout.position[2]);
      nearest = Math.min(nearest, d - layout.radius * 1.2);
    }
    return nearest;
  }
}
