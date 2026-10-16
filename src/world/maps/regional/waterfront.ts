// src/world/maps/regional/waterfront.ts — the waterfront family's shared joinery (props census #25, the looks lane
// 2026-10-15; WORKLIST.md "Waterfront buildings: fisheries, boatsheds & net yards"). The pieces every harbour kit of the
// family lays beside its sheds: the boats drawn up on their slips or turned over on trestles (a færing, a Breton plate,
// a Dalmatian gajeta, a Mekong sampan), the dry-stone walls of a naust in their courses, the slips of setts with their
// runners, the quay's coping and its bollards, and the net racks whose poles and rails fall as their members when the
// yard is shot (lattice.ts recordLattice: damage.ts describeLattice reads them back, latticeFall.ts lays them down).
import { LocalFrame, PartSink, faceBox, facePoint, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { recordLattice } from './lattice.ts';

/** A boat's lines: the hull a builder draws (boatHull). */
export interface HullSpec {
  length: number;
  beam: number;
  /** the side's height amidships, keel to gunwale */
  depth: number;
  /** the sheer's rise at the stem and stern over amidships */
  sheer: number;
  /** a double-ender (færing, sampan) or a square transom at the stern (a Breton plate, a gajeta) */
  stern: 'double' | 'transom';
  /** the bottom's flat share of the half beam amidships (0: a vee, 0.8: a punt) */
  flat: number;
  colour: Rgb;
  /** the inside's paint (the planking's own wood, or a lead white) */
  inside: Rgb;
  /** the gunwale's (rubbing strake's) paint */
  gunwale?: Rgb;
  /** thwarts across the hull */
  thwarts?: number;
  /** a sampan's roof of woven bamboo over its middle (its ribs' colour), or none */
  hood?: Rgb | null;
}

/**
 * A small open boat, planked and hollow: its outside in two strakes a side (the bottom to the chine, the side to the
 * gunwale) through eight stations, its inside a planking's thickness in, the gunwale capping the two, the stem post at
 * the bow and a transom or a second stem at the stern, its thwarts. `at` is the keel's middle; `yaw` turns its length
 * (local +x) about Y; `upturned` lays it keel up on its gunwales (a boat wintering on trestles), `heel` rolls it onto its
 * bilge (a boat drawn up on the shingle). Dressing (decor): it never carries collision.
 */
export function boatHull(sink: PartSink, at: Vec3, yaw: number, spec: HullSpec,
  opts: { upturned?: boolean; heel?: number; bucket?: RegionalBucket; fine?: boolean } = {}): void {
  const bucket = opts.bucket ?? 'structureWood';
  const N = 8, L = spec.length, th = 0.035;
  const c = Math.cos(yaw), s = Math.sin(yaw), heel = opts.heel ?? 0, ch = Math.cos(heel), sh = Math.sin(heel);
  const up = !!opts.upturned, lift = up ? spec.depth + spec.sheer : 0;
  // local (x along, y up from the keel, z across) to the building's frame: the heel about the length, the turn over
  // (a half turn about the length: a rotation, so every face keeps its winding), the yaw, the place
  const P = (x: number, y: number, z: number): Vec3 => {
    let yy = y * ch - z * sh, zz = y * sh + z * ch;
    if (up) { yy = -yy; zz = -zz; }
    yy += lift;
    return [at[0] + x * c + zz * s, at[1] + yy, at[2] - x * s + zz * c];
  };
  const station = (i: number) => {
    const t = i / N, u = 2 * t - 1;
    const bowness = Math.max(0, -u), sternness = Math.max(0, u);
    const fineness = spec.stern === 'double' ? Math.abs(u) : bowness;
    let hb = (spec.beam / 2) * (1 - Math.pow(fineness, 2.2));
    if (spec.stern === 'transom') hb *= 1 - 0.28 * sternness * sternness;
    hb = Math.max(0.03, hb);
    const flat = spec.flat * (1 - Math.pow(Math.abs(u), 1.6) * 0.85);
    const keel = spec.depth * 0.18 * Math.pow(Math.abs(u), 3);
    return { x: u * L / 2, hb, bw: Math.max(0.015, hb * flat), keel, chine: keel + spec.depth * 0.32 * (1 - 0.5 * Math.abs(u)), gun: spec.depth + spec.sheer * u * u };
  };
  const st = Array.from({ length: N + 1 }, (_, i) => station(i));
  const out = { colour: spec.colour, decor: true, ...(opts.fine ? { fine: true } : {}) } as EmitOptions;
  const bottomTone = { ...out, colour: shade(spec.colour, 0.72) };
  const inner = { colour: spec.inside, decor: true, fine: true } as EmitOptions;
  const rail = { colour: spec.gunwale ?? shade(spec.colour, 0.6), decor: true } as EmitOptions;
  for (let i = 0; i < N; i++) {
    const a = st[i], b = st[i + 1];
    for (const side of [-1, 1]) {
      // (the strakes' corners counter-clockwise seen from outside: the port side's run mirrored)
      // (each strake panel as its two triangles: the hull twists toward its ends, and a twisted quad fanned on one normal
      // turns its second triangle's face inside out)
      // (the port side the starboard's mirror: the same diagonal, the triangles wound the other way)
      const q = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, o: EmitOptions) => {
        if (side > 0) { sink.polygon(bucket, [p0, p1, p2], o); sink.polygon(bucket, [p0, p2, p3], o); } else { sink.polygon(bucket, [p0, p2, p1], o); sink.polygon(bucket, [p0, p3, p2], o); }
      };
      q(P(a.x, a.keel, 0), P(b.x, b.keel, 0), P(b.x, b.chine, side * b.bw), P(a.x, a.chine, side * a.bw), bottomTone);
      q(P(a.x, a.chine, side * a.bw), P(b.x, b.chine, side * b.bw), P(b.x, b.gun, side * b.hb), P(a.x, a.gun, side * a.hb), out);
      // the inside, a plank's thickness in, wound to face in
      const ia = Math.max(0.005, a.hb - th), ib = Math.max(0.005, b.hb - th);
      const ka = Math.max(0.005, a.bw - th), kb = Math.max(0.005, b.bw - th);
      q(P(a.x, a.gun - 0.01, side * ia), P(b.x, b.gun - 0.01, side * ib), P(b.x, b.chine + th, side * kb), P(a.x, a.chine + th, side * ka), inner);
      q(P(a.x, a.chine + th, side * ka), P(b.x, b.chine + th, side * kb), P(b.x, b.keel + th, 0), P(a.x, a.keel + th, 0), inner);
      // the gunwale: the cap over the planking's edge
      q(P(a.x, a.gun, side * a.hb), P(b.x, b.gun, side * b.hb), P(b.x, b.gun - 0.01, side * ib), P(a.x, a.gun - 0.01, side * ia), rail);
    }
  }
  // the planking's ends closed at the stem (and a double-ender's stern): its section across the last station, both faces
  for (const k of spec.stern === 'double' ? [0, N] : [0]) {
    const e = st[k], ring = [P(e.x, e.keel, 0), P(e.x, e.chine, e.bw), P(e.x, e.gun, e.hb), P(e.x, e.gun, -e.hb), P(e.x, e.chine, -e.bw)];
    sink.polygon(bucket, k === 0 ? ring : [...ring].reverse(), rail);
  }
  // the stem (and a double-ender's sternpost): a post up the meeting of the planks
  const posts = spec.stern === 'double' ? [0, N] : [0];
  for (const k of posts) {
    const e = st[k], dir = k === 0 ? -1 : 1;
    sink.member(bucket, P(e.x + dir * 0.03, e.keel - 0.02, 0), P(e.x + dir * 0.06, e.gun + 0.06, 0), 0.06, 0.07, [s, 0, c], { ...rail, exposed: true }, 0);
  }
  if (spec.stern === 'transom') {
    const e = st[N];
    // the transom board, its outside and inside
    const outer = [P(e.x, e.keel, 0), P(e.x, e.chine, e.bw), P(e.x, e.gun, e.hb), P(e.x, e.gun, -e.hb), P(e.x, e.chine, -e.bw)];
    sink.polygon(bucket, [outer[0], outer[1], outer[2], outer[3], outer[4]], out);
    const ix = e.x - th;
    sink.polygon(bucket, [P(ix, e.keel + th, 0), P(ix, e.chine + th, -Math.max(0.005, e.bw - th)), P(ix, e.gun - 0.01, -Math.max(0.005, e.hb - th)),
      P(ix, e.gun - 0.01, Math.max(0.005, e.hb - th)), P(ix, e.chine + th, Math.max(0.005, e.bw - th))], inner);
  }
  // the thwarts, seated on the inside of the planking
  const n = spec.thwarts ?? 2;
  for (let k = 0; k < n; k++) {
    const i = Math.round(N * (0.32 + 0.4 * (n === 1 ? 0.5 : k / (n - 1))));
    const e = st[i], y = e.gun - 0.12, half = Math.max(0.05, e.hb - th - 0.01) * 0.98;
    const a = P(e.x - 0.11, y, -half), b = P(e.x + 0.11, y, -half), cc = P(e.x + 0.11, y, half), d = P(e.x - 0.11, y, half);
    const a2 = P(e.x - 0.11, y - 0.04, -half), b2 = P(e.x + 0.11, y - 0.04, -half), c2 = P(e.x + 0.11, y - 0.04, half), d2 = P(e.x - 0.11, y - 0.04, half);
    const seat = { colour: shade(spec.inside, 0.9), decor: true, fine: true } as EmitOptions;
    sink.quad(bucket, d, cc, b, a, seat);
    sink.quad(bucket, a2, b2, c2, d2, seat);
    sink.quad(bucket, d2, c2, cc, d, seat);
    sink.quad(bucket, b2, a2, a, b, seat);
  }
  // a sampan's hood: woven bamboo on hoops over its middle third
  if (spec.hood) {
    const i0 = Math.round(N * 0.36), i1 = Math.round(N * 0.64), segs = 5;
    for (let i = i0; i < i1; i++) {
      const a = st[i], b = st[i + 1];
      for (let k = 0; k < segs; k++) {
        const t0 = Math.PI * k / segs, t1 = Math.PI * (k + 1) / segs;
        const ra = a.hb * 0.98, rb = b.hb * 0.98, h = spec.depth * 0.9;
        const pa0 = P(a.x, a.gun + Math.sin(t0) * h, Math.cos(t0) * ra), pa1 = P(a.x, a.gun + Math.sin(t1) * h, Math.cos(t1) * ra);
        const pb0 = P(b.x, b.gun + Math.sin(t0) * h, Math.cos(t0) * rb), pb1 = P(b.x, b.gun + Math.sin(t1) * h, Math.cos(t1) * rb);
        sink.quad(bucket, pa0, pb0, pb1, pa1, { colour: spec.hood, decor: true });
        sink.quad(bucket, pa1, pb1, pb0, pa0, { colour: shade(spec.hood, 0.7), decor: true, fine: true });
      }
    }
  }
}

