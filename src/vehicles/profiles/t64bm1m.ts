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
  // One continuous Nizh slab across the glacis: two courses of ten cells edge to edge between the bow mudguards (the
  // print's 22 cells), 3 mm into the plate, from ahead of the splash board to the nose bar.
  const n = new THREE.Vector3(0, Math.cos(T64_GLACIS_RAKE), Math.sin(T64_GLACIS_RAKE)), th = .072;
  const rotation = new THREE.Matrix4().makeRotationX(T64_GLACIS_RAKE);
  for (const z of [2.255, 2.715]) for (let i = 0; i < 10; i++) {
    const x = (i - 4.5) * .207;
    const p = new THREE.Vector3(x, t64GlacisY(z), z).addScaledVector(n, th / 2 - .003);
    const basis = rotation.clone().setPosition(p);
    P.destructibleCluster(`glacis_era_${x < 0 ? 'R' : 'L'}`, () => {
      P.addExternalArmor('hull', markEraHitFaces(new THREE.BoxGeometry(.204, th, .505), [0, 1, 0]).applyMatrix4(basis));
      P.addExternalArmor('hull', markEraFurniture(new THREE.BoxGeometry(.17, .008, .44)).translate(0, th / 2 + .004, 0).applyMatrix4(basis));
    });
  }
}

// ---------------------------------------------------------------- turret horseshoe
// Five deep wedge blocks a side, edge to edge round the turret face (plan spans in degrees from straight ahead), one
// continuous prow standing 0.36-0.46 m off the casting: each stands from y 0.10, its outer face near upright, its top
// falling 8 cm outward and lower toward the gun (front 0.34, flank 0.52), the print's low wedge in profile.
const BLOCK_BOTTOM = .10, BLOCKS = [[14, 30], [30, 46], [46, 62], [62, 78], [78, 96]] as const;
const blockTop = (deg: number) => .34 + .18 * Math.min(1, Math.max(0, (deg - 14) / 82));
const blockDepth = (deg: number) => .46 - .10 * Math.min(1, Math.max(0, (deg - 14) / 82));
const LEAN = .04, FALL = .08;
function horseshoeBlock(P: TankBuilderPort, side: number, a0: number, a1: number): void {
  const deg = Math.PI / 180, corner = (a: number, r: number, y: number): V3 => [side * Math.sin(a * deg) * r, y, Math.cos(a * deg) * r];
  const pts: V3[] = [];
  for (const a of [a0, a1]) {
    const top = blockTop(a), rb = t64CastRadius(side * a * deg, BLOCK_BOTTOM), rt = t64CastRadius(side * a * deg, top);
    const outer = rb + blockDepth(a);
    pts.push(corner(a, rb - .025, BLOCK_BOTTOM), corner(a, outer, BLOCK_BOTTOM), corner(a, rt - .025, top), corner(a, outer - LEAN, top - FALL));
  }
  const mid = (a0 + a1) / 2 * deg, outward: V3 = [side * Math.sin(mid), Math.sin(.26), Math.cos(mid)];
  const body = convexSlab(...pts);
  P.destructibleCluster(`turret_era_${side > 0 ? 'L' : 'R'}`, () => {
    P.addExternalArmor('turret', markEraHitFaces(body, outward, .55));
    // the lid's bolted rim on the outer face
    const am = (a0 + a1) / 2, rb = t64CastRadius(side * am * deg, BLOCK_BOTTOM) + blockDepth(am), top = blockTop(am) - FALL;
    const c = corner(am, rb - LEAN / 2 + .006, (BLOCK_BOTTOM + top) / 2);
    const lid = markEraFurniture(box((a1 - a0) * deg * rb * .80, (top - BLOCK_BOTTOM) * .78, .010));
    lid.rotateX(-Math.atan2(LEAN, top - BLOCK_BOTTOM)).rotateY(side * am * deg).translate(...c);
    P.addExternalArmor('turret', lid);
  });
}

