// Shared reader and drawing rules for the UI icon sprite (src/ui/icons/sprite.svg, brand-ui SPEC section 7).
// Used by tools/gen-icon-sprite.mjs (boot slice + id types), tools/icon-stroke-census.mjs (the receipt) and
// tools/icon-sheet.mjs (the CPU review sheet). Node-only; no DOM. Copyright © 2026 Kevin B. Liu.
import { readFileSync } from 'node:fs';

/** Every 24-unit master draws on this grid; a 16-unit optical master (id suffix SMALL_SUFFIX) on GRID_SMALL. */
export const GRID = 24;
export const GRID_SMALL = 16;
export const SMALL_SUFFIX = '-s';
/** The one stroke per optical size (SPEC 7: 1.5 at 24 px, 1.25 at 16 px). The host <svg> carries it; no glyph does. */
export const STROKE = 1.5;
export const STROKE_SMALL = 1.25;
export const ID_PREFIX = 'i-';

/** Glyphs drawn to take the filled active state (closed bodies, evenodd knock-outs): navigation and the 13 modes. */
export const ACTIVE_ICON_IDS = new Set([
  'play', 'home', 'garage', 'deploy', 'gallery', 'manual', 'studio', 'media', 'record', 'settings',
  'modeStandard', 'modeFlag', 'modeZones', 'modeFrontline', 'modeTurbo', 'modeHorde', 'modeMars', 'modeJuggernaut',
  'modeInfected', 'modeRealistic', 'modeGunGame', 'modeDrone', 'modeAc130', 'modeProving',
]);

/** Attributes a glyph element may carry. Stroke width, caps, joins and colour come from the host, never the glyph. */
export const ALLOWED_ATTRIBUTES = new Set([
  'd', 'cx', 'cy', 'r', 'fill', 'fill-rule', 'stroke', 'stroke-dasharray', 'style',
]);
export const ALLOWED_ELEMENTS = new Set(['path', 'circle']);

/** The sprite as parsed from this checkout (receipts read glyphs through it). */
export function readIconSprite() {
  return parseIconSprite(readFileSync(new URL('../src/ui/icons/sprite.svg', import.meta.url), 'utf8'));
}

const SYMBOL = /<symbol id="([^"]+)">([\s\S]*?)<\/symbol>/g;

/**
 * Parse the sprite into its 24-unit masters (`large`) and 16-unit optical masters (`small`), both keyed by the
 * public icon id (no prefix, no suffix), in file order.
 */
export function parseIconSprite(text) {
  const large = new Map();
  const small = new Map();
  const duplicates = [];
  for (const match of text.matchAll(SYMBOL)) {
    const raw = match[1];
    if (!raw.startsWith(ID_PREFIX)) throw new Error(`icon sprite: symbol id "${raw}" lacks the "${ID_PREFIX}" prefix`);
    const bare = raw.slice(ID_PREFIX.length);
    const isSmall = bare.endsWith(SMALL_SUFFIX);
    const id = isSmall ? bare.slice(0, -SMALL_SUFFIX.length) : bare;
    const target = isSmall ? small : large;
    if (target.has(id)) duplicates.push(raw);
    target.set(id, match[2]);
  }
  if (duplicates.length) throw new Error(`icon sprite: duplicate symbols ${duplicates.join(', ')}`);
  for (const id of small.keys()) {
    if (!large.has(id)) throw new Error(`icon sprite: 16-unit master "${id}${SMALL_SUFFIX}" has no 24-unit master`);
  }
  return { large, small };
}

/** Elements of one glyph body as { name, attrs } (self-closing tags only, which is all the sprite uses). */
export function glyphElements(body) {
  const out = [];
  const rest = body.replace(/<([a-z]+)((?:\s+[a-z-]+="[^"]*")*)\s*\/>/g, (_, name, attrText) => {
    const attrs = {};
    for (const a of attrText.matchAll(/([a-z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    out.push({ name, attrs });
    return '';
  });
  if (rest.trim()) throw new Error(`icon sprite: unexpected markup "${rest.trim().slice(0, 60)}"`);
  return out;
}

/**
 * Absolute bounding box of a path's on-curve points (control points of arcs are approximated by the end points
 * plus the radius, which is conservative). Supports M L H V C S Q T A Z in both cases.
 */
export function pathBounds(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (px, py, pad = 0) => {
    box.x0 = Math.min(box.x0, px - pad); box.y0 = Math.min(box.y0, py - pad);
    box.x1 = Math.max(box.x1, px + pad); box.y1 = Math.max(box.y1, py + pad);
  };
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { x = sx; y = sy; continue; }
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (C === 'M' || C === 'L' || C === 'T') {
      x = ox + num(); y = oy + num(); add(x, y);
      if (C === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
    } else if (C === 'H') { x = ox + num(); add(x, y); }
    else if (C === 'V') { y = oy + num(); add(x, y); }
    else if (C === 'C') { add(ox + num(), oy + num()); add(ox + num(), oy + num()); x = ox + num(); y = oy + num(); add(x, y); }
    else if (C === 'S' || C === 'Q') { add(ox + num(), oy + num()); x = ox + num(); y = oy + num(); add(x, y); }
    else if (C === 'A') {
      const rx = Math.abs(num()); const ry = Math.abs(num()); const phi = num() * Math.PI / 180;
      const large = num() !== 0; const sweep = num() !== 0;
      const x1 = x; const y1 = y;
      x = ox + num(); y = oy + num();
      for (const [px, py] of arcPoints(x1, y1, rx, ry, phi, large, sweep, x, y)) add(px, py);
    } else throw new Error(`icon sprite: unsupported path command ${cmd}`);
  }
  return box;
}

/** Points along an SVG elliptical arc (endpoint parameterisation, SVG 1.1 appendix F.6), for exact-enough bounds. */
function arcPoints(x1, y1, rx, ry, phi, large, sweep, x2, y2, steps = 48) {
  if (!rx || !ry) return [[x2, y2]];
  const cos = Math.cos(phi); const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2; const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy; const yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * (rx * yp) / ry; const cyp = coef * -(ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2; const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = t1 + (dt * i) / steps;
    out.push([cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]);
  }
  return out;
}
