// The T-90A obr. 2004 (`t90a_2004`) turret package, laid on the T-90A source casting (t90X.ts buildT90AX, datum A) after
// its build. 2026-10-31 (lane t90-family-266; the owner: "make 2013, 2006, and 2004 turrets look more like they were
// before just on the new base", then "the new turrets have to be properly inspired from bases of the turrets from the
// ones that were there in the new verisons. like they should properly look distinguished like what was done with the
// other tanks but upholding the new level of visual quality", then, of the T-72B3M obr. 2022: "see the 2022 is the
// level of innovation i want in our reworked t90s. same but fresh and different take").
// The concept is the walled turret: the pre-rebuild obr. 2004 (addT90A2004Turret / addT90ALegacyTurret) was boxy,
// cassette-walled and bin-laden, and that character is built here as seven signature groups on the source casting:
//   1. slab-sided K-5 flank walls: two-tier welded cassette walls hung on both side bins, up to the roof shoulder, and
//      a course of tall cassettes ahead of the right smoke bank (the old flank cassettes);
//   2. cast perimeter flanges: a shelf down each lower flank that carries the walls (the old perimeter ledges);
//   3. the bustle stowage superstructure: the tall, wide, asymmetric bin run on the left, a crew box on the right and a
//      stowage chest standing in the garrison rack on the bustle roof, all on carrier shelves (the old bustle bins);
//   4. the raised cast sight crown on the forward sight housing (the old crown's forward head);
//   5. two radio courses on broad shoes with whips (the old radio courses);
//   6. the K-5 chevron: slab-fronted, tiled K-5 brows on the cheek wedges and tiled leaves beside the mantlet, one
//      chevron across the turret front (the old two-row clamshell), and the low radial belt ahead of the left smoke
//      bank (the old belt);
//   7. the welded roof crown: a flat raised appliqué roof plate between the sights (the old flat crown).
// Turret parts are in the turret rig frame (the source build's builder frame minus datum A's yaw); every part is seated
// by a ray on the source stock, and nothing enters the main gun's or the roof station's sweep, the smoke tubes' fire
// lines, the sight windows, the commander's periscope line or the turret ring's clearance over the deck.
import * as THREE from 'three';
import { KIT, orientedSlab } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { whipAntennaParts } from '../accessoryKits.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { T90_X_DATUMS } from './t90X.ts';

type Point = readonly [number, number, number];
const { box, cylY, cylZ } = KIT;
/** The source turret's stock (shell, equipment, armour, cupolas, glass). */
const STOCK = ['turret', 'turretDetail', 'turretDark', 'turretExternalArmor', 'turretCupola', 'turretGlass'];
const YAW = T90_X_DATUMS.t90a.yaw;

/** First hit on the given turret buckets (their parts are in the rig frame), or null. */
function ray(P: TankBuilderPort, buckets: readonly string[], from: Point, dir: Point): THREE.Vector3 | null {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const caster = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize());
  let best: THREE.Intersection | undefined;
  P.forEachBucketPart([...buckets], (g) => {
    const m = new THREE.Mesh(g, mat); m.updateMatrixWorld();
    const h = caster.intersectObject(m)[0]; if (h && (!best || h.distance < best.distance)) best = h;
  });
  mat.dispose();
  return best ? best.point : null;
}
function need(p: THREE.Vector3 | null, what: string): THREE.Vector3 {
  if (!p) throw new Error(`t90a_2004 turret: no stock under the ${what}`);
  return p;
}
/** The casting's flank (shell only) at a height and station, as |x|. */
function wall(P: TankBuilderPort, side: number, y: number, z: number): number {
  return Math.abs(need(ray(P, ['turret'], [side * 3, y, z], [-side, 0, 0]), `flank at y ${y} z ${z}`).x);
}
/** The top of the stock under a point (rays straight down from `from` height). */
function topAt(P: TankBuilderPort, x: number, z: number, from = 1.6, buckets: readonly string[] = STOCK): number {
  return need(ray(P, buckets, [x, from, z], [0, -1, 0]), `roof at x ${x} z ${z}`).y;
}
/** A contour (counter-clockwise for side +1) on side -1: mirrored in x and reversed, so it stays counter-clockwise. */
function sided(side: number, ring: readonly SectionPoint[]): SectionPoint[] {
  return side > 0 ? [...ring] : ring.map(([x, y]) => [-x, y] as const).reverse();
}

