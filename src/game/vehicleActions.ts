// The vehicle actions: one table for every action a vehicle can have. Copyright © 2026 Kevin B. Liu.
//
// Owner, 2026-10-25: "in garage, be able to see the actions u can do with tank (like engage dozer, lights, missiles,
// suspension, etc whicha ll need to be organized and set btw so its consistent which keys do what and their order with
// each other and not letting suspension keep getting cut off)".
//
// Each action has one display order, one default key and one glyph and name, so the same action sits on the same key and
// in the same place on every tank. E used to mean the vehicle's one context-sensitive system: suspension on a
// hydropneumatic hull, the ATGM on a launcher, the magazine reload on an autoloader. A launcher on a hydropneumatic hull
// took its shell digit instead. Now suspension is E, the ATGM Q and the reload C wherever they exist, one key each: the
// keyboard's E is the suspension's alone (owner 2026-10-28: "why is atgm labeled Q? E does it for me"). A pad's LB, its
// one system button, still runs a hull's own system where it has no suspension, and that tile names LB on a pad layout
// (game/battleKeyCaps.ts).
//
// The battle HUD's controls row (hud.ts, vehicleControlOrder.ts), Settings › Controls (input.ts ACTION_DEFS, in this
// order) and the Garage (vehicleActionsFor) read this table; input.ts takes its default keys from it. A dozer blade has
// no action in the simulation yet; it gets a row here when it does. Node-runnable: its one import is a type.
import type { UiIconId } from '../ui/uiIcons.ts';

/** The row's actions, in display order. */
export type VehicleActionId = 'jump' | 'suspension' | 'atgm' | 'reload' | 'drone' | 'smoke' | 'lights' | 'roofGun';
/** A flight's actions (the drone and the AC-130's console). */
export type FlightActionId = 'vision' | 'supplyAmmo' | 'supplyHeal';
/** The input action each one is bound to (src/game/input.ts ACTION_DEFS). */
export type VehicleActionBinding = 'selfRight' | 'specialAction' | 'atgm' | 'reloadMagazine' | 'drone' | 'smoke' | 'lights'
  | 'roofGun' | 'aerialVision' | 'supplyAmmo' | 'supplyHeal';

export interface VehicleActionDef<Id extends string = VehicleActionId> {
  readonly id: Id;
  /** The rebindable input action that triggers it. */
  readonly binding: VehicleActionBinding;
  /** Its default key (a KeyboardEvent.code), the same on every vehicle. */
  readonly key: string;
  /** Its glyph (src/ui/uiIcons.ts). */
  readonly glyph: UiIconId;
  /** Its name and its hover tip (i18n keys, en and zh). */
  readonly label: string;
  readonly help: string;
  /** Whether the battle's mode grants it (every vehicle has it there) or the vehicle carries it. */
  readonly source: 'mode' | 'vehicle';
}

/** Every row action, left to right. A jump mode leads with the jump (owner 2026-10-14); elsewhere it is not shown. */
export const VEHICLE_ACTIONS: readonly VehicleActionDef[] = Object.freeze([
  { id: 'jump', binding: 'selfRight', key: 'KeyF', glyph: 'rocket', label: 'hud.jump', help: 'vehicleActions.jump.help', source: 'mode' },
  { id: 'suspension', binding: 'specialAction', key: 'KeyE', glyph: 'track', label: 'vehicleActions.suspension', help: 'vehicleActions.suspension.help', source: 'vehicle' },
  { id: 'atgm', binding: 'atgm', key: 'KeyQ', glyph: 'missileRack', label: 'systems.atgm', help: 'systems.atgm.help', source: 'vehicle' },
  { id: 'reload', binding: 'reloadMagazine', key: 'KeyC', glyph: 'autoloader', label: 'vehicleActions.reload', help: 'vehicleActions.reload.help', source: 'vehicle' },
  { id: 'drone', binding: 'drone', key: 'KeyV', glyph: 'modeDrone', label: 'systems.drone', help: 'systems.drone.help', source: 'mode' },
  { id: 'smoke', binding: 'smoke', key: 'KeyG', glyph: 'smoke', label: 'systems.smoke', help: 'systems.smoke.help', source: 'vehicle' },
  { id: 'lights', binding: 'lights', key: 'KeyN', glyph: 'lightbulb', label: 'systems.lights', help: 'systems.lights.help', source: 'vehicle' },
  { id: 'roofGun', binding: 'roofGun', key: 'KeyB', glyph: 'roofGun', label: 'systems.roofGun', help: 'systems.roofGun.help', source: 'vehicle' },
] as const);

