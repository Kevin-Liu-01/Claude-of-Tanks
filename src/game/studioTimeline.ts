import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Pure Scene Studio cinematic timeline helpers.
 *
 * The runtime owns Three.js objects and effects. This module owns the small,
 * serializable storyboard contract and allocation-free sampling used by the
 * render loop. Keeping it DOM/WebGL-free makes the 20-second cap, ordering,
 * interpolation, and round-trip rules directly testable in Node.
 */

export const STUDIO_MIN_DURATION_MS = 1000;
export const STUDIO_MAX_DURATION_MS = 20000;
const STUDIO_DEFAULT_DURATION_MS = 12000;
const STUDIO_MAX_CAMERA_SHOTS = 32;
const STUDIO_MAX_ACTOR_KEYS = 64;

export type StudioTransition = 'smooth' | 'linear' | 'cut';
export type StudioVec2 = [number, number];
export type StudioVec3 = [number, number, number];

export interface CameraShotInput {
  id?: RuntimeValue;
  label?: RuntimeValue;
  tMs?: RuntimeValue;
  pos?: RuntimeValue;
  lookAt?: RuntimeValue;
  fov?: RuntimeValue;
  rollDeg?: RuntimeValue;
  transition?: RuntimeValue;
}

export interface CameraShot {
  id: string;
  label: string;
  tMs: number;
  pos: StudioVec3;
  lookAt: StudioVec3;
  fov: number;
  rollDeg: number;
  transition: StudioTransition;
}

export interface ActorKeyInput {
  id?: RuntimeValue;
  tMs?: RuntimeValue;
  pos?: RuntimeValue;
  facingDeg?: RuntimeValue;
  turretDeg?: RuntimeValue;
  gunDeg?: RuntimeValue;
  transition?: RuntimeValue;
}

export interface ActorKey {
  id: string;
  tMs: number;
  pos: StudioVec2;
  facingDeg: number;
  turretDeg: number;
  gunDeg: number;
  transition: StudioTransition;
}

export interface ActorTrackInput {
  actor?: RuntimeValue;
  keys?: readonly ActorKeyInput[] | RuntimeValue;
}

export interface ActorTrack {
  actor: string;
  keys: ActorKey[];
}

export interface StoryboardInput {
  durationMs?: RuntimeValue;
  shots?: readonly CameraShotInput[] | RuntimeValue;
  actorTracks?: readonly ActorTrackInput[] | RuntimeValue;
}

export interface Storyboard {
  version: 1;
  durationMs: number;
  shots: CameraShot[];
  actorTracks: ActorTrack[];
}

export interface CameraRailSample {
  x?: number;
  y?: number;
  z?: number;
  lookX?: number;
  lookY?: number;
  lookZ?: number;
  fov?: number;
  rollDeg?: number;
  shotId?: string;
}

export interface ActorTrackSample {
  x?: number;
  z?: number;
  facingDeg?: number;
  turretDeg?: number;
  gunDeg?: number;
  keyId?: string;
}

const CAMERA_TRANSITIONS = new Set<StudioTransition>(['smooth', 'linear', 'cut']);
const ACTOR_TRANSITIONS = new Set<StudioTransition>(['smooth', 'linear', 'cut']);

const finite = (value: RuntimeValue, fallback = 0): number => Number.isFinite(Number(value))
  ? Number(value)
  : fallback;
const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));

export function clampStudioDuration(value: RuntimeValue): number {
  return Math.round(clamp(
    finite(value, STUDIO_DEFAULT_DURATION_MS),
    STUDIO_MIN_DURATION_MS,
    STUDIO_MAX_DURATION_MS,
  ));
}

export function clampStudioTime(value: RuntimeValue, durationMs: RuntimeValue = STUDIO_DEFAULT_DURATION_MS): number {
  return Math.round(clamp(finite(value, 0), 0, clampStudioDuration(durationMs)));
}

function vec3(value: RuntimeValue, fallback: StudioVec3): StudioVec3 {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [
    finite(value[0], fallback[0]),
    finite(value[1], fallback[1]),
    finite(value[2], fallback[2]),
  ];
}

function actorPos(value: RuntimeValue, fallback: StudioVec2 = [0, 0]): StudioVec2 {
  if (!Array.isArray(value) || value.length < 2) return [...fallback];
  return value.length >= 3
    ? [finite(value[0], fallback[0]), finite(value[2], fallback[1])]
    : [finite(value[0], fallback[0]), finite(value[1], fallback[1])];
}

function stableId(value: RuntimeValue, prefix: string, index: number): string {
  const id = String(value || '').trim();
  return id || `${prefix}-${index + 1}`;
}

function dedupeAtTime<T extends { tMs: number }>(records: readonly T[]): T[] {
  const byTime = new Map<number, T>();
  for (const record of records) byTime.set(record.tMs, record);
  return [...byTime.values()].sort((a, b) => a.tMs - b.tMs);
}