// ---- the source side bins ---------------------------------------------------------------------------------------------
// The source casting's long side bins (t90X.ts classicBins, datum A), in the rig frame; their outer faces are found by
// rays. n is the outward normal of the outer face, t the bin's forward axis.
const SIDE_BINS = {
  [-1]: { c: [-1.146, .333, -.8311] as Point, w: .37, h: .396, len: .91, yaw: -.34 },
  [1]: { c: [1.081, .347, -.8631] as Point, w: .37, h: .375, len: .75, yaw: .34 },
} as const;
interface BinFrame { side: number; c: THREE.Vector3; n: THREE.Vector3; t: THREE.Vector3; face: number; len: number; h: number; yaw: number }
function binFrame(P: TankBuilderPort, side: -1 | 1): BinFrame {
  const { c, len, h, yaw } = SIDE_BINS[side];
  const n = new THREE.Vector3(side * Math.cos(yaw), 0, -side * Math.sin(yaw)), t = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const centre = new THREE.Vector3(...c), from = centre.clone().addScaledVector(n, 1);
  const face = need(ray(P, ['turretDetail'], [from.x, c[1], from.z], [-n.x, 0, -n.z]), 'side bin face').sub(centre).dot(n);
  return { side, c: centre, n, t, face, len, h, yaw };
}
/** |x| of a line parallel to a bin's outer face, `out` beyond it, at station z. */
function binLineX(b: BinFrame, out: number, z: number): number {
  const p = b.c.clone().addScaledVector(b.n, b.face + out);
  return Math.abs(p.x + b.t.x * (z - p.z) / b.t.z);
}

// ---- K-5 box ----------------------------------------------------------------------------------------------------------
// One welded K-5 box: its back on the line it rides (x 0 at `origin`, 12 mm buried), its top falling outboard under a
// chamfered edge, its ends chamfered, and a dark bolted cover on the top, 8 mm proud.
function k5Box(P: TankBuilderPort, side: number, origin: THREE.Vector3, yaw: number, len: number, depth: number,
  bottom: number, h: number, fall: number): void {
  const hOut = h - fall, ch = .03, b = .012, e = .014;
  const ring = (inset: number): SectionPoint[] => sided(side, [
    [-b, inset], [depth - inset, inset], [depth - inset, hOut - ch - inset * .4], [depth - ch - inset * .6, hOut - inset],
    [-b, h - inset],
  ]);
  P.addEquipment('turretDetail', sectionSolid([
    { z: -len / 2, ring: ring(e) }, { z: -len / 2 + e, ring: ring(0) },
    { z: len / 2 - e, ring: ring(0) }, { z: len / 2, ring: ring(e) },
  ]), origin.x, bottom, origin.z, 0, yaw, 0);
  const x0 = .03, x1 = depth - ch - .03, at = (x: number) => h + (hOut - h) * (x + b) / (depth - ch + b);
  P.addEquipment('turretDark', sectionSolid([-1, 1].map((s) => ({ z: s * (len / 2 - .035),
    ring: sided(side, [[x0, at(x0) - .006], [x1, at(x1) - .006], [x1, at(x1) + .008], [x0, at(x0) + .008]]) }))),
  origin.x, bottom, origin.z, 0, yaw, 0);
}
/** The lowest stock over a box's footprint (smoke banks, their wall seats and mounting plates), from `from` up. */
function ceilingOver(P: TankBuilderPort, side: number, origin: THREE.Vector3, yaw: number, len: number, depth: number,
  from: number, limit: number): number {
  const along = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), normal = new THREE.Vector3(side * Math.cos(yaw), 0, -side * Math.sin(yaw));
  let ceiling = limit;
  for (const dz of [-len / 2 + .01, 0, len / 2 - .01]) for (const out of [.02, depth / 2, depth - .01]) {
    const p = origin.clone().addScaledVector(along, dz).addScaledVector(normal, out);
    const hit = ray(P, STOCK, [p.x, from, p.z], [0, 1, 0]);
    if (hit) ceiling = Math.min(ceiling, hit.y);
  }
  return ceiling;
}

