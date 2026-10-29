/**
 * Objets 3D de la scène : Soleil, planètes, Terre détaillée, anneaux.
 * Ces objets ne calculent rien d'astronomique : ils appliquent la mise en
 * page (src/representation/layout.ts) qui leur est fournie.
 */

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector3,
} from 'three';
import type { Mat3, Vec3 } from '../astro/math';
import { PLANETS, type PlanetId } from '../data/planets';
import type { BodyLayout } from '../representation/layout';
import { SATURN_RING_INNER, SATURN_RING_OUTER, SUN_VISUAL_RADIUS } from '../representation/visualScale';
import { makeSunGlowTexture } from './glowTexture';
import {
  ATMOSPHERE_FRAGMENT,
  EARTH_FRAGMENT,
  PLANET_FRAGMENT,
  RING_FRAGMENT,
  RING_VERTEX,
  SUN_FRAGMENT,
  SURFACE_VERTEX,
} from './shaders';

const tmpMatrix = new Matrix4();

/** Applique une matrice de rotation 3×3 (ligne par ligne) à un objet. */
export function setRotationFromMat3(object: { quaternion: { setFromRotationMatrix(m: Matrix4): unknown } }, m: Mat3): void {
  tmpMatrix.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  object.quaternion.setFromRotationMatrix(tmpMatrix);
}

function setVec(target: Vector3, v: Vec3): void {
  target.set(v[0], v[1], v[2]);
}

/** Atmosphères discrètes des planètes (couleur du limbe éclairé). */
const RIM: Partial<Record<PlanetId, [number, number, number, number]>> = {
  venus: [1.0, 0.85, 0.6, 0.35],
  mars: [0.9, 0.55, 0.4, 0.12],
  jupiter: [0.9, 0.8, 0.65, 0.15],
  saturn: [0.95, 0.85, 0.6, 0.15],
  uranus: [0.6, 0.9, 1.0, 0.3],
  neptune: [0.45, 0.6, 1.0, 0.3],
};

export class PlanetBody {
  /** Groupe positionné dans la scène (ne tourne pas). */
  readonly root = new Group();
  /** Groupe orienté selon le repère propre du corps (tourne avec lui). */
  readonly spin = new Group();
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  atmosphere: Mesh | null = null;
  rings: Mesh | null = null;
  private ringMaterial: ShaderMaterial | null = null;
  radius = 1;

  constructor(
    readonly id: PlanetId,
    texture: Texture | null,
    segments: number,
  ) {
    const info = PLANETS[id];
    const rim = RIM[id] ?? [0, 0, 0, 0];
    this.material = new ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: PLANET_FRAGMENT,
      uniforms: {
        map: { value: texture },
        hasMap: { value: texture ? 1 : 0 },
        fallbackColor: { value: new Color(info.fallbackColor) },
        sunDir: { value: new Vector3(1, 0, 0) },
        ambient: { value: 0.015 },
        rimColor: { value: new Color(rim[0], rim[1], rim[2]) },
        rimStrength: { value: rim[3] },
        opacity: { value: 1 },
        sunLight: { value: 1 },
        shadowTint: { value: new Color(0, 0, 0) },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(1, segments, Math.max(16, segments / 2)), this.material);
    this.mesh.name = id;
    this.spin.add(this.mesh);
    this.root.add(this.spin);
    this.root.name = `planet-${id}`;
  }

  addRings(texture: Texture | null, segments: number): void {
    const geometry = new RingGeometry(SATURN_RING_INNER, SATURN_RING_OUTER, segments * 2, 1);
    // Coordonnée radiale (0 = bord intérieur, 1 = bord extérieur) pour la texture.
    const pos = geometry.getAttribute('position');
    const radial = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
      const r = Math.hypot(pos.getX(k), pos.getY(k));
      radial[k] = (r - SATURN_RING_INNER) / (SATURN_RING_OUTER - SATURN_RING_INNER);
    }
    geometry.setAttribute('radial', new BufferAttribute(radial, 1));
    // Plan des anneaux = plan équatorial (XZ local, le pôle étant +y).
    geometry.rotateX(-Math.PI / 2);
    this.ringMaterial = new ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      uniforms: {
        ringMap: { value: texture },
        hasMap: { value: texture ? 1 : 0 },
        sunDir: { value: new Vector3(1, 0, 0) },
        planetCenter: { value: new Vector3() },
        planetRadius: { value: 1 },
        ringNormal: { value: new Vector3(0, 1, 0) },
        opacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.rings = new Mesh(geometry, this.ringMaterial);
    this.rings.name = `${this.id}-rings`;
    this.rings.renderOrder = 2;
    this.spin.add(this.rings);
  }

