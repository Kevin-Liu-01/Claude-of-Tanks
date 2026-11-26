import type { DestructionLogEntry } from '../../sim/destructionEvents.ts';
import { mergeDestructionLogs, quantizeDestructionEntry } from '../wire/destructionLog.ts';
import type { AuthoritativePlayerInput, NewModeCheckpoint } from '../../sim/authoritativeMatch.ts';
import type { ModeCheckpoint } from '../../sim/matchModes.ts';
/**
 * Host migration state (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13.2 "Keyframes"): the browser host
 * broadcasts, every ROOM_MATCH_KEYFRAME_INTERVAL_MS, a keyframe of EVERY entity — sealed with AES-GCM under a key
 * derived from the per-match host secret, so a peer keeps it without reading it (the spotting invariant holds:
 * hidden enemy coordinates never reach a client in the clear; only the seat the room elects, which receives the host
 * secret in `host_changed`, can open it) — and, less often, the boot configuration the actor was created with. Both
 * ride wire EVENT messages (`mp:keyframe`, `mp:config`) in base64 chunks under MAX_EVENT_JSON_BYTES; the match client
 * assembles and retains the newest of each. The elected host opens them, restores the entities from the rows and the
 * extras (kills, damage, modules, crew, fires) and boots the actor at the retained tick.
 */
import type { MatchActor, MatchActorResume } from '../../../server/match/matchActor.ts';
import { eraPlateIndices } from '../wire/era.ts';
import { ENTITY_FLAGS, INPUT_MARGIN_UNKNOWN, MAX_EVENT_JSON_BYTES, NO_TICK, PHASE, TICK_MS, VERDICT } from '../wire/constants.ts';
import { applySnapshotPacket, buildSnapshotPacket, decodeMessage, encodeMessage } from '../wire/codec.ts';
import type { EntityRow, SnapshotFrame, WireEvent } from '../wire/messages.ts';
import { clampU8, dequantizePosition, dequantizeReloadS, dequantizeUnitComponent, quantizeAngle, quantizePosition, quantizeReloadS, quantizeVelocity } from '../wire/quantize.ts';
import { HULL_BODY_ROW_FLAGS, hullBodyRowFlags } from '../match/hullBodyRow.ts';
import { base64UrlToBytes, bytesToBase64Url } from '../match/base64url.ts';
import { applyAuthorityRow } from '../match/authorityRow.ts';
import { MIGRATION_EVENT_KIND, MIGRATION_MAX_CHUNKS } from '../match/migrationStore.ts';
import type { HostBootConfig, HostResumeReplay, HostResumeState, MigrationBrain, MigrationEntityExtras, MigrationReload } from './hostProtocol.ts';
import type { BotBrain } from '../../game/ai.ts';
import type { RoomMatchStatus } from '../room/protocol.ts';
import { FIRE_BASE_TICKS, selectShell, strainModule, tickModuleRepairs, tickReload } from '../../sim/damage.ts';
import type { CombatState, DamageTankSpec } from '../../sim/damage.ts';
import { applyConsumableMultipliers } from '../../sim/consumableRules.ts';
import type { ConsumableState } from '../../sim/consumableRules.ts';
import { createAuxiliaryState } from '../../sim/auxiliarySystems.ts';
import { spoolFromRest } from '../../sim/movement.ts';
import { encodeAimIntent } from '../../sim/aimIntent.ts';
import type { TankState } from '../../sim/movement.ts';
import { applyMovementPredictionState, captureMovementPredictionState, checkpointAirSpin, MOVEMENT_PREDICTION_SCALARS,
  MOVEMENT_PREDICTION_STATE_VALUES, restoreAirSpin } from '../../sim/movementPredictionState.ts';
import { bindSpecialActionState } from '../../sim/specialActions.ts';
import { magazineIndicator } from '../../sim/magazineIndicator.ts';
import type { AuxiliaryState } from '../../sim/auxiliarySystems.ts';
import type { SmokeScreen } from '../../sim/smokeScreen.ts';

export { MIGRATION_EVENT_KIND, MigrationStore, isMigrationEventKind } from '../match/migrationStore.ts';
export type { MigrationChunkPayload, RetainedBlob } from '../match/migrationStore.ts';

