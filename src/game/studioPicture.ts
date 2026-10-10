import type { RuntimeValue } from '../runtimeTypes.ts';
import type { CinemaSettings } from '../engine/cinemaPost.ts';
/**
 * studioPicture.ts — Scene Studio "picture settings": the pure, JSON-safe schema behind the
 * film-grade grade, lens and finish (media r5, 2026-10-01).
 *
 * This module owns no Three.js objects. It defines the resolved picture every pass reads
 * (src/engine/cinemaPost.ts), its neutral default (byte-identical to the house render: no
 * Studio pass is inserted while a stage is neutral), the clamps, the named looks, the
 * preset + override resolution used by scene JSON `"picture": { "preset", ...overrides }`
 * and `__STUDIO.setPicture(patch)`, the minimal override diff `state()` writes, and the few
 * pieces of camera physics the lens needs (focal length from the frame's field of view on a
 * named sensor, the thin-lens circle of confusion, letterbox bars, the grain seed).
 *
 * Units: exposure in photographic stops (EV) applied to linear scene light before the
 * tonemap; temperature/tint in the conventional -100..100 white-balance scale; hues in
 * degrees; distances in meters; the circle of confusion as a fraction of the frame HEIGHT,
 * from the camera's vertical field of view, so the live viewport, a 4K capture and the
 * portrait/square formats all defocus identically.
 */

type PictureRgb = readonly [number, number, number];
type PictureLetterbox = 'none' | '2.39' | '2.00' | '1.85';
type PictureSensor = 'super35' | 'fullframe' | 'alexa65' | 'imax';
type PictureLightMode = 'auto' | 'on' | 'off';

interface PictureSplit {
  readonly shadowHue: number;
  readonly shadowAmount: number;
  readonly highlightHue: number;
  readonly highlightAmount: number;
  readonly balance: number;
}
/** Hue-selective secondary for one band of the colour wheel (display-referred). */
interface PictureBand {
  /** Hue rotation in degrees for pixels in the band. */
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}
interface PictureStreaks {
  readonly amount: number;
  readonly threshold: number;
  readonly length: number;
  readonly tint: PictureRgb;
}
interface PictureHalation {
  readonly amount: number;
  readonly threshold: number;
  readonly radius: number;
  readonly tint: PictureRgb;
}
interface PictureLightFx {
  readonly mode: PictureLightMode;
  readonly intensity: number;
}
interface PictureDof {
  readonly enabled: boolean;
  /** Actor ref (name, uid or roster index as a string); null = focus at `focusDistance`. */
  readonly focusActor: string | null;
  readonly focusDistance: number;
  readonly focusOffset: number;
  readonly fStop: number;
  readonly sensor: PictureSensor;
  readonly anamorphic: number;
  readonly bokehScale: number;
}
interface PictureVignette {
  readonly amount: number;
  readonly roundness: number;
  readonly softness: number;
}
interface PictureGrain {
  readonly amount: number;
  readonly size: number;
  readonly color: number;
  readonly response: number;
}

export interface StudioPicture {
  readonly preset: string;
  readonly exposure: number;
  readonly temperature: number;
  readonly tint: number;
  readonly contrast: number;
  readonly pivot: number;
  readonly toe: number;
  readonly shoulder: number;
  readonly saturation: number;
  readonly vibrance: number;
  readonly lift: PictureRgb;
  readonly gamma: PictureRgb;
  readonly gain: PictureRgb;
  readonly split: PictureSplit;
  readonly warms: PictureBand;
  readonly greens: PictureBand;
  readonly blues: PictureBand;
  readonly mono: number;
  readonly monoMix: PictureRgb;
  readonly bloom: number;
  readonly bloomThreshold: number;
  readonly streaks: PictureStreaks;
  readonly halation: PictureHalation;
  readonly sunShafts: PictureLightFx;
  readonly lensFlare: PictureLightFx;
  readonly dof: PictureDof;
  readonly chromaticAberration: number;
  readonly vignette: PictureVignette;
  readonly grain: PictureGrain;
  readonly letterbox: PictureLetterbox;
}

/** Deep-partial input accepted by scene JSON and `setPicture(patch)`. */
export type PicturePatch = { readonly [key: string]: RuntimeValue };

const REC709_LUMA: PictureRgb = [0.2126, 0.7152, 0.0722];

