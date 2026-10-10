// src/world/maps/regional/shell.ts — a building's shell read off its own parts (the facades lane, 2026-10-08).
//
// The house kits describe a house from the plan they built it by (damage.ts describeHouse). A body built without one is
// read here from its parts, numbers only (DESTRUCTION.md §16.6). That covers a regional builder's hall or works that
// lays no house, and the base set's factory, warehouse, fire station or chapel standing on a regional map. The reading
// gives:
// - the four walls, taken on each side as the plane that carries the most wall;
// - how much of each wall is built, the bucket it is built in, and how that bucket's texture lies on it;
// - the plinth, the eave and the roof's slopes;
// - the glass and doors on each wall, and the chimneys above the roof.
// damage.ts turns the reading into the anatomy whose stages the kit dresses in the building's own materials (owner,
// 2026-10-07: destructible buildings "need to look just as good as everything else"). A body the reading cannot close
// into four walls round a floor (a gantry, a stall, a ramada, a ruin's broken walls) gets no reading.
import type { BufferGeometry } from 'three';
import type { FaceName, Vec3 } from '../../destructionKit.ts';

type Rgb = [number, number, number];
type ShellParts = Readonly<Record<string, readonly BufferGeometry[]>>;

/** The buckets a wall is built in (props' base set and the regional kits'). */
const WALL_BUCKETS: ReadonlySet<string> = new Set(['regionalStone', 'stone', 'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3',
  'plaster', 'plaster2', 'plaster3', 'structureMetal', 'steel', 'wood', 'structureWood', 'baked', 'straw']);
/** The buckets a roof is covered in. */
const ROOF_BUCKETS: ReadonlySet<string> = new Set(['roof', 'regionalRoof', 'structureMetal', 'steel', 'straw', 'wood', 'structureWood']);
/** What an opening is glazed or shut with. */
const OPENING_BUCKETS: ReadonlySet<string> = new Set(['glass', 'curtain', 'dark']);
/** The masonry a chimney is built in. */
const CHIMNEY_BUCKETS: ReadonlySet<string> = new Set(['regionalStone', 'stone', 'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3',
  'plaster', 'plaster2', 'plaster3', 'baked']);

/** The sides in the house order (front +z, right +x, back −z, left −x): the axis each looks along and its sign. */
const SIDES: ReadonlyArray<{ name: FaceName; axis: 0 | 2; sign: 1 | -1 }> = [
  { name: 'front', axis: 2, sign: 1 }, { name: 'right', axis: 0, sign: 1 }, { name: 'back', axis: 2, sign: -1 }, { name: 'left', axis: 0, sign: -1 },
];

/** How a bucket's texture lies on a wall: uv = a · coordinate + b, along the face (u from its centre) and up (body y). */
interface ShellUvFit {
  bucket: string;
  au: number;
  bu: number;
  av: number;
  bv: number;
}

interface ShellOpening {
  kind: 'window' | 'door';
  /** Centre along the face (from its centre), width, bottom above the wall's foot, height. */
  u: number;
  w: number;
  y0: number;
  h: number;
}

interface ShellFace {
  name: FaceName;
  /** The face's outer plane: its centre at the wall's foot, its u (along) and out directions. */
  origin: Vec3;
  u: Vec3;
  out: Vec3;
  width: number;
  /** Where the wall on this plane starts and stops (body y): its foot and its top (a gable end runs to the ridge). */
  y0: number;
  y1: number;
  /** The bucket that builds most of this wall, its mean colour there, and how its texture lies on it. */
  bucket: string;
  tint: Rgb;
  uv: ShellUvFit | null;
  /** The wall's built share of its width × height (a wall with its openings cut reads below 1). */
  coverage: number;
  /** The wall's depth: from its outer plane to the inner one its parts show (null where none reads; the kit's own). */
  depth: number | null;
  /** Whether the part carrying most of this wall runs its whole height (one box from foot to eave: a fallen band of it
   *  cannot leave the rest standing, so the face falls whole). */
  whole: boolean;
  openings: ShellOpening[];
}

interface ShellRoof {
  kind: 'gable' | 'hip' | 'shed' | 'flat';
  bucket: string;
  tint: Rgb;
  eaveY: number;
  ridgeY: number;
  pitchDeg: number;
  thicknessM: number;
  /** Each slope as eave a → b, then the ridge above b (c) and above a (d), body frame. */
  slabs: Array<[Vec3, Vec3, Vec3, Vec3]>;
}

interface ShellChimney {
  x: number;
  z: number;
  sx: number;
  sz: number;
  y0: number;
  y1: number;
  bucket: string;
}

interface ShellReading {
  /** The outer planes: x from x0 to x1, z from z0 to z1. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The walls' foot and the eave (the lowest wall top round the body). */
  base: number;
  eave: number;
  faces: ShellFace[];
  plinth: { h: number; out: number; bucket: string; tint: Rgb } | null;
  roof: ShellRoof | null;
  chimneys: ShellChimney[];
}