/** A flight's actions, in the console's order (src/ui/aerialHud.ts). */
export const FLIGHT_ACTIONS: readonly VehicleActionDef<FlightActionId>[] = Object.freeze([
  { id: 'vision', binding: 'aerialVision', key: 'KeyI', glyph: 'visionInfrared', label: 'flight.view.action', help: 'flight.view.action', source: 'mode' },
  // (the rack's glyph: the round's was the 152 mm HE card's beside it, gauntlet r6)
  { id: 'supplyAmmo', binding: 'supplyAmmo', key: 'KeyJ', glyph: 'ammoRack', label: 'flight.supply.ammo', help: 'flight.supply.ammo', source: 'mode' },
  { id: 'supplyHeal', binding: 'supplyHeal', key: 'KeyK', glyph: 'medkit', label: 'flight.supply.heal', help: 'flight.supply.heal', source: 'mode' },
] as const);

const BY_ID: ReadonlyMap<string, VehicleActionDef<string>> = new Map([...VEHICLE_ACTIONS, ...FLIGHT_ACTIONS].map((def) => [def.id, def]));

/** One action's row of the table. */
export function vehicleAction(id: VehicleActionId | FlightActionId): VehicleActionDef<string> {
  return BY_ID.get(id)!;
}

/** The default key of every action, by its input binding (input.ts DEFAULT_BINDINGS spreads it). */
export function vehicleActionDefaultKeys(): Record<VehicleActionBinding, string> {
  return Object.fromEntries([...VEHICLE_ACTIONS, ...FLIGHT_ACTIONS].map((def) => [def.binding, def.key])) as Record<VehicleActionBinding, string>;
}

/** What a vehicle's spec says of its actions (any spec shape: the fleet's, the Garage's, the authority's). */
export interface VehicleActionSpec {
  readonly hydropneumaticAim?: unknown;
  readonly gun?: { readonly autoloader?: unknown; readonly shells?: readonly { readonly guided?: boolean }[] } | null;
}
/** A vehicle's fitted kit: smoke launchers, driving lights and working roof stations (the counts are enough). */
export interface VehicleActionKit {
  readonly smoke: number;
  readonly lights: boolean;
  readonly guns: number;
}
/** What the battle's mode grants every vehicle. */
export interface VehicleActionMode {
  readonly jump?: boolean;
  readonly drone?: boolean;
}

/**
 * The actions a vehicle has, in display order: suspension on a hydropneumatic hull, the ATGM where a guided round sits
 * beside a conventional one, the reload on an autoloader, smoke, lights and the roof gun where they are fitted, and
 * the jump and the drone where the mode grants them.
 */
export function availableVehicleActions(spec: VehicleActionSpec | null | undefined, kit: VehicleActionKit | null | undefined,
  mode: VehicleActionMode = {}): VehicleActionId[] {
  const shells = spec?.gun?.shells ?? [];
  const has: Record<VehicleActionId, boolean> = {
    jump: !!mode.jump,
    suspension: !!spec?.hydropneumaticAim,
    atgm: shells.some((shell) => shell?.guided === true) && shells.some((shell) => shell?.guided !== true),
    reload: !!spec?.gun?.autoloader,
    drone: !!mode.drone,
    smoke: (kit?.smoke ?? 0) > 0,
    lights: !!kit?.lights,
    roofGun: (kit?.guns ?? 0) > 0,
  };
  return VEHICLE_ACTIONS.filter((def) => has[def.id]).map((def) => def.id);
}
