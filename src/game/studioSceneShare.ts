/**
 * Shared scene links (owner 2026-10-17, "copy scene link"): the Studio's scene JSON travels inside the link itself, as
 * `/studio#scene=1.z.<base64url>`, so a scene is shared by pasting one URL and no server ever stores or sees it.
 *
 *   - The scene rides in the URL FRAGMENT, never the query string: browsers send neither the fragment to a server nor in
 *     a Referer header, so the scene never reaches a request log, a CDN, the telemetry beacons or analytics.
 *   - `1` is the link format (SCENE_LINK_FORMAT); the scene inside keeps its own `tankIdSchema` stamp, so a renamed tank
 *     still resolves (tankIdAliases.ts). A link from a newer format is refused with its own message, never guessed at.
 *   - `z` is deflate-raw (CompressionStream) and `j` the plain JSON bytes (a browser without CompressionStream writes it).
 *   - Hard caps, checked before any work: SCENE_LINK_MAX_CHARS of encoded scene, SCENE_LINK_MAX_JSON_BYTES of inflated
 *     JSON (the inflate stops at the cap, so a decompression bomb costs one chunk), and per-list counts below.
 *   - Strict schema on decode AND encode (sanitizeSharedScene): only the fields load() reads are copied, into fresh
 *     objects built key by key (a `__proto__`, `constructor` or `prototype` key is never assigned, so nothing reaches a
 *     prototype); unknown fields are dropped; a known field of the wrong type or an unknown enum value refuses the link;
 *     numbers are clamped into their ranges and rounded (1 mm, 0.001 degree); strings are short tokens or short text
 *     without markup, control or bidi-override characters. Every id is allow-listed against this build's own tables:
 *     the map (mapIds.ts), each vehicle (the registered fleet, after the scene's tankIdSchema renames), each camo
 *     (camoPolicy.ts), each effect type and every word an effect handler branches on (impact kind, shell type, size,
 *     cause, munition, flare colour, structure stage). Effect parameters are the closed set the handlers read
 *     (SCENE_EFFECT_PARAMS), each typed and bounded so no link can ask for a million puffs or a kilometre-wide blast.
 *     The pure normalizers load() runs (storyboard, film, picture, light, fx) canonicalize their blocks, so what decodes
 *     is exactly what load() accepts.
 *   - decodeSceneLink never throws: every failure is `{ ok: false, reason, detail }` for the Studio's message.
 *
 * The older path link (`/studio?scene=/media/….scene.json`, studioSceneLink.ts) opens a scene file on this site; this
 * module carries the scene itself. Node-runnable: no DOM, WebGL or Studio runtime (studioSceneShare.selftest.mjs).
 */
import { normalizeFilm, FILM_FILTERS, FILM_SPEED_EASES, FILM_MAX_SPEED_KEYS } from './studioFilmPlan.ts';
import { normalizeStudioFx, studioFxState, STUDIO_FLARE_COLORS, STUDIO_FX_PARAMS, STUDIO_FX_QUALITIES } from './studioFxSettings.ts';
import { normalizeStudioLight, STUDIO_TIMES } from './studioLight.ts';
import { NEUTRAL_PICTURE, pictureStateJson, resolvePicture } from './studioPicture.ts';
import { normalizeStoryboard, STUDIO_FILM_MAX_DURATION_MS } from './studioTimeline.ts';
import { MUNITION_PROFILES } from '../sim/destructionEvents.ts';
import { isMapId } from '../world/maps/mapIds.ts';
// The one ordered fleet registration (spec data only): the vehicle allow-list is the whole registered fleet on every
// path, Node receipts included, whichever module loaded this first.
import '../vehicles/fleetRegistration.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { TANK_IDS } from '../vehicles/tankIdAliases.ts';
import { isBuiltInCamoId } from '../vehicles/camoPolicy.ts';

/** The link format this build writes and the newest it opens. */
export const SCENE_LINK_FORMAT = 1;
/** The fragment parameter: `#scene=<value>`. */
const SCENE_LINK_KEY = 'scene';
/** Most characters of encoded scene a link may carry (every site take fits; the largest is ~14 K). */
export const SCENE_LINK_MAX_CHARS = 16_384;
/** Most bytes of scene JSON a link may inflate to (4x the largest site take's canonical JSON). */
export const SCENE_LINK_MAX_JSON_BYTES = 262_144;

/** Per-list caps: the Studio's own limits (studioTimeline.ts, studio.ts MAX_STUDIO_EFFECTS) or well above any take. */
export const SCENE_LINK_LIMITS = Object.freeze({
  actors: 32,
  effects: 256,
  shots: 32,
  cameraCues: 48,
  actorTracks: 32,
  actorKeys: 64,
  filmSpeedKeys: FILM_MAX_SPEED_KEYS,
});

