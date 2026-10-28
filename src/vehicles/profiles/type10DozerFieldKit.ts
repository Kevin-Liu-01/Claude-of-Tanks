// Type 10 Kaitaku field kit (owner 2026-10-22, verbatim: "make it have 2 unique auto cannnonn turrets, a bunch of new
// cages and side armor and turret armor and lights and equipment", then "sorry they should be machine guns not
// autocannons", "also add a giant flootlight next to gun to left of it", then "put thee flood light on other side of
// gun"). First-party procedural geometry: Kevin B. Liu (NOTICE.md). It rides the modern Type 10 (type10X.ts, built without its 12.7 mm station) beside the dozer kit
// (type10Dozer.ts). Authored in the hull frame; turret stock is taken into the turret's frame at its pivot.
//
// - Two remote machine-gun turrets, each its own design and each a working auxiliary station at its true calibre
//   (sourceMachineGun): a 12.7 mm heavy machine gun on an open cradle on the rear left roof and a 7.62 mm machine gun in
//   an enclosed mini-turret with a boresighted searchlight on the rear right roof, both on raised rings. Each covers the
//   front and its own side; the barrels sweep over the commander's cupola and sights, and each station's traverse keeps
//   clear of the other station.
// - A giant floodlight beside the main gun on its right (-x), on a yoke bolted to the right cheek.
// - Cages: the modern field cage on the turret's rear two thirds (modernFieldCage.ts) and slat screens over the hull's
//   rear flanks.
// - Bolted appliqué (type10DozerArmor.ts, whose spaced plates the spec carries): four modules a side on the hull skirts,
//   two wall modules and a cheek module a side on the turret.
// - Lights: work lamps on the forward turret modules and on the bustle, the searchlight, and an equipment light on the
//   original Type 10's 12.7 mm seat.
// - Smoke: a four-tube bank a side on the rear turret modules (the TK-X build's eight charges; type10 draws none).
// - Equipment: stowage bins on the front fenders; the field cage's strapped packs.
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { mount } from './fittingMount.ts';
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

// ---- turret A: the 12.7 mm heavy machine gun on an open cradle (rear left roof) -------------------------------------------
const A = { x: -0.66, z: -1.40, race: 2.30, pivotY: 2.85, pivotZ: -1.30, name: 'type10DozerRws127' } as const;

function turretA(P: TankBuilderPort): THREE.Group {
  ringPedestal(P, A.x, A.z, .34, A.race);
  const muzzleZ = A.pivotZ + 1.47;
  const w = sourceMachineGun(P, PIVOT, { name: A.name, caliberMm: 12.7,
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
      { z: A.z - .22, ring: [[A.x + s * .125 - .016, A.race + .22], [A.x + s * .125 + .016, A.race + .22], [A.x + s * .125 + .016, A.pivotY - .02], [A.x + s * .125 - .016, A.pivotY - .02]] },
      { z: A.pivotZ + .12, ring: [[A.x + s * .125 - .016, A.race + .22], [A.x + s * .125 + .016, A.race + .22], [A.x + s * .125 + .016, A.pivotY + .06], [A.x + s * .125 - .016, A.pivotY + .06]] },
    ]), 0, 0, 0);
    w.add('turretDark', cylX(.04, .03, 16), A.x + s * .145, A.pivotY, A.pivotZ);                    // trunnion bosses
  }
  w.add('turretDetail', box(.22, .05, .10), A.x, A.race + .27, A.z - .17);
  w.add('turretDark', box(.10, .08, .14), A.x - .20, A.race + .14, A.z + .22);                       // elevation drive
  w.stage('pitch');
  // the M2-pattern gun: receiver with its top cover and spade grips' stub, the carrying handle, the barrel and its
  // flash hider; the cradle cover under it
  w.add('turretDark', box(.16, .15, .62), A.x, A.pivotY, A.pivotZ - .02);
  w.add('turretDark', box(.15, .03, .40), A.x, A.pivotY + .09, A.pivotZ - .04);                      // top cover
  w.add('turretDark', box(.07, .07, .05), A.x, A.pivotY - .01, A.pivotZ - .355);                     // backplate
  w.add('turretDark', cylZ(.032, .10, P.q ? 18 : 12), A.x, A.pivotY, A.pivotZ + .34);              // barrel support
  w.add('turretDark', cylZ(.016, 1.04, P.q ? 14 : 10, .019), A.x, A.pivotY, A.pivotZ + .91);       // barrel
  w.add('turretDark', cylZ(.022, .07, P.q ? 14 : 10), A.x, A.pivotY, muzzleZ - .035);               // flash hider
  w.add('turretDark', box(.02, .06, .02), A.x, A.pivotY + .05, A.pivotZ + .52);                      // carrying handle
  w.add('turretDark', box(.02, .02, .12), A.x, A.pivotY + .08, A.pivotZ + .52);
  w.add('turretDetail', box(.20, .04, .74), A.x, A.pivotY - .095, A.pivotZ + .02);                   // cradle tray
  // the ready box on the gun's left and its feed chute; the sight head on its right
  w.add('turretAmmo', box(.15, .24, .38), A.x - .20, A.pivotY - .02, A.pivotZ - .04);
  w.add('turretDark', box(.06, .05, .14), A.x - .11, A.pivotY + .05, A.pivotZ - .02);
  w.add('turretDetail', box(.15, .18, .26), A.x + .20, A.pivotY + .03, A.pivotZ + .04);
  w.add('turretGlass', box(.065, .065, .012), A.x + .17, A.pivotY + .06, A.pivotZ + .175);
  w.add('turretGlass', box(.04, .04, .012), A.x + .23, A.pivotY + .01, A.pivotZ + .175);
  w.add('turretDark', box(.17, .02, .28), A.x + .20, A.pivotY + .13, A.pivotZ + .06);               // sun hood
  return w.finish();
}

