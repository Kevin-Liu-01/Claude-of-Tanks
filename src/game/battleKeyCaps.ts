// The battle's key caps, from the live bindings (owner 2026-10-28: "make sure to relabel if a person changes it in
// settings"). Copyright © 2026 Kevin B. Liu.
//
// One owner for every key cap the battle shows: the tray's shell digits and consumables, the controls row (the jump, the
// suspension, the ATGM, the reload, the drone, smoke, lights, the roof gun), the flight console's, the range card's, the
// minimap's and the gear's. Each reads its action's live binding: the keyboard's label, or on a pad layout (a pad used
// in the last few seconds, input.padActive) the pad's. A pad's LB (specialAction) runs the hull's own system where it
// has no suspension (sim/specialActionPolicy.ts), so that system's tile names LB where its action has no pad button of
// its own (owner 2026-10-28: "why is atgm labeled Q? E does it for me"; Main: one action, one key, and the tray shows
// the key that fires it). The caps are made again only when the bindings change (input.bindingsRevision), the layout
// turns pad or keyboard, or the hull's system changes: a frame otherwise reads the same object. DOM-free, Node-runnable.

/** Every action the battle shows a cap for. */
export const CAP_ACTIONS = Object.freeze(['selfRight', 'specialAction', 'atgm', 'reloadMagazine', 'drone', 'smoke', 'lights',
  'roofGun', 'aerialVision', 'supplyAmmo', 'supplyHeal', 'rangeReset', 'rangeMoving', 'minimapZoom', 'settingsMenu',
  'shell1', 'shell2', 'shell3', 'consumable1', 'consumable2', 'consumable3'] as const);
export type CapAction = typeof CAP_ACTIONS[number];

export interface KeyCapInput {
  getBinding(actionId: CapAction, slot?: 0 | 1): string | null;
  getPadBinding(actionId: CapAction): number | null;
  labelFor(code: string | null): string;
  padLabelFor(index: number | null): string;
  padActive(): boolean;
  bindingsRevision(): number;
}

/** The action a pad's LB runs on a hull without suspension: its ATGM, else its magazine reload; null otherwise. */
export type PadSystem = 'atgm' | 'reloadMagazine' | null;

export type BattleKeyCaps = Readonly<Record<CapAction, string>>;

/** One action's cap: its keyboard key, or on a pad layout its pad button (LB for the hull's system, where its action
 *  has none of its own; nothing where no button fires it). */
export function keyCapFor(input: KeyCapInput, action: CapAction, pad: boolean, padSystem: PadSystem = null): string {
  if (!pad) return input.labelFor(input.getBinding(action, 0) ?? input.getBinding(action, 1));
  const index = input.getPadBinding(action) ?? (action === padSystem ? input.getPadBinding('specialAction') : null);
  return index == null ? '' : input.padLabelFor(index);
}

export function createBattleKeyCaps(input: KeyCapInput): { read(padSystem?: PadSystem): BattleKeyCaps } {
  let revision = -1;
  let pad = false;
  let system: PadSystem = null;
  let caps: BattleKeyCaps | null = null;
  return {
    read(padSystem = null) {
      const nextPad = input.padActive();
      const nextRevision = input.bindingsRevision();
      if (caps && nextRevision === revision && nextPad === pad && padSystem === system) return caps;
      revision = nextRevision;
      pad = nextPad;
      system = padSystem;
      const next = {} as Record<CapAction, string>;
      for (const action of CAP_ACTIONS) next[action] = keyCapFor(input, action, pad, system);
      caps = Object.freeze(next);
      return caps;
    },
  };
}
