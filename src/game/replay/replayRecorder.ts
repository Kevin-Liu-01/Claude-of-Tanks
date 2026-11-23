/**
 * The local driver's battle recorder (replay-system-275, docs/REPLAY.md §1-§3). One per page, armed for each solo
 * battle; it costs a few microseconds a step.
 *
 * Taps, each a single place:
 *  - setup: `beginSetup`/`endSetup` around state.ts setupBattle (game/soloBattleStartRuntime.ts) keep what setup reads
 *    beyond its options: the roster seed, the battle count, the previous battles' bots, the debug roster flags, and every
 *    localStorage value read while setting up or stepping (the loadout, difficulty, arrangement, brains, paint,
 *    consumables). The replayer serves those back, so setup itself does not change;
 *  - each fixed step: `beforeStep` stages the seat (sim/seatControl.ts: the controls the frame wrote, as integers, written
 *    back as the step reads them) and appends them to the SEATS stream; `afterStep` notes a hull's contact footprint
 *    the step published (a visual streamed in) and seals a checksum every REPLAY_CHECKSUM_EVERY steps;
 *  - the seat's discrete actions: `wrapRules` around game/playerBattleActions.ts's rules port and its `recordSeatWrite`;
 *  - the bus: `onEvent` keeps the timeline's marks (createBus's recorder hook in main.ts).
 *
 * Couch and Watch seats (phones, a taken bot) are P1 limits: such a battle is not recorded. Node-runnable.
 */
import { REPLAY_CHECKSUM_EVERY, REPLAY_FORMAT_VERSION, SeatStreamWriter, encodeReplay, type ReplayAction, type ReplayEnd,
  type ReplayEventMark, type ReplayHeader, type ReplayRosterEntry } from '../../sim/replayFormat.ts';
import { applySeatControl, captureSeatControl, createSeatControl, type SeatControl, type SeatControlEntity } from '../../sim/seatControl.ts';
import type { RuntimeValue } from '../../runtimeTypes.ts';
import { replayStateDigest } from './replayChecksum.ts';
import { REPLAY_BUILD, REPLAY_DIGEST } from './replayBuild.ts';
import { PREVIOUS_SHELL_SLOT, wrapRecordedRules } from './seatActions.ts';
import { createReplayTrace, type ReplayTrace, type ReplayTraceExport } from './replayTrace.ts';

/** A footprint as state.ts validatedContactGeometry leaves it. */
export interface ReplayFootprint {
  halfLenM: number;
  halfWidM: number;
  zCenterM: number;
  bottomYM: number;
  panYM: number | null;
  endRise: { dzM: number; frontM: number; rearM: number } | null;
}

export const FOOTPRINT_ACTION = 'footprint';

/** The footprint's numbers in a recorded action's order, after the hull's roster index. */
export function footprintArgs(index: number, geom: ReplayFootprint): Array<number | null> {
  return [index, geom.halfLenM, geom.halfWidM, geom.zCenterM, geom.bottomYM, geom.panYM ?? null,
    geom.endRise ? geom.endRise.dzM : null, geom.endRise ? geom.endRise.frontM : null, geom.endRise ? geom.endRise.rearM : null];
}

interface RecorderHull extends Omit<SeatControlEntity, 'state'> {
  id: string;
  specId: string;
  team: string;
  isPlayer?: boolean;
  bot?: boolean;
  combat: { hp: number; destroyed?: boolean } | null;
  state: { pos: { x: number; y: number; z: number }; yaw: number; speed: number; turretYaw: number; gunPitch: number } | null;
  contactGeom?: ReplayFootprint | null;
  specialAction?: object | null;
}

export interface RecorderGame {
  tanks: RecorderHull[];
  tankById: Map<string, RecorderHull>;
  player: RecorderHull | null;
  shells: readonly unknown[];
  nextShellId: number;
  timeS: number;
  tick: number;
  rosterSeed: number;
  battleCount: number;
  previousBotSpecIds?: readonly string[] | null;
  recentBotSpecIds?: readonly string[] | null;
  matchSeed?: number | null;
  mapId?: string | null;
  gameMode?: string | null;
  result: string | null;
  resultReason: string | null;
  couch?: unknown;
}

