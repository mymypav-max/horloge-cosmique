import { describe, expect, it } from 'vitest';
import { actionFromKey } from '../src/input/keymap';
import {
  EXIT_CONFIRM_MS,
  type Action,
  type NavState,
  arrowsControlCamera,
  barItems,
  initialNavState,
  reduceNavigation,
} from '../src/input/navigation';
import { REGIONS } from '../src/data/regions';

const ctx = { now: 1_000_000, settingsCount: 4 };

function run(actions: Action[], start: NavState = initialNavState(), now = ctx.now) {
  let state = start;
  const effects = [];
  for (const a of actions) {
    const r = reduceNavigation(state, a, { ...ctx, now });
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

describe('sélection des planètes (vue générale)', () => {
  it('met la Terre en évidence au démarrage', () => {
    expect(initialNavState().focused).toBe('earth');
  });

  it('déplace le focus avec les flèches gauche/droite, avec bouclage', () => {
    expect(run(['right']).state.focused).toBe('mars');
    expect(run(['right', 'right']).state.focused).toBe('jupiter');
    expect(run(['left', 'left']).state.focused).toBe('mercury');
    expect(run(['left', 'left', 'left']).state.focused).toBe('neptune');
    expect(run(['right']).effects).toEqual([{ type: 'focus', id: 'mars' }]);
  });

  it('ouvre la vue rapprochée de la planète sélectionnée avec OK', () => {
    const r = run(['right', 'right', 'ok']);
    expect(r.state.view).toBe('detail');
    expect(r.state.detail).toBe('jupiter');
    expect(r.effects).toContainEqual({ type: 'openPlanet', id: 'jupiter' });
  });
});

describe('vue rapprochée', () => {
  it('confie les flèches à la caméra', () => {
    const r = run(['ok']);
    expect(arrowsControlCamera(r.state)).toBe(true);
    const after = run(['left', 'up', 'right', 'down'], r.state);
    expect(after.state).toEqual(r.state);
    expect(after.effects).toEqual([]);
  });

  it('revient à la vue générale avec Retour, en gardant la planète en évidence', () => {
    const r = run(['left', 'ok', 'back']);
    expect(r.state.view).toBe('overview');
    expect(r.state.detail).toBeNull();
    expect(r.state.focused).toBe('venus');
    expect(r.effects).toContainEqual({ type: 'closePlanet' });
  });

  it('zoome avec les touches avance/retour rapide', () => {
    const r = run(['ok', 'fastForward', 'rewind']);
    expect(r.effects).toEqual([
      { type: 'openPlanet', id: 'earth' },
      { type: 'zoom', direction: 1 },
      { type: 'zoom', direction: -1 },
    ]);
  });
});

describe('barre d’actions', () => {
  it('s’ouvre avec Bas en vue générale et pilote le temps', () => {
    const r = run(['down', 'ok', 'right', 'right', 'ok', 'right', 'ok']);
    expect(r.state.layer).toBe('bar');
    expect(r.effects).toEqual([
      { type: 'time', op: 'togglePause' },
      { type: 'time', op: 'faster' },
      { type: 'time', op: 'now' },
    ]);
  });

  it('s’ouvre avec OK en vue rapprochée et propose les régions pour la Terre seulement', () => {
    expect(barItems({ view: 'detail', detail: 'earth' })[0]).toBe('regions');
    expect(barItems({ view: 'detail', detail: 'mars' })).not.toContain('regions');
    const r = run(['ok', 'ok']);
    expect(r.state.layer).toBe('bar');
  });

  it('se ferme avec Retour sans quitter la vue', () => {
    const r = run(['ok', 'ok', 'back']);
    expect(r.state.layer).toBe('scene');
    expect(r.state.view).toBe('detail');
  });

  it('permet de revenir à la vue générale depuis la barre', () => {
    const open = run(['ok', 'ok']);
    const items = barItems(open.state);
    const r = run([...Array(items.length).fill('right'), 'ok'] as Action[], open.state);
    expect(r.state.view).toBe('overview');
    expect(r.effects).toContainEqual({ type: 'closePlanet' });
  });

  it('ne déborde pas aux extrémités', () => {
    const r = run(['down', 'left', 'left', 'left']);
    expect(r.state.barIndex).toBe(0);
    const s = run(Array(20).fill('right') as Action[], r.state);
    expect(s.state.barIndex).toBe(barItems(s.state).length - 1);
  });
});

describe('exploration régionale de la Terre', () => {
  it('centre la caméra sur la région choisie et rend les flèches à la caméra', () => {
    const r = run(['ok', 'ok', 'ok', 'down', 'ok']);
    expect(r.effects).toContainEqual({ type: 'centerRegion', regionId: REGIONS[1].id });
    expect(r.state.layer).toBe('scene');
    expect(arrowsControlCamera(r.state)).toBe(true);
  });

  it('boucle dans la liste des régions', () => {
    const r = run(['ok', 'ok', 'ok', 'up']);
    expect(r.state.regionIndex).toBe(REGIONS.length - 1);
  });

  it('revient à la barre avec Retour', () => {
    const r = run(['ok', 'ok', 'ok', 'back']);
    expect(r.state.layer).toBe('bar');
  });
});

describe('réglages', () => {
  it('modifie la valeur sélectionnée avec gauche/droite', () => {
    const r = run(['down', ...Array(4).fill('right'), 'ok', 'down', 'right', 'left'] as Action[]);
    expect(r.state.layer).toBe('settings');
    expect(r.effects).toEqual([
      { type: 'setting', index: 1, delta: 1 },
      { type: 'setting', index: 1, delta: -1 },
    ]);
  });
});

describe('touches multimédias', () => {
  it('Lecture/Pause fonctionne dans toutes les couches', () => {
    for (const start of [run([]).state, run(['down']).state, run(['ok']).state]) {
      expect(reduceNavigation(start, 'playPause', ctx).effects).toEqual([{ type: 'time', op: 'togglePause' }]);
    }
  });

  it('avance/retour rapide changent la vitesse en vue générale', () => {
    expect(run(['fastForward', 'rewind']).effects).toEqual([
      { type: 'time', op: 'faster' },
      { type: 'time', op: 'slower' },
    ]);
  });
});

describe('sortie de l’application', () => {
  it('demande un second appui sur Retour pour quitter', () => {
    const first = reduceNavigation(initialNavState(), 'back', ctx);
    expect(first.effects).toEqual([{ type: 'armExit' }]);
    const second = reduceNavigation(first.state, 'back', { ...ctx, now: ctx.now + 1_000 });
    expect(second.effects).toEqual([{ type: 'exit' }]);
  });

  it('ne quitte pas si le second appui est trop tardif ou si une autre touche intervient', () => {
    const first = reduceNavigation(initialNavState(), 'back', ctx);
    const late = reduceNavigation(first.state, 'back', { ...ctx, now: ctx.now + EXIT_CONFIRM_MS + 1 });
    expect(late.effects).toEqual([{ type: 'armExit' }]);
    const other = reduceNavigation(first.state, 'right', ctx);
    expect(reduceNavigation(other.state, 'back', ctx).effects).toEqual([{ type: 'armExit' }]);
  });
});

describe('correspondance des touches', () => {
  it('reconnaît le clavier, la télécommande et les touches multimédias', () => {
    expect(actionFromKey('ArrowLeft')).toBe('left');
    expect(actionFromKey('Enter')).toBe('ok');
    expect(actionFromKey('Escape')).toBe('back');
    expect(actionFromKey('MediaPlayPause')).toBe('playPause');
    expect(actionFromKey('MediaFastForward')).toBe('fastForward');
    expect(actionFromKey('Unidentified', 23)).toBe('ok');
    expect(actionFromKey('Unidentified', 82)).toBe('menu');
    expect(actionFromKey('a')).toBeNull();
  });
});
