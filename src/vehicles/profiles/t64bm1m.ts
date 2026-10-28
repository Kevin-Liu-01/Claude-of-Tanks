// The T-64BM1M on the true T-64 base (t64Foundation.ts): Kharkiv's Nizh-protected T-64B1 for the National Guard (the
// T-64B1M of the 2014 Congo order and its BM1M follow-on). Its own kit, from the 42manako print's cassette layout
// and the cited photographs (docs/references/tanks/t64bm1m.md):
// - Nizh on the glacis: two courses of ten cells from the splash board to the nose bar;
// - the Nizh horseshoe: five deep wedge blocks a side round the turret face, their outer faces leaning back, their tops
//   falling outward and toward the gun; two rows of thin Nizh plates on the crown ahead of the hatches;
// - five Nizh side screens a side hung outside the rubber skirt over the forward four fifths of the hull;
// - the open stowage basket wrapped round the turret rear, and the 902B Tucha banks moved to both flanks (4 + 4);
// - the L-2G searchlight right of the gun, ahead of the first block.
import * as THREE from 'three';
import { KIT, convexSlab } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { strappedPack } from './modernizationFittings.ts';
import { buildT64Base, t64RubberSkirt, t64DomeContains, t64DomeHeight, t64GlacisY, T64_GLACIS_RAKE, T64_HULL, t64SearchlightAt } from './t64Foundation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, torus } = KIT;
type V3 = [number, number, number];

/** The casting's plan radius on the bearing from the ring centre at plan angle phi (0 ahead, + toward +X), height y. */
export function t64CastRadius(phi: number, y: number): number {
  const dx = Math.sin(phi), dz = Math.cos(phi); let lo = 0, hi = 2.2;
  for (let i = 0; i < 30; i++) { const r = (lo + hi) / 2; if (t64DomeContains(dx * r, y, dz * r)) lo = r; else hi = r; }
  return lo;
}

// ---------------------------------------------------------------- glacis
function glacisNizh(P: TankBuilderPort): void {
  // Two courses of ten cells (the print's 22 cells, the outermost pair dropped at the headlights), each 3 mm into the
  // plate, between the splash board (z 2.02) and the nose bar.
  const n = new THREE.Vector3(0, Math.cos(T64_GLACIS_RAKE), Math.sin(T64_GLACIS_RAKE)), th = .072;
  const rotation = new THREE.Matrix4().makeRotationX(T64_GLACIS_RAKE);
  for (const [z, half] of [[2.27, 4.5], [2.73, 4.5]] as const) for (let i = 0; i < 10; i++) {
    const x = (i - half) * .205;
    if (Math.abs(x) > .64 && z < 2.5) continue;           // the headlight pairs stand on the upper course's corners
    const p = new THREE.Vector3(x, t64GlacisY(z), z).addScaledVector(n, th / 2 - .003);
    const basis = rotation.clone().setPosition(p);
    P.destructibleCluster(`glacis_era_${x < 0 ? 'R' : 'L'}`, () => {
      P.addExternalArmor('hull', markEraHitFaces(P.q ? box(.195, th, .43) : new THREE.BoxGeometry(.195, th, .43), [0, 1, 0]).applyMatrix4(basis));
      P.addExternalArmor('hull', markEraFurniture(box(.17, .010, .38)).translate(0, th / 2 + .004, 0).applyMatrix4(basis));
    });
  }
}

