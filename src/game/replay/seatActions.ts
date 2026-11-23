/**
 * The player seat's discrete actions on the local driver (replay-system-275, docs/REPLAY.md §1 "Side stream").
 *
 * A key handler (game/playerBattleActions.ts) changes the simulation between two fixed steps through its `rules` port:
 * a shell selection, a magazine reload, a special action, a consumable, a self-right or a jump. The step never reads those
 * from the seat's controls, so a recording keeps each call as an action before the step that follows it, and a replay
 * makes the same call on the same hull before the same step. `wrapRecordedRules` is the one tap: every mutating rule the
 * handlers call goes through it. `replaySeatAction` is the one replay. Node-runnable.
 */
import type { ReplayAction } from '../../sim/replayFormat.ts';

/** The rules the handlers call that change the simulation (the rest of the port only reads). */
export const RECORDED_RULES = ['selectShell', 'repairAllModules', 'startMagazineReload', 'activateSpecialAction', 'useSoloConsumable',
  'requestTankSelfRight', 'requestTankJump'] as const;
type RecordedRule = typeof RECORDED_RULES[number];

/** A direct write a handler makes outside the rules: a guided missile's way back to the cannon round. */
export const PREVIOUS_SHELL_SLOT = 'previousShellSlot';

// the rules' own signatures pass through unchanged
type AnyRule = (...args: any[]) => any;

/** The seat hull a recorded call names: its combat, state and special action identify it. */
export interface SeatActionEntity {
  combat: object | null;
  state: object | null;
  specialAction?: object | null;
  modeGravityScale?: number | null;
  modeJumpMps?: number | null;
}

/** The call's numeric arguments, the hull's own objects left out (the replay passes the replayed hull's). */
function recordedArgs(kind: RecordedRule, args: readonly unknown[]): number[] {
  const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : NaN);
  switch (kind) {
    case 'selectShell': return [num(args[1])];
    case 'useSoloConsumable': return [num(args[2])];
    case 'requestTankSelfRight': return [num(args[1] ?? 1)];
    case 'requestTankJump': return [num(args[1]), num(args[2] ?? 1)];
    default: return [];
  }
}

/**
 * `rules` with every recorded rule reporting its call to `record` (after it ran, with what it returned) when it names
 * a seated hull: `seatOf` answers that hull's seat index for the call's combat or state object, or -1.
 */
export function wrapRecordedRules<TRules extends Partial<Record<RecordedRule, AnyRule>>>(
  rules: TRules,
  seatOf: (owner: unknown) => number,
  record: (seat: number, kind: string, args: number[]) => void,
): TRules {
  const wrapped = { ...rules };
  for (const kind of RECORDED_RULES) {
    const rule = rules[kind];
    if (typeof rule !== 'function') continue;
    (wrapped as Record<string, AnyRule>)[kind] = (...args: unknown[]) => {
      const result = rule(...args);
      const seat = seatOf(args[0]);
      if (seat >= 0) record(seat, kind, recordedArgs(kind, args));
      return result;
    };
  }
  return wrapped;
}

/** The ports a replayed call needs beside the hull. */
export interface SeatActionReplayPorts {
  rules: Partial<Record<RecordedRule, AnyRule>>;
  bus: { emit(type: string, payload: unknown): unknown };
  timeS: number;
}

/** `action` made again on `entity`, as the recording's handler made it. Unknown kinds throw: the recording is newer. */
export function replaySeatAction(action: ReplayAction, entity: SeatActionEntity & { spec: object }, ports: SeatActionReplayPorts): void {
  const { rules } = ports;
  const [a = NaN, b = NaN] = action.args;
  const call = (kind: RecordedRule, ...args: unknown[]) => {
    const rule = rules[kind];
    if (typeof rule !== 'function') throw new Error(`replay: no rule ${kind}`);
    rule(...args);
  };
  switch (action.kind) {
    case 'selectShell': call('selectShell', entity.combat, a, entity.spec); return;
    case 'repairAllModules': call('repairAllModules', entity.combat); return;
    case 'startMagazineReload': call('startMagazineReload', entity.combat, entity.spec); return;
    case 'activateSpecialAction': call('activateSpecialAction', entity); return;
    case 'useSoloConsumable': call('useSoloConsumable', entity, ports.bus, a, ports.timeS); return;
    case 'requestTankSelfRight': call('requestTankSelfRight', entity.state, a); return;
    case 'requestTankJump': call('requestTankJump', entity.state, a, b); return;
    case PREVIOUS_SHELL_SLOT: {
      const special = entity.specialAction as { previousShellSlot?: number } | null | undefined;
      if (special) special.previousShellSlot = a;
      return;
    }
    default: throw new Error(`replay: unknown seat action ${action.kind}`);
  }
}