/**
 * Trestles a turned boat winters on: two splayed pairs of legs under a cross bar at `x` along its keel line, `y` the
 * bar's top (the boat's gunwales rest on it). Dressing.
 */
export function trestles(sink: PartSink, at: Vec3, yaw: number, spread: number, y: number, width: number, colour: Rgb): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (x: number, yy: number, z: number): Vec3 => [at[0] + x * c + z * s, at[1] + yy, at[2] - x * s + z * c];
  const o = { colour, decor: true, exposed: true } as EmitOptions & { exposed: boolean };
  for (const x of [-spread / 2, spread / 2]) {
    sink.member('structureWood', P(x - 0.06, y - 0.05, -width / 2), P(x + 0.06, y - 0.05, width / 2), 0.1, 0.08, [c, 0, -s], o, 0);
    for (const z of [-width / 2 + 0.12, width / 2 - 0.12]) {
      sink.member('structureWood', P(x - 0.22, -0.05, z), P(x, y - 0.08, z), 0.07, 0.07, [s, 0, c], o, 0);
      sink.member('structureWood', P(x + 0.22, -0.05, z), P(x, y - 0.08, z), 0.07, 0.07, [s, 0, c], o, 0);
    }
  }
}

/**
 * A mooring bollard on a quay: a cast-iron post with its flared head (structureMetal, painted), or a granite one (stone),
 * its foot set into the quay at `y`. Dressing.
 */
