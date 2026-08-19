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

const CAMERA_TRANSITIONS = new Set(['smooth', 'linear', 'cut']);
const ACTOR_TRANSITIONS = new Set(['smooth', 'linear', 'cut']);

const finite = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Number(value)
  : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

export function clampStudioDuration(value) {
  return Math.round(clamp(
    finite(value, STUDIO_DEFAULT_DURATION_MS),
    STUDIO_MIN_DURATION_MS,
    STUDIO_MAX_DURATION_MS,
  ));
}

export function clampStudioTime(value, durationMs = STUDIO_DEFAULT_DURATION_MS) {
  return Math.round(clamp(finite(value, 0), 0, clampStudioDuration(durationMs)));
}

function vec3(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [
    finite(value[0], fallback[0]),
    finite(value[1], fallback[1]),
    finite(value[2], fallback[2]),
  ];
}

function actorPos(value, fallback = [0, 0]) {
  if (!Array.isArray(value) || value.length < 2) return [...fallback];
  return value.length >= 3
    ? [finite(value[0], fallback[0]), finite(value[2], fallback[1])]
    : [finite(value[0], fallback[0]), finite(value[1], fallback[1])];
}

function stableId(value, prefix, index) {
  const id = String(value || '').trim();
  return id || `${prefix}-${index + 1}`;
}

function dedupeAtTime(records) {
  const byTime = new Map();
  for (const record of records) byTime.set(record.tMs, record);
  return [...byTime.values()].sort((a, b) => a.tMs - b.tMs);
}

function normalizeShot(raw, index, durationMs) {
  const transition = CAMERA_TRANSITIONS.has(raw?.transition)
    ? raw.transition
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

function normalizeActorKey(raw, index, durationMs) {
  const transition = ACTOR_TRANSITIONS.has(raw?.transition)
    ? raw.transition
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
export function normalizeStoryboard(input = {}) {
  const durationMs = clampStudioDuration(input.durationMs);
  const sourceShots = Array.isArray(input.shots) ? input.shots : [];
  const normalizedShots = [];
  const shotCount = Math.min(sourceShots.length, STUDIO_MAX_CAMERA_SHOTS);
  for (let index = 0; index < shotCount; index++) {
    normalizedShots.push(normalizeShot(sourceShots[index], index, durationMs));
  }
  const shots = dedupeAtTime(normalizedShots);

  const tracksByActor = new Map();
  for (const rawTrack of Array.isArray(input.actorTracks) ? input.actorTracks : []) {
    const actor = String(rawTrack?.actor ?? '').trim();
    if (!actor) continue;
    const prior = tracksByActor.get(actor) || [];
    const room = Math.max(0, STUDIO_MAX_ACTOR_KEYS - prior.length);
    const sourceKeys = Array.isArray(rawTrack.keys) ? rawTrack.keys : [];
    const keys = [];
    const keyCount = Math.min(sourceKeys.length, room);
    for (let index = 0; index < keyCount; index++) {
      keys.push(normalizeActorKey(sourceKeys[index], prior.length + index, durationMs));
    }
    tracksByActor.set(actor, prior.concat(keys));
  }
  const actorTracks = [];
  for (const [actor, keys] of tracksByActor) {
    const normalizedKeys = dedupeAtTime(keys);
    if (normalizedKeys.length) actorTracks.push({ actor, keys: normalizedKeys });
  }

  return { version: 1, durationMs, shots, actorTracks };
}

export function upsertCameraShot(storyboard, shot) {
  const board = normalizeStoryboard(storyboard);
  const id = String(shot?.id || '').trim();
  const index = id ? board.shots.findIndex((item) => item.id === id) : -1;
  if (index >= 0) board.shots[index] = { ...board.shots[index], ...shot, id };
  else board.shots.push(shot);
  return normalizeStoryboard(board);
}

export function removeCameraShot(storyboard, ref) {
  const board = normalizeStoryboard(storyboard);
  const id = String(ref || '');
  board.shots = board.shots.filter((shot) => shot.id !== id);
  return normalizeStoryboard(board);
}

export function upsertActorKey(storyboard, actorRef, key) {
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
  if (index >= 0) track.keys[index] = { ...track.keys[index], ...key, ...(id ? { id } : {}) };
  else track.keys.push(key);
  return normalizeStoryboard(board);
}

export function clearActorTrack(storyboard, actorRef) {
  const board = normalizeStoryboard(storyboard);
  const actor = String(actorRef ?? '').trim();
  board.actorTracks = board.actorTracks.filter((track) => track.actor !== actor);
  return normalizeStoryboard(board);
}

function segmentIndex(records, timeMs) {
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

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const wrapDeg = (value) => {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
};
const lerpAngleDeg = (a, b, t) => a + wrapDeg(b - a) * t;
const catmull = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
};

function writeShot(out, shot) {
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
export function sampleCameraRail(shots, timeMs, out) {
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

function writeActor(out, key) {
  out.x = key.pos[0]; out.z = key.pos[1];
  out.facingDeg = key.facingDeg;
  out.turretDeg = key.turretDeg;
  out.gunDeg = key.gunDeg;
  out.keyId = key.id;
  return true;
}

/** Sample one tank motion track into a caller-owned object. */
export function sampleActorTrack(keys, timeMs, out) {
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
