// Schützenpanzer Marder 1A3 (owner, 2026-11-20: "update the marder 1a3's turret and hull. redesign it too").
//
// The Marder's own hull and two-man turret, replacing the Bradley-donor hull and the lathe-turned "cast" turret it wore
// since §5.302. Stations come from the owner's local reference print (docs/references/tanks/marder1a3.md, round 274:
// scalar measurements only, scaled to the published 6.88 m hull) and the published 3.38 m width over the A3 appliqué.
// Frame: bow +Z, up +Y, +X the vehicle's LEFT (vehicleSide.ts); the hull group is the world frame at rest.
//
// Hull: one long shallow glacis (13.4 deg) from the roof break at z 0.55 to a 1.24 m nose at z 3.43, a flat 1.96 roof,
// the upper sides chamfered in to the roof edge, the stern a near-vertical wall round the power-operated ramp. The A3
// programme's bolted appliqué stands outside the side plates (two ribbed upper panels and a glacis-raked front panel)
// over a band of bolted skirt plates with a scalloped hem; a bolted plate covers the front of the glacis. The side
// firing ports went under the appliqué; the ramp keeps its one ball port. Six evenly pitched road wheels, the sprocket
// at the front, the idler raised at the rear, three return rollers.
// Turret: the low faceted two-man drum with the 20 mm Rh 202 in its external housing on the right of centre, the
// coaxial MG3 beside the gun, the six smoke dischargers on the feed housing's face, the MILAN firing post on the left,
// the commander's cupola front right and the gunner's sight front left.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { armorLoft, sideWall, openTube } from './europeSourcePrimitives.ts';
import { mount } from './fittingMount.ts';
import { fieldChestParts } from './fieldChest.ts';
import { moldedBox } from '../accessoryPrimitives.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, xform } = KIT;

/** The hull's measured stations (metres, hull frame). */
export const MARDER1A3_HULL = Object.freeze({
  bowZ: 3.43, sternZ: -3.33, belly: 0.43, tubHalfW: 0.98, sponsonY: 1.18,
  sideX: 1.48, shoulderY: 1.74, roofEdgeX: 1.24, roofY: 1.964,
  glacisTopZ: 0.55, glacisSlope: 0.238, noseY: 1.24,
  // the A3 appliqué: upper panels x 1.48..1.66 over y 1.31..1.72, the skirt band x 1.61..1.665 under the 1.31 ledge,
  // its ribs proud to 1.69 (3.38 m over the appliqué, the published width)
  appliqueX: 1.66, ledgeY: 1.31, skirtInX: 1.61, skirtOutX: 1.665, ribX: 1.69,
});
const H = MARDER1A3_HULL;
/** The glacis plane's height at z (forward of the roof break). */
const glacisY = (z: number): number => H.roofY - H.glacisSlope * Math.max(0, z - H.glacisTopZ);
const GLACIS_RX = Math.atan(H.glacisSlope);

/** The ring the turret turns on: on the roof crown, on the centreline, just behind the glacis break. */
export const MARDER1A3_TURRET_RING = Object.freeze({ x: 0, y: H.roofY, z: -0.05 });

// Running gear (print stations): wheel centres 0.425 over the ground at a 0.81 m pitch, the sprocket at the front.
const MARDER_GEAR = Object.freeze({
  wheelR: 0.335, wheelW: 0.30, wheelY: 0.425, wheelZs: [-1.88, -1.07, -0.26, 0.55, 1.36, 2.16],
  xc: 1.30, trackW: 0.45, trackTh: 0.025,
  sprocket: { z: 2.78, y: 0.725, r: 0.28, trackR: 0.30, toothTipRadiusM: 0.32 },
  idler: { z: -2.82, y: 0.76, r: 0.27, trackR: 0.29 },
  rollers: [{ z: -1.48, y: 1.00, r: 0.09 }, { z: 0.15, y: 1.00, r: 0.09 }, { z: 1.76, y: 1.00, r: 0.09 }],
  topY: 1.08, botY: 0.044,
});