export function bollard(sink: PartSink, x: number, y: number, z: number, kind: 'iron' | 'granite', colour: Rgb): void {
  if (kind === 'iron') {
    sink.cylinder('structureMetal', [x, y - 0.05, z], 'y', 0.5, 0.13, 8, { colour, decor: true, shadow: true }, 0.11);
    sink.cylinder('structureMetal', [x, y + 0.45, z], 'y', 0.12, 0.19, 8, { colour: shade(colour, 0.9), decor: true, shadow: true }, 0.16);
  } else {
    sink.cylinder('stone', [x, y - 0.1, z], 'y', 0.72, 0.17, 8, { decor: true, shadow: true }, 0.14);
  }
}

/**
 * The coping of a quay's or a slip's edge along the line from (x0, z0) to (x1, z1) (its middle) with its top at `y`:
 * dressed stones of 0.9 to 1.5 m with their joints, `width` across, `h` deep, laid on the quay's own wall (structure: a
 * hull stands on it as on the quay). The stones' lengths come from `rng`.
 */
export function copingRun(sink: PartSink, x0: number, z0: number, x1: number, z1: number, y: number, width: number, h: number,
  rng: () => number, opts: EmitOptions = {}): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.2) return;
  const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
  const frame = new LocalFrame([ux, 0, uz], [0, 1, 0], [-uz, 0, ux], [0, 0, 0]);
  let a = 0;
  while (a < len - 0.05) {
    const piece = Math.min(len - a, 0.9 + rng() * 0.6);
    const b = len - (a + piece) < 0.45 ? len : a + piece, m = (a + b) / 2, dy = (rng() - 0.5) * 0.01;
    sink.box('stone', [x0 + ux * m, y - h / 2 + dy, z0 + uz * m], [(b - a) / 2 - 0.006, h / 2, width / 2],
      { ...opts, uv: { kind: 'world' }, tint: opts.tint ?? [0.96 + rng() * 0.1, 0.96 + rng() * 0.08, 0.95 + rng() * 0.08] }, frame, { ny: true });
    a = b;
  }
}

