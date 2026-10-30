/**
 * Orchestration de l'application : temps → modèle astronomique → mise en page
 * → scène 3D, et télécommande → navigation → effets (caméra, temps, réglages).
 */

import { Vector3 } from 'three';
import { computeAstroState, type AstroState } from '../astro/state';
import { solarElevationCosine } from '../astro/earth';
import { issState, issValidity } from '../astro/iss';
import { CameraRig } from '../camera/CameraRig';
import { MOONS, MOONS_BY_PLANET, type MoonId } from '../data/moons';
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
import type { SatelliteId } from '../representation/satellites';
import { ASTRO_TO_SCENE } from '../representation/sceneFrame';
import { displayedSunGlow, displayedSunRadius } from '../representation/sunScale';
import type { SceneView } from '../scene/SceneView';
import { TimeController } from '../time/TimeController';
import { describeRate, formatNumber, formatRate } from '../ui/format';
import { type SatelliteLabel, Overlay } from '../ui/Overlay';
import { geoToEarthFixed } from '../astro/earth';
import { mulVec } from '../astro/math';
import { issInfo, issUnavailableText, issValidityText, moonInfo, moonSubtitle, planetInfo } from './info';
import { SETTINGS_ENTRIES, type Settings, cycleSetting, saveSettings } from './settings';
import type { StartupOptions } from './startup';

/** Inactivité (ms) avant de passer en mode horloge épuré. */
const IDLE_AFTER_MS = 12_000;
/** Inactivité (ms) avant de refermer automatiquement les menus. */
const CLOSE_MENUS_AFTER_MS = 30_000;
/** Durée maximale d'une touche fléchée maintenue sans répétition ni relâchement. */
const HELD_KEY_TIMEOUT_MS = 700;

