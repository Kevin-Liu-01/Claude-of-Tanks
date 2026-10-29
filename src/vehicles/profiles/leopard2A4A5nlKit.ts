// The kit of the Leopard 2A4M (leo2a4m, the A5NL field package), on top of the Leopard 2A4 V's (leopard2A4VKit.ts runs
// first), carried over from the build it replaces (inventory: the lane's inventory/leo2a4m.md; legacy buildLeo2A5A5NL)
// and re-seated on the release hull and the 2A4 turret (leopard2A4Family.ts). The old build was mirrored (its commander
// at +X): what is tied to a side keeps its side of the vehicle, so its x changes sign here.
//
// Hull: the skirt ERA course, three rows of ten cassettes a side on a continuous backing carrier hung outside the
// skirts from a tie rail on the hanging rails and the sponson's wall, braced to the aft panels by load rods and bearing on
// the heavy fore blocks through spacer pads, dividers between the stations (the gameplay plates a5nl_skirt_era_R / _L:
// the spec helpers' "R" stands on +X); the pressed service tray under the stern frame's floor with its end tabs on the
// corner uprights; the forward lighting blocks on the front mudguards, three lamps each, a guarded IR plate on the outboard
// side and a bracket back to the tie rail. Turret: an awareness pod and a third bank of four launchers on each wall,
// the panoramic day/thermal head behind the commander's hatch, the roof electronics box with its conduit, two warning
// beacons and two long whips at the bustle's rear corners; the cross on the right wall and the number on the left. The
// loader's MAG is the turret's own remote station (its loaderMG option).
//
// The ERA carrier is the cassettes' steel backing: add-on armour, so P.addExternalArmor (it never resizes the hull's
// envelope, and it stays when the cassettes are spent). Tie rails, rods, pads, dividers, the tray, lamps and everything on
// the turret are equipment or detail.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { mirrorRing } from './leopard2Hull.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { Leopard2A4KitContext } from './leopard2A4Kit.ts';
import { HULL_SURFACES as HS, TURRET_SURFACES as TS, eraField, mudguardY, type CassetteSeat } from './leopard2A4KitParts.ts';
import { LEO2A4V_SPARE_LINKS, LEO2A4V_STERN, turretRoofAt } from './leopard2A4VKit.ts';

/** The skirt ERA course (hull metres, the +X side; the other mirrors it). */
export const LEO2A4M_SKIRT_ERA = Object.freeze({
  /** The carrier's inner and outer faces: 6 mm clear of the fore blocks' bolt heads (x 1.836), 4 cm of plate. */
  carrierInX: 1.8424, carrierOutX: 1.8824,
  carrierY0: 0.78, carrierY1: 1.38, carrierZ0: -3.19, carrierZ1: 3.20,
  /** The cassettes' centre plane: the bodies stand on the carrier's face, the lids' faces at x 1.99 (the 3.98 m width). */
  cassetteX: 1.9307,
  rows: Object.freeze([0.88, 1.085, 1.29] as const),
  stations: 10, z0: -2.92, pitch: 0.65,
  scale: Object.freeze([1.72, 1.28, 1.38] as const),
});

/** The sixty cassette seats of one side (sx +1: the "R" plate on +X). */
export function leo2a4mSkirtSeats(sx: 1 | -1): CassetteSeat[] {
  const E = LEO2A4M_SKIRT_ERA, seats: CassetteSeat[] = [];
  for (const y of E.rows) {
    for (let k = 0; k < E.stations; k++) {
      // the cassette's depth (its local z) turned outward, its lid facing out
      seats.push({ center: new THREE.Vector3(sx * E.cassetteX, y, E.z0 + k * E.pitch),
        rotation: new THREE.Euler(0, sx * Math.PI / 2, 0), scale: E.scale });
    }
  }
  return seats;
}