/**
 * A dry-stone wall face in its courses (props census #25, the judges on the naust: "walls of dry-stone courses: stones
 * as units or relief, a batter, a cap course"): over the wall's core face, course after course of stones laid in runs of
 * one to three stones' length, each run its own depth out of the face (the courses lie in and out by a few centimetres),
 * its own tone (granite greys, a yellow lichen on some), the joints between the runs staggered course to course; the
 * courses step back up the wall by the batter (`batter` metres at the foot, none at the head), so the wall's foot stands
 * proud of its head. The bottom course starts `y0` (at or under the ground). Relief over a structural core: decor.
 */
export function dryStoneFace(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number, rng: () => number,
  opts: { batter?: number; tone?: Rgb; lichen?: Rgb; bucket?: RegionalBucket; mobile?: boolean } = {}): void {
  const bucket = opts.bucket ?? 'stone', batter = opts.batter ?? 0.12, H = Math.max(0.1, y1 - y0);
  const coarse = opts.mobile;
  let y = y0, row = 0;
  while (y < y1 - 0.05) {
    const h = Math.min(y1 - y, coarse ? 0.5 : 0.22 + rng() * 0.18);
    const yc = y + h / 2, lean = batter * (1 - (yc - y0) / H);
    let u = u0 - (row % 2 ? 0.25 : 0);
    while (u < u1 - 0.05) {
      const run = coarse ? u1 - u : 0.8 + rng() * 1.3;
      const a = Math.max(u0, u), b = Math.min(u1, u + run);
      if (b - a > 0.08) {
        const o = lean + 0.02 + (rng() - 0.5) * 0.035, k = 0.86 + rng() * 0.22;
        const lichen = opts.lichen && rng() < 0.18;
        const tint: Rgb = lichen ? [k * opts.lichen![0], k * opts.lichen![1], k * opts.lichen![2]] : opts.tone ? [k * opts.tone[0], k * opts.tone[1], k * opts.tone[2]] : [k, k, k * 0.98];
        // (a run's ends and underside lie against its neighbours: only its face and its top ledge are drawn)
        faceBox(sink, bucket, face, (a + b) / 2, yc, o / 2, b - a - 0.02, h - 0.025, o, { decor: true, tint }, { ends: true, bottom: true });
      }
      u += run;
    }
    y += h;
    row++;
  }
}

/**
 * A row of net-drying poles from (x0, z) to (x1, z): `n` round poles sunk into the ground, a crossbar at each head and a
 * head rail along them, recorded as an open frame (lattice.ts recordLattice) so the rack falls as its poles and rails
 * (damage.ts describeLattice, latticeFall.ts collapseLattice) instead of being masked away with the yard's loft. The
 * poles are structure (a hull stops at them); the bars and the rail dressing. Returns the rail's height.
 */
