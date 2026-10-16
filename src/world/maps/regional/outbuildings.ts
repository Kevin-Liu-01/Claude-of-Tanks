// src/world/maps/regional/outbuildings.ts — the kits' open sheds member by member (props census #17: barns, woodsheds
// and yard sheds; the looks lane's vernacular sub-stream, 2026-10-15).
//
// The judges on every kit's woodshed: "the owner's counter-example class: walls are single flat slabs with only a plank
// print, square posts and a mono-pitch slab roof". The r2 standard for an open shed is its construction: stone pads under
// the posts, sills on the pads, posts, the wall plate and the front beam, knee braces, the rafters with their tails out
// under the eaves, the covering laid in its region's courses (shingle, slate, lauze, plain or canal tile, pantile, sheet),
// barge boards on the verges, the cladding as separate boards (gapped, battened or lapped) nailed to the posts and their
// rails, and the wood stacked in it with its log ends out.
//
// `openShed` lays one in a frame of its own: the back wall at -W/2, the open front at +W/2 (the roof falls to it), the
// ends at z = ±D/2, the ground at y = 0. A kit gives it a dialect (its timber, footing, cladding and covering) and places
// it in its plot (PartSink.placed). Every structural part is a post, a board, a plate or the roof's deck (collision keeps
// them); the courses, battens, braces, rafters and the woodpile are dressing. Draws from the look stream only.
import {
  PartSink, faceBox, facePoint, normalize3, shade, UV_MEMBER,
  type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3,
} from './geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from './house.ts';
import { woodpile } from './dressing.ts';
import { recordShed } from './shedFall.ts';

const DEG = Math.PI / 180;

/** A covering's courses: shingle, slate and lauze lap across the slope; tiles and sheet run down it as well. */
export type ShedCovering = 'shingle' | 'slate' | 'lauze' | 'plaintile' | 'canal' | 'pantile' | 'sheet' | 'thatch';
/** The cladding: boards standing with gaps (air for the wood), boards with battens over their joints, or lapped boards. */
export type ShedCladding = 'gapped' | 'batten' | 'lapped';

export interface ShedDialect {
  /** sills, plates, braces and rafters */
  timber: Rgb;
  /** the posts' section (square, or round poles) and their paint (default the timber's) */
  post: number;
  round?: boolean;
  postColour?: Rgb;
  /** a stone pad under every post and the sills' ends (its top over the ground); null: the posts sunk in the ground */
  pad: { bucket: RegionalBucket; colour?: Rgb; size: number; top: number } | null;
  cladding: ShedCladding;
  /** the boards' tones (each board takes one, shaded a little) and their width; a gapped board's gap */
  boards: readonly Rgb[];
  boardW: number;
  gap?: number;
  /** corner boards, barge boards and fascia (null: the boards' own tone, darker) */
  trim?: Rgb | null;
  /** the battens over a board-and-batten wall's joints (default: the boards' paint, a shade darker) */
  batten?: Rgb;
  covering: ShedCovering;
  /** the covering's bucket ('roof'; 'structureMetal' for sheet, 'straw' for thatch) and a coloured bucket's paint */
  roofBucket: RegionalBucket;
  roofColour?: Rgb;
  /** eave and verge overhangs past the frame and the cladding */
  eave: number;
  verge: number;
}

export interface ShedPlan {
  /** across (back to front) and along, the frame's outer faces */
  W: number;
  D: number;
  /** the front beam's top over the ground and the roof's pitch */
  hLo: number;
  pitchDeg: number;
  /** the back wall and the two ends clad (the front stays open) */
  back: boolean;
  ends: boolean;
  /**
   * the back wall built in stone instead of boards (a Lorraine bûcher's rubble wall, a Savoyard bûcher against its
   * retaining wall): the wall stands from below the ground to the roof's underside, the posts and plate on its face
   */
  stoneBack?: { bucket: RegionalBucket; t: number; colour?: Rgb; coping?: RegionalBucket } | null;
  /** the wood stacked against the back, to this height (0: none) */
  pile: number;
  /** a chopping block and its axe before the shed */
  block?: boolean;
  mobile: boolean;
}

