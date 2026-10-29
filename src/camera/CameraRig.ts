/**
 * Pilotage de la caméra : vue générale, transitions, vue rapprochée.
 *
 * La caméra est un objet purement visuel. Ses mouvements ne modifient ni le
 * temps, ni les positions, ni l'orientation des planètes, ni l'éclairage.
 */

import type { PerspectiveCamera } from 'three';
import type { Vec3 } from '../astro/math';
import { geoToEarthFixed } from '../astro/earth';
import type { PlanetId } from '../data/planets';
import type { Region } from '../data/regions';
import type { BodyLayout } from '../representation/layout';
import { ASTRO_TO_SCENE } from '../representation/sceneFrame';
import { visualExtent } from '../representation/visualScale';
import { mulVec } from '../astro/math';
import {
  type CameraPose,
  type OrbitFrame,
  type OrbitParams,
  clampElevation,
  distanceForScreenFraction,
  easeInOutCubic,
  frameFromAxis,
  interpolatePose,
  orbitFromDirection,
  orbitPose,
  overviewDistance,
  shortestAngle,
  smoothingFactor,
} from './cameraMath';

export type CameraMode = 'overview' | 'toDetail' | 'detail' | 'toOverview';

const DEG = Math.PI / 180;
const TRANSITION_IN_S = 2.0;
const TRANSITION_OUT_S = 1.7;
const ANIMATE_S = 1.6;
/** Élévation de la vue générale au-dessus du plan de l'écliptique. */
const OVERVIEW_ELEVATION = 24 * DEG;
/** Azimut : caméra du côté de la longitude écliptique 270°, l'équinoxe vernal (♈) à droite. */
const OVERVIEW_AZIMUTH = -90 * DEG;
/** Rayon de cadrage : orbite de Neptune et marge. */
const OVERVIEW_RADIUS = 20.6;
/** Décalage vertical de la visée (laisse de la place à l'horloge en bas). */
const OVERVIEW_TARGET: Vec3 = [0, -0.9, 0];

interface Animation {
  from: OrbitParams;
  to: OrbitParams;
  start: number;
  duration: number;
}

export class CameraRig {
  mode: CameraMode = 'overview';
  /** Planète suivie en vue rapprochée. */
  subject: PlanetId | null = null;
  private frame: OrbitFrame = frameFromAxis([0, 1, 0]);
  private params: OrbitParams = { azimuth: 0, elevation: 0.3, distance: 3 };
  private targetDistance = 3;
  private velocity = { az: 0, el: 0 };
  private input = { h: 0, v: 0 };
  private animation: Animation | null = null;
  private transitionStart = 0;
  private transitionFrom: CameraPose | null = null;
  private ambientTime = 0;
  ambientMotion = true;

  constructor(private readonly camera: PerspectiveCamera) {}

  get isTransitioning(): boolean {
    return this.mode === 'toDetail' || this.mode === 'toOverview';
  }

  get isAnimating(): boolean {
    return this.isTransitioning || this.animation !== null || this.input.h !== 0 || this.input.v !== 0 ||
      Math.abs(this.velocity.az) > 1e-3 || Math.abs(this.velocity.el) > 1e-3 ||
      Math.abs(this.targetDistance - this.params.distance) > 1e-3 * this.params.distance;
  }

  /** Commande continue de rotation (−1, 0, 1 sur chaque axe). */
  setRotationInput(h: number, v: number): void {
    this.input = { h, v };
    if (h !== 0 || v !== 0) this.animation = null;
  }

  zoom(direction: 1 | -1, layout: BodyLayout): void {
    const { min, max } = this.distanceLimits(layout);
    const factor = direction > 0 ? 0.8 : 1.25;
    this.targetDistance = Math.max(min, Math.min(max, this.targetDistance * factor));
    if (this.animation) {
      this.animation.to.distance = this.targetDistance;
    }
  }

  /** Pose de la vue générale (avec léger mouvement ambiant si activé). */
  overviewPose(aspect: number): CameraPose {
    const fov = this.camera.fov * DEG;
    const distance = overviewDistance(OVERVIEW_RADIUS, fov, aspect, OVERVIEW_ELEVATION);
    const drift = this.ambientMotion ? Math.sin((this.ambientTime / 420) * 2 * Math.PI) * 7 * DEG : 0;
    const driftEl = this.ambientMotion ? Math.sin((this.ambientTime / 610) * 2 * Math.PI) * 2.5 * DEG : 0;
    return orbitPose(OVERVIEW_TARGET, frameFromAxis([0, 1, 0]), {
      azimuth: OVERVIEW_AZIMUTH + drift,
      elevation: OVERVIEW_ELEVATION + driftEl,
      distance,
    });
  }

  private distanceLimits(layout: BodyLayout): { min: number; max: number } {
    const extent = visualExtent(layout.id);
    const min = layout.id === 'earth' ? layout.radius * 1.6 : extent * 1.5;
    return { min, max: extent * 9 };
  }

  /** Paramètres par défaut : planète vue en grand, terminateur visible. */
  defaultParams(layout: BodyLayout): OrbitParams {
    const frame = frameFromAxis(layout.pole);
    const sun = orbitFromDirection(frame, layout.sunDirection);
    const fov = this.camera.fov * DEG;
    const fraction = layout.id === 'earth' ? 0.72 : layout.id === 'saturn' ? 0.6 : 0.66;
    return {
      azimuth: sun.azimuth - 50 * DEG,
      elevation: clampElevation(layout.id === 'earth' ? 22 * DEG : 15 * DEG),
      distance: distanceForScreenFraction(visualExtent(layout.id), fov, fraction),
    };
  }

