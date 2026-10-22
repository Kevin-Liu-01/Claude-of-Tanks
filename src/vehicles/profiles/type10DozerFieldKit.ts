// Type 10 (Dozer) field kit (owner 2026-10-22, verbatim: "make it have 2 unique auto cannnonn turrets, a bunch of new
// cages and side armor and turret armor and lights and equipment"). First-party procedural geometry: Kevin B. Liu
// (NOTICE.md). It rides the modern Type 10 (type10X.ts, built without its 12.7 mm station) beside the dozer kit
// (type10Dozer.ts). Authored in the hull frame; turret stock is taken into the turret's frame at its pivot.
//
// - Two remote autocannon turrets, each its own design and each a working auxiliary station at its true calibre
//   (sourceMachineGun): a 30 mm open cradle on the rear left roof and a 40 mm enclosed mini-turret with a boresighted
//   searchlight on the rear right roof, both on raised rings. Each covers the front and its own side; the barrels sweep
//   over the commander's cupola and sights, and each station's traverse keeps clear of the other station.
// - Cages: the modern field cage on the turret's rear two thirds (modernFieldCage.ts) and slat screens over the hull's
//   rear flanks.
// - Bolted appliqué (type10DozerArmor.ts, whose spaced plates the spec carries): four modules a side on the hull skirts,
//   two wall modules and a cheek module a side on the turret.
// - Lights: work lamps on the forward turret modules and on the bustle, and the searchlight.
// - Equipment: stowage bins on the front fenders; the field cage's strapped packs.
import * as THREE from 'three';
import { KIT, orientedSlab } from './kit.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { captureAuxiliaryStock } from './auxiliaryStation.ts';
import { addModernFieldCage } from './modernFieldCage.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { sectionSolid } from './sectionSolid.ts';
import { fieldChestParts, reserveDecorVolume } from './fieldChest.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { TYPE10_DOZER_HULL_APPLIQUE, TYPE10_DOZER_TURRET_APPLIQUE } from '../type10DozerArmor.ts';
import { TYPE10_X_DATUMS } from './type10X.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
const PIVOT = TYPE10_X_DATUMS.turretPivot;
const ROOF_Y = 2.208;          // the turret's rear roof (turret frame 0.70)
const { box, cylX, cylY, cylZ } = KIT;

/** Turret stock authored in the hull frame. */
function turret(P: TankBuilderPort, slot: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(slot, g, x - PIVOT[0], y - PIVOT[1], z - PIVOT[2], rx, ry, rz);
}

/** A beam between two hull-frame points, as turret stock. */
function turretBar(P: TankBuilderPort, slot: string, a: Point, b: Point, r: number): void {
  P.addEquipment(slot, beamBetween([a[0] - PIVOT[0], a[1] - PIVOT[1], a[2] - PIVOT[2]],
    [b[0] - PIVOT[0], b[1] - PIVOT[1], b[2] - PIVOT[2]], r, 8));
}

/** A bolted ring pedestal standing a station's race above the roof (static turret stock). */
function ringPedestal(P: TankBuilderPort, x: number, z: number, r: number, top: number): void {
  turret(P, 'turretDetail', cylY(r, r + .03, top - ROOF_Y + .012, P.q ? 32 : 20), x, (top + ROOF_Y - .012) / 2, z);
  turret(P, 'turretDark', cylY(r + .012, r + .012, .022, P.q ? 32 : 20), x, top - .011, z);       // bolted race flange
  if (P.q) for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    turret(P, 'turretDark', cylY(.011, .011, .012, 8), x + Math.cos(a) * (r - .015), top + .005, z + Math.sin(a) * (r - .015));
  }
}

// ---- turret A: the 30 mm open cradle (rear left roof) ------------------------------------------------------------------
const A = { x: -0.66, z: -1.40, race: 2.30, pivotY: 2.85, pivotZ: -1.30, name: 'type10DozerRws30', barrel: 1.62 } as const;