/** What `openShed` laid, for its snow and for the shed's wreck (posts, roof, cladding: the building's frame). */
export interface ShedReading {
  W: number;
  D: number;
  /** the posts' feet and heads and their section */
  posts: Array<{ foot: Vec3; head: Vec3 }>;
  size: number;
  /** the roof's deck: its underside at the low eave, pitch, eaves, verges, and the covering's top over the deck */
  roof: { eaveY: number; pitchDeg: number; eave: number; verge: number; thickness: number; course: number; bucket: RegionalBucket;
    colour: Rgb | null; spec: RoofSpec };
  /** the clad faces' boards (their tone and width) and the stone back */
  boards: { colour: Rgb; width: number; faces: number } | null;
  stone: { bucket: RegionalBucket; t: number; top: number } | null;
  pile: number;
  timber: Rgb;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** the covering's pieces thrown when the shed falls */
const DEBRIS: Readonly<Record<ShedCovering, 'tile' | 'slate' | 'splinter' | 'sheet' | 'straw'>> = {
  shingle: 'splinter', slate: 'slate', lauze: 'slate', plaintile: 'tile', canal: 'tile', pantile: 'tile', sheet: 'sheet', thatch: 'straw',
};

/** The covering's numbers: the course up the slope, its butt (how proud the lower edge stands), segments per course. */
const COURSES: Readonly<Record<ShedCovering, { course: number; butt: number; split: [number, number]; deck: number }>> = {
  shingle: { course: 0.22, butt: 0.028, split: [2, 3], deck: 0.05 },
  slate: { course: 0.2, butt: 0.014, split: [1, 2], deck: 0.045 },
  lauze: { course: 0.36, butt: 0.075, split: [3, 5], deck: 0.07 },
  plaintile: { course: 0.17, butt: 0.016, split: [1, 1], deck: 0.05 },
  canal: { course: 0.34, butt: 0.02, split: [1, 1], deck: 0.06 },
  pantile: { course: 0.3, butt: 0.022, split: [1, 1], deck: 0.05 },
  sheet: { course: 1.8, butt: 0.012, split: [1, 1], deck: 0.03 },
  thatch: { course: 0.3, butt: 0, split: [1, 1], deck: 0.3 },
};

/** A quad whose winding is set by the side it must face (`want`, any vector with a positive dot on its normal). */
function facing(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, c: Vec3, d: Vec3, want: Vec3, opts: EmitOptions): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) sink.quad(bucket, a, b, c, d, opts);
  else sink.quad(bucket, d, c, b, a, opts);
}

/** A board on a face: the polygon (u, y) ccw seen from outside, from `o` to `o + t` out of the face. */
function boardOn(sink: PartSink, bucket: RegionalBucket, face: Face, poly: ReadonlyArray<readonly [number, number]>, o: number, t: number,
  opts: EmitOptions): void {
  sink.prism(bucket, poly.map(([u, y]) => facePoint(face, u, y, o)), face.out, t, { uv: UV_MEMBER, ...opts });
}

/**
 * The roof's top surface as a frame: v metres up the slope from the low eave's edge, h out of the covering's deck,
 * z along. The courses are laid in it.
 */
interface SlopeFrame { at(v: number, h: number, z: number): Vec3; up: Vec3; n: Vec3; length: number; z0: number; z1: number }

