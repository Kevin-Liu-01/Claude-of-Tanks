// garageEquipmentPicker.ts — the Garage's equipment picker (INTERACTION-REDESIGN C, the census's "Garage equipment slots and
// picker" row) on the kit picker (components/picker.ts, layout 'swatches').
// Copyright © 2026 Kevin B. Liu.
//
// A slot opens it with every item the catalog carries as a card of its own glyph (equipIcons.ts), its short name and what
// it does; the categories are the filter chips, and search, favourites and recents are the kit's (memory 'equipment').
// Empty leads the set and clears the slot. Hovering or focusing an item hands it to the caller, which shows its projected
// values in place (the Garage's readout under the grid); one press fits it. An item the hull cannot take stays in the set,
// shut, with its reason as its tip; hovering, focusing or pressing it hands that reason to the caller to show. The pure
// item builder carries what the selftest pins; the controller only adds the glyphs and the shut items' answer.

import { createPicker, type PickerItem, type PickerText } from './components/picker.ts';
import type { EquipmentLock, EquipmentPickerItem } from '../game/equipment.ts';

/** Empty's id in the set: choosing it clears the slot. */
export const EQUIPMENT_EMPTY_ID = 'empty';

export interface EquipmentPickerWords {
  /** An item's short name (the slot caption's, 10 characters at most). */
  short(itemId: string): string;
  /** What it does ("Reload -10%"). */
  effect(itemId: string): string;
  category(categoryId: string): string;
  /** "Slot 2" for slot index 1. */
  slot(index: number): string;
  /** Why the hull or the mode shuts it. */
  lock(itemId: string, lock: EquipmentLock): string;
  readonly empty: string;
}

/** equipmentPicker's groups (game/equipment.ts): the catalog by category, each item's lock and fitted slot. */
type EquipmentGroups = readonly { readonly category: { readonly id: string }; readonly items: readonly EquipmentPickerItem[] }[];

/**
 * The set for slot `openSlot`: Empty first, then the catalog in its category order, each named by its short name with what
 * it does as its fact (and the other slot it is fitted in as its second), filterable by its category; a shut item carries
 * its reason.
 */
export function equipmentPickerItems(groups: EquipmentGroups, openSlot: number, words: EquipmentPickerWords): PickerItem[] {
  // Empty answers every category, so a filtered grid still shows the slot's way back (the r22q critic: under Protection the
  // fitted Empty left the grid and its readout stood alone)
  const items: PickerItem[] = [{ id: EQUIPMENT_EMPTY_ID, name: words.empty, tags: groups.map((group) => group.category.id) }];
  for (const group of groups) {
    for (const { item, lock, fittedSlot } of group.items) {
      const facts = [words.effect(item.id)];
      if (fittedSlot >= 0 && fittedSlot !== openSlot) facts.push(words.slot(fittedSlot));
      items.push({ id: item.id, name: words.short(item.id), facts, tags: [group.category.id],
        ...(lock ? { disabled: words.lock(item.id, lock) } : {}) });
    }
  }
  return items;
}

/** The chips: one per category ('all' is the set with no chip pressed). */
export function equipmentPickerFilters(categoryIds: readonly string[], words: EquipmentPickerWords): { id: string; label: string }[] {
  return categoryIds.filter((id) => id !== 'all').map((id) => ({ id, label: words.category(id) }));
}

interface GarageEquipmentPickerOptions {
  /** The registry id (src/ui/interactionRegistry.ts), stamped as data-picker: garage-equipment. */
  readonly id: string;
  readonly host: HTMLElement;
  /** The set's name, for assistive tech. */
  readonly label: string;
  readonly text: PickerText;
  readonly words: EquipmentPickerWords;
  readonly categories: readonly string[];
  /** A card's picture as markup: the item's glyph (equipIcons.ts), or Empty's. */
  glyph(itemId: string): string;
  /** The item under the pointer or the focus (EQUIPMENT_EMPTY_ID for Empty), or null to show the fitted one again. */
  onPreview(itemId: string | null): void;
  /** A press fitted `itemId` in the slot, or cleared it (null). */
  onChoose(itemId: string | null): void;
  /** A shut item is under the pointer or the focus, or was pressed: show why (null: it left). */
  onShut(itemId: string | null, reason: string): void;
}