// ---- 2. cast perimeter flanges ------------------------------------------------------------------------------------------
// The pre-rebuild casting's low perimeter ledges (addT90ACastPerimeterFlanges): a cast shelf down each lower flank from
// behind the cheek armour to the bustle, carrying the K-5 walls. Its inner edge runs 25 mm into the casting's lower
// bevel at every station; ahead of the side bins it reaches out under the forward cassettes, beside them it flares out
// under the bin walls (its top there buried in the bin's floor), and its top sheds outboard. The underside clears the
// deck and the engine-deck stock the bustle sweeps over (62-77 mm at 1.55-1.9 m from the ring axis) by 33-38 mm.
const FLANGE = { bottom: .095, topIn: .155, topOut: .118, binBottom: .115, binTopIn: .17, binTopOut: .135 };
const WALL = { depth: .15, gap: .02, top: .70, split: .42, fall: .035 };
const FLANGE_FRONT: Readonly<Record<number, readonly (readonly [z: number, reach: number])[]>> = {
  [-1]: [[.555, .035], [.50, .215], [.35, .215], [.20, .215], [.05, .215], [-.04, .17], [-.12, .09], [-.22, .065], [-.36, .05]],
  [1]: [[.555, .035], [.53, .15], [.35, .15], [.25, .15], [.18, .095], [.05, .095], [-.10, .095], [-.25, .095], [-.40, .06]],
};
const FLANGE_BIN_Z = [-.56, -.75, -.95, -1.15, -1.32];
function perimeterFlanges(P: TankBuilderPort, bins: Record<number, BinFrame>): void {
  for (const side of [-1, 1]) {
    const rows: [number, number, number, number, number, number][] = FLANGE_FRONT[side].map(([z, reach]) =>
      [z, wall(P, side, FLANGE.bottom + .005, z) - .025, wall(P, side, .23, z) + reach, FLANGE.topIn, FLANGE.topOut, FLANGE.bottom]);
    for (const z of FLANGE_BIN_Z) {
      rows.push([z, wall(P, side, FLANGE.bottom + .005, z) - .025, binLineX(bins[side], WALL.depth + .02, z),
        FLANGE.binTopIn, FLANGE.binTopOut, FLANGE.binBottom]);
    }
    const sections: SolidSection[] = rows.reverse().map(([z, xi, xo, ti, to, y0]) =>
      ({ z, ring: sided(side, [[xi, y0], [xo, y0], [xo, to], [xi, ti]]) }));
    P.addEquipment('turretDetail', sectionSolid(sections));
  }
}

// ---- 1. slab-sided K-5 flank walls ----------------------------------------------------------------------------------------
// The pre-rebuild flank cassettes (addT90CastFlankCassettes), grown into walls. Ahead of the smoke banks: a course of
// tall K-5 boxes square to the casting's flank (yaw from two rays on it) on the vehicle right, where the tubes fire
// from 0.46 m up, over them; on the vehicle left the bank hangs low and its tubes fire across the flank at 0.33-0.41 m,
// so the course drops to the low radial-belt run ahead of the muzzles. Behind the banks: a two-tier wall of six boxes
// hung on each side bin's outer face, standing on the flange and rising to the roof shoulder (0.70 m, under the
// commander's periscope line), tied by a dark retaining band; a strap over each bin lid marks the wall's divisions.
function forwardCourse(P: TankBuilderPort, side: number, z: number, len: number, depth: number, top: number, fall: number): void {
  const yMid = .30, front = wall(P, side, yMid, z + len / 2), rear = wall(P, side, yMid, z - len / 2), mid = wall(P, side, yMid, z);
  const yaw = Math.atan2(side * (front - rear), len), origin = new THREE.Vector3(side * mid, 0, z);
  const outer = origin.clone().add(new THREE.Vector3(side * Math.cos(yaw), 0, -side * Math.sin(yaw)).multiplyScalar(depth * .8));
  const bottom = topAt(P, outer.x, outer.z, .26, ['turretDetail']) - .008;
  const ceiling = ceilingOver(P, side, origin, yaw, len, depth, Math.max(bottom + .02, FLANGE.topIn + .01), top + .022);
  const h = Math.min(top, ceiling - .022) - bottom;
  if (h >= .09) k5Box(P, side, origin, yaw, len, depth, bottom, h, fall);
}