// ---- turret B: the 7.62 mm machine gun in an enclosed mini-turret (rear right roof) ----------------------------------------
const B = { x: 0.80, z: -1.10, race: 2.30, pivotY: 2.56, pivotZ: -0.74, name: 'type10DozerTurret762' } as const;

function turretB(P: TankBuilderPort): THREE.Group {
  ringPedestal(P, B.x, B.z, .34, B.race);
  const muzzleZ = B.pivotZ + .90;
  const w = sourceMachineGun(P, PIVOT, { name: B.name, caliberMm: 7.62,
    yaw: [B.x, B.race, B.z], pivot: [B.x, B.pivotY, B.pivotZ], muzzle: [B.x, B.pivotY, muzzleZ] });
  w.stage('yaw');
  w.add('turretDetail', cylY(.30, .31, .06, P.q ? 32 : 20), B.x, B.race + .03, B.z);
  // faceted armoured housing: sloped glacis, raked sides, the ammunition bustle behind
  const ring = (half: number, top: number, roofHalf: number): [number, number][] =>
    [[B.x - half, B.race + .05], [B.x + half, B.race + .05], [B.x + roofHalf, top], [B.x - roofHalf, top]];
  w.add('turretDetail', sectionSolid([
    { z: B.z - .44, ring: ring(.25, B.race + .27, .21) },
    { z: B.z - .24, ring: ring(.30, B.race + .32, .24) },
    { z: B.pivotZ - .10, ring: ring(.30, B.race + .32, .24) },
    { z: B.pivotZ + .03, ring: ring(.28, B.race + .14, .26) },
  ]), 0, 0, 0);
  w.add('turretDark', box(.36, .02, .24), B.x, B.race + .325, B.z - .06);                          // roof hatch
  w.add('turretDetail', box(.52, .04, .05), B.x, B.race + .25, B.z - .46);                          // bustle lip
  // the sight on its left wall, under its armoured hood
  w.add('turretDetail', box(.12, .17, .24), B.x - .35, B.race + .22, B.pivotZ - .16);
  w.add('turretGlass', box(.065, .065, .012), B.x - .35, B.race + .24, B.pivotZ - .035);
  w.add('turretDark', box(.14, .02, .28), B.x - .35, B.race + .315, B.pivotZ - .15);
  w.stage('pitch');
  // the mantlet block, the gun's barrel with its cooling sleeve and flash hider
  w.add('turretDetail', box(.20, .16, .14), B.x, B.pivotY, B.pivotZ + .05);
  w.add('turretDark', cylZ(.026, .20, P.q ? 16 : 12), B.x, B.pivotY, B.pivotZ + .22);              // cooling sleeve
  w.add('turretDark', cylZ(.010, .58, P.q ? 12 : 8, .012), B.x, B.pivotY, B.pivotZ + .55);         // barrel
  w.add('turretDark', cylZ(.016, .07, P.q ? 12 : 8), B.x, B.pivotY, muzzleZ - .035);               // flash hider
  // searchlight housing on the mantlet's left (its lens rides the gun's pitch below)
  w.add('turretDetail', box(.05, .05, .08), B.x - .14, B.pivotY + .02, B.pivotZ + .05);
  w.add('turretDark', cylZ(.065, .14, P.q ? 20 : 14), B.x - .20, B.pivotY + .03, B.pivotZ + .08);
  return w.finish();
}

