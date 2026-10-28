// The PT-64 Tur on the true T-64 base (t64Foundation.ts), new in 262. Owner 2026-10-27: "lets create a polish t64
// variannnt and add it too". Poland never fielded the T-64 (the USSR kept it for its own units), so the Tur is a
// first-party what-if: a T-64B1 put through Bumar-Łabędy's PT-91 Twardy programme, in the fleet's Polish "Krata" language
// (polandFrontEra.ts: ERAWA-lineage cassettes recessed in welded frames of bars and mullions, the Żubr's orthogonal
// grids) on the T-64's own hull and casting (docs/references/tanks/t64bm1m.md, the Tur row):
// - the glacis under two framed ERAWA-2 fields of four by four cassettes either side of a centre mullion;
// - two welded cheek boxes a side round the turret face, each faced by a framed grid of three by two cassettes, the
//   pair a faceted prow in plan;
// - framed two-by-five cassette grids on the leading third of each rubber skirt;
// - the Tellur 81 mm launchers, one bank of two rows of six a side on the turret flanks (the PT-91's 2 x 12), four Obra-3
//   laser warning heads, the Drawa-T thermal head ahead of the gunner's sight and a welded stowage box on the turret rear;
// - the commander's remote 12.7 mm on the Utyos housing (the WKM-B, Poland's own NSV development), drums and the log.
import * as THREE from 'three';
import { KIT, convexSlab } from './kit.ts';
import { blindTube } from './measuredPrimitives.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { strappedPack } from './modernizationFittings.ts';
import { buildT64Base, t64RubberSkirt, t64DomeHeight, t64GlacisY, T64_GLACIS_RAKE, T64_HULL } from './t64Foundation.ts';
import { t64CastRadius } from './t64bm1m.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX } = KIT;
type V3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- the Krata grid
const BAR = .032, BAR_PROUD = .09, CELL_PROUD = .06, CARRIER = .012;
interface GridSeat {
  owner: 'hull' | 'turret';
  sector: string;
  /** the grid's corner on the seat plane where `along` and `up` start */
  corner: THREE.Vector3;
  along: THREE.Vector3;
  up: THREE.Vector3;
  /** away from the armour the grid hangs on */
  normal: THREE.Vector3;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

/** A framed grid of ERAWA cassettes on a flat seat: a carrier plate, the bars and mullions standing 9 cm proud, and
 * each cassette 6 cm proud in its bay (3 cm down in the frame), so the frame reads as a grate round recessed cassettes. The carrier and the
 * frame are permanent; each cassette (and its lid) is one destructible cluster of the seat's sector. */
function krataGrid(P: TankBuilderPort, s: GridSeat): void {
  const n = s.normal.clone().normalize(), u = s.up.clone().normalize();
  // a right-handed basis (along x up = normal): flip the run and start from its far end if the seat's is left-handed
  let a = s.along.clone().normalize(), corner = s.corner.clone();
  if (a.clone().cross(u).dot(n) < 0) { corner.addScaledVector(a, s.width); a = a.negate(); }
  const basis = (cx: number, cy: number, cz: number) => new THREE.Matrix4().makeBasis(a, u, n)
    .setPosition(corner.clone().addScaledVector(a, cx).addScaledVector(u, cy).addScaledVector(n, cz));
  const detail = `${s.owner}Detail`, dark = `${s.owner}Dark`;
  const cw = (s.width - (s.cols + 1) * BAR) / s.cols, ch = (s.height - (s.rows + 1) * BAR) / s.rows;
  P.addEquipment(dark, box(s.width - .004, s.height - .004, CARRIER).applyMatrix4(basis(s.width / 2, s.height / 2, CARRIER / 2 - .002)));
  for (let i = 0; i <= s.cols; i++) {
    P.addEquipment(detail, box(BAR, s.height, BAR_PROUD).applyMatrix4(basis(BAR / 2 + i * (cw + BAR), s.height / 2, BAR_PROUD / 2)));
  }
  for (let j = 0; j <= s.rows; j++) {
    // the transoms stand 4 mm lower than the mullions, so no two bar faces share a plane where they cross
    P.addEquipment(detail, box(s.width, BAR, BAR_PROUD - .004).applyMatrix4(basis(s.width / 2, BAR / 2 + j * (ch + BAR), (BAR_PROUD - .004) / 2)));
  }
  for (let i = 0; i < s.cols; i++) for (let j = 0; j < s.rows; j++) {
    const cx = BAR + cw / 2 + i * (cw + BAR), cy = BAR + ch / 2 + j * (ch + BAR), depth = CELL_PROUD - CARRIER;
    P.destructibleCluster(s.sector, () => {
      P.addExternalArmor(s.owner, markEraHitFaces(box(cw - .008, ch - .008, depth), [0, 0, 1]).applyMatrix4(basis(cx, cy, CARRIER + depth / 2)));
      P.addExternalArmor(s.owner, markEraFurniture(box(cw * .74, ch * .70, .006)).applyMatrix4(basis(cx, cy, CELL_PROUD + .002)));
    });
  }
}

// ---------------------------------------------------------------- hull
function glacisFields(P: TankBuilderPort): void {
  // Two fields of four by four between the bow mudguards, either side of a centre mullion, from ahead of the splash
  // board (plan z 2.00) to the nose bar (2.94), laid on the plate.
  const n = new THREE.Vector3(0, Math.cos(T64_GLACIS_RAKE), Math.sin(T64_GLACIS_RAKE));
  const up = new THREE.Vector3(0, Math.sin(T64_GLACIS_RAKE), -Math.cos(T64_GLACIS_RAKE));
  const z0 = 2.94, z1 = 2.00, height = (z0 - z1) / Math.cos(T64_GLACIS_RAKE);
  for (const side of [-1, 1]) {
    krataGrid(P, { owner: 'hull', sector: `glacis_era_${side > 0 ? 'L' : 'R'}`, corner: new THREE.Vector3(side * .018, t64GlacisY(z0) - .002, z0),
      along: new THREE.Vector3(side, 0, 0), up, normal: n, width: .97, height, cols: 4, rows: 4 });
  }
}

function skirtGrids(P: TankBuilderPort, side: number): void {
  // A framed two-by-five grid over the leading third of each rubber skirt (its face at |x| 1.695), from the skirt's
  // front edge under the bow mudguard, hung from the fender lip on three hangers.
  const x = side * (T64_HULL.fenderOuterX + .035 + .002), z0 = 2.33, width = 1.36;
  krataGrid(P, { owner: 'hull', sector: `skirt_era_${side > 0 ? 'L' : 'R'}`, corner: new THREE.Vector3(x, .80, z0),
    along: new THREE.Vector3(0, 0, -1), up: UP, normal: new THREE.Vector3(side, 0, 0), width, height: .54, cols: 5, rows: 2 });
  for (const t of [.08, .5, .92]) {
    P.addEquipment('hullDetail', box(.10, .07, .06), side * (T64_HULL.fenderOuterX + .03), T64_HULL.deckY - .05, z0 - t * width);
  }
}

// ---------------------------------------------------------------- turret
/** The welded cheek boxes: two a side from 17 to 80 degrees off the bore, each from y 0.04 to its top, its back on
 * the casting and its face one flat plane (the pair a faceted prow), faced by a framed grid of three by two; the
 * flank box thins to 0.12 m so the turret stays inside 2.6 m across its boxes. */
const CHEEK_BOXES = [
  { a0: 17, a1: 50, d0: .34, d1: .26, top: .52 },
  { a0: 50, a1: 80, d0: .26, d1: .12, top: .47 },
] as const;
const BOX_BOTTOM = .04;
function cheekFace(side: number, a: number, depth: number): THREE.Vector3 {
  const phi = side * a * Math.PI / 180, r = t64CastRadius(phi, BOX_BOTTOM) + depth;
  return new THREE.Vector3(Math.sin(phi) * r, BOX_BOTTOM, Math.cos(phi) * r);
}
function cheekBox(P: TankBuilderPort, side: number, b: typeof CHEEK_BOXES[number]): void {
  const pts: V3[] = [];
  for (const [a, d] of [[b.a0, b.d0], [b.a1, b.d1]] as const) {
    const phi = side * a * Math.PI / 180, face = cheekFace(side, a, d);
    for (const y of [BOX_BOTTOM, b.top]) {
      const r = t64CastRadius(phi, y) - .03;
      pts.push([Math.sin(phi) * r, y, Math.cos(phi) * r], [face.x, y, face.z]);
    }
  }
  P.addEquipment('turretDetail', convexSlab(...pts));
  const A = cheekFace(side, b.a0, b.d0), B = cheekFace(side, b.a1, b.d1), along = B.clone().sub(A);
  const normal = new THREE.Vector3(-along.z, 0, along.x).multiplyScalar(side).normalize();
  krataGrid(P, { owner: 'turret', sector: `turret_era_${side > 0 ? 'L' : 'R'}`, corner: A.clone().addScaledVector(along.clone().normalize(), .005),
    along, up: UP, normal, width: along.length() - .01, height: b.top - BOX_BOTTOM - .005, cols: 3, rows: 2 });
  // the box's lid plate, a bolted strip along its top
  const mid = A.clone().lerp(B, .5);
  P.addEquipment('turretDark', box(along.length() * .9, .012, .05).rotateY(Math.atan2(along.x, along.z) - Math.PI / 2), mid.x, b.top + .006, mid.z);
}

function tellurBanks(P: TankBuilderPort): void {
  // The Tellur 81 mm launchers, the PT-91's 2 x 12: one bank a side behind the flank box (98-134 degrees), two rows
  // of six on a welded bracket plate standing off the casting, each tube raised 18 degrees and splayed out of the bore.
  const deg = Math.PI / 180, rows = [.17, .28] as const, seg = P.q ? 16 : 10;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = (100 + i * 6.4) * deg, r = t64CastRadius(side * a, .22) + .09;
      const x = side * Math.sin(a) * r, z = Math.cos(a) * r;
      // the bracket's upright between the rows and its arm back to the casting
      P.addEquipment('turretDetail', box(.11, .24, .025).rotateY(side * a), x, .225, z);
      P.addEquipment('turretDetail', box(.03, .03, .09).rotateY(side * a), x - side * Math.sin(a) * .045, .225, z - Math.cos(a) * .045);
      for (const y of rows) {
        P.addEquipment('turretDark', markSmokeTube(blindTube(.041, .030, .22, .14, seg), [0, 0, 1], true),
          x + side * Math.sin(a) * .02, y + .02, z + Math.cos(a) * .02, -18 * deg, side * (a - 70 * deg), 0);
      }
    }
  }
}