export function netRack(sink: PartSink, x0: number, x1: number, z: number, n: number, height: number, pole: Rgb,
  opts: { bar?: number; along?: 'x' | 'z' } = {}): number {
  const bar = opts.bar ?? 0.5, alongZ = opts.along === 'z';
  const at = (t: number, y: number, o = 0): Vec3 => (alongZ ? [z + o, y, t] : [t, y, z + o]);
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (let k = 0; k < n; k++) {
    const t = x0 + (x1 - x0) * (n === 1 ? 0.5 : k / (n - 1));
    const foot = at(t, -0.35), head = at(t, height);
    sink.cylinder('structureWood', foot, 'y', height + 0.35, 0.075, 7, { colour: shade(pole, 0.92 + (k % 3) * 0.05) }, 0.06);
    // the crossbar at the head, lashed across the pole
    sink.member('structureWood', at(t, height - 0.12, -bar), at(t, height - 0.12, bar), 0.07, 0.06, alongZ ? [0, 0, 1] : [1, 0, 0], { colour: shade(pole, 0.85), decor: true, exposed: true }, 0);
    legs.push({ foot, head });
  }
  // the head rail along the poles' tops, seated on them (its section from 4 cm under their heads to 3 cm over)
  sink.member('structureWood', at(x0 - 0.08, height - 0.04), at(x1 + 0.08, height - 0.04), 0.07, 0.07, [0, 1, 0], { colour: shade(pole, 0.8), decor: true, exposed: true }, 0);
  recordLattice(sink, legs, [height - 0.12, height], 0.15, 'structureWood', pole, null);
  return height - 0.005;
}

/**
 * A net hung over a rail to dry, from (xa) to (xb) along the rail at height `y` on the line z: two falls either side of
 * the rail, each sagging between its ends and spreading at its foot, both faces of the mesh drawn (it is seen from
 * both sides), the cork floats along its head rope. `along` 'z' turns the rail along z. Dressing.
 */
export function hungNet(sink: PartSink, xa: number, xb: number, y: number, z: number, colour: Rgb, rng: () => number,
  opts: { along?: 'x' | 'z'; floats?: Rgb | null; foot?: number } = {}): void {
  const alongZ = opts.along === 'z';
  const at = (t: number, yy: number, o: number): Vec3 => (alongZ ? [z + o, yy, t] : [t, yy, z + o]);
  for (const side of [-1, 1]) {
    const sag = 0.1 + rng() * 0.12, foot = (opts.foot ?? 0.45) + rng() * 0.3, spread = side * (0.18 + rng() * 0.16);
    const xm = (xa + xb) / 2 + (rng() - 0.5) * 0.3;
    // (its head rope over the rail: the falls' tops lie against the rail's sides)
    const a = at(xa, y, side * 0.03), b = at(xb, y, side * 0.03), m = at(xm, y - sag, side * 0.06);
    const d = at(xa + 0.05, foot + 0.08, spread), c = at(xb - 0.05, foot, spread * 1.05), mf = at(xm, foot - 0.08, spread * 1.15);
    const tone1 = shade(colour, 0.9 + rng() * 0.14), tone2 = shade(colour, 0.9 + rng() * 0.14);
    // the corners counter-clockwise seen from outside (away from the rail): the far side wound the other way
    const quads: Vec3[][] = side < 0 ? [[a, m, mf, d], [m, b, c, mf]] : [[d, mf, m, a], [mf, c, b, m]];
    // (on a rail along z the outward sense flips with the frame's handedness)
    const flip = alongZ;
    quads.forEach((q, k) => {
      const o = { colour: k ? tone2 : tone1, decor: true } as EmitOptions;
      const [p0, p1, p2, p3] = flip ? [q[3], q[2], q[1], q[0]] : q;
      sink.quad('structureWood', p0, p1, p2, p3, o);
      // the mesh's other face, a centimetre in toward the rail, wound back
      const n = (v: Vec3): Vec3 => (alongZ ? [v[0] - side * 0.012, v[1], v[2]] : [v[0], v[1], v[2] - side * 0.012]);
      sink.quad('structureWood', n(p3), n(p2), n(p1), n(p0), { colour: shade(k ? tone2 : tone1, 0.78), decor: true, fine: true });
    });
  }
  if (opts.floats !== null) {
    const cork = opts.floats ?? [0.71, 0.6, 0.43];
    for (let t = Math.min(xa, xb) + 0.25; t < Math.max(xa, xb) - 0.15; t += 0.4) {
      const p = at(t, y - 0.09, 0);
      sink.span('structureWood', p[0] - 0.06, p[1] - 0.04, p[2] - 0.1, p[0] + 0.06, p[1] + 0.04, p[2] + 0.1, { colour: cork, decor: true, fine: true });
    }
  }
}

