// Shared UI components (brand-ui SPEC §6, BUI-F5). Copyright © 2026 Kevin B. Liu.
//
// Framework-free markup factories over the design tokens (src/ui/tokens) and the icon sprite (src/ui/icons): each
// returns an HTML string the surfaces compose, the way the shell already builds its screens. Every factory takes
// translated text (the caller reads the catalog; no literals live here), sets the ARIA the control needs and a
// data-ui-sound role (SPEC §10), and draws its states from components.css beside it, a static sheet the page imports
// in the `components` cascade layer: a surface restyles a component without !important (src/ui/styleLayers.ts).
//
// The kit is deliberately small (owner 2026-10-22: less is more). It holds what the rebuilt surfaces use: buttons,
// key caps, chips, stat chips and tags, segmented controls, tabs with roving focus, toggles, stat rows on the fixed
// 20-cell scale, stat tiles and empty states. The vehicle identity (flag, silhouette, name) is identity.ts: its flags are
// asset imports, and the core imports none. Plates are classes.
// Modal, select, slider and tooltip keep their existing owners (modal.ts, selectPickerMenu.ts, settings.ts, richTooltip.ts).

import { icon, type IconId } from '../icons/icon.ts';
import { attrs, esc, type Attrs } from './escape.ts';
/** Text and attribute values are escaped once (escape.ts). */
export { esc };

/** What a control sounds like when used (SPEC §10; src/audio/interfaceSounds.ts reads it). */
type SoundRole = 'tick' | 'press' | 'confirm' | 'back' | 'tab' | 'toggle' | 'select' | 'deploy' | 'error';

/* ------------------------------------------------------------------------------------------------------- buttons */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';
type ButtonSize = 36 | 48 | 56 | 64;

interface ButtonOptions {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: IconId;
  /** A key cap after the label (hidden on touch). */
  readonly key?: string;
  /** Icon-only: the label becomes the accessible name (the kit's hover tip shows it) and the visible text goes. */
  readonly iconOnly?: boolean;
  readonly sound?: SoundRole;
  readonly className?: string;
  readonly attrs?: Attrs;
}

/** One button vocabulary (SPEC §6.2): one primary per view; caps come from CSS for short labels. */
export function button(options: ButtonOptions): string {
  const variant = options.variant ?? 'secondary';
  const size = options.size ?? 48;
  const glyph = options.icon ? icon(options.icon, { size: size >= 56 ? 20 : 18 }) : '';
  const cls = ['cot-c-btn', `cot-c-btn--${variant}`, `cot-c-btn--${size}`, options.iconOnly ? 'cot-c-btn--icon' : '',
    options.className ?? ''].filter(Boolean).join(' ');
  const sound = options.sound ?? (variant === 'primary' ? 'confirm' : 'press');
  const name = options.iconOnly ? ` aria-label="${esc(options.label)}"` : '';
  const text = options.iconOnly ? '' : `<span class="cot-c-btn__label">${esc(options.label)}</span>`;
  return `<button type="button" class="${cls}" data-ui-sound="${sound}"${name}${attrs(options.attrs)}>${glyph}${text}`
    + `${options.key && !options.iconOnly ? keycap(options.key) : ''}</button>`;
}

/** An arrow key's cap draws the sprite's arrow, not a typed one (the gauntlet's line 3). */
const KEYCAP_GLYPHS: Readonly<Record<string, IconId>> = { '↑': 'moveForward', '↓': 'moveBack', '←': 'steerLeft', '→': 'steerRight' };

/** A keyboard key cap; touch layouts hide it (SPEC §6.2 input glyphs). */
export function keycap(key: string): string {
  const glyph = KEYCAP_GLYPHS[key];
  return `<kbd class="cot-c-kbd" aria-hidden="true">${glyph ? icon(glyph, { size: 12 }) : esc(key)}</kbd>`;
}

/* ------------------------------------------------------------------------------------------------- chips and tags */