function turretA(P: TankBuilderPort): THREE.Group {
  ringPedestal(P, A.x, A.z, .34, A.race);
  const muzzleZ = A.pivotZ + .42 + A.barrel + .13;
  const w = sourceMachineGun(P, PIVOT, { name: A.name, caliberMm: 30,
    yaw: [A.x, A.race, A.z], pivot: [A.x, A.pivotY, A.pivotZ], muzzle: [A.x, A.pivotY, muzzleZ] });
  w.stage('yaw');
  w.add('turretDetail', cylY(.30, .31, .06, P.q ? 32 : 20), A.x, A.race + .03, A.z);                // traverse ring
  // low sloped housing: the drives and the slip ring
  w.add('turretDetail', sectionSolid([
    { z: A.z - .34, ring: [[A.x - .27, A.race + .05], [A.x + .27, A.race + .05], [A.x + .25, A.race + .24], [A.x - .25, A.race + .24]] },
    { z: A.z + .18, ring: [[A.x - .27, A.race + .05], [A.x + .27, A.race + .05], [A.x + .25, A.race + .24], [A.x - .25, A.race + .24]] },
    { z: A.z + .34, ring: [[A.x - .25, A.race + .05], [A.x + .25, A.race + .05], [A.x + .23, A.race + .13], [A.x - .23, A.race + .13]] },
  ]), 0, 0, 0);
  // the cradle's two cheeks up to the trunnion, a cross tie between them
  for (const s of [-1, 1]) {
    w.add('turretDetail', sectionSolid([
      { z: A.z - .22, ring: [[A.x + s * .135 - .016, A.race + .22], [A.x + s * .135 + .016, A.race + .22], [A.x + s * .135 + .016, A.pivotY - .02], [A.x + s * .135 - .016, A.pivotY - .02]] },
      { z: A.pivotZ + .14, ring: [[A.x + s * .135 - .016, A.race + .22], [A.x + s * .135 + .016, A.race + .22], [A.x + s * .135 + .016, A.pivotY + .07], [A.x + s * .135 - .016, A.pivotY + .07]] },
    ]), 0, 0, 0);
    w.add('turretDark', cylX(.045, .03, 16), A.x + s * .155, A.pivotY, A.pivotZ);                   // trunnion bosses
  }
  w.add('turretDetail', box(.24, .05, .10), A.x, A.race + .27, A.z - .17);
  w.add('turretDark', box(.10, .08, .14), A.x - .20, A.race + .14, A.z + .22);                       // elevation drive
  w.stage('pitch');
  // receiver and feeder, the barrel with its jacket and muzzle brake
  w.add('turretDark', box(.19, .19, .70), A.x, A.pivotY, A.pivotZ + .07);
  w.add('turretDark', box(.12, .06, .24), A.x, A.pivotY + .12, A.pivotZ + .02);                      // feeder cover
  w.add('turretDark', cylZ(.058, .22, P.q ? 20 : 14), A.x, A.pivotY, A.pivotZ + .53);              // barrel jacket
  w.add('turretDark', cylZ(.040, A.barrel, P.q ? 18 : 12, .044), A.x, A.pivotY, A.pivotZ + .42 + A.barrel / 2);
  w.add('turretDark', cylZ(.056, .13, P.q ? 18 : 12), A.x, A.pivotY, muzzleZ - .065);              // muzzle brake
  if (P.q) for (const s of [-1, 1]) w.add('turretDark', box(.012, .05, .07), A.x + s * .056, A.pivotY, muzzleZ - .065);
  // the ready box on the gun's left and its feed chute; the sight head on its right
  w.add('turretAmmo', box(.16, .28, .44), A.x - .215, A.pivotY - .02, A.pivotZ - .02);
  w.add('turretDark', box(.07, .05, .16), A.x - .115, A.pivotY + .06, A.pivotZ + .02);
  w.add('turretDetail', box(.17, .20, .28), A.x + .225, A.pivotY + .04, A.pivotZ + .06);
  w.add('turretGlass', box(.07, .07, .012), A.x + .19, A.pivotY + .07, A.pivotZ + .205);
  w.add('turretGlass', box(.045, .045, .012), A.x + .26, A.pivotY + .02, A.pivotZ + .205);
  w.add('turretDark', box(.19, .02, .30), A.x + .225, A.pivotY + .15, A.pivotZ + .08);             // sun hood
  return w.finish();
}