/** The neutral picture: every stage is identity, so Studio inserts no pass at all. */
export const NEUTRAL_PICTURE: StudioPicture = deepFreeze({
  preset: 'natural',
  exposure: 0,
  temperature: 0,
  tint: 0,
  contrast: 1,
  pivot: 0.43,
  toe: 0,
  shoulder: 0,
  saturation: 1,
  vibrance: 0,
  lift: [0, 0, 0],
  gamma: [1, 1, 1],
  gain: [1, 1, 1],
  split: { shadowHue: 200, shadowAmount: 0, highlightHue: 38, highlightAmount: 0, balance: 0 },
  warms: { hue: 0, saturation: 1, lightness: 0 },
  greens: { hue: 0, saturation: 1, lightness: 0 },
  blues: { hue: 0, saturation: 1, lightness: 0 },
  mono: 0,
  monoMix: REC709_LUMA,
  bloom: 1,
  bloomThreshold: 1,
  streaks: { amount: 0, threshold: 3, length: 0.55, tint: [0.55, 0.72, 1] },
  halation: { amount: 0, threshold: 1.6, radius: 1, tint: [1, 0.36, 0.12] },
  sunShafts: { mode: 'auto', intensity: 1 },
  lensFlare: { mode: 'auto', intensity: 1 },
  dof: {
    enabled: false, focusActor: null, focusDistance: 20, focusOffset: 0, fStop: 2.8,
    sensor: 'super35', anamorphic: 0, bokehScale: 1,
  },
  chromaticAberration: 0,
  vignette: { amount: 0, roundness: 0.5, softness: 0.5 },
  grain: { amount: 0, size: 1, color: 0.2, response: 0.7 },
  letterbox: 'none',
} satisfies StudioPicture);

type NumberRange = readonly [number, number];
type FieldSpec =
  | { readonly kind: 'number'; readonly range: NumberRange; readonly wrap?: boolean }
  | { readonly kind: 'rgb'; readonly range: NumberRange }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'ref' }
  | { readonly kind: 'group'; readonly fields: Readonly<Record<string, FieldSpec>> };

const num = (min: number, max: number, wrap = false): FieldSpec => ({ kind: 'number', range: [min, max], wrap });
const rgb = (min: number, max: number): FieldSpec => ({ kind: 'rgb', range: [min, max] });
const band: FieldSpec = { kind: 'group', fields: { hue: num(-60, 60), saturation: num(0, 2), lightness: num(-1, 1) } };
const lightFx: FieldSpec = {
  kind: 'group', fields: { mode: { kind: 'enum', values: ['auto', 'on', 'off'] }, intensity: num(0, 4) },
};

/** Field schema and clamps (docs/STUDIO.md "Picture"). */
const PICTURE_FIELDS: Readonly<Record<string, FieldSpec>> = Object.freeze({
  exposure: num(-4, 4),
  temperature: num(-100, 100),
  tint: num(-100, 100),
  contrast: num(0.5, 2),
  pivot: num(0.1, 0.9),
  toe: num(-1, 1),
  shoulder: num(-1, 1),
  saturation: num(0, 2),
  vibrance: num(-1, 1),
  lift: rgb(-0.3, 0.3),
  gamma: rgb(0.3, 3),
  gain: rgb(0, 3),
  split: {
    kind: 'group', fields: {
      shadowHue: num(0, 360, true), shadowAmount: num(0, 1),
      highlightHue: num(0, 360, true), highlightAmount: num(0, 1), balance: num(-1, 1),
    },
  },
  warms: band,
  greens: band,
  blues: band,
  mono: num(0, 1),
  monoMix: rgb(-2, 2),
  bloom: num(0, 4),
  bloomThreshold: num(0.25, 4),
  streaks: {
    kind: 'group', fields: { amount: num(0, 3), threshold: num(0.5, 32), length: num(0, 1), tint: rgb(0, 2) },
  },
  halation: {
    kind: 'group', fields: { amount: num(0, 3), threshold: num(0.1, 16), radius: num(0.25, 4), tint: rgb(0, 2) },
  },
  sunShafts: lightFx,
  lensFlare: lightFx,
  dof: {
    kind: 'group', fields: {
      enabled: { kind: 'boolean' }, focusActor: { kind: 'ref' }, focusDistance: num(0.5, 5000),
      focusOffset: num(-50, 50), fStop: num(0.7, 32),
      sensor: { kind: 'enum', values: ['super35', 'fullframe', 'alexa65', 'imax'] },
      anamorphic: num(0, 1), bokehScale: num(0, 8),
    },
  },
  chromaticAberration: num(0, 1),
  vignette: { kind: 'group', fields: { amount: num(0, 1), roundness: num(0, 1), softness: num(0, 1) } },
  grain: { kind: 'group', fields: { amount: num(0, 1), size: num(0.5, 4), color: num(0, 1), response: num(0, 1) } },
  letterbox: { kind: 'enum', values: ['none', '2.39', '2.00', '1.85'] },
});

export const PICTURE_LETTERBOXES: readonly PictureLetterbox[] = ['none', '2.39', '2.00', '1.85'];

interface LookDefinition {
  readonly id: string;
  readonly label: string;
  readonly values: PicturePatch;
}

/**
 * The named looks. Each is a sparse patch over NEUTRAL_PICTURE, tuned on real renders across
 * several maps at day, sunset and night (media r5 review sheets). Looks never set a letterbox
 * or depth of field: framing and focus belong to the shot.
 */
