// Release 227: the Zubr's and Zubr II's own frontal ERA (owner 2026-10-16: "for our turret upghrades, it should be a
// brand new era packages for both though, donnt make it just copy the t90ms. innovate for the hetman 2 and zubr 2 and
// also the zubr"). An original Polish concept in an orthogonal, framed language of the ERAWA-2 lineage, not a T-90M/MS
// Relikt layout: welded cheek boxes faced by a grid of cassettes between perimeter bars ("Krata", the Zubr, level 1),
// raised by the Zubr II to raked boxes faced by a stepped terrace of two-layer cassettes that funnel into the mantlet
// ("Krata-2", level 2); framed glacis fields (level 1) or stepped glacis terraces (level 2); framed lower-plate fields;
// and fitted front-skirt grids. The two read as one family at two levels of advancement and as a national design
// distinct from Hetman II's diagonal prow. Every module is bound to an existing gameplay ERA sector with authored hit
// faces; every box, frame, carrier, pocket and housing is permanent and survives stripEra/resetEra.
//
// Frames: the T-72B3M (2016) donor turret's frame (origin on the ring centre, +Z forward, +X the vehicle's left; x < 0
// is the *_L sector) and the T-72B3 hull frame. The donor casting is never reshaped: every box and tile is seated by
// ray on it or on the box laid on it.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {blindTube} from './measuredPrimitives.ts';
import {Stock, sectionLoft, crosswiseSolid, eraModule, sectorOf, hardwareBlock, mosaicLayout, assertHullPart,
  assertTurretPart, nightLens, tagFrontPart, type LoftStation, type V3} from './eraModuleKit.ts';
import type {SectionPoint} from './sectionSolid.ts';
import type {PolishFrontSkirt} from './nationalPoland.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {cylZ} = KIT;

type PolishLevel = 1 | 2;
const SIDES = [-1, 1] as const;
const idOf = (level: PolishLevel): string => level === 1 ? 't72b3_zubr' : 't72b3_zubr_ii';
const tup = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];

/** An oriented 12-triangle box: its x along `along`, z along `normal` (y completes the frame), centred at `centre`. */
function orientedBox(size: V3, centre: THREE.Vector3, along: THREE.Vector3, normal: THREE.Vector3): THREE.BufferGeometry {
  const x = along.clone().normalize(), z = normal.clone().normalize();
  const xo = x.clone().addScaledVector(z, -x.dot(z)).normalize(), y = z.clone().cross(xo).normalize();
  return new THREE.BoxGeometry(...size).applyMatrix4(new THREE.Matrix4().makeBasis(xo, y, z)).translate(centre.x, centre.y, centre.z);
}

/** A two-layer (stack) cassette's ring in its own (u outward, v up its face) plane: a base layer, a top layer inset 12
 * mm with 15 mm chamfers (near tier); a plain block on the far tier. The base sinks 4 mm into its seat. */
function stackRing(P: TankBuilderPort, h: number, base: number, top: number, inset = .012, chamfer = .015): SectionPoint[] {
  const t = base + top;
  if (!P.q) return [[-.004, 0], [t, 0], [t, h], [-.004, h]];
  return [[-.004, 0], [base, 0], [base, inset], [t - chamfer, inset], [t, inset + chamfer], [t, h - inset - chamfer],
    [t - chamfer, h - inset], [base, h - inset], [base, h], [-.004, h]];
}

/** A stack cassette laid on a flat seat: its face's bottom-left corner at `corner`, width along `along`, height along
 * `up` (in the seat plane), thickness along `normal`. */
export function stackTile(P: TankBuilderPort, corner: THREE.Vector3, along: THREE.Vector3, up: THREE.Vector3, normal: THREE.Vector3,
  w: number, h: number, base: number, top: number): THREE.BufferGeometry {
  const ring = stackRing(P, h, base, top);
  const a = along.clone().normalize();
  return sectionLoft([0, w].map(s => ({o: tup(corner.clone().addScaledVector(a, s)), out: tup(normal.clone().normalize()),
    up: tup(up.clone().normalize()), ring})));
}

// ---------------------------------------------------------------------------------------------------------------------
// Turret: the cheek boxes and their cassette faces

interface BoxPlan {
  /** Outer-face plan path at the box's foot, |x| (mirrored by side), from the mantlet end to the flank end. */
  path: readonly (readonly [number, number])[];
  y0: number; y1: number; wall: number; floor: number; lid: number; rake: number;
  /** Tile columns per wall segment: their widths (level 1) or, with `fit`, only their count (each width fitted to the
   * raked face's narrowest span); rows bottom to top (heights) with the bars between them. */
  columns: readonly (readonly number[])[];
  fit?: {gap: number};
  rows: readonly (readonly [number, number])[];
  bars: readonly (readonly [number, number])[];
  tile: {base: number; top: number; proudPerRow: number} | {single: number};
  /** The welded frame: how far its bars stand out of the wall (the corner uprights 3 mm further, the mullions 3 mm less:
   * no two frame faces share a plane), and whether mullions stand between the tile columns. */
  frame: {proud: number; mullions: boolean};
}
const BOXES: Readonly<Record<PolishLevel, BoxPlan>> = {
  1: {path: [[.39, 1.44], [.98, 1.44], [1.40, 1.02], [1.40, .62]], y0: .11, y1: .47, wall: .025, floor: .025, lid: .025, rake: 0,
    columns: [[.175, .175, .175], [.175, .175, .175], [.175, .175]],
    rows: [[.1475, .2775], [.3075, .4375]], bars: [[.125, .14], [.285, .30], [.445, .46]], tile: {single: .055},
    // (round 2, 2026-10-16; the critic: the Zubr's cheek "reads as a plain two-row crate ... the thin frame posts barely
    // show"): the Krata frame stands 4 cm out between its .055 m tiles, a mullion between every two columns
    frame: {proud: .040, mullions: true}},
  // the jamb starts 8 cm further out than the Zubr's end plate so its cassettes, standing out towards the mantlet,
  // stay outboard of the mantlet's sweep (|x| .39) at their thickest (the lowest course, .115 m)
  2: {path: [[.47, 1.36], [.59, 1.48], [1.00, 1.48], [1.44, 1.04], [1.44, .62]], y0: .11, y1: .53, wall: .025, floor: .025,
    lid: .025, rake: 12,
    // (counts; fitted widths of about .11, .15, .165 and .17 m: a raked face shortens as it rises, by .035 m at each
    // mitred corner at the top course, and every tile stays on its own face at every height)
    columns: [[.15], [.19, .19], [.185, .185, .185], [.185, .185]], fit: {gap: .016},
    rows: [[.13, .243], [.263, .376], [.396, .509]], bars: [[.11, .13], [.243, .263], [.376, .396], [.509, .529]],
    tile: {base: .05, top: .035, proudPerRow: .015}, frame: {proud: .013, mullions: false}},
};