// ---- turret B: the 40 mm enclosed mini-turret (rear right roof) --------------------------------------------------------
const B = { x: 0.80, z: -1.10, race: 2.30, pivotY: 2.62, pivotZ: -0.66, name: 'type10DozerTurret40', barrel: 1.50 } as const;

function turretB(P: TankBuilderPort): THREE.Group {
  ringPedestal(P, B.x, B.z, .38, B.race);
  const muzzleZ = B.pivotZ + .16 + B.barrel + .22;
  const w = sourceMachineGun(P, PIVOT, { name: B.name, caliberMm: 40,
    yaw: [B.x, B.race, B.z], pivot: [B.x, B.pivotY, B.pivotZ], muzzle: [B.x, B.pivotY, muzzleZ] });
  w.stage('yaw');
  w.add('turretDetail', cylY(.34, .35, .06, P.q ? 32 : 20), B.x, B.race + .03, B.z);
  // faceted armoured housing: sloped glacis, raked sides, the ammunition bustle behind
  const ring = (half: number, top: number, roofHalf: number): [number, number][] =>
    [[B.x - half, B.race + .05], [B.x + half, B.race + .05], [B.x + roofHalf, top], [B.x - roofHalf, top]];
  w.add('turretDetail', sectionSolid([
    { z: B.z - .56, ring: ring(.30, B.race + .32, .26) },
    { z: B.z - .30, ring: ring(.37, B.race + .38, .30) },
    { z: B.pivotZ - .12, ring: ring(.37, B.race + .38, .30) },
    { z: B.pivotZ + .02, ring: ring(.35, B.race + .18, .32) },
  ]), 0, 0, 0);
  w.add('turretDark', box(.50, .02, .30), B.x, B.race + .385, B.z - .10);                          // roof hatch
  w.add('turretDetail', box(.66, .05, .06), B.x, B.race + .30, B.z - .58);                          // bustle lip
  // the sight on its left wall, under its armoured hood
  w.add('turretDetail', box(.15, .20, .30), B.x - .43, B.race + .25, B.pivotZ - .20);
  w.add('turretGlass', box(.08, .08, .012), B.x - .43, B.race + .27, B.pivotZ - .045);
  w.add('turretDark', box(.17, .02, .34), B.x - .43, B.race + .36, B.pivotZ - .19);
  // smoke dischargers, three a side, on the bustle cheeks
  if (P.q) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    w.add('turretDark', cylZ(.032, .14, 12), B.x + s * (.33 - i * .055), B.race + .30, B.z - .49, -.5, s * .35, 0);
  }
  w.stage('pitch');
  // the mantlet block, the gun and its brake
  w.add('turretDetail', box(.30, .22, .18), B.x, B.pivotY, B.pivotZ + .06);
  w.add('turretDark', cylZ(.078, .10, P.q ? 20 : 14), B.x, B.pivotY, B.pivotZ + .20);              // gun collar
  w.add('turretDark', cylZ(.050, B.barrel, P.q ? 18 : 12, .056), B.x, B.pivotY, B.pivotZ + .16 + B.barrel / 2);
  w.add('turretDark', cylZ(.068, .22, P.q ? 20 : 14), B.x, B.pivotY, muzzleZ - .11);               // perforated brake
  if (P.q) for (const dz of [-.07, .0, .07]) w.add('turretDark', cylZ(.074, .016, 20), B.x, B.pivotY, muzzleZ - .11 + dz);
  // searchlight housing on the mantlet's left (its lens rides the gun's pitch below)
  w.add('turretDetail', box(.06, .06, .10), B.x - .19, B.pivotY + .02, B.pivotZ + .07);
  w.add('turretDark', cylZ(.075, .16, P.q ? 20 : 14), B.x - .26, B.pivotY + .03, B.pivotZ + .10);
  return w.finish();
}