/** The skirt ERA course, its carrier, tie rail, dividers, rods and pads (inventory #3-#7), the spare links on the rail. */
function skirtEra(P: TankBuilderPort): Array<Readonly<Record<string, number | string>>> {
  const { box, cylX } = KIT;
  const E = LEO2A4M_SKIRT_ERA, len = E.carrierZ1 - E.carrierZ0, zc = (E.carrierZ0 + E.carrierZ1) / 2;
  const receipt: Array<Readonly<Record<string, number | string>>> = [];
  for (const sx of [1, -1] as const) {
    const sector = sx > 0 ? 'a5nl_skirt_era_R' : 'a5nl_skirt_era_L';
    // the carrier: the backing plate the cassettes bolt to
    P.addExternalArmor('hull', box(E.carrierOutX - E.carrierInX, E.carrierY1 - E.carrierY0, len),
      sx * (E.carrierInX + E.carrierOutX) / 2, (E.carrierY0 + E.carrierY1) / 2, zc);
    // the tie rail across the hanging rails from the sponson's wall to the carrier's top
    P.add('hullDetail', box(E.carrierOutX - HS.sponsonX, 0.045, len), sx * (HS.sponsonX + E.carrierOutX) / 2,
      E.carrierY1 + 0.0225, zc);
    const seats = leo2a4mSkirtSeats(sx);
    eraField(P, sector, seats);
    seats.forEach((s, i) => receipt.push(Object.freeze({ side: sx, row: Math.floor(i / E.stations),
      station: i % E.stations, y: s.center.y, z: s.center.z, sector })));
    // the dividers between the stations, the end ones closing the end cassettes
    for (let k = 0; k <= E.stations; k++) {
      const z = k === 0 ? -3.170 : k === E.stations ? 3.180 : E.z0 - E.pitch / 2 + k * E.pitch;
      P.add('hullDark', box(0.1026, E.carrierY1 - E.carrierY0, 0.025), sx * (E.carrierOutX + 0.1026 / 2),
        (E.carrierY0 + E.carrierY1) / 2, z);
    }
    // the load rods to the aft panels' proud band, the spacer pads on the heavy fore blocks between their bolt rows
    for (const z of [-2.72, -1.75, -0.78, 0.40]) {
      P.add('hullDark', cylX(0.022, E.carrierInX - HS.aftSkirtX, 10), sx * (E.carrierInX + HS.aftSkirtX) / 2, 1.20, z);
    }
    for (const z of [1.72, 2.34, 2.91]) {
      P.add('hullDark', box(E.carrierInX - HS.foreSkirtX, 0.08, 0.10), sx * (E.carrierInX + HS.foreSkirtX) / 2, 1.05, z);
    }
    // the 2A4 V's spare-link strips, laid on the tie rail under the sponson's edge (lower than on the wall, out of the
    // long mantlet cover's sweep)
    for (const [z, links, seed] of LEO2A4V_SPARE_LINKS) {
      // a registered fitting (the spare-track census's route), lying on the rail
      const strip = FITTINGS.spareTrackLinks({ mats: P.mats, links, width: 0.10, pitch: 0.165, seed });
      strip.position.set(sx * (HS.sponsonX + E.carrierOutX) / 2, E.carrierY1 + 0.045 + 0.038, z);
      P.hullG.add(strip);
    }
  }
  return receipt;
}

/** The pressed service tray under the stern frame's floor, its end tabs on the corner uprights (#1, #2). */
function sternTray(P: TankBuilderPort): void {
  const { box } = KIT;
  const S = LEO2A4V_STERN, zc = (S.floorFrontZ + S.floorBackZ) / 2;
  P.addEquipment('hullDetail', box(2.72, 0.045, 0.24), 0, 1.6775, zc);
  for (const sx of [-1, 1]) P.addEquipment('hullDetail', box(0.10, 0.12, 0.10), sx * 1.40, 1.68, S.railZ + 0.045);
}

/** The forward lighting blocks on the front mudguards: three lamps, the guarded IR plate, the bracket (#8-#11). */
function lightingBlocks(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const x0 = 1.38, x1 = 1.70, z0 = 3.30, z1 = 3.46, top = 1.52;
  for (const sx of [-1, 1]) {
    // the block's foot follows the mudguard's fall to the nose
    const ring = (z: number): SectionPoint[] => {
      const foot = mudguardY(z), r: SectionPoint[] = [[x0, foot], [x1, foot], [x1, top], [x0, top]];
      return sx > 0 ? r : mirrorRing(r);
    };
    P.addEquipment('hull', sectionSolid([{ z: z0, ring: ring(z0) }, { z: z1, ring: ring(z1) }]));
    P.addEquipment('hullDark', box(x1 - x0 + 0.01, 0.012, z1 - z0 + 0.01), sx * (x0 + x1) / 2, top + 0.006, (z0 + z1) / 2);
    for (let k = 0; k < 3; k++) KIT.headlight(P, sx * (1.44 + k * 0.10), 1.43, z1 + 0.012, 0, 0.036, false);
    // the guarded IR marker on the outboard side, the bracket from the tie rail's end
    P.addEquipment('hullDark', box(0.02, 0.14, 0.16), sx * (x1 + 0.01), 1.44, (z0 + z1) / 2);
    P.addEquipment('hullGlass', cylX(0.026, 0.008, 12), sx * (x1 + 0.024), 1.44, (z0 + z1) / 2);
    P.addEquipment('hullDark', box(0.05, 0.04, 0.14), sx * 1.695, 1.40, 3.25);
  }
}

/** The awareness pod and the third smoke bank on each wall (#12-#14): visual launchers, no smoke sockets. */
function wallKit(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  for (const sx of [-1, 1]) {
    const wall = sx < 0 ? TS.wallRight : TS.wallLeft;
    // the pod on its plate ahead of the bank, over the grab rail: the body, its window looking out, the hood over it
    P.addEquipment('turretDark', box(0.02, 0.20, 0.30), sx * (wall + 0.01), 0.62, 0.75);
    P.addEquipment('turret', box(0.16, 0.24, 0.36), sx * (wall + 0.10), 0.62, 0.75);
    P.addEquipment('turretGlass', box(0.008, 0.14, 0.22), sx * (wall + 0.181), 0.615, 0.77);
    P.addEquipment('turretDark', box(0.035, 0.018, 0.26), sx * (wall + 0.175), 0.705, 0.77);
    // the third bank: four launchers in a row rising aft on their plate, aimed forward, up and out
    P.addEquipment('turretDark', box(0.02, 0.24, 0.40), sx * (wall + 0.01), 0.62, 0.165);
    for (let k = 0; k < 4; k++) {
      P.addEquipment('turretDark', cylZ(0.037, 0.22, P.q ? 12 : 8), sx * (wall + 0.065), 0.545 + 0.055 * k,
        0.30 - 0.09 * k, -0.36, sx * 0.18, 0);
    }
  }
}