// ---------------------------------------------------------------- turret horseshoe
// Five deep wedge blocks a side round the turret face (plan spans in degrees from straight ahead): each stands on the
// casting from y 0.10, its outer face leaning back and its top falling outward and toward the gun, so the band reads in
// profile as the print's low wedge (front top 0.30, flank top 0.52), not an upright wall.
const BLOCK_BOTTOM = .10, BLOCKS = [[16, 31], [32, 47], [48, 63], [64, 79], [80, 96]] as const;
const blockTop = (deg: number) => .30 + .22 * Math.min(1, Math.max(0, (deg - 16) / 80));
const blockDepth = (deg: number) => .42 - .10 * Math.min(1, Math.max(0, (deg - 16) / 80));
function horseshoeBlock(P: TankBuilderPort, side: number, a0: number, a1: number): void {
  const deg = Math.PI / 180, corner = (a: number, r: number, y: number): V3 => [side * Math.sin(a * deg) * r, y, Math.cos(a * deg) * r];
  const pts: V3[] = [];
  for (const a of [a0, a1]) {
    const top = blockTop(a), rb = t64CastRadius(side * a * deg, BLOCK_BOTTOM), rt = t64CastRadius(side * a * deg, top);
    const outer = rb + blockDepth(a);
    pts.push(corner(a, rb - .025, BLOCK_BOTTOM), corner(a, outer, BLOCK_BOTTOM), corner(a, rt - .025, top), corner(a, outer - .12, top - .06));
  }
  const mid = (a0 + a1) / 2 * deg, outward: V3 = [side * Math.sin(mid), Math.sin(.26), Math.cos(mid)];
  const body = convexSlab(...pts);
  P.destructibleCluster(`turret_era_${side > 0 ? 'L' : 'R'}`, () => {
    P.addExternalArmor('turret', markEraHitFaces(body, outward, .55));
    // the lid's bolted rim on the outer face
    const am = (a0 + a1) / 2, rb = t64CastRadius(side * am * deg, BLOCK_BOTTOM) + blockDepth(am), top = blockTop(am) - .06;
    const c = corner(am, rb - .06 + .006, (BLOCK_BOTTOM + top) / 2);
    const lid = markEraFurniture(box((a1 - a0) * deg * rb * .80, (top - BLOCK_BOTTOM) * .78, .010));
    lid.rotateX(-Math.atan2(.12, top - BLOCK_BOTTOM)).rotateY(side * am * deg).translate(...c);
    P.addExternalArmor('turret', lid);
  });
}

function roofNizh(P: TankBuilderPort): void {
  // Two rows of thin flat Nizh plates on the crown ahead of the hatches, each laid to the roof's slope, clear of the sight
  // head (x 0.33..0.59) and the cupola.
  for (const z of [.12, .44]) for (const x of [-.86, -.56, -.26, .04, .86]) {
    const y = Math.max(...[-.12, .12].flatMap(dx => [-.12, .12].map(dz => t64DomeHeight(x + dx, z + dz) ?? -1)));
    if (y < 0) continue;
    const dzY = ((t64DomeHeight(x, z + .1) ?? y) - (t64DomeHeight(x, z - .1) ?? y)) / .2;
    const dxY = ((t64DomeHeight(x + .1, z) ?? y) - (t64DomeHeight(x - .1, z) ?? y)) / .2;
    const lay = (g: THREE.BufferGeometry) => g.rotateX(-Math.atan(dzY)).rotateZ(Math.atan(dxY));
    P.destructibleCluster('turret_roof_era', () => {
      P.addExternalArmor('turret', markEraHitFaces(lay(new THREE.BoxGeometry(.27, .028, .27)), [0, 1, 0]), x, y + .006, z);
      P.addExternalArmor('turret', markEraFurniture(lay(new THREE.BoxGeometry(.23, .006, .23))), x, y + .023, z);
    });
  }
}

// ---------------------------------------------------------------- side screens
function sideScreens(P: TankBuilderPort, side: number): void {
  // Five flat Nizh screens a side in one run (2 cm joints), hung tight outside the rubber skirt (its face at |x| 1.695)
  // from the fender lip on short brackets.
  const th = .10, x = side * (T64_HULL.fenderOuterX + .035 + th / 2 + .003), len = .912;
  for (let i = 0; i < 5; i++) {
    const z = -2.33 + .466 + i * .932;
    P.destructibleCluster(`skirt_era_${side > 0 ? 'L' : 'R'}`, () => {
      P.addExternalArmor('hull', markEraHitFaces(new THREE.BoxGeometry(th, .62, len), [side, 0, 0]), x, 1.02, z);
      P.addExternalArmor('hull', markEraFurniture(new THREE.BoxGeometry(.008, .54, len * .92)), x + side * (th / 2 + .004), 1.02, z);
    });
    for (const dz of [-len * .32, len * .32]) P.addEquipment('hullDetail', box(.075, .06, .05), side * (T64_HULL.fenderOuterX + .02), T64_HULL.deckY - .04, z + dz);
  }
}

// ---------------------------------------------------------------- turret rear and flanks
/** The open rail basket wrapped round the turret rear (the print's basket; MilitaryLand's in-service photograph): a
 * floor frame 0.30 m out from the casting at y 0.14, its top rail rising from 0.44 at the front ends to 0.60 astern,
 * upright bars between, welded brackets from the wall; packs, the OPVT tube and a tarp roll inside. */
