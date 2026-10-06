// src/world/maps/regional/cappadocia.ts — the Cappadocian kit (Chimney Valley: Göreme and its valleys, Nevşehir
// province; the map-revival lane, 2026-10-05).
//
// The tuff country builds in the rock it stands on. Houses of squared tuff blocks cut from the valley sides (soft when
// quarried, hardening in the air), honey to cream to rose; flat earth roofs behind a parapet pierced by stone spouts,
// or on the newer houses an alaturka tile roof; rectangular windows under a carved arched tympanum, iron bars on the
// ground floor, an open arched room (eyvan) over the door; an arched gate (kemerli kapı) in every courtyard wall and an
// outside stair to the upper rooms; the whitewashed bands with red-ochre zigzags round the pigeon holes the farmers cut
// for the dung that fed their vines. Rooms are cut into the fairy chimneys themselves, a masonry front built into the
// mouth of each, and into every outcrop the valleys left. The mosque's Ottoman stone minaret keeps its balcony (şerefe)
// on corbels and a lead cone; the Seljuk caravanserai of the Kayseri–Aksaray road (Sarıhan above Avanos, Ağzıkarahan)
// its carved portal (taç kapı) with the stalactite hood, the buttress towers and the little mosque on four arches in
// its court (köşk mescit); the domed hamam its glass bull's-eyes; the arasta its vaulted shops, the Avanos potters'
// red jugs and the carpet sellers' kilims.
import { LocalFrame, PartSink, faceBox, facePoint, pick, rgb, shade, UV_MEMBER, UV_WORLD, type EmitOptions, type Face, type RegionalBucket, type Rgb,
  type Vec3 } from './geometry.ts';
