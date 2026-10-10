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
import type { MatchActor } from '../../../server/match/matchActor.ts';
import { eraPlateIndices } from '../wire/era.ts';
import { MAX_EVENT_JSON_BYTES } from '../wire/constants.ts';
import { applySnapshotPacket, buildSnapshotPacket, decodeMessage, encodeMessage } from '../wire/codec.ts';
import type { SnapshotFrame, WireEvent } from '../wire/messages.ts';
import { dequantizeAngle, dequantizePosition, dequantizeReloadS, dequantizeVelocity } from '../wire/quantize.ts';
import { bytesToBase64Url } from '../match/base64url.ts';
import { MIGRATION_EVENT_KIND, MIGRATION_MAX_CHUNKS } from '../match/migrationStore.ts';
import type { HostBootConfig, HostResumeState, MigrationEntityExtras } from './hostProtocol.ts';

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
  phase: 'countdown' | 'playing' | 'ended';
  frame: SnapshotFrame;
  entities: MigrationEntityExtras[];
}

export function encodeMigrationKeyframe(keyframe: MigrationKeyframe): Uint8Array {
  const packet = encodeMessage(buildSnapshotPacket(keyframe.frame, null));
  const extras = encoder.encode(JSON.stringify({ tick: keyframe.tick, battleTimeMs: keyframe.battleTimeMs, phase: keyframe.phase, entities: keyframe.entities, modeCheckpoint: keyframe.modeCheckpoint }));
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
  return { tick: extras.tick as number, battleTimeMs: extras.battleTimeMs, phase, frame, entities, ...(extras.modeCheckpoint ? { modeCheckpoint: extras.modeCheckpoint as NewModeCheckpoint } : {}) };
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
export type SealedBootConfig = Omit<HostBootConfig, 'hostSecret' | 'resume' | 'manifestBase'>;

export function encodeBootConfig(config: HostBootConfig): Uint8Array {
  const { hostSecret: _secret, resume: _resume, manifestBase: _base, ...rest } = config;
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

/**
 * What an elected seat resumes the match from (MatchSession's migration boot): the newer of the sealed keyframe and its
 * own newest frame — that frame's rows overlaid on the keyframe's, hidden entities keeping the keyframe's — and every
 * prop it was told fell. A `world_prop_destroyed` reaches a peer the tick its prop falls; the destroyed list rides the
 * next snapshot, up to two ticks later. A host that died between the two left the fall in the seat's event queue alone
 * (fix/mp-migration-props, 2026-10-02: 1 world-events audit run in 3 on the PR head): the new host booted without it,
 * stood the prop again, a hull crushed it a second time and every peer crunched a tree the old host had felled. The
 * list is the base's plus those falls, at the base's revision plus one per fall it adds — the old host counted each
 * when it destroyed it — and never below the list's length (the host actor republishes its list when the revision moves).
 */
export function resumeStateFromRetained(
  keyframe: MigrationKeyframe,
  keyframeAtMs: number,
  latest: SnapshotFrame | null,
  latestAtMs: number | null,
  fallen: readonly number[],
  destructionEvents: readonly DestructionLogEntry[] = [],
): { state: HostResumeState; baseTick: number; baseAtMs: number } {
  const state: HostResumeState = { ...keyframe };
  let baseTick = keyframe.tick;
  let baseAtMs = keyframeAtMs;
  if (latest && latest.tick > keyframe.tick && latestAtMs !== null) {
    // What this viewer saw is exact to its newest frame: overlay those rows; hidden entities keep the sealed keyframe's.
    const rows = new Map(state.frame.entities.map((row) => [row.entityId, row]));
    for (const row of latest.entities) rows.set(row.entityId, row);
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
  return { state, baseTick, baseAtMs };
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
  if (state.modeCheckpoint) actor.authority.restoreModeCheckpoint(state.modeCheckpoint);
  let restored = 0;
  let skipped = 0;
  const extrasById = new Map(state.entities.map((entry) => [entry.entityId, entry]));
  for (const row of state.frame.entities) {
    const entity = actor.entityForWireId(row.entityId);
    if (!entity) { skipped++; continue; }
    const tank = entity.state;
    tank.pos.x = dequantizePosition(row.x);
    tank.pos.y = dequantizePosition(row.y);
    tank.pos.z = dequantizePosition(row.z);
    tank.yaw = dequantizeAngle(row.yaw);
    tank.speed = dequantizeVelocity(row.speed);
    tank.verticalSpeed = dequantizeVelocity(row.verticalSpeed);
    tank.turretYaw = dequantizeAngle(row.turretYaw);
    tank.gunPitch = dequantizeAngle(row.gunPitch);
    tank.visualPitch = dequantizeAngle(row.pitch);
    tank.visualRoll = dequantizeAngle(row.roll);
    const combat = entity.combat;
    combat.hp = row.hp;
    combat.maxHp = Math.max(1, row.maxHp);
    combat.destroyed = (row.flags & 1) !== 0 || row.hp <= 0;
    combat.shellSlot = row.shellSlot;
    if (Array.isArray(combat.ammo)) {
      const ammo = [row.ammo0, row.ammo1, row.ammo2];
      for (let slot = 0; slot < combat.ammo.length && slot < ammo.length; slot++) combat.ammo[slot] = ammo[slot]!;
    }
    combat.reload = restoreReload(combat.reload as ReloadLike | undefined, dequantizeReloadS(row.reload), dequantizeReloadS(row.reloadTotal), RELOAD_KINDS[row.reloadKind] ?? 'ready') as typeof combat.reload;
    if (combat.gunReload && combat.gunReload !== combat.reload) {
      restoreReload(combat.gunReload as ReloadLike, dequantizeReloadS(row.gunReload), dequantizeReloadS(row.gunReloadTotal), RELOAD_KINDS[row.gunReloadKind] ?? 'ready');
    }
    if (row.eraSpent.length) {
      const table = eraPlateIndices(entity.spec.armor as { hullPlates?: { kind?: string; name?: string }[]; turretPlates?: { kind?: string; name?: string }[] });
      const byIndex = new Map<number, string>();
      for (const [name, index] of table) byIndex.set(index, name);
      combat.eraSpent ??= new Set();
      for (const index of row.eraSpent) { const name = byIndex.get(index); if (name) combat.eraSpent.add(name); }
    }
    // the migration seed (P3b): the actor remembers what each entity was restored from, so its own seat's hint can be bounded
    actor.noteRestoredRow(row.entityId, row.tick, tank.pos.x, tank.pos.z);
    const extras = extrasById.get(row.entityId);
    if (extras) {
      entity.kills = extras.kills;
      entity.damage = extras.damage;
      for (const [moduleId, moduleState] of Object.entries(extras.modules)) {
        const module = (combat.modules as Record<string, { state?: string } | undefined>)[moduleId];
        if (module && (moduleState === 'ok' || moduleState === 'yellow' || moduleState === 'red')) module.state = moduleState;
      }
      for (const [crewId, able] of Object.entries(extras.crew)) if (crewId in combat.crew) combat.crew[crewId] = able;
      if (combat.fire) combat.fire.burning = extras.burning;
    }
    restored++;
  }
  const destroyed = actor.authority.restoreDestroyedObstacles(state.frame.destroyed, state.frame.meta.destructibleRevision);
  // destruction (docs/DESTRUCTION.md §8.3): stages and collapses (records, heaps, the route grid) without events
  if (state.frame.destruction?.length) actor.authority.restoreDestruction(state.frame.destruction);
  return { restored, skipped, destroyedRestored: destroyed.restored, destroyedUnknown: destroyed.unknown };
}

/** The extras beside a keyframe row: what the wire row does not carry. */
export function captureEntityExtras(actor: MatchActor): MigrationEntityExtras[] {
  const out: MigrationEntityExtras[] = [];
  for (const entity of actor.authority.entities) {
    const entityId = actor.wireIdOf(entity.id);
    if (entityId === null) continue;
    const modules: Record<string, string> = {};
    for (const [moduleId, module] of Object.entries(entity.combat.modules as Record<string, { state?: string } | undefined>)) {
      if (module?.state && module.state !== 'ok') modules[moduleId] = module.state;
    }
    const crew: Record<string, boolean> = {};
    for (const [crewId, able] of Object.entries(entity.combat.crew)) if (!able) crew[crewId] = false;
    out.push({ entityId, kills: entity.kills, damage: Math.round(entity.damage), modules, crew, burning: !!entity.combat.fire?.burning });
  }
  return out;
}
