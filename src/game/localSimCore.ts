/**
 * The local Worker driver's core end (docs/ARCHITECTURE.md "One core, two drivers"): a local battle's own step
 * (game/state.ts simStep, the step the page runs) at 60 Hz off the page's main thread. It seats the page's battle with the
 * page's own setup inputs (setupBattle, the same roster and spawns), on the battlefield's collision world and the world
 * kernels, applies the player's input the page posted at its next tick, and posts every tick's whole state for the page
 * to draw (localSimProtocol.ts). What the step does to the drawn world (a hull's death, a recoil, a camera's shake, a
 * crushed prop) is logged in order with the tick's events, for the page to replay on its own.
 *
 * No prediction, no reconciliation, no snapshots, no rooms: nothing from src/mp. When the thread falls behind, game
 * time slows (at most two steps a wake, the rest of the debt dropped); it never jumps. No DOM: a Worker in the browser,
 * in-process in the receipts. A control the player changes is stepped at once (the cadence then runs on from that tick):
 * the input waits for no tick, and game time keeps its 60 ticks a second.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import * as detMath from '../sim/detMath.ts';
import { launcherMuzzleIndex } from '../sim/launcherPolicy.ts';
import { activateSpecialAction } from '../sim/specialActions.ts';
import { magazineReloadDenialReason, startMagazineReload } from '../sim/damage.ts';
import { requestTankSelfRight } from '../sim/rollover.ts';
import { requestTankJump } from '../sim/movement.ts';
import { CONSUMABLE_SLOTS } from '../sim/consumableRules.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { createBus, createCollider, createGameState, setupBattle, setSoloWorldKernels, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { useSoloConsumable } from './soloConsumables.ts';
import { createMirrorWriter, createStringTable, type MirrorWriter } from './localSimMirror.ts';
import {
  BLOCK, CONCEALMENT_FIELDS, HULL, LOCAL_INPUT, LOCAL_SIM_MAX_IN_FLIGHT, LOCAL_SIM_MAX_STEPS_PER_WAKE, LOCAL_SIM_TICK_MS, SHELL,
  type LocalSimAction, type LocalSimBodies, type LocalSimBoot, type LocalSimTick, type LocalSimToPage, type PageToLocalSim,
} from './localSimProtocol.ts';

/** The Worker's end of the channel. */
export interface LocalSimPort {
  post(message: LocalSimToPage, transfer?: Transferable[]): void;
  onMessage(listener: (message: PageToLocalSim) => void): () => void;
}

/** The battlefield the step runs on (the collision world: world/collisionWorldLoad.ts, or a receipt's). */
type LocalSimWorld = Parameters<typeof setupBattle>[2];

