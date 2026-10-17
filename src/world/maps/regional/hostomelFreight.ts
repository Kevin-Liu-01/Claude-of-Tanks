// src/world/maps/regional/hostomelFreight.ts — Kestrel Airfield's container rows (the Hostomel kit's containerRow; the
// looks lane's r2 sub-stream, 2026-10-16). Extract-then-own: hostomel.ts freightBoxes and its liveries moved here byte for
// byte (Lane B's kit keeps one import and its builder-table line); the kit helpers it paints with copied; then the boxes
// rebuilt as ISO containers (the r2 sweep: "the container shell is one span and span ribs", "a dark blast-hole plate").
import { PartSink, pick, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from './geometry.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';

// --- the Hostomel kit's helpers (hostomel.ts, copied) ----------------------------------------------------------------

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

// --- the container, as built -------------------------------------------------------------------------------------------

/** ISO 668 twenty-foot box: length, width, height (m). */
const L = 6.06, WB = 2.44, H = 2.59;
/** The corner posts' square in plan, the doors' set-back behind the posts' faces. */
const POST = 0.11, DOOR_SET = 0.03;
/** The posts' faces end this far inside the box's edges, so the ring's plan hull is the cube's four corners alone. */
const EDGE = 0.002;
/** The side and end sheets' trapezoidal corrugation: its pitch, depth (36 mm, the ISO side panel's) and crest inset. */
const PITCH = 0.32, DEPTH = 0.036, CREST = 0.01;
/** The roof sheet's pressed ribs across the width: their pitch and height (m). */
const ROOF_PITCH = 0.5, ROOF_DEPTH = 0.02;
const RUST: Rgb = rgb(0x6b3a22), GRIME: Rgb = rgb(0x2e2a24), SOOT: Rgb = rgb(0x141210), ASH: Rgb = rgb(0x6a655e), SCALE: Rgb = rgb(0x7a4426);

const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
const scale3 = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/** A smooth hash noise along one axis (rust streaks) and over a face (scorch patches): no stream. */
function hash1(k: number, salt: number): number {
  let q = Math.imul(k | 0, 374761393) ^ Math.imul(salt | 0, 668265263);
  q = Math.imul(q ^ (q >>> 13), 1274126177);
  return ((q ^ (q >>> 16)) >>> 0) / 4294967296;
}
function noise1(t: number, salt: number): number {
  const k = Math.floor(t), f = t - k, w = f * f * (3 - 2 * f);
  return hash1(k, salt) + (hash1(k + 1, salt) - hash1(k, salt)) * w;
}
function noise2(a: number, b: number, salt: number): number {
  const kb = Math.floor(b), f = b - kb, w = f * f * (3 - 2 * f);
  return noise1(a, salt + kb * 7919) * (1 - w) + noise1(a, salt + (kb + 1) * 7919) * w;
}

/** The corrugation's depth (0 crest .. 1 trough) at a fraction of its pitch: crest, flank, trough, flank. */
function troughAt(f: number): number {
  const t = f - Math.floor(f);
  return t < 0.27 ? 0 : t < 0.5 ? (t - 0.27) / 0.23 : t < 0.77 ? 1 : 1 - (t - 0.77) / 0.23;
}
/** Stops along a corrugated run from a to b (either direction): every corner of every pitch, plus `extra` cuts inside it. */
function runStops(a: number, b: number, pitch: number, extra: readonly number[] = []): Array<{ s: number; tr: number }> {
  const n = Math.max(1, Math.round(Math.abs(b - a) / pitch)), p = (b - a) / n;
  const fr = [0, 0.27, 0.5, 0.77];
  const ss: number[] = [];
  for (let k = 0; k < n; k++) for (const f of fr) ss.push(a + (k + f) * p);
  ss.push(b);
  for (const e of extra) if ((e - a) * (e - b) < 0) ss.push(e);
  const dir = Math.sign(b - a) || 1;
  ss.sort((x, y) => (x - y) * dir);
  const out: Array<{ s: number; tr: number }> = [];
  for (const s of ss) if (!out.length || Math.abs(s - out[out.length - 1].s) > 1e-4) out.push({ s, tr: troughAt((s - a) / p) });
  return out;
}

/** A prism of a convex section (any winding), its far cap toward +dir. */
function prismOf(sink: PartSink, section: readonly Vec3[], dir: Vec3, depth: number, opts: EmitOptions): void {
  const [a, b, c] = section;
  const n: Vec3 = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  const pts = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? [...section].reverse() : [...section];
  sink.prism('structureMetal', pts, dir, depth, opts);
}

/** A quad either way round, facing `out`. */
function quadOut(sink: PartSink, a: Vec3, b: Vec3, c: Vec3, d: Vec3, out: Vec3, opts: EmitOptions): void {
  const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) sink.quad('structureMetal', d, c, b, a, opts);
  else sink.quad('structureMetal', a, b, c, d, opts);
}
function triOut(sink: PartSink, a: Vec3, b: Vec3, c: Vec3, out: Vec3, opts: EmitOptions): void {
  const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) sink.polygon('structureMetal', [c, b, a], opts);
  else sink.polygon('structureMetal', [a, b, c], opts);
}

