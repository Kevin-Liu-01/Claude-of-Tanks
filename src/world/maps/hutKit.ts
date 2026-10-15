// src/world/maps/hutKit.ts — the light huts' regional crafts (props #1, the huts' r2 round, 2026-10-14; the looks lane).
//
// WORKLIST #1's standard: one form per map region through REGIONAL_DESTRUCTIBLE_TYPES[kit][kind], each built member by
// member and never an overlay on a box shell — footings under every post or a plinth under the sill, the posts, sills and
// plates, the cladding as boards and battens, lapped boards, logs, mats or sheet runs a piece at a time, openings cut
// through it with their casings, sills and set-back sashes or ledged doors, rafters under the region's covering with its
// eaves and verges, the snow lying on a winter kit's roof.
//
// A kit's dialect (HUT_DIALECTS: its cladding, covering, footing, poles and paints) dresses a kind's form (HUT_FORMS: its
// plan, height, openings and the kind's own gear: the sauna's stove pipe and woodpile, the blind's ladder, the fisher's
// net rack). A kit may change a form's numbers (REGIONAL_HUTS) and add its own gear.
//
// Built through the tools structureKit hands it (HutTools: its members, its paint, the stream), so this file imports
// nothing of structureKit's: the token file keeps the table's rows only. Every build stands inside its family's footprint
// and height (the destructible's collision is the family's).

import * as THREE from 'three';
import type { FractureMaterial } from '../destructionKit.ts';
import type { FractureRole } from '../fractureAnatomy.ts';

type Rng = () => number;
type V3 = readonly [number, number, number];

/** structureKit's members and paint, bound to one build's parts and stream. */
export interface HutTools {
  /** a member w x h x d with its long arrises chamfered (structureKit mbox: a box under 35 cm, a pentagon for a board) */
  mbox(w: number, h: number, d: number, chamfer?: number): THREE.BufferGeometry;
  /** the same with a symmetric section and its end caps fanned from the middle (a pitched sheet: its receipt) */
  msym(w: number, h: number, d: number, chamfer?: number): THREE.BufferGeometry;
  mbeam(a: V3, b: V3, w: number, d: number): THREE.BufferGeometry;
  box(w: number, h: number, d: number): THREE.BufferGeometry;
  cylinder(rt: number, rb: number, h: number, segments?: number): THREE.BufferGeometry;
  /** pitchRoofPlane: tip a flat sheet (its span along x or z) to fall `outward`, and leave its receipt */
  pitch<T extends THREE.BufferGeometry>(geo: T, axis: 'x' | 'z', outward: -1 | 1, angle: number, kind: 'gable' | 'skillion'): T;
  /** markWorldAperture: a pane that glows at night when the kind is manned */
  aperture<T extends THREE.BufferGeometry>(geo: T, normal: V3): T;
  /** paint and keep a part, named by the last tag */
  put<T extends THREE.BufferGeometry>(geo: T, color: number, jitter?: number): T;
  /** name the parts put from here on: their piece of the wreck (a group is one piece), its role and its material */
  tag(role: FractureRole, group: string | null, material: FractureMaterial): void;
  rng: Rng;
}

type Cladding = 'batten' | 'lap' | 'log' | 'mat' | 'sheet' | 'render' | 'panel';
type Covering = 'felt' | 'sheet' | 'thatch' | 'tile' | 'shingle' | 'slab';
type Footing = 'pads' | 'plinth' | 'sunk' | 'staddle';

interface HutPaint {
  /** the cladding's three tones (a board, a sheet, a log a course takes one) */
  wall: readonly [number, number, number];
  /** casings, corner boards, barge boards and fascia */
  trim: number;
  /** posts, plates, rafters and rails */
  frame: number;
  roof: readonly [number, number, number];
  foot: number;
  door: number;
  glass: number;
  /** the dark of a room seen through an opening */
  dark: number;
  /** a render's dado, a plinth's band */
  dado?: number;
}

interface HutDialect {
  cladding: Cladding;
  covering: Covering;
  footing: Footing;
  /** round poles for the posts (bamboo, larch, pine) */
  round?: boolean;
  /** the snow lying on the roof, metres */
  snow?: number;
  /** the windows shuttered (two leaves open against the wall) rather than glazed */
  shutters?: boolean;
  /** eaves and verges, metres past the walls */
  eave: number;
  verge: number;
  /** a lapped board's or a log's course, metres */
  course: number;
  /** a render's dado to this height over the floor */
  dado?: number;
  /** what the walls, the covering and the footings are of, for the break (default by the cladding and covering) */
  wallMaterial?: FractureMaterial;
  roofMaterial?: FractureMaterial;
  footMaterial?: FractureMaterial;
  paint: HutPaint;
}

type FaceId = 'front' | 'back' | 'left' | 'right';

interface HutOpening {
  face: FaceId;
  /** its middle along the face, seen from outside left to right, metres from the face's middle */
  u: number;
  /** its sill (a door's threshold) over the floor */
  y: number;
  w: number;
  h: number;
  kind: 'door' | 'window' | 'slit' | 'garage' | 'louvre';
}

interface HutForm {
  /** the light family it builds (the merge's id) */
  id: string;
  w: number;
  d: number;
  /** the floor to the plates' top */
  wallH: number;
  /** the floor over the ground: 0 on the ground, a deck on stilts above it */
  lift: number;
  roof: 'gable' | 'skillion';
  /** a gable's ridge over the plates; a skillion's high side over its low (high at the back) */
  rise: number;
  openings: readonly HutOpening[];
  /** faces left open (a lean-to's front) */
  open?: readonly FaceId[];
  /** a stove pipe through the roof at (x, z) */
  stove?: readonly [number, number];
  /** the deck carried this far past the front on the stilts (a veranda), with its rail */
  veranda?: number;
  /** a plinth's height when the dialect builds on one (default 0.35) */
  plinth?: number;
  /** the battens' spacing (a long hall's wider, its triangles within the kind's budget) */
  battens?: number;
  /** the eaves and verges past the walls when the kind's differ from its dialect's */
  eave?: number;
  verge?: number;
  /** a masonry skillion's walls carried this far over its high edge all round, the roof inside them on its fall */
  parapet?: number;
}

/** What a build knows of itself once its frame stands: the kind's gear is placed from it. */
interface HutFrame {
  form: HutForm;
  dialect: HutDialect;
  /** the floor's height over the ground */
  floor: number;
  /** the plates' top */
  top: number;
  /** the roof's covering top at (x, z) over the walls (the snow's underside) */
  roofAt(x: number): number;
  face(id: FaceId): Face;
}

interface Face {
  id: FaceId;
  /** outward normal */
  n: V3;
  /** along the face, left to right seen from outside */
  u: V3;
  /** half the face's length */
  half: number;
  /** the face's plane from the middle */
  off: number;
}

function faceOf(id: FaceId, w: number, d: number): Face {
  switch (id) {
    case 'front': return { id, n: [0, 0, 1], u: [1, 0, 0], half: w / 2, off: d / 2 };
    case 'back': return { id, n: [0, 0, -1], u: [-1, 0, 0], half: w / 2, off: d / 2 };
    case 'right': return { id, n: [1, 0, 0], u: [0, 0, -1], half: d / 2, off: w / 2 };
    default: return { id, n: [-1, 0, 0], u: [0, 0, 1], half: d / 2, off: w / 2 };
  }
}

/** A point on a face: `u` along it, `y` up, `o` out of its plane. */
function at(f: Face, u: number, y: number, o: number): [number, number, number] {
  return [f.n[0] * (f.off + o) + f.u[0] * u, y, f.n[2] * (f.off + o) + f.u[2] * u];
}

/** Turn a part built with x out of the face, y up and z along it onto the face. */
function onto<T extends THREE.BufferGeometry>(geo: T, f: Face): T {
  geo.rotateY(Math.atan2(f.n[0], f.n[2]) - Math.PI / 2);
  return geo;
}

/** A member laid on a face: `lu` along it, `h` up, `t` through it. */
function faceMember(k: HutTools, f: Face, lu: number, h: number, t: number, chamfer?: number): THREE.BufferGeometry {
  return f.u[0] !== 0 ? k.mbox(lu, h, t, chamfer) : k.mbox(t, h, lu, chamfer);
}

function faceBox(k: HutTools, f: Face, lu: number, h: number, t: number): THREE.BufferGeometry {
  return f.u[0] !== 0 ? k.box(lu, h, t) : k.box(t, h, lu);
}

function put<T extends THREE.BufferGeometry>(k: HutTools, geo: T, p: readonly number[], color: number, jitter = 0.04): T {
  return k.put(geo.translate(p[0], p[1], p[2]) as T, color, jitter);
}

/** A prism of a closed section (x out, y up) extruded `len` along z, centred on z = 0; UVs at `uv` a metre. */
function prism(section: ReadonlyArray<readonly [number, number]>, len: number, uv = 0.5): THREE.BufferGeometry {
  const shape = new THREE.Shape(section.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  const uvs = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * uv, uvs.getY(i) * uv);
  return geo.index ? geo.toNonIndexed() : geo;
}

/** The pieces of a wall's rectangle left round its openings. */
function around(u0: number, u1: number, y0: number, y1: number, holes: readonly HutOpening[]): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  const hs = holes.filter((h) => h.u + h.w / 2 > u0 && h.u - h.w / 2 < u1 && h.y < y1 && h.y + h.h > y0).sort((a, b) => a.u - b.u);
  let cu = u0;
  for (const h of hs) {
    const a = Math.max(u0, h.u - h.w / 2), b = Math.min(u1, h.u + h.w / 2);
    if (a > cu + 0.03) out.push([cu, a, y0, y1]);
    if (h.y > y0 + 0.03) out.push([a, b, y0, Math.min(y1, h.y)]);
    if (h.y + h.h < y1 - 0.03) out.push([a, b, Math.max(y0, h.y + h.h), y1]);
    cu = Math.max(cu, b);
  }
  if (u1 > cu + 0.03) out.push([cu, u1, y0, y1]);
  return out;
}

const tone = (tones: readonly number[], i: number) => tones[((i % tones.length) + tones.length) % tones.length];

/** How far a sunk post goes into the ground (the families' height band starts 5 cm under it). */
const SUNK = 0.04;

/** The walls' material for the break. */
const wallMat = (d: HutDialect): FractureMaterial => d.wallMaterial ?? ({ batten: 'plank', lap: 'plank', log: 'timber', mat: 'infill', sheet: 'metal',
  render: 'plaster', panel: 'metal' } as const)[d.cladding];

/** A wall's piece of the wreck: a stretch of its face (at most five a face, at least 1.6 m each). */
const wallGroup = (f: Face, u: number): string => {
  const step = Math.max(1.6, (2 * f.half) / 5);
  return `wall|${f.id}|${Math.max(0, Math.floor((u + f.half) / step))}`;
};

// --------------------------------------------------------------------------------------------------------- cladding

/** Lapped boards over a piece: one stepped panel, each course's foot standing proud of the one above it. */
function lapPanel(lu: number, h: number, course: number, t: number): THREE.BufferGeometry {
  const n = Math.max(1, Math.round(h / course)), c = h / n;
  const section: Array<[number, number]> = [[0, 0], [t, 0]];
  for (let k = 1; k <= n; k++) {
    section.push([t * 0.3, k * c]);
    if (k < n) section.push([t, k * c]);
  }
  section.push([0, h]);
  return prism(section, lu, 0.5);
}

/** A log `len` long, `dia` across, hewn to a hexagon (its long axis along z). */
function logMember(len: number, dia: number): THREE.BufferGeometry {
  const r = dia / 2, sec: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    sec.push([Math.cos(a) * r * 0.92, Math.sin(a) * r]);
  }
  return prism(sec, len, 0.6);
}

/**
 * One wall piece (u0..u1 along the face, y0..y1 over the ground) in the dialect's cladding, `i` its index (its tone).
 * The cladding stands out of the face's plane (the frame's outer face) by its thickness.
 */