import { buildHouse, windowRhythm, type ChimneySpec, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Squared tuff blocks: the kit's stone surface (coursed, honey-cream). */
const TUFF: RegionalBucket = 'stone';
/** Earth render over rubble. */
const RENDER: RegionalBucket = 'plaster';
/** Whitewash: the pigeon-hole bands, the domes. */
const LIME: RegionalBucket = 'plaster2';
/** The living rock: a chimney's or an outcrop's weathered face. */
const ROCK: RegionalBucket = 'plaster3';

const DOORS: readonly Rgb[] = [0x5b3f2b, 0x5b3f2b, 0x6a4a30, 0x3d6b68, 0x35607a, 0x46603e].map(rgb);
const TIMBER = rgb(0x6e5440), IRON = rgb(0x2b2927), LEAD = rgb(0x8c9196), BRASS = rgb(0xb3913f), CLAY = rgb(0xa75a35), OCHRE = rgb(0x9c4a32);
const CANVAS: readonly Rgb[] = [0xd8ccb2, 0xc9b48a, 0x9e3b2c, 0x3f5e74].map(rgb);
const KILIM_GROUNDS: readonly Rgb[] = [0x8e2f24, 0x8e2f24, 0x2f3a5e, 0x9a5a2a, 0x6e2a3a].map(rgb);
const KILIM_ACCENTS: readonly Rgb[] = [0xd8ccb0, 0xc08a2a, 0x2f3a5e, 0x2a2522, 0x4a6a4a].map(rgb);

/** The base's reach (ctx.bounds): its size, centre and edges. A kit body sized from it opens no lane beside it. */
function reach(ctx: RegionalBuildContext): { W: number; D: number; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number } {
  const b = ctx.bounds;
  return { W: b.maxX - b.minX, D: b.maxZ - b.minZ, cx: (b.maxX + b.minX) / 2, cz: (b.maxZ + b.minZ) / 2, x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
}

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The four faces of a body x0..x1 × z0..z1 (geometry.ts conventions: u × up = out). */
const faces = (x0: number, x1: number, z0: number, z1: number): Record<'front' | 'right' | 'back' | 'left', Face> => ({
  front: { origin: [(x0 + x1) / 2, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: x1 - x0 },
  right: { origin: [x1, 0, (z0 + z1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: z1 - z0 },
  back: { origin: [(x0 + x1) / 2, 0, z0], u: [-1, 0, 0], out: [0, 0, -1], width: x1 - x0 },
  left: { origin: [x0, 0, (z0 + z1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: z1 - z0 },
});

/**
 * An arch's head from its right spring to its left (n + 1 points, relative to the opening's centre on the spring line):
 * round, or two-centred (pointed > 0: the arcs' centres stand pointed × r either side of the axis, the Seljuk and
 * Ottoman pointed arch).
 */
function archCurve(r: number, n: number, pointed = 0): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (pointed <= 0) {
    for (let k = 0; k <= n; k++) { const a = Math.PI * k / n; out.push([r * Math.cos(a), r * Math.sin(a)]); }
    return out;
  }
  const c = pointed * r, R = r + c, top = Math.acos(c / R), half = Math.max(1, Math.round(n / 2));
  for (let k = 0; k <= half; k++) { const a = top * k / half; out.push([-c + R * Math.cos(a), R * Math.sin(a)]); }
  for (let k = half - 1; k >= 0; k--) { const a = top * k / half; out.push([c - R * Math.cos(a), R * Math.sin(a)]); }
  return out;
}

/** Dressed voussoirs round an arch head on a face (dressing): each block on its chord, a keystone at a round crown. */
function voussoirs(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, ys: number, curve: Array<[number, number]>, t: number, out: number,
  opts: EmitOptions = {}, keystone = true): void {
  const crown = (curve.length - 1) % 2 === 1 ? (curve.length - 2) / 2 : -1;
  for (let k = 0; k + 1 < curve.length; k++) {
    const [u0, y0] = curve[k], [u1, y1] = curve[k + 1];
    const len = Math.hypot(u1 - u0, y1 - y0) || 1, du = (u1 - u0) / len, dy = (y1 - y0) / len;
    // the outward normal (away from the opening) of a counter-clockwise run
    const nu = dy, ny = -du;
    const key = keystone && k === crown;
    const tt = key ? t * 1.35 : t, oo = key ? out + 0.03 : out;
    const ax: Vec3 = [face.u[0] * -du, -dy, face.u[2] * -du];
    const ay: Vec3 = [face.u[0] * nu, ny, face.u[2] * nu];
    const centre = facePoint(face, u + (u0 + u1) / 2 + nu * tt / 2, ys + (y0 + y1) / 2 + ny * tt / 2, oo / 2);
    sink.box(bucket, centre, [len / 2 + 0.006, tt / 2, oo / 2], { decor: true, fineSides: true, uv: UV_WORLD, ...opts },
      new LocalFrame(ax, ay, face.out, [0, 0, 0]), { nz: true });
  }
}

/** The arch's tympanum: the panel under its head, `o` proud of the face (a carved slab, a fanlight, a dark void). */
function tympanum(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, ys: number, curve: Array<[number, number]>, o: number, opts: EmitOptions = {}): void {
  sink.polygon(bucket, curve.map(([du, dy]) => facePoint(face, u + du, ys + dy, o)), { decor: true, uv: UV_WORLD, ...opts });
}

/** A carved rosette on a face: an eight-pointed boss (dressing). */
function rosette(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, r: number, o: number, opts: EmitOptions = {}): void {
  const pts: Vec3[] = [];
  for (let k = 0; k < 16; k++) {
    const a = Math.PI * 2 * k / 16, rr = k % 2 ? r * 0.62 : r;
    pts.push(facePoint(face, u + Math.cos(a) * rr, y + Math.sin(a) * rr, o));
  }
  // a star is not convex: a fan from its centre
  const c = facePoint(face, u, y, o + 0.01);
  for (let k = 0; k < 16; k++) sink.polygon(bucket, [c, pts[k], pts[(k + 1) % 16]], { decor: true, uv: UV_WORLD, fine: true, ...opts });
}

/**
 * A wall face cut by one arched opening: the opening's rectangle cut to the crown (its reveal back `reveal` m), and
 * the two spandrels above the springs filled flush with the face, so the void reads as an arch. Strips and spandrel
 * fans share their corners exactly. Returns the curve (spring-line relative) for the voussoirs.
 */
function archedOpeningWall(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y0: number, y1: number,
  hole: { u: number; w: number; y0: number; spring: number }, pointed: number, n: number, reveal: number,
  back: RegionalBucket | null = 'dark'): Array<[number, number]> {
  const r = hole.w / 2, curve = archCurve(r, n, pointed);
  const crown = hole.spring + Math.max(...curve.map(([, dy]) => dy));
  const P = (u: number, y: number, o = 0) => facePoint(face, u, y, o);
  const hu0 = hole.u - r, hu1 = hole.u + r;
  // the face round the opening: left and right strips full height, a strip below the sill, one above the crown
  sink.quad(bucket, P(u0, y0), P(hu0, y0), P(hu0, y1), P(u0, y1));
  sink.quad(bucket, P(hu1, y0), P(u1, y0), P(u1, y1), P(hu1, y1));
  if (hole.y0 > y0 + 1e-4) sink.quad(bucket, P(hu0, y0), P(hu1, y0), P(hu1, hole.y0), P(hu0, hole.y0));
  if (y1 > crown + 1e-4) sink.quad(bucket, P(hu0, crown), P(hu1, crown), P(hu1, y1), P(hu0, y1));
  // the spandrels: fans from the upper corners of the cut to the head's points
  const right = curve.filter(([du]) => du >= -1e-9), left = curve.filter(([du]) => du <= 1e-9);
  for (let k = 0; k + 1 < right.length; k++) {
    sink.polygon(bucket, [P(hu1, crown), P(hole.u + right[k + 1][0], hole.spring + right[k + 1][1]), P(hole.u + right[k][0], hole.spring + right[k][1])]);
  }
  for (let k = 0; k + 1 < left.length; k++) {
    sink.polygon(bucket, [P(hu0, crown), P(hole.u + left[k + 1][0], hole.spring + left[k + 1][1]), P(hole.u + left[k][0], hole.spring + left[k][1])]);
  }
  // the reveal: jambs to the springs, the soffit following the head, and a dark backing (none where the opening shows
  // what stands behind it: an open shop, a gate's leaves)
  if (reveal <= 0) return curve;
  const rv = -reveal;
  sink.quad(bucket, P(hu0, hole.y0), P(hu0, hole.y0, rv), P(hu0, hole.spring, rv), P(hu0, hole.spring), { shade: 0.74 });
  sink.quad(bucket, P(hu1, hole.y0), P(hu1, hole.spring), P(hu1, hole.spring, rv), P(hu1, hole.y0, rv), { shade: 0.74 });
  for (let k = 0; k + 1 < curve.length; k++) {
    const a = curve[k], b = curve[k + 1];
    sink.quad(bucket, P(hole.u + a[0], hole.spring + a[1]), P(hole.u + b[0], hole.spring + b[1]), P(hole.u + b[0], hole.spring + b[1], rv),
      P(hole.u + a[0], hole.spring + a[1], rv), { shade: 0.62 });
  }
  if (hole.y0 > y0 + 1e-4) sink.quad(bucket, P(hu0, hole.y0), P(hu1, hole.y0), P(hu1, hole.y0, rv), P(hu0, hole.y0, rv), { shade: 0.9 });
  if (!back) return curve;
  const bk = rv - 0.004;
  sink.quad(back, P(hu0, hole.y0, bk), P(hu1, hole.y0, bk), P(hu1, hole.spring, bk), P(hu0, hole.spring, bk), { decor: true });
  sink.polygon(back, curve.map(([du, dy]) => P(hole.u + du, hole.spring + dy, bk)), { decor: true });
  return curve;
}

/** A rectangle on a face, u0..u1 × y0..y1, facing out (counter-clockwise seen from outside). */
function faceRect(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y0: number, y1: number, opts: EmitOptions = {}): void {
  sink.quad(bucket, facePoint(face, u0, y0), facePoint(face, u1, y0), facePoint(face, u1, y1), facePoint(face, u0, y1), opts);
}

/** The highest point of an arch head (spring-line relative). */
const crownOf = (curve: Array<[number, number]>) => Math.max(...curve.map(([, dy]) => dy));

/** The right-handed cross product. */
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * A closed rock mass about a vertical axis: rings of (x radius, z radius, height) whose radius the smooth `jitter`
 * scales round the ring (a weathered outcrop, a chimney's flutes), closed by a fan to `apex` (or a flat cap) and a
 * floor below the ground. Triangles are emitted singly (a jittered quad is not planar). The winding is the cylinder's
 * (geometry.ts): a ring's angle runs a → -a.
 */
function rockMass(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, rings: ReadonlyArray<readonly [number, number, number]>, sides: number,
  jitter: (a: number, y: number) => number, apex: Vec3 | null, opts: EmitOptions = {}): void {
  const at = (rx: number, rz: number, y: number, a: number): Vec3 => {
    const j = jitter(a, y);
    return [cx + Math.cos(-a) * rx * j, y, cz + Math.sin(-a) * rz * j];
  };
  const rows = rings.map(([rx, rz, y]) => Array.from({ length: sides }, (_, k) => at(rx, rz, y, (k / sides) * Math.PI * 2)));
  const o = { uv: UV_WORLD, ...opts };
  for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < sides; k++) {
    const j = (k + 1) % sides, a = rows[i][k], b = rows[i][j], c = rows[i + 1][j], d = rows[i + 1][k];
    sink.polygon(bucket, [a, b, c], o);
    sink.polygon(bucket, [a, c, d], o);
  }
  const top = rows[rows.length - 1];
  if (apex) for (let k = 0; k < sides; k++) sink.polygon(bucket, [top[k], top[(k + 1) % sides], apex], o);
  else sink.polygon(bucket, [...top], o);
  sink.polygon(bucket, [...rows[0]].reverse(), o);
}

/** A quad lying on a rock mass's surface (an opening cut in it): corners at angles a0 < a1, heights y0 < y1, lifted `lift`. */
function rockFaceQuad(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, radius: (a: number, y: number) => readonly [number, number],
  a0: number, a1: number, y0: number, y1: number, lift: number, opts: EmitOptions = {}): void {
  const P = (a: number, y: number): Vec3 => {
    const [rx, rz] = radius(a, y);
    return [cx + Math.cos(-a) * (rx + lift), y, cz + Math.sin(-a) * (rz + lift)];
  };
  sink.polygon(bucket, [P(a0, y0), P(a1, y0), P(a1, y1)], { decor: true, uv: UV_WORLD, ...opts });
  sink.polygon(bucket, [P(a0, y0), P(a1, y1), P(a0, y1)], { decor: true, uv: UV_WORLD, ...opts });
}

/** The pigeon holes under a roof: a whitewashed band, rows of holes, the red-ochre zigzag painted under them. */
function dovecote(sink: PartSink, face: Face, u: number, y: number, w: number, rows: number, look: () => number): void {
  const bandH = rows * 0.36 + 0.26;
  faceBox(sink, LIME, face, u, y, 0.012, w, bandH, 0.024, { decor: true });
  const n = Math.max(3, Math.floor(w / 0.44));
  for (let r = 0; r < rows; r++) for (let k = 0; k < n; k++) {
    if (look() < 0.1) continue;
    faceBox(sink, 'dark', face, u - w / 2 + (k + 0.5) * w / n, y - (rows - 1) * 0.18 + r * 0.36, 0.026, 0.13, 0.18, 0.006, { decor: true });
  }
  // the zigzag: small painted triangles pointing down along the band's foot
  const z = Math.max(4, Math.floor(w / 0.3)), yb = y - bandH / 2 - 0.01;
  for (let k = 0; k < z; k++) {
    const uu = u - w / 2 + (k + 0.5) * w / z, hw = w / z * 0.42;
    sink.polygon('structureWood', [facePoint(face, uu - hw, yb, 0.026), facePoint(face, uu, yb - 0.16, 0.026), facePoint(face, uu + hw, yb, 0.026)],
      { colour: OCHRE, decor: true, fine: true });
  }
}

/** Iron bars across a ground-floor window, standing in its reveal. */
function ironBars(sink: PartSink, face: Face, u: number, y: number, w: number, h: number): void {
  const o = { colour: IRON, decor: true, fine: true };
  const n = Math.max(3, Math.round(w / 0.13));
  for (let k = 1; k < n; k++) faceBox(sink, 'structureMetal', face, u - w / 2 + w * k / n, y + h / 2, -0.06, 0.022, h, 0.022, o, 'caps');
  for (const t of [0.22, 0.78]) faceBox(sink, 'structureMetal', face, u, y + h * t, -0.07, w, 0.03, 0.012, o, 'ends');
}

/** Stone spouts through a flat roof's parapet, draining the earth roof clear of the wall. */
function spouts(sink: PartSink, face: Face, y: number, count: number): void {
  for (let k = 0; k < count; k++) {
    const u = -face.width / 2 + face.width * (k + 0.5) / count;
    faceBox(sink, TUFF, face, u, y, 0.22, 0.16, 0.13, 0.44, { decor: true });
  }
}

/** A clay jug or pot of the Avanos potters (dressing). */
function jug(sink: PartSink, x: number, y: number, z: number, r: number, tall: boolean, c: Rgb): void {
  const o = { colour: c, decor: true };
  const h = tall ? r * 3.2 : r * 1.8;
  sink.cylinder('structureWood', [x, y, z], 'y', h * 0.45, r * 0.62, 8, o, r, false);
  sink.cylinder('structureWood', [x, y + h * 0.45, z], 'y', h * 0.35, r, 8, o, r * (tall ? 0.42 : 0.62), false);
  sink.cylinder('structureWood', [x, y + h * 0.8, z], 'y', h * 0.2, r * (tall ? 0.42 : 0.62), 8, { ...o, colour: shade(c, 0.9) }, r * (tall ? 0.5 : 0.7), true);
}

/**
 * A canvas sheet on four corners (an awning, a stall's shade): its sunlit top and, a centimetre under it, a darker
 * underside, each facing its own way (dressing; the top casts the striped shade).
 */
function canvas(sink: PartSink, a: Vec3, b: Vec3, c: Vec3, d: Vec3, colour: Rgb): void {
  const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
  const up = n[1] >= 0;
  const [p, q, r, t] = up ? [a, b, c, d] : [a, d, c, b];
  sink.quad('structureWood', p, q, r, t, { colour, decor: true, shadow: true });
  const low = (v: Vec3): Vec3 => [v[0], v[1] - 0.012, v[2]];
  sink.quad('structureWood', low(t), low(r), low(q), low(p), { colour: shade(colour, 0.78), decor: true });
}

/** A kilim hung on a face: wide ground bands between narrow accent stripes (dressing). */
function kilim(sink: PartSink, face: Face, u: number, y0: number, w: number, h: number, look: () => number, o = 0.016): void {
  const bands = 5 + 2 * Math.floor(look() * 3), ground = pick(look, KILIM_GROUNDS);
  const unit = h / (1.45 * (bands + 1) / 2 + 0.55 * (bands - 1) / 2);
  for (let b = 0, y = y0; b < bands; b++) {
    const c = b % 2 ? pick(look, KILIM_ACCENTS) : ground, bh = unit * (b % 2 ? 0.55 : 1.45);
    faceBox(sink, 'structureWood', face, u, y + bh / 2, o, w, bh, 0.012, { colour: c, decor: true });
    y += bh;
  }
}

interface CappHouse {
  storeys: 1 | 2;
  wall: RegionalBucket;
  door: Rgb;
  frontDoor: boolean;
  eyvan: boolean;
  tile: boolean;
  dovecote: boolean;
  /** iron bars on the ground floor's windows */
  bars: boolean;
  /** an upper door on the front at this u, reached by an outside stair along the front from `stair` (its run, u0..u1) */
  upperDoor?: number;
  stair?: readonly [number, number];
}

/**
 * A Cappadocian house body centred on the origin (front +z): tuff walls 0.32 m deep in the reveals, a flat earth roof
 * behind a parapet with spouts (or an alaturka tile hip roof), the windows under carved tympana, an arched door, a
 * string course between the storeys, the pigeon band under the roof on one side.
 */
function cappHouse(sink: PartSink, rng: () => number, look: () => number, W: number, D: number, o: CappHouse): HouseFrame {
  const g = 3.0 + rng() * 0.3, up = 2.75 + rng() * 0.2;
  const storeys = o.storeys === 2 ? [{ h: g, wall: o.wall }, { h: up, wall: TUFF }] : [{ h: g, wall: o.wall }];
  const openings: Opening[] = [];
  const stairAvoid: Array<[number, number]> = o.stair ? [[o.stair[0] - 0.4, o.stair[1] + 0.4]] : [];
  const doorU = o.stair ? Math.max(-W / 2 + 1.0, Math.min(o.stair[0] - 1.2, -W * 0.2)) : (rng() - 0.5) * Math.max(0, W - 3.2) * 0.6;
  if (o.frontDoor) openings.push({ face: 'front', storey: 0, kind: 'door', u: doorU, w: 1.0, y0: 0, h: 2.0 });
  for (const face of ['front', 'left', 'right'] as const) {
    const width = face === 'front' ? W : D;
    const avoid: Array<[number, number]> = face === 'front' ? [...(o.frontDoor ? [[doorU - 0.95, doorU + 0.95] as [number, number]] : []), ...stairAvoid] : [];
    openings.push(...windowRhythm(face, 0, width, { w: 0.55, h: 0.8, sill: 1.2, spacing: 2.4, margin: 1.0, max: 2, avoid }));
  }
  if (o.storeys === 2) {
    const eyvanU = o.upperDoor !== undefined ? -W * 0.18 : 0;
    if (o.eyvan) openings.push({ face: 'front', storey: 1, kind: 'loft', u: eyvanU, w: Math.min(2.0, W * 0.32), y0: 0.2, h: 1.15 });
    if (o.upperDoor !== undefined) openings.push({ face: 'front', storey: 1, kind: 'door', u: o.upperDoor, w: 0.9, y0: 0, h: 1.95 });
    for (const face of ['front', 'left', 'right', 'back'] as const) {
      const width = face === 'front' || face === 'back' ? W : D;
      const avoid: Array<[number, number]> = face === 'front'
        ? [...(o.eyvan ? [[eyvanU - 1.5, eyvanU + 1.5] as [number, number]] : []), ...(o.upperDoor !== undefined ? [[o.upperDoor - 0.9, o.upperDoor + 0.9] as [number, number]] : [])] : [];
      openings.push(...windowRhythm(face, 1, width, { w: 0.62, h: 1.0, sill: 0.75, spacing: 1.9, margin: 0.9, max: face === 'back' ? 1 : 3, avoid }));
    }
  }
  const style: WindowStyle = { frame: shade(TIMBER, 0.78), frameWidth: 0.06, frameOut: 0.05, bars: 'cross',
    surround: { bucket: TUFF, width: 0.14, out: 0.05, lintel: 0.16 }, sill: { bucket: TUFF, out: 0.08 }, shutters: null };
  const dialect: HouseDialect = {
    window: (s, face, op, y0) => {
      if (op.kind === 'loft') {
        // the eyvan: an open arched room over the door, a parapet slab at its front
        faceBox(s, TUFF, face, op.u, y0 + op.y0 + 0.42, -0.12, op.w, 0.84, 0.2, { decor: true });
        return;
      }
      windowUnit(s, face, op.u, y0 + op.y0, op.w, op.h, style, rng, 0.3);
      if (o.bars && op.storey === 0) ironBars(s, face, op.u, y0 + op.y0, op.w, op.h);
    },
    door: (s, face, op, y0) => doorUnit(s, face, op.u, y0 + op.y0, op.w, op.h,
      { leaf: o.door, frame: { bucket: TUFF, width: 0.2, out: 0.07 }, steps: op.storey === 0 ? { bucket: TUFF } : null, leafKind: look() < 0.5 ? 'plank' : 'panel' },
      y0 + op.y0),
  };
  const roof: RoofSpec = o.tile
    ? { kind: 'hip', pitchDeg: 22, eave: 0.32, verge: 0.32, thickness: 0.16, bucket: 'roof', ridge: 'round' }
    : { kind: 'flat', pitchDeg: 0, eave: 0.04, verge: 0.04, thickness: 0.22, bucket: RENDER, parapet: 0.45 + rng() * 0.25 };
  const chimneys: ChimneySpec[] = rng() < 0.7
    ? [{ x: (rng() < 0.5 ? -1 : 1) * (W / 2 - 0.55), z: (rng() - 0.5) * D * 0.5, sx: 0.5, sz: 0.5, above: o.tile ? 0.8 : 1.0, bucket: TUFF, cap: 'slab' }] : [];
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.25, out: 0.05, bucket: TUFF }, storeys, roof, gableBucket: TUFF, openings, chimneys, gutters: null, verge: null,
    reveal: 0.32, rafters: o.tile ? TIMBER : null,
  }, dialect);
  const top = frame.bodies[frame.bodies.length - 1];
  // the carved heads: a tympanum under a ring of voussoirs over every upper window and over half the ground floor's,
  // the door's head a round or pointed arch
  for (const op of openings) {
    const face = frame.faces[op.face], y = frame.floors[op.storey] + op.y0 + op.h;
    if (op.kind === 'loft') {
      const curve = archCurve(op.w / 2, 11);
      tympanum(sink, 'dark', face, op.u, y, curve, 0.006);
      voussoirs(sink, TUFF, face, op.u, y, archCurve(op.w / 2 + 0.02, 11), 0.22, 0.06);
      continue;
    }
    if (op.kind === 'door') {
      const pointed = look() < 0.45 ? 0.18 : 0, ys = y + 0.2, r = op.w / 2 + 0.2;
      const curve = archCurve(r, pointed ? 8 : 9, pointed);
      tympanum(sink, TUFF, face, op.u, ys, curve, 0.06);
      rosette(sink, TUFF, face, op.u, ys + r * 0.42, 0.13, 0.07, { shade: 0.86 });
      voussoirs(sink, TUFF, face, op.u, ys, curve, 0.2, 0.09, {}, !pointed);
      continue;
    }
    if (op.storey === 0 && look() < 0.5) continue;
    const ys = y + 0.16, r = op.w / 2 + 0.14, curve = archCurve(r, 7);
    tympanum(sink, TUFF, face, op.u, ys, curve, 0.05);
    if (look() < 0.6) rosette(sink, TUFF, face, op.u, ys + r * 0.4, 0.09, 0.06, { shade: 0.86 });
    voussoirs(sink, TUFF, face, op.u, ys, curve, 0.15, 0.07);
  }
  // the string course between the storeys and the cornice under the parapet
  if (o.storeys === 2) {
    const y = frame.floors[1];
    sink.band(TUFF, top.x0 - 0.06, y - 0.07, top.z0 - 0.06, top.x1 + 0.06, y + 0.07, top.z1 + 0.06, { decor: true });
  }
  if (!o.tile) {
    sink.band(TUFF, top.x0 - 0.07, frame.eaveY - 0.1, top.z0 - 0.07, top.x1 + 0.07, frame.eaveY + 0.06, top.z1 + 0.07, { decor: true });
    const roofTop = frame.eaveY + 0.18;
    spouts(sink, frame.faces.front, roofTop, Math.max(1, Math.round(W / 4)));
    spouts(sink, frame.faces.back, roofTop, Math.max(1, Math.round(W / 4)));
  }
  if (o.stair && o.storeys === 2) {
    // the outside stair up the front to the upper door: x-adjacent solid steps (no coplanar faces), a landing at the door
    const [s0, s1] = o.stair, rise = frame.floors[1], n = Math.max(6, Math.round(rise / 0.3)), tread = (s1 - s0) / n;
    const z0 = frame.bodies[0].z1, depth = 1.0;
    for (let k = 0; k < n; k++) sink.span(TUFF, s0 + k * tread, -0.3, z0, s0 + (k + 1) * tread, rise * (k + 1) / n, z0 + depth, { decor: true });
    sink.span(TUFF, s1, -0.3, z0, Math.min(W / 2, (o.upperDoor ?? s1) + 0.7), rise, z0 + depth, { decor: true });
    sink.member('structureMetal', [s0, 0.95, z0 + depth - 0.03], [s1, rise + 0.95, z0 + depth - 0.03], 0.04, 0.04, [0, 0, 1],
      { colour: IRON, decor: true, fine: true, exposed: true });
  }
  if (o.dovecote) {
    const face = look() < 0.5 ? frame.faces.left : frame.faces.right;
    dovecote(sink, face, 0, frame.eaveY - 0.55, Math.min(face.width - 1.2, 3.6), look() < 0.5 ? 2 : 3, look);
  }
  return frame;
}

/** A rock mass's smooth weathering: lobes round the ring and a slow twist up it (a jitter for rockMass). */
function rockJitter(look: () => number, amp: number, flutes = 0, fluteDepth = 0): (a: number, y: number) => number {
  const p1 = look() * 6.3, p2 = look() * 6.3, p3 = look() * 6.3;
  return (a, y) => 1 + amp * (0.55 * Math.sin(3 * a + p1 + y * 0.18) + 0.3 * Math.sin(5 * a + p2 - y * 0.35) + 0.15 * Math.sin(8 * a + p3))
    - (flutes ? fluteDepth * (0.5 + 0.5 * Math.cos(flutes * a + p3)) : 0);
}

/**
 * The village house (the base adobe's plot): squared tuff or earth render, one storey or two, the arched door, the
 * windows under carved heads, a flat earth roof behind its parapet or a tile hip roof; a third of them built against a
 * tongue of the living rock at the back, rooms cut into its flanks.
 */
const house: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const rocky = rng() < 0.32;
  const rockD = rocky ? Math.min(2.6, R.D * 0.3) : 0;
  const W = Math.max(5.0, R.W - 0.2), D = Math.max(5.2, R.D - 0.2 - rockD);
  const two = rng() < 0.45;
  const opts: CappHouse = {
    storeys: two ? 2 : 1, wall: ctx.wallBucket === 'plaster' || ctx.wallBucket === 'plaster3' ? RENDER : TUFF, door: pick(look, DOORS),
    frontDoor: true, eyvan: two && rng() < 0.4, tile: rng() < 0.28, dovecote: rng() < 0.55, bars: look() < 0.6,
  };
  const hz = R.cz + rockD / 2;
  let eave = 0;
  sink.placed(0, R.cx, 0, hz, () => { eave = cappHouse(sink, rng, look, W, D, opts).eaveY; });
  if (rocky) {
    // the rock tongue behind: a weathered ridge of tuff higher than the house, its flanks cut with doors and windows
    const zc = R.z0 + 0.1 + rockD / 2, H = eave + 1.4 + rng() * 2.2;
    const jit = rockJitter(look, 0.07);
    const rings: Array<readonly [number, number, number]> = [[W / 2 + 0.1, rockD / 2 + 0.1, -0.4], [W / 2 + 0.12, rockD / 2 + 0.16, H * 0.35],
      [W / 2 - 0.1, rockD / 2 + 0.05, H * 0.7], [W / 2 - 0.9, rockD / 2 - 0.25, H * 0.92]];
    rockMass(sink, ROCK, R.cx, zc, rings, 14, jit, [R.cx + (look() - 0.5) * W * 0.3, H + 0.3, zc - 0.1]);
    // openings cut into the rock's two flanks (each flank at a = 0 (+x) and a = π (-x)), a door low on one
    const radius = (a: number, y: number): readonly [number, number] => {
      const t = Math.min(1, Math.max(0, y / H));
      const rx = (W / 2 + 0.1) * (1 - 0.12 * t * t), rz = (rockD / 2 + 0.1) * (1 - 0.2 * t * t);
      const j = jit(a, y);
      return [rx * j, rz * j];
    };
    for (const a of [0, Math.PI]) {
      if (look() < 0.75) rockFaceQuad(sink, 'dark', R.cx, zc, radius, a - 0.22, a + 0.22, 0.05, 1.8, 0.06);
      rockFaceQuad(sink, 'dark', R.cx, zc, radius, a - 0.12, a + 0.12, H * 0.62, H * 0.62 + 0.55, 0.05);
    }
  }
  return sink.finish();
};

/**
 * The courtyard house (the base compound's plot): the two-storey house across the back of its court, its outside stair
 * up to the upper door, a byre wing beside it, the court closed by tuff walls with the arched gate in the front; or,
 * on the souk plot, the arasta's shop row along the lane in front of the court.
 */
function courtyard(ctx: RegionalBuildContext, shops: boolean) {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const turned = R.D > R.W + 1;
  // the plot in its long-side frame: L along the local x, S across (the court's front at +z)
  const L = (turned ? R.D : R.W) - 0.2, S = (turned ? R.W : R.D) - 0.2;
  const door = pick(look, DOORS), wallH = 2.7 + rng() * 0.4, T = 0.6;
  sink.placed(turned ? Math.PI / 2 : 0, R.cx, 0, R.cz, () => {
    const x0 = -L / 2, x1 = L / 2, z0 = -S / 2, z1 = S / 2;
    const hD = Math.min(6.6, S * 0.46), hW = Math.min(11.5, L * 0.52);
    // the house across the back-left, its front on the court, the stair rising along it to the upper door
    const stair: [number, number] = [hW / 2 - 4.6, hW / 2 - 1.6];
    sink.placed(0, x0 + hW / 2, 0, z0 + hD / 2, () => cappHouse(sink, rng, look, hW, hD, {
      storeys: 2, wall: TUFF, door, frontDoor: true, eyvan: rng() < 0.5, tile: rng() < 0.2, dovecote: rng() < 0.6, bars: true,
      upperDoor: stair[1] + 0.62, stair,
    }));
    // the byre wing at the back-right: one storey, flat roof, a wide plank door
    const bW = Math.max(4, L - hW - (shops ? 0 : 3.2)), bD = Math.min(5.2, S * 0.38);
    sink.placed(0, x1 - bW / 2, 0, z0 + bD / 2, () => cappHouse(sink, rng, look, bW, bD, {
      storeys: 1, wall: RENDER, door: shade(TIMBER, 0.9), frontDoor: true, eyvan: false, tile: false, dovecote: rng() < 0.5, bars: false,
    }));
    // the back wall between the wings, closing the court
    if (x1 - bW > x0 + hW + 0.05) sink.span(TUFF, x0 + hW, -0.4, z0, x1 - bW, wallH, z0 + T);
    if (shops) {
      // the arasta's shop row along the front: vaulted cells with arched fronts on the lane
      const sD = Math.min(4.6, S * 0.32);
      shopRow(sink, look, L, sD, 0, z1 - sD / 2, wallH + 0.7);
      sink.span(TUFF, x0, -0.4, z0 + hD, x0 + T, wallH, z1 - sD);
      sink.span(TUFF, x1 - T, -0.4, z0 + bD, x1, wallH, z1 - sD);
    } else {
      // the court walls: the sides, and the front with the arched gate a little off the middle
      sink.span(TUFF, x0, -0.4, z0 + hD, x0 + T, wallH, z1 - T);
      sink.span(TUFF, x1 - T, -0.4, z0 + bD, x1, wallH, z1 - T);
      const gw = 2.6, ext = 0.5, gu = Math.max(x0 + gw / 2 + ext + 0.6, Math.min(x1 - gw / 2 - ext - 0.6, (rng() - 0.5) * L * 0.3));
      sink.span(TUFF, x0, -0.4, z1 - T, gu - gw / 2 - ext, wallH, z1);
      sink.span(TUFF, gu + gw / 2 + ext, -0.4, z1 - T, x1, wallH, z1);
      gate(sink, faces(x0, x1, z1 - T, z1).front, gu, gw, ext, T, door, look);
      for (const [a, b] of [[x0 - 0.05, gu - gw / 2 - ext], [gu + gw / 2 + ext, x1 + 0.05]] as const) {
        sink.band(TUFF, a, wallH, z1 - T - 0.06, b, wallH + 0.12, z1 + 0.06, { decor: true });
      }
      // a well head in the court
      if (rng() < 0.6) {
        const wx = Math.max(x0 + 1.5, Math.min(x1 - 1.5, gu + (rng() - 0.5) * 3)), wz = z0 + hD + (z1 - T - z0 - hD) * 0.5;
        sink.cylinder(TUFF, [wx, -0.3, wz], 'y', 1.1, 0.65, 10, { decor: true }, 0.62);
        sink.cylinder('dark', [wx, 0.79, wz], 'y', 0.02, 0.48, 10, { decor: true }, 0.48);
      }
    }
  });
  return sink.finish();
}

/** The gate's leaves and tympanum on one face of its block, set back half the block's depth (dressing). */
function gateLeaves(sink: PartSink, face: Face, u: number, w: number, spring: number, pointed: number, T: number, leaf: Rgb): void {
  const lo = { colour: leaf, decor: true, uv: UV_MEMBER }, o = -T * 0.5 + 0.03;
  for (const side of [-1, 1]) {
    faceBox(sink, 'structureWood', face, u + side * w / 4, spring / 2, o, w / 2 - 0.03, spring, 0.06, lo);
    for (const t of [0.15, 0.5, 0.85]) faceBox(sink, 'structureWood', face, u + side * w / 4, spring * t, o + 0.045, w / 2 - 0.12, 0.09, 0.03, { ...lo, fine: true });
  }
  tympanum(sink, 'structureWood', face, u, spring, archCurve(w / 2 - 0.02, pointed ? 8 : 9, pointed), o + 0.03, { colour: shade(leaf, 0.85) });
}

/**
 * The arched gate (kemerli kapı) in a wall: a block standing the wall's depth `T`, its piers `ext` wide either side of
 * the round or pointed arch, carried up over it to a cornice; the double plank gate in the arch with a wicket, on both
 * faces. The leaves are dressing: the 2.6 m opening is narrower than any hull.
 */
function gate(sink: PartSink, face: Face, u: number, w: number, ext: number, T: number, leaf: Rgb, look: () => number): void {
  const spring = 2.2, pointed = look() < 0.5 ? 0.2 : 0, n = pointed ? 8 : 9;
  const curve = archCurve(w / 2, n, pointed), top = spring + crownOf(curve) + 0.75;
  const P = (uu: number, y: number, o = 0) => facePoint(face, uu, y, o);
  const back: Face = { origin: P(0, 0, -T), u: [-face.u[0], 0, -face.u[2]], out: [-face.out[0], 0, -face.out[2]], width: face.width };
  const a = u - w / 2 - ext, b = u + w / 2 + ext;
  archedOpeningWall(sink, TUFF, face, a, b, -0.4, top, { u, w, y0: 0, spring }, pointed, n, T, null);
  archedOpeningWall(sink, TUFF, back, -b, -a, -0.4, top, { u: -u, w, y0: 0, spring }, pointed, n, 0, null);
  // the block's ends and top
  sink.quad(TUFF, P(a, -0.4, -T), P(a, -0.4), P(a, top), P(a, top, -T));
  sink.quad(TUFF, P(b, -0.4), P(b, -0.4, -T), P(b, top, -T), P(b, top));
  sink.quad(TUFF, P(a, top), P(b, top), P(b, top, -T), P(a, top, -T));
  voussoirs(sink, TUFF, face, u, spring, archCurve(w / 2 + 0.01, n, pointed), 0.26, 0.08, {}, !pointed);
  const c0 = P(a - 0.08, top, -T - 0.06), c1 = P(b + 0.08, top, 0.08);
  sink.band(TUFF, Math.min(c0[0], c1[0]), top, Math.min(c0[2], c1[2]), Math.max(c0[0], c1[0]), top + 0.16, Math.max(c0[2], c1[2]), { decor: true });
  gateLeaves(sink, face, u, w, spring, pointed, T, leaf);
  gateLeaves(sink, back, -u, w, spring, pointed, T, leaf);
  faceBox(sink, 'dark', face, u - w / 4, 0.9, -T * 0.5 + 0.095, 0.7, 1.7, 0.006, { decor: true });
  faceBox(sink, 'structureMetal', face, u + 0.18, 1.2, -T * 0.5 + 0.1, 0.08, 0.14, 0.04, { colour: IRON, decor: true, fine: true });
}

/**
 * A row of vaulted shops (the arasta): cells side by side along x under one flat roof, each front a round arch cut to
 * its crown on the lane (+z): open with its goods, or shut by plank shutters under a glazed fanlight; canvas awnings
 * over some, a stone bench along the front.
 */
function shopRow(sink: PartSink, look: () => number, L: number, D: number, cx: number, cz: number, H: number): void {
  const n = Math.max(2, Math.round(L / 3.6)), cw = L / n, T = 0.5;
  const x0 = cx - L / 2, x1 = cx + L / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  // the body: the back and end walls, the partitions between the cells, the roof slab and its parapet
  sink.span(TUFF, x0, -0.4, z0, x1, H, z0 + 0.5);
  sink.span(TUFF, x0, -0.4, z0 + 0.5, x0 + 0.5, H - 0.3, z1 - T);
  sink.span(TUFF, x1 - 0.5, -0.4, z0 + 0.5, x1, H - 0.3, z1 - T);
  for (let i = 1; i < n; i++) sink.span(TUFF, x0 + cw * i - 0.15, -0.4, z0 + 0.5, x0 + cw * i + 0.15, H - 0.3, z1 - T);
  sink.span(TUFF, x0, H - 0.3, z0 + 0.5, x1, H, z1);
  sink.span(TUFF, x0, H, z1 - 0.3, x1, H + 0.5, z1);
  sink.span(TUFF, x0, H, z0, x1, H + 0.5, z0 + 0.3);
  const spring = Math.min(2.0, H - 0.3 - Math.min(2.6, cw - 0.9) / 2 - 0.35);
  for (let i = 0; i < n; i++) {
    const u = -L / 2 + cw * (i + 0.5), w = Math.min(2.6, cw - 0.9);
    const bay: Face = { origin: [cx + u, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: cw };
    const curve = archedOpeningWall(sink, TUFF, bay, -cw / 2, cw / 2, -0.4, H - 0.3, { u: 0, w, y0: 0, spring }, 0, 9, T, null);
    voussoirs(sink, TUFF, bay, 0, spring, curve, 0.22, 0.07);
    if (look() < 0.55) {
      // open: kilims hung at the back of the cell and a stack of rugs, or the potters' red jugs on the floor
      const cell: Face = { origin: [cx + u, 0, z0 + 0.5], u: [1, 0, 0], out: [0, 0, 1], width: cw - 0.3 };
      if (look() < 0.5) {
        kilim(sink, cell, -0.5, 0.3, Math.min(1.3, w * 0.55), 1.7, look);
        kilim(sink, cell, 0.75, 0.5, Math.min(1.0, w * 0.4), 1.4, look);
        for (let k = 0; k < 4; k++) sink.span('structureWood', cx + u - 0.7, k * 0.12, z0 + 0.9, cx + u + 0.7, k * 0.12 + 0.11, z0 + 1.7,
          { colour: pick(look, KILIM_GROUNDS), decor: true });
      } else {
        for (let k = 0; k < 6; k++) jug(sink, cx + u + (look() - 0.5) * (w - 0.5), 0, z0 + 0.8 + look() * Math.max(0.2, D - T - 1.6), 0.13 + look() * 0.1, look() < 0.5,
          shade(CLAY, 0.85 + look() * 0.25));
      }
    } else {
      // shut: plank shutters to the springs, a glazed fanlight over them, set back in the reveal
      const lc = { colour: pick(look, DOORS), decor: true, uv: UV_MEMBER };
      for (const side of [-1, 1]) faceBox(sink, 'structureWood', bay, side * w / 4, spring / 2, -T + 0.06, w / 2 - 0.02, spring, 0.05, lc);
      tympanum(sink, 'glass', bay, 0, spring, archCurve(w / 2 - 0.02, 9), -T + 0.05);
    }
    if (look() < 0.5) {
      // a canvas awning over the arch
      const c = pick(look, CANVAS), ya = spring + w / 2 + 0.15, ua = cx + u - w / 2 - 0.2, ub = cx + u + w / 2 + 0.2;
      canvas(sink, [ua, ya, z1], [ub, ya, z1], [ub, ya - 0.55, z1 + 1.3], [ua, ya - 0.55, z1 + 1.3], c);
    }
  }
  // the stone bench (seki) along the front
  sink.span(TUFF, x0 + 0.3, -0.3, z1, x1 - 0.3, 0.42, z1 + 0.45, { decor: true });
}

/** The arasta (the base market row's plot): a row of vaulted shops along the lane. */
const arasta: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = reach(ctx);
  const turned = R.D > R.W + 1;
  const L = (turned ? R.D : R.W) - 0.2, D = (turned ? R.W : R.D) - 0.2;
  const H = 3.5 + ctx.rng() * 0.3;
  sink.placed(turned ? -Math.PI / 2 : 0, R.cx, 0, R.cz, () => shopRow(sink, ctx.variant, L, D, 0, 0, H));
  return sink.finish();
};

/**
 * A potter's stall (the base market plot): a tuff back wall with shelves of jugs, low side walls hung with kilims, a
 * counter across the front, a timber pergola under a canvas, the red jugs and pots of Avanos clay on the ground.
 */
const stall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const R = reach(ctx);
  const W = Math.max(4.2, R.W - 0.2), D = Math.max(3.4, R.D - 0.2);
  sink.placed(0, R.cx, 0, R.cz, () => {
    const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, top = 2.6;
    sink.span(TUFF, x0, -0.4, z0, x1, top + 0.3, z0 + 0.45);
    for (const s of [-1, 1]) sink.span(TUFF, s > 0 ? x1 - 0.4 : x0, -0.4, z0, s > 0 ? x1 : x0 + 0.4, 1.4, z0 + D * 0.55);
    sink.span(TUFF, x0 + 0.6, -0.4, z1 - 0.55, x1 - 1.3, 0.85, z1);
    // shelves on the back wall, jugs on them
    const back = faces(x0, x1, z0, z0 + 0.45).front;
    for (const y of [0.9, 1.6]) {
      faceBox(sink, 'structureWood', back, 0, y, 0.15, W - 1.2, 0.05, 0.3, { colour: TIMBER, decor: true });
      for (let k = 0; k < 5; k++) jug(sink, x0 + 0.9 + k * (W - 1.8) / 4, y + 0.025, z0 + 0.6, 0.1 + look() * 0.04, look() < 0.5, shade(CLAY, 0.85 + look() * 0.3));
    }
    for (const s of [-1, 1]) {
      const side = s > 0 ? faces(x1 - 0.4, x1, z0, z0 + D * 0.55).left : faces(x0, x0 + 0.4, z0, z0 + D * 0.55).right;
      kilim(sink, side, 0, 0.25, D * 0.45, 1.05, look);
    }
    // the pergola: posts at the front, beams to the back wall, the canvas over them
    const post = rgb(0x7a6048);
    for (const s of [-1, 1]) sink.cylinder('structureWood', [s * (W / 2 - 0.25), 0, z1 - 0.2], 'y', top, 0.07, 6, { colour: post, uv: UV_MEMBER }, 0.07);
    sink.member('structureWood', [x0 + 0.1, top, z1 - 0.2], [x1 - 0.1, top, z1 - 0.2], 0.12, 0.12, [0, 1, 0], { colour: post });
    const c = pick(look, CANVAS);
    canvas(sink, [x0, top + 0.3, z0 + 0.4], [x1, top + 0.3, z0 + 0.4], [x1, top + 0.08, z1], [x0, top + 0.08, z1], c);
    // the jugs and pots on the ground and the counter
    for (let k = 0; k < 7; k++) jug(sink, x0 + 0.8 + look() * (W - 1.6), 0, z0 + 1.0 + look() * (D - 2.2), 0.14 + look() * 0.12, look() < 0.4, shade(CLAY, 0.8 + look() * 0.35));
    for (let k = 0; k < 3; k++) jug(sink, x0 + 1.0 + k * 0.7, 0.85, z1 - 0.28, 0.1, k % 2 === 0, shade(CLAY, 0.9 + look() * 0.2));
  });
  return sink.finish();
};

/**
 * The Ottoman stone minaret (the base minaret's plot): a square base (kürsü) with a moulded top, the faceted shoe
 * (pabuç) into a sixteen-sided shaft, the balcony (şerefe) on three corbelled rings with its parapet, the upper shaft
 * and the lead cone (külah) with its brass finial; a small arched door at the foot.
 */
const minaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = reach(ctx);
  const S = Math.max(2.8, Math.min(R.W, R.D) - 0.2), H = Math.max(14, Math.min(19, ctx.bounds.maxY + 0.5));
  sink.placed(0, R.cx, 0, R.cz, () => {
    const baseH = 3.2, r0 = S * 0.33;
    sink.span(TUFF, -S / 2, -0.4, -S / 2, S / 2, baseH, S / 2);
    sink.band(TUFF, -S / 2 - 0.08, baseH - 0.2, -S / 2 - 0.08, S / 2 + 0.08, baseH, S / 2 + 0.08, { decor: true });
    // the shoe: an octagon from the square's width to the shaft
    sink.cylinder(TUFF, [0, baseH, 0], 'y', 0.9, S * 0.5, 8, {}, r0 * 1.06, true, Math.PI / 8);
    const shaft0 = baseH + 0.9, balcony = H - 4.4;
    sink.cylinder(TUFF, [0, shaft0, 0], 'y', balcony - shaft0, r0 * 1.04, 16, {}, r0 * 0.96, false);
    // the şerefe: corbelled rings, the floor and the parapet ring
    let y = balcony, r = r0 * 0.96;
    for (const [h, rr] of [[0.28, 1.12], [0.28, 1.3], [0.24, 1.5]] as const) {
      sink.cylinder(TUFF, [0, y, 0], 'y', h, r, 16, { shade: 0.92 }, r0 * rr, false);
      y += h; r = r0 * rr;
    }
    sink.cylinder(TUFF, [0, y, 0], 'y', 0.12, r0 * 1.62, 16, {}, r0 * 1.62, true);
    y += 0.12;
    // the parapet: a ring of carved panels (a low wall) round the walk
    sink.cylinder(TUFF, [0, y, 0], 'y', 0.85, r0 * 1.6, 16, {}, r0 * 1.6, false);
    sink.cylinder(TUFF, [0, y + 0.85, 0], 'y', 0.08, r0 * 1.66, 16, { decor: true }, r0 * 1.66, true);
    // the upper shaft, its cornice and the lead cone with the finial
    const up0 = y, up1 = H - 2.4;
    sink.cylinder(TUFF, [0, up0, 0], 'y', up1 - up0, r0 * 0.86, 16, {}, r0 * 0.84, false);
    sink.cylinder(TUFF, [0, up1, 0], 'y', 0.2, r0 * 0.84, 16, { decor: true }, r0 * 1.0, true);
    sink.cylinder('structureMetal', [0, up1 + 0.2, 0], 'y', 2.2, r0 * 1.0, 16, { colour: LEAD }, 0.04, false);
    for (const [yy, rr] of [[up1 + 2.4, 0.1], [up1 + 2.62, 0.08], [up1 + 2.8, 0.06]] as const) {
      sink.cylinder('structureMetal', [0, yy, 0], 'y', 0.16, rr, 8, { colour: BRASS, decor: true }, rr, true);
    }
    sink.cylinder('structureMetal', [0, up1 + 2.2, 0], 'y', 0.75, 0.025, 6, { colour: BRASS, decor: true }, 0.02, true);
    // the shaft's carved rings and the small arched door in the base
    for (const yy of [shaft0 + 0.6, (shaft0 + balcony) / 2]) sink.cylinder(TUFF, [0, yy, 0], 'y', 0.14, r0 * 1.08, 16, { decor: true }, r0 * 1.08, true);
    const face = faces(-S / 2, S / 2, -S / 2, S / 2).front;
    doorUnit(sink, face, 0, 0, 0.8, 1.8, { leaf: DOORS[0], frame: { bucket: TUFF, width: 0.16, out: 0.06 }, steps: { bucket: TUFF }, leafKind: 'panel' });
    const curve = archCurve(0.56, 7, 0.18);
    tympanum(sink, TUFF, face, 0, 1.96, curve, 0.05);
    voussoirs(sink, TUFF, face, 0, 1.96, curve, 0.14, 0.07, {}, false);
  });
  return sink.finish();
};