interface Seg { a: THREE.Vector3; b: THREE.Vector3; dir: THREE.Vector3; n: THREE.Vector3; len: number }
function segments(side: number, path: BoxPlan['path']): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = new THREE.Vector3(side * path[i][0], 0, path[i][1]), b = new THREE.Vector3(side * path[i + 1][0], 0, path[i + 1][1]);
    const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
    let n = new THREE.Vector3(dir.z, 0, -dir.x);
    if (n.dot(a.clone().add(b)) < 0) n.negate();
    out.push({a, b, dir, n, len});
  }
  return out;
}

/** Station frames at the path's vertices: the box ends' caps lie in the end plates' planes (x = .39, z = .62), the
 * interior vertices are mitred. */
function vertexFrames(side: number, segs: readonly Seg[]): {o: THREE.Vector3; out: THREE.Vector3; scale: number}[] {
  const frames: {o: THREE.Vector3; out: THREE.Vector3; scale: number}[] = [];
  const first = new THREE.Vector3(0, 0, 1), last = new THREE.Vector3(side, 0, 0);
  frames.push({o: segs[0].a, out: first, scale: 1 / first.dot(segs[0].n)});
  for (let i = 1; i < segs.length; i++) {
    const b = segs[i - 1].n.clone().add(segs[i].n).normalize();
    frames.push({o: segs[i].a, out: b, scale: 1 / b.dot(segs[i].n)});
  }
  frames.push({o: segs[segs.length - 1].b, out: last, scale: 1 / last.dot(segs[segs.length - 1].n)});
  return frames;
}

function cheekBox(P: TankBuilderPort, casting: Stock, side: number, plan: BoxPlan, level: PolishLevel): Stock {
  const id = idOf(level), segs = segments(side, plan.path), frames = vertexFrames(side, segs);
  const tan = Math.tan(plan.rake * Math.PI / 180), rake = (y: number) => (y - plan.y0) * tan;
  const station = (f: typeof frames[number], ring: SectionPoint[]): LoftStation => ({o: tup(f.o), out: tup(f.out), up: [0, 1, 0], ring});
  // the wall: constant thickness, raked back by plan.rake
  const wall = sectionLoft(frames.map(f => {
    const uo = (y: number) => -rake(y) * f.scale, ui = (y: number) => uo(y) - plan.wall * f.scale;
    return station(f, [[ui(plan.y0), plan.y0], [uo(plan.y0), plan.y0], [uo(plan.y1), plan.y1], [ui(plan.y1), plan.y1]]);
  }));
  assertTurretPart(id, 'cheek box wall', wall);
  P.addExternalArmor('turret', wall);
  // the floor and the lid, each from the wall's inner face (2 mm into it) to 4 mm inside the casting
  const plate = (y0: number, y1: number, name: string) => {
    const g = sectionLoft(frames.map(f => {
      const ui = (y: number) => -rake(y) * f.scale - (plan.wall - .002) * f.scale, ym = (y0 + y1) / 2;
      const start = f.o.clone().setY(ym).addScaledVector(f.out, ui(ym) - .01);
      const hit = casting.face(tup(start), tup(f.out.clone().negate()));
      const uc = hit.point.clone().setY(0).sub(f.o).dot(f.out) - .004;
      return station(f, [[uc, y0], [ui(y0), y0], [ui(y1), y1], [uc, y1]]);
    }));
    assertTurretPart(id, name, g);
    P.addExternalArmor('turret', g);
  };
  plate(plan.y0, plan.y0 + plan.floor, 'cheek box floor');
  plate(plan.y1 - plan.lid, plan.y1, 'cheek box lid');
  // the end plates, from the wall back to the casting (the mantlet end in the plane x = .39, the flank end in z = .62)
  const heights = [plan.y0, plan.y0 + (plan.y1 - plan.y0) / 3, plan.y0 + 2 * (plan.y1 - plan.y0) / 3, plan.y1];
  for (const [k, f] of [[0, frames[0]], [frames.length - 1, frames[frames.length - 1]]] as const) {
    const across = k === 0 ? new THREE.Vector3(side, 0, 0) : new THREE.Vector3(0, 0, 1);
    const inner = (y: number) => -rake(y) * f.scale - (plan.wall - .002) * f.scale;
    const ring = (shift: number): SectionPoint[] => {
      const back = heights.map(y => {
        const start = f.o.clone().setY(y).addScaledVector(f.out, inner(y)).addScaledVector(across, shift);
        const hit = casting.face(tup(start), tup(f.out.clone().negate()));
        return [hit.point.clone().setY(0).sub(f.o).sub(across.clone().multiplyScalar(shift)).dot(f.out) - .004, y] as [number, number];
      });
      return [...back, [inner(plan.y1), plan.y1], [inner(plan.y0), plan.y0]];
    };
    const g = sectionLoft([0, plan.wall].map(sh => ({o: tup(f.o.clone().addScaledVector(across, sh)), out: tup(f.out),
      up: [0, 1, 0] as V3, ring: ring(sh)})));
    assertTurretPart(id, 'cheek box end plate', g);
    P.addExternalArmor('turret', g);
  }
  return new Stock(P.spec.id, [wall]);
}

/** The wall face's outward normal on segment s (raked back by plan.rake). */
const faceNormal = (s: Seg, rake: number): THREE.Vector3 =>
  s.n.clone().multiplyScalar(Math.cos(rake * Math.PI / 180)).add(new THREE.Vector3(0, Math.sin(rake * Math.PI / 180), 0)).normalize();