export interface ChipOptions {
  readonly label: string;
  readonly icon?: IconId;
  /** A kit-drawn lead in place of the icon (identity.ts nationChip passes a flag). */
  readonly glyph?: string;
  /** A toggle chip (filters): aria-pressed carries the state. Omit for a static chip. */
  readonly pressed?: boolean;
  /** Show only the glyph or flag; the label becomes the accessible name, which the hover tip shows. */
  readonly compact?: boolean;
  readonly count?: number | string;
  readonly className?: string;
  readonly attrs?: Attrs;
}

export function chip(options: ChipOptions): string {
  const lead = options.glyph ?? (options.icon ? icon(options.icon, { size: 16 }) : '');
  const cls = `cot-c-chip${options.compact ? ' cot-c-chip--compact' : ''}${options.className ? ` ${options.className}` : ''}`;
  const count = options.count === undefined ? '' : `<span class="cot-c-chip__count num">${esc(options.count)}</span>`;
  const text = options.compact ? '' : `<span class="cot-c-chip__label">${esc(options.label)}</span>`;
  const name = options.compact ? ` aria-label="${esc(options.label)}"` : '';
  if (options.pressed === undefined) return `<span class="${cls}"${name}${attrs(options.attrs)}>${lead}${text}${count}</span>`;
  return `<button type="button" class="${cls}" aria-pressed="${options.pressed}" data-ui-sound="toggle"${name}`
    + `${attrs(options.attrs)}>${lead}${text}${count}</button>`;
}

type TagTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';
/** A short status word (New, Recommended, Campaign 3/6): at most 14 characters. */
export function tag(text: string, tone: TagTone = 'neutral', className = ''): string {
  return `<span class="cot-c-tag cot-c-tag--${tone}${className ? ` ${esc(className)}` : ''}">${esc(text)}</span>`;
}

interface StatChipOptions {
  /** The kind, in caps (APFSDS). Omit it, and the value, for a glyph-only chip whose tip names it (a fitting). */
  readonly label?: string;
  readonly value?: string | number;
  readonly unit?: string;
  readonly icon?: IconId;
  /** What the value is, for the kit's hover tip (components/hoverTip.ts): "M829A4: 855 mm at 100 m". */
  readonly tip?: string;
  readonly className?: string;
}
/**
 * A value with its kind, compact (a round and its penetration: APFSDS 855 mm), in the data voice. A glyph-only chip
 * (no label, no value) carries its name as the tip and the accessible name.
 */
export function statChip(options: StatChipOptions): string {
  const glyphOnly = options.label === undefined && options.value === undefined;
  const cls = `cot-c-statchip${glyphOnly ? ' cot-c-statchip--glyph' : ''}${options.className ? ` ${options.className}` : ''}`;
  const tip = options.tip ? ` data-tip="${esc(options.tip)}"${glyphOnly ? ` role="img" aria-label="${esc(options.tip)}"` : ''}` : '';
  const label = options.label === undefined ? '' : `<span class="cot-c-statchip__label">${esc(options.label)}</span>`;
  const value = options.value === undefined ? '' : `<b class="num">${esc(options.value)}</b>`;
  const unit = options.unit ? `<small>${esc(options.unit)}</small>` : '';
  return `<span class="${cls}"${tip}>${options.icon ? icon(options.icon, { size: 14 }) : ''}${label}${value}${unit}</span>`;
}

/* ---------------------------------------------------------------------------------------------- choice controls */

interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: IconId;
  /** Show the glyph only; the label is the accessible name, which the hover tip shows. */
  readonly iconOnly?: boolean;
  readonly disabled?: boolean;
  /** The key that chooses it (the Gallery's 1-5 layers): a key cap inside the option, and its aria-keyshortcuts. */
  readonly key?: string;
}

interface SegmentedOptions {
  readonly label: string;
  readonly options: readonly ChoiceOption[];
  readonly value: string;
  readonly className?: string;
  readonly attrs?: Attrs;
}