function slopeFrame(W: number, D: number, eaveY: number, roof: RoofSpec): SlopeFrame {
  const tanP = Math.tan(roof.pitchDeg * DEG), cosP = Math.cos(roof.pitchDeg * DEG), sinP = Math.sin(roof.pitchDeg * DEG);
  const x0 = W / 2 + roof.eave, y0 = eaveY - roof.eave * tanP + roof.thickness / cosP;
  const up: Vec3 = [-cosP, sinP, 0], n: Vec3 = [sinP, cosP, 0];
  return {
    at: (v, h, z) => [x0 + up[0] * v + n[0] * h, y0 + up[1] * v + n[1] * h, z],
    up, n, length: (W + 2 * roof.eave) / cosP, z0: -D / 2 - roof.verge, z1: D / 2 + roof.verge,
  };
}

/** One course segment: a wedge lying on the deck from v0 to v1, its butt `butt` proud at v0, its tail `tail` at v1. */
function courseWedge(sink: PartSink, bucket: RegionalBucket, f: SlopeFrame, v0: number, v1: number, za: number, zb: number,
  butt: number, tail: number, opts: EmitOptions): void {
  const down: Vec3 = [-f.up[0], -f.up[1], -f.up[2]];
  facing(sink, bucket, f.at(v0, 0, za), f.at(v0, 0, zb), f.at(v0, butt, zb), f.at(v0, butt, za), down, opts);
  facing(sink, bucket, f.at(v0, butt, za), f.at(v0, butt, zb), f.at(v1, tail, zb), f.at(v1, tail, za), f.n, opts);
  for (const [z, s] of [[za, -1], [zb, 1]] as const) {
    facing(sink, bucket, f.at(v0, 0, z), f.at(v1, 0, z), f.at(v1, tail, z), f.at(v0, butt, z), [0, 0, s], opts);
  }
}

