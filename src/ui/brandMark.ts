/**
 * The Claude of Tanks mark (the owner's pick, 2026-10-24: "the commander"): the Claude Code commander in a tanker helmet,
 * standing in the open hatch of a low modern tank advancing to the right. The hatch's cupola stands on the turret roof
 * with its lid hinged at the rear rim, and the bustle is one form with the turret's rear (the owner's two fixes). The
 * full tank is the mark; the commander's bust is the icon where the tank is too small to read. Copyright © 2026
 * Kevin B. Liu (the tank, the helmet, the goggles, the cupola and the lid).
 *
 * The commander is the Claude Code mascot glyph (Anthropic; docs/ATTRIBUTION.md), drawn verbatim: only scaled and placed,
 * its legs hidden by the cupola. Every cut-out is a real hole (even-odd paths), so the mark sits on any ground; the ink
 * and the accent come from the host (currentColor and var(--accent) inline, set as style so var() resolves everywhere;
 * fixed colours in public/brand). This module
 * is the source of every mark: tools/brand-marks.mjs writes the masters and rasters, src/ui/brandMarkMotion.ts animates
 * the same groups.
 */
import { WORDMARK_OF, WORDMARK_VIEWBOX, WORDMARK_WORDS } from './brandWordmark.ts';

/** The Claude Code mascot glyph, verbatim (24 units wide, rows 5 to 20). */
export const COMMANDER_GLYPH = 'M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z';

/** The full mark's box (184 x 106: the pennant to the muzzle, the helmet to the track) and its width per unit height. */
export const BRAND_TANK_VIEWBOX = '30 34 184 106';
export const BRAND_TANK_ASPECT = 184 / 106;
/** The bust's box (62 x 46) and its width per unit height. */
export const BRAND_BUST_VIEWBOX = '1 10 62 46';
export const BRAND_BUST_ASPECT = 62 / 46;

/** The six road wheels along the track (their centres), shared with the motion. */
export const ROAD_WHEELS: readonly (readonly [x: number, y: number])[] = [56, 79, 102, 125, 148, 171].map((x) => [x, 128.5] as const);
const WHEEL_R = 5.4;

const circle = (cx: number, cy: number, r: number): string => `M${cx + r} ${cy}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0Z`;

/** The tank's parts, in its own units. */
const TRACK = `M50 119h126a9.5 9.5 0 0 1 0 19H50a9.5 9.5 0 0 1 0-19Z${ROAD_WHEELS.map(([x, y]) => circle(x, y, WHEEL_R)).join('')}`;
const HULL = 'M34 116.6 40 94h108l52 18-2.4 4.6Z';
const GUN = '<g transform="rotate(-10 140 82)"><rect x="136" y="76" width="18" height="12" rx="1.5"/><rect x="154" y="78.3" width="52" height="7.4"/>'
  + '<rect x="168" y="76.4" width="16" height="11.2" rx="4.4"/><rect x="203" y="77.3" width="7" height="9.4" rx="1"/></g>';
/** The hatch lid, open: hinged on the cupola's rear rim and standing up behind the commander. */
const LID = 'M77.6 68.9 71.4 53.4a1.6 1.6 0 0 1 .9-2.1l2.6-1a1.6 1.6 0 0 1 2.1.9l6.3 15.6Z';
const HINGE = '<rect x="74.6" y="65.6" width="8.4" height="4" rx="1.2"/>';
const ANTENNA = 'M64 76 56 41';
const PENNANT = 'M56 38.5 41 43l15 4.5Z';
/** The turret and its bustle as one form (the bustle overhangs the rear deck), and the cupola sunk into its roof: its front
 *  foot reaches below the roof's slope (owner, 2026-10-24: the hatch sat a hair above the roof at the front). */