export interface LocalSimCoreOptions {
  port: LocalSimPort;
  /** The battlefield for a boot (the browser: the served collision manifest). */
  buildWorld(boot: LocalSimBoot): Promise<LocalSimWorld>;
  /** The world kernels' provider (game/state.ts setSoloWorldKernels), or null to run the TypeScript. */
  loadKernels?: () => Promise<Parameters<typeof setSoloWorldKernels>[0]>;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface LocalSimCore {
  /** The Worker's battle (receipts read it). */
  readonly game: ReturnType<typeof createGameState> | null;
  readonly tick: number;
  /** Step one tick now and post it (receipts drive the clock themselves). */
  stepOnce(): void;
  dispose(): void;
}

type Entity = {
  id: string; specId: string; team: string; isPlayer?: boolean; spec: GunSpecHolder; visual: unknown;
  contactGeom?: unknown; state: { pos: Vector3; yaw: number; visualPitch: number; visualRoll: number; turretYaw: number;
    gunPitch: number; modeScale?: number };
  combat: { destroyed?: boolean; launcherCursor?: number } & Record<string, unknown>;
  input: { throttle: number; steer: number; brake: boolean; fire: boolean; shellSlot: number; aimPoint?: Vector3;
    aimLocked: boolean; actionBits?: number; auxiliaryBits?: number };
  modeJumpMps?: number | null; modeGravityScale?: number;
};
type GunSpecHolder = {
  dims: { heightM: number };
  armor?: { turretPivot?: number[]; gunPivot?: number[]; gunBarrel?: { lengthM?: number } } | null;
  gun: { launcherMuzzles?: readonly { x: number; y: number; z: number; pitch?: number; yaw?: number; frame?: string }[];
    shells: unknown[] };
};

const _euler = new Euler(), _quat = new Quaternion(), _unit = new Vector3(), _hull = new Matrix4(), _local = new Matrix4();
const _turret = new Matrix4();

/**
 * The gun's muzzle and bore as the authority poses them (sim/authoritativeMatch.ts gunWorldPose): the Worker has no drawn
 * barrel, so its hulls fire from where the online driver's authority fires them, the launchers' tubes included.
 */
export function headlessGunPose(entity: Entity, muzzleOut: Vector3 | null, dirOut: Vector3 | null, muzzleIndex?: number, launchers?: boolean): void {
  const s = entity.state, armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const lengthM = armor.gunBarrel?.lengthM;
  const barrelM = Math.max(0.5, typeof lengthM === 'number' && Number.isFinite(lengthM) ? lengthM : 3);
  const scale = s.modeScale ?? 1;
  _euler.set(-s.visualPitch, s.yaw, s.visualRoll, 'YXZ');
  _quat.setFromEuler(_euler);
  _unit.setScalar(scale);
  _hull.compose(s.pos, _quat, _unit);
  _local.makeRotationY(s.turretYaw);
  _local.setPosition(turretPivot[0]!, turretPivot[1]!, turretPivot[2]!);
  _turret.multiplyMatrices(_hull, _local);
  const sinPitch = detMath.sin(s.gunPitch), cosPitch = detMath.cos(s.gunPitch);
  const tubes = launchers ? entity.spec.gun.launcherMuzzles : undefined;
  const tip = tubes?.length ? tubes[muzzleIndex !== undefined && muzzleIndex >= 0 ? muzzleIndex % tubes.length
    : launcherMuzzleIndex(entity.spec.gun as never, undefined, entity.combat.launcherCursor ?? 0)] : undefined;
  if (!tip) {
    const dir = dirOut ?? _scratchDir;
    dir.set(0, sinPitch, cosPitch).transformDirection(_turret).normalize();
    muzzleOut?.set(gunPivot[0]!, gunPivot[1]!, gunPivot[2]!).applyMatrix4(_turret).addScaledVector(dir, barrelM * scale);
    return;
  }
  const mouthPitch = tip.pitch ?? 0, mouthYaw = tip.yaw ?? 0;
  const dir = dirOut ?? _scratchDir;
  dir.set(detMath.sin(mouthYaw) * detMath.cos(mouthPitch), detMath.sin(mouthPitch), detMath.cos(mouthYaw) * detMath.cos(mouthPitch));
  const muzzle = muzzleOut ?? _scratchMuzzle;
  muzzle.set(tip.x, tip.y, tip.z);
  if (tip.frame !== 'turret') {
    muzzle.set(gunPivot[0]! + tip.x, gunPivot[1]! + tip.y * cosPitch + tip.z * sinPitch, gunPivot[2]! - tip.y * sinPitch + tip.z * cosPitch);
    const dy = dir.y, dz = dir.z;
    dir.y = dy * cosPitch + dz * sinPitch;
    dir.z = -dy * sinPitch + dz * cosPitch;
  }
  muzzle.applyMatrix4(_turret);
  dir.transformDirection(_turret);
}
const _scratchDir = new Vector3(), _scratchMuzzle = new Vector3();

/** A Map-backed Storage for the Worker (the setup reads the player's loadout and settings through it). */
function installStorage(entries: readonly [string, string][]): void {
  const scope = globalThis as { localStorage?: unknown; document?: unknown };
  if (typeof scope.document !== 'undefined') return;
  const values = new Map(entries);
  scope.localStorage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => { values.clear(); },
  };
}

const AUXILIARY_BITS: Partial<Record<LocalSimAction, number>> = {
  smoke: 64, lights: 128, roofGun: 256, lightsOff: 512, drone: 1024, supplyAmmo: 2048, supplyHeal: 4096,
};