function cladPiece(k: HutTools, d: HutDialect, f: Face, u0: number, u1: number, y0: number, y1: number, i: number, step = 0.6): void {
  const lu = u1 - u0, h = y1 - y0, uc = (u0 + u1) / 2, p = d.paint;
  if (lu < 0.04 || h < 0.04) return;
  k.tag('wall', wallGroup(f, uc), wallMat(d));
  switch (d.cladding) {
    case 'batten': {
      put(k, faceMember(k, f, lu, h, 0.025), at(f, uc, (y0 + y1) / 2, 0.0125), tone(p.wall, i), 0.05);
      // the battens over the boards' joints on a grid along the whole face, so they run on across the pieces
      if (h < 0.25) return;
      for (let g = -f.half + step / 2; g < f.half; g += step) {
        if (g < u0 + 0.04 || g > u1 - 0.04) continue;
        put(k, faceBox(k, f, 0.05, h - 0.02, 0.022), at(f, g, (y0 + y1) / 2, 0.036), tone(p.wall, i + 1), 0.04);
      }
      return;
    }
    case 'lap': {
      const panel = onto(lapPanel(lu, h, d.course, 0.03), f);
      put(k, panel, at(f, uc, y0, 0), tone(p.wall, i), 0.04);
      return;
    }
    case 'mat': {
      put(k, faceMember(k, f, lu, h, 0.03), at(f, uc, (y0 + y1) / 2, 0.015), tone(p.wall, i), 0.07);
      // the split-bamboo rails holding the mat, outside it
      if (lu < 0.3) return;
      for (const yy of [y0 + Math.min(0.3, h * 0.2), y1 - Math.min(0.3, h * 0.2)]) {
        if (h < 0.5 && yy !== y0 + Math.min(0.3, h * 0.2)) continue;
        const rail = k.cylinder(0.028, 0.028, lu, 5);
        rail.rotateZ(Math.PI / 2);
        if (f.u[0] === 0) rail.rotateY(Math.PI / 2);
        put(k, rail, at(f, uc, yy, 0.055), p.frame, 0.05);
      }
      return;
    }
    case 'sheet': {
      // sheet runs about 1.2 m wide, each lapping the one before it a sheet's thickness out
      const runs = Math.max(1, Math.round(lu / 1.2)), rw = lu / runs;
      for (let r = 0; r < runs; r++) {
        put(k, faceMember(k, f, rw + 0.04, h, 0.012), at(f, u0 + (r + 0.5) * rw, (y0 + y1) / 2, 0.008 + (r % 2) * 0.012), tone(p.wall, i + r), 0.05);
      }
      return;
    }
    case 'panel': {
      const runs = Math.max(1, Math.round(lu / 1.2)), rw = lu / runs;
      for (let r = 0; r < runs; r++) {
        put(k, faceMember(k, f, rw - 0.012, h, 0.06), at(f, u0 + (r + 0.5) * rw, (y0 + y1) / 2, 0.03), tone(p.wall, i + r), 0.03);
      }
      return;
    }
    case 'render': {
      // the wall itself, its thickness inside the face; the dado below in its own wash
      const t = 0.3, dado = d.dado ?? 0;
      const yd = Math.min(y1, Math.max(y0, dado));
      if (yd > y0 + 0.04) put(k, faceMember(k, f, lu, yd - y0, t + 0.02, 0.02), at(f, uc, (y0 + yd) / 2, -t / 2 + 0.01), p.dado ?? tone(p.wall, 2), 0.04);
      if (y1 > yd + 0.04) put(k, faceMember(k, f, lu, y1 - yd, t, 0.02), at(f, uc, (yd + y1) / 2, -t / 2), tone(p.wall, i), 0.03);
      return;
    }
    default: return;
  }
}

/**
 * A rendered masonry face: one slab `t` thick inside the face's plane from u0 to u1, y0 to y1, its doors notched up from
 * its foot and its windows cut through it (their reveals the slab's own sides), the dado's wash a band over its foot.
 */
function renderWall(k: HutTools, d: HutDialect, f: Face, u0: number, u1: number, y0: number, y1: number, holes: readonly HutOpening[], i: number): void {
  const t = 0.3, p = d.paint;
  const doors = holes.filter((h) => h.y <= y0 + 0.05).sort((a, b) => a.u - b.u);
  const outline: THREE.Vector2[] = [new THREE.Vector2(u0, y0)];
  for (const h of doors) {
    const a = Math.max(u0 + 0.05, h.u - h.w / 2), b = Math.min(u1 - 0.05, h.u + h.w / 2), top = Math.min(y1 - 0.1, h.y + h.h);
    outline.push(new THREE.Vector2(a, y0), new THREE.Vector2(a, top), new THREE.Vector2(b, top), new THREE.Vector2(b, y0));
  }
  outline.push(new THREE.Vector2(u1, y0), new THREE.Vector2(u1, y1), new THREE.Vector2(u0, y1));
  const shape = new THREE.Shape(outline);
  for (const h of holes) {
    if (h.y <= y0 + 0.05) continue;
    const a = h.u - h.w / 2, b = h.u + h.w / 2, lo = Math.max(y0 + 0.05, h.y), hi = Math.min(y1 - 0.05, h.y + h.h);
    shape.holes.push(new THREE.Path([new THREE.Vector2(a, lo), new THREE.Vector2(b, lo), new THREE.Vector2(b, hi), new THREE.Vector2(a, hi)]));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * 0.5, uv.getY(q) * 0.5);
  // built along x (the face's u), up y, through z from 0 to t: its outer face on the face's plane, turned onto the face
  g.translate(0, 0, -t);
  g.rotateY(Math.atan2(f.n[0], f.n[2]));
  const o = at(f, 0, 0, 0);
  put(k, g.index ? g.toNonIndexed() : g, o, tone(p.wall, i), 0.03);
  // the dado's wash over the foot of the wall, round the doors
  const dado = d.dado ?? 0;
  if (dado > 0.05) {
    for (const [a, b] of around(u0, u1, y0, y0 + dado, doors.map((h) => ({ ...h, y: -1e3, h: 2e3 })))) {
      put(k, faceMember(k, f, b - a, dado, 0.015), at(f, (a + b) / 2, y0 + dado / 2, 0.0075), p.dado ?? tone(p.wall, 2), 0.04);
    }
  }
}

/** A log wall: course on course, every course a log cut at the openings, its ends crossing the next face's at the corners. */
function logWall(k: HutTools, d: HutDialect, f: Face, y0: number, y1: number, holes: readonly HutOpening[], floor: number, half: boolean): void {
  const c = d.course, n = Math.floor((y1 - y0) / c - (half ? 0.5 : 0));
  for (let j = 0; j < n; j++) {
    const yb = y0 + (j + (half ? 0.5 : 0)) * c, yt = yb + c;
    const cutters = holes.filter((h) => floor + h.y < yt - 0.05 && floor + h.y + h.h > yb + 0.05);
    const segs = around(-f.half - 0.2, f.half + 0.2, yb, yt, cutters.map((h) => ({ ...h, y: -1e3, h: 2e3 })));
    for (const [a, b] of segs) {
      k.tag('wall', `wall|${f.id}|${Math.floor(j / 3)}`, 'timber');
      const log = onto(logMember(b - a, c * 1.02), f);
      put(k, log, at(f, (a + b) / 2, yb + c / 2, 0), tone(d.paint.wall, j + (half ? 1 : 0)), 0.06);
    }
  }
}

// --------------------------------------------------------------------------------------------------------- openings

/**
 * An opening's dress: the casing round it, the sill, and behind it a set-back sash (glazed, its bars across), the
 * shutters open against the wall, or a ledged and braced door on its strap hinges; a slit's dark.
 */
function dressOpening(k: HutTools, d: HutDialect, f: Face, o: HutOpening, floor: number, depth: number): void {
  const p = d.paint, y0 = floor + o.y, yc = y0 + o.h / 2, cw = 0.08, ct = 0.035, out = depth;
  const mass = d.cladding === 'render';
  // (a door is a piece of its own; a window goes with its stretch of wall)
  if (o.kind === 'door') k.tag('door', `door|${f.id}|${o.u}`, 'plank');
  else k.tag('wall', d.cladding === 'log' ? `wall|${f.id}|${Math.floor((o.y + o.h / 2) / d.course / 3)}` : d.cladding === 'render' ? `wall|${f.id}` : wallGroup(f, o.u), wallMat(d));
  if (!mass || o.kind !== 'door') {
    // the casing: jambs, head (and a window's sill below)
    // (a door's jambs stand on its threshold, a window's run past its sill)
    const jy0 = y0 - (o.y > 0.05 ? cw : 0), jy1 = y0 + o.h + cw;
    for (const s of [-1, 1]) put(k, faceBox(k, f, cw, jy1 - jy0, ct), at(f, o.u + s * (o.w / 2 + cw / 2), (jy0 + jy1) / 2, out + ct / 2), p.trim, 0.03);
    put(k, faceMember(k, f, o.w + cw * 2 + 0.06, cw, ct + 0.02), at(f, o.u, y0 + o.h + cw / 2, out + ct / 2 + 0.01), p.trim, 0.03);
  }
  if (mass) {
    // the reveal's head: a timber lintel through the wall
    put(k, faceMember(k, f, o.w + 0.3, 0.14, 0.3), at(f, o.u, y0 + o.h + 0.07, -0.15), p.frame, 0.04);
  }
  if (o.kind === 'garage') {
    // the roller door down in its opening, its slats stepping out, its guides either side
    k.tag('door', `door|${f.id}|${o.u}`, 'metal');
    const back = mass ? -0.22 : -0.03;
    put(k, onto(lapPanel(o.w - 0.04, o.h - 0.02, 0.2, 0.028), f), at(f, o.u, y0, back), p.door, 0.04);
    for (const s of [-1, 1]) put(k, faceBox(k, f, 0.06, o.h, 0.08), at(f, o.u + s * (o.w / 2 - 0.03), yc, back + 0.02), 0x3c3f42, 0.03);
    return;
  }
  if (o.kind === 'louvre') {
    // a vent's blades in its frame, the dark behind them
    put(k, faceBox(k, f, o.w - 0.04, o.h - 0.04, 0.02), at(f, o.u, yc, mass ? -0.2 : -0.04), p.dark, 0.02);
    const n = Math.max(3, Math.round(o.h / 0.16));
    for (let q = 0; q < n; q++) put(k, faceBox(k, f, o.w + 0.04, 0.05, 0.09), at(f, o.u, y0 + (q + 0.5) * o.h / n, mass ? -0.12 : out / 2), p.door, 0.03);
    return;
  }
  if (o.kind === 'door') {
    // the ledged and braced leaf set back in its frame, the ledges and the brace inside out to the weather, the straps
    const back = mass ? -0.12 : 0.0;
    put(k, faceMember(k, f, o.w - 0.02, o.h - 0.02, 0.035), at(f, o.u, yc, back + 0.0175), p.door, 0.05);
    for (const yy of [0.18, 0.5, 0.82]) put(k, faceBox(k, f, o.w - 0.12, 0.1, 0.025), at(f, o.u, y0 + o.h * yy, back + 0.047), p.door, 0.04);
    const brace = faceBox(k, f, 0.09, Math.hypot(o.w - 0.2, o.h * 0.32) - 0.05, 0.022);
    const lean = Math.atan2(o.w - 0.2, o.h * 0.32);
    if (f.u[0] !== 0) brace.rotateZ(-lean * f.u[0]); else brace.rotateX(lean * f.u[2]);
    for (const yy of [0.34, 0.66]) put(k, brace.clone(), at(f, o.u, y0 + o.h * yy, back + 0.047), p.door, 0.04);
    brace.dispose();
    for (const yy of [0.18, 0.82]) put(k, faceBox(k, f, o.w * 0.55, 0.035, 0.012), at(f, o.u - o.w * 0.2, y0 + o.h * yy, back + 0.066), 0x2b2c2d, 0.02);
    // the threshold
    put(k, faceMember(k, f, o.w + 0.16, 0.06, 0.16), at(f, o.u, y0 + 0.03, out - 0.04), p.frame, 0.03);
    return;
  }
  // a window's sill, proud of the wall and tipped to shed the rain
  put(k, faceMember(k, f, o.w + 0.22, 0.05, 0.12), at(f, o.u, y0 - 0.025, out + 0.04), p.trim, 0.03);
  const back = mass ? -0.1 : -0.02;
  if (o.kind === 'slit') {
    put(k, faceBox(k, f, o.w, o.h, 0.02), at(f, o.u, yc, mass ? back - 0.1 : -0.02), p.dark, 0.02);
    return;
  }
  put(k, k.aperture(faceBox(k, f, o.w - 0.04, o.h - 0.04, 0.02), f.n), at(f, o.u, yc, back), p.glass, 0.03);
  put(k, faceBox(k, f, 0.035, o.h - 0.04, 0.03), at(f, o.u, yc, back + 0.02), p.trim, 0.02);
  if (o.h > 0.65) put(k, faceBox(k, f, o.w - 0.04, 0.035, 0.03), at(f, o.u, y0 + o.h * 0.55, back + 0.02), p.trim, 0.02);
  if (d.shutters) {
    // the two leaves open flat against the wall beside the casing
    for (const s of [-1, 1]) {
      put(k, faceMember(k, f, o.w / 2, o.h, 0.03), at(f, o.u + s * (o.w * 0.75 + cw + 0.02), yc, out + 0.05), p.door, 0.05);
      put(k, faceBox(k, f, o.w / 2 - 0.06, 0.06, 0.02), at(f, o.u + s * (o.w * 0.75 + cw + 0.02), yc, out + 0.075), p.door, 0.04);
    }
  }
}

// -------------------------------------------------------------------------------------------------------------- roof

interface Slope {
  /** the outward side (-1 left, +1 right; a skillion's one slope falls to the front, +1 along z) */
  s: -1 | 1;
  axis: 'x' | 'z';
  angle: number;
  /** the slope's length from its high edge to its eave, and its width across */
  len: number;
  across: number;
  /** the point on the rafters' top plane at the slope's middle */
  mid: [number, number, number];
  /** the plane's outward normal */
  n: [number, number, number];
  /** down the slope (unit) */
  down: [number, number, number];
}