const TURRET = 'M151.4 92.6 140 77.5 82 74 61.5 72.8 58 76.5V88l4.5 3.5H73l1.5 1.1Z';
const CUPOLA = 'M77.5 75.5 80 68.2h53l3.1 10Z';
const HELMET = 'M87.5 52.5a18.5 12 0 0 1 37 0ZM94 45.2h24.5v5.2H94Z';
const HELMET_RIM = '<rect x="85.5" y="52.3" width="41" height="4.2" rx="2.1"/>';
const LENSES = '<circle cx="102.5" cy="47.8" r="2.9"/><circle cx="111" cy="47.8" r="2.9"/>';
const COMMANDER_PLACE = 'translate(82.65 42.75) scale(1.95)';

interface MarkInk {
  /** The tank, the helmet and the cupola. */
  readonly ink: string;
  /** The commander and the pennant (the ink again for a one-colour mark). */
  readonly accent: string;
  /** A one-colour mark keys the commander out of the parts in front of it (the ground shows between them). */
  readonly keyline?: boolean;
  /** Ids for the one-colour key mask, unique per document. */
  readonly id?: string;
}

/**
 * The full mark's drawing (inside an svg whose viewBox is BRAND_TANK_VIEWBOX), in groups the motion moves: the running
 * gear (.mk-run, its wheels .mk-wheel), the hull (.mk-hull) carrying the turret (.mk-turret), which carries the antenna
 * (.mk-antenna) and the crew (.mk-crew: the commander and the helmet), and the exhaust's anchor (.mk-exhaust).
 */
export function brandTankBody({ ink, accent, keyline = false, id = 'cot-mk' }: MarkInk): string {
  const front = `<path d="${TURRET}"/><path d="${CUPOLA}"/>`;
  const key = keyline
    ? `<mask id="${id}-key" maskUnits="userSpaceOnUse" x="30" y="34" width="184" height="106"><rect x="30" y="34" width="184" height="106" fill="#fff"/>`
      + `<g fill="#000" stroke="#000" stroke-width="2.4">${front}<path d="${HELMET}"/>${HELMET_RIM}</g></mask>`
    : '';
  const commander = `<path fill-rule="evenodd" d="${COMMANDER_GLYPH}" transform="${COMMANDER_PLACE}"${keyline ? ` mask="url(#${id}-key)"` : ''}/>`;
  return `${key}<g class="mk-run" fill="${ink}"><path fill-rule="evenodd" d="${TRACK}"/></g>`
    + `<g class="mk-hull"><g class="mk-exhaust"></g><path fill="${ink}" d="${HULL}"/>`
    + `<g class="mk-turret"><g fill="${ink}">${GUN}<path d="${LID}"/>${HINGE}</g>`
    + `<g class="mk-antenna"><path d="${ANTENNA}" fill="none" stroke="${ink}" stroke-width="1.6"/><path style="fill:${accent}" d="${PENNANT}"/></g>`
    + `<g class="mk-crew"><g style="fill:${accent}">${commander}</g><g fill="${ink}"><path fill-rule="evenodd" d="${HELMET}"/>${HELMET_RIM}</g>`
    + `<g fill="none" stroke="${ink}" stroke-width="1.3">${LENSES}</g></g>`
    + `<g fill="${ink}">${front}</g></g></g>`;
}

/** The mark's drawing in the parts the living mark moves, each an svg body for BRAND_TANK_VIEWBOX: the track, the hull,
 *  the turret's gun and hatch lid, the antenna and pennant, the crew (the commander, the helmet and the goggles) and the
 *  turret and cupola in front of them. src/ui/brandMarkMotion.ts stacks each in its own layer so the compositor moves it. */