function searchlightB(P: TankBuilderPort): void {
  const done = captureAuxiliaryStock(P, B.name, 'pitch');
  turret(P, 'turretGlass', markVehicleNightLens(cylZ(.053, .012, P.q ? 20 : 14), 'headlight', { searchlight: true, tint: 'cool' }),
    B.x - .20, B.pivotY + .03, B.pivotZ + .151);
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

// ---- the floodlight beside the main gun, on its right ----------------------------------------------------------------
// Owner 2026-10-22: "put thee flood light on other side of gun" (from the left cheek to the right, -x; the coaxial gun's
// port is on the left). Turret frame. The right cheek's front face rakes back from z 2.28 (|x| 0.16-0.64) to 1.91
// (|x| 1.12) at the gun's height, and its top falls from 0.58 (z 1.84) to 0.39 (z 2.24). The drum stands just ahead of
// the face on a yoke whose arms run back to pads bolted on the face, a cross brace below and a stay to the cheek's top:
// a 0.54 m drum, its inner edge 0.38 m off the mantlet and its top under the commander's sight line.
const FLOOD = { side: -1, x: .83, y: .44, z: 2.53, r: .27, len: .34 } as const;

function floodlight(P: TankBuilderPort): void {
  const F = FLOOD, S = F.side, X = S * F.x, seg = P.q ? 40 : 24;
  const add = (slot: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
    P.addEquipment(slot, g, x, y, z, rx, ry, rz);
  const front = F.z + F.len / 2;
  add('turretDetail', cylZ(F.r, F.len, seg), X, F.y, F.z);                                         // drum
  add('turretDark', cylZ(F.r + .016, .04, seg), X, F.y, front + .01);                               // bezel
  add('turretGlass', markVehicleNightLens(cylZ(F.r - .03, .012, seg), 'headlight', { tint: 'cool' }), X, F.y, front + .019);
  for (const rz of [Math.PI / 4, -Math.PI / 4]) add('turretDark', box(2 * F.r - .02, .012, .012), X, F.y, front + .036, 0, 0, rz); // guard
  add('turretDetail', cylZ(F.r - .02, .08, seg, F.r - .09), X, F.y, F.z - F.len / 2 - .04);         // rear cap
  if (P.q) for (const dz of [-.10, -.06, -.02]) add('turretDark', cylZ(F.r + .006, .008, seg), X, F.y, F.z + dz); // fins
  // armoured doors swung open to the sides
  for (const s of [-1, 1]) add('turretDetail', box(.012, 2 * F.r * .9, F.r * .95), X + s * (F.r + .03), F.y, front + F.r * .40, 0, s * .55, 0);
  // carry handle
  for (const dz of [-.08, .08]) add('turretDark', cylY(.010, .010, .07, 8), X, F.y + F.r + .035, F.z + dz);
  add('turretDark', cylZ(.010, .19, 8), X, F.y + F.r + .07, F.z);
  // the yoke: trunnion bosses, arms back to pads 3-4 mm into the face (the outer pad square to its rake), a brace under
  // the drum just proud of the face, a stay to a pad on the cheek's top where it is flattest
  const feet: Point[] = [[S * (F.x - F.r - .025), .34, 2.2925], [S * (F.x + F.r + .025), .34, 1.922]];
  for (const [i, foot] of feet.entries()) {
    const boss: Point = [X + (i === 0 ? -S : S) * (F.r + .025), F.y, F.z];
    add('turretDark', cylX(.042, .04, 16), boss[0], boss[1], boss[2]);
    P.addEquipment('turretDetail', beamBetween(boss, foot, .028, 10));
    add('turretDetail', box(.12, .14, .025), foot[0], foot[1], foot[2] - .004, 0, i === 0 ? 0 : S * .6435, 0);
  }
  P.addEquipment('turretDetail', beamBetween([feet[0][0], .26, 2.335], [feet[1][0], .26, 1.965], .022, 10));
  P.addEquipment('turretDetail', beamBetween([X, F.y + F.r - .02, F.z - .10], [S * .78, .545, 1.95], .018, 10));
  add('turretDark', box(.10, .02, .10), S * .78, .542, 1.95, .4636, 0, 0);                          // stay's foot on the top
  // the lamp's cable back into the turret
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(X + S * .06, F.y - .06, F.z - F.len / 2 - .08),
    new THREE.Vector3(X + S * .14, F.y - .02, 2.22), new THREE.Vector3(X + S * .18, .46, 2.06)], false, 'centripetal');
  P.addEquipment('turretDark', new THREE.TubeGeometry(cable, 12, .011, 6, false));
  reserveDecorVolume(P.turretG, [X - F.r - .08, .08, 1.90], [X + F.r + .08, F.y + F.r + .12, front + .26]);
}

