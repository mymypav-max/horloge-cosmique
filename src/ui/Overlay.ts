/**
 * Interface superposée à la scène 3D (DOM) : horloge, titres, barre
 * d'actions, listes, panneau d'informations, libellés, aides et messages.
 *
 * Le focus est géré explicitement par la machine d'états de navigation
 * (aucun élément focusable du navigateur) : la classe « is-focused » est
 * appliquée selon l'état, ce qui garantit un comportement identique au
 * clavier et à la télécommande.
 */

import { SETTINGS_ENTRIES, type Settings } from '../app/settings';
import { PLANET_IDS, PLANETS, type PlanetId } from '../data/planets';
import { REGIONS } from '../data/regions';
import { type BarItem, type NavState, barItems } from '../input/navigation';
import type { TimeSnapshot } from '../time/TimeController';
import { describeRate, formatLongDate, formatOffset, formatRate, formatTime, capitalize } from './format';
import { ICONS } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

const BAR_LABELS: Record<BarItem, string> = {
  pause: 'Pause',
  slower: 'Ralentir',
  faster: 'Accélérer',
  now: 'Maintenant',
  settings: 'Réglages',
  regions: 'Régions',
  zoomIn: 'Zoom +',
  zoomOut: 'Zoom −',
  recenter: 'Recentrer',
  overview: 'Vue générale',
};

export interface InfoLine {
  label: string;
  value: string;
}

export class Overlay {
  readonly root: HTMLElement;
  private readonly labelsLayer: HTMLElement;
  private readonly labels = new Map<PlanetId, HTMLElement>();
  private readonly title: HTMLElement;
  private readonly titleName: HTMLElement;
  private readonly titleSub: HTMLElement;
  private readonly clockBadge: HTMLElement;
  private readonly clockTime: HTMLElement;
  private readonly clockSeconds: HTMLElement;
  private readonly clockDate: HTMLElement;
  private readonly clockReal: HTMLElement;
  private readonly info: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly regions: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly hints: HTMLElement;
  private readonly toast: HTMLElement;
  private toastTimer = 0;
  private barSignature = '';
  private lastClockKey = '';

  constructor(container: HTMLElement) {
    this.root = el('div', 'ui', container);
    this.labelsLayer = el('div', 'labels', this.root);
    for (const id of PLANET_IDS) {
      const label = el('div', 'planet-label', this.labelsLayer);
      label.textContent = PLANETS[id].name;
      this.labels.set(id, label);
    }

    this.title = el('header', 'title', this.root);
    this.titleName = el('h1', 'title__name', this.title);
    this.titleSub = el('p', 'title__sub', this.title);

    const clock = el('section', 'clock', this.root);
    this.clockBadge = el('div', 'clock__badge', clock);
    const time = el('div', 'clock__time', clock);
    this.clockTime = el('span', 'clock__hm', time);
    this.clockSeconds = el('span', 'clock__sec', time);
    this.clockDate = el('div', 'clock__date', clock);
    this.clockReal = el('div', 'clock__real', clock);

    this.info = el('aside', 'info', this.root);
    this.bar = el('nav', 'bar', this.root);
    this.regions = el('div', 'panel regions', this.root);
    el('h2', 'panel__title', this.regions).textContent = 'Régions de la Terre';
    const regionList = el('ul', 'panel__list', this.regions);
    for (const r of REGIONS) {
      const li = el('li', 'panel__item', regionList);
      li.textContent = r.name;
    }
    this.settings = el('div', 'panel settings', this.root);
    el('h2', 'panel__title', this.settings).textContent = 'Réglages';
    const settingsList = el('ul', 'panel__list', this.settings);
    for (const entry of SETTINGS_ENTRIES) {
      const li = el('li', 'panel__item panel__item--setting', settingsList);
      el('span', 'setting__label', li).textContent = entry.label;
      el('span', 'setting__value', li);
    }
    const credits = el('div', 'panel__credits', this.settings);
    credits.innerHTML =
      'Positions : éléments képlériens de E. M. Standish (JPL). Tailles et distances ne sont pas à l’échelle ; les directions sont exactes.<br>' +
      'Terre : NASA Blue Marble et Black Marble (domaine public). Planètes et Soleil : © Solar System Scope, CC BY 4.0. ' +
      'Étoiles : catalogue XHIP via d3-celestial (BSD-3). Police Jost (OFL).';

    this.hints = el('div', 'hints', this.root);
    this.toast = el('div', 'toast', this.root);
  }

  // ---------------------------------------------------------------- Horloge

  updateClock(time: TimeSnapshot): void {
    const sim = new Date(time.simMs);
    const key = `${Math.floor(time.simMs / 1000)}|${time.mode}|${time.paused}|${time.rate}|${Math.floor(time.realMs / 60000)}`;
    if (key === this.lastClockKey) return;
    this.lastClockKey = key;
    setText(this.clockTime, formatTime(sim));
    const showSeconds = time.isRealTime || time.paused || time.rate <= 60;
    setText(this.clockSeconds, showSeconds ? `:${String(sim.getSeconds()).padStart(2, '0')}` : '');
    setText(this.clockDate, capitalize(formatLongDate(sim)));
    let badge = '';
    if (time.limitReached) badge = 'Limite du modèle atteinte · Pause';
    else if (time.paused) badge = 'Simulation · Pause';
    else if (!time.isRealTime) badge = `Simulation · ${formatRate(time.rate)} · ${describeRate(time.rate)}`;
    setText(this.clockBadge, badge);
    this.clockBadge.classList.toggle('is-visible', badge !== '');
    this.root.classList.toggle('is-simulated', !time.isRealTime);
    if (time.isRealTime) {
      setText(this.clockReal, '');
    } else {
      const offset = time.simMs - time.realMs;
      setText(this.clockReal, `Heure réelle ${formatTime(new Date(time.realMs))} · écart ${formatOffset(offset)}`);
    }
  }

