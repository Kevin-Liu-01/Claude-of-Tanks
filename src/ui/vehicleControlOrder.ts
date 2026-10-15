// The vehicle-controls row (the owner's "stuff you can do row"): the one ordering of its items for every mode and
// both layouts. Desktop and touch share the same strip (.cot-vehicle-controls, battleHudLayout.css), a plain flex row
// that scrolls sideways when narrow, so DOM order is the visual order, the Tab order and the screen-reader order.
// Every keycap in the row names its own binding (E, F, V and the auxiliary keys); none is positional, so moving an
// item never renumbers a key.
//
// Owner (2026-10-14): "in jump modes, jump should always be placed farthest left in the stuff u can do row" —
// whatever the loadout, its equipment count or its cooldowns. A jump mode is any ruleset with a jump launch
// (src/sim/matchRuleset.ts jumpMps); outside one the jump is hidden and the loadout keeps its own order.
import type { MatchRuleset } from '../sim/matchRuleset.ts';

type VehicleControlId = 'jump' | 'special' | 'drone' | 'missile' | 'smoke' | 'lights' | 'roofGun';

/** The loadout's own order: the vehicle's special action, its drone, the extra ATGM, smoke, lights, the roof gun. */
const LOADOUT_ORDER: readonly VehicleControlId[] = Object.freeze(['special', 'drone', 'missile', 'smoke', 'lights', 'roofGun']);
/** A jump mode leads with the jump. */
const JUMP_MODE_ORDER: readonly VehicleControlId[] = Object.freeze(['jump', ...LOADOUT_ORDER]);
/** Elsewhere the hidden jump waits at the far end, so nothing in front of the loadout moves. */
const PLAIN_MODE_ORDER: readonly VehicleControlId[] = Object.freeze([...LOADOUT_ORDER, 'jump']);

export function isJumpMode(ruleset: Pick<MatchRuleset, 'jumpMps'> | null | undefined): boolean {
  return ruleset?.jumpMps != null;
}

/** Every item of the row, left to right. */
export function vehicleControlOrder(jumpMode: boolean): readonly VehicleControlId[] {
  return jumpMode ? JUMP_MODE_ORDER : PLAIN_MODE_ORDER;
}

/** The items a loadout shows, left to right: the jump exactly when the mode has one, the rest when the vehicle does. */
export function visibleVehicleControls(shown: ReadonlySet<VehicleControlId>, jumpMode: boolean): VehicleControlId[] {
  return vehicleControlOrder(jumpMode).filter((id) => (id === 'jump' ? jumpMode : shown.has(id)));
}

interface RowNode { readonly nextSibling: RowNode | null }
interface Row<T extends RowNode> { readonly firstChild: RowNode | null; insertBefore(node: T, reference: RowNode | null): unknown }

/**
 * Puts the row's buttons in `vehicleControlOrder` and returns how many it moved. Nodes already in place stay put, so
 * a repeat call moves nothing; the HUD calls it only when the mode's jump flag changes, never per frame.
 */
export function arrangeVehicleControls<T extends RowNode>(
  row: Row<T>,
  controls: Readonly<Record<VehicleControlId, T>>,
  jumpMode: boolean,
): number {
  const order = vehicleControlOrder(jumpMode);
  let moved = 0;
  let previous: T | null = null;
  for (let i = 0; i < order.length; i++) {
    const node = controls[order[i]];
    const slot: RowNode | null = previous ? previous.nextSibling : row.firstChild;
    if (slot !== node) { row.insertBefore(node, slot); moved++; }
    previous = node;
  }
  return moved;
}
