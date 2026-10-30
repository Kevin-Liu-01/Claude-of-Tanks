// picker.ts — the kit's one "choose one of a set" (INTERACTION-REDESIGN.md, the picker contract; owner 2026-10-26: "make map
// selection much more intituitve, as well as camo, i really mean update all legacy interaction surfaces and systems").
// Copyright © 2026 Kevin B. Liu.
//
// Every surface that picks one item from a set (a battlefield, a camo, a mode, a tank, a nation, an hour) mounts this
// controller and nothing else. It shows the things themselves as cards, swatches or rows; hovering or focusing one
// previews it in place through the caller (onPreview), leaving restores (onPreview(null)), and one press chooses
// (onChoose). The keys are the same everywhere: arrows move, Enter or Space chooses, Esc restores and then backs out,
// / searches, F marks a favourite, R chooses the caller's Random item. Favourites, recents and the last choice live
// under the caller's memory key. The pure helpers (the filter, the grid step, the memory) carry the behaviour the
// selftest pins; the controller only wires them to the DOM.

import { icon, type IconId } from '../icons/icon.ts';
import { esc } from './escape.ts';

export interface PickerItem {
  readonly id: string;
  readonly name: string;
  /** At most two short data strings: a map's size and biome, a camo's nation and kind. */
  readonly facts?: readonly string[];
  /** The thing itself: its picture (with a srcset where it has rungs), or for a set's Random up to four of its pictures.
   *  A list row shows the poster as its thumbnail, so every list of tanks shows each tank (owner 2026-10-27); `tank` marks
   *  a tank's portrait (icons.ts tankThumbUrl), cropped to the fleet's shared framing. */
  readonly media?: { readonly poster?: string; readonly srcset?: string; readonly sizes?: string; readonly mosaic?: readonly string[];
    readonly tank?: boolean };
  readonly glyph?: IconId;
  /** A small picture (its image URL) drawn in the glyph's place at 4:3: a nation's flag, a colour preset's swatch. */
  readonly chip?: string;
  /** A game mode id: the glyph wears that mode's hue (data-mode-tone). */
  readonly tone?: string;
  /** The filter tags it answers (a biome, a size, a kind). */
  readonly tags?: readonly string[];
  /** Why it cannot be chosen here: the hover tip says so. */
  readonly disabled?: string;
}

export interface PickerFilter {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconId;
}

/** The words the picker shows, in the caller's catalog. */
export interface PickerText {
  readonly search: string;
  readonly favourites: string;
  readonly recent: string;
  readonly favourite: string;
  readonly empty: string;
  readonly clear: string;
  /** The chip row's overflow button: it steps the row on, and turns back at its end. */
  readonly more: string;
  /** A picker menu's sheet's close (pickerMenu.ts). */
  readonly close?: string;
}

interface PickerOptions {
  /** The registry id (src/ui/interactionRegistry.ts), stamped as data-picker. */
  readonly id: string;
  /** The set's name, for assistive tech. */
  readonly label: string;
  readonly items: readonly PickerItem[];
  readonly value: string | null;
  readonly layout: 'cards' | 'swatches' | 'list';
  readonly text: PickerText;
  /** Called once a frame at most with the option under the pointer or the focus; null restores the chosen state. */
  readonly onPreview: (item: PickerItem | null) => void;
  readonly onChoose: (item: PickerItem) => void;
  readonly filters?: readonly PickerFilter[];
  /** The item R chooses and the grid leads with (the caller's own Random item). */
  readonly randomId?: string;
  /** The storage key for favourites, recents and the last choice; without it the picker remembers nothing. */
  readonly memory?: string;
}

interface PickerController {
  setItems(items: readonly PickerItem[], value?: string | null): void;
  setValue(id: string | null): void;
  focus(): void;
  dispose(): void;
}

/**
 * A sideways strip of chips that shows only whole chips: one the strip's edge would cut is hidden (class is-cut) but stays
 * in the tab order, so the focus scrolls it in, and the strip stops on chip starts (CSS .cot-c-whole). A surface keeps its
 * own cue that more follow (a more button, a count). The r25 critic read "Surv", "ecent" and a flag's "1" at strip edges,
 * under fades, as clipped words. Returns the disconnect; `onChange` hears the cut chips change.
 */