  // ------------------------------------------------------------------ Titre

  setTitle(name: string, subtitle: string, visible: boolean): void {
    setText(this.titleName, name);
    setText(this.titleSub, subtitle);
    this.title.classList.toggle('is-visible', visible && name !== '');
  }

  // ------------------------------------------------------ Panneau d'infos

  setInfo(lines: InfoLine[] | null, note = ''): void {
    if (!lines) {
      this.info.classList.remove('is-visible');
      return;
    }
    const html = lines
      .map((l) => `<div class="info__row"><span class="info__label">${l.label}</span><span class="info__value">${l.value}</span></div>`)
      .join('');
    const content = html + (note ? `<p class="info__note">${note}</p>` : '');
    if (this.info.innerHTML !== content) this.info.innerHTML = content;
    this.info.classList.add('is-visible');
  }

  // ------------------------------------------------- Barre et panneaux

  renderNavigation(nav: NavState, paused: boolean, settings: Settings): void {
    const items = barItems(nav);
    const signature = `${items.join(',')}|${paused}`;
    if (signature !== this.barSignature) {
      this.barSignature = signature;
      this.bar.innerHTML = '';
      for (const item of items) {
        const button = el('div', 'bar__item', this.bar);
        button.dataset.item = item;
        const icon = item === 'pause' ? (paused ? ICONS.play : ICONS.pause) : ICONS[item];
        const label = item === 'pause' && paused ? 'Reprendre' : BAR_LABELS[item];
        button.innerHTML = `${icon}<span>${label}</span>`;
      }
    }
    const barOpen = nav.layer !== 'scene';
    this.bar.classList.toggle('is-visible', barOpen);
    Array.from(this.bar.children).forEach((child, k) => {
      child.classList.toggle('is-focused', nav.layer === 'bar' && k === nav.barIndex);
    });

    this.regions.classList.toggle('is-visible', nav.layer === 'regions');
    this.regions.querySelectorAll('.panel__item').forEach((node, k) => {
      node.classList.toggle('is-focused', k === nav.regionIndex);
    });

    this.settings.classList.toggle('is-visible', nav.layer === 'settings');
    this.settings.querySelectorAll('.panel__item').forEach((node, k) => {
      node.classList.toggle('is-focused', k === nav.settingsIndex);
      const entry = SETTINGS_ENTRIES[k];
      const value = node.querySelector('.setting__value') as HTMLElement;
      setText(value, `‹ ${entry.describe(settings[entry.key])} ›`);
    });
  }

  setHints(text: string, visible: boolean): void {
    if (this.hints.innerHTML !== text) this.hints.innerHTML = text;
    this.hints.classList.toggle('is-visible', visible && text !== '');
  }

  showToast(message: string, durationMs = 2800): void {
    setText(this.toast, message);
    this.toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('is-visible'), durationMs);
  }

  // ---------------------------------------------------------- Libellés

  /**
   * Positionne les libellés des planètes (coordonnées écran en pixels CSS).
   * Les libellés sont placés sous la planète, ou au-dessus en cas de
   * chevauchement ; s'il n'y a pas de place, le libellé est masqué. La planète
   * sélectionnée est toujours prioritaire.
   */
  updateLabels(
    positions: Partial<Record<PlanetId, { x: number; y: number; radiusPx: number; visible: boolean }>>,
    focused: PlanetId | null,
    visible: boolean,
  ): void {
    this.labelsLayer.classList.toggle('is-visible', visible);
    if (!visible) return;
    const rem = window.innerHeight / 54;
    const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    const order = [...PLANET_IDS].sort((a, b) => (a === focused ? -1 : b === focused ? 1 : PLANET_IDS.indexOf(b) - PLANET_IDS.indexOf(a)));
    for (const id of order) {
      const label = this.labels.get(id)!;
      const p = positions[id];
      if (!p || !p.visible) {
        label.style.opacity = '0';
        continue;
      }
      const font = rem * (id === focused ? 0.82 : 0.72);
      const width = PLANETS[id].name.length * font * 0.78 + font;
      const height = font * 1.5;
      const gap = rem * 0.35;
      const candidates = [p.y + p.radiusPx + gap, p.y - p.radiusPx - gap - height];
      let chosen: number | null = null;
      for (const top of candidates) {
        const box = { x0: p.x - width / 2, x1: p.x + width / 2, y0: top, y1: top + height };
        const clash = placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
        if (!clash) {
          placed.push(box);
          chosen = top;
          break;
        }
      }
      if (chosen === null) {
        label.style.opacity = '0';
        continue;
      }
      label.style.opacity = '';
      label.style.transform = `translate3d(${p.x.toFixed(1)}px, ${chosen.toFixed(1)}px, 0) translateX(-50%)`;
      label.classList.toggle('is-focused', id === focused);
    }
  }

  setIdle(idle: boolean): void {
    this.root.classList.toggle('is-idle', idle);
  }

  /** Léger décalage périodique de l'interface (prévention du marquage des écrans OLED). */
  setShift(x: number, y: number): void {
    this.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
}