function searchlightB(P: TankBuilderPort): void {
  const done = captureAuxiliaryStock(P, B.name, 'pitch');
  turret(P, 'turretGlass', markVehicleNightLens(cylZ(.062, .012, P.q ? 20 : 14), 'headlight', { searchlight: true, tint: 'cool' }),
    B.x - .26, B.pivotY + .03, B.pivotZ + .181);
  done();
}

// ---- bolted appliqué ----------------------------------------------------------------------------------------------------
/** A module extruded across x (x0 .. x0 + t on side s) from a [z, y] side outline, with its bolt heads. */
function sideModule(P: TankBuilderPort, owner: 'hull' | 'turret', s: number, x0: number, t: number,
  outline: [number, number][], bolts: [number, number][]): void {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, steps: 1, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);             // shape (z, y) -> (z along +Z, y up), extrusion along -X
  g.translate(s > 0 ? x0 + t : -x0, 0, 0);
  P.addExternalArmor(owner, g);       // hull modules in the hull frame, turret modules in the turret frame
  // a raised retaining frame round the outer face (the cover plate's bolted rim) and its bolt heads
  const rim = .028, proud = .016, x = s * (x0 + t + proud / 2 - .002);
  for (let i = 0; i < outline.length; i++) {
    const [za, ya] = outline[i], [zb, yb] = outline[(i + 1) % outline.length];
    const len = Math.hypot(zb - za, yb - ya), mz = (za + zb) / 2, my = (ya + yb) / 2;
    // the strip lies inside the outline along its edge
    const cz = -(yb - ya) / len, cy = (zb - za) / len;   // inward normal of a counter-clockwise (z, y) outline
    P.addExternalArmor(owner, box(proud, rim, len + rim), x, my + cy * rim / 2, mz + cz * rim / 2, -Math.atan2(yb - ya, zb - za), 0, 0);
  }
  const face = s * (x0 + t + .006);
  for (const [z, y] of bolts) P.addEquipment(owner === 'hull' ? 'hullDark' : 'turretDark', cylX(.017, .012, 8), face, y, z);
}

function hullApplique(P: TankBuilderPort): void {
  const H = TYPE10_DOZER_HULL_APPLIQUE;
  for (const s of [-1, 1]) {
    H.spans.forEach(([rear, front], i) => {
      const outline: [number, number][] = i === 0
        ? [[rear, H.y0], [H.rake, H.y0], [front, H.y0 + (front - H.rake)], [front, H.y1], [rear, H.y1]]
        : [[rear, H.y0], [front, H.y0], [front, H.y1], [rear, H.y1]];
      const bolts: [number, number][] = [];
      for (const z of [rear + .07, (rear + front) / 2, front - .07]) for (const y of [H.y0 + .07, H.y1 - .07]) {
        if (!(i === 0 && z > H.rake - .02 && y < H.y0 + .2)) bolts.push([z, y]);
      }
      sideModule(P, 'hull', s, H.x0, H.t, outline, bolts);
      // a lifting eye on each module's top
      P.addEquipment('hullDark', box(.03, .045, .07), s * (H.x0 + H.t / 2), H.y1 + .02, (rear + front) / 2);
    });
  }
}

