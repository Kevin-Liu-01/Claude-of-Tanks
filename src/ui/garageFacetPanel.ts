// Garage roster Filter panel: class, battle role and era chips plus a facet-aware search over the fleet.
//
// Interim UI on the existing Garage controls (owner 2026-10-17: minimal now, the brand overhaul's Premiere
// components replace it). garage.ts imports this module lazily on the first press of the Filter toggle, so the
// facet tables and the search never load on the game entry. The pure state lives in garageFacetFilter.ts.

import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
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

const GROUP_LABEL_KEYS: Readonly<Record<GarageFacetGroup, string>> = Object.freeze({
  vehicleClass: 'fleet.filter.class',
  battleRole: 'fleet.filter.role',
  era: 'fleet.filter.era',
});

const ALL_LABEL_KEYS: Readonly<Record<GarageFacetGroup, string>> = Object.freeze({
  vehicleClass: 'fleet.filter.allClasses',
  battleRole: 'fleet.filter.allRoles',
  era: 'fleet.filter.allEras',
});

const ERA_ICONS: Readonly<Record<string, string>> = Object.freeze({
  interwar: 'eraInterwar', ww2: 'eraWorldWarII', 'cold-war': 'eraColdWar', modern: 'eraModern',
  'next-generation': 'eraNextGeneration',
});

interface OptionView { label: string; title: string; icon: string }