function roofNizh(P: TankBuilderPort): void {
  // One raised slab of thin Nizh plates on the crown ahead of the hatches: two rows of four edge to edge (and one beside
  // the sight head on the left), each laid to the roof's slope, clear of the sight head (x 0.33..0.59) and the cupola.
  for (const z of [.14, .405]) for (const x of [-.80, -.535, -.27, -.005, .80]) {
    const y = Math.max(...[-.12, .12].flatMap(dx => [-.12, .12].map(dz => t64DomeHeight(x + dx, z + dz) ?? -1)));
    if (y < 0) continue;
    const dzY = ((t64DomeHeight(x, z + .1) ?? y) - (t64DomeHeight(x, z - .1) ?? y)) / .2;
    const dxY = ((t64DomeHeight(x + .1, z) ?? y) - (t64DomeHeight(x - .1, z) ?? y)) / .2;
    const lay = (g: THREE.BufferGeometry) => g.rotateX(-Math.atan(dzY)).rotateZ(Math.atan(dxY));
    P.destructibleCluster('turret_roof_era', () => {
      P.addExternalArmor('turret', markEraHitFaces(lay(new THREE.BoxGeometry(.262, .034, .262)), [0, 1, 0]), x, y + .008, z);
      P.addExternalArmor('turret', markEraFurniture(lay(new THREE.BoxGeometry(.23, .006, .23))), x, y + .028, z);
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
/** The open basket wrapped round the turret rear (the print's basket; MilitaryLand's in-service photograph): a low
 * flat-bar box 0.40 m out from the casting, its floor at y 0.10 and its top bar at 0.34 (the ends) to 0.40 (astern),
 * upright bars between, welded brackets from the wall; packs, the OPVT tube and a tarp roll inside. */
function rearBasket(P: TankBuilderPort): void {
  const deg = Math.PI / 180, floor = .10, path: { a: number; out: V3; wall: V3; top: number }[] = [];
  for (let d = 110; d <= 250.01; d += 10) {
    const a = d * deg, rw = t64CastRadius(a, floor), dir = [Math.sin(a), Math.cos(a)];
    const top = .34 + .06 * (1 - Math.abs(d - 180) / 70);
    path.push({ a, out: [dir[0] * (rw + .40), floor, dir[1] * (rw + .40)], wall: [dir[0] * (rw - .02), floor, dir[1] * (rw - .02)], top });
  }
  const flatBar = (from: V3, to: V3, w: number, h: number) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), d = b.clone().sub(a);
    P.addEquipment('turretDetail', box(w, h, d.length()).rotateY(Math.atan2(d.x, d.z)), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  };
  for (let i = 0; i < path.length; i++) {
    const p = path[i], [ox, , oz] = p.out;
    P.addEquipment('turretDetail', box(.03, p.top - floor, .03).rotateY(p.a), ox, (p.top + floor) / 2, oz);
    flatBar(p.wall, p.out, .045, .010);                                                   // floor slat from the wall
    if (i === 0) continue;
    const q = path[i - 1];
    flatBar(q.out, p.out, .010, .045);                                                    // floor rail
    flatBar([q.out[0], q.top, q.out[2]], [p.out[0], p.top, p.out[2]], .010, .045);        // top bar
    flatBar([q.out[0], (q.top + floor) / 2, q.out[2]], [p.out[0], (p.top + floor) / 2, p.out[2]], .008, .030);
  }
  for (const i of [0, Math.floor(path.length / 2), path.length - 1]) {
    const p = path[i];
    P.addEquipment('turretDetail', beamBetween([p.wall[0], floor + .14, p.wall[2]], [p.out[0], floor + .01, p.out[2]], .016, 6));
  }
  strappedPack(P, 'turret', [-.58, floor + .13, -1.48], [.48, .24, .32]);
  strappedPack(P, 'turret', [.60, floor + .12, -1.46], [.42, .22, .32]);
  P.addEquipment('turretDetail', cylX(.11, 1.0, P.q ? 20 : 12), 0, floor + .12, -1.66);
  for (const dx of [-.34, .34]) P.addEquipment('turretDark', torus(.114, .010, P.q ? 20 : 10, 4).rotateY(Math.PI / 2), dx, floor + .12, -1.66);
}

function smokeBanks(P: TankBuilderPort): void {
  // A row of four 902B tubes on each rear flank, on the last Nizh block's top (78-96 deg), firing forward, up and out.
  const deg = Math.PI / 180;
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = (82 + i * 4.2) * deg, top = blockTop(a / deg) - FALL * .6;
    const r = t64CastRadius(side * a, BLOCK_BOTTOM) + blockDepth(a / deg) * .55;
    const x = side * Math.sin(a) * r, z = Math.cos(a) * r;
    P.addEquipment('turretDetail', box(.10, .05, .10).rotateY(side * a), x, top + .010, z);
    P.addEquipment('turretDark', markSmokeTube(blindTube(.041, .030, .25, .16, P.q ? 16 : 10), [0, 0, 1], true),
      x, top + .07, z, -.62, side * .30, 0);
  }
}

export function buildT64BM1M(P: TankBuilderPort): void {
  buildT64Base(P, { drums: false, headlights: 'mudguard' });
  for (const side of [-1, 1]) { t64RubberSkirt(P, side); sideScreens(P, side); }
  glacisNizh(P);
  for (const side of [-1, 1]) for (const [a0, a1] of BLOCKS) horseshoeBlock(P, side, a0, a1);
  roofNizh(P); rearBasket(P); smokeBanks(P);
  t64SearchlightAt(P, -.62, .42, 1.76);
  P.hullG.userData.familyRebuild = { base: 't64Foundation', revision: 1, variant: 'bm1m',
    features: ['nizh-glacis', 'nizh-horseshoe', 'nizh-roof', 'nizh-screens', 'rear-basket', 'smoke-flanks', 'l2g-searchlight'] };
}