/** Actor damage states (scene JSON `state`; studio.ts ACTOR_STATES, kept equal by the receipt). */
export const SCENE_ACTOR_STATES = Object.freeze([
  'intact', 'engine-smoking', 'burning', 'wrecked', 'wrecked-burnt', 'turret-popped',
] as const);

/** Effect types the Studio fires (studio.ts effectHandlers, kept equal by the receipt). */
export const SCENE_EFFECT_TYPES = Object.freeze([
  'fire', 'muzzle_flash', 'tracer', 'impact', 'sparks', 'explosion', 'structure', 'tank_kill', 'dust', 'engine_smoke',
  'burning', 'detrack', 'firing_moment', 'explosion_moment', 'mg_burst', 'barrage', 'armor_scar', 'exhaust',
  'smoke_screen', 'flare', 'embers', 'debris', 'shockwave', 'fire_field', 'strike', 'ram',
] as const);

const PRODUCTION_FORMATS = Object.freeze(['landscape', 'portrait', 'square'] as const);
const CAMERA_MODES = Object.freeze(['fly', 'orbit'] as const);
const SHOT_TRANSITIONS = Object.freeze(['bezier', 'spline', 'smooth', 'linear', 'cut'] as const);
const KEY_TRANSITIONS = Object.freeze(['drive', 'smooth', 'linear', 'cut'] as const);
/** Impact kinds the battle FX bus draws (fx/effects.ts 'shell:hit'; docs/STUDIO.md `impact`). */
export const SCENE_IMPACT_KINDS = Object.freeze([
  'pen', 'nonpen', 'ricochet', 'he_pen', 'he_splash', 'era', 'spaced_absorb', 'structure', 'terrain',
] as const);
/** Projectile and tracer types (fx/effects.ts TracerType, kept equal by the receipt). */
export const SCENE_SHELL_TYPES = Object.freeze(['DRONE', 'ATGM', 'AP', 'APCR', 'HEAT', 'HE', 'HESH', 'APFSDS'] as const);
/** `explosion` and `barrage` sizes, and the destruction causes the handlers branch on. */
const SCENE_BLAST_SIZES = Object.freeze(['small', 'medium', 'large', 'huge', 'mixed'] as const);
const SCENE_BLAST_CAUSES = Object.freeze(['ammorack', 'shot', 'fire', 'blast', 'kinetic', 'ram'] as const);
/** Actor camo values beside the built-in patterns (studio.ts: 'inherit' keeps the spec's own; materials.ts: 'urban'). */
const EXTRA_CAMO_IDS = Object.freeze(['inherit', 'urban']);

type SceneLinkFailure = 'too-large' | 'encoding' | 'version' | 'unsupported' | 'schema';
type SharedScene = Record<string, unknown>;
export type SceneLinkDecoded =
  | { readonly ok: true; readonly scene: SharedScene; readonly jsonBytes: number }
  | { readonly ok: false; readonly reason: SceneLinkFailure; readonly detail: string; readonly chars?: number };
export type SceneLinkEncoded =
  | { readonly ok: true; readonly value: string; readonly chars: number; readonly jsonBytes: number }
  | { readonly ok: false; readonly reason: 'too-large' | 'schema'; readonly chars: number; readonly detail: string };
type SceneSanitized =
  | { readonly ok: true; readonly scene: SharedScene }
  | { readonly ok: false; readonly detail: string };

// --- strict schema --------------------------------------------------------------------------------------------------

/** World coordinates (m): every map lies inside ±2 km (the largest tracked take reaches 451 m), so tracks, effects and
 * the crush planner stay on the map. */
const WORLD_M = 2_500;
const HEIGHT_M = 2_000;
const ANGLE_DEG = 10_000;
const INT32 = 2_147_483_647;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,47}$/;
const LOWER_TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/**
 * Never in a shared string: markup, control and line/paragraph separator characters, bidi overrides and isolates, the
 * invisible marks (Arabic letter mark, zero-width space/joiners, LRM/RLM, word joiner and invisible operators, BOM),
 * a lone surrogate and a run of three or more combining marks (text-only spoofing aids).
 */
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f<>&"`\\\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]|\p{Cs}|\p{M}{3,}/u;

class SceneSchemaError extends Error {}

function refuse(path: string, what: string): never {
  throw new SceneSchemaError(`${path}: ${what}`);
}

type Raw = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Raw {
  if (!isRecord(value)) refuse(path, 'must be an object');
  return value;
}

/** An own field only: an inherited `constructor` or `toString` never reads as scene data. */
function own(source: Raw, key: string): unknown {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale + 0;
}

function num(value: unknown, path: string, lo: number, hi: number, digits = 3): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) refuse(path, 'must be a finite number');
  return round(Math.min(hi, Math.max(lo, value)), digits);
}

