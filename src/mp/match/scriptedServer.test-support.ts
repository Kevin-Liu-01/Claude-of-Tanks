/**
 * Scripted match server fixture, written from src/mp/wire/README.md: the
 * receipts and the soak drive MatchClients against it over loopback pairs on
 * a virtual clock until `server/match/` lands. It runs the shared movement
 * for every tank at 60 Hz, applies each seated client's controls on their
 * tick (holding the last control when one is late), publishes 30 Hz
 * snapshots as deltas against the client's acknowledged baseline with a
 * keyframe every 2 s or on a missing baseline, echoes pings, fires once per
 * new fireSeq, and emits the authority's event records. It is a fixture, not
 * the authority: no armor, no hits, no interest management beyond a radius.
 */
import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../../sim/movement.ts';
import type { MovementHeightField, MovementSpec, TankState } from '../../sim/movement.ts';
import type { Transport } from '../transport/transport.ts';
import {
  CLOSE_REASON, CONTROL_FLAGS, ENTITY_FLAGS, HELLO_CAPABILITY, INPUT_MARGIN_UNKNOWN, MESSAGE_TYPE, NO_ENTITY,
  NO_SEAT, NO_TICK, PHASE, PROTOCOL_VERSION, RELOAD_KIND, SNAPSHOT_HZ, TEAM, TICK_HZ, VERDICT, buildSnapshotPacket,
  decodeMessage, encodeMessage, quantizeAngle, quantizePosition, quantizeReloadS, quantizeShellVelocity,
  quantizeVelocity, shellTypeIndex,
} from '../wire/index.ts';
import type {
  ControlFrame, EntityRow, InputMessage, RosterEntry, ShellRow, SnapshotFrame, TeamId, ViewerState, WireEvent,
} from '../wire/index.ts';
import { captureMovementCheckpoint } from './movementCheckpoint.ts';

export interface ScriptedBot {
  entityId: number;
  specId: string;
  team: TeamId;
  x: number;
  z: number;
  yaw: number;
  /** Controls per tick (throttle/steer in −1..1), or null for a parked tank. */
  drive?: ((tick: number) => { throttle: number; steer: number }) | null;
  /** Ticks between scripted shots (0 = never). */
  fireEveryTicks?: number;
}

export interface ScriptedSeat {
  entityId: number;
  specId: string;
  playerId: string;
  name: string;
  team: TeamId;
  token: string;
  x: number;
  z: number;
  yaw: number;
}

export interface ScriptedServerOptions {
  clock: () => number;
  heightField: MovementHeightField;
  specFor: (specId: string) => MovementSpec;
  seats: ScriptedSeat[];
  bots?: ScriptedBot[];
  /** Ticks of countdown before the match plays. */
  countdownTicks?: number;
  keyframeIntervalTicks?: number;
  /** Enemies beyond this distance are hidden from a viewer (rows vanish and return). */
  visibilityRadiusM?: number;
  /** Snapshot history kept per client for baselines. */
  historyFrames?: number;
  /** Reject controls more than this many ticks ahead of the server. */
  maxTicksAhead?: number;
  reloadS?: number;
  ammo?: number;
  /** Ends the match with this verdict at the tick (null = never). */
  verdictAtTick?: { tick: number; verdict: number; reason: string } | null;
}

interface ServerEntity {
  entityId: number;
  playerId: string;
  team: TeamId;
  specId: string;
  spec: MovementSpec;
  state: TankState;
  input: { throttle: number; steer: number; brake: boolean; aimLocked: boolean; aimPoint: Vector3 };
  combat: { destroyed: boolean };
  hp: number;
  maxHp: number;
  reloadS: number;
  ammo: number;
  shellSlot: number;
  bot: ScriptedBot | null;
  lastFireSeq: number | null;
  lastActionSeq: number | null;
  lastFireTick: number;
}

interface ServerShell {
  id: number;
  shooterEntityId: number;
  pos: Vector3;
  vel: Vector3;
  bornTick: number;
}