/**
 * A slip from a boathouse's doors down to the water: a ramp of setts between two kerbs of dressed stone, `w` wide, from
 * (cx, yTop, z0) at the doors down to (cx, yFoot, z1), the timber runners the keel slides on laid along it. Structure
 * (the ramp and kerbs are ground a hull drives on); the runners dressing. Returns nothing.
 */
export function slipway(sink: PartSink, cx: number, w: number, z0: number, z1: number, yTop: number, yFoot: number, runner: Rgb,
  opts: { kerb?: number; runners?: number; mobile?: boolean } = {}): void {
  const kerb = opts.kerb ?? 0.32, len = Math.abs(z1 - z0), sgn = Math.sign(z1 - z0) || 1;
  if (len < 0.3) return;
  // the ramp: its top a plane from the door's sill to the foot, a sett course's depth thick, its foot sunk
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const top0: Vec3 = [x0, yTop, z0], foot0: Vec3 = [x0, yFoot, z1];
  const lo = Math.min(yFoot, yTop) - 0.4;
  // (counter-clockwise seen from +x: prism's rule)
  const pts: Vec3[] = sgn > 0 ? [foot0, [x0, lo, z1], [x0, lo, z0], top0] : [top0, [x0, lo, z0], [x0, lo, z1], foot0];
  sink.prism('stone', pts, [1, 0, 0], x1 - x0, { tint: [0.9, 0.9, 0.88] });
  // the kerbs: dressed blocks either side, stepping down with the ramp
  const steps = Math.max(2, Math.round(len / 1.1));
  for (const side of [-1, 1]) {
    const kx = side < 0 ? x0 - kerb : x1;
    for (let k = 0; k < steps; k++) {
      const za = z0 + sgn * len * k / steps, zb = z0 + sgn * len * (k + 1) / steps;
      const yy = yTop + (yFoot - yTop) * ((k + 0.5) / steps) + 0.14;
      sink.span('stone', kx, lo, Math.min(za, zb) + 0.006, kx + kerb, yy, Math.max(za, zb) - 0.006, { tint: [0.95 + (k % 2) * 0.06, 0.95, 0.93] });
    }
  }
  if (opts.mobile) return;
  // the runners the keel slides on, spiked to the setts
  const n = opts.runners ?? 2;
  for (let k = 0; k < n; k++) {
    const x = cx + (n === 1 ? 0 : (k / (n - 1) - 0.5) * w * 0.55);
    sink.member('structureWood', [x, yTop + 0.06, z0 + sgn * 0.1], [x, yFoot + 0.06, z1], 0.14, 0.09, [0, 1, 0], { colour: shade(runner, 0.9 + k * 0.08), decor: true, exposed: true }, 0.02);
  }
}

/** A pole leant against a wall (an oar, a boathook, a sweep): from its foot on the ground at (u, out) up the face. */
export function leantPole(sink: PartSink, face: Face, u: number, out: number, length: number, lean: number, colour: Rgb, blade = false): void {
  const foot = facePoint(face, u, 0, out), top = facePoint(face, u + lean * 0.3, Math.sqrt(Math.max(0.1, length * length - out * out)), 0.04);
  sink.member('structureWood', foot, top, 0.045, 0.045, face.out, { colour, decor: true, exposed: true, fine: true }, 0);
  if (blade) {
    // the blade at its foot: a flat board along the loom
    const t = 0.3 / length, b0 = [foot[0] + (top[0] - foot[0]) * 0.02, foot[1] + 0.02, foot[2] + (top[2] - foot[2]) * 0.02] as Vec3;
    const b1: Vec3 = [foot[0] + (top[0] - foot[0]) * t * 2.2, foot[1] + (top[1] - foot[1]) * t * 2.2, foot[2] + (top[2] - foot[2]) * t * 2.2];
    sink.member('structureWood', b0, b1, 0.13, 0.02, face.out, { colour, decor: true, exposed: true, fine: true }, 0);
  }
}