function int(value: unknown, path: string, lo: number, hi: number): number {
  return Math.round(num(value, path, lo, hi, 0));
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') refuse(path, 'must be true or false');
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) refuse(path, 'is not a known value');
  return value as T;
}

function token(value: unknown, path: string, pattern: RegExp = TOKEN): string {
  if (typeof value !== 'string' || !pattern.test(value)) refuse(path, 'must be a short identifier');
  return value;
}

/** Short display text (a shot label, an actor's name): no markup, control or bidi characters. */
export function safeSceneText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength && !UNSAFE_TEXT.test(value);
}

function text(value: unknown, path: string, maxLength: number): string {
  if (!safeSceneText(value, maxLength)) refuse(path, `must be plain text of at most ${maxLength} characters`);
  return value;
}

function vec(value: unknown, path: string, lengths: readonly number[], bounds: readonly number[]): number[] {
  if (!Array.isArray(value) || !lengths.includes(value.length)) refuse(path, `must be ${lengths.join(' or ')} numbers`);
  return value.map((entry: unknown, index: number) => {
    const bound = bounds[Math.min(index, bounds.length - 1)];
    return num(entry, `${path}[${index}]`, -bound, bound);
  });
}

/** [x, z] or [x, y, z] ground positions; y has the height bound. */
const groundPos = (value: unknown, path: string): number[] => (
  Array.isArray(value) && value.length === 3
    ? vec(value, path, [3], [WORLD_M, HEIGHT_M, WORLD_M])
    : vec(value, path, [2], [WORLD_M])
);
const point3 = (value: unknown, path: string): number[] => vec(value, path, [3], [WORLD_M, HEIGHT_M, WORLD_M]);

function list<T>(value: unknown, path: string, max: number, item: (entry: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) refuse(path, 'must be a list');
  if (value.length > max) refuse(path, `has more than ${max} entries`);
  return value.map((entry: unknown, index: number) => item(entry, `${path}[${index}]`));
}

/** Copy the listed fields that are present, each through its validator, into a fresh object. */
function fields(source: Raw, path: string, spec: Readonly<Record<string, (value: unknown, path: string) => unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(spec)) {
    const value = own(source, key);
    if (value === undefined) continue;
    out[key] = spec[key](value, `${path}.${key}`);
  }
  return out;
}

const nullable = <T>(validate: (value: unknown, path: string) => T) => (value: unknown, path: string): T | null => (
  value === null ? null : validate(value, path)
);
/** An actor reference: a name or uid, or a list index. */
const actorRef = (value: unknown, path: string): string | number => (
  typeof value === 'number' ? int(value, path, 0, SCENE_LINK_LIMITS.actors - 1) : text(value, path, 48)
);
const ageS = nullable((value, path) => num(value, path, 0, 3600));

/**
 * A vehicle id as the scene spells it, accepted only when it names a vehicle of this build's fleet once the scene's
 * own tankIdSchema renames are applied (load() applies them again: sceneInCurrentTankIds). The spelling is kept, so a
 * scene round-trips byte for byte.
 */
function tankId(value: unknown, path: string, schema: number): string {
  const id = token(value, path, LOWER_TOKEN);
  const current = TANK_IDS.resolve(id, schema);
  if (typeof current !== 'string' || !Object.hasOwn(TANK_SPECS, current)) refuse(path, 'is not a vehicle of this build');
  return id;
}

/** An actor camo: a built-in pattern (camoPolicy.ts) or the Studio's own 'inherit' and 'urban'. */
function camoId(value: unknown, path: string): string {
  const id = token(value, path, LOWER_TOKEN);
  if (!isBuiltInCamoId(id) && !EXTRA_CAMO_IDS.includes(id)) refuse(path, 'is not a camo of this build');
  return id;
}

const actorFields = (schema: number) => Object.freeze({
  id: (value: unknown, path: string) => tankId(value, path, schema),
  specId: (value: unknown, path: string) => tankId(value, path, schema),
  name: nullable((value, path) => text(value, path, 48)),
  pos: groundPos,
  facingDeg: (value: unknown, path: string) => num(value, path, -ANGLE_DEG, ANGLE_DEG),
  turretDeg: (value: unknown, path: string) => num(value, path, -ANGLE_DEG, ANGLE_DEG),
  gunDeg: (value: unknown, path: string) => num(value, path, -90, 90),
  camo: nullable(camoId),
  camoSeed: (value: unknown, path: string) => int(value, path, -INT32, INT32),
  state: (value: unknown, path: string) => oneOf(value, path, SCENE_ACTOR_STATES),
  authoredState: (value: unknown, path: string) => oneOf(value, path, SCENE_ACTOR_STATES),
  stateAgeS: ageS,
  authoredStateAgeS: ageS,
  recoilAgeS: ageS,
  authoredRecoilAgeS: ageS,
  suspensionAimDeg: nullable((value, path) => num(value, path, -45, 45)),
  smoking: bool,
  burning: bool,
  authoredSmoking: bool,
  authoredBurning: bool,
});

