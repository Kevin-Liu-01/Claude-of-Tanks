// Owner 2026-10-15 (VEH-22): the T-72B3 Zubr and Zubr II carry the T-72B3M (2016) turret itself
// (nationalDonorTurret.ts) on their T-72B3 hulls, up-armoured with the Polish field fit: the modern remote autocannon
// on the commander's cupola, ERAWA courses, slat screens and nets with leaves, lamps, sensors and stowage.
//   "make the t72b3 zubr turret properly based off the t72 b3m 2016, except obvioulsy up armored annnd using modern
//    autocannon and cages and the leaves and lights and ERa and other emplacements"
// The hulls keep their Polish packages unchanged (nationalPoland.ts hullEquipment, zubrII.ts).
//
// The donor turret is never reshaped: every added part is seated against its real surfaces. Coordinates are
// turret-local (origin on the ring centre, +Z forward, +X the vehicle's left, +Y up). Measured donor datums used here
// (t72b3mX.ts, in this frame): the cast shell's lower edge y -.014 and widest flank x 1.407 at z .29; the Relikt cheek
// fan's lowest outer lip y .13-.22 over z .25-1.43; the bustle stowage boxes from z .29 (right) / -.21 (left) round
// to z -1.94, standing y .108-.736 and reaching x 1.81; the six-tube smoke bank on the left flank at z -.03-.36; the
// commander's cupola at (-.627,-.359) r .44 (the station's seat), the gunner's cupola at (.528,-.527) r .33 and the
// gunner's sight hood at x .58-.99, z -.21-.15 looking forward. The T-72B3 hull under the turret's sweep stands at most
// .029 (the driver's hatch lid, r 1.23-1.81 ahead) and .075 (its periscope block, r 1.65-1.75) above the ring seat.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {Stock, loft, eraModule} from './eraModuleKit.ts';
import {polishCheekBoxes, polishRoofGrid, stackTile} from './polandFrontEra.ts';
import {strappedPack} from './modernizationFittings.ts';
import {nationalLamp, nationalEye, nationalRoofSensor} from './nationalRoofSystems.ts';
import {hullEquipment} from './nationalPoland.ts';
import {addPolishProtection} from './nationalPolandProtection.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {NATIONAL_ROOF_LOADOUTS} from '../nationalRoofConfig.ts';
import {POLISH_PROTECTION_LAYOUTS} from '../nationalPolandProtectionConfig.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box, cylY, cylX, torus} = KIT;

type PolandDonorId = 't72b3_zubr' | 't72b3_zubr_ii';
type V3 = readonly [number, number, number];
/** Rows of POLISH_PROTECTION_LAYOUTS (hull screens unchanged; turret numbers describe the kit's own screens). */
const PROTECTION_MODEL: Readonly<Record<PolandDonorId, number>> = {t72b3_zubr: 2, t72b3_zubr_ii: 3};
const SIDES = [-1, 1] as const;
const tuple = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const eraSector = (side: number): string => `turret_era_${side < 0 ? 'L' : 'R'}`;
/** Round-stock facets: the authored count on the high tier, fewer on the far (low) tier. */
const seg = (P: TankBuilderPort, high: number, low: number): number => (P.q ? high : low);

// Stock (raycast seats on permanent stock) and loft (closed ring loft) live in eraModuleKit.ts (release 227).

/** A removable screen or cage member: open lattice, tagged for the Polish protection receipts. */
function lattice(P: TankBuilderPort, g: THREE.BufferGeometry, tag: string): void {
  g.userData.polishProtection = tag;
  P.addEquipment('turretOpenLattice', g);
}

/** A side-type ERAWA cassette seated by raycast on permanent stock, its hit face along the seat's outward normal.
 * Release 227 (the Zubr II's re-skin): the two-layer stack cassette of the Krata-2 terrace (polandFrontEra.ts
 * stackTile) at the same seat and sector, in place of the rounded box: a .045 base and a .03 chamfered top layer. */