function turretApplique(P: TankBuilderPort): void {
  const T = TYPE10_DOZER_TURRET_APPLIQUE;
  for (const s of [-1, 1]) {
    for (const [rear, front] of T.spans) {
      sideModule(P, 'turret', s, T.x0, T.t, [[rear, T.y0], [front, T.y0], [front, T.y1], [rear, T.y1]],
        [[rear + .06, T.y0 + .06], [rear + .06, T.y1 - .06], [front - .06, T.y0 + .06], [front - .06, T.y1 - .06]]);
    }
    // the cheek module: slabs along the wedge, inner face on the cheek line, the outer face `t` out along its normal
    for (let i = 0; i + 1 < T.cheek.length; i++) {
      const [[za, xa], [zb, xb]] = [T.cheek[i], T.cheek[i + 1]];
      const len = Math.hypot(zb - za, xb - xa), nx = (zb - za) / len, nz = (xa - xb) / len;
      const q = (z: number, x: number, y: number, out: number): number[] =>
        [s * (x + nx * out), y, z + nz * out];
      const geometry = orientedSlab(
        q(za, xa, T.y0, -.004), q(zb, xb, T.y0, -.004), q(zb, xb, T.y1, -.004), q(za, xa, T.y1, -.004),
        q(za, xa, T.y0, T.t), q(zb, xb, T.y0, T.t), q(zb, xb, T.y1, T.t), q(za, xa, T.y1, T.t));
      P.addExternalArmor('turret', geometry);
      for (const f of [.25, .75]) for (const y of [T.y0 + .06, T.y1 - .06]) {
        const z = za + (zb - za) * f, x = xa + (xb - xa) * f;
        P.addEquipment('turretDark', cylX(.017, .012, 8), s * (x + nx * (T.t + .006)), y, z + nz * (T.t + .006), 0, -s * Math.atan2(nz, nx), 0);
      }
    }
  }
}

// ---- slat screens over the hull's rear flanks ---------------------------------------------------------------------------
const SCREEN = { z0: -3.40, z1: -0.46, y0: 0.66, y1: 1.24, standoff: 0.16, face: 1.575 } as const;

function hullScreens(P: TankBuilderPort): void {
  const S = SCREEN;
  for (const s of [-1, 1]) {
    const x = s * (S.face + S.standoff);
    const bar = (a: Point, b: Point, r: number): void => P.addEquipment('hullOpenLattice', beamBetween(a, b, r, 8));
    for (const y of [S.y0, S.y1]) bar([x, y, S.z0], [x, y, S.z1], .016);
    bar([x, (S.y0 + S.y1) / 2, S.z0], [x, (S.y0 + S.y1) / 2, S.z1], .008);
    const slats = Math.ceil((S.z1 - S.z0) / .10);
    for (let i = 0; i <= slats; i++) {
      const z = S.z0 + (S.z1 - S.z0) * i / slats;
      bar([x, S.y0 - .015, z], [x, S.y1 + .015, z], .006);
    }
    // brackets: a bolted foot on the skirt and a stand-off arm at each station, top and bottom
    for (const z of [S.z0 + .05, -2.43, -1.45, S.z1 - .05]) for (const y of [S.y0 + .04, S.y1 - .04]) {
      P.addEquipment('hullDark', box(.025, .09, .09), s * (S.face + .0125), y, z);
      bar([s * (S.face + .02), y, z], [x, y, z], .016);
    }
  }
}

// ---- lights -------------------------------------------------------------------------------------------------------------
/** A guarded work lamp facing +Z (or -Z with `back`), its foot at (x, y, z), hull frame, turret stock. */
function workLamp(P: TankBuilderPort, x: number, y: number, z: number, back = false): void {
  const d = back ? -1 : 1, ry = back ? Math.PI : 0;
  turret(P, 'turretDark', box(.07, .05, .07), x, y + .025, z);                                      // foot
  turret(P, 'turretDetail', cylZ(.062, .11, P.q ? 20 : 14), x, y + .11, z + d * .02, 0, ry, 0);
  turret(P, 'turretGlass', markVehicleNightLens(cylZ(.050, .012, P.q ? 20 : 14), 'headlight'), x, y + .11, z + d * .077, 0, ry, 0);
  for (const side of [-1, 1]) turretBar(P, 'turretDark', [x + side * .07, y + .05, z - d * .03], [x + side * .07, y + .18, z + d * .09], .006);
  turretBar(P, 'turretDark', [x - .07, y + .18, z + d * .09], [x + .07, y + .18, z + d * .09], .006);
}