function actor(value: unknown, path: string, schema: number): Record<string, unknown> {
  return fields(record(value, path), path, actorFields(schema));
}

type ParamRule =
  | { readonly kind: 'number'; readonly lo: number; readonly hi: number; readonly digits: number }
  | { readonly kind: 'flag' }
  | { readonly kind: 'word'; readonly allowed: readonly string[] }
  | { readonly kind: 'point'; readonly bound: number }
  | { readonly kind: 'shell' };

const pNum = (lo: number, hi: number, digits = 3): ParamRule => ({ kind: 'number', lo, hi, digits });
const P_FLAG: ParamRule = { kind: 'flag' };
const pWord = (allowed: readonly string[]): ParamRule => ({ kind: 'word', allowed });
const pPoint = (bound: number): ParamRule => ({ kind: 'point', bound });

/**
 * Every effect parameter a Studio handler reads (docs/STUDIO.md "Effect types"; the receipt keeps this table equal to
 * the `params.<key>` reads in studio.ts). A link carries only these, each typed and bounded: counts, sizes, charges and
 * ranges are capped where a hostile value would stall the page (a dust burst of a million puffs, a 1 km blast), and the
 * cinematic types' numbers are clamped further into STUDIO_FX_PARAMS, the ranges their handlers clamp to. Other keys
 * are dropped like any unknown field.
 */
export const SCENE_EFFECT_PARAMS: Readonly<Record<string, ParamRule>> = Object.freeze({
  ageS: pNum(0, 3600),
  burnS: pNum(0, 120),
  caliberMm: pNum(0, 400),
  cause: pWord(SCENE_BLAST_CAUSES),
  chargeKg: pNum(0, 1000),
  color: pWord(Object.keys(STUDIO_FLARE_COLORS)),
  count: pNum(0, 80, 0),
  density: pNum(0, 2),
  dirDeg: pNum(-ANGLE_DEG, ANGLE_DEG),
  driftMps: pNum(0, 10),
  durationS: pNum(0, 120),
  fallMps: pNum(0, 10),
  from: pPoint(WORLD_M),
  gapM: pNum(0, 200),
  heightM: pNum(0, 500),
  hitH: pNum(0, 100),
  hot: pNum(0, 1),
  intensity: pNum(0, 4),
  isPlayer: P_FLAG,
  kind: pWord(SCENE_IMPACT_KINDS),
  launch: P_FLAG,
  massTons: pNum(0, 500),
  munition: pWord(Object.keys(MUNITION_PROFILES)),
  normal: pPoint(1),
  off: P_FLAG,
  offset: pPoint(50),
  pitchDeg: pNum(-90, 90),
  pop: P_FLAG,
  quality: pWord(STUDIO_FX_QUALITIES),
  radiusM: pNum(0, 100),
  rangeM: pNum(0, WORLD_M),
  rate: pNum(0, 200),
  reachM: pNum(0, 50),
  recoil: P_FLAG,
  rise: pNum(0, 10),
  scale: pNum(0, 4),
  seedDeg: pNum(-ANGLE_DEG, ANGLE_DEG),
  settled: P_FLAG,
  shell: { kind: 'shell' },
  shellType: pWord(SCENE_SHELL_TYPES),
  side: pWord(['L', 'R', 'l', 'r']),
  size: pWord(SCENE_BLAST_SIZES),
  slot: pNum(0, 15, 0),
  smoke: P_FLAG,
  sooty: P_FLAG,
  speedMps: pNum(0, 3000),
  spreadDeg: pNum(0, 90),
  stage: pWord(['damaged', 'breached', 'collapsed']),
  strength: pNum(0, 4),
  to: pPoint(WORLD_M),
  tracer: P_FLAG,
  wall: P_FLAG,
});

/** A strike's round (studio.ts fireStrike): its name, class and bounded ballistics. */
const SHELL_FIELDS = Object.freeze({
  name: (value: unknown, path: string) => text(value, path, 48),
  type: (value: unknown, path: string) => oneOf(value, path, SCENE_SHELL_TYPES),
  caliberMm: (value: unknown, path: string) => num(value, path, 0, 400),
  velocityMps: (value: unknown, path: string) => num(value, path, 0, 3000),
  blastRadiusM: (value: unknown, path: string) => num(value, path, 0, 100),
  pen100Mm: (value: unknown, path: string) => num(value, path, 0, 3000),
});

