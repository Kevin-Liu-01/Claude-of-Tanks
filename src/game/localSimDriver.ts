/**
 * The local Worker driver's page end (?localDriver=worker; docs/ARCHITECTURE.md "One core, two drivers"): a local battle's
 * core steps in a dedicated Worker (localSimCore.ts) and the page draws it. The page seats the battle as it always does
 * (setupBattle, its visuals, its countdown), hands the Worker the same setup's inputs, then stops stepping: every frame it
 * posts the player's input the moment it is sampled, applies every tick the Worker posted (each hull's whole state, the
 * shells, the verdict and the mode's state), replays the tick's events and calls in their order (a death, a recoil, the
 * camera's shake, a crushed prop, a building's stage through the destruction mirror), and draws the newest tick
 * smoothed by at most one tick. No prediction, no reconciliation, no snapshots, nothing from src/mp. A Worker that
 * cannot seat the page's battle (another roster, a failed load) leaves the page's own step running.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { DESTRUCTION_BUS_EVENTS } from '../sim/destructionEvents.ts';
import { terrainVariantFor } from '../sim/matchRuleset.ts';
import { COLLISION_MANIFEST_ROUTE } from '../world/collisionWorldLoad.ts';
import { createDestructionMirror } from '../world/destructionMirror.ts';
import { compileMirrorReader, type MirrorReader, type MirrorSchema } from './localSimMirror.ts';
import {
  BLOCK, CONCEALMENT_FIELDS, HULL, LOCAL_INPUT, LOCAL_SIM_TICK_MS, SHELL,
  type LocalSimAction, type LocalSimBodies, type LocalSimBoot, type LocalSimTick, type LocalSimToPage, type PageToLocalSim,
} from './localSimProtocol.ts';

/** The modes the Worker seats: a versus battle of the page's own (no campaign, Watch, Proving Ground or Jev's orders). */
const WORKER_MODES: ReadonlySet<string> = new Set(['standard', 'assault', 'domination', 'frontline_assault', 'team_deathmatch',
  'capture_the_flag', 'king_of_the_hill', 'turbo_ball']);

type Bag = Record<string, unknown>;
interface DriverEntity extends Bag {
  id: string; specId: string; team: string; isPlayer?: boolean;
  spec: { gun: { shells: { name?: string; type?: string }[] } };
  state: Bag | null; combat: Bag | null;
  input: { throttle: number; steer: number; brake: boolean; fire: boolean; shellSlot: number; aimPoint?: { x: number; y: number; z: number };
    aimLocked: boolean; actionBits?: number };
  visual?: (Bag & { contactGeom?: unknown; trackWidthM?: number; syncFromState?(state: unknown): void }) | null;
  contactGeom?: unknown;
}
interface DriverGame extends Bag {
  phase: string; mapId: string; gameMode: string; timeS: number; resultTimeS: number | null; result: unknown; resultReason: unknown;
  tanks: DriverEntity[]; player: DriverEntity | null; shells: unknown[]; spotting: unknown; matchModeState: unknown;
  rosterSeed: number; battleCount: number; recentBotSpecIds: unknown; previousBotSpecIds: unknown;
  ruleset?: { destruction?: { sections?: boolean } | null } | null;
  killcam?: { recordSimStep?(game: unknown): void } | null;
  _wreckTurrets?: unknown;
}
interface DriverWorld {
  spawnPoints?: unknown;
  getObstacles(): { min: number[]; max: number[]; crushed?: boolean }[];
  crushObstacle?(record: unknown, dx: number, dz: number, speed?: number, cause?: string): boolean;
  bindGroundOverlay?(overlay: unknown): void;
  heightField?: unknown;
}
interface DriverBus { emit(event: string, payload: unknown): void; on(event: string, listener: (payload: unknown) => void): () => void }
interface DriverRig { addTrauma(amount: number): void; recoilKick?(pitch: number, scale: number): void }