const LOOKS: readonly LookDefinition[] = Object.freeze([
  { id: 'natural', label: 'Natural', values: {} },
  {
    // teal/orange filmic: warm accents against teal shadows, foliage pushed toward olive-teal
    id: 'cinematic', label: 'Cinematic',
    values: {
      temperature: 4, contrast: 1.18, toe: 0.35, shoulder: 0.32, saturation: 0.95, vibrance: 0.12,
      split: { shadowHue: 190, shadowAmount: 0.62, highlightHue: 32, highlightAmount: 0.45, balance: 0.05 },
      greens: { hue: 18, saturation: 0.66, lightness: -0.1 }, blues: { hue: -8, saturation: 0.92 },
      warms: { hue: -4, saturation: 1.18 },
      bloom: 1.2, streaks: { amount: 0.2 }, halation: { amount: 0.18, threshold: 1.6 },
      chromaticAberration: 0.12, vignette: { amount: 0.3, roundness: 0.55, softness: 0.6 }, grain: { amount: 0.1 },
    },
  },
  {
    // modern action: punchy contrast, crushed blacks, saturated warm highlights, blue streaks, forced sun FX
    id: 'blockbuster', label: 'Blockbuster',
    values: {
      exposure: 0.05, temperature: 5, contrast: 1.26, toe: 0.5, shoulder: 0.2, saturation: 1.04, vibrance: 0.22,
      split: { shadowHue: 194, shadowAmount: 0.62, highlightHue: 30, highlightAmount: 0.42 },
      greens: { hue: 18, saturation: 0.66, lightness: -0.12 }, blues: { hue: -10, saturation: 1.05 },
      warms: { hue: -3, saturation: 1.2, lightness: 0.05 },
      bloom: 1.3, streaks: { amount: 0.42, threshold: 2.8, length: 0.7 }, halation: { amount: 0.2, threshold: 1.6 },
      chromaticAberration: 0.16, vignette: { amount: 0.34, roundness: 0.5, softness: 0.55 }, grain: { amount: 0.08 },
      sunShafts: { mode: 'on', intensity: 1.2 }, lensFlare: { mode: 'on', intensity: 1.1 },
    },
  },
  {
    // low warm sun: amber highlights, soft glowing shoulder, cool shadows, foliage kept olive
    id: 'golden-hour', label: 'Golden hour',
    values: {
      exposure: 0.04, temperature: 6, tint: 3, contrast: 1.08, toe: 0.2, shoulder: 0.45, vibrance: 0.08,
      gain: [1.02, 1.0, 0.97],
      split: { shadowHue: 215, shadowAmount: 0.3, highlightHue: 34, highlightAmount: 0.38, balance: -0.1 },
      greens: { hue: 8, saturation: 0.7, lightness: -0.06 }, warms: { saturation: 1.12, lightness: 0.03 },
      blues: { hue: 6, saturation: 0.88 },
      bloom: 1.3, halation: { amount: 0.28, threshold: 1.4 }, streaks: { amount: 0.1 },
      vignette: { amount: 0.24, roundness: 0.65, softness: 0.7 }, grain: { amount: 0.08 },
      sunShafts: { mode: 'on', intensity: 1.2 }, lensFlare: { mode: 'on', intensity: 1.1 },
    },
  },
  {
    // cold desaturated war film
    id: 'steel', label: 'Steel',
    values: {
      exposure: -0.1, temperature: -20, tint: -2, contrast: 1.22, toe: 0.35, shoulder: 0.18, saturation: 0.62, vibrance: -0.1,
      split: { shadowHue: 208, shadowAmount: 0.4, highlightHue: 200, highlightAmount: 0.1, balance: 0.1 },
      greens: { hue: 12, saturation: 0.55, lightness: -0.1 }, blues: { saturation: 0.8 }, warms: { saturation: 0.85 },
      bloom: 0.9, halation: { amount: 0.05, threshold: 1.8 }, chromaticAberration: 0.1,
      vignette: { amount: 0.32, roundness: 0.45, softness: 0.55 }, grain: { amount: 0.16, size: 1.1, color: 0.08 },
    },
  },
  {
    // skipped bleach: silver retained — high contrast, low saturation, crunchy blacks, heavy grain
    id: 'bleach-bypass', label: 'Bleach bypass',
    values: {
      exposure: 0.06, temperature: -3, contrast: 1.4, pivot: 0.46, toe: 0.62, shoulder: -0.15, saturation: 0.4, vibrance: -0.25,
      split: { shadowHue: 205, shadowAmount: 0.12, highlightHue: 50, highlightAmount: 0.06 },
      greens: { saturation: 0.7 },
      bloom: 1.1, halation: { amount: 0.08, threshold: 1.8 }, chromaticAberration: 0.08,
      vignette: { amount: 0.34, roundness: 0.45, softness: 0.5 }, grain: { amount: 0.26, size: 1.15, color: 0.05, response: 0.8 },
    },
  },
  {
    // sun-bleached heat: orange-amber sand, teal shadows, soft blown highlights
    id: 'desert-heat', label: 'Desert heat',
    values: {
      exposure: 0.08, temperature: 20, tint: 4, contrast: 1.14, toe: 0.32, shoulder: 0.5, vibrance: 0.18,
      gamma: [1.02, 1.0, 0.97], gain: [1.04, 0.99, 0.9],
      split: { shadowHue: 188, shadowAmount: 0.36, highlightHue: 40, highlightAmount: 0.42, balance: -0.05 },
      warms: { hue: -5, saturation: 1.18 }, greens: { hue: -6, saturation: 0.72 }, blues: { hue: -12, saturation: 0.9 },
      bloom: 1.25, halation: { amount: 0.24, threshold: 1.5 }, streaks: { amount: 0.15 },
      chromaticAberration: 0.1, vignette: { amount: 0.28, roundness: 0.6, softness: 0.65 }, grain: { amount: 0.1 },
      sunShafts: { mode: 'on', intensity: 1.15 },
    },
  },
  {
    // cool moonlight: blue night with firelight that still burns orange
    id: 'night-ops', label: 'Night ops',
    values: {
      temperature: -30, tint: -4, contrast: 1.18, toe: 0.38, shoulder: 0.4, saturation: 0.74, vibrance: 0.08,
      lift: [0, 0.004, 0.014],
      split: { shadowHue: 216, shadowAmount: 0.52, highlightHue: 196, highlightAmount: 0.1, balance: 0.15 },
      warms: { saturation: 1.4, lightness: 0.08 }, greens: { hue: 8, saturation: 0.42, lightness: -0.1 }, blues: { saturation: 1.08 },
      bloom: 1.05, streaks: { amount: 0.26, threshold: 3, length: 0.65 },
      halation: { amount: 0.16, threshold: 1.8 }, chromaticAberration: 0.12,
      vignette: { amount: 0.38, roundness: 0.55, softness: 0.6 }, grain: { amount: 0.16, size: 1.1, color: 0.08, response: 0.55 },
    },
  },
  {
    // fire-lit combat: molten highlights, halation and warm streaks against cool shadows
    id: 'ember', label: 'Ember',
    values: {
      exposure: 0.06, temperature: 10, contrast: 1.2, toe: 0.45, shoulder: 0.32, saturation: 1.02, vibrance: 0.22,
      split: { shadowHue: 205, shadowAmount: 0.5, highlightHue: 26, highlightAmount: 0.5, balance: 0.1 },
      warms: { hue: -6, saturation: 1.25, lightness: 0.06 }, greens: { hue: 10, saturation: 0.6 }, blues: { saturation: 0.95 },
      bloom: 1.5, bloomThreshold: 0.9, streaks: { amount: 0.34, threshold: 2.6, length: 0.6, tint: [1, 0.62, 0.36] },
      halation: { amount: 0.34, threshold: 1.3, radius: 1.2 }, chromaticAberration: 0.14,
      vignette: { amount: 0.36, roundness: 0.55, softness: 0.6 }, grain: { amount: 0.12 },
    },
  },
  {
    // black and white through a red-orange filter: dark skies and foliage, hard light, heavy grain
    id: 'noir', label: 'Noir',
    values: {
      exposure: 0.05, contrast: 1.36, pivot: 0.45, toe: 0.55, shoulder: 0.12, mono: 1, monoMix: [0.7, 0.3, 0],
      blues: { lightness: -0.45 }, greens: { lightness: -0.25 },
      bloom: 1.2, halation: { amount: 0.12, threshold: 1.6, tint: [1, 1, 1] },
      vignette: { amount: 0.44, roundness: 0.6, softness: 0.55 }, grain: { amount: 0.28, size: 1.2, color: 0, response: 0.75 },
    },
  },
  {
    // print-film emulation: milky shoulder, faded blacks, warm highs, cyan lows, olive foliage, grain
    id: 'vintage-print', label: 'Vintage print',
    values: {
      exposure: 0.04, temperature: 8, tint: 2, contrast: 1.06, toe: -0.45, shoulder: 0.7, saturation: 0.84, vibrance: 0.05,
      lift: [0, 0.01, 0.02], gain: [1.02, 0.99, 0.93],
      split: { shadowHue: 186, shadowAmount: 0.5, highlightHue: 40, highlightAmount: 0.48 },
      greens: { hue: -8, saturation: 0.68 }, blues: { hue: -12, saturation: 0.8 }, warms: { saturation: 1.05 },
      bloom: 1.2, halation: { amount: 0.38, threshold: 1.3, radius: 1.3 },
      chromaticAberration: 0.2, vignette: { amount: 0.36, roundness: 0.7, softness: 0.75 },
      grain: { amount: 0.36, size: 1.35, color: 0.3, response: 0.65 },
    },
  },
] satisfies readonly LookDefinition[]);

