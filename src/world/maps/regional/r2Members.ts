// src/world/maps/regional/r2Members.ts — members as real sections for the r2 standard (the looks lane's r2 sweep fix
// b-west, 2026-10-16; tools/r2-standard.mjs boxShare: "plain unbevelled boxes or quads carrying most of the area. Use
// chamfered boards, profiles, lathes, cast sections and real members"). Free members between any two points, which
// PartSink's member (a box) and cylinder (on an axis) do not give:
//   - board: a sawn board or squared timber from a to b, its long arrises chamfered (an octagonal section);
//   - rod: a pole, a pipe, a rod or a bundle of brush from a to b (an n-gon section);
//   - pad: a body laid on the ground (a footing course, a slab, trodden earth), its plan's corners cut, its sides
//     battered and its top arris weathered (a loft of rings).
import type { EmitOptions, PartSink, RegionalBucket, Vec3 } from './geometry.ts';

type V = [number, number, number];

/** The unit axis from a to b, its length, and two unit directions square to it: u near `side`, v = axis x u. */
function frameOf(a: Vec3, b: Vec3, side: Vec3): { ax: V; len: number; u: V; v: V } | null {
  const d: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-4) return null;
  const ax: V = [d[0] / len, d[1] / len, d[2] / len];
  // side less its part along the axis; a side along the axis falls back to a level or an upright direction
  let s: V = [side[0], side[1], side[2]];
  let k = s[0] * ax[0] + s[1] * ax[1] + s[2] * ax[2];
  let u: V = [s[0] - ax[0] * k, s[1] - ax[1] * k, s[2] - ax[2] * k];
  if (Math.hypot(u[0], u[1], u[2]) < 1e-4) {
    s = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    k = s[0] * ax[0] + s[1] * ax[1] + s[2] * ax[2];
    u = [s[0] - ax[0] * k, s[1] - ax[1] * k, s[2] - ax[2] * k];
  }
  const ul = Math.hypot(u[0], u[1], u[2]);
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v: V = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
  return { ax, len, u, v };
}

/**
 * A sawn board or squared timber from a to b (its end faces' centres): `width` along `side` (made square to the axis),
 * `thick` across both, its four long arrises chamfered `ch` (clamped to under half the smaller side: an octagonal
 * section, the eased arris of a sawn board or a ply sheet, the chamfer of a dressed beam). The ends are cut square.
 */
export function board(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, side: Vec3, width: number, thick: number, ch: number,
  opts: EmitOptions = {}): void {
  const f = frameOf(a, b, side);
  if (!f) return;
  const hw = width / 2, ht = thick / 2, c = Math.max(0, Math.min(ch, hw * 0.45, ht * 0.45));
  // counter-clockwise in (u, v) seen from the axis's far end (u x v = axis): PartSink.prism's winding
  const sec: Array<[number, number]> = c > 1e-4
    ? [[hw, -ht + c], [hw, ht - c], [hw - c, ht], [-hw + c, ht], [-hw, ht - c], [-hw, -ht + c], [-hw + c, -ht], [hw - c, -ht]]
    : [[hw, -ht], [hw, ht], [-hw, ht], [-hw, -ht]];
  const pts = sec.map(([p, q]): Vec3 => [a[0] + f.u[0] * p + f.v[0] * q, a[1] + f.u[1] * p + f.v[1] * q, a[2] + f.u[2] * p + f.v[2] * q]);
  sink.prism(bucket, pts, f.ax, f.len, opts);
}

/** A round member from a to b (a pole, a pipe, a rod, a bundle of brush): `segments` sides of radius r, its ends cut square. */
export function rod(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, r: number, segments: number, opts: EmitOptions = {}, phase = 0): void {
  const f = frameOf(a, b, [0, 1, 0]);
  if (!f || r <= 0) return;
  const n = Math.max(3, segments), pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = phase + i / n * Math.PI * 2, p = Math.cos(t) * r, q = Math.sin(t) * r;
    pts.push([a[0] + f.u[0] * p + f.v[0] * q, a[1] + f.u[1] * p + f.v[1] * q, a[2] + f.u[2] * p + f.v[2] * q]);
  }
  sink.prism(bucket, pts, f.ax, f.len, opts);
}

/** One ring of a pad: its height and how far its outline stands in from the pad's base. */
interface PadRing { y: number; inset: number }

/**
 * A body laid on the ground over the plan x0..x1, z0..z1: its outline's corners cut `corner`, lofted through `rings`
 * (bottom to top, each in from the base outline by its inset: a battered side, a weathered arris), the top capped; the
 * bottom capped only when `closed` (a structure's solid; a dressing pad sunk in the sand shows no underside).
 */
export function pad(sink: PartSink, bucket: RegionalBucket, x0: number, z0: number, x1: number, z1: number, rings: readonly PadRing[], corner: number,
  opts: EmitOptions = {}, closed = false): void {
  if (rings.length < 2) return;
  const outline = (inset: number, y: number): Vec3[] => {
    const a0 = x0 + inset, a1 = x1 - inset, b0 = z0 + inset, b1 = z1 - inset;
    const c = Math.max(0, Math.min(corner, (a1 - a0) * 0.45, (b1 - b0) * 0.45));
    // clockwise in plan (x right, z up): its top cap faces +y, its sides out (PartSink.polygon's winding)
    return c > 1e-4
      ? [[a0 + c, y, b0], [a0, y, b0 + c], [a0, y, b1 - c], [a0 + c, y, b1], [a1 - c, y, b1], [a1, y, b1 - c], [a1, y, b0 + c], [a1 - c, y, b0]]
      : [[a0, y, b0], [a0, y, b1], [a1, y, b1], [a1, y, b0]];
  };
  const loops = rings.map((r) => outline(r.inset, r.y));
  for (let i = 0; i + 1 < loops.length; i++) {
    const lo = loops[i], hi = loops[i + 1], n = lo.length;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      sink.quad(bucket, lo[k], lo[j], hi[j], hi[k], opts);
    }
  }
  sink.polygon(bucket, loops[loops.length - 1], opts);
  if (closed) sink.polygon(bucket, [...loops[0]].reverse(), opts);
}