function normalizeShot(raw: CameraShotInput | undefined, index: number, durationMs: number): CameraShot {
  const candidate = typeof raw?.transition === 'string'
    ? raw.transition as StudioTransition
    : 'smooth';
  const transition = CAMERA_TRANSITIONS.has(candidate)
    ? candidate
    : 'smooth';
  return {
    id: stableId(raw?.id, 'shot', index),
    label: String(raw?.label || `Shot ${index + 1}`).trim().slice(0, 48) || `Shot ${index + 1}`,
    tMs: clampStudioTime(raw?.tMs, durationMs),
    pos: vec3(raw?.pos, [0, 4, -12]),
    lookAt: vec3(raw?.lookAt, [0, 2, 0]),
    fov: clamp(finite(raw?.fov, 50), 10, 120),
    rollDeg: clamp(finite(raw?.rollDeg, 0), -60, 60),
    transition,
  };
}

function normalizeActorKey(raw: ActorKeyInput | undefined, index: number, durationMs: number): ActorKey {
  const candidate = typeof raw?.transition === 'string'
    ? raw.transition as StudioTransition
    : 'smooth';
  const transition = ACTOR_TRANSITIONS.has(candidate)
    ? candidate
    : 'smooth';
  return {
    id: stableId(raw?.id, 'key', index),
    tMs: clampStudioTime(raw?.tMs, durationMs),
    pos: actorPos(raw?.pos),
    facingDeg: finite(raw?.facingDeg, 0),
    turretDeg: finite(raw?.turretDeg, 0),
    gunDeg: finite(raw?.gunDeg, 0),
    transition,
  };
}

/** Return a canonical, bounded, JSON-safe storyboard. */
export function normalizeStoryboard(input: StoryboardInput = {}): Storyboard {
  const durationMs = clampStudioDuration(input.durationMs);
  const sourceShots = Array.isArray(input.shots) ? input.shots : [];
  const normalizedShots: CameraShot[] = [];
  const shotCount = Math.min(sourceShots.length, STUDIO_MAX_CAMERA_SHOTS);
  for (let index = 0; index < shotCount; index++) {
    normalizedShots.push(normalizeShot(sourceShots[index], index, durationMs));
  }
  const shots = dedupeAtTime(normalizedShots);

  const tracksByActor = new Map<string, ActorKey[]>();
  for (const rawTrack of Array.isArray(input.actorTracks) ? input.actorTracks : []) {
    const actor = String(rawTrack?.actor ?? '').trim();
    if (!actor) continue;
    const prior = tracksByActor.get(actor) || [];
    const room = Math.max(0, STUDIO_MAX_ACTOR_KEYS - prior.length);
    const sourceKeys = Array.isArray(rawTrack.keys) ? rawTrack.keys : [];
    const keys: ActorKey[] = [];
    const keyCount = Math.min(sourceKeys.length, room);
    for (let index = 0; index < keyCount; index++) {
      keys.push(normalizeActorKey(sourceKeys[index], prior.length + index, durationMs));
    }
    tracksByActor.set(actor, prior.concat(keys));
  }
  const actorTracks: ActorTrack[] = [];
  for (const [actor, keys] of tracksByActor) {
    const normalizedKeys = dedupeAtTime(keys);
    if (normalizedKeys.length) actorTracks.push({ actor, keys: normalizedKeys });
  }

  return { version: 1, durationMs, shots, actorTracks };
}

export function upsertCameraShot(storyboard: StoryboardInput, shot: CameraShotInput): Storyboard {
  const board = normalizeStoryboard(storyboard);
  const id = String(shot?.id || '').trim();
  const index = id ? board.shots.findIndex((item) => item.id === id) : -1;
  const shots: CameraShotInput[] = index >= 0
    ? board.shots.map((item, itemIndex) => itemIndex === index ? { ...item, ...shot, id } : item)
    : [...board.shots, shot];
  return normalizeStoryboard({ ...board, shots });
}

export function removeCameraShot(storyboard: StoryboardInput, ref: RuntimeValue): Storyboard {
  const board = normalizeStoryboard(storyboard);
  const id = String(ref || '');
  board.shots = board.shots.filter((shot) => shot.id !== id);
  return normalizeStoryboard(board);
}

export function upsertActorKey(
  storyboard: StoryboardInput,
  actorRef: RuntimeValue,
  key: ActorKeyInput,
): Storyboard {
  const board = normalizeStoryboard(storyboard);
  const actor = String(actorRef ?? '').trim();
  if (!actor) return board;
  let track = board.actorTracks.find((item) => item.actor === actor);
  if (!track) {
    track = { actor, keys: [] };
    board.actorTracks.push(track);
  }
  const id = String(key?.id || '').trim();
  const sameId = id ? track.keys.findIndex((item) => item.id === id) : -1;
  const sameTime = track.keys.findIndex((item) => item.tMs === clampStudioTime(key?.tMs, board.durationMs));
  const index = sameId >= 0 ? sameId : sameTime;
  const keys: ActorKeyInput[] = index >= 0
    ? track.keys.map((item, itemIndex) => itemIndex === index
      ? { ...item, ...key, ...(id ? { id } : {}) }
      : item)
    : [...track.keys, key];
  const actorTracks: ActorTrackInput[] = board.actorTracks.map((item) => (
    item.actor === actor ? { actor, keys } : item
  ));
  return normalizeStoryboard({ ...board, actorTracks });
}