const LOOK_BY_ID = new Map(LOOKS.map((look) => [look.id, look]));

/** `[{ id, label }]` for tooling and the panel (labels are English; the panel localizes by id). */
export const PICTURE_PRESETS: ReadonlyArray<{ readonly id: string; readonly label: string }> = Object.freeze(
  LOOKS.map((look) => Object.freeze({ id: look.id, label: look.label })),
);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isPlainObject(value: RuntimeValue): value is Readonly<Record<string, RuntimeValue>> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 1e-4 quantization: state() round-trips exactly and the GPU sees the same number. */
const quantize = (value: number): number => Math.round(value * 10000) / 10000 + 0;

function normalizeNumber(path: string, raw: RuntimeValue, range: NumberRange, wrap: boolean): number {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`picture.${path} must be a finite number`);
  if (wrap) {
    const span = range[1] - range[0];
    return quantize(((((value - range[0]) % span) + span) % span) + range[0]);
  }
  return quantize(Math.min(range[1], Math.max(range[0], value)));
}

function normalizeField(path: string, spec: FieldSpec, raw: RuntimeValue, base: RuntimeValue): RuntimeValue {
  switch (spec.kind) {
    case 'number': return normalizeNumber(path, raw, spec.range, !!spec.wrap);
    case 'rgb': {
      if (typeof raw === 'number') return [0, 1, 2].map((i) => normalizeNumber(`${path}[${i}]`, raw, spec.range, false));
      if (!Array.isArray(raw) || raw.length !== 3) throw new RangeError(`picture.${path} must be [r, g, b]`);
      return raw.map((channel: RuntimeValue, i: number) => normalizeNumber(`${path}[${i}]`, channel, spec.range, false));
    }
    case 'enum': {
      const value = typeof raw === 'number' && path === 'letterbox' ? raw.toFixed(2) : String(raw);
      if (!spec.values.includes(value)) throw new RangeError(`picture.${path}: unknown value "${String(raw)}"`);
      return value;
    }
    case 'boolean':
      if (typeof raw !== 'boolean') throw new RangeError(`picture.${path} must be true or false`);
      return raw;
    case 'ref':
      if (raw == null || raw === '') return null;
      if (typeof raw !== 'string' && typeof raw !== 'number') throw new RangeError(`picture.${path} must be an actor name, uid or index`);
      return String(raw);
    case 'group': {
      if (!isPlainObject(raw)) throw new RangeError(`picture.${path} must be an object`);
      const baseGroup = isPlainObject(base) ? base : {};
      const out: Record<string, RuntimeValue> = { ...baseGroup };
      for (const [key, value] of Object.entries(raw)) {
        const child = spec.fields[key];
        if (!child) throw new RangeError(`picture.${path}.${key} is not a picture setting`);
        if (value === undefined) continue;
        out[key] = normalizeField(`${path}.${key}`, child, value, baseGroup[key]);
      }
      return out;
    }
  }
}

