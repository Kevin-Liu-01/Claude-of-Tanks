// pickerMenu.ts — the kit's picker menu: a field trigger and a popover holding the kit picker (INTERACTION-REDESIGN.md,
// "The picker menu: a trigger and a popover"). Copyright © 2026 Kevin B. Liu.
//
// For a choice that sits in a form row, where opening a region would move the surface: a sort, a rival tank, Mars gravity,
// an arrangement count, an enemy nation. It replaces raw selects and createCustomSelect for sets over five (a setting of
// two to five values stays on the segmented control). The trigger shows the chosen item (its picture or glyph, its name and
// one fact) and a chevron that turns while open. The popover is the kit picker (picker.ts) in the top layer, under the
// trigger or above it when there is no room below, as wide as the trigger within 280-480 px; a phone gets a bottom sheet.
// Pointing at or focusing an option previews it on the trigger and through onPreview; one press chooses, closes and
// gives the focus back to the trigger; Esc, a press outside or a Tab out closes with nothing changed. One menu is open at a
// time, and a scroll under it keeps it anchored. The placement is pure (placeMenu) and pinned by the selftest; its CSS is
// pickers.css.

import { createPicker, type PickerFilter, type PickerItem, type PickerText } from './picker.ts';
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
  /** The room the menu stays in (CSS px, top to bottom), where the trigger's scrolling panel is not it: the Garage's
   *  staging area keeps under the top bar. With its sides (left, right) the menu spans them: the Gallery's rival menu
   *  covers its dossier's width, so no row of the dossier shows beside it. */
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
/** Its distance from the trigger and from the window's edges. */
const MENU_GAP = 4;
const MENU_EDGE = 8;
/** Below this window width or height a coarse pointer gets a bottom sheet; a short window's sheet leaves this much of the
 *  window above it. */
const SHEET_BELOW = 520;
const SHEET_TOP_SHORT = 48;
/** A scrolling panel under this height is no bound: the menu takes the window's room. */
const BOUNDS_MIN_H = 240;

interface MenuRoom {
  readonly top: number;
  readonly bottom: number;
  readonly left?: number;
  readonly right?: number;
  /** The menu covers its room from its trigger to the room's foot (or top) whatever its rows need, so nothing of the panel
   *  under it shows past its edge (the r26 critic: the Garage readout's rows cut in half under the rival menu). */
  readonly fill?: boolean;
}

interface MenuPlace {
  readonly sheet: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly maxHeight: number;
  /** It stands above the trigger (no room below). */
  readonly above: boolean;
}

/**
 * Where the popover stands for a trigger at `anchor` in a `view` window: under the trigger, or above it when the room below
 * is short of what it needs and the room above is larger; as wide as the trigger within 280-480 px and inside the window;
 * at most min(60 % of the window, 420 px) tall (520 px for picture cards) and no taller than its side's room. The room is the window's, or `bounds`
 * (the trigger's scrolling panel: a dossier, a readout column), so the menu never runs over a site header or out of its
 * panel. A coarse pointer on a window under 520 px wide or tall gets a bottom sheet across it. `height` is the popover's
 * natural height (its content at full room); `wide` (a set of picture cards) takes the widest room, so its pictures stand
 * two abreast. Pure.
 */
export function placeMenu(
  anchor: { readonly left: number; readonly top: number; readonly bottom: number; readonly width: number },
  view: { readonly width: number; readonly height: number },
  height: number,
  coarse: boolean,
  wide = false,
  bounds: MenuRoom = { top: 0, bottom: view.height },
): MenuPlace {
  const cap = Math.min(view.height * 0.6, wide ? MENU_MAX_H_CARDS : MENU_MAX_H);
  if (coarse && (view.width < SHEET_BELOW || view.height < SHEET_BELOW)) {
    const maxHeight = view.height < SHEET_BELOW ? view.height - SHEET_TOP_SHORT : Math.min(view.height * 0.7, view.height - MENU_EDGE * 2);
    return { sheet: true, left: 0, top: view.height - Math.min(height, maxHeight), width: view.width, maxHeight, above: false };
  }
  // a room with sides is spanned whole, to the window's edge where the room reaches it (a dossier at the window's right);
  // otherwise the trigger's width within 280-480 px, a step inside the window
  const side = bounds.left != null && bounds.right != null ? { left: bounds.left, width: bounds.right - bounds.left } : null;
  const edge = side ? 0 : MENU_EDGE;
  const width = side ? Math.min(side.width, view.width)
    : Math.min(MENU_MAX_W, wide ? MENU_MAX_W : Math.max(MENU_MIN_W, anchor.width), view.width - MENU_EDGE * 2);
  const left = Math.max(edge, Math.min(side ? side.left : anchor.left, view.width - edge - width));
  const below = bounds.bottom - anchor.bottom - MENU_GAP - MENU_EDGE;
  const aboveRoom = anchor.top - bounds.top - MENU_GAP - MENU_EDGE;
  const want = bounds.fill ? Number.POSITIVE_INFINITY : Math.min(height, cap);
  const above = below < Math.min(height, cap) && aboveRoom > below;
  const maxHeight = Math.max(0, bounds.fill ? (above ? aboveRoom : below) : Math.min(cap, above ? aboveRoom : below));
  const shown = Math.min(want, maxHeight);
  return { sheet: false, left, top: above ? anchor.top - MENU_GAP - shown : anchor.bottom + MENU_GAP, width, maxHeight, above };
}