function binWall(P: TankBuilderPort, b: BinFrame): void {
  const { side, n, t, face, len, yaw } = b, count = 3;
  const seg = (len + .02 - (count - 1) * WALL.gap) / count;
  for (let i = 0; i < count; i++) {
    const s = -len / 2 - .01 + seg / 2 + i * (seg + WALL.gap);
    const origin = b.c.clone().addScaledVector(t, s).addScaledVector(n, face);
    origin.y = 0;
    const outer = origin.clone().addScaledVector(n, WALL.depth - .015);
    const bottom = topAt(P, outer.x, outer.z, .26, ['turretDetail']) - .005;
    k5Box(P, side, origin, yaw, seg, WALL.depth, bottom, WALL.split - bottom + .006, WALL.fall * .4);
    k5Box(P, side, origin, yaw, seg, WALL.depth, WALL.split, WALL.top - WALL.split, WALL.fall);
  }
  // the retaining band round the upper tier's outer faces
  const band = b.c.clone().addScaledVector(n, face + WALL.depth + .004);
  P.addEquipment('turretDark', box(.012, .032, len + .03), band.x, WALL.split + .12, band.z, 0, yaw, 0);
  // lid straps at the divisions
  const lidTop = topAt(P, b.c.x, b.c.z);
  for (const s of [-len / 6, len / 6]) {
    const strap = b.c.clone().addScaledVector(t, s);
    P.addEquipment('turretDetail', box(2 * face + .03, .014, .032), strap.x, lidTop + .005, strap.z, 0, yaw, 0);
  }
}

function flankWalls(P: TankBuilderPort, bins: Record<number, BinFrame>): void {
  for (const [z, len] of [[.445, .195], [.235, .195], [.07, .14]]) forwardCourse(P, -1, z, len, .21, .42, .05);
  for (const z of [.495, .35]) forwardCourse(P, 1, z, .135, .15, .255, .03);
  binWall(P, bins[-1]); binWall(P, bins[1]);
}

// ---- 6. the K-5 chevron brows -----------------------------------------------------------------------------------------
// The pre-rebuild front read as boxy, cassette-walled cheek slabs with a two-row tiled chevron face (its K-5 clamshell);
// the source cheek courses are three broad wedges a side, falling flat to the front. Each wedge keeps its place and
// carries a welded K-5 brow on its front: a box riding the wedge's falling top (its underside follows the top 12 mm in,
// two rays), standing a near-vertical slab front over the wedge's nose to a level top, its front-top edge chamfered,
// its face parted into two rows of three tiles by dark seams, its top under a bolted cover. A tile seam crosses the
// wedge's open top behind it. The brows stay outboard of the Shtora eyes and behind their faces, outboard of the
// mantlet and under the smoke tubes' fire lines: the right course's rear brow steps down to 0.58 m under its lower
// tubes' lane, and the left course's rear wedge carries none (its lower tubes fire past its outer corner at 0.44-0.54 m). The upper course's stations are the source's (t90X.ts classicCheeks, datum
// A, builder frame).
const CHEEK = { x: 1.106, z: 1.172, dx: .172, dz: .206, angle: .73, w: .275, depth: .535, seam: -.075 };
const BROW = { len: .25, lip: .02, chamfer: .03, tops: { [-1]: [.66, .66, .58], [1]: [.66, .66] } as Record<number, readonly number[]>,
  wedges: { [-1]: [0, 1, 2], [1]: [0, 1] } as Record<number, readonly number[]> };