/** The raked wall face's span along segment i (its `along` coordinate from the segment's foot vertex) at height y: the
 * face's vertices at that height lie on the wall's station frames (cheekBox), so the face shortens at the mitred
 * (convex) corners as it rises and runs on along the oblique end plate at the jamb. */
function faceSpan(side: number, segs: readonly Seg[], plan: BoxPlan, i: number, y: number): [number, number] {
  const frames = vertexFrames(side, segs), s = segs[i], d = (y - plan.y0) * Math.tan(plan.rake * Math.PI / 180);
  const at = (k: number) => frames[k].o.clone().addScaledVector(frames[k].out, -d * frames[k].scale).sub(s.a).dot(s.dir);
  return [at(i), at(i + 1)];
}

function cheekFaces(P: TankBuilderPort, wall: Stock, side: number, plan: BoxPlan, level: PolishLevel): void {
  const id = idOf(level), segs = segments(side, plan.path), tan = Math.tan(plan.rake * Math.PI / 180);
  const faceAt = (s: Seg, along: number, y: number): THREE.Vector3 =>
    s.a.clone().addScaledVector(s.dir, along).addScaledVector(s.n, -(y - plan.y0) * tan).setY(y);
  const seatOn = (s: Seg, along: number, y: number): THREE.Vector3 => {
    const n = faceNormal(s, plan.rake), p = faceAt(s, along, y);
    return wall.face(tup(p.clone().addScaledVector(n, .2)), tup(n.clone().negate())).point;
  };
  const yLow = plan.rows[0][0], yHigh = plan.rows[plan.rows.length - 1][1];
  segs.forEach((s, i) => {
    const n = faceNormal(s, plan.rake), up = new THREE.Vector3(0, 1, 0).addScaledVector(s.n, -tan).normalize();
    // the tiles' common span: on the face at every height of the courses (a tile's ends are square to its wall), clear of
    // the box's end uprights (.015 m) and of the corner uprights
    const [s0, e0] = faceSpan(side, segs, plan, i, yLow), [s1, e1] = faceSpan(side, segs, plan, i, yHigh);
    let lo = Math.max(s0, s1), hi = Math.min(e0, e1), cols = plan.columns[i], gap: number, at: number;
    if (plan.fit) {
      // (the box's end uprights stand on the wall's first and last .015 m, wherever the raked face runs on past them)
      lo = i === 0 ? Math.max(lo, 0) + .018 : lo + .012; hi = i === segs.length - 1 ? Math.min(hi, s.len) - .018 : hi - .012;
      gap = plan.fit.gap;
      const w = (hi - lo - (cols.length - 1) * gap) / cols.length;
      cols = cols.map(() => w); at = lo;
    } else {
      gap = (hi - lo - cols.reduce((a, b) => a + b, 0)) / (cols.length + 1); at = lo + gap;
    }
    for (const [ci, w] of cols.entries()) {
      plan.rows.forEach(([r0, r1], r) => {
        const corner = seatOn(s, at, r0);
        let g: THREE.BufferGeometry;
        if ('single' in plan.tile) {
          const c = corner.clone().addScaledVector(s.dir, w / 2).addScaledVector(up, (r1 - r0) / 2 / Math.cos(plan.rake * Math.PI / 180))
            .addScaledVector(n, plan.tile.single / 2 - .004);
          g = orientedBox([w, (r1 - r0), plan.tile.single], c, s.dir, n);
        } else {
          const base = plan.tile.base + plan.tile.proudPerRow * (plan.rows.length - 1 - r);
          g = stackTile(P, corner, s.dir, up, n, w, (r1 - r0) / Math.cos(plan.rake * Math.PI / 180), base, plan.tile.top);
        }
        const bolt = 'single' in plan.tile ? [] : [hardwareBlock(tup(corner.clone().addScaledVector(s.dir, w / 2)
          .addScaledVector(up, (r1 - r0) / Math.cos(plan.rake * Math.PI / 180) - .035).addScaledVector(n, plan.tile.base + plan.tile.proudPerRow * (plan.rows.length - 1 - r) + plan.tile.top)),
          [.024, .016, .008], {x: tup(s.dir), y: tup(up)})];
        eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side), geometry: g, outward: tup(n), minDot: .5,
          name: `cheek cassette ${i}.${r}`, hardware: bolt, guard: (nm, geo) => assertTurretPart(id, nm, geo)});
      });
      at += w + gap;
      // a mullion in the gap after this column (not after the last)
      if (plan.frame.mullions && ci < cols.length - 1) {
        const y0 = plan.bars[0][1], y1 = plan.bars[plan.bars.length - 1][0], d = plan.frame.proud - .003;
        const g = orientedBox([.012, y1 - y0 + .004, d + .004], seatOn(s, at - gap / 2, (y0 + y1) / 2).addScaledVector(n, d / 2 - .002), s.dir, n);
        assertTurretPart(id, 'cheek mullion', g);
        P.addEquipment('turretDetail', g);
      }
    }
    // perimeter bars across this wall: bottom, middle and top (level 2: between every row), each the face's length at
    // its own height
    for (const [b0, b1] of plan.bars) {
      const [a0, a1] = faceSpan(side, segs, plan, i, b1), [c0, c1] = faceSpan(side, segs, plan, i, b0);
      const from = Math.max(a0, c0), to = Math.min(a1, c1);
      const p = seatOn(s, (from + to) / 2, (b0 + b1) / 2).addScaledVector(n, plan.frame.proud / 2 - .002);
      const g = orientedBox([to - from, b1 - b0, plan.frame.proud + .004], p, s.dir, n);
      assertTurretPart(id, 'cheek bar', g);
      P.addEquipment('turretDetail', g);
    }
  });
  // uprights at the path's vertices (the walls' ends and corners)
  const verts = [segs[0].a, ...segs.map(s => s.b)];
  verts.forEach((v, k) => {
    const sA = segs[Math.max(0, k - 1)], sB = segs[Math.min(segs.length - 1, k)];
    const n = faceNormal(sA, plan.rake).add(faceNormal(sB, plan.rake)).normalize(), h = plan.y1 - plan.y0;
    const p = v.clone().setY(plan.y0 + h / 2).addScaledVector(n, .2);
    const hit = wall.tryFace(tup(p), tup(n.clone().negate()));
    if (!hit) return;
    const along = sA.dir.clone().add(sB.dir).normalize();
    // the box's two end uprights stand on their wall, not past its end
    const shift = k === 0 ? .0075 : k === verts.length - 1 ? -.0075 : 0;
    const d = plan.frame.proud + .003;
    const g = orientedBox([.015, h / Math.cos(plan.rake * Math.PI / 180), d + .004],
      hit.point.addScaledVector(n, d / 2 - .002).addScaledVector(along, shift), along, n);
    assertTurretPart(id, 'cheek upright', g);
    P.addEquipment('turretDetail', g);
  });
}

