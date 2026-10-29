/**
 * Tracé des orbites : mêmes éléments orbitaux et même transformation radiale
 * que les planètes, si bien que chaque planète se trouve exactement sur la
 * courbe dessinée.
 */

import { BufferAttribute, BufferGeometry, Color, Group, LineBasicMaterial, LineLoop } from 'three';
import { PLANET_IDS, type PlanetId } from '../data/planets';
import { layoutOrbit } from '../representation/layout';

const POINTS: Record<PlanetId, number> = {
  mercury: 192,
  venus: 192,
  earth: 256,
  mars: 256,
  jupiter: 320,
  saturn: 384,
  uranus: 448,
  neptune: 512,
};

const BASE_OPACITY = 0.22;
const FOCUS_OPACITY = 0.55;

export class Orbits {
  readonly group = new Group();
  private readonly lines = new Map<PlanetId, LineLoop>();
  private focused: PlanetId | null = null;
  private highlight = false;

  constructor() {
    this.group.name = 'orbits';
    for (const id of PLANET_IDS) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(POINTS[id] * 3), 3));
      const material = new LineBasicMaterial({
        color: new Color(0.55, 0.68, 0.9),
        transparent: true,
        opacity: BASE_OPACITY,
        depthWrite: false,
      });
      const line = new LineLoop(geometry, material);
      line.name = `orbit-${id}`;
      line.frustumCulled = false;
      line.renderOrder = -1;
      this.lines.set(id, line);
      this.group.add(line);
    }
  }

  /** Recalcule les orbites (les éléments évoluent lentement : appel peu fréquent). */
  update(utcMs: number): void {
    for (const id of PLANET_IDS) {
      const line = this.lines.get(id)!;
      const attr = line.geometry.getAttribute('position') as BufferAttribute;
      const pts = layoutOrbit(id, utcMs, POINTS[id]);
      const arr = attr.array as Float32Array;
      pts.forEach((p, k) => {
        arr[k * 3] = p[0];
        arr[k * 3 + 1] = p[1];
        arr[k * 3 + 2] = p[2];
      });
      attr.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  }

  setFocus(id: PlanetId | null, highlight: boolean): void {
    if (id === this.focused && highlight === this.highlight) return;
    this.focused = id;
    this.highlight = highlight;
    for (const [pid, line] of this.lines) {
      const m = line.material as LineBasicMaterial;
      m.opacity = highlight && pid === id ? FOCUS_OPACITY : BASE_OPACITY;
    }
  }

  setOpacityScale(scale: number): void {
    for (const [pid, line] of this.lines) {
      const m = line.material as LineBasicMaterial;
      const base = this.highlight && pid === this.focused ? FOCUS_OPACITY : BASE_OPACITY;
      m.opacity = base * scale;
      line.visible = scale > 0.01;
    }
  }

  pointsOf(id: PlanetId): Float32Array {
    return this.lines.get(id)!.geometry.getAttribute('position').array as Float32Array;
  }
}