function cheekBrows(P: TankBuilderPort): void {
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const r = side * CHEEK.angle, cx = side * (CHEEK.x + i * CHEEK.dx) - YAW[0], cz = CHEEK.z - i * CHEEK.dz - YAW[2];
    const along = new THREE.Vector3(Math.sin(r), 0, Math.cos(r)), across = new THREE.Vector3(Math.cos(r), 0, -Math.sin(r));
    const at = (s: number, x = 0): THREE.Vector3 => new THREE.Vector3(cx, 0, cz).addScaledVector(along, s).addScaledVector(across, x);
    const top = (s: number): number => { const p = at(s); return topAt(P, p.x, p.z, 1.4, ['turretExternalArmor']); };
    // the tile seam across the open top, lying on it at the fall two rays find
    {
      const p = at(CHEEK.seam), fall = Math.atan2(top(CHEEK.seam - .04) - top(CHEEK.seam + .04), .08);
      P.addEquipment('turretDark', box(CHEEK.w * .84, .014, .03).rotateX(fall).rotateY(r), p.x, top(CHEEK.seam) + .005, p.z);
    }
    if (!BROW.wedges[side].includes(i)) continue;
    const nose = CHEEK.depth / 2, sR = nose - BROW.len + BROW.lip, sF = nose + BROW.lip, T = BROW.tops[side][i];
    const a = nose - BROW.len + BROW.lip + .01, b = nose - .015, ya = top(a), yb = top(b);
    const under = (s: number): number => ya + (yb - ya) * (s - a) / (b - a) - .012;
    const hw = CHEEK.w / 2 + .012;
    const ring = (s: number, t: number): SectionPoint[] => [[-hw, under(s)], [hw, under(s)], [hw, t], [-hw, t]];
    P.addEquipment('turretDetail', sectionSolid([
      { z: sR, ring: ring(sR, T) }, { z: sF - BROW.chamfer, ring: ring(sF - BROW.chamfer, T) }, { z: sF, ring: ring(sF, T - BROW.chamfer) },
    ]).rotateY(r), cx, 0, cz);
    P.addEquipment('turretDark', sectionSolid([sR + .03, sF - BROW.chamfer - .02].map((z) =>
      ({ z, ring: [[-hw + .03, T - .006], [hw - .03, T - .006], [hw - .03, T + .008], [-hw + .03, T + .008]] as SectionPoint[] })))
      .rotateY(r), cx, 0, cz);
    // the two-row, three-column tile seams on the slab front
    const y0 = under(sF) + .02, y1 = T - BROW.chamfer - .01, mid = (y0 + y1) / 2;
    for (const x of [-hw / 3, hw / 3]) {
      const p = at(sF + .004, x);
      P.addEquipment('turretDark', box(.022, y1 - y0, .012).rotateY(r), p.x, mid, p.z);
    }
    const q = at(sF + .004);
    P.addEquipment('turretDark', box(2 * hw - .03, .018, .012).rotateY(r), q.x, mid, q.z);
  }
}

// The chevron's inner leaves (the old clamshell's inner modules beside the gun): a K-5 box each side between the mantlet
// and the Shtora eye, its back 12 mm into the casting's vertical front face (found by rays), its tiled slab front
// raked back outboard so the two leaves and the brows make one chevron across the turret front. It stays outboard of
// the mantlet's elevation sweep (|x| 0.295 m), inboard of the Shtora housing and its foot, behind the eyes' faces, and
// 0.10 m clear of the deck under the front overhang.
const LEAF = { x0: .335, x1: .625, nose0: .215, nose1: .115, bottom: .10, backTop: .425, frontTop: .385 };
function chevronLeaves(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const face = Math.min(...[LEAF.x0, LEAF.x1].map((x) =>
      need(ray(P, ['turret'], [side * x, .26, 3], [0, 0, -1]), 'turret front face').z)) - .012;
    const xi = side * LEAF.x0, xo = side * LEAF.x1, zi = face + LEAF.nose0, zo = face + LEAF.nose1;
    const { bottom: y0, backTop: yb, frontTop: yf } = LEAF;
    P.addEquipment('turretDetail', orientedSlab(
      [xi, y0, face], [xo, y0, face], [xo, y0, zo], [xi, y0, zi],
      [xi, yb, face], [xo, yb, face], [xo, yf, zo], [xi, yf, zi]));
    // the bolted cover on its falling top
    const c = (x: number, z: number, y: number): number[] => [x, y, z];
    const ti = side * (LEAF.x0 + .03), to = side * (LEAF.x1 - .03), fall = (z: number) => yb + (yf - yb) * (z - face) / ((zi + zo) / 2 - face);
    const zb = face + .04, zfi = zi - .04, zfo = zo - .04;
    P.addEquipment('turretDark', orientedSlab(
      c(ti, zb, fall(zb) - .006), c(to, zb, fall(zb) - .006), c(to, zfo, fall(zfo) - .006), c(ti, zfi, fall(zfi) - .006),
      c(ti, zb, fall(zb) + .008), c(to, zb, fall(zb) + .008), c(to, zfo, fall(zfo) + .008), c(ti, zfi, fall(zfi) + .008)));
    // two rows of three tiles on the raked front
    const yaw = Math.atan2(side * (zi - zo), Math.abs(xo - xi)), nx = Math.sin(yaw), nz = Math.cos(yaw);
    const onFront = (u: number): [number, number] => [xi + (xo - xi) * u + nx * .004, zi + (zo - zi) * u + nz * .004];
    const width = Math.hypot(xo - xi, zo - zi), ya = y0 + .02, yt = yf - .015;
    for (const u of [1 / 3, 2 / 3]) { const [x, z] = onFront(u); P.addEquipment('turretDark', box(.022, yt - ya, .012), x, (ya + yt) / 2, z, 0, yaw, 0); }
    const [mx, mz] = onFront(.5);
    P.addEquipment('turretDark', box(width - .03, .018, .012), mx, (ya + yt) / 2, mz, 0, yaw, 0);
  }
}