  openPlanet(layout: BodyLayout, now: number): void {
    this.subject = layout.id;
    this.frame = frameFromAxis(layout.pole);
    this.params = this.defaultParams(layout);
    this.targetDistance = this.params.distance;
    this.velocity = { az: 0, el: 0 };
    this.animation = null;
    this.transitionFrom = this.currentPose();
    this.transitionStart = now;
    this.mode = 'toDetail';
  }

  closePlanet(now: number): void {
    this.transitionFrom = this.currentPose();
    this.transitionStart = now;
    this.animation = null;
    this.mode = 'toOverview';
  }

  recenter(layout: BodyLayout, now: number): void {
    this.animateTo(this.defaultParams(layout), now);
  }

  /** Centre la caméra sur une région de la Terre, à l'instant courant. */
  centerRegion(region: Region, earth: BodyLayout, now: number): void {
    // Point géographique → repère local du maillage → scène (orientation réelle du globe).
    const local = mulVec(ASTRO_TO_SCENE, geoToEarthFixed({ latDeg: region.latDeg, lonDeg: region.lonDeg }));
    const dir = mulVec(earth.orientation, local);
    const target = orbitFromDirection(this.frame, dir);
    this.animateTo(
      { azimuth: target.azimuth, elevation: clampElevation(target.elevation), distance: region.distance * earth.radius },
      now,
    );
  }

  private animateTo(to: OrbitParams, now: number): void {
    const from = { ...this.params };
    this.animation = {
      from,
      to: { ...to, azimuth: from.azimuth + shortestAngle(from.azimuth, to.azimuth) },
      start: now,
      duration: ANIMATE_S,
    };
    this.targetDistance = to.distance;
    this.velocity = { az: 0, el: 0 };
  }

  private currentPose(): CameraPose {
    const c = this.camera;
    const dir = c.getWorldDirection(c.position.clone());
    return {
      position: [c.position.x, c.position.y, c.position.z],
      target: [c.position.x + dir.x * 10, c.position.y + dir.y * 10, c.position.z + dir.z * 10],
      up: [c.up.x, c.up.y, c.up.z],
    };
  }

  private detailPose(layout: BodyLayout): CameraPose {
    // Le repère suit l'axe (quasi fixe) de la planète, pas sa rotation.
    this.frame = frameFromAxis(layout.pole);
    return orbitPose(layout.position, this.frame, this.params);
  }

  private updateDetailControls(dt: number, now: number, layout: BodyLayout): void {
    if (this.animation) {
      const a = this.animation;
      const t = easeInOutCubic((now - a.start) / (a.duration * 1000));
      this.params = {
        azimuth: a.from.azimuth + (a.to.azimuth - a.from.azimuth) * t,
        elevation: a.from.elevation + (a.to.elevation - a.from.elevation) * t,
        distance: a.from.distance + (a.to.distance - a.from.distance) * t,
      };
      if (t >= 1) {
        this.animation = null;
        this.targetDistance = this.params.distance;
      }
      return;
    }
    // Vitesse angulaire réduite quand on est proche (contrôle plus fin).
    const { min } = this.distanceLimits(layout);
    const closeness = Math.sqrt(Math.max(0.15, (this.params.distance - layout.radius) / (min * 3)));
    const speed = 1.15 * Math.min(1, closeness);
    const k = smoothingFactor(dt, 0.14);
    this.velocity.az += (this.input.h * speed - this.velocity.az) * k;
    this.velocity.el += (this.input.v * speed * 0.8 - this.velocity.el) * k;
    this.params.azimuth += this.velocity.az * dt;
    this.params.elevation = clampElevation(this.params.elevation + this.velocity.el * dt);
    this.params.distance += (this.targetDistance - this.params.distance) * smoothingFactor(dt, 0.22);
  }

  update(dt: number, now: number, aspect: number, layouts: Record<PlanetId, BodyLayout> | null): void {
    this.ambientTime += dt;
    let pose: CameraPose;
    const layout = this.subject && layouts ? layouts[this.subject] : null;
    switch (this.mode) {
      case 'overview':
        pose = this.overviewPose(aspect);
        break;
      case 'toDetail': {
        if (!layout || !this.transitionFrom) {
          this.mode = 'overview';
          pose = this.overviewPose(aspect);
          break;
        }
        const t = (now - this.transitionStart) / (TRANSITION_IN_S * 1000);
        pose = interpolatePose(this.transitionFrom, this.detailPose(layout), easeInOutCubic(t));
        if (t >= 1) this.mode = 'detail';
        break;
      }
      case 'detail': {
        if (!layout) {
          this.mode = 'overview';
          pose = this.overviewPose(aspect);
          break;
        }
        this.updateDetailControls(dt, now, layout);
        pose = this.detailPose(layout);
        break;
      }
      case 'toOverview': {
        const t = (now - this.transitionStart) / (TRANSITION_OUT_S * 1000);
        pose = interpolatePose(this.transitionFrom ?? this.overviewPose(aspect), this.overviewPose(aspect), easeInOutCubic(t));
        if (t >= 1) {
          this.mode = 'overview';
          this.subject = null;
        }
        break;
      }
    }
    this.camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    this.camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
    this.camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  }

  /** Avancement vers la vue rapprochée : 0 en vue générale, 1 en vue rapprochée. */
  detailProgress(now: number): number {
    switch (this.mode) {
      case 'overview':
        return 0;
      case 'detail':
        return 1;
      case 'toDetail':
        return Math.min(1, (now - this.transitionStart) / (TRANSITION_IN_S * 1000));
      case 'toOverview':
        return Math.max(0, 1 - (now - this.transitionStart) / (TRANSITION_OUT_S * 1000));
    }
  }

  /** Distance actuelle caméra–centre de la planète suivie (pour l'affichage). */
  get detailDistance(): number {
    return this.params.distance;
  }
}