  addAtmosphere(color: Color, intensity: number, segments: number, scale = 1.03): void {
    const material = new ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: {
        sunDir: { value: new Vector3(1, 0, 0) },
        glowColor: { value: color },
        intensity: { value: intensity },
        // −dot(N, V) au niveau du limbe de la planète pour une coque de rayon « scale ».
        limbDot: { value: Math.sqrt(1 - 1 / (scale * scale)) },
        opacity: { value: 1 },
      },
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.atmosphere = new Mesh(new SphereGeometry(scale, segments, Math.max(16, segments / 2)), material);
    this.atmosphere.name = `${this.id}-atmosphere`;
    this.atmosphere.renderOrder = 1;
    this.spin.add(this.atmosphere);
  }

  /**
   * Opacité globale (0 = masqué). Sert à estomper les autres corps quand la
   * caméra s'approche d'une planète : vus de près, leurs tailles et distances
   * non réalistes deviendraient trompeuses.
   */
  setOpacity(opacity: number): void {
    const visible = opacity > 0.01;
    this.root.visible = visible;
    if (!visible) return;
    for (const material of this.materials()) {
      material.uniforms.opacity.value = opacity;
      material.transparent = opacity < 0.999 || material === this.ringMaterial || material === this.atmosphere?.material;
    }
  }

  protected materials(): ShaderMaterial[] {
    const list = [this.mesh.material as ShaderMaterial];
    if (this.ringMaterial) list.push(this.ringMaterial);
    if (this.atmosphere) list.push(this.atmosphere.material as ShaderMaterial);
    return list;
  }

  applyLayout(layout: BodyLayout): void {
    setVec(this.root.position, layout.position);
    this.radius = layout.radius;
    this.root.scale.setScalar(layout.radius);
    setRotationFromMat3(this.spin, layout.orientation);
    const sun = this.material.uniforms.sunDir.value as Vector3;
    setVec(sun, layout.sunDirection);
    if (this.atmosphere) setVec((this.atmosphere.material as ShaderMaterial).uniforms.sunDir.value, layout.sunDirection);
    if (this.ringMaterial) {
      const u = this.ringMaterial.uniforms;
      setVec(u.sunDir.value, layout.sunDirection);
      setVec(u.planetCenter.value, layout.position);
      u.planetRadius.value = layout.radius;
      setVec(u.ringNormal.value, layout.pole);
    }
  }
}

export class EarthBody extends PlanetBody {
  readonly earthMaterial: ShaderMaterial;

  constructor(dayMap: Texture | null, dataMap: Texture | null, segments: number) {
    super('earth', null, segments);
    this.earthMaterial = new ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
      uniforms: {
        dayMap: { value: dayMap },
        dataMap: { value: dataMap },
        sunDir: { value: new Vector3(1, 0, 0) },
        cloudsOn: { value: 1 },
        lightsStrength: { value: 1.1 },
        opacity: { value: 1 },
      },
    });
    if (dayMap && dataMap) this.mesh.material = this.earthMaterial;
    this.addAtmosphere(new Color(0.35, 0.6, 1.0), 0.9, Math.max(32, segments / 2), 1.05);
  }

  setClouds(enabled: boolean): void {
    this.earthMaterial.uniforms.cloudsOn.value = enabled ? 1 : 0;
  }

  override applyLayout(layout: BodyLayout): void {
    super.applyLayout(layout);
    setVec(this.earthMaterial.uniforms.sunDir.value, layout.sunDirection);
  }
}

export class SunBody {
  readonly root = new Group();
  readonly spin = new Group();
  readonly mesh: Mesh;
  readonly glow: Sprite;
  private readonly material: ShaderMaterial;

  constructor(texture: Texture | null, segments: number) {
    const material = new ShaderMaterial({
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SUN_FRAGMENT,
      uniforms: { map: { value: texture }, hasMap: { value: texture ? 1 : 0 }, opacity: { value: 1 } },
    });
    this.material = material;
    this.mesh = new Mesh(new SphereGeometry(SUN_VISUAL_RADIUS, segments, Math.max(16, segments / 2)), material);
    this.mesh.name = 'sun';
    this.spin.add(this.mesh);
    this.root.add(this.spin);
    this.glow = new Sprite(
      new SpriteMaterial({
        map: makeSunGlowTexture(),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.glow.scale.setScalar(SUN_VISUAL_RADIUS * 6.2);
    this.glow.renderOrder = 3;
    this.root.add(this.glow);
  }

  setOrientation(m: Mat3): void {
    setRotationFromMat3(this.spin, m);
  }

  setOpacity(opacity: number): void {
    this.root.visible = opacity > 0.01;
    this.material.uniforms.opacity.value = opacity;
    this.material.transparent = opacity < 0.999;
    this.glow.material.opacity = 0.9 * opacity;
  }

  /** Rayon affiché du disque et diamètre du halo (unités de scène), voir representation/sunScale.ts. */
  setDisplaySize(radius: number, glowDiameter: number): void {
    this.spin.scale.setScalar(radius / SUN_VISUAL_RADIUS);
    this.glow.scale.setScalar(glowDiameter);
  }
}
