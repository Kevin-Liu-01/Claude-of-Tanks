/**
 * Couch mode's page runtime (docs/COUCH-MODE.md, phase 1): the lobby that seats the phones, each seat's controls and
 * the readout its phone shows, the per-tick input stage for every seat, and the shared camera. Its chunk loads when the
 * host opens couch mode; nothing of it is on the boot graph.
 *
 * Between battles the lobby keeps its phones: a battle seats the lobby's phones in play (game/couchSeats.ts), and when
 * it ends they stay seated for the next one. In a couch battle the keyboard drives no tank; each seat's controls reach
 * its tank through the core's player input stage once per tick (`beforeStep`, the composition root's pre-step hook), as
 * a network seat's do, and the camera frames every living seat (game/couchCamera.ts) through the frame's camera slot.
 *
 * The session's edges (round 8 Y4 s3-02, s3-09): `startBattle` closes the join window and then deploys the seats here
 * (joins wait between battles; Reopen lets late arrivals in); each battle's init is keyed by its session's identity (a
 * new session object, a new battle: `beginBattle`); and the couch view (the shared screen shows the field, not one tank)
 * is asked of the `setSpectating` port on every frame the runtime runs, never latched, and dropped when the phase
 * leaves the battle and when the lobby closes, so no other owner's teardown can leave it stale.
 */
import { startPadLobby } from '../pad/padLobby.ts';
import type { PadLobby, PadLobbyPorts, PadLobbyView } from '../pad/padLobby.ts';
import type { PadStatusSource } from '../pad/padReceiver.ts';
import { padServiceUrl } from '../pad/padEndpoint.ts';
import { createCouchSeatControls } from '../game/couchSeats.ts';
import type { CouchSeatControls, CouchSeatInput, CouchSession } from '../game/couchSeats.ts';
import { solveCouchPose } from '../game/couchCamera.ts';
import type { CouchPoint } from '../game/couchCamera.ts';
import type { CouchRules } from '../sim/matchRuleset.ts';
import { applyPlayerInput } from '../sim/playerInputStage.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

/** A battle tank as the runtime reads it: the phone's readout facts and the hull's pose. */
export interface CouchEntity {
  combat: { destroyed?: boolean; shellSlot: number; ammo: readonly number[]; reload: { t: number; totalS: number } } | null;
  spec: { id?: string; topSpeedKmh?: number; gun: { shells: ReadonlyArray<{ type: string; guided?: boolean }> } };
  state: { pos: CouchPoint; yaw: number; turretYaw: number; speed?: number } | null;
}

/** A seat's hull as the core's player input stage writes it (sim/playerInputStage.ts). */
type SeatHull = Parameters<typeof applyPlayerInput>[0];
/** The same tank as the roster holds it: its combat and pose stay null until the battle builds them. */
type SeatTank = Omit<SeatHull, 'combat' | 'state'> & { combat: SeatHull['combat'] | null; state: SeatHull['state'] | null };

const builtHull = <T extends SeatTank>(entity: T): entity is T & SeatHull => !!entity.combat && !!entity.state;

export interface CouchRuntimePorts<E extends CouchEntity & SeatTank> {
  game: {
    readonly phase: string;
    readonly couch?: CouchSession<E> | null;
    readonly ruleset: { readonly couch?: CouchRules };
  };
  camera: {
    readonly fov: number;
    readonly aspect: number;
    readonly position: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown };
    lookAt(x: number, y: number, z: number): void;
  };
  /** The battle is paused (the menu is open). */
  paused(): boolean;
  /** A shell type's code as every locale prints it (src/ui/shellLabels.ts shellTypeCode). */
  shellCode(type: string): string;
  togglePause(): void;
  /** The battle's event bus, for what the input stage reports (a shell it could not load). */
  emit(type: string, payload: Record<string, RuntimeValue>): unknown;
  /** The same bus's `on`, for what each seat's phone feels (src/pad/padCues.ts: the seat's own gun, hits and hull). */
  on(type: string, listener: (payload: unknown) => void): () => void;
  /**
   * The battle HUD shows the field, not one tank (body.cot-spectating), while a couch battle runs. Asked on every frame the
   * runtime runs and at the battle's and the lobby's end: the port writes only on a change (main.ts: the 'couch' reason
   * of src/ui/bodyFlags.ts and the HUD's couch view).
   */
  setSpectating(on: boolean): void;
  /** The lobby's service (default: the pairing service of this page, src/pad/padEndpoint.ts); null with none. */
  startLobby?(ports: PadLobbyPorts): PadLobby | null;
}

export interface CouchRuntime {
  /** The lobby (null until opened, or after it ended). */
  readonly lobby: PadLobby | null;
  /** Open the lobby (a fresh code), or return the open one. Null with no pairing service. */
  open(): PadLobby | null;
  /** The lobby's seats with a phone here, in seat order: the seats a battle starts with. */
  seatsInPlay(): number[];
  /** End the lobby for every phone. */
  close(): void;
  /**
   * Start a couch battle (round 8 Y4 s3-09): the join window closes, then `launch` deploys the seats with a phone here
   * (docs/COUCH-MODE.md: joins wait between battles). False with no phone here (nothing is sent) or when the launch
   * refused; the window stays closed after a refused launch (the lobby's Reopen lets phones in again).
   */
  startBattle(launch: (seats: readonly number[]) => boolean): boolean;
  /** The frame's camera slot: true while a couch battle owns the camera. */
  frame(dtSeconds: number): boolean;
  /** Once per fixed step, before it: every seat's controls onto its tank. */
  beforeStep(): void;
}

