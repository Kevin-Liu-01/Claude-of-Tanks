// A vehicle's actions as a surface shows them: the vehicle-action table (src/game/vehicleActions.ts) read for one vehicle,
// each with its key, glyph and translated name and tip, in the table's order. Copyright © 2026 Kevin B. Liu.
//
// Owner, 2026-10-25: "in garage, be able to see the actions u can do with tank (like engage dozer, lights, missiles,
// suspension, etc ...)". The Garage (premiere-gallery-studio) calls vehicleActionsFor with the selected spec. The fitted
// kit is read from the Garage's own light summary (garageAuxiliarySummary.generated.ts), never the battle's full mount
// inventory, so this module stays off the fleet's builders.
import { GARAGE_AUXILIARY_SUMMARY } from './garageAuxiliarySummary.generated.ts';
import { t } from './i18n.ts';
import {
  availableVehicleActions, vehicleAction, type VehicleActionBinding, type VehicleActionId, type VehicleActionMode,
  type VehicleActionSpec,
} from '../game/vehicleActions.ts';
import type { UiIconId } from './uiIcons.ts';

/** One action of a vehicle, ready to show. */
export interface VehicleActionEntry {
  readonly id: VehicleActionId;
  /** The input action it is bound to (input.ts), for a surface that reads the player's own binding. */
  readonly binding: VehicleActionBinding;
  /** The key's label: the player's binding where `keyFor` gives one, else the table's default (E, Q, C, V, G, N, B). */
  readonly key: string;
  readonly glyph: UiIconId;
  /** The translated name and hover tip. */
  readonly label: string;
  readonly help: string;
  /** 'mode' where the battle's mode grants it (the jump, the drone), 'vehicle' where the vehicle carries it. */
  readonly source: 'mode' | 'vehicle';
}

/** A KeyboardEvent.code as its keycap reads (input.ts labelForCode's letters and digits). */
function keycap(code: string): string {
  return code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code;
}

/**
 * The actions of the vehicle `spec`, in the table's order. `mode` adds what a battle's mode grants (a jump mode's
 * jump, the drone mode's drone); the Garage passes none, and shows what the vehicle carries. `keyFor` gives the
 * player's own key for a binding (an input layer's `labelFor(getBinding(...))`); without it the default key shows.
 */
export function vehicleActionsFor(spec: (VehicleActionSpec & { readonly id: string }) | null | undefined,
  mode: VehicleActionMode = {}, keyFor?: (binding: VehicleActionBinding) => string | null | undefined): VehicleActionEntry[] {
  const [smoke = 0, lights = 0, guns = 0] = (spec && GARAGE_AUXILIARY_SUMMARY[spec.id]) || [];
  return availableVehicleActions(spec, { smoke, lights: lights === 1, guns }, mode).map((id) => {
    const def = vehicleAction(id);
    return {
      id, binding: def.binding, key: keyFor?.(def.binding) || keycap(def.key), glyph: def.glyph,
      label: t(def.label), help: t(def.help), source: def.source,
    };
  });
}
