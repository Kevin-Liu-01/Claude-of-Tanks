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
const STUDIO_MAX_CAMERA_CUES = 48;
const STUDIO_MAX_ACTOR_KEYS = 64;

export type StudioTransition = 'smooth' | 'linear' | 'cut' | 'bezier' | 'drive';
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
  handleIn?: RuntimeValue;
  handleOut?: RuntimeValue;
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
  handleIn: StudioVec3 | null;
  handleOut: StudioVec3 | null;
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
  cameraCues?: readonly CameraCueInput[] | RuntimeValue;
  actorTracks?: readonly ActorTrackInput[] | RuntimeValue;
}

export interface Storyboard {
  version: 2;
  durationMs: number;
  shots: CameraShot[];
  cameraCues: CameraCue[];
  actorTracks: ActorTrack[];
}

export interface CameraCueInput {
  id?: RuntimeValue;
  label?: RuntimeValue;
  tMs?: RuntimeValue;
  durationMs?: RuntimeValue;
  amplitudeM?: RuntimeValue;
  rollDeg?: RuntimeValue;
  fovKickDeg?: RuntimeValue;
  frequencyHz?: RuntimeValue;
  seed?: RuntimeValue;
}

export interface CameraCue {
  id: string;
  label: string;
  tMs: number;
  durationMs: number;
  amplitudeM: number;
  rollDeg: number;
  fovKickDeg: number;
  frequencyHz: number;
  seed: number;
}

export interface CameraCueSample {
  rightM: number;
  upM: number;
  forwardM: number;
  rollDeg: number;
  fovKickDeg: number;
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

const CAMERA_TRANSITIONS = new Set<StudioTransition>(['bezier', 'smooth', 'linear', 'cut']);
const ACTOR_TRANSITIONS = new Set<StudioTransition>(['drive', 'smooth', 'linear', 'cut']);

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

function optionalVec3(value: RuntimeValue): StudioVec3 | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  return [finite(value[0]), finite(value[1]), finite(value[2])];
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
    handleIn: optionalVec3(raw?.handleIn),
    handleOut: optionalVec3(raw?.handleOut),
    transition,
  };
}