interface Tri {
  bucket: string;
  part: number;
  a: Vec3;
  b: Vec3;
  c: Vec3;
  ia: number;
  ib: number;
  ic: number;
  n: Vec3;
  area: number;
  geometry: BufferGeometry;
}

/** Every triangle of the parts with its geometric normal and area (indexed or not). */
function trianglesOf(parts: ShellParts): Tri[] {
  const out: Tri[] = [];
  let part = 0;
  for (const [bucket, list] of Object.entries(parts)) {
    for (const geometry of list ?? []) {
      const P = geometry.getAttribute('position');
      if (!P) { part++; continue; }
      const index = geometry.getIndex();
      const count = index ? index.count : P.count;
      const at = (k: number): number => (index ? index.getX(k) : k);
      for (let k = 0; k + 2 < count; k += 3) {
        const ia = at(k), ib = at(k + 1), ic = at(k + 2);
        const a: Vec3 = [P.getX(ia), P.getY(ia), P.getZ(ia)], b: Vec3 = [P.getX(ib), P.getY(ib), P.getZ(ib)], c: Vec3 = [P.getX(ic), P.getY(ic), P.getZ(ic)];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) continue;
        out.push({ bucket, part, a, b, c, ia, ib, ic, n: [nx / len, ny / len, nz / len], area: len / 2, geometry });
      }
      part++;
    }
  }
  return out;
}

const centroid = (t: Tri, axis: number): number => (t.a[axis] + t.b[axis] + t.c[axis]) / 3;

/** The mean vertex colour of some triangles (white where they carry none). */
function meanColour(tris: readonly Tri[]): Rgb {
  let r = 0, g = 0, b = 0, n = 0;
  for (const t of tris) {
    const C = t.geometry.getAttribute('color');
    if (!C) continue;
    for (const i of [t.ia, t.ib, t.ic]) { r += C.getX(i); g += C.getY(i); b += C.getZ(i); n++; }
  }
  return n ? [r / n, g / n, b / n] : [1, 1, 1];
}

/**
 * How a bucket's texture lies on a face: fitted on the one part that carries most of the face in that bucket (a base
 * set's box maps its own uv, a regional wall maps world uv plus its house's offset), u and v each linear in the face's
 * along and up coordinates. Null where the part's uv is not such a map.
 */
function fitUv(tris: readonly Tri[], bucket: string, origin: Vec3, u: Vec3): ShellUvFit | null {
  const byPart = new Map<number, Tri[]>();
  for (const t of tris) if (t.bucket === bucket) { const l = byPart.get(t.part) ?? []; l.push(t); byPart.set(t.part, l); }
  let best: Tri[] | null = null, bestArea = 0;
  for (const list of byPart.values()) {
    const area = list.reduce((s, t) => s + t.area, 0);
    if (area > bestArea) { bestArea = area; best = list; }
  }
  if (!best) return null;
  const UV = best[0].geometry.getAttribute('uv');
  if (!UV) return null;
  const xs: number[] = [], ys: number[] = [], us: number[] = [], vs: number[] = [];
  for (const t of best) {
    for (const [p, i] of [[t.a, t.ia], [t.b, t.ib], [t.c, t.ic]] as const) {
      xs.push((p[0] - origin[0]) * u[0] + (p[2] - origin[2]) * u[2]);
      ys.push(p[1]);
      us.push(UV.getX(i));
      vs.push(UV.getY(i));
    }
  }
  const line = (x: number[], y: number[]): [number, number, number] | null => {
    const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
    if (sxx < 1e-6) return null;
    const a = sxy / sxx, b = my - a * mx;
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(a * x[i] + b - y[i]));
    return [a, b, worst];
  };
  const fu = line(xs, us), fv = line(ys, vs);
  if (!fu || !fv || fu[2] > 0.02 || fv[2] > 0.02 || Math.abs(fu[0]) < 1e-3 || Math.abs(fv[0]) < 1e-3) return null;
  return { bucket, au: fu[0], bu: fu[1], av: fv[0], bv: fv[1] };
}

/** The height the face's main part spans: the one geometry carrying most of the face in its bucket. */
function tallestPart(tris: readonly Tri[], bucket: string): number {
  const byPart = new Map<number, { area: number; lo: number; hi: number }>();
  for (const t of tris) {
    if (t.bucket !== bucket) continue;
    const e = byPart.get(t.part) ?? { area: 0, lo: Infinity, hi: -Infinity };
    e.area += t.area;
    e.lo = Math.min(e.lo, t.a[1], t.b[1], t.c[1]); e.hi = Math.max(e.hi, t.a[1], t.b[1], t.c[1]);
    byPart.set(t.part, e);
  }
  let best: { area: number; lo: number; hi: number } | null = null;
  for (const e of byPart.values()) if (!best || e.area > best.area) best = e;
  return best ? best.hi - best.lo : 0;
}