// ------------------------------------------------------------------------------------------------- hull
function hullRing(belly: number, roof: number): SectionPoint[] {
  const spon = Math.max(H.sponsonY, belly + 0.03);
  const shoulder = Math.max(spon + 0.03, Math.min(H.shoulderY, roof - 0.04));
  const half: SectionPoint[] = [[H.tubHalfW, belly], [H.tubHalfW, spon], [H.sideX, spon], [H.sideX, shoulder],
    [H.roofEdgeX, roof]];
  const left = half.map(([x, y]) => [-x, y] as SectionPoint).reverse();
  return [[-H.tubHalfW, belly], ...half, ...left.slice(0, -1)];
}

function addHullCore(P: TankBuilderPort): void {
  const st = (z: number, belly: number, roof = Math.min(H.roofY, glacisY(z))) => ({ z, ring: hullRing(belly, roof) });
  P.add('hull', sectionSolid([
    st(H.sternZ, 0.95, 1.86),          // the stern wall round the ramp (its kit stands out to -3.46)
    st(-3.22, 0.78, 1.92),
    st(-3.08, 0.66, H.roofY),
    st(-2.85, H.belly),
    st(H.glacisTopZ, H.belly),
    st(1.49, H.belly),                 // the glacis passes under the shoulder line here
    st(2.62, H.belly),                 // toe of the belly sweep
    st(3.00, 0.74),
    st(3.30, 1.06),
    { z: H.bowZ, ring: hullRing(1.16, H.noseY + 0.02) },
  ], { sideQuadDiagonal: 'convex' }));
  P.hullG.userData.marder1a3HullReceipt = Object.freeze({ revision: 'marder1a3-hull-r1', ...H });
}

/** A part laid on the glacis plane (its bottom face on the plate, `lift` above it). */
function onGlacis(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry, x: number, z: number, h: number,
  lift = 0, ry = 0): void {
  const n = { y: Math.cos(GLACIS_RX), z: Math.sin(GLACIS_RX) };
  const off = h / 2 + lift;
  P.addEquipment(bucket, g, x, glacisY(z) + n.y * off, z + n.z * off, GLACIS_RX, ry, 0);
}

function boltHead(): THREE.BufferGeometry { return cylX(0.022, 0.018, 6); }

