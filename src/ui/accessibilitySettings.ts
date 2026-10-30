/**
 * accessibilitySettings.ts — the player's accessibility record and its changes (brand-ui SPEC 4.6, 4.7, 9, 12.1.6, 14;
 * PLAN BUI-F9). Copyright © 2026 Kevin B. Liu.
 *
 * One record, cot.accessibility.v1 (kept like hudPreferences): text size, HUD scale, colour preset (Custom with its own
 * and enemy colours), high contrast, Reduce motion, camera shake, flash intensity, drone static and the hold actions set
 * to toggle. A change is merged, normalised, stored, written on :root (exactly what the game document's head seed writes
 * at boot), read into the live state (accessibilityPreferences.ts readAccessibilityRoot) and announced
 * ('cot:accessibility' on window). The Custom colours change only through setCustomTeamColours(), which stores a pair only
 * when colorVision.ts accepts it (SPEC 4.6: Custom refuses pairs under the floors); a stored pair that fails (written by
 * hand, or by an older build) is put back to the defaults at start (recheckCustomTeamColours). The settings panel loads
 * this with itself; the boot carries only the reader.
 */
import { readAccessibilityRoot } from './accessibilityPreferences.ts';
import { checkCustomTeamColours, type CustomTeamCheck } from './colorVision.ts';

export const ACCESSIBILITY_KEY = 'cot.accessibility.v1';
/** Dispatched on window (detail: the applied preferences) whenever they change. */
export const ACCESSIBILITY_EVENT = 'cot:accessibility';
export const COLOR_PRESETS = ['default', 'deutan', 'protan', 'tritan', 'classic', 'custom'] as const;
export const MOTION_MODES = ['system', 'reduce', 'full'] as const;
/** Every action a player holds: each can be switched to press-to-toggle; rosters is the HUD's Tab key. Item 259 (one
 *  datum, one place): the RMB action's hold or toggle is its Right click mode on Settings › Controls (settings.rmbMode),
 *  so it is not one of these; Accessibility links to it. */
export const HOLD_ACTIONS = ['fire', 'handbrake', 'freeLook', 'rosters'] as const;
/** The numeric choices and their ranges: text size 80-200 %, HUD scale 75-150 % (SPEC 12.1.6), camera shake and flash
 *  intensity 0-100 %. The caption renderer (the HUD packages) adds the caption choices beside them. */
export const RANGES = {
  textScale: [0.8, 2],
  hudScale: [0.75, 1.5],
  shake: [0, 1],
  flash: [0, 1],
} as const;

export type ColorPreset = typeof COLOR_PRESETS[number];
export type MotionMode = typeof MOTION_MODES[number];
export type HoldAction = typeof HOLD_ACTIONS[number];

interface AccessibilityPreferences {
  readonly textScale: number;
  readonly hudScale: number;
  readonly colorPreset: ColorPreset;
  readonly customOwn: string;
  readonly customEnemy: string;
  readonly highContrast: boolean;
  readonly motion: MotionMode;
  readonly shake: number;
  readonly flash: number;
  readonly droneStatic: boolean;
  readonly toggles: readonly HoldAction[];
}

/** What saveAccessibility() may change; the Custom colours change only through setCustomTeamColours(). */
export type AccessibilityChange = Partial<Omit<AccessibilityPreferences, 'customOwn' | 'customEnemy'>>;

export const DEFAULT_ACCESSIBILITY: AccessibilityPreferences = Object.freeze({
  textScale: 1,
  hudScale: 1,
  colorPreset: 'default',
  // the default team colours (--team-own sky-400, --team-enemy vermilion-400) until the player picks a pair
  customOwn: '#57b8ff',
  customEnemy: '#ff5a4e',
  highContrast: false,
  motion: 'system',
  shake: 1,
  flash: 1,
  droneStatic: true,
  toggles: Object.freeze([]) as readonly HoldAction[],
});

const HEX = /^#[0-9a-f]{6}$/i;

/** Any stored value as a complete, valid record (unknown keys dropped, numbers clamped, enums and colours checked). */
export function normalizeAccessibility(value: unknown): AccessibilityPreferences {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_ACCESSIBILITY };
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    const n = v[key];
    if (typeof n === 'number' && Number.isFinite(n)) out[key] = Math.min(hi, Math.max(lo, n));
  }
  for (const key of ['customOwn', 'customEnemy']) {
    const colour = v[key];
    if (typeof colour === 'string' && HEX.test(colour)) out[key] = colour.toLowerCase();
  }
  if (COLOR_PRESETS.includes(v.colorPreset as ColorPreset)) out.colorPreset = v.colorPreset;
  if (MOTION_MODES.includes(v.motion as MotionMode)) out.motion = v.motion;
  out.highContrast = v.highContrast === true;
  out.droneStatic = v.droneStatic !== false;
  out.toggles = Object.freeze(Array.isArray(v.toggles) ? HOLD_ACTIONS.filter((a) => (v.toggles as unknown[]).includes(a)) : []);
  return Object.freeze(out) as unknown as AccessibilityPreferences;
}