function rearBasket(P: TankBuilderPort): void {
  const deg = Math.PI / 180, floor = .14, path: { a: number; out: V3; wall: V3; top: number }[] = [];
  for (let d = 112; d <= 248.01; d += 8) {
    const a = d * deg, rw = t64CastRadius(a, floor), dir = [Math.sin(a), Math.cos(a)];
    const top = .44 + .16 * (1 - Math.abs(d - 180) / 68);
    path.push({ a, out: [dir[0] * (rw + .30), floor, dir[1] * (rw + .30)], wall: [dir[0] * (rw - .02), floor, dir[1] * (rw - .02)], top });
  }
  for (let i = 0; i < path.length; i++) {
    const p = path[i], [ox, , oz] = p.out;
    P.addEquipment('turretDetail', box(.026, p.top - floor, .026), ox, (p.top + floor) / 2, oz);
    if (i % 2 === 0) P.addEquipment('turretDetail', beamBetween(p.wall, p.out, .014, 6));       // floor bar from the wall
    if (i === 0) continue;
    const q = path[i - 1];
    P.addEquipment('turretDetail', beamBetween(q.out, p.out, .014, 6));                            // floor rail
    P.addEquipment('turretDetail', beamBetween([q.out[0], q.top, q.out[2]], [p.out[0], p.top, p.out[2]], .014, 6));  // top rail
    P.addEquipment('turretDetail', beamBetween([q.out[0], (q.top + floor) / 2, q.out[2]], [p.out[0], (p.top + floor) / 2, p.out[2]], .010, 6));
  }
  // the welded brackets carrying the frame, from the wall at the ends and astern
  for (const i of [0, Math.floor(path.length / 2), path.length - 1]) {
    const p = path[i];
    P.addEquipment('turretDetail', beamBetween([p.wall[0], floor + .14, p.wall[2]], [p.out[0], floor + .01, p.out[2]], .016, 6));
  }
  strappedPack(P, 'turret', [-.55, floor + .14, -1.42], [.46, .26, .30]);
  strappedPack(P, 'turret', [.58, floor + .13, -1.40], [.40, .24, .30]);
  P.addEquipment('turretDetail', cylX(.11, 1.0, P.q ? 20 : 12), 0, floor + .12, -1.58);
  for (const dx of [-.34, .34]) P.addEquipment('turretDark', torus(.114, .010, P.q ? 20 : 10, 4).rotateY(Math.PI / 2), dx, floor + .12, -1.58);
}

function smokeBanks(P: TankBuilderPort): void {
  // Two banks of four 902B tubes, one on each flank between the last block (96 deg) and the basket (112 deg), on a welded
  // bracket into the wall, firing forward and out.
  const a = 104 * Math.PI / 180, y = .36;
  for (const side of [-1, 1]) {
    const r = t64CastRadius(side * a, y), dir = new THREE.Vector3(side * Math.sin(a), 0, Math.cos(a));
    const base = dir.clone().multiplyScalar(r + .07);
    P.addEquipment('turretDetail', box(.14, .16, .30).rotateY(side * a), base.x, y - .02, base.z);
    for (let i = 0; i < 4; i++) {
      const along = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((i - 1.5) * .075);
      P.addEquipment('turretDark', markSmokeTube(blindTube(.041, .030, .25, .16, P.q ? 16 : 10), [0, 0, 1], true),
        base.x + dir.x * .03 + along.x, y + .10 + (i % 2) * .045, base.z + dir.z * .03 + along.z, -.62, side * .42, 0);
    }
  }
}

export function buildT64BM1M(P: TankBuilderPort): void {
  buildT64Base(P, { drums: false });
  for (const side of [-1, 1]) { t64RubberSkirt(P, side); sideScreens(P, side); }
  glacisNizh(P);
  for (const side of [-1, 1]) for (const [a0, a1] of BLOCKS) horseshoeBlock(P, side, a0, a1);
  roofNizh(P); rearBasket(P); smokeBanks(P);
  t64SearchlightAt(P, -.62, .40, 1.66);
  P.hullG.userData.familyRebuild = { base: 't64Foundation', revision: 1, variant: 'bm1m',
    features: ['nizh-glacis', 'nizh-horseshoe', 'nizh-roof', 'nizh-screens', 'rear-basket', 'smoke-flanks', 'l2g-searchlight'] };
}
