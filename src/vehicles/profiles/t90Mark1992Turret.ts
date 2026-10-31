// The T-90 obr. 1992 (`t90_1992`) Kontakt-5 cheek packs, laid on the cast T-90 source turret (t90AwX.ts) after its
// build. 2026-10-31 (lane t90-family-266; the owner: "the new turrets have to be properly inspired from bases of the
// turrets from the ones that were there in the new verisons ... upholding the new level of visual quality"; a blind A/B
// against the pre-rebuild build preferred its "bulky, blocky ERA-covered turret" to the source's thin leaves). The
// turret stays the cast one; over its K-5 V (the source's cassette leaves and inner cells) the first production T-90's
// welded Kontakt-5 packs: chunky boxes with near-vertical slab fronts, each front a two-row brick bond of cassettes
// with dark seams and bolt heads, each top under split bolted lids. Three packs a side follow the V's outer arm round
// the cheek from the Shtora box to the flank, and one a side fills the inner arm between the mantlet and the Shtora box.
// Every pack's back follows the casting (rays at each section and height, 12 mm in) and its front stands 30 mm proud
// of the source stock it covers (rays over its footprint). The packs stay outboard of the mantlet's elevation sweep,
// clear of the Shtora boxes and behind their eyes, below the gunner's sight line and the smoke tubes' fire lines, and
// over the deck's stock as the turret turns. Turret rig frame (the source build's frame minus its turret pivot).
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
const { box, cylX, mergeAll } = KIT;
const STOCK = ['turret', 'turretDetail', 'turretDark', 'turretExternalArmor', 'turretCupola', 'turretGlass'];
const Y = new THREE.Vector3(0, 1, 0);

/** First hit on the given turret buckets (their parts are in the rig frame), or null. */
function ray(P: TankBuilderPort, buckets: readonly string[], from: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const caster = new THREE.Raycaster(from, dir.clone().normalize());
  let best: THREE.Intersection | undefined;
  P.forEachBucketPart([...buckets], (g) => {
    const m = new THREE.Mesh(g, mat); m.updateMatrixWorld();
    const h = caster.intersectObject(m)[0]; if (h && (!best || h.distance < best.distance)) best = h;
  });
  mat.dispose();
  return best ? best.point : null;
}

interface Pack {
  /** A point on the pack's centre line at the casting (y ignored) and the front's outward normal (horizontal). */
  readonly at: Point; readonly yaw: number;
  /** Width along the front, bottom and top heights. */
  readonly width: number; readonly y0: number; readonly y1: number;
  /** The furthest the front may stand from `at` along the normal at mid-width (Shtora eye planes). */
  readonly maxFront: number;
  /** The front's rake across the width: it stands `rake` x s further out at s (s along the normal x up). */
  readonly rake: number;
}

