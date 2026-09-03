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
export const STUDIO_DEFAULT_DURATION_MS = 12000;
export const STUDIO_MAX_CAMERA_SHOTS = 32;
export const STUDIO_MAX_CAMERA_CUES = 48;
export const STUDIO_MAX_ACTOR_KEYS = 64;

const CAMERA_TRANSITIONS = new Set(['bezier', 'smooth', 'linear', 'cut']);
const ACTOR_TRANSITIONS = new Set(['drive', 'smooth', 'linear', 'cut']);

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

function optionalVec3(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  return [finite(value[0]), finite(value[1]), finite(value[2])];
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
    handleIn: optionalVec3(raw?.handleIn),
    handleOut: optionalVec3(raw?.handleOut),
    transition,
  };
}

function normalizeCameraCue(raw, index, durationMs) {
  return {
    id: stableId(raw?.id, 'camera-cue', index),
    label: String(raw?.label || `Camera cue ${index + 1}`).trim().slice(0, 48)
      || `Camera cue ${index + 1}`,
    tMs: clampStudioTime(raw?.tMs, durationMs),
    durationMs: Math.round(clamp(finite(raw?.durationMs, 650), 60, 3000)),
    amplitudeM: clamp(finite(raw?.amplitudeM, 0.2), 0, 2),
    rollDeg: clamp(finite(raw?.rollDeg, 2), 0, 12),
    fovKickDeg: clamp(finite(raw?.fovKickDeg, 2), -15, 15),
    frequencyHz: clamp(finite(raw?.frequencyHz, 12), 1, 30),
    seed: Math.round(clamp(finite(raw?.seed, index + 1), -1_000_000, 1_000_000)),
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

  const sourceCues = Array.isArray(input.cameraCues) ? input.cameraCues : [];
  const cameraCues = [];
  const cueCount = Math.min(sourceCues.length, STUDIO_MAX_CAMERA_CUES);
  for (let index = 0; index < cueCount; index++) {
    cameraCues.push(normalizeCameraCue(sourceCues[index], index, durationMs));
  }
  cameraCues.sort((a, b) => a.tMs - b.tMs);

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

  return { version: 2, durationMs, shots, cameraCues, actorTracks };
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
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const catmull = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
};
const bezier = (p0, p1, p2, p3, t) => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return p0 * mt2 * mt + 3 * p1 * mt2 * t + 3 * p2 * mt * t2 + p3 * t2 * t;
};

function writeShot(out, shot) {
  out.x = shot.pos[0]; out.y = shot.pos[1]; out.z = shot.pos[2];
  out.lookX = shot.lookAt[0]; out.lookY = shot.lookAt[1]; out.lookZ = shot.lookAt[2];
  out.fov = shot.fov; out.rollDeg = shot.rollDeg;
  out.shotId = shot.id;
  return true;
}

/**
 * Sample the camera rail into a caller-owned object. Bezier arrivals use the
 * outgoing handle on the prior shot and incoming handle on the destination;
 * omitted handles make a straight cubic. Smooth segments retain the original
 * Catmull-Rom rail. Linear/cut remain available for precise blocking.
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
  } else if (b.transition === 'bezier') {
    const outHandle = a.handleOut;
    const inHandle = b.handleIn;
    const c1x = outHandle ? outHandle[0] : lerp(a.pos[0], b.pos[0], 1 / 3);
    const c1y = outHandle ? outHandle[1] : lerp(a.pos[1], b.pos[1], 1 / 3);
    const c1z = outHandle ? outHandle[2] : lerp(a.pos[2], b.pos[2], 1 / 3);
    const c2x = inHandle ? inHandle[0] : lerp(a.pos[0], b.pos[0], 2 / 3);
    const c2y = inHandle ? inHandle[1] : lerp(a.pos[1], b.pos[1], 2 / 3);
    const c2z = inHandle ? inHandle[2] : lerp(a.pos[2], b.pos[2], 2 / 3);
    out.x = bezier(a.pos[0], c1x, c2x, b.pos[0], rawT);
    out.y = bezier(a.pos[1], c1y, c2y, b.pos[1], rawT);
    out.z = bezier(a.pos[2], c1z, c2z, b.pos[2], rawT);
  } else {
    const p0 = shots[Math.max(0, index - 1)].pos;
    const p3 = shots[Math.min(shots.length - 1, index + 2)].pos;
    out.x = catmull(p0[0], a.pos[0], b.pos[0], p3[0], rawT);
    out.y = catmull(p0[1], a.pos[1], b.pos[1], p3[1], rawT);
    out.z = catmull(p0[2], a.pos[2], b.pos[2], p3[2], rawT);
  }
  const t = b.transition === 'smooth' || b.transition === 'bezier'
    ? smoothstep(rawT)
    : rawT;
  out.lookX = lerp(a.lookAt[0], b.lookAt[0], t);
  out.lookY = lerp(a.lookAt[1], b.lookAt[1], t);
  out.lookZ = lerp(a.lookAt[2], b.lookAt[2], t);
  out.fov = lerp(a.fov, b.fov, t);
  out.rollDeg = lerpAngleDeg(a.rollDeg, b.rollDeg, t);
  out.shotId = a.id;
  return true;
}

/**
 * Sample deterministic presentation-only camera impulses into caller-owned
 * local-axis offsets. Cues begin with an impact punch and decay quadratically;
 * their seeded harmonics avoid frame-to-frame randomness and allocations.
 */