/** The roof: the panoramic head, the electronics box, the beacons and the long whips (#15-#18). */
function roofKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const { box, cylY, cylZ, torus, sph } = KIT;
  const roof = TS.roofY, seg = P.q ? 20 : 14;
  // the panoramic day/thermal head behind the commander's hatch and right of the PERI R17A2: drum, bearing, head,
  // windows under a brow, lid
  const hx = -0.80, hz = -0.85;
  P.addEquipment('turret', cylY(0.20, 0.22, 0.07, seg), hx, roof + 0.035, hz);
  P.addEquipment('turretDark', torus(0.20, 0.016, seg), hx, roof + 0.07, hz);
  P.addEquipment('turret', box(0.35, 0.27, 0.31), hx, roof + 0.205, hz);
  P.addEquipment('turretGlass', box(0.20, 0.10, 0.012), hx + 0.04, roof + 0.19, hz + 0.157);
  P.addEquipment('turretGlass', box(0.07, 0.06, 0.012), hx - 0.11, roof + 0.19, hz + 0.157);
  P.addEquipment('turretDark', box(0.34, 0.02, 0.06), hx, roof + 0.255, hz + 0.17);
  P.addEquipment('turretDark', box(0.33, 0.012, 0.29), hx, roof + 0.346, hz);
  // the electronics box on the bustle roof, its lid, the window on its back, the conduit laid back to a junction box
  const ex = 0.12, ez = -1.80, ey = turretRoofAt(ez);
  P.addEquipment('turret', box(0.46, 0.14, 0.32), ex, ey + 0.07, ez);
  P.addEquipment('turretDark', box(0.40, 0.025, 0.27), ex, ey + 0.1525, ez);
  P.addEquipment('turretGlass', box(0.08, 0.08, 0.012), ex + 0.12, ey + 0.08, ez - 0.163);
  const c0 = ez - 0.16, c1 = -2.26, cy0 = ey + 0.022, cy1 = turretRoofAt(c1) + 0.022;
  P.addEquipment('turretDark', cylZ(0.022, c0 - c1, 10), ex - 0.10, (cy0 + cy1) / 2, (c0 + c1) / 2,
    Math.atan2(cy1 - cy0, c0 - c1), 0, 0);
  P.addEquipment('turretDark', box(0.07, 0.05, 0.06), ex - 0.10, turretRoofAt(c1 - 0.03) + 0.025, c1 - 0.03);
  // two warning beacons either side of the box's tail: base and amber dome
  for (const [x, z] of [[0.58, -2.08], [-0.52, -2.08]] as const) {
    const y = turretRoofAt(z);
    P.addEquipment('turret', cylY(0.055, 0.065, 0.08, 12), x, y + 0.04, z);
    P.addEquipment('turretGlass', sph(0.048, 10), x, y + 0.115, z);
  }
  // the two long whips at the bustle's rear corners, beside the radios' standing pair, on their own pots
  for (const [k, x] of [[0, 1.08], [1, -1.02]] as const) {
    const z = -2.13;
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 1.20, r: 0.0086, seed: ctx.seed + 30 + k,
      rotation: [-0.08, 0, 0] });
    whip.position.set(x, turretRoofAt(z), z);
    P.turretG.add(whip);
  }
}

/** The Leopard 2A4M's own kit, after the 2A4 V's. */
export function addLeo2A4MKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const seats = skirtEra(P);
  sternTray(P);
  lightingBlocks(P);
  wallKit(P);
  roofKit(P, ctx);
  // the 2A4 V's crosses give way to the A5NL's markings: the cross on the right wall, the number on the left
  P.clearDecals('turret');
  P.decal('turret', 'crossgrey', null, 0.30, [-(TS.wallRight + 0.002), 0.265, 0.15], -Math.PI / 2);
  P.decal('turret', 'number', 'A5NL', 0.18, [TS.wallLeft + 0.002, 0.265, 0.15], Math.PI / 2);
  if (P.geometryReceipt) {
    P.turretG.userData.leopard2A5A5NLReceipt = Object.freeze({
      architecture: 'a5-field-modernization',
      skirtEraSectors: Object.freeze(['a5nl_skirt_era_R', 'a5nl_skirt_era_L']),
      skirtEraTilesPerSide: LEO2A4M_SKIRT_ERA.rows.length * LEO2A4M_SKIRT_ERA.stations,
      skirtEraSeats: Object.freeze(seats),
      roofWeapon: 'leo2a4mRemoteMag',
      panoramicSight: true,
      awarenessPodsPerSide: 1,
      smokeLaunchersPerSide: 4,
      forwardLampCount: 6,
      equipmentOwned: true,
    });
  }
}