/**
 * How deep a wall is: the wall-bucket plane facing into the building behind its outer plane (3 cm to a metre in) that
 * carries the most area — the wall box's own back (a sheet hall's cladding on its girts, a masonry wall's inner face);
 * null where no inner face reads (a wall built as one face).
 */
function innerDepth(tris: readonly Tri[], side: { axis: 0 | 2; sign: 1 | -1 }, plane: number): number | null {
  const bins = new Map<number, number>();
  for (const t of tris) {
    if (!WALL_BUCKETS.has(t.bucket) || t.n[side.axis] * side.sign > -0.92) continue;
    const back = (plane - centroid(t, side.axis)) * side.sign;
    if (back < 0.03 || back > 1) continue;
    const key = Math.round(back / 0.02);
    bins.set(key, (bins.get(key) ?? 0) + t.area);
  }
  let best = 0, area = 0;
  for (const [key, a] of [...bins].sort((p, q) => p[0] - q[0])) if (a > area) { area = a; best = key; }
  return area > 0 ? best * 0.02 : null;
}

/**
 * The shell of a building from its parts, or null when its walls do not close round it. Deterministic: the parts are
 * read in their own order, and every choice is by area with ties to the outer plane.
 */
export function readShell(parts: ShellParts): ShellReading | null {
  const tris = trianglesOf(parts);
  if (!tris.length) return null;
  // 1. each side's wall plane: the offset (4 cm bins) carrying the most wall area, the outer one on a tie
  const planes = SIDES.map((side) => {
    const bins = new Map<number, number>();
    for (const t of tris) {
      if (!WALL_BUCKETS.has(t.bucket) || t.n[side.axis] * side.sign < 0.92) continue;
      const key = Math.round(centroid(t, side.axis) * side.sign / 0.04);
      bins.set(key, (bins.get(key) ?? 0) + t.area);
    }
    let bestKey = 0, bestArea = 0;
    for (const [key, area] of [...bins].sort((p, q) => p[0] - q[0])) if (area >= bestArea) { bestArea = area; bestKey = key; }
    return bestArea > 0 ? bestKey * 0.04 * side.sign : null;
  });
  if (planes.some((p) => p === null)) return null;
  const z1 = planes[0]!, x1 = planes[1]!, z0 = planes[2]!, x0 = planes[3]!;
  const W = x1 - x0, D = z1 - z0;
  if (W < 2.5 || D < 2.5) return null;
  // the box must be the building, not a room of it: it covers most of what the walls stand on (a courtyard building's
  // corner room, a tower on a hall, read as the shell, would put the whole building's damage in a corner)
  {
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (const t of tris) {
      if (!WALL_BUCKETS.has(t.bucket)) continue;
      for (const p of [t.a, t.b, t.c]) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]); }
    }
    if (W * D < 0.6 * (mxx - mnx) * (mxz - mnz)) return null;
  }
  // 2. each wall: the plane's own triangles (within 8 cm), its spans along and up, its main bucket and how much is built
  const faces: ShellFace[] = [];
  for (let f = 0; f < 4; f++) {
    const side = SIDES[f], plane = planes[f]!;
    const onPlane = tris.filter((t) => WALL_BUCKETS.has(t.bucket) && t.n[side.axis] * side.sign >= 0.92
      && Math.abs(centroid(t, side.axis) - plane) <= 0.08);
    const across = side.axis === 0 ? 2 : 0;
    let lo = Infinity, hi = -Infinity, y0 = Infinity, y1 = -Infinity, area = 0;
    const byBucket = new Map<string, number>();
    for (const t of onPlane) {
      for (const p of [t.a, t.b, t.c]) { lo = Math.min(lo, p[across]); hi = Math.max(hi, p[across]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      area += t.area;
      byBucket.set(t.bucket, (byBucket.get(t.bucket) ?? 0) + t.area);
    }
    const span = across === 0 ? W : D;
    // the wall must run most of the body's side (a porch or an annex on its own plane is not the body's wall)
    if (!(hi - lo >= 0.6 * span) || !(y1 - y0 > 1.5)) return null;
    let bucket = '', most = 0;
    for (const [b, a] of byBucket) if (a > most) { most = a; bucket = b; }
    const u: Vec3 = side.axis === 2 ? [side.sign, 0, 0] : [0, 0, -side.sign];
    const out: Vec3 = side.axis === 2 ? [0, 0, side.sign] : [side.sign, 0, 0];
    const origin: Vec3 = side.axis === 2 ? [(x0 + x1) / 2, y0, plane] : [plane, y0, (z0 + z1) / 2];
    const width = across === 0 ? W : D;
    faces.push({
      name: side.name, origin, u, out, width, y0, y1, bucket,
      tint: meanColour(onPlane.filter((t) => t.bucket === bucket)),
      uv: fitUv(onPlane, bucket, origin, u),
      coverage: area / Math.max(1e-6, width * (y1 - y0)), openings: [],
      depth: innerDepth(tris, side, plane),
      whole: tallestPart(onPlane, bucket) >= 0.85 * (y1 - y0),
    });
  }
  // a shell is walled: every side mostly built (a gable end counts its triangle; openings cut lower it a little)
  if (faces.some((f) => f.coverage < 0.4)) return null;
  const base = Math.max(...faces.map((f) => f.y0));
  const eave = Math.min(...faces.map((f) => f.y1));
  if (!(eave - base > 1.8)) return null;
  for (const f of faces) {
    // a gable end's wall runs to the ridge: its top is the eave for the storeys (its triangle belongs to the roof's ends)
    (f as { y0: number }).y0 = base;
  }
  // 3. the plinth: a proud band at the foot on most sides (5–60 cm out, under 1.6 m tall), in one bucket
  let plinth: ShellReading['plinth'] = null;
  {
    const bands: Array<{ out: number; h: number; bucket: string; tris: Tri[] }> = [];
    for (let f = 0; f < 4; f++) {
      const side = SIDES[f], plane = planes[f]!;
      const proud = tris.filter((t) => WALL_BUCKETS.has(t.bucket) && t.n[side.axis] * side.sign >= 0.92
        && (centroid(t, side.axis) - plane) * side.sign > 0.05 && (centroid(t, side.axis) - plane) * side.sign < 0.6
        && Math.max(t.a[1], t.b[1], t.c[1]) < base + 1.6);
      if (!proud.length) continue;
      const top = Math.max(...proud.flatMap((t) => [t.a[1], t.b[1], t.c[1]]));
      const outBy = Math.max(...proud.map((t) => (centroid(t, side.axis) - plane) * side.sign));
      bands.push({ out: outBy, h: top - base, bucket: proud[0].bucket, tris: proud });
    }
    if (bands.length >= 3) {
      const h = Math.min(...bands.map((b) => b.h)), out = Math.min(...bands.map((b) => b.out));
      if (h > 0.15) plinth = { h, out, bucket: bands[0].bucket, tint: meanColour(bands[0].tris) };
    }
  }
  // 4. the openings: glass, curtain and dark parts standing on a wall (within 30 cm of its plane), each by its box
  {
    const byPart = new Map<number, Tri[]>();
    for (const t of tris) if (OPENING_BUCKETS.has(t.bucket)) { const l = byPart.get(t.part) ?? []; l.push(t); byPart.set(t.part, l); }
    for (const list of byPart.values()) {
      let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const t of list) for (const p of [t.a, t.b, t.c]) {
        mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]);
      }
      const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2, h = mxy - mny;
      if (h < 0.3 || mny > eave || mxy < base + 0.1) continue;
      let face: ShellFace | null = null, gap = Infinity;
      for (const f of faces) {
        const g = Math.abs((cx - f.origin[0]) * f.out[0] + (cz - f.origin[2]) * f.out[2]);
        if (g < gap) { gap = g; face = f; }
      }
      if (!face || gap > 0.3) continue;
      const along = Math.abs(face.u[0]) > 0.5 ? mxx - mnx : mxz - mnz;
      if (along < 0.3 || along > face.width * 0.9) continue;
      const u = (cx - face.origin[0]) * face.u[0] + (cz - face.origin[2]) * face.u[2];
      const y0 = Math.max(0, mny - base);
      face.openings.push({ kind: y0 < 0.35 && h > 1.6 ? 'door' : 'window', u, w: along, y0, h: Math.min(h, eave - mny) });
    }
    for (const f of faces) f.openings.sort((p, q) => p.u - q.u || p.y0 - q.y0);
  }
  // 5. the roof: covering triangles facing up over the eave, by the way their slope falls
  let roof: ShellRoof | null = null;
  {
    // (a flat deck may be the walls' own render or concrete: a broad level face over the eave in a wall bucket counts
    // too, not a chimney's or a parapet's cap)
    const up = tris.filter((t) => (ROOF_BUCKETS.has(t.bucket) || (WALL_BUCKETS.has(t.bucket) && t.n[1] > 0.97 && t.area >= 1))
      && t.n[1] > 0.2 && centroid(t, 1) > eave - 0.4 && Math.min(t.a[1], t.b[1], t.c[1]) > eave - 1.2
      && centroid(t, 0) > x0 - 2 && centroid(t, 0) < x1 + 2 && centroid(t, 2) > z0 - 2 && centroid(t, 2) < z1 + 2);
    if (up.length) {
      const flatArea = up.filter((t) => t.n[1] > 0.97).reduce((s, t) => s + t.area, 0);
      const slopes = SIDES.map((side) => up.filter((t) => t.n[1] <= 0.97 && Math.abs(t.n[side.axis]) >= Math.abs(t.n[side.axis === 0 ? 2 : 0])
        && t.n[side.axis] * side.sign > 0));
      const slopeArea = slopes.map((l) => l.reduce((s, t) => s + t.area, 0));
      const total = flatArea + slopeArea.reduce((s, a) => s + a, 0);
      let bucket = '', most = 0;
      const byBucket = new Map<string, number>();
      for (const t of up) byBucket.set(t.bucket, (byBucket.get(t.bucket) ?? 0) + t.area);
      for (const [b, a] of byBucket) if (a > most) { most = a; bucket = b; }
      const covering = up.filter((t) => t.bucket === bucket);
      const tint = meanColour(covering);
      const topY = Math.max(...up.flatMap((t) => [t.a[1], t.b[1], t.c[1]]));
      if (flatArea >= 0.6 * total) {
        const y = Math.max(eave, ...up.filter((t) => t.n[1] > 0.97).map((t) => centroid(t, 1)));
        roof = { kind: 'flat', bucket, tint, eaveY: eave, ridgeY: y, pitchDeg: 0, thicknessM: 0.25,
          slabs: [[[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]]] };
      } else {
        const sides = [0, 1, 2, 3].filter((f) => slopeArea[f] >= 0.12 * total);
        const slabOf = (f: number): { corners: [Vec3, Vec3, Vec3, Vec3]; pitch: number; run: number } => {
          const side = SIDES[f], list = slopes[f], h = side.axis, a = h === 0 ? 2 : 0;
          // the slope's outer (eave) and inner (ridge) offsets and heights; the eave's run along, and the ridge's (a hip
          // end's ridge is its apex: one point)
          let eaveAt = -Infinity, ridgeAt = Infinity, yLo = Infinity, yHi = -Infinity;
          for (const t of list) for (const p of [t.a, t.b, t.c]) {
            const o = p[h] * side.sign;
            eaveAt = Math.max(eaveAt, o); ridgeAt = Math.min(ridgeAt, o); yLo = Math.min(yLo, p[1]); yHi = Math.max(yHi, p[1]);
          }
          let e0 = Infinity, e1 = -Infinity, r0 = Infinity, r1 = -Infinity;
          for (const t of list) for (const p of [t.a, t.b, t.c]) {
            if (p[1] <= yLo + 0.05) { e0 = Math.min(e0, p[a]); e1 = Math.max(e1, p[a]); }
            if (p[1] >= yHi - 0.05) { r0 = Math.min(r0, p[a]); r1 = Math.max(r1, p[a]); }
          }
          const point = (o: number, y: number, along: number): Vec3 => (h === 0 ? [o * side.sign, y, along] : [along, y, o * side.sign]);
          return {
            corners: [point(eaveAt, yLo, e0), point(eaveAt, yLo, e1), point(ridgeAt, yHi, r1), point(ridgeAt, yHi, r0)],
            pitch: Math.atan2(yHi - yLo, Math.max(0.1, eaveAt - ridgeAt)) * 180 / Math.PI, run: e1 - e0,
          };
        };
        if (sides.length) {
          // the pitches first: the opposite pair carrying the most roof; a hip's ends after them (as house.ts lays them)
          const pairX = slopeArea[1] + slopeArea[3], pairZ = slopeArea[0] + slopeArea[2];
          const pitches = (pairX >= pairZ ? [1, 3] : [0, 2]).filter((f) => sides.includes(f));
          const ends = sides.filter((f) => !pitches.includes(f));
          const kind: ShellRoof['kind'] = pitches.length === 1 && !ends.length ? 'shed' : ends.length >= 2 ? 'hip' : 'gable';
          const list = [...pitches, ...(kind === 'hip' ? ends : [])].map(slabOf);
          roof = { kind, bucket, tint, eaveY: eave, ridgeY: topY, pitchDeg: Math.max(...list.map((x) => x.pitch)), thicknessM: 0.14,
            slabs: list.map((x) => x.corners) };
        }
      }
    }
  }
  // 6. chimneys: masonry parts rising a metre and more over the eave, narrow (under 3 m² in plan)
  const chimneys: ShellChimney[] = [];
  {
    const byPart = new Map<number, Tri[]>();
    for (const t of tris) if (CHIMNEY_BUCKETS.has(t.bucket)) { const l = byPart.get(t.part) ?? []; l.push(t); byPart.set(t.part, l); }
    for (const list of byPart.values()) {
      let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (const t of list) for (const p of [t.a, t.b, t.c]) {
        mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]);
      }
      // a stack has depth both ways (a gable's triangle, flat on its wall, is no chimney)
      if (mxy < eave + 1 || mxx - mnx < 0.3 || mxz - mnz < 0.3 || (mxx - mnx) * (mxz - mnz) > 3 || mxy - mny < 1.5) continue;
      chimneys.push({ x: (mnx + mxx) / 2, z: (mnz + mxz) / 2, sx: mxx - mnx, sz: mxz - mnz, y0: Math.max(mny, base), y1: mxy, bucket: list[0].bucket });
    }
  }
  return { x0, x1, z0, z1, base, eave, faces, plinth, roof, chimneys };
}