export interface ReplaySetupOptions {
  random?: boolean;
  gameMode?: string | null;
  campaignOperationId?: string | null;
  watch?: boolean;
  couch?: unknown;
  deferVisuals?: boolean;
  deferOpeningRoutes?: boolean;
}

export interface FinishedRecording {
  bytes: Uint8Array;
  header: ReplayHeader;
  end: ReplayEnd;
  seatBytes: number;
  /** The divergence trace, when the battle was recorded with one (replayTrace.ts). */
  trace: ReplayTraceExport | null;
}

export interface ReplayRecorder {
  readonly active: boolean;
  /** A diagnostic: the next battle set up also keeps a divergence trace (replayTrace.ts). Off by default. */
  trace: boolean;
  /**
   * A diagnostic: the recorder's own per-step work (each seat staged, a step written, the footprint scan, a 600th of a
   * checksum) run `iterations` times on the live battle into scratch, the battle and the recording untouched; the
   * milliseconds one step costs. tools/replay-browser-check.mjs times it in blocks, as Chrome's coarse clock cannot time
   * one step.
   */
  probeCost(iterations: number, clock: () => number): number | null;
  beginSetup(game: RecorderGame, playerSpecId: string, options: ReplaySetupOptions): void;
  endSetup(): void;
  beforeStep(): void;
  afterStep(): void;
  wrapRules<TRules extends object>(rules: TRules): TRules;
  recordSeatWrite(kind: string, args: number[]): void;
  onEvent(type: string, payload: unknown): void;
  /** A debug intervention wrote simulation state: the recording replays only up to this step. */
  markStaged(): void;
  /** The battle's recording, or null when none was armed or the battle could not be recorded. Disarms. */
  finish(): FinishedRecording | null;
  /** Drop the battle without a recording (a teardown before it began). */
  cancel(): void;
}

/** Bus events the timeline marks, and how each names its subject. */
const MARKED_EVENTS = new Set(['tank:destroyed', 'shell:hit', 'tank:fire', 'tank:ram', 'battle:ended']);

const record = (value: unknown): Record<string, RuntimeValue> => (value && typeof value === 'object' ? value as Record<string, RuntimeValue> : {});
const str = (value: RuntimeValue | undefined): string => (typeof value === 'string' ? value : '');
const round2 = (value: number): number => Math.round(value * 100) / 100;
let probeChanges = 0;

interface StorageLike { getItem(key: string): string | null }

/**
 * `storageProto` is the Storage prototype whose getItem the recorder taps while setting up or stepping (the page's;
 * null in Node, where there is no storage to read).
 */