function paramValue(rule: ParamRule, value: unknown, path: string, key: string, type: string): unknown {
  switch (rule.kind) {
    case 'number': {
      // a cinematic type's own range (the handler clamps to it) narrows the shared bound
      const def = Object.hasOwn(STUDIO_FX_PARAMS, type) ? STUDIO_FX_PARAMS[type].find((entry) => entry.key === key) : undefined;
      return num(value, path, Math.max(rule.lo, def?.min ?? rule.lo), Math.min(rule.hi, def?.max ?? rule.hi), rule.digits);
    }
    case 'flag': return bool(value, path);
    case 'word': return oneOf(value, path, rule.allowed);
    case 'point': return vec(value, path, [3], [rule.bound]);
    case 'shell': return fields(record(value, path), path, SHELL_FIELDS);
  }
}

/** An effect's parameters: the known keys present (a null is an omitted key), typed and bounded; others dropped. */
function params(value: unknown, path: string, type: string): Record<string, unknown> {
  const source = record(value, path);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SCENE_EFFECT_PARAMS)) {
    const entry = own(source, key);
    if (entry === undefined || entry === null) continue;
    out[key] = paramValue(SCENE_EFFECT_PARAMS[key], entry, `${path}.${key}`, key, type);
  }
  return out;
}

const EFFECT_FIELDS = Object.freeze({
  id: (value: unknown, path: string) => token(value, path),
  type: (value: unknown, path: string) => oneOf(value, path, SCENE_EFFECT_TYPES),
  actor: nullable(actorRef),
  hFrac: (value: unknown, path: string) => num(value, path, 0, 4),
  at: groundPos,
  from: groundPos,
  to: groundPos,
  tMs: (value: unknown, path: string) => int(value, path, 0, STUDIO_FILM_MAX_DURATION_MS),
});

function effect(value: unknown, path: string): Record<string, unknown> {
  const source = record(value, path);
  const out = fields(source, path, EFFECT_FIELDS);
  if (out.type === undefined) refuse(`${path}.type`, 'is required');
  const raw = own(source, 'params');
  if (raw !== undefined && raw !== null) out.params = params(raw, `${path}.params`, out.type as string);
  return out;
}

const timeMs = (value: unknown, path: string): number => num(value, path, 0, STUDIO_FILM_MAX_DURATION_MS);

const SHOT_FIELDS = Object.freeze({
  id: (value: unknown, path: string) => token(value, path),
  label: (value: unknown, path: string) => text(value, path, 48),
  tMs: timeMs,
  pos: point3,
  lookAt: point3,
  fov: (value: unknown, path: string) => num(value, path, 10, 120),
  rollDeg: (value: unknown, path: string) => num(value, path, -60, 60),
  handleIn: nullable(point3),
  handleOut: nullable(point3),
  transition: (value: unknown, path: string) => oneOf(value, path, SHOT_TRANSITIONS),
});

const CUE_FIELDS = Object.freeze({
  id: (value: unknown, path: string) => token(value, path),
  label: (value: unknown, path: string) => text(value, path, 48),
  tMs: timeMs,
  durationMs: (value: unknown, path: string) => num(value, path, 60, 3000),
  amplitudeM: (value: unknown, path: string) => num(value, path, 0, 2),
  rollDeg: (value: unknown, path: string) => num(value, path, 0, 12),
  fovKickDeg: (value: unknown, path: string) => num(value, path, -15, 15),
  frequencyHz: (value: unknown, path: string) => num(value, path, 1, 30),
  seed: (value: unknown, path: string) => int(value, path, -1_000_000, 1_000_000),
});

const KEY_FIELDS = Object.freeze({
  id: (value: unknown, path: string) => token(value, path),
  tMs: timeMs,
  pos: groundPos,
  facingDeg: (value: unknown, path: string) => num(value, path, -ANGLE_DEG, ANGLE_DEG),
  turretDeg: (value: unknown, path: string) => num(value, path, -ANGLE_DEG, ANGLE_DEG),
  gunDeg: (value: unknown, path: string) => num(value, path, -90, 90),
  transition: (value: unknown, path: string) => oneOf(value, path, KEY_TRANSITIONS),
});

function storyboard(value: unknown, path: string): Record<string, unknown> {
  const source = record(value, path);
  const input = fields(source, path, {
    durationMs: timeMs,
    maxDurationMs: timeMs,
    shots: (entries, at) => list(entries, at, SCENE_LINK_LIMITS.shots, (entry, p) => fields(record(entry, p), p, SHOT_FIELDS)),
    cameraCues: (entries, at) => list(entries, at, SCENE_LINK_LIMITS.cameraCues, (entry, p) => fields(record(entry, p), p, CUE_FIELDS)),
    actorTracks: (entries, at) => list(entries, at, SCENE_LINK_LIMITS.actorTracks, (entry, p) => {
      const track = record(entry, p);
      return fields(track, p, {
        actor: (ref, refPath) => text(ref, refPath, 48),
        keys: (keys, keysPath) => list(keys, keysPath, SCENE_LINK_LIMITS.actorKeys, (key, keyPath) => fields(record(key, keyPath), keyPath, KEY_FIELDS)),
      });
    }),
  });
  // the timeline's own normalizer: the canonical, bounded storyboard load() builds (idempotent on its own output)
  return normalizeStoryboard(input) as unknown as Record<string, unknown>;
}