interface ClientSession {
  transport: Transport;
  seat: ScriptedSeat | null;
  entity: ServerEntity | null;
  welcomed: boolean;
  ackedTick: number;
  history: Map<number, SnapshotFrame>;
  historyOrder: number[];
  lastKeyframeTick: number;
  controls: Map<number, ControlFrame>;
  newestControlTick: number;
  lastApplied: ControlFrame | null;
  marginTicks: number;
  ackedInputTick: number;
  ackedFireSeq: number;
  ackedActionSeq: number;
  pendingEvents: WireEvent[];
  inputRejected: number;
  inputFrames: number;
  left: boolean;
  unsubscribe: Array<() => void>;
}

export interface ScriptedServerStats {
  ticks: number;
  snapshotsSent: number;
  keyframesSent: number;
  inputFrames: number;
  inputControlsApplied: number;
  inputHeld: number;
  inputRejected: number;
  lateInputs: number;
  eventsSent: number;
  shotsFired: number;
  bytesSent: number;
}

const TICK_MS = 1000 / TICK_HZ;
const TICKS_PER_SNAPSHOT = TICK_HZ / SNAPSHOT_HZ;
const SHELL_SPEED_MPS = 900;
const SHELL_LIFE_TICKS = 60;
const MAX_CATCH_UP_MS = 250;

function seqNewer(a: number, b: number | null): boolean {
  if (b === null) return true;
  const delta = (a - b) & 0xffff;
  return delta !== 0 && delta < 0x8000;
}

export class ScriptedMatchServer {
  readonly clock: () => number;
  readonly heightField: MovementHeightField;
  readonly countdownTicks: number;
  readonly keyframeIntervalTicks: number;
  readonly visibilityRadiusM: number;
  readonly historyFrames: number;
  readonly maxTicksAhead: number;
  readonly reloadS: number;
  readonly verdictAtTick: { tick: number; verdict: number; reason: string } | null;
  readonly stats: ScriptedServerStats = {
    ticks: 0, snapshotsSent: 0, keyframesSent: 0, inputFrames: 0, inputControlsApplied: 0, inputHeld: 0,
    inputRejected: 0, lateInputs: 0, eventsSent: 0, shotsFired: 0, bytesSent: 0,
  };
  private readonly specFor: (specId: string) => MovementSpec;
  private readonly seats: ScriptedSeat[];
  private readonly entities: ServerEntity[] = [];
  private readonly sessions: ClientSession[] = [];
  private readonly shells: ServerShell[] = [];
  private startedAtMs: number;
  private tick = 0;
  private nextShellId = 1;
  private destroyed: number[] = [];
  private destructibleRevision = 0;
  private verdict = VERDICT.NONE as number;
  private verdictReason = '';
  private readonly ammo: number;

  constructor({
    clock,
    heightField,
    specFor,
    seats,
    bots = [],
    countdownTicks = 60,
    keyframeIntervalTicks = 120,
    visibilityRadiusM = 400,
    historyFrames = 120,
    maxTicksAhead = 120,
    reloadS = 2,
    ammo = 40,
    verdictAtTick = null,
  }: ScriptedServerOptions) {
    this.clock = clock;
    this.heightField = heightField;
    this.specFor = specFor;
    this.seats = seats;
    this.countdownTicks = countdownTicks;
    this.keyframeIntervalTicks = keyframeIntervalTicks;
    this.visibilityRadiusM = visibilityRadiusM;
    this.historyFrames = historyFrames;
    this.maxTicksAhead = maxTicksAhead;
    this.reloadS = reloadS;
    this.ammo = ammo;
    this.verdictAtTick = verdictAtTick;
    this.startedAtMs = clock();
    for (const seat of seats) this.entities.push(this.createEntity(seat.entityId, seat.playerId, seat.team, seat.specId, seat.x, seat.z, seat.yaw, null));
    for (const bot of bots) this.entities.push(this.createEntity(bot.entityId, `bot-${bot.entityId}`, bot.team, bot.specId, bot.x, bot.z, bot.yaw, bot));
  }

