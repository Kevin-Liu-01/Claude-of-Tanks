/**
 * colorVision.ts — the colour checks a player's Custom team colours must pass (brand-ui SPEC 4.4, 4.5, 4.6; PLAN BUI-F9).
 * Copyright © 2026 Kevin B. Liu.
 *
 * SPEC 4.6 Custom: own and enemy pickers with a live check that refuses a pair under the floors. The maths is the token
 * receipt's (tools/gen-tokens.mjs, pinned against it by colorVision.selftest.mjs): WCAG 2.x contrast, Machado, Oliveira
 * and Fernandes 2009 colour-vision simulation at full severity in linear-light sRGB, and CIE76 ΔE in CIELAB (D65).
 * A pair passes only when, in the normal view and simulated deuteranopia, protanopia and tritanopia:
 *  - own and enemy stay ΔE 40 apart, enemy and squad 25, own and squad 12 (the SPEC 4.5 table's floors);
 *  - each stays ΔE 12 from the objective neutral and the accent (the shape-coded pairs, tokens.json preset.cvd);
 *  - and each reads as text at 4.5:1 on the page, raised and menu surfaces and on the HUD plate over white (SPEC 4.4).
 * Loaded only where a player edits the colours (the Accessibility settings) or a stored Custom pair is re-checked.
 */
import { TOKENS } from './tokens/tokens.ts';

type Rgb = readonly [number, number, number];
type VisionView = 'normal' | 'deutan' | 'protan' | 'tritan';
export const VISION_VIEWS: readonly VisionView[] = Object.freeze(['normal', 'deutan', 'protan', 'tritan']);

/** The floors a Custom pair must hold (SPEC 4.4 and 4.5). */
export const CUSTOM_TEAM_FLOORS = Object.freeze({
  ownEnemy: 40,
  enemySquad: 25,
  ownSquad: 12,
  shape: 12,
  text: 4.5,
});

const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unit = (x: number): number => Math.min(1, Math.max(0, x));

const MACHADO: Readonly<Record<Exclude<VisionView, 'normal'>, readonly Rgb[]>> = Object.freeze({
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
});