/** A half-round run down the slope (a canal tile's cover row, a pantile's roll): `r` its radius, from v0 to v1 at z. */
function rollRun(sink: PartSink, bucket: RegionalBucket, f: SlopeFrame, z: number, r: number, v0: number, v1: number, segs: number,
  opts: EmitOptions, mouth: boolean): void {
  const ring = (v: number): Vec3[] => Array.from({ length: segs + 1 }, (_, i) => {
    const a = Math.PI * i / segs;
    return f.at(v, Math.sin(a) * r * 0.8, z + Math.cos(a) * r);
  });
  const lo = ring(v0), hi = ring(v1);
  for (let i = 0; i < segs; i++) {
    const a = Math.PI * (i + 0.5) / segs;
    const want: Vec3 = [f.n[0] * Math.sin(a), f.n[1] * Math.sin(a), Math.cos(a)];
    facing(sink, bucket, lo[i], lo[i + 1], hi[i + 1], hi[i], want, opts);
  }
  // the mouth at the eave: the tile's open end, its dark hollow behind the arc
  if (mouth) {
    const down: Vec3 = [-f.up[0], -f.up[1], -f.up[2]];
    for (let i = 1; i < segs; i++) {
      const base = f.at(v0, 0, z);
      const ux = lo[i][0] - base[0], uy = lo[i][1] - base[1], uz = lo[i][2] - base[2];
      const vx = lo[i + 1][0] - base[0], vy = lo[i + 1][1] - base[1], vz = lo[i + 1][2] - base[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const ccw = n[0] * down[0] + n[1] * down[1] + n[2] * down[2] >= 0;
      sink.polygon(bucket, ccw ? [base, lo[i], lo[i + 1]] : [base, lo[i + 1], lo[i]], { ...opts, shade: 0.55 });
    }
  }
}

/**
 * The covering's courses on a shed roof's deck (dressing: a long view keeps the deck's own print), from the look stream:
 * each course split into a few lengths, every length its own tone and a little out of line with its neighbours.
 */
function covering(sink: PartSink, d: ShedDialect, f: SlopeFrame, look: () => number): void {
  const c = COURSES[d.covering];
  if (d.covering === 'thatch') return;
  const opts: EmitOptions = { decor: true, fine: true, ...(d.roofColour ? { colour: d.roofColour } : {}),
    uv: { kind: 'plane', origin: f.at(0, 0, 0), u: [0, 0, 1], v: f.up } };
  const tone = (): EmitOptions => (d.roofBucket === 'roof' ? { ...opts, shade: 0.84 + look() * 0.22 }
    : d.roofColour ? { ...opts, colour: shade(d.roofColour, 0.9 + look() * 0.18) } : opts);
  const span = f.z1 - f.z0;
  if (d.covering === 'canal' || d.covering === 'pantile') {
    // the cover rows (a canal tile's convex cap, a pantile's roll) down the slope, their mouths open at the eave
    const pitch = d.covering === 'canal' ? 0.24 : 0.3, r = d.covering === 'canal' ? 0.07 : 0.05;
    const n = Math.max(2, Math.floor(span / pitch));
    for (let k = 0; k < n; k++) {
      const z = f.z0 + (k + 0.5) * span / n;
      rollRun(sink, d.roofBucket, f, z, r, 0.02, f.length - 0.05, 4, tone(), true);
    }
    if (d.covering === 'canal') return;
  }
  if (d.covering === 'sheet') {
    // the sheets' side laps down the slope (a rib where two sheets overlap) and the end lap across it
    for (let z = f.z0 + 0.76; z < f.z1 - 0.3; z += 0.76) {
      courseWedge(sink, d.roofBucket, f, 0, f.length, z - 0.025, z + 0.025, 0.018, 0.018, tone());
    }
    if (f.length > 2.4) courseWedge(sink, d.roofBucket, f, f.length * 0.52, f.length * 0.52 + 0.16, f.z0, f.z1, c.butt, 0.002, tone());
    return;
  }
  // lapped courses across the slope: shingle, slate, lauze, plain tile and the pantiles' course lines
  const rows = Math.max(2, Math.floor((f.length - 0.04) / c.course));
  for (let k = 0; k < rows; k++) {
    const v0 = 0.02 + k * c.course;
    const pieces = c.split[0] + Math.floor(look() * (c.split[1] - c.split[0] + 1));
    let z = f.z0;
    for (let p = 0; p < pieces; p++) {
      const len = p === pieces - 1 ? f.z1 - z : span / pieces * (0.75 + look() * 0.5);
      const zb = Math.min(f.z1, z + len);
      if (zb - z > 0.1) {
        const jog = d.covering === 'lauze' ? (look() - 0.5) * 0.08 : (look() - 0.5) * 0.015;
        const butt = c.butt * (d.covering === 'lauze' ? 0.7 + look() * 0.6 : 1);
        courseWedge(sink, d.roofBucket, f, Math.max(0, v0 + jog), Math.min(f.length, v0 + c.course * 1.25), z + 0.004, zb - 0.004,
          butt, butt * 0.2, tone());
      }
      z = zb;
    }
  }
}

/**
 * A convex outline (u, y) clipped under the line through (ua, ya) and (ub, yb): a board's outline cut to the roof's
 * underside (Sutherland-Hodgman on one edge).
 */
function underLine(poly: ReadonlyArray<readonly [number, number]>, ua: number, ya: number, ub: number, yb: number): Array<[number, number]> {
  const lineAt = (u: number): number => ya + (yb - ya) * (u - ua) / (ub - ua || 1);
  const inside = (p: readonly [number, number]): boolean => p[1] <= lineAt(p[0]) + 1e-6;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push([a[0], a[1]]);
    if (ia !== ib) {
      // where the edge crosses the line
      const fa = a[1] - lineAt(a[0]), fb = b[1] - lineAt(b[0]), t = fa / (fa - fb);
      out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
    }
  }
  return out;
}

/**
 * An open shed (see the file's head): returns what it laid. `look` is the kit's look stream (ctx.variant), so the
 * build stream never moves.
 */