// ---- equipment ----------------------------------------------------------------------------------------------------------
/** A stowage bin on a front fender, its floor on the fender's fall (1.378 at z 1.88 to 1.31 at z 3.35). */
function fenderBin(P: TankBuilderPort, s: number): void {
  const x = s * 1.30, z = 2.86, fall = (1.378 - 1.31) / (3.35 - 1.88), y = 1.378 - (z - 1.88) * fall - .004;
  const { paint, dark } = fieldChestParts(.40, .24, .74, { high: P.q !== false, front: s as 1 | -1, handles: true });
  for (const g of paint) P.addEquipment('hullEquipment', g, x, y, z, Math.atan(fall));
  for (const g of dark) P.addEquipment('hullDark', g, x, y, z, Math.atan(fall));
  reserveDecorVolume(P.hullG, [x - .24, y - .02, z - .42], [x + .24, y + .30, z + .42]);
}

export function addType10DozerFieldKit(P: TankBuilderPort): void {
  // Each station's traverse and, where the roof stock rises under its barrel, its depression (tools/roof-station-arcs.mjs
  // on this build, 1 degree steps: the 30 mm clear -116..106 degrees, the 40 mm -38..143, each blocked only toward the
  // other station and the masts; 2 degrees and 0.01 rad of margin, and the full 0.18 rad restored between the bands).
  const a = turretA(P);
  a.userData.yawArc = [-1.9897, 1.8151];
  a.userData.depressionByYaw = [[-0.7156,0.18],[-0.6283,0.139],[-0.5411,0.074],[-0.4538,0.06],[-0.3665,0.063],[-0.2793,0.065],[-0.192,0.116],[-0.1047,0.18],[0.7679,0.18],[0.8552,0.057],[0.9425,0.043],[1.0297,0.035],[1.117,0.032],[1.2043,0.063],[1.2915,0.057],[1.3788,0.054],[1.4661,0.054],[1.5533,0.063],[1.6406,0.08],[1.7279,0.091],[1.8151,0.136]];
  const b = turretB(P);
  b.userData.yawArc = [-0.6283, 2.4609];
  b.userData.depressionByYaw = [[-0.6632,0.063],[-0.576,0.071],[-0.4887,0.18],[-0.3142,0.18],[-0.2269,0.094],[-0.1396,0.043],[-0.0524,0.043],[0.0349,0.043],[0.1222,0.18]];
  searchlightB(P);
  // the stations, their rings and their sweep stay the stations' (the decor keeps its loads off them)
  for (const [x, z, r] of [[A.x, A.z, .42], [B.x, B.z, .46]] as const) {
    reserveDecorVolume(P.turretG, [x - r - PIVOT[0], ROOF_Y - PIVOT[1], z - r - PIVOT[2]], [x + r - PIVOT[0], 3.0 - PIVOT[1], z + r - PIVOT[2]]);
  }
  turretApplique(P);
  addModernFieldCage(P);
  hullApplique(P);
  hullScreens(P);
  const T = TYPE10_DOZER_TURRET_APPLIQUE;
  for (const s of [-1, 1]) {
    workLamp(P, s * (T.x0 + T.t / 2) + PIVOT[0], T.y1 + PIVOT[1], T.spans[1][1] - .05 + PIVOT[2]);
    fenderBin(P, s);
  }
  workLamp(P, -.30, ROOF_Y, -1.80, true);                                                          // over the bustle
}