/** Lay a part built flat (its length along the slope in x or z, across in the other) on a slope at `a` metres down from
 *  its middle, `lift` metres off the rafters' plane, without a roof receipt (the courses over a pitched deck). */
function onSlope<T extends THREE.BufferGeometry>(geo: T, sl: Slope, a: number, lift: number): T {
  if (sl.axis === 'x') geo.rotateZ(-sl.s * sl.angle);
  else geo.rotateX(sl.s * sl.angle);
  return geo.translate(sl.mid[0] + sl.down[0] * a + sl.n[0] * lift, sl.mid[1] + sl.down[1] * a + sl.n[1] * lift,
    sl.mid[2] + sl.down[2] * a + sl.n[2] * lift) as T;
}

/** A flat part `along` the slope's fall and `across` it, for onSlope (along x on a gable's slopes, along z on a skillion). */
function slopeGeo(k: HutTools, sl: Slope, along: number, t: number, across: number, kind: 'box' | 'mbox' | 'msym', chamfer?: number): THREE.BufferGeometry {
  const [w, d] = sl.axis === 'x' ? [along, across] : [across, along];
  return kind === 'box' ? k.box(w, t, d) : kind === 'mbox' ? k.mbox(w, t, d, chamfer) : k.msym(w, t, d, chamfer);
}

function slopes(form: HutForm, d: HutDialect, top: number): Slope[] {
  const { w, d: dd } = form;
  if (form.roof === 'gable') {
    const run = w / 2, angle = Math.atan2(form.rise, run), cos = Math.cos(angle), sin = Math.sin(angle);
    const len = (run + d.eave) / cos, across = dd + 2 * d.verge;
    return ([-1, 1] as const).map((s) => {
      // from the ridge (0, top + rise) down to the eave, the middle half way
      const mx = s * (run + d.eave) / 2, my = top + form.rise - (run + d.eave) / 2 * Math.tan(angle);
      return { s, axis: 'x' as const, angle, len, across, mid: [mx, my, 0], n: [s * sin, cos, 0], down: [s * cos, -sin, 0] };
    });
  }
  // a skillion: high at the back (-z), falling to the front, the eaves out past both walls
  const run = dd, angle = Math.atan2(form.rise, run), cos = Math.cos(angle), sin = Math.sin(angle);
  const len = (run + 2 * d.eave) / cos, across = w + 2 * d.verge;
  const my = top + form.rise / 2;
  return [{ s: 1, axis: 'z', angle, len, across, mid: [0, my, 0], n: [0, cos, sin], down: [0, -sin, cos] }];
}

/** Shift a part laid on a slope `c` metres across it (along the ridge on a gable, along the eave on a skillion). */
function across<T extends THREE.BufferGeometry>(geo: T, sl: Slope, c: number): T {
  return geo.translate(sl.axis === 'x' ? 0 : c, 0, sl.axis === 'x' ? c : 0) as T;
}

/**
 * The roof, a section at a time across each slope (each section one piece of the wreck: its deck with its pitch receipt,
 * its rafters under it, the covering's courses or sheets over it, its snow, its fascia and the barge board at an end),
 * then the ridge board and the ridge's roll.
 */