export function createLocalSimCore({
  port,
  buildWorld,
  loadKernels,
  now = () => (typeof performance === 'object' ? performance.now() : Date.now()),
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: LocalSimCoreOptions): LocalSimCore {
  let disposed = false;
  let game: ReturnType<typeof createGameState> | null = null;
  let world: LocalSimWorld | null = null;
  let entities: Entity[] = [];
  let player: Entity | null = null;
  let bus: ReturnType<typeof createBus> | null = null;
  let collider: ReturnType<typeof createCollider> | null = null;
  let tick = 0;
  let running = false;
  let timer: unknown = null;
  let nextAt = 0;
  const writers: MirrorWriter[] = [];
  const strings = createStringTable();
  const specIds = new Map<object, number>();
  let specsAdded: (number | unknown)[] | null = null;
  let log: unknown[] | null = null;
  let lastResult = '';
  let lastMode = '';
  // the player's input, as posted; the fire press and the action bits latch until a tick takes them
  const input = new Float64Array(LOCAL_INPUT.length);
  let fireLatched = false;
  let actionBitsLatched = 0;
  let auxiliaryBitsPending = 0;
  let inputSeen = false;
  // the player's reload progress, as the step emitted it this tick
  const reload = { present: false, t: 0, total: 0, progress: 0, kind: 'ready', caliberMm: 0, magazineRounds: 0, magazineCapacity: 0, done: false };
  const freeBuffers: ArrayBuffer[] = [];
  // ticks posted and not yet drawn (their buffers not back): the page's pace bounds the Worker's
  let inFlight = 0;
  const epoch = typeof performance === 'object' && Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : 0;
  let scratch = new Float64Array(1024);
  const pose = new Float64Array(7);
  const obstacleIndex = new Map<object, number>();
  const entityIndexById = new Map<string, number>();
  const transfer: Transferable[] = [];

  const post = (message: LocalSimToPage, transferList?: Transferable[]): void => { if (!disposed) port.post(message, transferList); };
  const record = (entry: unknown[]): void => { (log ??= []).push(entry); };

  // ---- the hulls' drawn side, headless: the gun pose, and every call the step makes on it, logged for the page ----
  function headlessVisual(entity: Entity, index: () => number) {
    const call = (method: string, args: unknown[]) => record(['v', index(), method, args]);
    return {
      root: { visible: true },
      contactGeom: null as unknown,
      trackWidthM: null as number | null,
      gunMuzzleWorld: (out: Vector3, muzzleIndex?: number, launchers?: boolean) => { headlessGunPose(entity, out, null, muzzleIndex, launchers); return out; },
      gunDirWorld: (out: Vector3, muzzleIndex?: number, launchers?: boolean) => { headlessGunPose(entity, null, out, muzzleIndex, launchers); return out; },
      recoilKick: (...args: unknown[]) => call('recoilKick', args),
      setDestroyed: (...args: unknown[]) => call('setDestroyed', args),
      resetDestroyed: (...args: unknown[]) => call('resetDestroyed', args),
      setVisible: (...args: unknown[]) => call('setVisible', args),
      // (the page syncs its model from its own mirrored state)
      syncFromState: () => call('syncFromState', []),
      dispose() {},
    };
  }
  const rig = {
    addTrauma: (amount: number) => record(['r', 'addTrauma', [amount]]),
    recoilKick: (pitch: number, scale: number) => record(['r', 'recoilKick', [pitch, scale]]),
  };

  function onEmit(event: string, payload: unknown): void {
    if (event === 'player:reload') {
      const p = payload as typeof reload;
      reload.present = true; reload.t = p.t; reload.total = p.total; reload.progress = p.progress; reload.kind = p.kind;
      reload.caliberMm = p.caliberMm; reload.magazineRounds = p.magazineRounds; reload.magazineCapacity = p.magazineCapacity; reload.done = p.done;
      return;
    }
    let copy: unknown;
    try { copy = structuredClone(payload); } catch { copy = null; }
    (log ??= []).push(['e', event, copy]);
  }

  // ---- boot: the page's battle, seated the page's way ----
  async function boot(seat: LocalSimBoot): Promise<void> {
    const started = now();
    installStorage(seat.storage);
    let kernels: 'wasm' | 'ts' = 'ts';
    if (seat.kernels && loadKernels) {
      try { setSoloWorldKernels(await loadKernels()); kernels = 'wasm'; } catch { setSoloWorldKernels(null); }
    } else setSoloWorldKernels(null);
    const worldStarted = now();
    const built = await buildWorld(seat);
    const worldMs = now() - worldStarted;
    const fleetStarted = now();
    await ensureFullFleet();
    const fleetMs = now() - fleetStarted;
    if (disposed) return;
    const setupStarted = now();
    world = built;
    (world as { spawnPoints?: unknown }).spawnPoints = seat.spawnPoints;
    const next = createGameState({ rosterSeed: seat.seed.rosterSeed }) as ReturnType<typeof createGameState> & Record<string, unknown>;
    next.mapId = seat.mapId;
    spawnTanks(next as never, { scene: { add() {}, remove() {} } } as never);
    const all = next.allTanks as unknown as Entity[];
    const indexOf = new Map<Entity, number>();
    for (const entity of all) entity.visual = headlessVisual(entity, () => indexOf.get(entity) ?? -1);
    next.battleCount = seat.seed.battleCount;
    next.recentBotSpecIds = seat.seed.recentBotSpecIds as never;
    next.previousBotSpecIds = seat.seed.previousBotSpecIds as never;
    setupBattle(next as never, seat.specId, world, {
      random: seat.random, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false,
      ...(seat.gameMode === 'standard' ? {} : { gameMode: seat.gameMode }),
    });
    game = next;
    entities = next.tanks as unknown as Entity[];
    entityIndexById.clear();
    entities.forEach((entity, index) => { indexOf.set(entity, index); entityIndexById.set(entity.id, index); });
    player = entities.find((entity) => entity.isPlayer) ?? null;
    // the page's hulls, in the page's order, or the page keeps its own step
    let mismatch: string | null = null;
    if (entities.length !== seat.roster.length) mismatch = `roster size ${entities.length} != page ${seat.roster.length}`;
    else {
      for (let index = 0; index < entities.length && !mismatch; index++) {
        const mine = entities[index]!, page = seat.roster[index]!;
        if (mine.id !== page.id || mine.specId !== page.specId || mine.team !== page.team) {
          mismatch = `roster ${index}: ${mine.id}/${mine.specId}/${mine.team} != page ${page.id}/${page.specId}/${page.team}`;
        }
      }
    }
    for (const entity of entities) entity.input.aimPoint ??= new Vector3();
    bus = createBus(onEmit);
    collider = createCollider(next as never, world);
    next.preBattleS = 0;
    obstacleIndex.clear();
    world.getObstacles().forEach((record, index) => obstacleIndex.set(record, index));
    // a crushed prop on this world is the page's to topple on its own (its index and where it stood)
    const worldCrush = (world as { crushObstacle?: (record: object, ...rest: unknown[]) => boolean }).crushObstacle;
    if (worldCrush) {
      (world as { crushObstacle?: unknown }).crushObstacle = (target: { min: number[]; max: number[] } | null, dx = 0, dz = 1, speedMps = 0, cause = 'ram', ...rest: unknown[]) => {
        const crushed = worldCrush.call(world, target as object, dx, dz, speedMps, cause, ...rest);
        if (target) {
          record(['c', obstacleIndex.get(target) ?? -1, dx, dz, speedMps, cause,
            (target.min[0]! + target.max[0]!) * 0.5, (target.min[2]! + target.max[2]!) * 0.5]);
        }
        return crushed;
      };
    }
    writers.length = 0;
    for (let index = 0; index < entities.length; index++) writers.push(createMirrorWriter());
    tick = 0;
    log = null;
    const ready: LocalSimToPage = {
      type: 'ready', kernels, mismatch,
      ms: { world: Math.round(worldMs), fleet: Math.round(fleetMs), setup: Math.round(now() - setupStarted), total: Math.round(now() - started) },
    };
    post(ready);
  }

  /** What each drawn model measured that the step reads (contact geometry, track width): the step re-derives from it. */
  function applyBodies(bodies: LocalSimBodies): void {
    entities.forEach((entity, index) => {
      const body = bodies[index];
      const visual = entity.visual as ReturnType<typeof headlessVisual>;
      visual.contactGeom = body?.contactGeom ?? null;
      visual.trackWidthM = body?.trackWidthM ?? null;
      entity.contactGeom = null;
    });
  }

  /** Whether a posted input changes a control (drive, steer, brake, fire, the round, an action), not only the aim. */
  function controlsChanged(next: Float64Array): boolean {
    return next[LOCAL_INPUT.throttle] !== input[LOCAL_INPUT.throttle] || next[LOCAL_INPUT.steer] !== input[LOCAL_INPUT.steer]
      || next[LOCAL_INPUT.brake] !== input[LOCAL_INPUT.brake] || next[LOCAL_INPUT.fire] !== input[LOCAL_INPUT.fire]
      || next[LOCAL_INPUT.shellSlot] !== input[LOCAL_INPUT.shellSlot] || next[LOCAL_INPUT.actionBits] !== input[LOCAL_INPUT.actionBits];
  }

  // ---- input and actions ----
  function applyInput(): void {
    if (!player || !inputSeen) return;
    const into = player.input;
    into.throttle = input[LOCAL_INPUT.throttle]!;
    into.steer = input[LOCAL_INPUT.steer]!;
    into.brake = input[LOCAL_INPUT.brake] !== 0;
    into.fire = fireLatched || input[LOCAL_INPUT.fire] !== 0;
    into.shellSlot = input[LOCAL_INPUT.shellSlot]! | 0;
    into.aimLocked = input[LOCAL_INPUT.aimLocked] !== 0;
    into.actionBits = actionBitsLatched | (input[LOCAL_INPUT.actionBits]! | 0);
    into.aimPoint!.set(input[LOCAL_INPUT.aimX]!, input[LOCAL_INPUT.aimY]!, input[LOCAL_INPUT.aimZ]!);
    if (auxiliaryBitsPending) {
      into.auxiliaryBits = auxiliaryBitsPending;
      auxiliaryBitsPending = 0;
    }
    fireLatched = false;
    actionBitsLatched = 0;
  }

  function emitUi(event: string, payload: unknown): void { (log ??= []).push(['e', event, payload]); }

  /** A player's action, as the page's battle actions apply it on their own step (playerBattleActions' solo branches). */
  function act(action: LocalSimAction): void {
    if (!player || !game || player.combat.destroyed) return;
    const bit = AUXILIARY_BITS[action];
    if (bit !== undefined) {
      let pending = player.input.auxiliaryBits || 0;
      if (action === 'lights' || action === 'lightsOff') pending &= ~(128 | 512);
      auxiliaryBitsPending = action === 'roofGun' ? pending ^ bit : pending | bit;
      return;
    }
    if (action === 'reloadMagazine') {
      const combat = player.combat as never;
      const reason = magazineReloadDenialReason?.(combat) || null;
      const started = !reason && startMagazineReload(combat, player.spec as never);
      emitUi(started ? 'ui:magazineReloadStarted' : 'ui:magazineReloadDenied', { reason: reason || 'NO_MAGAZINE' });
      return;
    }
    if (action === 'specialAction') {
      const result = activateSpecialAction(player as never) as { ok: boolean; slot?: number | null };
      if (result.ok && result.slot != null) emitUi('ui:shellSelectionChanged', { slot: result.slot });
      emitUi(result.ok ? 'ui:specialActionResult' : 'ui:specialActionDenied', result);
      return;
    }
    if (action === 'selfRight') {
      const state = player.state as never;
      if (!requestTankSelfRight(state, player.modeGravityScale ?? 1)) {
        if (player.modeJumpMps != null && requestTankJump(state, player.modeJumpMps, player.modeGravityScale ?? 1)) {
          emitUi('tank:jump', { id: player.id });
        }
        return;
      }
      emitUi('tank:selfRight', { id: player.id });
    }
  }

  function consume(slot: number): void {
    if (!player || !game || player.combat.destroyed || !Number.isInteger(slot) || slot < 0 || slot >= CONSUMABLE_SLOTS) return;
    const use = useSoloConsumable(player as never, bus as never, slot, game.timeS) as {
      ok: boolean; reason?: string; item?: string; remainingS?: number; cooldownS?: number; readyAt?: number; charges?: number };
    if (!use.ok) {
      emitUi('ui:consumableDenied', { slot, reason: use.reason, ...(use.item ? { item: use.item } : {}),
        ...(use.remainingS !== undefined ? { remainingS: use.remainingS } : {}) });
      return;
    }
    emitUi('ui:consumableUsed', { slot, ok: true, item: use.item, cooldownS: use.cooldownS, readyAt: use.readyAt, charges: use.charges });
  }

  // ---- the tick ----
  function acquire(doubles: number): Float64Array {
    const bytes = doubles * 8;
    for (let index = freeBuffers.length - 1; index >= 0; index--) {
      const buffer = freeBuffers[index]!;
      if (buffer.byteLength < bytes) continue;
      freeBuffers[index] = freeBuffers[freeBuffers.length - 1]!;
      freeBuffers.length--;
      return new Float64Array(buffer);
    }
    return new Float64Array(Math.max(65536, Math.ceil(doubles / 65536) * 65536));
  }

  function shellSpecId(spec: object | null | undefined): number {
    if (!spec) return -1;
    let id = specIds.get(spec);
    if (id === undefined) {
      id = specIds.size;
      specIds.set(spec, id);
      let copy: unknown;
      try { copy = structuredClone(spec); } catch { copy = { name: (spec as { name?: string }).name, type: (spec as { type?: string }).type }; }
      (specsAdded ??= []).push(id, copy);
    }
    return id;
  }

  // hot-path: every Worker tick
  function stepAndPost(): void {
    if (!game || !world || !bus || !collider) return;
    applyInput();
    reload.present = false;
    simStep(game as never, bus, world, rig, collider);
    tick++;
    const live = game as unknown as { timeS: number; resultTimeS: number | null; result: unknown; resultReason: unknown;
      shells: { id: number; shooterId: string; spec: object; isPlayer?: boolean; pos: Vector3; prevPos: Vector3; vel: Vector3;
        ageS: number; distM: number; dead: boolean; rocket?: boolean; bounces?: number; remainingPenMm?: number;
        gravityMps2?: number; penRollDone?: boolean; carriedThrough?: boolean; dmgRoll?: number }[];
      spotting: { isSpotted(id: string, team: string, receiver?: unknown): boolean; getConcealment(entity: unknown, timeS: number): Record<string, number | boolean> } | null;
      _wreckTurrets?: { framePose(id: string, out: Float64Array): boolean; settled(id: string): boolean } | null;
      matchModeState: unknown };
    // each hull's leaves into the scratch first (their count is the schema's)
    let schemas: LocalSimTick['schemas'] = null;
    let sets: LocalSimTick['sets'] = null;
    let leafTotal = 0;
    for (let index = 0; index < entities.length; index++) leafTotal += Math.max(writers[index]!.leaves, 64) + 64;
    if (scratch.length < leafTotal * 2) scratch = new Float64Array(leafTotal * 2);
    let used = 0;
    const counts = _counts;
    counts.length = entities.length;
    for (let index = 0; index < entities.length; index++) {
      const writer = writers[index]!;
      let count = writer.write(entities[index]!, scratch, used, strings);
      if (used + count > scratch.length) {
        const grown = new Float64Array((used + count) * 2);
        grown.set(scratch.subarray(0, used));
        scratch = grown;
        count = writer.write(entities[index]!, scratch, used, strings);
      }
      if (writer.schemaChanged) (schemas ??= []).push(index, writer.schema(entities[index]!));
      const moved = writer.drainSets();
      if (moved) (sets ??= []).push(index, moved);
      counts[index] = count;
      used += count;
    }
    const shells = live.shells;
    const doubles = BLOCK.header + entities.length * HULL.extras + used + shells.length * SHELL.stride;
    const block = acquire(doubles);
    block[BLOCK.tick] = tick;
    block[BLOCK.timeS] = live.timeS;
    block[BLOCK.resultTimeS] = typeof live.resultTimeS === 'number' ? live.resultTimeS : NaN;
    block[BLOCK.entities] = entities.length;
    block[BLOCK.shells] = shells.length;
    block[BLOCK.reload] = reload.present ? 1 : 0;
    if (reload.present) {
      block[BLOCK.reloadT] = reload.t; block[BLOCK.reloadTotal] = reload.total; block[BLOCK.reloadProgress] = reload.progress;
      block[BLOCK.reloadKind] = strings.id(reload.kind); block[BLOCK.reloadCaliber] = reload.caliberMm;
      block[BLOCK.reloadRounds] = reload.magazineRounds; block[BLOCK.reloadCapacity] = reload.magazineCapacity;
      block[BLOCK.reloadDone] = reload.done ? 1 : 0;
    }
    const spotting = live.spotting;
    if (spotting && player) {
      const concealment = spotting.getConcealment(player, live.timeS);
      for (let field = 0; field < CONCEALMENT_FIELDS.length; field++) {
        const value = concealment[CONCEALMENT_FIELDS[field]!];
        block[BLOCK.concealment + field] = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value) || 0;
      }
    }
    let at = BLOCK.header, from = 0;
    const turrets = live._wreckTurrets;
    for (let index = 0; index < entities.length; index++) {
      const entity = entities[index]!;
      block[at + HULL.spottedPlayer] = spotting ? (spotting.isSpotted(entity.id, 'player', player) ? 1 : 0) : 1;
      block[at + HULL.spottedEnemy] = spotting ? (spotting.isSpotted(entity.id, 'enemy', null) ? 1 : 0) : 1;
      const wreck = !!turrets && turrets.framePose(entity.id, pose);
      block[at + HULL.wreck] = wreck ? 1 : 0;
      if (wreck) {
        for (let k = 0; k < 7; k++) block[at + HULL.pose + k] = pose[k]!;
        block[at + HULL.settled] = turrets!.settled(entity.id) ? 1 : 0;
      }
      const count = counts[index]!;
      block[at + HULL.leaves] = count;
      at += HULL.extras;
      for (let k = 0; k < count; k++) block[at + k] = scratch[from + k]!;
      at += count;
      from += count;
    }
    for (const shell of shells) {
      block[at + SHELL.id] = shell.id;
      block[at + SHELL.shooter] = entityIndexById.get(shell.shooterId) ?? -1;
      block[at + SHELL.spec] = shellSpecId(shell.spec);
      block[at + SHELL.isPlayer] = shell.isPlayer ? 1 : 0;
      block[at + SHELL.pos] = shell.pos.x; block[at + SHELL.pos + 1] = shell.pos.y; block[at + SHELL.pos + 2] = shell.pos.z;
      block[at + SHELL.prevPos] = shell.prevPos.x; block[at + SHELL.prevPos + 1] = shell.prevPos.y; block[at + SHELL.prevPos + 2] = shell.prevPos.z;
      block[at + SHELL.vel] = shell.vel.x; block[at + SHELL.vel + 1] = shell.vel.y; block[at + SHELL.vel + 2] = shell.vel.z;
      block[at + SHELL.ageS] = shell.ageS; block[at + SHELL.distM] = shell.distM; block[at + SHELL.dead] = shell.dead ? 1 : 0;
      block[at + SHELL.rocket] = shell.rocket ? 1 : 0; block[at + SHELL.bounces] = shell.bounces ?? 0;
      block[at + SHELL.remainingPenMm] = shell.remainingPenMm ?? 0; block[at + SHELL.gravity] = shell.gravityMps2 ?? 0;
      block[at + SHELL.penRollDone] = shell.penRollDone ? 1 : 0; block[at + SHELL.carriedThrough] = shell.carriedThrough ? 1 : 0;
      block[at + SHELL.dmgRoll] = shell.dmgRoll ?? 0;
      at += SHELL.stride;
    }
    // the verdict and the mode's state, as text when they changed (the mode's every sixth tick)
    let result: string | null = null;
    const verdict = live.result === null && live.resultReason === null ? '' : JSON.stringify([live.result, live.resultReason]);
    if (verdict !== lastResult) { lastResult = verdict; result = verdict; }
    let mode: string | null = null;
    if (tick % 6 === 1) {
      const text = live.matchModeState == null ? 'null' : JSON.stringify(live.matchModeState);
      if (text !== lastMode) { lastMode = text; mode = text; }
    }
    const message = _tick;
    message.tick = tick;
    message.at = epoch + now();
    message.buffer = block.buffer as ArrayBuffer;
    message.strings = strings.drainAdded();
    message.schemas = schemas;
    message.sets = sets;
    message.specs = specsAdded;
    message.log = log;
    message.result = result;
    message.mode = mode;
    specsAdded = null;
    log = null;
    transfer[0] = block.buffer as ArrayBuffer;
    inFlight++;
    post(message, transfer);
    message.log = null; message.schemas = null; message.sets = null; message.specs = null; message.strings = null;
  }
  const _counts: number[] = [];
  const _tick: LocalSimTick = { type: 'tick', tick: 0, at: 0, buffer: new ArrayBuffer(0), strings: null, schemas: null, sets: null,
    specs: null, log: null, result: null, mode: null };

  // hot-path: the Worker's clock (two steps a wake at most; a longer debt is dropped, and a page that has not drawn
  // LOCAL_SIM_MAX_IN_FLIGHT ticks holds the next: game time slows, it never jumps)
  function pump(): void {
    timer = null;
    if (!running || disposed || !game) return;
    const at = now();
    let steps = 0;
    while (at >= nextAt && steps < LOCAL_SIM_MAX_STEPS_PER_WAKE && inFlight < LOCAL_SIM_MAX_IN_FLIGHT) {
      stepAndPost(); nextAt += LOCAL_SIM_TICK_MS; steps++;
    }
    if (at - nextAt > LOCAL_SIM_TICK_MS) nextAt = at;
    // waiting on the page: woken by the next buffer back (or this timer)
    timer = schedule(pump, inFlight >= LOCAL_SIM_MAX_IN_FLIGHT ? LOCAL_SIM_TICK_MS : Math.max(0, nextAt - now()));
  }

  function setRunning(next: boolean): void {
    if (next === running) return;
    running = next;
    if (timer !== null) { cancel(timer); timer = null; }
    if (running) { nextAt = now(); pump(); }
    else inFlight = 0;
  }

  const unsubscribe = port.onMessage((message) => {
    if (disposed) return;
    switch (message.type) {
      case 'boot':
        void boot(message.boot).catch((error: unknown) => post({ type: 'failed', error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error) }));
        return;
      case 'input': {
        const moved = controlsChanged(message.v);
        input.set(message.v.subarray(0, LOCAL_INPUT.length));
        if (input[LOCAL_INPUT.fire] !== 0) fireLatched = true;
        actionBitsLatched |= input[LOCAL_INPUT.actionBits]! | 0;
        inputSeen = true;
        // a control the player changed is stepped now, not at the cadence's next tick (which then follows a tick on);
        // the aim alone, posted every frame, keeps the cadence
        if (moved && running && timer !== null && inFlight < LOCAL_SIM_MAX_IN_FLIGHT) {
          cancel(timer);
          timer = null;
          stepAndPost();
          nextAt = now() + LOCAL_SIM_TICK_MS;
          timer = schedule(pump, LOCAL_SIM_TICK_MS);
        }
        return;
      }
      case 'bodies': applyBodies(message.bodies); return;
      case 'consumable': consume(message.slot); return;
      case 'action': act(message.action); return;
      case 'run': setRunning(message.running); return;
      case 'return': {
        if (freeBuffers.length < 8) freeBuffers.push(message.buffer);
        const waiting = inFlight >= LOCAL_SIM_MAX_IN_FLIGHT;
        inFlight = Math.max(0, inFlight - 1);
        // the page drew one: a Worker held on it steps now
        if (waiting && running && timer !== null) { cancel(timer); timer = null; pump(); }
        return;
      }
      case 'stop': setRunning(false); game = null; world = null; return;
      default: return;
    }
  });

  return {
    get game() { return game; },
    get tick() { return tick; },
    stepOnce: stepAndPost,
    dispose() {
      if (disposed) return;
      disposed = true;
      setRunning(false);
      unsubscribe();
      game = null;
      world = null;
    },
  };
}
