/**
 * src/engine/blackWorldRecord.ts — the render black-world record's encoding (black-screen-228; arch-2 moved it here from
 * server/telemetryRecord.ts). The guard (blackWorldGuard.ts) sends one `error` record per incident: stage `render`, code
 * `render-black-world:<class>:<step>`, and its receipt as an enumerated, numeric message (no names, no text a player
 * typed). The report (tools/telemetry-report.mjs) reads them back with readRenderBlackWorld. The services' validator
 * checks only the record's alphabets, so the page no longer bundles it. Pure: no imports, no platform globals.
 */

export const RENDER_BLACK_WORLD_STAGE = 'render';
export const RENDER_BLACK_WORLD_CODE = 'render-black-world';
/** What the guard found wrong when the world went black (the first CPU signal that explains it, else the probe's). */
export const RENDER_BLACK_WORLD_CLASSES = Object.freeze([
  'camera-layer-mask', 'scene-hidden', 'override', 'passes', 'viewport', 'roots-hidden', 'empty-scene-pass', 'gl-masked',
  'nan-history', 'downstream-black',
] as const);
export type RenderBlackWorldClass = (typeof RENDER_BLACK_WORLD_CLASSES)[number];
/**
 * The heal ladder: re-assert state, reallocate targets and histories, MSAA off, context restore; `self` a black that
 * ended without a rung that acted just before it (a fault that cleared on its own), `none` one that outlived the ladder
 * or that the player left.
 */
export const RENDER_BLACK_WORLD_STEPS = Object.freeze(['H1', 'H2', 'H3', 'H4', 'self', 'none'] as const);
export type RenderBlackWorldStep = (typeof RENDER_BLACK_WORLD_STEPS)[number];
/**
 * The receipt's message keys, most telling first (round 2, eng D1: the message is cut to 200 characters, and the entry
 * telemetry may cut an oversized record's to 100): the timing that tells a first load from an Esc-and-back (reveal,
 * resize, resume), how it ended (steps, heal, left: the battle or the page ended with it open), then what the scene pass did (calls, the framebuffer status, the GL
 * error, the warm stage), then the state. Every value is a bounded number or one of a key's own enumerated words.
 */
export const RENDER_BLACK_WORLD_FIELDS = Object.freeze([
  'reveal', 'resize', 'resume', 'steps', 'heal', 'left', 'calls', 'fb', 'err', 'warm', 'rare', 'mask', 'vis', 'ovr', 'pass',
  'world', 'roots', 'vp', 'black', 'nan', 'lost', 'ground', 'dyn', 'trim', 'msaa', 'preset', 'focus', 'hidden', 'lock',
  'settings',
] as const);
const RENDER_BLACK_WORLD_WORDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  preset: new Set(['ultra', 'high', 'medium', 'low', 'ultralow', 'mobile-high', 'mobile', 'mobile-low', 'mobile-ultralow', 'unknown']),
  warm: new Set(['none', 'enemyVisuals', 'combatOpeningWarm', 'navigation', 'rareEffects', 'terrainLookahead',
    'visionPrograms', 'done', 'cancelled', 'error']),
  rare: new Set(['none', 'wreckVariants', 'armorScars', 'destructionEffects', 'textures', 'shadows', 'hiddenVariants']),
  steps: new Set(['none', 'H1', 'H1-H2', 'H1-H2-H3', 'H1-H2-H3-H4']),
  heal: new Set(RENDER_BLACK_WORLD_STEPS),
});
const RENDER_BLACK_WORLD_NUMBER = /^-?\d{1,9}(\.\d{1,3})?$/;
/** The message's whole length and its end mark: a record the transport cut short lacks the mark. */
export const RENDER_BLACK_WORLD_MESSAGE_MAX = 200;
const RENDER_BLACK_WORLD_END = '$';

/** `render-black-world:<class>:<step>`, or null for a class or step the schema does not name. */
export function renderBlackWorldCode(blackClass: string, step: string): string | null {
  if (!(RENDER_BLACK_WORLD_CLASSES as readonly string[]).includes(blackClass)) return null;
  if (!(RENDER_BLACK_WORLD_STEPS as readonly string[]).includes(step)) return null;
  return `${RENDER_BLACK_WORLD_CODE}:${blackClass}:${step}`;
}

function renderBlackWorldValue(key: string, text: string): boolean {
  const words = RENDER_BLACK_WORLD_WORDS[key];
  return words ? words.has(text) : RENDER_BLACK_WORLD_NUMBER.test(text);
}

/**
 * The receipt's message: `key=value` pairs in RENDER_BLACK_WORLD_FIELDS order, whole pairs only up to the length cap
 * (the least telling ones drop first, a pair is never cut), then the end mark; an unknown key or a free word is dropped.
 */
export function renderBlackWorldMessage(fields: Readonly<Record<string, string | number | boolean | null | undefined>>): string {
  let message = '';
  for (const key of RENDER_BLACK_WORLD_FIELDS) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    const text = typeof value === 'boolean' ? (value ? '1' : '0')
      : typeof value === 'number' ? (Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '')
        : String(value);
    if (!renderBlackWorldValue(key, text)) continue;
    const pair = `${key}=${text}`;
    if (message.length + pair.length + 1 + RENDER_BLACK_WORLD_END.length + 1 > RENDER_BLACK_WORLD_MESSAGE_MAX) break;
    message += `${message ? ' ' : ''}${pair}`;
  }
  return `${message}${message ? ' ' : ''}${RENDER_BLACK_WORLD_END}`;
}

/**
 * A black-world record's class, step and receipt fields, or null when the record is another kind. A message without
 * its end mark was cut on the way (the entry telemetry's 100-character trim): its last pair may be a fragment and is
 * dropped, and every value must still be a number or its key's own word.
 */
export function readRenderBlackWorld(record: { stage?: string | null; code?: string | null; message?: string | null; error?: { message?: string } | null }):
  { blackClass: RenderBlackWorldClass; step: RenderBlackWorldStep; fields: Record<string, string>; complete: boolean } | null {
  const [prefix, blackClass, step] = String(record.code ?? '').split(':');
  if (prefix !== RENDER_BLACK_WORLD_CODE || renderBlackWorldCode(blackClass, step) === null) return null;
  const fields: Record<string, string> = {};
  const pairs = String(record.error?.message ?? record.message ?? '').trim().split(' ').filter(Boolean);
  const complete = pairs.at(-1) === RENDER_BLACK_WORLD_END;
  // the end mark itself, or the possibly cut last pair of a message without it
  pairs.pop();
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    const key = pair.slice(0, at), value = pair.slice(at + 1);
    if ((RENDER_BLACK_WORLD_FIELDS as readonly string[]).includes(key) && renderBlackWorldValue(key, value)) fields[key] = value;
  }
  return { blackClass: blackClass as RenderBlackWorldClass, step: step as RenderBlackWorldStep, fields, complete };
}
