/**
 * accessibilityPreferences.ts — the player's accessibility choices in force (brand-ui SPEC 4.6, 4.7, 9, 12.1.6, 14; PLAN
 * BUI-F9). Copyright © 2026 Kevin B. Liu.
 *
 * The choices live in one record (cot.accessibility.v1; accessibilitySettings.ts owns it) and are written on :root, which
 * is their single runtime source: the game document's head seed writes it before first paint (index.html) and
 * accessibilitySettings.ts applyAccessibility() after any change, identically (the selftest pins the two together).
 *  - Text size and HUD scale: --cot-user-text and --cot-user-hud, which the type tokens multiply (--cot-type-scale =
 *    --cot-ui-scale x text, written by responsiveLayout.ts; --cot-hud-scale = --cot-hud-fit x HUD, the fit written here
 *    from the viewport responsiveLayout.ts measures, so the public pages' shared boot code is unchanged).
 *  - Colour preset and high contrast: data-cvd and data-contrast, the Custom team colours as inline --team-own and
 *    --team-enemy; this module gives tokens.ts the same selection (setActiveTokens) for canvas and three.js.
 *  - Reduce motion: data-motion (reduce or full; none follows the OS), and every prefers-reduced-motion rule turned to
 *    match (accessibilityMotion.ts, loaded only once a player has chosen); prefersReducedMotion() for script.
 *  - Camera shake and flash intensity: --cot-shake-scale and --cot-flash-scale (CSS flashes read the latter); drone
 *    static: data-drone-static=off; hold or toggle: data-toggles (the toggled hold actions).
 * This boot reader turns :root into A11Y, the live state the camera rig, the FX, the sky, the HUD, the kill cam and the
 * input layer read every frame, and keeps it in step with the OS motion setting. It is the whole boot cost of the
 * accessibility core (at most 1 KB brotli, PLAN BUI-F9); everything that writes is lazy.
 */
import { setActiveTokens } from './tokens/tokenSelection.ts';

/** Live state for per-frame readers (no allocation): shake and flash scales 0-1, reduced motion, toggled hold actions. */
export const A11Y = {
  shake: 1,
  flash: 1,
  reduceMotion: false,
  toggles: new Set<string>() as ReadonlySet<string>,
};

/**
 * Whether motion is reduced: the player's choice on :root (data-motion reduce or full), or the OS while they follow it
 * (SPEC 9: overrides the OS both ways). The modal and the fleet takes, which the public pages also load, apply the same
 * rule inline so they never carry this module.
 */
export function prefersReducedMotion(root: { readonly dataset?: DOMStringMap } | null | undefined = globalThis.document?.documentElement): boolean {
  const choice = root?.dataset?.motion;
  if (choice === 'reduce' || choice === 'full') return choice === 'reduce';
  return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

type Root = Pick<HTMLElement, 'dataset' | 'style'>;
type PresetSelection = Parameters<typeof setActiveTokens>[0];
const scale = (root: Root, name: string): number => {
  const value = parseFloat(root.style.getPropertyValue(name));
  return Number.isFinite(value) ? value : 1;
};

/**
 * The HUD's resolution fit (SPEC 4.7): the viewport's short side over 1080, clamped to 0.85-2.0, so the HUD keeps its 1080p
 * proportions at 1440p and 4K instead of shrinking to islands. --cot-hud-scale is this times the player's HUD scale.
 */
export function hudFitFor(width: number, height: number): number {
  const short = Math.min(width, height);
  return Math.min(2, Math.max(0.85, Number.isFinite(short) && short > 0 ? short / 1080 : 1));
}

/** Write --cot-hud-fit from the viewport size responsiveLayout.ts keeps on :root (--cot-viewport-width/-height). */
function writeHudFit(root: Root): void {
  const px = (name: string): number => parseFloat(root.style.getPropertyValue(name));
  root.style.setProperty('--cot-hud-fit', hudFitFor(px('--cot-viewport-width'), px('--cot-viewport-height')).toFixed(4));
}

/** Read :root into the live state and the token selection (after the head seed, and after every applied change). */
export function readAccessibilityRoot(root: Root | null = globalThis.document?.documentElement ?? null): void {
  if (!root) return;
  const data = root.dataset;
  const custom = data.cvd === 'custom';
  A11Y.shake = scale(root, '--cot-shake-scale');
  A11Y.flash = scale(root, '--cot-flash-scale');
  A11Y.toggles = new Set((data.toggles ?? '').split(' ').filter(Boolean));
  A11Y.reduceMotion = prefersReducedMotion(root);
  setActiveTokens({
    cvd: custom ? undefined : data.cvd,
    contrast: data.contrast,
    motion: A11Y.reduceMotion ? 'reduce' : undefined,
  } as PresetSelection, custom ? {
    'team-own': root.style.getPropertyValue('--team-own').trim(),
    'team-enemy': root.style.getPropertyValue('--team-enemy').trim(),
  } : {});
}

/** Put the seeded choices in force, keep the HUD fit and the OS motion setting live; a player's choices load their helpers. */
export function installAccessibility(): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  readAccessibilityRoot(root);
  writeHudFit(root);
  globalThis.addEventListener?.('cot:layoutchange', () => writeHudFit(root));
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => readAccessibilityRoot(root));
  if (root.dataset.motion) void import('./accessibilityMotion.ts').then((m) => m.syncMotionRules(globalThis.document)).catch(() => {});
  // A stored Custom pair is checked again (the head seed applied it unchecked); a refused one returns to the defaults.
  // (both are refinements of the head seed's state: a chunk the network dropped leaves that state, never an unhandled rejection)
  if (root.dataset.cvd === 'custom') void import('./accessibilitySettings.ts').then((m) => m.recheckCustomTeamColours()).catch(() => {});
}
