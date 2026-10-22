// Shared UI components (brand-ui SPEC §6, BUI-F5). Copyright © 2026 Kevin B. Liu.
//
// Framework-free markup factories over the design tokens (src/ui/tokens) and the icon sprite (src/ui/icons): each
// returns an HTML string the surfaces compose, the way the shell already builds its screens. Every factory takes
// translated text (the caller reads the catalog; no literals live here), sets the ARIA the control needs and a
// data-ui-sound role (SPEC §10), and draws its states from the one stylesheet below, which declares into the
// `components` cascade layer: a surface restyles a component without !important (src/ui/styleLayers.ts).
//
// The kit is deliberately small (owner 2026-10-22: less is more). It holds what the rebuilt surfaces use: buttons,
// key caps, chips and tags, segmented controls, tabs with roving focus, toggles, stat rows on the fixed 20-cell scale,
// and the vehicle identity (flag, silhouette, name). Plates are classes. Modal, select, slider and tooltip keep their
// existing owners (modal.ts, customSelect.ts, settings.ts, richTooltip.ts).

import { icon, type IconId } from '../icons/icon.ts';
import { flagIconUrl } from '../flags.ts';
import { iconUrl } from '../icons.ts';
import { ensureStyle } from '../styleLayers.ts';

/** What a control sounds like when used (SPEC §10; src/audio/interfaceSounds.ts reads it). */
type SoundRole = 'tick' | 'press' | 'confirm' | 'back' | 'tab' | 'toggle' | 'select' | 'deploy' | 'error';

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text and attribute values are escaped once, here. */
export const esc = (value: string | number): string => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

/** Extra attributes for a host element, escaped; `true` writes a bare attribute, false/null/undefined omit it. */
type Attrs = Readonly<Record<string, string | number | boolean | null | undefined>>;
function attrs(extra: Attrs | undefined): string {
  if (!extra) return '';
  let out = '';
  for (const [name, value] of Object.entries(extra)) {
    if (value === false || value === null || value === undefined) continue;
    out += value === true ? ` ${name}` : ` ${name}="${esc(value)}"`;
  }
  return out;
}

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
  /** Icon-only: the label becomes the accessible name and the visible text goes. */
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
  const name = options.iconOnly ? ` aria-label="${esc(options.label)}" title="${esc(options.label)}"` : '';
  const text = options.iconOnly ? '' : `<span class="cot-c-btn__label">${esc(options.label)}</span>`;
  return `<button type="button" class="${cls}" data-ui-sound="${sound}"${name}${attrs(options.attrs)}>${glyph}${text}`
    + `${options.key && !options.iconOnly ? keycap(options.key) : ''}</button>`;
}

/** A keyboard key cap; touch layouts hide it (SPEC §6.2 input glyphs). */
export function keycap(key: string): string {
  return `<kbd class="cot-c-kbd" aria-hidden="true">${esc(key)}</kbd>`;
}

/* ------------------------------------------------------------------------------------------------- chips and tags */

interface ChipOptions {
  readonly label: string;
  readonly icon?: IconId;
  /** A flag in place of the icon (nation filters). */
  readonly nation?: string;
  /** A toggle chip (filters): aria-pressed carries the state. Omit for a static chip. */
  readonly pressed?: boolean;
  /** Show only the glyph or flag; the label becomes the accessible name. */
  readonly compact?: boolean;
  readonly count?: number | string;
  readonly className?: string;
  readonly attrs?: Attrs;
}

