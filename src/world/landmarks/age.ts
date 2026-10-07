// src/world/landmarks/age.ts — the age of a set piece's walls (the landmarks lane, 2026-10-06; gauntlet waves 154-158:
// the pieces stood "pristine with no weathering": the church "flat, untextured white with no socle, staining, cracking
// or peeling").
//
// The map kit's weathering (maps/regional/weather.ts) already darkens a piece's wall foot and greens its eaves; this is
// the rest of what a hundred years and a war leave on a wall, all of it decor laid a few millimetres proud of the face
// (no collision, no change to the piece's solids):
//   - spalled render: ragged patches where the render has fallen and the masonry under it shows (at the wall foot where
//     the damp rose, under the sills where the drip ran, scars in the piers), as the kit houses' wear draws them
//     (house.ts spallRender);
//   - rain streaks: the grime washed down a face from its ledges (a cornice, a sill, a string course), a quad in the
//     wall's own bucket whose corners carry the kit weathering's occlusion (`shadeAt`): darkest under the ledge, gone a
//     metre or two below it;
//   - soot: the blackening over a burnt opening, darkest at its head.
// Every choice draws from the stream the builder passes (its look stream), never its build stream, so a piece's
// geometry is drawn the same with or without its age.
import { facePoint, type Face, type PartSink, type RegionalBucket } from '../maps/regional/geometry.ts';

/** A rectangle on a face: u across it, y up. */
export interface FaceRect { u0: number; u1: number; y0: number; y1: number }

/**
 * Spalled render on a face: `count` ragged patches of `bucket` (the masonry under the render) 15 mm proud, inside
 * `area` and clear of every `keepOut` rectangle (the openings), the first ones along the wall foot.
 */
export function spallPatches(sink: PartSink, face: Face, area: FaceRect, keepOut: readonly FaceRect[], rng: () => number,
  opts: { bucket?: RegionalBucket; count?: number; foot?: number } = {}): void {
  const bucket = opts.bucket ?? 'stone', count = opts.count ?? 2, foot = opts.foot ?? 0.5;
  for (let k = 0; k < count; k++) {
    const atFoot = rng() < foot, a = rng(), b = rng(), c = rng();
    const ru = atFoot ? 0.7 + a * 1.3 : 0.3 + a * 0.55;
    const ry = atFoot ? 0.22 + b * 0.32 : ru * (0.5 + b * 0.5);
    const cu = area.u0 + ru + c * Math.max(0, area.u1 - area.u0 - 2 * ru);
    const cy = atFoot ? area.y0 + 0.04 + ry : area.y0 + ry + 0.4 + rng() * Math.max(0, area.y1 - area.y0 - 2 * ry - 0.6);
    const ragged: Array<[number, number]> = [];
    for (let j = 0; j < 11; j++) {
      const t = (j / 11) * Math.PI * 2, r = 0.55 + rng() * 0.45;
      ragged.push([cu + Math.cos(t) * ru * r, cy + Math.sin(t) * ry * r]);
    }
    if (cu - ru < area.u0 || cu + ru > area.u1 || cy - ry < area.y0 || cy + ry > area.y1) continue;
    if (keepOut.some((h) => cu + ru > h.u0 - 0.1 && cu - ru < h.u1 + 0.1 && cy + ry > h.y0 - 0.1 && cy - ry < h.y1 + 0.1)) continue;
    const fan: Array<[number, number]> = [[cu, cy], ...ragged, ragged[0]];
    sink.polygon(bucket, fan.map(([u, y]) => facePoint(face, u, y, 0.015)), { decor: true, shade: 0.86 });
  }
}

/**
 * Rain streaks washed down a face from a ledge at height `y`: `count` strips of the wall's own `bucket` between u0 and
 * u1, each `depth` darker at its head and fading to nothing `length` below it (the kit weathering's occlusion).
 */
