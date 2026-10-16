// src/world/maps/regional/kyushuLookout.ts — the hinomi-yagura's frame (kyushu.ts stack, the fire lookout form), extracted
// (the looks lane's r2 follow-up, b-east, 2026-10-16: lane B is parked, so its builder was taken extract-then-own) and
// rebuilt here. The lookout was the shared lattice frame (lattice.ts latticeFrame), every member a bare box: 0.84 plain
// boxes by area in a bare build (the r2 sweep graded the stack@kyushu representative, a factory stack; players see both
// forms). A Japanese fire lookout of the 1950s-60s is a riveted steel tower: its legs angles on concrete footings, its
// girts steel angles at every panel, its X braces round tie rods. So here the girts are 60 mm angles (an L section,
// heel out) and the braces 32 mm rods; the legs keep their section and their collision (the frame's only structural
// members), and the frame is recorded for the damage reading as latticeFrame records it (recordLattice).
import { normalize3, type EmitOptions, type PartSink, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { recordLattice } from './lattice.ts';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A member from a to b of a section `sec` (points across it: x along `side`'s horizontal-ish axis, z the other), its
 * sides wound out and its two ends capped (`caps`: convex pieces of the section). `side` steers the section's x axis.
 */
function sectionMember(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, sec: ReadonlyArray<readonly [number, number]>,
  caps: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, side: Vec3, opts: EmitOptions): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (L < 1e-3) return;
  const ay: Vec3 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
  let ax = cross(side, ay);
  if (Math.hypot(...ax) < 1e-4) ax = cross([0, 0, 1], ay);
  ax = normalize3(ax);
  const az = cross(ax, ay);
  const at = (p: readonly [number, number], o: Vec3): Vec3 => [o[0] + ax[0] * p[0] + az[0] * p[1], o[1] + ax[1] * p[0] + az[1] * p[1], o[2] + ax[2] * p[0] + az[2] * p[1]];
  let cx = 0, cz = 0;
  for (const [x, z] of sec) { cx += x; cz += z; }
  cx /= sec.length; cz /= sec.length;
  let area = 0;
  for (let i = 0; i < sec.length; i++) { const p = sec[i], q = sec[(i + 1) % sec.length]; area += p[0] * q[1] - q[0] * p[1]; }
  for (let i = 0; i < sec.length; i++) {
    const p = sec[i], q = sec[(i + 1) % sec.length];
    // (a side wound out: for a section counter-clockwise in (x, z) its outward normal is (dz, -dx); the quad p q at a, q p
    // at b winds (-dz, dx), so it runs reversed)
    if (area > 0) sink.quad(bucket, at(q, a), at(p, a), at(p, b), at(q, b), opts);
    else sink.quad(bucket, at(p, a), at(q, a), at(q, b), at(p, b), opts);
  }
  for (const cap of caps) {
    for (const [o, want] of [[a, [-ay[0], -ay[1], -ay[2]] as Vec3], [b, ay]] as const) {
      let pts = cap.map((p) => at(p, o));
      if (dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), want) < 0) pts = pts.reverse();
      sink.polygon(bucket, pts, opts);
    }
  }
  void cx; void cz;
}

/** A steel angle s wide, t thick, its heel at (0, 0) and its legs along +x and +z, centred on its heel's diagonal. */
function angle(s: number, t: number): { sec: Array<[number, number]>; caps: Array<Array<[number, number]>> } {
  const h = s / 3;
  const sec: Array<[number, number]> = [[-h, -h], [s - h, -h], [s - h, t - h], [t - h, t - h], [t - h, s - h], [-h, s - h]];
  return { sec, caps: [[[-h, -h], [s - h, -h], [s - h, t - h], [-h, t - h]], [[-h, t - h], [t - h, t - h], [t - h, s - h], [-h, s - h]]] };
}

/** A round rod of radius r, six-sided. */
function rod(r: number): { sec: Array<[number, number]>; caps: Array<Array<[number, number]>> } {
  const sec = Array.from({ length: 6 }, (_, k): [number, number] => [Math.cos(k * Math.PI / 3) * r, Math.sin(k * Math.PI / 3) * r]);
  return { sec, caps: [sec] };
}

/** The lookout's four legs on their footings, angle girts at every panel and rod X braces in each, recorded as a lattice. */
export function lookoutFrame(sink: PartSink, b0: number, b1: number, H: number, steel: Rgb, CEMENT: RegionalBucket, mobile: boolean): void {
  const y0 = 0, y1 = H, size = 0.1, panels = Math.max(3, Math.round(H / 2.2)), bucket: RegionalBucket = 'structureMetal';
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (k: number, y: number): Vec3 => {
    const t = (y - y0) / Math.max(1e-6, y1 - y0), half = b0 + (b1 - b0) * t;
    return [corners[k][0] * half, y, corners[k][1] * half];
  };
  const opts = { colour: steel };
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (let k = 0; k < 4; k++) {
    const foot = at(k, y0), head = at(k, y1);
    sink.member(bucket, foot, head, size, size, [corners[k][0], 0, 0], { ...opts, exposed: true }, 0);
    sink.span(CEMENT, foot[0] - 0.225, -0.4, foot[2] - 0.225, foot[0] + 0.225, 0.2, foot[2] + 0.225, { decor: true, shade: 0.9 });
    legs.push({ foot: sink.framePoint(foot), head: sink.framePoint(head) });
  }
  const girts: number[] = [];
  const levels = Array.from({ length: panels + 1 }, (_, i) => y0 + (y1 - y0) * (i / panels));
  for (let i = 1; i <= panels; i++) girts.push(levels[i]);
  const ang = angle(0.06, 0.008), tie = rod(0.016);
  sink.dressing(mobile, () => {
    for (let i = 1; i <= panels; i++) {
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4;
        // (each girt into the legs' faces at its ends: the angle's heel on the face line, its legs inboard and down)
        sectionMember(sink, bucket, at(k, levels[i]), at(j, levels[i]), ang.sec, ang.caps, [0, 1, 0], { ...opts, decor: true });
      }
    }
    for (let i = 0; i < panels; i++) {
      const ya = levels[i] + (i === 0 ? 0.3 : 0), yb = levels[i + 1];
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4, out: Vec3 = [corners[k][0] + corners[j][0], 0, corners[k][1] + corners[j][1]];
        sectionMember(sink, bucket, at(k, ya), at(j, yb), tie.sec, tie.caps, out, { ...opts, decor: true });
        sectionMember(sink, bucket, at(j, ya), at(k, yb), tie.sec, tie.caps, out, { ...opts, decor: true });
      }
    }
  });
  recordLattice(sink, legs.map((l) => ({ foot: l.foot, head: l.head })), girts, size, bucket, steel,
    { x0: -1.1, x1: 1.1, y0: H, y1: H + 2.3, z0: -1.1, z1: 1.1, bucket: 'structureMetal', tint: steel });
}