export function chip(options: ChipOptions): string {
  const lead = options.nation ? flag(options.nation, 'sm') : options.icon ? icon(options.icon, { size: 16 }) : '';
  const cls = `cot-c-chip${options.compact ? ' cot-c-chip--compact' : ''}${options.className ? ` ${options.className}` : ''}`;
  const count = options.count === undefined ? '' : `<span class="cot-c-chip__count num">${esc(options.count)}</span>`;
  const text = options.compact ? '' : `<span class="cot-c-chip__label">${esc(options.label)}</span>`;
  const name = options.compact ? ` aria-label="${esc(options.label)}" title="${esc(options.label)}"` : '';
  if (options.pressed === undefined) return `<span class="${cls}"${name}${attrs(options.attrs)}>${lead}${text}${count}</span>`;
  return `<button type="button" class="${cls}" aria-pressed="${options.pressed}" data-ui-sound="toggle"${name}`
    + `${attrs(options.attrs)}>${lead}${text}${count}</button>`;
}

type TagTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';
/** A short status word (New, Recommended, Campaign 3/6): at most 14 characters. */
export function tag(text: string, tone: TagTone = 'neutral'): string {
  return `<span class="cot-c-tag cot-c-tag--${tone}">${esc(text)}</span>`;
}

/* ---------------------------------------------------------------------------------------------- choice controls */

interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: IconId;
  /** Show the glyph only; the label is the accessible name. */
  readonly iconOnly?: boolean;
  readonly disabled?: boolean;
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
    const name = option.iconOnly ? ` aria-label="${esc(option.label)}" title="${esc(option.label)}"` : '';
    return `<button type="button" role="radio" class="cot-c-seg__opt" data-value="${esc(option.value)}" aria-checked="${on}"`
      + ` tabindex="${on ? 0 : -1}" data-ui-sound="select"${option.disabled ? ' disabled' : ''}${name}>${glyph}${text}</button>`;
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
  const items = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>(ROVING_ITEM)].filter((item) => !item.hasAttribute('disabled'));
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
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const vertical = host.getAttribute('aria-orientation') === 'vertical';
    const step = (vertical ? { ArrowUp: -1, ArrowDown: 1 } : { ArrowLeft: -1, ArrowRight: 1 }) as Readonly<Record<string, number>>;
    let to = -1;
    if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = list.length - 1;
    else if (step[event.key]) to = (at + step[event.key] + list.length) % list.length;
    if (to < 0) return;
    event.preventDefault();
    select(list[to], true);
  };
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  return () => { host.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); };
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
  readonly better?: boolean;
}

/** Value + unit beside a fixed scale; raw values always shown beside any rating (SPEC §6.2). */
export function statRow(options: StatRowOptions): string {
  const delta = options.delta
    ? `<em class="cot-c-stat__delta ${options.better ? 'is-better' : 'is-worse'}">${esc(options.delta)}</em>` : '';
  const unit = options.unit ? `<small>${esc(options.unit)}</small>` : '';
  return `<div class="cot-c-stat">${options.icon ? icon(options.icon, { size: 18 }) : '<span></span>'}`
    + `<span class="cot-c-stat__label">${esc(options.label)}</span>`
    + `<span class="cot-c-stat__value"><b class="num">${esc(options.value)}</b>${unit}${delta}</span>`
    + `${scale20(options.cells, options.rivalCells)}</div>`;
}

/* ----------------------------------------------------------------------------------------- vehicle identity */

type FlagSize = 'sm' | 'md' | 'lg';
/** A nation flag chip (3:2 hairline frame, SPEC §6.2 badge). Decorative: the nation is named beside it. */
export function flag(nation: string, size: FlagSize = 'md'): string {
  return `<img class="cot-c-flag cot-c-flag--${size}" src="${esc(flagIconUrl(nation))}" alt="" aria-hidden="true" draggable="false">`;
}

/** A vehicle's side silhouette, tinted by the text colour (team colours come from the host). */
export function silhouette(id: string, facing: 'left' | 'right' = 'left'): string {
  return `<span class="cot-c-sil${facing === 'right' ? ' cot-c-sil--right' : ''}" aria-hidden="true" `
    + `style="--sil:url(${esc(iconUrl(id, 'side_silhouette'))})"></span>`;
}

