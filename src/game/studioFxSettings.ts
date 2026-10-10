/**
 * studioFxSettings.ts — pure Scene Studio FX settings and effect parameter
 * schema (scene JSON `fx` block, the cinematic effect types' parameters and
 * their panel controls). Node-runnable: no DOM, WebGL or game state.
 */

/** Scene-level FX quality: `battle` is the game's exact look (the default). */
export const STUDIO_FX_QUALITIES = ['battle', 'cinematic'] as const;
export type StudioFxQuality = typeof STUDIO_FX_QUALITIES[number];

export interface StudioFxSettings {
  quality: StudioFxQuality;
  /** Distance-keyed dust + prints behind actors driven by timeline tracks. */
  trackDust: boolean;
}

interface StudioFxInput {
  quality?: unknown;
  trackDust?: unknown;
}

/** Normalize a scene `fx` block. Missing/invalid = the historical battle look. */
export function normalizeStudioFx(input: StudioFxInput | null | undefined): StudioFxSettings {
  const quality: StudioFxQuality = input?.quality === 'cinematic' ? 'cinematic' : 'battle';
  const trackDust = typeof input?.trackDust === 'boolean' ? input.trackDust : quality === 'cinematic';
  return { quality, trackDust };
}

/** Serialized `fx` block, or null when it equals the default (round-trip identity). */
export function studioFxState(settings: StudioFxSettings): { quality: StudioFxQuality; trackDust?: boolean } | null {
  const implied = settings.quality === 'cinematic';
  if (settings.quality === 'battle' && !settings.trackDust) return null;
  return settings.trackDust === implied
    ? { quality: settings.quality }
    : { quality: settings.quality, trackDust: settings.trackDust };
}

export interface StudioFxParamDef {
  readonly key: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  /** i18n key of the control label (studioPanel.fxParam.*). */
  readonly label: string;
}

const param = (key: string, min: number, max: number, step: number, value: number): StudioFxParamDef => ({
  key, min, max, step, value, label: `studioPanel.fxParam.${key}`,
});

/**
 * Numeric parameters of the cinematic effect types (defaults, ranges, panel
 * steps). The handlers clamp every value to these ranges.
 */
export const STUDIO_FX_PARAMS: Readonly<Record<string, readonly StudioFxParamDef[]>> = Object.freeze({
  smoke_screen: [param('durationS', 6, 60, 1, 24), param('density', 0.3, 1.6, 0.05, 1), param('count', 2, 12, 1, 6)],
  flare: [param('heightM', 20, 220, 5, 90), param('burnS', 6, 60, 1, 26), param('intensity', 0.2, 3, 0.05, 1),
    param('driftMps', 0, 6, 0.1, 1.4), param('fallMps', 0.5, 8, 0.1, 2.6)],
  embers: [param('radiusM', 0.5, 20, 0.5, 3), param('rate', 4, 160, 2, 30), param('durationS', 1, 60, 1, 10), param('rise', 0.5, 8, 0.1, 3)],
  debris: [param('count', 4, 80, 1, 24), param('speedMps', 4, 45, 1, 16), param('hot', 0, 1, 0.05, 0.5), param('scale', 0.4, 3, 0.05, 1)],
  shockwave: [param('radiusM', 4, 60, 1, 18), param('strength', 0.2, 2, 0.05, 1)],
  fire_field: [param('radiusM', 1, 20, 0.5, 5), param('durationS', 2, 60, 1, 20), param('intensity', 0.2, 2, 0.05, 1)],
  barrage: [param('count', 1, 12, 1, 5), param('radiusM', 2, 60, 1, 10), param('durationS', 0, 12, 0.1, 2.4)],
});

/** Clamped numeric parameter: authored value, else the schema default. */
export function fxParam(type: string, key: string, value: unknown): number {
  const def = STUDIO_FX_PARAMS[type]?.find((entry) => entry.key === key);
  if (!def) throw new RangeError(`Unknown Studio FX parameter ${type}.${key}`);
  const n = typeof value === 'number' && Number.isFinite(value) ? value : def.value;
  return Math.max(def.min, Math.min(def.max, n));
}

/** Signal / illumination flare colours. */
export const STUDIO_FLARE_COLORS: Readonly<Record<string, number>> = Object.freeze({
  white: 0xfff1d6, red: 0xff4a2a, green: 0x6dff7a, amber: 0xffb347,
});

export function flareColor(name: unknown): number {
  return typeof name === 'string' && Object.hasOwn(STUDIO_FLARE_COLORS, name)
    ? STUDIO_FLARE_COLORS[name] : STUDIO_FLARE_COLORS.white;
}