function mergePatch(base: StudioPicture, patch: PicturePatch): StudioPicture {
  const out: Record<string, RuntimeValue> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'preset' || value === undefined) continue;
    const spec = PICTURE_FIELDS[key];
    if (!spec) throw new RangeError(`picture.${key} is not a picture setting`);
    out[key] = normalizeField(key, spec, value, (base as unknown as Record<string, RuntimeValue>)[key]);
  }
  return deepFreeze(out as unknown as StudioPicture);
}

function lookBase(id: string): StudioPicture {
  const look = LOOK_BY_ID.get(id);
  if (!look) throw new RangeError(`Unknown picture preset "${id}"`);
  return deepFreeze({ ...mergePatch(NEUTRAL_PICTURE, look.values), preset: id });
}

const LOOK_BASES = new Map(LOOKS.map((look) => [look.id, lookBase(look.id)]));

/** A look's resolved values (no overrides). */
export function resolvePictureLook(id: string): StudioPicture {
  const base = LOOK_BASES.get(id);
  if (!base) throw new RangeError(`Unknown picture preset "${id}"`);
  return base;
}

/**
 * Apply a patch: `preset` switches the look (discarding earlier overrides), every other
 * field overrides the current values; `null` resets to the neutral picture.
 */
export function applyPicturePatch(current: StudioPicture, patch: PicturePatch | null | undefined): StudioPicture {
  if (patch == null) return NEUTRAL_PICTURE;
  if (!isPlainObject(patch)) throw new RangeError('picture must be an object');
  const presetRaw = patch.preset;
  const base = presetRaw === undefined ? current : resolvePictureLook(String(presetRaw));
  const merged = mergePatch(base, patch);
  return merged.preset === base.preset ? merged : deepFreeze({ ...merged, preset: base.preset });
}

/** Scene JSON `picture` block → resolved picture (absent = neutral). */
export function resolvePicture(input: PicturePatch | null | undefined): StudioPicture {
  if (input == null) return NEUTRAL_PICTURE;
  return applyPicturePatch(NEUTRAL_PICTURE, { preset: 'natural', ...input });
}