function eraTile(P: TankBuilderPort, seats: Stock, side: number, origin: V3, direction: V3,
  size: readonly [thickness: number, height: number, length: number]): void {
  const {point, normal} = seats.face(origin, direction);
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const along = up.clone().cross(normal).normalize();
  const corner = point.clone().addScaledVector(along, -size[2] / 2).addScaledVector(up, -size[1] / 2);
  const g = stackTile(P, corner, along, up, normal, size[2], size[1], size[0] * .6, size[0] * .4);
  eraModule(P, {owner: 'turret', sector: eraSector(side), geometry: g, outward: tuple(normal), minDot: .5, name: 'cabinet cassette'});
}

/** A welded block rising from the casting to a level top: it reaches down to the lowest of its footprint's seats. */
function weldedBlock(P: TankBuilderPort, casting: Stock, x: number, z: number, w: number, d: number, top: number,
  bucket = 'turretDetail'): void {
  const seats = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => casting.top(x + a * w * .45, z + b * d * .45));
  const low = Math.min(...seats) - .012;
  if (top - low < .02) throw new Error(`welded block at ${x},${z} has no height above its seat`);
  P.addEquipment(bucket, box(w, top - low, d), x, (top + low) / 2, z);
}

/** The level top a fitting of this footprint can stand on: the highest of its seats. */
function levelSeat(casting: Stock, x: number, z: number, w: number, d: number): number {
  return Math.max(...[[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => casting.top(x + a * w / 2, z + b * d / 2)));
}

// ---------------------------------------------------------------------------------------------------------------------
// Zubr: the compact field fit. A fitted pannier course wraps the chin and forward flanks under the Relikt fan and
// carries fine ERAWA tiles; slat screens hang outboard of the stowage boxes from welded stanchions; a compact rear rack
// carries the camouflage roll, a service case, tools and the whips.

// The screens and the rear rack are built to the Zubr's row of POLISH_PROTECTION_LAYOUTS, whose turret numbers the field
// suit's drapes and rear-face net follow (turretX/Bottom/Top/Panels: the screen plane, its height and length; rearZ,
// rearHalf, rearBottom/Top: the rack's slatted rear face).
const ZUBR_ROW = POLISH_PROTECTION_LAYOUTS[PROTECTION_MODEL.t72b3_zubr];
const ZUBR = {
  // front stanchions behind the left smoke bank's lines of fire (its brackets end at z -.18): the right one outboard of
  // the commander's cupola (x -1.067 at z -.34), the left one between the gunner's sight hood (z -.212), his cupola and
  // the left rear roof cassette (x 1.025); the rear ones behind both cupolas
  stanchion: {front: [[-1.16, -.25], [.92, -.31]] as const, rear: [.70, -.98] as const, top: .80, arm: .755},
  /** The driving lamps ride the front arms' outer ends, clear of the screen clamps. */
  lampX: 1.80,
  screen: {x: ZUBR_ROW.turretX, front: ZUBR_ROW.turretPanels[0][1], rear: ZUBR_ROW.turretPanels[0][0],
    bottom: ZUBR_ROW.turretBottom, top: ZUBR_ROW.turretTop},
  rack: {front: -2.00, rear: ZUBR_ROW.rearZ, half: ZUBR_ROW.rearHalf, floor: ZUBR_ROW.rearBottom, top: ZUBR_ROW.rearTop,
    rails: [.30, .62] as const},
} as const;

/** A welded stanchion on the cast roof shoulder (top plate at `top`) and a cantilever arm from its outer face out over
 * the stowage box lids to x `toX`, its root in a bolted shoe. */
function stanchionArm(P: TankBuilderPort, casting: Stock, side: number, px: number, pz: number, top: number,
  armY: number, toX: number): void {
  weldedBlock(P, casting, px, pz, .12, .12, top);
  P.addEquipment('turretDetail', box(.15, .022, .15), px, top + .011, pz);
  lattice(P, beamBetween([px + side * .06, armY, pz], [toX, armY, pz], .022, seg(P, 8, 5)), 'side-mount');
  lattice(P, box(.07, .07, .09).translate(px + side * .085, armY, pz), 'mount-shoe');
}

/** Screens hang outboard of the stowage boxes on two cantilever arms per side. Each arm leaves a welded stanchion on
 * the cast roof shoulder, passes over the box lids and clamps the screen's top rail; a knee brace drops to its mid
 * rail. The front stanchions carry the round driving lamps, the arms' outer ends the laser-warning heads. */
function zubrScreens(P: TankBuilderPort, casting: Stock, lamp: Parameters<typeof nationalLamp>[4]): void {
  const s = ZUBR.screen, st = ZUBR.stanchion, mid = (s.bottom + s.top) / 2;
  for (const side of SIDES) {
    const x = side * s.x;
    const front = st.front[side < 0 ? 0 : 1];
    for (const [px, sz] of [front, [side * st.rear[0], st.rear[1]]] as const) {
      stanchionArm(P, casting, side, px, sz, st.top, st.arm, x);
      lattice(P, box(.06, .05, .08).translate(x, s.top + .02, sz), 'screen-clamp');
      lattice(P, beamBetween([side * (s.x - .34), st.arm - .012, sz], [x, mid, sz], .012, seg(P, 6, 4)), 'screen-brace');
    }
    for (const z of [s.front, s.rear]) lattice(P, box(.034, s.top - s.bottom + .034, .034).translate(x, mid, z), 'screen-frame');
    for (const y of [s.bottom, mid, s.top]) lattice(P, box(.031, .029, s.front - s.rear + .034).translate(x, y, (s.front + s.rear) / 2), 'screen-frame');
    const count = Math.ceil((s.front - s.rear) / .16);
    for (let i = 1; i < count; i++) lattice(P, box(.018, s.top - s.bottom, .018).translate(x, mid, s.rear + i * (s.front - s.rear) / count), 'screen-slat');
    lattice(P, beamBetween([x, s.bottom, s.rear], [x, s.top, (s.front + s.rear) / 2], .010, 4), 'screen-brace');
    // Round driving lamps on saddles at the front arms' outer ends, above the stowage boxes and every roof fitting.
    const ax = side * ZUBR.lampX, armTop = st.arm + .022;
    P.addEquipment('turretDetail', box(.10, .036, .10), ax, armTop - .012, front[1]);
    nationalLamp(P, ax, front[1], armTop + .006, lamp);
    // Guarded laser-warning heads on the front stanchions' top plates.
    const lx = front[0], lz = front[1], seat = st.top + .022, y = seat + .042;
    P.addEquipment('turretDetail', box(.105, .084, .13), lx, y, lz);
    P.addModuleVisual('optics', 'turretGlass', box(.074, .035, .013), lx, y + .006, lz + .071);
    for (const dx of [-.068, .068]) P.addEquipment('turretDetail', beamBetween([lx + dx, seat - .008, lz - .06], [lx + dx, seat + .133, lz + .058], .008, seg(P, 10, 5)));
    P.addEquipment('turretDetail', beamBetween([lx - .068, seat + .133, lz + .058], [lx + .068, seat + .133, lz + .058], .008, seg(P, 10, 5)));
  }
}

interface RackPlan {
  front: number; rear: number; half: number; floor: number; top: number; rails: readonly number[];
  /** Rails run under the rear stowage boxes at `railLow`; a rack standing higher has them climb to `floor - .01`
   * behind the boxes, between z `rise[0]` and `rise[1]`. */
  railLow?: number; rise?: readonly [number, number];
  /** Slatted side faces and a mid post per side (the long basket). */
  slatSides?: boolean;
}

/** Four rails leave the cast shell's lower rear under the rear stowage boxes and carry an open rack; its rear face is
 * the slatted rear cage. */
function rearRack(P: TankBuilderPort, casting: Stock, r: RackPlan): void {
  const railY = r.floor - .01, low = r.railLow ?? railY;
  for (const side of SIDES) for (const rx of r.rails) {
    const x = side * rx, {point} = casting.face([x, low, -3], [0, 0, 1]);
    if (r.rise && low !== railY) {
      P.addEquipment('turretDetail', beamBetween([x, low, point.z + .06], [x, low, r.rise[0]], .022, seg(P, 8, 5)));
      P.addEquipment('turretDetail', beamBetween([x, low, r.rise[0] + .015], [x, railY, r.rise[1] - .015], .022, seg(P, 8, 5)));
      P.addEquipment('turretDetail', beamBetween([x, railY, r.rise[1]], [x, railY, r.rear - .02], .022, seg(P, 8, 5)));
    } else P.addEquipment('turretDetail', beamBetween([x, railY, point.z + .06], [x, railY, r.rear - .02], .022, seg(P, 8, 5)));
  }
  const bars = r.slatSides ? [r.front, (2 * r.front + r.rear) / 3, (r.front + 2 * r.rear) / 3, r.rear] : [r.front, (r.front + r.rear) / 2, r.rear];
  for (const z of bars) P.addEquipment('turretDetail', box(r.half * 2 + .03, .024, .03), 0, r.floor + .022, z);
  const mid = (r.floor + r.top) / 2, length = r.front - r.rear;
  for (const side of SIDES) {
    const posts = r.slatSides ? [r.front, (r.front + r.rear) / 2, r.rear] : [r.front, r.rear];
    for (const z of posts) lattice(P, box(.032, r.top - r.floor, .032).translate(side * r.half, mid + .01, z), 'rear-frame');
    for (const y of r.slatSides ? [r.floor + .03, mid, r.top] : [mid, r.top])
      lattice(P, box(.028, .028, length).translate(side * r.half, y, (r.front + r.rear) / 2), 'rear-frame');
    if (r.slatSides) {
      const count = Math.ceil(length / .16);
      for (let i = 1; i < count; i++) if (i !== count / 2)
        lattice(P, box(.018, r.top - r.floor - .03, .018).translate(side * r.half, mid + .015, r.rear + i * length / count), 'screen-slat');
    }
  }
  for (const y of [r.floor + .03, mid, r.top]) lattice(P, box(r.half * 2 + .032, .028, .028).translate(0, y, r.rear), 'rear-frame');
  lattice(P, box(r.half * 2 + .032, .028, .028).translate(0, r.top, r.front), 'rear-frame');
  const posts = Math.ceil(r.half * 2 / .16);
  for (let i = 1; i < posts; i++) lattice(P, box(.019, r.top - r.floor - .03, .024).translate(-r.half + i * r.half * 2 / posts, mid + .015, r.rear), 'rear-slat');
}

function zubrRackLoad(P: TankBuilderPort): void {
  const r = ZUBR.rack, z = (r.front + r.rear) / 2, deck = r.floor + .034;
  P.addEquipment('turretDetail', box(r.half * 2 - .06, .016, r.front - r.rear - .05), 0, deck - .008, z);
  // The camouflage roll, strapped across the rack.
  P.addEquipment('turretCloth', cylX(.105, .80, seg(P, 18, 10)), .30, deck + .105, z);
  for (const x of [.04, .56]) P.addEquipment('turretDark', torus(.108, .011, seg(P, 18, 10), seg(P, 6, 4)).rotateY(Math.PI / 2), x, deck + .105, z);
  // A service case and a strapped pack.
  P.addEquipment('turretDetail', box(.32, .19, .22), -.50, deck + .095, z + .02);
  P.addEquipment('turretDetail', box(.334, .018, .234), -.50, deck + .199, z + .02);
  for (const dx of [-.10, .10]) P.addEquipment('turretDark', box(.034, .048, .016), -.50 + dx, deck + .14, z + .138);
  strappedPack(P, 'turret', [-.12, deck + .07, z], [.26, .14, .24]);
  // Tools clamped outside the rack's left side rail; the whips on its rear corners.
  const tx = r.half + .040;
  P.addEquipment('turretDark', beamBetween([tx, r.top, r.front - .02], [tx, r.top, r.rear + .03], .013, seg(P, 10, 6)));
  for (const zz of [r.front - .06, r.rear + .07]) P.addEquipment('turretDark', box(.07, .045, .025), r.half + .022, r.top, zz);
  P.addEquipment('turretDetail', box(.03, .12, .20), r.half + .028, (r.floor + r.top) / 2 + .01, (r.front + r.rear) / 2 + .05);
  P.addEquipment('turretDark', beamBetween([r.half + .028, (r.floor + r.top) / 2 + .07, (r.front + r.rear) / 2 + .05], [r.half + .028, r.top - .02, (r.front + r.rear) / 2 + .05], .012, seg(P, 10, 6)));
  // A drone-dock bearer laid across the rack's front and rear top rails over the roll: a flat permanent landing outside
  // the remote station's sweep with nothing overhead (the mission dock's seat, ZUBR_DOCK).
  P.addEquipment('turretDetail', box(.40, .014, .37), ZUBR_DOCK[0], r.top + .021, ZUBR_DOCK[2]);
  for (const dx of [-.16, .16]) P.addEquipment('turretDetail', box(.03, .03, .37), ZUBR_DOCK[0] + dx, r.top, ZUBR_DOCK[2]);
  for (const side of SIDES) {
    const x = side * r.half, zz = r.rear;
    P.addEquipment('turretDetail', cylY(.050, .060, .06, seg(P, 12, 8)), x, r.top + .044, zz);
    P.addEquipment('turretDark', cylY(.008, .014, .70, seg(P, 8, 6)), x, r.top + .424, zz);
  }
}

/** The Zubr's drone-dock landing (turret frame: centre x, bearer top y, centre z). */
const ZUBR_DOCK = [.30, ZUBR.rack.top + .028, (ZUBR.rack.front + ZUBR.rack.rear) / 2] as const;

function zubrSensors(P: TankBuilderPort, casting: Stock): void {
  const l = NATIONAL_ROOF_LOADOUTS.t72b3_zubr;
  // The flat sensor head ahead of the commander's cupola, on a welded plinth.
  const ex = -.70, ez = .42, eye = levelSeat(casting, ex, ez, .20, .20) + .01;
  weldedBlock(P, casting, ex, ez, .19, .19, eye);
  nationalEye(P, ex, ez, eye, l);
  // The radome on the right rear stanchion.
  const [rx, rz] = ZUBR.stanchion.rear;
  nationalRoofSensor(P, -rx, rz, ZUBR.stanchion.top + .022, l);
}

function buildZubrTurret(P: TankBuilderPort, casting: Stock): void {
  // Release 227: the Krata field frame (polandFrontEra.ts) replaces the fine pannier course under the donor's Relikt
  // fan, which this concept no longer carries (nationalDonorTurrets.ts reliktEra: false).
  polishCheekBoxes(P, casting, 1);
  polishRoofGrid(P, casting, 1);
  zubrScreens(P, casting, NATIONAL_ROOF_LOADOUTS.t72b3_zubr.lamp);
  rearRack(P, casting, ZUBR.rack);
  zubrRackLoad(P);
  zubrSensors(P, casting);
}

// ---------------------------------------------------------------------------------------------------------------------
// Zubr II: the heavy fit. A long squared armour cabinet closes each flank round the donor's stowage boxes: a flat outer
// wall with clipped rear shoulder, a welded floor under the boxes and a lid over their outer ends, carried by stanchion
// brackets from the cast roof shoulder; three stepped (staggered) courses of large ERAWA cassettes face it. A long open
// basket stands on climbing rails behind the rear boxes with strapped loads, guarded rear lights and the whips.

const ZUBR_II_ROW = POLISH_PROTECTION_LAYOUTS[PROTECTION_MODEL.t72b3_zubr_ii];
const ZUBR_II = {
  wall: {x: 1.92, thick: .06, front: .42, knee: -.55, back: -.95, shoulder: [1.28, -1.59] as const, top: .80,
    low: .090, lowAft: .125, lid: .37, floor: [.088, .104] as const, cap: 1.78},
  tile: [.075, .19, .22] as const,
  courses: [.215, .415, .615] as const,
  columns: [.30, .055, -.19, -.435, -.68] as const,
  stanchion: ZUBR.stanchion,
  // the basket to the Zubr II's layout row (its slatted sides are the row's turret panels, its rear face the rear cage)
  basket: {front: ZUBR_II_ROW.turretPanels[0][1], rear: ZUBR_II_ROW.rearZ, half: ZUBR_II_ROW.rearHalf,
    floor: ZUBR_II_ROW.rearBottom, top: ZUBR_II_ROW.rearTop, rails: [.30, .62] as const,
    railLow: .075, rise: [-1.95, -2.03] as const, slatSides: true},
} as const;

/** The cabinet wall's plan path on one side: outer face points and inward normals (front, knee, back, shoulder end). */
function cabinetPath(side: number): {outer: [number, number][]; inner: [number, number][]} {
  const w = ZUBR_II.wall, [sx, sz] = w.shoulder, t = w.thick;
  const outer: [number, number][] = [[w.x, w.front], [w.x, w.knee], [w.x, w.back], [sx, sz]];
  // the shoulder runs at 45 degrees: x - z = const; its inner face is offset t along (-1, 1)/sqrt2
  const c = w.x - w.back - t * Math.SQRT2;
  const inner: [number, number][] = [[w.x - t, w.front], [w.x - t, w.knee], [w.x - t, (w.x - t) - c], [sx - t / Math.SQRT2, sz + t / Math.SQRT2]];
  return {outer: outer.map(([x, z]) => [side * x, z]), inner: inner.map(([x, z]) => [side * x, z])};
}

function zubrIICabinets(P: TankBuilderPort, casting: Stock): void {
  const w = ZUBR_II.wall;
  for (const side of SIDES) {
    const {outer, inner} = cabinetPath(side);
    // The wall's lower edge clears the hull's deck cabinets where it sweeps beyond r 2.0 (its rear and shoulder).
    const lows = [w.low, w.low, w.lowAft, w.lowAft];
    const wall = loft(outer.map(([ox, oz], i) => {
      const [ix, iz] = inner[i];
      return [[ix, lows[i], iz], [ox, lows[i], oz], [ox, w.top, oz], [ix, w.top, iz]] as V3[];
    }));
    P.addExternalArmor('turret', wall);
    // The lid over the boxes' outer ends: the same path, w.lid deep.
    const lidIn = outer.map(([ox, oz], i): [number, number] => {
      if (i < 2) return [ox - side * w.lid, oz];
      const c = w.x - w.back - w.lid * Math.SQRT2;
      return i === 2 ? [side * (w.x - w.lid), (w.x - w.lid) - c] : [ox - side * w.lid / Math.SQRT2, oz + w.lid / Math.SQRT2];
    });
    P.addExternalArmor('turret', loft(outer.map(([ox, oz], i) => {
      const [ix, iz] = lidIn[i];
      return [[ix, w.top - .02, iz], [ox, w.top - .02, oz], [ox, w.top + .004, oz], [ix, w.top + .004, iz]] as V3[];
    })));
    // The welded floor under the boxes, from inside the casting's lower flank to the wall, ahead of the knee.
    const floorRings: V3[][] = [];
    for (let z = w.front; z >= w.knee - 1e-6; z -= (w.front - w.knee) / 5) {
      const {point} = casting.face([side * 3, (w.floor[0] + w.floor[1]) / 2, z], [-side, 0, 0]);
      const ix = point.x - side * .03, ox = side * (w.x - w.thick + .012);
      floorRings.push([[ix, w.floor[0], z], [ox, w.floor[0], z], [ox, w.floor[1], z], [ix, w.floor[1], z]]);
    }
    P.addExternalArmor('turret', loft(floorRings));
    // The front cap closes the wall outboard of the Relikt fan's outer lip and of the left smoke bank's lines of fire.
    P.addExternalArmor('turret', box(w.x - w.cap, w.top - w.low, .04), side * (w.x + w.cap) / 2, (w.top + w.low) / 2, w.front - .02);
    // Stepped ERAWA courses: the middle course staggered half a pitch; two columns on the clipped shoulder.
    const seats = new Stock(P.spec.id, [wall]);
    try {
      ZUBR_II.courses.forEach((y, row) => {
        for (const z0 of ZUBR_II.columns) {
          const z = row === 1 ? z0 - .1225 : z0;
          eraTile(P, seats, side, [side * 2.6, y, z], [-side, 0, 0], ZUBR_II.tile);
        }
        const [ax, az] = outer[2], [bx, bz] = outer[3], n = [-(bz - az), bx - ax];
        const len = Math.hypot(n[0], n[1]), out: [number, number] = [n[0] / len, n[1] / len];
        if (out[0] * side < 0) { out[0] = -out[0]; out[1] = -out[1]; }
        for (const f of row === 1 ? [.43] : [.24, .64]) {
          const px = ax + (bx - ax) * f, pz = az + (bz - az) * f;
          eraTile(P, seats, side, [px + out[0] * .5, y, pz + out[1] * .5], [-out[0], 0, -out[1]], ZUBR_II.tile);
        }
      });
    } finally { seats.dispose(); }
    // The near tier shows the wall's bolt row above the top course (fastener detail, permanent steel).
    if (P.q) {
      for (let z = w.front - .06; z >= w.back + .02; z -= .1225)
        P.addEquipment('turretDark', cylX(.013, .012, 8), side * (w.x + .005), w.top - .045, z);
      const [ax, az] = outer[2], [bx, bz] = outer[3];
      for (const f of [.2, .5, .8]) {
        const px = ax + (bx - ax) * f, pz = az + (bz - az) * f;
        P.addEquipment('turretDark', cylX(.013, .012, 8).rotateY(-side * Math.PI / 4), px + side * .0035, w.top - .045, pz - .0035);
      }
    }
    // Bolted access lids; the right lid carries a clamped crowbar, the left keeps its middle clear as the drone dock's
    // flat landing (ZUBR_II_DOCK), outside the remote station's sweep with nothing overhead.
    for (const z of [.25, -.70]) {
      P.addEquipment('turretDetail', box(.27, .022, .30), side * (w.x - .17), w.top + .015, z);
      P.addEquipment('turretDark', box(.07, .018, .10), side * (w.x - .17), w.top + .034, z);
    }
    if (side < 0) {
      const bx = side * (w.x - w.lid + .06);
      P.addEquipment('turretDark', beamBetween([bx, w.top + .022, .34], [bx, w.top + .022, -.84], .015, seg(P, 10, 6)));
      for (const z of [.26, -.76]) P.addEquipment('turretDark', box(.05, .03, .03), bx, w.top + .016, z);
    }
    // Square driving lamps on the cabinets' front ends.
    nationalLamp(P, side * (w.x - .17), w.front - .09, w.top + .004, NATIONAL_ROOF_LOADOUTS.t72b3_zubr_ii.lamp);
    // Lid brackets from welded stanchions on the cast roof shoulder.
    // (the lid's inner edge: x - lid on the flat wall, the 45-degree line behind the knee of the shoulder)
    const lidInner = (z: number): number => z >= w.back ? w.x - w.lid : (w.x - w.back - w.lid * Math.SQRT2) + z;
    const st = ZUBR_II.stanchion, front = st.front[side < 0 ? 0 : 1];
    stanchionArm(P, casting, side, front[0], front[1], st.top, w.top - .01, side * (lidInner(front[1]) + .04));
    stanchionArm(P, casting, side, side * st.rear[0], st.rear[1], st.top, w.top - .01, side * (lidInner(st.rear[1]) + .04));
  }
}

/** The Zubr II's drone-dock landing on the left cabinet lid (turret frame: centre x, lid top y, centre z). */
const ZUBR_II_DOCK = [ZUBR_II.wall.x - ZUBR_II.wall.lid / 2, ZUBR_II.wall.top + .004, -.22] as const;

function zubrIIBasketLoad(P: TankBuilderPort): void {
  const b = ZUBR_II.basket, z = (b.front + b.rear) / 2, deck = b.floor + .034;
  P.addEquipment('turretDetail', box(b.half * 2 - .06, .016, b.front - b.rear - .05), 0, deck - .008, z);
  for (const side of SIDES) strappedPack(P, 'turret', [side * .56, deck + .10, z], [.44, .20, .42]);
  P.addEquipment('turretCloth', cylX(.12, .62, seg(P, 18, 10)), 0, deck + .12, z - .05);
  for (const x of [-.20, .20]) P.addEquipment('turretDark', torus(.123, .012, seg(P, 18, 10), seg(P, 6, 4)).rotateY(Math.PI / 2), x, deck + .12, z - .05);
  // Guarded rear lights on the rear corner posts, facing aft.
  for (const side of SIDES) {
    const x = side * (b.half - .10), y = b.top - .16, zz = b.rear - .045;
    P.addEquipment('turretDetail', box(.18, .12, .07), x, y, zz);
    P.addEquipment('turretGlass', markVehicleNightLens(box(.12, .05, .012), 'marker'), x, y + .01, zz - .041);
    for (const dx of [-.10, .10]) P.addEquipment('turretDark', beamBetween([x + dx, y - .07, b.rear - .01], [x + dx, y + .08, zz - .07], .007, seg(P, 10, 5)));
    P.addEquipment('turretDark', beamBetween([x - .10, y + .08, zz - .07], [x + .10, y + .08, zz - .07], .007, seg(P, 10, 5)));
    // the bracket the lamp hangs on, off the rear corner post
    P.addEquipment('turretDetail', box(.10, .03, .05), side * (b.half - .05), y + .075, b.rear - .01);
  }
  // Whips on the basket's front corner posts.
  for (const side of SIDES) {
    P.addEquipment('turretDetail', cylY(.050, .060, .06, seg(P, 12, 8)), side * b.half, b.top + .044, b.front);
    P.addEquipment('turretDark', cylY(.008, .014, .75, seg(P, 8, 6)), side * b.half, b.top + .449, b.front);
  }
}

function zubrIISensors(P: TankBuilderPort): void {
  const l = NATIONAL_ROOF_LOADOUTS.t72b3_zubr_ii, st = ZUBR_II.stanchion, base = st.top + .022;
  // The monocle eye on a riser on the left rear stanchion, its lens looking forward over the gunner's cupola and sight
  // hood (top .99; on the front stanchion it would blind the gunner's sight); the independent optic on the right front
  // stanchion.
  const riser = .10;
  P.addEquipment('turretDetail', box(.15, riser + .004, .15), st.rear[0], base + riser / 2 - .002, st.rear[1]);
  nationalEye(P, st.rear[0], st.rear[1], base + riser, l);
  const [ox, oz] = st.front[0];
  P.addEquipment('turretDetail', box(.26, .13, .25), ox, base + .065, oz);
  P.addModuleVisual('optics', 'turretGlass', box(.18, .070, .014), ox, base + .083, oz + .132);
  P.addEquipment('turretDetail', box(.29, .025, .28), ox, base + .142, oz);
  for (const dx of [-.156, .156]) P.addEquipment('turretDetail', beamBetween([ox + dx, base - .002, oz - .10], [ox + dx, base + .20, oz + .14], .010, seg(P, 10, 5)));
  P.addEquipment('turretDetail', beamBetween([ox - .156, base + .20, oz + .14], [ox + .156, base + .20, oz + .14], .010, seg(P, 10, 5)));
  // The split-panel roof sensor on the right rear stanchion.
  nationalRoofSensor(P, -st.rear[0], st.rear[1], base, l);
}

function buildZubrIITurret(P: TankBuilderPort, casting: Stock): void {
  zubrIICabinets(P, casting);
  // Release 227: the Krata-2 raked terrace boxes and roof grid (polandFrontEra.ts).
  polishCheekBoxes(P, casting, 2);
  polishRoofGrid(P, casting, 2);
  rearRack(P, casting, ZUBR_II.basket);
  zubrIIBasketLoad(P);
  zubrIISensors(P);
}

/** Zubr: its unchanged Polish hull package, then the turret fit. */
export function buildPolandDonorKit(P: TankBuilderPort, c: NationalModernizationConfig): void {
  hullEquipment(P, c);
  fitPolandDonorTurret(P, 't72b3_zubr');
}

/** Zubr II: the hull is built by zubrII.ts buildZubrIIHull; the turret fit follows. */
export function buildZubrIIDonorKit(P: TankBuilderPort): void {
  fitPolandDonorTurret(P, 't72b3_zubr_ii');
}

function fitPolandDonorTurret(P: TankBuilderPort, id: PolandDonorId): void {
  const castingGeometry: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['turret'], g => castingGeometry.push(g));
  const casting = new Stock(P.spec.id, castingGeometry);
  try {
    if (id === 't72b3_zubr') buildZubrTurret(P, casting);
    else buildZubrIITurret(P, casting);
    // The flat landing kept for the mission drone dock (turret frame): its seat record is solved on this build.
    P.turretG.userData.polishDockLanding = [...(id === 't72b3_zubr' ? ZUBR_DOCK : ZUBR_II_DOCK)];
  } finally { casting.dispose(); }
  const stock: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['turret', 'turretExternalArmor'], g => { if (!Object.hasOwn(g.userData, 'eraHitFaceVertexStarts')) stock.push(g); });
  addPolishProtection(P, PROTECTION_MODEL[id], stock, {turretScreens: false, turretSuit: true});
}