/** 2-5 exclusive options with a lit indicator (Day / Sunset / Night; team size). A radio group with roving focus. */
export function segmented(options: SegmentedOptions): string {
  const items = options.options.map((option) => {
    const on = option.value === options.value;
    const glyph = option.icon ? icon(option.icon, { size: 16 }) : '';
    const text = option.iconOnly ? '' : `<span>${esc(option.label)}</span>`;
    const name = option.iconOnly ? ` aria-label="${esc(option.label)}"` : '';
    const key = option.key ? ` aria-keyshortcuts="${esc(option.key)}"` : '';
    return `<button type="button" role="radio" class="cot-c-seg__opt" data-value="${esc(option.value)}" aria-checked="${on}"`
      + ` tabindex="${on ? 0 : -1}" data-ui-sound="select"${option.disabled ? ' disabled' : ''}${name}${key}>${glyph}${text}`
      + `${option.key ? keycap(option.key) : ''}</button>`;
  }).join('');
  return `<div class="cot-c-seg${options.className ? ` ${options.className}` : ''}" role="radiogroup" `
    + `aria-label="${esc(options.label)}"${attrs(options.attrs)}>${items}</div>`;
}

interface TabOption {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconId;
  readonly count?: number | string;
  readonly key?: string;
}

interface TabsOptions {
  readonly label: string;
  readonly tabs: readonly TabOption[];
  readonly selected: string;
  /** The id prefix of each tab's panel (`${panelPrefix}-${tab.id}`), for aria-controls. */
  readonly panelPrefix?: string;
  readonly className?: string;
}

/** An underline tab list (SPEC §6.2): labels match their panels' headings; roving tabindex (wireRoving). */
export function tabs(options: TabsOptions): string {
  const items = options.tabs.map((tab) => {
    const on = tab.id === options.selected;
    const controls = options.panelPrefix ? ` aria-controls="${esc(`${options.panelPrefix}-${tab.id}`)}"` : '';
    const count = tab.count === undefined ? '' : `<span class="cot-c-tabs__count num">${esc(tab.count)}</span>`;
    return `<button type="button" role="tab" class="cot-c-tabs__tab" data-tab="${esc(tab.id)}" aria-selected="${on}"`
      + ` tabindex="${on ? 0 : -1}" data-ui-sound="tab"${controls}>${tab.icon ? icon(tab.icon, { size: 18 }) : ''}`
      + `<span>${esc(tab.label)}</span>${count}${tab.key ? keycap(tab.key) : ''}</button>`;
  }).join('');
  return `<div class="cot-c-tabs${options.className ? ` ${options.className}` : ''}" role="tablist" `
    + `aria-label="${esc(options.label)}">${items}</div>`;
}

const ROVING_ITEM = '[role=tab],[role=radio]';
const ROVING_STATE: Readonly<Record<string, string>> = { tab: 'aria-selected', radio: 'aria-checked' };

/**
 * Keyboard and pointer behaviour for a tab list or radio group built above: arrows (and Home / End) move focus and
 * selection, a click selects; `onSelect` hears the value. Returns a function that removes the listeners.
 */
export function wireRoving(host: HTMLElement, onSelect: (value: string, item: HTMLElement) => void): () => void {
  const items = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>(ROVING_ITEM)].filter((item) => !item.hasAttribute('disabled') && !item.hidden);
  const select = (item: HTMLElement, focus: boolean): void => {
    const state = ROVING_STATE[item.getAttribute('role') ?? 'tab'];
    for (const other of items()) {
      const on = other === item;
      other.setAttribute(state, String(on));
      other.tabIndex = on ? 0 : -1;
    }
    if (focus) item.focus();
    onSelect(item.dataset.tab ?? item.dataset.value ?? '', item);
  };
  const onClick = (event: MouseEvent): void => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(ROVING_ITEM);
    if (item && host.contains(item) && !item.hasAttribute('disabled')) select(item, false);
  };
  const onKey = (event: KeyboardEvent): void => {
    const to = rovingTarget(host, items(), event);
    if (!to) return;
    event.preventDefault();
    select(to, true);
  };
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  return () => { host.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); };
}

/** Show `value` as the chosen item of a tab list or radio group built above, without calling its `onSelect` (a surface
 *  re-rendering from its own state). */
export function setRoving(host: HTMLElement, value: string): void {
  for (const item of host.querySelectorAll<HTMLElement>(ROVING_ITEM)) {
    const on = (item.dataset.tab ?? item.dataset.value) === value;
    item.setAttribute(ROVING_STATE[item.getAttribute('role') ?? 'tab'], String(on));
    item.tabIndex = on ? 0 : -1;
  }
}