function sameValue(a: RuntimeValue, b: RuntimeValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

function diffGroup(value: Readonly<Record<string, RuntimeValue>>, base: Readonly<Record<string, RuntimeValue>>): Record<string, RuntimeValue> | null {
  let out: Record<string, RuntimeValue> | null = null;
  for (const key of Object.keys(value)) {
    if (sameValue(value[key], base[key])) continue;
    out ??= {};
    out[key] = Array.isArray(value[key]) ? [...value[key] as number[]] : value[key];
  }
  return out;
}

/** `state()` form: `{ preset, ...minimal overrides }`, or undefined for the neutral picture. */
export function pictureStateJson(picture: StudioPicture): Record<string, RuntimeValue> | undefined {
  if (isNeutralPicture(picture)) return undefined;
  const base = resolvePictureLook(picture.preset) as unknown as Readonly<Record<string, RuntimeValue>>;
  const value = picture as unknown as Readonly<Record<string, RuntimeValue>>;
  const out: Record<string, RuntimeValue> = { preset: picture.preset };
  for (const key of Object.keys(PICTURE_FIELDS)) {
    const spec = PICTURE_FIELDS[key];
    if (spec.kind === 'group') {
      const diff = diffGroup(value[key] as Readonly<Record<string, RuntimeValue>>, base[key] as Readonly<Record<string, RuntimeValue>>);
      if (diff) out[key] = diff;
    } else if (!sameValue(value[key], base[key])) {
      out[key] = Array.isArray(value[key]) ? [...value[key] as number[]] : value[key];
    }
  }
  return out;
}

const rgbIs = (value: PictureRgb, x: number): boolean => value[0] === x && value[1] === x && value[2] === x;
const bandNeutral = (b: PictureBand): boolean => b.hue === 0 && b.saturation === 1 && b.lightness === 0;

/** Depth of field runs (the lens pass is inserted). */
function pictureLensActive(p: StudioPicture): boolean {
  return p.dof.enabled && p.dof.bokehScale > 0;
}

/** Scene-referred stage: exposure, white balance, streaks or halation. */
function pictureHdrActive(p: StudioPicture): boolean {
  return p.exposure !== 0 || p.temperature !== 0 || p.tint !== 0 || p.streaks.amount > 0 || p.halation.amount > 0;
}

/** Bloom strength/threshold override (a hook on the house bloom, no pass). */
function pictureBloomActive(p: StudioPicture): boolean {
  return p.bloom !== 1 || p.bloomThreshold !== 1;
}

/** Sun shafts / lens flare forced or scaled. */
function pictureLightFxActive(p: StudioPicture): boolean {
  return p.sunShafts.mode !== 'auto' || p.sunShafts.intensity !== 1
    || p.lensFlare.mode !== 'auto' || p.lensFlare.intensity !== 1;
}

/** Display-referred grade after the house tonemap/grade. */
function pictureGradeActive(p: StudioPicture): boolean {
  return p.contrast !== 1 || p.toe !== 0 || p.shoulder !== 0 || p.saturation !== 1 || p.vibrance !== 0
    || !rgbIs(p.lift, 0) || !rgbIs(p.gamma, 1) || !rgbIs(p.gain, 1)
    || p.split.shadowAmount > 0 || p.split.highlightAmount > 0 || p.mono > 0
    || !bandNeutral(p.warms) || !bandNeutral(p.greens) || !bandNeutral(p.blues);
}

/** Per-output-frame finish: chromatic aberration, vignette, grain, letterbox. */
function pictureFinishActive(p: StudioPicture): boolean {
  return p.chromaticAberration > 0 || p.vignette.amount > 0 || p.grain.amount > 0 || p.letterbox !== 'none';
}

export function isNeutralPicture(p: StudioPicture): boolean {
  return !pictureLensActive(p) && !pictureHdrActive(p) && !pictureBloomActive(p) && !pictureLightFxActive(p)
    && !pictureGradeActive(p) && !pictureFinishActive(p);
}

// --- camera physics -------------------------------------------------------------------------

/**
 * Sensor width in millimetres, used with a 16:9 extraction (height = width × 9 / 16). Super 35
 * is the cinema standard (ARRI/Kodak 4-perf full aperture width 24.89 mm → 14.0 mm tall);
 * larger formats give a longer lens for the same field of view and therefore a shallower depth
 * of field at the same f-stop. The lens comes from the VERTICAL field of view (three.js `fov`),
 * so the defocus does not change with the output aspect.
 */
export const PICTURE_SENSOR_MM: Readonly<Record<PictureSensor, number>> = Object.freeze({
  super35: 24.89, fullframe: 36.0, alexa65: 54.12, imax: 70.41,
});

const sensorHeightMm = (sensor: PictureSensor): number => PICTURE_SENSOR_MM[sensor] * 9 / 16;

/**
 * Cinematic defocus gain. On the wide lenses Studio frames with (32–50° vertical), a thin lens is
 * close to hyperfocal: f/2.8 on a 40° Super 35 frame focused 12 m away blurs the horizon by under
 * one pixel. Cinema gets its separation from long lenses and big formats; Studio renders the
 * thin-lens circle of confusion × this gain (as if the format were 16× larger), so f/2.8 on that
 * 40° frame visibly softens the background while f/11 stays near-sharp. `bokehScale: 0.0625`
 * restores strictly physical Super 35 defocus.
 */
export const PICTURE_DEFOCUS_GAIN = 16;

/** Lens focal length (mm) that frames the camera's vertical field of view on the sensor height. */
export function pictureFocalLengthMm(fovDeg: number, sensor: PictureSensor): number {
  const tanV = Math.tan((Math.max(1, Math.min(170, fovDeg)) * Math.PI) / 360);
  return (sensorHeightMm(sensor) * 0.5) / Math.max(1e-6, tanV);
}

interface PictureLensState {
  /** Focus distance along the optical axis (m). */
  readonly focusM: number;
  readonly focalMm: number;
  /**
   * Signed CoC diameter as a fraction of the frame height is `coc(d) = k · (d − s) / d`
   * (negative = near field). k = f² / (N · (s − f)) / sensorHeight × PICTURE_DEFOCUS_GAIN × bokehScale.
   */
  readonly cocScale: number;
}

/** Thin-lens constants for the lens pass. */
export function pictureLensState(dof: PictureDof, fovDeg: number, focusM: number): PictureLensState {
  const focalMm = pictureFocalLengthMm(fovDeg, dof.sensor);
  const f = focalMm / 1000;
  const s = Math.max(f * 1.05, focusM);
  const sensorHeight = sensorHeightMm(dof.sensor) / 1000;
  const cocScale = (f * f) / (dof.fStop * (s - f)) / sensorHeight * PICTURE_DEFOCUS_GAIN * dof.bokehScale;
  return { focusM: s, focalMm, cocScale };
}

/** Signed CoC (fraction of the frame height) at view depth `depthM` — the shader's formula. */
export function pictureCocAt(lens: PictureLensState, depthM: number): number {
  const d = Math.max(1e-3, depthM);
  return (lens.cocScale * (d - lens.focusM)) / d;
}

const LETTERBOX_ASPECT: Readonly<Record<Exclude<PictureLetterbox, 'none'>, number>> = Object.freeze({
  '2.39': 2.39, '2.00': 2.0, '1.85': 1.85,
});

/**
 * Matte bars for the output size in whole pixels: top/bottom bars when the target is wider
 * than the frame, side bars (pillarbox) when it is narrower, none when they match.
 */
export function pictureLetterboxBars(
  letterbox: PictureLetterbox,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  if (letterbox === 'none' || width <= 0 || height <= 0) return { x: 0, y: 0 };
  const target = LETTERBOX_ASPECT[letterbox];
  const aspect = width / height;
  if (Math.abs(aspect - target) < 1e-3) return { x: 0, y: 0 };
  if (target > aspect) return { x: 0, y: Math.round((height - width / target) / 2) };
  return { x: Math.round((width - height * target) / 2), y: 0 };
}

/** Grain seed: the scene seed and the Studio clock (never wall time). */
export function pictureGrainSeed(sceneSeed: number, fxTimeMs: number): number {
  let h = (Math.imul((sceneSeed | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0);
  const frame = Math.round(Math.max(0, fxTimeMs) * 0.24) | 0; // 240 distinct grain fields per Studio second
  h = Math.imul(h ^ (h >>> 13) ^ frame, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Linear Rec.709 white-balance matrix (row-major 3×3): a von Kries scaling in the CAT02-like
 * LMS space between D65 and the white point the temperature/tint sliders describe
 * (Unity/Lightroom convention: +temperature warms, +tint toward magenta).
 */
export function pictureWhiteBalance(temperature: number, tint: number): number[] {
  const t1 = temperature / 65;
  const t2 = tint / 65;
  const x = 0.31271 - t1 * (t1 < 0 ? 0.1 : 0.05);
  const standardY = 2.87 * x - 3 * x * x - 0.27509507;
  const y = standardY + t2 * 0.05;
  const X = x / y, Y = 1, Z = (1 - x - y) / y;
  const L = 0.7328 * X + 0.4296 * Y - 0.1624 * Z;
  const M = -0.7036 * X + 1.6975 * Y + 0.0061 * Z;
  const S = 0.0030 * X + 0.0136 * Y + 0.9834 * Z;
  // D65 over the slider's white point: +temperature describes a bluer source white, whose
  // correction warms the frame; +tint a greener one, whose correction pulls toward magenta.
  const w1 = [0.949237, 1.03542, 1.08728];
  const balance = [w1[0] / L, w1[1] / M, w1[2] / S];
  const toLms = [
    3.90405e-1, 5.49941e-1, 8.92632e-3,
    7.08416e-2, 9.63172e-1, 1.35775e-3,
    2.31082e-2, 1.28021e-1, 9.36245e-1,
  ];
  const fromLms = [
    2.85847e+0, -1.62879e+0, -2.48910e-2,
    -2.10182e-1, 1.15820e+0, 3.24281e-4,
    -4.18120e-2, -1.18169e-1, 1.06867e+0,
  ];
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += fromLms[r * 3 + k] * balance[k] * toLms[k * 3 + c];
      out[r * 3 + c] = sum;
    }
  }
  // Keep a neutral grey's luminance: white balance moves colour, exposure moves level.
  const grey = [0, 1, 2].map((r) => out[r * 3] + out[r * 3 + 1] + out[r * 3 + 2]);
  const luma = REC709_LUMA[0] * grey[0] + REC709_LUMA[1] * grey[1] + REC709_LUMA[2] * grey[2];
  return out.map((v) => v / luma);
}

// --- engine settings ------------------------------------------------------------------------

/** Zero-luma chroma direction of a hue (unit length): split toning moves colour, not level. */
function hueChroma(hueDeg: number): [number, number, number] {
  const h = (((hueDeg % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  const l = REC709_LUMA[0] * r + REC709_LUMA[1] * g + REC709_LUMA[2] * b;
  const c = [r - l, g - l, b - l];
  const n = Math.hypot(c[0], c[1], c[2]) || 1;
  return [c[0] / n, c[1] / n, c[2] / n];
}

/** Display-space strength of split toning at amount 1 (shadow offset, highlight offset). */
const SPLIT_SHADOW_GAIN = 0.12;
const SPLIT_HIGHLIGHT_GAIN = 0.1;
/** Streak buffers are energy-normalized long blurs; amount 1 needs this gain to read. */
const STREAK_GAIN = 4;
/** Largest CoC radius (fraction of the frame height) the lens pass will gather. */
const DOF_MAX_RADIUS = 0.028;

/** Resolved picture → the per-stage engine settings `createCinemaPost().apply()` takes. */
export function pictureCinemaSettings(p: StudioPicture): CinemaSettings {
  const split = p.split;
  const shadow = hueChroma(split.shadowHue).map((v) => v * split.shadowAmount * SPLIT_SHADOW_GAIN);
  const high = hueChroma(split.highlightHue).map((v) => v * split.highlightAmount * SPLIT_HIGHLIGHT_GAIN);
  return {
    lens: pictureLensActive(p) ? { anamorphic: p.dof.anamorphic, maxRadius: DOF_MAX_RADIUS } : null,
    hdr: pictureHdrActive(p) ? {
      exposure: Math.pow(2, p.exposure),
      whiteBalance: pictureWhiteBalance(p.temperature, p.tint),
      streaks: p.streaks.amount > 0 ? {
        amount: p.streaks.amount * STREAK_GAIN, threshold: p.streaks.threshold, length: p.streaks.length, tint: p.streaks.tint,
      } : null,
      halation: p.halation.amount > 0 ? {
        amount: p.halation.amount, threshold: p.halation.threshold, radius: p.halation.radius, tint: p.halation.tint,
      } : null,
    } : null,
    bloom: pictureBloomActive(p) ? { strength: p.bloom, threshold: p.bloomThreshold } : null,
    lightFx: pictureLightFxActive(p) ? {
      shafts: p.sunShafts.mode, shaftsIntensity: p.sunShafts.intensity,
      flare: p.lensFlare.mode, flareIntensity: p.lensFlare.intensity,
    } : null,
    grade: pictureGradeActive(p) ? {
      lift: p.lift, gamma: p.gamma, gain: p.gain, contrast: p.contrast, pivot: p.pivot, toe: p.toe,
      shoulder: p.shoulder, saturation: p.saturation, vibrance: p.vibrance, mono: p.mono,
      monoMix: normalizedMix(p.monoMix), shadowTint: shadow, highlightTint: high, splitBalance: split.balance,
      bands: [p.warms, p.greens, p.blues].map((b) => [b.hue, b.saturation, b.lightness] as const),
    } : null,
    finish: pictureFinishActive(p) ? {
      chromaticAberration: p.chromaticAberration,
      vignette: [p.vignette.amount, p.vignette.roundness, p.vignette.softness],
      grain: [p.grain.amount, p.grain.size, p.grain.color, p.grain.response],
      letterbox: p.letterbox === 'none' ? 0 : LETTERBOX_ASPECT[p.letterbox],
    } : null,
  };
}

function normalizedMix(mix: PictureRgb): [number, number, number] {
  const sum = mix[0] + mix[1] + mix[2];
  if (Math.abs(sum) < 1e-4) return [REC709_LUMA[0], REC709_LUMA[1], REC709_LUMA[2]];
  return [mix[0] / sum, mix[1] / sum, mix[2] / sum];
}