const CAMERA_FIELDS = Object.freeze({
  mode: (value: unknown, path: string) => oneOf(value, path, CAMERA_MODES),
  pos: point3,
  lookAt: point3,
  groundRel: bool,
  fov: (value: unknown, path: string) => num(value, path, 10, 120),
  rollDeg: (value: unknown, path: string) => num(value, path, -180, 180),
  yawDeg: (value: unknown, path: string) => num(value, path, -ANGLE_DEG, ANGLE_DEG),
  pitchDeg: (value: unknown, path: string) => num(value, path, -90, 90),
});

function film(value: unknown, path: string): unknown {
  const input = fields(record(value, path), path, {
    fps: (fps, at) => num(fps, at, 1, 240),
    shutterDeg: (deg, at) => num(deg, at, 0, 360),
    samples: (count, at) => int(count, at, 1, 1024),
    maxSamples: (count, at) => int(count, at, 1, 1024),
    filter: (filter, at) => oneOf(filter, at, FILM_FILTERS),
    shake: (shake, at) => num(shake, at, 0, 2),
    speed: (keys, at) => list(keys, at, SCENE_LINK_LIMITS.filmSpeedKeys, (key, keyPath) => fields(record(key, keyPath), keyPath, {
      tMs: timeMs,
      speed: (speed, p) => num(speed, p, 0, 100, 4),
      ease: (ease, p) => oneOf(ease, p, FILM_SPEED_EASES),
    })),
  });
  try {
    return normalizeFilm(input);
  } catch (error) {
    // the path alone: a normalizer's message may quote the link's own value, which never reaches the screen
    return refuse(path, 'is not a film block this build reads');
  }
}

/** A picture patch holding only the settings this build knows (NEUTRAL_PICTURE's own fields and groups). */
function picture(value: unknown, path: string): Record<string, unknown> | undefined {
  const source = record(value, path);
  const neutral = NEUTRAL_PICTURE as unknown as Raw;
  const patch: Record<string, unknown> = {};
  const leaf = (entry: unknown, at: string): unknown => {
    if (entry === null || typeof entry === 'boolean' || typeof entry === 'number') return entry;
    if (typeof entry === 'string') return text(entry, at, 48);
    if (Array.isArray(entry)) return vec(entry, at, [3], [1e6]);
    return refuse(at, 'is not a picture value');
  };
  const preset = own(source, 'preset');
  if (preset !== undefined) patch.preset = token(preset, `${path}.preset`);
  for (const key of Object.keys(source)) {
    if (key === 'preset' || !Object.hasOwn(neutral, key)) continue;
    const base = neutral[key];
    const entry = source[key];
    if (isRecord(base) && isRecord(entry)) {
      const group: Record<string, unknown> = {};
      for (const sub of Object.keys(entry)) if (Object.hasOwn(base, sub)) group[sub] = leaf(entry[sub], `${path}.${key}.${sub}`);
      patch[key] = group;
    } else {
      patch[key] = leaf(entry, `${path}.${key}`);
    }
  }
  try {
    // picture's own schema clamps and quantizes; state() writes exactly this minimal form
    return pictureStateJson(resolvePicture(patch));
  } catch (error) {
    // the path alone: picture's messages quote the value they refuse, which never reaches the screen
    return refuse(path, 'is not a picture block this build reads');
  }
}

function light(value: unknown, path: string): unknown {
  const input = fields(record(value, path), path, {
    sunAzimuthDeg: (deg, at) => num(deg, at, -ANGLE_DEG, ANGLE_DEG, 2),
    sunElevationDeg: (deg, at) => num(deg, at, -90, 90, 2),
    headlights: bool,
  });
  return normalizeStudioLight(input);
}

/**
 * The strict, canonical scene a link may carry: exactly the fields Studio load() reads, validated, bounded and in their
 * normalized form. Idempotent; never throws.
 */