/** The blast hole torn in a burnt box's +x side: its z span, its y span (the box's frame). */
interface Hole { z0: number; z1: number; y0: number; y1: number }

/**
 * One ISO twenty-foot container in its own frame (x across, y up, z along; its doors to +z), its floor on y = 0.
 *
 * The body is its shell as built: one welded ring of sheet round the plan — the four corner posts at the box's corners,
 * the side walls between them in trapezoidal corrugation (crests a centimetre inside the posts' faces), the blank end
 * corrugated across, the doors' plane set back between the rear posts — standing from the floor to the roof line. It is
 * the box's only structural part: its plan hull and its height are the old cube's, so the collision derived from it is
 * the cube's (structureCollision: a welded component's hull and height). Over it, dressing: the roof sheet ribbed across,
 * the top and bottom side rails, the end rails, the door header and sill, the eight corner castings with their
 * apertures, and the door end — two pressed leaves in their frames, four locking bars on their guides with cam keepers,
 * handles and retainers, the hinges. A burnt box (`hole`) has its side torn open: the sheet cut away, its edges torn into
 * tongues curled outward by the blast, the sooted hold behind it (its far wall's corrugation, floor and roof), the paint
 * burnt off in scale and ash and the soot heaviest round the hole.
 */
function container(sink: PartSink, col: Rgb, burnt: boolean, hole: Hole | null, mobile: boolean, look: () => number, salt: number): void {
  const hw = WB / 2, hl = L / 2;
  const top = H;
  /** The paint at a point of the body (its frame): faded on top, rust run down from the top rail, grime at the foot. */
  const paint = (p: Vec3): Rgb => {
    const along = Math.abs(p[0]) > hw - 0.06 ? p[2] : p[0];
    const up = Math.max(0, Math.min(1, p[1] / H));
    if (burnt) {
      const patch = noise2(along * 1.7 + p[0] * 0.3, p[1] * 1.9, salt);
      let c = mix(col, SCALE, Math.max(0, patch - 0.5) * 1.6);
      c = mix(c, ASH, Math.max(0, 0.42 - patch) * 1.4 * up);
      if (hole) {
        const dz = Math.max(0, Math.abs(p[2] - (hole.z0 + hole.z1) / 2) - (hole.z1 - hole.z0) / 2);
        const dy = Math.max(0, Math.abs(p[1] - (hole.y0 + hole.y1) / 2) - (hole.y1 - hole.y0) / 2);
        const near = p[0] > 0 ? Math.hypot(dz, dy * 0.6) : 9;
        c = mix(c, SOOT, Math.max(0, 1 - near / 0.9) * 0.85);
      }
      return c;
    }
    let c = mix(col, scale3(col, 1.16), Math.max(0, up - 0.62) * 1.2);
    const streak = noise1(along / 0.35, salt);
    c = mix(c, RUST, Math.max(0, streak - 0.55) * 1.6 * Math.pow(up, 1.8));
    // rust bleeding from the corner castings down the posts
    const corner = Math.min(Math.abs(Math.abs(p[2]) - hl), Math.abs(Math.abs(p[0]) - hw)) < 0.14 && Math.abs(Math.abs(p[2]) - hl) < 0.3 ? 1 : 0;
    c = mix(c, RUST, corner * 0.35 * up);
    return mix(c, mix(GRIME, RUST, 0.5), Math.max(0, 1 - p[1] / 0.45) * 0.5);
  };
  const sheet: EmitOptions = { colourAt: paint };
  const frameC = scale3(col, burnt ? 0.85 : 0.8);
  const frameAt = (p: Vec3): Rgb => { const c = paint(p); return [c[0] * 0.82, c[1] * 0.82, c[2] * 0.82]; };

  // ---- the ring: posts, sides, blank end, doors' plane (the structure)
  type Pt = { x: number; z: number };
  const ring: Pt[] = [];
  const holeZ = hole ? [hole.z0, hole.z1] : [];
  ring.push({ x: -hw + POST, z: hl - DOOR_SET }, { x: hw - POST, z: hl - DOOR_SET });
  ring.push({ x: hw - POST, z: hl - EDGE }, { x: hw, z: hl }, { x: hw - EDGE, z: hl - POST });
  for (const st of runStops(hl - POST, -hl + POST, PITCH, holeZ)) ring.push({ x: hw - CREST - DEPTH * st.tr, z: st.s });
  ring.push({ x: hw - EDGE, z: -hl + POST }, { x: hw, z: -hl }, { x: hw - POST, z: -hl + EDGE });
  for (const st of runStops(hw - POST, -hw + POST, PITCH)) ring.push({ x: st.s, z: -hl + CREST + DEPTH * st.tr });
  ring.push({ x: -hw + POST, z: -hl + EDGE }, { x: -hw, z: -hl }, { x: -hw + EDGE, z: -hl + POST });
  for (const st of runStops(-hl + POST, hl - POST, PITCH)) ring.push({ x: -hw + CREST + DEPTH * st.tr, z: st.s });
  ring.push({ x: -hw + EDGE, z: hl - POST }, { x: -hw, z: hl }, { x: -hw + POST, z: hl - EDGE });
  const inHole = (a: Pt, b: Pt): boolean => !!hole && a.x > 0 && b.x > 0 && Math.min(a.z, b.z) >= hole.z0 - 1e-4 && Math.max(a.z, b.z) <= hole.z1 + 1e-4;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-4) continue;
    const strip = (y0: number, y1: number) => sink.quad('structureMetal', [a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z], sheet);
    if (hole && inHole(a, b)) { strip(0, hole.y0); strip(hole.y1, top); } else strip(0, top);
  }

  // ---- the roof and the floor: the cube's own top and bottom faces (their corners the ring's, so welded to it: the
  // collision's projection and the stacked boxes' decks are the cube's, structureCollision.ts structureDecks)
  sink.quad('structureMetal', [-hw, top, hl], [hw, top, hl], [hw, top, -hl], [-hw, top, -hl], sheet);
  sink.quad('structureMetal', [-hw, 0, -hl], [hw, 0, -hl], [hw, 0, hl], [-hw, 0, hl], sheet);
  // the roof sheet's pressed ribs across the width (dressing, every tier)
  {
    const n = Math.max(1, Math.round((2 * hl - 0.4) / ROOF_PITCH)), p = (2 * hl - 0.4) / n;
    for (let k = 0; k <= n; k++) {
      const z = -hl + 0.2 + k * p;
      // (its ends run into the side rails: no caps; its foot on the sheet: no underside)
      const x0 = -hw + 0.05, x1 = hw - 0.05, yt = top + ROOF_DEPTH * 0.3, rib = { colourAt: paint, decor: true };
      const sec: Array<[number, number]> = [[z - 0.1, top], [z - 0.05, yt], [z, yt + 0.002], [z + 0.05, yt], [z + 0.1, top]];
      for (let i = 0; i + 1 < sec.length; i++) {
        const [za, ya] = sec[i], [zb, yb] = sec[i + 1];
        quadOut(sink, [x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb], [0, zb - za, -(yb - ya)], rib);
      }
    }
  }

  // ---- the torn hole: the sheet's tongues curled out round it, the sooted hold behind it (every tier)
  if (hole) {
    const xw = (z: number): number => hw - CREST - DEPTH * troughAt((z - (hl - POST)) / -((2 * hl - 2 * POST) / Math.max(1, Math.round((2 * hl - 2 * POST) / PITCH))));
    const burntIn: Rgb = scale3(SOOT, 0.9);
    const tongue = (b0: Vec3, b1: Vec3, d: Vec3, len: number, t1: number, t2: number) => {
      const n: Vec3 = [1, 0, 0];
      const seg = (t: number, r: number): Vec3 => [d[0] * r * Math.cos(t) + n[0] * r * Math.sin(t), d[1] * r * Math.cos(t) + n[1] * r * Math.sin(t), d[2] * r * Math.cos(t) + n[2] * r * Math.sin(t)];
      const lerp = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
      const s1 = seg(t1, len * 0.55), s2 = seg(t2, len * 0.45);
      const m0 = add(lerp(b0, b1, 0.18), s1), m1 = add(lerp(b0, b1, 0.82), s1), tip = add(add(lerp(b0, b1, 0.5 + (look() - 0.5) * 0.3), s1), s2);
      // the sheet's painted face turned out with the tongue; its sooted inside behind
      const out1: Vec3 = [Math.cos(t1), -d[1] * Math.sin(t1), -d[2] * Math.sin(t1)];
      const out2: Vec3 = [Math.cos(t2), -d[1] * Math.sin(t2), -d[2] * Math.sin(t2)];
      const face = { colourAt: paint, decor: true };
      quadOut(sink, b0, b1, m1, m0, out1, face);
      triOut(sink, m0, m1, tip, out2, face);
      quadOut(sink, b0, b1, m1, m0, [-out1[0], -out1[1], -out1[2]], { colour: burntIn, decor: true });
      triOut(sink, m0, m1, tip, [-out2[0], -out2[1], -out2[2]], { colour: burntIn, decor: true });
    };
    const zw = hole.z1 - hole.z0, yh = hole.y1 - hole.y0;
    const curl = () => {
      const t1 = (52 + look() * 38) * Math.PI / 180;
      return [t1, t1 + (30 + look() * 45) * Math.PI / 180] as const;
    };
    // the bottom and top edges (the tongues' bases follow the corrugation), then the two sides
    for (const [y, dy] of [[hole.y0, 1], [hole.y1, -1]] as const) {
      const k = Math.max(3, Math.round(zw / 0.17));
      for (let j = 0; j < k; j++) {
        const za = hole.z0 + zw * j / k, zb = hole.z0 + zw * (j + 1) / k;
        const [t1, t2] = curl();
        tongue([xw(za), y, za], [xw(zb), y, zb], [0, dy, 0], Math.min(yh * 0.42, 0.07 + look() * 0.2), t1, t2);
      }
    }
    for (const [z, dz] of [[hole.z0, 1], [hole.z1, -1]] as const) {
      const k = Math.max(3, Math.round(yh / 0.17)), x = xw(z);
      for (let j = 0; j < k; j++) {
        const ya = hole.y0 + yh * j / k, yb = hole.y0 + yh * (j + 1) / k;
        const [t1, t2] = curl();
        tongue([x, ya, z], [x, yb, z], [0, 0, dz], Math.min(zw * 0.38, 0.06 + look() * 0.18), t1, t2);
      }
    }
    // the hold: the far wall's corrugation seen from inside, the floor, the roof's underside and two ends, all sooted
    const zb0 = Math.max(-hl + POST + 0.02, hole.z0 - 0.7), zb1 = Math.min(hl - POST - 0.02, hole.z1 + 0.7);
    const xo = hw - CREST - DEPTH - 0.004, yf = 0.12, yc = top - 0.07;
    const holdAt = (p: Vec3): Rgb => mix(scale3(SOOT, 1.2), ASH, Math.max(0, noise2(p[2] * 2.1, p[1] * 2.3 + p[0], salt + 17) - 0.62) * 1.4);
    const hold = { colourAt: holdAt, decor: true };
    const back = runStops(zb0, zb1, PITCH);
    // (the far wall's inner face: its crests the deepest, a sheet's breadth inside the ring's troughs)
    const xin = (tr: number) => -hw + CREST + DEPTH + 0.004 + 0.03 * tr;
    for (let i = 0; i + 1 < back.length; i++) {
      const a = back[i], b = back[i + 1];
      quadOut(sink, [xin(a.tr), yf, a.s], [xin(b.tr), yf, b.s], [xin(b.tr), yc, b.s], [xin(a.tr), yc, a.s], [1, 0, 0], hold);
    }
    const xl = xin(back[0].tr), xr = xin(back[back.length - 1].tr);
    quadOut(sink, [xl, yf, zb0], [xo, yf, zb0], [xo, yf, zb1], [xr, yf, zb1], [0, 1, 0], hold);
    quadOut(sink, [xl, yc, zb0], [xo, yc, zb0], [xo, yc, zb1], [xr, yc, zb1], [0, -1, 0], hold);
    quadOut(sink, [xl, yf, zb0], [xo, yf, zb0], [xo, yc, zb0], [xl, yc, zb0], [0, 0, 1], hold);
    quadOut(sink, [xr, yf, zb1], [xo, yf, zb1], [xo, yc, zb1], [xr, yc, zb1], [0, 0, -1], hold);
    // the floor's cross-members and the plywood burnt through between them
    for (let z = zb0 + 0.2; z < zb1 - 0.1; z += 0.6) {
      prismOf(sink, [[xl + 0.02, yf, z - 0.04], [xl + 0.02, yf, z + 0.04], [xl + 0.02, yf + 0.03, z + 0.02], [xl + 0.02, yf + 0.03, z - 0.02]] as Vec3[],
        [1, 0, 0], xo - xl - 0.04, { colour: scale3(ASH, 0.5), decor: true });
    }
  }

  if (mobile) return;

  // ---- the frame: top and bottom side rails, end rails, door header and sill (sections chamfered)
  const xi = hw - CREST - DEPTH - 0.006;
  for (const sx of [-1, 1]) {
    const X = (x: number) => sx * x;
    prismOf(sink, [[X(xi), 0, -hl + POST], [X(hw), 0, -hl + POST], [X(hw), 0.135, -hl + POST], [X(hw - 0.022), 0.16, -hl + POST], [X(xi), 0.16, -hl + POST]] as Vec3[],
      [0, 0, 1], 2 * (hl - POST), { colourAt: frameAt, decor: true });
    prismOf(sink, [[X(xi), top - 0.1, -hl + POST], [X(hw - 0.016), top - 0.1, -hl + POST], [X(hw), top - 0.084, -hl + POST], [X(hw), top + 0.008, -hl + POST], [X(xi), top + 0.008, -hl + POST]] as Vec3[],
      [0, 0, 1], 2 * (hl - POST), { colourAt: frameAt, decor: true });
  }
  {
    // the blank end's rails (-z) and the door end's header and sill (+z)
    const zi = -hl + CREST + DEPTH + 0.006;
    prismOf(sink, [[-hw + POST, 0, zi], [-hw + POST, 0, -hl], [-hw + POST, 0.13, -hl], [-hw + POST, 0.155, -hl + 0.02], [-hw + POST, 0.155, zi]] as Vec3[],
      [1, 0, 0], 2 * (hw - POST), { colourAt: frameAt, decor: true });
    prismOf(sink, [[-hw + POST, top - 0.12, zi], [-hw + POST, top - 0.12, -hl + 0.016], [-hw + POST, top - 0.104, -hl], [-hw + POST, top + 0.008, -hl], [-hw + POST, top + 0.008, zi]] as Vec3[],
      [1, 0, 0], 2 * (hw - POST), { colourAt: frameAt, decor: true });
    const zd = hl - DOOR_SET - 0.004;
    prismOf(sink, [[-hw + POST, 0, zd], [-hw + POST, 0, hl], [-hw + POST, 0.12, hl], [-hw + POST, 0.15, hl - 0.02], [-hw + POST, 0.15, zd]] as Vec3[],
      [1, 0, 0], 2 * (hw - POST), { colourAt: frameAt, decor: true });
    prismOf(sink, [[-hw + POST, top - 0.22, zd], [-hw + POST, top - 0.22, hl - 0.018], [-hw + POST, top - 0.2, hl], [-hw + POST, top + 0.008, hl], [-hw + POST, top + 0.008, zd]] as Vec3[],
      [1, 0, 0], 2 * (hw - POST), { colourAt: frameAt, decor: true });
  }
  // ---- the eight corner castings: blocks chamfered on their inner corner, proud of the posts, their apertures dark
  const castC = burnt ? scale3(SOOT, 1.6) : mix(scale3(col, 0.55), RUST, 0.35);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const lo of [true, false]) {
    const ox = sx * (hw + 0.005), oz = sz * (hl + 0.005), ix = sx * (hw - 0.162), iz = sz * (hl - 0.178);
    const y0 = lo ? 0 : top - 0.118, h = lo ? 0.118 : 0.128;
    const plan: Array<[number, number]> = [[ox, oz], [ix + sx * 0.03, oz], [ix, oz - sz * 0.03], [ix, iz], [ox, iz]];
    for (let i = 0; i < plan.length; i++) {
      const [xa, za] = plan[i], [xb, zb] = plan[(i + 1) % plan.length];
      const mx = (xa + xb) / 2 - (ox + ix) / 2, mz = (za + zb) / 2 - (oz + iz) / 2;
      quadOut(sink, [xa, y0, za], [xb, y0, zb], [xb, y0 + h, zb], [xa, y0 + h, za], [mx, 0, mz], { colour: castC, decor: true });
    }
    const lid = plan.map(([x, z]): Vec3 => [x, y0 + h, z]);
    sink.polygon('structureMetal', sx * sz > 0 ? lid.reverse() : lid, { colour: castC, decor: true });
    const yc = y0 + h / 2, dk: EmitOptions = { colour: [0.02, 0.02, 0.02], decor: true, fine: true };
    const cz = (oz + iz) / 2, cx = (ox + ix) / 2;
    quadOut(sink, [ox + sx * 0.001, yc - 0.025, cz - 0.037], [ox + sx * 0.001, yc - 0.025, cz + 0.037], [ox + sx * 0.001, yc + 0.025, cz + 0.037], [ox + sx * 0.001, yc + 0.025, cz - 0.037], [sx, 0, 0], dk);
    quadOut(sink, [cx - 0.037, yc - 0.025, oz + sz * 0.001], [cx + 0.037, yc - 0.025, oz + sz * 0.001], [cx + 0.037, yc + 0.025, oz + sz * 0.001], [cx - 0.037, yc + 0.025, oz + sz * 0.001], [0, 0, sz], dk);
    if (!lo) quadOut(sink, [cx - 0.05, top + 0.0102, cz - 0.03], [cx + 0.05, top + 0.0102, cz - 0.03], [cx + 0.05, top + 0.0102, cz + 0.03], [cx - 0.05, top + 0.0102, cz + 0.03], [0, 1, 0], dk);
  }

  // ---- the door end: two pressed leaves in their frames, the locking gear, the hinges
  const zl = hl - DOOR_SET;
  const leafAt = (p: Vec3): Rgb => { const c = paint(p); return [c[0] * 0.94, c[1] * 0.94, c[2] * 0.94]; };
  const y0 = 0.15, y1 = top - 0.22;
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -hw + POST + 0.004 : 0.006, xb = s < 0 ? -0.006 : hw - POST - 0.004;
    // the pressed panel: horizontal ribs over its height, inside the leaf's frame
    const stops = runStops(y0 + 0.07, y1 - 0.07, (y1 - y0 - 0.14) / 5);
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i], b = stops[i + 1];
      const za = zl + 0.004 + 0.022 * (1 - a.tr), zb = zl + 0.004 + 0.022 * (1 - b.tr);
      sink.quad('structureMetal', [xa + 0.05, a.s, za], [xb - 0.05, a.s, za], [xb - 0.05, b.s, zb], [xa + 0.05, b.s, zb], { colourAt: leafAt, decor: true });
    }
    // the leaf's frame: stiles and rails 3 cm proud
    const fo: EmitOptions & { ends?: boolean } = { colourAt: frameAt, decor: true };
    sink.member('structureMetal', [xa + 0.025, y0, zl], [xa + 0.025, y1, zl], 0.05, 0.034, [0, 0, 1], fo, 0);
    sink.member('structureMetal', [xb - 0.025, y0, zl], [xb - 0.025, y1, zl], 0.05, 0.034, [0, 0, 1], fo, 0);
    sink.member('structureMetal', [xa + 0.05, y0 + 0.035, zl], [xb - 0.05, y0 + 0.035, zl], 0.07, 0.03, [0, 0, 1], fo, 0);
    sink.member('structureMetal', [xa + 0.05, y1 - 0.035, zl], [xb - 0.05, y1 - 0.035, zl], 0.07, 0.03, [0, 0, 1], fo, 0);
    // the leaves' meeting seam, its gasket dark between them
    if (s > 0) sink.quad('structureMetal', [-0.006, y0, zl + 0.002], [0.006, y0, zl + 0.002], [0.006, y1, zl + 0.002], [-0.006, y1, zl + 0.002], { colour: [0.03, 0.03, 0.03], decor: true, fine: true });
    // the locking bars (two a leaf) on their guides, their cams in the keepers on header and sill, the handles
    const bar = burnt ? scale3(SOOT, 2.2) : rgb(0x8a8a84);
    for (const f of [0.26, 0.74]) {
      const x = xa + (xb - xa) * (s < 0 ? f : 1 - f), zb = zl + 0.062;
      sink.cylinder('structureMetal', [x, y0 - 0.1, zb], 'y', y1 - y0 + 0.2, 0.016, 6, { colour: bar, decor: true }, 0.016, false);
      for (const gy of [0.7, 1.8]) sink.member('structureMetal', [x - 0.04, gy, zl + 0.034], [x + 0.04, gy, zl + 0.034], 0.05, 0.05, [0, 0, 1], { colour: bar, decor: true, fine: true }, 0);
      for (const ky of [y0 - 0.06, y1 + 0.06]) sink.member('structureMetal', [x - 0.045, ky, hl - 0.005], [x + 0.045, ky, hl - 0.005], 0.07, 0.05, [0, 0, 1], { colour: bar, decor: true, fine: true }, 0);
      const hx = x + (s < 0 ? 0.16 : -0.16);
      sink.member('structureMetal', [x, 1.16, zb + 0.02], [hx, 1.0, zb + 0.02], 0.035, 0.02, [0, 0, 1], { colour: bar, decor: true, fine: true }, 0);
      sink.member('structureMetal', [hx - 0.03, 1.02, zl + 0.034], [hx + 0.03, 1.02, zl + 0.034], 0.07, 0.03, [0, 0, 1], { colour: bar, decor: true, fine: true }, 0);
    }
    // the hinges on the leaf's outer edge, their knuckles on the corner post
    const hx = s * (hw - POST + 0.012);
    for (const hy of [0.32, 0.98, 1.62, 2.18]) {
      sink.member('structureMetal', [hx, hy - 0.06, zl + 0.034], [hx, hy + 0.06, zl + 0.034], 0.045, 0.03, [0, 0, 1], { colour: scale3(frameC, 0.8), decor: true, fine: true }, 0);
      sink.member('structureMetal', [hx - s * 0.02, hy, zl + 0.034], [hx - s * 0.18, hy, zl + 0.034], 0.05, 0.012, [0, 0, 1], { colour: scale3(frameC, 0.9), decor: true, fine: true }, 0);
    }
  }
}