function normalizeCameraCue(raw: CameraCueInput | undefined, index: number, durationMs: number): CameraCue {
  return {
    id: stableId(raw?.id, 'camera-cue', index),
    label: String(raw?.label || `Camera cue ${index + 1}`).trim().slice(0, 48) || `Camera cue ${index + 1}`,
    tMs: clampStudioTime(raw?.tMs, durationMs),
    durationMs: Math.round(clamp(finite(raw?.durationMs, 650), 60, 3000)),
    amplitudeM: clamp(finite(raw?.amplitudeM, 0.2), 0, 2),
    rollDeg: clamp(finite(raw?.rollDeg, 2), 0, 12),
    fovKickDeg: clamp(finite(raw?.fovKickDeg, 2), -15, 15),
    frequencyHz: clamp(finite(raw?.frequencyHz, 12), 1, 30),
    seed: Math.round(clamp(finite(raw?.seed, index + 1), -1_000_000, 1_000_000)),
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

  const sourceCues = Array.isArray(input.cameraCues) ? input.cameraCues : [];
  const cameraCues: CameraCue[] = [];
  for (let index = 0; index < Math.min(sourceCues.length, STUDIO_MAX_CAMERA_CUES); index++) {
    cameraCues.push(normalizeCameraCue(sourceCues[index], index, durationMs));
  }
  cameraCues.sort((a, b) => a.tMs - b.tMs);

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

  return { version: 2, durationMs, shots, cameraCues, actorTracks };
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

const bezier = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const mt = 1 - t;
  return p0 * mt * mt * mt + 3 * p1 * mt * mt * t + 3 * p2 * mt * t * t + p3 * t * t * t;
};

function writeShot(out: CameraRailSample, shot: CameraShot): true {
  out.x = shot.pos[0]; out.y = shot.pos[1]; out.z = shot.pos[2];
  out.lookX = shot.lookAt[0]; out.lookY = shot.lookAt[1]; out.lookZ = shot.lookAt[2];
  out.fov = shot.fov; out.rollDeg = shot.rollDeg;
  out.shotId = shot.id;
  return true;
}

/**
 * Sample the camera rail into a caller-owned object. Bezier uses the prior
 * outgoing and destination incoming handles, or a straight cubic when absent.
 * Smooth retains Catmull-Rom; linear/cut retain their original behavior.
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
  } else if (b.transition === 'bezier') {
    out.x = bezier(a.pos[0], a.handleOut?.[0] ?? lerp(a.pos[0], b.pos[0], 1 / 3),
      b.handleIn?.[0] ?? lerp(a.pos[0], b.pos[0], 2 / 3), b.pos[0], rawT);
    out.y = bezier(a.pos[1], a.handleOut?.[1] ?? lerp(a.pos[1], b.pos[1], 1 / 3),
      b.handleIn?.[1] ?? lerp(a.pos[1], b.pos[1], 2 / 3), b.pos[1], rawT);
    out.z = bezier(a.pos[2], a.handleOut?.[2] ?? lerp(a.pos[2], b.pos[2], 1 / 3),
      b.handleIn?.[2] ?? lerp(a.pos[2], b.pos[2], 2 / 3), b.pos[2], rawT);
  } else {
    const p0 = shots[Math.max(0, index - 1)].pos;
    const p3 = shots[Math.min(shots.length - 1, index + 2)].pos;
    out.x = catmull(p0[0], a.pos[0], b.pos[0], p3[0], rawT);
    out.y = catmull(p0[1], a.pos[1], b.pos[1], p3[1], rawT);
    out.z = catmull(p0[2], a.pos[2], b.pos[2], p3[2], rawT);
  }
  const t = b.transition === 'smooth' || b.transition === 'bezier' ? smoothstep(rawT) : rawT;
  out.lookX = lerp(a.lookAt[0], b.lookAt[0], t);
  out.lookY = lerp(a.lookAt[1], b.lookAt[1], t);
  out.lookZ = lerp(a.lookAt[2], b.lookAt[2], t);
  out.fov = lerp(a.fov, b.fov, t);
  out.rollDeg = lerpAngleDeg(a.rollDeg, b.rollDeg, t);
  out.shotId = a.id;
  return true;
}

/** Deterministic local-axis camera impulses; sampling allocates no frame objects. */
export function sampleCameraCues(cues: readonly CameraCue[], timeMs: number, out: CameraCueSample): boolean {
  out.rightM = 0; out.upM = 0; out.forwardM = 0; out.rollDeg = 0; out.fovKickDeg = 0;
  let active = false;
  for (const cue of cues) {
    const elapsedMs = timeMs - cue.tMs;
    if (elapsedMs < 0) break;
    if (elapsedMs > cue.durationMs) continue;
    active = true;
    const progress = elapsedMs / cue.durationMs;
    const envelope = (1 - progress) * (1 - progress);
    const angle = cue.seed * 0.754877666 + elapsedMs * cue.frequencyHz * Math.PI * 0.002;
    const amplitude = cue.amplitudeM * envelope;
    out.rightM += amplitude * (Math.sin(angle) * 0.72 + Math.sin(angle * 2.13 + 0.8) * 0.28);
    out.upM += amplitude * (Math.cos(angle * 1.17 + 0.35) * 0.58 + Math.sin(angle * 2.71) * 0.24);
    out.forwardM += amplitude * Math.sin(angle * 0.63 + 1.9) * 0.22;
    out.rollDeg += cue.rollDeg * envelope * Math.sin(angle * 0.83 + 0.45);
    out.fovKickDeg += cue.fovKickDeg * envelope;
  }
  return active;
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
  if (b.transition === 'drive') {
    const chordM = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]);
    const t = rawT * rawT * rawT * (rawT * (rawT * 6 - 15) + 10);
    if (chordM > 1e-6) {
      const tangentM = chordM * 0.75;
      const m0x = Math.sin(a.facingDeg * Math.PI / 180) * tangentM;
      const m0z = Math.cos(a.facingDeg * Math.PI / 180) * tangentM;
      const m1x = Math.sin(b.facingDeg * Math.PI / 180) * tangentM;
      const m1z = Math.cos(b.facingDeg * Math.PI / 180) * tangentM;
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.x = h00 * a.pos[0] + h10 * m0x + h01 * b.pos[0] + h11 * m1x;
      out.z = h00 * a.pos[1] + h10 * m0z + h01 * b.pos[1] + h11 * m1z;
      const dh00 = 6 * t2 - 6 * t, dh10 = 3 * t2 - 4 * t + 1, dh11 = 3 * t2 - 2 * t;
      const tangentX = dh00 * a.pos[0] + dh10 * m0x - dh00 * b.pos[0] + dh11 * m1x;
      const tangentZ = dh00 * a.pos[1] + dh10 * m0z - dh00 * b.pos[1] + dh11 * m1z;
      out.facingDeg = Math.atan2(tangentX, tangentZ) * 180 / Math.PI;
      const worldTurret = lerpAngleDeg(a.facingDeg + a.turretDeg, b.facingDeg + b.turretDeg, t);
      out.turretDeg = wrapDeg(worldTurret - out.facingDeg);
      out.gunDeg = lerp(a.gunDeg, b.gunDeg, t); out.keyId = a.id;
      return true;
    }
  }
  const t = b.transition === 'smooth' || b.transition === 'drive' ? smoothstep(rawT) : rawT;
  out.x = lerp(a.pos[0], b.pos[0], t);
  out.z = lerp(a.pos[1], b.pos[1], t);
  out.facingDeg = lerpAngleDeg(a.facingDeg, b.facingDeg, t);
  out.turretDeg = lerpAngleDeg(a.turretDeg, b.turretDeg, t);
  out.gunDeg = lerp(a.gunDeg, b.gunDeg, t);
  out.keyId = a.id;
  return true;
}
