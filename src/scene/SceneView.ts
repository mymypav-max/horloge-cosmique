/**
 * Moteur de rendu : WebGLRenderer, caméra, redimensionnement, rendu.
 */

import { PerspectiveCamera, type ShaderMaterial, Vector3, WebGLRenderer } from 'three';
import type { QualityPreset } from '../perf/quality';
import { SceneGraph } from './SceneGraph';
import { STAR_SPHERE_RADIUS } from './starfield';
import type { TextureSet } from './textures';

export const CAMERA_FOV_DEG = 36;

export function createRenderer(canvas: HTMLCanvasElement, quality: QualityPreset): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    preserveDrawingBuffer: false,
  });
  renderer.setClearColor(0x02040b, 1);
  return renderer;
}

export class SceneView {
  readonly camera: PerspectiveCamera;
  readonly graph: SceneGraph;
  private renderScale = 1;
  private width = 1;
  private height = 1;
  /** Décalage horizontal du cadrage (fraction de la largeur), pour laisser de la place au panneau d'informations. */
  private lateralShift = 0;
  private readonly tmp = new Vector3();

  constructor(
    readonly renderer: WebGLRenderer,
    textures: TextureSet,
    readonly quality: QualityPreset,
  ) {
    this.camera = new PerspectiveCamera(CAMERA_FOV_DEG, 16 / 9, 0.05, STAR_SPHERE_RADIUS * 3);
    this.graph = new SceneGraph(textures, quality);
    this.renderScale = quality.maxRenderScale;
  }

  get aspect(): number {
    return this.width / this.height;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    this.applyViewOffset();
    this.camera.updateProjectionMatrix();
    this.applyPixelRatio();
    this.renderer.setSize(this.width, this.height, false);
  }

  /** Échelle de rendu courante (ajustement dynamique de la résolution). */
  getRenderScale(): number {
    return this.renderScale;
  }

  setRenderScale(scale: number): void {
    const s = Math.max(this.quality.minRenderScale, Math.min(this.quality.maxRenderScale, scale));
    if (Math.abs(s - this.renderScale) < 0.01) return;
    this.renderScale = s;
    this.applyPixelRatio();
    this.renderer.setSize(this.width, this.height, false);
  }

  /** Rapport pixels physiques / pixels CSS du rendu (avant échelle dynamique). */
  static baseRatio(devicePixelRatio: number, cssHeight: number, maxRenderHeight: number): number {
    return Math.min(devicePixelRatio || 1, maxRenderHeight / Math.max(1, cssHeight));
  }

  private applyPixelRatio(): void {
    const base = SceneView.baseRatio(window.devicePixelRatio, this.height, this.quality.maxRenderHeight);
    const ratio = base * this.renderScale;
    this.renderer.setPixelRatio(ratio);
    // Taille des étoiles proportionnelle à la hauteur de l'image (référence 1080 lignes).
    const stars = this.graph.stars.material as ShaderMaterial;
    stars.uniforms.pixelRatio.value = (this.height * ratio) / 1080;
  }

  /** Décale l'image vers la gauche d'une fraction de la largeur (0 = centré). */
  setLateralShift(fraction: number): void {
    if (Math.abs(fraction - this.lateralShift) < 1e-4) return;
    this.lateralShift = fraction;
    this.applyViewOffset();
  }

  private applyViewOffset(): void {
    if (this.lateralShift === 0) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, this.width * this.lateralShift, 0, this.width, this.height);
  }

  /** Taille (unités de scène) d'un pixel à une distance donnée de la caméra. */
  worldPerPixel(distance: number): number {
    const fov = (this.camera.fov * Math.PI) / 180;
    return (2 * distance * Math.tan(fov / 2)) / this.height;
  }

  render(): void {
    // Les étoiles sont à l'infini : leur sphère suit la caméra.
    this.graph.stars.position.copy(this.camera.position);
    // Plan proche adapté à la distance de l'objet le plus proche (précision du tampon de profondeur).
    let nearest = Infinity;
    for (const body of Object.values(this.graph.planets)) {
      const d = this.tmp.copy(body.root.position).distanceTo(this.camera.position) - body.radius * 2.4;
      nearest = Math.min(nearest, d);
    }
    const near = Math.max(0.005, Math.min(1, nearest * 0.5));
    if (Math.abs(near - this.camera.near) / this.camera.near > 0.05) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.graph.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