/** The item an arrow, Home or End moves to from the focused one (null for any other key). */
function rovingTarget(host: HTMLElement, list: readonly HTMLElement[], event: KeyboardEvent): HTMLElement | null {
  const at = list.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return null;
  const vertical = host.getAttribute('aria-orientation') === 'vertical';
  const step = (vertical ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: -1, ArrowRight: 1 }) as Readonly<Record<string, number>>;
  if (event.key === 'Home') return list[0] ?? null;
  if (event.key === 'End') return list.at(-1) ?? null;
  return step[event.key] ? list[(at + step[event.key] + list.length) % list.length] : null;
}

/**
 * Arrow keys for a radio group or tab list whose items already handle their own clicks (a surface that built them
 * itself): arrows (and Home / End) move focus to the next item and press it, so the item's click does the selection.
 * The arrows stay inside the group. Returns a function that removes the listener.
 */
export function wireRovingKeys(host: HTMLElement): () => void {
  const onKey = (event: KeyboardEvent): void => {
    const to = rovingTarget(host, [...host.querySelectorAll<HTMLElement>(ROVING_ITEM)].filter((item) => !item.hasAttribute('disabled') && !item.hidden), event);
    if (!to) return;
    event.preventDefault();
    event.stopPropagation();
    to.focus();
    to.click();
  };
  host.addEventListener('keydown', onKey);
  return () => host.removeEventListener('keydown', onKey);
}

interface ToggleOptions {
  readonly label: string;
  readonly checked: boolean;
  /** The visible state words (the catalog's settings.on / settings.off): state is never only a colour. */
  readonly onWord: string;
  readonly offWord: string;
  readonly attrs?: Attrs;
}

/** A switch with a square knob and its state written beside it (SPEC §6.2). */
export function toggle(options: ToggleOptions): string {
  return `<button type="button" role="switch" class="cot-c-toggle" aria-checked="${options.checked}" aria-label="${esc(options.label)}"`
    + ` data-ui-sound="toggle"${attrs(options.attrs)}><span class="cot-c-toggle__track" aria-hidden="true"><i></i></span>`
    + `<span class="cot-c-toggle__word" data-on="${esc(options.onWord)}" data-off="${esc(options.offWord)}" aria-hidden="true">`
    + `${esc(options.checked ? options.onWord : options.offWord)}</span></button>`;
}

/** Set a toggle()'s state: its switch and the state word written beside it. */
export function setToggle(control: HTMLElement, checked: boolean): void {
  control.setAttribute('aria-checked', String(checked));
  const word = control.querySelector<HTMLElement>('.cot-c-toggle__word');
  if (word) word.textContent = (checked ? word.dataset.on : word.dataset.off) ?? '';
}

/* ---------------------------------------------------------------------------------------------- data and stats */

/**
 * Cells lit on the fixed 20-cell scale for a value between `worst` and `best` (SPEC §6.2, graft A). A range written
 * best-low (`worst` above `best`, as for reload time) reads lower values as better.
 */
export function scaleCells(value: number, worst: number, best: number): number {
  if (!Number.isFinite(value) || worst === best) return 0;
  const share = (value - worst) / (best - worst);
  return Math.max(1, Math.min(20, Math.round(share * 20)));
}

/** The fixed 20-cell scale: `cells` lit, an optional rival tick (a hollow cell, or the lit one it lands on). */
export function scale20(cells: number, rival?: number): string {
  let out = '';
  for (let i = 1; i <= 20; i++) {
    const cls = `${i <= cells ? 'f' : ''}${rival === i ? `${i <= cells ? ' ' : ''}r` : ''}`;
    out += cls ? `<i class="${cls}"></i>` : '<i></i>';
  }
  return `<span class="cot-c-scale" aria-hidden="true">${out}</span>`;
}

interface StatRowOptions {
  readonly label: string;
  /** The raw game value, already formatted for the locale. */
  readonly value: string;
  readonly unit?: string;
  readonly icon?: IconId;
  readonly cells: number;
  readonly rivalCells?: number;
  /** A worded delta against the rival ("+0.3"), with which direction is better. */
  readonly delta?: string;
  /** true: the delta is better; false: worse; omitted: an even comparison (neutral). */
  readonly better?: boolean;
  /** The tight row gap of a dense panel (the Garage overview). */
  readonly compact?: boolean;
}

