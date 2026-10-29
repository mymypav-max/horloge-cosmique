/**
 * Orchestration de l'application : temps → modèle astronomique → mise en page
 * → scène 3D, et télécommande → navigation → effets (caméra, temps, réglages).
 */

import { Vector3 } from 'three';
import { computeAstroState, type AstroState } from '../astro/state';
import { solarElevationCosine } from '../astro/earth';
import { CameraRig } from '../camera/CameraRig';
import { PLANETS, PLANET_IDS, type PlanetId } from '../data/planets';
import { REGIONS } from '../data/regions';
import { actionFromKey } from '../input/keymap';
import {
  type Action,
  type Effect,
  type NavState,
  arrowsControlCamera,
  initialNavState,
  reduceNavigation,
} from '../input/navigation';
import { AdaptiveResolution, FrameScheduler } from '../perf/FrameScheduler';
import type { QualityPreset } from '../perf/quality';
import { exitApp, installAndroidBridge, isAndroidApp } from '../platform/android';
import { ASTRO_TO_SCENE } from '../representation/sceneFrame';
import type { SceneView } from '../scene/SceneView';
import { TimeController } from '../time/TimeController';
import { describeRate, formatNumber, formatRate } from '../ui/format';
import { Overlay } from '../ui/Overlay';
import { geoToEarthFixed } from '../astro/earth';
import { mulVec } from '../astro/math';
import { planetInfo } from './info';
import { SETTINGS_ENTRIES, type Settings, cycleSetting, saveSettings } from './settings';
import type { StartupOptions } from './startup';

/** Inactivité (ms) avant de passer en mode horloge épuré. */
const IDLE_AFTER_MS = 12_000;
/** Durée maximale d'une touche fléchée maintenue sans répétition ni relâchement. */
const HELD_KEY_TIMEOUT_MS = 700;

const HINTS = {
  overview: '<kbd>◀</kbd><kbd>▶</kbd> Planète · <kbd>OK</kbd> Explorer · <kbd>▼</kbd> Commandes',
  bar: '<kbd>◀</kbd><kbd>▶</kbd> Choisir · <kbd>OK</kbd> Valider · <kbd>Retour</kbd> Fermer',
  detail:
    '<kbd>◀</kbd><kbd>▶</kbd><kbd>▲</kbd><kbd>▼</kbd> Pivoter · <kbd>⏪</kbd><kbd>⏩</kbd> Zoom · <kbd>OK</kbd> Commandes · <kbd>Retour</kbd> Vue générale',
  regions: '<kbd>▲</kbd><kbd>▼</kbd> Choisir · <kbd>OK</kbd> Centrer · <kbd>Retour</kbd> Fermer',
  settings: '<kbd>▲</kbd><kbd>▼</kbd> Choisir · <kbd>◀</kbd><kbd>▶</kbd> Modifier · <kbd>Retour</kbd> Fermer',
};

type Direction = 'left' | 'right' | 'up' | 'down';

export class App {
  readonly time = new TimeController();
  readonly rig: CameraRig;
  readonly overlay: Overlay;
  nav: NavState = initialNavState();
  astro: AstroState;
  private lastAstroSim = Number.NaN;
  private lastInteraction = performance.now();
  private lastInfoUpdate = 0;
  private held: Record<Direction, number> = { left: 0, right: 0, up: 0, down: 0 };
  private readonly scheduler: FrameScheduler;
  private readonly adaptive: AdaptiveResolution | null;
  private ringOpacity = 0;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private debugEl: HTMLElement | null = null;
  private frameCount = 0;
  private fpsWindowStart = 0;
  private measuredFps = 0;