function addAppliqueArmour(P: TankBuilderPort): void {
  const q = P.q !== false;
  for (const side of [-1, 1]) {
    const s = side;
    // upper panels: rear and middle at full height, the front one raked down along the glacis corner
    const panels: Array<Array<[number, number, number]>> = [
      [[-3.24, H.ledgeY, 1.72], [-1.33, H.ledgeY, 1.72]],
      [[-1.29, H.ledgeY, 1.72], [0.93, H.ledgeY, 1.72]],
      [[0.97, H.ledgeY, 1.72], [1.45, H.ledgeY, 1.62], [2.32, H.ledgeY, 1.43], [2.95, H.ledgeY, 1.35]],
    ];
    for (const stations of panels) {
      sideWall(P, s, H.sideX - 0.02, H.appliqueX, stations);
      const z0 = stations[0][0], z1 = stations[stations.length - 1][0];
      const full = stations.every(([, , t]) => t >= 1.70);
      // two pressed stiffening ribs along the panel (the A3's ribbed tiles), the upper stopping short of the rake
      for (const [ry, zEnd] of [[1.43, z1 - 0.08], [1.59, full ? z1 - 0.08 : 1.25]] as const) {
        const len = zEnd - (z0 + 0.08);
        if (len > 0.2) P.addEquipment('hullDetail', box(0.03, 0.035, len), s * (H.appliqueX + 0.015), ry, (z0 + 0.08 + zEnd) / 2);
      }
      if (q) {
        const n = Math.max(2, Math.round((z1 - z0) / 0.42));
        for (let i = 0; i <= n; i++) {
          const z = z0 + 0.06 + (z1 - z0 - 0.12) * i / n;
          P.addEquipment('hullDetail', boltHead(), s * (H.appliqueX + 0.009), H.ledgeY + 0.05, z);
          if (full || z < 1.0) P.addEquipment('hullDetail', boltHead(), s * (H.appliqueX + 0.009), 1.67, z);
        }
      }
      if (full) {
        // the A3's side armour doubles as stowage boxes (Moscow walkaround): the lid seam under the top edge, two latches
        P.addEquipment('hullDark', box(0.012, 0.012, z1 - z0 - 0.10), s * (H.appliqueX + 0.004), 1.645, (z0 + z1) / 2);
        for (const f of [0.3, 0.7]) P.addEquipment('hullDark', box(0.03, 0.07, 0.06), s * (H.appliqueX + 0.012), 1.61, z0 + (z1 - z0) * f);
      }
    }
    // the ledge between the upper panels and the skirt band (a stowage rail rides its outer edge)
    P.addExternalArmor('hull', box(H.skirtOutX - H.sideX + 0.02, 0.04, 6.70), s * (H.sideX + H.skirtOutX) / 2,
      H.ledgeY - 0.02, -0.02);
    P.addEquipment('hullDetail', box(0.03, 0.03, 6.50), s * (H.skirtOutX + 0.012), H.ledgeY - 0.055, -0.02);
    // skirt band: six bolted plates, each hem falling to its two ends (the scallops between them)
    const pitch = 0.94, first = -3.14;
    for (let i = 0; i < 6; i++) {
      const z0 = first + i * pitch, z1 = z0 + pitch - 0.03, zm = (z0 + z1) / 2;
      sideWall(P, s, H.skirtInX, H.skirtOutX, [[z0, 0.80, H.ledgeY - 0.04], [zm, 0.90, H.ledgeY - 0.04],
        [z1, 0.80, H.ledgeY - 0.04]]);
      if (q) for (const z of [z0 + 0.10, zm, z1 - 0.10]) {
        P.addEquipment('hullDetail', boltHead(), s * (H.skirtOutX + 0.009), 1.17, z);
      }
    }
    // the band's raked end plates over the sprocket (bow) and the idler (stern)
    const bandEnd = first + 6 * pitch;
    sideWall(P, s, H.skirtInX, H.skirtOutX, [[bandEnd, 0.80, H.ledgeY - 0.04], [3.38, 1.18, H.ledgeY - 0.04]]);
    sideWall(P, s, H.skirtInX, H.skirtOutX, [[-3.40, 1.06, H.ledgeY - 0.04], [first - 0.03, 0.80, H.ledgeY - 0.04]]);
    if (q) for (const z of [bandEnd + 0.12, 3.05, -3.30]) {
      P.addEquipment('hullDetail', boltHead(), s * (H.skirtOutX + 0.009), 1.22, z);
    }
  }
  // the bolted glacis plate over the front of the upper glacis (A3), its bolt rows across it
  onGlacis(P, 'hullExternalArmor', box(2.36, 0.045, 0.82), 0, 2.86, 0.045);
  if (q) for (const z of [2.52, 3.20]) for (let i = 0; i < 7; i++) {
    onGlacis(P, 'hullDetail', cylY(0.022, 0.022, 0.018, 6), -1.05 + i * 0.35, z, 0.018, 0.045);
  }
}

