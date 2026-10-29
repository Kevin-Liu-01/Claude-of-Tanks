// pickerMenu.ts — the kit's picker menu: a field trigger and a popover holding the kit picker (INTERACTION-REDESIGN.md,
// "The picker menu: a trigger and a popover"). Copyright © 2026 Kevin B. Liu.
//
// For a choice that sits in a form row, where opening a region would move the surface: a sort, a rival tank, Mars gravity,
// an arrangement count, an enemy nation. It replaces raw selects and createCustomSelect for sets over five (a setting of
// two to five values stays on the segmented control). The trigger shows the chosen item (its picture or glyph, its name and
// one fact) and a chevron that turns while open. The popover is the kit picker (picker.ts) in the top layer, under the
// trigger or above it when there is no room below, as wide as the trigger within 280-480 px and inside the panel that holds
// the trigger; a phone gets a bottom sheet. Pointing at or focusing an option previews it on the trigger and through
// onPreview; one press chooses, closes and gives the focus back to the trigger; Esc, a press outside or a Tab out closes
// with nothing changed. It is a transient surface (surfaceStack.ts): opening it closes whatever else is open at its level,
// in the same press, and it fades out as the next one fades in. A page scroll under it keeps it anchored; its own list's
// scroll is its own. The placement is pure (placeMenu) and pinned by the selftest; its CSS is pickers.css.

import { createPicker, type PickerFilter, type PickerItem, type PickerText } from './picker.ts';
import { closeSurface, openSurface, type TransientSurface } from './surfaceStack.ts';
import { icon } from '../icons/icon.ts';
import { esc } from './escape.ts';

interface PickerMenuOptions {
  /** The registry id (src/ui/interactionRegistry.ts), stamped as data-picker on the popover's picker. */
  readonly id: string;
  /** The set's name: the trigger's accessible name leads with it, and the listbox is named by it. */
  readonly label: string;
  readonly items: readonly PickerItem[];
  readonly value: string | null;
  readonly layout: 'list' | 'cards';
  readonly text: PickerText;
  readonly onChoose: (item: PickerItem) => void;
  /** The option under the pointer or the focus, or null when it leaves (the trigger shows it already). */
  readonly onPreview?: (item: PickerItem | null) => void;
  readonly filters?: readonly PickerFilter[];
  readonly memory?: string;
  readonly randomId?: string;
  /** The room the menu stays in (CSS px, top to bottom, with its sides where it is a panel), where the panel holding the
   *  trigger is not it: the Garage's staging area keeps under the top bar, the Gallery's versus menu in its dossier. */
  readonly bounds?: () => MenuRoom | null;
}

export interface PickerMenu {
  setItems(items: readonly PickerItem[], value?: string | null): void;
  setValue(id: string | null): void;
  setDisabled(disabled: boolean): void;
  /** Open it; `from` anchors it to another control for this opening (a phone's menu item, where the trigger is hidden), which
   *  takes the focus back on close. */
  open(from?: HTMLElement): void;
  close(): void;
  dispose(): void;
}

/** The popover's room: never narrower than this, never wider than that, never taller than this. */
const MENU_MIN_W = 280;
const MENU_MAX_W = 480;
const MENU_MAX_H = 420;
/** A menu of picture cards stands taller, so two rows of its cards show whole (a battlefield card with its two lines is
 *  183 px: 420 px held one row, the battle card's quick menu, owner 10-26). */
const MENU_MAX_H_CARDS = 520;
/** A list's portraits fetched before it opens: all of a set this small, else this many on each side of its choice. */
const WARM_ALL = 40;
const WARM_AROUND = 12;
/** Its distance from the trigger and from the window's edges. */
const MENU_GAP = 4;
const MENU_EDGE = 8;
/** Below this window width or height a coarse pointer gets a bottom sheet; a short window's sheet leaves this much of the
 *  window above it. */