export function rainStreaks(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y: number, rng: () => number,
  opts: { count?: number; length?: number; depth?: number; floor?: number } = {}): void {
  const count = opts.count ?? Math.max(1, Math.round((u1 - u0) / 1.6)), floor = opts.floor ?? 0.2;
  for (let k = 0; k < count; k++) {
    const w = 0.25 + rng() * 0.6, len = (opts.length ?? 1.6) * (0.5 + rng() * 0.7), depth = (opts.depth ?? 0.2) * (0.6 + rng() * 0.6);
    const u = u0 + w / 2 + rng() * Math.max(0, u1 - u0 - w);
    const top = y - 0.01, bottom = Math.max(floor, top - len);
    if (top - bottom < 0.3) continue;
    // (a wash fans out a little and fades rather than coming to a point: a sharp taper read as dark icicles)
    const head = top - 0.08, taper = w * (0.7 + rng() * 0.35);
    // a strip narrowing as it runs down, its head darkest
    const pts: Array<[number, number]> = [[u - w / 2, top], [u - taper / 2, bottom], [u + taper / 2, bottom], [u + w / 2, top]];
    // counter-clockwise seen from outside: down the left edge, along the bottom, up the right
    const y0 = face.origin[1];
    sink.polygon(bucket, pts.map(([cu, cy]) => facePoint(face, cu, cy, 0.008)), {
      decor: true, shadeAt: (p) => (p[1] - y0 >= head ? 1 - depth : 1 - depth * Math.max(0, (p[1] - y0 - bottom) / Math.max(0.01, head - bottom))),
    });
  }
}

/**
 * Soot over a burnt opening (u centre, w wide, its head at y): a flame-shaped blackening of the wall's own `bucket`
 * rising `rise` above the head, darkest there.
 */
export function sootOver(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, w: number, rise: number,
  opts: { depth?: number } = {}): void {
  const depth = opts.depth ?? 0.7;
  const pts: Array<[number, number]> = [[u - w / 2 - 0.08, y], [u + w / 2 + 0.08, y], [u + w * 0.3, y + rise * 0.7], [u, y + rise], [u - w * 0.3, y + rise * 0.7]];
  const y0 = face.origin[1];
  sink.polygon(bucket, pts.map(([cu, cy]) => facePoint(face, cu, cy, 0.01)), {
    decor: true, shadeAt: (p) => 1 - depth * Math.max(0, 1 - (p[1] - y0 - y) / rise),
  });
}

/** An opening as the kit cuts it (kit.ts ArchHole): centre u, width, sill y0, springing; its head over the springing. */
export interface AgedOpening { u: number; w: number; y0: number; spring: number; form?: string }

/** One wall a builder ages: its face, its bucket, the rectangle it covers, its openings and its top ledge. */
export interface AgedWall {
  face: Face;
  /** the wall's own bucket (its streaks are drawn in it: the kit weathering darkens them) */
  bucket: RegionalBucket;
  area: FaceRect;
  openings?: readonly AgedOpening[];
  /** the ledge the rain runs off (a cornice's underside), when it has one */
  ledge?: number;
  /** the masonry under a render (spalled patches show it), or null for a wall that is masonry already */
  spall?: RegionalBucket | null;
  /** how many patches (default 2) and the share at the wall foot */
  spallCount?: number;
  /** how dirty its streaks are (default 0.2) */
  grime?: number;
}

const headOf = (o: AgedOpening): number => o.spring + (o.form === 'flat' ? 0 : o.form === 'pointed' ? o.w * 0.74 : o.w / 2);

/**
 * Age a wall: spalled render (when it is rendered), the streaks under its ledge, and the drip under each opening's sill.
 * Draws only from `rng` (the piece's age stream).
 */
export function ageWall(sink: PartSink, rng: () => number, wall: AgedWall): void {
  const openings = wall.openings ?? [];
  const keepOut = openings.map((o) => ({ u0: o.u - o.w / 2 - 0.12, u1: o.u + o.w / 2 + 0.12, y0: o.y0 - 0.12, y1: headOf(o) + 0.12 }));
  if (wall.spall) spallPatches(sink, wall.face, wall.area, keepOut, rng, { bucket: wall.spall, count: wall.spallCount ?? 2, foot: 0.55 });
  const grime = wall.grime ?? 0.2;
  if (wall.ledge !== undefined) {
    rainStreaks(sink, wall.bucket, wall.face, wall.area.u0 + 0.2, wall.area.u1 - 0.2, wall.ledge, rng,
      { depth: grime, length: Math.min(2.4, (wall.ledge - wall.area.y0) * 0.45), floor: wall.area.y0 + 0.2 });
  }
  for (const o of openings) {
    if (o.y0 - wall.area.y0 < 0.8) continue; // a door: its threshold is the ground
    rainStreaks(sink, wall.bucket, wall.face, o.u - o.w / 2 - 0.05, o.u + o.w / 2 + 0.05, o.y0 - 0.06, rng,
      { count: 1, depth: grime * 0.9, length: Math.min(1.4, o.y0 - wall.area.y0 - 0.3), floor: wall.area.y0 + 0.15 });
  }
}