  constructor(
    readonly view: SceneView,
    private settings: Settings,
    readonly quality: QualityPreset,
    autoQuality: boolean,
    private readonly options: StartupOptions,
  ) {
    this.overlay = new Overlay(document.getElementById('app')!);
    this.rig = new CameraRig(view.camera);
    this.rig.ambientMotion = settings.ambientMotion;
    view.graph.earth.setClouds(settings.clouds);
    this.adaptive = autoQuality ? new AdaptiveResolution(quality.minRenderScale, quality.maxRenderScale) : null;

    if (options.startTime !== null) {
      this.time.jumpTo(options.startTime, { paused: options.startRate === null, rate: options.startRate ?? 1 });
    } else if (options.startRate !== null) {
      this.time.setRate(options.startRate);
    }

    this.astro = computeAstroState(this.time.now());
    this.view.graph.applyAstroState(this.astro);
    this.lastAstroSim = this.astro.utcMs;

    this.scheduler = new FrameScheduler((dt, now) => this.frame(dt, now), () => this.targetFps());
    this.time.onChange(() => this.refreshNavigationUi());
    this.bindInput();
    this.bindLifecycle();
    this.refreshNavigationUi();
    if (options.debug) this.installDebug();
  }

  start(): void {
    this.onResize();
    this.view.graph.orbits.setFocus(this.nav.focused, true);
    if (this.options.view) {
      this.nav = { ...this.nav, focused: this.options.view };
      this.dispatch('ok');
    }
    this.scheduler.start();
  }

  // ------------------------------------------------------------ Entrées

  private bindInput(): void {
    window.addEventListener('keydown', (event) => {
      const action = actionFromKey(event.key, event.keyCode);
      if (!action) return;
      event.preventDefault();
      if (this.isDirection(action) && arrowsControlCamera(this.nav)) {
        this.held[action] = performance.now();
        this.touch();
        return;
      }
      if (event.repeat && (action === 'ok' || action === 'back' || action === 'menu')) return;
      this.dispatch(action);
    });
    window.addEventListener('keyup', (event) => {
      const action = actionFromKey(event.key, event.keyCode);
      if (action && this.isDirection(action)) this.held[action] = 0;
    });
    window.addEventListener('blur', () => this.releaseKeys());
    window.addEventListener('resize', () => this.onResize());
    // Molette (confort sur ordinateur) : zoom en vue rapprochée.
    window.addEventListener(
      'wheel',
      (event) => {
        if (this.nav.view === 'detail') this.dispatchEffect({ type: 'zoom', direction: event.deltaY < 0 ? 1 : -1 });
      },
      { passive: true },
    );
    installAndroidBridge({
      onAction: (action) => this.dispatch(action),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
    });
  }

