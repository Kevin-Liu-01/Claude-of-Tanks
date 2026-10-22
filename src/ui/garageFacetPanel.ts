// Garage roster Filter panel: class, battle role and era chips plus a facet-aware search over the fleet.
//
// Owner UI rules (2026-10-17): no eyebrow labels, less text and more showing. Each row is one facet drawn as chips
// (a class silhouette, a role symbol, an era badge) with its live count; a pressed chip narrows the roster and a
// second press releases it. The rows carry their names for assistive technology only. garage.ts imports this module
// lazily on the first press of the Filter toggle, so the facet tables, the glyphs and the search never load on the
// game entry. The pure state lives in garageFacetFilter.ts.
//
// Keyboard: the arrow keys, Home and End move between the chips of a row; typing in the search stays in the search
// (no Garage shortcut sees it); Escape clears a non-empty search, then closes and returns focus to the toggle.

import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { facetControlGlyphSVG, vehicleClassGlyphSVG, vehicleRoleGlyphSVG } from './vehicleFacetIcons.ts';
import {
  CONCEPT_PROTOTYPE_CLASS_FILTER,
  CONCEPT_PROTOTYPE_FILTER_META,
  VEHICLE_BATTLE_ROLE_META,
  VEHICLE_CLASS_META,
  isVehicleBattleRole,
  isVehicleClass,
  vehicleFacetLabel,
} from '../vehicles/vehicleFacets.ts';
import { VEHICLE_ERA_META, vehicleEraLabelI18n } from '../vehicles/taxonomy.ts';
import {
  EMPTY_GARAGE_FACET_STATE,
  GARAGE_FACET_GROUPS,
  createGarageFacetIndex,
  garageFacetActiveCount,
  garageFacetMatchCount,
  garageFacetMatcher,
  garageFacetOptionCounts,
} from './garageFacetFilter.ts';
import type { GarageFacetGroup, GarageFacetSpec, GarageFacetState } from './garageFacetFilter.ts';

interface GarageFacetHost {
  /** The country rail: the panel opens above it. */
  readonly anchor: HTMLElement;
  /** The Filter toggle: the panel owns its expanded state and active-count badge. */
  readonly toggle: HTMLButtonElement;
  readonly specs: readonly GarageFacetSpec[];
  /** Apply the visible-card predicate (null shows every card of the active nation). */
  setFilter(match: ((id: string) => boolean) | null): void;
  /** UI click feedback. */
  click?(): void;
}

export interface GarageFacetPanel {
  toggle(): void;
  close(options?: { restoreFocus?: boolean }): void;
  readonly isOpen: boolean;
}

/** Row names, read by assistive technology only (no visible eyebrow labels). */
const GROUP_LABEL_KEYS: Readonly<Record<GarageFacetGroup, string>> = Object.freeze({
  vehicleClass: 'fleet.filter.class',
  battleRole: 'fleet.filter.role',
  era: 'fleet.filter.era',
});

const ERA_ICONS: Readonly<Record<string, string>> = Object.freeze({
  interwar: 'eraInterwar', ww2: 'eraWorldWarII', 'cold-war': 'eraColdWar', modern: 'eraModern',
  'next-generation': 'eraNextGeneration',
});

interface OptionView { label: string; title: string; glyph: string }

function optionView(group: GarageFacetGroup, value: string): OptionView | null {
  if (group === 'vehicleClass') {
    const meta = value === CONCEPT_PROTOTYPE_CLASS_FILTER ? CONCEPT_PROTOTYPE_FILTER_META
      : isVehicleClass(value) ? VEHICLE_CLASS_META[value] : null;
    if (!meta) return null;
    return { label: vehicleFacetLabel(meta, t, { short: true }), title: vehicleFacetLabel(meta, t), glyph: vehicleClassGlyphSVG(value) };
  }
  if (group === 'battleRole') {
    if (!isVehicleBattleRole(value)) return null;
    const meta = VEHICLE_BATTLE_ROLE_META[value];
    const hint = meta.hintKey ? t(meta.hintKey) : '';
    const label = vehicleFacetLabel(meta, t);
    return { label, title: hint ? `${label}: ${hint}` : label, glyph: vehicleRoleGlyphSVG(value) };
  }
  if (!Object.hasOwn(VEHICLE_ERA_META, value)) return null;
  return { label: vehicleEraLabelI18n(value, t, { short: true }), title: vehicleEraLabelI18n(value, t),
    glyph: uiIconSVG(Object.hasOwn(ERA_ICONS, value) ? ERA_ICONS[value] : 'clock', 16) };
}