// The K-5 pack: a section solid lofted across its width (local x the front's normal, y up, z across), each section's
// back following the casting's profile at that station, its front a vertical slab with a chamfered top edge and
// chamfered ends; then the brick-bond seams, bolt heads and split lids on that front and top.
function k5Pack(P: TankBuilderPort, p: Pack): void {
  const n = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)), w = new THREE.Vector3().crossVectors(n, Y);
  const origin = new THREE.Vector3(p.at[0], 0, p.at[2]);
  const local = (a: number, y: number, s: number) => origin.clone().addScaledVector(n, a).addScaledVector(Y, y).addScaledVector(w, s);
  const half = p.width / 2, heights: number[] = [];
  for (let y = p.y0; y < p.y1 - 1e-6; y += .07) heights.push(y);
  heights.push(p.y1);
  // the front: 30 mm proud of every stock surface over the footprint (at mid-width; raked across it)
  let mid0 = -9;
  for (let s = -half + .01; s <= half - .01 + 1e-6; s += (p.width - .02) / 6) for (const y of heights) {
    const hit = ray(P, STOCK, local(2.5, y, s), n.clone().negate());
    if (hit) mid0 = Math.max(mid0, hit.clone().sub(origin).dot(n) + .03 - p.rake * s);
  }
  mid0 = Math.min(mid0, p.maxFront);
  const frontAt = (s: number): number => mid0 + p.rake * s;
  // the back at each section: the casting along the normal, 12 mm in
  const back = (s: number): number[] => {
    let last = frontAt(s) - .25;
    return heights.map((y) => {
      const hit = ray(P, ['turret'], local(2.5, y, s), n.clone().negate());
      if (hit) last = Math.min(frontAt(s) - .08, hit.clone().sub(origin).dot(n) - .012);
      return last;
    });
  };
  const ch = .03, e = .015;
  const ring = (s: number, inset: number): SectionPoint[] => {
    const front = frontAt(s), b = back(s), pts: SectionPoint[] = [[front - inset, p.y0 + inset], [front - inset, p.y1 - ch - inset * .4],
      [front - ch - inset * .6, p.y1 - inset]];
    // the back's heights squeezed into the inset span (strictly falling, no doubled points at the chamfered ends)
    const squeeze = (y: number) => p.y0 + inset + (y - p.y0) * (p.y1 - p.y0 - 2 * inset) / (p.y1 - p.y0);
    for (let k = heights.length - 1; k >= 0; k--) pts.push([b[k], squeeze(heights[k])]);
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; area += x0 * y1 - x1 * y0; }
    return area > 0 ? pts : pts.reverse();
  };
  const sections: SolidSection[] = [
    { z: -half, ring: ring(-half, e) }, { z: -half + e, ring: ring(-half + e, 0) }, { z: 0, ring: ring(0, 0) },
    { z: half - e, ring: ring(half - e, 0) }, { z: half, ring: ring(half, e) },
  ];
  const frame = new THREE.Matrix4().makeBasis(n, Y, w).setPosition(origin);
  P.addEquipment('turretDetail', sectionSolid(sections).applyMatrix4(frame));
  // brick bond: a horizontal seam between the rows, the lower row's seam at mid-width, the upper row's at the quarters
  const mid = (p.y0 + p.y1 - ch) / 2, lo = (p.y0 + mid) / 2, hi = (mid + p.y1 - ch) / 2;
  const rowH = mid - p.y0 - .03, at = (g: THREE.BufferGeometry, a: number, y: number, s: number) => g.translate(a, y, s);
  // a strip lying on the raked front: turned about the vertical by the rake
  const onFront = (g: THREE.BufferGeometry, out: number, y: number, s: number) => at(g.rotateY(Math.atan(p.rake)), frontAt(s) + out, y, s);
  const seams = [onFront(box(.012, .018, (p.width - .04) * Math.hypot(1, p.rake)), .004, mid, 0), onFront(box(.012, rowH, .018), .004, lo, 0)];
  for (const s of [-p.width / 4, p.width / 4]) seams.push(onFront(box(.012, rowH, .018), .004, hi, s));
  P.addEquipment('turretDark', mergeAll(seams).applyMatrix4(frame));
  // bolt heads at each cassette's upper corners
  const bolts: THREE.BufferGeometry[] = [];
  for (const [y, edges] of [[mid - .03, [-half, 0, half]], [p.y1 - ch - .03, [-half, -p.width / 4, p.width / 4, half]]] as const) {
    for (let k = 0; k + 1 < edges.length; k++) for (const s of [edges[k] + .035, edges[k + 1] - .035]) {
      bolts.push(onFront(cylX(.012, .014, 8), .007, y, s));
    }
  }
  P.addEquipment('turretDark', mergeAll(bolts).applyMatrix4(frame));
  // two bolted lids on the top, split across the width, each lapped 8 mm proud
  const lids: THREE.BufferGeometry[] = [];
  for (const k of [-1, 1]) {
    const sc = k * (half / 2 + .005), a0 = back(sc)[heights.length - 1] + .04, a1 = frontAt(sc) - ch - .015 - Math.abs(p.rake) * half / 2;
    if (a1 - a0 > .06) lids.push(at(box(a1 - a0, .016, half - .03), (a0 + a1) / 2, p.y1 + .004, sc));
  }
  if (lids.length) P.addEquipment('turretDark', mergeAll(lids).applyMatrix4(frame));
}

// The packs. Outer arm: one over each of the source's three cheek cassette stations (t90AwX.ts cheeks(): centres and
// yaws, here in the rig frame), front square to that station's cassettes. Inner arm: one each side between the mantlet
// (half-width 0.278 m) and the Shtora box's mounting plate (|x| 0.70 m), its front raked back outboard into the V and
// held behind the Shtora eyes' faces.
const OUTER = [
  { x: 1.481, z: .536, yaw: 1.04, width: .31 },
  { x: 1.347, z: .821, yaw: .995, width: .31 },
  { x: 1.150, z: 1.127, yaw: .95, width: .29 },
] as const;
// Every pack's foot stands 0.19 m over the turret floor, 45 mm over the deck stock the turret sweeps (0.145 m at
// 1.2-2.0 m from the ring axis: bow plates, fender stowage and engine deck).
const FOOT = .19;
const INNER = { x: .49, z: 1.29, width: .36, y1: .55, maxFront: .30, rake: .15 };

export function addT90Mark1992CheekPacks(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    for (const o of OUTER) {
      k5Pack(P, { at: [side * o.x, 0, o.z], yaw: side * o.yaw, width: o.width, y0: FOOT, y1: .62, maxFront: 9, rake: 0 });
    }
    // the inner pack faces straight ahead (its sides square to the mantlet's sweep); across it s runs inboard, so the
    // front rakes back outboard on both sides
    k5Pack(P, { at: [side * INNER.x, 0, INNER.z], yaw: 0, width: INNER.width, y0: FOOT, y1: INNER.y1,
      maxFront: INNER.maxFront, rake: side * INNER.rake });
    // the inner pack's foot plate, run out to the Shtora box's inboard side (5 mm short of it) to floor the slot between
    // the two in plan; its back rides 12 mm into the casting's front face, its top 6 mm into the pack's foot
    const face = ray(P, ['turret'], new THREE.Vector3(side * .70, FOOT - .02, 3), new THREE.Vector3(0, 0, -1));
    if (!face) throw new Error(`${P.spec.id}: the 1992 cheek packs found no casting under the foot plate`);
    const zb = face.z - .012, zf = 1.50, x0 = INNER.x + INNER.width / 2 - .02, x1 = .725;
    P.addEquipment('turretDark', box(x1 - x0, .014, zf - zb), side * (x0 + x1) / 2, FOOT - .001, (zb + zf) / 2);
  }
}
