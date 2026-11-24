/**
 * The battle's own actions in a recording (replay-system, docs/REPLAY.md §2): the solo runtime's calls
 * (game/soloBattleAccess.ts SoloBattleRuntime) that change a battle between two steps from outside its seats: a
 * training step's cue (its scripted shooter, whose sight clock and volley the step then runs), the training battle's
 * checkpoint and its end, and the proving ground's reset and moving-target switch. Each is recorded as a seat -1 action
 * before the next step, as the footprint is, and the replay calls the same rule there on its own battle.
 *
 * Every call of the runtime is classified (battleActions.selftest.mjs fails on one that is not): recorded here, or the
 * step itself, the setup (its own recorded stage), a read, or the Leave that ends the recording.
 */
import type { ReplayAction } from '../../sim/replayFormat.ts';

/** The runtime's calls that change a battle between two steps: recorded. */
export const RECORDED_BATTLE_RULES = ['cueTrainingActor', 'setTrainingCheckpoint', 'finishTrainingBattle', 'resetProvingRange',
  'setProvingTargetsMoving'] as const;
export type RecordedBattleRule = typeof RECORDED_BATTLE_RULES[number];

/** The rest of the runtime, by why it is not recorded here. */
export const UNRECORDED_BATTLE_RULES = Object.freeze({
  /** The step: the recorder taps it (beforeStep / afterStep). */
  step: ['simStep'],
  /** The setup and its world: the recorder keeps the setup's own stage (beginSetup), the collider is the world's. */
  setup: ['setupBattle', 'createCollider', 'prepareNextOpeningRoute'],
  /** Reads (a training shooter's sight fraction and threat verdicts for the tutorial's guide). */
  read: ['trainingSightFor', 'trainingThreatFor'],
  /** A Leave before the verdict: the battle ends with it, and so does its recording. */
  ends: ['recordBattleLeft'],
} as const);

const RECORDED = new Set<string>(RECORDED_BATTLE_RULES);

export function isBattleAction(kind: string): kind is RecordedBattleRule {
  return RECORDED.has(kind);
}

// the rules' own signatures pass through unchanged
type AnyRule = (...args: any[]) => any;

/** The call's arguments past the battle: numbers, and a training cue's actor key as the action's `key`. */
function recordedArgs(kind: RecordedBattleRule, args: readonly unknown[]): { args: number[]; key?: string } {
  const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : NaN);
  switch (kind) {
    case 'cueTrainingActor': return { args: [args[2] ? 1 : 0], key: String(args[1] ?? '') };
    case 'setTrainingCheckpoint': return { args: [num(args[1]), num(args[2])] };
    case 'setProvingTargetsMoving': return { args: [args[1] ? 1 : 0] };
    default: return { args: [] };
  }
}

/**
 * `rules` with each recorded rule reporting its call to `record` (after it ran) when it names the recorded battle
 * (`isBattle(args[0])`); every call is recorded, whatever it returned, as a refused one changes nothing on the replay
 * either (and the moving-target switch changes the ruleset before its reset may refuse).
 */
export function wrapBattleRules<TRules extends Partial<Record<RecordedBattleRule, AnyRule>>>(
  rules: TRules,
  isBattle: (game: unknown) => boolean,
  record: (kind: RecordedBattleRule, args: number[], key?: string) => void,
): TRules {
  const wrapped = { ...rules } as Record<string, AnyRule>;
  for (const kind of RECORDED_BATTLE_RULES) {
    const rule = rules[kind] as AnyRule | undefined;
    if (typeof rule !== 'function') continue;
    wrapped[kind] = (...args: unknown[]) => {
      const result = rule(...args);
      if (isBattle(args[0])) {
        const call = recordedArgs(kind, args);
        record(kind, call.args, call.key);
      }
      return result;
    };
  }
  return wrapped as TRules;
}

/** Call a recorded battle action's rule on the replayed battle (before the step it was recorded for). */
export function replayBattleAction(action: ReplayAction, game: object, rules: Readonly<Record<RecordedBattleRule, AnyRule>>): void {
  if (!isBattleAction(action.kind)) throw new Error(`replay: unknown battle action ${action.kind}`);
  const rule = rules[action.kind];
  const [a = NaN, b = NaN] = action.args;
  switch (action.kind) {
    case 'cueTrainingActor': rule(game, action.key ?? '', a === 1); return;
    case 'setTrainingCheckpoint': rule(game, a, b); return;
    case 'setProvingTargetsMoving': rule(game, a === 1); return;
    default: rule(game);
  }
}