function addDeckKit(P: TankBuilderPort): void {
  const q = P.q !== false;
  // driver's hatch front LEFT (+X) on the glacis, its three periscopes ahead of it
  onGlacis(P, 'hullHatch', moldedBox(0.60, 0.05, 0.64, 0.02, 1), 0.62, 1.62, 0.05);
  onGlacis(P, 'hullDark', box(0.05, 0.03, 0.40), 0.30, 1.62, 0.03, 0.05);                       // hinge
  for (const x of [0.44, 0.62, 0.80]) {
    onGlacis(P, 'hullDetail', box(0.14, 0.07, 0.10), x, 2.04, 0.07);
    onGlacis(P, 'hullGlass', box(0.11, 0.03, 0.012), x, 2.095, 0.03, 0.025);
  }
  // engine compartment front RIGHT (-X): the long access hatch and the air-intake grille behind it
  onGlacis(P, 'hullHatch', moldedBox(0.78, 0.035, 1.10, 0.015, 1), -0.66, 1.40, 0.035);
  onGlacis(P, 'hullDark', box(0.70, 0.02, 0.62), -0.66, 2.24, 0.02);
  for (let i = 0; i < (q ? 9 : 4); i++) {
    onGlacis(P, 'hullDetail', box(0.70, 0.016, 0.022), -0.66, 1.98 + i * (q ? 0.065 : 0.15), 0.016, 0.02);
  }
  // grab handles on the glacis and the roof edge rails
  for (const x of [-1.05, 1.05]) onGlacis(P, 'hullDetail', xform(KIT.torus(0.07, 0.012, 10), 0, 0, 0, Math.PI / 2, 0, 0),
    x, 1.85, 0.07, 0, Math.PI / 2);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', cylZ(0.016, 2.20, 8), side * 1.10, H.roofY + 0.07, -2.025);
    for (const z of [-3.05, -2.05, -1.00]) P.addEquipment('hullDetail', cylY(0.014, 0.014, 0.08, 6), side * 1.10, H.roofY + 0.035, z);
    // troop roof periscopes along the roof edges, looking outboard
    for (const z of [-2.50, -1.70, -0.95]) KIT.periscope(P, 'hullDetail', side * 1.13, H.roofY + 0.035, z, side * Math.PI / 2);
    KIT.liftEye(P, 'hullDetail', side * 1.12, H.roofY, -3.15);
    KIT.liftEye(P, 'hullDetail', side * 1.20, glacisY(3.05), 3.05);
  }
  // the four troop-compartment roof hatches (two pairs), hinged at the centreline
  for (const z of [-2.62, -1.86]) for (const side of [-1, 1]) {
    P.addHatch('hull', moldedBox(0.66, 0.045, 0.66, 0.08, 2), side * 0.45, H.roofY + 0.022, z);
    P.addEquipment('hullDark', box(0.05, 0.03, 0.46), side * 0.09, H.roofY + 0.028, z);
  }
  // the roof ventilator cowl on the centreline behind the turret
  P.add('hull', cylY(0.15, 0.16, 0.20, 20), 0, H.roofY + 0.10, -1.30);
  P.add('hullDetail', cylY(0.17, 0.17, 0.03, 20), 0, H.roofY + 0.215, -1.30);
  // headlight pods on the nose corners, guarded, and the steel mudguards over the sprockets
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ mats: P.mats, pods: 1, r: 0.065, nightKind: 'headlight', seed: 7410 + side }),
      side * 1.06, glacisY(3.16) + 0.09, 3.16);
    P.addEquipment('hullDetail', box(0.12, 0.08, 0.10), side * 1.06, glacisY(3.16) + 0.02, 3.13);
    P.hangMudguard(`marder1a3-front-${side}`, 'hullDetail', box(0.50, 0.025, 0.52), side * 1.33, 1.10, 3.18, 0.62);
    P.hangMudguard(`marder1a3-rear-${side}`, 'hullDetail', box(0.50, 0.025, 0.46), side * 1.33, 1.02, -3.28, -0.62);
  }
}