export function wholeChips(strip: HTMLElement, onChange?: () => void): () => void {
  if (typeof IntersectionObserver !== 'function' || typeof MutationObserver !== 'function') return () => {};
  strip.classList.add('cot-c-whole');
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('is-cut', entry.intersectionRatio < WHOLE_SHARE);
    onChange?.();
  }, { root: strip, threshold: [0, WHOLE_SHARE] });
  const watch = (): void => { seen.disconnect(); for (const chip of strip.children) seen.observe(chip); };
  const changes = new MutationObserver(watch);
  watch();
  changes.observe(strip, { childList: true });
  return () => { seen.disconnect(); changes.disconnect(); };
}
/** The share of a chip that must show for it to count as whole (a subpixel edge does not cut it). */
const WHOLE_SHARE = 0.98;

/** Search and filters appear past this many items. */
const SEARCH_FROM = 9;
/** Recents kept per memory key. */
const RECENT_MAX = 6;

/* ------------------------------------------------------------------------------------------------------ the memory */

interface PickerMemory {
  readonly favourites: readonly string[];
  readonly recent: readonly string[];
}

const EMPTY_MEMORY: PickerMemory = Object.freeze({ favourites: [], recent: [] });

/** The caller's remembered favourites and recents; storage may be absent or refuse, and the picker works without it. */
export function readMemory(key: string | undefined, storage: Pick<Storage, 'getItem'> | null = safeStorage()): PickerMemory {
  if (!key || !storage) return EMPTY_MEMORY;
  try {
    const raw = JSON.parse(storage.getItem(`cot.picker.${key}`) ?? 'null') as Partial<PickerMemory> | null;
    const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
    return { favourites: list(raw?.favourites), recent: list(raw?.recent).slice(0, RECENT_MAX) };
  } catch { return EMPTY_MEMORY; }
}