/** A sandbag lying along x: a pillow, its section a flattened hexagon, its ends gathered (structure: the line's wall). */
function sandbag(sink: PartSink, cx: number, y: number, cz: number, colour: Rgb): void {
  const len = 0.6, d = 0.44, h = 0.23;
  const section = (k: number, kh: number): Array<[number, number]> => [
    [-d / 2 * k, h * 0.45], [-d * 0.36 * k, 0], [d * 0.36 * k, 0], [d / 2 * k, h * 0.45], [d * 0.36 * k, h * kh], [-d * 0.36 * k, h * kh],
  ];
  const stations: Array<[number, number, number]> = [[-len / 2, 0.72, 0.72], [-len / 2 + 0.11, 1, 1], [len / 2 - 0.11, 1, 1], [len / 2, 0.72, 0.72]];
  const rings = stations.map(([x, k, kh]) => section(k, kh).map(([z, yy]): Vec3 => [cx + x, y + yy, cz + z]));
  const tone = (i: number): Rgb => scale3(colour, i === 1 || i === 2 ? 1 : 0.9);
  for (let s = 0; s + 1 < rings.length; s++) {
    const a = rings[s], b = rings[s + 1];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      // the section runs clockwise seen from +x: a face's outward normal is (b - a) x (next - a)
      sink.quad('structureMetal', a[i], b[i], b[j], a[j], { colour: tone(s) });
    }
  }
  sink.polygon('structureMetal', [...rings[0]], { colour: scale3(colour, 0.86) });
  sink.polygon('structureMetal', [...rings[3]].reverse(), { colour: scale3(colour, 0.86) });
}