// ---------------------------------------------------------------------------------------------------- a shaft

/** One band of a shaft: its height and its cross-section there (the walls' box), the bucket and colour it is built in,
 *  and how that bucket's texture lies on each side (front, right, back, left; null where no fit reads). */
interface ShaftBand {
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  bucket: string;
  tint: Rgb;
  uv: Array<ShellUvFit | null>;
}

/** A tall narrow body (a stack, a water tower, a minaret, a tower) read off its parts: the sim's bands up its walls, each
 *  with the section the walls stand on there, and the crown above them (a water tower's tank, a lantern, a cap). */
interface ShaftReading {
  base: number;
  top: number;
  bands: ShaftBand[];
  crown: { y0: number; y1: number; x0: number; x1: number; z0: number; z1: number; bucket: string; tint: Rgb } | null;
}

/**
 * A shaft from its parts, or null when the body is not one (its walls not at least twice as tall as they are wide). The
 * walls are cut into the sim's 3.2 m bands (at most six); each band's section is the box of the vertical wall faces that
 * cross its middle, so a tapering stack's bands narrow as it does.
 */
export function readShaft(parts: ShellParts): ShaftReading | null {
  const tris = trianglesOf(parts);
  const walls = tris.filter((t) => WALL_BUCKETS.has(t.bucket) && Math.abs(t.n[1]) < 0.35);
  if (!walls.length) return null;
  let base = Infinity, wallTop = -Infinity, mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
  for (const t of walls) for (const p of [t.a, t.b, t.c]) {
    base = Math.min(base, p[1]); wallTop = Math.max(wallTop, p[1]);
    mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]);
  }
  const H = wallTop - base;
  // (a shaft is narrow as well as tall: a parking deck or a tower block two and a half times as tall as it is wide still
  // comes down as a building)
  if (!(H > 2 * Math.max(mxx - mnx, mxz - mnz)) || H < 5 || Math.max(mxx - mnx, mxz - mnz) > 8) return null;
  // the crown: parts standing wholly over the walls' upper fifth that are wider than the shaft there (a tank, a lantern)
  let crown: ShaftReading['crown'] = null;
  {
    const byPart = new Map<number, Tri[]>();
    for (const t of tris) { const l = byPart.get(t.part) ?? []; l.push(t); byPart.set(t.part, l); }
    for (const list of byPart.values()) {
      let lo = Infinity, hi = -Infinity, a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const t of list) for (const p of [t.a, t.b, t.c]) {
        lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); a0 = Math.min(a0, p[0]); a1 = Math.max(a1, p[0]); b0 = Math.min(b0, p[2]); b1 = Math.max(b1, p[2]);
      }
      if (lo < base + H * 0.6 || hi - lo < 1) continue;
      const area = list.reduce((s, t) => s + t.area, 0);
      if (!crown || area > (crown.x1 - crown.x0) * (crown.z1 - crown.z0)) {
        crown = { y0: lo, y1: hi, x0: a0, x1: a1, z0: b0, z1: b1, bucket: list[0].bucket, tint: meanColour(list) };
      }
    }
  }
  const shaftTop = crown && crown.y0 > base + 2 ? Math.min(wallTop, crown.y0) : wallTop;
  const count = Math.max(1, Math.min(6, Math.round((shaftTop - base) / 3.2)));
  const step = (shaftTop - base) / count;
  const bands: ShaftBand[] = [];
  for (let k = 0; k < count; k++) {
    const y0 = base + k * step, y1 = y0 + step, ym = (y0 + y1) / 2;
    const cross = walls.filter((t) => Math.min(t.a[1], t.b[1], t.c[1]) <= ym + 0.25 && Math.max(t.a[1], t.b[1], t.c[1]) >= ym - 0.25);
    if (!cross.length) { if (bands.length) bands.push({ ...bands[bands.length - 1], y0, y1 }); continue; }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const byBucket = new Map<string, number>();
    for (const t of cross) {
      byBucket.set(t.bucket, (byBucket.get(t.bucket) ?? 0) + t.area);
      // the section at the band's middle: each triangle's edges cut there (a tapering face's own width at that height)
      for (const [p, q] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const) {
        if ((p[1] - ym) * (q[1] - ym) > 0 || p[1] === q[1]) continue;
        const s = (ym - p[1]) / (q[1] - p[1]), x = p[0] + (q[0] - p[0]) * s, z = p[2] + (q[2] - p[2]) * s;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
    }
    if (!(x1 - x0 > 0.3 && z1 - z0 > 0.3)) { if (bands.length) bands.push({ ...bands[bands.length - 1], y0, y1 }); continue; }
    let bucket = '', most = 0;
    for (const [b, a] of byBucket) if (a > most) { most = a; bucket = b; }
    const uv = SIDES.map((side) => {
      const facing = cross.filter((t) => t.bucket === bucket && t.n[side.axis] * side.sign >= 0.7);
      const origin: Vec3 = side.axis === 2 ? [(x0 + x1) / 2, y0, side.sign > 0 ? z1 : z0] : [side.sign > 0 ? x1 : x0, y0, (z0 + z1) / 2];
      const u: Vec3 = side.axis === 2 ? [side.sign, 0, 0] : [0, 0, -side.sign];
      return facing.length ? fitUv(facing, bucket, origin, u) : null;
    });
    bands.push({ y0, y1, x0, x1, z0, z1, bucket, tint: meanColour(cross.filter((t) => t.bucket === bucket)), uv });
  }
  if (!bands.length) return null;
  return { base, top: Math.max(wallTop, crown?.y1 ?? wallTop), bands, crown };
}