function writeMemory(key: string | undefined, memory: PickerMemory, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  if (!key || !storage) return;
  try { storage.setItem(`cot.picker.${key}`, JSON.stringify(memory)); } catch { /* private mode or full: the choice still stands */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** A choice moves to the front of the recents. */
export function remember(memory: PickerMemory, id: string): PickerMemory {
  return { favourites: memory.favourites, recent: [id, ...memory.recent.filter((other) => other !== id)].slice(0, RECENT_MAX) };
}

export function toggleFavourite(memory: PickerMemory, id: string): PickerMemory {
  const on = memory.favourites.includes(id);
  return { favourites: on ? memory.favourites.filter((other) => other !== id) : [...memory.favourites, id], recent: memory.recent };
}

/* ------------------------------------------------------------------------------------------------------ the filter */

interface PickerQuery {
  readonly text: string;
  /** Pressed filter chips: an item shows when it answers every one. */
  readonly tags: readonly string[];
  readonly favourites: boolean;
  readonly recent: boolean;
}

// (NFKD reads a no-break space as a space; a word joiner a caller set inside a name is dropped)
const fold = (value: string): string => value.normalize('NFKD').replace(/\p{M}|\u2060/gu, '').toLocaleLowerCase();

/**
 * The items a query keeps, in the caller's order (recents in their own order when that chip is pressed). The Random item
 * always leads and survives every filter but the search, so a filtered set can still be rolled.
 */
export function filterItems(items: readonly PickerItem[], query: PickerQuery, memory: PickerMemory, randomId?: string): PickerItem[] {
  const words = fold(query.text).split(/\s+/).filter(Boolean);
  const matches = (item: PickerItem): boolean => {
    const hay = fold([item.name, ...(item.facts ?? [])].join(' '));
    return words.every((word) => hay.includes(word));
  };
  const random = items.find((item) => item.id === randomId);
  const rest = items.filter((item) => item.id !== randomId).filter((item) => matches(item)
    && query.tags.every((tag) => item.tags?.includes(tag))
    && (!query.favourites || memory.favourites.includes(item.id))
    && (!query.recent || memory.recent.includes(item.id)));
  if (query.recent) rest.sort((a, b) => memory.recent.indexOf(a.id) - memory.recent.indexOf(b.id));
  return random && matches(random) ? [random, ...rest] : rest;
}

/**
 * Where an arrow, Home or End moves in a grid of `columns` (1 for a list): left and right step one, up and down a row,
 * clamped at the ends rather than wrapping. Null for any other key.
 */
export function gridStep(at: number, key: string, columns: number, count: number): number | null {
  if (count <= 0) return null;
  const cols = Math.max(1, columns);
  const to = ({ ArrowLeft: at - 1, ArrowRight: at + 1, ArrowUp: at - cols, ArrowDown: at + cols, Home: 0, End: count - 1 } as Record<string, number>)[key];
  return to === undefined ? null : Math.min(count - 1, Math.max(0, to));
}

/* -------------------------------------------------------------------------------------------------- the controller */

/** A list row's picture: the poster as a thumbnail at the row's start (a tank's portrait on its framing, a photograph
 *  filling a 2:1 box), shown once it has decoded (pickers.css [data-ready]) so a late picture fades in rather than popping.
 *  Its source waits in data-src until the row nears the list's view (the controller's observer, rooted on the list). */
const thumbMarkup = (item: PickerItem): string => (item.media?.poster
  ? `<span class="cot-c-picker__thumb${item.media.tank ? ' is-tank' : ''}"><img data-src="${esc(item.media.poster)}" alt="" decoding="async"></span>` : '');
/** How far beyond the list's view a row's picture loads: a fling or a jump to the end finds its rows drawn (the 261
 *  critic: the native lazy load waited for a row to show, so a row half in view had no picture). */
const THUMB_AHEAD = '600px 0px';

const optionMarkup = (item: PickerItem, chosen: boolean, favourite: boolean | null, layout: PickerOptions['layout'], text: PickerText): string => {
  const picture = !item.media || layout === 'list' ? ''
    : item.media.mosaic?.length
      ? `<span class="cot-c-picker__mosaic">${item.media.mosaic.slice(0, 4).map((src) => `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`).join('')}</span>`
      : item.media.poster ? `<img src="${esc(item.media.poster)}"`
        + `${item.media.srcset ? ` srcset="${esc(item.media.srcset)}" sizes="${esc(item.media.sizes ?? '240px')}"` : ''} alt="" loading="lazy" decoding="async">` : '';
  const media = picture ? `<span class="cot-c-picker__media cot-c-media cot-c-media--soft">${picture}</span>` : '';
  const glyph = item.chip ? `<span class="cot-c-picker__glyph cot-c-picker__chip"><img src="${esc(item.chip)}" alt="" decoding="async"></span>`
    : item.glyph ? `<span class="cot-c-picker__glyph"${item.tone ? ` data-mode-tone="${esc(item.tone)}"` : ''}>${icon(item.glyph, { size: 18 })}</span>` : '';
  const facts = item.facts?.length ? `<span class="cot-c-picker__facts">${item.facts.slice(0, 2).map((fact) => `<span>${esc(fact)}</span>`).join('')}</span>` : '';
  const tip = item.disabled ? ` data-tip="${esc(item.disabled)}"` : '';
  return `<div class="cot-c-picker__cell" role="presentation">`
    + `<div class="cot-c-picker__opt" role="option" id="" data-id="${esc(item.id)}" aria-selected="${chosen}" tabindex="-1"`
    + `${item.disabled ? ' aria-disabled="true"' : ''}${tip} data-ui-sound="select">${layout === 'list' ? thumbMarkup(item) : media}`
    + `<span class="cot-c-picker__words">${glyph}<span class="cot-c-picker__name">${esc(item.name)}</span>${facts}</span></div>`
    // a picker without a memory (a menu's short set) keeps no favourites, so it draws no star
    + (favourite === null ? '</div>' : `<button type="button" class="cot-c-picker__fav" tabindex="-1" aria-pressed="${favourite}" aria-label="${esc(text.favourite)}"`
    + ` data-tip="${esc(text.favourite)} (F)" data-ui-sound="toggle">${icon('star', { size: 16 })}</button></div>`);
};

/** Mount the picker into `host` (its contents are replaced). */
export function createPicker(host: HTMLElement, options: PickerOptions): PickerController {
  let items = options.items;
  let value = options.value;
  let memory = readMemory(options.memory);
  let query: PickerQuery = { text: '', tags: [], favourites: false, recent: false };
  let shown: PickerItem[] = [];
  let previewed: string | null = null;
  let frame = 0;
  let pending: PickerItem | null | undefined;
  const uid = `cot-picker-${options.id}-${Math.random().toString(36).slice(2, 7)}`;

  host.classList.add('cot-c-picker', `cot-c-picker--${options.layout}`);
  host.classList.toggle('cot-c-picker--plain', !options.memory);
  host.dataset.picker = options.id;
  const searchable = (): boolean => items.length >= SEARCH_FROM;
  const chips = (): string => [
    ...(options.memory ? [['favourites', options.text.favourites, 'star'], ['recent', options.text.recent, 'clock']] as const : []),
    ...(options.filters ?? []).map((filter) => [`tag:${filter.id}`, filter.label, filter.icon] as const),
  ].map(([key, label, glyph]) => `<button type="button" class="cot-c-chip" data-chip="${esc(key)}" aria-pressed="false" data-ui-sound="toggle">`
    + `${glyph ? icon(glyph as IconId, { size: 16 }) : ''}<span class="cot-c-chip__label">${esc(label)}</span></button>`).join('');
  host.innerHTML = '<div class="cot-c-picker__bar">'
    + `<input class="cot-c-picker__search" type="search" placeholder="${esc(options.text.search)}" aria-label="${esc(options.text.search)}"`
    + ` aria-controls="${uid}" autocomplete="off" spellcheck="false"><div class="cot-c-picker__filters">`
    + `<div class="cot-c-picker__chips" role="group">${chips()}</div><button type="button" class="cot-c-picker__more cot-c-btn cot-c-btn--36 cot-c-btn--icon"`
    + ` data-picker-more aria-label="${esc(options.text.more)}" data-tip="${esc(options.text.more)}" data-ui-sound="press" hidden>`
    + `${icon('chevronRight', { size: 16 })}</button></div></div>`
    + `<div class="cot-c-picker__grid" id="${uid}" role="listbox" aria-label="${esc(options.label)}"></div>`
    + `<div class="cot-c-picker__empty cot-c-empty" hidden><p>${esc(options.text.empty)}</p>`
    + `<button type="button" class="cot-c-btn cot-c-btn--36" data-picker-clear data-ui-sound="press">${esc(options.text.clear)}</button></div>`;
  const bar = host.querySelector<HTMLElement>('.cot-c-picker__bar')!;
  bar.hidden = !searchable();
  const search = host.querySelector<HTMLInputElement>('.cot-c-picker__search')!;
  const grid = host.querySelector<HTMLElement>('.cot-c-picker__grid')!;
  const empty = host.querySelector<HTMLElement>('.cot-c-picker__empty')!;
  const chipRow = host.querySelector<HTMLElement>('.cot-c-picker__chips')!;
  const more = host.querySelector<HTMLButtonElement>('[data-picker-more]')!;
  /** The chips stand in pages of whole chips (owner 2026-10-27: filter chips never clip): the row shows the chips that fit
   *  whole from its page's first, a chip cut by the row's end stays hidden (data-off) until its page, and the more button
   *  shows while chips lie past the page's end, stepping to the next page and turning back at the last. */
  const chips$ = (): HTMLElement[] => [...chipRow.querySelectorAll<HTMLElement>('[data-chip]')];
  // a tail as wide as the row after the last chip, so the last page starts on the row's edge too (the scroll's end held it
  // short: the 261 critic's zh last page started 5 px in and showed three chips of the page before)
  const tail = document.createElement('span');
  tail.className = 'cot-c-picker__chips-tail';
  tail.setAttribute('aria-hidden', 'true');
  chipRow.append(tail);
  const syncMore = (): void => {
    tail.style.width = `${chipRow.clientWidth}px`;
    const row = chipRow.getBoundingClientRect();
    let off = false, cut = false;
    for (const chip of chips$()) {
      const box = chip.getBoundingClientRect();
      const hidden = box.left < row.left - 0.5 || box.right > row.right + 0.5;
      chip.toggleAttribute('data-off', hidden);
      off ||= hidden;
      if (hidden && box.left >= row.left) cut = true;
    }
    more.hidden = !off;
    more.classList.toggle('is-back', off && !cut);
  };
  // a resize changes the chips' widths under a kept offset: a scrolled row pages again from its first chip still in view,
  // so none stands cut and hidden at its start (premiere-gallery-studio's 261 finding: a 52 px gap before "Sequences")
  // each chip's width is rounded up to a whole pixel, so every page's offset is whole and its first chip stands on the row's
  // edge exactly as the first page's does (the 261 critics: a page 1 px in, then a chip a fraction out and hidden)
  const wholeChipWidths = (): void => {
    const list = chips$();
    for (const chip of list) chip.style.width = '';
    for (const chip of list) chip.style.width = `${Math.ceil(chip.getBoundingClientRect().width)}px`;
  };
  const chipsResize = new ResizeObserver(() => {
    // (a hidden row has no widths to round: it is measured once it shows)
    if (!chipRow.clientWidth) return;
    wholeChipWidths();
    if (chipRow.scrollLeft <= 0) { syncMore(); return; }
    const row = chipRow.getBoundingClientRect();
    pageTo(chips$().find((chip) => chip.getBoundingClientRect().right > row.left + 0.5));
  });
  chipsResize.observe(chipRow);
  /** The page that starts at `chip` (the row's own start for the first). */
  const pageTo = (chip: HTMLElement | undefined): void => {
    // (the chips' whole widths make this offset whole: the scroll keeps it exactly)
    chipRow.scrollLeft = chip ? chip.offsetLeft - chips$()[0]!.offsetLeft : 0;
    syncMore();
  };
  /** The next page: from the first chip the row's end cuts or hides, or back to the start after the last. */
  const nextPage = (): void => {
    const row = chipRow.getBoundingClientRect();
    pageTo(more.classList.contains('is-back') ? undefined : chips$().find((chip) => chip.getBoundingClientRect().right > row.right + 0.5));
  };
  /** A pressed chip stands in the row's view (the r20q critic: the pressed Protection chip lay past the row's end, so
   *  nothing showed which filter was on): a hidden one brings its page. */
  const revealChip = (chip: HTMLElement): void => {
    if (chip.hasAttribute('data-off')) pageTo(chip);
  };

  const options$ = (): HTMLElement[] => [...grid.querySelectorAll<HTMLElement>('.cot-c-picker__opt')];
  const itemOf = (element: Element | null): PickerItem | null => {
    const id = element?.closest<HTMLElement>('.cot-c-picker__opt')?.dataset.id;
    return id === undefined ? null : shown.find((item) => item.id === id) ?? null;
  };
  /** One preview a frame: the last request in a frame wins, and a repeat of the shown one is dropped. */
  const preview = (item: PickerItem | null): void => {
    pending = item;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const next = pending ?? null;
      pending = undefined;
      const id = next?.id ?? null;
      if (id === previewed) return;
      previewed = id;
      options.onPreview(next);
    });
  };
  // the rows as drawn: each option stands in its own positioned cell, so its offsetTop is 0 in every row (an Arrow Down
  // jumped to the last option)
  const columns = (): number => {
    const list = options$();
    if (list.length < 2) return 1;
    const top = list[0].getBoundingClientRect().top;
    const second = list.findIndex((element) => Math.abs(element.getBoundingClientRect().top - top) > 1);
    return second < 0 ? list.length : second;
  };
  const rove = (to: HTMLElement | undefined, focus: boolean, preventScroll = false): void => {
    if (!to) return;
    for (const element of options$()) element.tabIndex = element === to ? 0 : -1;
    if (focus) to.focus({ preventScroll });
  };
  /** While rows lie below the grid's foot, the foot fades deeper (pickers.css [data-more]), so whatever row the foot cuts
   *  reads as going on; the fade lifts at the list's end (Rooms r34-r36: a row ending on the foot read as the list's end, and
   *  shortening the list to show part of the next row left a blank band in its plate). */
  const markRowsBelow = (): void => {
    grid.toggleAttribute('data-more', grid.scrollTop + grid.clientHeight < grid.scrollHeight - 1);
  };
  const gridResize = new ResizeObserver(markRowsBelow);
  gridResize.observe(grid);
  // The grid opens with its choice in view on whole rows: the chosen row on top, or near the end the whole row nearest the
  // end from which the chosen one shows. A row cut under the bar would read as a loose caption (Rooms r25).
  const scrollToChosen = (): void => {
    const chosen = options$().find((element) => element.getAttribute('aria-selected') === 'true');
    if (!chosen || grid.scrollHeight <= grid.clientHeight) return;
    const style = getComputedStyle(grid);
    const pad = parseFloat(style.paddingTop) || 0;
    const origin = grid.getBoundingClientRect().top - grid.scrollTop + pad;
    const end = grid.scrollHeight - grid.clientHeight;
    const top = chosen.getBoundingClientRect().top - origin;
    if (top <= end) { grid.scrollTop = top; return; }
    const view = grid.clientHeight - pad - (parseFloat(style.paddingBottom) || 0);
    // the choice cannot reach the top: the whole row nearest the list's end from which it shows, so it stands as high as it
    // can (Rooms r37: the first such row left a whole row above the choice)
    const rows = options$().map((element) => element.getBoundingClientRect().top - origin)
      .filter((row) => row <= end && row + view >= top + chosen.offsetHeight);
    grid.scrollTop = rows.length ? Math.max(...rows) : end;
  };
  const revealChosen = (): void => { scrollToChosen(); markRowsBelow(); };
  const render = (): void => {
    shown = filterItems(items, query, memory, options.randomId);
    grid.innerHTML = shown.map((item) => optionMarkup(item, item.id === value, options.memory ? memory.favourites.includes(item.id) : null, options.layout, options.text)).join('');
    options$().forEach((element, i) => { element.id = `${uid}-${i}`; });
    for (const img of grid.querySelectorAll<HTMLImageElement>('.cot-c-picker__thumb img[data-src]')) {
      if (thumbs) thumbs.observe(img.parentElement!);
      else { img.src = img.dataset.src!; delete img.dataset.src; }
    }
    // a card's picture already decoded (a re-render, a filter) stands at once; a late one fades in on its load (onThumb)
    for (const img of grid.querySelectorAll<HTMLImageElement>('.cot-c-picker__media img')) {
      if (img.complete && img.naturalWidth > 0) img.setAttribute('data-ready', '');
    }
    empty.hidden = shown.length > 0;
    grid.hidden = shown.length === 0;
    rove(options$().find((element) => element.getAttribute('aria-selected') === 'true') ?? options$()[0], false);
    markRowsBelow();
  };
  const choose = (item: PickerItem | null): void => {
    if (!item || item.disabled) return;
    value = item.id;
    previewed = item.id;
    pending = undefined;
    if (item.id !== options.randomId) {
      memory = remember(memory, item.id);
      writeMemory(options.memory, memory);
    }
    for (const element of options$()) element.setAttribute('aria-selected', String(element.dataset.id === item.id));
    options.onChoose(item);
  };
  const favourite = (item: PickerItem | null): void => {
    if (!item || !options.memory || item.id === options.randomId) return;
    memory = toggleFavourite(memory, item.id);
    writeMemory(options.memory, memory);
    const on = memory.favourites.includes(item.id);
    grid.querySelector<HTMLElement>(`.cot-c-picker__opt[data-id="${CSS.escape(item.id)}"]`)
      ?.parentElement?.querySelector('.cot-c-picker__fav')?.setAttribute('aria-pressed', String(on));
    if (query.favourites && !on) render();
  };

  const fine = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const onPointerOver = (event: PointerEvent): void => {
    if (!fine || event.pointerType === 'touch') return;
    const item = itemOf(event.target as Element);
    if (item && !item.disabled) preview(item);
  };
  const onPointerLeave = (): void => { if (!host.contains(document.activeElement)) preview(null); };
  const onFocusIn = (event: FocusEvent): void => {
    const item = itemOf(event.target as Element);
    if (item && !item.disabled) { rove(event.target as HTMLElement, false); preview(item); }
  };
  const onFocusOut = (event: FocusEvent): void => { if (!host.contains(event.relatedTarget as Node | null)) preview(null); };
  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element;
    if (target.closest('[data-picker-more]')) { nextPage(); return; }
    if (target.closest('[data-picker-clear]')) {
      query = { text: '', tags: [], favourites: false, recent: false };
      search.value = '';
      for (const chip of host.querySelectorAll('[data-chip]')) chip.setAttribute('aria-pressed', 'false');
      render();
      return;
    }
    const chip = target.closest<HTMLElement>('[data-chip]');
    if (chip) {
      const on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(on));
      const key = chip.dataset.chip ?? '';
      query = key === 'favourites' ? { ...query, favourites: on }
        : key === 'recent' ? { ...query, recent: on }
          : { ...query, tags: on ? [...query.tags, key.slice(4)] : query.tags.filter((tag) => tag !== key.slice(4)) };
      render();
      if (on) revealChip(chip);
      return;
    }
    if (target.closest('.cot-c-picker__fav')) { favourite(itemOf(target.closest('.cot-c-picker__cell')?.querySelector('.cot-c-picker__opt') ?? null)); return; }
    choose(itemOf(target));
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const inSearch = event.target === search;
    if (event.key === 'Escape') {
      if (inSearch && search.value) { search.value = ''; query = { ...query, text: '' }; render(); event.stopPropagation(); return; }
      if (previewed !== value) {
        preview(null);
        rove(options$().find((element) => element.dataset.id === value), true);
        event.stopPropagation();
      }
      return;
    }
    if (inSearch) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); rove(options$()[0], true); }
      return;
    }
    if (event.key === '/' && searchable()) { event.preventDefault(); search.focus(); return; }
    const focused = itemOf(document.activeElement);
    if (event.key === 'Enter' || event.key === ' ') { if (focused) { event.preventDefault(); choose(focused); } return; }
    if (event.key === 'f' || event.key === 'F') { if (focused) { event.preventDefault(); favourite(focused); } return; }
    if ((event.key === 'r' || event.key === 'R') && options.randomId) {
      const random = shown.find((item) => item.id === options.randomId);
      if (random) { event.preventDefault(); rove(options$().find((element) => element.dataset.id === random.id), true); choose(random); }
      return;
    }
    const list = options$();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const to = at < 0 ? null : gridStep(at, event.key, columns(), list.length);
    if (to === null) return;
    event.preventDefault();
    rove(list[to], true);
  };
  const onInput = (): void => { query = { ...query, text: search.value }; render(); };
  // a list row's thumbnail and a card's picture show once decoded (a cached card's at once, in render): load events reach
  // the grid in capture; one that never loads leaves its box's tone (pickers.css), never a broken frame
  const onThumb = (event: Event): void => { if ((event.target as Element).parentElement?.closest('.cot-c-picker__thumb,.cot-c-picker__media')) (event.target as Element).setAttribute('data-ready', ''); };
  // a card's picture that could not load (the network dropped) asks again once it is back: its tone stood in meanwhile
  const onOnline = (): void => {
    for (const img of grid.querySelectorAll<HTMLImageElement>('.cot-c-picker__media img:not([data-ready])')) {
      const src = img.getAttribute('src');
      if (src && img.complete && img.naturalWidth === 0) img.src = src;
    }
  };
  // (it watches the thumbnail's box: an image with no source yet has no height, and a box of none never intersects)
  const thumbs = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbs!.unobserve(entry.target);
      const img = entry.target.querySelector<HTMLImageElement>('img[data-src]');
      if (img) { img.src = img.dataset.src!; delete img.dataset.src; }
    }
  }, { root: grid, rootMargin: THUMB_AHEAD }) : null;

  grid.addEventListener('pointerover', onPointerOver);
  grid.addEventListener('pointerleave', onPointerLeave);
  host.addEventListener('focusin', onFocusIn);
  host.addEventListener('focusout', onFocusOut);
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  search.addEventListener('input', onInput);
  grid.addEventListener('scroll', markRowsBelow, { passive: true });
  grid.addEventListener('load', onThumb, true);
  globalThis.addEventListener?.('online', onOnline);
  render();
  requestAnimationFrame(revealChosen);

  return {
    setItems(next, nextValue): void {
      items = next;
      if (nextValue !== undefined) value = nextValue;
      bar.hidden = !searchable();
      render();
      revealChosen();
    },
    setValue(id): void {
      value = id;
      previewed = id;
      for (const element of options$()) element.setAttribute('aria-selected', String(element.dataset.id === id));
    },
    focus(): void {
      // the surface places the picker; the grid shows its choice (revealChosen), so focus scrolls nothing else
      rove(options$().find((element) => element.getAttribute('aria-selected') === 'true') ?? options$()[0], true, true);
      revealChosen();
    },
    dispose(): void {
      if (frame) cancelAnimationFrame(frame);
      grid.removeEventListener('pointerover', onPointerOver);
      grid.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('focusin', onFocusIn);
      host.removeEventListener('focusout', onFocusOut);
      host.removeEventListener('click', onClick);
      host.removeEventListener('keydown', onKey);
      search.removeEventListener('input', onInput);
      grid.removeEventListener('scroll', markRowsBelow);
      grid.removeEventListener('load', onThumb, true);
      globalThis.removeEventListener?.('online', onOnline);
      chipsResize.disconnect();
      gridResize.disconnect();
      thumbs?.disconnect();
      host.replaceChildren();
    },
  };
}