/** The dunnage a ground box stands on: a creosoted sleeper across each end under its castings, bedded in the ground. */
const SLEEPER: Rgb = rgb(0x3a3128);
function dunnage(sink: PartSink): void {
  for (const end of [-1, 1]) {
    const z = end * (L / 2 - 0.36);
    sink.span('structureWood', -WB / 2 - 0.14, -0.34, z - 0.12, WB / 2 + 0.14, -0.002, z + 0.12, { colour: SLEEPER, decor: true });
  }
}

// --- the row ---------------------------------------------------------------------------------------------------------

/**
 * (the looks lane, 2026-10-13; LOOKS-BRIEF section 6: Kestrel Airfield's two container rows drawn by the generic builder)
 * the airport's freight boxes as they stood in March 2022: twenty-foot ISO containers in their lines' faded liveries
 * (no brand marks), a few stacked, rust running from their corner castings, their corrugated sides ribbed, door ends
 * with their locking bars; two of them scorched black by the fires and holed, a line of sandbags along the front of the
 * row where it was used as a wall.
 * (the looks lane's r2 sub-stream, 2026-10-16) Every box built as a container is (`container`: its shell ring of posts and
 * corrugated sheet, its rails, castings, roof and door gear), the burnt ones torn open with the sooted hold behind; the
 * sandbags filled pillows. The build stream draws as it did (the livery, yaw, offsets, burnt and stacked choices and the
 * hole's place and size); the tongues of the torn sheet draw from the look stream.
 */