  private bindLifecycle(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else this.resume();
    });
  }

  private pause(): void {
    this.scheduler.stop();
    this.releaseKeys();
  }

  private resume(): void {
    this.lastAstroSim = Number.NaN;
    this.adaptive?.reset();
    this.scheduler.start();
  }

  private releaseKeys(): void {
    this.held = { left: 0, right: 0, up: 0, down: 0 };
  }

  private isDirection(a: Action): a is Direction {
    return a === 'left' || a === 'right' || a === 'up' || a === 'down';
  }

  private touch(): void {
    this.lastInteraction = performance.now();
  }

  dispatch(action: Action): void {
    this.touch();
    const result = reduceNavigation(this.nav, action, { now: performance.now(), settingsCount: SETTINGS_ENTRIES.length });
    const viewChanged = result.state.view !== this.nav.view;
    this.nav = result.state;
    for (const effect of result.effects) this.dispatchEffect(effect);
    if (viewChanged || result.effects.length === 0) this.releaseKeys();
    this.refreshNavigationUi();
  }

  private dispatchEffect(effect: Effect): void {
    const now = performance.now();
    const layouts = this.view.graph.layout;
    switch (effect.type) {
      case 'openPlanet':
        if (layouts) this.rig.openPlanet(layouts[effect.id], now);
        this.view.graph.orbits.setFocus(effect.id, true);
        this.lastInfoUpdate = 0;
        break;
      case 'closePlanet':
        this.rig.closePlanet(now);
        this.overlay.setInfo(null);
        break;
      case 'focus':
        this.view.graph.orbits.setFocus(effect.id, true);
        break;
      case 'time':
        this.applyTimeOp(effect.op);
        break;
      case 'zoom':
        if (layouts && this.nav.detail && this.rig.mode === 'detail') this.rig.zoom(effect.direction, layouts[this.nav.detail]);
        break;
      case 'recenter':
        if (layouts && this.nav.detail) this.rig.recenter(layouts[this.nav.detail], now);
        break;
      case 'centerRegion': {
        const region = REGIONS.find((r) => r.id === effect.regionId);
        if (region && layouts) {
          this.rig.centerRegion(region, layouts.earth, now);
          this.overlay.showToast(region.name);
        }
        break;
      }
      case 'setting':
        this.applySetting(effect.index, effect.delta);
        break;
      case 'armExit':
        this.overlay.showToast(
          isAndroidApp() ? 'Appuyez de nouveau sur Retour pour quitter' : 'Retour : rien à fermer (vue générale)',
        );
        break;
      case 'exit':
        if (isAndroidApp()) exitApp();
        break;
    }
  }

  private applyTimeOp(op: 'togglePause' | 'faster' | 'slower' | 'now'): void {
    switch (op) {
      case 'togglePause':
        this.time.togglePause();
        this.overlay.showToast(this.time.isPaused() ? 'Simulation en pause' : this.timeLabel());
        break;
      case 'faster':
        this.time.faster();
        this.overlay.showToast(this.timeLabel());
        break;
      case 'slower':
        this.time.slower();
        this.overlay.showToast(this.timeLabel());
        break;
      case 'now':
        this.time.resetToNow();
        this.lastAstroSim = Number.NaN;
        this.overlay.showToast('Retour à l’heure actuelle · temps réel');
        break;
    }
  }

  private timeLabel(): string {
    if (this.time.isLive()) return 'Temps réel';
    const rate = this.time.getRate();
    return `Simulation ${formatRate(rate)} · ${describeRate(rate)}`;
  }

  private applySetting(index: number, delta: 1 | -1): void {
    const previous = this.settings;
    this.settings = cycleSetting(this.settings, index, delta);
    saveSettings(this.settings);
    this.view.graph.earth.setClouds(this.settings.clouds);
    this.rig.ambientMotion = this.settings.ambientMotion;
    if (this.settings.quality !== previous.quality) {
      this.overlay.showToast('Nouvelle qualité appliquée au prochain démarrage… redémarrage');
      window.setTimeout(() => window.location.reload(), 1600);
    }
  }

  private refreshNavigationUi(): void {
    this.overlay.renderNavigation(this.nav, this.time.isPaused(), this.settings);
  }

  // ---------------------------------------------------------- Boucle

  private targetFps(): number {
    const fastTime = !this.time.isPaused() && this.time.getRate() >= 60;
    const active = this.rig.isAnimating || fastTime || this.anyKeyHeld();
    return active ? this.quality.activeFps : this.quality.idleFps;
  }

  private anyKeyHeld(): boolean {
    const now = performance.now();
    return (Object.values(this.held) as number[]).some((t) => t > 0 && now - t < HELD_KEY_TIMEOUT_MS);
  }

  private onResize(): void {
    this.view.resize(window.innerWidth, window.innerHeight);
  }

  private frame(dt: number, now: number): void {
    const time = this.time.snapshot();

    // Modèle astronomique : recalculé à chaque image en simulation rapide,
    // au plus une fois par seconde en temps réel (les mouvements y sont lents).
    const minStep = time.isRealTime && !this.rig.isTransitioning ? 1000 : 0;
    const delta = Math.abs(time.simMs - this.lastAstroSim);
    if (Number.isNaN(delta) || (delta > 0 && delta >= minStep)) {
      this.astro = computeAstroState(time.simMs);
      this.view.graph.applyAstroState(this.astro);
      this.lastAstroSim = time.simMs;
    }

    // Commandes continues de la caméra.
    let h = 0;
    let v = 0;
    if (arrowsControlCamera(this.nav) && this.rig.mode === 'detail') {
      const held = (d: Direction) => this.held[d] > 0 && now - this.held[d] < HELD_KEY_TIMEOUT_MS;
      h = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
      v = (held('up') ? 1 : 0) - (held('down') ? 1 : 0);
    }
    this.rig.setRotationInput(h, v);
    this.rig.update(dt, now, this.view.aspect, this.view.graph.layout);

    // Vue rapprochée : on estompe les autres corps et on décale le cadrage
    // pour laisser la place au panneau d'informations.
    const progress = this.rig.detailProgress(now);
    const fade = progress <= 0.15 ? 0 : progress >= 0.75 ? 1 : (progress - 0.15) / 0.6;
    this.view.graph.setDetailFade(this.rig.subject, fade);
    this.view.setLateralShift(0.085 * fade * fade * (3 - 2 * fade));

    const idle = now - this.lastInteraction > IDLE_AFTER_MS && this.nav.layer === 'scene';
    this.updateFocusRing(dt, now, idle);
    this.updateTexts(now, idle);
    this.updateLabels(idle);

    this.view.render();
    this.measure(dt, now);
  }

  private updateFocusRing(dt: number, now: number, idle: boolean): void {
    const graph = this.view.graph;
    const ring = graph.focusRing;
    const wanted = this.rig.mode === 'overview' && !idle ? 1 : 0;
    this.ringOpacity += (wanted - this.ringOpacity) * Math.min(1, dt * 4);
    const material = ring.material;
    material.opacity = this.ringOpacity * (0.78 + 0.22 * Math.sin(now / 520));
    ring.visible = this.ringOpacity > 0.01;
    if (!ring.visible) return;
    const body = graph.planets[this.nav.focused];
    ring.position.copy(body.root.position);
    const distance = this.tmp.copy(ring.position).distanceTo(this.view.camera.position);
    const minWorld = this.view.worldPerPixel(distance) * 30;
    const extent = this.nav.focused === 'saturn' ? body.radius * 2.35 : body.radius;
    ring.scale.setScalar(Math.max(extent * 2.9, minWorld));
  }

  private updateTexts(now: number, idle: boolean): void {
    const time = this.time.snapshot();
    this.overlay.updateClock(time);
    this.overlay.setIdle(idle);

    const inDetail = this.nav.view === 'detail' && this.nav.detail;
    if (inDetail) {
      const id = this.nav.detail as PlanetId;
      const visible = this.rig.mode === 'detail' || this.rig.mode === 'toDetail';
      this.overlay.setTitle(PLANETS[id].name, PLANETS[id].summary, visible);
      if (now - this.lastInfoUpdate > 1000 && visible) {
        const info = planetInfo(id, this.astro);
        this.overlay.setInfo(info.lines, info.note);
        this.lastInfoUpdate = now;
      }
    } else {
      const p = this.astro.positions[this.nav.focused];
      const d = Math.hypot(p[0], p[1], p[2]);
      this.overlay.setTitle(
        PLANETS[this.nav.focused].name,
        `${formatNumber(d, d < 10 ? 2 : 1)} UA du Soleil · OK pour explorer`,
        this.rig.mode === 'overview' && !idle,
      );
    }

    const hint =
      this.nav.layer === 'bar'
        ? HINTS.bar
        : this.nav.layer === 'regions'
          ? HINTS.regions
          : this.nav.layer === 'settings'
            ? HINTS.settings
            : this.nav.view === 'detail'
              ? HINTS.detail
              : HINTS.overview;
    this.overlay.setHints(hint, !idle);

    // Décalage de quelques pixels toutes les 5 minutes (écrans OLED).
    const step = Math.floor(Date.now() / 300_000) % 4;
    const shifts = [
      [0, 0],
      [3, -2],
      [-2, 3],
      [2, 2],
    ];
    this.overlay.setShift(shifts[step][0], shifts[step][1]);
  }

  private updateLabels(idle: boolean): void {
    const visible = this.settings.labels && this.rig.mode === 'overview' && !idle;
    if (!visible) {
      this.overlay.updateLabels({}, null, false);
      return;
    }
    const camera = this.view.camera;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const fovTan = Math.tan((camera.fov * Math.PI) / 360);
    const positions: Partial<Record<PlanetId, { x: number; y: number; radiusPx: number; visible: boolean }>> = {};
    for (const id of PLANET_IDS) {
      const body = this.view.graph.planets[id];
      this.tmp.copy(body.root.position).project(camera);
      const distance = this.tmp2.copy(body.root.position).distanceTo(camera.position);
      const extent = id === 'saturn' ? body.radius * 1.4 : body.radius;
      positions[id] = {
        x: (this.tmp.x * 0.5 + 0.5) * w,
        y: (-this.tmp.y * 0.5 + 0.5) * hgt,
        radiusPx: (extent / (distance * fovTan)) * (hgt / 2),
        visible: this.tmp.z < 1,
      };
    }
    this.overlay.updateLabels(positions, this.nav.focused, true);
  }

  private measure(dt: number, now: number): void {
    this.frameCount++;
    if (now - this.fpsWindowStart > 1000) {
      this.measuredFps = (this.frameCount * 1000) / (now - this.fpsWindowStart);
      this.frameCount = 0;
      this.fpsWindowStart = now;
    }
    const target = this.targetFps();
    if (this.adaptive && target === this.quality.activeFps) {
      const next = this.adaptive.sample(dt * 1000, target, now, this.view.getRenderScale());
      if (next !== null) this.view.setRenderScale(next);
    }
    if (this.debugEl) {
      const info = this.view.renderer.info;
      this.debugEl.textContent =
        `${this.measuredFps.toFixed(1)} i/s (cible ${target})\n` +
        `échelle ${this.view.getRenderScale().toFixed(2)} · ${this.quality.level}\n` +
        `appels ${info.render.calls} · triangles ${info.render.triangles}\n` +
        `caméra ${this.rig.mode}`;
    }
  }

  // ---------------------------------------------------------- Débogage

  /** Projection écran (pixels CSS) d'un point de la surface terrestre. */
  projectGeo(latDeg: number, lonDeg: number): { x: number; y: number; facing: number; sunCos: number } {
    const earth = this.view.graph.layout!.earth;
    const local = mulVec(ASTRO_TO_SCENE, geoToEarthFixed({ latDeg, lonDeg }));
    const n = mulVec(earth.orientation, local);
    const world = this.tmp.set(
      earth.position[0] + n[0] * earth.radius,
      earth.position[1] + n[1] * earth.radius,
      earth.position[2] + n[2] * earth.radius,
    );
    const toCam = this.tmp2.copy(this.view.camera.position).sub(world).normalize();
    const facing = toCam.x * n[0] + toCam.y * n[1] + toCam.z * n[2];
    world.project(this.view.camera);
    return {
      x: (world.x * 0.5 + 0.5) * window.innerWidth,
      y: (-world.y * 0.5 + 0.5) * window.innerHeight,
      facing,
      sunCos: solarElevationCosine({ latDeg, lonDeg }, this.astro.utcMs),
    };
  }

  private installDebug(): void {
    this.debugEl = document.createElement('div');
    this.debugEl.className = 'debug';
    document.body.appendChild(this.debugEl);
    (window as unknown as Record<string, unknown>).__horlogeCosmique = {
      state: () => ({
        nav: this.nav,
        cameraMode: this.rig.mode,
        time: this.time.snapshot(),
        subsolar: this.astro.earth.subsolar,
        fps: this.measuredFps,
        renderScale: this.view.getRenderScale(),
        quality: this.quality.level,
        earthQuaternion: this.view.graph.earth.spin.quaternion.toArray(),
        planetPositions: Object.fromEntries(PLANET_IDS.map((id) => [id, this.view.graph.planets[id].root.position.toArray()])),
      }),
      projectGeo: (lat: number, lon: number) => this.projectGeo(lat, lon),
      jumpTo: (ms: number, paused = true) => {
        this.time.jumpTo(ms, { paused });
        this.lastAstroSim = Number.NaN;
      },
      dispatch: (a: Action) => this.dispatch(a),
      setClouds: (on: boolean) => this.view.graph.earth.setClouds(on),
      setCityLights: (strength: number) => {
        this.view.graph.earth.earthMaterial.uniforms.lightsStrength.value = strength;
      },
      centerOn: (latDeg: number, lonDeg: number, distance: number) => {
        const layouts = this.view.graph.layout;
        if (layouts) this.rig.centerRegion({ id: 'test', name: 'test', latDeg, lonDeg, distance }, layouts.earth, performance.now());
      },
    };
  }
}