export function brandTankLayers({ ink, accent }: MarkInk): Record<'run' | 'hull' | 'gear' | 'antenna' | 'crew' | 'front', string> {
  return {
    run: `<path fill="${ink}" fill-rule="evenodd" d="${TRACK}"/>`,
    hull: `<path fill="${ink}" d="${HULL}"/>`,
    gear: `<g fill="${ink}">${GUN}<path d="${LID}"/>${HINGE}</g>`,
    antenna: `<path d="${ANTENNA}" fill="none" stroke="${ink}" stroke-width="1.6"/><path style="fill:${accent}" d="${PENNANT}"/>`,
    crew: `<path style="fill:${accent}" fill-rule="evenodd" d="${COMMANDER_GLYPH}" transform="${COMMANDER_PLACE}"/>`
      + `<g fill="${ink}"><path fill-rule="evenodd" d="${HELMET}"/>${HELMET_RIM}</g><g fill="none" stroke="${ink}" stroke-width="1.3">${LENSES}</g>`,
    front: `<g fill="${ink}"><path d="${TURRET}"/><path d="${CUPOLA}"/></g>`,
  };
}

/** The commander's bust (inside an svg whose viewBox is BRAND_BUST_VIEWBOX): helmet and goggles, arms on the cupola. */
export function brandBustBody({ ink, accent, keyline = false, id = 'cot-bk' }: MarkInk): string {
  const cupola = 'M6 44.6h52l3 10.4H3Z';
  const helmet = 'M15 25a17 8 0 0 1 34 0ZM23 19.2h18v3.6H23Z';
  const rim = '<rect x="12" y="24" width="40" height="3.6" rx="1.8"/>';
  const key = keyline
    ? `<mask id="${id}-key" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/>`
      + `<g fill="#000" stroke="#000" stroke-width="1.6"><path d="${cupola}"/><path d="${helmet}"/>${rim}</g></mask>`
    : '';
  return `${key}<path style="fill:${accent}" fill-rule="evenodd" d="${COMMANDER_GLYPH}" transform="translate(8 14) scale(2)"${keyline ? ` mask="url(#${id}-key)"` : ''}/>`
    + `<g fill="${ink}"><path d="${cupola}"/><path fill-rule="evenodd" d="${helmet}"/>${rim}</g>`
    + `<g fill="none" stroke="${ink}" stroke-width="1"><circle cx="28" cy="21" r="2.1"/><circle cx="36" cy="21" r="2.1"/></g>`;
}

/**
 * The wordmark, CLAUDE —of— TANKS, as the outlined master (src/ui/brandWordmark.ts, SPEC 3.1: never live text): the
 * words take the surrounding ink, the "of" and its rules the accent. Its host names the game; the drawing is decorative.
 */
export const BRAND_WORDMARK_HTML = `<svg class="wm" viewBox="${WORDMARK_VIEWBOX}" aria-hidden="true" focusable="false">`
  + `<path fill="currentColor" d="${WORDMARK_WORDS}"/><path style="fill:var(--accent)" d="${WORDMARK_OF}"/></svg>`;

/** A path's contours (split at each M) with their boxes; the wordmark's paths use M, L, H, V and their relative h and v,
 *  with implicit lineto pairs after M. */
function contours(path: string): { d: string; x0: number; y0: number; x1: number; y1: number }[] {
  return path.split(/(?=M)/).filter(Boolean).map((d) => {
    const xs: number[] = [], ys: number[] = [];
    let x = 0, y = 0;
    for (const [, command, args] of d.matchAll(/([MLHVZhvz])([^MLHVZhvz]*)/g)) {
      const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      if (command === 'M' || command === 'L') for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; xs.push(x); ys.push(y); }
      else if (command === 'H' || command === 'h') for (const v of n) { x = command === 'H' ? v : x + v; xs.push(x); ys.push(y); }
      else if (command === 'V' || command === 'v') for (const v of n) { y = command === 'V' ? v : y + v; xs.push(x); ys.push(y); }
    }
    return { d, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  });
}

/** The boot lockup's stack beside the tank, in the mark's units: level with the tank's drawing from the helmet's top to
 *  the track's foot, `gap` to its right. tools/brand-marks.mjs draws lockup-boot.svg with it and tools/sync-brand-marks.mjs
 *  sizes the boot card's stack from it. */
