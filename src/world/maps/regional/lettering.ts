// src/world/maps/regional/lettering.ts — a sign's painted words for the regional kits in the scripts the landmarks'
// sign-writer's alphabet (landmarks/lettering.ts: Latin and Cyrillic) does not carry (the buildings lane, 2026-10-11;
// wave 406b's "blank plates"): the Bengali headline (matra) with its letters hanging from it, and Chinese characters in
// their square cells, block strokes laid flat on a sign's face; and the pick of a sign's real words by its place. The
// shapes and picks come from a hash of the sign's place, never from a stream: a kit's build and look draws stay as
// they were, and a phone build letters its signs as the desktop does.
import { facePanel, type EmitOptions, type Face, type PartSink, type RegionalBucket, type Rgb } from './geometry.ts';

/** A 32-bit hash of a few numbers (a sign's place), as a stream of [0, 1) values. */
function placeStream(...keys: number[]): () => number {
  let h = 0x811c9dc5;
  for (const k of keys) { h = Math.imul(h ^ Math.round(k * 1000), 0x01000193); h ^= h >>> 15; }
  return () => { h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 13), 0x45d9f3b); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

/** One of a list, picked by a sign's place (its face's origin and its own seat). */
export function placePick<T>(list: readonly T[], ...keys: number[]): T {
  return list[Math.min(list.length - 1, Math.floor(placeStream(...keys)() * list.length))];
}

/**
 * A Bengali word painted across a sign: the headline across it and each letter's strokes hanging from it, a vowel sign
 * rising over it here and there and a descender under, letters `lh` high centred at (u, y) on `face`, `o` out (flat
 * strips a few millimetres before the board), as many as `width` holds (at most `max`). `seed` adds to the place's hash.
 */
export function bengaliWord(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, o: number, width: number,
  lh: number, colour: Rgb, seed = 0, max = 20, opts: EmitOptions = {}): void {
  const t = lh * 0.17, lw = lh * 0.5, pitch = lh * 0.62;
  const n = Math.min(max, Math.floor((width - lh * 0.4) / pitch));
  if (n < 2) return;
  const r = placeStream(face.origin[0], face.origin[2], u, y, seed);
  // (the paint flat: the board's texture spread to a texel's breadth under it)
  const ink: EmitOptions = { decor: true, fine: true, density: 0.05, ...opts, colour };
  const left = u - (n * pitch - (pitch - lw)) / 2;
  const bar = (u0: number, y0: number, w: number, h: number) => facePanel(sink, bucket, face, u0 + w / 2, y0 + h / 2, o, w, h, ink);
  const b = y - lh / 2, top = y + lh / 2 - t;
  // the headline across the word, each glyph's strokes hanging from it
  bar(left - t * 0.5, top, n * pitch - (pitch - lw) + t, t);
  for (let i = 0; i < n; i++) {
    const x = left + i * pitch, g = Math.floor(r() * 6);
    if (g !== 5) bar(x + lw - t, b + lh * 0.1, t, lh * 0.9 - t); // the stem at the glyph's right
    if (g === 0 || g === 3) { bar(x, y - t / 2, lw - t, t); bar(x, b + lh * 0.1, t, lh * 0.4); } // a bowl: mid bar, left drop
    if (g === 1) { bar(x, b + lh * 0.1, lw - t, t); bar(x, b + lh * 0.1, t, lh * 0.35); } // a foot
    if (g === 2 || g === 5) { bar(x + lw * 0.2, y - t, lw * 0.5, t); bar(x + lw * 0.2, b + lh * 0.2, t, lh * 0.32); bar(x + lw * 0.2, b + lh * 0.2, lw * 0.5, t); }
    if (g === 4) bar(x + lw * 0.15, y - lh * 0.1, lw * 0.6, t);
    if (r() < 0.22) bar(x + lw * 0.45, top + t, t * 0.9, lh * 0.32); // a vowel sign over the headline
    if (r() < 0.15) bar(x + lw - t, b - lh * 0.25, t, lh * 0.35); // a descender
  }
}

/**
 * Chinese characters painted (or gilded) on a board: `count` square cells `cell` across, down a column (`vertical`) or
 * along a row, starting at (u, y) — the first cell's centre — on `face`, `o` out. Each character a few strokes in its
 * cell: the bars across at a quarter, a half and three quarters, the uprights, an enclosing frame, a dot.
 */
export function cjkGlyphs(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, o: number, cell: number,
  count: number, vertical: boolean, colour: Rgb, seed = 0, opts: EmitOptions = {}): void {
  const r = placeStream(face.origin[0], face.origin[2], u, y, seed + 17);
  const ink: EmitOptions = { decor: true, fine: true, density: 0.05, ...opts, colour };
  const s = cell * 0.78, t = cell * 0.11;
  for (let k = 0; k < count; k++) {
    const cu = vertical ? u : u + k * cell, cy = vertical ? y - k * cell : y;
    const x0 = cu - s / 2, y0 = cy - s / 2;
    const bar = (a: number, b: number, w: number, h: number) => facePanel(sink, bucket, face, x0 + a * s + (w * s) / 2, y0 + b * s + (h * s) / 2, o, w * s, h * s, ink);
    const strokes = 4 + Math.floor(r() * 4);
    if (r() < 0.3) { bar(0, 0, t / s, 1); bar(1 - t / s, 0, t / s, 1); bar(0, 1 - t / s, 1, t / s); bar(0, 0, 1, t / s); } // the enclosure
    for (let j = 0; j < strokes; j++) {
      const kind = r(), at = [0.2, 0.45, 0.7][Math.floor(r() * 3)], from = r() * 0.3, len = 0.4 + r() * (0.7 - from);
      if (kind < 0.5) bar(from, at, Math.min(len, 1 - from), t / s);
      else if (kind < 0.9) bar(at, from, t / s, Math.min(len, 1 - from));
      else bar(at, 0.8, (t / s) * 1.4, (t / s) * 1.4);
    }
  }
}