function roof(k: HutTools, form: HutForm, d: HutDialect, top: number): void {
  const p = d.paint, sls = slopes(form, d, top);
  const gable = form.roof === 'gable';
  const mat = d.roofMaterial ?? (d.covering === 'sheet' ? 'metal' : d.covering === 'thatch' ? 'thatch' : d.covering === 'tile' ? 'tile' : 'plank');
  // the covering's top over the rafters at the ridge (the ridge roll sits half in it)
  let ridgeLift = 0.025;
  const tone0 = p.roof[0], tone1 = p.roof[1], tone2 = p.roof[2];
  for (const sl of sls) {
    const nsec = sl.across > 8 ? 3 : sl.across > 3.5 ? 2 : 1, sw = sl.across / nsec;
    // the rafters at the bay lines (every 1.8 m or so), their tails out under the eaves
    const bays = Math.max(2, Math.round((sl.across - 2 * d.verge) / 1.8));
    for (let j = 0; j < nsec; j++) {
      const c0 = -sl.across / 2 + j * sw, c1 = c0 + sw, cm = (c0 + c1) / 2;
      k.tag('roof', `roof|${sl.s}|${j}`, mat);
      for (let b = 0; b <= bays; b++) {
        const c = -sl.across / 2 + d.verge + b * (sl.across - 2 * d.verge) / bays;
        if (c < c0 - 1e-6 || c >= c1 - 1e-6 && !(j === nsec - 1 && c <= c1 + 1e-6)) continue;
        const rafter = sl.axis === 'x' ? k.box(sl.len + 0.02, 0.1, 0.06) : k.box(0.06, 0.1, sl.len + 0.02);
        k.put(across(onSlope(rafter, sl, 0, -0.05), sl, c), p.frame, 0.04);
      }
      // the boarded deck (its pitch receipt) under felt and a tile's bed; sheets, shingles, slabs and thatch lie on the
      // rafters' battens, their own courses closing the roof
      // (under snow a sheet's or a tile's courses are the snow's: their deck alone)
      const hidden = !!d.snow && (d.covering === 'sheet' || d.covering === 'tile' || d.covering === 'felt');
      const decked = d.covering === 'felt' || d.covering === 'tile' || hidden;
      const lift0 = decked ? 0.025 : 0;
      if (decked) {
        const deck = slopeGeo(k, sl, sl.len, 0.025, sw + 0.01, 'msym', 0.006);
        k.put(across(k.pitch(deck, sl.axis, (sl.axis === 'x' ? sl.s : 1) as -1 | 1, sl.angle, gable ? 'gable' : 'skillion')
          .translate(sl.mid[0] + sl.n[0] * 0.0125, sl.mid[1] + sl.n[1] * 0.0125, sl.mid[2] + sl.n[2] * 0.0125), sl, cm), d.covering === 'thatch' ? tone2 : tone1, 0.04);
      }
      let lift = decked ? 0.025 : 0;
      switch (hidden ? 'none' : d.covering) {
        case 'felt': {
          // the felt's laps: a strip every 1.2 m down the slope
          const n = Math.max(2, Math.round(sl.len / 1.2));
          for (let q = 1; q < n; q++) {
            k.put(across(onSlope(slopeGeo(k, sl, 0.07, 0.012, sw + 0.02, 'box'), sl, -sl.len / 2 + q * sl.len / n, lift + 0.006), sl, cm), tone0, 0.03);
          }
          lift += 0.012;
          break;
        }
        case 'shingle':
        case 'slab': {
          // the courses from the eave up, each butt standing proud over the one below (under snow only the eaves' and the
          // verges' few show: the courses there are the snow's)
          const c = Math.max((d.covering === 'slab' ? 0.46 : 0.38) * (d.snow ? 1.6 : 1), sl.len / 9), t = d.covering === 'slab' ? 0.055 : 0.03;
          const n = Math.max(2, Math.round(sl.len / c));
          for (let q = 0; q < n; q++) {
            const a = sl.len / 2 - (q + 0.5) * sl.len / n;
            const strip = slopeGeo(k, sl, sl.len / n + 0.08, t, sw + 0.03, 'mbox', d.covering === 'slab' ? 0.025 : 0.012);
            // its butt (the eave's end) tipped up over the course below, its head under the course above
            if (sl.axis === 'x') strip.rotateZ(sl.s * 0.05); else strip.rotateX(-0.05);
            k.put(across(onSlope(strip, sl, a, lift + t / 2 + 0.012), sl, cm), (q + j) % 3 === 0 ? tone0 : (q + j) % 3 === 1 ? tone1 : tone2, 0.07);
          }
          lift += t + 0.026;
          break;
        }
        case 'sheet': {
          // corrugated sheets from the high edge to the eave, about 1.2 m across each, lapping a rib
          const n = Math.max(1, Math.round(sw / 1.2)), ew = sw / n;
          for (let q = 0; q < n; q++) {
            // (its crimps in V: three a sheet, the ribs reading along the eaves and the verges)
            const sec: Array<[number, number]> = [];
            const pts = 6;
            for (let v = 0; v <= pts; v++) sec.push([-(ew + 0.05) / 2 + v * (ew + 0.05) / pts, 0.012 + (v % 2) * 0.03]);
            sec.push([(ew + 0.05) / 2, 0], [-(ew + 0.05) / 2, 0]);
            // the profile across the slope (x across, y the crimps), extruded down it (z): turned to lie on a gable's
            // slope (its fall along x) or a skillion's (along z)
            const sheet = prism(sec, sl.len + 0.04, 0.6);
            if (sl.axis === 'x') sheet.rotateY(Math.PI / 2);
            k.put(across(onSlope(sheet, sl, 0, lift + (q % 2) * 0.006), sl, c0 + (q + 0.5) * ew), (q + j) % 2 ? tone0 : tone1, 0.06);
          }
          lift += 0.045;
          break;
        }
        case 'tile': {
          // canal tiles: the covers in their columns down the slope, the channels between them in the deck's tone
          const n = Math.max(2, Math.round(sw / 0.26)), cw = sw / n;
          for (let q = 0; q < n; q++) {
            // a half pipe bulging to +x along its axis (y), turned so the bulge stands up and the axis runs down the fall
            const cover = new THREE.CylinderGeometry(cw * 0.42, cw * 0.38, sl.len + 0.06, 4, 1, true, 0, Math.PI);
            cover.rotateZ(Math.PI / 2);
            if (sl.axis === 'z') cover.rotateY(Math.PI / 2);
            const g = cover.toNonIndexed();
            cover.dispose();
            k.put(across(onSlope(g, sl, 0, lift), sl, c0 + (q + 0.5) * cw), (q + j) % 3 === 0 ? tone0 : (q + j) % 3 === 1 ? tone1 : tone2, 0.08);
          }
          lift += cw * 0.42;
          break;
        }
        case 'thatch': {
          // the thatch laid thick in two coats, the lower one's butts proud along the eave
          const t = 0.26;
          k.put(across(onSlope(slopeGeo(k, sl, sl.len - 0.15, t, sw + 0.01, 'mbox', 0.09), sl, -0.075, lift + t / 2), sl, cm), tone0, 0.08);
          k.put(across(onSlope(slopeGeo(k, sl, sl.len * 0.36, t * 0.8, sw + 0.05, 'mbox', 0.08), sl, sl.len / 2 - sl.len * 0.18, lift + t + t * 0.25), sl, cm), tone1, 0.08);
          lift += t * 1.6;
          break;
        }
        default: break;
      }
      ridgeLift = d.covering === 'thatch' ? lift0 + 0.26 : d.covering === 'tile' ? lift - (sw / Math.max(2, Math.round(sw / 0.26))) * 0.2 : lift;
      if (d.snow) {
        const sn = d.snow;
        // (on a thatch the snow lies on its main coat)
        const on = d.covering === 'thatch' ? ridgeLift : lift;
        k.put(across(onSlope(slopeGeo(k, sl, sl.len - 0.12, sn, sw - (nsec === 1 ? 0.08 : 0.02), 'mbox', Math.min(0.08, sn * 0.45)), sl, 0, on + sn / 2 - 0.004), sl, cm), 0xe4e9ee, 0.02);
        ridgeLift = on + sn;
      }
      // the fascia along the eave
      k.put(across(onSlope(slopeGeo(k, sl, 0.03, 0.17, sw + 0.01, 'box'), sl, sl.len / 2 - 0.015, -0.02), sl, cm), p.trim, 0.03);
      // the barge board up the rake at the section's end of the roof (a skillion's verge)
      for (const e of [-1, 1]) {
        if ((e < 0 && j !== 0) || (e > 0 && j !== nsec - 1)) continue;
        const board = sl.axis === 'x' ? k.mbox(sl.len + 0.04, 0.18, 0.03) : k.mbox(0.03, 0.18, sl.len + 0.04);
        k.put(across(onSlope(board, sl, 0, 0.02), sl, e * (sl.across / 2 + (sl.axis === 'x' ? 0.015 : 0))), p.trim, 0.03);
      }
    }
  }
  if (gable) {
    k.tag('purlin', 'ridge', 'timber');
    put(k, k.mbox(0.05, 0.18, form.d + 2 * d.verge), [0, top + form.rise - 0.04, 0], p.frame, 0.03);
    if (d.covering === 'thatch' || d.covering === 'tile' || d.snow) {
      // the ridge's roll: thatch bound over it, ridge tiles, or the snow meeting over it (over the two coverings' top
      // edges at the ridge, sitting down between them)
      const r = d.covering === 'thatch' ? 0.24 : d.snow ? 0.17 : 0.12;
      const roll = k.cylinder(r, r, form.d + 2 * d.verge, 7);
      roll.rotateX(Math.PI / 2);
      put(k, roll, [0, top + form.rise + ridgeLift * Math.cos(sls[0].angle) + 0.35 * r, 0], d.snow ? 0xe4e9ee : p.roof[2], 0.05);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------- build

/** Build a hut of `form` in `dialect`; returns its frame for the kind's gear. */
function buildHut(k: HutTools, form: HutForm, d: HutDialect): HutFrame {
  const mass = d.cladding === 'render', parapet = mass && form.roof === 'skillion' ? form.parapet ?? 0 : 0;
  // (a parapet's roof lies inside its walls)
  d = { ...d, eave: parapet ? -0.3 : form.eave ?? d.eave, verge: parapet ? -0.3 : form.verge ?? d.verge };
  const p = d.paint, { w, d: dd } = form;
  k.tag('fitting', null, 'timber');
  const ids: FaceId[] = ['front', 'back', 'left', 'right'];
  const faces = Object.fromEntries(ids.map((id) => [id, faceOf(id, w, dd)])) as Record<FaceId, Face>;
  const plinth = d.footing === 'plinth' ? form.plinth ?? 0.35 : 0;
  const floor = Math.max(form.lift, plinth);
  const top = floor + form.wallH;
  // (a log wall's openings run whole courses: the logs are cut for them course by course, its frame fills the rest)
  if (d.cladding === 'log') {
    const c = d.course;
    form = { ...form, openings: form.openings.map((o) => {
      const off = o.face === 'left' || o.face === 'right' ? c / 2 : 0;
      const y0 = o.kind === 'door' ? 0 : Math.max(0, Math.floor((o.y - off) / c + 1e-6) * c + off);
      const y1 = Math.ceil((o.y + o.h - off) / c - 1e-6) * c + off;
      return { ...o, y: y0, h: y1 - y0 };
    }) };
  }
  const post = d.round ? 0.16 : 0.14;
  // the posts: the corners, and on a long wall one every 2 m or so
  const postsAlong = (len: number) => Math.max(1, Math.round(len / 2.4));
  const posts: Array<[number, number]> = [];
  const nx = postsAlong(w), nz = postsAlong(dd);
  for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) posts.push([-w / 2 + i * w / nx, sz * dd / 2]);
  for (let j = 1; j < nz; j++) for (const sx of [-1, 1]) posts.push([sx * w / 2, -dd / 2 + j * dd / nz]);
  // the footings: a stone pad under every post, the posts sunk into the ground, or a plinth under the sills
  const stilts = form.lift > 0.3;
  const footMat: FractureMaterial = d.footMaterial ?? 'stone';
  k.tag('footing', d.footing === 'plinth' ? 'plinth' : 'pads', footMat);
  if (d.footing === 'plinth') {
    for (const id of ids) {
      const f = faces[id];
      put(k, faceMember(k, f, 2 * f.half + 0.36, plinth + 0.04, 0.36, 0.03), at(f, 0, (plinth - 0.04) / 2, -0.06), p.foot, 0.06);
    }
  } else {
    for (const [x, z] of posts) {
      if (d.footing === 'pads') {
        const pad = k.box(0.3 + k.rng() * 0.08, 0.2, 0.3 + k.rng() * 0.08);
        pad.rotateY((k.rng() - 0.5) * 0.4);
        put(k, pad, [x, 0.06, z], p.foot, 0.08);
      }
    }
  }
  // the stilts and the deck on them (a raised floor), its joists
  if (stilts) {
    const vz = form.veranda ?? 0;
    posts.forEach(([x, z], i) => {
      k.tag('post', `leg|${i}`, d.footing === 'staddle' ? 'stone' : 'timber');
      if (d.footing === 'staddle') {
        // a staddle stone: its post and the round cap the rats cannot climb past
        put(k, k.mbox(0.26, form.lift - 0.1, 0.26, 0.04), [x, (form.lift - 0.1) / 2, z], p.foot, 0.06);
        put(k, k.cylinder(0.34, 0.34, 0.1, 9), [x, form.lift - 0.05, z], p.foot, 0.05);
        return;
      }
      const h = form.lift + (d.footing === 'sunk' ? SUNK : 0) - (d.footing === 'pads' ? 0.12 : 0);
      const leg = d.round ? k.cylinder(post / 2, post / 2 + 0.01, h, 5) : k.mbox(post, h, post);
      put(k, leg, [x, form.lift - h / 2, z], p.frame, 0.05);
    });
    if (vz > 0) for (const sx of [-1, 1]) {
      k.tag('post', `vleg|${sx}`, 'timber');
      const h = form.lift + (d.footing === 'sunk' ? SUNK : 0);
      const leg = d.round ? k.cylinder(post / 2, post / 2 + 0.01, h + 1.0, 5) : k.mbox(post, h + 1.0, post);
      put(k, leg, [sx * (w / 2 - 0.1), form.lift + 1.0 - (h + 1.0) / 2, dd / 2 + vz - 0.1], p.frame, 0.05);
    }
    k.tag('slab', 'deck', 'plank');
    put(k, k.msym(w + 0.3, 0.08, dd + 0.3 + vz, 0.015), [0, form.lift - 0.04, vz / 2], p.wall[2], 0.05);
    k.tag('sill', 'joists', 'timber');
    for (const sx of [-1, 0, 1]) put(k, k.mbox(0.08, 0.14, dd + vz), [sx * (w / 2 - 0.1), form.lift - 0.15, vz / 2], p.frame, 0.04);
    if (vz > 0) {
      k.tag('girt', 'rail', 'timber');
      // the veranda's rail
      put(k, k.mbox(w - 0.1, 0.07, 0.07), [0, form.lift + 0.95, dd / 2 + vz - 0.1], p.frame, 0.04);
      for (let i = 0; i <= 4; i++) put(k, k.box(0.045, 0.9, 0.045), [-w / 2 + 0.1 + i * (w - 0.2) / 4, form.lift + 0.45, dd / 2 + vz - 0.1], p.frame, 0.04);
    }
  }
  // the frame: a mat's posts standing outside it, the others' corner posts flush with the cladding (its corner boards);
  // the sill and the plates inside the cladding (a log or a render wall carries itself)
  const skillion = form.roof === 'skillion';
  const faceTop = (id: FaceId) => (parapet ? top + form.rise + parapet : skillion && id === 'back' ? top + form.rise : top);
  // (an open face's posts carry the roof over it: every one stands, a masonry kit's as piers)
  const onOpen = (x: number, z: number): boolean => (form.open ?? []).some((id) => (id === 'front' ? z > dd / 2 - 1e-6 : id === 'back' ? z < -dd / 2 + 1e-6
    : id === 'left' ? x < -w / 2 + 1e-6 : x > w / 2 - 1e-6));
  if (d.cladding === 'render' || d.cladding === 'log') {
    for (const [i, [x, z]] of posts.entries()) {
      if (!onOpen(x, z)) continue;
      k.tag('post', `pier|${i}`, wallMat(d));
      const h = roofTop(form, d, top, x, z) - floor;
      put(k, k.mbox(0.36, h, 0.36, 0.02), [x - Math.sign(x) * 0.18, floor + h / 2, z - Math.sign(z) * 0.18], p.wall[0], 0.04);
    }
  }
  if (d.cladding !== 'render' && d.cladding !== 'log') {
    const inset = d.cladding === 'mat' ? 0 : post / 2 - 0.035;
    for (const [i, [x, z]] of posts.entries()) {
      const corner = Math.abs(Math.abs(x) - w / 2) < 1e-6 && Math.abs(Math.abs(z) - dd / 2) < 1e-6;
      if (!corner && d.cladding !== 'mat' && !onOpen(x, z)) continue;
      k.tag('post', `post|${i}`, 'timber');
      const foot = stilts ? form.lift : d.footing === 'sunk' ? -SUNK : d.footing === 'pads' ? 0.16 : plinth;
      const h = roofTop(form, d, top, x, z) - foot - 0.02;
      const g = d.round ? k.cylinder(post / 2, post / 2 + 0.01, h, 5) : k.mbox(post, h, post);
      const px = x === 0 ? 0 : x - Math.sign(x) * (Math.abs(Math.abs(x) - w / 2) < 1e-6 ? inset : 0);
      const pz = z === 0 ? 0 : z - Math.sign(z) * (Math.abs(Math.abs(z) - dd / 2) < 1e-6 ? inset : 0);
      put(k, g, [px, foot + h / 2, pz], corner && d.cladding !== 'mat' ? p.trim : p.frame, 0.04);
    }
    // (the sill and the plates behind boards or sheets are never seen: a mat's stand outside it)
    if (d.cladding === 'mat') for (const id of ids) {
      const f = faces[id];
      k.tag('plate', `plate|${id}`, 'timber');
      for (const yy of [floor + 0.07, faceTop(id) - 0.06]) put(k, faceBox(k, f, 2 * f.half - 0.1, 0.12, 0.1), at(f, 0, yy, 0.08), p.frame, 0.04);
    }
  }
  // the walls, piece by piece round the openings
  let piece = 0;
  for (const id of ids) {
    const f = faces[id];
    if (form.open?.includes(id)) continue;
    if (d.cladding === 'log') {
      logWall(k, d, f, floor, faceTop(id), form.openings.filter((o) => o.face === id), floor, id === 'left' || id === 'right');
      continue;
    }
    const holes = form.openings.filter((o) => o.face === id).map((o) => ({ ...o, y: o.y + floor }));
    if (d.cladding === 'render') {
      k.tag('wall', `wall|${id}`, wallMat(d));
      // (the front and back run over the side walls' ends: the corners closed)
      const end = id === 'front' || id === 'back' ? 0.0 : -0.3;
      renderWall(k, d, f, -f.half - end, f.half + end, floor, faceTop(id), holes, piece++);
      continue;
    }
    const end = d.cladding === 'mat' ? 0 : -0.07;
    for (const [u0, u1, a, b] of around(-f.half - end, f.half + end, floor + 0.02, faceTop(id), holes)) {
      cladPiece(k, d, f, u0, u1, a, b, piece++, form.battens ?? 0.6);
    }
  }
  // the gables over the walls (a skillion's sides): the cladding's boards in a clipped triangle, a render's masonry
  if (form.roof === 'gable') {
    for (const id of ['front', 'back'] as const) {
      const f = faces[id], run = w / 2, rise = form.rise - 0.1;
      const sec: Array<[number, number]> = [[-run, 0], [run, 0], [0.09, rise], [-0.09, rise]];
      const t = d.cladding === 'render' ? 0.3 : 0.03;
      k.tag('wall', `gable|${id}`, d.cladding === 'log' ? 'plank' : wallMat(d));
      const g = prism(sec.map(([a, b]) => [a, b] as [number, number]), t, 0.5);
      // built across x, up y, through z: turned onto the face (its x along the face)
      if (f.u[0] === 0) g.rotateY(Math.PI / 2);
      const o = d.cladding === 'render' ? -0.15 : d.cladding === 'log' ? d.course / 2 - 0.02 : 0.015;
      put(k, g, at(f, 0, top, o), d.cladding === 'mat' ? p.wall[1] : p.wall[0], 0.05);
      if (d.cladding === 'batten' || d.cladding === 'log' || d.cladding === 'lap') {
        const step = form.battens ?? 0.6;
        for (let g2 = -run + step / 2; g2 < run - 0.1; g2 += step) {
          const hh = rise * (1 - Math.abs(g2) / run) - 0.05;
          if (hh < 0.2) continue;
          put(k, faceBox(k, f, 0.05, hh, 0.022), at(f, g2, top + hh / 2, o + 0.026), p.wall[1], 0.04);
        }
      }
    }
  } else if (parapet) {
    // the parapet's coping on the walls' heads
    k.tag('wall', 'coping', wallMat(d));
    for (const id of ids) {
      const f = faces[id], len = 2 * f.half + (id === 'front' || id === 'back' ? 0.36 : -0.24);
      put(k, faceMember(k, f, len, 0.07, 0.38, 0.015), at(f, 0, faceTop(id) + 0.035, -0.15), p.foot, 0.04);
    }
  } else {
    for (const id of ['left', 'right'] as const) {
      const f = faces[id], t = d.cladding === 'render' ? 0.3 : 0.03;
      k.tag('wall', `gable|${id}`, d.cladding === 'log' ? 'plank' : wallMat(d));
      // the side's triangle under the skillion: high at the back (u = +half on the left face, -half on the right)
      const hiAt = id === 'left' ? -f.half : f.half;
      const sec: Array<[number, number]> = [[-f.half, 0], [f.half, 0], [hiAt, form.rise - 0.06]];
      if (hiAt < 0) sec.reverse();
      const g = prism(sec, t, 0.5);
      g.rotateY(Math.PI / 2);
      if (id === 'left') g.rotateY(Math.PI);
      if (!form.open?.includes(id)) put(k, g, at(f, 0, top, d.cladding === 'render' ? -0.15 : 0.015), p.wall[0], 0.05);
    }
  }
  // the openings' dress
  const depth = d.cladding === 'render' ? 0 : d.cladding === 'log' ? d.course * 0.47 : d.cladding === 'panel' ? 0.06 : 0.03;
  for (const o of form.openings) dressOpening(k, d, faces[o.face], o, floor, depth);
  roof(k, form, d, top);
  // the stove pipe through the roof, its cap
  if (form.stove) {
    k.tag('chimney', 'stove', 'metal');
    const [sx, sz] = form.stove;
    const at0 = roofTop(form, d, top, sx, sz);
    put(k, k.cylinder(0.08, 0.08, at0 - top + 0.7, 6), [sx, (top + at0 + 0.7) / 2, sz], 0x2e2c2a, 0.04);
    put(k, k.cylinder(0.15, 0.12, 0.1, 6), [sx, at0 + 0.72, sz], 0x2e2c2a, 0.04);
  }
  return { form, dialect: d, floor, top, roofAt: (x) => roofTop(form, d, top, x, 0), face: (id) => faces[id] };
}

/** The rafters' plane over (x, z): a gable's from its ridge, a skillion's from its high back. */
function roofTop(form: HutForm, d: HutDialect, top: number, x: number, z: number): number {
  if (form.roof === 'gable') return top + form.rise * (1 - Math.abs(x) / (form.w / 2));
  void d;
  return top + form.rise * (0.5 - z / form.d);
}

// ---------------------------------------------------------------------------------------------------------- the gear

/** A ladder from the ground up to `y` on `face` at `u`, its head `from` metres off the face, its foot `out` further. */
function ladder(k: HutTools, f: Face, u: number, y: number, out: number, color: number, round = false, from = 0): void {
  const len = Math.hypot(y, out), lean = Math.atan2(out, y);
  k.tag('fitting', `ladder|${f.id}|${u}`, 'timber');
  for (const s of [-1, 1]) {
    const rail = round ? k.cylinder(0.035, 0.04, len, 5) : k.box(0.07, len, 0.05);
    // lean its foot out along the face's normal
    // its head in against the wall, its foot out
    if (f.n[0] !== 0) rail.rotateZ(f.n[0] * lean); else rail.rotateX(-f.n[2] * lean);
    put(k, rail, at(f, u + s * 0.22, y / 2, from + out / 2), color, 0.05);
  }
  const n = Math.max(3, Math.floor(y / 0.3));
  for (let i = 1; i <= n; i++) {
    const yy = (i / (n + 1)) * y;
    put(k, faceBox(k, f, 0.5, 0.04, 0.04), at(f, u, yy, from + out * (1 - yy / y)), color, 0.04);
  }
}

/** A stack of split billets against a face, their end grain out (one body a course). */
function woodpile(k: HutTools, f: Face, u: number, len: number, courses: number, y: number, color: number): void {
  k.tag('fitting', `woodpile|${f.id}|${u}`, 'timber');
  for (let r = 0; r < courses; r++) {
    const n = Math.max(2, Math.round(len / 0.2) - r);
    put(k, faceBox(k, f, n * 0.2, 0.18, 0.45), at(f, u, y + 0.09 + r * 0.17, 0.25), color, 0.08);
  }
}


/** A course of sandbags a bag deep along a line from (x0, z0) to (x1, z1), `courses` high, each course a half bag along. */
function sandbags(k: HutTools, x0: number, z0: number, x1: number, z1: number, courses: number, color = 0x8e7f5e): void {
  k.tag('fitting', `bags|${x0.toFixed(1)}|${z0.toFixed(1)}`, 'earth');
  const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.58));
  for (let r = 0; r < courses; r++) {
    for (let i = 0; i < n - (r % 2); i++) {
      const t = (i + 0.5 + (r % 2) * 0.5) / n, bag = k.box(0.34, 0.19, 0.56);
      bag.rotateY(yaw + (k.rng() - 0.5) * 0.12);
      put(k, bag, [x0 + (x1 - x0) * t, 0.095 + r * 0.18, z0 + (z1 - z0) * t], color, 0.09);
    }
  }
}