function addStern(P: TankBuilderPort): void {
  const q = P.q !== false, zFace = H.sternZ;
  // the ramp in its frame, hinged at the foot, the A3's bolted armour box over it (Moscow rear view)
  P.addHatch('hull', box(1.18, 0.96, 0.06), 0, 1.34, zFace - 0.03);
  for (const [w, h, x, y] of [[1.30, 0.05, 0, 1.845], [0.05, 1.02, -0.63, 1.34], [0.05, 1.02, 0.63, 1.34]] as const) {
    P.addEquipment('hullDetail', box(w, h, 0.05), x, y, zFace - 0.03);
  }
  P.addExternalArmor('hull', moldedBox(0.94, 0.74, 0.07, 0.06, 2), 0, 1.38, zFace - 0.095);
  if (q) for (const [x, y] of [[-0.40, 1.70], [0, 1.70], [0.40, 1.70], [-0.40, 1.06], [0, 1.06], [0.40, 1.06]]) {
    P.addEquipment('hullDetail', cylZ(0.022, 0.018, 6), x, y, zFace - 0.135);
  }
  for (const x of [-0.42, 0.42]) P.addEquipment('hullDark', cylX(0.055, 0.24, 12), x, 0.87, zFace - 0.06);
  if (q) for (const x of [-0.30, 0, 0.30]) P.addEquipment('hullDark', box(0.10, 0.05, 0.04), x, 0.94, zFace - 0.08);
  // the rear fuel tanks either side of the ramp behind their louvred guards
  for (const side of [-1, 1]) {
    P.addEquipment('hull', box(0.40, 1.00, 0.10), side * 0.88, 1.35, zFace - 0.05);
    P.addEquipment('hullDark', box(0.34, 0.92, 0.012), side * 0.88, 1.35, zFace - 0.104);
    for (let i = 0; i < (q ? 16 : 6); i++) {
      P.addEquipment('hullDetail', box(0.34, 0.018, 0.02), side * 0.88, 0.93 + i * (q ? 0.056 : 0.15), zFace - 0.115);
    }
    // tail-light pods on the upper corners and the towing eyes at the foot
    mount(P, 'hull', FITTINGS.lightCluster({ mats: P.mats, pods: 1, r: 0.05, nightKind: 'marker', seed: 7420 + side }),
      side * 1.20, 1.80, zFace + 0.02, [0, Math.PI, 0]);
    P.addEquipment('hullDark', xform(KIT.torus(0.06, 0.018, 12), 0, 0, 0, Math.PI / 2, 0, 0), side * 1.10, 1.02, zFace - 0.03);
    // whip antennas on the rear deck corners
    mount(P, 'hull', FITTINGS.antennaWhip({ mats: P.mats, h: 1.55, rake: 0.05 * side, seed: 7430 + side }),
      side * 0.98, H.roofY, -3.02);
  }
  // the exhaust outlet on the right (-X) rear corner: a louvred box angled outboard (Moscow rear view)
  const ex = -1.27, ey = 1.64, ez = zFace + 0.01, ry = -0.40;
  P.addEquipment('hull', box(0.40, 0.38, 0.14), ex, ey, ez, 0, ry, 0);
  P.addEquipment('hullDark', box(0.34, 0.32, 0.012), ex - 0.07 * Math.sin(-ry), ey, ez - 0.07 * Math.cos(ry), 0, ry, 0);
  for (let i = 0; i < 7; i++) {
    P.addEquipment('hullDetail', xform(box(0.34, 0.012, 0.05), 0, 0, 0, -0.5, 0, 0), ex - 0.08 * Math.sin(-ry),
      ey - 0.135 + i * 0.045, ez - 0.08 * Math.cos(ry), 0, ry, 0);
  }
  const locker = fieldChestParts(0.36, 0.32, 0.14, { high: q, handles: false, front: -1 });
  for (const g of locker.paint) P.addEquipment('hull', g, 1.24, 1.44, zFace - 0.07);
  for (const g of locker.dark) P.addEquipment('hullDark', g, 1.24, 1.44, zFace - 0.07);
}

// ------------------------------------------------------------------------------------------------ turret
// Turret-local frame: the ring plane y 0 at MARDER1A3_TURRET_RING, +Z forward.
function addTurretDrum(P: TankBuilderPort): void {
  P.turretG.userData.turretSeatKeepR = 0.92;
  P.add('turret', cylY(0.86, 0.90, 0.08, 32), 0, 0.02, 0);                               // seating collar
  // the low faceted drum: belly/shoulder/roof half-widths over its floor, knee and roof (ring plane 0)
  P.add('turret', armorLoft([
    [-0.98, 0.46, 0.54, 0.42, 0.02, 0.16, 0.26],
    [-0.80, 0.76, 0.84, 0.70, 0.02, 0.18, 0.26],
    [0.25, 0.86, 0.88, 0.76, 0.02, 0.19, 0.26],
    [0.50, 0.80, 0.82, 0.66, 0.02, 0.17, 0.24],
    [0.78, 0.62, 0.64, 0.40, 0.02, 0.06, 0.09],
  ]));
  for (const x of [-0.62, 0.62]) KIT.liftEye(P, 'turretDetail', x, 0.255, 0.30);
  // the A3's bolted appliqué on the drum's walls ('Marder1A3 Turm rechts', 'Marder Turm'): bolt rows along both sides
  if (P.q !== false) for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    P.add('turretDetail', cylX(0.020, 0.016, 6), side * 0.875, 0.12, -0.70 + i * 0.22);
  }
}