/**
 * A fairy-chimney house (the base tower's plot): a cone of tuff under its cap of the harder bed, a dressed-stone front
 * built into the mouth of the rooms cut in its foot, small windows cut higher, and the pigeon holes under the cap
 * ringed with whitewash. Each chimney its own girth, flutes, lean and cap.
 */
const chimneyHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const neck = Math.max(6.5, Math.min(9.5, ctx.bounds.maxY - 1.6 + rng() * 1.2));
  const flutes = 5 + Math.floor(rng() * 6), fd = 0.03 + rng() * 0.05;
  const jit = rockJitter(look, 0.035, flutes, fd);
  const prof = [[1.02, -0.4], [1.0, 0.5], [0.9, neck * 0.3], [0.74, neck * 0.55], [0.55, neck * 0.78], [0.36, neck * 0.95], [0.3, neck]] as const;
  // the cone's foot fills the plot's reach (an ellipse whose axes touch its sides)
  const sx = Math.max(1.6, R.W / 2 + 0.02), sz = Math.max(1.6, R.D / 2 + 0.02);
  sink.placed(0, R.cx, 0, R.cz, () => {
    rockMass(sink, ROCK, 0, 0, prof.map(([k, y]) => [sx * k, sz * k, y] as const), 16, jit, null);
    // the cap: a dark slab of the harder bed overhanging the neck, its top rounded
    const cr = Math.max(sx, sz) * (0.5 + rng() * 0.18), capH = 0.9 + rng() * 0.6, tilt = (rng() - 0.5) * 0.3;
    const cj = rockJitter(look, 0.1);
    rockMass(sink, ROCK, 0, 0, [[sx * 0.28, sz * 0.28, neck - 0.08], [cr, cr * 0.9, neck + 0.2], [cr * 1.04, cr * 0.94, neck + capH * 0.55], [cr * 0.7, cr * 0.62, neck + capH]],
      12, cj, [tilt, neck + capH + 0.35, -tilt], { shade: 0.42 });
    const radius = (a: number, y: number): readonly [number, number] => {
      // the profile's radius at height y (linear between its rings) and the jitter
      let k = prof[0][0];
      for (let i = 0; i + 1 < prof.length; i++) {
        if (y >= prof[i][1] && y <= prof[i + 1][1]) { k = prof[i][0] + (prof[i + 1][0] - prof[i][0]) * (y - prof[i][1]) / (prof[i + 1][1] - prof[i][1]); break; }
      }
      const j = jit(a, y);
      return [sx * k * j, sz * k * j];
    };
    // the front: the house's mouth on +z (a = -π/2 in the lathe's angle), a dressed-stone wall built into it
    const front = -Math.PI / 2;
    if (rng() < 0.7) {
      // the front stands proud of the rock's foot (its flutes and lobes included) and further proud of the slope above
      const fw = Math.min(2.2, sx * 1.2), fz = sz * 1.07, fh = Math.min(2.8, neck * 0.32);
      sink.span(TUFF, -fw / 2, -0.4, sz * 0.35, fw / 2, fh, fz);
      sink.band(TUFF, -fw / 2 - 0.06, fh, sz * 0.35, fw / 2 + 0.06, fh + 0.12, fz + 0.06, { decor: true });
      const face: Face = { origin: [0, 0, fz], u: [1, 0, 0], out: [0, 0, 1], width: fw };
      doorUnit(sink, face, 0, 0, 0.9, 1.85, { leaf: pick(look, DOORS), frame: { bucket: TUFF, width: 0.15, out: 0.05 }, steps: { bucket: TUFF }, leafKind: 'plank' });
      const curve = archCurve(0.6, 7);
      if (fh > 2.55) { tympanum(sink, TUFF, face, 0, 2.0, curve, 0.04); voussoirs(sink, TUFF, face, 0, 2.0, curve, 0.13, 0.06); }
    } else {
      rockFaceQuad(sink, 'dark', 0, 0, radius, front - 0.28, front + 0.28, 0.0, 1.9, 0.05);
    }
    // windows cut on two levels round the cone, the pigeon holes under the cap with their limed rims
    for (const [a, y] of [[front + 1.1, neck * 0.36], [front - 1.3, neck * 0.4], [front + 0.2, neck * 0.55], [front + 2.6, neck * 0.5]] as const) {
      if (look() < 0.25) continue;
      rockFaceQuad(sink, 'dark', 0, 0, radius, a - 0.16, a + 0.16, y, y + 0.62, 0.05);
    }
    const ring = neck * 0.82;
    for (let k = 0; k < 7; k++) {
      if (look() < 0.3) continue;
      const a = front + (k - 3) * 0.45;
      rockFaceQuad(sink, LIME, 0, 0, radius, a - 0.13, a + 0.13, ring - 0.16, ring + 0.32, 0.03);
      rockFaceQuad(sink, 'dark', 0, 0, radius, a - 0.07, a + 0.07, ring - 0.04, ring + 0.2, 0.05);
    }
  });
  return sink.finish();
};