/** A checkpoint's boom across the lane before `face`: its post and counterweight, the striped arm, the rest post. */
function boom(k: HutTools, h: HutFrame, face: FaceId, u: number, out: number, len: number, sign: 1 | -1): void {
  k.tag('fitting', `boom|${face}`, 'metal');
  const f = h.face(face), red = 0xa8322a, white = 0xd8d6cf, y = 1.0;
  put(k, k.mbox(0.2, y + 0.15, 0.2), at(f, u, (y + 0.15) / 2, out), 0x3c3f42, 0.03);
  put(k, faceBox(k, f, 0.42, 0.36, 0.28), at(f, u + -sign * 0.32, y, out), 0x3c3f42, 0.03);
  const n = Math.max(3, Math.round(len / 0.6));
  for (let i = 0; i < n; i++) put(k, faceBox(k, f, len / n, 0.1, 0.1), at(f, u + sign * (0.09 + (i + 0.5) * len / n), y + 0.08, out), i % 2 ? white : red, 0.03);
  put(k, k.box(0.1, y - 0.05, 0.1), at(f, u + sign * (0.09 + len - 0.1), (y - 0.05) / 2, out), 0x3c3f42, 0.03);
}

/** Oil drums standing in a cluster at (x, z). */
function drums(k: HutTools, x: number, z: number, n: number, color = 0x5a3a2a): void {
  k.tag('fitting', `drums|${x}|${z}`, 'metal');
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = i ? 0.62 : 0;
    put(k, k.cylinder(0.29, 0.29, 0.88, 8), [x + Math.cos(a) * r, 0.44, z + Math.sin(a) * r], i % 2 ? 0x3f4a3a : color, 0.08);
  }
}

/** A transformer's bushings on its roof: three posts, their insulator stacks, the cable risers down the back. */
function bushings(k: HutTools, h: HutFrame): void {
  // (on a flat roof; a gabled kiosk's cables go in underground)
  if (h.form.roof !== 'skillion') return;
  k.tag('fitting', 'bushings', 'metal');
  const y = h.roofAt(0) + 0.06, z = -h.form.d * 0.2;
  for (const x of [-1.2, 0, 1.2]) {
    put(k, k.box(0.2, 0.7, 0.2), [x, y + 0.35, z], 0x5f4f3a, 0.03);
    for (let i = 0; i < 4; i++) put(k, k.cylinder(0.15, 0.15, 0.06, 8), [x, y + 0.78 + i * 0.12, z], 0x7b735d, 0.03);
    put(k, k.cylinder(0.05, 0.05, 0.62, 5), [x, y + 0.95, z], 0x7b735d, 0.02);
  }
}

/** A shade of palm ribs (or reed mats) on four poles before `face`. */
function shade(k: HutTools, h: HutFrame, face: FaceId, u: number, w: number, depth: number, y: number): void {
  k.tag('fitting', `shade|${face}`, 'timber');
  const f = h.face(face), p = h.dialect.paint;
  for (const s of [-1, 1]) put(k, k.cylinder(0.07, 0.08, y, 5), at(f, u + s * (w / 2 - 0.1), y / 2, depth), p.frame, 0.05);
  put(k, faceBox(k, f, w, 0.1, 0.1), at(f, u, y + 0.05, depth), p.frame, 0.04);
  put(k, faceMember(k, f, w + 0.2, 0.05, depth + 0.1), at(f, u, y + 0.13, depth / 2), 0xa8956f, 0.12);
}

/** A bench of two trestles and a plank against a face. */
function bench(k: HutTools, f: Face, u: number, y: number, color: number): void {
  k.tag('fitting', `bench|${f.id}|${u}`, 'timber');
  put(k, faceMember(k, f, 1.4, 0.05, 0.32), at(f, u, y + 0.45, 0.3), color, 0.05);
  for (const s of [-1, 1]) put(k, faceBox(k, f, 0.06, 0.43, 0.28), at(f, u + s * 0.55, y + 0.215, 0.3), color, 0.04);
}

/** A chopping block and its axe-split rounds. */
function block(k: HutTools, x: number, y: number, z: number, color: number): void {
  k.tag('fitting', 'block', 'timber');
  put(k, k.cylinder(0.24, 0.26, 0.48, 7), [x, y + 0.24, z], color, 0.06);
}

// ------------------------------------------------------------------------------------------------------------ forms

type Gear = (k: HutTools, h: HutFrame) => void;
interface HutVariant { form: HutForm; gear?: Gear }

const win = (face: FaceId, u: number, w = 0.7, h = 0.6, y = 1.0): HutOpening => ({ face, u, y, w, h, kind: 'window' });
const door = (face: FaceId, u: number, w = 0.9, h = 1.9): HutOpening => ({ face, u, y: 0, w, h, kind: 'door' });

/**
 * The kinds' forms (inside each family's footprint and height, structureKit's lightMeta rows): a kit's entry may change
 * any number and replace the gear.
 */