function obraHeads(P: TankBuilderPort): void {
  // The Obra-3 laser warning heads, one on a short post at each corner of the crown.
  for (const [x, z] of [[.80, .20], [-.80, .20], [.66, -.86], [-.80, -.80]] as const) {
    const y = t64DomeHeight(x, z) ?? .5, post = .08;
    P.addEquipment('turretDetail', new THREE.CylinderGeometry(.018, .022, post, 8), x, y + post / 2, z);
    P.addModuleVisual('optics', 'turretDetail', new THREE.CylinderGeometry(.06, .065, .10, P.q ? 16 : 10), x, y + post + .05, z);
    P.addModuleVisual('optics', 'turretGlass', new THREE.CylinderGeometry(.062, .062, .024, P.q ? 16 : 10), x, y + post + .055, z);
  }
}

function drawaHead(P: TankBuilderPort): void {
  // The Drawa-T thermal camera head right of the gunner's sight, ahead of the crown's slope, under its sun cowl.
  const x = .21, z = .36, y = t64DomeHeight(x, z) ?? .6;
  P.addModuleVisual('optics', 'turretDetail', box(.18, .20, .26), x, y + .09, z);
  P.addModuleVisual('optics', 'turretGlass', box(.12, .09, .012), x, y + .12, z + .132);
  P.addEquipment('turretDetail', box(.21, .02, .28), x, y + .20, z + .02);
}