/**
 * Rock-cut ruins (the base ruin's plot): a weathered outcrop of tuff its abandoned rooms were cut into, doors and
 * windows dark in its flanks, the collapsed masonry front of a house built against it, a broken arch on its pier.
 */
const rockRuin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const rx = R.W / 2 + 0.02, rz = R.D / 2 + 0.02, H = 3.4 + rng() * 1.6;
  const jit = rockJitter(look, 0.08);
  const prof = [[1.0, -0.4], [1.0, H * 0.3], [0.88, H * 0.62], [0.62, H * 0.86], [0.3, H]] as const;
  sink.placed(0, R.cx, 0, R.cz, () => {
    // the outcrop stands over the back two thirds; the fallen front lies in the first third
    const oz = -rz * 0.25, orz = rz * 0.75;
    rockMass(sink, ROCK, 0, oz, prof.map(([k, y]) => [rx * k, orz * k, y] as const), 14, jit, [(look() - 0.5) * rx * 0.4, H + 0.25, oz]);
    const radius = (a: number, y: number): readonly [number, number] => {
      let k = prof[0][0];
      for (let i = 0; i + 1 < prof.length; i++) {
        if (y >= prof[i][1] && y <= prof[i + 1][1]) { k = prof[i][0] + (prof[i + 1][0] - prof[i][0]) * (y - prof[i][1]) / (prof[i + 1][1] - prof[i][1]); break; }
      }
      const j = jit(a, y);
      return [rx * k * j, orz * k * j];
    };
    for (const a of [-Math.PI / 2, -Math.PI / 2 + 0.7, 0, Math.PI, Math.PI / 2 + 0.4]) {
      if (look() < 0.3) continue;
      if (look() < 0.5) rockFaceQuad(sink, 'dark', 0, oz, radius, a - 0.16, a + 0.16, 0.0, 1.75, 0.05);
      else rockFaceQuad(sink, 'dark', 0, oz, radius, a - 0.11, a + 0.11, H * 0.45, H * 0.45 + 0.6, 0.05);
    }
    // the collapsed front: broken wall stubs of squared tuff along the front edge, blocks fallen in front of them
    const fz = rz - 0.35;
    let x = -rx + 0.1;
    while (x < rx - 0.4) {
      const w = 0.9 + look() * 1.4, h = 0.5 + look() * 1.6;
      sink.span(TUFF, x, -0.4, fz - 0.55, Math.min(rx - 0.1, x + w), h, fz);
      x += w + (look() < 0.3 ? 0.6 + look() * 0.8 : 0);
    }
    for (let k = 0; k < 9; k++) {
      const bx = (look() - 0.5) * rx * 1.7, bz = fz - 0.8 - look() * (rz * 0.5), s = 0.25 + look() * 0.3;
      sink.box(TUFF, [bx, s * 0.4, bz], [s * 0.9, s * 0.45, s * 0.6], { decor: true, uv: UV_WORLD },
        new LocalFrame([Math.cos(k), 0, Math.sin(k)], [0, 1, 0], [-Math.sin(k), 0, Math.cos(k)], [0, 0, 0]));
    }
    // a broken arch on its pier against the rock
    const px = (rng() < 0.5 ? -1 : 1) * rx * 0.45;
    sink.span(TUFF, px - 0.35, -0.4, fz - 0.95, px + 0.35, 2.4, fz - 0.4);
    const face: Face = { origin: [px, 0, fz - 0.4], u: [1, 0, 0], out: [0, 0, 1], width: 0.7 };
    voussoirs(sink, TUFF, face, -1.1, 2.4, archCurve(1.1, 9).slice(0, 4), 0.28, 0.55);
  });
  return sink.finish();
};