const SHEET_BELOW = 520;
const SHEET_TOP_SHORT = 48;
/** A box under this height is no panel: the menu's room is the next one out (the window at the last). */
const BOUNDS_MIN_H = 240;
/** A panel at most this wide (a readout column, a dossier, up to a 2560 window's) is spanned by its menus: across the column a menu covers whole
 *  rows of it, where one as wide as its trigger left slivers of the labels beside it (the 261 critic: "Dama|ge" beside the
 *  rival's menu, a dossier's title sliced over the versus menu). Such a menu reaches the panel's far edge, its list's fade
 *  saying there is more. */
const SPAN_MAX_W = 640;

/** The room a menu stands in: a panel's (with its sides) or the window's. */
interface MenuRoom {
  readonly top: number; readonly bottom: number; readonly left?: number; readonly right?: number;
  /** span the panel whatever its width (a dossier that widens past a column on a large screen) */
  readonly span?: boolean;
}

interface MenuPlace {
  readonly sheet: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly maxHeight: number;
  /** It stands above the trigger (no room below). */
  readonly above: boolean;
  /** It spans its panel (a narrow column) to the panel's far edge. */
  readonly span: boolean;
}

/**
 * Where the popover stands for a trigger at `anchor` in a `view` window: under the trigger, or above it when the room below
 * is short of what it needs and the room above is larger; as wide as the trigger, at least 280 px and at most 480 px unless
 * the trigger is wider, inside its room; at most min(60 % of the window, 420 px) tall (520 px for picture cards) and no
 * taller than its side's room. The room is the window's, or `bounds` (the panel holding the trigger: a dossier, a readout
 * column, with its sides where it has them), so the menu never runs over a site header or out of its panel. A panel no
 * wider than 640 px is spanned: the menu stands across its inner width and may reach its far edge. A coarse pointer on a
 * window under 520 px wide or tall gets a bottom sheet across it. `height` is the popover's natural height (its content at
 * full room); `wide` (a set of picture cards) takes the widest room, so its pictures stand two abreast. Pure.
 */
export function placeMenu(
  anchor: { readonly left: number; readonly top: number; readonly bottom: number; readonly width: number },
  view: { readonly width: number; readonly height: number },
  height: number,
  coarse: boolean,
  wide = false,
  bounds: MenuRoom = { top: 0, bottom: view.height },
): MenuPlace {
  if (coarse && (view.width < SHEET_BELOW || view.height < SHEET_BELOW)) {
    const maxHeight = view.height < SHEET_BELOW ? view.height - SHEET_TOP_SHORT : Math.min(view.height * 0.7, view.height - MENU_EDGE * 2);
    return { sheet: true, left: 0, top: view.height - Math.min(height, maxHeight), width: view.width, maxHeight, above: false, span: false };
  }
  const span = bounds.left !== undefined && bounds.right !== undefined && (bounds.span ?? bounds.right - bounds.left <= SPAN_MAX_W);
  // a spanning menu fills its panel's room (panelRoom) on its sides and its far edge: a panel scrolls its rows to its edge
  // and a dossier's picture runs to its sides, so a gap there showed them beside the menu (the 261 critics: zh 900's
  // 自动机枪, the Gallery hero's strips)
  const inset = span ? 0 : MENU_EDGE;
  // (a panel's edges fall between pixels: each rounds to the nearest, so no column of the panel shows and none of the
  // window is passed)
  // (a spanning menu's 1 px ring, outside its box, stays on the window: the 261 critic, a ring past the window's edge)
  const ring = span ? 1 : 0;
  const lo = Math.round(Math.max(span ? ring : MENU_EDGE, (bounds.left ?? 0) + inset));
  const hi = Math.round(Math.min(view.width - ring, bounds.right ?? view.width) - inset);
  const roomTop = Math.round(Math.max(ring, bounds.top)), roomBottom = Math.round(Math.min(view.height - ring, bounds.bottom));
  const cap = span ? Infinity : Math.min(view.height * 0.6, wide ? MENU_MAX_H_CARDS : MENU_MAX_H);
  const far = inset;
  // (a trigger wider than 480 px sets the width: a menu never stands narrower than the trigger it drops from)
  const width = span ? hi - lo : Math.min(wide ? MENU_MAX_W : Math.max(MENU_MIN_W, Math.min(MENU_MAX_W, anchor.width), anchor.width), hi - lo);
  const left = span ? lo : Math.max(lo, Math.min(anchor.left, hi - width));
  const below = roomBottom - anchor.bottom - MENU_GAP - far;
  const aboveRoom = anchor.top - roomTop - MENU_GAP - far;
  const want = Math.min(height, cap);
  const above = below < want && aboveRoom > below;
  const maxHeight = Math.max(0, Math.min(cap, above ? aboveRoom : below));
  const shown = Math.min(want, maxHeight);
  return { sheet: false, left, top: above ? anchor.top - MENU_GAP - shown : anchor.bottom + MENU_GAP, width, maxHeight, above, span };
}