interface SubtleCryptoLike {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
  importKey(format: 'raw', keyData: Uint8Array, algorithm: { name: string }, extractable: boolean, usages: string[]): Promise<unknown>;
  encrypt(algorithm: { name: string; iv: Uint8Array }, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
  decrypt(algorithm: { name: string; iv: Uint8Array }, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
}

interface CryptoLike {
  subtle: SubtleCryptoLike;
  getRandomValues(array: Uint8Array): Uint8Array;
}

function cryptoOf(injected?: CryptoLike): CryptoLike {
  const api = injected ?? (globalThis as { crypto?: CryptoLike }).crypto;
  if (!api?.subtle) throw new Error('Web Crypto is unavailable in this runtime');
  return api;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const IV_BYTES = 12;
/** AES-GCM's tag on a sealed blob (sealMigrationBlob). */
const SEAL_TAG_BYTES = 16;
/** base64 of this many bytes plus the JSON envelope stays under MAX_EVENT_JSON_BYTES (4096). */
export const MIGRATION_CHUNK_BYTES = 2400;
const MAX_CHUNKS = MIGRATION_MAX_CHUNKS;

/** The AES-GCM key every migration blob of a match is sealed under: SHA-256(hostSecret ':migration'). */
export async function deriveMigrationKey(hostSecret: string, crypto?: CryptoLike): Promise<unknown> {
  if (typeof hostSecret !== 'string' || hostSecret.length < 16) throw new TypeError('a host secret of at least 16 characters is required');
  const api = cryptoOf(crypto);
  const raw = new Uint8Array(await api.subtle.digest('SHA-256', encoder.encode(`${hostSecret}:migration`)));
  return api.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function sealMigrationBlob(key: unknown, plain: Uint8Array, crypto?: CryptoLike): Promise<Uint8Array> {
  const api = cryptoOf(crypto);
  const iv = api.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(await api.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(IV_BYTES + sealed.byteLength);
  out.set(iv, 0);
  out.set(sealed, IV_BYTES);
  return out;
}

export async function openMigrationBlob(key: unknown, blob: Uint8Array, crypto?: CryptoLike): Promise<Uint8Array> {
  if (blob.byteLength <= IV_BYTES) throw new Error('migration blob too short');
  const api = cryptoOf(crypto);
  const iv = blob.subarray(0, IV_BYTES);
  return new Uint8Array(await api.subtle.decrypt({ name: 'AES-GCM', iv }, key, blob.subarray(IV_BYTES)));
}

// ------------------------------------------------------------ the keyframe payload: [u32 packet bytes][wire keyframe packet][json extras]

export interface MigrationKeyframe {
  modeCheckpoint?: NewModeCheckpoint | null;
  /** The battle the keyframe belongs to (round 3 A3; MatchActor.battleId): a resume from it keeps it. Absent: 0. */
  battleId?: number;
  tick: number;
  battleTimeMs: number;
  /** The authority clock (s) at `tick` (authority.timeS; battleTimeMs also counts a resumed host's offset). */
  timeS?: number;
  /** The battle clock (s) at `tick`, exact (275; authority.battleS): the float sum a new host's battle clock goes on from. */
  battleS?: number;
  phase: 'countdown' | 'playing' | 'ended';
  frame: SnapshotFrame;
  entities: MigrationEntityExtras[];
}

export function encodeMigrationKeyframe(keyframe: MigrationKeyframe): Uint8Array {
  const packet = encodeMessage(buildSnapshotPacket(keyframe.frame, null));
  const extras = encoder.encode(JSON.stringify({ tick: keyframe.tick, battleTimeMs: keyframe.battleTimeMs, timeS: keyframe.timeS, ...(typeof keyframe.battleS === 'number' ? { battleS: keyframe.battleS } : {}), phase: keyframe.phase, entities: keyframe.entities, modeCheckpoint: keyframe.modeCheckpoint,
    ...(keyframe.battleId ? { battleId: keyframe.battleId } : {}) }));
  const out = new Uint8Array(4 + packet.byteLength + extras.byteLength);
  new DataView(out.buffer).setUint32(0, packet.byteLength, true);
  out.set(packet, 4);
  out.set(extras, 4 + packet.byteLength);
  return out;
}

/**
 * The keyframe's bytes within what MIGRATION_MAX_CHUNKS chunks carry once sealed (275). A blob over it is no keyframe at all
 * (chunkMigrationBlob throws, and the seats keep an older one), and a full field's (42 hulls, CTF, a minute in) came near
 * it with the brains. Past it the keyframe sheds the 275 and 276 parts, the brains first, then the hulls (276: each live
 * hull exact), then the spotting, each a part a new host does without as gaps 274's did; `shed` names what went.
 */
export function encodeMigrationKeyframeWithin(keyframe: MigrationKeyframe): { bytes: Uint8Array; shed: string[] } {
  const limit = MIGRATION_CHUNK_BYTES * MAX_CHUNKS - IV_BYTES - SEAL_TAG_BYTES;
  const shed: string[] = [];
  let current = keyframe;
  let bytes = encodeMigrationKeyframe(current);
  const cuts: [string, (k: MigrationKeyframe) => MigrationKeyframe][] = [
    ['brains', (k) => ({ ...k, entities: k.entities.map(({ brain: _brain, ...rest }) => rest) })],
    ['hulls', (k) => ({ ...k, entities: k.entities.map(({ hull: _hull, ...rest }) => rest) })],
    ['spotting', (k) => (k.modeCheckpoint?.host ? { ...k, modeCheckpoint: { ...k.modeCheckpoint, host: { ...k.modeCheckpoint.host,
      spotting: { stream: null, records: [] } } } } : k)],
  ];
  for (const [what, cut] of cuts) {
    if (bytes.byteLength <= limit) break;
    current = cut(current);
    shed.push(what);
    bytes = encodeMigrationKeyframe(current);
  }
  return { bytes, shed };
}

function isExtras(value: unknown): value is MigrationEntityExtras {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return Number.isInteger(entry.entityId) && typeof entry.kills === 'number' && typeof entry.damage === 'number' &&
    !!entry.modules && typeof entry.modules === 'object' && !!entry.crew && typeof entry.crew === 'object' && typeof entry.burning === 'boolean';
}

export function decodeMigrationKeyframe(bytes: Uint8Array): MigrationKeyframe {
  if (bytes.byteLength < 4) throw new Error('migration keyframe too short');
  const packetBytes = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  if (4 + packetBytes > bytes.byteLength) throw new Error('migration keyframe truncated');
  const decoded = decodeMessage(bytes.subarray(4, 4 + packetBytes));
  if (!decoded.ok || decoded.message.type !== 17 || !decoded.message.keyframe) throw new Error('migration keyframe packet invalid');
  // A keyframe applies against no baseline, so this never throws missing_baseline.
  const frame = applySnapshotPacket(decoded.message, null);
  const extras = JSON.parse(decoder.decode(bytes.subarray(4 + packetBytes))) as Record<string, unknown>;
  const phase = extras.phase === 'countdown' || extras.phase === 'ended' ? extras.phase : 'playing';
  const entities = Array.isArray(extras.entities) ? extras.entities.filter(isExtras) : [];
  if (!Number.isInteger(extras.tick) || typeof extras.battleTimeMs !== 'number') throw new Error('migration keyframe extras invalid');
  return {
    tick: extras.tick as number, battleTimeMs: extras.battleTimeMs, phase, frame, entities,
    ...(typeof extras.timeS === 'number' && Number.isFinite(extras.timeS) && extras.timeS >= 0 ? { timeS: extras.timeS } : {}),
    ...(typeof extras.battleS === 'number' && Number.isFinite(extras.battleS) && extras.battleS >= 0 ? { battleS: extras.battleS } : {}),
    ...(extras.modeCheckpoint ? { modeCheckpoint: extras.modeCheckpoint as NewModeCheckpoint } : {}),
    ...(isBattleId(extras.battleId) && extras.battleId !== 0 ? { battleId: extras.battleId } : {}),
  };
}

const isBattleId = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff;

/**
 * A fresh battle id for a fallback restart (round 3 A3; WelcomeMessage.battleId): never 0 (a match's first battle), and
 * random, so it differs from the battle it replaces whatever this seat knows of that one (a reloaded kept host knows
 * nothing of it; 2^-32 is the chance two match).
 */
export function mintBattleId(crypto?: Pick<CryptoLike, 'getRandomValues'>): number {
  const api = crypto ?? (globalThis as { crypto?: Pick<CryptoLike, 'getRandomValues'> }).crypto;
  if (!api?.getRandomValues) throw new Error('Web Crypto is unavailable in this runtime');
  const bytes = api.getRandomValues(new Uint8Array(4));
  const id = (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24)) >>> 0;
  return id === 0 ? 1 : id;
}

// ------------------------------------------------------------ chunking over wire events

/** Split a sealed blob into EVENT payloads under MAX_EVENT_JSON_BYTES. */
export function chunkMigrationBlob(kind: typeof MIGRATION_EVENT_KIND[keyof typeof MIGRATION_EVENT_KIND], id: number, tick: number, blob: Uint8Array): WireEvent[] {
  const parts = Math.max(1, Math.ceil(blob.byteLength / MIGRATION_CHUNK_BYTES));
  if (parts > MAX_CHUNKS) throw new Error(`migration blob too large (${blob.byteLength} bytes)`);
  const events: WireEvent[] = [];
  for (let part = 0; part < parts; part++) {
    const slice = blob.subarray(part * MIGRATION_CHUNK_BYTES, (part + 1) * MIGRATION_CHUNK_BYTES);
    const payload = { id, tick, part, parts, data: bytesToBase64Url(slice) };
    const event: WireEvent = { kind, payload: payload as unknown as Record<string, unknown> };
    if (encoder.encode(JSON.stringify(event.payload)).byteLength > MAX_EVENT_JSON_BYTES) throw new Error('migration chunk over the event limit');
    events.push(event);
  }
  return events;
}

// ------------------------------------------------------------ the boot configuration blob

/** The configuration without the secret (the secret never rides the wire, sealed or not). */
type SealedBootConfig = Omit<HostBootConfig, 'hostSecret' | 'resume' | 'manifestBase' | 'simKernelsUrl'>;

export function encodeBootConfig(config: HostBootConfig): Uint8Array {
  const { hostSecret: _secret, resume: _resume, manifestBase: _base, simKernelsUrl: _kernels, ...rest } = config;
  return encoder.encode(JSON.stringify(rest));
}

export function decodeBootConfig(bytes: Uint8Array): SealedBootConfig {
  const value = JSON.parse(decoder.decode(bytes)) as Record<string, unknown>;
  if (typeof value.roomId !== 'string' || typeof value.matchId !== 'string' || typeof value.mapId !== 'string' || !Array.isArray(value.seats) || !Array.isArray(value.bots)) {
    throw new Error('boot config invalid');
  }
  return value as unknown as SealedBootConfig;
}

// ------------------------------------------------------------ restoring an actor from a keyframe

interface ReloadLike { t: number; totalS: number; kind: string }

function restoreReload(target: ReloadLike | undefined, remainingS: number, totalS: number, kind: string): ReloadLike {
  if (!target) return { t: remainingS, totalS, kind };
  target.t = remainingS;
  target.totalS = totalS;
  target.kind = kind;
  return target;
}

const RELOAD_KINDS = ['ready', 'shell', 'intraClip', 'magazine'] as const;
const isReloadKind = (kind: unknown): kind is typeof RELOAD_KINDS[number] => (RELOAD_KINDS as readonly unknown[]).includes(kind);
const finiteOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const captureReload = (reload: ReloadLike | undefined): MigrationReload => [reload?.t ?? 0, reload?.totalS ?? 0, reload?.kind ?? 'ready'];
/** A channel at rest (loaded, no cycle running): the fresh host's own channel is that already (damage.ts createCombatState). */
const reloadAtRest = (reload: ReloadLike | undefined): boolean => !reload || (reload.t <= 0 && reload.kind === 'ready');
function writeReload(target: ReloadLike | undefined, carried: MigrationReload | null | undefined): void {
  if (!target || !Array.isArray(carried)) return;
  target.t = Math.max(0, finiteOr(carried[0], target.t));
  target.totalS = Math.max(0, finiteOr(carried[1], target.totalS));
  if (isReloadKind(carried[2])) target.kind = carried[2];
}

/**
 * The selected shell slot and the reload pointer move together, as damage.ts selectShell keeps them (audit M1: the slot
 * was set alone, so a vehicle with its launcher selected wrote the launcher's cycle onto the cannon channel and the two
 * swapped timers). selectShell refuses an empty slot; the old host may still have had one selected (its last round
 * fired), so that slot is taken with its own channel the same way.
 */
function restoreShellSlot(combat: CombatState, slot: number, spec: DamageTankSpec): void {
  if (selectShell(combat, slot, spec)) return;
  const shells = spec.gun.shells?.length ?? 0;
  const bounded = shells ? Math.max(0, Math.min(shells - 1, slot | 0)) : slot | 0;
  combat.shellSlot = bounded;
  const channel = combat.reloadChannels?.[bounded];
  if (channel) combat.reload = channel;
}

/**
 * An entity's two readings on a resume (audit M1, review round 1). The extras describe it at the keyframe's tick; its row
 * at the row's own tick, which is later when the elected seat's newest frame overlaid the keyframe's rows
 * (resumeStateFromRetained), by up to the keyframe interval (2 s). A newer row wins for everything it carries: the
 * selected and cannon reload channels, ammunition, the magazine or salvo indicator, burning, the auxiliary state (the old
 * host's absolute times, read on its clock at the row's tick). The extras fill in what the row does not carry, aged by
 * the gap through the simulation's own laws. On the keyframe's own row (no gap) the extras are exact and win: the row's
 * reload times are quantized.
 * Round 2 (U2): the gaps are sim time, and every entity ages to the resume frame. The ticks overstated the sim time when
 * the old host's loop dropped ticks on a stall (server/match/loop.ts: the tick keeps the wall grid while the sim stands),
 * which over-aged reloads, repairs, cooldowns, item windows and fires and ran the old-clock reading of a row's auxiliary
 * times ahead; the frame's battle clock (sim time, matchActor.ts battleTimeMs) is exact. And a row a delta left untouched
 * (or an interest tier held) keeps its older tick, so the keyframe's row stood for it with no gap and its extras came back
 * unaged by up to a keyframe interval although the world had moved on: the rest of the way (`tailS`) ages them too.
 */
interface ResumeReading {
  readonly row: EntityRow;
  /** Sim seconds the row is newer than the extras (0: the keyframe's own row): the row wins for what it carries. */
  readonly gapS: number;
  /** Sim seconds from the row's reading to the resume frame's: everything the entity carries ages by them as well. */
  readonly tailS: number;
  /** The old host's authority clock (s) at the row's reading; null when the keyframe did not carry it. */
  readonly clockS: number | null;
}

/**
 * The sim time from the extras' capture to the resume frame (round 2 U2): the two battle clocks (the frame meta's
 * battleTimeMs, the keyframe's), never more than their ticks allow; the ticks alone for a state that names no keyframe
 * battle clock.
 */
function resumeFrameGapS(state: HostResumeState, extrasTick: number): number {
  const ticksS = Math.max(0, state.frame.tick - extrasTick) * TICK_MS / 1000;
  const battle = state.keyframeBattleTimeMs;
  if (typeof battle !== 'number' || !Number.isFinite(battle) || !Number.isFinite(state.battleTimeMs)) return ticksS;
  return Math.max(0, Math.min(ticksS, (state.battleTimeMs - battle) / 1000));
}

const isDestroyedRow = (row: EntityRow): boolean => (row.flags & ENTITY_FLAGS.DESTROYED) !== 0 || row.hp <= 0;

/**
 * The hulls a mode revived after their extras were captured (audit M1, review round 2), by authoritative id: a newer row
 * of a hull the keyframe's row had destroyed (HostResumeState.revivedEntityIds), or one this seat was told respawned
 * after the keyframe and no later than its row (respawnTicks: a hull revived while alive, a Turbo Ball goal's kick-off).
 * The revive built the hull's combat state and kit anew (authoritativeMatch.ts reviveForMode), so its extras are the life
 * it left: written onto the fresh hull they brought back the dead crew, the red modules at 0 hp, the spent charges and
 * cooldowns, the old reload channels.
 */
function revivedSinceKeyframe(actor: MatchActor, state: HostResumeState, extrasTick: number): Set<string> {
  const revived = new Set<string>();
  const byRow = new Set(state.revivedEntityIds ?? []);
  const respawned = new Map(state.respawnTicks ?? []);
  if (!byRow.size && !respawned.size) return revived;
  for (const row of state.frame.entities) {
    if (row.tick <= extrasTick) continue;
    const entity = actor.entityForWireId(row.entityId);
    if (!entity) continue;
    const at = respawned.get(entity.id);
    if (byRow.has(row.entityId) || (at !== undefined && at > extrasTick && at <= row.tick)) revived.add(entity.id);
  }
  return revived;
}

/**
 * What the elected seat knows of the old host's window, the stretch between the keyframe and its newest frame (gaps 274
 * fix-up r1), on the mode checkpoint's clock: the mode time each hull was told rose at (respawnTicks: the keyframe's mode
 * time and the sim time to the tick, never past the frame's battle clock, which caps a tick count the old host's dropped
 * ticks overstate), and the frame's mode time. The restore reads the revives it replays (an arrival of the Horde's
 * trickle) and a line advance's moment from it.
 */
interface ResumeWindow {
  readonly told: ReadonlyMap<string, number>;
  readonly frameAtS: number;
}
const NO_WINDOW: ResumeWindow = { told: new Map(), frameAtS: Number.NaN };
function resumeWindow(state: HostResumeState, checkpoint: NewModeCheckpoint, extrasTick: number, frameGapS: number): ResumeWindow {
  const elapsedS = checkpoint.mode?.elapsedS;
  if (typeof elapsedS !== 'number' || !Number.isFinite(elapsedS)) return NO_WINDOW;
  const told = new Map<string, number>();
  for (const [id, tick] of state.respawnTicks ?? []) {
    if (typeof id === 'string' && Number.isInteger(tick)) told.set(id, elapsedS + Math.min(frameGapS, Math.max(0, tick - extrasTick) * TICK_MS / 1000));
  }
  return { told, frameAtS: elapsedS + frameGapS };
}

/**
 * The keyframe's mode checkpoint with the bookkeeping each of those revives did (matchModes.ts reviveAtSpawn: the pending
 * respawn dropped, alive, its death unscored, back on the field and no longer resting). Without it the new host's mode
 * revived the hull a second time when the keyframe's respawn fell due: back on its spawn, its fight reset again.
 * The life itself too (integration IR2, 2026-11-03): restoreCheckpoint reads `lives` before `destroyed`, so a hull the
 * keyframe had down came back 'down' (set alive later only by the death watch's restore side door) and one it had benched
 * came back benched and stayed off the field. A rescued hull has left for good and is never revived (reviveAtSpawn).
 * The hunt too (round 8 Y2 fix-up r2): a revive starts a hunter's search over (matchModes.ts resetHunterSearch), so the
 * keyframe's record is the dead life's (its anchor, director lead and spent sighting) and is dropped; the new host's
 * first plan that finds the hunter no quarry anchors it where it then stands, with no lead (stepHunterSearch). Its plan
 * stays, as on the old host, which keeps a revived hunter's plan until the next one (a hunter with no plan re-plans
 * every hunter at once, off the old host's clock). Not replayed: the lead the arrival drew and the arrivals' lead seed
 * it advanced, which need the old host's sightings and arrival point at the revive. huntSearchMigration.selftest [5].
 * The CTF raid's stage too (round 8 Y2 residual): the old host drops a fallen raider's stage at its death (matchModes.ts
 * setLife's down edge; gaps 274 G4, Kevin 2026-11-18: it waited for the next role deal), so a keyframe sealed before the
 * death holds the life's stage (going in, or still waiting), and the revived raider stages afresh and waits raidWaitS
 * for its group; the keyframe's entry is dropped whatever its go, every other raider's kept, a waiting one's too.
 * Frontline's attack plan the same way (gaps 274 G5): the old host drops a fallen attacker's plan at its death and plans
 * the revived one afresh, so it waits at the edge for its group; the keyframe's plan for it (pushing, or staged) is
 * dropped, every other attacker's kept. huntSearchMigration.selftest [6] window revive.
 * The Horde's trickle too (gaps 274 fix-up r1): a hostile revived in the window with a queue to trickle and no refused
 * arrival pending was the trickle's arrival, which took it out of the queue and ran the trickle's clock on; each is named
 * with the mode time it was told at (else the frame's), in their order, at most the queue (WaveCheckpoint.horde.trickled),
 * and the restore takes it up as made (matchModes.ts trickleHorde). A refused arrival due again (a pending respawn) was
 * owed by the wave already. Before, the new host's first step found the keyframe's trickle clock run out and brought one
 * more hostile on. waveStartMigration.selftest [6].
 * Frontline's reinforce trickle the same way (gaps 274 fix-up r2): a defender revived in the window with no refused
 * arrival pending was the trickle's arrival from the rear (or a line advance's, which checkpointAtNewestFrame tells
 * apart by its moment), named with the mode time it was told at (WaveCheckpoint.line.reinforced); the restore takes it
 * up as made (matchModes.ts stepReinforceTrickle). Before, the new host's first step found the keyframe's clock run out
 * and brought a second defender on, 45 s before the old host's next. waveStartMigration.selftest [9].
 */
function checkpointAfterRevives(checkpoint: NewModeCheckpoint, revived: ReadonlySet<string>, known: ResumeWindow = NO_WINDOW): NewModeCheckpoint {
  if (!revived.size || !checkpoint.mode) return checkpoint;
  const mode = checkpoint.mode, waves = mode.waves, hunt = mode.hunt, objectives = mode.objectives;
  const horde = waves?.horde, line = waves?.line;
  // the hostiles revived in the window as a director's arrival (none was a refused arrival due again), in their order
  const pending = new Set(mode.respawns.map(([id]) => id));
  const hostile = new Set(mode.teams.filter(([, team]) => team === 'bravo').map(([id]) => id));
  const arrived = (): [string, number][] => [...revived].filter((id) => hostile.has(id) && !pending.has(id))
    .map((id): [string, number] => [id, known.told.get(id) ?? known.frameAtS]).filter(([, atS]) => Number.isFinite(atS))
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const trickled = horde && horde.queued > 0 ? arrived().slice(0, horde.queued) : [];
  const reinforced = line ? arrived() : [];
  // the hostiles a due respawn stood up (275): a Horde arrival refused and due again, an Infected arrival on its ring
  const ringRisen = [...revived].filter((id) => hostile.has(id) && pending.has(id))
    .map((id): [string, number] => [id, known.told.get(id) ?? known.frameAtS]).filter(([, atS]) => Number.isFinite(atS))
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  return {
    ...checkpoint,
    // a revive clears the bot's last pushed target (matchModes.ts reviveAtSpawn), so its next route push is made (275),
    // and its fire's starter and last attacker (279: authoritativeMatch.ts reviveForMode)
    ...(checkpoint.host ? { host: { ...checkpoint.host, targets: checkpoint.host.targets.filter(([id]) => !revived.has(id)),
      ...(checkpoint.host.fireStarters ? { fireStarters: checkpoint.host.fireStarters.filter(([id]) => !revived.has(id)) } : {}),
      ...(checkpoint.host.recentDamage ? { recentDamage: checkpoint.host.recentDamage.filter(([id]) => !revived.has(id)) } : {}) } } : {}),
    mode: {
      ...mode,
      respawns: mode.respawns.filter(([id]) => !revived.has(id)),
      destroyed: mode.destroyed.map(([id, dead]): [string, boolean] => [id, dead && !revived.has(id)]),
      ...(mode.lives ? { lives: mode.lives.map(([id, life]): [string, typeof life] => [id, revived.has(id) && life !== 'rescued' ? 'alive' : life]) } : {}),
      scored: mode.scored.filter((id) => !revived.has(id)),
      ...(ringRisen.length ? { ringRisen } : {}),
      ...(waves ? { waves: { ...waves, inactive: waves.inactive.filter((id) => !revived.has(id)), restedAt: waves.restedAt.filter(([id]) => !revived.has(id)),
        ...(line ? { line: { ...line, ...(line.attack ? { attack: line.attack.filter(([id]) => !revived.has(id)) } : {}),
          // a revived ally's down clock was its dead life's (276 round 6: killed again, it stood up early)
          allyDownAt: line.allyDownAt.filter(([id]) => !revived.has(id)),
          ...(reinforced.length ? { reinforced } : {}) } } : {}),
        ...(horde && trickled.length ? { horde: { ...horde, trickled } } : {}) } } : {}),
      ...(hunt ? { hunt: { ...hunt, searches: hunt.searches.filter(([id]) => !revived.has(id)) } } : {}),
      ...(objectives?.raids ? { objectives: { ...objectives, raids: objectives.raids.filter(([id]) => !revived.has(id)) } } : {}),
    },
  };
}

type CheckpointZone = NonNullable<ModeCheckpoint['objectives']>['zones'][number];
type CheckpointFlag = NonNullable<ModeCheckpoint['objectives']>['flags'][number];
const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isTeam = (value: unknown): value is CheckpointFlag['team'] => value === 'alpha' || value === 'bravo';
const FLAG_STATUSES: ReadonlySet<unknown> = new Set(['home', 'carried', 'dropped']);
const recordOf = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' ? value as Record<string, unknown> : null);

/**
 * A score the newest frame shows (published rounded: matchModes.ts serialize), against the keyframe's exact one: kept
 * when it rounds to what the frame shows; else the frame's, which is exact for a mode that scores whole points, and for
 * Zone Control's running score the least value that rounds to it, never above the old host's.
 */
function scoreAtFrame(held: number, shown: unknown): number {
  if (!finiteNumber(shown) || Math.round(held) === shown) return held;
  return Number.isInteger(held) ? shown : Math.max(held, shown - 0.5);
}

/** A zone's control, owner and contest as the newest frame shows it (by id), else the keyframe's. */
function zoneAtFrame(zone: CheckpointZone, shown: ReadonlyMap<string, Record<string, unknown>>): CheckpointZone {
  const view = shown.get(zone.id);
  if (!view || !finiteNumber(view.control) || !(view.owner === null || isTeam(view.owner)) || typeof view.contested !== 'boolean') return zone;
  return { id: zone.id, control: view.control, owner: view.owner, contested: view.contested };
}

/**
 * The mode checkpoint carried forward to the newest frame this seat holds (round 2 U2, review round 1). The checkpoint is
 * dated at the keyframe, the hulls at the newest frame (resumeStateFromRetained), and everything the mode did between
 * the two came back undone: a goal or a capture, the zone's meter, the ball's flight, a flag taken, a survivor infected.
 * The newest frame's mode state (matchModes.ts serialize, on every frame of a mode with one) holds those: the score,
 * every flag, zone and the ball, and the infection's factions. They are written over the checkpoint's; what the frame
 * does not show stays the keyframe's, and the mode-event keyframe (matchHostCore.ts housekeep) follows every event that
 * changes it: the horde's queue and pool, the assault line's sector and its pool, pickups and their sequence, weapon
 * kills, respawn timers. The line's zones are taken only while the frame shows the keyframe's sector. The goals stand
 * where the map put them. A ball touched, scored or reset in the gap starts its idle clock at the resume (the frame
 * carries no touch time; the new host's mode clock starts at the keyframe's). A Horde wave the frame shows begun after
 * the keyframe is named (begunWave, gaps 274 G2): the restore takes it up as begun. So is a Frontline line the frame
 * shows advanced after it (line.begun, gaps 274 fix-up r1): its zones are the frame's, the advance's moment the newest
 * time the seat was told a defender rose (the advance's reinforcement; else the frame's: the frame carries no advance
 * time, so a counter-attack is then up to the window late), the defenders told risen then are named, and the restore
 * takes the advance up as begun (matchModes.ts advanceLine) rather than taking the sector again and advancing twice; a
 * defender told risen before it was the reinforce trickle's (line.reinforced), and none after it is. Fix-up r2 names the
 * director's other moves the window held: a Horde wave cleared there (horde.cleared: the frame shows the lull running,
 * or the clear's own step, where the keyframe had none due), taken up as made (matchModes.ts clearHordeWave); and a
 * counter-attack launched there (line.counter.launched: the frame is past its moment and the keyframe's had no squad),
 * whose squad the new host picks on its first step and does not announce. Before, the new host cleared the wave again
 * (a second repair and cache) and launched the counter again (a second mode_counter_attack). And a cache taken there:
 * the frame lists the active caches (serialize), so one the keyframe holds active that the frame does not list was taken
 * (or an air drop expired) and stays taken; the hull's row carries its repair or rounds. Before, it lay there again, and
 * the hull that took it, still on it, took it a second time on the new host's first step.
 */
export function checkpointAtNewestFrame(checkpoint: NewModeCheckpoint, modeStateJson: string | null, known: ResumeWindow = NO_WINDOW): NewModeCheckpoint {
  const mode = checkpoint.mode;
  if (!mode || !modeStateJson) return checkpoint;
  let view: Record<string, unknown> | null;
  try { view = recordOf(JSON.parse(modeStateJson)); } catch { return checkpoint; }
  if (!view) return checkpoint;
  const shownScore = recordOf(view.score);
  const score = shownScore ? { alpha: scoreAtFrame(mode.score.alpha, shownScore.alpha), bravo: scoreAtFrame(mode.score.bravo, shownScore.bravo) } : mode.score;
  const factions = Array.isArray(view.factions) ? new Map(view.factions.map(recordOf).filter((entry): entry is Record<string, unknown> => !!entry && typeof entry.id === 'string' && isTeam(entry.team))
    .map((entry) => [entry.id as string, entry.team as CheckpointFlag['team']])) : null;
  const teams = factions ? mode.teams.map(([id, team]): [string, typeof team] => [id, factions.get(id) ?? team]) : mode.teams;
  const zones = new Map((Array.isArray(view.zones) ? view.zones : []).map(recordOf).filter((zone): zone is Record<string, unknown> => !!zone && typeof zone.id === 'string')
    .map((zone) => [zone.id as string, zone]));
  const next: ModeCheckpoint = { ...mode, score, teams };
  // the caches the frame lists active: one the checkpoint holds active and the frame does not was taken in the window; one
  // it lists that the checkpoint holds taken was taken by a replay's play alone (276: a seat's held hull drove onto it)
  const shownCaches = Array.isArray(view.pickups)
    ? new Set(view.pickups.map(recordOf).filter((cache): cache is Record<string, unknown> => !!cache && typeof cache.id === 'string').map((cache) => cache.id as string)) : null;
  const caches = <T extends { id: string; active: boolean }>(list: T[]): T[] =>
    (shownCaches && Array.isArray(list) ? list.map((cache) => (cache.active !== shownCaches.has(cache.id) ? { ...cache, active: !cache.active } : cache)) : list);
  if (mode.support) next.support = { ...mode.support, pickups: caches(mode.support.pickups) };
  if (mode.waves?.horde) next.waves = { ...mode.waves, horde: { ...mode.waves.horde, pickups: caches(mode.waves.horde.pickups) } };
  const objectives = mode.objectives;
  if (objectives) {
    const flags = new Map((Array.isArray(view.flags) ? view.flags : []).map(recordOf).filter((flag): flag is Record<string, unknown> => !!flag && isTeam(flag.team))
      .map((flag) => [flag.team as string, flag]));
    const flagAtFrame = (flag: CheckpointFlag): CheckpointFlag => {
      const shown = flags.get(flag.team);
      if (!shown || !finiteNumber(shown.x) || !finiteNumber(shown.y) || !finiteNumber(shown.z) || !FLAG_STATUSES.has(shown.status)
        || !(shown.carrierId === null || typeof shown.carrierId === 'string') || !(shown.returnAtS === null || finiteNumber(shown.returnAtS))) return flag;
      return { team: flag.team, x: shown.x, y: shown.y, z: shown.z, status: shown.status as CheckpointFlag['status'], carrierId: shown.carrierId, returnAtS: shown.returnAtS };
    };
    let { ball, ballActiveAtS } = objectives;
    const shownBall = recordOf(view.ball);
    if (ball && shownBall && ['x', 'y', 'z', 'vx', 'vy', 'vz'].every((key) => finiteNumber(shownBall[key])) && (shownBall.lastTouchId === null || typeof shownBall.lastTouchId === 'string')) {
      const changedHands = shownBall.lastTouchId !== ball.lastTouchId || score.alpha !== mode.score.alpha || score.bravo !== mode.score.bravo;
      ball = { x: shownBall.x as number, y: shownBall.y as number, z: shownBall.z as number, vx: shownBall.vx as number, vy: shownBall.vy as number, vz: shownBall.vz as number, lastTouchId: shownBall.lastTouchId as string | null };
      if (changedHands) ballActiveAtS = Math.max(ballActiveAtS, mode.elapsedS);
    }
    next.objectives = { ...objectives, flags: objectives.flags.map(flagAtFrame), zones: objectives.zones.map((zone) => zoneAtFrame(zone, zones)), ball, ballActiveAtS,
      ...(objectives.caches ? { caches: { ...objectives.caches, pickups: caches(objectives.caches.pickups) } } : {}) };
  }
  const line = mode.waves?.line, shownIndex = recordOf(view.line)?.index;
  // a counter-attack due by the frame's moment with no squad at the keyframe: the old host launched it in the window
  const counter = line?.counter && !line.counter.ids.length && Number.isFinite(known.frameAtS) && known.frameAtS >= line.counter.atS
    ? { ...line.counter, launched: true } : line?.counter ?? null;
  if (line && shownIndex === line.index) next.waves = { ...(next.waves ?? mode.waves!), line: { ...line, counter, zones: line.zones.map((zone) => zoneAtFrame(zone, zones)) } };
  else if (line && Number.isInteger(shownIndex) && (shownIndex as number) > line.index) {
    const defenders = new Set(mode.teams.filter(([, team]) => team === 'bravo').map(([id]) => id));
    const told = [...known.told].filter(([id]) => defenders.has(id));
    const atS = told.length ? Math.max(...told.map(([, at]) => at)) : Number.isFinite(known.frameAtS) ? known.frameAtS : mode.elapsedS;
    const risen = told.filter(([, at]) => at === atS).map(([id]) => id).sort();
    // the reinforce trickle's arrivals came before the advance (its reinforcement is the newest told)
    const reinforced = (line.reinforced ?? []).filter(([, at]) => at < atS);
    const { reinforced: _named, ...rest } = line;
    next.waves = { ...(next.waves ?? mode.waves!), line: { ...rest, counter, ...(reinforced.length ? { reinforced } : {}), zones: line.zones.map((zone) => zoneAtFrame(zone, zones)),
      begun: { index: shownIndex as number, atS, risen } } };
  }
  // a Horde wave the old host began after the keyframe (gaps 274, G2): the frame shows its number, and the restore takes
  // it up as begun (matchModes.ts startHordeWave) rather than finding the lull run out and beginning it again
  const shownHorde = recordOf(view.horde), horde = mode.waves?.horde, shownWave = shownHorde?.wave;
  if (horde && Number.isInteger(shownWave) && (shownWave as number) > mode.waves!.wave) {
    next.waves = { ...(next.waves ?? mode.waves!), horde: { ...next.waves!.horde!, begunWave: shownWave as number } };
  } else if (horde && shownHorde && shownWave === mode.waves!.wave && horde.nextWaveAtS === null && Number.isFinite(known.frameAtS)
    && finiteNumber(shownHorde.nextWaveInS) && (shownHorde.nextWaveInS > 0 || (shownHorde.alive === 0 && shownHorde.queued === 0))) {
    // a wave the old host cleared after the keyframe (fix-up r2): the lull the frame shows running, or the clear's own
    // step (its field and queue empty, the lull not yet counted down), on the frame's mode clock
    next.waves = { ...(next.waves ?? mode.waves!), horde: { ...next.waves!.horde!, cleared: [known.frameAtS, shownHorde.nextWaveInS] } };
  }
  return { ...checkpoint, mode: next };
}

/** What a revive leaves of an entity's extras (reviveForMode: a fresh combat state and kit): its tallies alone. */
const freshLife = (extras: MigrationEntityExtras): MigrationEntityExtras =>
  ({ entityId: extras.entityId, kills: extras.kills, damage: extras.damage, modules: {}, crew: {}, burning: false });

/** The authority's fire tick (authoritativeMatch.ts FIRE_TICK_S; damage.ts tickFire is "one 0.5 s fire tick"). */
const FIRE_TICK_S = 0.5;
/** The multipliers a timed item bends (consumableRules.ts applyConsumableMultipliers). */
const ITEM_MULT_KEYS = ['reload', 'aimTime', 'repair', 'power'] as const;
const multOf = (mults: Record<string, unknown> | undefined, key: string): number => {
  const value = mults?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 1;
};

/**
 * Restore the timed items still active, folded onto the multipliers the new host already holds (review round 1). The
 * entity was just made, so no item is active yet and each multiplier is its equipment's value times its mode's stamps
 * (the Juggernaut boss's reload, a wave hostile's, the infected's, the AC-130 escort's: matchModes.ts stamps them after
 * the consumables took their base). applyConsumableMultipliers counts from that base, so on its own it erased every stamp
 * (the boss reloaded twice as slowly after each handoff). Each key keeps the ratio it had to the rebuild's no-item value,
 * whatever the rebuild counts from (the base, or audit M5's named layers, where the ratio is 1). Nothing is rebuilt when
 * no item is restored, the common case.
 */
function restoreActiveItems(consumables: ConsumableState, combat: CombatState, active: readonly (readonly [string, number])[], timeS: number): void {
  if (!active.length) return;
  const target = combat as unknown as Parameters<typeof applyConsumableMultipliers>[1];
  const mults = (target.equipMults ??= {});
  const held = ITEM_MULT_KEYS.map((key) => multOf(mults, key));
  applyConsumableMultipliers(consumables, target, timeS);
  const bare = ITEM_MULT_KEYS.map((key) => multOf(mults, key));
  for (const [item, leftS] of active) (consumables.until as Record<string, number>)[item] = timeS + leftS;
  applyConsumableMultipliers(consumables, target, timeS);
  ITEM_MULT_KEYS.forEach((key, index) => {
    if (bare[index] !== 0 && held[index] !== bare[index]) mults[key] = multOf(mults, key) * held[index]! / bare[index]!;
  });
}

/** A row's auxiliary state (auxiliarySystems.ts auxiliaryRowJson: absolute times on the old host's clock) as an extras entry, seconds left from `clockS`. */
function rowAuxiliary(json: string | undefined, clockS: number): MigrationEntityExtras['auxiliary'] | null {
  if (!json) return null;
  let aux: Record<string, unknown>;
  try { aux = JSON.parse(json) as Record<string, unknown>; } catch { return null; }
  if (!aux || typeof aux !== 'object') return null;
  const leftAt = (at: unknown): number => Math.max(0, finiteOr(at, clockS) - clockS);
  const stations = Array.isArray(aux.stations)
    ? aux.stations.map((station: { shots?: unknown; nextShot?: unknown } | null): [number, number] => [Number(station?.shots), leftAt(station?.nextShot)]) : undefined;
  return {
    lights: aux.lights as -1 | 0 | 1, gunOn: aux.gunOn as boolean, smokeCharges: aux.smokeCharges as number, smokeReadyIn: leftAt(aux.smokeReadyAt),
    shots: aux.shots as number, nextShotIn: leftAt(aux.nextShot), ...(stations ? { stations } : {}),
  };
}

/** The fight's counters an extras entry carries (MigrationEntityExtras), through the functions the simulation uses. */
function restoreCombatExtras(combat: CombatState, consumables: ConsumableState | null | undefined, extras: MigrationEntityExtras, timeS: number, reading: ResumeReading): void {
  const { row, gapS, tailS } = reading;
  const newer = gapS > 0;
  // what the row does not carry ages all the way to the resume frame (the reload channels: to the row here, applyResumeState
  // ages them the rest of the way once the row's own are written)
  const totalS = gapS + tailS;
  const ageS = (leftS: unknown): number => Math.max(0, finiteOr(leftS, 0) - totalS);
  // modules: the hp, the law's state from it (damage.ts strainModule: a fresh module is at full hp), red repair progress
  if (extras.moduleHp && typeof extras.moduleHp === 'object') {
    for (const [moduleId, carried] of Object.entries(extras.moduleHp)) {
      const module = (combat.modules as Record<string, { hp: number; maxHp: number; state: string; repairT: number } | undefined>)[moduleId];
      if (!module || !Array.isArray(carried) || !(module.maxHp > 0)) continue;
      const hp = Math.max(0, Math.min(module.maxHp, finiteOr(carried[0], module.maxHp)));
      strainModule(combat, moduleId, hp / module.maxHp);
      if (module.state === 'red') module.repairT = Math.max(0, finiteOr(carried[1], 0));
    }
  }
  // the fire: burning as the newer row has it; a fire the extras knew burns its budget down by the fire ticks since, one
  // lit since starts with the budget a fire starts with (damage.ts); otherwise the extras' budget
  const burning = newer ? (row.flags & ENTITY_FLAGS.BURNING) !== 0 : extras.burning;
  if (combat.fire) {
    combat.fire.burning = burning;
    if (burning && extras.burning && Array.isArray(extras.fire)) {
      combat.fire.ticksLeft = Math.max(1, Math.round(finiteOr(extras.fire[0], 1)) - Math.floor(totalS / FIRE_TICK_S));
      combat.fire.tickTimer = Math.max(0, finiteOr(extras.fire[1], 0));
    } else if (burning && newer) {
      const budget = Math.max(2, Math.round(FIRE_BASE_TICKS * multOf(combat.equipMults as Record<string, unknown> | undefined, 'fireTicks')));
      combat.fire.ticksLeft = Math.max(1, budget - Math.floor(tailS / FIRE_TICK_S));
      combat.fire.tickTimer = 0;
    }
  }
  // every channel by slot (a shared channel takes the same values twice), then the cannon's; the magazine and the salvo
  // as the keyframe had them (a newer row's channels and counts are written over these, applyResumeState)
  if (Array.isArray(extras.reloads) && combat.reloadChannels) {
    for (let slot = 0; slot < combat.reloadChannels.length && slot < extras.reloads.length; slot++) writeReload(combat.reloadChannels[slot], extras.reloads[slot]);
  }
  if (extras.gunReload) writeReload(combat.gunReload ?? combat.reload, extras.gunReload);
  if (combat.magazine && Number.isInteger(extras.magazineRounds)) combat.magazine.rounds = Math.max(0, Math.min(combat.magazine.capacity, extras.magazineRounds!));
  if (Number.isInteger(extras.launcherSalvoShots)) combat.launcherSalvoShots = Math.max(0, extras.launcherSalvoShots!);
  if (Number.isInteger(extras.launcherCursor)) combat.launcherCursor = Math.max(0, extras.launcherCursor!);
  // the gap through the reload law (a cycle that ends readies; a magazine load that ends refills the magazine)
  if (newer) tickReload(combat, gapS);
  const carried = extras.consumables;
  if (consumables && carried && typeof carried === 'object') {
    for (let slot = 0; slot < consumables.items.length; slot++) {
      if (Array.isArray(carried.readyIn)) consumables.readyAt[slot] = timeS + ageS(carried.readyIn[slot]);
      if (Array.isArray(carried.charges) && slot < carried.charges.length) {
        const left = carried.charges[slot];
        if (left === null || (Number.isInteger(left) && left! >= 0)) consumables.charges[slot] = left as number | null;
      }
    }
    const active: [string, number][] = [];
    if (carried.activeFor && typeof carried.activeFor === 'object') {
      for (const [item, leftS] of Object.entries(carried.activeFor)) if (item in consumables.until && ageS(leftS) > 0) active.push([item, ageS(leftS)]);
    }
    restoreActiveItems(consumables, combat, active, timeS);
  }
  // a red module's repair runs on through the gap (damage.ts tickModuleRepairs, at the restored repair rate)
  if (totalS > 0) tickModuleRepairs(combat, totalS);
  const fromRow = newer && reading.clockS !== null ? rowAuxiliary(row.auxiliaryJson, reading.clockS) : null;
  const aux = fromRow ?? extras.auxiliary;
  const auxAgeS = fromRow ? tailS : totalS;
  if (combat.auxiliary && aux && typeof aux === 'object') writeAuxiliary(combat.auxiliary, aux, timeS, auxAgeS);
}

/** An auxiliary kit's entry (times left, aged by `ageS`) onto the hull's kit, its times on the clock `timeS` reads. */
function writeAuxiliary(state: AuxiliaryState, aux: NonNullable<MigrationEntityExtras['auxiliary']>, timeS: number, ageS: number): void {
  const after = (leftS: unknown): number => timeS + Math.max(0, finiteOr(leftS, 0) - ageS);
  if (aux.lights === -1 || aux.lights === 0 || aux.lights === 1) state.lights = aux.lights;
  if (typeof aux.gunOn === 'boolean') state.gunOn = aux.gunOn;
  if (Number.isInteger(aux.smokeCharges)) state.smokeCharges = Math.max(0, aux.smokeCharges);
  state.smokeReadyAt = after(aux.smokeReadyIn);
  if (Number.isInteger(aux.shots)) state.shots = Math.max(0, aux.shots);
  state.nextShot = after(aux.nextShotIn);
  if (Array.isArray(aux.stations) && state.stations) {
    for (let index = 0; index < state.stations.length && index < aux.stations.length; index++) {
      const station = state.stations[index]!, entry = aux.stations[index];
      if (!Array.isArray(entry)) continue;
      if (Number.isInteger(entry[0])) station.shots = Math.max(0, entry[0]);
      station.nextShot = after(entry[1]);
    }
  }
}

/**
 * A row newer than its entity's extras writes the counts it carries over the keyframe's (ResumeReading): the magazine
 * indicator (server/match/entityRows.ts: magazineIndicator) is the salvo's while a salvo launcher's guided round is
 * selected, else the cannon magazine's. A cannon magazine the row does not show follows the row's cannon channel: empty
 * while it loads a magazine, never empty once that load has ended.
 */
function restoreRowCounts(combat: CombatState, row: EntityRow, spec: DamageTankSpec): void {
  const loaded = spec.gun.shells?.[combat.shellSlot] as { guided?: boolean } | undefined;
  const salvo = (spec.gun as { launcherSalvo?: { rounds: number } | null }).launcherSalvo;
  const salvoShown = loaded?.guided === true && !!salvo && salvo.rounds > 1;
  if (salvoShown && row.magazineCapacity > 0) {
    // rounds left in the group: the whole group (none fired, or the group reloading: 0) or what the fired shots left
    const capacity = row.magazineCapacity, rounds = row.magazineRounds;
    combat.launcherSalvoShots = rounds > 0 && rounds < capacity ? capacity - rounds : 0;
  }
  const magazine = combat.magazine;
  if (!magazine) return;
  if (!salvoShown && row.magazineCapacity > 0) {
    magazine.rounds = Math.max(0, Math.min(magazine.capacity, row.magazineRounds));
    return;
  }
  const cannon = combat.gunReload ?? combat.reload;
  if (cannon.kind === 'magazine' && cannon.t > 0) magazine.rounds = 0;
  else if (magazine.rounds <= 0) magazine.rounds = magazine.capacity;
}

/**
 * The old host's battle clock at a newer frame (275): the keyframe's exact clock (MigrationKeyframe.battleS) with one
 * step's dt (TICK_MS / 1000, the fixed-step loop's) added a step, as the old host's authority added them, for each step
 * between the two frames' milliseconds. Absent (an older keyframe, or a step count the frame's milliseconds do not bear
 * out): the frame's milliseconds stand alone.
 */
function battleClockAt(keyframe: MigrationKeyframe, battleTimeMs: number): number | undefined {
  const from = keyframe.battleS;
  if (typeof from !== 'number' || !Number.isFinite(from) || !Number.isFinite(battleTimeMs)) return undefined;
  const dt = TICK_MS / 1000;
  const steps = Math.round((battleTimeMs - keyframe.battleTimeMs) / TICK_MS);
  if (steps < 0 || steps > 60 * 60) return undefined;
  let clock = from;
  for (let k = 0; k < steps; k++) clock += dt;
  return Math.abs(clock * 1000 - battleTimeMs) <= 2 ? clock : undefined;
}

/**
 * What an elected seat resumes the match from (MatchSession's migration boot): the newer of the sealed keyframe and its
 * own newest frame — that frame's rows overlaid on the keyframe's, hidden entities keeping the keyframe's — and every
 * prop it was told fell. A `world_prop_destroyed` reaches a peer the tick its prop falls; the destroyed list rides the
 * next snapshot, up to two ticks later. A host that died between the two left the fall in the seat's event queue alone
 * (fix/mp-migration-props, 2026-10-02: 1 world-events audit run in 3 on the PR head): the new host booted without it,
 * stood the prop again, a hull crushed it a second time and every peer crunched a tree the old host had felled. The
 * list is the base's plus those falls, at the base's revision plus one per fall it adds — the old host counted each
 * when it destroyed it — and never below the list's length (the host actor republishes its list when the revision moves).
 * A hull a mode revived between the keyframe and its newer row is named (revivedEntityIds, respawnTicks from the
 * `mode_respawn` ticks this seat was told of): the keyframe's extras are the life it left.
 */
export function resumeStateFromRetained(
  keyframe: MigrationKeyframe,
  keyframeAtMs: number,
  latest: SnapshotFrame | null,
  latestAtMs: number | null,
  fallen: readonly number[],
  destructionEvents: readonly DestructionLogEntry[] = [],
  respawns: readonly (readonly [id: string, tick: number])[] = [],
): { state: HostResumeState; baseTick: number; baseAtMs: number } {
  // the extras stay the keyframe's, dated by its tick and battle clock, when a newer frame moves `tick` on (applyResumeState
  // ages them by the sim time between the two battle clocks)
  const state: HostResumeState = { ...keyframe, keyframeTick: keyframe.tick, keyframeBattleTimeMs: keyframe.battleTimeMs };
  let baseTick = keyframe.tick;
  let baseAtMs = keyframeAtMs;
  if (latest && latest.tick > keyframe.tick && latestAtMs !== null) {
    // What this viewer saw is exact to its newest frame: overlay those rows; hidden entities keep the sealed keyframe's,
    // and so does an entity whose row this viewer holds from before the keyframe (a far tier's held row is older).
    const rows = new Map(state.frame.entities.map((row) => [row.entityId, row]));
    const revived: number[] = [];
    for (const row of latest.entities) {
      const held = rows.get(row.entityId);
      if (held && row.tick > held.tick && isDestroyedRow(held) && !isDestroyedRow(row)) revived.push(row.entityId);
      if (!held || row.tick >= held.tick) rows.set(row.entityId, row);
    }
    if (revived.length) state.revivedEntityIds = revived;
    const respawned = respawns.filter(([id, tick]) => typeof id === 'string' && Number.isInteger(tick) && tick > keyframe.tick && tick <= latest.tick)
      .map(([id, tick]): [string, number] => [id, tick]);
    if (respawned.length) state.respawnTicks = respawned;
    state.frame = { ...state.frame, tick: latest.tick, serverTimeMs: latest.serverTimeMs, entities: [...rows.values()].sort((a, b) => a.entityId - b.entityId), destroyed: latest.destroyed, meta: latest.meta, modeStateJson: latest.modeStateJson,
      // the destruction log only grows: the newer frame's is the longer (destruction, docs/DESTRUCTION.md §8.3)
      destruction: (latest.destruction ?? []).length >= (state.frame.destruction ?? []).length ? latest.destruction : state.frame.destruction };
    state.tick = latest.tick;
    state.battleTimeMs = latest.meta.battleTimeMs;
    state.battleS = battleClockAt(keyframe, latest.meta.battleTimeMs);
    baseTick = latest.tick;
    baseAtMs = latestAtMs;
  }
  // every stage, breach and crater this seat was told of joins the log (a host that died between an event and the next
  // snapshot left it here alone, as `fallen` keeps a prop's fall)
  if (destructionEvents.length) {
    state.frame = { ...state.frame, destruction: mergeDestructionLogs(state.frame.destruction ?? [], destructionEvents) };
  }
  const listed = new Set(state.frame.destroyed);
  const added = [...new Set(fallen)].filter((index) => Number.isSafeInteger(index) && index >= 0 && !listed.has(index));
  if (added.length) {
    const destroyed = [...state.frame.destroyed, ...added].sort((a, b) => a - b);
    const destructibleRevision = Math.max(state.frame.meta.destructibleRevision + added.length, destroyed.length);
    state.frame = { ...state.frame, destroyed, meta: { ...state.frame.meta, destructibleRevision } };
  }
  // the phase is the newest frame's (the keyframe's own may be older: a countdown that has since ended)
  state.phase = resumePhaseOf(state).phase ?? state.phase;
  // the window to play again (276; replayWindow): a keyframe that names its battle clock and mode, sealed in play, and a
  // newer frame still in play that its steps reach (the two battle clocks agree on them, at most MAX_REPLAY_STEPS)
  // (the keyframe's two clocks agree as createMatchActor takes them, else the actor builds on its milliseconds alone)
  if (latest && state.frame.tick > keyframe.tick && typeof keyframe.battleS === 'number' && state.battleS !== undefined && keyframe.modeCheckpoint
    && Math.abs(keyframe.battleS * 1000 - keyframe.battleTimeMs) <= 2
    && resumePhaseOf(keyframe).phase === 'playing' && state.phase === 'playing') {
    const steps = Math.round((latest.meta.battleTimeMs - keyframe.battleTimeMs) / TICK_MS);
    if (steps >= 1 && steps <= MAX_REPLAY_STEPS) {
      state.replay = { frame: keyframe.frame, battleTimeMs: keyframe.battleTimeMs, battleS: keyframe.battleS, steps, viewerEntityId: latest.viewer?.entityId ?? null };
    }
  }
  return { state, baseTick, baseAtMs };
}

/**
 * The phase a resumed actor continues in (audit M1, 2026-11-02; MatchActorResume.phase), read from the state's frame
 * meta, which the newest frame overlays: a verdict there is an ended match; a countdown (or a keyframe of the loading
 * actor) continues with the milliseconds it had left; anything else plays. A state without meta keeps its own phase.
 */
export function resumePhaseOf(state: Pick<HostResumeState, 'phase' | 'frame'>): Pick<MatchActorResume, 'phase' | 'countdownMs' | 'verdict'> {
  const meta = state.frame?.meta;
  if (!meta) return { phase: state.phase === 'countdown' || state.phase === 'ended' ? state.phase : 'playing' };
  const result = meta.verdict === VERDICT.ALPHA ? 'alpha' : meta.verdict === VERDICT.BRAVO ? 'bravo' : meta.verdict === VERDICT.DRAW ? 'draw' : null;
  if (result) return { phase: 'ended', verdict: { result, reason: meta.verdictReason ?? '' } };
  if (meta.phase === PHASE.COUNTDOWN || meta.phase === PHASE.LOADING) return { phase: 'countdown', countdownMs: Math.max(0, meta.countdownMs | 0) };
  return { phase: 'playing' };
}

/**
 * What tells an elected seat with no readable keyframe that the battle had begun (migrationFallback, round 2 U1):
 *   - 'frame': its newest frame says playing, ended or decided;
 *   - 'room': the room's record of the match says it played (roomPolicy.ts markMatchPlaying: a host reported 'playing');
 *   - 'report_tick': the old host's last report to the room (the election's resumeTick, roomActor.ts migrateHost) is
 *     dated at or past the end of the countdown. A host reports at each phase change and every
 *     ROOM_MATCH_REPORT_INTERVAL_MS (matchHostCore.ts housekeep), so its countdown reports are dated before the countdown
 *     ends and its first 'playing' report at or after it. The end is the seat's newest countdown frame's (its tick plus
 *     the time it had left: any timeline), else a first boot's (the actor's tick 0 is its countdown's start,
 *     matchActor.ts start).
 */
export type MigrationPlayEvidence = 'frame' | 'room' | 'report_tick';

/** What an elected seat with no readable keyframe does (migrationFallback). */
export type MigrationFallback =
  | { kind: 'decline'; reason: 'battle_in_progress'; evidence: MigrationPlayEvidence }
  /** `lastResort`: a kept host restarting a battle that had begun (the evidence), since nobody else can host it. */
  | { kind: 'restart'; state: HostResumeState; resumeTick: number; lastResort?: MigrationPlayEvidence };

/** Ticks a report may come early of the countdown's end it is judged against (the countdown's milliseconds round to a tick). */
const COUNTDOWN_END_SLACK_TICKS = 2;

/** The first evidence that the battle had begun (MigrationPlayEvidence), or null when everything the seat holds says it had not. */
export function migrationPlayEvidence({ latestFrame, resumeTick, countdownMs, roomMatchStatus = null }: {
  latestFrame: SnapshotFrame | null; resumeTick: number; countdownMs: number; roomMatchStatus?: RoomMatchStatus | null;
}): MigrationPlayEvidence | null {
  const meta = latestFrame?.meta;
  if (meta && (meta.phase === PHASE.PLAYING || meta.phase === PHASE.ENDED || meta.verdict !== VERDICT.NONE)) return 'frame';
  if (roomMatchStatus === 'playing' || roomMatchStatus === 'ended' || roomMatchStatus === 'lost') return 'room';
  // 0: the room holds no report of the current host (none yet, or the room cleared it at the previous election)
  const reported = Math.max(0, Math.floor(Number(resumeTick) || 0));
  const countdownEndTick = latestFrame && meta
    ? latestFrame.tick + Math.ceil(Math.max(0, meta.countdownMs | 0) / TICK_MS)
    : Math.ceil(Math.max(0, Number(countdownMs) || 0) / TICK_MS);
  if (reported > 0 && reported >= countdownEndTick - COUNTDOWN_END_SLACK_TICKS) return 'report_tick';
  return null;
}

/**
 * An elected seat whose retained keyframe is missing or cannot be opened (audit M1, 2026-11-02). It used to boot fresh at
 * tick 0 whatever the match had reached: a battle in progress restarted from its spawns, behind every client's clock
 * (a client's tick clock ignores older ticks, so its inputs ran far ahead of the new host's). Now:
 *   - anything the seat holds says the battle had begun (migrationPlayEvidence: its newest frame, the room's record of
 *     the match, or the old host's last report tick against the countdown's end): it declines as unable, so the room
 *     elects a seat that holds a keyframe, or ends the match when none can. Round 2 (U1): the newest frame alone was read,
 *     so a seat with none (welcomed, never sent a snapshot) restarted a battle in progress from its spawns whatever the
 *     room's resume tick proved;
 *   - before the battle played (no frame yet, or only the countdown): the match starts over from its countdown on the
 *     timeline the clients already keep, at the later of the room's resume tick and the seat's newest tick plus the time
 *     since: a resume state with no rows (every hull on its spawn), so the boot takes the one resume path.
 * A frame-less seat judges the report tick against a first boot's countdown: after an earlier restart (its countdown
 * began later) it declines a countdown still running, the safe side (the room elects another seat, or ends the match).
 * A kept host (matchSession.ts bootKeptHost: its re-entry decline found nobody to hand the match on to) restarts
 * whatever the evidence, named as the last resort: a decline there ends the match for every seat.
 */
export function migrationFallback({ latestFrame, latestFrameAtMs, nowMs, resumeTick, countdownMs, roomMatchStatus = null, kept = false, battleId }: {
  latestFrame: SnapshotFrame | null; latestFrameAtMs: number | null; nowMs: number; resumeTick: number; countdownMs: number;
  /** The room's record of the elected match (the seat's room snapshot); null when it names another match or none. */
  roomMatchStatus?: RoomMatchStatus | null;
  /** The room kept this seat as the host with no one else to elect (no election: the session's own last resort). */
  kept?: boolean;
  /** The restarted battle's id (round 3 A3); absent: a fresh one (mintBattleId). */
  battleId?: number;
}): MigrationFallback {
  const evidence = migrationPlayEvidence({ latestFrame, resumeTick, countdownMs, roomMatchStatus });
  if (evidence && !kept) return { kind: 'decline', reason: 'battle_in_progress', evidence };
  const seen = latestFrame && latestFrameAtMs !== null ? latestFrame.tick + Math.max(0, Math.ceil((nowMs - latestFrameAtMs) / TICK_MS)) : 0;
  const tick = Math.max(0, Math.floor(Number(resumeTick) || 0), seen);
  const remainingMs = Math.max(0, Math.round(Number(countdownMs) || 0));
  const frame: SnapshotFrame = {
    tick, serverTimeMs: Math.round(tick * TICK_MS), ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: INPUT_MARGIN_UNKNOWN,
    meta: { phase: PHASE.COUNTDOWN, countdownMs: Math.min(0xffff, remainingMs), battleTimeMs: 0, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], destruction: [], entities: [], shells: [], viewer: null, modeStateJson: null,
  };
  // a battle of its own (round 3 A3): every client that followed the battle this replaces tells the restart by it at its
  // WELCOME (MatchClient receiveWelcome), whatever the restart's tick or phase reads against its clocks
  const restartedBattleId = battleId !== undefined && isBattleId(battleId) && battleId !== 0 ? battleId : mintBattleId();
  return { kind: 'restart', resumeTick: tick, state: { tick, battleTimeMs: 0, phase: 'countdown', frame, entities: [], battleId: restartedBattleId },
    ...(evidence ? { lastResort: evidence } : {}) };
}

/**
 * The seats an elected host waits for before its world moves (the resume hold, matchHostCore.ts RESUME_HOLD_MS): the
 * room's connected players with a battle seat in the boot plan, the elected seat itself among them, less the host that
 * went (a silent host may still hold its room socket; it comes back, if ever, as a peer of the new host).
 */
export function resumeHoldSeats(
  players: readonly { id: string; connected: boolean; team: string }[],
  seats: readonly { playerId: string; team: string }[],
  previousHostId: string | null,
): string[] {
  const seated = new Set(seats.filter((seat) => seat.team !== 'spectator').map((seat) => seat.playerId));
  return players.filter((player) => player.connected && player.team !== 'spectator' && player.id !== previousHostId && seated.has(player.id))
    .map((player) => player.id);
}

/**
 * Write a keyframe's rows and extras onto the actor's entities, and its persistent destroyed list onto the actor's world
 * (before the loop starts). Returns how many entities matched, and how many destroyed props this world restored or
 * does not have. Without the list (world state audit, 2026-10-01) the elected host stood every felled tree back up
 * in its collision world and at revision 0: hulls were pushed by trunks every seat saw lying, the next drive through
 * one re-destroyed it (a second crunch on every seat), and the persistent-state convergence of every peer stalled
 * until the new revision climbed past the old.
 */
export function applyResumeState(actor: MatchActor, state: HostResumeState): ResumeApplied {
  const replay = state.replay;
  if (!replay) return restoreFrom(actor, state);
  // the play starts from the keyframe's clocks (resumeClocksOf): on the frame's it would end a window late
  if (actor.resumedBattleTimeMs !== Math.round(replay.battleTimeMs) || actor.authority.battleS !== replay.battleS) {
    throw new TypeError('a resume that replays its window needs an actor built on resumeClocksOf(state)');
  }
  // the window played again (276): the hulls and the mode at the keyframe, exact, then every step the old host took to the
  // seat's newest frame, the seat's rows correcting the play where it parts from them (replayWindow)
  const atKeyframe = restoreFrom(actor, keyframeStateOf(state, replay));
  const played = replayWindow(actor, state, replay);
  return { ...atKeyframe, replayed: played };
}

/** What a restore did (applyResumeState): rows matched and not, props restored and unknown, and a window's replay. */
interface ResumeApplied {
  restored: number;
  skipped: number;
  destroyedRestored: number;
  destroyedUnknown: number;
  /** The window replayed (276): its steps, the rows that corrected it, and whether the mode was set to the frame's. */
  replayed?: WindowReplayed;
}

function restoreFrom(actor: MatchActor, state: HostResumeState): ResumeApplied {
  const extrasTick = Number.isInteger(state.keyframeTick) ? state.keyframeTick! : state.tick;
  const frameGapS = resumeFrameGapS(state, extrasTick);
  const revived = revivedSinceKeyframe(actor, state, extrasTick);
  // every hull where its row has it before the mode is restored (275): the restore's replays read where the hulls stand
  // (an arrival's ring round the humans, a hunt's plans, a line slot's placement), which were the construction's spawns;
  // the rows are applied again in full below
  for (const row of state.frame.entities) {
    const entity = actor.entityForWireId(row.entityId);
    if (entity) applyAuthorityRow(entity.state, row);
  }
  if (state.modeCheckpoint) {
    // the mode as the newest frame shows it, when that frame is newer than the keyframe (review round 1), and what the
    // seat was told of the window between them (gaps 274 fix-up r1)
    const known = resumeWindow(state, state.modeCheckpoint, extrasTick, frameGapS);
    const checkpoint = checkpointAfterRevives(state.modeCheckpoint, revived, known);
    actor.authority.restoreModeCheckpoint(state.frame.tick > extrasTick ? checkpointAtNewestFrame(checkpoint, state.frame.modeStateJson, known) : checkpoint);
  }
  let restored = 0;
  let skipped = 0;
  const extrasById = new Map(state.entities.map((entry) => [entry.entityId, entry]));
  const toldRevives = new Map(state.respawnTicks ?? []);
  for (const row of state.frame.entities) {
    const entity = actor.entityForWireId(row.entityId);
    if (!entity) { skipped++; continue; }
    const tank = entity.state;
    // the pose, ground contact and body mode (wire 10's body bits), the spring and the ride, as the client's predictor
    // takes a row (round 2 U2: the pose alone left the fresh hull's contact, mode and ride under it)
    applyAuthorityRow(tank, row);
    const combat = entity.combat;
    combat.hp = row.hp;
    combat.maxHp = Math.max(1, row.maxHp);
    combat.destroyed = isDestroyedRow(row);
    if (Array.isArray(combat.ammo)) {
      const ammo = [row.ammo0, row.ammo1, row.ammo2];
      for (let slot = 0; slot < combat.ammo.length && slot < ammo.length; slot++) combat.ammo[slot] = ammo[slot]!;
    }
    restoreShellSlot(combat, row.shellSlot, entity.spec);
    if (row.eraSpent.length) {
      const table = eraPlateIndices(entity.spec.armor as { hullPlates?: { kind?: string; name?: string }[]; turretPlates?: { kind?: string; name?: string }[] });
      const byIndex = new Map<number, string>();
      for (const [name, index] of table) byIndex.set(index, name);
      combat.eraSpent ??= new Set();
      for (const index of row.eraSpent) { const name = byIndex.get(index); if (name) combat.eraSpent.add(name); }
    }
    // physics lane (wire 5): a wreck's turret body where the newest row had it (asleep where it lay, or falling on)
    const body = row.wreckBody;
    if (body && combat.destroyed) {
      actor.authority.restoreWreckTurret(entity.id, {
        x: dequantizePosition(body.x), y: dequantizePosition(body.y), z: dequantizePosition(body.z),
        qx: dequantizeUnitComponent(body.qx), qy: dequantizeUnitComponent(body.qy), qz: dequantizeUnitComponent(body.qz),
        qw: dequantizeUnitComponent(body.qw), asleep: body.asleep,
      });
    }
    // the migration seed (P3b): the actor remembers what each entity was restored from, so its own seat's hint can be bounded
    actor.noteRestoredRow(row.entityId, row.tick, tank.pos.x, tank.pos.z);
    const extras = extrasById.get(row.entityId);
    // the row against the extras (ResumeReading): how much newer it is in sim time (never past the frame's battle clock),
    // what is left to the resume frame, and the old host's clock at its reading
    const gapS = Math.min(Math.max(0, row.tick - extrasTick) * TICK_MS / 1000, frameGapS);
    const tailS = Math.max(0, frameGapS - gapS);
    const reading: ResumeReading = { row, gapS, tailS, clockS: typeof state.timeS === 'number' ? state.timeS + gapS : null };
    if (extras) {
      // the tallies run on across lives; the fight is the extras' only while the hull lives the life they saw (a revived
      // hull keeps the fresh state the new host built, and what its newer row carries)
      entity.kills = extras.kills;
      entity.damage = extras.damage;
      const life = revived.has(entity.id) ? freshLife(extras) : extras;
      for (const [moduleId, moduleState] of Object.entries(life.modules)) {
        const module = (combat.modules as Record<string, { state?: string } | undefined>)[moduleId];
        if (module && (moduleState === 'ok' || moduleState === 'yellow' || moduleState === 'red')) module.state = moduleState;
      }
      for (const [crewId, able] of Object.entries(life.crew)) if (crewId in combat.crew) combat.crew[crewId] = able;
      restoreCombatExtras(combat, entity.consumables, life, actor.authority.timeS, reading);
    }
    // the selected and cannon channels as the row has them, unless the extras are as new and exact (review round 1:
    // the keyframe's channels written over a newer row gave a tank that fired since the keyframe a loaded gun)
    if (!extras?.reloads || gapS > 0) {
      combat.reload = restoreReload(combat.reload as ReloadLike | undefined, dequantizeReloadS(row.reload), dequantizeReloadS(row.reloadTotal), RELOAD_KINDS[row.reloadKind] ?? 'ready') as typeof combat.reload;
      if (combat.gunReload && combat.gunReload !== combat.reload) {
        restoreReload(combat.gunReload as ReloadLike, dequantizeReloadS(row.gunReload), dequantizeReloadS(row.gunReloadTotal), RELOAD_KINDS[row.gunReloadKind] ?? 'ready');
      }
    }
    if (gapS > 0 || !extras) restoreRowCounts(combat, row, entity.spec);
    // every channel the rest of the way to the resume frame (a cycle that ends readies, a magazine load that ends refills)
    if (tailS > 0) tickReload(combat, tailS);
    // a bot's brain takes the hull as restored (round 3 M3): the fresh actor built it at the spawn, so what it measures
    // between its own ticks (the ground covered, the hp it last saw) would read the move to this row and the hp lost
    // before the keyframe as one tick of its own; resume() restarts them from the hull, as a revive's hand-back does
    entity.aiCtl?.resume?.(actor.authority.battleS);
    // the drive the hull's life had (gaps 274, G3; a revived hull's is the life it left): the hull exact (276; its
    // integrator, which the row does not carry: a fresh one pulled away from rest, about 0.2 s behind), and a bot's way (its
    // route, cursor, mission and watchdog; game/ai.ts takeDrive), which a fresh brain planned afresh and re-planned
    // later than the old one (a CTF raider went in by another way, 1.9 s apart at the flag). A hull revived since the
    // capture, or down now, lives no more the life they describe: its brain keeps the drive resume() left it, as the old
    // host's own revive did, and takes the brain's seeded streams alone, which outlive a life on the old host too (fix-up
    // r1: the controller's and planner's streams went back to the construction's, and every draw after them differed).
    // A bot down when the keyframe was sealed carries its streams alone (fix-up r2: it carried nothing, and its brain drew
    // its next life from the construction's positions, 55 m off the old host's raider within 25 s)
    if (extras) {
      const lifeGoesOn = !revived.has(entity.id) && !combat.destroyed;
      // Turbo's cooldown and the air spin's run on through the gap to the resume frame (turbo-spin-275, flip-boost-276):
      // a new host refuses a press as the old did
      if (lifeGoesOn && Number.isFinite(extras.turboReadyIn)) {
        entity.turboReadyS = actor.authority.timeS + Math.max(0, extras.turboReadyIn! - gapS - tailS);
      }
      if (lifeGoesOn && Number.isFinite(extras.airSpinReadyIn)) {
        entity.airSpinReadyS = actor.authority.timeS + Math.max(0, extras.airSpinReadyIn! - gapS - tailS);
      }
      // the hull exact (276; restoreHull): from its own row rounded, the old host's hull to the bit (a flip or roll mid-turn,
      // the rate it turns at and a spent dodge among it); from a newer row, its drive (the turn rate, the slew, the bloom,
      // the spool), the spin aged by the gap, and held input
      const hull = lifeGoesOn && extras.hull ? unpackHull(extras.hull) : null;
      if (hull) restoreHull(entity as unknown as HullHolder, row, hull, gapS);
      // a hull the old host stood up after the keyframe and drives (its newer row moving): its engine spooled up from the
      // revive it was told, as a fresh life's does under an open throttle (275; a spool at rest pulled away 0.3 s behind)
      const roseAt = toldRevives.get(entity.id);
      if (revived.has(entity.id) && !combat.destroyed && roseAt !== undefined && row.tick > roseAt && Math.abs(tank.speed) > 0.05) {
        tank._spool = spoolFromRest(row.tick - roseAt);
      }
      if (extras.way) entity.aiCtl?.takeDrive?.(extras.way, gapS, lifeGoesOn);
      else if (extras.streams) entity.aiCtl?.takeStreams?.(extras.streams);
      // the brain itself (275): its traffic with its allies, its detours, windows, timers' phases, aim and search, as the
      // old host's had them (a new brain began at its construction's, and Frontline attackers parted 112 m in 14 s). A
      // hull that rose since the capture takes it too and then the revive's hand-back, as the old host's own revive handed
      // the brain its new life (resume() keeps what outlives a life: the windows on match time, the counts, the aim's
      // draw). One that lies down takes it alone (276): its hand-back is its revive's, on the new host as on the old (the
      // restore's own hand-back gave a down raider a second one, and it drove its next life apart: the CTF probe's 6 m)
      if (extras.brain) {
        const brain = unpackBrain(extras.brain);
        if (brain) entity.aiCtl?.takeBrain?.(brain, lifeGoesOn ? gapS : 0, (id) => actor.authority.entityById.get(id));
        if (revived.has(entity.id)) entity.aiCtl?.resume?.(actor.authority.battleS);
      }
    }
    restored++;
  }
  const destroyed = actor.authority.restoreDestroyedObstacles(state.frame.destroyed, state.frame.meta.destructibleRevision);
  // destruction (docs/DESTRUCTION.md §8.3): stages and collapses (records, heaps, the route grid) without events
  if (state.frame.destruction?.length) actor.authority.restoreDestruction(state.frame.destruction);
  // the smoke screens still standing (round 2 U2): the frame's meta carries them on the battle clock (matchActor.ts
  // metaOnBattleClock), this actor's authority counts from its resumed battle time
  const smoke = smokeScreensOf(state.frame.meta.smokeJson);
  if (smoke.length) actor.authority.restoreSmokeScreens(smoke, -actor.resumedBattleTimeMs / 1000);
  // the events the actor's construction left pending are its own opening's (gaps 274, G2: the Horde's first wave and its
  // arrivals' respawns), a battle the resume replaced: every seat heard the old host's, so none of them goes out on the
  // first tick (the restores above announce nothing)
  actor.authority.afterEventBroadcast();
  return { restored, skipped, destroyedRestored: destroyed.restored, destroyedUnknown: destroyed.unknown };
}

// ---- the window played again (276) ------------------------------------------------------------------------------------
/**
 * The most steps a resume plays the window for (276): 10 s of the old host's play, at most 600 of its steps in the boot
 * (the CTF probe's 4v4 stepped 30 in 15-25 ms in Node). A longer window (a seat that kept no keyframe for longer) takes the
 * 275 reading of it instead.
 */
export const MAX_REPLAY_STEPS = 600;

/** A replay's state at its keyframe (HostResumeState.replay): the keyframe's own rows, clocks and tick, nothing of the window. */
function keyframeStateOf(state: HostResumeState, replay: HostResumeReplay): HostResumeState {
  const { replay: _replay, revivedEntityIds: _revived, respawnTicks: _told, ...rest } = state;
  return { ...rest, frame: replay.frame, tick: state.keyframeTick ?? state.tick, battleTimeMs: replay.battleTimeMs, battleS: replay.battleS };
}

/**
 * The clocks a resumed actor is built on (MatchActorResume.battleTimeMs, battleS): a replay's keyframe's, which its steps
 * take on to the seat's frame (276); else the state's own.
 */
export function resumeClocksOf(state: HostResumeState): { battleTimeMs: number; battleS?: number } {
  if (state.replay) return { battleTimeMs: state.replay.battleTimeMs, battleS: state.replay.battleS };
  return { battleTimeMs: state.battleTimeMs, ...(state.battleS !== undefined ? { battleS: state.battleS } : {}) };
}

/** What a replay did (ResumeApplied.replayed): its steps, the seat's rows that corrected it, the mode taken from the frame, a verdict. */
interface WindowReplayed {
  steps: number;
  corrected: number;
  modeFromFrame: boolean;
  /** The play reached a verdict (the frame showed none: a replay is admitted only in play). */
  verdict: boolean;
}

/**
 * The window between the keyframe and the seat's newest frame, played again (276). A migrated host took the window up from
 * what the seat could read of it: the hulls where their rows had them, the mode where its frame showed it, and the rest
 * (every bot's brain ticks and stream draws, a hidden hull's moves, the spotting, the shells) the keyframe's, a window old.
 * Bots fighting parted by tens of metres within 10 s of a 30-tick window (the CTF probe: 26 m; the round 1 review's 4v4:
 * 26-43 m), against none from the keyframe alone. Now the restore stands the match at the keyframe, exact, and steps it
 * the old host's steps to the frame (as many as the two battle clocks hold: a dropped tick took none) without a seat's
 * input, which the replay never had: each seat's hull drives on the command it held at the keyframe, its trigger off (braked
 * instead, as on a host that heard nothing from its seat, it pulled away 3.5 m behind its row). After each step, each
 * row the seat holds of that step (a far tier's held row is older than the frame) corrects the play where the play parts
 * from it (rowOverReplay): a human's pose and fight, a bot a human's shot turned. The mode's death watch takes a life the
 * rows changed on the next step, as it took a row's on the old host's resume (matchModes.ts observeEntityDeath). Last, the
 * mode as the seat's frame shows it (takeView: the lives the rows changed on this last step, then a score, the Infected
 * factions, a cache both ways, a flag a human carried, a zone, the ball, and a director move the play did not make taken
 * up as made; never a life the rows did not change, nor a loadout), the props and destruction the seat was told of that
 * the play did not make (matched deed for deed, laid down under this host's own numbers), and the smoke it did not raise.
 * A bot whose window held nothing a seat could not know plays on as the old host's, to the bit.
 */
function replayWindow(actor: MatchActor, state: HostResumeState, replay: HostResumeReplay): WindowReplayed {
  const sim = actor.authority;
  const from = state.keyframeTick ?? state.tick;
  // each newer row at the step its tick names (a tick the old host dropped took no step: the last step holds the rest)
  const rowsAt = new Map<number, EntityRow[]>();
  for (const row of state.frame.entities) {
    if (row.tick <= from) continue;
    const step = Math.min(replay.steps, row.tick - from);
    const list = rowsAt.get(step);
    if (list) list.push(row); else rowsAt.set(step, [row]);
  }
  if (sim.phase === 'loading') sim.onMatchReady();
  // a seat's hull drives on as its seat last drove it (its held input, which the hull exact carries), its trigger held:
  // the play never heard the seat (a hull braked through it pulled away 3.5 m behind its row once the seat drove again)
  const held = new Map<string, AuthoritativePlayerInput>();
  for (const entity of sim.entities) {
    if (entity.bot || entity.combat.destroyed || entity.modeActive === false) continue;
    const input = entity.input;
    held.set(entity.id, { throttle: input.throttle, steer: input.steer, brake: input.brake, fire: false, fireIntentSeq: null, aimLocked: input.aimLocked,
      // (its aim from where playerInputStage.ts decodes it: a drone a seat flies, else its hull)
      shellSlot: input.shellSlot, actionBits: 0, ...encodeAimIntent(entity.aerial?.active ? entity.aerial : entity.state.pos, input.aimPoint) });
  }
  const dt = TICK_MS / 1000;
  let corrected = 0;
  const newest = new Map<number, number>();
  // the hulls the play's own mode stood up (its mode_respawn: a director's arrival, a respawn), which no take below makes again
  const playRevived = new Set<string>();
  for (let step = 1; step <= replay.steps; step++) {
    sim.step({ dt, inputs: held });
    for (const event of sim.eventsForViewer('')) if (event.type === 'mode_respawn' && typeof event.id === 'string') playRevived.add(event.id);
    // every seat heard the old host's events of the window
    sim.afterEventBroadcast();
    for (const row of rowsAt.get(step) ?? []) {
      const entity = actor.entityForWireId(row.entityId);
      if (!entity) continue;
      // the old host's authority clock at this step: its own at the keyframe and the steps since
      const oldClockS = typeof state.timeS === 'number' ? state.timeS + sim.timeS : null;
      if (rowOverReplay(actor, entity, row, oldClockS, sim.timeS)) corrected++;
      newest.set(row.entityId, row.tick);
    }
  }
  // the mode as the seat's frame shows it (checkpointAtNewestFrame's reading of the view over the play's own checkpoint,
  // onto the live controller by takeView): the lives the rows changed first (the death watch, on this last step), then the
  // score, the Infected factions, the caches, the flags, the zones, the ball, and a director move the frame shows that the
  // play did not make (a Horde wave cleared or begun, a Frontline advance: taken up as made, never made twice). Lives the
  // rows did not change stay the play's, and loadouts the play's
  let modeFromFrame = false;
  const viewerId = replay.viewerEntityId !== null ? actor.entityForWireId(replay.viewerEntityId)?.id ?? '' : '';
  const shown = state.frame.modeStateJson;
  const checkpoint = shown && sim.modeController ? sim.captureModeCheckpoint() : null;
  if (shown && checkpoint?.mode && sim.modeController) {
    const played = sim.snapshotMeta(viewerId).modeState;
    modeFromFrame = !played || JSON.stringify(played) !== shown;
    // the revives the seat was told of in the window, on the play's mode clock at their steps (an advance's moment and
    // the defenders it stood up: checkpointAtNewestFrame's line.begun)
    const told = new Map<string, number>();
    for (const [id, tick] of state.respawnTicks ?? []) {
      if (typeof id === 'string' && Number.isInteger(tick)) told.set(id, checkpoint.mode.elapsedS - (replay.steps - Math.min(replay.steps, Math.max(0, tick - from))) * dt);
    }
    const known = { told, frameAtS: checkpoint.mode.elapsedS };
    // the hulls the old host revived in the window that the play's own mode did not (a seat's kill let its trickle or ring
    // bring one on; the rows stood it up, or show it killed again): named as the 275 reading names the keyframe's
    // (checkpointAfterRevives), so takeView takes each arrival up as made. One the play revived itself is the play's,
    // whatever became of it after (round 4: one the play then lost was taken a second time)
    const missed = new Set([...revivedSinceKeyframe(actor, state, from)].filter((id) => !playRevived.has(id)));
    const atFrame = checkpointAtNewestFrame(checkpointAfterRevives(checkpoint, missed, known), shown, known).mode!;
    // the play's score is exact but for the points it missed (a seat's kill, a capture): those whole points added
    let view: Record<string, unknown> | null = null;
    try { view = recordOf(JSON.parse(shown)); } catch { view = null; }
    const shownScore = recordOf(view?.score);
    const score = { alpha: playScoreAtFrame(checkpoint.mode.score.alpha, shownScore?.alpha), bravo: playScoreAtFrame(checkpoint.mode.score.bravo, shownScore?.bravo) };
    sim.modeController.takeView({ ...atFrame, score }, missed);
  }
  // the props the seat was told fell, and the destruction it was told of, that the play did not make (its own stand). An
  // entry is matched by what it did and where, one deed of the play's for one of the frame's (two craters dug on one spot
  // are two), not by its number: the play numbers its own craters and holes, and a seat's deed in the window shifts the
  // old host's. What the play did not make is laid down under this host's own numbers (a crater the next id, a hole its
  // section's next slot), which its log and its walls then agree on and which run on past every number a seat holds (the
  // frame's numbers beside the play's gave two craters one id, the next crater an id the seats already held, and a hole
  // whose slot the play had filled was refused)
  sim.restoreDestroyedObstacles(state.frame.destroyed, state.frame.meta.destructibleRevision);
  const unmatched = (sim.snapshotMeta(viewerId).destructionLog as DestructionLogEntry[] | undefined ?? []).map(quantizeDestructionEntry);
  const missing = (state.frame.destruction ?? []).map(quantizeDestructionEntry).filter((entry) => {
    const own = unmatched.findIndex((candidate) => sameDestructionDeed(candidate, entry));
    if (own < 0) return true;
    unmatched.splice(own, 1);
    return false;
  });
  if (missing.length) sim.restoreDestruction(missing, true);
  // the smoke screens the frame shows that the play did not raise (a human's: the play never heard its seat), each on this
  // authority's clock
  const shiftS = -actor.resumedBattleTimeMs / 1000;
  const standing = sim.snapshotMeta(viewerId).smokeScreens as SmokeScreen[] | undefined ?? [];
  const raised = smokeScreensOf(state.frame.meta.smokeJson).filter((screen) => !standing.some((own) => sameSmoke(own, screen, shiftS)));
  if (raised.length) sim.restoreSmokeScreens(raised, shiftS);
  // each hull's restored reading for the seats' resume hints (matchActor.ts receiveResumeHint): where the play put it, as
  // of the newest row the seat held of it, else the keyframe's
  for (const entity of sim.entities) {
    const wireId = actor.wireIdOf(entity.id);
    if (wireId !== null) actor.noteRestoredRow(wireId, newest.get(wireId) ?? from, entity.state.pos.x, entity.state.pos.z);
  }
  sim.afterEventBroadcast();
  // a verdict the play reached that the seat's frame does not show (a seat's move the play never heard): the match ends on
  // the new host's first tick; reported, not refused (docs/MULTIPLAYER-V2.md, not taken up by 276)
  return { steps: replay.steps, corrected, modeFromFrame, verdict: sim.result !== null && sim.result !== undefined };
}

/** A score the play kept exact (276): its own, but for the whole points the seat's frame shows it missed. */
function playScoreAtFrame(held: number, shown: unknown): number {
  if (!finiteNumber(shown) || Math.round(held) === shown) return held;
  const taken = held + (shown - Math.round(held));
  return Math.round(taken) === shown ? taken : shown;
}

/** Two destruction entries for one deed (276): a stage of a structure, a hole in a section, a crater, by where it is. */
function sameDestructionDeed(a: DestructionLogEntry, b: DestructionLogEntry): boolean {
  if (a.kind === 'stage' && b.kind === 'stage') return a.structureId === b.structureId && a.stage === b.stage;
  if (a.kind === 'breach' && b.kind === 'breach') return a.structureId === b.structureId && a.section === b.section && a.x === b.x && a.y === b.y && a.z === b.z;
  return a.kind === 'crater' && b.kind === 'crater' && a.x === b.x && a.z === b.z && a.radiusM === b.radiusM;
}

/** One smoke screen on both clocks (a frame's on the battle clock, shifted onto this authority's by `shiftS`): its launch
 *  within 2 ms (each clock rounds it to the millisecond) and where it stands within a centimetre. */
const sameSmoke = (own: SmokeScreen, shown: SmokeScreen, shiftS: number): boolean =>
  Math.abs(own.born - (shown.born + shiftS)) <= 0.002 && Math.abs(own.x - shown.x) <= 0.01 && Math.abs(own.z - shown.z) <= 0.01;
const reloadKindIndex = (kind: unknown): number => Math.max(0, RELOAD_KINDS.indexOf(kind as typeof RELOAD_KINDS[number]));
const readsReload = (reload: ReloadLike | undefined, units: number, totalUnits: number, kind: number): boolean =>
  quantizeReloadS(reload?.t ?? 0) === units && quantizeReloadS(reload?.totalS ?? 0) === totalUnits && reloadKindIndex(reload?.kind) === kind;

/** The entity a replay plays (the authority's), as rowOverReplay reads and writes it. */
type ReplayEntity = ReturnType<MatchActor['entityForWireId']> & object;

/**
 * A row the seat holds, over the replay's hull at the row's step (276): where the play reads as the row does (its pose
 * rounded as captureEntityRow rounds it, its body bits, life, hp, ammunition, shell, both reload channels, the magazine
 * indicator, fire, the special action's toggle, auxiliary kit, spent reactive plates and a wreck's thrown turret),
 * nothing; else the row's, as the 275 reading took a newer row (the pose through applyAuthorityRow, the fight through the
 * restore's own writers, the toggle through the special action's binding). Returns whether it corrected anything.
 */
function rowOverReplay(actor: MatchActor, entity: ReplayEntity, row: EntityRow, oldClockS: number | null, timeS: number): boolean {
  const state = entity.state, combat = entity.combat;
  const pose = row.x === quantizePosition(state.pos.x) && row.y === quantizePosition(state.pos.y) && row.z === quantizePosition(state.pos.z)
    && row.yaw === quantizeAngle(state.yaw) && row.speed === quantizeVelocity(state.speed) && row.verticalSpeed === quantizeVelocity(state.verticalSpeed)
    && row.pitch === quantizeAngle(state.visualPitch) && row.roll === quantizeAngle(state.visualRoll)
    && row.turretYaw === quantizeAngle(state.turretYaw) && row.gunPitch === quantizeAngle(state.gunPitch)
    && (row.flags & HULL_BODY_ROW_FLAGS) === (hullBodyRowFlags(state) & HULL_BODY_ROW_FLAGS);
  const gunReload = combat.gunReload ?? combat.reload;
  const fight = isDestroyedRow(row) === combat.destroyed && row.hp === Math.round(combat.hp) && row.maxHp === Math.max(1, Math.round(combat.maxHp))
    && (!Array.isArray(combat.ammo) || [row.ammo0, row.ammo1, row.ammo2].every((count, slot) => slot >= combat.ammo.length || combat.ammo[slot] === count))
    && row.shellSlot === Math.max(0, Math.min(2, combat.shellSlot | 0))
    && readsReload(combat.reload as ReloadLike | undefined, row.reload, row.reloadTotal, row.reloadKind)
    && readsReload(gunReload as ReloadLike | undefined, row.gunReload, row.gunReloadTotal, row.gunReloadKind)
    && ((row.flags & ENTITY_FLAGS.BURNING) !== 0) === !!combat.fire?.burning
    && readsMagazine(combat, entity.spec, row);
  // the special action's toggle the row shows (SPECIAL_ACTIVE; a seat's press the play never heard)
  const special = !entity.specialAction || ((row.flags & ENTITY_FLAGS.SPECIAL_ACTIVE) !== 0) === entity.specialAction.active;
  const fromRow = oldClockS !== null && combat.auxiliary ? rowAuxiliary(row.auxiliaryJson, oldClockS) : null;
  const kit = !fromRow || sameAuxiliary(fromRow, combat.auxiliary!, timeS);
  // the reactive plates the row shows spent that the play's hull still holds (spent plates only grow), and a wreck's turret
  // body the row has thrown that the play's wreck does not (a death the play never dealt launched none)
  const plates = row.eraSpent.length ? eraPlateIndices(entity.spec.armor as Parameters<typeof eraPlateIndices>[0]) : null;
  const unspent = plates ? [...plates].filter(([name, index]) => row.eraSpent.includes(index) && !combat.eraSpent?.has(name)).map(([name]) => name) : [];
  const body = isDestroyedRow(row) && row.wreckBody && !entity._wreckTurret ? row.wreckBody : null;
  if (pose && fight && kit && special && !unspent.length && !body) return false;
  if (!special) { entity.specialAction!.active = !entity.specialAction!.active; bindSpecialActionState(entity); }
  if (unspent.length) { combat.eraSpent ??= new Set(); for (const name of unspent) combat.eraSpent.add(name); }
  if (!pose) applyAuthorityRow(state, row);
  if (!fight) {
    combat.hp = row.hp;
    combat.maxHp = Math.max(1, row.maxHp);
    combat.destroyed = isDestroyedRow(row);
    if (Array.isArray(combat.ammo)) {
      const ammo = [row.ammo0, row.ammo1, row.ammo2];
      for (let slot = 0; slot < combat.ammo.length && slot < ammo.length; slot++) combat.ammo[slot] = ammo[slot]!;
    }
    restoreShellSlot(combat, row.shellSlot, entity.spec);
    combat.reload = restoreReload(combat.reload as ReloadLike | undefined, dequantizeReloadS(row.reload), dequantizeReloadS(row.reloadTotal), RELOAD_KINDS[row.reloadKind] ?? 'ready') as typeof combat.reload;
    if (combat.gunReload && combat.gunReload !== combat.reload) {
      restoreReload(combat.gunReload as ReloadLike, dequantizeReloadS(row.gunReload), dequantizeReloadS(row.gunReloadTotal), RELOAD_KINDS[row.gunReloadKind] ?? 'ready');
    }
    restoreRowCounts(combat, row, entity.spec);
    const burning = (row.flags & ENTITY_FLAGS.BURNING) !== 0;
    if (combat.fire && combat.fire.burning !== burning) {
      combat.fire.burning = burning;
      if (burning) {
        combat.fire.ticksLeft = Math.max(2, Math.round(FIRE_BASE_TICKS * multOf(combat.equipMults as Record<string, unknown> | undefined, 'fireTicks')));
        combat.fire.tickTimer = 0;
      }
    }
  }
  if (!kit && fromRow) writeAuxiliary(combat.auxiliary!, fromRow, timeS, 0);
  if (body) {
    actor.authority.restoreWreckTurret(entity.id, { x: dequantizePosition(body.x), y: dequantizePosition(body.y), z: dequantizePosition(body.z),
      qx: dequantizeUnitComponent(body.qx), qy: dequantizeUnitComponent(body.qy), qz: dequantizeUnitComponent(body.qz), qw: dequantizeUnitComponent(body.qw), asleep: body.asleep });
  }
  return true;
}

/** Whether the hull's magazine indicator reads as the row's (captureEntityRow: magazineIndicator, the counts as bytes). */
function readsMagazine(combat: CombatState, spec: DamageTankSpec, row: EntityRow): boolean {
  const indicator = magazineIndicator(combat as unknown as Parameters<typeof magazineIndicator>[0], spec as unknown as Parameters<typeof magazineIndicator>[1]);
  return row.magazineRounds === clampU8(indicator?.rounds ?? 0) && row.magazineCapacity === clampU8(indicator?.capacity ?? 0);
}

/** Whether the replay's auxiliary kit reads as a row's (rowAuxiliary: the times left from the row's clock, to the row's millisecond). */
function sameAuxiliary(fromRow: NonNullable<MigrationEntityExtras['auxiliary']>, aux: AuxiliaryState, timeS: number): boolean {
  const left = (at: number): number => Math.round(Math.max(0, at - timeS) * 1000);
  const close = (a: number, b: number): boolean => Math.abs(Math.round(a * 1000) - b) <= 1;
  return fromRow.lights === aux.lights && fromRow.gunOn === aux.gunOn && fromRow.smokeCharges === aux.smokeCharges && fromRow.shots === aux.shots
    && close(fromRow.smokeReadyIn, left(aux.smokeReadyAt)) && close(fromRow.nextShotIn, left(aux.nextShot))
    && (fromRow.stations ?? []).every(([shots, nextIn], index) => aux.stations?.[index]?.shots === shots && close(nextIn, left(aux.stations[index]!.nextShot)));
}

/** The compact smoke screens a frame meta carries (SnapshotMeta.smokeJson), or none when it carries none or cannot be read. */
function smokeScreensOf(json: string | undefined): SmokeScreen[] {
  if (!json) return [];
  try {
    const screens = JSON.parse(json) as unknown;
    return Array.isArray(screens) ? screens.filter((screen): screen is SmokeScreen => !!screen && typeof screen === 'object' && Number.isFinite((screen as SmokeScreen).born)) : [];
  } catch { return []; }
}

/** Seconds left until a sim time (never negative). */
const leftOf = (at: number, timeS: number): number => Math.max(0, Math.round((finiteOr(at, 0) - timeS) * 1000) / 1000);

/** Each vehicle's auxiliary kit as a fresh host builds it (auxiliarySystems.ts createAuxiliaryState), by spec id. */
const freshAuxiliary = new Map<string, AuxiliaryState>();
function freshAuxiliaryOf(spec: { id?: string }): AuxiliaryState {
  const key = String(spec.id ?? '');
  let fresh = freshAuxiliary.get(key);
  if (!fresh) { fresh = createAuxiliaryState(spec); freshAuxiliary.set(key, fresh); }
  return fresh;
}

/** The auxiliary entry as the fresh host's own kit has it already: lights, switch and smoke charges at the start, nothing cooling down, no rounds fired. */
function auxiliaryAtRest(entry: NonNullable<MigrationEntityExtras['auxiliary']>, fresh: AuxiliaryState): boolean {
  return entry.lights === fresh.lights && entry.gunOn === fresh.gunOn && entry.smokeCharges === fresh.smokeCharges && entry.smokeReadyIn === 0 &&
    entry.shots === fresh.shots && entry.nextShotIn === 0 && (entry.stations ?? []).every(([shots, nextShotIn]) => shots === 0 && nextShotIn === 0);
}

// ---- the 275 parts' wire form: exact doubles, packed (a full field's keyframe came to 61 of the 64 chunks as JSON text)
/** Doubles as base64url of their little-endian Float64 bytes, exact; null for a text that is not one. */
function packDoubles(values: readonly number[], head: readonly number[] = []): string {
  const bytes = new Uint8Array(head.length + values.length * 8);
  bytes.set(head, 0);
  const view = new DataView(bytes.buffer);
  values.forEach((value, i) => view.setFloat64(head.length + i * 8, value, true));
  return bytesToBase64Url(bytes);
}
function unpackBytes(text: unknown): Uint8Array | null {
  return typeof text === 'string' && text.length <= 64 * 1024 ? base64UrlToBytes(text) : null;
}
function doublesOf(bytes: Uint8Array, from: number): number[] | null {
  if ((bytes.length - from) % 8 || from > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: (bytes.length - from) / 8 }, (_, i) => view.getFloat64(from + i * 8, true));
}
/** A BotBrain number as the record holds it: a non-finite one by its name (game/ai.ts decodeNumber reads either). */
const brainNumber = (value: number): number | string => (Number.isFinite(value) ? value : String(value));
const brainValue = (value: number | string): number => (typeof value === 'number' ? value : Number(value));
/** BotBrain with its numbers and ability clocks packed (MigrationBrain). A record whose pairs are not (index, number) packs
 *  them as they are, and the restore refuses it as it would. */
function packBrain(brain: BotBrain): MigrationBrain {
  const { n, a, ...rest } = brain;
  const out: MigrationBrain = { ...rest };
  if (n?.length) {
    let top = -1;
    for (let i = 0; i < n.length; i += 2) top = Math.max(top, Number(n[i]));
    const maskBytes = Math.ceil((top + 1) / 8);
    const head = new Array<number>(2 + maskBytes).fill(0);
    head[0] = maskBytes & 0xff; head[1] = maskBytes >> 8;
    const byIndex = new Map<number, number>();
    for (let i = 0; i < n.length; i += 2) byIndex.set(Number(n[i]), brainValue(n[i + 1]!));
    const values: number[] = [];
    for (const index of [...byIndex.keys()].sort((x, y) => x - y)) { head[2 + (index >> 3)]! |= 1 << (index & 7); values.push(byIndex.get(index)!); }
    out.n = packDoubles(values, head);
  }
  if (a?.length) out.a = packDoubles(a.map(brainValue));
  return out;
}
/** MigrationBrain back to BotBrain for game/ai.ts takeBrain (which validates it); null for a packing that is not one. */
function unpackBrain(packed: MigrationBrain | null | undefined): BotBrain | null {
  if (!packed || typeof packed !== 'object') return null;
  const { n, a, ...rest } = packed;
  const brain: BotBrain = { ...rest } as BotBrain;
  if (n !== undefined) {
    const bytes = unpackBytes(n);
    if (!bytes || bytes.length < 2) return null;
    const maskBytes = bytes[0]! | (bytes[1]! << 8);
    const values = bytes.length >= 2 + maskBytes ? doublesOf(bytes, 2 + maskBytes) : null;
    if (!values) return null;
    const pairs: (number | string)[] = [];
    let next = 0;
    for (let index = 0; index < maskBytes * 8; index++) {
      if (!(bytes[2 + (index >> 3)]! & (1 << (index & 7)))) continue;
      if (next >= values.length) return null;
      pairs.push(index, brainNumber(values[next++]!));
    }
    if (next !== values.length) return null;
    brain.n = pairs;
  }
  if (a !== undefined) {
    const bytes = unpackBytes(a), values = bytes ? doublesOf(bytes, 0) : null;
    if (!values) return null;
    brain.a = values.map(brainNumber);
  }
  return brain;
}
// ---- the hull exact (276; MigrationEntityExtras.hull): what a row rounds or does not carry, one packing for every live hull
/**
 * A live hull's numbers a row rounds or does not carry, in their packed order: its pose (millimetres and angle units on a
 * row), what the last step left that the next one reads and neither a row nor the checkpoint holds (the rollover's
 * countdown, the contact the hull took: a bot's brain reads it as the ground it lost; the fall the ledger owes and the
 * bounces of a landing), its hp (a row's is whole), its roof gun's slew (the first station's), the shell slot its special
 * action hands back, and its held input (a bot's last command, which the next tick reads before the brain writes a new
 * one: the gun-limit nudge reads its aim point); then the movement prediction checkpoint's values (movementPredictionState.ts,
 * the owner of the integrator state a pose cannot rebuild), then each further roof station's slew. ai.ts reads the last
 * step's atGunLimit and slopeBlocked the same way: the first is the checkpoint's, the second a flag below.
 */
const HULL_NUMBERS = ['x', 'y', 'z', 'yaw', 'speed', 'verticalSpeed', 'visualPitch', 'visualRoll', 'turretYaw', 'gunPitch',
  'rolloverCountdownS', 'impactMps', 'impactSource', 'impactNx', 'impactNz', 'fallImpactMps', 'solverLift', 'bounces', 'hp', 'roofYaw', 'roofPitch',
  'previousShellSlot', 'throttle', 'steer', 'shellSlot', 'actionBits', 'auxiliaryBits', 'fireIntentSeq', 'aimX', 'aimY', 'aimZ',
  'powerMult', 'accelMult', 'traverseMult', 'turretMult', 'aimTimeMult', 'bloomMult'] as const;
/** The last step's reading of the hull's damage (TankState._debuff: a bot's brain reads it before its next step's movement
 *  reads it again): its multipliers, each packed less 1 (none, a healthy hull's, rides), and its flags (the second byte).
 *  A multiplier below 0.5 (a red transmission's 0.3 and 0.45, a red turret ring's 0.2) does not come back from less 1
 *  (Sterbenz: it came back an ulp off): the six then ride as they are (HULL_DEBUFF_RAW). */
const HULL_DEBUFF_MULTS = ['powerMult', 'accelMult', 'traverseMult', 'turretMult', 'aimTimeMult', 'bloomMult'] as const;
const HULL_DEBUFF_BITS = ['immobile', 'wreck', 'gunYellow'] as const;
const HULL_DEBUFF_RAW = 1 << HULL_DEBUFF_BITS.length;
type HullNumber = typeof HULL_NUMBERS[number];
/** The flags (a byte): the input's brake, fire and aimLocked, an absent fire intent sequence and auxiliary bits, the last
 *  step's slope block (the special action's toggle rides every row: SPECIAL_ACTIVE). */
const HULL_INPUT_BITS = ['brake', 'fire', 'aimLocked'] as const;
const HULL_NO_FIRE_INTENT = 8, HULL_NO_AUXILIARY = 16, HULL_SLOPE_BLOCKED = 32;
/** The hull packing's layout (byte 0): a hull of another layout is refused, and the restore stands on the row alone. */
const HULL_LAYOUT = 1;
/** The layout, the checkpoint's version and flags (two bytes), the flags above, the damage reading's flags, the further roof
 *  stations' count. */
const HULL_HEAD_BYTES = 7;
const HULL_FIXED_VALUES = HULL_NUMBERS.length + MOVEMENT_PREDICTION_STATE_VALUES;

/** The hull's state, held input and the kit a step reads as a keyframe reads them (TankState, the authority's entity). */
interface HullHolder {
  state: TankState;
  combat: { hp: number; auxiliary?: { gunYaw: number; gunPitch: number; stations?: { gunYaw: number; gunPitch: number }[] } | null };
  specialAction?: { active: boolean; previousShellSlot: number } | null;
  input: { throttle: number; steer: number; brake: boolean; fire: boolean; aimLocked: boolean; shellSlot: number; actionBits: number;
    auxiliaryBits?: number; fireIntentSeq?: number | null; aimPoint: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown } };
}
/** A live hull exact (MigrationEntityExtras.hull): the head (HULL_HEAD_BYTES), a mask of the non-zero numbers, then those
 *  numbers (Float64, exact); null where the checkpoint cannot be taken (a non-finite integrator, which the client's
 *  predictor refuses as well). */
function packHull(entity: HullHolder): string | null {
  const state = entity.state, input = entity.input, checkpoint = captureMovementPredictionState(state);
  if (!checkpoint) return null;
  const aux = entity.combat.auxiliary, stations = aux?.stations ?? [], special = entity.specialAction;
  const raw = HULL_DEBUFF_MULTS.some((key) => state._debuff[key] - 1 + 1 !== state._debuff[key]);
  const numbers = [state.pos.x, state.pos.y, state.pos.z, state.yaw, state.speed, state.verticalSpeed, state.visualPitch, state.visualRoll,
    state.turretYaw, state.gunPitch, state.rolloverCountdownS, state.impactMps, state.impactSource, state.impactNx, state.impactNz, state.fallImpactMps,
    state._ride.solverLift, state._ride.bounces, entity.combat.hp, aux?.gunYaw ?? 0, aux?.gunPitch ?? 0, special?.previousShellSlot ?? 0,
    input.throttle, input.steer, input.shellSlot, input.actionBits, typeof input.auxiliaryBits === 'number' ? input.auxiliaryBits : 0,
    typeof input.fireIntentSeq === 'number' ? input.fireIntentSeq : 0, input.aimPoint.x, input.aimPoint.y, input.aimPoint.z,
    ...HULL_DEBUFF_MULTS.map((key) => (raw ? state._debuff[key] : state._debuff[key] - 1)), ...checkpoint.values,
    ...stations.flatMap((station) => [station.gunYaw, station.gunPitch])];
  if (stations.length > 255 || !numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  let flags = 0;
  HULL_INPUT_BITS.forEach((key, bit) => { if (input[key]) flags |= 1 << bit; });
  if (typeof input.fireIntentSeq !== 'number') flags |= HULL_NO_FIRE_INTENT;
  if (typeof input.auxiliaryBits !== 'number') flags |= HULL_NO_AUXILIARY;
  if (state.slopeBlocked) flags |= HULL_SLOPE_BLOCKED;
  const head = new Array<number>(HULL_HEAD_BYTES + Math.ceil(numbers.length / 8)).fill(0);
  let debuff = 0;
  HULL_DEBUFF_BITS.forEach((key, bit) => { if (state._debuff[key]) debuff |= 1 << bit; });
  if (raw) debuff |= HULL_DEBUFF_RAW;
  head[0] = HULL_LAYOUT; head[1] = checkpoint.version; head[2] = checkpoint.flags & 0xff; head[3] = checkpoint.flags >> 8; head[4] = flags; head[5] = debuff;
  head[6] = stations.length;
  const present: number[] = [];
  numbers.forEach((value, index) => { if (!Object.is(value, 0)) { head[HULL_HEAD_BYTES + (index >> 3)]! |= 1 << (index & 7); present.push(value); } });
  return packDoubles(present, head);
}
interface HullReading {
  numbers: number[];
  flags: number;
  debuff: number;
  checkpoint: { version: number; values: number[]; flags: number };
  /** Each further roof station's slew: [gunYaw, gunPitch]. */
  stations: [number, number][];
}
/** The packed hull, or null for a packing that is not one (another layout, a short or long body). */
function unpackHull(text: unknown): HullReading | null {
  const bytes = unpackBytes(text);
  if (!bytes || bytes.length < HULL_HEAD_BYTES || bytes[0] !== HULL_LAYOUT) return null;
  const count = HULL_FIXED_VALUES + 2 * bytes[6]!, maskBytes = Math.ceil(count / 8);
  const present = bytes.length >= HULL_HEAD_BYTES + maskBytes ? doublesOf(bytes, HULL_HEAD_BYTES + maskBytes) : null;
  if (!present) return null;
  const all: number[] = [];
  let next = 0;
  for (let index = 0; index < count; index++) {
    if (!(bytes[HULL_HEAD_BYTES + (index >> 3)]! & (1 << (index & 7)))) { all.push(0); continue; }
    if (next >= present.length) return null;
    all.push(present[next++]!);
  }
  if (next !== present.length) return null;
  const stations = Array.from({ length: bytes[6]! }, (_, i): [number, number] => [all[HULL_FIXED_VALUES + 2 * i]!, all[HULL_FIXED_VALUES + 2 * i + 1]!]);
  return { numbers: all.slice(0, HULL_NUMBERS.length), flags: bytes[4]!, debuff: bytes[5]!, stations,
    checkpoint: { version: bytes[1]!, flags: bytes[2]! | (bytes[3]! << 8), values: all.slice(HULL_NUMBERS.length, HULL_FIXED_VALUES) } };
}
const hullNumber = (reading: HullReading, key: HullNumber): number => reading.numbers[HULL_NUMBERS.indexOf(key)]!;
/** Whether a row is the hull's own reading rounded (every pose field the row carries, as captureEntityRow rounds it). */
function rowReadsHull(row: EntityRow, reading: HullReading): boolean {
  const n = (key: HullNumber): number => hullNumber(reading, key);
  return row.x === quantizePosition(n('x')) && row.y === quantizePosition(n('y')) && row.z === quantizePosition(n('z'))
    && row.yaw === quantizeAngle(n('yaw')) && row.speed === quantizeVelocity(n('speed')) && row.verticalSpeed === quantizeVelocity(n('verticalSpeed'))
    && row.pitch === quantizeAngle(n('visualPitch')) && row.roll === quantizeAngle(n('visualRoll'))
    && row.turretYaw === quantizeAngle(n('turretYaw')) && row.gunPitch === quantizeAngle(n('gunPitch'));
}
/** The movement checkpoint's scalars a newer row leaves the keyframe's (movementPredictionState.ts SCALARS' order): the
 *  turn rate, the turret's slew, the gun's bloom and the engine's spool, none of which a pose seats. */
const HULL_DRIVE_SCALARS = (['yawRate', 'turretYawRate', 'bloomF', '_spool'] as const).map((key) => [key, MOVEMENT_PREDICTION_SCALARS.indexOf(key)] as const);
/**
 * A live hull taken up exact (276). Where the row is the hull's own reading rounded (the keyframe's own row, or a replay's
 * row: rowReadsHull), the pose exact, the checkpoint whole, what the last step left, the hp exact where the row's rounds
 * it: the old host's hull to the bit (a fight from a keyframe alone parted by tens of metres on the rows' rounding and on
 * the gun's limit flag, which no row carried: the CTF probe's 23 m in 10 s, now none). From a newer row (a reading of its
 * own), the drive alone (the turn rate, the slew, the bloom, the spool); the rest belongs with the pose the row seats.
 * Either way the held input, the roof guns' slew and the special action's toggle, which no pose seats.
 */
function restoreHull(entity: HullHolder, row: EntityRow, reading: HullReading, gapS: number): void {
  const state = entity.state, input = entity.input;
  const n = (key: HullNumber): number => hullNumber(reading, key);
  const own = rowReadsHull(row, reading);
  if (own) {
    state.pos.set(n('x'), n('y'), n('z'));
    state.yaw = n('yaw'); state.speed = n('speed'); state.verticalSpeed = n('verticalSpeed');
    state.visualPitch = n('visualPitch'); state.visualRoll = n('visualRoll'); state.turretYaw = n('turretYaw'); state.gunPitch = n('gunPitch');
    if (!applyMovementPredictionState(state, reading.checkpoint, state._sup.cg)) return;
    state.rolloverCountdownS = n('rolloverCountdownS');
    state.impactMps = n('impactMps'); state.impactSource = n('impactSource'); state.impactNx = n('impactNx'); state.impactNz = n('impactNz');
    state.fallImpactMps = n('fallImpactMps'); state._ride.solverLift = n('solverLift'); state._ride.bounces = n('bounces');
    state.slopeBlocked = (reading.flags & HULL_SLOPE_BLOCKED) !== 0;
    for (const key of HULL_DEBUFF_MULTS) state._debuff[key] = reading.debuff & HULL_DEBUFF_RAW ? n(key) : n(key) + 1;
    HULL_DEBUFF_BITS.forEach((key, bit) => { state._debuff[key] = (reading.debuff & (1 << bit)) !== 0; });
    if (Math.round(n('hp')) === row.hp) entity.combat.hp = n('hp');
  } else if (reading.checkpoint.values.length === MOVEMENT_PREDICTION_STATE_VALUES) {
    for (const [key, index] of HULL_DRIVE_SCALARS) (state as unknown as Record<string, number>)[key] = reading.checkpoint.values[index]!;
    // a flip or roll mid-turn at the keyframe turns on, less the turn it made to the row at the rate it turned (turbo-spin-275,
    // thrust-flips-277: a migration mid-spin finished the turn the old host owed), and a spent dodge stays spent
    // (flip-boost-276): no row carries either
    const spin = checkpointAirSpin(reading.checkpoint);
    if (spin.code) restoreAirSpin(state, spin.code, gapS, spin.rate);
    if (spin.flipUsed) state._flipUsed = true;
  }
  const aux = entity.combat.auxiliary;
  if (aux) {
    aux.gunYaw = n('roofYaw'); aux.gunPitch = n('roofPitch');
    reading.stations.forEach(([yaw, pitch], index) => { const station = aux.stations?.[index]; if (station) { station.gunYaw = yaw; station.gunPitch = pitch; } });
    // the pose's copy the armour reads (auxiliarySystems.ts stepRoofGun writes it from the kit at each step's start)
    const pose = state as TankState & { roofGunYaw?: number; roofGunPitch?: number };
    pose.roofGunYaw = aux.gunYaw; pose.roofGunPitch = aux.gunPitch;
  }
  if (entity.specialAction) {
    // the toggle as the row has it (SPECIAL_ACTIVE: the keyframe's own row or a newer one), and the hull's hydropneumatic
    // lay with it (275 left both the construction's; carrying the toggle alone left a Strv 103B's lay apart)
    entity.specialAction.active = (row.flags & ENTITY_FLAGS.SPECIAL_ACTIVE) !== 0;
    entity.specialAction.previousShellSlot = n('previousShellSlot');
    bindSpecialActionState(entity as unknown as Parameters<typeof bindSpecialActionState>[0]);
  }
  input.throttle = n('throttle'); input.steer = n('steer'); input.shellSlot = n('shellSlot'); input.actionBits = n('actionBits');
  if (!(reading.flags & HULL_NO_AUXILIARY)) input.auxiliaryBits = n('auxiliaryBits');
  input.fireIntentSeq = reading.flags & HULL_NO_FIRE_INTENT ? null : n('fireIntentSeq');
  HULL_INPUT_BITS.forEach((key, bit) => { input[key] = (reading.flags & (1 << bit)) !== 0; });
  input.aimPoint.set(n('aimX'), n('aimY'), n('aimZ'));
}

/**
 * The extras beside a keyframe row: what the wire row does not carry (MigrationEntityExtras). Round 2 (U2): only what
 * differs from the state a fresh host builds (restoreCombatExtras keeps the fresh entity's value for an absent field):
 * a channel at rest is null and an all-rest list absent, a full magazine absent, a consumable block without cooldowns or
 * active items carries its charges alone, an auxiliary kit at rest is absent. Every field written for every entity
 * nearly doubled the sealed keyframe each peer receives every 2 s (19 KB to 36 KB typical).
 */
export function captureEntityExtras(actor: MatchActor): MigrationEntityExtras[] {
  const out: MigrationEntityExtras[] = [];
  const timeS = actor.authority.timeS;
  for (const entity of actor.authority.entities) {
    const entityId = actor.wireIdOf(entity.id);
    if (entityId === null) continue;
    const combat = entity.combat;
    const modules: Record<string, string> = {};
    const moduleHp: Record<string, [number, number]> = {};
    for (const [moduleId, module] of Object.entries(combat.modules as Record<string, { state?: string; hp?: number; maxHp?: number; repairT?: number } | undefined>)) {
      if (module?.state && module.state !== 'ok') modules[moduleId] = module.state;
      if (module && typeof module.hp === 'number' && typeof module.maxHp === 'number' && module.hp < module.maxHp) moduleHp[moduleId] = [module.hp, module.state === 'red' ? module.repairT ?? 0 : 0];
    }
    const crew: Record<string, boolean> = {};
    for (const [crewId, able] of Object.entries(combat.crew)) if (!able) crew[crewId] = false;
    const burning = !!combat.fire?.burning;
    const extras: MigrationEntityExtras = { entityId, kills: entity.kills, damage: Math.round(entity.damage), modules, crew, burning };
    if (Object.keys(moduleHp).length) extras.moduleHp = moduleHp;
    if (burning) extras.fire = [combat.fire.ticksLeft, combat.fire.tickTimer];
    if (combat.reloadChannels?.some((channel) => !reloadAtRest(channel))) {
      extras.reloads = combat.reloadChannels.map((channel) => (reloadAtRest(channel) ? null : captureReload(channel)));
    }
    if (combat.gunReload && !reloadAtRest(combat.gunReload)) extras.gunReload = captureReload(combat.gunReload);
    if (combat.magazine && combat.magazine.rounds !== combat.magazine.capacity) extras.magazineRounds = combat.magazine.rounds;
    if (combat.launcherSalvoShots) extras.launcherSalvoShots = combat.launcherSalvoShots;
    if (combat.launcherCursor) extras.launcherCursor = combat.launcherCursor;
    const consumables = entity.consumables;
    if (consumables) {
      const activeFor: Record<string, number> = {};
      for (const [item, until] of Object.entries(consumables.until)) if (until > timeS) activeFor[item] = leftOf(until, timeS);
      const readyIn = consumables.readyAt.map((at) => leftOf(at, timeS));
      extras.consumables = { charges: consumables.charges.slice(), ...(readyIn.some((left) => left > 0) ? { readyIn } : {}), ...(Object.keys(activeFor).length ? { activeFor } : {}) };
    }
    const aux = combat.auxiliary;
    if (aux) {
      const auxiliary: NonNullable<MigrationEntityExtras['auxiliary']> = {
        lights: aux.lights, gunOn: aux.gunOn, smokeCharges: aux.smokeCharges, smokeReadyIn: leftOf(aux.smokeReadyAt, timeS),
        shots: aux.shots, nextShotIn: leftOf(aux.nextShot, timeS),
        ...(aux.stations?.length ? { stations: aux.stations.map((station): [number, number] => [station.shots, leftOf(station.nextShot, timeS)]) } : {}),
      };
      if (!auxiliaryAtRest(auxiliary, freshAuxiliaryOf(entity.spec))) extras.auxiliary = auxiliary;
    }
    // a live hull exact (276: its pose, hp, integrator and held input) and a bot's way; a down bot's brain streams alone
    // (fix-up r2: down or benched, it drives a next life on from them on the old host)
    if (!combat.destroyed) {
      // Turbo's cooldown and the air spin's (turbo-spin-275, flip-boost-276): a fresh host has both ready; a flip or roll
      // still turning, its rate and a spent dodge ride the hull exact's checkpoint (276)
      const turboReadyIn = leftOf(entity.turboReadyS ?? -Infinity, timeS);
      if (turboReadyIn > 0) extras.turboReadyIn = turboReadyIn;
      const airSpinReadyIn = leftOf(entity.airSpinReadyS ?? -Infinity, timeS);
      if (airSpinReadyIn > 0) extras.airSpinReadyIn = airSpinReadyIn;
      const hull = packHull(entity as unknown as HullHolder);
      if (hull) extras.hull = hull;
      const way = entity.aiCtl?.captureDrive?.();
      if (way) extras.way = way;
    } else {
      const streams = entity.aiCtl?.captureStreams?.();
      if (streams && (streams[0] !== null || streams[1] !== null)) extras.streams = streams;
    }
    // a bot's brain, live or down (275; game/ai.ts BotBrain): absent where it is the construction's
    const brain = entity.aiCtl?.captureBrain?.();
    if (brain) extras.brain = packBrain(brain);
    out.push(extras);
  }
  return out;
}