export function sanitizeSharedScene(raw: unknown): SceneSanitized {
  try {
    const source = record(raw, 'scene');
    const schemaValue = own(source, 'tankIdSchema');
    const schema = TANK_IDS.schemaOf(schemaValue === undefined ? undefined : int(schemaValue, 'scene.tankIdSchema', 1, 1000));
    const scene: Record<string, unknown> = fields(source, 'scene', {
      tankIdSchema: (value, path) => int(value, path, 1, 1000),
      map: (value, path) => {
        const id = token(value, path, LOWER_TOKEN);
        if (!isMapId(id)) refuse(path, 'is not a battlefield of this build');
        return id;
      },
      timeOfDay: (value, path) => oneOf(value, path, STUDIO_TIMES),
      productionFormat: (value, path) => oneOf(value, path, PRODUCTION_FORMATS),
      seed: (value, path) => int(value, path, -INT32, INT32),
      actors: (value, path) => list(value, path, SCENE_LINK_LIMITS.actors, (entry, at) => actor(entry, at, schema)),
      effects: (value, path) => {
        const effects = list(value, path, SCENE_LINK_LIMITS.effects, effect);
        // an effect id names one effect: a repeated id would make playback skip the copies
        const seen = new Set<unknown>();
        effects.forEach((entry, index) => {
          if (entry.id === undefined) return;
          if (seen.has(entry.id)) refuse(`${path}[${index}].id`, 'repeats an earlier effect id');
          seen.add(entry.id);
        });
        return effects;
      },
      storyboard,
      camera: (value, path) => fields(record(value, path), path, CAMERA_FIELDS),
      fxTime: (value, path) => int(value, path, 0, STUDIO_FILM_MAX_DURATION_MS),
      timeScale: (value, path) => num(value, path, 0, 4),
    });
    const lightBlock = own(source, 'light');
    if (lightBlock != null) {
      const normalized = light(lightBlock, 'scene.light');
      if (normalized) scene.light = normalized;
    }
    const fxBlock = own(source, 'fx');
    if (fxBlock !== undefined) {
      const fx = fields(record(fxBlock, 'scene.fx'), 'scene.fx', {
        quality: (value, path) => oneOf(value, path, STUDIO_FX_QUALITIES),
        trackDust: bool,
      });
      const state = studioFxState(normalizeStudioFx(fx));
      if (state) scene.fx = state;
    }
    const filmBlock = own(source, 'film');
    if (filmBlock != null) scene.film = film(filmBlock, 'scene.film');
    const pictureBlock = own(source, 'picture');
    if (pictureBlock != null) {
      const patch = picture(pictureBlock, 'scene.picture');
      if (patch) scene.picture = patch;
    }
    const destruction = own(source, 'destruction');
    if (destruction !== undefined) {
      const sections = own(record(destruction, 'scene.destruction'), 'sections');
      if (sections !== undefined && !bool(sections, 'scene.destruction.sections')) scene.destruction = { sections: false };
    }
    return { ok: true, scene };
  } catch (error) {
    if (error instanceof SceneSchemaError) return { ok: false, detail: error.message };
    return { ok: false, detail: 'scene: could not be read' };
  }
}

// --- bytes ----------------------------------------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ALPHABET_INDEX = (() => {
  const index = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) index[ALPHABET.charCodeAt(i)] = i;
  return index;
})();

/** Unpadded base64url (RFC 4648 §5). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

/** Strict unpadded base64url: any other character, an impossible length or stray trailing bits is null. */
export function base64UrlToBytes(value: string): Uint8Array | null {
  const length = value.length;
  if (length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((length * 3) / 4));
  let bits = 0;
  let bitCount = 0;
  let o = 0;
  for (let i = 0; i < length; i++) {
    const code = value.charCodeAt(i);
    const digit = code < 128 ? ALPHABET_INDEX[code] : -1;
    if (digit < 0) return null;
    bits = ((bits << 6) | digit) & 0xffffff;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      out[o++] = (bits >> bitCount) & 255;
    }
  }
  if (bitCount > 0 && (bits & ((1 << bitCount) - 1)) !== 0) return null;
  return out;
}

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Read a byte stream to its end, or stop (cancelling it) once it passes `cap`: null. */
async function readCapped(readable: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array | null> {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return concat(chunks, total);
}

/**
 * A pull stream of `slice`-byte chunks. A decompression transform inflates a whole input chunk per call, so 1 KB slices
 * bound one call's output (deflate's ~1032:1 ceiling: about 1 MB) and the capped reader cancels before the next slice.
 */
const INFLATE_SLICE_BYTES = 1024;
function streamOf(bytes: Uint8Array, slice: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + slice));
      offset += slice;
    },
  });
}

function compressionAvailable(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!compressionAvailable()) return null;
  try {
    const stream = streamOf(bytes, bytes.byteLength).pipeThrough(new CompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
    return await readCapped(stream, Number.POSITIVE_INFINITY);
  } catch (_) {
    return null;
  }
}

/** Inflate at most `cap` bytes; 'too-large' past it (a decompression bomb stops after one chunk), null when corrupt. */
async function inflate(bytes: Uint8Array, cap: number): Promise<Uint8Array | 'too-large' | null> {
  try {
    const stream = streamOf(bytes, INFLATE_SLICE_BYTES).pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
    const out = await readCapped(stream, cap);
    return out ?? 'too-large';
  } catch (_) {
    return null;
  }
}

// --- links ----------------------------------------------------------------------------------------------------------

/** The size in KB the Studio's messages quote (one decimal). */
export function sceneLinkKb(chars: number): string {
  return (chars / 1024).toFixed(1).replace(/\.0$/, '');
}