export interface LocalSimDriverOptions {
  game: DriverGame;
  bus: DriverBus;
  getRig(): DriverRig | null;
  getWorld(): DriverWorld | null;
  /** Whether the page's own step runs on the world kernels (?simKernels=ts does not). */
  kernels: boolean;
  /** The Worker (a receipt passes an in-process one). */
  createWorker?: () => Worker;
  now?: () => number;
  log?: (message: string) => void;
}

export interface LocalSimBeginOptions {
  specId: string;
  gameMode: string;
  random: boolean;
  campaignOperationId?: string | null;
  watch?: boolean;
  /** The opponent's brain (Jev's orders come over the network: the page's own step keeps them). */
  opponent?: string | null;
}

export interface LocalSimDriver {
  /** Seats the page's next battle on the Worker: the setup's own inputs, read before the page's setup runs. */
  beforeSetup(): void;
  /** After the page's setup: hands the Worker the battle (or leaves the page's step when it cannot take it). */
  begin(options: LocalSimBeginOptions): void;
  /** The Worker steps this battle (it is seated, or still seating: the page steps nothing either way). */
  readonly active: boolean;
  /** Still seating: the count holds (PREPARING) until it is ready. */
  readonly pending: boolean;
  /** The player's input, the moment the page sampled it. */
  postInput(): void;
  /** The battle runs this frame: every tick that arrived is applied (`onTick` after each); returns the draw's alpha. */
  advance(onTick: () => void): number;
  /** The battle does not run this frame (paused, a killcam, the count). */
  hold(): void;
  consumable(slot: number): void;
  action(action: LocalSimAction): void;
  /** The battle is over for the page (the Garage, another battle): the Worker stops and the page's own objects return. */
  end(): void;
  /** What the driver measured (the proof's probes read it). */
  readonly stats: { ticks: number; applied: number; skipped: number; maxTicksPerFrame: number; lateFrames: number; bootMs: number; kernels: string | null; mismatch: string | null };
}

const quatA = new Quaternion(), quatB = new Quaternion(), position = new Vector3(), unit = new Vector3(1, 1, 1);

