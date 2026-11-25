/**
 * A replay's cues (replay-fixes-277; Kevin 11-25: "no one is actually moving, the battle isnt actually happening"): the
 * bus events the battle's picture and sound play from (a shot leaving the barrel, a hit, a kill, a fire, a ram, a prop
 * crushed, a smoke screen), kept by the indexer as its re-simulation emits them (replayIndexer.ts) and played back by the
 * viewer on the page's bus at their steps while it plays forward (never on a seek), tagged `replay: true` so the
 * listeners that act on a live battle (the kill cam, the result beats, the records' own guards) stand down. The track
 * poses the hulls and the shells; the cues bring the effects. Node-runnable; a payload is copied to plain data, as the
 * emitters reuse their event objects.
 */

/** The events a replay plays back: the ones the FX, the audio and the HUD's picture draw from. */
export const REPLAY_CUE_EVENTS: ReadonlySet<string> = new Set([
  'shell:fired', 'shell:hit', 'shell:expired', 'tank:destroyed', 'tank:fire', 'tank:impact', 'tank:ram', 'prop:crushed',
  'auxiliary:smokeScreens', 'aps:intercept', 'drone:down', 'tank:turbo', 'tank:airSpin', 'tank:autoflip',
]);

export interface ReplayCue {
  /** The step it was emitted in (the battle's tick then). */
  readonly tick: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

/** `value` as plain data, at most `depth` levels of objects (an entity or a function is left out). */
function plain(value: unknown, depth: number): Plain | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth <= 0 || typeof value !== 'object') return undefined;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const out: Plain[] = [];
    const list = value as ArrayLike<unknown>;
    for (let i = 0; i < list.length; i++) { const copy = plain(list[i], depth - 1); if (copy !== undefined) out.push(copy); }
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  // a plain record or a Vector3-like point; an entity (a class with a state and a visual) is not data to keep
  const point = 'x' in (value as object) && 'y' in (value as object) && 'z' in (value as object);
  if (proto !== Object.prototype && proto !== null && !point) return undefined;
  const out: { [key: string]: Plain } = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'visual' || key === 'state' || key === 'combat' || key === 'ai') continue;
    const copy = plain(item, depth - 1);
    if (copy !== undefined) out[key] = copy;
  }
  if (point) { out.x = Number((value as { x: number }).x); out.y = Number((value as { y: number }).y); out.z = Number((value as { z: number }).z); }
  return out;
}

/** The cue an emitted event makes, or null for an event a replay does not play back. */
export function replayCueOf(type: string, payload: unknown, tick: number): ReplayCue | null {
  if (!REPLAY_CUE_EVENTS.has(type)) return null;
  const copy = plain(payload ?? {}, 3);
  return { tick, type, payload: copy && typeof copy === 'object' && !Array.isArray(copy) ? copy : {} };
}

/** The first cue at or after `tick` (cues are in emission order, so by tick). */
export function firstCueFrom(cues: readonly ReplayCue[], tick: number): number {
  let lo = 0, hi = cues.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cues[mid]!.tick < tick) lo = mid + 1; else hi = mid; }
  return lo;
}
