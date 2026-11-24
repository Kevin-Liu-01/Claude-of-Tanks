/**
 * The local driver's replayer (replay-system-275, docs/REPLAY.md §4): a recording re-simulated headless, a step at a time.
 * tools/replay-verify.mjs runs it in Node; the viewer's indexer Worker (P2) runs it off the page. It never renders:
 * every hull wears a stub visual (the shot leaves the simulated barrel, sim/gunPose.ts), the contact footprints come from
 * the recording, and the stored choices setup read (loadout, difficulty, arrangement, brains, paint, consumables) come
 * from the recording's storage map through a localStorage stand-in installed for the run.
 *
 * Before each step k: the recorded actions before it, then each seat's controls (sim/seatControl.ts applySeatControl),
 * then state.ts simStep, as the page ran them (game/replay/replayRecorder.ts). Every REPLAY_CHECKSUM_EVERY steps the
 * state digest is compared with the recording's; the first mismatch ends the run with `mismatch` set.
 */
import { Group } from 'three';
import { REPLAY_CHECKSUM_EVERY, type ReplayAction, type ReplayRecording } from '../../sim/replayFormat.ts';
import { applySeatControl } from '../../sim/seatControl.ts';
import { selectShell, repairAllModules, startMagazineReload } from '../../sim/damage.ts';
import { activateSpecialAction } from '../../sim/specialActions.ts';
import { requestTankSelfRight } from '../../sim/rollover.ts';
import { requestTankJump } from '../../sim/movement.ts';
import { pressSelfRight, requestHullAirSpin, requestHullTurbo } from '../../sim/modeMoves.ts';
import type { RuntimeValue } from '../../runtimeTypes.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from '../state.ts';
import { spawnTanks } from '../rosterState.ts';
import { useSoloConsumable } from '../soloConsumables.ts';
import { replayStateDigest } from './replayChecksum.ts';
import { replayRefusal } from './replayBuild.ts';
import { FOOTPRINT_ACTION } from './replayRecorder.ts';
import { replaySeatAction } from './seatActions.ts';
import { installRecordedStorage, rosterMismatch, runRecordedSetup } from './replaySetup.ts';
import { ensureAuthorityFleet, requireAuthorityFleet } from '../../vehicles/authorityFleet.ts';

/* The page's battle types are wide; the runner reads them through these. */
type RunGame = ReturnType<typeof createGameState> & Record<string, RuntimeValue>;
type RunWorld = Parameters<typeof setupBattle>[2];
type RunHull = { id: string; specId: string; team: string; state: object | null; combat: object | null; input: object; spec: object;
  visual?: object | null; contactGeom?: object | null; specialAction?: object | null };

export class ReplayMismatch extends Error {
  readonly code: 'refused' | 'roster' | 'checksum' | 'seat';
  readonly tick: number;
  constructor(code: ReplayMismatch['code'], message: string, tick = 0) {
    super(message);
    this.code = code;
    this.tick = tick;
    this.name = 'ReplayMismatch';
  }
}

export interface ReplayRun {
  readonly game: RunGame;
  readonly bus: ReturnType<typeof createBus>;
  /** Steps run so far (the game's tick). */
  readonly tick: number;
  /** The last step this recording can replay (its end, or the step before a debug intervention). */
  readonly lastTick: number;
  /** Step once; false when the recording is spent or the run stopped on a mismatch. */
  step(): boolean;
  readonly mismatch: ReplayMismatch | null;
  /** Release the localStorage stand-in. */
  dispose(): void;
}

/** The recorded rules' implementations (seatActions.ts RECORDED_RULES; seatActions.selftest.mjs keeps the two equal). */
const RULES = { selectShell, repairAllModules, startMagazineReload, activateSpecialAction, useSoloConsumable, requestTankSelfRight,
  requestTankJump, pressSelfRight, requestHullTurbo, requestHullAirSpin };

function stubVisual(): object {
  return { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {}, resetDestroyed() {} };
}

function applyFootprint(game: RunGame, action: ReplayAction): void {
  const [index, halfLenM, halfWidM, zCenterM, bottomYM, panYM, dzM, frontM, rearM] = action.args as Array<number | null>;
  const hull = (game.tanks as unknown as RunHull[])[index ?? -1];
  if (!hull) throw new ReplayMismatch('roster', `replay: no hull at roster index ${index}`, action.tick);
  hull.contactGeom = { halfLenM, halfWidM, zCenterM, bottomYM, panYM: panYM ?? null,
    endRise: dzM == null ? null : { dzM, frontM, rearM } };
}

/** A dedicated collision world given the page's spawn points, exactly as world/map.ts derives them from the layout. */
export function withLayoutSpawnPoints<TWorld extends { heightField: { getHeightAt(x: number, z: number): number } }>(world: TWorld): TWorld {
  const field = world.heightField as { getHeightAt(x: number, z: number): number; _layout: { spawns: {
    player: { x: number; z: number; yaw?: number }; enemies: Array<{ x: number; z: number; yaw?: number }> } } };
  const sp = field._layout.spawns;
  (world as TWorld & { spawnPoints: unknown }).spawnPoints = {
    player: { pos: [sp.player.x, field.getHeightAt(sp.player.x, sp.player.z), sp.player.z], yaw: sp.player.yaw },
    enemies: sp.enemies.map((e) => ({ pos: [e.x, field.getHeightAt(e.x, e.z), e.z], yaw: e.yaw })),
  };
  return world;
}