  get currentTick(): number { return this.tick; }
  get serverTimeMs(): number { return this.tickTimeMs(this.tick); }
  get phase(): number {
    if (this.verdict !== VERDICT.NONE) return PHASE.ENDED;
    return this.tick < this.countdownTicks ? PHASE.COUNTDOWN : PHASE.PLAYING;
  }

  entity(entityId: number): { state: TankState; hp: number } | null {
    const entity = this.entities.find((candidate) => candidate.entityId === entityId);
    return entity ? { state: entity.state, hp: entity.hp } : null;
  }

  /** Destroy an entity at the next tick (scripted deaths). */
  destroy(entityId: number, cause = 'shot'): void {
    const entity = this.entities.find((candidate) => candidate.entityId === entityId);
    if (!entity || entity.combat.destroyed) return;
    entity.combat.destroyed = true;
    entity.hp = 0;
    this.broadcastEvent({ kind: 'tank_destroyed', payload: { id: entity.playerId, killerId: 'script', cause } });
  }

  respawn(entityId: number, x: number, z: number, yaw: number): void {
    const entity = this.entities.find((candidate) => candidate.entityId === entityId);
    if (!entity) return;
    entity.state = createTankState(entity.spec, new Vector3(x, this.heightField.getHeightAt(x, z), z), yaw);
    entity.combat.destroyed = false;
    entity.hp = entity.maxHp;
    entity.reloadS = 0;
  }

  /** A destroyed prop for the persistent destroyed list. */
  destroyObstacle(index: number): void {
    if (this.destroyed.includes(index)) return;
    this.destroyed = [...this.destroyed, index].sort((a, b) => a - b);
    this.destructibleRevision++;
    this.broadcastEvent({ kind: 'world_prop_destroyed', payload: { obstacleIndex: index, kind: 'fence', cause: 'script' } });
  }

  private createEntity(
    entityId: number, playerId: string, team: TeamId, specId: string, x: number, z: number, yaw: number, bot: ScriptedBot | null,
  ): ServerEntity {
    const spec = this.specFor(specId);
    const state = createTankState(spec, new Vector3(x, this.heightField.getHeightAt(x, z), z), yaw);
    return {
      entityId, playerId, team, specId, spec, state,
      input: { throttle: 0, steer: 0, brake: false, aimLocked: true, aimPoint: state.aimPoint.clone() },
      combat: { destroyed: false }, hp: 2000, maxHp: 2000, reloadS: 0, ammo: this.ammo, shellSlot: 0, bot,
      lastFireSeq: null, lastActionSeq: null, lastFireTick: -1,
    };
  }

  // ------------------------------------------------------------ connections

  /** Serve one client endpoint (a seated player when its HELLO token matches a seat, else a spectator). */
  attach(transport: Transport): void {
    const session: ClientSession = {
      transport, seat: null, entity: null, welcomed: false, ackedTick: NO_TICK,
      history: new Map(), historyOrder: [], lastKeyframeTick: -Infinity, controls: new Map(), newestControlTick: -1,
      lastApplied: null, marginTicks: INPUT_MARGIN_UNKNOWN, ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0,
      pendingEvents: [], inputRejected: 0, inputFrames: 0, left: false, unsubscribe: [],
    };
    session.unsubscribe.push(transport.onFrame((bytes) => this.receive(session, bytes)));
    session.unsubscribe.push(transport.onState((change) => {
      if (change.state === 'reconnecting' || (change.state === 'open' && change.resumed)) this.resetSession(session);
      if (change.state === 'closed') session.left = true;
    }));
    this.sessions.push(session);
    if (transport.state === 'idle') transport.open();
  }

  private resetSession(session: ClientSession): void {
    session.welcomed = false;
    session.ackedTick = NO_TICK;
    session.history.clear();
    session.historyOrder.length = 0;
    session.lastKeyframeTick = -Infinity;
    session.controls.clear();
    session.newestControlTick = -1;
    session.lastApplied = null;
    session.pendingEvents.length = 0;
    session.marginTicks = INPUT_MARGIN_UNKNOWN;
  }