// ---- the equipment light on the original Type 10's 12.7 mm seat ---------------------------------------------------------
// Owner 2026-10-22: "where the old machine gunn was on the original type 10, add annother euqipment light". The type10
// station's ring (type10X.ts roofWeapon: r 0.209 at (-0.3086, 2.405, 0.496), hull frame) carries a lamp mast: a slewing
// head on a short post, its lamp facing forward over the glacis. Outside both stations' sweep.
const SEAT = { x: -.3086, y: 2.405, z: .496 } as const;

function seatLight(P: TankBuilderPort): void {
  const S = SEAT, head = S.y + .30, seg = P.q ? 24 : 16;
  turret(P, 'turretDetail', cylY(.209, .209, .045, P.q ? 32 : 20), S.x, S.y, S.z);                // the station's ring
  turret(P, 'turretDark', cylY(.13, .15, .04, seg), S.x, S.y + .042, S.z);                          // slewing base
  turret(P, 'turretDetail', cylY(.034, .040, .22, 12), S.x, S.y + .17, S.z);                        // post
  for (const s of [-1, 1]) turret(P, 'turretDark', box(.018, .13, .05), S.x + s * .11, head - .02, S.z);   // yoke arms
  turret(P, 'turretDark', box(.24, .02, .05), S.x, head - .085, S.z);                               // yoke foot
  turret(P, 'turretDetail', cylZ(.095, .17, seg), S.x, head, S.z + .01);                            // lamp body
  turret(P, 'turretDark', cylZ(.104, .03, seg), S.x, head, S.z + .10);                              // bezel
  // the lens stands 4 mm proud of the bezel's face (264: flush at z 0.611 it z-fought the bezel, circularCapOverlap)
  turret(P, 'turretGlass', markVehicleNightLens(cylZ(.082, .012, seg), 'headlight', { tint: 'warm' }), S.x, head, S.z + .113);
  turretBar(P, 'turretDark', [S.x, head + .095, S.z - .06], [S.x, head + .095, S.z + .08], .008); // handle
  reserveDecorVolume(P.turretG, [S.x - .25 - PIVOT[0], S.y - .03 - PIVOT[1], S.z - .25 - PIVOT[2]], [S.x + .25 - PIVOT[0], head + .14 - PIVOT[1], S.z + .25 - PIVOT[2]]);
}

