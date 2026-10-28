// garageConsumables.ts — the Garage's consumable slots and their picker (2026-10-26, the catalog: owner "have a much
// larger variety"). Copyright © 2026 Kevin B. Liu.
//
// The three slots sit in the lower third's band beside the equipment: each the fitted item's glyph and short name with
// the kit's chevron (it opens a choice), its full name and what it does in the tip, and under them how many kits this tank
// may fit (Main's ruling, 2026-10-27: the default trio reads as a choice). A slot opens the kit picker (components/picker.ts, layout 'swatches') with the
// whole catalog: the categories are its filter chips, a shut item (its era, its smoke dischargers) stays in the set with
// its reason, and an item already in another slot swaps into this one. A choice is saved per tank
// (game/consumableLoadout.ts `cot.cons.<specId>`) and announced (CONSUMABLE_LOADOUT_EVENT) so the settings rows and the
// battle tray name the same items. The battle reads the same save at spawn.

import { createPicker, type PickerItem, type PickerText } from './components/picker.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';
import { consumableIconSVG } from './equipIcons.ts';
import { badgeCards } from './garageEquipmentPicker.ts';
import { uiIconSVG } from './uiIcons.ts';
import { t } from './i18n.ts';
import {
  CONSUMABLE_LOADOUT_EVENT, CONSUMABLE_SLOTS, consumableCategoryKey, consumableEffectKey, consumableLockKey,
  consumableNameKey, consumablePickerGroups, consumableShortKey, consumableSpecFor, consumableSlotsView, fitConsumable,
  isConsumableId, loadConsumables, saveConsumables, type ConsumableId,
} from '../game/consumableLoadout.ts';
import { CONSUMABLE_CATEGORIES, type ConsumableLock } from '../sim/consumableRules.ts';

interface GarageConsumablesOptions {
  /** The band group the slots render into. */
  readonly host: HTMLElement;
  /** Where the picker's panel is mounted (the Garage root). */
  readonly root: HTMLElement;
  /** The shown tank (null while none is). */
  readonly vehicle: () => { readonly id: string; readonly era?: string; readonly role?: string } | null;
  /** The room or a test drive holds the tank fixed. */
  readonly locked: () => boolean;
  readonly text: () => PickerText;
  /** Fit the open picker's grid to its sheet (garage.ts: a phone's sheet fills its room with whole rows, as the
   *  equipment's does). */
  readonly fitGrid?: (grid: HTMLElement) => void;
  emit(name: string, payload: object): void;
}

export interface GarageConsumables {
  /** Draw the shown tank's slots (and tell the settings and tray its items). */
  render(): void;
  close(): void;
  dispose(): void;
}

const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// which tanks carry smoke dischargers is the auxiliary inventory's, a large generated table the Garage's boot never
// carries: the picker loads it on first open, and the smoke gate holds from then on (the battle always reads it)
let smokeOf: ((id: string) => boolean) | null = null;
let smokeLoad: Promise<void> | null = null;
function loadSmokeTable(): Promise<void> {
  smokeLoad ??= import('../vehicles/auxiliaryInventory.ts').then(({ auxiliaryCapabilities }) => {
    smokeOf = (id) => !!auxiliaryCapabilities({ id })?.smoke?.length;
  }, () => { smokeLoad = null; });
  return smokeLoad;
}
const vehicleFacts = (vehicle: { readonly id: string; readonly era?: string; readonly role?: string }) =>
  consumableSpecFor(vehicle, smokeOf ? smokeOf(vehicle.id) : undefined);