// ---- 3. the bustle stowage superstructure ------------------------------------------------------------------------------
// The pre-rebuild long, tall vehicle-left bustle run (addT90AAsymmetricBustleBins) as a full stowage superstructure: two
// tall welded bins abreast of the bustle box behind the left wall, out to the wall's line; a lower crew box on the right
// rear quarter; and a stowage chest standing in the garrison rack on the bustle roof. The bins ride carrier shelves that
// run into the casting and under the side bins, so the quarters between the casting, the side bins and the bins are
// floored (no see-through cell in plan); bottoms stay 70 mm over the engine-deck stock the bustle sweeps.
interface Bin { side: number; z0: number; z1: number; out: number; bottom: number; top: number; handle?: boolean }
function bin(P: TankBuilderPort, b: Bin, inner: number): void {
  const { side } = b, w = b.out - inner, h = b.top - b.bottom, d = b.z0 - b.z1;
  const x = side * (inner + w / 2), y = (b.bottom + b.top) / 2, z = (b.z0 + b.z1) / 2;
  P.addEquipment('turretDetail', box(w, h, d), x, y, z);
  P.addEquipment('turretDetail', box(w + .018, .022, d + .018), x, b.top + .008, z);                 // lid
  P.addEquipment('turretDark', cylZ(.012, d * .78, 10), side * (inner + .02), b.top + .012, z);       // lid hinge
  for (const dz of [-d * .28, d * .28]) {
    P.addEquipment('turretDark', box(.022, .06, .034), side * (b.out + .006), b.top - .045, z + dz);  // hasps
  }
  // a welded stiffening rib round the outer face and ends at mid height
  P.addEquipment('turretDetail', box(w + .012, .03, d + .012), x + side * .004, y - .02, z);
  if (b.handle) {
    // an upright grab bar on two standoffs (in plan a single line, not a ring)
    const hx = side * (b.out - .004), ox = side * (b.out + .055), hz = z - d * .2, ya = y - .12, yb = y + .06;
    for (const hy of [ya, yb]) P.addEquipment('turretDark', beamBetween([hx, hy, hz], [ox, hy, hz], .011, 8));
    P.addEquipment('turretDark', beamBetween([ox, ya - .011, hz], [ox, yb + .011, hz], .011, 8));
  }
}