/** Zubr (level 1) or Zubr II (level 2): the welded cheek box on each side and its cassette face. */
export function polishCheekBoxes(P: TankBuilderPort, casting: Stock, level: PolishLevel): void {
  const plan = BOXES[level];
  for (const side of SIDES) {
    const wall = cheekBox(P, casting, side, plan, level);
    try { cheekFaces(P, wall, side, plan, level); } finally { wall.dispose(); }
  }
}

/** The roof row (level 1: two flat .22 m tiles a side in a three-bar frame) or grid (level 2: four two-layer tiles a
 * side, a base layer and a chamfered face layer, in two columns stepped back outboard, in a seven-bar frame) on the
 * dome's front, each tile tilted to its seat (its lowest corner 4 mm into the dome). The level-2 grid keeps behind the
 * cheek box's lid, whose inner edge runs diagonally across the dome from (.955, .65) to (.47, .95), and its tops under
 * .67 m (the dome rises to the rear and the centre); its outer column stands clear of the roof plate (rear edge z .396). */
export function polishRoofGrid(P: TankBuilderPort, casting: Stock, level: PolishLevel): void {
  const id = idOf(level);
  // tiles as plan rectangles [x0, x1, z0, z1] (|x|)
  const L = level === 1
    ? {tiles: [[.435, .655, .57, .79], [.685, .905, .57, .79]], base: .035, top: 0}
    : {tiles: [[.45, .64, .49, .63], [.45, .64, .645, .785], [.66, .83, .415, .545], [.66, .83, .56, .69]], base: .022, top: .020};
  for (const side of SIDES) {
    for (const [X0, X1, z0, z1] of L.tiles) {
      const X = (X0 + X1) / 2, z = (z0 + z1) / 2, sx = X1 - X0, sz = z1 - z0, x = side * X;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
        new THREE.Vector3(x + a * sx / 2, casting.top(x + a * sx / 2, z + b * sz / 2), z + b * sz / 2));
      const n = corners[2].clone().sub(corners[0]).cross(corners[3].clone().sub(corners[1])).normalize();
      if (n.y < 0) n.negate();
      const centre = corners.reduce((c, p) => c.add(p), new THREE.Vector3()).multiplyScalar(.25);
      const low = Math.min(...corners.map(p => p.clone().sub(centre).dot(n)));
      let g: THREE.BufferGeometry;
      if (!L.top) {
        // the box's z is the seat normal, its thickness t + 4 mm sunk; the tile's face is the hit face
        g = orientedBox([sx, sz, L.base + .004], centre.clone().addScaledVector(n, low + (L.base - .004) / 2), new THREE.Vector3(1, 0, 0), n);
      } else {
        const along = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize(), up = n.clone().cross(along).normalize();
        const corner = centre.clone().addScaledVector(n, low).addScaledVector(along, -sx / 2).addScaledVector(up, -sz / 2);
        g = stackTile(P, corner, along, up, n, sx, sz, L.base, L.top);
      }
      g.computeBoundingBox();
      if (g.boundingBox!.max.y > .67 + 1e-4) throw new Error(`${id}: roof tile top ${g.boundingBox!.max.y.toFixed(3)} over .67`);
      eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', x), geometry: g, outward: tup(n), minDot: .5,
        name: 'roof tile', guard: (nm, geo) => assertTurretPart(id, nm, geo)});
    }
    // the welded frame, 12 mm round the tiles: level 1, front and rear bars across the row and one between its tiles;
    // level 2, a bar along each column's outer sides and one between the columns, and a front and a rear bar per column
    const at = (X: number, z: number) => new THREE.Vector3(side * X, casting.top(side * X, z), z);
    const bars: [THREE.Vector3, THREE.Vector3][] = [];
    if (level === 1) {
      const [a, b] = L.tiles, z0 = a[2] - .012, z1 = a[3] + .012, x0 = a[0] - .012, x1 = b[1] + .012, xm = (a[1] + b[0]) / 2;
      bars.push([at(x0, z0), at(x1, z0)], [at(x0, z1), at(x1, z1)], [at(xm, z0), at(xm, z1)]);
    } else {
      const inner = L.tiles.slice(0, 2), outer = L.tiles.slice(2);
      const xi = inner[0][0] - .012, xm = (inner[0][1] + outer[0][0]) / 2, xo = outer[0][1] + .012;
      const span = (col: number[][]) => [col[0][2] - .012, col[col.length - 1][3] + .012];
      const [ia, ib] = span(inner), [oa, ob] = span(outer);
      bars.push([at(xi, ia), at(xi, ib)], [at(xm, Math.min(ia, oa)), at(xm, Math.max(ib, ob))], [at(xo, oa), at(xo, ob)],
        [at(xi, ia), at(xm, ia)], [at(xi, ib), at(xm, ib)], [at(xm, oa), at(xo, oa)], [at(xm, ob), at(xo, ob)]);
    }
    for (const [k, [a, b]] of bars.entries()) {
      const along = b.clone().sub(a), len = along.length(), mid = a.clone().add(b).multiplyScalar(.5);
      const n = new THREE.Vector3(0, 1, 0);
      // (level 2's bar between the columns is 14 mm wide: 3 mm clear of the tiles on both sides)
      const g = orientedBox([len, level === 2 && k === 1 ? .014 : .02, .024], mid.addScaledVector(n, .008), along, n);
      assertTurretPart(id, 'roof frame bar', g);
      P.addEquipment('turretDetail', g);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Hull: glacis fields (level 1) or terraces (level 2), lamp pockets or LED clusters, lower-plate fields, front skirts

interface HullSurface { glacisAt(z: number): number; plateAt(x: number, y: number): THREE.Vector3 }

/** The glacis's unit axes: across (x), down the slope, and the outward normal (the T-72B3's 26.5-degree plate). */
function glacisAxes(g: HullSurface, z0: number, z1: number): {across: THREE.Vector3; down: THREE.Vector3; n: THREE.Vector3} {
  const down = new THREE.Vector3(0, g.glacisAt(z1) - g.glacisAt(z0), z1 - z0).normalize();
  const across = new THREE.Vector3(1, 0, 0), n = across.clone().cross(down).negate().normalize();
  if (n.y < 0) n.negate();
  return {across, down, n};
}

/** Four bars of a bolted frame on a plane: corner o, edges u (across) and v (down the slope), normal n. */
function planeFrame(P: TankBuilderPort, id: string, o: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3,
  w: number, h: number, bucket = 'hullExternalArmor'): void {
  const lu = u.length(), lv = v.length(), uu = u.clone().normalize(), vv = v.clone().normalize();
  const bar = (centre: THREE.Vector3, along: THREE.Vector3, len: number) => {
    const g = orientedBox([len, w, h + .004], centre.clone().addScaledVector(n, (h - .004) / 2), along, n);
    assertHullPart(id, 'glacis frame', g);
    P.add(bucket, g);
  };
  bar(o.clone().addScaledVector(uu, lu / 2).addScaledVector(vv, w / 2), uu, lu);
  bar(o.clone().addScaledVector(uu, lu / 2).addScaledVector(vv, lv - w / 2), uu, lu);
  bar(o.clone().addScaledVector(vv, lv / 2).addScaledVector(uu, w / 2), vv, lv - 2 * w);
  bar(o.clone().addScaledVector(vv, lv / 2).addScaledVector(uu, lu - w / 2), vv, lv - 2 * w);
}

const FIELDS = [{z: [2.22, 2.62] as const, x: [.05, 1.08] as const}, {z: [2.66, 3.06] as const, x: [.05, .78] as const}];
const RAIL = {w: .035, h: .04};

function level1Glacis(P: TankBuilderPort, g: HullSurface): void {
  const id = idOf(1), cassette = {down: .17, thick: .06, pitch: .24, gap: .015};
  for (const f of FIELDS) for (const side of SIDES) {
    const {across, down, n} = glacisAxes(g, f.z[0], f.z[1]);
    const o = new THREE.Vector3(side * f.x[side > 0 ? 0 : 1], g.glacisAt(f.z[0]), f.z[0]);
    const width = f.x[1] - f.x[0], slope = new THREE.Vector3(0, g.glacisAt(f.z[1]) - g.glacisAt(f.z[0]), f.z[1] - f.z[0]);
    planeFrame(P, id, o, across.clone().multiplyScalar(width), slope, n, RAIL.w, RAIL.h);
    // the cassettes: a fitted brick bond of two courses inside the frame
    const inX = width - 2 * (RAIL.w + .006), x0 = f.x[0] + RAIL.w + .006, inV = slope.length() - 2 * (RAIL.w + .006);
    const rows = 2, rowH = (inV - cassette.gap) / rows;
    for (const piece of mosaicLayout(inX, cassette.pitch, rows, .5, .09, cassette.gap)) {
      const X = x0 + (piece.start + piece.end) / 2, v0 = RAIL.w + .006 + piece.row * (rowH + cassette.gap) + rowH / 2;
      const centre = new THREE.Vector3(side * X, g.glacisAt(f.z[0]), f.z[0]).addScaledVector(down, v0)
        .addScaledVector(n, cassette.thick / 2 - .004);
      const box = new THREE.BoxGeometry(piece.end - piece.start, cassette.thick, rowH)
        .applyMatrix4(new THREE.Matrix4().makeBasis(across, n, across.clone().cross(n))).translate(centre.x, centre.y, centre.z);
      eraModule(P, {owner: 'hull', sector: sectorOf('glacis_era', side), geometry: box, outward: tup(n), minDot: .5,
        name: 'glacis cassette', guard: (nm, geo2) => assertHullPart(id, nm, geo2)});
    }
  }
}

/** The armoured lamp pocket (level 1): a welded hood on the glacis round the existing round driving lamp, its lens
 * recessed 11 mm inside the hood's mouth. */
function lampPockets(P: TankBuilderPort, g: HullSurface): void {
  const id = idOf(1), x0 = .80, x1 = 1.02, z0 = 2.80, z1 = 3.00, t = .03, top = [1.16, 1.11] as const;
  for (const side of SIDES) {
    const ring = (z: number, yt: number): SectionPoint[] => {
      const yb = g.glacisAt(z) - .004, a = side * x0, b = side * x1, lo = Math.min(a, b), hi = Math.max(a, b);
      return [[lo, yb], [lo + t, yb], [lo + t, yt - t], [hi - t, yt - t], [hi - t, yb], [hi, yb], [hi, yt], [lo, yt]];
    };
    const hood = sectionLoft([[z0, top[0]], [z1, top[1]]].map(([z, yt]) => ({o: [0, 0, z] as V3, out: [1, 0, 0] as V3, up: [0, 1, 0] as V3, ring: ring(z, yt)})));
    assertHullPart(id, 'lamp pocket', hood);
    P.addExternalArmor('hull', hood);
    // its back plate, closing the hood behind the lamp
    const back = sectionLoft([z0, z0 + .03].map(z => {
      const yb = g.glacisAt(z) - .004, lo = side < 0 ? -x1 + t - .002 : x0 + t - .002, hi = side < 0 ? -x0 - t + .002 : x1 - t + .002;
      return {o: [0, 0, z] as V3, out: [1, 0, 0] as V3, up: [0, 1, 0] as V3, ring: [[lo, yb], [hi, yb], [hi, top[0] - t + .002], [lo, top[0] - t + .002]] as SectionPoint[]};
    }));
    P.addExternalArmor('hull', tagFrontPart(back, 'lamp pocket back plate', 'hull'));
    // the round lamp: a bored housing whose mouth is 2 mm inside the pocket's, its lens 10 mm inside that mouth and
    // lapping 6 mm into the bore's floor
    const x = side * (x0 + x1) / 2, y = .995, mouth = z1 - .002;
    P.addEquipment('hullDetail', tagFrontPart(blindTube(.073, .058, .085, .016, P.q ? 16 : 12), 'pocket lamp housing', 'hull'), x, y, mouth - .0425);
    P.addEquipment('hullGlass', tagFrontPart(nightLens(cylZ(.056, .012, P.q ? 16 : 12), 'headlight'), 'pocket lamp lens', 'hull'), x, y, mouth - .010 - .006);
  }
}

const TERRACES = [{z: [2.22, 2.54] as const, x: 1.00, pieces: 4, stagger: 0}, {z: [2.58, 2.86] as const, x: 1.00, pieces: 4, stagger: .5},
  {z: [2.90, 3.12] as const, x: .78, pieces: 3, stagger: 0}];
const TERRACE_TOP = Math.tan(16.8 * Math.PI / 180);

function level2Glacis(P: TankBuilderPort, g: HullSurface): void {
  const id = idOf(2), cassette = {down: .26, base: .05, top: .04, gap: .015};
  for (const t of TERRACES) {
    const [z0, z1] = t.z, y0 = g.glacisAt(z0) + .025, topAt = (z: number) => y0 - (z - z0) * TERRACE_TOP;
    // the permanent wedge carrier across both sides, its top at 16.8 degrees, its front riser 6-9 cm
    const carrier = crosswiseSolid([-t.x - .02, t.x + .02].map(x => ({x, ring: [[z0, g.glacisAt(z0) - .004],
      [(z0 + z1) / 2, g.glacisAt((z0 + z1) / 2) - .004], [z1, g.glacisAt(z1) - .004], [z1, topAt(z1)], [z0, y0]] as [number, number][]})));
    assertHullPart(id, 'glacis terrace', carrier);
    P.addExternalArmor('hull', carrier);
    const down = new THREE.Vector3(0, -TERRACE_TOP, 1).normalize(), n = new THREE.Vector3(0, 1, TERRACE_TOP).normalize();
    const along = Math.min(cassette.down, (z1 - z0) / Math.cos(Math.atan(TERRACE_TOP)) - .03);
    for (const side of SIDES) {
      for (const piece of mosaicLayout(t.x - .03, (t.x - .03 + cassette.gap) / t.pieces, 1 + (t.stagger ? 1 : 0), .5, .09, cassette.gap)) {
        if (t.stagger && piece.row === 0) continue;
        const a = .03 + piece.start, b = .03 + piece.end;
        const corner = new THREE.Vector3(side * (side > 0 ? a : b), topAt(z0 + .015), z0 + .015);
        const geo = stackTile(P, corner, new THREE.Vector3(1, 0, 0), down, n, b - a, along, cassette.base, cassette.top);
        eraModule(P, {owner: 'hull', sector: sectorOf('glacis_era', side), geometry: geo, outward: tup(n), minDot: .5,
          name: 'glacis terrace cassette', guard: (nm, geo2) => assertHullPart(id, nm, geo2)});
      }
    }
  }
}

/** The LED cluster housings (level 2): armoured boxes on the glacis, each with a 2 x 2 grid of headlight pods (dark
 * cups, lenses recessed 8 mm) under a three-bar louvre hood. */
function ledClusters(P: TankBuilderPort, g: HullSurface): void {
  const id = idOf(2), x0 = .80, x1 = 1.02, z0 = 2.92, z1 = 3.08, top = 1.05;
  for (const side of SIDES) {
    const lo = side < 0 ? -x1 : x0, hi = side < 0 ? -x0 : x1;
    const housing = sectionLoft([z0, z1].map(z => ({o: [0, 0, z] as V3, out: [1, 0, 0] as V3, up: [0, 1, 0] as V3,
      ring: [[lo, g.glacisAt(z) - .004], [hi, g.glacisAt(z) - .004], [hi, top], [lo, top]] as SectionPoint[]})));
    assertHullPart(id, 'LED cluster housing', housing);
    P.addExternalArmor('hull', housing);
    const base = g.glacisAt(z1);
    for (const X of [.855, .965]) for (const dy of [.045, .115]) {
      const x = side * X, y = base + dy;
      P.addEquipment('hullDark', tagFrontPart(blindTube(.032, .026, .04, .014, P.q ? 16 : 10), 'LED pod cup', 'hull'), x, y, z1 + .02 - .002);
      P.addEquipment('hullGlass', tagFrontPart(nightLens(cylZ(.024, .010, P.q ? 16 : 10), 'headlight'), 'LED pod lens', 'hull'), x, y, z1 + .04 - .002 - .008 - .005);
    }
    for (const k of [0, 1, 2]) {
      const y = top - .004 - k * .012;
      P.addEquipment('hullDark', tagFrontPart(new THREE.BoxGeometry(x1 - x0 - .01, .006, .045 - k * .01).rotateX(.35), 'LED louvre', 'hull'), side * (x0 + x1) / 2, y, z1 + (.045 - k * .01) / 2 - .004);
    }
  }
}

/** Polish glacis: level 1 frames and cassettes with the lamp pockets; level 2 terraces with the LED clusters. */
export function polishGlacis(P: TankBuilderPort, level: PolishLevel, g: HullSurface): void {
  if (level === 1) { level1Glacis(P, g); lampPockets(P, g); }
  else { level2Glacis(P, g); ledClusters(P, g); }
}

/** The lower front plate's framed fields: an inner field per side (level 2 also an outer one), two cassettes in the
 * inner field and one in the outer, each bent over the plate's break; the tow-eye bays stay open. */
export function polishLowerPlate(P: TankBuilderPort, level: PolishLevel, g: HullSurface): void {
  const id = idOf(level), ys = [.50, .62, .76], thick = level === 1 ? .055 : .09, inset = RAIL.w + .006;
  const fields = level === 1 ? [{x: [.08, .58] as const, n: 2}] : [{x: [.08, .58] as const, n: 2}, {x: [.76, 1.06] as const, n: 1}];
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  for (const side of SIDES) for (const f of fields) {
    const pts = (X: number) => ys.map(y => g.plateAt(side * X, y));
    // frame: rails up the plate at both edges (bent over its break) and across its foot and head
    for (const X of [f.x[0] + RAIL.w / 2, f.x[1] - RAIL.w / 2]) {
      const p = pts(X);
      const rail = sectionLoft(p.map((q, i) => ({o: tup(q), out: tup(facing(p, i)), up: [1, 0, 0] as V3,
        ring: [[-.004, -RAIL.w / 2], [RAIL.h, -RAIL.w / 2], [RAIL.h, RAIL.w / 2], [-.004, RAIL.w / 2]] as SectionPoint[]})));
      assertHullPart(id, 'lower-plate frame', rail);
      P.addExternalArmor('hull', rail);
    }
    for (const yi of [0, ys.length - 1]) {
      const a = pts(f.x[0])[yi], b = pts(f.x[1])[yi], p = pts((f.x[0] + f.x[1]) / 2);
      const n = facing(p, yi), up = (yi === 0 ? p[1].clone().sub(p[0]) : p[yi - 1].clone().sub(p[yi])).normalize();
      const c = a.clone().add(b).multiplyScalar(.5).addScaledVector(up, RAIL.w / 2).addScaledVector(n, (RAIL.h - .004) / 2);
      const bar = orientedBox([f.x[1] - f.x[0], RAIL.w, RAIL.h + .004], c, X_AXIS, n);
      assertHullPart(id, 'lower-plate frame', bar);
      P.addExternalArmor('hull', bar);
    }
    // cassettes between the rails, bent over the break (level 2: a base layer and an inset top layer)
    const inner = [f.x[0] + inset, f.x[1] - inset], w = (inner[1] - inner[0] - (f.n - 1) * .012) / f.n;
    for (let k = 0; k < f.n; k++) {
      const X0 = inner[0] + k * (w + .012), X1 = X0 + w;
      const ring = (X: number): [number, number][] => {
        const p = pts(X);
        const up0 = p[1].clone().sub(p[0]).normalize(), up2 = p[2].clone().sub(p[1]).normalize();
        p[0].addScaledVector(up0, inset); p[2].addScaledVector(up2, -inset);
        const nn = p.map((_, i) => facing(p, i)), mitre = 1 / Math.max(.5, nn[0].dot(nn[1]));
        const off = (i: number, d: number) => p[i].clone().addScaledVector(nn[i], i === 1 ? d * mitre : d);
        const back = [0, 1, 2].map(i => off(i, -.004));
        if (level === 1) return [...back, off(2, thick), off(1, thick), off(0, thick)].map(q => [q.z, q.y]);
        const baseT = .05, ins = .012;
        const t2 = off(2, thick).addScaledVector(up2, -ins), t0 = off(0, thick).addScaledVector(up0, ins);
        return [...back, off(2, baseT), t2, off(1, thick), t0, off(0, baseT)].map(q => [q.z, q.y]);
      };
      const geo = crosswiseSolid([X0, X1].map(X => ({x: side * X, ring: ring(X)})));
      eraModule(P, {owner: 'hull', sector: sectorOf('glacis_era', side), geometry: geo, outward: [0, -.85, .52], minDot: .5,
        name: 'lower-plate cassette', guard: (nm, geo2) => assertHullPart(id, nm, geo2)});
    }
  }
}

/** The outward normal (forward-down) of the bent plate at point i of a bottom-to-top plate polyline. */
function facing(p: readonly THREE.Vector3[], i: number): THREE.Vector3 {
  const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], d = b.clone().sub(a);
  const n = new THREE.Vector3(0, -d.z, d.y).normalize();
  return n.z < 0 ? n.negate() : n;
}