// ---- equipment ----------------------------------------------------------------------------------------------------------
/** A stowage bin on a front fender, its floor on the fender's fall (1.378 at z 1.88 to 1.31 at z 3.35). */
function fenderBin(P: TankBuilderPort, s: number): void {
  const x = s * 1.30, z = 2.86, fall = (1.378 - 1.31) / (3.35 - 1.88), y = 1.378 - (z - 1.88) * fall - .004;
  const { paint, dark } = fieldChestParts(.40, .20, .74, { high: P.q !== false, front: s as 1 | -1, handles: true });
  for (const g of paint) P.addEquipment('hullEquipment', g, x, y, z, Math.atan(fall));
  for (const g of dark) P.addEquipment('hullDark', g, x, y, z, Math.atan(fall));
  reserveDecorVolume(P.hullG, [x - .24, y - .02, z - .42], [x + .24, y + .30, z + .42]);
}

export function addType10DozerFieldKit(P: TankBuilderPort): void {
  // Each station's traverse and, where the roof stock rises under its barrel, its depression (tools/roof-station-arcs.mjs
  // on this build, 1 degree steps: the 12.7 mm clear -117..131 degrees, blocked toward the 7.62 and a mast; the 7.62 clear
  // -103..251, blocked only toward the 12.7; 2 degrees and 0.01 rad of margin, the full 0.18 rad restored between bands).
  const a = turretA(P);
  a.userData.yawArc = [-2.0071, 2.2515];
  a.userData.depressionByYaw = [[-0.6458,0.18],[-0.5585,0.099],[-0.4712,0.082],[-0.384,0.08],[-0.2967,0.082],[-0.2094,0.085],[-0.1222,0.18],[0.925,0.18],[1.0123,0.108],[1.0996,0.11],[1.1868,0.13],[1.2741,0.125],[1.3614,0.113],[1.4486,0.113],[1.5359,0.125],[1.6232,0.15],[1.7104,0.18]];
  const b = turretB(P);
  b.userData.yawArc = [-1.7628, 4.3459];
  b.userData.depressionByYaw = [[-1.7977,0.074],[-1.7104,0.18],[4.2237,0.18],[4.311,0.08],[4.3982,0]];
  searchlightB(P);
  // the stations, their rings and their sweep stay the stations' (the decor keeps its loads off them)
  for (const [x, z, r] of [[A.x, A.z, .42], [B.x, B.z, .46]] as const) {
    reserveDecorVolume(P.turretG, [x - r - PIVOT[0], ROOF_Y - PIVOT[1], z - r - PIVOT[2]], [x + r - PIVOT[0], 3.0 - PIVOT[1], z + r - PIVOT[2]]);
  }
  turretApplique(P);
  floodlight(P);
  addModernFieldCage(P);
  hullApplique(P);
  hullScreens(P);
  const T = TYPE10_DOZER_TURRET_APPLIQUE;
  for (const s of [-1, 1]) {
    workLamp(P, s * (T.x0 + T.t / 2) + PIVOT[0], T.y1 + PIVOT[1], T.spans[1][1] - .05 + PIVOT[2]);
    // a four-tube bank along the rear module's top, the tubes fanned outboard (its own diagonal base would cut the roof
    // shelf): the tubes rest on a bracket bar bolted to the module, their inner ends 3 cm off the shelf
    const bz = (T.spans[0][0] + T.spans[0][1]) / 2;
    P.addEquipment('turretDetail', box(.10, .09, .46), s * (T.x0 + T.t / 2), T.y1 + .045, bz);
    // (built facing forward, its tubes elevated, then the whole bank yawed outboard: the fitting pitches before it fans)
    mount(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 4, r: .040, len: .27, spacing: .095, splay: 0,
      pitch: -.42, arc: .60, base: false, slot: 'detail', rotation: [0, s * Math.PI / 2, 0], seed: 1010 + (s > 0 ? 1 : 0) }),
    s * 1.57, T.y1 + .135, bz);
    fenderBin(P, s);
    // the cheek modules, banks and lamps are the kit's (the decor keeps its cheek stock off them)
    reserveDecorVolume(P.turretG, s > 0 ? [1.40, -.05, .10] : [-1.78, -.05, .10], s > 0 ? [1.78, .80, 1.90] : [-1.40, .80, 1.90]);
  }
  workLamp(P, -.30, ROOF_Y, -1.80, true);                                                          // over the bustle
  seatLight(P);
}