function bustleSuperstructure(P: TankBuilderPort, bins: Record<number, BinFrame>): { leftWhip: Point } {
  // the bustle box's flanks at mid height (inner faces bury 24 mm into it)
  const left = Math.abs(need(ray(P, ['turretDetail'], [3, .40, -1.52], [-1, 0, 0]), 'bustle box left flank').x);
  const right = Math.abs(need(ray(P, ['turretDetail'], [-3, .40, -1.52], [1, 0, 0]), 'bustle box right flank').x);
  const lIn = left - .024, rIn = right - .024;
  // each run starts 15 mm behind its wall's outer rear corner
  const wallRear = (b: BinFrame) => b.c.clone().addScaledVector(b.t, -b.len / 2 - .01).addScaledVector(b.n, b.face + WALL.depth).z - .015;
  const lOut = binLineX(bins[1], WALL.depth, wallRear(bins[1])), rOut = binLineX(bins[-1], WALL.depth, wallRear(bins[-1]));
  const shelf = (side: number, out: number, z0: number, z1: number) => {
    const inner = .35, w = out - inner;
    P.addEquipment('turretDark', box(w, .035, z0 - z1), side * (inner + w / 2), .1975, (z0 + z1) / 2);
  };
  shelf(1, lOut + .015, -1.06, -1.975);
  shelf(-1, rOut + .015, -.98, -1.715);
  const a: Bin = { side: 1, z0: wallRear(bins[1]), z1: -1.625, out: lOut, bottom: .215, top: .74 };
  const b: Bin = { side: 1, z0: -1.645, z1: -1.965, out: lOut, bottom: .215, top: .78, handle: true };
  const c: Bin = { side: -1, z0: wallRear(bins[-1]), z1: -1.70, out: rOut, bottom: .215, top: .64, handle: true };
  bin(P, a, lIn); bin(P, b, lIn); bin(P, c, rIn);
  // the stowage chest in the rack on the bustle roof, on two dark skids
  const roof = Math.max(topAt(P, -.45, -1.47), topAt(P, .45, -1.47), topAt(P, -.45, -1.71), topAt(P, .45, -1.71));
  const cz = -1.59, ch = .17, cy = roof + .022 + ch / 2;
  for (const x of [-.32, .32]) P.addEquipment('turretDark', box(.06, .03, .30), x, roof + .007, cz);
  P.addEquipment('turretDetail', box(.98, ch, .26), 0, cy, cz);
  P.addEquipment('turretDetail', box(1.0, .02, .28), 0, cy + ch / 2 + .006, cz);
  for (const x of [-.25, .25]) P.addEquipment('turretDark', box(.04, .05, .02), x, cy + ch / 2 - .035, cz - .135);
  for (const x of [-.40, .40]) P.addEquipment('turretDark', box(.035, ch + .05, .29), x, cy + .01, cz);    // tie-down straps
  return { leftWhip: [lOut - .16, b.top + .019, -1.82] };
}

// ---- 5. radio courses ------------------------------------------------------------------------------------------------------
// The pre-rebuild two radio courses (addT90A2004Turret): a broad shoe, a collar half buried in it and a flexible whip on
// a coiled spring. The right course stands on the rear shoulder (its pad follows the shoulder's slope, four rays); the
// left on the rear bin's lid. Both stand well outside the roof station's barrel sweep.
function whip(P: TankBuilderPort, foot: Point, h: number, rake: number, seed: number): void {
  const w = whipAntennaParts({ h, r: .013, rake, seed, spring: true });
  P.addEquipment('turretDark', w.rod, ...foot);
  if (w.spring) P.addEquipment('turretDark', w.spring, ...foot);
}
function radioCourses(P: TankBuilderPort, leftFoot: Point): void {
  // right: a broad pad 50 mm thick following the shoulder's slope (its four corners 12 mm into the casting), a level
  // boss sunk into the pad's middle, and the collar on the boss
  const x0 = -.64, x1 = -.81, z0 = -.94, z1 = -1.16;
  const corners: Point[] = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]];
  const ys = corners.map(([x, , z]) => topAt(P, x, z) - .012);
  P.addEquipment('turretDetail', orientedSlab(
    ...corners.map(([x, , z], i) => [x, ys[i], z]), ...corners.map(([x, , z], i) => [x, ys[i] + .062, z])));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, mid = ys.reduce((a, v) => a + v, 0) / 4 + .062;
  const top = Math.max(...ys) + .062 + .045, boss = top - (mid - .03);
  P.addEquipment('turretDetail', box(.12, boss, .15), cx, top - boss / 2, cz);
  P.addEquipment('turretDark', cylY(.046, .062, .13, 16), cx, top + .06, cz);
  P.addEquipment('turretDark', cylY(.03, .03, .03, 12), cx, top + .14, cz);
  whip(P, [cx, top + .155, cz], 1.0, .035, 41);
  // left: a broad shoe and collar on the rear bin's lid
  const [lx, ly, lz] = leftFoot;
  P.addEquipment('turretDetail', box(.18, .07, .22), lx, ly + .03, lz);
  P.addEquipment('turretDark', cylY(.04, .055, .12, 16), lx, ly + .115, lz);
  P.addEquipment('turretDark', cylY(.028, .028, .03, 12), lx, ly + .19, lz);
  whip(P, [lx, ly + .205, lz], .86, -.03, 42);
}