/** "#rrggbb" to [r, g, b] (0-255), or null for anything else. */
export function parseHex(hex: unknown): Rgb | null {
  const m = typeof hex === 'string' ? /^#([0-9a-f]{6})$/i.exec(hex) : null;
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "rgba(r,g,b,a)" or "#rrggbb" (a token's resolved value) to [r, g, b, a]. */
function parseColour(text: string): readonly [number, number, number, number] {
  const hex = parseHex(text);
  if (hex) return [hex[0], hex[1], hex[2], 1];
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(text.replace(/\s+/g, ''));
  if (!m) throw new Error(`colorVision: not a colour: ${text}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/** Source-over composite of a translucent colour on an opaque background, in 8-bit sRGB. */
function composite(colour: readonly [number, number, number, number], bg: Rgb): Rgb {
  const a = colour[3];
  return [0, 1, 2].map((i) => Math.round(colour[i] * a + bg[i] * (1 - a))) as unknown as Rgb;
}

/** WCAG 2.x relative luminance. */
export function luminance(rgb: Rgb): number {
  return 0.2126 * linear(rgb[0] / 255) + 0.7152 * linear(rgb[1] / 255) + 0.0722 * linear(rgb[2] / 255);
}

/** WCAG 2.x contrast ratio of two opaque colours. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function labIn(view: VisionView, rgb: Rgb): Rgb {
  let lin = [linear(rgb[0] / 255), linear(rgb[1] / 255), linear(rgb[2] / 255)];
  if (view !== 'normal') {
    const m = MACHADO[view];
    lin = m.map((row) => unit(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
  }
  const [r, g, b] = lin;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 ΔE between two colours as one vision view sees them. */
export function deltaE(view: VisionView, a: Rgb, b: Rgb): number {
  const p = labIn(view, a);
  const q = labIn(view, b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** CIEDE2000 ΔE between two colours as one vision view sees them (the stricter read of a near pair: item 259's
 *  Settings colours hold both). */
export function deltaE2000(view: VisionView, a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = labIn(view, a);
  const [l2, a2, b2] = labIn(view, b);
  const rad = Math.PI / 180;
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1, ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1), cp2 = Math.hypot(ap2, b2);
  const hue = (bb: number, ap: number): number => { const h = Math.atan2(bb, ap) / rad; return h < 0 ? h + 360 : h; };
  const hp1 = cp1 === 0 ? 0 : hue(b1, ap1), hp2 = cp2 === 0 ? 0 : hue(b2, ap2);
  const dL = l2 - l1, dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) dh = hp2 - hp1 > 180 ? hp2 - hp1 - 360 : hp2 - hp1 < -180 ? hp2 - hp1 + 360 : hp2 - hp1;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * rad);
  const lBar = (l1 + l2) / 2, cpBar = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (cp1 * cp2 !== 0) hBar = Math.abs(hp1 - hp2) > 180 ? (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2 : (hp1 + hp2) / 2;
  const t = 1 - 0.17 * Math.cos((hBar - 30) * rad) + 0.24 * Math.cos(2 * hBar * rad) + 0.32 * Math.cos((3 * hBar + 6) * rad)
    - 0.2 * Math.cos((4 * hBar - 63) * rad);
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cpBar, sh = 1 + 0.015 * cpBar * t;
  const rt = -2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hBar - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

interface ColourFailure {
  /** What failed: a ΔE pair ("own~enemy") or a text check ("own on surface-page"). */
  readonly check: string;
  /** The vision view of a ΔE pair, or "text". */
  readonly view: VisionView | 'text';
  readonly value: number;
  readonly floor: number;
}

export interface CustomTeamCheck {
  readonly ok: boolean;
  /** Every failed floor, worst margin first. Empty when the pair passes. */
  readonly failures: readonly ColourFailure[];
}

const WHITE: Rgb = [255, 255, 255];
const reference = (name: keyof typeof TOKENS): Rgb => {
  const c = parseColour(TOKENS[name]);
  return [c[0], c[1], c[2]];
};

/** Check a Custom own/enemy pair against every floor. A colour that is not "#rrggbb" fails outright. */
export function checkCustomTeamColours(own: unknown, enemy: unknown): CustomTeamCheck {
  const a = parseHex(own);
  const b = parseHex(enemy);
  if (!a || !b) {
    return { ok: false, failures: [{ check: a ? 'enemy colour' : 'own colour', view: 'text', value: 0, floor: CUSTOM_TEAM_FLOORS.text }] };
  }
  const squad = reference('team-squad');
  const neutral = reference('team-neutral');
  const accent = reference('accent');
  const failures: ColourFailure[] = [];
  const pairs: ReadonlyArray<readonly [string, Rgb, Rgb, number]> = [
    ['own~enemy', a, b, CUSTOM_TEAM_FLOORS.ownEnemy],
    ['enemy~squad', b, squad, CUSTOM_TEAM_FLOORS.enemySquad],
    ['own~squad', a, squad, CUSTOM_TEAM_FLOORS.ownSquad],
    ['own~neutral', a, neutral, CUSTOM_TEAM_FLOORS.shape],
    ['enemy~neutral', b, neutral, CUSTOM_TEAM_FLOORS.shape],
    ['own~accent', a, accent, CUSTOM_TEAM_FLOORS.shape],
    ['enemy~accent', b, accent, CUSTOM_TEAM_FLOORS.shape],
  ];
  for (const [check, x, y, floor] of pairs) {
    for (const view of VISION_VIEWS) {
      const value = deltaE(view, x, y);
      if (value < floor) failures.push({ check, view, value, floor });
    }
  }
  const grounds: ReadonlyArray<readonly [string, Rgb]> = [
    ['surface-page', reference('surface-page')],
    ['surface-raised', reference('surface-raised')],
    ['surface-menu', reference('surface-menu')],
    ['hud-plate over white', composite(parseColour(TOKENS['hud-plate']), WHITE)],
  ];
  for (const [side, colour] of [['own', a], ['enemy', b]] as const) {
    for (const [ground, bg] of grounds) {
      const value = contrastRatio(colour, bg);
      if (value < CUSTOM_TEAM_FLOORS.text) failures.push({ check: `${side} on ${ground}`, view: 'text', value, floor: CUSTOM_TEAM_FLOORS.text });
    }
  }
  failures.sort((x, y) => x.value / x.floor - y.value / y.floor);
  return { ok: failures.length === 0, failures };
}