export function createReplayRecorder({ storageProto = typeof Storage === 'undefined' ? null : Storage.prototype,
  storage = typeof localStorage === 'undefined' ? null : localStorage as StorageLike, now = () => Date.now() }: {
  storageProto?: StorageLike | null;
  storage?: StorageLike | null;
  now?: () => number;
} = {}): ReplayRecorder {
  let game: RecorderGame | null = null;
  let header: ReplayHeader | null = null;
  let seats: RecorderHull[] = [];
  let controls: SeatControl[] = [];
  let stream: SeatStreamWriter | null = null;
  let actions: ReplayAction[] = [];
  let events: ReplayEventMark[] = [];
  let checksums: Array<[number, string]> = [];
  let footprints = new Map<RecorderHull, ReplayFootprint | null>();
  let rosterIndex = new Map<RecorderHull, number>();
  let stagedAtTick: number | null = null;
  let trace: ReplayTrace | null = null;
  let traceBegun = false;
  let pendingSetup: { playerSpecId: string; options: ReplaySetupOptions; before: Record<string, RuntimeValue> } | null = null;
  let unsupported = false;
  // the storage tap: every value read while setting up or stepping, as first read
  const reads = new Map<string, string | null>();
  let tapping = false;
  if (storageProto && storage) {
    const original = storageProto.getItem;
    storageProto.getItem = function tappedGetItem(this: StorageLike, key: string): string | null {
      const value = original.call(this, key);
      if (tapping && this === storage) {
        if (!reads.has(key)) reads.set(key, value);
        else if (reads.get(key) !== value && game) stagedAtTick ??= game.tick + 1;
      }
      return value;
    };
  }

  function reset(): void {
    game = null; header = null; seats = []; controls = []; stream = null; actions = []; events = []; checksums = [];
    footprints = new Map(); rosterIndex = new Map(); stagedAtTick = null; pendingSetup = null; unsupported = false;
    trace = null; traceBegun = false;
    reads.clear(); tapping = false;
  }

  const seatOf = (owner: unknown): number => {
    if (!owner) return -1;
    for (let i = 0; i < seats.length; i++) {
      const hull = seats[i]!;
      if (owner === hull || owner === hull.combat || owner === hull.state) return i;
    }
    return -1;
  };

  function noteFootprints(): void {
    if (!game) return;
    for (const hull of game.tanks) {
      const geom = hull.contactGeom ?? null;
      if (footprints.get(hull) === geom) continue;
      footprints.set(hull, geom);
      if (geom) actions.push({ tick: game.tick, seat: -1, kind: FOOTPRINT_ACTION, args: footprintArgs(rosterIndex.get(hull) ?? -1, geom) as number[] });
    }
  }

  const recorder: ReplayRecorder = {
    get active() { return !!stream; },
    trace: false,
    probeCost(iterations, clock) {
      if (!stream || !game) return null;
      const scratchControls = seats.map(createSeatControl);
      const scratchStream = new SeatStreamWriter(seats.length);
      const started = clock();
      for (let n = 0; n < iterations; n++) {
        for (let i = 0; i < seats.length; i++) {
          const hull = seats[i]!;
          if (hull.state && hull.input) {
            captureSeatControl(hull as SeatControlEntity, scratchControls[i]!);
            applySeatControl(hull as SeatControlEntity, scratchControls[i]!);
          }
        }
        scratchStream.writeStep(scratchControls);
        // the footprint scan as afterStep makes it (the count only keeps the comparison from being optimised away)
        for (const hull of game.tanks) if (footprints.get(hull) !== (hull.contactGeom ?? null)) probeChanges++;
        if (n % REPLAY_CHECKSUM_EVERY === 0) replayStateDigest(game);
      }
      return (clock() - started) / iterations;
    },
    beginSetup(battle, playerSpecId, options) {
      reset();
      game = battle;
      pendingSetup = {
        playerSpecId,
        options: { ...options },
        before: {
          rosterSeed: battle.rosterSeed,
          battleCount: battle.battleCount,
          previousBotSpecIds: battle.previousBotSpecIds ? [...battle.previousBotSpecIds] : null,
          recentBotSpecIds: battle.recentBotSpecIds ? [...battle.recentBotSpecIds] : null,
          debugFlags: debugRosterFlags(),
        },
      };
      unsupported = !!options.watch || !!options.couch;
      tapping = true;
    },
    endSetup() {
      tapping = false;
      if (!game || !pendingSetup) return;
      const battle = game;
      const player = battle.player;
      if (unsupported || !player?.state) { reset(); return; }
      const roster: ReplayRosterEntry[] = battle.tanks.map((hull, index) => {
        rosterIndex.set(hull, index);
        return { id: hull.id, specId: hull.specId, team: hull.team, bot: hull.bot !== false && !hull.isPlayer };
      });
      seats = [player];
      controls = seats.map(createSeatControl);
      stream = new SeatStreamWriter(seats.length);
      header = {
        format: REPLAY_FORMAT_VERSION,
        build: REPLAY_BUILD,
        replayDigest: REPLAY_DIGEST,
        driver: 'local',
        recordedAtMs: now(),
        setup: {
          ...pendingSetup.before,
          playerSpecId: pendingSetup.playerSpecId,
          mapId: battle.mapId ?? null,
          gameMode: battle.gameMode ?? null,
          seed: battle.matchSeed ?? null,
          options: { ...pendingSetup.options, couch: null } as unknown as RuntimeValue,
          storage: null,
        },
        roster,
        seats: seats.map((hull) => hull.id),
      };
      footprints = new Map(battle.tanks.map((hull) => [hull, null]));
      noteFootprints();
      pendingSetup = null;
      trace = recorder.trace ? createReplayTrace() : null;
    },
    beforeStep() {
      if (!stream || !game) return;
      // a step that ran without the recorder (a debug fast-forward stepping simStep itself) has no seat row: the
      // recording replays only up to it
      if (game.tick !== stream.steps) stagedAtTick ??= stream.steps + 1;
      for (let i = 0; i < seats.length; i++) {
        const hull = seats[i]!, control = controls[i]!;
        if (hull.state && hull.input) {
          const seated = hull as SeatControlEntity;
          captureSeatControl(seated, control);
          applySeatControl(seated, control);
        }
      }
      stream.writeStep(controls);
      // the trace's first dump: the battle as step 1 meets it, its seat staged (replay-diff takes it at the same point)
      if (trace && !traceBegun) { traceBegun = true; trace.begin(game as never); }
      tapping = true;
    },
    afterStep() {
      if (!stream || !game) return;
      tapping = false;
      noteFootprints();
      if (game.tick % REPLAY_CHECKSUM_EVERY === 0) checksums.push([game.tick, replayStateDigest(game)]);
      trace?.afterStep(game as never);
    },
    wrapRules(rules) {
      return wrapRecordedRules(rules as never, seatOf, (seat, kind, args) => {
        if (stream && game) actions.push({ tick: game.tick + 1, seat, kind, args });
      }) as typeof rules;
    },
    recordSeatWrite(kind, args) {
      if (!stream || !game || kind !== PREVIOUS_SHELL_SLOT) return;
      actions.push({ tick: game.tick + 1, seat: 0, kind, args: [...args] });
    },
    onEvent(type, payload) {
      if (!stream || !game) return;
      const tick = game.tick;
      const data = record(payload);
      if (type.startsWith('mode:')) {
        const subject = str(data.id) || str(data.team) || str(data.entityId);
        events.push([tick, type.slice(5), subject, str(data.byId) || str(data.attackerId), round2(Number(data.x) || 0), round2(Number(data.z) || 0)]);
        return;
      }
      if (!MARKED_EVENTS.has(type)) return;
      const at = (id: string): [number, number] => {
        const pos = game!.tankById.get(id)?.state?.pos;
        return pos ? [round2(pos.x), round2(pos.z)] : [0, 0];
      };
      switch (type) {
        case 'tank:destroyed': {
          const id = str(data.id);
          events.push([tick, `kill:${str(data.cause) || 'shot'}`, id, str(data.killerId), ...at(id)]);
          return;
        }
        case 'shell:hit': {
          const target = str(data.targetId);
          if (!target) return;
          const pos = Array.isArray(data.pos) ? data.pos as number[] : null;
          events.push([tick, `hit:${str(data.kind)}`, target, str(data.attackerId),
            pos ? round2(pos[0] ?? 0) : at(target)[0], pos ? round2(pos[2] ?? 0) : at(target)[1]]);
          return;
        }
        case 'tank:fire':
          if (data.burning === true) events.push([tick, 'fire', str(data.id), '', ...at(str(data.id))]);
          return;
        case 'tank:ram':
          events.push([tick, 'ram', str(data.aId), str(data.bId), ...at(str(data.aId))]);
          return;
        case 'battle:ended':
          events.push([tick, 'end', '', '', 0, 0]);
          return;
      }
    },
    markStaged() {
      if (stream && game) stagedAtTick ??= game.tick + 1;
    },
    finish() {
      if (!stream || !game || !header) { reset(); return null; }
      tapping = false;
      header.setup.storage = Object.fromEntries(reads) as unknown as RuntimeValue;
      const end: ReplayEnd = { ticks: game.tick, result: game.result ?? null, reason: game.resultReason ?? null, stagedAtTick };
      const seatBytes = stream.take();
      const bytes = encodeReplay({ header, seats: seatBytes, actions, events, checksums, end });
      const done = { bytes, header, end, seatBytes: seatBytes.length, trace: trace ? trace.export() : null };
      reset();
      return done;
    },
    cancel() { reset(); },
  };
  return recorder;
}

/** The debug roster flags setup honours (rosterState soloDebugFlags), as a recording keeps them. */
function debugRosterFlags(): RuntimeValue {
  const flags = (globalThis as { __DEBUG?: { flags?: Record<string, RuntimeValue> } }).__DEBUG?.flags;
  if (!flags || !Array.isArray(flags.forceRoster) || !flags.forceRoster.length) return null;
  return JSON.parse(JSON.stringify(flags)) as RuntimeValue;
}