const HINTS = {
  overview: '<kbd>◀</kbd><kbd>▶</kbd> Planète · <kbd>OK</kbd> Explorer · <kbd>▼</kbd> Commandes',
  bar: '<kbd>◀</kbd><kbd>▶</kbd> Choisir · <kbd>OK</kbd> Valider · <kbd>Retour</kbd> Fermer',
  detail:
    '<kbd>◀</kbd><kbd>▶</kbd><kbd>▲</kbd><kbd>▼</kbd> Pivoter · <kbd>◂◂</kbd><kbd>▸▸</kbd> Zoom · <kbd>OK</kbd> Commandes · <kbd>Retour</kbd> Vue générale',
  regions: '<kbd>▲</kbd><kbd>▼</kbd> Choisir · <kbd>OK</kbd> Centrer · <kbd>Retour</kbd> Fermer',
  satellites: '<kbd>▲</kbd><kbd>▼</kbd> Choisir · <kbd>OK</kbd> Observer · <kbd>Retour</kbd> Fermer',
  satellite: (parent: string) =>
    `<kbd>◀</kbd><kbd>▶</kbd><kbd>▲</kbd><kbd>▼</kbd> Pivoter · <kbd>◂◂</kbd><kbd>▸▸</kbd> Zoom · <kbd>OK</kbd> Commandes · <kbd>Retour</kbd> ${parent}`,
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
  /** Satellite à ouvrir au démarrage (paramètre d'adresse), une fois la vue de la planète prête. */
  private pendingSatellite: SatelliteId | null = null;
  private sunRadius = 0;
  /** Dernier état de validité de l'ISS pris en compte par la liste des satellites. */
  private issValidityKey = '';

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
    this.setFpsVisible(options.debug || settings.showFps);
  }

  /** Affiche ou masque l'indicateur de cadence (réglage de diagnostic). */
  private setFpsVisible(visible: boolean): void {
    if (visible && !this.debugEl) {
      this.debugEl = document.createElement('div');
      this.debugEl.className = 'debug';
      document.body.appendChild(this.debugEl);
    } else if (!visible && this.debugEl && !this.options.debug) {
      this.debugEl.remove();
      this.debugEl = null;
    }
  }

  start(): void {
    this.onResize();
    this.view.graph.orbits.setFocus(this.nav.focused, true);
    if (this.options.view) {
      this.nav = { ...this.nav, focused: this.options.view };
      this.dispatch('ok');
      const wanted = this.options.satellite;
      if (wanted && this.satellitesFor(this.options.view).includes(wanted)) this.pendingSatellite = wanted;
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

  /** Satellites proposés pour une planète : ses lunes, et l'ISS pour la Terre si des données valables existent. */
  satellitesFor(planet: PlanetId | null): SatelliteId[] {
    if (!planet) return [];
    const list: SatelliteId[] = [...MOONS_BY_PLANET[planet]];
    if (planet === 'earth' && issValidity(this.time.now()).status !== 'unavailable') list.push('iss');
    return list;
  }

  dispatch(action: Action): void {
    this.touch();
    const result = reduceNavigation(this.nav, action, {
      now: performance.now(),
      settingsCount: SETTINGS_ENTRIES.length,
      satellites: this.satellitesFor(this.nav.detail),
    });
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
        this.view.graph.satellites.activate(effect.id);
        this.lastInfoUpdate = 0;
        break;
      case 'openSatellite': {
        const sat = this.view.graph.satellites.layouts[effect.id];
        const parent = layouts && this.nav.detail ? layouts[this.nav.detail] : null;
        if (sat && parent) {
          this.rig.openSatellite(sat, parent, now);
          this.lastInfoUpdate = 0;
        } else {
          this.nav = { ...this.nav, satellite: null };
          this.overlay.showToast('Ce satellite n’est pas affichable pour l’instant');
        }
        break;
      }
      case 'closeSatellite':
        if (layouts && this.nav.detail) this.rig.closeSatellite(layouts[this.nav.detail], now);
        this.lastInfoUpdate = 0;
        break;
      case 'sunView': {
        const sat = this.rig.satellite ? this.view.graph.satellites.layouts[this.rig.satellite] ?? null : null;
        if (layouts && this.nav.detail) this.rig.sunView(layouts[this.nav.detail], sat, now);
        break;
      }
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
      case 'zoom': {
        if (!layouts || !this.nav.detail) break;
        if (this.rig.mode === 'detail') this.rig.zoom(effect.direction, layouts[this.nav.detail]);
        const sat = this.rig.satellite ? this.view.graph.satellites.layouts[this.rig.satellite] : null;
        if (this.rig.mode === 'satellite' && sat) this.rig.zoom(effect.direction, layouts[this.nav.detail], sat);
        break;
      }
      case 'recenter': {
        const sat = this.rig.satellite ? this.view.graph.satellites.layouts[this.rig.satellite] : null;
        if (sat) this.rig.recenterSatellite(sat, now);
        else if (layouts && this.nav.detail) this.rig.recenter(layouts[this.nav.detail], now);
        break;
      }
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
    this.setFpsVisible(this.settings.showFps);
    if (this.settings.quality !== previous.quality) {
      this.overlay.showToast('Nouvelle qualité appliquée au prochain démarrage… redémarrage');
      window.setTimeout(() => window.location.reload(), 1600);
    }
  }

  private refreshNavigationUi(): void {
    const planet = this.nav.detail;
    const entries = this.satellitesFor(planet).map((id) => ({
      id,
      name: id === 'iss' ? 'ISS · station spatiale' : MOONS[id as MoonId].name,
      detail: id === 'iss' ? this.issListDetail() : undefined,
    }));
    const title = planet === 'earth' ? 'Satellites de la Terre' : planet ? `Lunes ${/^[AEIOUÉ]/.test(PLANETS[planet].name) ? 'd’' : 'de '}${PLANETS[planet].name}` : '';
    // ISS masquée (avant son lancement, hors des données embarquées) : la liste explique pourquoi.
    const iss = planet === 'earth' ? issValidity(this.time.now()) : null;
    this.overlay.renderNavigation(this.nav, this.time.isPaused(), this.settings, {
      title,
      entries,
      parentName: planet ? PLANETS[planet].name : '',
      note: iss && iss.status === 'unavailable' ? issUnavailableText(iss).note : '',
    });
  }

  private issListDetail(): string | undefined {
    const v = issValidity(this.time.now());
    return v.status === 'extrapolation' ? issValidityText(v) : undefined;
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
    if (arrowsControlCamera(this.nav) && this.rig.acceptsRotationInput) {
      const held = (d: Direction) => this.held[d] > 0 && now - this.held[d] < HELD_KEY_TIMEOUT_MS;
      h = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
      v = (held('up') ? 1 : 0) - (held('down') ? 1 : 0);
    }
    this.rig.setRotationInput(h, v);

    // Vue rapprochée : on estompe les autres corps et on décale le cadrage
    // pour laisser la place au panneau d'informations.
    const progress = this.rig.detailProgress(now);
    const fade = progress <= 0.15 ? 0 : progress >= 0.75 ? 1 : (progress - 0.15) / 0.6;

    // Satellites de la planète observée : positions recalculées à chaque image (mouvement fluide), avant la caméra qui les suit.
    const iss = issValidity(time.simMs);
    this.checkIssAvailability(time.simMs);
    // Le temps simulé franchit une limite de validité de l'ISS : la liste des satellites est mise à jour aussitôt.
    const issKey = `${iss.status}:${iss.reason ?? ''}`;
    if (issKey !== this.issValidityKey) {
      this.issValidityKey = issKey;
      this.refreshNavigationUi();
    }
    const graph = this.view.graph;
    const subjectLayout = this.rig.subject && graph.layout ? graph.layout[this.rig.subject] : null;
    const showIss = iss.status !== 'unavailable';
    const subjectHelio = this.rig.subject ? this.astro.positions[this.rig.subject] : null;
    graph.satellites.update(time.simMs, subjectLayout, subjectHelio, fade, this.nav.satellite, showIss);

    this.rig.update(dt, now, this.view.aspect, graph.layout, graph.satellites.layouts);
    graph.setDetailFade(this.rig.subject, fade);
    this.view.setLateralShift(0.085 * fade * fade * (3 - 2 * fade));
    this.updateSun(fade);
    this.openPendingSatellite();

    if (this.nav.layer !== 'scene' && now - this.lastInteraction > CLOSE_MENUS_AFTER_MS) {
      this.nav = { ...this.nav, layer: 'scene' };
      this.refreshNavigationUi();
    }
    const idle = now - this.lastInteraction > IDLE_AFTER_MS && this.nav.layer === 'scene';
    this.updateFocusRing(dt, now, idle);
    this.updateTexts(now, idle);
    this.updateLabels(idle);

    this.view.render();
    this.measure(dt, now);
  }

  /**
   * Soleil : taille fixe en vue générale, taille apparente réelle (vue du
   * corps observé, à sa distance réelle du Soleil) en vue rapprochée.
   */
  private updateSun(fade: number): void {
    const subject = this.rig.subject;
    const p = subject ? this.astro.positions[subject] : null;
    const cameraDistance = this.view.camera.position.length();
    const radius = p ? displayedSunRadius(fade, cameraDistance, Math.hypot(p[0], p[1], p[2])) : displayedSunRadius(0, cameraDistance, 1);
    this.sunRadius = radius;
    this.view.graph.setSunDisplaySize(radius, displayedSunGlow(p ? fade : 0, radius, cameraDistance));
  }

  /** Si l'ISS observée est masquée à l'instant affiché (données expirées ou absentes), retour à la Terre. */
  private checkIssAvailability(simMs: number): void {
    if (this.nav.satellite !== 'iss') return;
    const v = issValidity(simMs);
    if (v.status !== 'unavailable') return;
    this.nav = { ...this.nav, satellite: null, layer: this.nav.layer === 'satellites' ? 'bar' : this.nav.layer };
    this.dispatchEffect({ type: 'closeSatellite' });
    this.overlay.showToast(issUnavailableText(v).toast);
    this.refreshNavigationUi();
  }

  private openPendingSatellite(): void {
    const id = this.pendingSatellite;
    if (!id || this.rig.mode !== 'detail' || !this.view.graph.satellites.layouts[id]) return;
    this.pendingSatellite = null;
    this.nav = { ...this.nav, satellite: id, layer: 'scene', satelliteIndex: Math.max(0, this.satellitesFor(this.nav.detail).indexOf(id)) };
    this.dispatchEffect({ type: 'openSatellite', id });
    this.refreshNavigationUi();
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
    const satellite = this.nav.satellite;
    if (inDetail && satellite) {
      const visible = this.rig.mode === 'satellite' || this.rig.mode === 'toSatellite';
      if (satellite === 'iss') {
        this.overlay.setTitle('Station spatiale internationale', 'ISS · satellite artificiel en orbite basse', visible);
      } else {
        this.overlay.setTitle(MOONS[satellite].name, moonSubtitle(satellite), visible);
      }
      if (now - this.lastInfoUpdate > 1000 && visible) {
        const iss = satellite === 'iss' ? issState(time.simMs) : null;
        if (satellite !== 'iss') {
          const info = moonInfo(satellite, this.astro);
          this.overlay.setInfo(info.lines, info.note, info.representation);
        } else if (iss) {
          const info = issInfo(iss);
          this.overlay.setInfo(info.lines, info.note);
        }
        this.lastInfoUpdate = now;
      }
    } else if (inDetail) {
      const id = this.nav.detail as PlanetId;
      const visible = this.rig.mode === 'detail' || this.rig.mode === 'toDetail' || this.rig.mode === 'toPlanet';
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
          : this.nav.layer === 'satellites'
            ? HINTS.satellites
            : this.nav.layer === 'settings'
              ? HINTS.settings
              : this.nav.view === 'detail' && this.nav.satellite && this.nav.detail
                ? HINTS.satellite(PLANETS[this.nav.detail].name)
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
    this.updateSatelliteLabels(idle);
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

  /** Noms des lunes (et de l'ISS) autour de la planète observée, hors des disques et masqués derrière la planète. */
  private updateSatelliteLabels(idle: boolean): void {
    const graph = this.view.graph;
    const layouts = graph.satellites.layouts;
    const parent = this.rig.subject && graph.layout ? graph.layout[this.rig.subject] : null;
    const steady = this.rig.mode === 'detail' || this.rig.mode === 'satellite';
    const visible = this.settings.labels && steady && !idle && Boolean(parent);
    if (!visible || !parent) {
      this.overlay.updateSatelliteLabels([], false);
      return;
    }
    const camera = this.view.camera;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const fovTan = Math.tan((camera.fov * Math.PI) / 360);
    const cam = camera.position;
    const entries: SatelliteLabel[] = [];
    for (const layout of Object.values(layouts)) {
      if (!layout) continue;
      const pos = this.tmp.set(layout.position[0], layout.position[1], layout.position[2]);
      const distance = pos.distanceTo(cam);
      // Masqué si la planète s'interpose entre la caméra et le satellite.
      const hidden = this.behindSphere(layout.position, parent.position, parent.radius);
      pos.project(camera);
      entries.push({
        id: layout.id,
        name: layout.id === 'iss' ? 'ISS' : MOONS[layout.id].name,
        x: (pos.x * 0.5 + 0.5) * w,
        y: (-pos.y * 0.5 + 0.5) * hgt,
        radiusPx: (layout.radius / (distance * fovTan)) * (hgt / 2),
        visible: pos.z < 1 && !hidden && layout.id !== this.nav.satellite,
        focused: layout.id === this.nav.satellite,
      });
    }
    this.overlay.updateSatelliteLabels(entries, true);
  }

  /** Vrai si le point est caché par la sphère (centre, rayon) vue de la caméra. */
  private behindSphere(point: [number, number, number], center: [number, number, number], radius: number): boolean {
    const c = this.view.camera.position;
    const d: [number, number, number] = [point[0] - c.x, point[1] - c.y, point[2] - c.z];
    const len = Math.hypot(d[0], d[1], d[2]);
    const u = [d[0] / len, d[1] / len, d[2] / len];
    const oc = [center[0] - c.x, center[1] - c.y, center[2] - c.z];
    const t = oc[0] * u[0] + oc[1] * u[1] + oc[2] * u[2];
    if (t <= 0 || t >= len) return false;
    const perp2 = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - t * t;
    return perp2 < radius * radius;
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
    (window as unknown as Record<string, unknown>).__horlogeCosmique = {
      state: () => ({
        nav: this.nav,
        cameraMode: this.rig.mode,
        time: this.time.snapshot(),
        subsolar: this.astro.earth.subsolar,
        fps: this.measuredFps,
        rendering: this.scheduler.isRunning,
        renderScale: this.view.getRenderScale(),
        quality: this.quality.level,
        earthQuaternion: this.view.graph.earth.spin.quaternion.toArray(),
        planetPositions: Object.fromEntries(PLANET_IDS.map((id) => [id, this.view.graph.planets[id].root.position.toArray()])),
        satellite: this.rig.satellite,
        satelliteLayouts: this.view.graph.satellites.layouts,
        cameraPosition: this.view.camera.position.toArray(),
        sunRadius: this.sunRadius,
        info: Array.from(document.querySelectorAll('.info .info__row')).map((row) => row.textContent),
        representation: document.querySelector('.info .info__repr')?.textContent ?? '',
        title: document.querySelector('.title__name')?.textContent ?? '',
        issShown: this.view.graph.satellites.issShown,
      }),
      satellitesFor: (planet: PlanetId) => this.satellitesFor(planet),
      /** Fraction de l'image (grille de 64 × 36 rayons) occupée par une sphère de la scène. */
      sphereCoverage: (cx: number, cy: number, cz: number, radius: number) => {
        const camera = this.view.camera;
        const origin = camera.position;
        let hits = 0;
        for (let j = 0; j < 36; j++) {
          for (let i = 0; i < 64; i++) {
            const dir = this.tmp.set(((i + 0.5) / 64) * 2 - 1, 1 - ((j + 0.5) / 36) * 2, 0.5).unproject(camera).sub(origin).normalize();
            const ox = cx - origin.x;
            const oy = cy - origin.y;
            const oz = cz - origin.z;
            const t = ox * dir.x + oy * dir.y + oz * dir.z;
            if (t > 0 && ox * ox + oy * oy + oz * oz - t * t < radius * radius) hits++;
          }
        }
        return hits / (64 * 36);
      },
      projectScene: (x: number, y: number, z: number) => {
        const p = this.tmp.set(x, y, z).project(this.view.camera);
        return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, z: p.z };
      },
      projectGeo: (lat: number, lon: number) => this.projectGeo(lat, lon),
      jumpTo: (ms: number, paused = true) => {
        this.time.jumpTo(ms, { paused });
        this.lastAstroSim = Number.NaN;
      },
      setRate: (rate: number) => this.time.setRate(rate),
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