/** Value + unit beside a fixed scale; raw values always shown beside any rating (SPEC §6.2). */
export function statRow(options: StatRowOptions): string {
  const tone = options.better === undefined ? '' : options.better ? ' is-better' : ' is-worse';
  const delta = options.delta ? `<em class="cot-c-stat__delta${tone}">${esc(options.delta)}</em>` : '';
  const unit = options.unit ? `<small>${esc(options.unit)}</small>` : '';
  return `<div class="cot-c-stat${options.compact ? ' cot-c-stat--compact' : ''}">${options.icon ? icon(options.icon, { size: 18 }) : '<span></span>'}`
    + `<span class="cot-c-stat__label">${esc(options.label)}</span>`
    + `<span class="cot-c-stat__value"><b class="num">${esc(options.value)}</b>${unit}${delta}</span>`
    + `${scale20(options.cells, options.rivalCells)}</div>`;
}

/* ------------------------------------------------------------------------------------------------ stat tiles */

interface StatTileOptions {
  readonly label: string;
  /** The figure, as text; or valueIcon draws a status glyph in its place (survived, destroyed). */
  readonly value?: string;
  readonly valueIcon?: IconId;
  readonly icon?: IconId;
  /** One line under the figure (a ratio, a date). */
  readonly note?: string;
  readonly className?: string;
}

/** One figure with its name (a record's battles, a battle's accuracy): the glyph and name over the figure. */
export function statTile(options: StatTileOptions): string {
  const value = options.valueIcon ? icon(options.valueIcon, { size: 24 }) : esc(options.value ?? '');
  const note = options.note ? `<small class="cot-c-tile__note">${esc(options.note)}</small>` : '';
  return `<div class="cot-c-tile${options.className ? ` ${options.className}` : ''}"><span class="cot-c-tile__label">`
    + `${options.icon ? icon(options.icon, { size: 16 }) : ''}${esc(options.label)}</span><strong class="cot-c-tile__value">${value}</strong>${note}</div>`;
}

/* ------------------------------------------------------------------------------------------------ empty states */

interface EmptyStateOptions {
  readonly text: string;
  readonly icon?: IconId;
  /** The one way forward (Clear filters): a quiet button with the caller's data attributes. */
  readonly action?: { readonly label: string; readonly attrs?: Attrs };
  readonly className?: string;
}

/** What a list says when it has nothing to show: one line, an optional glyph and at most one action. */
export function emptyState(options: EmptyStateOptions): string {
  const action = options.action
    ? `<button type="button" class="cot-c-btn cot-c-btn--36" data-ui-sound="press"${attrs(options.action.attrs)}>${esc(options.action.label)}</button>` : '';
  return `<div class="cot-c-empty${options.className ? ` ${options.className}` : ''}">${options.icon ? icon(options.icon, { size: 24 }) : ''}`
    + `<p>${esc(options.text)}</p>${action}</div>`;
}

/* ---------------------------------------------------------------------------------------------------- rules */

/**
 * The data voice's inline facts, a glyph and a value each (the direction's `.rules`: "7 v 7", "15:00", "750"). Each
 * glyph is decorative; give the row an accessible name where the values need one.
 */
export function rules(items: readonly (readonly [IconId, string])[], className = ''): string {
  return `<span class="cot-c-rules${className ? ` ${esc(className)}` : ''}">`
    + items.map(([glyph, value]) => `<span>${icon(glyph, { size: 14 })}${esc(value)}</span>`).join('') + '</span>';
}

/* -------------------------------------------------------------------------------------------------- skeleton */

/**
 * A placeholder that holds a dynamic island's exact space until its content arrives (owner 2026-10-22: render the
 * shell at once, never block navigation, no visual pops). Size it like the content it stands for; it never animates.
 */
export function skeleton(className = ''): string {
  return `<span class="cot-c-skel${className ? ` ${esc(className)}` : ''}" aria-hidden="true"></span>`;
}