export const BRAND_BOOT_STACK = { top: 40.5, height: 97.5, gap: 14 } as const;

/** The boot card's word stack (owner, 2026-10-26: "tank onn left and then claude, then of, than tanks left aligned, to the
 *  right of the tannk logo"; the one exception to the one-line name): CLAUDE, OF and TANKS on three lines, their left
 *  edges on one line, the wordmark's own outlines. OF keeps the accent and its rule, which runs on to CLAUDE's right edge.
 *  Its viewBox is the stack's ink, so the host sizes it by height. */
export function brandWordmarkStack(ink = 'currentColor', accent = 'var(--accent)'): string {
  const [, top, , cap] = WORDMARK_VIEWBOX.split(' ').map(Number);
  const marks = contours(WORDMARK_OF);
  const rules = marks.filter((part) => part.y1 - part.y0 < cap * 0.2);
  const letters = marks.filter((part) => !rules.includes(part));
  const ofX0 = Math.min(...letters.map((part) => part.x0)), ofX1 = Math.max(...letters.map((part) => part.x1));
  const ofY0 = Math.min(...letters.map((part) => part.y0)), ofY1 = Math.max(...letters.map((part) => part.y1));
  const words = contours(WORDMARK_WORDS);
  const claude = words.filter((part) => part.x1 < ofX0), tanks = words.filter((part) => part.x0 > ofX1);
  const left = (parts: typeof words): number => Math.min(...parts.map((part) => part.x0));
  const right = (parts: typeof words): number => Math.max(...parts.map((part) => part.x1));
  const width = Math.max(right(claude) - left(claude), right(tanks) - left(tanks));
  const gap = cap * 0.3, ofH = ofY1 - ofY0;
  const ofTop = cap + gap, tanksTop = ofTop + ofH + gap;
  const rule = rules[0];
  const ruleX = ofX1 - ofX0 + (rules[1] ? rules[1].x0 - ofX1 : cap * 0.2);
  const ruleY = ofTop + (rule.y0 - ofY0);
  const group = (parts: typeof words, dx: number, dy: number, fill: string): string =>
    `<path transform="translate(${(-dx).toFixed(1)} ${dy.toFixed(1)})" style="fill:${fill}" d="${parts.map((part) => part.d).join('')}"/>`;
  const height = tanksTop + cap;
  return `<svg class="wm-stack" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}" aria-hidden="true" focusable="false">`
    + group(claude, left(claude), -top, ink)
    + group(letters, ofX0, ofTop - ofY0, accent)
    + `<rect style="fill:${accent}" x="${ruleX.toFixed(1)}" y="${ruleY.toFixed(1)}" width="${(width - ruleX).toFixed(1)}" height="${(rule.y1 - rule.y0).toFixed(1)}"/>`
    + group(tanks, left(tanks), tanksTop - top, ink) + '</svg>';
}

/** The mark for a bar or a card, `height` px tall (its width follows): the tank in the host's ink, the commander in the accent. */
export function brandMarkSVG(height: number): string {
  return `<svg class="cot-mark" viewBox="${BRAND_TANK_VIEWBOX}" width="${Math.round(height * BRAND_TANK_ASPECT)}" height="${height}" `
    + `aria-hidden="true" focusable="false">${brandTankBody({ ink: 'currentColor', accent: 'var(--accent)' })}</svg>`;
}

/** The bust, `size` px tall, for a square slot (a tab, a badge). */
export function brandBustSVG(size: number): string {
  return `<svg class="cot-mark cot-mark--bust" viewBox="${BRAND_BUST_VIEWBOX}" width="${Math.round(size * BRAND_BUST_ASPECT)}" height="${size}" `
    + `aria-hidden="true" focusable="false">${brandBustBody({ ink: 'currentColor', accent: 'var(--accent)' })}</svg>`;
}
