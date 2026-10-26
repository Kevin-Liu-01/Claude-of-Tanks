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
}

export interface PickerMenu {
  setItems(items: readonly PickerItem[], value?: string | null): void;
  setValue(id: string | null): void;
  setDisabled(disabled: boolean): void;
  open(): void;
  close(): void;
  dispose(): void;
}

/** The popover's room: never narrower than this, never wider than that, never taller than this. */
const MENU_MIN_W = 280;
const MENU_MAX_W = 480;
const MENU_MAX_H = 420;
/** Its distance from the trigger and from the window's edges. */
const MENU_GAP = 4;
const MENU_EDGE = 8;
/** Below this window width a coarse pointer gets a bottom sheet. */
const SHEET_BELOW = 520;

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
 * at most min(60 % of the window, 420 px) tall and no taller than its side's room. A coarse pointer on a window under 520 px
 * wide gets a bottom sheet across it. `height` is the popover's natural height (its content at full room). Pure.
 */
export function placeMenu(
  anchor: { readonly left: number; readonly top: number; readonly bottom: number; readonly width: number },
  view: { readonly width: number; readonly height: number },
  height: number,
  coarse: boolean,
): MenuPlace {
  const cap = Math.min(view.height * 0.6, MENU_MAX_H);
  if (coarse && view.width < SHEET_BELOW) {
    const maxHeight = Math.min(view.height * 0.7, view.height - MENU_EDGE * 2);
    return { sheet: true, left: 0, top: view.height - Math.min(height, maxHeight), width: view.width, maxHeight, above: false };
  }
  const width = Math.min(MENU_MAX_W, Math.max(MENU_MIN_W, anchor.width), view.width - MENU_EDGE * 2);
  const left = Math.max(MENU_EDGE, Math.min(anchor.left, view.width - MENU_EDGE - width));
  const below = view.height - anchor.bottom - MENU_GAP - MENU_EDGE;
  const aboveRoom = anchor.top - MENU_GAP - MENU_EDGE;
  const want = Math.min(height, cap);
  const above = below < want && aboveRoom > below;
  const maxHeight = Math.max(0, Math.min(cap, above ? aboveRoom : below));
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
  const pickerHost = doc.createElement('div');
  pickerHost.className = 'cot-c-menu__picker';
  pop.append(pickerHost);
  doc.body.append(pop);

  const itemOf = (id: string | null): PickerItem | null => (id === null ? null : items.find((item) => item.id === id) ?? null);
  /** The trigger shows `item` (a preview) or the chosen one: its picture or glyph, its name, its first fact. */
  const paint = (item: PickerItem | null): void => {
    const shown = item ?? itemOf(value);
    const picture = shown?.media?.poster ?? shown?.media?.mosaic?.[0];
    const media = picture
      ? `<span class="cot-c-menu__media"><img src="${esc(picture)}" alt="" decoding="async"></span>`
      : shown?.glyph ? `<span class="cot-c-menu__glyph"${shown.tone ? ` data-mode-tone="${esc(shown.tone)}"` : ''}>${icon(shown.glyph, { size: 18 })}</span>` : '';
    const fact = shown?.facts?.[0];
    trigger.innerHTML = `${media}<span class="cot-c-menu__words"><span class="cot-c-menu__name">${esc(shown?.name ?? '')}</span>`
      + `${fact ? `<span class="cot-c-menu__fact">${esc(fact)}</span>` : ''}</span>`
      + `<span class="cot-c-menu__chev">${icon('chevronDown', { size: 16 })}</span>`;
    trigger.setAttribute('aria-label', shown ? `${options.label}: ${shown.name}` : options.label);
  };

  const isOpen = (): boolean => trigger.getAttribute('aria-expanded') === 'true';
  const coarse = (): boolean => typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  const place = (): void => {
    if (!isOpen()) return;
    const rect = trigger.getBoundingClientRect();
    pop.style.maxHeight = '';
    const natural = pop.scrollHeight;
    const spot = placeMenu(rect, { width: win.innerWidth, height: win.innerHeight }, natural, coarse());
    pop.classList.toggle('is-sheet', spot.sheet);
    pop.classList.toggle('is-above', spot.above);
    pop.style.left = `${spot.left}px`;
    pop.style.top = `${spot.top}px`;
    pop.style.width = `${spot.width}px`;
    pop.style.maxHeight = `${spot.maxHeight}px`;
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
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function open(): void {
    if (isOpen() || trigger.disabled) return;
    openMenu?.close();
    openMenu = api;
    ensurePicker();
    trigger.setAttribute('aria-expanded', 'true');
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
    if (target && (pop.contains(target) || trigger.contains(target))) return;
    close();
  };
  const onTrigger = (): void => { if (isOpen()) close(true); else open(); };
  const onTriggerKey = (event: KeyboardEvent): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    open();
  };
  // Esc restores and closes in one press (the picker's own Esc would only restore first), before any surface hears it
  const onPopKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  const onPopFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (next && (pop.contains(next) || next === trigger)) return;
    // a Tab out, or the focus moving anywhere else: closed with nothing changed (a pointer press is onOutside's)
    if (next) close();
  };
  trigger.addEventListener('click', onTrigger);
  trigger.addEventListener('keydown', onTriggerKey);
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
      picker?.dispose();
      picker = null;
      pop.remove();
      host.replaceChildren();
    },
  };
  return api;
}