// ---------------------------------------------------------------------------------------------------- a cluster

/** A cell of a compound read off its parts: the box of one closed body among the merged walls, and its bucket. */
interface CellReading {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  bucket: string;
  tint: Rgb;
  /** the level of its roof slab's top (a parapet stands above it): the highest level its up-facing faces cover a third of
   *  its footprint at; its box's top when none does */
  deck: number;
}

/**
 * The cells of a compound (a Siwan or Wadi Rum compound, a caravanserai, a souk), read off its merged parts: the wall
 * buckets' solid triangles joined where they share a corner (welded at a centimetre) into closed bodies, each a cell (at
 * least 1.5 m every way, its surface most of its box's: a cubic room, not a parapet or a stair). Null below three cells
 * (a body of one or two closed boxes is a house or a shell).
 */
export function readCells(parts: ShellParts): CellReading[] | null {
  const tris = trianglesOf(parts).filter((t) => WALL_BUCKETS.has(t.bucket) && !t.geometry.userData?.noCollision);
  if (tris.length < 24) return null;
  const parent = tris.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const byKey = new Map<string, number>();
  tris.forEach((t, i) => {
    for (const v of [t.a, t.b, t.c]) {
      const key = `${Math.round(v[0] * 100)},${Math.round(v[1] * 100)},${Math.round(v[2] * 100)}`;
      const j = byKey.get(key);
      if (j === undefined) byKey.set(key, i); else { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
    }
  });
  const comps = new Map<number, { tris: Tri[]; area: number; lo: [number, number, number]; hi: [number, number, number] }>();
  tris.forEach((t, i) => {
    const r = find(i);
    const c = comps.get(r) ?? { tris: [], area: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    c.tris.push(t); c.area += t.area;
    for (const v of [t.a, t.b, t.c]) for (let k = 0; k < 3; k++) { c.lo[k] = Math.min(c.lo[k], v[k]); c.hi[k] = Math.max(c.hi[k], v[k]); }
    comps.set(r, c);
  });
  const cells: CellReading[] = [];
  for (const [, c] of [...comps].sort((p, q) => p[0] - q[0])) {
    const sx = c.hi[0] - c.lo[0], sy = c.hi[1] - c.lo[1], sz = c.hi[2] - c.lo[2];
    if (sx < 1.5 || sy < 1.5 || sz < 1.5) continue;
    if (c.area < 0.6 * 2 * (sx * sy + sy * sz + sz * sx)) continue;
    const byBucket = new Map<string, number>();
    for (const t of c.tris) byBucket.set(t.bucket, (byBucket.get(t.bucket) ?? 0) + t.area);
    let bucket = '', most = 0;
    for (const [b, a] of byBucket) if (a > most) { most = a; bucket = b; }
    // the deck: up-facing area by level (5 cm), the highest level that covers a third of the footprint
    const levels = new Map<number, number>();
    for (const t of c.tris) if (t.n[1] > 0.9) { const y = Math.round((t.a[1] + t.b[1] + t.c[1]) / 3 * 20); levels.set(y, (levels.get(y) ?? 0) + t.area); }
    let deck = c.hi[1];
    const decks = [...levels].filter(([, a]) => a >= sx * sz / 3).map(([y]) => y / 20);
    if (decks.length) deck = Math.max(...decks);
    cells.push({ x0: c.lo[0], x1: c.hi[0], y0: c.lo[1], y1: c.hi[1], z0: c.lo[2], z1: c.hi[2], bucket, deck,
      tint: meanColour(c.tris.filter((t) => t.bucket === bucket)) });
  }
  return cells.length >= 3 ? cells : null;
}

// ---------------------------------------------------------------------------------------------------- a ruin

/** A wall piece of a ruin read off its parts: its base's middle, its axes, its half length and thickness, its top. */
interface WallPieceReading {
  c: Vec3;
  along: Vec3;
  out: Vec3;
  hl: number;
  ht: number;
  /** the top's height over the base at evenly spaced points along the piece (its ragged line) */
  top: number[];
  bucket: string;
  tint: Rgb;
}

/**
 * The wall pieces of a ruin (what is left of a house: its walls standing to ragged tops), read off its merged parts: the
 * wall buckets' solid triangles joined where they share a corner (welded at a centimetre) into closed bodies; a body
 * whose faces mostly face one horizontal way (the area-weighted normals' main axis) is a wall piece when it is 0.15-1.2 m
 * thick, at least 0.8 m long and half again as long as it is thick, and 0.6 m tall. Its top is sampled every 0.75 m or so
 * along it. Null below two pieces (a lone wall is a shell's, a heap of blocks the default's).
 */
export function readWallPieces(parts: ShellParts): WallPieceReading[] | null {
  const tris = trianglesOf(parts).filter((t) => WALL_BUCKETS.has(t.bucket) && t.bucket !== 'wood' && t.bucket !== 'structureWood'
    && !t.geometry.userData?.noCollision);
  if (tris.length < 12) return null;
  const parent = tris.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const byKey = new Map<string, number>();
  tris.forEach((t, i) => {
    for (const v of [t.a, t.b, t.c]) {
      const key = `${Math.round(v[0] * 100)},${Math.round(v[1] * 100)},${Math.round(v[2] * 100)}`;
      const j = byKey.get(key);
      if (j === undefined) byKey.set(key, i); else { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
    }
  });
  const comps = new Map<number, Tri[]>();
  tris.forEach((t, i) => { const r = find(i); const list = comps.get(r) ?? []; list.push(t); comps.set(r, list); });
  const pieces: WallPieceReading[] = [];
  // (the pieces must be most of the masonry's standing faces: a ruin whose walls read otherwise stays the default's)
  const upright = (list: readonly Tri[]) => list.reduce((a, t) => a + (Math.abs(t.n[1]) < 0.3 ? t.area : 0), 0);
  let pieceArea = 0;
  for (const [, list] of [...comps].sort((p, q) => p[0] - q[0])) {
    // the face normal's main horizontal axis (a 2 x 2 tensor of the vertical faces' normals, by area)
    let xx = 0, xz = 0, zz = 0;
    for (const t of list) if (Math.abs(t.n[1]) < 0.3) { xx += t.area * t.n[0] * t.n[0]; xz += t.area * t.n[0] * t.n[2]; zz += t.area * t.n[2] * t.n[2]; }
    if (xx + zz < 1e-6) continue;
    const ang = 0.5 * Math.atan2(2 * xz, xx - zz);
    const out: Vec3 = [Math.cos(ang), 0, Math.sin(ang)], along: Vec3 = [-out[2], 0, out[0]];
    let a0 = Infinity, a1 = -Infinity, o0 = Infinity, o1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of list) for (const v of [t.a, t.b, t.c]) {
      const pa = v[0] * along[0] + v[2] * along[2], po = v[0] * out[0] + v[2] * out[2];
      a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); o0 = Math.min(o0, po); o1 = Math.max(o1, po); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]);
    }
    const len = a1 - a0, thick = o1 - o0, h = y1 - y0;
    if (thick < 0.15 || thick > 1.2 || len < 0.8 || len < 1.5 * thick || h < 0.6) continue;
    const n = Math.max(2, Math.min(12, Math.round(len / 0.75)));
    const top = new Array<number>(n).fill(0);
    for (const t of list) for (const v of [t.a, t.b, t.c]) {
      const pa = v[0] * along[0] + v[2] * along[2];
      const k = Math.max(0, Math.min(n - 1, Math.floor(((pa - a0) / len) * n)));
      top[k] = Math.max(top[k], v[1] - y0);
    }
    const byBucket = new Map<string, number>();
    for (const t of list) byBucket.set(t.bucket, (byBucket.get(t.bucket) ?? 0) + t.area);
    let bucket = '', most = 0;
    for (const [b, a] of byBucket) if (a > most) { most = a; bucket = b; }
    const ca = (a0 + a1) / 2, co = (o0 + o1) / 2;
    pieceArea += upright(list);
    pieces.push({ c: [along[0] * ca + out[0] * co, y0, along[2] * ca + out[2] * co], along, out, hl: len / 2, ht: thick / 2,
      top: top.map((y) => Math.max(0.3, y)), bucket, tint: meanColour(list.filter((t) => t.bucket === bucket)) });
  }
  return pieces.length >= 2 && pieceArea >= 0.5 * upright(tris) ? pieces : null;
}