let nextMenu = 0;
/** The menu open now: opening another closes it. */
let openMenu: { close(): void } | null = null;

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
  /** The trigger shows `item` (a preview) or the chosen one: its picture or glyph, its name, its first fact. */
  const paint = (item: PickerItem | null): void => {
    const shown = item ?? itemOf(value);
    const picture = shown?.media?.poster ?? shown?.media?.mosaic?.[0];
    const media = picture
      ? `<span class="cot-c-menu__media"><img src="${esc(picture)}" alt="" decoding="async"></span>`
      : shown?.chip ? `<span class="cot-c-menu__glyph cot-c-picker__chip"><img src="${esc(shown.chip)}" alt="" decoding="async"></span>`
      : shown?.glyph ? `<span class="cot-c-menu__glyph"${shown.tone ? ` data-mode-tone="${esc(shown.tone)}"` : ''}>${icon(shown.glyph, { size: 18 })}</span>` : '';
    const fact = shown?.facts?.[0];
    trigger.innerHTML = `${media}<span class="cot-c-menu__words"><span class="cot-c-menu__name">${esc(shown?.name ?? '')}</span>`
      + `${fact ? `<span class="cot-c-menu__fact">${esc(fact)}</span>` : ''}</span>`
      + `<span class="cot-c-menu__chev">${icon('chevronDown', { size: 16 })}</span>`;
    trigger.setAttribute('aria-label', shown ? `${options.label}: ${shown.name}` : options.label);
  };

  const isOpen = (): boolean => trigger.getAttribute('aria-expanded') === 'true';
  const coarse = (): boolean => typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  /** The trigger's scrolling panel, the room the menu stays in (the window when there is none, or it is too short). */
  const boundsOf = (from: HTMLElement): { top: number; bottom: number } => {
    for (let node = from.parentElement; node && node !== doc.body; node = node.parentElement) {
      if (!/auto|scroll/.test(win.getComputedStyle(node).overflowY)) continue;
      const box = node.getBoundingClientRect();
      const top = Math.max(0, box.top), bottom = Math.min(win.innerHeight, box.bottom);
      return bottom - top >= BOUNDS_MIN_H ? { top, bottom } : { top: 0, bottom: win.innerHeight };
    }
    return { top: 0, bottom: win.innerHeight };
  };
  /** `squat`: a picture-card menu whose room holds no whole row draws its pictures flatter (pickers.css .is-squat) and is
   *  placed once more (the r26 critic: at 1024 x 600 the Garage's staging cards lost their names under its foot). */
  const place = (squat = false): void => {
    if (!isOpen()) return;
    const anchorEl = openFrom?.isConnected ? openFrom : trigger;
    const rect = anchorEl.getBoundingClientRect();
    pop.style.maxHeight = '';
    pop.classList.remove('is-sheet');
    pop.classList.toggle('is-squat', squat);
    const natural = pop.scrollHeight;
    const room: MenuRoom = options.bounds?.() ?? boundsOf(anchorEl);
    const spot = placeMenu(rect, { width: win.innerWidth, height: win.innerHeight }, natural, coarse(), options.layout === 'cards', room);
    pop.classList.toggle('is-sheet', spot.sheet);
    pop.classList.toggle('is-above', spot.above);
    pop.style.left = `${spot.left}px`;
    // a sheet stands on the window's foot whatever its head adds to the measured height
    pop.style.top = spot.sheet ? 'auto' : `${spot.top}px`;
    pop.style.bottom = spot.sheet ? '0' : '';
    pop.style.width = `${spot.width}px`;
    pop.style.maxHeight = `${spot.maxHeight}px`;
    // a filling menu stands its room's whole height; its grid scrolls under the kit's foot fade
    pop.style.height = room.fill && !spot.sheet ? `${spot.maxHeight}px` : '';
    if (!spot.sheet && !room.fill && !trimToWholeRows(spot) && !squat && options.layout === 'cards') place(true);
  };
  /** A popover ends on its grid's last whole row (a card, a row): the rows cut at its foot read as cut (the r21q critic:
   *  the staging cards' names and a rival row sliced). An upward menu keeps its foot on its trigger. */
  const trimToWholeRows = (spot: MenuPlace): boolean => {
    const grid = pop.querySelector<HTMLElement>('.cot-c-picker__grid');
    if (!grid || grid.scrollHeight <= grid.clientHeight + 1) return true;
    const style = win.getComputedStyle(grid);
    const top = grid.getBoundingClientRect().top + grid.clientTop;
    const bottom = top + grid.clientHeight - (parseFloat(style.paddingBottom) || 0);
    let foot = -Infinity;
    for (const cell of grid.children) {
      const box = cell.getBoundingClientRect();
      if (box.height > 0 && box.top >= top - 0.5 && box.bottom <= bottom + 0.5) foot = Math.max(foot, box.bottom);
    }
    // no whole row in the room: the caller may draw the cards flatter
    if (!Number.isFinite(foot)) return false;
    const cut = Math.floor(bottom - foot);
    if (cut < 2) return true;
    const height = pop.getBoundingClientRect().height - cut;
    pop.style.maxHeight = `${height}px`;
    if (spot.above) pop.style.top = `${spot.top + cut}px`;
    return true;
  };
  let placeFrame = 0;
  const placeSoon = (): void => {
    if (placeFrame) return;
    placeFrame = win.requestAnimationFrame(() => { placeFrame = 0; place(); });
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
    trigger.setAttribute('aria-expanded', 'false');
    if (pop.matches(':popover-open')) pop.hidePopover();
    if (openMenu === api) openMenu = null;
    if (previewed) { previewed = null; paint(null); options.onPreview?.(null); }
    win.removeEventListener('scroll', placeSoon, true);
    win.removeEventListener('resize', placeSoon);
    doc.removeEventListener('pointerdown', onOutside, true);
    const back = openFrom?.isConnected ? openFrom : trigger;
    if (openFrom?.hasAttribute('aria-haspopup')) openFrom.setAttribute('aria-expanded', 'false');
    openFrom = null;
    if (restoreFocus) back.focus({ preventScroll: true });
  }
  function open(from?: HTMLElement): void {
    if (isOpen() || trigger.disabled) return;
    openMenu?.close();
    openMenu = api;
    openFrom = from && from !== trigger ? from : null;
    ensurePicker();
    trigger.setAttribute('aria-expanded', 'true');
    // a control that opens it for the trigger (a phone's menu item, an icon on a card) says it is open too
    if (openFrom?.hasAttribute('aria-haspopup')) openFrom.setAttribute('aria-expanded', 'true');
    pop.showPopover();
    place();
    win.addEventListener('scroll', placeSoon, { capture: true, passive: true });
    win.addEventListener('resize', placeSoon);
    doc.addEventListener('pointerdown', onOutside, true);
    // the focus lands on the chosen option, where the arrows start
    picker?.focus();
  }
  const onOutside = (event: PointerEvent): void => {
    const target = event.target as Node | null;
    if (target && (pop.contains(target) || trigger.contains(target) || openFrom?.contains(target))) return;
    close();
  };
  const onTrigger = (): void => { if (isOpen()) close(true); else open(); };
  const onTriggerKey = (event: KeyboardEvent): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    open();
  };
  // Esc restores and closes in one press (the picker's own Esc would only restore first), before any surface hears it
  const onClose = (): void => close(true);
  const onPopKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  const onPopFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (next && (pop.contains(next) || next === trigger || next === openFrom)) return;
    // a Tab out, or the focus moving anywhere else: closed with nothing changed (a pointer press is onOutside's)
    if (next) close();
  };
  trigger.addEventListener('click', onTrigger);
  trigger.addEventListener('keydown', onTriggerKey);
  head.querySelector('.cot-c-menu__close')?.addEventListener('click', onClose);
  pop.addEventListener('keydown', onPopKey, true);
  pop.addEventListener('focusout', onPopFocusOut);
  paint(null);

  const api: PickerMenu = {
    setItems(next, nextValue) {
      items = next;
      if (nextValue !== undefined) value = nextValue;
      if (picker) picker.setItems(items, value);
      if (!previewed) paint(null);
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
      pop.removeEventListener('keydown', onPopKey, true);
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