// ---- 4. raised cast sight crown -------------------------------------------------------------------------------------------
// The pre-rebuild raised cast crown (addT90CastSightCrown, its forward head): a tapered cast head standing on the
// forward sight housings, its footprint 10 mm into their tops, stepping in to a dark cap, with its own window and hood
// facing forward. It stays inboard of the gunner's sight window's line, outboard of the mantlet and under the roof
// station's barrel at full depression.
function sightCrown(P: TankBuilderPort): void {
  const bx0 = -.612, bx1 = -.442, bz0 = .45, bz1 = .905;
  const base: Point[] = [[bx0, 0, bz0], [bx1, 0, bz0], [bx1, 0, bz1], [bx0, 0, bz1]];
  const ys = base.map(([x, , z]) => topAt(P, x, z) - .010);
  const top = .90, tx0 = -.59, tx1 = -.468, tz0 = .52, tz1 = .84;
  P.addEquipment('turretDetail', orientedSlab(
    ...base.map(([x, , z], i) => [x, ys[i], z]),
    [tx0, top, tz0], [tx1, top, tz0], [tx1, top, tz1], [tx0, top, tz1]));
  P.addEquipment('turretDark', box(tx1 - tx0 - .02, .018, tz1 - tz0 - .03), (tx0 + tx1) / 2, top + .005, (tz0 + tz1) / 2 - .01);
  // the window on the raked front face, under its hood: the face runs from the base's front edge up to the cap's
  const yb = (ys[2] + ys[3]) / 2, tilt = Math.atan2(bz1 - tz1, top - yb), mx = (tx0 + tx1) / 2;
  const onFace = (y: number, proud: number): [number, number, number] =>
    [mx, y + proud * Math.sin(tilt), bz1 + (tz1 - bz1) * (y - yb) / (top - yb) + proud * Math.cos(tilt)];
  P.addEquipment('turretGlass', box(.085, .05, .008), ...onFace(top - .065, .003), -tilt, 0, 0);
  P.addEquipment('turretDark', box(.11, .045, .012), ...onFace(top - .014, .018), Math.PI / 2 - tilt, 0, 0);
}

// ---- 7. the welded roof crown -------------------------------------------------------------------------------------------
// The pre-rebuild turret's flat raised roof (its welded crown, the square plate between the sights): an appliqué roof
// plate on a faceted pedestal between the forward sight housings and the roof armour tiles, its foot following the
// roof's fall (four rays, 12 mm in), its top level at 0.76 m with a welded cover plate and two lifting lugs. It stays
// inboard of the commander's forward periscope, behind the centre sight and under the roof station's yaw stage.
function roofCrown(P: TankBuilderPort): void {
  const x0 = -.32, x1 = .28, z0 = .28, z1 = .64, top = .76, inset = .05;
  const foot: Point[] = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]];
  const ys = foot.map(([x, , z]) => topAt(P, x, z) - .012);
  P.addEquipment('turretDetail', orientedSlab(
    ...foot.map(([x, , z], i) => [x, ys[i], z]),
    [x0 + inset, top, z0 + inset], [x1 - inset, top, z0 + inset], [x1 - inset, top, z1 - inset], [x0 + inset, top, z1 - inset]));
  const w = x1 - x0 - 2 * inset - .03, d = z1 - z0 - 2 * inset - .03, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  P.addEquipment('turretDetail', box(w, .016, d), cx, top + .006, cz);
  for (const x of [x0 + inset + .06, x1 - inset - .06]) P.addEquipment('turretDark', box(.022, .045, .06), x, top + .03, cz);
}

export function addT90A2004TurretPackage(P: TankBuilderPort): void {
  const bins = { [-1]: binFrame(P, -1), [1]: binFrame(P, 1) };
  perimeterFlanges(P, bins);
  flankWalls(P, bins);
  cheekBrows(P);
  chevronLeaves(P);
  const { leftWhip } = bustleSuperstructure(P, bins);
  radioCourses(P, leftWhip);
  sightCrown(P);
  roofCrown(P);
}
