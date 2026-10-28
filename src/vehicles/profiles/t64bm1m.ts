// The T-64BM1M on the true T-64 base (t64Foundation.ts): Kharkiv's Nizh-protected T-64B1 for the National Guard (the
// T-64B1M of the 2014 Congo order and its BM1M follow-on). Its own kit, from the 42manako print's cassette layout
// and the cited photographs (docs/references/tanks/t64bm1m.md):
// - Nizh on the glacis: two courses of ten cells from the splash board to the nose bar;
// - the Nizh horseshoe: six deep wedge blocks a side round the turret front, their outer faces leaning back, their
//   flat tops meeting the casting; a grid of flat Nizh tiles on the crown ahead of the hatches;
// - five Nizh side screens a side hung outside the rubber skirt over the forward four fifths of the hull;
// - the stowage bustle on the turret rear inside its rack, and the 902B Tucha banks moved to both flanks (4 + 4);
// - the L-2G searchlight right of the gun, ahead of the first block.
import * as THREE from 'three';
import { KIT, convexSlab } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { attachedCage, strappedPack } from './modernizationFittings.ts';
import { buildT64Base, t64RubberSkirt, t64DomeContains, t64DomeHeight, t64GlacisY, T64_GLACIS_RAKE, T64_HULL, t64SearchlightAt } from './t64Foundation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX } = KIT;
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
const BLOCK_BOTTOM = .10, BLOCK_TOP = .53;
/** Six wedge blocks a side: plan spans in degrees from straight ahead. */
const BLOCKS = [[16, 29], [30, 43], [44, 57], [58, 71], [72, 85], [86, 99]] as const;
function horseshoeBlock(P: TankBuilderPort, side: number, a0: number, a1: number): void {
  const deg = Math.PI / 180, corner = (a: number, r: number, y: number): V3 => [side * Math.sin(a * deg) * r, y, Math.cos(a * deg) * r];
  const depthBottom = .40, lean = .15;
  const pts: V3[] = [];
  for (const a of [a0, a1]) {
    const rb = t64CastRadius(side * a * deg, BLOCK_BOTTOM), rt = t64CastRadius(side * a * deg, BLOCK_TOP);
    pts.push(corner(a, rb - .025, BLOCK_BOTTOM), corner(a, rb + depthBottom, BLOCK_BOTTOM),
      corner(a, rt - .025, BLOCK_TOP), corner(a, rb + depthBottom - lean, BLOCK_TOP));
  }
  const mid = (a0 + a1) / 2 * deg, outward: V3 = [side * Math.sin(mid), Math.sin(.32), Math.cos(mid)];
  const body = convexSlab(pts[0], pts[1], pts[5], pts[4], pts[2], pts[3], pts[7], pts[6]);
  P.destructibleCluster(`turret_era_${side > 0 ? 'L' : 'R'}`, () => {
    P.addExternalArmor('turret', markEraHitFaces(body, outward, .55));
    // the lid's bolted rim on the outer face
    const am = (a0 + a1) / 2, rb = t64CastRadius(side * am * deg, BLOCK_BOTTOM) + depthBottom;
    const c = corner(am, rb - lean / 2 + .006, (BLOCK_BOTTOM + BLOCK_TOP) / 2);
    const lid = markEraFurniture(box((a1 - a0) * deg * rb * .82, (BLOCK_TOP - BLOCK_BOTTOM) * .80, .010));
    lid.rotateX(-Math.atan2(lean, BLOCK_TOP - BLOCK_BOTTOM)).rotateY(side * am * deg).translate(...c);
    P.addExternalArmor('turret', lid);
  });
}

function roofNizh(P: TankBuilderPort): void {
  // Flat Nizh tiles on the crown ahead of the hatches, clear of the sight head (x 0.33..0.59) and the cupola.
  const tiles: readonly (readonly [number, number])[] = [[-.80, .14], [-.48, .14], [-.16, .14], [.16, .14],
    [-.80, .46], [-.48, .46], [-.16, .46], [.16, .46], [.86, .20], [.86, -.14]];
  for (const [x, z] of tiles) {
    const y = Math.max(...[-.13, .13].flatMap(dx => [-.13, .13].map(dz => t64DomeHeight(x + dx, z + dz) ?? -1)));
    if (y < 0) continue;
    const dzY = ((t64DomeHeight(x, z + .1) ?? y) - (t64DomeHeight(x, z - .1) ?? y)) / .2;
    const dxY = ((t64DomeHeight(x + .1, z) ?? y) - (t64DomeHeight(x - .1, z) ?? y)) / .2;
    const tile = new THREE.BoxGeometry(.28, .050, .28).rotateX(-Math.atan(dzY)).rotateZ(Math.atan(dxY));
    P.destructibleCluster('turret_roof_era', () => {
      P.addExternalArmor('turret', markEraHitFaces(tile, [0, 1, 0]), x, y + .012, z);
      P.addExternalArmor('turret', markEraFurniture(box(.24, .008, .24).rotateX(-Math.atan(dzY)).rotateZ(Math.atan(dxY))), x, y + .041, z);
    });
  }
}