function optionView(group: GarageFacetGroup, value: string): OptionView {
  if (value === 'all') return { label: t(ALL_LABEL_KEYS[group]), title: t(ALL_LABEL_KEYS[group]), icon: 'globe' };
  if (group === 'vehicleClass') {
    const meta = value === CONCEPT_PROTOTYPE_CLASS_FILTER ? CONCEPT_PROTOTYPE_FILTER_META
      : isVehicleClass(value) ? VEHICLE_CLASS_META[value] : null;
    if (meta) {
      return { label: vehicleFacetLabel(meta, t, { short: true }), title: vehicleFacetLabel(meta, t), icon: meta.icon };
    }
  }
  if (group === 'battleRole' && isVehicleBattleRole(value)) {
    const meta = VEHICLE_BATTLE_ROLE_META[value];
    const hint = meta.hintKey ? t(meta.hintKey) : '';
    return { label: vehicleFacetLabel(meta, t), title: hint ? `${vehicleFacetLabel(meta, t)}: ${hint}` : '', icon: meta.icon };
  }
  if (group === 'era' && value in VEHICLE_ERA_META) {
    return { label: vehicleEraLabelI18n(value, t, { short: true }), title: vehicleEraLabelI18n(value, t),
      icon: ERA_ICONS[value] || 'clock' };
  }
  return { label: value, title: value, icon: 'globe' };
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

  const head = document.createElement('div');
  head.className = 'cot-facet-head';
  const title = document.createElement('strong');
  title.textContent = t('fleet.filter.toggle');
  const count = document.createElement('span');
  count.className = 'cot-facet-count';
  count.setAttribute('aria-live', 'polite');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'cot-facet-close';
  closeButton.setAttribute('aria-label', t('fleet.filter.close'));
  closeButton.title = t('fleet.filter.close');
  closeButton.innerHTML = uiIconSVG('close', 16);
  head.append(title, count, closeButton);

  const search = document.createElement('label');
  search.className = 'cot-facet-search';
  const searchLabel = document.createElement('span');
  searchLabel.textContent = t('fleet.filter.search');
  const input = document.createElement('input');
  input.type = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = t('fleet.filter.searchPlaceholder');
  input.setAttribute('aria-describedby', 'cot-garage-facets-hint');
  search.append(searchLabel, input);
  const hint = document.createElement('p');
  hint.className = 'cot-facet-hint';
  hint.id = 'cot-garage-facets-hint';
  hint.textContent = t('fleet.filter.searchHint');

  // Eras without a vehicle (interwar today) are left out; every class and role has at least one.
  const optionButtons = new Map<GarageFacetGroup, Map<string, HTMLButtonElement>>();
  const groups = (Object.keys(GARAGE_FACET_GROUPS) as GarageFacetGroup[]).map((group) => {
    const counts = garageFacetOptionCounts(index, EMPTY_GARAGE_FACET_STATE, group);
    const element = document.createElement('div');
    element.className = 'cot-facet-group';
    element.setAttribute('role', 'group');
    const label = document.createElement('span');
    label.className = 'cot-facet-label';
    label.id = `cot-garage-facets-${group}`;
    label.textContent = t(GROUP_LABEL_KEYS[group]);
    element.setAttribute('aria-labelledby', label.id);
    const options = document.createElement('div');
    options.className = 'cot-facet-options';
    const buttons = new Map<string, HTMLButtonElement>();
    for (const value of GARAGE_FACET_GROUPS[group]) {
      if (value !== 'all' && !counts.get(value)) continue;
      const view = optionView(group, value);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cot-facet-option';
      button.dataset.facet = group;
      button.dataset.value = value;
      if (view.title && view.title !== view.label) button.title = view.title;
      button.innerHTML = `${uiIconSVG(view.icon, 14)}<span class="nm"></span><span class="ct"></span>`;
      const name = button.querySelector<HTMLElement>('.nm');
      if (name) name.textContent = view.label;
      button.addEventListener('click', () => {
        host.click?.();
        // A second press on the current choice returns the group to All.
        const next = state[group] === value && value !== 'all' ? 'all' : value;
        commit({ ...state, [group]: next });
      });
      buttons.set(value, button);
      options.append(button);
    }
    optionButtons.set(group, buttons);
    element.append(label, options);
    return element;
  });

  const empty = document.createElement('p');
  empty.className = 'cot-facet-empty';
  empty.textContent = t('fleet.filter.noMatch');
  empty.hidden = true;
  const foot = document.createElement('div');
  foot.className = 'cot-facet-foot';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'cot-facet-clear';
  clearButton.textContent = t('fleet.filter.clear');
  foot.append(clearButton);

  panel.append(head, search, hint, ...groups, empty, foot);
  host.anchor.append(panel);
  host.toggle.setAttribute('aria-controls', panel.id);
  host.toggle.setAttribute('aria-expanded', 'false');

  function render(): void {
    const shown = garageFacetMatchCount(index, state);
    count.textContent = t('fleet.filter.count', { shown, total });
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
    clearButton.disabled = active === 0;
    host.toggle.classList.toggle('is-active', active > 0);
    const badge = host.toggle.querySelector<HTMLElement>('.ct');
    if (badge) {
      badge.textContent = String(active);
      badge.hidden = active === 0;
    }
    host.toggle.setAttribute('aria-label', active
      ? t('fleet.filter.toggleActiveAria', { n: active })
      : t('fleet.filter.toggleAria'));
  }

  function commit(next: GarageFacetState): void {
    state = next;
    host.setFilter(garageFacetMatcher(index, state));
    render();
  }

  function setOpen(value: boolean, { restoreFocus = false } = {}): void {
    if (open === value) return;
    open = value;
    panel.hidden = !value;
    host.toggle.setAttribute('aria-expanded', String(value));
    if (value) {
      // Focus the search on a fine pointer; on touch it would raise the keyboard over the roster.
      if (typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches) input.focus();
    } else if (restoreFocus) {
      host.toggle.focus();
    }
  }

  input.addEventListener('input', () => commit({ ...state, query: input.value }));
  clearButton.addEventListener('click', () => {
    host.click?.();
    commit(EMPTY_GARAGE_FACET_STATE);
  });
  closeButton.addEventListener('click', () => setOpen(false, { restoreFocus: true }));
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    // Escape in a non-empty search clears it first, like a native search field.
    if (event.target === input && input.value) commit({ ...state, query: '' });
    else setOpen(false, { restoreFocus: true });
  });
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
