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
  /** markWorldBeacon: a lamp that burns at night, manned or not (a mast's beacon) */
  beacon<T extends THREE.BufferGeometry>(geo: T): T;
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
  /** (dome-detail-275) what holds a tin roof down: bamboo poles laid across it */
  weights?: 'poles';
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

/** (the triage round, 2026-10-16) A part drawn as dressing: no collision part (structureKit's merge, noCollisionVertices). */
function dressing<T extends THREE.BufferGeometry>(geo: T): T { geo.userData.noCollision = true; return geo; }

/** How far a sunk post goes into the ground (the families' height band starts 5 cm under it). */
const SUNK = 0.04;

/** How far a dialect's cladding stands out of its face's plane: an opening's casing sits on it, a pipe clips to it (a
 *  corrugated sheet's crimps to 4 cm, dome-detail-275). */
const skin = (d: HutDialect): number => (d.cladding === 'render' ? 0 : d.cladding === 'log' ? d.course * 0.47 : d.cladding === 'panel' ? 0.06
  : d.cladding === 'sheet' ? 0.04 : 0.03);

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
  // (the triage round, 2026-10-16: a thin cladding member the length of a whole wall — 2.5 cm of boards over 10 m — is
  // a slice the collision's certification grid cannot see, 0 on the Navajo motor pool's wall band) a thin covering is
  // laid in lengths of at most 4 m, butted, as boards, mats and laps are
  if (lu > 4.0 && (d.cladding === 'batten' || d.cladding === 'lap' || d.cladding === 'mat')) {
    const n = Math.ceil(lu / 4.0), run = lu / n;
    for (let q = 0; q < n; q++) cladPiece(k, d, f, u0 + q * run, u0 + (q + 1) * run, y0, y1, i, step);
    return;
  }
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
        // (the triage round: the rails are dressing on the mat, which collides)
        put(k, dressing(rail), at(f, uc, yy, 0.055), p.frame, 0.05);
      }
      return;
    }
    case 'sheet': {
      // sheet runs about 1.2 m wide, each lapping the one before it a sheet's thickness out
      // (dome-detail-275: each run corrugated as the roof's sheets are, three V crimps a sheet standing up its height, so
      // a tin wall reads ribbed and not as flat panels: the crimps dressing over the piece's one flat backing, which
      // collides, so a wall cut round many windows stays few collision solids)
      const runs = Math.max(1, Math.round(lu / 1.2)), rw = lu / runs;
      for (let r = 0; r < runs; r++) {
        const sw = rw + 0.04, o = (r % 2) * 0.008, sec: Array<[number, number]> = [];
        if (r === 0) put(k, faceMember(k, f, lu + 0.04, h, 0.012), at(f, uc, (y0 + y1) / 2, 0.008), tone(p.wall, i), 0.05);
        for (let v = 0; v <= 6; v++) sec.push([-sw / 2 + v * sw / 6, 0.016 + (v % 2) * 0.024]);
        sec.push([sw / 2, 0.01], [-sw / 2, 0.01]);
        // the section across the face (x) and out of it (y), extruded up (z): stood up and turned onto the face
        const sheet = prism(sec, h, 0.6).rotateX(Math.PI / 2).rotateY(Math.PI / 2);
        put(k, dressing(onto(sheet, f)), at(f, u0 + (r + 0.5) * rw, (y0 + y1) / 2, o), tone(p.wall, i + r), 0.05);
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
  // (dome-detail-275) on a sheet wall a window's casing, sill, glass, bars and shutters are dressing on the wall's
  // backing, which collides: a long tin wall cut for a window a bay stays a wall its collision can answer
  const trim = <T extends THREE.BufferGeometry>(g: T): T => (d.cladding === 'sheet' && o.kind !== 'door' ? dressing(g) : g);
  // (a door is a piece of its own; a window goes with its stretch of wall)
  if (o.kind === 'door') k.tag('door', `door|${f.id}|${o.u}`, 'plank');
  else k.tag('wall', d.cladding === 'log' ? `wall|${f.id}|${Math.floor((o.y + o.h / 2) / d.course / 3)}` : d.cladding === 'render' ? `wall|${f.id}` : wallGroup(f, o.u), wallMat(d));
  if (!mass || o.kind !== 'door') {
    // the casing: jambs, head (and a window's sill below)
    // (a door's jambs stand on its threshold, a window's run past its sill)
    const jy0 = y0 - (o.y > 0.05 ? cw : 0), jy1 = y0 + o.h + cw;
    for (const s of [-1, 1]) put(k, trim(faceBox(k, f, cw, jy1 - jy0, ct)), at(f, o.u + s * (o.w / 2 + cw / 2), (jy0 + jy1) / 2, out + ct / 2), p.trim, 0.03);
    put(k, trim(faceMember(k, f, o.w + cw * 2 + 0.06, cw, ct + 0.02)), at(f, o.u, y0 + o.h + cw / 2, out + ct / 2 + 0.01), p.trim, 0.03);
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
    // (dome-detail-275) the shutter's coil box over the head, proud of the wall, and the kick plate's bottom rail
    put(k, faceMember(k, f, o.w + 0.24, 0.38, 0.36, 0.02), at(f, o.u, y0 + o.h + 0.2, out + 0.17), 0x4a4d50, 0.03);
    put(k, dressing(faceBox(k, f, o.w - 0.06, 0.12, 0.05)), at(f, o.u, y0 + 0.07, back + 0.04), 0x2e3032, 0.03);
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
  put(k, trim(faceMember(k, f, o.w + 0.22, 0.05, 0.12)), at(f, o.u, y0 - 0.025, out + 0.04), p.trim, 0.03);
  const back = mass ? -0.1 : -0.02;
  if (o.kind === 'slit') {
    put(k, faceBox(k, f, o.w, o.h, 0.02), at(f, o.u, yc, mass ? back - 0.1 : -0.02), p.dark, 0.02);
    return;
  }
  put(k, trim(k.aperture(faceBox(k, f, o.w - 0.04, o.h - 0.04, 0.02), f.n)), at(f, o.u, yc, back), p.glass, 0.03);
  put(k, trim(faceBox(k, f, 0.035, o.h - 0.04, 0.03)), at(f, o.u, yc, back + 0.02), p.trim, 0.02);
  if (o.h > 0.65) put(k, trim(faceBox(k, f, o.w - 0.04, 0.035, 0.03)), at(f, o.u, y0 + o.h * 0.55, back + 0.02), p.trim, 0.02);
  if (d.shutters) {
    // the two leaves open flat against the wall beside the casing
    for (const s of [-1, 1]) {
      put(k, trim(faceMember(k, f, o.w / 2, o.h, 0.03)), at(f, o.u + s * (o.w * 0.75 + cw + 0.02), yc, out + 0.05), p.door, 0.05);
      put(k, trim(faceBox(k, f, o.w / 2 - 0.06, 0.06, 0.02)), at(f, o.u + s * (o.w * 0.75 + cw + 0.02), yc, out + 0.075), p.door, 0.04);
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
            // (the triage round, 2026-10-16: the crimps' sloped slices merged into parts that overran them, 84-88 on the
            // motor pools' top bands) a sheet collides as its hull, the slope's plan between its eave and its high edge
            sheet.userData.collisionHull = true;
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
          // (the triage round: the eave's second coat is dressing over the main coat, which collides)
          k.put(dressing(across(onSlope(slopeGeo(k, sl, sl.len * 0.36, t * 0.8, sw + 0.05, 'mbox', 0.08), sl, sl.len / 2 - sl.len * 0.18, lift + t + t * 0.25), sl, cm)), tone1, 0.08);
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
      // (the triage round, 2026-10-16: the trim's 3 cm slices alone made a band the collision could not certify — 0 on the
      // motor pools: the fascia and the barge boards are dressing, drawn and no collision part; the covering collides)
      k.put(dressing(across(onSlope(slopeGeo(k, sl, 0.03, 0.17, sw + 0.01, 'box'), sl, sl.len / 2 - 0.015, -0.02), sl, cm)), p.trim, 0.03);
      // the barge board up the rake at the section's end of the roof (a skillion's verge)
      for (const e of [-1, 1]) {
        if ((e < 0 && j !== 0) || (e > 0 && j !== nsec - 1)) continue;
        const board = sl.axis === 'x' ? k.mbox(sl.len + 0.04, 0.18, 0.03) : k.mbox(0.03, 0.18, sl.len + 0.04);
        k.put(dressing(across(onSlope(board, sl, 0, 0.02), sl, e * (sl.across / 2 + (sl.axis === 'x' ? 0.015 : 0)))), p.trim, 0.03);
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
    } else if (d.covering === 'sheet') {
      // (dome-detail-275) the ridge cap: a bent flashing over the two slopes' top sheets, each leg crossing the ridge
      k.tag('roof', 'ridgecap', 'metal');
      for (const sl of sls) {
        const leg = slopeGeo(k, sl, 0.3, 0.014, sl.across + 0.02, 'box');
        k.put(dressing(onSlope(leg, sl, -sl.len / 2 + 0.12, ridgeLift + 0.003)), p.roof[2], 0.03);
      }
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
      } else if (d.cladding === 'sheet') {
        // (dome-detail-275) a sheet gable's crimps standing up it at the walls' pitch, dressing on its sheet
        for (let g2 = -run + 0.2; g2 < run - 0.1; g2 += 0.4) {
          const hh = rise * (1 - Math.abs(g2) / run) - 0.04;
          if (hh < 0.15) continue;
          put(k, dressing(faceBox(k, f, 0.04, hh, 0.024)), at(f, g2, top + hh / 2, o + 0.026), tone(p.wall, Math.round(g2 / 1.2)), 0.04);
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
  const depth = skin(d);
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
function drums(k: HutTools, x: number, z: number, n: number, color = 0x5a3a2a, y = 0): void {
  k.tag('fitting', `drums|${x}|${z}`, 'metal');
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = i ? 0.62 : 0;
    put(k, k.cylinder(0.29, 0.29, 0.88, 8), [x + Math.cos(a) * r, y + 0.44, z + Math.sin(a) * r], i % 2 ? 0x3f4a3a : color, 0.08);
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

// ------------------------------------------------------------------------------------- the yards' gear (dome-detail-275)

type Gear = (k: HutTools, h: HutFrame) => void;

/** Gears built one after the other (dome-detail-275: here, so the forms' table can use it). */
const both = (...gs: Array<Gear | undefined>): Gear => (k, h) => { for (const g of gs) g?.(k, h); };

/** A yard's cast concrete (floors, aprons, lintels, wheel stops). */
const CONCRETE = 0x9c988e;

/** A build's parapet over its roof (buildHut's rule: a masonry skillion's). */
const parapetOf = (h: HutFrame): number => (h.dialect.cladding === 'render' && h.form.roof === 'skillion' ? h.form.parapet ?? 0 : 0);

/** A wall's head at (x, z) on face `id`: under a gable its plates, under a skillion the roof's plane, a parapet's coping. */
function wallHead(h: HutFrame, id: FaceId, x: number, z: number): number {
  const { form, dialect: d, top } = h, par = parapetOf(h);
  if (par) return top + form.rise + par;
  if (form.roof === 'gable') return top;
  return id === 'back' ? top + form.rise : roofTop(form, d, top, x, z);
}

/** (dome-detail-275) A masonry hall's pilasters: a pier proud of each named face at its frame's bay lines and corners,
 *  from the ground to the wall's head, so a long wall reads in bays and not as one slab (dressing: the wall collides). */
function pilasters(k: HutTools, h: HutFrame, ids: readonly FaceId[], bay: number): void {
  const d = h.dialect;
  if (d.cladding !== 'render') return;
  for (const id of ids) {
    const f = h.face(id), n = Math.max(1, Math.round((2 * f.half) / bay));
    for (let i = 0; i <= n; i++) {
      const u = Math.max(-f.half + 0.22, Math.min(f.half - 0.22, -f.half + (i * 2 * f.half) / n));
      const [x, , z] = at(f, u, 0, 0), y1 = wallHead(h, id, x, z) - 0.06;
      k.tag('wall', wallGroup(f, u), wallMat(d));
      put(k, dressing(faceBox(k, f, 0.44, y1, 0.12)), at(f, u, y1 / 2, 0.05), tone(d.paint.wall, i + 1), 0.03);
    }
  }
}

/** (dome-detail-275) A concrete apron before a face's opening, `out` metres deep, ramped up to a plinth's floor. */
function apron(k: HutTools, h: HutFrame, face: FaceId, u: number, len: number, out: number): void {
  const f = h.face(face), y0 = Math.max(0.06, h.floor + 0.02);
  k.tag('slab', `apron|${face}`, 'concrete');
  const sec: Array<[number, number]> = [[-0.05, 0], [out, 0], [out, 0.03], [-0.05, y0]];
  put(k, dressing(onto(prism(sec, len, 0.5), f)), at(f, u, 0, 0), CONCRETE, 0.04);
}

/**
 * (dome-detail-275) The rainwater goods, dressing: a gutter along each eave hung off its fascia, a swan neck from each
 * end back to the side wall and the downpipe down it to the ground; over a parapet, its scuppers through the wall into
 * hoppers and their pipes.
 */
function rainwater(k: HutTools, h: HutFrame, color = 0x55595c): void {
  const { form, dialect: d, top } = h, w = form.w, dd = form.d, sk = skin(d) + 0.06;
  k.tag('fitting', 'rainwater', 'metal');
  const pipe = (x: number, z: number, y1: number) => put(k, dressing(k.cylinder(0.05, 0.05, y1, 6)), [x, y1 / 2, z], color, 0.03);
  const neck = (a: V3, b: V3) => k.put(dressing(k.mbeam(a, b, 0.09, 0.09)), color, 0.03);
  if (parapetOf(h)) {
    for (const id of ['left', 'right'] as const) for (const e of [-1, 1]) {
      const f = h.face(id), u = e * (f.half - 0.6);
      const [x, , z] = at(f, u, 0, 0), ys = roofTop(form, d, top, x, z) + 0.1;
      put(k, dressing(faceBox(k, f, 0.14, 0.1, 0.34)), at(f, u, ys, 0.12), color, 0.03);
      put(k, dressing(faceMember(k, f, 0.34, 0.3, 0.26, 0.02)), at(f, u, ys - 0.17, sk + 0.07), color, 0.03);
      const [px, , pz] = at(f, u, 0, sk);
      pipe(px, pz, ys - 0.3);
    }
    return;
  }
  if (d.eave < 0.1) return;
  if (form.roof === 'gable') {
    // the eaves along the long sides, the pipes down the side walls near the corners
    const ye = top - form.rise * d.eave / (w / 2);
    for (const s of [-1, 1]) {
      const gx = s * (w / 2 + d.eave + 0.05), px = s * (w / 2 + sk);
      const gutter = k.cylinder(0.075, 0.075, dd + 2 * d.verge, 6);
      gutter.rotateX(Math.PI / 2);
      put(k, dressing(gutter), [gx, ye - 0.06, 0], color, 0.03);
      for (const e of [-1, 1]) {
        const pz = e * (dd / 2 - 0.3);
        neck([gx, ye - 0.1, pz], [px, ye - 0.5, pz]);
        pipe(px, pz, ye - 0.46);
      }
    }
    return;
  }
  // a skillion's one eave along the front, its pipes down the side walls by the front corners
  const ze = dd / 2 + d.eave, ye = roofTop(form, d, top, 0, ze), gz = ze + 0.05;
  const gutter = k.cylinder(0.075, 0.075, w + 2 * d.verge, 6);
  gutter.rotateZ(Math.PI / 2);
  put(k, dressing(gutter), [0, ye - 0.06, gz], color, 0.03);
  for (const s of [-1, 1]) {
    const px = s * (w / 2 + sk), pz = dd / 2 - 0.25;
    neck([px, ye - 0.1, gz], [px, ye - 0.5, pz]);
    pipe(px, pz, ye - 0.46);
  }
}

/** (dome-detail-275) A layer for parts on a roof's covering: `lay(geo, x, z, up, colour)` tips a part built level (its
 *  fall along z on a skillion, along x on a gable's slope) to the roof's plane at (x, z), `up` metres over the covering's
 *  top, as dressing; `part(along, t, across)` builds such a box. */
function roofLayer(k: HutTools, h: HutFrame) {
  const { form, dialect: d, top } = h, gable = form.roof === 'gable', cov = d.covering;
  // the covering's top over the rafters (buildHut's roof: under snow its deck and the snow)
  const lift = d.snow ? 0.025 + d.snow : cov === 'tile' ? 0.14 : cov === 'thatch' ? 0.42 : cov === 'slab' ? 0.085 : cov === 'shingle' ? 0.06 : 0.05;
  const ang = gable ? Math.atan2(form.rise, form.w / 2) : Math.atan2(form.rise, form.d);
  const part = (al: number, t: number, ac: number) => (gable ? k.box(al, t, ac) : k.box(ac, t, al));
  const lay = (g: THREE.BufferGeometry, x: number, z: number, up: number, color: number, jitter = 0.04) => {
    if (gable) g.rotateZ(-(Math.sign(x) || 1) * ang); else g.rotateX(ang);
    k.put(dressing(g.translate(x, roofTop(form, d, top, x, z) + (lift + up) / Math.cos(ang), z)), color, jitter);
  };
  /** a point on slope `s` (a skillion's one), `f` of the way down from its high edge to the walls' line, `c` across it */
  const pos = (s: number, f: number, c: number): [number, number] => (gable ? [s * f * form.w / 2, c] : [c, -form.d / 2 + f * form.d]);
  return { lift, ang, gable, part, lay, pos };
}

/**
 * (dome-detail-275) A shed roof in relief, dressing on its covering: a sheet roof's end laps across the fall, its
 * translucent roof-lights a bay, a replaced sheet in another shade and the rust (or lichen on asbestos) run down from the
 * laps; a felt roof's glazed lights on their curbs and its patches; a ridge ventilator along a gable, a level monitor
 * across a skillion, deep verge boards; on a parapeted flat roof its cowl vents, stack and hatch.
 */
function roofRelief(k: HutTools, h: HutFrame): void {
  const { form, dialect: d } = h, p = d.paint, w = form.w, dd = form.d, par = parapetOf(h), cov = d.covering;
  const { lift, gable, part, lay, pos } = roofLayer(k, h);
  const sides = gable ? [-1, 1] : [1];
  const acrossLen = gable ? dd + 2 * d.verge : w + 2 * d.verge, fallLen = gable ? w / 2 : dd;
  const r = (p.roof[0] >> 16) & 255, b = p.roof[0] & 255, rusty = r > b + 24, shifer = r >= b && r - b < 12 && r > 0x80;
  const open = !d.snow && (cov === 'sheet' || cov === 'felt');
  k.tag('roof', 'relief', cov === 'felt' ? 'plank' : 'metal');
  if (open && cov === 'sheet') {
    // the end laps across the fall, a sheet's length apart
    for (const s of sides) for (const f of [1 / 3, 2 / 3]) {
      const [x, z] = pos(s, f, 0);
      lay(part(0.09, 0.02, acrossLen - 0.04), x, z, 0.0, p.roof[2], 0.03);
    }
    // the rust (or the lichen on asbestos cement) run down from the laps
    for (const s of sides) for (let i = 0; i < 6; i++) {
      const [x, z] = pos(s, (i % 2 ? 1 / 3 : 2 / 3) + 0.09, -acrossLen / 2 + (i + 0.5 + 0.17 * (i % 3)) * acrossLen / 6.5);
      lay(part(0.18 * fallLen, 0.006, 0.12 + 0.05 * (i % 2)), x, z, 0.012, shifer ? 0x55534a : 0x7a4a30, 0.08);
    }
  }
  if (open) {
    // the roof-lights: translucent sheets in a sheet roof, glazed lights on curbs in a felt one, one a bay
    const n = gable ? Math.max(1, Math.round(dd / 2.5)) : Math.max(1, Math.round(w / 2.4));
    const L = gable ? fallLen * 0.38 : dd * 0.26, W = gable ? 0.8 : 0.85, f0 = gable ? 0.5 : 0.62;
    for (const s of sides) for (let i = 0; i < n; i++) {
      const span = gable ? dd : w, [x, z] = pos(s, f0, -span / 2 + (i + 0.5) * span / n);
      if (cov === 'sheet') lay(part(L, 0.016, W), x, z, 0.0, 0xcdd3c2, 0.03);
      else {
        lay(part(L + 0.12, 0.14, W + 0.12), x, z, 0.05, p.trim, 0.03);
        lay(part(L, 0.03, W), x, z, 0.13, 0x8fa2a6, 0.02);
      }
    }
    // a replaced sheet (or a patch of new felt) in another shade
    for (const [s, f, c] of [[sides[0], 0.22, -0.28], [sides[sides.length - 1], 0.84, 0.2]] as const) {
      const [x, z] = pos(s, f, c * acrossLen);
      lay(part(cov === 'sheet' ? Math.min(2.2, fallLen * 0.3) : 1.5, 0.012, cov === 'sheet' ? 1.2 : 1.3), x, z, 0.006,
        cov === 'felt' ? 0x1b1a19 : rusty ? 0xa9aeb0 : shifer ? 0xbdbcb2 : 0x8a5f42, 0.04);
    }
  }
  if (gable) {
    // the ridge ventilator along the ridge: its base astride the two slopes, louvres either side, the cap over them
    const y = h.top + form.rise + lift, len = dd * 0.55;
    k.put(dressing(k.box(0.5, 0.3, len).translate(0, y + 0.05, 0)), p.roof[1], 0.03);
    k.put(dressing(k.box(0.53, 0.12, len - 0.1).translate(0, y + 0.1, 0)), p.dark, 0.02);
    k.put(dressing(k.box(0.82, 0.05, len + 0.1).translate(0, y + 0.225, 0)), p.roof[2], 0.03);
    return;
  }
  if (par) {
    // a flat roof's cowl vents, its soil stack and the roof hatch
    k.tag('fitting', 'roofvents', 'metal');
    for (const [x, z] of [[-2.0, 1.5], [2.6, 2.4]] as const) {
      const y = roofTop(form, d, h.top, x, z) + lift;
      k.put(dressing(k.box(0.45, 0.55, 0.45).translate(x, y + 0.24, z)), 0x8a8a84, 0.03);
      k.put(dressing(k.box(0.62, 0.06, 0.62).translate(x, y + 0.54, z)), 0x6e6e68, 0.03);
    }
    const sy = roofTop(form, d, h.top, -2.6, -2.8) + lift;
    k.put(dressing(k.cylinder(0.09, 0.09, 1.3, 8).translate(-2.6, sy + 0.6, -2.8)), 0x55595c, 0.03);
    k.put(dressing(k.cylinder(0.16, 0.12, 0.08, 8).translate(-2.6, sy + 1.28, -2.8)), 0x55595c, 0.03);
    const hy = roofTop(form, d, h.top, 0.4, 2.6) + lift;
    k.put(dressing(k.box(0.9, 0.24, 0.9).translate(0.4, hy + 0.08, 2.6)), p.trim, 0.03);
    k.put(dressing(k.box(1.0, 0.05, 1.0).translate(0.4, hy + 0.22, 2.6)), 0x5d6266, 0.03);
    return;
  }
  // a skillion's level monitor across the roof near its high side: its base, louvres either side, the cap
  const zm = -1.0, ym = roofTop(form, d, h.top, 0, zm) + lift;
  k.put(dressing(k.box(w - 1.2, 0.34, 0.5).translate(0, ym + 0.12, zm)), p.roof[1], 0.03);
  k.put(dressing(k.box(w - 1.3, 0.13, 0.52).translate(0, ym + 0.17, zm)), p.dark, 0.02);
  k.put(dressing(k.box(w - 1.0, 0.05, 0.76).translate(0, ym + 0.31, zm)), p.roof[2], 0.03);
  // the deep verge boards down both rakes
  k.tag('fitting', 'verges', 'timber');
  for (const s of [-1, 1]) lay(k.box(0.045, 0.3, dd + 2 * d.eave), s * (w / 2 + d.verge + 0.022), 0, -0.1, p.trim, 0.03);
}

/** (dome-detail-275) Old tyres and sandbags weighting a shed's sheets down against the wind (a war map's yard). */
const roofWeights: Gear = (k, h) => {
  const { lay, pos } = roofLayer(k, h);
  k.tag('fitting', 'weights', 'earth');
  for (const [f, c] of [[0.2, -2.9], [0.2, 0.4], [0.5, 3.1], [0.82, -1.6], [0.86, 2.0]] as const) {
    const [x, z] = pos(1, f, c);
    lay(k.cylinder(0.34, 0.34, 0.16, 8), x, z, 0.075, 0x262626, 0.05);
  }
  for (const [f, c] of [[0.34, -0.9], [0.34, -0.3], [0.72, 1.2]] as const) {
    const [x, z] = pos(1, f, c);
    lay(k.box(0.56, 0.18, 0.34), x, z, 0.085, 0x8e7f5e, 0.09);
  }
};

/**
 * (dome-detail-275) The motor pool's working shed: the bressummer over the open bays (a cast lintel on a masonry kit's
 * piers, a girder on a framed kit's posts) with the bays' number boards, the concrete floor and its apron ramped up to a
 * plinth's floor, the wheel stops, the fitters' bench and tool board on the back wall, the spare tyres, the drums and
 * crates in the end bays, the fire point on the side wall, the gutter and downpipes, and a masonry kit's pilasters.
 */
const motorShed: Gear = (k, h) => {
  const { form, dialect: d, top } = h, w = form.w, dd = form.d, mass = d.cladding === 'render';
  const fy = Math.max(0.06, h.floor + 0.02), zin = -dd / 2 + (mass ? 0.3 : 0), sk = skin(d);
  const bays = Math.max(1, Math.round(w / 2.4)), bay = (i: number) => -w / 2 + (i + 0.5) * w / bays;
  // the bressummer over the open front, its number boards
  k.tag('plate', 'header', mass ? 'concrete' : 'timber');
  const hd = mass ? 0.4 : 0.16, hh = mass ? 0.36 : 0.3, hz = dd / 2 - (mass ? 0.18 : 0.035), hy = top - 0.1 - hh / 2;
  put(k, k.mbox(w + (mass ? 0 : 0.12), hh, hd, 0.015), [0, hy, hz], mass ? CONCRETE : d.paint.frame, 0.03);
  k.tag('fitting', 'boards', 'metal');
  for (let i = 0; i < bays; i++) put(k, dressing(k.box(0.42, 0.24, 0.02)), [bay(i), hy, hz + hd / 2 + 0.005], 0xdedbd2, 0.03);
  // the knee braces from each post up under the bressummer (a steel angle on a masonry kit's piers)
  k.tag('brace', 'knees', mass ? 'metal' : 'timber');
  const off = mass ? 0.18 : 0.035, ph = mass ? 0.18 : 0.07, hb = hy - hh / 2;
  for (let i = 0; i <= bays; i++) {
    // (a masonry kit's piers stand in from their posts' lines toward the middle, buildHut's open-face piers)
    const x0 = -w / 2 + i * w / bays, px = mass ? x0 - Math.sign(Math.round(x0 * 1e6)) * off : i === 0 ? -w / 2 + off : i === bays ? w / 2 - off : x0;
    for (const s of [-1, 1]) {
      if ((i === 0 && s < 0) || (i === bays && s > 0)) continue;
      k.put(dressing(k.mbeam([px + s * (ph - 0.03), hb - 0.7, hz], [px + s * 0.78, hb + 0.03, hz], 0.08, 0.08)), mass ? 0x4a4d50 : d.paint.frame, 0.03);
    }
  }
  // the floor and the apron
  k.tag('slab', 'floor', 'concrete');
  put(k, dressing(k.box(w - 0.2, fy, dd - 0.2)), [0, fy / 2, 0], CONCRETE, 0.04);
  apron(k, h, 'front', 0, w + 0.2, 1.0);
  // the wheel stops in the middle bays
  k.tag('fitting', 'stops', 'concrete');
  for (let i = 1; i < bays - 1; i++) for (const s of [-1, 1]) {
    put(k, dressing(k.mbox(0.55, 0.14, 0.22, 0.03)), [bay(i) + s * 0.75, fy + 0.07, zin + 1.6], CONCRETE, 0.05);
  }
  // the fitters' bench against the back wall, its shelf, legs and vice; the tool board over it
  const bx = bay(Math.min(bays - 1, 2)), bz = zin + 0.37;
  k.tag('fitting', 'bench', 'timber');
  put(k, dressing(k.mbox(1.8, 0.06, 0.7, 0.01)), [bx, fy + 0.88, bz], 0x6a5a44, 0.05);
  put(k, dressing(k.mbox(1.7, 0.03, 0.6, 0.008)), [bx, fy + 0.28, bz], 0x5a4c3a, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(k, dressing(k.box(0.06, 0.85, 0.06)), [bx + sx * 0.82, fy + 0.425, bz + sz * 0.28], 0x3c3f42, 0.03);
  put(k, dressing(k.box(0.16, 0.14, 0.24)), [bx + 0.7, fy + 0.98, bz + 0.25], 0x2f4a5a, 0.03);
  const fb = h.face('back');
  put(k, dressing(faceBox(k, fb, 1.6, 0.9, 0.024)), at(fb, -bx, fy + 1.45, -dd / 2 - zin - 0.011), 0x3c3a34, 0.03);
  // the spare tyres stacked in the next bay
  k.tag('fitting', 'tyres', 'metal');
  for (let i = 0; i < 3; i++) put(k, dressing(k.cylinder(0.36, 0.36, 0.25, 8)), [bay(1) - 0.5, fy + 0.125 + i * 0.25, zin + 0.45], 0x252525, 0.05);
  // the drums in the end bay, the crates in the other
  drums(k, bay(0), zin + 1.0, 4, undefined, fy);
  k.tag('fitting', 'crates', 'plank');
  const cx = bay(bays - 1);
  for (const [x, z, y, s] of [[cx - 0.55, zin + 0.6, 0, 1], [cx + 0.35, zin + 0.7, 0, 0.8], [cx - 0.55, zin + 0.6, 0.7, 0.7]] as const) {
    put(k, k.box(0.9 * s, 0.7 * s, 0.9 * s), [x, fy + y + 0.35 * s, z], 0x6a5a40, 0.08);
  }
  // the oil on the floor where the engines stood, a stain a bay
  k.tag('slab', 'stains', 'concrete');
  for (const [i, dz, a] of [[1, 2.6, 0.3], [2, 4.4, -0.2], [0, 3.6, 0.5]] as const) {
    if (i >= bays) continue;
    const stain = k.box(1.1 + 0.2 * i, 0.006, 1.5);
    stain.rotateY(a);
    put(k, dressing(stain), [bay(i), fy + 0.002, zin + dz], 0x2b2723, 0.08);
  }
  // a vehicle under its tarpaulin in the second bay, before its stops: the body, the cab's hump, the lashings
  if (bays > 2) {
    const vx = bay(1), vz = zin + 3.75;
    k.tag('fitting', 'tarp', 'canvas');
    put(k, dressing(k.mbox(1.9, 1.15, 4.0, 0.22)), [vx, fy + 0.575, vz], 0x5f5a3e, 0.06);
    put(k, dressing(k.mbox(1.7, 0.6, 1.7, 0.2)), [vx, fy + 1.4, vz + 0.9], 0x5a553a, 0.06);
    for (const dz of [-1.2, 0.2]) put(k, dressing(k.box(1.94, 0.04, 0.05)), [vx, fy + 1.13, vz + dz], 0x2e2a22, 0.03);
  }
  // the engine hoist in the third bay before the bench: two A-frames, the beam across them, the chain down to the
  // engine block on its stand
  if (bays > 2) {
    const ex = bay(2), ez = zin + 2.75, ey = fy + 2.2, steel = 0x3f4a52;
    k.tag('fitting', 'hoist', 'metal');
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      k.put(dressing(k.mbeam([ex + s * 0.95, fy, ez + t * 0.62], [ex + s * 0.95, ey, ez], 0.08, 0.08)), steel, 0.03);
    }
    put(k, dressing(k.box(2.02, 0.12, 0.1)), [ex, ey, ez], steel, 0.03);
    put(k, dressing(k.box(0.04, 0.96, 0.04)), [ex, fy + 1.66, ez], 0x2a2a2a, 0.02);
    put(k, dressing(k.box(0.5, 0.7, 0.4)), [ex, fy + 0.35, ez], 0x4a4d50, 0.03);
    put(k, dressing(k.box(0.7, 0.5, 0.56)), [ex, fy + 0.95, ez], 0x3a3f3a, 0.04);
  }
  // a two-wheeled trailer in the end bay before the crates: its bed and sides, wheels, drawbar and jockey leg
  if (bays > 3) {
    const tx = bay(bays - 1) - 0.27, tz = zin + 2.6;
    k.tag('fitting', 'trailer', 'metal');
    put(k, dressing(k.box(1.5, 0.12, 2.4)), [tx, fy + 0.56, tz], 0x4f5a44, 0.04);
    for (const s of [-1, 1]) put(k, dressing(k.box(0.04, 0.36, 2.4)), [tx + s * 0.73, fy + 0.8, tz], 0x56614a, 0.04);
    for (const s of [-1, 1]) put(k, dressing(k.box(1.5, 0.36, 0.04)), [tx, fy + 0.8, tz + s * 1.18], 0x56614a, 0.04);
    for (const s of [-1, 1]) put(k, dressing(k.cylinder(0.33, 0.33, 0.2, 8).rotateZ(Math.PI / 2)), [tx + s * 0.85, fy + 0.33, tz], 0x222222, 0.04);
    put(k, dressing(k.box(0.08, 0.08, 1.1)), [tx, fy + 0.54, tz + 1.75], 0x3a3a38, 0.03);
    put(k, dressing(k.box(0.06, 0.52, 0.06)), [tx, fy + 0.26, tz + 2.25], 0x3a3a38, 0.03);
  }
  // the fire point on the side wall by the front: its red board, the buckets on it and the sand bin under it
  const fr = h.face('right'), fu = -fr.half + 1.4;
  k.tag('fitting', 'firepoint', 'metal');
  put(k, dressing(faceBox(k, fr, 1.1, 0.8, 0.03)), at(fr, fu, 1.35, sk + 0.012), 0xa8322a, 0.03);
  for (const s of [-1, 0, 1]) put(k, dressing(k.cylinder(0.13, 0.1, 0.24, 7)), at(fr, fu + s * 0.34, 1.12, sk + 0.14), 0xb8372c, 0.04);
  put(k, dressing(faceBox(k, fr, 0.8, 0.5, 0.42)), at(fr, fu, 0.25, sk + 0.23), 0xa8322a, 0.04);
  pilasters(k, h, ['left', 'right', 'back'], 2.4);
  rainwater(k, h);
  roofRelief(k, h);
};

/**
 * (dome-detail-275) The service garage's yard: a masonry kit's pilasters down its long walls, the apron ramped up to the
 * roller door between its bollards, a hood on brackets over the side door, the name board over the doors, the gutters and
 * downpipes (a parapet's hoppers), the drums by the side.
 */
const garageYard: Gear = (k, h) => {
  const { form, dialect: d, top, floor } = h, f = h.face('front'), sk = skin(d), mass = d.cladding === 'render';
  pilasters(k, h, ['left', 'right'], 2.5);
  rainwater(k, h);
  roofRelief(k, h);
  const g = form.openings.find((o) => o.kind === 'garage'), dr = form.openings.find((o) => o.kind === 'door' && o.face === 'front');
  if (g) {
    apron(k, h, 'front', g.u, g.w + 0.8, 1.3);
    k.tag('fitting', 'bollards', 'metal');
    for (const s of [-1, 1]) {
      const [x, , z] = at(f, g.u + s * (g.w / 2 + 0.3), 0, 0.42);
      put(k, dressing(k.cylinder(0.1, 0.1, 0.95, 8)), [x, 0.475, z], 0xc9a227, 0.04);
      put(k, dressing(k.cylinder(0.105, 0.105, 0.12, 8)), [x, 0.75, z], 0x2a2a2a, 0.03);
    }
  }
  if (dr) {
    // the hood: a slab cantilevered off the wall (a framed kit's sheet on two brackets)
    k.tag('fitting', 'hood', mass ? 'concrete' : 'metal');
    const hy = floor + dr.h + 0.32;
    put(k, dressing(faceMember(k, f, dr.w + 0.5, 0.06, 0.7, 0.01)), at(f, dr.u, hy, sk + 0.33), mass ? CONCRETE : d.paint.roof[1], 0.03);
    if (!mass) for (const s of [-1, 1]) {
      const uu = dr.u + s * (dr.w / 2 + 0.12);
      k.put(dressing(k.mbeam(at(f, uu, hy - 0.4, sk - 0.01), at(f, uu, hy - 0.03, sk + 0.6), 0.05, 0.05)), d.paint.frame, 0.03);
    }
  }
  // the name board: on the front gable over the doors, or high on a parapet's front
  k.tag('fitting', 'sign', 'timber');
  const sy = form.roof === 'gable' ? top + 0.45 : wallHead(h, 'front', 0, form.d / 2) - 0.32;
  put(k, dressing(faceBox(k, f, 2.6, 0.5, 0.04)), at(f, 0, sy, sk + 0.02), 0x2f4a3c, 0.03);
  put(k, dressing(faceBox(k, f, 2.2, 0.07, 0.02)), at(f, 0, sy, sk + 0.045), 0xd8d4c8, 0.03);
  drums(k, form.w / 2 + 0.5, form.d / 2 - 1.0, 3);
};

/** (dome-detail-275) The evaporative cooler on a desert garage's flat roof: its cabinet on a curb, louvred on each side. */
const swampCooler: Gear = (k, h) => {
  const { form, dialect: d, top } = h, x = 1.6, z = -2.0;
  // (the roof falls to the front: the curb's foot in the deck at the cabinet's low edge, its head level)
  const y0 = roofTop(form, d, top, x, z + 0.6), y1 = roofTop(form, d, top, x, z - 0.6) + 0.22;
  k.tag('fitting', 'cooler', 'metal');
  put(k, dressing(k.box(1.2, y1 - y0, 1.2)), [x, (y0 + y1) / 2, z], 0x7d7a72, 0.03);
  put(k, dressing(k.mbox(1.05, 0.85, 1.05, 0.02)), [x, y1 + 0.425, z], 0xb3ab98, 0.03);
  put(k, dressing(k.mbox(1.15, 0.06, 1.15, 0.01)), [x, y1 + 0.88, z], 0x8c8778, 0.03);
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    put(k, dressing(k.box(nx ? 0.02 : 0.8, 0.55, nz ? 0.02 : 0.8)), [x + nx * 0.53, y1 + 0.43, z + nz * 0.53], 0x5e5a50, 0.03);
  }
};

// ------------------------------------------------------------------- the vernacular kinds' dress (dome-detail-275 pass 2)

/** (dome-detail-275) A colour `t` of the way from `a` to `b`. */
const mix = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
};

/** (dome-detail-275) A fixed scatter in [0, 1) by index: the hand-built irregularity, without drawing on the build's stream. */
const jit = (i: number): number => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** (dome-detail-275) Whether a face's openings (floor-relative) leave u0..u1, y0..y1 over the ground clear. */
const clear = (h: HutFrame, id: FaceId, u0: number, u1: number, y0: number, y1: number): boolean =>
  !h.form.openings.some((o) => o.face === id && o.u + o.w / 2 + 0.12 > u0 && o.u - o.w / 2 - 0.12 < u1
    && h.floor + o.y - 0.12 < y1 && h.floor + o.y + o.h + 0.12 > y0);

/**
 * (dome-detail-275) A hut's covering in relief, dressing on it: a tin roof's end lap, the rust (or the lichen on asbestos)
 * run down from it and a replaced sheet, with the bamboo poles laid across it where the dialect weights its tin; a felt
 * roof's battens down the fall, its weathered patches and the roll over its ridge; a thatch's courses and the poles riding
 * its ridge; canal tiles' mortared eave and verges, the lichen and a slipped cover; under snow the cornice it rolls over
 * each eave and the icicles hanging from it.
 */
function hutCover(k: HutTools, h: HutFrame): void {
  const { form, dialect: d } = h, p = d.paint, cov = d.covering;
  const { lift, ang, gable, part, lay, pos } = roofLayer(k, h);
  const sides = gable ? [-1, 1] : [1];
  // f runs from a gable's ridge (a skillion's back wall) to the walls' line, a slope's fraction t from its high edge to its eave
  const run = gable ? form.w / 2 : form.d, f0 = gable ? 0 : -d.eave / run, fe = 1 + d.eave / run;
  const fOf = (t: number) => f0 + t * (fe - f0), L = ((fe - f0) * run) / Math.cos(ang);
  const acrossLen = gable ? form.d + 2 * d.verge : form.w + 2 * d.verge;
  k.tag('roof', 'cover', d.roofMaterial ?? (cov === 'sheet' ? 'metal' : cov === 'thatch' ? 'thatch' : cov === 'tile' ? 'tile' : 'plank'));
  if (d.snow) {
    // the snow's cornice rolled over each eave, the icicles hanging from it
    for (const s of sides) {
      const [x, z] = pos(s, fe, 0), y = roofTop(form, d, h.top, x, z) + (lift - 0.06) / Math.cos(ang);
      const lip = k.cylinder(0.1, 0.1, acrossLen, 7);
      if (gable) lip.rotateX(Math.PI / 2); else lip.rotateZ(Math.PI / 2);
      lay(lip, x, z, -0.06, 0xe4e9ee, 0.02);
      const n = Math.max(4, Math.round(acrossLen / 0.5));
      for (let i = 0; i < n; i++) {
        const c = -acrossLen / 2 + (i + 0.3 + 0.4 * jit(i * 5 + s)) * acrossLen / n, len = 0.16 + 0.34 * jit(i * 11 + 3);
        put(k, dressing(k.cylinder(0.035, 0.004, len, 5)), gable ? [x, y - len / 2 - 0.03, c] : [c, y - len / 2 - 0.03, z], 0xd6e0e8, 0.03);
      }
    }
    return;
  }
  if (cov === 'sheet') {
    const r = (p.roof[0] >> 16) & 255, b = p.roof[0] & 255, rusty = r > b + 24, shifer = r >= b && r - b < 12 && r > 0x80;
    const runC = mix(p.roof[0], shifer ? 0x5e5c52 : rusty ? 0x4e2e20 : 0x7a4a30, shifer ? 0.45 : 0.6);
    for (const s of sides) {
      // the end lap half way down, the runs from it
      const [x, z] = pos(s, fOf(0.5), 0);
      lay(part(0.09, 0.02, acrossLen - 0.04), x, z, 0, p.roof[2], 0.03);
      for (let i = 0; i < 5; i++) {
        const c = -acrossLen / 2 + (i + 0.25 + 0.5 * jit(i * 3 + s * 7)) * acrossLen / 5, ln = L * (0.14 + 0.14 * jit(i + 9));
        const [x2, z2] = pos(s, fOf(0.5) + (ln / 2) * Math.cos(ang) / run, c);
        lay(part(ln, 0.006, 0.16 + 0.14 * jit(i * 13)), x2, z2, 0.012, runC, 0.08);
      }
    }
    // a replaced sheet in another shade
    const [xr, zr] = pos(sides[sides.length - 1], fOf(0.3), acrossLen * 0.18);
    lay(part(Math.min(2.0, L * 0.45), 0.012, 1.15), xr, zr, 0.006, rusty ? 0xa9aeb0 : shifer ? 0xbdbcb2 : mix(p.roof[0], 0x8a5f42, 0.6), 0.04);
    if (d.weights === 'poles') {
      // the bamboo poles laid across the tin and lashed down against the storms
      k.tag('fitting', 'roofpoles', 'timber');
      for (const s of sides) for (const t of [0.28, 0.8]) {
        const [x, z] = pos(s, fOf(t), 0), pole = k.cylinder(0.045, 0.045, acrossLen + 0.1, 6);
        if (gable) pole.rotateX(Math.PI / 2); else pole.rotateZ(Math.PI / 2);
        lay(pole, x, z, 0.035, 0x9a8660, 0.05);
      }
    }
    return;
  }
  if (cov === 'felt') {
    // the battens down the fall the felt is dressed over, a weathered patch or two, a gable's ridge roll
    const bat = mix(p.roof[2], 0x8a8478, 0.22), n = Math.max(3, Math.round(acrossLen / 0.9));
    for (const s of sides) for (let i = 0; i <= n; i++) {
      const [x, z] = pos(s, fOf(0.5), -acrossLen / 2 + 0.06 + (i * (acrossLen - 0.12)) / n);
      lay(part(L - 0.06, 0.045, 0.06), x, z, 0.01, bat, 0.04);
    }
    for (const [s, t, c, a] of [[sides[0], 0.3, -0.22, 1.3], [sides[sides.length - 1], 0.72, 0.31, 0.9]] as const) {
      const [x, z] = pos(s, fOf(t), c * acrossLen);
      lay(part(a, 0.01, 0.8), x, z, 0.0, mix(p.roof[0], 0x9a968c, 0.3), 0.05);
    }
    if (gable) k.put(dressing(k.mbox(0.24, 0.09, acrossLen, 0.02).translate(0, h.top + form.rise + lift / Math.cos(ang) - 0.01, 0)), bat, 0.03);
    return;
  }
  if (cov === 'thatch') {
    // the courses: a band proud across the slope every 0.7 m or so (on the main coat above the eave coat, on the eave
    // coat below), and the poles riding the ridge in pairs, held over it by the roll
    const n = Math.max(3, Math.round(L / 0.55));
    for (const s of sides) for (let i = 1; i < n; i++) {
      const t = i / n;
      if (Math.abs(t - 0.64) < 0.06) continue;
      // (laid plumb over its point, a band stands off the rafters' plane out toward the eave: t is the rafters' point under it)
      const up = (t < 0.64 ? -0.16 : 0) + 0.012, [x, z] = pos(s, fOf(t) + ((lift + up) * Math.sin(ang)) / run, 0);
      lay(part(0.14, 0.05, acrossLen - 0.12), x, z, up, i % 2 ? mix(p.roof[0], p.roof[2], 0.4) : p.roof[1], 0.06);
    }
    if (gable) {
      k.tag('fitting', 'riders', 'timber');
      const m = Math.max(2, Math.round(acrossLen / 1.5));
      for (let i = 0; i < m; i++) {
        const c = -acrossLen / 2 + (i + 0.5) * acrossLen / m;
        for (const s of sides) {
          const [x, z] = pos(s, fOf(0.55 / L), c);
          lay(part(1.1, 0.07, 0.07), x, z, -0.16 + 0.035, p.frame, 0.05);
        }
      }
    }
    return;
  }
  if (cov === 'tile') {
    // the eave's mortar under the covers' ends and the verges' mortar up the rakes (limewash on a whitewashed kit)
    const lime = d.cladding === 'render' ? p.wall[0] : 0xc9c3b4;
    for (const s of sides) {
      const [x, z] = pos(s, fOf(0.975), 0);
      lay(part(0.16, 0.1, acrossLen - 0.02), x, z, -0.08, lime, 0.03);
      for (const e of [-1, 1]) {
        const [x2, z2] = pos(s, fOf(0.5), e * (acrossLen / 2 - 0.1));
        lay(part(L - 0.1, 0.09, 0.2), x2, z2, -0.045, lime, 0.04);
      }
      // the lichen on the covers, a cover slipped down over its neighbours
      for (let i = 0; i < 4; i++) {
        const [x3, z3] = pos(s, fOf(0.2 + 0.6 * jit(i * 7 + s)), (jit(i * 3 + 1) - 0.5) * (acrossLen - 1.0));
        lay(part(0.3 + 0.3 * jit(i), 0.012, 0.22 + 0.2 * jit(i + 5)), x3, z3, 0.0, mix(p.roof[0], i % 2 ? 0xb39a4a : 0x8c8a6a, 0.55), 0.06);
      }
      const [x4, z4] = pos(s, fOf(0.62), acrossLen * 0.21 * s);
      lay(part(0.45, 0.06, 0.22).rotateY(0.35), x4, z4, 0.02, p.roof[1], 0.05);
    }
  }
}

/**
 * (dome-detail-275) A hut's walls dressed and set into the ground: a board wall's water-table board along its foot round
 * the doors, a board or two replaced in fresh timber; a rendered wall's render fallen in patches off the saman, brick or
 * rubble under it, a stain run down from each sill; the snow drifted against a winter kit's walls.
 */
function hutWalls(k: HutTools, h: HutFrame): void {
  const { form, dialect: d, floor } = h, p = d.paint, ground = form.lift < 0.3;
  const ids: FaceId[] = ['front', 'back', 'left', 'right'];
  for (const [n, id] of ids.entries()) {
    if (form.open?.includes(id)) continue;
    const f = h.face(id), holes = form.openings.filter((o) => o.face === id).map((o) => ({ ...o, y: o.y + floor }));
    const head = form.roof === 'skillion' && id === 'back' ? h.top + form.rise : h.top;
    k.tag('wall', wallGroup(f, 0), wallMat(d));
    if (ground && (d.cladding === 'batten' || d.cladding === 'lap')) {
      const o = d.cladding === 'batten' ? 0.062 : 0.045;
      for (const [a, b] of around(-f.half - 0.02, f.half + 0.02, floor + 0.02, floor + 0.24, holes)) {
        if (b - a > 0.1) put(k, dressing(faceMember(k, f, b - a, 0.2, 0.03)), at(f, (a + b) / 2, floor + 0.13, o), p.trim, 0.04);
      }
    }
    if (d.cladding === 'batten') {
      const step = form.battens ?? 0.6;
      for (const q of [0.3, 0.74]) {
        const u = -f.half + Math.max(1, Math.round((q * 2 * f.half) / step)) * step;
        if (u > f.half - 0.3 || !clear(h, id, u - step / 2, u + step / 2, floor, head)) continue;
        put(k, dressing(faceBox(k, f, step - 0.07, head - floor - 0.12, 0.006)), at(f, u, (floor + head) / 2, 0.028), mix(p.wall[1], 0xa89070, 0.4), 0.04);
      }
    }
    if (d.cladding === 'render') {
      const under = mix(p.wall[2], d.wallMaterial === 'adobe' ? 0x8a7458 : d.wallMaterial === 'brick' ? 0x8a4a38 : 0x8d877a, 0.42);
      const base = floor + Math.max(d.dado ?? 0, 0.2);
      const spots = f.half > 1.6 ? [[0.22, 0.35, 0.95, 0.5], [0.71, 0.95, 0.6, 0.42]] : [[0.5 + 0.3 * (n % 2 ? 1 : -1) * 0.5, 0.35, 0.6, 0.4]];
      for (const [q, yq, pw, ph] of spots) {
        const u = -f.half + q * 2 * f.half, y = base + yq + ph / 2;
        if (y + ph / 2 > head - 0.1 || !clear(h, id, u - pw / 2, u + pw / 2, y - ph / 2, y + ph / 2)) continue;
        put(k, dressing(faceMember(k, f, pw, ph, 0.012, 0.004)), at(f, u, y, 0.006), under, 0.06);
        // (its edge ragged: a smaller piece off one corner)
        put(k, dressing(faceMember(k, f, pw * 0.45, ph * 0.5, 0.012, 0.004)), at(f, u + pw * 0.4, y - ph * 0.42, 0.006), under, 0.06);
      }
      // the stain run down from each window's sill
      for (const o of holes) if (o.kind === 'window') {
        put(k, dressing(faceBox(k, f, o.w * 0.5, 0.45, 0.006)), at(f, o.u, o.y - 0.3, 0.003), mix(p.wall[2], 0x4a4438, 0.16), 0.05);
      }
    }
    if (d.snow && ground) {
      // the drift against the wall, deepest at its foot
      put(k, dressing(onto(prism([[0, 0], [0.45, 0], [0.12, 0.2], [0, 0.28]], 2 * f.half - 0.1, 0.5), f)), at(f, 0, 0, skin(d) - 0.01), 0xe4e9ee, 0.02);
    }
  }
}

/** (dome-detail-275) A louvred vent high in each gable: its frame, the dark behind its blades. */
function gableVents(k: HutTools, h: HutFrame): void {
  const { form, dialect: d, top } = h, p = d.paint;
  if (form.roof !== 'gable' || form.rise < 0.9) return;
  // the gable's outer face (buildHut's gable: a render's masonry, a log kit's boards, the boards and battens)
  const o = d.cladding === 'render' ? 0 : d.cladding === 'log' ? d.course / 2 - 0.005 : 0.03;
  const vw = Math.min(0.8, form.w * 0.14), vh = Math.min(0.55, form.rise * 0.3), y = top + form.rise * 0.42;
  for (const id of ['front', 'back'] as const) {
    const f = h.face(id);
    k.tag('wall', `gable|${id}`, d.cladding === 'log' ? 'plank' : wallMat(d));
    for (const s of [-1, 1]) put(k, dressing(faceBox(k, f, 0.07, vh + 0.14, 0.07)), at(f, s * (vw / 2 + 0.035), y, o + 0.035), p.trim, 0.03);
    for (const s of [-1, 1]) put(k, dressing(faceBox(k, f, vw + 0.14, 0.07, 0.07)), at(f, 0, y + s * (vh / 2 + 0.035), o + 0.035), p.trim, 0.03);
    put(k, dressing(faceBox(k, f, vw, vh, 0.012)), at(f, 0, y, o + 0.006), p.dark, 0.02);
    for (let i = 0; i < 3; i++) put(k, dressing(faceBox(k, f, vw, 0.06, 0.05)), at(f, 0, y - vh / 2 + (i + 0.5) * vh / 3, o + 0.025), p.trim, 0.03);
  }
}

/** (dome-detail-275) The stilts braced: a diagonal from foot to head between each pair of legs down every side. */
function stiltBraces(k: HutTools, h: HutFrame): void {
  const { form, dialect: d } = h, w = form.w, dd = form.d;
  if (form.lift < 1.1 || d.footing === 'staddle') return;
  const nx = Math.max(1, Math.round(w / 2.4)), nz = Math.max(1, Math.round(dd / 2.4)), t = d.round ? 0.065 : 0.055;
  const y0 = 0.25, y1 = form.lift - 0.24;
  k.tag('brace', 'stilts', 'timber');
  const brace = (a: V3, b: V3) => k.put(dressing(k.mbeam(a, b, t, t)), d.paint.frame, 0.04);
  for (const sx of [-1, 1]) for (let j = 0; j < nz; j++) {
    const za = -dd / 2 + (j * dd) / nz, zb = za + dd / nz, up = (j + (sx > 0 ? 1 : 0)) % 2 === 0;
    brace([sx * w / 2, up ? y0 : y1, za], [sx * w / 2, up ? y1 : y0, zb]);
  }
  for (const sz of [-1, 1]) for (let i = 0; i < nx; i++) {
    const xa = -w / 2 + (i * w) / nx, xb = xa + w / nx, up = (i + (sz > 0 ? 0 : 1)) % 2 === 0;
    brace([xa, up ? y0 : y1, sz * dd / 2], [xb, up ? y1 : y0, sz * dd / 2]);
  }
}

/** (dome-detail-275) A plank boat drawn up on the bank: its hull flaring from a narrow bottom, the dark inside over its
 *  gunwales, two thwarts. */
function boat(k: HutTools, x: number, z: number, len: number, beam: number, yaw: number, color: number): void {
  k.tag('fitting', `boat|${x.toFixed(1)}|${z.toFixed(1)}`, 'plank');
  const plan = (s: number, l: number): Array<[number, number]> => {
    const a = l / 2, b = (beam * s) / 2;
    return [[-a, 0], [-a * 0.72, -b * 0.8], [-a * 0.32, -b], [a * 0.32, -b], [a * 0.72, -b * 0.8], [a, 0], [a * 0.72, b * 0.8], [a * 0.32, b], [-a * 0.32, b], [-a * 0.72, b * 0.8]];
  };
  const place = (g: THREE.BufferGeometry, c: number, j = 0.05) => k.put(dressing(g.rotateY(yaw).translate(x, 0, z)), c, j);
  const hull = (s: number, l: number, y0: number, y1: number, c: number) => place(prism(plan(s, l), y1 - y0, 0.5).rotateX(-Math.PI / 2).translate(0, (y0 + y1) / 2, 0), c);
  hull(0.7, len * 0.84, 0, 0.17, mix(color, 0x000000, 0.25));
  hull(1, len, 0.16, 0.46, color);
  hull(0.84, len * 0.9, 0.455, 0.47, 0x2a2219);
  for (const t of [-0.2, 0.16]) place(k.box(0.13, 0.04, beam * 0.86).translate(t * len, 0.48, 0), mix(color, 0xffffff, 0.12), 0.04);
}

/** (dome-detail-275) An oar leaning on a face at `u`: its loom from the ground to the wall's boards, the blade at its foot. */
function oar(k: HutTools, h: HutFrame, id: FaceId, u: number, color: number): void {
  const f = h.face(id), sk = skin(h.dialect);
  k.tag('fitting', `oar|${id}|${u}`, 'timber');
  k.put(dressing(k.mbeam(at(f, u, 0.02, 0.55), at(f, u + 0.12, Math.min(2.05, h.top - 0.15), sk - 0.01), 0.055, 0.045)), color, 0.04);
  k.put(dressing(k.mbeam(at(f, u - 0.005, 0.02, 0.56), at(f, u + 0.03, 0.62, 0.45), 0.16, 0.03)), color, 0.04);
}

/** (dome-detail-275) Fish traps of split bamboo lying by a wall: tapered cages on their sides. */
function fishTraps(k: HutTools, x: number, z: number, n: number): void {
  k.tag('fitting', `traps|${x}|${z}`, 'timber');
  for (let i = 0; i < n; i++) {
    const trap = k.cylinder(0.2 - 0.02 * i, 0.12, 0.75, 7).rotateZ(Math.PI / 2).rotateY(0.3 * i);
    put(k, dressing(trap), [x, 0.2 - 0.02 * i, z + i * 0.5], i % 2 ? 0x8f7a56 : 0xa58f63, 0.06);
  }
}

/** (dome-detail-275) A terracotta storage jar (a tinaja, a kolshi) at (x, z), `s` its scale (under 0.8 m). */
function jar(k: HutTools, x: number, z: number, s: number, color: number): void {
  k.tag('fitting', `jar|${x.toFixed(1)}|${z.toFixed(1)}`, 'tile');
  put(k, dressing(k.cylinder(0.3 * s, 0.17 * s, 0.42 * s, 9)), [x, 0.21 * s, z], color, 0.05);
  put(k, dressing(k.cylinder(0.15 * s, 0.3 * s, 0.26 * s, 9)), [x, 0.55 * s, z], color, 0.05);
  put(k, dressing(k.cylinder(0.17 * s, 0.17 * s, 0.06 * s, 9)), [x, 0.71 * s, z], mix(color, 0x000000, 0.18), 0.04);
}

/** (dome-detail-275) A sawbuck before a face: its two crossed trestles and the log across them. */
function sawbuck(k: HutTools, x: number, z: number, color: number): void {
  k.tag('fitting', 'sawbuck', 'timber');
  for (const s of [-1, 1]) for (const e of [-1, 1]) {
    k.put(dressing(k.mbeam([x + s * 0.4, 0.0, z - e * 0.3], [x + s * 0.4, 0.84, z + e * 0.13], 0.06, 0.06)), color, 0.04);
  }
  put(k, dressing(k.cylinder(0.11, 0.12, 1.5, 8).rotateZ(Math.PI / 2)), [x, 0.87, z], mix(color, 0x8a7458, 0.4), 0.05);
}

/** (dome-detail-275) The kinds' own dress: the covering's relief, the walls dressed and set into the ground. */
const dressHut: Gear = (k, h) => { hutCover(k, h); hutWalls(k, h); };

/** (dome-detail-275) The lean-to's yard: the sawbuck with its log before the open front, a ladder against a side wall. */
const leantoYard: Gear = (k, h) => {
  const p = h.dialect.paint;
  sawbuck(k, -1.2, h.form.d / 2 + 0.75, p.frame);
  ladder(k, h.face('left'), -0.4, Math.min(1.6, h.top - 0.2), 0.5, p.frame, h.dialect.round, skin(h.dialect));
};

/** (dome-detail-275) The fisher's yard: the boat drawn up before the shack, the oars against its side, the traps by it. */
const fisherYard: Gear = (k, h) => {
  const { form, dialect: d } = h;
  boat(k, -0.9, form.d / 2 + 0.8, Math.min(3.6, form.w * 0.84), 1.05, 0.08, mix(d.paint.wall[0], 0x3a4a52, 0.35));
  for (const u of [-1.45, -1.8]) oar(k, h, 'left', u, mix(d.paint.frame, 0x8a7458, 0.35));
  fishTraps(k, form.w / 2 + 0.35, -form.d / 2 + 0.9, 2);
};

// ------------------------------------------------------------------------ the kits' yards (dome-detail-275 pass 2)

/**
 * (dome-detail-275) The Lorraine farm's long barn: the manure heap on the usoir before it, the hay cart standing at the
 * back on its wheels and prop, the stone trough by the side wall, the zinc gutters and downpipes.
 */
const lorrainYard: Gear = (k, h) => {
  const { form, dialect: d } = h, p = d.paint, zf = form.d / 2;
  k.tag('fitting', 'fumier', 'earth');
  const hx = 1.9, hz = zf + 0.75;
  put(k, dressing(prism([[-0.55, 0], [0.55, 0], [0.38, 0.38], [0.08, 0.58], [-0.32, 0.46]], 2.1, 0.5).rotateY(Math.PI / 2)), [hx, 0, hz], 0x4a3a26, 0.08);
  put(k, dressing(k.mbox(1.5, 0.08, 0.45, 0.02)), [hx - 0.1, 0.5, hz + 0.02], 0x8a7448, 0.06);
  for (const s of [-1, 1]) put(k, dressing(k.mbox(0.22, 0.24, 1.1, 0.03)), [hx + s * 1.16, 0.12, hz], p.foot, 0.06);
  // the cart: its wheels on the axle, the bed and its rails, the shafts out level to the prop under their ends
  k.tag('fitting', 'cart', 'timber');
  const cx = -1.2, cz = -zf - 0.7, wood = 0x6a5a44;
  for (const s of [-1, 1]) put(k, dressing(k.cylinder(0.55, 0.55, 0.08, 12).rotateX(Math.PI / 2)), [cx, 0.55, cz + s * 0.6], 0x4a3c2c, 0.04);
  put(k, dressing(k.box(0.12, 0.12, 1.3)), [cx, 0.55, cz], 0x3c342a, 0.03);
  put(k, dressing(k.box(2.0, 0.08, 1.0)), [cx, 0.65, cz], wood, 0.05);
  for (const s of [-1, 1]) put(k, dressing(k.box(2.0, 0.3, 0.05)), [cx, 0.84, cz + s * 0.475], wood, 0.05);
  for (const s of [-1, 1]) put(k, dressing(k.box(1.45, 0.07, 0.07)), [cx - 1.7, 0.65, cz + s * 0.32], wood, 0.04);
  for (const s of [-1, 1]) put(k, dressing(k.box(0.07, 0.62, 0.07)), [cx - 2.35, 0.31, cz + s * 0.32], wood, 0.04);
  // the trough of Jaumont stone by the right wall, its water
  k.tag('fitting', 'trough', 'stone');
  put(k, dressing(k.mbox(0.55, 0.5, 1.6, 0.03)), [form.w / 2 + 0.45, 0.25, 1.5], p.foot, 0.05);
  put(k, dressing(k.box(0.42, 0.02, 1.46)), [form.w / 2 + 0.45, 0.5, 1.5], 0x34403f, 0.02);
  // the barn door's two leaves: the stile where they meet
  const g = form.openings.find((o) => o.face === 'front' && o.kind === 'door');
  if (g && g.w > 1.6) put(k, dressing(faceBox(k, h.face('front'), 0.07, g.h - 0.06, 0.03)), at(h.face('front'), g.u, h.floor + g.h / 2, 0.06), p.door, 0.03);
  rainwater(k, h);
};

/**
 * (dome-detail-275) The Virgin Lands house: the boarded entrance porch (the senki) over its door under its own small gable
 * of asbestos sheet, its step; the kizyak (dried dung bricks for the stove) stacked by the back.
 */
const tselinaYard: Gear = (k, h) => {
  const { form, dialect: d } = h, p = d.paint, zf = form.d / 2;
  k.tag('fitting', 'porch', 'plank');
  const pw = 1.9, pd = 1.05, ph = 2.25, board = 0x8a7a62, rise = 0.55, hw = pw / 2 + 0.15, a = Math.atan2(rise, hw);
  for (const s of [-1, 1]) put(k, dressing(k.box(0.08, ph, pd)), [s * (pw / 2 - 0.04), ph / 2, zf + pd / 2], board, 0.05);
  for (const s of [-1, 1]) put(k, dressing(k.box(0.5, ph, 0.08)), [s * (pw / 2 - 0.25), ph / 2, zf + pd - 0.04], board, 0.05);
  put(k, dressing(k.box(0.9, 0.3, 0.08)), [0, ph - 0.15, zf + pd - 0.04], board, 0.05);
  put(k, dressing(k.box(0.86, 1.92, 0.04)), [0, 0.98, zf + pd - 0.07], p.door, 0.04);
  for (const s of [-1, 1]) put(k, dressing(k.box(0.06, 1.98, 0.05)), [s * 0.47, 0.99, zf + pd - 0.0], p.trim, 0.03);
  put(k, dressing(prism([[-pw / 2, 0], [pw / 2, 0], [0, rise - 0.04]], 0.05, 0.5)), [0, ph, zf + pd - 0.04], board, 0.05);
  for (const s of [-1, 1]) {
    const sheet = k.box(Math.hypot(hw, rise) + 0.04, 0.04, pd + 0.25).rotateZ(-s * a);
    put(k, dressing(sheet), [(s * hw) / 2, ph + rise / 2 + 0.02, zf + pd / 2 + 0.06], p.roof[1], 0.04);
  }
  k.tag('footing', 'step', 'concrete');
  put(k, dressing(k.mbox(1.0, 0.15, 0.3, 0.02)), [0, 0.075, zf + pd + 0.13], p.foot, 0.05);
  // the kizyak stack: its courses stepping in to its ridge
  k.tag('fitting', 'kizyak', 'earth');
  for (let r = 0; r < 5; r++) put(k, dressing(k.box(1.8 - 0.24 * r, 0.2, 1.0 - 0.13 * r)), [-1.9, 0.1 + 0.2 * r, -zf - 0.85], r % 2 ? 0x5a4834 : 0x4e3e2c, 0.08);
};

/** (dome-detail-275) The Angami house's yard: the firewood stacked down both long walls under the deep thatch, the sitting
 *  platform of dry stone before it and the memorial stone standing by it. */
const kohimaYard: Gear = (k, h) => {
  const { form, dialect: d } = h, p = d.paint, zf = form.d / 2 + 0.75;
  for (const id of ['left', 'right'] as const) woodpile(k, h.face(id), id === 'left' ? -1.6 : 1.2, 4.2, 5, 0, mix(p.frame, 0x8a7050, 0.35));
  k.tag('footing', 'platform', 'stone');
  put(k, dressing(k.mbox(2.4, 0.45, 1.1, 0.06)), [-1.3, 0.225, zf], 0x6e6a62, 0.08);
  for (let i = 0; i < 3; i++) put(k, dressing(k.mbox(0.74, 0.08, 0.95, 0.02)), [-2.05 + i * 0.75, 0.49, zf + 0.03 * (i - 1)], 0x7d786e, 0.06);
  put(k, dressing(k.mbox(0.42, 1.55, 0.26, 0.08)), [-2.95, 0.775, zf - 0.1], 0x77736a, 0.05);
};

/** (dome-detail-275) The char's stilt house yard: the jute sticks stood in a cone, the kolshi under the floor, the
 *  flood season's boat drawn up under it. */
const bengalStilt: Gear = (k, h) => {
  const { form } = h;
  k.tag('fitting', 'jute', 'thatch');
  put(k, dressing(k.cylinder(0.05, 0.62, 1.9, 9)), [-form.w / 2 - 0.75, 0.95, -1.2], 0xb59f6e, 0.08);
  put(k, dressing(k.cylinder(0.2, 0.22, 0.08, 9)), [-form.w / 2 - 0.75, 1.42, -1.2], 0x6e5a3c, 0.05);
  jar(k, 0.9, 0.5, 0.9, 0x8a4a2c);
  jar(k, 1.35, -0.2, 0.75, 0x7a4026);
  boat(k, -0.9, 0, 3.4, 0.9, Math.PI / 2, 0x5a4a36);
};

/** (dome-detail-275) The Mekong long house's bank: its jars by the ladder, the sampan drawn up along its side. */
const mekongYard: Gear = (k, h) => {
  const { form } = h;
  jar(k, form.w / 2 + 0.5, form.d / 2 - 0.6, 1, 0x6e4128);
  jar(k, form.w / 2 + 0.55, form.d / 2 - 1.3, 0.8, 0x5e3a24);
  boat(k, -form.w / 2 - 0.65, 0.6, 4.0, 0.95, Math.PI / 2 + 0.05, 0x5a4a38);
};

/** (dome-detail-275) The Ca Mau house: the sampan stored under its floor, the fish traps by the back. */
const camauYard: Gear = (k, h) => {
  const { form } = h;
  boat(k, -1.2, 0, 3.6, 0.9, Math.PI / 2, 0x5a4a38);
  fishTraps(k, -form.w / 2 - 0.3, -1.6, 2);
};

/** (dome-detail-275) The tinajas and the straw bales under the Andalusian lean-to. */
const andalusYard: Gear = (k) => {
  jar(k, 1.75, 0.35, 1, 0xa0583a);
  jar(k, 1.15, 0.6, 0.85, 0x94502f);
  k.tag('fitting', 'bales', 'thatch');
  for (const [x, y, z] of [[-1.6, 0.21, 0.4], [-0.72, 0.21, 0.46], [-1.18, 0.63, 0.42]] as const) put(k, dressing(k.mbox(0.88, 0.42, 0.48, 0.03)), [x, y, z], 0xc2a764, 0.07);
};

/** (dome-detail-275) The puesto's cover: the lentisk brush piled against its sides and corners, the dry-stone wing wall. */
const puestoCover: Gear = (k, h) => {
  const { form } = h, hw = form.w / 2, hd = form.d / 2;
  k.tag('fitting', 'brush', 'timber');
  // (each bush two lumps of its foliage, turned off the walls' lines)
  for (const [i, [x, z, w, hh, d, c]] of ([[-hw - 0.34, 0, 0.66, 0.78, 1.2, 0x5d6b3c], [hw + 0.34, 0.2, 0.66, 0.68, 1.1, 0x6b7444],
    [-0.62, hd + 0.26, 0.74, 0.56, 0.5, 0x56653a], [0.66, hd + 0.26, 0.66, 0.5, 0.5, 0x5d6b3c]] as const).entries()) {
    put(k, dressing(k.mbox(w, hh, d, 0.18).rotateY(0.25 * (i % 2 ? 1 : -1))), [x, hh / 2, z], c, 0.1);
    put(k, dressing(k.mbox(w * 0.7, hh * 0.7, d * 0.6, 0.14).rotateY(0.6)), [x + 0.08 * (i % 2 ? -1 : 1), hh * 0.7 + 0.08, z + d * 0.18], mix(c, 0x8a8a5a, 0.25), 0.1);
  }
  k.tag('fitting', 'wing', 'stone');
  for (let i = 0; i < 2; i++) put(k, dressing(k.mbox(0.5, 0.55 - 0.1 * i, 0.4, 0.05)), [-hw - 0.4 - 0.45 * i, (0.55 - 0.1 * i) / 2, hd + 0.05 + 0.05 * i], 0x8d877a, 0.07);
};

/** (dome-detail-275) The kolkhoz shed's milk churns and the cart wheel leaning on its side wall. */
const kolkhozYard: Gear = (k, h) => {
  const { form, dialect: d } = h;
  k.tag('fitting', 'churns', 'metal');
  for (const [x, z] of [[1.7, 0.45], [2.0, -0.1]] as const) {
    put(k, dressing(k.cylinder(0.17, 0.17, 0.5, 8)), [x, 0.25, z], 0x9aa0a0, 0.04);
    put(k, dressing(k.cylinder(0.08, 0.17, 0.12, 8)), [x, 0.56, z], 0x9aa0a0, 0.04);
    put(k, dressing(k.cylinder(0.1, 0.1, 0.12, 8)), [x, 0.68, z], 0x7d8384, 0.03);
  }
  k.tag('fitting', 'wheel', 'timber');
  const r = 0.55, t = 0.15, xc = form.w / 2 + skin(d) + r * Math.sin(t) + 0.03;
  put(k, dressing(k.cylinder(r, r, 0.07, 12).rotateZ(Math.PI / 2 + t)), [xc, r * Math.cos(t), 0.2], 0x5a4a38, 0.05);
  put(k, dressing(k.cylinder(0.1, 0.1, 0.16, 8).rotateZ(Math.PI / 2 + t)), [xc, r * Math.cos(t), 0.2], 0x3c342a, 0.04);
};

/** (dome-detail-275) The Podhale sledge left in the snow before the lean-to. */
const sledge: Gear = (k, h) => {
  const c = h.dialect.paint.frame, x = 0.4, z = h.form.d / 2 + 1.0;
  k.tag('fitting', 'sledge', 'timber');
  for (const s of [-1, 1]) put(k, dressing(k.box(1.3, 0.05, 0.05)), [x, 0.025, z + s * 0.22], c, 0.04);
  for (const s of [-1, 1]) for (const e of [-1, 1]) put(k, dressing(k.box(0.05, 0.22, 0.05)), [x + e * 0.45, 0.14, z + s * 0.22], c, 0.04);
  put(k, dressing(k.box(1.1, 0.04, 0.52)), [x, 0.27, z], mix(c, 0x8a7458, 0.3), 0.04);
};

// ------------------------------------------------------------------------------------------------------------ forms

/** (dome-detail-275) `dress`: the kind's own dress, built whatever gear a kit gives it. */
interface HutVariant { form: HutForm; gear?: Gear; dress?: Gear }

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
    dress: both(dressHut, leantoYard),
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
    dress: dressHut,
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
    dress: both(dressHut, gableVents, stiltBraces, fisherYard),
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
    dress: both(dressHut, gableVents, stiltBraces),
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
    dress: both(dressHut, gableVents, stiltBraces),
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
  // (dome-detail-275: a window in each bay of the long walls between the pilasters, a back door, garageYard's apron,
  // hood, name board and rainwater goods)
  servicegarage: {
    form: { id: 'servicegarage', w: 8.4, d: 10.2, wallH: 3.4, lift: 0, roof: 'gable', rise: 1.3, battens: 0.9,
      openings: [{ face: 'front', u: -1.6, y: 0, w: 3.2, h: 3.0, kind: 'garage' }, door('front', 2.7, 0.9, 2.1),
        ...[-3.825, -1.275, 1.275, 3.825].flatMap((u) => [win('left', u, 1.1, 1.3, 1.1), win('right', u, 1.1, 1.3, 1.1)]),
        { face: 'back', u: 0, y: 2.0, w: 1.0, h: 0.8, kind: 'louvre' }, door('back', 2.5, 0.9, 2.1)] },
    gear: garageYard,
  },
  // the motor pool: an open-fronted shed under its skillion, posts along the open side, drums and crates under it
  // (dome-detail-275: the high strip windows in the back and side bays, the side door, motorShed's yard and fittings)
  motorpool: {
    form: { id: 'motorpool', w: 8.6, d: 10.6, wallH: 3.0, lift: 0, roof: 'skillion', rise: 0.6, open: ['front'], battens: 0.9,
      openings: [...[-3.225, -1.075, 1.075, 3.225].map((u) => win('back', u, 1.1, 0.6, 2.1)), door('left', -1.325, 0.9, 2.0),
        win('left', -3.975, 1.1, 0.6, 2.1), ...[-1.325, 1.325].map((u) => win('right', u, 1.1, 0.6, 2.1))] },
    gear: motorShed,
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
  bengal: dialect('mat', 'sheet', 'sunk', paint(BAMBOO, 0x5d4f37, 0x5d4f37, GALVANISED, 0x7b6650, 0x3a2e24), { round: true, footMaterial: 'earth', weights: 'poles' }),
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

/** (dome-detail-275) The char yard's straw stack (a pala: the rice straw stacked round its pole, the pole's tied head
 *  over the cone) at the homestead's back end, and the clay water pots (kolshi) by the front steps. */
const bengalYard: Gear = (k, h) => {
  const d = h.form.d;
  k.tag('fitting', 'strawstack', 'thatch');
  put(k, k.cylinder(0.62, 0.55, 1.4, 10), [-1.0, 0.7, -d / 2 - 1.2], 0xa08a55, 0.08);
  put(k, k.cylinder(0.06, 0.64, 1.1, 10), [-1.0, 1.95, -d / 2 - 1.2], 0xb09a62, 0.08);
  put(k, k.cylinder(0.09, 0.09, 0.4, 6), [-1.0, 2.62, -d / 2 - 1.2], 0x6e5a3c, 0.05);
  k.tag('fitting', 'kolshi', 'tile');
  for (const [x, z, s] of [[0.5, d / 2 + 0.85, 1], [0.95, d / 2 + 0.75, 0.85]] as const) {
    put(k, k.cylinder(0.22 * s, 0.15 * s, 0.42 * s, 8), [x, 0.21 * s, z], 0x8a4a2c, 0.06);
    put(k, k.cylinder(0.09 * s, 0.12 * s, 0.1 * s, 8), [x, 0.47 * s, z], 0x7a4026, 0.05);
  }
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
  kolkhoz: { fieldhut: {}, leanto: { extra: kolkhozYard }, huntingblind: {} },
  lorrain: {
    fieldhut: {}, leanto: {},
    // (dome-detail-275) the farm's long barn: its wide barn door and a window a bay, the yard before and behind it
    // (a maison lorraine: its ochre render over rubble and the low pitch of its canal tiles, the Jaumont-stone casings)
    longhouse: { dialect: { cladding: 'render', covering: 'tile', footing: 'sunk', dado: 0.45, eave: 0.35, verge: 0.2, wallMaterial: 'stone',
      roofMaterial: 'tile', paint: { wall: [0xc4ae86, 0xbaa47c, 0xae9872], trim: 0xbfae84, frame: 0x4a3a2a, roof: [0x9a5a3e, 0xa8653f, 0x8a4e36],
        door: 0x5a4632, dado: 0x9c8e72 } },
    form: { rise: 1.5, stove: undefined, openings: [door('front', -0.9, 2.2, 2.15), win('front', 1.7, 0.6, 0.6, 1.2), win('left', -3.4), win('left', -0.4),
      win('left', 2.6), win('right', -2.4), win('right', 0.6), win('right', 3.4), win('back', 1.2)] }, extra: both(chimney(1.4, -3.0), lorrainYard) },
  },
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
    leanto: { dialect: { cladding: 'batten' }, extra: sledge },
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
    leanto: { extra: andalusYard },
    // the puesto: a whitewashed hide on the ground, a slit to the front and a low door behind
    huntingblind: { form: { w: 1.9, d: 1.8, wallH: 1.45, lift: 0, rise: 0.3,
      openings: [{ face: 'front', u: 0, y: 0.9, w: 1.2, h: 0.22, kind: 'slit' }, door('back', 0, 0.7, 1.3)] }, gear: puestoCover },
  },
  breton: {
    // the customs men's granite hut under its slates
    guardpost: groundPost({ roof: 'gable', rise: 1.0, w: 2.4, d: 2.6 }),
    fishershack: {},
    // the bread-oven house: a small granite outbuilding, its stack on the gable
    saunahut: { form: { stove: undefined }, extra: chimney(0, -1.6) },
    leanto: {},
  },
  hostomel: { motorpool: { extra: roofWeights }, guardpost: { ...towerPost(), extra: bagged } },
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
  saar: { transformershed: {}, motorpool: { extra: roofWeights }, checkpointhut: {}, servicegarage: {} },
  ruhr: { transformershed: {}, motorpool: {}, guardpost: groundPost({ roof: 'gable', rise: 0.8 }) },
  sarajevo: { guardpost: { ...towerPost(), extra: bagged }, transformershed: {}, motorpool: {}, servicegarage: {} },
  glencanyon: { motorpool: {}, transformershed: {}, guardpost: groundPost({ parapet: 0.3, rise: 0.1 }), servicegarage: { form: flat(), extra: swampCooler } },
  navajo: { motorpool: {}, checkpointhut: {} },
  franconian: { guardpost: groundPost(), checkpointhut: {}, transformershed: {}, motorpool: {}, servicegarage: { form: flat() } },
  arctic: { motorpool: {}, servicegarage: {} },
  longleaf: { leanto: {}, huntingblind: { form: { lift: 2.8 } }, fishershack: {}, stilthouse: { form: { lift: 1.2, veranda: 1.6 } } },
  // (dome-detail-275: the saman house's windows down both long walls, its porch and its kizyak)
  tselina: { longhouse: { form: { stove: undefined, openings: [door('front', 0, 1.0, 2.0), ...[-4.2, -1.4, 1.4, 4.2].flatMap((u) => [win('left', u, 0.8, 0.9, 0.9),
    win('right', u, 0.8, 0.9, 0.9)]), win('back', 0, 0.8, 0.9, 0.9)] }, extra: both(chimney(1.4, -3.0), tselinaYard) }, motorpool: {} },
  // the Jamuna's chars
  bengal: {
    // the char homestead: galvanised sheet walls on its earthen plinth above the flood line, the yard-side veranda
    longhouse: {
      dialect: { cladding: 'sheet', footing: 'plinth', shutters: true, paint: { wall: GALVANISED } },
      form: { w: 5.0, d: 10.6, wallH: 2.5, rise: 1.5, plinth: 0.9, stove: undefined,
        openings: [door('right', 0, 1.0, 1.95), win('right', -3.2, 0.9, 0.78, 1.0), win('right', 3.2, 0.9, 0.78, 1.0), win('left', 0, 0.9, 0.7, 1.1)] },
      extra: both(bengalVeranda, bengalYard),
    },
    // the flood-season house on bamboo stilts, its ladder up to the door
    stilthouse: { form: { w: 4.6, d: 6.2, wallH: 2.3, lift: 1.7, rise: 1.35, veranda: 0,
      openings: [door('right', 1.4, 0.85, 1.8), win('right', -1.4, 0.8, 0.7, 0.9), win('front', 0, 0.8, 0.7)] }, gear: both(ladderTo('right', 1.4), bengalStilt) },
    fishershack: { form: { w: 4.2, d: 5.6, wallH: 2.0, rise: 0.9 } },
  },
  kohima: {
    // the Angami house: low plank walls under a deep thatch swept nearly to the ground, the kika over the front gable
    longhouse: {
      dialect: { cladding: 'batten', covering: 'thatch', eave: 0.7, verge: 0.5, paint: { wall: [0x5b4735, 0x856b51, 0x4f3d2d], frame: 0x2f251b,
        roof: [0x7c6b4d, 0x9f8c65, 0x3e3327] } },
      form: { w: 5.2, d: 11.2, wallH: 1.8, rise: 2.9, stove: undefined, openings: [door('front', 0.7, 0.9, 1.5)] },
      gear: both(kika, kohimaYard),
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
      gear: (k, h) => both(ladderTo('right', -(h.form.d / 2 + (h.form.veranda ?? 0) / 2)), mekongYard)(k, h) },
    // the shrimp-pond guard hut on tall stilts, its ladder down to the bund
    fishershack: { form: { w: 3.6, d: 4.6, wallH: 1.8, lift: 1.4, rise: 1.0, openings: [door('right', 0.8, 0.8, 1.6), win('front', 0)] },
      gear: ladderTo('right', 0.8) },
    // the Ca Mau house on stilts under rusted iron, its veranda on the canal side, the jars by the ladder's foot
    stilthouse: { dialect: { covering: 'sheet', paint: { roof: RUSTED_TIN } }, form: { w: 4.8, d: 5.0, wallH: 2.45, lift: 1.7, rise: 1.05, veranda: 1.6 },
      extra: both(jars, camauYard) },
  },
};

/**
 * The kits whose huts wait on their kit: the regional table registers a kit's huts once its architecture id exists. The
 * integration that lands a kit drops it here (integ/225 landed lorrain, goral, tselina and nordland with the hut kit).
 */
export const HUT_KITS_PENDING: ReadonlySet<string> = new Set<string>();

/** Build `kind` in `kit`'s regional form into `k` (its parts and stream). */
export function buildRegionalHut(k: HutTools, kit: string, kind: string): HutFrame {
  const base = HUT_DIALECTS[kit], spec = REGIONAL_HUTS[kit]?.[kind], kf = HUT_FORMS[kind];
  if (!base || !spec || !kf) throw new Error(`hutKit: no ${kind} in ${kit}`);
  const d: HutDialect = { ...base, ...spec.dialect, paint: { ...base.paint, ...spec.dialect?.paint } } as HutDialect;
  const form: HutForm = { ...kf.form, ...spec.form };
  const h = buildHut(k, form, d);
  both(spec.gear ?? kf.gear, spec.extra, kf.dress)(k, h);
  return h;
}