function rearBox(P: TankBuilderPort): void {
  // A welded stowage box on the turret rear (150-210 degrees), 0.34 m out, from y 0.12 to 0.40, its lid hinged
  // along the wall; a tarp roll on it and packs strapped beside it.
  const deg = Math.PI / 180, bottom = .12, top = .40, depth = .34;
  for (const [a0, a1] of [[150, 180], [180, 210]] as const) {
    const pts: V3[] = [];
    for (const a of [a0, a1]) {
      const phi = a * deg, rb = t64CastRadius(phi, bottom), dir = [Math.sin(phi), Math.cos(phi)];
      for (const y of [bottom, top]) pts.push([dir[0] * (t64CastRadius(phi, y) - .03), y, dir[1] * (t64CastRadius(phi, y) - .03)], [dir[0] * (rb + depth), y, dir[1] * (rb + depth)]);
    }
    P.addEquipment('turretDetail', convexSlab(...pts));
  }
  const rr = t64CastRadius(Math.PI, top) + .12;
  P.addEquipment('turretDetail', cylX(.09, .86, P.q ? 20 : 12), 0, top + .08, -rr);
  strappedPack(P, 'turret', [-.82, .26, -1.18], [.30, .22, .40]);
  strappedPack(P, 'turret', [.84, .26, -1.16], [.30, .22, .40]);
}

export function buildPT64Tur(P: TankBuilderPort): void {
  buildT64Base(P, { drums: true, log: true, headlights: 'mudguard' });
  for (const side of [-1, 1]) { t64RubberSkirt(P, side); skirtGrids(P, side); }
  glacisFields(P);
  for (const side of [-1, 1]) for (const b of CHEEK_BOXES) cheekBox(P, side, b);
  tellurBanks(P); obraHeads(P); drawaHead(P); rearBox(P);
  P.hullG.userData.familyRebuild = { base: 't64Foundation', revision: 1, variant: 'tur',
    features: ['krata-glacis', 'krata-cheek-boxes', 'krata-skirts', 'tellur-2x12', 'obra-3', 'drawa-t', 'rear-box', 'drums', 'log'] };
}