/** The Zubr II's hull-screen support arm stands on a mount shoe on its front bay at z 2.615-2.745
 * (nationalPolandProtection.ts): the bay's cassette grid ends 2 cm short of the shoe, its end upright clear of the arm. */
const ZUBR_II_SHOE_Z = 2.615;

/** The front bay's fitted cassette grid between permanent bars, and cassettes on the front return's falling face (the
 * Zubr: two courses of two in brick bond; the Zubr II: a 2 x 2 grid fitted inside the return's outer face). The Zubr's
 * grid leaves a slot round its hull screen's support arm and shoe (z 2.30): two columns of three; the Zubr II's three
 * columns end ahead of its shoe. */
export function polishFrontSkirt(P: TankBuilderPort, level: PolishLevel, s: PolishFrontSkirt): void {
  const id = idOf(level), b = s.bay, thick = level === 1 ? .06 : .09;
  const z2 = [b.flat[0] + .01, ZUBR_II_SHOE_Z - .02], w2 = (z2[1] - z2[0] - 2 * .015) / 3;
  const columns: [number, number][] = level === 1 ? [[b.flat[0] + .01, 2.215], [2.385, b.flat[1] - .01]]
    : [0, 1, 2].map(k => [z2[0] + k * (w2 + .015), z2[0] + k * (w2 + .015) + w2] as [number, number]);
  // the Zubr: three courses of two (6 a side, the plan's count) round the screen-arm slot; the Zubr II: three of three
  const zubrRow = (b.high - b.low - .012 - 2 * .016) / 3;
  const rows: [number, number][] = level === 1 ? [0, 1, 2].map(k => [b.low + .006 + k * (zubrRow + .016), b.low + .006 + k * (zubrRow + .016) + zubrRow] as [number, number])
    : [[b.low + .006, b.low + .196], [b.low + .211, b.low + .401], [b.low + .416, Math.min(b.high, 1.33) - .006]];
  for (const side of SIDES) {
    const n = new THREE.Vector3(side, 0, 0);
    for (const [z0, z1] of columns) for (const [y0, y1] of rows) {
      const geo = level === 1
        ? new THREE.BoxGeometry(thick + .005, y1 - y0, z1 - z0).translate(side * (b.outer + (thick - .005) / 2), (y0 + y1) / 2, (z0 + z1) / 2)
        : stackTile(P, new THREE.Vector3(side * b.outer, y0, side > 0 ? z1 : z0), new THREE.Vector3(0, 0, side > 0 ? -1 : 1),
          new THREE.Vector3(0, 1, 0), n, z1 - z0, y1 - y0, .05, thick - .05);
      eraModule(P, {owner: 'hull', sector: sectorOf('skirt_era', side), geometry: geo, outward: [side, 0, 0], minDot: .5,
        name: 'front-skirt cassette', guard: (nm, g2) => assertHullPart(id, nm, g2, {skirtTop: b.high})});
    }
    // the grid's permanent bars: along its foot, between its rows and along its head (split round the Zubr's screen-arm
    // slot), and its column ends
    const zA = columns[0][0] - .008, zB = columns[columns.length - 1][1] + .008;
    const barY = [rows[0][0] - .006, ...rows.slice(1).map((r, i) => (rows[i][1] + r[0]) / 2), rows[rows.length - 1][1] + .006];
    const runs: [number, number][] = level === 1 ? [[zA, columns[0][1] + .008], [columns[1][0] - .008, zB]] : [[zA, zB]];
    for (const y of barY) for (const [r0, r1] of runs) {
      const g = new THREE.BoxGeometry(.016 + .004, .010, r1 - r0).translate(side * (b.outer + .006), y, (r0 + r1) / 2);
      P.addEquipment('hullDetail', tagFrontPart(g, 'front-skirt bar', 'hull'));
    }
    const ends = level === 1 ? [zA, columns[0][1] + .008, columns[1][0] - .008, zB] : [zA, ...columns.slice(1).map((c, i) => (columns[i][1] + c[0]) / 2), zB];
    for (const z of ends) {
      const g = new THREE.BoxGeometry(.016 + .004, rows[rows.length - 1][1] - rows[0][0] + .012, .010)
        .translate(side * (b.outer + .006), (rows[0][0] + rows[rows.length - 1][1]) / 2, z);
      P.addEquipment('hullDetail', tagFrontPart(g, 'front-skirt upright', 'hull'));
    }
    // the front return: two courses of two along its falling face, the upper course offset half a cassette
    const r = s.ret, len = r.z1 - r.z0;
    const yb = (z: number) => r.bottom[0] + (r.bottom[1] - r.bottom[0]) * (z - r.z0) / len;
    const yt = (z: number) => r.top[0] + (r.top[1] - r.top[0]) * (z - r.z0) / len;
    const xo = (z: number) => r.outer0 + (r.outer1 - r.outer0) * (z - r.z0) / len;
    const mid = (z: number) => (yb(z) + yt(z)) / 2, dir = new THREE.Vector3(0, mid(r.z1) - mid(r.z0), len).normalize();
    const hgt = Math.min(yt(r.z0) - yb(r.z0), yt(r.z1) - yb(r.z1)) * Math.cos(Math.atan2(-dir.y, dir.z));
    const rowH = (hgt - .03) / 2, perp = new THREE.Vector3(0, dir.z, -dir.y).normalize();
    // each cassette laid in the return face's own plane (its outer edge flares outward over the return's length), sunk 5
    // mm (level 1) or 4 mm (level 2) into it all over
    const k = (r.outer1 - r.outer0) / len, nf = new THREE.Vector3(side, 0, -k).normalize();
    const along = new THREE.Vector3(side * k * dir.z, dir.y, dir.z).normalize(), up = nf.clone().cross(along).normalize();
    if (up.dot(perp) < 0) up.negate();
    // the front bay module's chamfered end overlaps the return's first 2.3 cm: the lower course's rear corner keeps 8 mm
    // ahead of it (round 2; the receipt's two-way overlap test: the first lower cassette entered it 7.7 mm)
    const bayEnd = b.z + b.half, lowerRear = .0075 + (level === 1 ? rowH : rowH);
    const first = Math.max(level === 1 ? .06 : .03, (bayEnd + .008 - r.z0 + Math.max(0, up.z) * lowerRear) / dir.z);
    if (level === 1) {
      const cl = .24, o = first - .06, tiles = [[.06 + o, 0], [.06 + o + cl + .015, 0], [.06 + o + cl / 2 + .0075, 1], [.06 + o + 1.5 * cl + .0225, 1]];
      if (r.z0 + dir.z * (.06 + o + 2.5 * cl + .0225) + Math.max(0, up.z) * lowerRear > r.z1 - .01)
        throw new Error(`${id}: the front-return cassettes overrun the return`);
      for (const [at, row] of tiles) {
        const z = r.z0 + dir.z * at, zc = z + dir.z * cl / 2, centre = new THREE.Vector3(side * xo(zc), mid(zc), zc)
          .addScaledVector(up, row === 0 ? -(rowH / 2 + .0075) : rowH / 2 + .0075);
        const geo = orientedBox([cl, rowH, thick + .005], centre.clone().addScaledVector(nf, (thick - .005) / 2), along, nf);
        eraModule(P, {owner: 'hull', sector: sectorOf('skirt_era', side), geometry: geo, outward: [side, 0, 0], minDot: .5,
          name: 'front-return cassette', guard: (nm, g2) => assertHullPart(id, nm, g2, {skirtTop: yt(z)})});
      }
    } else {
      // the Zubr II: two columns fitted 3 cm inside the outer face's ends (it turns in past z1)
      // the upper course's front corner 1 cm short of the face's end (the face falls forward, so the course leans ahead)
      const last = Math.min(len / dir.z - .03, (r.z1 - .01 - r.z0 - Math.max(0, up.z) * lowerRear) / dir.z), cl = (last - first - .015) / 2;
      for (const at of [first, first + cl + .015]) for (const row of [0, 1]) {
        const z = r.z0 + dir.z * at, foot = new THREE.Vector3(side * xo(z), mid(z), z)
          .addScaledVector(up, row === 0 ? -(rowH + .0075) : .0075);
        const geo = stackTile(P, foot, along, up, nf, cl, rowH, .05, thick - .05);
        eraModule(P, {owner: 'hull', sector: sectorOf('skirt_era', side), geometry: geo, outward: [side, 0, 0], minDot: .5,
          name: 'front-return cassette', guard: (nm, g2) => assertHullPart(id, nm, g2, {skirtTop: yt(z)})});
      }
    }
  }
}

/** The T-72B3 hull's own surfaces the Polish package seats on: the glacis line (centre) and the lower nose plate. */
export function polishHullSurface(P: TankBuilderPort): HullSurface & {dispose(): void} {
  const parts: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['hull'], g => parts.push(g));
  const stock = new Stock(P.spec.id, parts);
  return {
    glacisAt: z => stock.top(0, z),
    plateAt: (x, y) => stock.face([x, y, 6], [0, 0, -1]).point,
    dispose: () => stock.dispose(),
  };
}