interface VehicleOptions {
  readonly id: string;
  readonly nation: string;
  readonly name: string;
  readonly facing?: 'left' | 'right';
  readonly className?: string;
}

/** Flag, silhouette and name: how every vehicle is named on screen (owner UI rule 3). */
export function vehicle(options: VehicleOptions): string {
  return `<span class="cot-c-veh${options.className ? ` ${options.className}` : ''}">${flag(options.nation, 'sm')}`
    + `${silhouette(options.id, options.facing)}<b>${esc(options.name)}</b></span>`;
}

/* -------------------------------------------------------------------------------------------------- skeleton */

/**
 * A placeholder that holds a dynamic island's exact space until its content arrives (owner 2026-10-22: render the
 * shell at once, never block navigation, no visual pops). Size it like the content it stands for; it never animates.
 */
export function skeleton(className = ''): string {
  return `<span class="cot-c-skel${className ? ` ${esc(className)}` : ''}" aria-hidden="true"></span>`;
}

/* ------------------------------------------------------------------------------------------------------- styles */

// Tokens only (src/ui/tokens): every colour, size, radius, shadow and duration reads a custom property, so the
// presets (colour vision, contrast, motion) reach the components with no code here.
const CSS = `
.cot-c-btn{--h:var(--btn-h-m);box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);
  height:var(--h);min-width:var(--h);padding:0 var(--s5);border:1px solid var(--btn-secondary-edge);border-radius:var(--control-radius);
  background:var(--btn-secondary-fill);color:var(--ink-1);cursor:pointer;font:600 var(--fs-14)/1 var(--font-display);
  letter-spacing:var(--track-label-s);text-transform:uppercase;white-space:nowrap;
  transition:background-color var(--dur-fast) var(--ease-enter),color var(--dur-fast) var(--ease-enter),transform var(--dur-instant) var(--ease-enter)}
.cot-c-btn--36{--h:var(--btn-h-s);padding:0 var(--s4);font-size:var(--fs-13)}
.cot-c-btn--56{--h:var(--btn-h-l);padding:0 var(--s6);font-size:var(--fs-16)}
.cot-c-btn--64{--h:var(--btn-h-xl);padding:0 var(--s6);font-size:var(--fs-18);letter-spacing:var(--track-label)}
.cot-c-btn--icon{padding:0;width:var(--h)}
.cot-c-btn--primary{background:var(--btn-primary-fill);color:var(--btn-primary-ink);border-color:var(--btn-primary-fill);box-shadow:var(--btn-primary-bevel)}
.cot-c-btn--ghost,.cot-c-btn--quiet{background:transparent;border-color:transparent;color:var(--ink-2)}
.cot-c-btn--quiet{color:var(--ink-3);text-transform:none;letter-spacing:normal;font-family:var(--font-ui)}
.cot-c-btn--danger{background:transparent;color:var(--text-danger);border-color:var(--btn-danger-edge)}
@media (hover:hover){
  .cot-c-btn:hover{background:var(--surface-hover);color:var(--ink-1)}
  .cot-c-btn--primary:hover{background:var(--btn-primary-hover);border-color:var(--btn-primary-hover);color:var(--btn-primary-ink)}
}
.cot-c-btn:active{transform:translateY(var(--btn-press-drop));border-color:var(--btn-press-edge)}
.cot-c-btn--primary:active{background:var(--btn-primary-press);border-color:var(--btn-primary-press);box-shadow:none}
.cot-c-btn:focus-visible,.cot-c-chip:focus-visible,.cot-c-seg__opt:focus-visible,.cot-c-tabs__tab:focus-visible,.cot-c-toggle:focus-visible{
  outline:none;box-shadow:var(--focus-ring)}
.cot-c-btn:disabled,.cot-c-btn[aria-disabled=true]{color:var(--btn-disabled-ink);background:transparent;border-color:var(--line-2);
  box-shadow:none;cursor:not-allowed;transform:none}
.cot-c-btn .cot-i{flex:none}
.cot-c-kbd{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 var(--s1);
  border:1px solid var(--line-3);border-radius:var(--control-radius);font:500 var(--fs-11)/1 var(--font-mono);letter-spacing:normal;
  text-transform:none;color:var(--ink-2)}
.cot-c-btn--primary .cot-c-kbd{color:var(--btn-primary-ink);border-color:currentColor}
body.cot-touch-layout .cot-c-kbd{display:none}
.cot-c-chip{box-sizing:border-box;display:inline-flex;align-items:center;gap:var(--s2);height:32px;padding:0 var(--s3);
  border:1px solid var(--chip-edge);border-radius:var(--chip-radius);background:var(--chip-fill);color:var(--ink-2);
  font:500 var(--fs-13)/1 var(--font-ui);white-space:nowrap}
button.cot-c-chip{cursor:pointer}
.cot-c-chip--compact{width:40px;padding:0;justify-content:center}
.cot-c-chip[aria-pressed=true]{color:var(--ink-1);background:var(--chip-fill-on);border-color:var(--chip-edge-on)}
.cot-c-chip__count{color:var(--ink-3);font-size:var(--fs-12)}
.cot-c-tag{box-sizing:border-box;display:inline-flex;align-items:center;height:20px;padding:0 var(--s2);border:1px solid var(--line-2);
  border-radius:var(--control-radius);font:600 var(--fs-11)/1 var(--font-display);letter-spacing:var(--track-label-s);
  text-transform:uppercase;color:var(--ink-2);white-space:nowrap}
.cot-c-tag--accent{color:var(--btn-primary-ink);background:var(--accent);border-color:var(--accent)}
.cot-c-tag--ok{color:var(--text-ok);border-color:var(--ok)}
.cot-c-tag--warn{color:var(--text-warn);border-color:var(--warn)}
.cot-c-tag--danger{color:var(--text-danger);border-color:var(--danger)}
.cot-c-seg{box-sizing:border-box;display:inline-flex;gap:2px;padding:2px;border:1px solid var(--line-1);border-radius:var(--control-radius);
  background:var(--btn-secondary-fill)}
.cot-c-seg__opt{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);min-width:40px;height:36px;
  padding:0 var(--s3);border:0;border-bottom:2px solid transparent;border-radius:var(--control-radius);background:transparent;color:var(--ink-3);
  font:500 var(--fs-13)/1 var(--font-ui);cursor:pointer;white-space:nowrap}
.cot-c-seg__opt[aria-checked=true]{background:var(--surface-hover);color:var(--ink-1);border-bottom-color:var(--accent)}
.cot-c-seg__opt:disabled{color:var(--ink-4);cursor:not-allowed}
.cot-c-tabs{display:flex;gap:var(--s5);border-bottom:1px solid var(--line-1)}
.cot-c-tabs__tab{position:relative;display:inline-flex;align-items:center;gap:var(--s2);min-height:44px;padding:0;border:0;background:none;
  color:var(--ink-3);font:600 var(--fs-14)/1 var(--font-display);letter-spacing:var(--track-label-s);text-transform:uppercase;cursor:pointer;
  white-space:nowrap}
.cot-c-tabs__tab[aria-selected=true]{color:var(--ink-1)}
.cot-c-tabs__tab[aria-selected=true]::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--accent)}
.cot-c-tabs__count{color:var(--ink-3);font-size:var(--fs-12)}
.cot-c-toggle{display:inline-flex;align-items:center;gap:var(--s2);min-height:36px;padding:0;border:0;background:none;color:var(--ink-2);
  cursor:pointer;font:600 var(--fs-12)/1 var(--font-display);letter-spacing:var(--track-label-s);text-transform:uppercase}
.cot-c-toggle__track{box-sizing:border-box;position:relative;width:36px;height:20px;border:1px solid var(--line-control);
  border-radius:var(--control-radius);background:var(--btn-secondary-fill)}
.cot-c-toggle__track i{position:absolute;left:2px;top:2px;width:14px;height:14px;background:var(--ink-3);
  transition:transform var(--dur-fast) var(--ease-enter),background-color var(--dur-fast) var(--ease-enter)}
.cot-c-toggle[aria-checked=true] .cot-c-toggle__track{background:var(--accent-wash);border-color:var(--accent)}
.cot-c-toggle[aria-checked=true] .cot-c-toggle__track i{transform:translateX(16px);background:var(--accent)}
.cot-c-toggle[aria-checked=true]{color:var(--ink-1)}
.cot-c-scale{display:grid;grid-template-columns:repeat(20,1fr);gap:2px;height:8px}
.cot-c-scale i{box-sizing:border-box;background:var(--line-2)}
.cot-c-scale i.f{background:var(--ink-2)}
.cot-c-scale i.r{background:transparent;border:1px solid var(--accent)}
.cot-c-scale i.f.r{background:var(--accent)}
.cot-c-stat{display:grid;grid-template-columns:20px minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:var(--s3);row-gap:var(--s2);
  align-items:center}
.cot-c-stat>.cot-i,.cot-c-stat>span:first-child{grid-row:span 2;color:var(--ink-3)}
.cot-c-stat__label{min-width:0;font:500 var(--fs-13)/1.1 var(--font-ui);color:var(--ink-2)}
.cot-c-stat__value{display:inline-flex;align-items:baseline;gap:var(--s1);white-space:nowrap}
.cot-c-stat__value b{font:700 var(--fs-18)/1 var(--font-display);color:var(--ink-1)}
.cot-c-stat__value small{font:500 var(--fs-11)/1 var(--font-mono);color:var(--ink-3)}
.cot-c-stat__delta{margin-left:var(--s2);font:500 var(--fs-11)/1 var(--font-mono);font-style:normal}
.cot-c-stat__delta.is-better{color:var(--text-ok)}
.cot-c-stat__delta.is-worse{color:var(--text-danger)}
.cot-c-stat .cot-c-scale{grid-column:2/span 2}
.cot-c-flag{box-sizing:border-box;display:inline-block;flex:none;object-fit:cover;border:1px solid var(--line-2);border-radius:var(--control-radius)}
.cot-c-flag--sm{width:20px;height:15px}
.cot-c-flag--md{width:24px;height:18px}
.cot-c-flag--lg{width:32px;height:24px}
.cot-c-sil{display:inline-block;flex:none;width:40px;height:14px;background:currentColor;-webkit-mask:var(--sil) center/contain no-repeat;
  mask:var(--sil) center/contain no-repeat}
.cot-c-sil--right{transform:scaleX(-1)}
.cot-c-veh{display:inline-flex;align-items:center;gap:var(--s2);min-width:0;color:var(--ink-2)}
.cot-c-veh b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 var(--fs-14)/1.1 var(--font-display);color:var(--ink-1)}
.cot-c-plate{background:var(--plate-highlight),var(--plate-fill);border-radius:var(--plate-radius);box-shadow:var(--plate-shadow)}
.cot-c-plate--raised{background:var(--plate-highlight),var(--surface-raised);box-shadow:var(--e2)}
.cot-c-plate--hud{background:var(--plate-highlight),var(--hud-plate)}
.cot-c-skel{display:block;min-height:1em;border-radius:var(--control-radius);background:var(--btn-secondary-fill)}
@media (prefers-reduced-motion:reduce){.cot-c-btn,.cot-c-toggle__track i{transition:none}}
`;

/** Mount the component sheet once (idempotent); every surface that renders a component calls it. */
export function ensureComponentStyles(): void {
  if (typeof document === 'undefined') return;
  ensureStyle('cot-components', CSS, 'components');
}