/**
 * The recording's fleet, its combat anatomy finalized (the published track contact the movement solve reads, the derived
 * modules, the roof gun): what the page's hulls carried. A spec left unfinalized steps differently from the first settle
 * on (the first browser check's drift: a Node replay that finalized three ids). Await before createReplayRun.
 */
export function ensureReplayFleet(recording: ReplayRecording): Promise<void> {
  return ensureAuthorityFleet(recording.header.roster.map((entry) => entry.specId));
}

export interface ReplayRunHooks {
  /** A diagnostic's look at each step as the core meets it: its actions applied and its seats staged (tools/replay-diff.mjs). */
  beforeSimStep?(game: RunGame, tick: number): void;
  /** The build this replayer stands for (replayBuild.ts; its own define by default): a receipt or tool acting as a release. */
  localDigest?: string;
}

/** A replay of `recording` on `world` (the recording's map, built by the caller), set up and ready for step 1. */
export function createReplayRun(recording: ReplayRecording, world: RunWorld, hooks: ReplayRunHooks = {}): ReplayRun {
  const { header } = recording;
  const refusal = replayRefusal(header.replayDigest, header.build, hooks.localDigest);
  if (refusal) throw new ReplayMismatch('refused', `replay recorded on ${refusal.recordedOn || 'another version'}`);
  const setup = header.setup as Record<string, RuntimeValue>;
  // every hull's spec finalized as the page's were, or no run (ensureReplayFleet loads them)
  requireAuthorityFleet(header.roster.map((entry) => entry.specId));
  // stepping reads storage too, so the stand-in stays for the whole run (dispose releases it)
  const releaseStorage = installRecordedStorage(header);
  try {
    const game = createGameState({ rosterSeed: Number(setup.rosterSeed) }) as RunGame;
    game.mapId = setup.mapId as string;
    spawnTanks(game as never, { scene: { remove() {} } } as never);
    for (const hull of game.allTanks as unknown as RunHull[]) if (hull) hull.visual = stubVisual();
    runRecordedSetup(game, header, (playerSpecId, options) => setupBattle(game as never, playerSpecId, world, {
      ...options, deferVisuals: true, deferCamoRepaint: true,
    }), { storage: 'caller' });
    const tanks = game.tanks as unknown as RunHull[];
    for (const hull of tanks) hull.visual ??= stubVisual();
    const mismatchedRoster = rosterMismatch(tanks, header);
    if (mismatchedRoster) throw new ReplayMismatch('roster', mismatchedRoster);
    const seats = header.seats.map((id) => {
      const hull = game.tankById.get(id) as unknown as RunHull | undefined;
      if (!hull) throw new ReplayMismatch('seat', `replay: no seated hull ${id}`);
      return hull;
    });
    const bus = createBus(() => {});
    const collider = createCollider(game as never, world as never);
    const checksums = new Map(recording.checksums);
    const actionsByTick = new Map<number, ReplayAction[]>();
    for (const action of recording.actions) {
      const list = actionsByTick.get(action.tick);
      if (list) list.push(action); else actionsByTick.set(action.tick, [action]);
    }
    const end = recording.end;
    const lastTick = Math.min(recording.seatSteps.length, end.stagedAtTick != null ? end.stagedAtTick - 1 : Infinity);
    let mismatch: ReplayMismatch | null = null;
    // actions noted after setup (a footprint the lent player visual published) precede step 1
    for (const action of actionsByTick.get(0) ?? []) if (action.kind === FOOTPRINT_ACTION) applyFootprint(game, action);
    return {
      game,
      bus,
      get tick() { return game.tick; },
      lastTick,
      get mismatch() { return mismatch; },
      step() {
        if (mismatch || game.tick >= lastTick) return false;
        const k = game.tick + 1;
        for (const action of actionsByTick.get(k) ?? []) {
          if (action.kind === FOOTPRINT_ACTION) applyFootprint(game, action);
          else replaySeatAction(action, seats[action.seat] as never, { rules: RULES, bus, timeS: game.timeS });
        }
        const row = recording.seatSteps[k - 1]!;
        for (let i = 0; i < seats.length; i++) {
          const hull = seats[i]!;
          if (hull.state && hull.input) applySeatControl(hull as never, row[i]!);
        }
        hooks.beforeSimStep?.(game, k);
        simStep(game as never, bus, world as never, null, collider);
        if (k % REPLAY_CHECKSUM_EVERY === 0) {
          const expected = checksums.get(k);
          const got = replayStateDigest(game as never);
          if (expected && expected !== got) {
            mismatch = new ReplayMismatch('checksum', `replay drifted at step ${k} (${got} vs recorded ${expected})`, k);
            return false;
          }
        }
        return true;
      },
      dispose: releaseStorage,
    };
  } catch (error) {
    releaseStorage();
    throw error;
  }
}