/**
 * The hamam (the base bathhouse's plot): a tuff block of rooms, the dressing room's large dome with its lantern over
 * the door, the warm and hot rooms' smaller domes behind, every dome on an octagonal drum and starred with glass
 * bull's-eyes (fil gözü), the furnace chimney at the back.
 */
const hamam: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const W = Math.max(8, R.W - 0.2), D = Math.max(8, R.D - 0.2);
  sink.placed(0, R.cx, 0, R.cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.06, bucket: TUFF }, storeys: [{ h: 3.8, wall: TUFF }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.24, bucket: RENDER, parapet: 0.3 }, gableBucket: TUFF,
      openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.2, y0: 0, h: 2.2 },
        ...windowRhythm('left', 0, D, { w: 0.45, h: 0.6, sill: 2.4, spacing: 2.6, margin: 1.4, max: 3 }),
        ...windowRhythm('right', 0, D, { w: 0.45, h: 0.6, sill: 2.4, spacing: 2.6, margin: 1.4, max: 3 })],
      chimneys: [{ x: W / 2 - 0.7, z: -D / 2 + 0.7, sx: 0.7, sz: 0.7, above: 2.2, bucket: TUFF, cap: 'slab' }], gutters: null, verge: null, reveal: 0.4,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: IRON, frameWidth: 0.04, frameOut: 0.04, bars: 'two', surround: null, sill: { bucket: TUFF, out: 0.06 }, shutters: null }, rng, 0.2),
      door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: pick(look, DOORS), frame: { bucket: TUFF, width: 0.22, out: 0.08 }, steps: { bucket: TUFF }, leafKind: 'panel' }, y0 + o.y0),
    });
    const face = frame.faces.front, ys = frame.floors[0] + 2.2 + 0.22, curve = archCurve(0.82, 8, 0.2);
    tympanum(sink, TUFF, face, 0, ys, curve, 0.07);
    rosette(sink, TUFF, face, 0, ys + 0.38, 0.14, 0.08, { shade: 0.86 });
    voussoirs(sink, TUFF, face, 0, ys, curve, 0.22, 0.1, {}, false);
    const roofY = frame.eaveY + 0.24;
    // the domes: the dressing room's over the front half, two over the warm and hot rooms behind
    const domes: Array<[number, number, number, boolean]> = [[0, D * 0.2, Math.min(W, D) * 0.27, true],
      [-W * 0.24, -D * 0.24, Math.min(W, D) * 0.17, false], [W * 0.2, -D * 0.24, Math.min(W, D) * 0.15, false]];
    const domeBucket: RegionalBucket = look() < 0.6 ? LIME : RENDER;
    for (const [x, z, r, lantern] of domes) {
      // the octagonal drum
      sink.cylinder(TUFF, [x, roofY - 0.1, z], 'y', 0.9, r * 1.08, 8, {}, r * 1.08, true, Math.PI / 8);
      const y0 = roofY + 0.8, prof = [1.0, 0.97, 0.88, 0.71, 0.45, 0.14];
      let y = y0;
      for (let k = 0; k + 1 < prof.length; k++) {
        sink.cylinder(domeBucket, [x, y, z], 'y', r * 0.2, r * prof[k], 16, {}, r * prof[k + 1], k === prof.length - 2 && !lantern);
        y += r * 0.2;
      }
      if (lantern) {
        sink.cylinder(domeBucket, [x, y, z], 'y', 0.5, r * 0.14, 8, {}, r * 0.14, false);
        sink.cylinder('structureMetal', [x, y + 0.5, z], 'y', 0.45, r * 0.2, 8, { colour: LEAD }, 0.03, true);
      }
      // the bull's-eyes: glass lenses in rings on the dome's flank, seated on its profile (radius and slope at their height)
      const rho = (t: number) => {
        const f = Math.min(prof.length - 1.0001, Math.max(0, t / 0.2)), i = Math.floor(f);
        return r * (prof[i] + (prof[i + 1] - prof[i]) * (f - i));
      };
      for (const [t, count] of [[0.3, 12], [0.58, 8]] as const) {
        const rr = rho(t), slope = (rho(t + 0.02) - rho(t - 0.02)) / (0.04 * r);
        for (let k = 0; k < count; k++) {
          const a = Math.PI * 2 * k / count + (t > 0.5 ? Math.PI / count : 0);
          const radial: Vec3 = [Math.cos(a), 0, -Math.sin(a)];
          const nl = Math.hypot(1, slope), nrm: Vec3 = [radial[0] / nl, -slope / nl, radial[2] / nl];
          const ta: Vec3 = [-Math.sin(a), 0, -Math.cos(a)];
          const c: Vec3 = [x + radial[0] * rr, y0 + t * r, z + radial[2] * rr];
          sink.box('glass', c, [0.07, 0.07, 0.035], { decor: true, fine: true, uv: UV_WORLD }, new LocalFrame(cross(ta, nrm), ta, nrm, [0, 0, 0]), { nz: true });
        }
      }
    }
  });
  return sink.finish();
};