/** The page's localStorage, or null where it is unavailable (private modes, sandboxed frames, Node). */
function storage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** The stored record, or the defaults (no storage, nothing stored, or unreadable JSON). */
export function readAccessibility(store: Storage | null = storage()): AccessibilityPreferences {
  try { return normalizeAccessibility(JSON.parse(store?.getItem(ACCESSIBILITY_KEY) || 'null')); }
  catch { return normalizeAccessibility(null); }
}

let current: AccessibilityPreferences | null = null;

/** The record in force (read from storage on first use). */
export function accessibilityPreferences(): AccessibilityPreferences {
  return current ?? (current = readAccessibility());
}

type Root = Pick<HTMLElement, 'dataset' | 'style'>;

function setData(root: Root, key: string, value: string | null): void {
  if (value === null) delete root.dataset[key];
  else if (root.dataset[key] !== value) root.dataset[key] = value;
}

function setVar(root: Root, name: string, value: number | string | null): void {
  if (value === null || value === 1) root.style.removeProperty(name);
  else root.style.setProperty(name, String(value));
}

let motionTouched = false;

/**
 * Write the record on :root (exactly what the head seed in index.html writes at boot, pinned by the selftest), read it
 * into the live state and the token selection, and bring the document's reduced-motion rules to the motion choice.
 */
export function applyAccessibility(prefs: AccessibilityPreferences, root: Root | null = globalThis.document?.documentElement ?? null): void {
  current = prefs;
  const custom = prefs.colorPreset === 'custom';
  if (root) {
    setData(root, 'cvd', prefs.colorPreset === 'default' ? null : prefs.colorPreset);
    setData(root, 'contrast', prefs.highContrast ? 'high' : null);
    setData(root, 'motion', prefs.motion === 'system' ? null : prefs.motion);
    setData(root, 'droneStatic', prefs.droneStatic ? null : 'off');
    setData(root, 'toggles', prefs.toggles.length ? prefs.toggles.join(' ') : null);
    setVar(root, '--team-own', custom ? prefs.customOwn : null);
    setVar(root, '--team-enemy', custom ? prefs.customEnemy : null);
    setVar(root, '--cot-user-text', prefs.textScale);
    setVar(root, '--cot-user-hud', prefs.hudScale);
    setVar(root, '--cot-shake-scale', prefs.shake);
    setVar(root, '--cot-flash-scale', prefs.flash);
    readAccessibilityRoot(root);
  }
  // System with nothing overridden is the document as authored; any choice (or a return from one) syncs every rule.
  if (prefs.motion !== 'system' || motionTouched) {
    motionTouched = true;
    // (a chunk the network dropped keeps the motion rules the page has; the next change of the setting loads them again)
    void import('./accessibilityMotion.ts').then((m) => m.syncMotionRules(globalThis.document)).catch(() => { motionTouched = false; });
  }
}

function commit(prefs: AccessibilityPreferences, store: Storage | null): boolean {
  try { store?.setItem(ACCESSIBILITY_KEY, JSON.stringify(prefs)); } catch { return false; }
  applyAccessibility(prefs);
  globalThis.dispatchEvent?.(new CustomEvent(ACCESSIBILITY_EVENT, { detail: prefs }));
  return true;
}

/** Merge a change into the preferences, persist and apply it. False (nothing applied) when storage refuses. */
export function saveAccessibility(change: AccessibilityChange, store: Storage | null = storage()): boolean {
  const { customOwn: _own, customEnemy: _enemy, ...allowed } = change as Partial<AccessibilityPreferences>;
  return commit(normalizeAccessibility({ ...accessibilityPreferences(), ...allowed }), store);
}

/** Check a Custom own/enemy pair and, only when it passes every floor, store it and select Custom. */
export function setCustomTeamColours(own: string, enemy: string, store: Storage | null = storage()): CustomTeamCheck {
  const check = checkCustomTeamColours(own, enemy);
  if (check.ok) commit(normalizeAccessibility({ ...accessibilityPreferences(), colorPreset: 'custom', customOwn: own, customEnemy: enemy }), store);
  return check;
}

/** Check the stored Custom pair again (the head seed applied it unchecked); a refused one returns to the defaults. */
export function recheckCustomTeamColours(store: Storage | null = storage()): boolean {
  const stored = readAccessibility(store);
  if (stored.colorPreset !== 'custom' || checkCustomTeamColours(stored.customOwn, stored.customEnemy).ok) return true;
  commit(normalizeAccessibility({ ...stored, colorPreset: 'default', customOwn: null, customEnemy: null }), store);
  return false;
}