export function createLocalSimDriver({
  game, bus, getRig, getWorld, kernels,
  createWorker = () => new Worker(new URL('./localSimWorker.ts', import.meta.url), { type: 'module', name: 'local-sim' }),
  now = () => performance.now(),
  log = (message) => console.warn(`[local-sim] ${message}`),
}: LocalSimDriverOptions): LocalSimDriver {
  let worker: Worker | null = null;
  let phase: 'off' | 'booting' | 'ready' = 'off';
  let seed: LocalSimBoot['seed'] | null = null;
  let bootedAt = 0;
  const queue: LocalSimTick[] = [];
  let running = false;
  let lastAppliedAt = 0;
  // when the newest tick was stepped, on the page's clock (the draw is smoothed from it, by at most one tick)
  let newestSteppedAt = 0;
  const epoch = Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : 0;
  let readers: (MirrorReader | null)[] = [];
  const strings: string[] = [];
  const specs = new Map<number, unknown>();
  const shellPool = new Map<number, Bag>();
  const liveShells: Bag[] = [];
  let mirror: ReturnType<typeof createDestructionMirror> | null = null;
  let saved: { spotting: unknown; wreckTurrets: unknown; shells: unknown[] } | null = null;
  const input = new Float64Array(LOCAL_INPUT.length);
  const inputMessage: PageToLocalSim = { type: 'input', v: input };
  const reloadEvent = { t: 0, total: 0, progress: 0, kind: 'ready', caliberMm: 0, magazineRounds: 0, magazineCapacity: 0, done: false };
  const concealment: Record<string, number | boolean> = Object.fromEntries(CONCEALMENT_FIELDS.map((field) => [field, 0]));
  let spottedPlayer = new Uint8Array(0), spottedEnemy = new Uint8Array(0);
  const indexById = new Map<string, number>();
  let wreckPrev = new Float64Array(0), wreckCur = new Float64Array(0);
  let wreckHas = new Uint8Array(0), wreckSettled = new Uint8Array(0);
  const stats = { ticks: 0, applied: 0, skipped: 0, maxTicksPerFrame: 0, lateFrames: 0, bootMs: 0, kernels: null as string | null, mismatch: null as string | null };

  const post = (message: PageToLocalSim, transfer?: Transferable[]): void => { worker?.postMessage(message, transfer ?? []); };

  // ---- the page's own objects the Worker's state stands in for while it steps ----
  const spottingFacade = {
    isSpotted(id: string, team: string): boolean {
      const index = indexById.get(id);
      if (index === undefined) return true;
      return (team === 'enemy' ? spottedEnemy : spottedPlayer)[index] === 1;
    },
    getConcealment: () => concealment,
    update() {}, forceCheck() {}, notifyFired() {}, reset() {}, bushBonusBetween: () => 0, testSpot: () => false, raycastCalls: 0,
  };
  const wreckFacade = {
    has: (id: string) => { const index = indexById.get(id); return index !== undefined && wreckHas[index] === 1; },
    framePose(id: string, out: Float64Array | number[]) {
      const index = indexById.get(id);
      if (index === undefined || wreckHas[index] !== 1) return false;
      for (let k = 0; k < 7; k++) out[k] = wreckCur[index * 7 + k]!;
      return true;
    },
    framePoseAt(id: string, alpha: number, out: Float64Array | number[]) {
      const index = indexById.get(id);
      if (index === undefined || wreckHas[index] !== 1) return false;
      const base = index * 7;
      for (let k = 0; k < 3; k++) out[k] = wreckPrev[base + k]! + (wreckCur[base + k]! - wreckPrev[base + k]!) * alpha;
      quatA.set(wreckPrev[base + 3]!, wreckPrev[base + 4]!, wreckPrev[base + 5]!, wreckPrev[base + 6]!);
      quatB.set(wreckCur[base + 3]!, wreckCur[base + 4]!, wreckCur[base + 5]!, wreckCur[base + 6]!);
      quatA.slerp(quatB, alpha);
      out[3] = quatA.x; out[4] = quatA.y; out[5] = quatA.z; out[6] = quatA.w;
      return true;
    },
    frameMatrix(id: string, out: Matrix4) {
      const index = indexById.get(id);
      if (index === undefined || wreckHas[index] !== 1) return false;
      const base = index * 7;
      position.set(wreckCur[base]!, wreckCur[base + 1]!, wreckCur[base + 2]!);
      quatA.set(wreckCur[base + 3]!, wreckCur[base + 4]!, wreckCur[base + 5]!, wreckCur[base + 6]!);
      out.compose(position, quatA, unit);
      return true;
    },
    settled: (id: string) => { const index = indexById.get(id); return index !== undefined && wreckSettled[index] === 1; },
    launch: () => false, step() {}, reset() {}, release() {}, bind() {}, restore: () => false, ids: () => [],
  };

  function install(): void {
    saved = { spotting: game.spotting, wreckTurrets: game._wreckTurrets, shells: game.shells };
    game.spotting = spottingFacade;
    game._wreckTurrets = wreckFacade;
    game.shells = liveShells;
    liveShells.length = 0;
    shellPool.clear();
    const count = game.tanks.length;
    spottedPlayer = new Uint8Array(count).fill(1);
    spottedEnemy = new Uint8Array(count).fill(1);
    wreckPrev = new Float64Array(count * 7); wreckCur = new Float64Array(count * 7);
    wreckHas = new Uint8Array(count); wreckSettled = new Uint8Array(count);
    indexById.clear();
    game.tanks.forEach((entity, index) => indexById.set(entity.id, index));
    readers = new Array(count).fill(null);
    // the Worker's destruction on this world (the online driver's mirror): stages, holes, craters, heaps
    const world = getWorld();
    mirror = createDestructionMirror(world as never, bus);
    mirror.setSections(game.ruleset?.destruction?.sections === true);
    world?.bindGroundOverlay?.(mirror.ground);
  }

  function restore(): void {
    if (!saved) return;
    game.spotting = saved.spotting;
    game._wreckTurrets = saved.wreckTurrets;
    game.shells = saved.shells;
    saved = null;
    getWorld()?.bindGroundOverlay?.(null);
    mirror = null;
  }

  // ---- one tick onto the page's battle ----
  function applyTick(message: LocalSimTick): void {
    const block = new Float64Array(message.buffer);
    if (message.strings) for (const text of message.strings) strings.push(text);
    if (message.specs) for (let at = 0; at < message.specs.length; at += 2) specs.set(message.specs[at] as number, message.specs[at + 1]);
    const tanks = game.tanks;
    if (message.schemas) {
      for (let at = 0; at < message.schemas.length; at += 2) {
        const index = message.schemas[at] as number;
        const entity = tanks[index];
        if (entity) readers[index] = compileMirrorReader(entity, message.schemas[at + 1] as MirrorSchema, readers[index] ?? null);
      }
    }
    game.timeS = block[BLOCK.timeS]!;
    const resultTimeS = block[BLOCK.resultTimeS]!;
    game.resultTimeS = Number.isNaN(resultTimeS) ? null : resultTimeS;
    for (let field = 0; field < CONCEALMENT_FIELDS.length; field++) {
      const name = CONCEALMENT_FIELDS[field]!;
      const value = block[BLOCK.concealment + field]!;
      concealment[name] = typeof concealment[name] === 'boolean' || field >= 6 ? value !== 0 : value;
    }
    const count = block[BLOCK.entities]!;
    let at = BLOCK.header;
    for (let index = 0; index < count; index++) {
      spottedPlayer[index] = block[at + HULL.spottedPlayer]!;
      spottedEnemy[index] = block[at + HULL.spottedEnemy]!;
      const wreck = block[at + HULL.wreck] === 1;
      const base = index * 7;
      if (wreck) {
        const had = wreckHas[index] === 1;
        for (let k = 0; k < 7; k++) {
          wreckPrev[base + k] = had ? wreckCur[base + k]! : block[at + HULL.pose + k]!;
          wreckCur[base + k] = block[at + HULL.pose + k]!;
        }
        wreckSettled[index] = block[at + HULL.settled]!;
      }
      wreckHas[index] = wreck ? 1 : 0;
      const leaves = block[at + HULL.leaves]!;
      at += HULL.extras;
      const reader = readers[index];
      const entity = tanks[index];
      if (reader && entity && reader.leaves === leaves) reader.apply(entity, block, at, strings);
      else stats.skipped++;
      at += leaves;
    }
    if (message.sets) {
      for (let k = 0; k < message.sets.length; k += 2) {
        const index = message.sets[k] as number;
        const reader = readers[index], entity = tanks[index];
        if (reader && entity) reader.applySets(entity, message.sets[k + 1] as (number | unknown[])[]);
      }
    }
    applyShells(block, at, block[BLOCK.shells]!);
    if (message.result !== null) {
      if (message.result === '') { game.result = null; game.resultReason = null; }
      else { const [result, reason] = JSON.parse(message.result) as [unknown, unknown]; game.result = result; game.resultReason = reason; }
    }
    if (message.mode !== null) game.matchModeState = JSON.parse(message.mode);
    mirror?.ground.setTime(game.timeS);
    if (message.log) replay(message.log);
    if (block[BLOCK.reload] === 1) {
      reloadEvent.t = block[BLOCK.reloadT]!; reloadEvent.total = block[BLOCK.reloadTotal]!; reloadEvent.progress = block[BLOCK.reloadProgress]!;
      reloadEvent.kind = strings[block[BLOCK.reloadKind]!] ?? 'ready'; reloadEvent.caliberMm = block[BLOCK.reloadCaliber]!;
      reloadEvent.magazineRounds = block[BLOCK.reloadRounds]!; reloadEvent.magazineCapacity = block[BLOCK.reloadCapacity]!;
      reloadEvent.done = block[BLOCK.reloadDone] === 1;
      bus.emit('player:reload', reloadEvent);
    }
    game.killcam?.recordSimStep?.(game);
    // the buffer goes back to the Worker's pool
    post({ type: 'return', buffer: message.buffer }, [message.buffer]);
  }

  function applyShells(block: Float64Array, start: number, count: number): void {
    liveShells.length = 0;
    let at = start;
    for (let index = 0; index < count; index++, at += SHELL.stride) {
      const id = block[at + SHELL.id]!;
      let shell = shellPool.get(id);
      const shooter = game.tanks[block[at + SHELL.shooter]!];
      if (!shell) {
        shell = { id, shooterId: shooter?.id ?? '', isPlayer: false, spec: null, pos: new Vector3(), prevPos: new Vector3(), vel: new Vector3(),
          ageS: 0, distM: 0, dead: false, rocket: false, bounces: 0, remainingPenMm: 0, gravityMps2: 0, penRollDone: false,
          carriedThrough: false, dmgRoll: 0 };
        shell.spec = resolveSpec(block[at + SHELL.spec]!, shooter);
        shellPool.set(id, shell);
      }
      shell.isPlayer = block[at + SHELL.isPlayer] === 1;
      (shell.pos as Vector3).set(block[at + SHELL.pos]!, block[at + SHELL.pos + 1]!, block[at + SHELL.pos + 2]!);
      (shell.prevPos as Vector3).set(block[at + SHELL.prevPos]!, block[at + SHELL.prevPos + 1]!, block[at + SHELL.prevPos + 2]!);
      (shell.vel as Vector3).set(block[at + SHELL.vel]!, block[at + SHELL.vel + 1]!, block[at + SHELL.vel + 2]!);
      shell.ageS = block[at + SHELL.ageS]; shell.distM = block[at + SHELL.distM]; shell.dead = block[at + SHELL.dead] === 1;
      shell.rocket = block[at + SHELL.rocket] === 1; shell.bounces = block[at + SHELL.bounces];
      shell.remainingPenMm = block[at + SHELL.remainingPenMm]; shell.gravityMps2 = block[at + SHELL.gravity];
      shell.penRollDone = block[at + SHELL.penRollDone] === 1; shell.carriedThrough = block[at + SHELL.carriedThrough] === 1;
      shell.dmgRoll = block[at + SHELL.dmgRoll];
      liveShells.push(shell);
    }
    // the rounds gone this tick leave the pool
    if (shellPool.size > liveShells.length) {
      for (const [id, shell] of shellPool) if (!liveShells.includes(shell)) shellPool.delete(id);
    }
  }

  /** A shell's spec: the shooter's own round of that name where it has one (its identity), else the Worker's copy. */
  const resolvedSpecs = new Map<number, unknown>();
  function resolveSpec(id: number, shooter: DriverEntity | undefined): unknown {
    if (id < 0) return null;
    const known = resolvedSpecs.get(id);
    if (known) return known;
    const copy = specs.get(id) as { name?: string; type?: string } | undefined;
    const own = copy && shooter?.spec.gun.shells.find((shell) => shell.name === copy.name && shell.type === copy.type);
    const spec = own ?? copy ?? null;
    if (spec) resolvedSpecs.set(id, spec);
    return spec;
  }

  /** The tick's events and calls, in the order the step made them. */
  function replay(entries: unknown[]): void {
    const rig = getRig();
    for (const raw of entries) {
      const entry = raw as unknown[];
      switch (entry[0]) {
        case 'e': {
          const event = entry[1] as string, payload = entry[2] as Record<string, unknown>;
          // a building's stage, hole or crater lands on this world through the mirror, which emits it here
          if (event === DESTRUCTION_BUS_EVENTS.stage) { mirror?.applyStageEvent(payload); break; }
          if (event === DESTRUCTION_BUS_EVENTS.breach) { mirror?.applyBreachEvent(payload); break; }
          if (event === DESTRUCTION_BUS_EVENTS.crater) { mirror?.applyCraterEvent(payload); break; }
          bus.emit(event, payload);
          break;
        }
        case 'v': {
          const entity = game.tanks[entry[1] as number];
          const visual = entity?.visual;
          if (!visual) break;
          const method = entry[2] as string;
          if (method === 'syncFromState') { visual.syncFromState?.(entity!.state); break; }
          const fn = visual[method];
          if (typeof fn === 'function') (fn as (...args: unknown[]) => unknown).apply(visual, entry[3] as unknown[]);
          break;
        }
        case 'r': {
          const method = entry[1] as 'addTrauma' | 'recoilKick', args = entry[2] as number[];
          if (method === 'addTrauma') rig?.addTrauma(args[0]!);
          else rig?.recoilKick?.(args[0]!, args[1]!);
          break;
        }
        case 'c': crush(entry); break;
        default: break;
      }
    }
  }

  /** A prop the Worker's step crushed, toppled on this world (its index where the worlds agree, else where it stood). */
  function crush(entry: unknown[]): void {
    const world = getWorld();
    if (!world?.crushObstacle) return;
    const obstacles = world.getObstacles();
    const index = entry[1] as number, x = entry[6] as number, z = entry[7] as number;
    const near = (record: { min: number[]; max: number[] } | undefined) => !!record
      && Math.abs((record.min[0]! + record.max[0]!) * 0.5 - x) < 0.5 && Math.abs((record.min[2]! + record.max[2]!) * 0.5 - z) < 0.5;
    let record = index >= 0 ? obstacles[index] : undefined;
    if (!near(record)) record = obstacles.find((candidate) => !candidate.crushed && near(candidate));
    if (!record || record.crushed) return;
    record.crushed = true;
    world.crushObstacle(record, entry[2] as number, entry[3] as number, entry[4] as number, entry[5] as string);
  }

  // ---- the channel ----
  function onMessage(message: LocalSimToPage): void {
    if (message.type === 'tick') {
      if (phase !== 'ready') return;
      queue.push(message);
      stats.ticks++;
      newestSteppedAt = Number.isFinite(message.at) && message.at > 0 ? Math.min(message.at - epoch, now()) : now();
      return;
    }
    if (message.type === 'ready') {
      stats.bootMs = Math.round(now() - bootedAt);
      stats.kernels = message.kernels;
      stats.mismatch = message.mismatch;
      if (message.mismatch) { log(`the Worker's battle is not the page's (${message.mismatch}): the page steps it`); phase = 'off'; return; }
      phase = 'ready';
      install();
      if (running) { sendBodies(); post({ type: 'run', running: true }); }
      return;
    }
    if (message.type === 'failed') {
      log(`the Worker failed: ${message.error}`);
      const wasReady = phase === 'ready';
      phase = 'off';
      if (wasReady) restore();
    }
  }

  /** The drawn models' measures the step reads, once the warm has built them (before the battle first runs). */
  let bodiesSent = false;
  function sendBodies(): void {
    if (bodiesSent) return;
    bodiesSent = true;
    const bodies: LocalSimBodies = game.tanks.map((entity) => {
      const visual = entity.visual;
      if (!visual) return null;
      let contactGeom: unknown = null;
      try { contactGeom = visual.contactGeom ? structuredClone(visual.contactGeom) : null; } catch { contactGeom = null; }
      return { contactGeom, trackWidthM: typeof visual.trackWidthM === 'number' ? visual.trackWidthM : null };
    });
    post({ type: 'bodies', bodies });
  }

  function ensureWorker(): Worker {
    if (!worker) {
      worker = createWorker();
      worker.addEventListener('message', (event: MessageEvent) => onMessage(event.data as LocalSimToPage));
      worker.addEventListener('error', (event) => { log(`the Worker errored: ${(event as ErrorEvent).message ?? event}`); onMessage({ type: 'failed', error: 'worker error' }); });
    }
    return worker;
  }

  bus.on('phase:change', (payload) => {
    if ((payload as { phase?: string } | null)?.phase !== 'battle') driver.end();
  });

  const driver: LocalSimDriver = {
    beforeSetup() {
      seed = { rosterSeed: game.rosterSeed, battleCount: game.battleCount,
        recentBotSpecIds: structuredClone(game.recentBotSpecIds), previousBotSpecIds: structuredClone(game.previousBotSpecIds) };
    },
    begin(options) {
      driver.end();
      const world = getWorld();
      if (!seed || !world || options.campaignOperationId || options.watch || options.opponent === 'jev' || !WORKER_MODES.has(options.gameMode)) {
        if (seed) log(`the page steps this battle (${options.campaignOperationId ? 'campaign' : options.watch ? 'watch' : options.opponent === 'jev' ? 'jev' : `mode ${options.gameMode}`})`);
        seed = null;
        return;
      }
      const storage: [string, string][] = [];
      try {
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          const value = key === null ? null : localStorage.getItem(key);
          if (key !== null && value !== null && value.length < 65536) storage.push([key, value]);
        }
      } catch { /* no storage: the setup reads its defaults, as the Worker will */ }
      const boot: LocalSimBoot = {
        mapId: game.mapId, gameMode: options.gameMode, specId: options.specId, random: options.random,
        manifestBase: COLLISION_MANIFEST_ROUTE, variant: terrainVariantFor(options.gameMode as never) ?? null, kernels,
        spawnPoints: structuredClone(world.spawnPoints), seed, storage,
        roster: game.tanks.map((entity) => ({ id: entity.id, specId: entity.specId, team: entity.team })),
      };
      seed = null;
      bodiesSent = false;
      phase = 'booting';
      bootedAt = now();
      queue.length = 0;
      strings.length = 0;
      specs.clear();
      resolvedSpecs.clear();
      stats.ticks = 0; stats.applied = 0; stats.skipped = 0; stats.maxTicksPerFrame = 0; stats.lateFrames = 0; stats.mismatch = null;
      ensureWorker();
      post({ type: 'boot', boot });
    },
    get active() { return phase !== 'off'; },
    get pending() { return phase === 'booting'; },
    postInput() {
      if (phase !== 'ready') return;
      const player = game.player;
      if (!player?.input) return;
      const source = player.input;
      input[LOCAL_INPUT.throttle] = source.throttle || 0;
      input[LOCAL_INPUT.steer] = source.steer || 0;
      input[LOCAL_INPUT.brake] = source.brake ? 1 : 0;
      input[LOCAL_INPUT.fire] = source.fire ? 1 : 0;
      input[LOCAL_INPUT.shellSlot] = source.shellSlot | 0;
      input[LOCAL_INPUT.aimX] = source.aimPoint?.x ?? 0;
      input[LOCAL_INPUT.aimY] = source.aimPoint?.y ?? 0;
      input[LOCAL_INPUT.aimZ] = source.aimPoint?.z ?? 0;
      input[LOCAL_INPUT.aimLocked] = source.aimLocked ? 1 : 0;
      input[LOCAL_INPUT.actionBits] = source.actionBits ?? 0;
      post(inputMessage);
    },
    // hot-path: every battle frame on the Worker
    advance(onTick) {
      if (!running) {
        running = true;
        if (phase === 'ready') { sendBodies(); post({ type: 'run', running: true }); }
      }
      if (phase !== 'ready') return 1;
      const arrived = queue.length;
      if (arrived > stats.maxTicksPerFrame) stats.maxTicksPerFrame = arrived;
      if (arrived === 0) stats.lateFrames++;
      for (let index = 0; index < arrived; index++) {
        applyTick(queue[index]!);
        stats.applied++;
        onTick();
      }
      queue.length = 0;
      if (arrived > 0) lastAppliedAt = newestSteppedAt;
      return Math.max(0, Math.min(1, (now() - lastAppliedAt) / LOCAL_SIM_TICK_MS));
    },
    hold() {
      if (!running) return;
      running = false;
      if (phase === 'ready') post({ type: 'run', running: false });
    },
    consumable(slot) { if (phase === 'ready') post({ type: 'consumable', slot }); },
    action(action) { if (phase === 'ready') post({ type: 'action', action }); },
    end() {
      if (phase === 'off' && !saved) return;
      post({ type: 'stop' });
      running = false;
      phase = 'off';
      queue.length = 0;
      restore();
    },
    stats,
  };
  return driver;
}