/**
 * The Seljuk caravanserai (the base caravanserai's plot): squared tuff walls with buttress towers at the corners and
 * along the sides, the carved portal (taç kapı) standing proud of the front and over the walls, its pointed niche
 * hooded by stalactite corbels over the door; inside, the arcades round the court, the little mosque on four arches in
 * its middle (köşk mescit) and the covered winter hall across the back under its stone roof.
 */
const caravanserai: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const R = reach(ctx);
  const turned = R.D > R.W + 1.5;
  const L = (turned ? R.D : R.W), S = (turned ? R.W : R.D);
  sink.placed(turned ? Math.PI / 2 : 0, R.cx, 0, R.cz, () => {
    const inset = 0.42, T = 1.0, H = 6.6 + rng() * 0.6;
    const x0 = -L / 2 + inset, x1 = L / 2 - inset, z0 = -S / 2 + inset, z1 = S / 2 - inset;
    // the outer walls
    sink.span(TUFF, x0, -0.4, z0, x1, H, z0 + T);
    sink.span(TUFF, x0, -0.4, z0, x0 + T, H, z1);
    sink.span(TUFF, x1 - T, -0.4, z0, x1, H, z1);
    const pw = Math.min(7.2, L * 0.36), ph = H + 2.6;
    sink.span(TUFF, x0, -0.4, z1 - T, -pw / 2, H, z1);
    sink.span(TUFF, pw / 2, -0.4, z1 - T, x1, H, z1);
    // the cornice and parapet round the top
    sink.band(TUFF, x0 - 0.08, H, z0 - 0.08, x1 + 0.08, H + 0.22, z1 + 0.08, { decor: true });
    // the corner towers (octagonal) and the side buttresses (half octagons standing on the wall's face)
    for (const [cx, cz] of [[x0 + 0.35, z0 + 0.35], [x1 - 0.35, z0 + 0.35], [x0 + 0.35, z1 - 0.35], [x1 - 0.35, z1 - 0.35]] as const) {
      sink.cylinder(TUFF, [cx, -0.4, cz], 'y', H + 0.6, 0.85, 8, {}, 0.8, true, Math.PI / 8);
    }
    for (const t of [-0.25, 0.25]) {
      for (const side of [-1, 1]) {
        const bx = side < 0 ? x0 : x1, bz = t * (z1 - z0);
        sink.cylinder(TUFF, [bx, -0.4, bz], 'y', H - 0.4, 0.5, 6, {}, 0.42, true, Math.PI / 6);
      }
      sink.cylinder(TUFF, [t * (x1 - x0) * 1.3, -0.4, z0], 'y', H - 0.4, 0.5, 6, {}, 0.42, true, Math.PI / 6);
    }
    // the portal block: a tall frame proud of the front, cut by the pointed niche
    const P0 = z1 - T, P1 = S / 2 + 0.12, nw = pw * 0.52, nSpring = ph * 0.6;
    const pf: Face = { origin: [0, 0, P1], u: [1, 0, 0], out: [0, 0, 1], width: pw };
    const curve = archedOpeningWall(sink, TUFF, pf, -pw / 2, pw / 2, -0.4, ph, { u: 0, w: nw, y0: 0, spring: nSpring }, 0.22, 10, 0.9, TUFF);
    const pr = faces(-pw / 2, pw / 2, P0, P1);
    for (const f of [pr.right, pr.left]) faceRect(sink, TUFF, f, -f.width / 2, f.width / 2, -0.4, ph);
    sink.quad(TUFF, [-pw / 2, ph, P1], [pw / 2, ph, P1], [pw / 2, ph, P0], [-pw / 2, ph, P0]);
    faceRect(sink, TUFF, pr.back, -pr.back.width / 2, pr.back.width / 2, -0.4, ph);
    faceBox(sink, 'dark', pr.back, 0, 1.5, 0.01, 2.2, 3.0, 0.02, { decor: true });
    tympanum(sink, 'dark', pr.back, 0, 3.0, archCurve(1.1, 9), 0.012);
    // the niche's back: the doorway's round arch and the stalactite hood stepping out under the pointed head
    const back: Face = { origin: [0, 0, P1 - 0.9], u: [1, 0, 0], out: [0, 0, 1], width: nw };
    faceBox(sink, 'dark', back, 0, 1.6, 0.01, 2.4, 3.2, 0.02, { decor: true });
    tympanum(sink, 'dark', back, 0, 3.2, archCurve(1.2, 9), 0.012);
    voussoirs(sink, TUFF, back, 0, 3.2, archCurve(1.22, 9), 0.24, 0.12);
    const rows = 5, crownY = nSpring + Math.max(...curve.map(([, dy]) => dy));
    for (let r = 0; r < rows; r++) {
      const y = nSpring - 0.6 + r * (crownY - nSpring + 0.3) / rows, n = 9 - r;
      const span = nw * (1 - r / (rows + 1.5));
      for (let k = 0; k < n; k++) {
        const u = -span / 2 + span * (k + 0.5) / n;
        faceBox(sink, TUFF, back, u, y, 0.1 + r * 0.1, span / n * 0.86, 0.34, 0.2 + r * 0.1, { decor: true, shade: 0.95 - r * 0.05 });
      }
    }
    // the carved borders: bands round the niche and up the frame, an inscription panel over the arch
    for (const [u, w] of [[-pw / 2 + 0.3, 0.32], [pw / 2 - 0.3, 0.32], [-nw / 2 - 0.35, 0.22], [nw / 2 + 0.35, 0.22]] as const) {
      faceBox(sink, TUFF, pf, u, ph / 2 - 0.2, 0.05, w, ph - 1.0, 0.1, { decor: true, shade: 0.9 });
    }
    faceBox(sink, TUFF, pf, 0, ph - 0.45, 0.06, pw - 0.6, 0.36, 0.12, { decor: true, shade: 0.88 });
    faceBox(sink, TUFF, pf, 0, crownY + 0.55, 0.05, nw * 0.9, 0.42, 0.08, { decor: true, shade: 0.8 });
    voussoirs(sink, TUFF, pf, 0, nSpring, archCurve(nw / 2 + 0.02, 10, 0.22), 0.3, 0.08, {}, false);
    for (const u of [-nw / 2 - 0.9, nw / 2 + 0.9]) rosette(sink, TUFF, pf, u, crownY + 0.2, 0.32, 0.08, { shade: 0.86 });
    // the winter hall across the back: a long vault under a stone ridge roof showing over the walls
    const hallZ1 = z0 + (z1 - z0) * 0.38;
    sink.span(TUFF, x0 + T, -0.4, hallZ1 - 0.8, x1 - T, H - 0.2, hallZ1);
    const ridge = H + 1.7;
    sink.polygon(TUFF, [[x0 + T, H - 0.2, hallZ1], [x1 - T, H - 0.2, hallZ1], [x1 - T, ridge, (z0 + T + hallZ1) / 2], [x0 + T, ridge, (z0 + T + hallZ1) / 2]]);
    sink.polygon(TUFF, [[x1 - T, H - 0.2, z0 + T], [x0 + T, H - 0.2, z0 + T], [x0 + T, ridge, (z0 + T + hallZ1) / 2], [x1 - T, ridge, (z0 + T + hallZ1) / 2]]);
    for (const xs of [x0 + T, x1 - T]) {
      const tri: Vec3[] = [[xs, H - 0.2, z0 + T], [xs, H - 0.2, hallZ1], [xs, ridge, (z0 + T + hallZ1) / 2]];
      sink.polygon(TUFF, xs < 0 ? tri : [...tri].reverse());
    }
    // the hall's doorway on the court
    const hallFace: Face = { origin: [0, 0, hallZ1], u: [1, 0, 0], out: [0, 0, 1], width: x1 - x0 - 2 * T };
    faceBox(sink, 'dark', hallFace, 0, 1.4, 0.01, 2.0, 2.8, 0.02, { decor: true });
    tympanum(sink, 'dark', hallFace, 0, 2.8, archCurve(1.0, 8, 0.2), 0.012);
    voussoirs(sink, TUFF, hallFace, 0, 2.8, archCurve(1.02, 8, 0.2), 0.22, 0.1, {}, false);
    // the arcades along the court's sides: piers, pointed arches, a flat roof back to the outer wall
    const az0 = hallZ1 + 0.3, az1 = z1 - T - 0.3, aDepth = 2.6, n = Math.max(3, Math.round((az1 - az0) / 3.0));
    for (const side of [-1, 1]) {
      const xw = side < 0 ? x0 + T : x1 - T, xp = xw + side * -aDepth;
      sink.span(RENDER, Math.min(xw, xp) - 0.2, 3.5, az0, Math.max(xw, xp) + 0.2, 3.85, az1);
      const face: Face = side < 0
        ? { origin: [xp + 0.3, 0, (az0 + az1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: az1 - az0 }
        : { origin: [xp - 0.3, 0, (az0 + az1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: az1 - az0 };
      for (let k = 0; k <= n; k++) {
        const z = az0 + (az1 - az0) * k / n;
        sink.span(TUFF, xp - 0.3, -0.4, z - 0.3, xp + 0.3, 3.5, z + 0.3);
      }
      for (let k = 0; k < n; k++) {
        const zc = az0 + (az1 - az0) * (k + 0.5) / n, u = side < 0 ? (az0 + az1) / 2 - zc : zc - (az0 + az1) / 2;
        const half = (az1 - az0) / n / 2 - 0.3;
        voussoirs(sink, TUFF, face, u, 1.95, archCurve(half, 8, 0.2), 0.2, 0.3, {}, false);
      }
    }
    // the köşk mescit: a small domed room on four arches in the middle of the court, its stair up one side
    const kx = 0, kz = (az0 + az1) / 2 + 0.6, ks = 3.4;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      sink.span(TUFF, kx + sx * ks / 2 - (sx > 0 ? 0.6 : 0), -0.4, kz + sz * ks / 2 - (sz > 0 ? 0.6 : 0), kx + sx * ks / 2 + (sx < 0 ? 0.6 : 0), 2.6, kz + sz * ks / 2 + (sz < 0 ? 0.6 : 0));
    }
    sink.span(TUFF, kx - ks / 2, 2.6, kz - ks / 2, kx + ks / 2, 4.6, kz + ks / 2);
    sink.band(TUFF, kx - ks / 2 - 0.08, 4.6, kz - ks / 2 - 0.08, kx + ks / 2 + 0.08, 4.78, kz + ks / 2 + 0.08, { decor: true });
    const kf = faces(kx - ks / 2, kx + ks / 2, kz - ks / 2, kz + ks / 2);
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const f = kf[name];
      tympanum(sink, 'dark', f, 0, 1.4, archCurve(1.1, 8, 0.2), 0.012);
      faceBox(sink, 'dark', f, 0, 0.7, 0.008, 2.2, 1.4, 0.006, { decor: true });
      voussoirs(sink, TUFF, f, 0, 1.4, archCurve(1.12, 8, 0.2), 0.18, 0.08, {}, false);
      faceBox(sink, 'dark', f, 0, 3.6, 0.01, 0.5, 0.7, 0.02, { decor: true });
    }
    let y = 4.78;
    for (const [h, r0, r1] of [[0.5, ks * 0.42, ks * 0.42], [0.45, ks * 0.42, ks * 0.36], [0.4, ks * 0.36, ks * 0.24], [0.35, ks * 0.24, 0.05]] as const) {
      sink.cylinder(TUFF, [kx, y, kz], 'y', h, r0, 8, {}, r1, r1 < 0.1, Math.PI / 8);
      y += h;
    }
    for (let k = 0; k < 8; k++) sink.span(TUFF, kx + ks / 2 + 0.05, -0.3, kz - ks / 2 + 0.3 + k * 0.32, kx + ks / 2 + 0.95, 0.3 * (k + 1), kz - ks / 2 + 0.62 + k * 0.32, { decor: true });
  });
  return sink.finish();
};

export const CAPPADOCIA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: house,
  compound: (ctx) => courtyard(ctx, false),
  compoundSouk: (ctx) => courtyard(ctx, true),
  caravanserai,
  minaret,
  market: stall,
  marketRow: arasta,
  tower: chimneyHouse,
  ruin: rockRuin,
  bathhouse: hamam,
});