const HUT_FORMS: Readonly<Record<string, HutVariant>> = {
  // the field hut: a gabled one-room hut, its door and a window a side, a stove pipe, the woodpile against the back
  fieldhut: {
    form: { id: 'fieldhut', w: 3.7, d: 5.0, wallH: 2.15, lift: 0, roof: 'gable', rise: 1.25,
      openings: [door('front', -0.7), win('left', 0.6), win('right', -0.4), win('back', 0.7, 0.6, 0.5)], stove: [0.9, -1.4] },
    gear: (k, h) => {
      woodpile(k, h.face('back'), -0.8, 1.6, 4, h.floor * 0, h.dialect.paint.frame);
      block(k, 1.0, 0, h.form.d / 2 + 0.6, h.dialect.paint.frame);
    },
  },
  // the lean-to: open to the front under its skillion, walled behind and at the sides, the firewood stacked under it
  leanto: {
    form: { id: 'leanto', w: 4.6, d: 2.9, wallH: 1.85, lift: 0, roof: 'skillion', rise: 0.55, open: ['front'], openings: [] },
    gear: (k, h) => {
      const f = h.face('back');
      k.tag('fitting', 'woodpile', 'timber');
      for (let r = 0; r < 5; r++) {
        const n = 18 - r;
        put(k, faceBox(k, f, n * 0.2, 0.2, 0.55), at(f, 0, h.floor + 0.1 + r * 0.17, -0.36), h.dialect.paint.frame, 0.08);
      }
      block(k, 1.3, 0, 1.9, h.dialect.paint.frame);
    },
  },
  // the hunting blind: a boarded box on four legs braced across, a slit under its skillion, its ladder up the side
  huntingblind: {
    form: { id: 'huntingblind', w: 1.7, d: 1.6, wallH: 1.55, lift: 2.4, roof: 'skillion', rise: 0.3,
      openings: [{ face: 'front', u: 0, y: 0.95, w: 1.2, h: 0.24, kind: 'slit' }, door('left', 0, 0.6, 1.2)] },
    gear: (k, h) => {
      const p = h.dialect.paint, y = h.form.lift;
      // the legs' braces crossed on two sides
      for (const sz of [-1, 1]) {
        k.tag('brace', `xbrace|${sz}`, 'timber');
        const len = Math.hypot(h.form.w, y - 0.4), lean = Math.atan2(h.form.w, y - 0.4);
        for (const s of [-1, 1]) {
          const brace = k.box(0.06, len, 0.05);
          brace.rotateZ(s * lean);
          put(k, brace, [0, 0.2 + (y - 0.4) / 2, sz * (h.form.d / 2 + 0.05)], p.frame, 0.04);
        }
      }
      ladder(k, h.face('left'), 0, y, 0.95, p.frame, h.dialect.round);
    },
  },
  // the fisher's shack: a gabled shed with its wide net door, the net hung on its rack behind it, a barrel by the door
  fishershack: {
    form: { id: 'fishershack', w: 4.3, d: 6.2, wallH: 2.25, lift: 0, roof: 'gable', rise: 1.5, battens: 0.65,
      openings: [door('front', 0, 1.5, 2.0), win('left', 1.2), win('right', -0.6)] },
    gear: (k, h) => {
      const p = h.dialect.paint, f = h.face('back'), o = 0.85;
      k.tag('fitting', 'netrack', 'timber');
      for (const u of [-1.3, 1.3]) put(k, k.cylinder(0.05, 0.06, 2.1, 6), at(f, u, 1.05, o), p.frame, 0.04);
      const rail = k.cylinder(0.04, 0.04, 2.8, 5);
      rail.rotateZ(Math.PI / 2);
      put(k, rail, at(f, 0, 2.05, o), p.frame, 0.04);
      // the net hung over the rail, a fold either side of it
      for (const s of [-1, 1]) {
        const net = k.box(2.4, 1.3, 0.03);
        net.rotateX(s * 0.12);
        put(k, net, at(f, 0, 1.38, o + s * 0.09), 0x4f5a4c, 0.08);
      }
      k.tag('fitting', 'barrel', 'timber');
      put(k, k.cylinder(0.27, 0.24, 0.8, 8), [1.3, 0.4, h.form.d / 2 + 0.55], 0x5b4636, 0.06);
    },
  },
  // the sauna: a small gabled cabin, its stove pipe, a small high window, the bench and the woodpile by the door
  saunahut: {
    form: { id: 'saunahut', w: 3.3, d: 3.9, wallH: 2.05, lift: 0, roof: 'gable', rise: 1.05,
      openings: [door('front', -0.6, 0.75, 1.8), win('right', 0.6, 0.55, 0.4, 1.25)], stove: [-0.7, -0.9] },
    gear: (k, h) => {
      const p = h.dialect.paint;
      bench(k, h.face('front'), 0.75, 0, p.frame);
      woodpile(k, h.face('left'), 0.4, 1.8, 4, 0, p.frame);
    },
  },
  // the refuge: a long gabled hut on its plinth, shuttered windows, a bench at the door, the woodpile under the eave
  alpinerefuge: {
    form: { id: 'alpinerefuge', w: 4.9, d: 6.4, wallH: 2.5, lift: 0, roof: 'gable', rise: 2.0,
      openings: [door('front', -1.1, 0.95, 2.0), win('front', 0.9, 0.8, 0.8), win('left', -1.4, 0.8, 0.8), win('left', 1.4, 0.8, 0.8),
        win('right', 0, 0.8, 0.8), win('back', 0, 0.6, 0.6, 1.2)], stove: [1.2, -1.6] },
    gear: (k, h) => {
      const p = h.dialect.paint;
      bench(k, h.face('front'), 0.9, 0, p.frame);
      woodpile(k, h.face('right'), -1.6, 2.2, 5, 0, p.frame);
    },
  },
  // the stilt house: a gabled room on its stilts, the veranda before it on the same stilts, its ladder down the side
  stilthouse: {
    form: { id: 'stilthouse', w: 4.4, d: 5.2, wallH: 2.15, lift: 1.6, roof: 'gable', rise: 1.35, veranda: 1.5, battens: 0.7,
      openings: [door('front', 0.6), win('front', -1.1), win('left', 0.4), win('right', -0.6), win('back', 0)] },
    gear: (k, h) => {
      const f = h.face('right');
      ladder(k, f, -(h.form.d / 2 + (h.form.veranda ?? 0) - 0.55), h.form.lift, 0.9, h.dialect.paint.frame, h.dialect.round);
    },
  },
  // the long house: a long gabled hall, a door at the front and one in the side, a window every bay
  longhouse: {
    form: { id: 'longhouse', w: 6.0, d: 11.6, wallH: 2.35, lift: 0, roof: 'gable', rise: 2.3, battens: 1.0,
      openings: [door('front', 0, 1.1, 2.0), win('left', -2.6), win('right', 2.4), win('back', 1.2)],
      stove: [1.4, -3.0] },
    gear: (k, h) => {
      bench(k, h.face('front'), 1.9, 0, h.dialect.paint.frame);
      woodpile(k, h.face('back'), -1.3, 2.4, 5, 0, h.dialect.paint.frame);
    },
  },
  // ---- the military and industrial kinds (their forms dressed by the kit's dialect)
  // the guard post: a cabin raised on four braced legs, windows on three sides, its door and ladder at the back
  guardpost: {
    form: { id: 'guardpost', w: 2.3, d: 2.3, wallH: 1.95, lift: 1.25, roof: 'skillion', rise: 0.25, eave: 0.22, verge: 0.18, battens: 0.55,
      openings: [win('front', 0, 1.5, 0.75, 1.0), win('left', 0, 1.1, 0.75, 1.0), win('right', 0, 1.1, 0.75, 1.0), door('back', 0.35, 0.7, 1.85)] },
    gear: (k, h) => {
      const p = h.dialect.paint, y = h.form.lift;
      if (y > 0.3) for (const sz of [-1, 1]) {
        k.tag('brace', `xbrace|${sz}`, 'timber');
        const len = Math.hypot(h.form.w, y - 0.3), lean = Math.atan2(h.form.w, y - 0.3);
        for (const s of [-1, 1]) {
          const b = k.box(0.06, len, 0.05);
          b.rotateZ(s * lean);
          put(k, b, [0, 0.15 + (y - 0.3) / 2, sz * (h.form.d / 2 + 0.05)], p.frame, 0.04);
        }
      }
      ladder(k, h.face('back'), 0.35, h.floor, 0.62, p.frame, h.dialect.round, 0.15);
    },
  },
  // the checkpoint booth: glazed on three sides over a sheet dado, its door at the side, the boom across the lane
  checkpointhut: {
    form: { id: 'checkpointhut', w: 3.0, d: 3.8, wallH: 2.3, lift: 0, roof: 'skillion', rise: 0.2, eave: 0.35, verge: 0.25,
      openings: [win('front', 0, 2.0, 1.0, 1.0), win('right', 0.5, 1.4, 1.0, 1.0), door('left', 0.9, 0.85, 2.0), win('left', -0.8, 0.8, 0.8, 1.15)] },
    gear: (k, h) => boom(k, h, 'front', 1.2, 1.55, 2.4, -1),
  },
  // the transformer kiosk: its double steel door, the louvres, the bushings on the roof
  transformershed: {
    form: { id: 'transformershed', w: 4.4, d: 4.0, wallH: 2.7, lift: 0, roof: 'skillion', rise: 0.12, eave: 0.3, verge: 0.3, parapet: 0.25,
      openings: [door('left', 0, 1.6, 2.2), { face: 'front', u: -1.0, y: 1.3, w: 0.9, h: 0.7, kind: 'louvre' },
        { face: 'front', u: 1.0, y: 1.3, w: 0.9, h: 0.7, kind: 'louvre' }, { face: 'back', u: 0, y: 1.3, w: 0.9, h: 0.7, kind: 'louvre' }] },
    gear: bushings,
  },
  // the service garage: its roller door and the side door, windows down the sides, a louvre at the back, drums by it
  servicegarage: {
    form: { id: 'servicegarage', w: 8.4, d: 10.2, wallH: 3.4, lift: 0, roof: 'gable', rise: 1.3, battens: 0.9,
      openings: [{ face: 'front', u: -1.6, y: 0, w: 3.2, h: 3.0, kind: 'garage' }, door('front', 2.7, 0.9, 2.1), win('left', 0, 1.2, 0.8, 1.5),
        win('right', 0, 1.2, 0.8, 1.5), { face: 'back', u: 0, y: 2.0, w: 1.0, h: 0.8, kind: 'louvre' }] },
    gear: (k, h) => drums(k, h.form.w / 2 + 0.5, h.form.d / 2 - 1.0, 3),
  },
  // the motor pool: an open-fronted shed under its skillion, posts along the open side, drums and crates under it
  motorpool: {
    form: { id: 'motorpool', w: 8.6, d: 10.6, wallH: 3.0, lift: 0, roof: 'skillion', rise: 0.6, open: ['front'], openings: [], battens: 0.9 },
    gear: (k, h) => {
      drums(k, -h.form.w / 2 + 1.0, -h.form.d / 2 + 1.0, 4);
      k.tag('fitting', 'crates', 'plank');
      for (const [x, z, y, s] of [[2.6, -3.9, 0, 1], [3.6, -3.7, 0, 0.8], [2.6, -3.9, 0.7, 0.7]] as const) put(k, k.box(0.9 * s, 0.7 * s, 0.9 * s), [x, y + 0.35 * s, z], 0x6a5a40, 0.08);
    },
  },
};

// --------------------------------------------------------------------------------------------------------- dialects

type Tones = readonly [number, number, number];
const dialect = (cladding: Cladding, covering: Covering, footing: Footing, paint: HutPaint,
  more: Partial<Omit<HutDialect, 'cladding' | 'covering' | 'footing' | 'paint'>> = {}): HutDialect =>
  ({ cladding, covering, footing, eave: 0.35, verge: 0.3, course: 0.24, paint, ...more });
const paint = (wall: Tones, trim: number, frame: number, roof: Tones, foot: number, door: number,
  more: Partial<HutPaint> = {}): HutPaint => ({ wall, trim, frame, roof, foot, door, glass: 0x34403f, dark: 0x17140f, ...more });

const SHIFER: Tones = [0x9c9b93, 0x8d8c85, 0xa8a69d];
const TAR_FELT: Tones = [0x2e2d2b, 0x262523, 0x34322f];
const SLATE: Tones = [0x4a4e55, 0x41454b, 0x52575e];
const RUSTED_TIN: Tones = [0x7a5a46, 0x8a6a50, 0x6a4c3c];
const GALVANISED: Tones = [0x8f9699, 0xb0b6b8, 0x7a8083];
const BAMBOO: Tones = [0x9f8a62, 0xb3a074, 0x8f7a56];

/**
 * The kits' dialects (WORKLIST #1's regional forms): what each region builds its huts of. A kit with no hut kinds on its
 * map has none.
 */