/**
 * Encode a scene (Studio state()) as a link value: sanitized exactly as a decode would, compressed when the browser can,
 * and refused past the caps. Pass `compress: false` to write the plain-JSON codec.
 */
export async function encodeSceneLink(scene: unknown, options: { readonly compress?: boolean } = {}): Promise<SceneLinkEncoded> {
  const sanitized = sanitizeSharedScene(scene);
  if (!sanitized.ok) return { ok: false, reason: 'schema', chars: 0, detail: sanitized.detail };
  const json = new TextEncoder().encode(JSON.stringify(sanitized.scene));
  if (json.byteLength > SCENE_LINK_MAX_JSON_BYTES) {
    return { ok: false, reason: 'too-large', chars: Math.ceil((json.byteLength * 4) / 3), detail: 'scene JSON' };
  }
  const packed = options.compress === false ? null : await deflate(json);
  const [codec, bytes] = packed && packed.byteLength < json.byteLength ? ['z', packed] as const : ['j', json] as const;
  const value = `${SCENE_LINK_FORMAT}.${codec}.${bytesToBase64Url(bytes)}`;
  if (value.length > SCENE_LINK_MAX_CHARS) return { ok: false, reason: 'too-large', chars: value.length, detail: 'link' };
  return { ok: true, value, chars: value.length, jsonBytes: json.byteLength };
}

const LINK_VALUE = /^(\d{1,4})\.([a-z])\.([A-Za-z0-9_-]*)$/;

/** Decode a link value (the fragment's `scene=`). Never throws. */
export async function decodeSceneLink(value: unknown): Promise<SceneLinkDecoded> {
  try {
    if (typeof value !== 'string' || value === '') return { ok: false, reason: 'encoding', detail: 'empty link' };
    if (value.length > SCENE_LINK_MAX_CHARS) return { ok: false, reason: 'too-large', detail: 'link', chars: value.length };
    const match = LINK_VALUE.exec(value);
    if (!match) return { ok: false, reason: 'encoding', detail: 'not a scene link' };
    const format = Number(match[1]);
    if (format > SCENE_LINK_FORMAT) return { ok: false, reason: 'version', detail: `format ${format}` };
    if (format !== SCENE_LINK_FORMAT) return { ok: false, reason: 'encoding', detail: `format ${format}` };
    const codec = match[2];
    if (codec !== 'z' && codec !== 'j') return { ok: false, reason: 'encoding', detail: `codec ${codec}` };
    const bytes = base64UrlToBytes(match[3]);
    if (!bytes || bytes.byteLength === 0) return { ok: false, reason: 'encoding', detail: 'base64url' };
    let json: Uint8Array;
    if (codec === 'z') {
      if (!compressionAvailable()) return { ok: false, reason: 'unsupported', detail: 'DecompressionStream' };
      const inflated = await inflate(bytes, SCENE_LINK_MAX_JSON_BYTES);
      if (inflated === 'too-large') return { ok: false, reason: 'too-large', detail: 'scene JSON' };
      if (!inflated) return { ok: false, reason: 'encoding', detail: 'deflate' };
      json = inflated;
    } else {
      if (bytes.byteLength > SCENE_LINK_MAX_JSON_BYTES) return { ok: false, reason: 'too-large', detail: 'scene JSON' };
      json = bytes;
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(json);
    } catch (_) {
      return { ok: false, reason: 'encoding', detail: 'utf-8' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      return { ok: false, reason: 'encoding', detail: 'JSON' };
    }
    const sanitized = sanitizeSharedScene(parsed);
    if (!sanitized.ok) return { ok: false, reason: 'schema', detail: sanitized.detail };
    return { ok: true, scene: sanitized.scene, jsonBytes: json.byteLength };
  } catch (_) {
    return { ok: false, reason: 'encoding', detail: 'unreadable' };
  }
}

/**
 * The `scene=` value of a location hash (`#scene=…`, alone or beside other fragment parameters), or null when the hash
 * carries none. An oversized hash returns its raw length marker so decode reports it as too large without parsing it.
 */
export function sceneLinkValue(hash: unknown): string | null {
  if (typeof hash !== 'string' || hash.length < 2) return null;
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (body.length > SCENE_LINK_MAX_CHARS + 64) {
    return body.startsWith(`${SCENE_LINK_KEY}=`) || body.includes(`&${SCENE_LINK_KEY}=`) ? body : null;
  }
  try {
    return new URLSearchParams(body).get(SCENE_LINK_KEY);
  } catch (_) {
    return null;
  }
}

/** The shareable URL: the Studio's route on this origin, the scene in the fragment and nothing in the query. */
export function sceneLinkUrl(origin: string, studioPath: string, value: string): string {
  return `${origin}${studioPath}#${SCENE_LINK_KEY}=${value}`;
}