export function openShed(sink: PartSink, plan: ShedPlan, d: ShedDialect, look: () => number): ShedReading {
  const { W, D, hLo } = plan;
  const tanP = Math.tan(plan.pitchDeg * DEG), cosP = Math.cos(plan.pitchDeg * DEG);
  const s = d.post, half = s / 2, pc = d.postColour ?? d.timber;
  const padTop = d.pad ? d.pad.top : 0, sillH = 0.14, ph = 0.16, rh = 0.13, rw = 0.075;
  const stoneT = plan.stoneBack ? plan.stoneBack.t : 0;
  const xb = -W / 2 + stoneT + half, xf = W / 2 - half;
  // the rafters' underside: through the front beam's line at hLo, rising to the back
  const under = (x: number): number => hLo + (xf - x) * tanP;
  const cov = COURSES[d.covering];
  const deckT = cov.deck;
  // the deck (emitRoof's shed: its underside at the front face is eaveY, rising to -x) on the rafters' backs
  const eaveY = hLo - half * tanP + rh / cosP;
  const spec: RoofSpec = { kind: 'shed', pitchDeg: plan.pitchDeg, eave: d.eave, verge: d.verge, thickness: deckT, bucket: d.roofBucket, ridge: null,
    ...(d.covering === 'thatch' ? { thatch: 'rows' as const } : {}) };
  const underRoof = (x: number): number => eaveY + (W / 2 - x) * tanP;
  const trim = d.trim ?? shade(d.boards[0], 0.72);
  const member = { colour: d.timber, uv: UV_MEMBER } as const;
  const posts: ShedReading['posts'] = [];
  /** the posts in the shed's own frame (x, z, foot, head) and as the lattice's legs (the emitting frame), for the wreck */
  const local: Array<[number, number, number, number]> = [], legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  const bt = d.cladding === 'lapped' ? 0.03 : 0.026;

  // the post lines: the corners and as many between as a 2 m bay wants
  const along = (n: number): number[] => Array.from({ length: n + 1 }, (_, k) => -D / 2 + half + (D - s) * k / n);
  const bays = Math.max(1, Math.round((D - s) / 2.1));
  const backZ = along(bays), frontZ = along(Math.max(1, Math.round((D - s) / 2.6)));
  const padOf = (x: number, z: number): void => {
    if (!d.pad) return;
    const p = d.pad;
    sink.span(p.bucket, x - p.size / 2, -0.3, z - p.size / 2, x + p.size / 2, p.top, z + p.size / 2, { ...(p.colour ? { colour: p.colour } : {}), shade: 0.9 });
  };
  const postAt = (x: number, z: number, y0: number, y1: number): void => {
    if (d.round) sink.cylinder('structureWood', [x, y0, z], 'y', y1 - y0, half, 8, { colour: pc });
    else sink.span('structureWood', x - half, y0, z - half, x + half, y1, z + half, { colour: pc, uv: UV_MEMBER });
    posts.push({ foot: sink.framePoint([x, y0, z]), head: sink.framePoint([x, y1, z]) });
    local.push([x, z, y0, y1]);
    legs.push({ foot: [x, y0, z], head: [x, y1, z] });
  };

  // ---- the back: boards on posts and their sill, or the stone wall the rafters rest in
  const backTop = under(xb - half);
  if (plan.stoneBack) {
    const sb = plan.stoneBack, wallTop = underRoof(-W / 2 + sb.t);
    sink.span(sb.bucket, -W / 2, -0.4, -D / 2, -W / 2 + sb.t, wallTop, D / 2, sb.colour ? { colour: sb.colour } : {});
    // its coping of flat stones under the roof's high eave, from the wall's top to the deck, out past its back face
    if (sb.coping) {
      const yc = underRoof(-W / 2 - 0.05);
      sink.span(sb.coping, -W / 2 - 0.06, wallTop - 0.02, -D / 2 - 0.04, -W / 2 + sb.t * 0.4, yc, D / 2 + 0.04, { decor: true });
    }
  } else {
    for (const z of backZ) padOf(xb, z);
    if (d.pad) sink.span('structureWood', xb - half, padTop, -D / 2, xb + half, padTop + sillH, D / 2, member);
    // the back posts on the sill and the wall plate along their heads
    const backFoot = d.pad ? padTop + sillH : -0.3;
    for (const z of backZ) postAt(xb, z, backFoot, backTop - ph);
    sink.span('structureWood', xb - half - 0.01, backTop - ph, -D / 2, xb + half + 0.01, backTop, D / 2, member);
  }

  // ---- the front: posts on their pads, the beam along their heads, a knee brace either side of each post
  const frontTop = under(xf - half);
  for (const z of frontZ) {
    padOf(xf, z);
    postAt(xf, z, d.pad ? padTop : -0.3, frontTop - ph);
  }
  sink.span('structureWood', xf - half - 0.01, frontTop - ph, -D / 2, xf + half + 0.01, frontTop, D / 2, member);
  for (const z of frontZ) {
    for (const dir of [-1, 1]) {
      const zt = z + dir * 0.62;
      if (Math.abs(zt) > D / 2 - half) continue;
      sink.member('structureWood', [xf - 0.04, frontTop - ph - 0.62, z + dir * half], [xf - 0.04, frontTop - ph, zt], 0.09, 0.08, [1, 0, 0],
        { colour: shade(d.timber, 0.94), decor: true, exposed: true }, 0);
    }
  }
  // the ends: a sill from back to front on the pads, and a stud in the middle of a wide end
  if (plan.ends && d.pad) {
    for (const sz of [-1, 1]) {
      const z = sz * (D / 2 - half);
      sink.span('structureWood', plan.stoneBack ? -W / 2 + stoneT : xb + half, padTop, z - half, xf - half, padTop + sillH, z + half, member);
      if (W - stoneT > 2.6) {
        const xm = (xb + xf) / 2;
        padOf(xm, z);
        postAt(xm, z, padTop + sillH, under(xm) - 0.02);
      }
    }
  }

  // ---- the rafters, their tails out under the eaves, and the deck and its covering on them
  const nR = Math.max(3, Math.round((D - s) / 0.72));
  const nrm = normalize3([tanP, 1, 0]);
  const xa = -W / 2 - Math.min(d.eave, 0.3) + 0.05, xe = W / 2 + d.eave - 0.05;
  sink.dressing(plan.mobile, () => {
    for (let k = 0; k <= nR; k++) {
      const z = -D / 2 + half + (D - s) * k / nR;
      sink.member('structureWood', [xa, under(xa), z], [xe, under(xe), z], rw, rh, nrm, { colour: shade(d.timber, 0.9 + look() * 0.12), decor: true, exposed: true }, 0);
    }
  });
  const rg = roofGeometry(W, D, eaveY, spec);
  emitRoof(sink, rg, spec, d.roofColour);
  const f = slopeFrame(W, D, eaveY, spec);
  sink.dressing(plan.mobile, () => covering(sink, d, f, look));
  // the barge boards along both verges and the fascia board along the low eave, from the roof's top down over its edge
  sink.dressing(plan.mobile, () => {
    const bh = deckT + cov.butt + 0.14;
    for (const z of [f.z0 + 0.012, f.z1 - 0.012]) {
      const a = f.at(0, cov.butt + 0.01 - bh / 2, z), b = f.at(f.length, cov.butt + 0.01 - bh / 2, z);
      sink.member('structureWood', a, b, bh, 0.028, [0, 0, z > 0 ? 1 : -1], { colour: trim, decor: true, exposed: true }, 0.014);
    }
  });

  // ---- the cladding: separate boards on the posts' outer faces, their tops cut to the roof
  const boardTone = (): Rgb => shade(d.boards[Math.floor(look() * d.boards.length) % d.boards.length], 0.86 + look() * 0.24);
  const gap = d.cladding === 'gapped' ? d.gap ?? 0.03 : 0;
  const bottom = d.pad ? padTop - 0.03 : -0.05;
  let faces = 0;
  const clad = (face: Face, u0: number, u1: number, topAt: (u: number) => number): void => {
    faces++;
    if (d.cladding === 'lapped') {
      // weatherboards across the face, each lower edge out over the one under it, cut to the roof line at the top
      const yTop = Math.max(topAt(u0), topAt(u1));
      for (let y = bottom; y < yTop - 0.03; y += d.boardW) {
        const poly = underLine([[u0, y], [u1, y], [u1, y + d.boardW + 0.02], [u0, y + d.boardW + 0.02]], u0, topAt(u0), u1, topAt(u1));
        if (poly.length < 3) break;
        boardOn(sink, 'structureWood', face, poly, 0, bt, { colour: boardTone() });
        // the lap: the board's lower edge stands out over the one under it
        // (only where the whole strip is under the roof line: a gable end's top boards keep their lap short)
        const yl = y + 0.012, need = yl + 0.03;
        const ta = topAt(u0), tb = topAt(u1);
        let ua = u0, ub = u1;
        if (ta < need && tb < need) continue;
        if (ta < need) ua = lerp(u0, u1, (need - ta) / (tb - ta));
        if (tb < need) ub = lerp(u0, u1, (need - ta) / (tb - ta));
        if (ub - ua > 0.12) {
          faceBox(sink, 'structureWood', face, (ua + ub) / 2, yl, bt + 0.006, ub - ua, 0.024, 0.012, { colour: shade(d.boards[0], 0.7), decor: true, fine: true }, 'ends');
        }
      }
      return;
    }
    const step = d.boardW + gap, n = Math.max(1, Math.round((u1 - u0 + gap) / step)), bw = (u1 - u0 + gap) / n - gap;
    for (let k = 0; k < n; k++) {
      const a = u0 + k * (bw + gap), b = a + bw;
      boardOn(sink, 'structureWood', face, [[a, bottom], [b, bottom], [b, topAt(b)], [a, topAt(a)]], 0, bt, { colour: boardTone() });
      if (d.cladding === 'batten' && k > 0) {
        // the batten over the joint (dressing: it stands proud of the boards)
        const yt = Math.min(topAt(a - 0.03), topAt(a + 0.03)) - 0.04;
        faceBox(sink, 'structureWood', face, a, (bottom + yt) / 2, bt + 0.012, 0.06, yt - bottom, 0.024, { colour: d.batten ?? shade(d.boards[0], 0.9), decor: true, fineSides: true }, 'caps');
      }
    }
  };
  if (plan.back && !plan.stoneBack) {
    const back: Face = { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
    clad(back, -D / 2 - bt, D / 2 + bt, () => underRoof(-W / 2 - bt) - 0.005);
    // the rails the boards are nailed to, between the back posts (inside, flush with the posts' faces)
    sink.dressing(plan.mobile, () => {
      for (let k = 0; k + 1 < backZ.length; k++) {
        for (const y of [0.95, Math.min(1.9, backTop - ph - 0.3)]) {
          sink.span('structureWood', -W / 2 + stoneT, y - 0.06, backZ[k] + half, -W / 2 + stoneT + 0.08, y + 0.06, backZ[k + 1] - half, { colour: shade(d.timber, 0.92), decor: true, uv: UV_MEMBER });
        }
      }
    });
  }
  if (plan.ends) {
    for (const sz of [-1, 1]) {
      const end: Face = { origin: [0, 0, sz * D / 2], u: [sz, 0, 0], out: [0, 0, sz], width: W };
      // u along the end is x (sz > 0) or -x: the roof's underside at its outer face
      const top = (u: number): number => underRoof(sz * u) - 0.005;
      const u0 = sz > 0 ? -W / 2 + stoneT : -(W / 2), u1 = sz > 0 ? W / 2 : W / 2 - stoneT;
      clad(end, u0, u1, top);
      // the corner boards at the open front and the back (trim), and the end's rail inside
      sink.dressing(plan.mobile, () => {
        const uf = sz > 0 ? W / 2 - 0.06 : -W / 2 + 0.06;
        const yt = top(sz > 0 ? W / 2 - 0.12 : -W / 2 + 0.12) - 0.02;
        faceBox(sink, 'structureWood', end, uf, (bottom + yt) / 2, bt + 0.012, 0.12, yt - bottom, 0.024, { colour: trim, decor: true, fineSides: true }, 'caps');
        const zr = sz * (D / 2 - 0.04);
        for (const y of [0.95, 1.8]) {
          const x0 = xb + half, x1 = xf - half;
          if (y < under(x1) - 0.3) sink.span('structureWood', x0, y - 0.06, zr - 0.04, x1, y + 0.06, zr + 0.04, { colour: shade(d.timber, 0.92), decor: true, uv: UV_MEMBER });
        }
      });
    }
  }

  // ---- the wood stacked against the back, log ends out; a chopping block before the shed with its axe in it
  if (plan.pile > 0) {
    sink.dressing(plan.mobile, () => {
      const backIn: Face = { origin: [xb + half + 0.02, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
      const lim = D / 2 - s - 0.12;
      woodpile(sink, backIn, -lim, lim, Math.min(plan.pile, backTop - ph - 0.25), look);
    });
  }
  if (plan.block) {
    sink.dressing(plan.mobile, () => {
      // (inside the shed before the pile, by one end: a decor part, but kept off the yard's fence and the plot's edge)
      const bx = W / 2 - 0.75, bz = (look() < 0.5 ? -1 : 1) * (D / 2 - 0.75);
      sink.cylinder('structureWood', [bx, -0.05, bz], 'y', 0.55, 0.27, 9, { colour: shade(d.timber, 1.05), decor: true }, 0.25);
      // the axe bitten into the block's top, its haft raised toward the shed
      sink.member('structureWood', [bx, 0.48, bz], [bx - 0.45, 0.95, bz + 0.12], 0.04, 0.03, [0, 0, 1], { colour: shade(d.timber, 1.25), decor: true, exposed: true }, 0);
      sink.span('structureWood', bx - 0.02, 0.42, bz - 0.1, bx + 0.08, 0.52, bz + 0.03, { colour: [0.2, 0.2, 0.21], decor: true });
    });
  }
  // the wreck's reading (shedFall.ts): the shed racks over as its own posts, deck, boards and stack
  recordShed(sink, legs, {
    W, D, pitchDeg: plan.pitchDeg, eaveY, eave: d.eave, verge: d.verge, deck: deckT, post: s, posts: local,
    pad: d.pad ? { size: d.pad.size, top: d.pad.top, bucket: d.pad.bucket, colour: d.pad.colour ?? null } : null,
    timber: d.timber, boards: plan.back || plan.ends ? d.boards[0] : null, boardW: d.boardW, back: plan.back, ends: plan.ends,
    roof: { bucket: d.roofBucket, colour: d.roofColour ?? null, shape: DEBRIS[d.covering] },
    stone: plan.stoneBack ? { bucket: plan.stoneBack.bucket, t: plan.stoneBack.t, top: underRoof(-W / 2) } : null, pile: plan.pile,
  });
  return {
    W, D, posts, size: s,
    roof: { eaveY, pitchDeg: plan.pitchDeg, eave: d.eave, verge: d.verge, thickness: deckT, course: cov.butt, bucket: d.roofBucket,
      colour: d.roofColour ?? null, spec },
    boards: plan.back || plan.ends ? { colour: d.boards[0], width: d.boardW, faces } : null,
    stone: plan.stoneBack ? { bucket: plan.stoneBack.bucket, t: plan.stoneBack.t, top: underRoof(-W / 2) } : null,
    pile: plan.pile, timber: d.timber,
  };
}

/** The covering's top over the deck (a snow load laid over the courses lies this much higher). */
export function coveringRise(covering: ShedCovering): number {
  return COURSES[covering].butt + 0.01;
}