export const HUT_DIALECTS: Readonly<Record<string, HutDialect>> = {
  // Verdant's kolkhoz: spruce board-and-batten on fieldstone pads, round poles at the corners, asbestos-cement sheets
  kolkhoz: dialect('batten', 'sheet', 'pads', paint([0x6e604d, 0x7c6c57, 0x5f5242], 0x4f4437, 0x5b4a39, SHIFER, 0x7d7a72, 0x4f5b3f), { round: true }),
  // Frontier's Hessian hamlets: dark-stained boards on a red-sandstone sill wall under tarred felt
  hessian: dialect('batten', 'felt', 'plinth', paint([0x3f3127, 0x47372b, 0x372b22], 0x2a221c, 0x30261e, TAR_FELT, 0x8c5b48, 0x3a2a20), { eave: 0.3, verge: 0.25 }),
  // the Eifel: dark boards on a greywacke sill wall under slates
  eifel: dialect('batten', 'shingle', 'plinth', paint([0x45392f, 0x4e4034, 0x3c3229], 0x2f2821, 0x342b23, SLATE, 0x6b6a64, 0x3d3127), { roofMaterial: 'slate' }),
  // the polders: tarred lap boards, white casings, green doors, on a brick sill under red pantiles
  polder: dialect('lap', 'tile', 'plinth', paint([0x26272a, 0x2c2d31, 0x222326], 0xe4e1d8, 0x2a2b2e, [0x9a4a30, 0xa85636, 0x8a4028], 0x7a3e30, 0x2f5a3c),
    { course: 0.24, footMaterial: 'brick' }),
  // Lorraine, 1944: creosoted boards under tarred felt on a Jaumont-stone sill
  lorrain: dialect('batten', 'felt', 'plinth', paint([0x4a3626, 0x553e2c, 0x3f2e20], 0x3b2c20, 0x35281d, TAR_FELT, 0xbfae84, 0x5a4632)),
  // the Podhale: log courses on stone pads under shingles and their snow
  goral: dialect('log', 'shingle', 'pads', paint([0x6a5440, 0x7a6249, 0x5a4636], 0x4a3a2c, 0x4f3f30, [0x5d5249, 0x6a5e53, 0x524840], 0x7f7d78, 0x4a3a2c),
    { course: 0.27, snow: 0.16, eave: 0.45, verge: 0.4 }),
  // Nordland: red board-and-batten, white casings and barge boards, black felt, on granite pads
  nordland: dialect('batten', 'felt', 'pads', paint([0x8a2e22, 0x93342a, 0x7c2a20], 0xe6e2da, 0x5a2a20, [0x262626, 0x2e2e2e, 0x222222], 0x7a7a76, 0x2e4a3a)),
  // the Serranía de Ronda: limewash over a grey dado, canal tiles, green doors
  andalusian: dialect('render', 'tile', 'sunk', paint([0xe6e1d6, 0xddd7cb, 0xd2ccbf], 0xe6e1d6, 0x6a4a32, [0xa65a36, 0x9a5232, 0xb06440], 0x8a8478, 0x355a3c,
    { dado: 0x8a8478 }), { dado: 0.55, eave: 0.25, verge: 0.15, wallMaterial: 'rubble' }),
  // Dalmatia: bleached boards under 5V tin on a limestone sill, blue doors
  dalmatian: dialect('batten', 'sheet', 'plinth', paint([0x9a958a, 0xa8a397, 0x8c877c], 0x6f6a60, 0x5e5a52, GALVANISED, 0xcfc9b8, 0x4f6a78)),
  // Brittany: granite rubble in a grey render under slates, blue doors and shutters
  breton: dialect('render', 'shingle', 'sunk', paint([0x8d8a83, 0x96938c, 0x84817a], 0x6c6a64, 0x4a3a2c, SLATE, 0x77746e, 0x2f4f6f,
    { dado: 0x77746e }), { shutters: true, dado: 0.3, eave: 0.2, verge: 0.15, wallMaterial: 'stone', roofMaterial: 'slate' }),
  // Georgia, 1941: rough pine boards under rusted tin on posts sunk in the sand, round poles
  longleaf: dialect('batten', 'sheet', 'sunk', paint([0x7a6248, 0x86704f, 0x6c5840], 0x5c4a36, 0x5a4a38, RUSTED_TIN, 0x6a6258, 0x5a4a38), { round: true }),
  // Kohima: bamboo mats on round bamboo under tin
  kohima: dialect('mat', 'sheet', 'sunk', paint(BAMBOO, 0x5d4f37, 0x5d4f37, GALVANISED, 0x6a5a48, 0x3a2e24), { round: true }),
  // the Mekong: weathered planks on round posts under nipa
  mekong: dialect('batten', 'thatch', 'sunk', paint([0x6f6150, 0x8d7c66, 0x5f5344], 0x3c342b, 0x4a3f33, [0x6e6447, 0x8f8460, 0x5a523a], 0x5a4e40, 0x2a2018),
    { round: true, eave: 0.5, verge: 0.4 }),
  // the Jamuna's chars: bamboo mats on round bamboo under galvanised tin
  bengal: dialect('mat', 'sheet', 'sunk', paint(BAMBOO, 0x5d4f37, 0x5d4f37, GALVANISED, 0x7b6650, 0x3a2e24), { round: true, footMaterial: 'earth' }),
  // the Maurienne: larch boards under lauzes and their snow on a stone sill
  savoyard: dialect('batten', 'slab', 'plinth', paint([0x6b5a48, 0x857055, 0x5d4e3e], 0x3d3329, 0x4a3d31, [0x5c5f63, 0x6a6d70, 0x50545a], 0x7b7d7e, 0x3a2f25),
    { snow: 0.14, eave: 0.4, verge: 0.35, roofMaterial: 'stone' }),
  // ---- the kits of the military and industrial kinds
  // Hostomel, 2022: silicate brick under asbestos-cement sheets on a concrete sill
  hostomel: dialect('render', 'sheet', 'plinth', paint([0xcfcac0, 0xc4bfb4, 0xb9b3a8], 0x8a8c88, 0x4a4a46, SHIFER, 0x8e8c86, 0x4a5a4a, { dado: 0xa9a49a }),
    { dado: 0.4, wallMaterial: 'brick', footMaterial: 'concrete' }),
  // Kyushu: steel cubicles in their cream and green panels under galvanised sheet on a concrete sill
  kyushu: dialect('panel', 'sheet', 'plinth', paint([0xc9c7b8, 0xbfbdae, 0xd3d1c3], 0x8a8c8e, 0x5a5c5e, GALVANISED, 0x9a9890, 0x5a6a72),
    { footMaterial: 'concrete', eave: 0.2, verge: 0.15 }),
  // Shanghai, 1937: grey brick under dark tiles
  shanghai: dialect('render', 'tile', 'sunk', paint([0x6e6c68, 0x77756f, 0x65635f], 0x3a3a38, 0x4a3a2a, [0x4a4a48, 0x545452, 0x403f3d], 0x5a5856, 0x5a3a2a,
    { dado: 0x5a5856 }), { dado: 0.35, wallMaterial: 'brick', roofMaterial: 'tile' }),
  // Queenstown: corrugated iron walls and roofs gone to rust on timber posts sunk in the tailings
  queenstown: dialect('sheet', 'sheet', 'sunk', paint([0x8c8478, 0x7d6a5a, 0x948a7e], 0x5a4a3a, 0x5a4a3a, RUSTED_TIN, 0x6a6258, 0x5a4a3a)),
  // the ksar: rammed earth and mud brick with its parapets, the roof of palm beams and earth
  ksar: dialect('render', 'felt', 'sunk', paint([0xb07a4e, 0xa87248, 0xb8845a], 0x6a4a30, 0x5a3e28, [0x8a6a4a, 0x7e6044, 0x96744f], 0x8a6a4a, 0x5a3a28),
    { wallMaterial: 'adobe', roofMaterial: 'earth', eave: 0.1, verge: 0.1 }),
  // Siwa: kershef, salt-crusted mud, its parapets and palm-trunk beams
  siwa: dialect('render', 'felt', 'sunk', paint([0x9a8a74, 0xa39480, 0x8e7f6a], 0x5e5243, 0x5e5243, [0x86786a, 0x7c6f62, 0x908272], 0x8a7c68, 0x3b2f24),
    { wallMaterial: 'adobe', roofMaterial: 'earth', eave: 0.1, verge: 0.1 }),
  // the Chouf, 1982: concrete block under a slab, steel shutters
  chouf: dialect('render', 'felt', 'sunk', paint([0xa8a294, 0x9d978a, 0xb0aa9c], 0x6a6e70, 0x5a5c5c, [0x8a8780, 0x807d76, 0x948f88], 0x8a867c, 0x4a4e52),
    { wallMaterial: 'concrete', roofMaterial: 'concrete', shutters: true, eave: 0.12, verge: 0.12 }),
  // the Saar's works: red brick under galvanised sheet on a concrete sill
  saar: dialect('render', 'sheet', 'plinth', paint([0x7a4232, 0x84483a, 0x6e3a2c], 0x9a9890, 0x4a4440, GALVANISED, 0x8e8c86, 0x3a4a3a, { dado: 0x5e3428 }),
    { dado: 0.5, wallMaterial: 'brick', footMaterial: 'concrete' }),
  // the Ruhr's railway: dark red brick under tarred felt
  ruhr: dialect('render', 'felt', 'plinth', paint([0x6e3a2e, 0x7a4234, 0x643428], 0x8a8a84, 0x3e3632, TAR_FELT, 0x7e7c76, 0x4a3a2a, { dado: 0x56302a }),
    { dado: 0.5, wallMaterial: 'brick', footMaterial: 'concrete' }),
  // Sarajevo: rendered brick under red tiles, a grey dado
  sarajevo: dialect('render', 'tile', 'sunk', paint([0xc8bba2, 0xbfb299, 0xb3a68d], 0x8a8478, 0x5a4a3a, [0x9a4e34, 0xa65838, 0x8c4630], 0x8a8478, 0x5a4a3a,
    { dado: 0x8a8478 }), { dado: 0.5, wallMaterial: 'brick', roofMaterial: 'tile' }),
  // Glen Canyon, 1966: concrete block under a gravelled flat roof
  glencanyon: dialect('render', 'felt', 'sunk', paint([0xb4ad9f, 0xaaa395, 0xbdb6a8], 0x8a8c88, 0x5a5650, [0x7a7a74, 0x86857e, 0x6e6e68], 0x9a958a, 0x5a6670),
    { wallMaterial: 'concrete', roofMaterial: 'concrete', eave: 0.2, verge: 0.2 }),
  // the Navajo trading post: weathered boards on pine poles under rusted tin
  navajo: dialect('batten', 'sheet', 'sunk', paint([0x8a7a64, 0x96866e, 0x7c6c58], 0x5c4c3a, 0x5a4a38, RUSTED_TIN, 0x7a6a58, 0x5a4a38), { round: true }),
  // Franconia, 1984: prefab panels in their beige and grey on a concrete sill under a dark felted flat roof
  franconian: dialect('panel', 'felt', 'plinth', paint([0xc4bfae, 0xb8b3a2, 0xcfcab9], 0x8a8c88, 0x5a5856, [0x3a3a38, 0x444442, 0x323230], 0x8e8c86, 0x6a4a30),
    { footMaterial: 'concrete', eave: 0.15, verge: 0.12 }),
  // the arctic station: red insulated panels under sheet and its snow, on timber sleepers
  arctic: dialect('panel', 'sheet', 'pads', paint([0xa23a2c, 0xa8402f, 0x963428], 0xd8d8d0, 0x3a3a3a, GALVANISED, 0x5a4a3a, 0x3a3a3a),
    { snow: 0.2, eave: 0.25, verge: 0.2 }),
  // the Virgin Lands: whitewashed saman under asbestos-cement sheets, blue casings
  tselina: dialect('render', 'sheet', 'sunk', paint([0xd8d0bc, 0xcfc6b0, 0xc4bba4], 0x6a8a9a, 0x5a4a38, SHIFER, 0x8a7a62, 0x4a6a7a,
    { dado: 0x8a7a62 }), { dado: 0.4, eave: 0.3, verge: 0.25, wallMaterial: 'adobe' }),
};

// ------------------------------------------------------------------------------------------------- the kits' gear

/** The kika: the crossed house-horn boards over a feast-giver's front gable (Kohima's Angami house). */
const kika: Gear = (k, h) => {
  // (the two boards cross over the thatch's ridge and spread up from it, their feet down in the thatch)
  const ridge = h.top + h.form.rise + 0.28, z = h.form.d / 2 + h.dialect.verge - 0.1;
  k.tag('fitting', 'kika', 'timber');
  for (const s of [-1, 1]) {
    const horn = k.mbox(0.16, 2.0, 0.08);
    horn.rotateZ(-s * 0.55);
    put(k, horn, [s * 0.36, ridge + 0.65, z], h.dialect.paint.frame, 0.05);
  }
};

/** A notched log for a ladder, leaning from the ground to the door's sill (the Naga granary's). */
const notchedLog = (face: FaceId, u: number): Gear => (k, h) => {
  const f = h.face(face), y = h.form.lift, out = 0.75, len = Math.hypot(y, out), lean = Math.atan2(out, y);
  k.tag('fitting', 'notchedlog', 'timber');
  const log = k.mbox(0.3, len, 0.26, 0.08);
  if (f.n[0] !== 0) log.rotateZ(f.n[0] * lean); else log.rotateX(-f.n[2] * lean);
  // (its foot's corner on the ground, not in it)
  put(k, log, at(f, u, y / 2 + 0.08, out / 2 + 0.1), h.dialect.paint.frame, 0.05);
  for (let i = 1; i <= 3; i++) {
    const yy = (i / 4) * y;
    put(k, faceBox(k, f, 0.34, 0.05, 0.12), at(f, u, yy, out * (1 - yy / y) + 0.2), h.dialect.paint.frame, 0.04);
  }
};

/** A ladder up to a door on `face` at `u`. */
const ladderTo = (face: FaceId, u: number): Gear => (k, h) =>
  ladder(k, h.face(face), u, h.floor, 0.7, h.dialect.paint.frame, h.dialect.round, face === 'front' ? h.form.veranda ?? 0 : 0.15);

/**
 * The char homestead's earthen plinth above the flood line, wider on the yard side for the veranda: bamboo posts on it,
 * a tin awning off the wall over them, mud steps down at the front.
 */
const bengalVeranda: Gear = (k, h) => {
  const f = h.face('right'), p = h.dialect.paint, y0 = h.floor, top = y0 + 2.3, w = h.form.w, d = h.form.d;
  k.tag('footing', 'earth', 'earth');
  put(k, k.mbox(w + 1.45, y0 + 0.02, d + 1.2, 0.12), [0.43, (y0 - 0.02) / 2 - 0.01, 0], p.foot, 0.06);
  for (const u of [-4.0, -1.35, 1.35, 4.0]) {
    k.tag('post', `vpost|${u}`, 'timber');
    put(k, k.cylinder(0.07, 0.08, top - y0, 6), at(f, u, (y0 + top) / 2, 0.85), p.frame, 0.05);
  }
  k.tag('roof', 'awning', 'metal');
  const awning = k.pitch(k.msym(1.25, 0.05, d - 0.4, 0.006), 'x', 1, 0.2, 'skillion');
  put(k, awning, [w / 2 + 0.6, top + 0.06, 0], p.roof[1], 0.05);
  k.tag('footing', 'steps', 'earth');
  for (let i = 0; i < 3; i++) put(k, k.mbox(1.3, y0 * (1 - i / 3), 0.35), [-0.6, y0 * (1 - i / 3) / 2, d / 2 + 0.6 + 0.3 * i], p.foot, 0.05);
};

/** The glazed water jars by a ladder's foot (the Ca Mau house). */
const jars: Gear = (k, h) => {
  k.tag('fitting', 'jars', 'tile');
  for (const [x, z, s] of [[h.form.w / 2 + 0.55, h.form.d / 2 + 0.5, 1], [h.form.w / 2 + 0.6, h.form.d / 2 - 0.3, 0.82]] as const) {
    put(k, k.cylinder(0.3 * s, 0.22 * s, 0.72 * s, 9), [x, 0.36 * s, z], 0x6e4128, 0.06);
  }
};

/** A masonry chimney stack through the roof at (x, z). */
const chimney = (x: number, z: number): Gear => (k, h) => {
  const y1 = h.roofAt(x) + 0.9;
  k.tag('chimney', 'stack', 'stone');
  put(k, k.mbox(0.55, y1 - h.top + 0.3, 0.55, 0.03), [x, (h.top - 0.3 + y1) / 2, z], h.dialect.paint.foot, 0.06);
  put(k, k.box(0.66, 0.08, 0.66), [x, y1 + 0.04, z], h.dialect.paint.foot, 0.05);
};

const both = (...gs: Array<Gear | undefined>): Gear => (k, h) => { for (const g of gs) g?.(k, h); };

interface RegionalHut {
  dialect?: Partial<Omit<HutDialect, 'paint'>> & { paint?: Partial<HutPaint> };
  form?: Partial<HutForm>;
  /** replaces the kind's gear (`extra` adds to it) */
  gear?: Gear;
  extra?: Gear;
}