export function mountGarageFacetPanel(host: GarageFacetHost): GarageFacetPanel {
  const index = createGarageFacetIndex(host.specs, t);
  const total = index.entries.length;
  let state: GarageFacetState = EMPTY_GARAGE_FACET_STATE;
  let open = false;

  const panel = document.createElement('div');
  panel.className = 'cot-facet-panel';
  panel.id = 'cot-garage-facets';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('fleet.filter.panelAria'));
  panel.hidden = true;

  // Head: the shown count, solid, over the fleet total in the landing's hollow outline; clear; close.
  const head = document.createElement('div');
  head.className = 'cot-facet-head';
  const tally = document.createElement('p');
  tally.className = 'cot-facet-tally';
  tally.setAttribute('aria-live', 'polite');
  const shownEl = document.createElement('b');
  shownEl.className = 'num';
  const totalEl = document.createElement('span');
  totalEl.className = 'num';
  totalEl.textContent = `/${total}`;
  const tallyText = document.createElement('span');
  tallyText.className = 'cot-sr';
  tally.append(shownEl, totalEl, tallyText);
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'cot-facet-clear';
  clearButton.innerHTML = facetControlGlyphSVG('clear', 14);
  const clearLabel = document.createElement('span');
  clearLabel.textContent = t('fleet.filter.clear');
  clearButton.append(clearLabel);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'cot-facet-close';
  closeButton.setAttribute('aria-label', t('fleet.filter.close'));
  closeButton.title = t('fleet.filter.close');
  closeButton.innerHTML = uiIconSVG('close', 18);

  // Search: the field shows its icon and placeholder; the facet grammar is its description, not a paragraph.
  const search = document.createElement('label');
  search.className = 'cot-facet-search';
  search.innerHTML = facetControlGlyphSVG('search', 16);
  const input = document.createElement('input');
  input.type = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'search';
  input.placeholder = t('fleet.filter.searchPlaceholder');
  input.title = t('fleet.filter.searchHint');
  input.setAttribute('aria-label', t('fleet.filter.search'));
  input.setAttribute('aria-describedby', 'cot-garage-facets-hint');
  const hint = document.createElement('span');
  hint.className = 'cot-sr';
  hint.id = 'cot-garage-facets-hint';
  hint.textContent = t('fleet.filter.searchHint');
  search.append(input, hint);
  // one head row where the width allows: the tally, the search, Clear (shown once something narrows) and close
  head.append(tally, search, clearButton, closeButton);

  // One row per facet. 'all' is the released state, not a chip; values without a vehicle (interwar today) are left out.
  // On phones a row is one swipeable line; its wrapper shows an edge cue on the side with more chips.
  const optionButtons = new Map<GarageFacetGroup, Map<string, HTMLButtonElement>>();
  const rowElements: HTMLElement[] = [];
  const updateCue = (row: HTMLElement): void => {
    const wrap = row.parentElement;
    if (!wrap) return;
    const max = row.scrollWidth - row.clientWidth;
    wrap.dataset.more = max <= 1 ? '' : `${row.scrollLeft > 1 ? 'l' : ''}${row.scrollLeft < max - 1 ? 'r' : ''}`;
  };
  const updateCues = (): void => { for (const row of rowElements) updateCue(row); };
  const rows = (Object.keys(GARAGE_FACET_GROUPS) as GarageFacetGroup[]).map((group) => {
    const counts = garageFacetOptionCounts(index, EMPTY_GARAGE_FACET_STATE, group);
    const row = document.createElement('div');
    row.className = 'cot-facet-row';
    row.dataset.facet = group;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', t(GROUP_LABEL_KEYS[group]));
    const buttons = new Map<string, HTMLButtonElement>();
    for (const value of GARAGE_FACET_GROUPS[group]) {
      if (value === 'all' || !counts.get(value)) continue;
      const view = optionView(group, value);
      if (!view) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cot-facet-option';
      button.dataset.facet = group;
      button.dataset.value = value;
      if (view.title !== view.label) button.title = view.title;
      // constant glyph markup (vehicleFacetIcons.ts / uiIcons.ts); the label and count are text nodes
      button.innerHTML = view.glyph;
      const name = document.createElement('span');
      name.className = 'nm';
      name.textContent = view.label;
      const count = document.createElement('span');
      count.className = 'ct num';
      button.append(name, count);
      button.addEventListener('click', () => {
        host.click?.();
        // A second press on the current choice releases the row.
        commit({ ...state, [group]: state[group] === value ? 'all' : value });
      });
      buttons.set(value, button);
      row.append(button);
    }
    optionButtons.set(group, buttons);
    row.addEventListener('scroll', () => updateCue(row), { passive: true });
    rowElements.push(row);
    const wrap = document.createElement('div');
    wrap.className = 'cot-facet-rowwrap';
    wrap.append(row);
    return wrap;
  });

  const empty = document.createElement('p');
  empty.className = 'cot-facet-empty';
  empty.innerHTML = vehicleClassGlyphSVG(CONCEPT_PROTOTYPE_CLASS_FILTER, 40);
  const emptyText = document.createElement('span');
  emptyText.textContent = t('fleet.filter.noMatch');
  empty.append(emptyText);
  empty.hidden = true;

  panel.append(head, ...rows, empty);
  host.anchor.append(panel);
  host.toggle.setAttribute('aria-controls', panel.id);
  host.toggle.setAttribute('aria-expanded', 'false');

  function render(): void {
    const shown = garageFacetMatchCount(index, state);
    shownEl.textContent = String(shown);
    tallyText.textContent = t('fleet.filter.count', { shown, total });
    empty.hidden = shown > 0;
    for (const [group, buttons] of optionButtons) {
      const counts = garageFacetOptionCounts(index, state, group);
      for (const [value, button] of buttons) {
        const selected = state[group] === value;
        const n = counts.get(value) ?? 0;
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = !selected && n === 0;
        const ct = button.querySelector<HTMLElement>('.ct');
        if (ct) ct.textContent = String(n);
      }
    }
    if (input.value !== state.query) input.value = state.query;
    const active = garageFacetActiveCount(state);
    clearButton.hidden = active === 0;
    host.toggle.classList.toggle('is-active', active > 0);
    const badge = host.toggle.querySelector<HTMLElement>('.ct');
    if (badge) {
      badge.textContent = String(active);
      badge.hidden = active === 0;
    }
    host.toggle.setAttribute('aria-label', active
      ? t('fleet.filter.toggleActiveAria', { n: active })
      : t('fleet.filter.toggleAria'));
    if (open) updateCues();
  }

  function commit(next: GarageFacetState): void {
    state = next;
    host.setFilter(garageFacetMatcher(index, state));
    render();
  }

  /** The panel takes the height above the rail (a landscape phone has little), and the row cues follow the layout. */
  function fit(): void {
    if (!open) return;
    const top = host.anchor.getBoundingClientRect().top;
    const fitHeight = Math.round(Math.max(160, Math.min(520, top - 16)));
    panel.style.maxHeight = `${fitHeight}px`;
    // a short landscape phone: the panel takes all of that height and covers the header whole, rather than stopping a
    // few px under the top and slicing through its letters (critic 236)
    panel.style.minHeight = document.body.dataset.cotHeight === 'short' ? `${fitHeight}px` : '';
    updateCues();
  }

  function setOpen(value: boolean, { restoreFocus = false } = {}): void {
    if (open === value) return;
    open = value;
    panel.hidden = !value;
    host.toggle.setAttribute('aria-expanded', String(value));
    if (value) {
      fit();
      // Focus the search on a fine pointer; on touch it would raise the keyboard over the roster.
      if (typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches) input.focus();
    } else if (restoreFocus) {
      host.toggle.focus();
    }
  }

  /** Arrow keys, Home and End walk the enabled chips of one row (wrapping). */
  function moveInRow(from: HTMLButtonElement, key: string): boolean {
    const row = from.closest('.cot-facet-row');
    if (!row) return false;
    const chips = [...row.querySelectorAll<HTMLButtonElement>('.cot-facet-option')].filter((chip) => !chip.disabled);
    const at = chips.indexOf(from);
    if (at < 0 || !chips.length) return false;
    const next = key === 'Home' ? 0 : key === 'End' ? chips.length - 1
      : (at + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1) + chips.length) % chips.length;
    chips[next].focus();
    return true;
  }

  input.addEventListener('input', () => commit({ ...state, query: input.value }));
  clearButton.addEventListener('click', () => {
    host.click?.();
    commit(EMPTY_GARAGE_FACET_STATE);
  });
  closeButton.addEventListener('click', () => setOpen(false, { restoreFocus: true }));
  panel.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      // Escape in a non-empty search clears it first, like a native search field.
      if (target === input && input.value) commit({ ...state, query: '' });
      else setOpen(false, { restoreFocus: true });
      return;
    }
    // Typed keys belong to the field: the Garage's arrows (vehicle step) and the game's bindings never see them.
    if (target === input) {
      event.stopPropagation();
      return;
    }
    if (target instanceof HTMLButtonElement && target.classList.contains('cot-facet-option')
      && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
      && moveInRow(target, event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  window.addEventListener('resize', fit, { passive: true });
  document.addEventListener('pointerdown', (event) => {
    if (!open || !(event.target instanceof Node)) return;
    if (panel.contains(event.target) || host.toggle.contains(event.target)) return;
    setOpen(false);
  }, true);

  render();
  return {
    toggle() { setOpen(!open); },
    close(options = {}) { setOpen(false, options); },
    get isOpen() { return open; },
  };
}