/** A panel's room for a menu: its box inside its own rule, so a spanning menu's ring (the elevation's 1 px line, outside
 *  its box) lies on that rule (the 261 critics: a ring a pixel past the readout's rule), and over its scrollbar, which
 *  would otherwise show beside the menu; within the window. */
export function panelRoom(node: Element): Required<Omit<MenuRoom, 'span'>> {
  const win = node.ownerDocument.defaultView ?? window;
  const box = node.getBoundingClientRect(), style = win.getComputedStyle(node);
  const rule = (side: 'top' | 'right' | 'bottom' | 'left'): number => parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0;
  return {
    top: Math.max(0, box.top + rule('top')), bottom: Math.min(win.innerHeight, box.bottom - rule('bottom')),
    left: Math.max(0, box.left + rule('left')), right: Math.min(win.innerWidth, box.right - rule('right')),
  };
}

let nextMenu = 0;

/** The picker menu in `host` (its contents become the trigger); the popover joins the document's body. */
export function createPickerMenu(host: HTMLElement, options: PickerMenuOptions): PickerMenu {
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? window;
  const popId = `cot-c-menu-${++nextMenu}`;
  let items = options.items;
  let value = options.value;
  let picker: ReturnType<typeof createPicker> | null = null;
  let previewed: PickerItem | null = null;
  /** This opening's anchor when it is not the trigger. */
  let openFrom: HTMLElement | null = null;

  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'cot-c-menu__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', popId);
  trigger.dataset.pickerMenu = options.id;
  trigger.dataset.uiSound = 'press';
  host.replaceChildren(trigger);

  const pop = doc.createElement('div');
  pop.id = popId;
  pop.className = 'cot-c-menu__pop';
  pop.setAttribute('popover', 'manual');
  // a sheet's head: the set's name and a close (a popover's trigger names it; a sheet stands apart from its trigger)
  const head = doc.createElement('div');
  head.className = 'cot-c-menu__head';
  head.innerHTML = `<span class="cot-c-menu__title">${esc(options.label)}</span>`
    + `<button type="button" class="cot-c-btn cot-c-btn--icon cot-c-btn--ghost cot-c-menu__close" aria-label="${esc(options.text.close ?? options.label)}">`
    + `${icon('close', { size: 18 })}</button>`;
  const pickerHost = doc.createElement('div');
  pickerHost.className = 'cot-c-menu__picker';
  pop.append(head, pickerHost);
  // in the top layer either way; inside a modal dialog it must be the dialog's (the rest of the page is inert under one)
  (host.closest('dialog') ?? doc.body).append(pop);

  const itemOf = (id: string | null): PickerItem | null => (id === null ? null : items.find((item) => item.id === id) ?? null);
  /** The trigger shows `item` (a preview) or the chosen one: its picture or glyph, its name, its first fact. A picture is
   *  kept while it stays the same, and a new one shows once it has decoded (pickers.css [data-ready]): the old one holds
   *  until then, and a first one fades in rather than leaving an empty frame (the 261 report: a blank square, then the
   *  rival). */
  let mediaEl: HTMLElement | null = null;
  const pictureEl = (picture: string, tank: boolean): HTMLElement => {
    if (mediaEl?.dataset.src === picture) return mediaEl;
    const box = doc.createElement('span');
    box.className = `cot-c-menu__media${tank ? ' is-tank' : ''}`;
    box.dataset.src = picture;
    const img = doc.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = picture;
    box.append(img);
    const ready = (): void => { box.toggleAttribute('data-ready', true); };
    if (img.complete && img.naturalWidth) ready();
    else img.decode().then(ready, ready);
    return (mediaEl = box);
  };
  const paint = (item: PickerItem | null): void => {
    const shown = item ?? itemOf(value);
    const picture = shown?.media?.poster ?? shown?.media?.mosaic?.[0];
    const fact = shown?.facts?.[0];
    const words = doc.createElement('span');
    words.className = 'cot-c-menu__words';
    words.innerHTML = `<span class="cot-c-menu__name">${esc(shown?.name ?? '')}</span>${fact ? `<span class="cot-c-menu__fact">${esc(fact)}</span>` : ''}`;
    const chev = doc.createElement('span');
    chev.className = 'cot-c-menu__chev';
    chev.innerHTML = icon('chevronDown', { size: 16 });
    let lead: HTMLElement | null = null;
    if (picture) lead = pictureEl(picture, !!shown?.media?.tank);
    else if (shown?.chip || shown?.glyph) {
      lead = doc.createElement('span');
      lead.className = `cot-c-menu__glyph${shown.chip ? ' cot-c-picker__chip' : ''}`;
      if (shown.tone && !shown.chip) lead.dataset.modeTone = shown.tone;
      lead.innerHTML = shown.chip ? `<img src="${esc(shown.chip)}" alt="" decoding="async">` : icon(shown.glyph!, { size: 18 });
    }
    trigger.replaceChildren(...(lead ? [lead] : []), words, chev);
    trigger.setAttribute('aria-label', shown ? `${options.label}: ${shown.name}` : options.label);
  };

  const isOpen = (): boolean => trigger.getAttribute('aria-expanded') === 'true';
  /** A list's pictures fetched before it shows, so its rows draw whole as it opens (the 261 critic: three portraits still
   *  loading in a list just opened): a short set as it is made or changed, a longer one around its choice once the pointer
   *  or the focus reaches the trigger. */
  let warmed = '';
  const warm = (): void => {
    if (options.layout !== 'list') return;
    const at = Math.max(0, items.findIndex((item) => item.id === value));
    const near = items.length <= WARM_ALL ? items : items.slice(Math.max(0, at - WARM_AROUND), at + WARM_AROUND);
    const posters = near.map((item) => item.media?.poster).filter((src): src is string => !!src);
    const key = posters.join('|');
    if (!posters.length || key === warmed) return;
    warmed = key;
    for (const src of posters) { const img = new Image(); img.decoding = 'async'; img.src = src; }
  };
  const coarse = (): boolean => typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  /** The panel holding the trigger, the room the menu stays in: the nearest box that scrolls or clips its content (a
   *  dossier, a readout column, a drawer), or the window when there is none or it is too short (the 261 report: the
   *  rival menu hung past the dossier's foot). */
  const boundsOf = (from: HTMLElement): MenuRoom => {
    for (let node = from.parentElement; node && node !== doc.body; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (style.overflowY === 'visible' && !/paint|content|strict/.test(style.contain)) continue;
      const room = panelRoom(node);
      // a short box (a row that clips its own text) is no panel: the one holding it is
      if (room.bottom - room.top >= BOUNDS_MIN_H) return room;
    }
    return { top: 0, bottom: win.innerHeight };
  };
  const place = (): void => {
    if (!isOpen()) return;
    const anchorEl = openFrom?.isConnected ? openFrom : trigger;
    const rect = anchorEl.getBoundingClientRect();
    // measuring the natural height lets the list grow whole, which drops its scroll: it is put back after
    const list = pop.querySelector<HTMLElement>('.cot-c-picker__grid');
    const scrolled = list?.scrollTop ?? 0;
    pop.style.maxHeight = '';
    pop.classList.remove('is-sheet');
    const natural = pop.scrollHeight;
    const spot = placeMenu(rect, { width: win.innerWidth, height: win.innerHeight }, natural, coarse(), options.layout === 'cards',
      options.bounds?.() ?? boundsOf(anchorEl));
    pop.classList.toggle('is-sheet', spot.sheet);
    pop.classList.toggle('is-above', spot.above);
    pop.classList.toggle('is-span', spot.span);
    pop.style.left = `${spot.left}px`;
    // a sheet stands on the window's foot whatever its head adds to the measured height
    pop.style.top = spot.sheet ? 'auto' : `${spot.top}px`;
    pop.style.bottom = spot.sheet ? '0' : '';
    pop.style.width = `${spot.width}px`;
    pop.style.maxHeight = `${spot.maxHeight}px`;
    // a spanning menu reaches its panel's edge, its list's fade saying there is more; any other ends on a whole row
    if (!spot.sheet && !spot.span) trimToWholeRows(spot);
    if (list && scrolled) list.scrollTop = scrolled;
  };
  /** A popover ends on its grid's last whole row (a card, a row): the rows cut at its foot read as cut (the r21q critic:
   *  the staging cards' names and a rival row sliced). An upward menu keeps its foot on its trigger. */
  const trimToWholeRows = (spot: MenuPlace): void => {
    const grid = pop.querySelector<HTMLElement>('.cot-c-picker__grid');
    if (!grid || grid.scrollHeight <= grid.clientHeight + 1) return;
    const style = win.getComputedStyle(grid);
    const top = grid.getBoundingClientRect().top + grid.clientTop;
    const bottom = top + grid.clientHeight - (parseFloat(style.paddingBottom) || 0);
    let foot = -Infinity;
    for (const cell of grid.children) {
      const box = cell.getBoundingClientRect();
      if (box.height > 0 && box.top >= top - 0.5 && box.bottom <= bottom + 0.5) foot = Math.max(foot, box.bottom);
    }
    const cut = Math.floor(bottom - foot);
    if (!Number.isFinite(cut) || cut < 2) return;
    const height = pop.getBoundingClientRect().height - cut;
    pop.style.maxHeight = `${height}px`;
    if (spot.above) pop.style.top = `${spot.top + cut}px`;
  };
  let placeFrame = 0;
  const placeSoon = (): void => {
    if (placeFrame) return;
    placeFrame = win.requestAnimationFrame(() => { placeFrame = 0; place(); });
  };
  // a scroll under the menu moves its anchor; its own list's scroll is the list's (the 261 report: the wheel's scroll
  // reached the window's capture, the menu was placed again, and the re-measure put the list back at its top)
  const onScroll = (event: Event): void => {
    if (event.target instanceof Node && pop.contains(event.target)) return;
    placeSoon();
  };

  const ensurePicker = (): void => {
    if (picker) { picker.setItems(items, value); return; }
    picker = createPicker(pickerHost, {
      id: options.id,
      label: options.label,
      items,
      value,
      layout: options.layout,
      text: options.text,
      filters: options.filters,
      memory: options.memory,
      randomId: options.randomId,
      onPreview: (item) => {
        previewed = item;
        paint(item);
        options.onPreview?.(item);
      },
      onChoose: (item) => {
        value = item.id;
        previewed = null;
        close(true);
        paint(null);
        options.onChoose(item);
      },
    });
  };

  /** Close; `restoreFocus` gives the focus back to the trigger. A preview still showing is put back first. */
  function close(restoreFocus = false): void {
    if (!isOpen()) return;
    closeSurface(surface);
    trigger.setAttribute('aria-expanded', 'false');
    if (pop.matches(':popover-open')) pop.hidePopover();
    if (previewed) { previewed = null; paint(null); options.onPreview?.(null); }
    win.removeEventListener('scroll', onScroll, true);
    win.removeEventListener('resize', placeSoon);
    const back = openFrom?.isConnected ? openFrom : trigger;
    if (openFrom?.hasAttribute('aria-haspopup')) openFrom.setAttribute('aria-expanded', 'false');
    openFrom = null;
    if (restoreFocus) back.focus({ preventScroll: true });
  }
  function open(from?: HTMLElement): void {
    if (isOpen() || trigger.disabled) return;
    openFrom = from && from !== trigger ? from : null;
    openSurface(surface, openFrom ?? trigger);
    ensurePicker();
    trigger.setAttribute('aria-expanded', 'true');
    // a control that opens it for the trigger (a phone's menu item, an icon on a card) says it is open too
    if (openFrom?.hasAttribute('aria-haspopup')) openFrom.setAttribute('aria-expanded', 'true');
    pop.showPopover();
    place();
    win.addEventListener('scroll', onScroll, { capture: true, passive: true });
    win.addEventListener('resize', placeSoon);
    // the focus lands on the chosen option, where the arrows start
    picker?.focus();
  }
  /** Its place on the page's surface stack: Escape (which restores and closes in one press) and a press outside are the
   *  stack's, which close only the top surface; a search with text keeps its Escape (it clears first). */
  const surface: TransientSurface = {
    id: options.id,
    element: () => pop,
    owns: (node) => trigger.contains(node) || !!openFrom?.contains(node),
    close: (reason) => close(reason === 'escape'),
    keepsEscape: (event) => event.target instanceof HTMLInputElement && event.target.type === 'search' && !!event.target.value
      && pop.contains(event.target),
  };
  const onTrigger = (): void => { if (isOpen()) close(true); else open(); };
  const onTriggerKey = (event: KeyboardEvent): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    open();
  };
  const onClose = (): void => close(true);
  const onPopFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (next && (pop.contains(next) || next === trigger || next === openFrom)) return;
    // a Tab out, or the focus moving anywhere else: closed with nothing changed (a pointer press is the stack's)
    if (next) close();
  };
  trigger.addEventListener('click', onTrigger);
  trigger.addEventListener('keydown', onTriggerKey);
  trigger.addEventListener('pointerenter', warm);
  trigger.addEventListener('focus', warm);
  head.querySelector('.cot-c-menu__close')?.addEventListener('click', onClose);
  pop.addEventListener('focusout', onPopFocusOut);
  paint(null);
  if (items.length <= WARM_ALL) warm();

  const api: PickerMenu = {
    setItems(next, nextValue) {
      items = next;
      if (nextValue !== undefined) value = nextValue;
      if (picker) picker.setItems(items, value);
      if (!previewed) paint(null);
      if (items.length <= WARM_ALL) warm();
      placeSoon();
    },
    setValue(id) {
      value = id;
      picker?.setValue(id);
      if (!previewed) paint(null);
    },
    setDisabled(disabled) {
      trigger.disabled = disabled;
      if (disabled) close();
    },
    open,
    close: () => close(true),
    dispose() {
      close();
      if (placeFrame) win.cancelAnimationFrame(placeFrame);
      trigger.removeEventListener('click', onTrigger);
      trigger.removeEventListener('keydown', onTriggerKey);
      trigger.removeEventListener('pointerenter', warm);
      trigger.removeEventListener('focus', warm);
      pop.removeEventListener('focusout', onPopFocusOut);
      head.querySelector('.cot-c-menu__close')?.removeEventListener('click', onClose);
      picker?.dispose();
      picker = null;
      pop.remove();
      host.replaceChildren();
    },
  };
  return api;
}