export interface GarageEquipmentPicker {
  /** Show the whole set for `openSlot` with `fitted` (null: the slot is empty) chosen, its filters released. */
  show(groups: EquipmentGroups, openSlot: number, fitted: string | null): void;
  focus(): void;
  /** The cards' grid, for the caller's row fit. */
  grid(): HTMLElement | null;
  dispose(): void;
}

/**
 * The Garage pickers' item cards (equipment, consumables): each option the kit picker draws in `host` takes its item's
 * badge (equipIcons.ts) as its picture, a microtask after the picker's render and on every later render.
 */
export function badgeCards(host: HTMLElement, glyph: (itemId: string) => string): { hydrate(): void; dispose(): void } {
  const hydrate = (): void => {
    for (const option of host.querySelectorAll<HTMLElement>('.cot-c-picker__opt[data-id]')) {
      const id = option.dataset.id;
      if (!id || option.querySelector('.cot-c-picker__media')) continue;
      const media = document.createElement('span');
      media.className = 'cot-c-picker__media cot-eq-glyph';
      media.innerHTML = glyph(id);
      option.prepend(media);
    }
  };
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(hydrate) : null;
  observer?.observe(host, { childList: true, subtree: true });
  return { hydrate, dispose: () => observer?.disconnect() };
}

/** The equipment picker in `host`: the kit picker, each card its item's glyph. */
export function createGarageEquipmentPicker(options: GarageEquipmentPickerOptions): GarageEquipmentPicker {
  const { host } = options;
  let picker: ReturnType<typeof createPicker> | null = null;
  const cards = badgeCards(host, options.glyph);

  // a shut item answers where the picker previews nothing: its reason on hover, focus and press
  const shutOf = (target: EventTarget | null): HTMLElement | null =>
    (target instanceof Element ? target.closest<HTMLElement>('.cot-c-picker__opt[aria-disabled="true"]') : null);
  const tell = (option: HTMLElement): void => options.onShut(option.dataset.id ?? null, option.dataset.tip ?? '');
  const onOver = (event: PointerEvent): void => { const shut = shutOf(event.target); if (shut) tell(shut); };
  const onOut = (event: PointerEvent): void => {
    const shut = shutOf(event.target);
    if (shut && !shut.contains(event.relatedTarget as Node | null)) options.onShut(null, '');
  };
  const onFocusIn = (event: FocusEvent): void => { const shut = shutOf(event.target); if (shut) tell(shut); };
  const onFocusOut = (event: FocusEvent): void => { if (shutOf(event.target) && !shutOf(event.relatedTarget)) options.onShut(null, ''); };
  const onClick = (event: MouseEvent): void => { const shut = shutOf(event.target); if (shut) tell(shut); };
  const onKey = (event: KeyboardEvent): void => {
    if ((event.key === 'Enter' || event.key === ' ') && shutOf(event.target)) { event.preventDefault(); tell(shutOf(event.target)!); }
  };
  host.addEventListener('pointerover', onOver);
  host.addEventListener('pointerout', onOut);
  host.addEventListener('focusin', onFocusIn);
  host.addEventListener('focusout', onFocusOut);
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);

  const toItem = (id: string): string | null => (id === EQUIPMENT_EMPTY_ID ? null : id);
  return {
    show(groups, openSlot, fitted) {
      const items = equipmentPickerItems(groups, openSlot, options.words);
      const value = fitted ?? EQUIPMENT_EMPTY_ID;
      // each slot opens on the whole set: a filter left pressed from the last slot read as a picker missing items
      picker?.dispose();
      picker = createPicker(host, {
        id: options.id,
        label: options.label,
        items,
        value,
        layout: 'swatches',
        text: options.text,
        filters: equipmentPickerFilters(options.categories, options.words),
        memory: 'equipment',
        onPreview: (item) => options.onPreview(item ? item.id : null),
        onChoose: (item) => options.onChoose(toItem(item.id)),
      });
      cards.hydrate();
    },
    focus() { picker?.focus(); },
    grid() { return host.querySelector<HTMLElement>('.cot-c-picker__grid'); },
    dispose() {
      cards.dispose();
      host.removeEventListener('pointerover', onOver);
      host.removeEventListener('pointerout', onOut);
      host.removeEventListener('focusin', onFocusIn);
      host.removeEventListener('focusout', onFocusOut);
      host.removeEventListener('click', onClick);
      host.removeEventListener('keydown', onKey);
      picker?.dispose();
      picker = null;
    },
  };
}