export const CAPPADOCIA_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'cappadocia',
  region: 'Göreme and its valleys, Nevşehir province, Cappadocia: squared-tuff houses, rooms cut into the fairy chimneys, a Seljuk caravanserai',
  surfaces: {
    roof: { kind: 'canal', tint: [0.8, 0.5, 0.38] },
    // squared tuff: coursed blocks, honey to cream, tight pale joints
    stone: { kind: 'limestone', tint: [0.97, 0.87, 0.72] },
    sourced: { plaster: true, wood: true },
    tones: {
      // the earth render: the valley's cream-ochre clay
      plaster: (_h, s, l) => [0.1, Math.min(1, s * 0.35 + 0.12), Math.min(1, l * 1.08 + 0.1)],
      // the whitewash of the pigeon bands and domes
      plaster2: (_h, s, l) => [0.11, Math.min(1, s * 0.12), Math.min(1, l * 1.2 + 0.22)],
      // the living rock: cream with a rose cast
      plaster3: (_h, s, l) => [0.065, Math.min(1, s * 0.3 + 0.14), Math.min(1, l * 1.02 + 0.14)],
    },
  },
  builders: CAPPADOCIA_BUILDERS,
  // tuff from honey to cream to the rose of the Red and Rose valleys house to house; a dry upland (little damp, a
  // trace of the orange lichen of the north faces)
  weather: {
    plaster: [[1, 1, 1], [1.03, 1.0, 0.95], [0.96, 0.92, 0.86], [1.04, 0.98, 0.9]],
    stone: [[1, 1, 1], [1.04, 0.98, 0.9], [0.97, 0.92, 0.88], [1.03, 0.95, 0.86], [0.93, 0.88, 0.82], [1.05, 0.93, 0.88]],
    roof: [[1, 1, 1], [0.92, 0.86, 0.82], [1.04, 0.96, 0.9]],
    damp: 0.25, moss: 0.06, mossTint: [1.0, 0.82, 0.55],
  },
  wear: 0.12,
  // the houses' yards: dry-stone walls of tuff round a court, a gate, the kitchen garden
  yard: { kinds: ['adobe'], fence: 'wallstone', gate: 'gate', shed: null, garden: true },
});