/** How fast the camera closes on its pose (per second, exponential). */
const CAMERA_FOLLOW = 3;

/** The page's own pairing service, if it has one. */
function startServiceLobby(ports: PadLobbyPorts): PadLobby | null {
  const url = padServiceUrl();
  return url ? startPadLobby(url, ports) : null;
}

export function createCouchRuntime<E extends CouchEntity & SeatTank>(ports: CouchRuntimePorts<E>): CouchRuntime {
  const controls = new Map<number, CouchSeatControls>();
  const input: CouchSeatInput = { throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false, shellSlot: 0,
    actionBits: 0, aimYaw: 0, aimPitch: 0, aimDistance: 0 };
  const points: CouchPoint[] = [];
  let lobby: PadLobby | null = null;
  let lobbyView: PadLobbyView | null = null;
  /** The battle the seats were last aimed for, and its fixed camera bearing. */
  let aimedFor: CouchSession<E> | null = null;
  let bearing = 0;
  let placed = false;
  const startLobby = ports.startLobby ?? startServiceLobby;

  const seatEntity = (seat: number): E | null => ports.game.couch?.seats.find((entry) => entry.seat === seat)?.entity ?? null;
  const controlsOf = (seat: number): CouchSeatControls => {
    let seatControls = controls.get(seat);
    if (!seatControls) { seatControls = createCouchSeatControls(); controls.set(seat, seatControls); }
    return seatControls;
  };
  const source = (seat: number): PadStatusSource | null => {
    const entity = seatEntity(seat);
    const battle = ports.game.phase === 'battle' && !!ports.game.ruleset.couch && !!entity;
    return { battle, paused: ports.paused(), sniper: false, player: battle ? entity : null, shellCode: ports.shellCode };
  };

  /** A new couch battle: each seat's sight starts along its own gun, and the camera along seat 1's side's facing. */
  function beginBattle(session: CouchSession<E>): void {
    aimedFor = session;
    placed = false;
    for (const { seat, entity } of session.seats) {
      if (entity.state) controlsOf(seat).aimAlong(entity.state.yaw + entity.state.turretYaw);
    }
    bearing = session.seats[0]?.entity.state?.yaw ?? 0;
  }

  // the couch view never outlives its battle: a phase away from the battle drops it (no couch frame runs there)
  ports.on('phase:change', () => { if (ports.game.phase !== 'battle') ports.setSpectating(false); });

  const runtime: CouchRuntime = {
    get lobby() { return lobby; },
    open() {
      if (lobby && lobbyView?.state !== 'ended') return lobby;
      const started = startLobby({
        seat: (seat) => ({ input: controlsOf(seat), source: () => source(seat), togglePause: ports.togglePause, listen: ports.on, ownsPlayer: false }),
        seatGone: (seat) => { controls.get(seat)?.release(); controls.delete(seat); },
      });
      if (!started) return null;
      lobby = started;
      started.subscribe((view) => { lobbyView = view; });
      return started;
    },
    seatsInPlay() {
      return (lobbyView?.seats ?? []).filter((seat) => seat.presence === 'here').map((seat) => seat.seat);
    },
    close() {
      lobby?.end();
      lobby = null;
      for (const seatControls of controls.values()) seatControls.release();
      controls.clear();
      ports.setSpectating(false);
    },
    startBattle(launch) {
      const seats = runtime.seatsInPlay();
      if (!lobby || !seats.length) return false;
      lobby.setOpen(false);
      return launch(seats);
    },
    frame(dtSeconds) {
      const session = ports.game.couch;
      const rules = ports.game.ruleset.couch;
      const active = !!session && !!rules && ports.game.phase === 'battle';
      // (round 8 Y4 s3-02) asked every frame, never latched: another owner's teardown (the HUD's battle end) cleared what
      // a latch still believed was up, and every couch battle after the first showed seat 1's own-tank furniture
      ports.setSpectating(active);
      if (!active || !session || !rules) return false;
      if (session !== aimedFor) beginBattle(session);
      points.length = 0;
      for (const { entity } of session.seats) if (entity.state && !entity.combat?.destroyed) points.push(entity.state.pos);
      const pose = solveCouchPose(points, rules, bearing, ports.camera.fov, ports.camera.aspect);
      if (!pose) return true;
      const camera = ports.camera;
      // the first frame of a battle stands at the pose; after it the camera closes on it smoothly
      const k = placed ? 1 - Math.exp(-CAMERA_FOLLOW * Math.max(0, dtSeconds)) : 1;
      placed = true;
      camera.position.set(
        camera.position.x + (pose.x - camera.position.x) * k,
        camera.position.y + (pose.y - camera.position.y) * k,
        camera.position.z + (pose.z - camera.position.z) * k,
      );
      camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
      return true;
    },
    beforeStep() {
      const session = ports.game.couch;
      if (!session || !ports.game.ruleset.couch) return;
      if (session !== aimedFor) beginBattle(session);
      for (const { seat, entity } of session.seats) {
        const seatControls = controls.get(seat);
        // a seat no phone drives (it left) takes the stage's neutral input: braking, holding fire
        if (builtHull(entity)) applyPlayerInput(entity, seatControls ? seatControls.take(input) : null, ports.emit);
      }
    },
  };
  return runtime;
}