export function sampleCameraCues(cues, timeMs, out) {
  if (!out) return false;
  out.rightM = 0;
  out.upM = 0;
  out.forwardM = 0;
  out.rollDeg = 0;
  out.fovKickDeg = 0;
  if (!Array.isArray(cues) || !cues.length) return false;
  let active = false;
  for (let index = 0; index < cues.length; index++) {
    const cue = cues[index];
    const elapsedMs = timeMs - cue.tMs;
    if (elapsedMs < 0) break;
    if (elapsedMs > cue.durationMs) continue;
    active = true;
    const progress = elapsedMs / cue.durationMs;
    const envelope = (1 - progress) * (1 - progress);
    const phase = cue.seed * 0.754877666;
    const angle = phase + elapsedMs * cue.frequencyHz * Math.PI * 0.002;
    const amplitude = cue.amplitudeM * envelope;
    out.rightM += amplitude * (Math.sin(angle) * 0.72 + Math.sin(angle * 2.13 + 0.8) * 0.28);
    out.upM += amplitude * (Math.cos(angle * 1.17 + 0.35) * 0.58
      + Math.sin(angle * 2.71) * 0.24);
    out.forwardM += amplitude * Math.sin(angle * 0.63 + 1.9) * 0.22;
    out.rollDeg += cue.rollDeg * envelope * Math.sin(angle * 0.83 + 0.45);
    out.fovKickDeg += cue.fovKickDeg * envelope;
  }
  return active;
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
  if (b.transition === 'drive') {
    const chordX = b.pos[0] - a.pos[0];
    const chordZ = b.pos[1] - a.pos[1];
    const chordM = Math.hypot(chordX, chordZ);
    const t = smootherstep(rawT);
    if (chordM > 1e-6) {
      const tangentM = chordM * 0.75;
      const aFacing = a.facingDeg * Math.PI / 180;
      const bFacing = b.facingDeg * Math.PI / 180;
      const m0x = Math.sin(aFacing) * tangentM;
      const m0z = Math.cos(aFacing) * tangentM;
      const m1x = Math.sin(bFacing) * tangentM;
      const m1z = Math.cos(bFacing) * tangentM;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.x = h00 * a.pos[0] + h10 * m0x + h01 * b.pos[0] + h11 * m1x;
      out.z = h00 * a.pos[1] + h10 * m0z + h01 * b.pos[1] + h11 * m1z;
      const dh00 = 6 * t2 - 6 * t;
      const dh10 = 3 * t2 - 4 * t + 1;
      const dh01 = -dh00;
      const dh11 = 3 * t2 - 2 * t;
      const tangentX = dh00 * a.pos[0] + dh10 * m0x + dh01 * b.pos[0] + dh11 * m1x;
      const tangentZ = dh00 * a.pos[1] + dh10 * m0z + dh01 * b.pos[1] + dh11 * m1z;
      out.facingDeg = Math.atan2(tangentX, tangentZ) * 180 / Math.PI;
      const worldTurretA = a.facingDeg + a.turretDeg;
      const worldTurretB = b.facingDeg + b.turretDeg;
      const worldTurret = lerpAngleDeg(worldTurretA, worldTurretB, t);
      out.turretDeg = wrapDeg(worldTurret - out.facingDeg);
      out.gunDeg = lerp(a.gunDeg, b.gunDeg, t);
      out.keyId = a.id;
      return true;
    }
  }
  const t = b.transition === 'smooth' || b.transition === 'drive'
    ? smoothstep(rawT)
    : rawT;
  out.x = lerp(a.pos[0], b.pos[0], t);
  out.z = lerp(a.pos[1], b.pos[1], t);
  out.facingDeg = lerpAngleDeg(a.facingDeg, b.facingDeg, t);
  out.turretDeg = lerpAngleDeg(a.turretDeg, b.turretDeg, t);
  out.gunDeg = lerp(a.gunDeg, b.gunDeg, t);
  out.keyId = a.id;
  return true;
}
