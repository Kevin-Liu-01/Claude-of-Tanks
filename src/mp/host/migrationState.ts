import type { DestructionLogEntry } from '../../sim/destructionEvents.ts';
import { mergeDestructionLogs } from '../wire/destructionLog.ts';
import type { NewModeCheckpoint } from '../../sim/authoritativeMatch.ts';
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
import { dequantizePosition, dequantizeReloadS, dequantizeUnitComponent } from '../wire/quantize.ts';
import { bytesToBase64Url } from '../match/base64url.ts';
import { applyAuthorityRow } from '../match/prediction.ts';
import { MIGRATION_EVENT_KIND, MIGRATION_MAX_CHUNKS } from '../match/migrationStore.ts';
import type { HostBootConfig, HostResumeState, MigrationEntityExtras, MigrationReload } from './hostProtocol.ts';
import type { RoomMatchStatus } from '../room/protocol.ts';
import { FIRE_BASE_TICKS, selectShell, strainModule, tickModuleRepairs, tickReload } from '../../sim/damage.ts';
import type { CombatState, DamageTankSpec } from '../../sim/damage.ts';
import { applyConsumableMultipliers } from '../../sim/consumableRules.ts';
import type { ConsumableState } from '../../sim/consumableRules.ts';
import { createAuxiliaryState } from '../../sim/auxiliarySystems.ts';
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
  tick: number;
  battleTimeMs: number;
  /** The authority clock (s) at `tick` (authority.timeS; battleTimeMs also counts a resumed host's offset). */
  timeS?: number;
  phase: 'countdown' | 'playing' | 'ended';
  frame: SnapshotFrame;
  entities: MigrationEntityExtras[];
}

export function encodeMigrationKeyframe(keyframe: MigrationKeyframe): Uint8Array {
  const packet = encodeMessage(buildSnapshotPacket(keyframe.frame, null));
  const extras = encoder.encode(JSON.stringify({ tick: keyframe.tick, battleTimeMs: keyframe.battleTimeMs, timeS: keyframe.timeS, phase: keyframe.phase, entities: keyframe.entities, modeCheckpoint: keyframe.modeCheckpoint }));
  const out = new Uint8Array(4 + packet.byteLength + extras.byteLength);
  new DataView(out.buffer).setUint32(0, packet.byteLength, true);
  out.set(packet, 4);
  out.set(extras, 4 + packet.byteLength);
  return out;
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
    ...(extras.modeCheckpoint ? { modeCheckpoint: extras.modeCheckpoint as NewModeCheckpoint } : {}),
  };
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
 * The keyframe's mode checkpoint with the bookkeeping each of those revives did (matchModes.ts reviveAtSpawn: the pending
 * respawn dropped, alive, its death unscored, back on the field and no longer resting). Without it the new host's mode
 * revived the hull a second time when the keyframe's respawn fell due: back on its spawn, its fight reset again.
 * The life itself too (integration IR2, 2026-11-03): restoreCheckpoint reads `lives` before `destroyed`, so a hull the
 * keyframe had down came back 'down' (set alive later only by the death watch's restore side door) and one it had benched
 * came back benched and stayed off the field. A rescued hull has left for good and is never revived (reviveAtSpawn).
 */
function checkpointAfterRevives(checkpoint: NewModeCheckpoint, revived: ReadonlySet<string>): NewModeCheckpoint {
  if (!revived.size || !checkpoint.mode) return checkpoint;
  const mode = checkpoint.mode, waves = mode.waves;
  return {
    ...checkpoint,
    mode: {
      ...mode,
      respawns: mode.respawns.filter(([id]) => !revived.has(id)),
      destroyed: mode.destroyed.map(([id, dead]): [string, boolean] => [id, dead && !revived.has(id)]),
      ...(mode.lives ? { lives: mode.lives.map(([id, life]): [string, typeof life] => [id, revived.has(id) && life !== 'rescued' ? 'alive' : life]) } : {}),
      scored: mode.scored.filter((id) => !revived.has(id)),
      ...(waves ? { waves: { ...waves, inactive: waves.inactive.filter((id) => !revived.has(id)), restedAt: waves.restedAt.filter(([id]) => !revived.has(id)) } } : {}),
    },
  };
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
  if (combat.auxiliary && aux && typeof aux === 'object') {
    const state = combat.auxiliary;
    const after = (leftS: unknown): number => timeS + Math.max(0, finiteOr(leftS, 0) - auxAgeS);
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
export function migrationFallback({ latestFrame, latestFrameAtMs, nowMs, resumeTick, countdownMs, roomMatchStatus = null, kept = false }: {
  latestFrame: SnapshotFrame | null; latestFrameAtMs: number | null; nowMs: number; resumeTick: number; countdownMs: number;
  /** The room's record of the elected match (the seat's room snapshot); null when it names another match or none. */
  roomMatchStatus?: RoomMatchStatus | null;
  /** The room kept this seat as the host with no one else to elect (no election: the session's own last resort). */
  kept?: boolean;
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
  return { kind: 'restart', resumeTick: tick, state: { tick, battleTimeMs: 0, phase: 'countdown', frame, entities: [] }, ...(evidence ? { lastResort: evidence } : {}) };
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
export function applyResumeState(actor: MatchActor, state: HostResumeState): { restored: number; skipped: number; destroyedRestored: number; destroyedUnknown: number } {
  const extrasTick = Number.isInteger(state.keyframeTick) ? state.keyframeTick! : state.tick;
  const frameGapS = resumeFrameGapS(state, extrasTick);
  const revived = revivedSinceKeyframe(actor, state, extrasTick);
  if (state.modeCheckpoint) actor.authority.restoreModeCheckpoint(checkpointAfterRevives(state.modeCheckpoint, revived));
  let restored = 0;
  let skipped = 0;
  const extrasById = new Map(state.entities.map((entry) => [entry.entityId, entry]));
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
    restored++;
  }
  const destroyed = actor.authority.restoreDestroyedObstacles(state.frame.destroyed, state.frame.meta.destructibleRevision);
  // destruction (docs/DESTRUCTION.md §8.3): stages and collapses (records, heaps, the route grid) without events
  if (state.frame.destruction?.length) actor.authority.restoreDestruction(state.frame.destruction);
  // the smoke screens still standing (round 2 U2): the frame's meta carries them on the battle clock (matchActor.ts
  // metaOnBattleClock), this actor's authority counts from its resumed battle time
  const smoke = smokeScreensOf(state.frame.meta.smokeJson);
  if (smoke.length) actor.authority.restoreSmokeScreens(smoke, -actor.resumedBattleTimeMs / 1000);
  return { restored, skipped, destroyedRestored: destroyed.restored, destroyedUnknown: destroyed.unknown };
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
    out.push(extras);
  }
  return out;
}