export function clearActorTrack(storyboard: StoryboardInput, actorRef: RuntimeValue): Storyboard {
  const board = normalizeStoryboard(storyboard);
  const actor = String(actorRef ?? '').trim();
  board.actorTracks = board.actorTracks.filter((track) => track.actor !== actor);
  return normalizeStoryboard(board);
}

function segmentIndex<T extends { tMs: number }>(records: readonly T[], timeMs: number): number {
  if (records.length < 2 || timeMs <= records[0].tMs) return 0;
  const last = records.length - 1;
  if (timeMs >= records[last].tMs) return last;
  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (records[mid].tMs <= timeMs) lo = mid;
    else hi = mid;
  }
  return lo;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const wrapDeg = (value: number): number => {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
};
const lerpAngleDeg = (a: number, b: number, t: number): number => a + wrapDeg(b - a) * t;
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
};

function writeShot(out: CameraRailSample, shot: CameraShot): true {
  out.x = shot.pos[0]; out.y = shot.pos[1]; out.z = shot.pos[2];
  out.lookX = shot.lookAt[0]; out.lookY = shot.lookAt[1]; out.lookZ = shot.lookAt[2];
  out.fov = shot.fov; out.rollDeg = shot.rollDeg;
  out.shotId = shot.id;
  return true;
}

/**
 * Sample the camera rail into a caller-owned object. Smooth segments use a
 * Catmull-Rom spatial rail; linear/cut arrivals remain available for precise
 * blocking. Returns false when no shots exist.
 */
export function sampleCameraRail(
  shots: readonly CameraShot[],
  timeMs: number,
  out: CameraRailSample,
): boolean {
  if (!Array.isArray(shots) || !shots.length || !out) return false;
  const index = segmentIndex(shots, timeMs);
  if (index >= shots.length - 1 || timeMs <= shots[0].tMs) return writeShot(out, shots[index]);
  const a = shots[index];
  const b = shots[index + 1];
  if (b.transition === 'cut') return writeShot(out, a);
  const span = Math.max(1, b.tMs - a.tMs);
  const rawT = clamp((timeMs - a.tMs) / span, 0, 1);
  if (b.transition === 'linear') {
    out.x = lerp(a.pos[0], b.pos[0], rawT);
    out.y = lerp(a.pos[1], b.pos[1], rawT);
    out.z = lerp(a.pos[2], b.pos[2], rawT);
  } else {
    const p0 = shots[Math.max(0, index - 1)].pos;
    const p3 = shots[Math.min(shots.length - 1, index + 2)].pos;
    out.x = catmull(p0[0], a.pos[0], b.pos[0], p3[0], rawT);
    out.y = catmull(p0[1], a.pos[1], b.pos[1], p3[1], rawT);
    out.z = catmull(p0[2], a.pos[2], b.pos[2], p3[2], rawT);
  }
  const t = b.transition === 'smooth' ? smoothstep(rawT) : rawT;
  out.lookX = lerp(a.lookAt[0], b.lookAt[0], t);
  out.lookY = lerp(a.lookAt[1], b.lookAt[1], t);
  out.lookZ = lerp(a.lookAt[2], b.lookAt[2], t);
  out.fov = lerp(a.fov, b.fov, t);
  out.rollDeg = lerpAngleDeg(a.rollDeg, b.rollDeg, t);
  out.shotId = a.id;
  return true;
}

function writeActor(out: ActorTrackSample, key: ActorKey): true {
  out.x = key.pos[0]; out.z = key.pos[1];
  out.facingDeg = key.facingDeg;
  out.turretDeg = key.turretDeg;
  out.gunDeg = key.gunDeg;
  out.keyId = key.id;
  return true;
}

/** Sample one tank motion track into a caller-owned object. */
export function sampleActorTrack(
  keys: readonly ActorKey[],
  timeMs: number,
  out: ActorTrackSample,
): boolean {
  if (!Array.isArray(keys) || !keys.length || !out) return false;
  const index = segmentIndex(keys, timeMs);
  if (index >= keys.length - 1 || timeMs <= keys[0].tMs) return writeActor(out, keys[index]);
  const a = keys[index];
  const b = keys[index + 1];
  if (b.transition === 'cut') return writeActor(out, a);
  const span = Math.max(1, b.tMs - a.tMs);
  const rawT = clamp((timeMs - a.tMs) / span, 0, 1);
  const t = b.transition === 'smooth' ? smoothstep(rawT) : rawT;
  out.x = lerp(a.pos[0], b.pos[0], t);
  out.z = lerp(a.pos[1], b.pos[1], t);
  out.facingDeg = lerpAngleDeg(a.facingDeg, b.facingDeg, t);
  out.turretDeg = lerpAngleDeg(a.turretDeg, b.turretDeg, t);
  out.gunDeg = lerp(a.gunDeg, b.gunDeg, t);
  out.keyId = a.id;
  return true;
}