export function createGarageConsumables(options: GarageConsumablesOptions): GarageConsumables {
  const { host, root } = options;
  const panel = document.createElement('div');
  panel.className = 'cot-eqpick cot-cspick';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', t('garage.consumables'));
  panel.tabIndex = -1;
  panel.innerHTML =
    `<div class="ph"><span class="t"></span>` +
    `<button type="button" class="cot-c-btn cot-c-btn--icon cot-c-btn--36 cot-c-btn--ghost x" aria-label="${escapeAttr(t('garage.equipment.headingClose'))}">` +
    `${uiIconSVG('close', 18)}</button></div><div class="cot-eq-picker cot-cs-picker"></div><div class="cot-eqpreview cot-cspreview"></div>`;
  root.appendChild(panel);
  const titleEl = panel.querySelector<HTMLElement>('.ph .t')!;
  const pickerHost = panel.querySelector<HTMLElement>('.cot-cs-picker')!;
  const readoutEl = panel.querySelector<HTMLElement>('.cot-cspreview')!;
  // each card is its item's badge over its short name and what it does, as the equipment picker's (badgeCards)
  const cards = badgeCards(pickerHost, (id) => consumableIconSVG(id, 38));
  let picker: ReturnType<typeof createPicker> | null = null;
  let openSlot = -1;
  let pendingSlot = -1;

  const items = (): ConsumableId[] => {
    const vehicle = options.vehicle();
    return vehicle ? loadConsumables(vehicle.id, vehicleFacts(vehicle)) : [];
  };
  const tip = (id: ConsumableId): string => `${t(consumableNameKey(id))}: ${t(consumableEffectKey(id))}`;
  // how many kits the picker lets this tank fit (consumableLock under the Garage's gate); unknown until the smoke table
  // is in, so the count never names a smoke reload the tank cannot load
  const choices = (): number | null => {
    const vehicle = options.vehicle();
    if (!vehicle || !smokeOf) return null;
    let n = 0;
    for (const group of consumablePickerGroups([], vehicleFacts(vehicle))) for (const entry of group.items) if (!entry.lock) n++;
    return n;
  };
  const slotTip = (id: ConsumableId, n: number | null): string =>
    n == null ? tip(id) : `${tip(id)}\n${t('garage.consumableChoices', { n: String(n) })}`;
  // the tip reads data-tip as it shows (components/hoverTip.ts), so the count lands in place, the focus untouched
  function refreshTips(): void {
    const n = choices();
    for (const el of host.querySelectorAll<HTMLElement>('.csslot')) {
      if (isConsumableId(el.dataset.item ?? '')) el.dataset.tip = slotTip(el.dataset.item as ConsumableId, n);
    }
  }
  // a pointer or the focus reaching the band fetches the smoke table: a pointer's dwell and a keyboard's way through the
  // equipment slots both come before a consumable's tip
  const warm = (): void => { if (!smokeOf) void loadSmokeTable().then(refreshTips); };

  // each item's category and lock as the open picker shows them (the readout's eyebrow and its reason)
  const shown = new Map<ConsumableId, { readonly category: string; readonly lock: ConsumableLock | null }>();

  /**
   * The readout under the grid, built as the equipment picker's (garage.ts equipmentReadout, its .cot-eqtip): the item
   * under the pointer or the focus, else the slot's own. Its category with its cooldown and uses, its name, what it does,
   * and a shut item's reason.
   */
  function readout(id: ConsumableId | null): void {
    if (!id) { readoutEl.replaceChildren(); return; }
    const view = consumableSlotsView([id])[0]!;
    const facts = shown.get(id);
    const uses = view.charges == null ? t('garage.consumable.unlimited') : t('garage.consumable.uses', { n: String(view.charges) });
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = [facts ? t(consumableCategoryKey(facts.category)) : '',
      t('garage.consumable.cooldown', { s: String(view.cooldownS) }), uses].filter(Boolean).join(' · ');
    const name = document.createElement('strong');
    name.textContent = t(view.nameKey);
    const detail = document.createElement('span');
    detail.className = 'detail';
    detail.textContent = t(view.effectKey);
    const action = document.createElement('span');
    action.className = 'action';
    action.textContent = facts?.lock ? t(consumableLockKey(facts.lock)) : '';
    const body = document.createElement('div');
    body.className = 'cot-eqtip';
    if (facts?.lock) body.dataset.shut = '';
    body.append(eyebrow, name, detail, action);
    readoutEl.replaceChildren(body);
  }

  function pickerItems(current: readonly ConsumableId[]): PickerItem[] {
    const vehicle = options.vehicle();
    const out: PickerItem[] = [];
    shown.clear();
    for (const group of consumablePickerGroups(current, vehicle ? vehicleFacts(vehicle) : null)) {
      for (const { item, lock, fittedSlot } of group.items) {
        shown.set(item.id, { category: group.category.id, lock });
        const facts = [t(consumableEffectKey(item.id))];
        if (fittedSlot >= 0 && fittedSlot !== openSlot) facts.push(t('garage.equipment.tag.slot', { slot: fittedSlot + 1 }));
        out.push({
          id: item.id, name: t(consumableShortKey(item.id)), facts, tags: [group.category.id],
          ...(lock ? { disabled: t(consumableLockKey(lock)) } : {}),
        });
      }
    }
    return out;
  }

  function choose(id: string): void {
    const vehicle = options.vehicle();
    if (!vehicle || openSlot < 0 || !isConsumableId(id)) return;
    const slot = openSlot;
    saveConsumables(vehicle.id, fitConsumable(items(), slot, id), vehicleFacts(vehicle));
    options.emit('ui:click', {});
    close();
    render();
    host.querySelector<HTMLElement>(`.csslot[data-slot="${slot}"]`)?.focus({ preventScroll: true });
  }

  function open(slot: number): void {
    if (options.locked()) return;
    if (!smokeOf) {
      // the first open waits for the smoke table (a later click on another slot wins)
      pendingSlot = slot;
      void loadSmokeTable().then(() => { refreshTips(); if (pendingSlot === slot && smokeOf) { pendingSlot = -1; open(slot); } });
      return;
    }
    pendingSlot = -1;
    const current = items();
    if (!current.length) return;
    openSurface(surface, host.querySelector(`.csslot[data-slot="${slot}"]`));
    openSlot = slot;
    titleEl.textContent = t('garage.equipment.tag.slot', { slot: slot + 1 });
    picker?.dispose();
    picker = createPicker(pickerHost, {
      // the registry id (src/ui/interactionRegistry.ts), stamped as data-picker
      id: 'garage-consumables',
      label: t('garage.consumables'),
      items: pickerItems(current),
      value: current[slot] ?? null,
      layout: 'swatches',
      text: options.text(),
      filters: CONSUMABLE_CATEGORIES.map((id) => ({ id, label: t(consumableCategoryKey(id)) })),
      memory: 'consumables',
      onPreview: (item) => readout(item && isConsumableId(item.id) ? item.id : current[slot] ?? null),
      onChoose: (item) => choose(item.id),
    });
    cards.hydrate();
    readout(current[slot] ?? null);
    panel.classList.add('open');
    root.classList.add('picker-open');
    for (const el of host.querySelectorAll<HTMLElement>('.csslot')) el.classList.toggle('open', Number(el.dataset.slot) === slot);
    // the persistent panel's title sits over the picker's bar, which starts after it (showroom.css --eq-title-w, as the
    // equipment picker measures its own)
    requestAnimationFrame(() => {
      panel.style.setProperty('--eq-title-w', `${Math.ceil(titleEl.getBoundingClientRect().width)}px`);
      const grid = pickerHost.querySelector<HTMLElement>('.cot-c-picker__grid');
      if (grid) options.fitGrid?.(grid);
    });
    picker.focus();
  }

  /** Close; the focus goes back to the slot unless another surface took it (`restoreFocus` false). */
  function close({ restoreFocus = true } = {}): void {
    if (openSlot < 0) return;
    closeSurface(surface);
    const slot = openSlot;
    openSlot = -1;
    panel.classList.remove('open');
    root.classList.remove('picker-open');
    for (const el of host.querySelectorAll<HTMLElement>('.csslot')) el.classList.remove('open');
    if (restoreFocus) host.querySelector<HTMLElement>(`.csslot[data-slot="${slot}"]`)?.focus({ preventScroll: true });
  }
  // a transient surface (components/surfaceStack.ts): opening it closes the equipment's picker or a menu as it enters, and
  // Escape and a press outside it and its slots are the stack's
  const surface: TransientSurface = {
    id: 'garage-consumables',
    element: () => panel,
    owns: (node) => host.contains(node),
    close: (reason) => close({ restoreFocus: reason === 'escape' }),
  };

  function render(): void {
    const vehicle = options.vehicle();
    const views = consumableSlotsView(items());
    const n = choices();
    host.innerHTML = views.map((view) =>
      // the equipment slot's primitive (one control, one selected state: .open), styled with the band (showroom.css)
      `<button type="button" class="eqslot csslot" data-slot="${view.slot}" data-item="${view.itemId}" ` +
      `aria-label="${escapeAttr(`${t('garage.consumableSlot', { n: String(view.slot + 1) })}: ${tip(view.itemId)}`)}" ` +
      `data-tip="${escapeAttr(slotTip(view.itemId, n))}">${consumableIconSVG(view.itemId, 26)}` +
      `<span class="sl">${escapeAttr(t(view.shortKey))}</span>` +
      // the kit's chevron, as a fitted equipment slot ends (gallery-studio's .chev rule in showroom.css styles both groups)
      `<span class="chev" aria-hidden="true">${uiIconSVG('chevronDown', 12)}</span></button>`).join('');
    // the settings rows (canvas-ui) read each slot's view: its action, item, name keys and glyph; at boot with the shown
    // tank and on every change of tank or item
    if (vehicle) options.emit(CONSUMABLE_LOADOUT_EVENT, { specId: vehicle.id, items: views });
  }

  const onHostClick = (event: MouseEvent): void => {
    const slot = event.target instanceof Element ? event.target.closest<HTMLElement>('.csslot') : null;
    if (!slot) return;
    options.emit('ui:click', {});
    const index = Number(slot.dataset.slot);
    if (index === openSlot) close();
    else if (index >= 0 && index < CONSUMABLE_SLOTS) open(index);
  };
  const onPanelClick = (event: MouseEvent): void => {
    if (event.target instanceof Element && event.target.closest('.ph .x')) { options.emit('ui:click', {}); close(); }
  };
  host.addEventListener('click', onHostClick);
  const band = host.closest<HTMLElement>('.cot-lt-band') ?? host;
  band.addEventListener('pointerover', warm);
  band.addEventListener('focusin', warm);
  panel.addEventListener('click', onPanelClick);

  return {
    render,
    close: () => close(),
    dispose() {
      pendingSlot = -1;
      close();
      host.removeEventListener('click', onHostClick);
      band.removeEventListener('pointerover', warm);
      band.removeEventListener('focusin', warm);
      panel.removeEventListener('click', onPanelClick);
      cards.dispose();
      picker?.dispose();
      panel.remove();
    },
  };
}