function octRing(cx: number, hw: number, bottom: number, top: number, c: number): SectionPoint[] {
  return [[cx - hw + c, bottom], [cx + hw - c, bottom], [cx + hw, bottom + c], [cx + hw, top - c],
    [cx + hw - c, top], [cx - hw + c, top], [cx - hw, top - c], [cx - hw, bottom + c]];
}

function addWeaponStation(P: TankBuilderPort): void {
  // the mount pedestal rising from the drum roof under the housing
  P.add('turret', cylY(0.20, 0.23, 0.24, 18), -0.20, 0.36, -0.58);
  P.add('turret', box(0.30, 0.20, 0.36), -0.20, 0.40, -0.30);
  // the Rh 202's external housing (x -0.47..0.03): chamfered front and rear undersides
  const cx = -0.22, hw = 0.25, c = 0.11;                // the rounded weapon housing ('Marder Turm')
  P.add('turret', sectionSolid([
    { z: -1.08, ring: octRing(cx, hw, 0.58, 0.86, c) },
    { z: -0.95, ring: octRing(cx, hw, 0.46, 0.92, c) },
    { z: -0.10, ring: octRing(cx, hw, 0.44, 0.92, c) },
    { z: 0.08, ring: octRing(cx, hw, 0.60, 0.84, c) },
  ], { sideQuadDiagonal: 'convex' }));
  P.add('turretDetail', box(0.30, 0.03, 0.42), -0.25, 0.935, -0.55);                    // top access cover
  if (P.q !== false) for (const z of [-0.85, -0.25]) P.add('turretDark', box(0.03, 0.06, 0.08), -0.48, 0.70, z); // latches
  // the feed housing on its left (x 0.03..0.46), its face raked down to the smoke dischargers
  const fx = 0.245, fw = 0.215;
  P.add('turret', sectionSolid([
    { z: -0.98, ring: octRing(fx, fw, 0.50, 0.74, 0.04) },
    { z: -0.40, ring: octRing(fx, fw, 0.48, 0.80, 0.04) },
    { z: -0.22, ring: octRing(fx, fw, 0.48, 0.66, 0.04) },
  ], { sideQuadDiagonal: 'convex' }));
  P.add('turret', box(0.30, 0.26, 0.40), 0.24, 0.39, -0.62);                             // its pedestal web
  // six smoke dischargers stacked three high in two columns on the raked face, aimed forward and up
  for (const [y, z, seed] of [[0.54, -0.17, 7441], [0.64, -0.22, 7442], [0.74, -0.27, 7443]] as const) {
    mount(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 2, r: 0.040, len: 0.22, spacing: 0.15,
      splay: 0, arc: 0.12, pitch: -0.50, seed }), 0.25, y, z);
  }
}

function addGun(P: TankBuilderPort): void {
  // gun-local: the trunnion inside the housing's front, the tube leaving its left edge
  // the jacket runs back to the trunnion, so it stays buried in the housing's face through the whole pitch travel
  P.addGunExtra(cylZ(0.075, 0.28, 18), 0, 0, 0.14);                                     // barrel jacket 0..0.28
  P.addGunExtra(cylZ(0.045, 0.32, 16), 0, 0, 0.44);                                     // recoil sleeve
  P.add('gun', cylZ(0.024, 0.98, 16), 0, 0, 1.05);                                      // tube 0.56..1.54
  openTube(P, 0.036, 1.54, 1.76, 0.011, { shadowedBore: true });                       // muzzle brake, the muzzle
  if (P.q !== false) for (const z of [1.66, 1.72]) for (const sx of [-1, 1]) {
    P.add('gunDark', box(0.006, 0.026, 0.022), sx * 0.0375, 0, z);                     // brake side ports
  }
  // coaxial MG3 on the gun's left, firing from a port in the housing face
  P.addGunExtra(cylZ(0.032, 0.05, 12), 0.14, -0.06, 0.16);
  P.addGunExtraDark(cylZ(0.015, 0.40, 8), 0.14, -0.06, 0.38);
}