  private receive(session: ClientSession, bytes: Uint8Array): void {
    const decoded = decodeMessage(bytes, { maxBytes: 4096 });
    if (!decoded.ok) {
      this.sendTo(session, encodeMessage({ type: MESSAGE_TYPE.ERROR, reason: CLOSE_REASON.MALFORMED, detail: decoded.error.code }));
      return;
    }
    const message = decoded.message;
    if (message.type === MESSAGE_TYPE.HELLO) {
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        this.sendTo(session, encodeMessage({ type: MESSAGE_TYPE.CLOSE, reason: CLOSE_REASON.PROTOCOL_VERSION, detail: 'protocol' }));
        session.transport.close('server', 'protocol');
        return;
      }
      const seat = this.seats.find((candidate) => candidate.token === message.token) ?? null;
      session.seat = seat;
      session.entity = seat ? this.entities.find((entity) => entity.entityId === seat.entityId) ?? null : null;
      session.welcomed = true;
      this.sendTo(session, encodeMessage({
        type: MESSAGE_TYPE.WELCOME,
        protocolVersion: PROTOCOL_VERSION,
        tickHz: TICK_HZ,
        snapshotHz: SNAPSHOT_HZ,
        seat: seat ? this.seats.indexOf(seat) : NO_SEAT,
        entityId: seat ? seat.entityId : NO_ENTITY,
        team: seat ? seat.team : TEAM.SPECTATOR,
        serverTick: this.tick,
        serverTimeMs: this.serverTimeMs >>> 0,
        seed: 0x1234,
        capabilities: message.capabilities & HELLO_CAPABILITY.SHOT_FEEDBACK,
        roomId: 'fixture',
        mapId: 'flatland',
        mode: 'standard',
        rulesetJson: '{"mode":"standard"}',
        roster: this.roster(),
      }));
      return;
    }
    if (!session.welcomed) {
      this.sendTo(session, encodeMessage({ type: MESSAGE_TYPE.ERROR, reason: CLOSE_REASON.HELLO_REQUIRED, detail: 'hello first' }));
      return;
    }
    switch (message.type) {
      case MESSAGE_TYPE.INPUT: this.receiveInput(session, message); break;
      case MESSAGE_TYPE.PING:
        this.acknowledge(session, message.snapshotAckTick);
        this.sendTo(session, encodeMessage({
          type: MESSAGE_TYPE.PONG, clientTimeMs: message.clientTimeMs, serverTimeMs: this.nowServerMs() >>> 0, serverTick: this.tick,
        }));
        break;
      case MESSAGE_TYPE.SNAPSHOT_ACK: this.acknowledge(session, message.tick); break;
      case MESSAGE_TYPE.LEAVE: session.left = true; break;
      case MESSAGE_TYPE.CHAT:
        this.broadcastEvent({ kind: 'chat', payload: { from: session.seat?.playerId ?? 'spectator', text: message.text } });
        break;
      default: break;
    }
  }

  private acknowledge(session: ClientSession, tick: number): void {
    if (tick === NO_TICK) { session.ackedTick = NO_TICK; return; }
    if (session.history.has(tick)) session.ackedTick = tick;
  }

  private receiveInput(session: ClientSession, message: InputMessage): void {
    this.stats.inputFrames++;
    session.inputFrames++;
    this.acknowledge(session, message.snapshotAckTick);
    if (!session.entity) return;
    if (message.clientTick > this.tick + this.maxTicksAhead) {
      session.inputRejected++;
      this.stats.inputRejected++;
      this.sendTo(session, encodeMessage({ type: MESSAGE_TYPE.ERROR, reason: CLOSE_REASON.INPUT_TOO_FAR_AHEAD, detail: 'too far ahead' }));
      return;
    }
    const count = message.controls.length;
    for (let index = 0; index < count; index++) {
      const tick = message.clientTick - count + 1 + index;
      if (tick <= session.newestControlTick || tick <= this.tick) continue;
      session.controls.set(tick, message.controls[index]!);
    }
    if (message.clientTick > session.newestControlTick) {
      session.newestControlTick = message.clientTick;
      // Ticks early the newest control arrived: it is applied at tick `clientTick`, the server is at `this.tick`.
      session.marginTicks = Math.max(-128, Math.min(126, message.clientTick - this.tick - 1));
      if (session.marginTicks < 0) this.stats.lateInputs++;
    }
  }

  private roster(): RosterEntry[] {
    return this.entities.map((entity) => ({
      entityId: entity.entityId,
      seat: entity.bot ? NO_SEAT : this.seats.findIndex((seat) => seat.entityId === entity.entityId),
      team: entity.team,
      bot: !!entity.bot,
      connected: !!entity.bot || this.sessions.some((session) => session.entity === entity && session.welcomed && !session.left),
      playerId: entity.playerId,
      name: entity.bot ? `Bot ${entity.entityId}` : this.seats.find((seat) => seat.entityId === entity.entityId)?.name ?? entity.playerId,
      specId: entity.specId,
    }));
  }

  // ------------------------------------------------------------ simulation

  private tickTimeMs(tick: number): number { return this.startedAtMs + tick * TICK_MS; }

  /** Server time between ticks (pongs are stamped with it). */
  private nowServerMs(): number { return Math.max(this.serverTimeMs, this.clock()); }

  /**
   * Run every tick due at `nowMs` (the clock by default). A fixed-step loop
   * that fell more than a quarter second behind (a stalled process) skips the
   * dead time instead of replaying it: the tick↔time anchor moves forward.
   */
  advance(nowMs = this.clock()): number {
    const behindMs = nowMs - this.tickTimeMs(this.tick);
    if (behindMs > MAX_CATCH_UP_MS) this.startedAtMs += behindMs - MAX_CATCH_UP_MS;
    let ticks = 0;
    while (this.tickTimeMs(this.tick + 1) <= nowMs) {
      this.tick++;
      this.simulateTick();
      ticks++;
    }
    return ticks;
  }

  private simulateTick(): void {
    this.stats.ticks++;
    const tick = this.tick;
    if (tick === this.countdownTicks) this.broadcastEvent({ kind: 'match_started', payload: { countdownMs: 0 } });
    if (this.verdictAtTick && tick === this.verdictAtTick.tick && this.verdict === VERDICT.NONE) {
      this.verdict = this.verdictAtTick.verdict;
      this.verdictReason = this.verdictAtTick.reason;
      this.broadcastEvent({ kind: 'match_ended', payload: { result: ['none', 'alpha', 'bravo', 'draw'][this.verdict], reason: this.verdictReason } });
    }
    const playing = this.phase === PHASE.PLAYING;
    for (const entity of this.entities) {
      if (entity.combat.destroyed) continue;
      if (entity.bot) this.driveBot(entity, tick, playing);
      else this.applySeatControls(entity, tick, playing);
      updateTank(entity, this.heightField, SIM_DT, null);
      entity.reloadS = Math.max(0, entity.reloadS - SIM_DT);
    }
    for (const shell of this.shells) {
      shell.pos.addScaledVector(shell.vel, SIM_DT);
      shell.vel.y -= 9.81 * SIM_DT;
    }
    for (let index = this.shells.length - 1; index >= 0; index--) {
      const shell = this.shells[index]!;
      if (tick - shell.bornTick < SHELL_LIFE_TICKS && shell.pos.y > this.heightField.getHeightAt(shell.pos.x, shell.pos.z)) continue;
      this.shells.splice(index, 1);
      this.broadcastEvent({
        kind: 'shell_impact',
        payload: { shellId: shell.id, shooterId: this.playerIdOf(shell.shooterEntityId), kind: 'terrain', x: shell.pos.x, y: shell.pos.y, z: shell.pos.z, nx: 0, ny: 1, nz: 0, shellType: 'AP', caliberMm: 120 },
      });
    }
    if (tick % TICKS_PER_SNAPSHOT === 0) this.publish();
    this.flushEvents();
  }

  private playerIdOf(entityId: number): string {
    return this.entities.find((entity) => entity.entityId === entityId)?.playerId ?? 'unknown';
  }

  private driveBot(entity: ServerEntity, tick: number, playing: boolean): void {
    const bot = entity.bot!;
    const drive = playing && bot.drive ? bot.drive(tick) : { throttle: 0, steer: 0 };
    entity.input.throttle = drive.throttle;
    entity.input.steer = drive.steer;
    entity.input.brake = !playing;
    if (playing && bot.fireEveryTicks && tick % bot.fireEveryTicks === 0) this.fire(entity, null, tick);
  }

  private applySeatControls(entity: ServerEntity, tick: number, playing: boolean): void {
    const session = this.sessions.find((candidate) => candidate.entity === entity && candidate.welcomed && !candidate.left);
    if (!session) {
      entity.input.throttle = 0; entity.input.steer = 0; entity.input.brake = true;
      return;
    }
    let control = session.controls.get(tick) ?? null;
    if (control) {
      session.controls.delete(tick);
      session.ackedInputTick = tick;
      session.lastApplied = control;
      this.stats.inputControlsApplied++;
    } else {
      control = session.lastApplied;
      if (control) this.stats.inputHeld++;
    }
    for (const stale of session.controls.keys()) if (stale < tick) session.controls.delete(stale);
    if (!control) return;
    const input = entity.input;
    input.throttle = playing ? control.throttle / 127 : 0;
    input.steer = playing ? control.steer / 127 : 0;
    input.brake = !playing || (control.flags & CONTROL_FLAGS.BRAKE) !== 0;
    input.aimLocked = (control.flags & CONTROL_FLAGS.AIM_LOCKED) !== 0;
    const yaw = control.aimYaw / 65536 * Math.PI * 2;
    const pitch = control.aimPitch / 32767 * Math.PI / 2;
    const distance = control.aimDistance / 20;
    const origin = entity.state.pos;
    input.aimPoint.set(
      origin.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      origin.y + Math.sin(pitch) * distance,
      origin.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    entity.shellSlot = control.shellSlot;
    if (seqNewer(control.fireSeq, entity.lastFireSeq)) {
      entity.lastFireSeq = control.fireSeq;
      if (playing) this.fire(entity, control.fireSeq, tick);
    }
    session.ackedFireSeq = control.fireSeq;
    if (seqNewer(control.actionSeq, entity.lastActionSeq)) {
      entity.lastActionSeq = control.actionSeq;
      this.enqueueEvent(session, { kind: 'consumable_used', payload: { id: entity.playerId, slot: control.actionBits, cooldownS: 30, readyAt: tick } });
    }
    session.ackedActionSeq = control.actionSeq;
  }

  private fire(entity: ServerEntity, fireSeq: number | null, tick: number): void {
    if (entity.reloadS > 0 || entity.ammo <= 0 || entity.combat.destroyed) return;
    entity.reloadS = this.reloadS;
    entity.ammo--;
    entity.lastFireTick = tick;
    this.stats.shotsFired++;
    const state = entity.state;
    const yaw = state.yaw + state.turretYaw;
    const direction = new Vector3(Math.sin(yaw), Math.sin(state.gunPitch), Math.cos(yaw)).normalize();
    const muzzle = new Vector3(state.pos.x + direction.x * 5, state.pos.y + 2 + direction.y * 5, state.pos.z + direction.z * 5);
    const shell: ServerShell = {
      id: this.nextShellId++, shooterEntityId: entity.entityId, pos: muzzle,
      vel: direction.clone().multiplyScalar(SHELL_SPEED_MPS), bornTick: tick,
    };
    this.shells.push(shell);
    this.broadcastEvent({
      kind: 'shell_fired',
      payload: {
        shellId: shell.id, shooterId: entity.playerId, fireIntentSeq: fireSeq, shellSlot: entity.shellSlot,
        shellType: 'AP', shellName: 'AP', muzzleIndex: -1, weaponSound: null, caliberMm: 120, velocityMps: SHELL_SPEED_MPS,
        x: muzzle.x, y: muzzle.y, z: muzzle.z, dx: direction.x, dy: direction.y, dz: direction.z,
      },
    });
  }

  // ------------------------------------------------------------ events + snapshots

  private broadcastEvent(event: WireEvent): void {
    for (const session of this.sessions) if (session.welcomed && !session.left) session.pendingEvents.push(event);
  }

  private enqueueEvent(session: ClientSession, event: WireEvent): void {
    session.pendingEvents.push(event);
  }

  private flushEvents(): void {
    for (const session of this.sessions) {
      if (!session.pendingEvents.length || !session.welcomed || session.left) { session.pendingEvents.length = 0; continue; }
      const events = session.pendingEvents.splice(0, 64);
      this.sendTo(session, encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: this.tick, events }));
      this.stats.eventsSent += events.length;
    }
  }

  private row(entity: ServerEntity): EntityRow {
    const state = entity.state;
    const reload = quantizeReloadS(entity.reloadS);
    return {
      entityId: entity.entityId,
      x: quantizePosition(state.pos.x), y: quantizePosition(state.pos.y), z: quantizePosition(state.pos.z),
      speed: quantizeVelocity(state.speed), verticalSpeed: quantizeVelocity(state.verticalSpeed),
      yaw: quantizeAngle(state.yaw), pitch: quantizeAngle(state.visualPitch), roll: quantizeAngle(state.visualRoll),
      turretYaw: quantizeAngle(state.turretYaw), gunPitch: quantizeAngle(state.gunPitch),
      hp: entity.hp, maxHp: entity.maxHp,
      reload, reloadTotal: quantizeReloadS(this.reloadS), reloadKind: reload > 0 ? RELOAD_KIND.SHELL : RELOAD_KIND.READY,
      gunReload: reload, gunReloadTotal: quantizeReloadS(this.reloadS), gunReloadKind: reload > 0 ? RELOAD_KIND.SHELL : RELOAD_KIND.READY,
      magazineRounds: 0, magazineCapacity: 0, shellSlot: entity.shellSlot,
      ammo0: entity.ammo, ammo1: 0, ammo2: 0,
      flags: (entity.combat.destroyed ? ENTITY_FLAGS.DESTROYED : 0) | (state.grounded ? 0 : ENTITY_FLAGS.AIRBORNE) |
        (state.overturned ? ENTITY_FLAGS.OVERTURNED : 0) | (entity.lastFireTick === this.tick ? ENTITY_FLAGS.FIRING : 0),
      eraSpent: [],
    };
  }

  private shellRow(shell: ServerShell): ShellRow {
    return {
      id: shell.id, shooterEntityId: shell.shooterEntityId,
      x: quantizePosition(shell.pos.x), y: quantizePosition(shell.pos.y), z: quantizePosition(shell.pos.z),
      vx: quantizeShellVelocity(shell.vel.x), vy: quantizeShellVelocity(shell.vel.y), vz: quantizeShellVelocity(shell.vel.z),
      shellType: shellTypeIndex('AP'), flags: 0,
    };
  }

  private viewerState(entity: ServerEntity): ViewerState {
    const checkpoint = captureMovementCheckpoint(entity.state);
    return {
      entityId: entity.entityId,
      modules: [0, 0, 0, 0, 0, 0, 0],
      crewBits: 3,
      equipment: [1000, 1000, 1000, 1000],
      modeSpeedMultiplier: 1000,
      modeGravityScale: 1000,
      movementVersion: checkpoint ? checkpoint.version : 0,
      movementFlags: checkpoint ? checkpoint.flags : 0,
      movementValues: checkpoint ? checkpoint.values : [],
    };
  }

  private visibleTo(session: ClientSession, entity: ServerEntity): boolean {
    const own = session.entity;
    if (!own || entity === own || entity.team === own.team) return true;
    return entity.state.pos.distanceTo(own.state.pos) <= this.visibilityRadiusM;
  }

  private captureFrame(session: ClientSession): SnapshotFrame {
    const entities = this.entities.filter((entity) => this.visibleTo(session, entity)).map((entity) => this.row(entity));
    return {
      tick: this.tick,
      serverTimeMs: this.serverTimeMs >>> 0,
      ackedInputTick: session.ackedInputTick,
      ackedFireSeq: session.ackedFireSeq,
      ackedActionSeq: session.ackedActionSeq,
      inputMarginTicks: session.marginTicks,
      meta: {
        phase: this.phase as 0 | 1 | 2 | 3,
        countdownMs: Math.max(0, Math.round((this.countdownTicks - this.tick) * TICK_MS)),
        battleTimeMs: Math.max(0, Math.round((this.tick - this.countdownTicks) * TICK_MS)),
        verdict: this.verdict as 0 | 1 | 2 | 3,
        verdictReason: this.verdictReason,
        destructibleRevision: this.destructibleRevision,
      },
      destroyed: this.destroyed,
      entities,
      shells: this.shells.map((shell) => this.shellRow(shell)),
      viewer: session.entity ? this.viewerState(session.entity) : null,
      modeStateJson: null,
    };
  }

  private publish(): void {
    for (const session of this.sessions) {
      if (!session.welcomed || session.left || session.transport.state !== 'open') continue;
      const frame = this.captureFrame(session);
      const baseline = session.ackedTick !== NO_TICK ? session.history.get(session.ackedTick) ?? null : null;
      const keyframe = !baseline || this.tick - session.lastKeyframeTick >= this.keyframeIntervalTicks;
      const packet = buildSnapshotPacket(frame, keyframe ? null : baseline);
      const bytes = encodeMessage(packet, keyframe ? null : baseline);
      if (this.sendTo(session, bytes)) {
        this.stats.snapshotsSent++;
        if (keyframe) { this.stats.keyframesSent++; session.lastKeyframeTick = this.tick; }
        session.history.set(frame.tick, frame);
        session.historyOrder.push(frame.tick);
        while (session.historyOrder.length > this.historyFrames) session.history.delete(session.historyOrder.shift()!);
      }
    }
  }

  private sendTo(session: ClientSession, bytes: Uint8Array): boolean {
    if (session.transport.state !== 'open') return false;
    const sent = session.transport.send(bytes);
    if (sent) this.stats.bytesSent += bytes.byteLength;
    return sent;
  }

  /** Per-session view for the receipts. */
  sessionInfo(transport: Transport): {
    welcomed: boolean; seated: boolean; ackedTick: number; controlsBuffered: number; marginTicks: number; inputRejected: number;
    left: boolean; inputFrames: number;
  } | null {
    const session = this.sessions.find((candidate) => candidate.transport === transport);
    return session ? {
      welcomed: session.welcomed, seated: session.entity !== null, ackedTick: session.ackedTick,
      controlsBuffered: session.controls.size, marginTicks: session.marginTicks, inputRejected: session.inputRejected,
      left: session.left, inputFrames: session.inputFrames,
    } : null;
  }

  /** A deliberate server-side close: the wire CLOSE precedes the socket close. */
  kick(transport: Transport, reason: number, detail: string): void {
    const session = this.sessions.find((candidate) => candidate.transport === transport);
    if (!session) return;
    this.sendTo(session, encodeMessage({ type: MESSAGE_TYPE.CLOSE, reason: reason as 0, detail }));
    session.left = true;
    transport.close('server', detail);
  }

  dispose(): void {
    for (const session of this.sessions) for (const off of session.unsubscribe) off();
    this.sessions.length = 0;
  }
}