// ---------------------------------------------------------------- side screens
function sideScreens(P: TankBuilderPort, side: number): void {
  // Five Nizh screens a side, hung from the fender lip on two straps each, outside the rubber skirt.
  const x = side * (T64_HULL.fenderOuterX + .115), th = .145, len = .89;
  for (let i = 0; i < 5; i++) {
    const z = -2.33 + .465 + i * .932;
    P.destructibleCluster(`skirt_era_${side > 0 ? 'L' : 'R'}`, () => {
      P.addExternalArmor('hull', markEraHitFaces(box(th, .64, len), [side, 0, 0]), x, 1.02, z);
      P.addExternalArmor('hull', markEraFurniture(box(.010, .56, len * .92)), x + side * (th / 2 + .004), 1.02, z);
    });
    for (const dz of [-len * .32, len * .32]) {
      P.addEquipment('hullDetail', beamBetween([side * (T64_HULL.fenderOuterX - .02), T64_HULL.deckY - .04, z + dz],
        [x - side * th * .4, 1.30, z + dz], .016, 8));
    }
  }
}

// ---------------------------------------------------------------- turret rear and flanks
function bustle(P: TankBuilderPort): void {
  // The stowage bustle across the turret rear (z -0.96..-1.74), its lid's seam and latches, inside its rack.
  const rows = [-1.74, -1.70, -1.0, -.90].map((z, i) => {
    const w = i === 0 ? .80 : .845, top = i === 0 ? .58 : .62;
    return { z, ring: [[-w, .12], [w, .12], [w, top - .04], [w - .04, top], [-w + .04, top], [-w, top - .04]] as [number, number][] };
  });
  P.add('turret', sectionSolid(rows));
  P.addEquipment('turretDark', box(1.62, .010, .012), 0, .621, -1.30);
  for (const x of [-.52, 0, .52]) P.addEquipment('turretDetail', box(.06, .05, .025), x, .54, -1.755);
  attachedCage(P, 'turret', [0, .36, -1.98], 1.92, .42, .24);
  strappedPack(P, 'turret', [-.42, .76, -1.38], [.62, .24, .40]);
  // the OPVT snorkel tube strapped along the rack's rear rail
  P.addEquipment('turretDetail', cylX(.11, 1.10, P.q ? 20 : 12), .30, .52, -2.02);
}

function smokeBanks(P: TankBuilderPort): void {
  // Two banks of four 902B tubes, one on each flank behind the last block, on a welded bracket into the wall.
  for (const side of [-1, 1]) {
    const z = -.56, y = .44, r = t64CastRadius(side * Math.PI / 2 + side * .45, y);
    const x = side * (Math.sin(Math.PI / 2 + .45) * r + .10), zc = Math.cos(Math.PI / 2 + .45) * r;
    P.addEquipment('turretDetail', box(.12, .16, .36), x - side * .07, y - .02, zc + .02);
    for (let i = 0; i < 4; i++) {
      const dz = (i - 1.5) * .085, dy = (i % 2) * .05;
      P.addEquipment('turretDark', markSmokeTube(blindTube(.041, .030, .25, .16, P.q ? 16 : 10), [0, 0, 1], true),
        x + side * .02, y + .10 + dy, zc + dz + .06, -.62, side * .48, 0);
    }
    void z;
  }
}

export function buildT64BM1M(P: TankBuilderPort): void {
  buildT64Base(P, { drums: false });
  for (const side of [-1, 1]) { t64RubberSkirt(P, side); sideScreens(P, side); }
  glacisNizh(P);
  for (const side of [-1, 1]) for (const [a0, a1] of BLOCKS) horseshoeBlock(P, side, a0, a1);
  roofNizh(P); bustle(P); smokeBanks(P);
  t64SearchlightAt(P, -.62, .40, 1.66);
  P.hullG.userData.familyRebuild = { base: 't64Foundation', revision: 1, variant: 'bm1m',
    features: ['nizh-glacis', 'nizh-horseshoe', 'nizh-roof', 'nizh-screens', 'bustle', 'smoke-flanks', 'l2g-searchlight'] };
}