const BOX_LIVERY: readonly Rgb[] = [0x5f7f96, 0x9a6a3e, 0x6e7f62, 0xa9a49a, 0x7a3b30, 0x4f6672, 0xb08a3e].map(rgb);
export const freightBoxes: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, bb = ctx.bounds, mobile = ctx.tier === 'mobile';
  const W = bb.maxX - bb.minX, D = bb.maxZ - bb.minZ;
  const n = Math.max(2, Math.floor((W + 0.4) / (WB + 0.45)));
  const pitch = (W - 0.2) / n, zc = (bb.minZ + bb.maxZ) / 2 - Math.max(0, D - L - 1.2) * 0.2;
  let salt = 1;
  const box = (x: number, y: number, z: number, yaw: number, livery: Rgb, burnt: boolean) => {
    const col = burnt ? shade(rgb(0x2e2a28), 0.9 + rng() * 0.2) : shade(livery, 0.88 + rng() * 0.18);
    // the blast hole in the +x side (the old plate's draws: its place along the side, its width and height)
    let hole: Hole | null = null;
    if (burnt) {
      const u = (rng() - 0.5) * L * 0.4, w = 0.7 + rng() * 0.4, h = 0.6 + rng() * 0.3;
      hole = { z0: -u - w / 2, z1: -u + w / 2, y0: H * 0.55 - h / 2, y1: H * 0.55 + h / 2 };
    }
    const s = salt++;
    // (the looks lane, 227; the census's world pass: a footprint corner 6 cm over the ground on Kestrel's slope) a box on
    // the ground stands on its dunnage, bedded in (dressing, no draws: the row's collision and stream as they were)
    sink.placed(yaw, x, y, z, () => { container(sink, col, burnt, hole, mobile, look, s * 131 + 7); if (y === 0) dunnage(sink); });
  };
  let burntLeft = 1 + (rng() < 0.5 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const x = bb.minX + 0.1 + pitch * (k + 0.5), yaw = (rng() - 0.5) * 0.06, zOff = (rng() - 0.5) * 0.8;
    const burnt = burntLeft > 0 && rng() < 0.35;
    if (burnt) burntLeft--;
    box(x, 0, zc + zOff, yaw, pick(rng, BOX_LIVERY), burnt);
    if (rng() < 0.4) box(x + (rng() - 0.5) * 0.15, H + 0.005, zc + zOff + (rng() - 0.5) * 0.3, yaw + (rng() - 0.5) * 0.04, pick(rng, BOX_LIVERY), false);
  }
  // the sandbag line along the row's front where it stood as a wall
  const zf = zc + L / 2 + 0.75;
  if (zf + 0.4 < bb.maxZ) {
    // (227) the line's footing: a flattened course of bags bedded under it, so a bag over falling ground still sits on
    // the course (dressing, no draws)
    sink.span('structureMetal', bb.minX + 0.08, -0.26, zf - 0.17, bb.maxX - 0.08, 0.02, zf + 0.17, { colour: shade(rgb(0x8a7c5e), 0.78), decor: true });
    for (let x = bb.minX + 0.4; x < bb.maxX - 0.4; x += 0.62) {
      for (let row = 0; row < 3; row++) {
        const xx = x + (row % 2) * 0.31, y = row * 0.22;
        if (xx > bb.maxX - 0.4) continue;
        sandbag(sink, xx, y, zf, shade(rgb(0x8a7c5e), 0.9 + rng() * 0.15));
      }
    }
  }
  return sink.finish();
};