function addMilan(P: TankBuilderPort): void {
  // MILAN on the left (+X) front, low beside the gun on its bracket ('Marder Turm', Panzermuseum Munster): the bracket
  // post from the drum, the launch tube at the gun's height with the firing post's sight unit on its rear; behind it on
  // the drum's left rear, the equipment box
  P.addEquipment('turret', box(0.44, 0.46, 0.66), 0.78, 0.49, -0.57);                    // left-rear equipment box
  P.addEquipment('turretDetail', box(0.08, 0.32, 0.10), 0.62, 0.43, 0.20);               // bracket post
  P.addEquipment('turretDetail', box(0.16, 0.05, 0.22), 0.62, 0.60, 0.20);               // cradle
  P.add('turretDark', cylZ(0.062, 1.22, 16), 0.62, 0.66, 0.46);                          // launch tube -0.15..1.07
  P.add('turretDetail', cylZ(0.072, 0.04, 16), 0.62, 0.66, 1.05);                       // mouth ring
  P.add('turretDetail', cylZ(0.072, 0.04, 16), 0.62, 0.66, -0.13);                      // breech ring
  P.addEquipment('turretDetail', box(0.18, 0.16, 0.24), 0.62, 0.80, 0.02);               // sight unit on the tube
  P.addEquipment('turretGlass', box(0.12, 0.05, 0.012), 0.62, 0.81, 0.145);
}

function addTurretKit(P: TankBuilderPort): void {
  // commander's cupola front RIGHT (-X): ring, hatch lid and the periscope ring
  const cxp = -0.55, czp = 0.10;
  P.addCupola('turret', cylY(0.30, 0.32, 0.10, 24), cxp, 0.31, czp);
  P.addHatch('turret', cylY(0.24, 0.25, 0.04, 20), cxp, 0.38, czp);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    KIT.periscope(P, 'turretDetail', cxp + 0.29 * Math.sin(a), 0.335, czp + 0.29 * Math.cos(a), a);
  }
  // the armoured thermal imager on the left front, its louvred shutter facing forward ('Marder1A3 Turm rechts', the
  // Munster front view), and the sight post at the left shoulder
  P.addEquipment('turret', box(0.24, 0.22, 0.30), 0.32, 0.37, 0.32);
  P.addEquipment('turretDark', box(0.19, 0.15, 0.012), 0.32, 0.38, 0.475);
  for (let i = 0; i < (P.q !== false ? 5 : 2); i++) {
    P.addEquipment('turretDetail', box(0.19, 0.012, 0.02), 0.32, 0.32 + i * (P.q !== false ? 0.03 : 0.08), 0.48);
  }
  mount(P, 'turret', FITTINGS.roofSight({ mats: P.mats, colR: 0.06, colR2: 0.07, colH: 0.20, head: [0.18, 0.12, 0.18],
    window: [0.12, 0.05], seed: 7450 }), 0.68, 0.25, 0.06);
}

/** The Marder 1A3 (owner order 2026-11-20). */
export function buildMarder1A3(P: TankBuilderPort): void {
  addHullCore(P);
  addAppliqueArmour(P);
  addDeckKit(P);
  addStern(P);
  P.gear = KIT.buildRunningGear(P, {
    trackShoeBuilder: buildFleetTrackShoe, style: 'rubber', trackPattern: 'compact-ifv',
    ...MARDER_GEAR, wheelZs: [...MARDER_GEAR.wheelZs], rollers: MARDER_GEAR.rollers.map((r) => ({ ...r })),
    sprocket: { ...MARDER_GEAR.sprocket }, idler: { ...MARDER_GEAR.idler },
    coveredTop: true, paintedEnds: true, arms: true, fitLoadedRun: true, dedupeLoopPoints: true,
  });
  addTurretDrum(P);
  addWeaponStation(P);
  addGun(P);
  addMilan(P);
  addTurretKit(P);
  P.topY = 0.95;
  P.additionalShadowSources = { hull: ['hullExternalArmor', 'hullHatch'], turret: ['turretHatch'] };
}