/** A masonry guard post: a tower on its solid base, slits on three sides under a parapet, the ladder up to its door. */
const towerPost = (more: Partial<HutForm> = {}): RegionalHut => ({
  dialect: { footing: 'plinth' },
  form: { lift: 0, plinth: 1.2, rise: 0.12, parapet: 0.5, openings: [{ face: 'front', u: 0, y: 1.0, w: 1.1, h: 0.28, kind: 'slit' },
    { face: 'left', u: 0, y: 1.0, w: 0.8, h: 0.28, kind: 'slit' }, { face: 'right', u: 0, y: 1.0, w: 0.8, h: 0.28, kind: 'slit' },
    door('back', 0.35, 0.7, 1.75)], ...more },
});
/** A booth on the ground (a toll house, a kiosk): the guard post's cabin without its legs, its door at the front. */
const groundPost = (more: Partial<HutForm> = {}): RegionalHut => ({
  form: { lift: 0, openings: [door('front', -0.5, 0.8, 1.95), win('front', 0.55, 0.7, 0.8, 1.05), win('left', 0, 1.1, 0.8, 1.05),
    win('right', 0, 1.1, 0.8, 1.05)], ...more },
  gear: () => {},
});
/** A flat-roofed kind: its skillion barely falling, a parapet over masonry. */
const flat = (more: Partial<HutForm> = {}): Partial<HutForm> => ({ roof: 'skillion', rise: 0.3, parapet: 0.4, battens: 0.9, ...more });
/** Sandbags round a kind's foot: before its front and along its sides. */
const bagged: Gear = (k, h) => {
  const x = h.form.w / 2 + 0.35, z = h.form.d / 2 + 0.35;
  sandbags(k, -x, z, x, z, 3);
  sandbags(k, -x, -z + 0.3, -x, z - 0.3, 2);
};


/**
 * The kits' huts: kit -> family -> its regional form (the kind's form and gear in the kit's dialect, with the numbers
 * and gear the region changes). structureKit's REGIONAL_DESTRUCTIBLE_TYPES builds each through buildRegionalHut.
 */
export const REGIONAL_HUTS: Readonly<Record<string, Readonly<Record<string, RegionalHut>>>> = {
  kolkhoz: { fieldhut: {}, leanto: {}, huntingblind: {} },
  lorrain: { fieldhut: {}, leanto: {}, longhouse: {} },
  hessian: { fieldhut: {}, huntingblind: {}, checkpointhut: {} },
  eifel: {
    fieldhut: {}, huntingblind: {},
    // (the substation and the depot's garage in greywacke under slates)
    transformershed: { dialect: { cladding: 'render', wallMaterial: 'stone', paint: { wall: [0x6b6a64, 0x74726b, 0x625f59], dado: 0x55534e } } },
    servicegarage: { dialect: { cladding: 'render', wallMaterial: 'stone', paint: { wall: [0x6b6a64, 0x74726b, 0x625f59], dado: 0x55534e } } },
  },
  polder: {
    fieldhut: {}, fishershack: {}, huntingblind: {},
    // the transformer house in brick under its pantiles
    transformershed: { dialect: { cladding: 'render', wallMaterial: 'brick', paint: { wall: [0x7a3e30, 0x84463a, 0x70382c], dado: 0x5c2e24 } },
      form: { roof: 'gable', rise: 1.0, parapet: 0 } },
  },
  dalmatian: { fieldhut: {}, fishershack: {}, guardpost: {}, checkpointhut: {} },
  nordland: {
    fishershack: {}, saunahut: {},
    alpinerefuge: { dialect: { footing: 'plinth' } },
  },
  goral: {
    saunahut: {},
    alpinerefuge: { dialect: { footing: 'plinth', course: 0.3 }, form: { wallH: 2.3, battens: 0.8, openings: [door('front', -1.1, 0.95, 2.0),
      win('left', 0, 0.8, 0.8), win('right', 0, 0.8, 0.8)] } },
    // (the blind and the lean-to boarded: a log box on legs is a granary, not a hide)
    huntingblind: { dialect: { cladding: 'batten', snow: 0.1 } },
    leanto: { dialect: { cladding: 'batten' } },
  },
  savoyard: {
    saunahut: {},
    // the mazot: larch logs on four staddle stones, its door and step, lauzes under the snow
    huntingblind: {
      dialect: { cladding: 'log', footing: 'staddle', course: 0.25 },
      form: { w: 2.6, d: 2.2, wallH: 1.95, lift: 0.6, roof: 'gable', rise: 0.85,
        openings: [door('front', 0, 0.8, 1.4)] },
      gear: (k, h) => { k.tag('footing', 'step', 'stone'); put(k, k.mbox(0.9, h.form.lift - 0.1, 0.5), [0, (h.form.lift - 0.1) / 2, h.form.d / 2 + 0.3], h.dialect.paint.foot, 0.06); },
    },
  },
  andalusian: {
    // the bridgehead's toll house (caseta de consumos) on the ground under its tiles
    guardpost: groundPost({ roof: 'gable', rise: 0.7 }),
    // the farm's tool house (caseta de aperos): a low tile gable, its wide door, a small high window
    fieldhut: { form: { w: 3.8, d: 5.6, wallH: 2.4, rise: 1.0, stove: undefined,
      openings: [door('front', 0, 1.1, 1.9), win('right', -1.2, 0.55, 0.55, 1.4)] }, gear: (k, h) => bench(k, h.face('back'), 0, 0, h.dialect.paint.foot) },
    leanto: {},
    // the puesto: a whitewashed hide on the ground, a slit to the front and a low door behind
    huntingblind: { form: { w: 1.9, d: 1.8, wallH: 1.45, lift: 0, rise: 0.3,
      openings: [{ face: 'front', u: 0, y: 0.9, w: 1.2, h: 0.22, kind: 'slit' }, door('back', 0, 0.7, 1.3)] }, gear: () => {} },
  },
  breton: {
    // the customs men's granite hut under its slates
    guardpost: groundPost({ roof: 'gable', rise: 1.0, w: 2.4, d: 2.6 }),
    fishershack: {},
    // the bread-oven house: a small granite outbuilding, its stack on the gable
    saunahut: { form: { stove: undefined }, extra: chimney(0, -1.6) },
    leanto: {},
  },
  hostomel: { motorpool: {}, guardpost: { ...towerPost(), extra: bagged } },
  kyushu: { transformershed: {}, motorpool: {}, guardpost: {}, servicegarage: { form: flat() } },
  shanghai: { motorpool: {}, transformershed: { form: { roof: 'gable', rise: 0.9, parapet: 0 } }, checkpointhut: {}, servicegarage: {} },
  queenstown: { guardpost: {}, motorpool: {}, servicegarage: {} },
  ksar: { guardpost: towerPost() },
  // (Siwa's toll post under its palm-rib shade)
  siwa: { guardpost: towerPost(), checkpointhut: { form: { parapet: 0.35, rise: 0.1 }, extra: (k, h) => shade(k, h, 'front', -0.2, 2.4, 0.95, 2.25) } },
  chouf: {
    guardpost: { ...towerPost(), extra: bagged },
    checkpointhut: { form: { parapet: 0.35, rise: 0.1 }, extra: bagged },
    transformershed: {},
  },
  saar: { transformershed: {}, motorpool: {}, checkpointhut: {}, servicegarage: {} },
  ruhr: { transformershed: {}, motorpool: {}, guardpost: groundPost({ roof: 'gable', rise: 0.8 }) },
  sarajevo: { guardpost: { ...towerPost(), extra: bagged }, transformershed: {}, motorpool: {}, servicegarage: {} },
  glencanyon: { motorpool: {}, transformershed: {}, guardpost: groundPost({ parapet: 0.3, rise: 0.1 }), servicegarage: { form: flat() } },
  navajo: { motorpool: {}, checkpointhut: {} },
  franconian: { guardpost: groundPost(), checkpointhut: {}, transformershed: {}, motorpool: {}, servicegarage: { form: flat() } },
  arctic: { motorpool: {}, servicegarage: {} },
  longleaf: { leanto: {}, huntingblind: { form: { lift: 2.8 } }, fishershack: {}, stilthouse: { form: { lift: 1.2, veranda: 1.6 } } },
  tselina: { longhouse: { form: { stove: undefined }, extra: chimney(1.4, -3.0) }, motorpool: {} },
  // the Jamuna's chars
  bengal: {
    // the char homestead: galvanised sheet walls on its earthen plinth above the flood line, the yard-side veranda
    longhouse: {
      dialect: { cladding: 'sheet', footing: 'plinth', paint: { wall: GALVANISED } },
      form: { w: 5.0, d: 10.6, wallH: 2.5, rise: 1.5, plinth: 0.9, stove: undefined,
        openings: [door('right', 0, 1.0, 1.95), win('right', -3.2, 0.9, 0.78, 1.0), win('right', 3.2, 0.9, 0.78, 1.0), win('left', 0, 0.9, 0.7, 1.1)] },
      extra: bengalVeranda,
    },
    // the flood-season house on bamboo stilts, its ladder up to the door
    stilthouse: { form: { w: 4.6, d: 6.2, wallH: 2.3, lift: 1.7, rise: 1.35, veranda: 0,
      openings: [door('right', 1.4, 0.85, 1.8), win('right', -1.4, 0.8, 0.7, 0.9), win('front', 0, 0.8, 0.7)] }, gear: ladderTo('right', 1.4) },
    fishershack: { form: { w: 4.2, d: 5.6, wallH: 2.0, rise: 0.9 } },
  },
  kohima: {
    // the Angami house: low plank walls under a deep thatch swept nearly to the ground, the kika over the front gable
    longhouse: {
      dialect: { cladding: 'batten', covering: 'thatch', eave: 0.7, verge: 0.5, paint: { wall: [0x5b4735, 0x856b51, 0x4f3d2d], frame: 0x2f251b,
        roof: [0x7c6b4d, 0x9f8c65, 0x3e3327] } },
      form: { w: 5.2, d: 11.2, wallH: 1.8, rise: 2.9, stove: undefined, openings: [door('front', 0.7, 0.9, 1.5)] },
      gear: kika,
    },
    // the Naga granary on its legs: a bamboo-mat store under a steep thatch, its notched-log ladder
    stilthouse: {
      dialect: { covering: 'thatch', eave: 0.6, paint: { roof: [0x7c6b4d, 0x9f8c65, 0x3e3327] } },
      form: { w: 4.2, d: 5.6, wallH: 1.9, lift: 1.4, rise: 2.3, veranda: 0, openings: [door('front', 0.8, 0.8, 1.4)] },
      gear: notchedLog('front', 0.8),
    },
  },
  mekong: {
    // the long house on its low deck over posts, under nipa, its porch before the door
    longhouse: { form: { w: 5.6, d: 10.0, wallH: 2.4, lift: 0.9, rise: 2.2, veranda: 1.4, stove: undefined,
      openings: [door('front', 0.6, 0.9, 1.9), win('left', -1.5), win('right', 2.0)] },
      gear: (k, h) => ladderTo('right', -(h.form.d / 2 + (h.form.veranda ?? 0) / 2))(k, h) },
    // the shrimp-pond guard hut on tall stilts, its ladder down to the bund
    fishershack: { form: { w: 3.6, d: 4.6, wallH: 1.8, lift: 1.4, rise: 1.0, openings: [door('right', 0.8, 0.8, 1.6), win('front', 0)] },
      gear: ladderTo('right', 0.8) },
    // the Ca Mau house on stilts under rusted iron, its veranda on the canal side, the jars by the ladder's foot
    stilthouse: { dialect: { covering: 'sheet', paint: { roof: RUSTED_TIN } }, form: { w: 4.8, d: 5.0, wallH: 2.45, lift: 1.7, rise: 1.05, veranda: 1.6 },
      extra: jars },
  },
};

/**
 * The kits whose huts wait on their kit (item 5's kitless kits, item/looks-tselina, -lorraine, -goral and -nordland): the
 * regional table registers a kit's huts once its architecture id exists. The integration that lands a kit drops it here.
 */
export const HUT_KITS_PENDING: ReadonlySet<string> = new Set(['lorrain', 'goral', 'tselina', 'nordland']);

/** Build `kind` in `kit`'s regional form into `k` (its parts and stream). */
export function buildRegionalHut(k: HutTools, kit: string, kind: string): HutFrame {
  const base = HUT_DIALECTS[kit], spec = REGIONAL_HUTS[kit]?.[kind], kf = HUT_FORMS[kind];
  if (!base || !spec || !kf) throw new Error(`hutKit: no ${kind} in ${kit}`);
  const d: HutDialect = { ...base, ...spec.dialect, paint: { ...base.paint, ...spec.dialect?.paint } } as HutDialect;
  const form: HutForm = { ...kf.form, ...spec.form };
  const h = buildHut(k, form, d);
  both(spec.gear ?? kf.gear, spec.extra)(k, h);
  return h;
}
