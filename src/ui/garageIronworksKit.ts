import { KitBuilder, type KitVec } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';
import { atmosphereBand, atmospherePlume } from './garageAtmosphereKit.ts';
import { mapBearing, type GarageSkyline, type GarageSkylineEmitter } from './garageSkylineKit.ts';
import { garageViewPoint } from '../game/garagePresentationPose.ts';

/**
 * Ironworks Deployment (factory_line; garage r9, the per-garage brief 10): a heavy crane bay in the shadow of the
 * Völklingen blast furnaces on the Saar. Rust, soot, slag and plumes.
 *
 * - The bay crane is the kit's double-girder process crane, at work lifting a steel coil on its C-hook; a magnet handler
 *   works the scrap pile (the signature); bell-shaped slag pots ride their carrier on a flush rail spur beside the small
 *   diesel shunter; coil cradles, plate stacks with their clamps and firebrick pallets stock the parts store; a PPE
 *   station with aluminised aprons and face shields on its hooks (no people) and heat screens stand at the pulpit's foot.
 * - Displays: the slideshow on the control kiosk's wall, the elevated glazed control pulpit's console (readouts and the
 *   Ironworks map), the works gate with its IRONWORKS sign and the crest over the gate road, the brand stencilled on the
 *   bay's back wall under the crane, a column banner, the media board, the safety board, the nameboard.
 * - The skyline (K10) is the map's own: the blast furnace with its skip incline, bustle pipe and downcomers, four Cowper
 *   stoves and two stacks at the furnace block's bearing, the ore yard and its bridge reclaimer, the rolling mill's long
 *   sawtooth hall, the old tip and the flat-topped, rilled Great Slag Tip; past the works' south-west edge (where the
 *   opening view looks) the Saar works go on: a gas holder, sawtooth halls, a conveyor gallery, stacks and a cooling tower.
 */

const FACE_CAMERA = Math.PI / 4;
const FACE_LEFT = -Math.PI / 4;
const FACE_RIGHT = (3 * Math.PI) / 4;

const RUST = 0x6e4430, SOOT = 0x2b2c2d, MILL = 0x4a4f52;

// ------------------------------------------------------------------ signature pieces (pure KitBuilder builders)

/** A bell-shaped slag pot on its rail carrier: bogies, the cradle and trunnions, the tipping gear, a crusted rim. */
function slagPotCarrier(b: KitBuilder): void {
  const { skin } = b;
  // underframe on two bogies
  b.box(0, 0.78, 0, 2.4, 0.3, 5.2, SOOT, { bevel: 0.03 });
  for (const end of [-1.7, 1.7]) {
    b.box(0, 0.5, end, 2.0, 0.26, 1.6, 0x232425, { bevel: 0.02 });
    for (const w of [-0.5, 0.5]) for (const side of [-1, 1]) b.cylinder(side * 0.72 - (side > 0 ? 0.1 : 0), 0.4, end + w, 0.4, 0.1, 10, 0x2a2b2c, { axis: 'x' });
  }
  for (const end of [-1, 1]) {
    b.box(0, 0.86, end * 2.66, 2.2, 0.36, 0.12, skin.accent, { bevel: 0.01 });
    for (const side of [-0.7, 0.7]) b.cylinder(side, 0.86, end > 0 ? 2.72 : -3.02, 0.14, 0.3, 8, 0x3a3c3e, { axis: 'z' });
  }
  // the cradle: two A-frames carrying the trunnion bearings
  for (const side of [-1, 1]) {
    b.beam([side * 1.15, 0.95, -1.3], [side * 1.15, 2.55, 0], 0.22, 0.22, MILL, { bevel: 0.015 });
    b.beam([side * 1.15, 0.95, 1.3], [side * 1.15, 2.55, 0], 0.22, 0.22, MILL, { bevel: 0.015 });
    b.box(side * 1.15, 2.6, 0, 0.36, 0.34, 0.5, SOOT, { bevel: 0.02 });
  }
  // the pot: narrow foot to a wide lip, its band and trunnions; the rim crusted with slag running over it
  b.lathe(0, 1.0, 0, [[0, 0], [0.75, 0], [0.82, 0.12], [1.2, 1.3], [1.42, 2.0], [1.5, 2.08], [1.36, 2.1]], 12,
    [RUST, RUST, 0x5a3a2a, RUST, 0x3a2e28, SOOT]);
  b.lathe(0, 1.0, 0, [[1.28, 1.52], [1.34, 1.52], [1.34, 1.66], [1.3, 1.66]], 12, 0x3a3230);
  for (const side of [-1, 1]) b.cylinder(side * 1.02, 2.6, 0, 0.16, 0.26, 10, SOOT, { axis: 'x' });
  b.lathe(0, 3.0, 0, [[1.34, 0.06], [0.9, 0.1], [0.3, 0.02], [0, 0.0]], 12, [0x2e2622, 0x3d2a22, 0x4a2e22]);
  for (const a of [0.4, 1.9, 3.3, 4.6]) {
    b.box(Math.cos(a) * 1.4, 2.6, Math.sin(a) * 1.4, 0.12, 0.8, 0.06, 0x2e2622, { bevel: 0 });
  }
  // the tipping gear: a toothed sector on one trunnion, its motor and gearbox
  b.lathe(1.3, 2.6, 0, [[0.62, -0.05], [0.62, 0.05]], 12, SOOT, { axis: 'x', sweep: Math.PI, start: Math.PI });
  b.box(1.32, 1.4, 0.6, 0.34, 0.4, 0.6, 0x3a4048, { bevel: 0.02 });
  b.cylinder(1.32, 1.4, 1.0, 0.14, 0.4, 10, 0x34383d, { axis: 'z' });
}

/** A short run of flush rail: a concrete strip with two rail heads at standard gauge and a flangeway inside each. */
function flushRail(length: number) {
  return (b: KitBuilder): void => {
    b.box(0, 0.02, 0, 2.6, 0.04, length, 0x6a6660, { bevel: 0.006, noBottom: true });
    for (const side of [-0.7175, 0.7175]) {
      b.box(side, 0.046, 0, 0.07, 0.012, length, 0x8a8c8a, { bevel: 0, noBottom: true }); // polished head
      b.box(side - Math.sign(side) * 0.07, 0.042, 0, 0.06, 0.006, length, 0x1c1b1a, { bevel: 0, noBottom: true }); // flangeway
    }
  };
}

/** The small four-wheel diesel shunter: frame, long hood, cab, buffers and couplers, rails, chevroned end beams. */
function shunter(b: KitBuilder): void {
  const paint = 0x8a6a2a, dark = 0x262728;
  b.box(0, 0.95, 0, 2.3, 0.32, 6.2, dark, { bevel: 0.03 });
  for (const z of [-1.6, 1.6]) for (const side of [-1, 1]) {
    b.cylinder(side * 0.72 - (side > 0 ? 0.12 : 0), 0.5, z, 0.5, 0.12, 10, 0x2a2b2c, { axis: 'x' });
  }
  for (const side of [-1, 1]) b.box(side * 0.98, 0.62, 0, 0.1, 0.52, 4.6, dark, { bevel: 0.01 }); // axle boxes and frame plates
  // the long hood with its louvres and radiator, the cab at the back
  b.box(0, 1.95, 0.9, 1.6, 1.68, 3.6, paint, { bevel: 0.05 });
  for (let k = 0; k < 6; k += 1) for (const side of [-1, 1]) b.box(side * 0.81, 2.1, -0.4 + k * 0.5, 0.02, 0.5, 0.3, 0x5a4a2a, { bevel: 0, noBottom: true });
  b.box(0, 1.95, 2.71, 1.4, 1.2, 0.04, 0x2a2a28, { bevel: 0 });
  b.box(0, 2.25, -1.85, 2.2, 2.3, 1.6, paint, { bevel: 0.05 });
  b.box(0, 3.45, -1.85, 2.36, 0.1, 1.76, 0x3a3a38, { bevel: 0.02 });
  for (const side of [-1, 1]) b.box(side * 1.11, 2.75, -1.85, 0.02, 0.7, 1.1, 0x23292c, { bevel: 0 });
  b.box(0, 2.75, -1.04, 1.8, 0.7, 0.02, 0x23292c, { bevel: 0 });
  b.cylinder(0.4, 2.79, 1.6, 0.08, 0.7, 8, SOOT); // the exhaust
  for (const end of [-1, 1]) {
    b.box(0, 0.95, end * 3.15, 2.36, 0.36, 0.1, b.skin.accent, { bevel: 0.01 });
    for (let k = 0; k < 4; k += 1) b.box(-0.9 + k * 0.6, 0.95, end * 3.21, 0.2, 0.34, 0.01, 0x1c1c1c, { bevel: 0 });
    for (const side of [-0.65, 0.65]) b.cylinder(side, 0.95, end > 0 ? 3.2 : -3.5, 0.15, 0.3, 8, 0x3a3c3e, { axis: 'z' });
    b.box(0, 0.95, end * 3.35, 0.18, 0.18, 0.3, 0x1c1c1c, { bevel: 0.01 });
  }
  for (const side of [-1, 1]) {
    b.box(side * 0.98, 1.88, 0.9, 0.03, 0.03, 3.6, 0xb0a48a, { bevel: 0 }); // hand rails along the hood
    for (const z of [-0.8, 0.9, 2.6]) b.box(side * 0.98, 1.5, z, 0.03, 0.76, 0.03, 0xb0a48a, { bevel: 0 });
  }
}

/** A pile of scrap: twisted beams, plates, tube and wheel sets, rusted, on a low dark heap. */
function scrapPile(b: KitBuilder): void {
  b.lathe(0, 0, 0, [[3.4, 0], [2.6, 0.5], [1.4, 1.0], [0, 1.2]], 12, [0x3a2c24, 0x4a3326, 0x3d2c24]);
  const r = b.rng;
  for (let i = 0; i < 19; i += 1) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 2.8;
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8;
    const y = 1.2 * (1 - d / 3.4) + 0.15;
    const tone = r() < 0.5 ? RUST : r() < 0.5 ? 0x5a3a28 : 0x4f4a45;
    b.push().translate(x, y, z).rotateY(r() * Math.PI).rotateZ((r() - 0.5) * 1.1).rotateX((r() - 0.5) * 0.7);
    const kind = i % 4;
    if (kind === 0) b.ibeam([-1.3, 0, 0], [1.3, 0, 0], 0.3, 0.16, tone, 0, 0.02, 0.012);
    else if (kind === 1) b.box(0, 0, 0, 1.6 + r(), 0.03, 0.9 + r() * 0.5, tone, { bevel: 0 });
    else if (kind === 2) b.cylinder(-0.9, 0, 0, 0.12, 1.8, 8, tone, { axis: 'x' });
    else b.angle([-1.0, 0, 0], [1.0, 0, 0], 0.12, 0.012, tone, r() * 3);
    b.pop();
  }
}

/** A row of three coil cradles, coils on two of them, chocked; their saddles worn bright. */
function coilRow(b: KitBuilder): void {
  for (let k = 0; k < 3; k += 1) {
    const x = (k - 1) * 2.2;
    b.box(x, 0.08, 0, 1.9, 0.16, 1.5, MILL, { bevel: 0.015, noBottom: true });
    for (const s of [-1, 1]) b.beam([x - 0.75, 0.16, s * 0.15], [x - 0.75, 0.55, s * 0.6], 0.14, 0.14, MILL, { bevel: 0 });
    for (const s of [-1, 1]) b.beam([x + 0.75, 0.16, s * 0.15], [x + 0.75, 0.55, s * 0.6], 0.14, 0.14, MILL, { bevel: 0 });
    if (k < 2) {
      b.lathe(x, 0.98, 0, [[0.32, -0.7], [0.82, -0.7], [0.82, 0.7], [0.32, 0.7], [0.32, -0.7]], 14, k ? 0x8c9094 : 0x6e7276, { axis: 'x' });
      for (const s of [-0.4, 0.4]) b.box(x + s, 0.86, 0, 0.03, 0.03, 1.66, 0x2b2c2d, { bevel: 0 }); // the steel straps
    }
  }
}

/** A stack of steel plates on timber bearers with a plate-lifting clamp and its shackle on top. */
function plateStack(b: KitBuilder): void {
  for (const z of [-1.1, 0, 1.1]) b.box(0, 0.08, z, 2.6, 0.16, 0.2, b.skin.wood, { bevel: 0.01, noBottom: true });
  for (let k = 0; k < 8; k += 1) {
    const jitter = (b.rng() - 0.5) * 0.12;
    b.box(jitter, 0.18 + k * 0.05, (b.rng() - 0.5) * 0.1, 2.4, 0.04, 3.0, k % 3 === 0 ? 0x5e5a56 : k % 3 === 1 ? 0x6e5a4a : 0x55534f, { bevel: 0.003 });
  }
  b.box(0.6, 0.72, 1.3, 0.16, 0.3, 0.3, b.skin.accent, { bevel: 0.01 });
  b.box(0.6, 0.6, 1.5, 0.16, 0.08, 0.1, b.skin.accent, { bevel: 0 });
  b.torus(0.6, 0.98, 1.3, 0.1, 0.02, 8, 3, 0x3a3c3e, 'z');
}

/** A pallet of firebrick under its strapping, a shrink cap over the top course. */
function firebrickPallet(b: KitBuilder): void {
  b.box(0, 0.07, 0, 1.2, 0.14, 1.0, b.skin.wood, { bevel: 0.01, noBottom: true });
  for (let k = 0; k < 5; k += 1) b.box(0, 0.2 + k * 0.13, 0, 1.12 - (k % 2) * 0.02, 0.12, 0.94, k % 2 ? 0xb89a72 : 0xc4a67c, { bevel: 0.006 });
  for (const x of [-0.3, 0.3]) b.box(x, 0.48, 0, 0.03, 0.72, 0.96, 0x2e3133, { bevel: 0 });
}

/** The PPE station: aluminised aprons and face shields on their hooks, gloves, a heat-proof locker and the pictograms. */
function ppeStation(b: KitBuilder): void {
  const galv = 0x8a9094;
  for (const x of [-1.2, 1.2]) b.box(x, 1.1, 0, 0.08, 2.2, 0.08, galv, { bevel: 0.006, noBottom: true });
  b.box(0, 1.25, -0.04, 2.5, 1.7, 0.04, 0x5a6064, { bevel: 0.004 });
  b.box(0, 2.14, 0.06, 2.6, 0.04, 0.24, galv, { bevel: 0.004 }); // rain hood
  b.box(0, 1.92, 0.04, 2.3, 0.04, 0.04, 0x2b2c2d, { bevel: 0 }); // hook rail
  for (let k = 0; k < 3; k += 1) { // aprons: tapered silver panels hanging from the rail
    const x = -0.85 + k * 0.5;
    b.polygon([[x - 0.18, 0.95, 0.07], [x + 0.18, 0.95, 0.07], [x + 0.14, 1.88, 0.07], [x - 0.14, 1.88, 0.07]], 0x9a9ea2, [0, 0, 1]);
    b.box(x, 1.9, 0.06, 0.05, 0.06, 0.04, 0x2b2c2d, { bevel: 0 });
  }
  for (let k = 0; k < 2; k += 1) { // face shields: hood and visor
    const x = 0.65 + k * 0.42;
    b.box(x, 1.72, 0.1, 0.26, 0.24, 0.16, 0x9a9ea2, { bevel: 0.03 });
    b.box(x, 1.66, 0.19, 0.2, 0.12, 0.01, 0x3a4a3a, { bevel: 0 });
  }
  for (const x of [0.55, 0.85, 1.05]) b.box(x, 1.3, 0.07, 0.12, 0.3, 0.05, 0xb09868, { bevel: 0.01 }); // gloves
  b.box(1.9, 0.9, 0.1, 0.6, 1.8, 0.5, 0x7a2e26, { bevel: 0.02 }); // the locker
  b.box(1.9, 1.0, 0.36, 0.5, 1.5, 0.01, 0x5a2420, { bevel: 0 });
  for (const [x, rect] of [[-0.75, 'picto.head'], [-0.25, 'picto.eye'], [0.25, 'picto.gloves']] as const) {
    b.uprightFace(x, 0.62, 0.0, 0.34, 0.34, garageDisplayRect(rect));
  }
  b.uprightFace(0.95, 0.62, 0.0, 0.34, 0.34, garageDisplayRect('picto.ear'));
}

/** Three aluminised heat screens on their castored frames, set at angles. */
function heatScreens(b: KitBuilder): void {
  for (let k = 0; k < 3; k += 1) {
    b.push().translate((k - 1) * 1.35, 0, Math.abs(k - 1) * 0.35).rotateY((k - 1) * -0.4);
    for (const x of [-0.6, 0.6]) {
      b.box(x, 1.0, 0, 0.05, 1.9, 0.05, 0x3a3c3e, { bevel: 0 });
      b.box(x, 0.06, 0, 0.08, 0.06, 0.6, 0x2a2b2c, { bevel: 0 });
    }
    b.box(0, 1.1, 0, 1.15, 1.6, 0.02, k === 1 ? 0x868a8e : 0x7c8084, { bevel: 0 });
    for (const y of [0.32, 1.1, 1.88]) b.box(0, y, 0.015, 1.2, 0.05, 0.03, 0x3a3c3e, { bevel: 0 });
    for (const x of [-0.29, 0.29]) b.box(x, 1.1, 0.012, 0.012, 1.55, 0.006, 0x5a3a2c, { bevel: 0 }); // heat stain
    b.pop();
  }
}

/**
 * The elevated glazed control pulpit: four H-section legs, the platform with its handrail, a stair with landings, the
 * cabin with its glazed front (mullions, no panes, so its console reads from the yard), its roof and the cable tray.
 * The console's screens are the 'station' item placed inside at the cabin's floor height. Frame: front +Z.
 */
const PULPIT_FLOOR = 3.4;
function controlPulpit(b: KitBuilder): void {
  const { skin } = b;
  const steel = skin.steel, floor = PULPIT_FLOOR;
  for (const x of [-1.6, 1.6]) for (const z of [-1.2, 1.2]) {
    b.ibeam([x, 0, z], [x, floor, z], 0.22, 0.2, steel, 0, 0.02, 0.012);
    b.box(x, 0.03, z, 0.5, 0.06, 0.5, skin.concrete, { bevel: 0.01, noBottom: true });
  }
  for (const z of [-1.2, 1.2]) b.beam([-1.6, floor * 0.45, z], [1.6, floor * 0.9, z], 0.1, 0.1, steel, { bevel: 0 }); // bracing
  b.box(0, floor - 0.1, 0.4, 3.8, 0.2, 3.6, 0x4c4f50, { bevel: 0.01 }); // the platform, a walkway in front of the cabin
  for (const x of [-1.85, 1.85]) b.box(x, floor + 0.55, 1.8, 0.04, 1.1, 0.04, skin.accent, { bevel: 0 });
  b.box(0, floor + 1.08, 2.15, 3.7, 0.04, 0.04, skin.accent, { bevel: 0 });
  b.box(0, floor + 0.6, 2.15, 3.7, 0.04, 0.04, skin.accent, { bevel: 0 });
  for (const x of [-1.8, -0.6, 0.6, 1.8]) b.box(x, floor + 0.55, 2.15, 0.04, 1.1, 0.04, skin.accent, { bevel: 0 });
  // the cabin: rear and side walls in ribbed panel, a deep roof, the glazed front with its sill and mullions
  const cy = floor + 1.25, top = floor + 2.5;
  b.box(0, cy, -1.25, 3.4, 2.5, 0.1, 0x5d6266, { bevel: 0.01 });
  for (const x of [-1.68, 1.68]) b.box(x, cy, -0.35, 0.1, 2.5, 1.9, 0x5d6266, { bevel: 0.01 });
  for (let k = 0; k < 7; k += 1) b.box(-1.5 + k * 0.5, cy, -1.31, 0.05, 2.4, 0.03, 0x4a4f52, { bevel: 0 });
  b.box(0, top + 0.08, -0.25, 3.8, 0.16, 2.6, 0x3a3e40, { bevel: 0.02 });
  b.box(0, floor + 0.45, 0.6, 3.4, 0.9, 0.08, 0x5d6266, { bevel: 0.01 }); // the sill wall
  for (const x of [-1.68, -0.56, 0.56, 1.68]) b.box(x, floor + 1.65, 0.6, 0.06, 1.6, 0.08, 0x2b2c2d, { bevel: 0 });
  b.box(0, top - 0.02, 0.6, 3.4, 0.08, 0.1, 0x2b2c2d, { bevel: 0 });
  b.box(0, floor + 0.92, 0.62, 3.4, 0.05, 0.12, 0x2b2c2d, { bevel: 0 });
  b.face([-1.65, top - 0.06, 0.66], [1.65, top - 0.06, 0.66], [1.65, top + 0.2, 0.66], [-1.65, top + 0.2, 0.66], garageDisplayRect('glow.monitor'));
  // the stair down the left side with its stringers and handrail, the landing at the platform
  for (let k = 0; k < 11; k += 1) {
    const t = k / 10;
    b.box(-2.35, floor * (1 - t) + 0.1, -1.0 + t * 3.0, 0.8, 0.04, 0.26, 0x4c4f50, { bevel: 0 });
  }
  for (const x of [-2.75, -1.95]) b.beam([x, 0.05, 2.1], [x, floor, -1.0], 0.04, 0.22, steel, { bevel: 0 });
  b.beam([-2.78, 1.0, 2.1], [-2.78, floor + 1.0, -1.0], 0.04, 0.04, skin.accent, { bevel: 0 });
  // the cable tray to the bay and an air-conditioning box on the back wall
  b.box(1.0, top - 0.4, -1.5, 0.9, 0.6, 0.4, 0x8a9094, { bevel: 0.02 });
  b.box(2.6, top - 0.5, -0.4, 1.8, 0.08, 0.3, 0x8a9094, { bevel: 0 });
}

/**
 * The control kiosk on the bay's right: a ribbed steel cabin with its flat roof, a side door and window, the cable tray
 * into the bay; its yard wall carries the slideshow's wall bracket (the slideshow frame is the shared kit's). Frame: the
 * kiosk's front wall at z = -0.3, the slideshow's plane at z = 0.
 */
function controlKiosk(b: KitBuilder): void {
  const w = 3.6, d = 2.8, h = 3.3, zc = -0.3 - d / 2;
  b.box(0, h / 2, zc, w, h, d, 0x5d6266, { bevel: 0.02 });
  for (let k = 0; k < 9; k += 1) b.box(-w / 2 + 0.2 + k * 0.4, h / 2, -0.29, 0.06, h - 0.2, 0.03, 0x4f5458, { bevel: 0 });
  b.box(0, h + 0.08, zc + 0.1, w + 0.3, 0.16, d + 0.5, 0x3a3e40, { bevel: 0.02 });
  b.box(0, 0.1, zc, w + 0.2, 0.2, d + 0.2, b.skin.concrete, { bevel: 0.01, noBottom: true });
  // the side door, its window and the lit window beside it
  b.box(w / 2 + 0.01, 1.05, zc + 0.5, 0.03, 2.1, 0.9, 0x3a4245, { bevel: 0 });
  b.box(w / 2 + 0.01, 2.0, zc - 0.6, 0.03, 0.8, 1.0, 0x1f272b, { bevel: 0 });
  b.push().translate(w / 2 + 0.03, 2.0, zc - 0.6).rotateY(Math.PI / 2);
  b.uprightFace(0, 0, 0, 0.9, 0.7, garageDisplayRect('glow.monitor'));
  b.pop();
  b.box(-w / 2 - 0.4, h - 0.5, zc, 0.8, 0.08, 0.3, 0x8a9094, { bevel: 0 }); // the cable tray toward the bay
  b.box(-w / 2 + 0.6, h + 0.36, zc - 0.5, 0.8, 0.4, 0.7, 0x8a9094, { bevel: 0.02 }); // the air conditioner
}

/** The works gate: two steel posts on footings, a box-girder header with the IRONWORKS sign and the crest, lamps, a
 * barrier arm and a gatehouse. Frame: the gate road runs along z, the header across x (`span` between the posts). */
function worksGate(span: number) {
  return (b: KitBuilder): void => {
    const half = span / 2, h = 6.2;
    for (const x of [-half, half]) {
      b.box(x, 0.2, 0, 1.2, 0.4, 1.2, b.skin.concrete, { bevel: 0.02, noBottom: true });
      b.ibeam([x, 0.4, 0], [x, h, 0], 0.5, 0.45, MILL, 0, 0.03, 0.016);
    }
    b.box(0, h + 0.45, 0, span + 1.0, 0.9, 0.6, MILL, { bevel: 0.02 });
    for (let k = -4; k <= 4; k += 1) b.box(k * span / 9, h + 0.45, 0.305, 0.04, 0.8, 0.01, 0x3a3e40, { bevel: 0 });
    // the sign on its backing plate, both faces, and the crest standing on the header
    for (const s of [1, -1]) {
      b.push().rotateY(s > 0 ? 0 : Math.PI);
      b.box(0, h + 0.45, 0.34, 6.2, 1.38, 0.06, 0x2a2c2e, { bevel: 0.01 });
      b.uprightFace(0, h + 0.45, 0.375, 6.0, 1.2, garageDisplayRect('name.foundry'));
      b.pop();
    }
    b.box(0, h + 1.65, 0, 1.6, 1.6, 0.12, 0x3a3e40, { bevel: 0.01 });
    for (const s of [1, -1]) {
      b.push().rotateY(s > 0 ? 0 : Math.PI);
      b.uprightFace(0, h + 1.65, 0.065, 1.44, 1.44, garageDisplayRect('brand.crest.metal'));
      b.pop();
    }
    for (const x of [-half + 0.8, half - 0.8]) { // lamps on the header
      b.beam([x, h + 0.9, 0.3], [x, h + 0.9, 1.0], 0.06, 0.06, SOOT, { bevel: 0 });
      b.box(x, h + 0.82, 1.05, 0.5, 0.12, 0.3, SOOT, { bevel: 0.01 });
      b.face([x - 0.2, h + 0.755, 1.18], [x + 0.2, h + 0.755, 1.18], [x + 0.2, h + 0.755, 0.92], [x - 0.2, h + 0.755, 0.92], garageDisplayRect('glow.warm'));
    }
    // the barrier: its post with the counterweight, the red and white boom down across half the road
    b.box(half - 1.0, 0.55, 1.6, 0.4, 1.1, 0.4, b.skin.accent, { bevel: 0.02 });
    for (let k = 0; k < 6; k += 1) b.box(half - 1.5 - k * 0.7 - 0.35, 1.0, 1.6, 0.7, 0.1, 0.1, k % 2 ? 0xd8d6cc : 0xa8302a, { bevel: 0.01 });
    // the gatehouse beside the right post
    b.box(half + 2.2, 1.35, 2.6, 2.4, 2.7, 2.2, 0x6a5a4c, { bevel: 0.02 });
    b.box(half + 2.2, 2.78, 2.6, 2.8, 0.16, 2.6, 0x3a3e40, { bevel: 0.02 });
    b.box(half + 0.99, 1.7, 2.6, 0.03, 0.9, 1.4, 0x1f272b, { bevel: 0 });
  };
}

// ------------------------------------------------------------------ the skyline (K10)

// The terrain patch's anchor: alpha's spawn in the works' south-west corner (garageTerrainPatches.generated.ts).
const ANCHOR = [-356, -372] as const;
const BEARING = {
  furnace: mapBearing(ANCHOR, [-74, -29]), // the blast furnace block (the casting house and the furnaces)
  stackA: mapBearing(ANCHOR, [-44, -36]),
  stackB: mapBearing(ANCHOR, [-104, -64]),
  slagTip: mapBearing(ANCHOR, [372, -372]), // the Great Slag Tip
  oldTip: mapBearing(ANCHOR, [-160, 75]),
  oreYard: mapBearing(ANCHOR, [142, 112]), // the ore yard's eastern berm
  rollingMill: mapBearing(ANCHOR, [199, -28]), // the rolling mill's warehouse
} as const;
const DEG = Math.PI / 180;

function ironworksSkylineBuild(e: GarageSkylineEmitter): void {
  // the blast furnace: hearth, bosh, stack and top in a lathe, the bustle pipe and its tuyere stocks, four downcomers to
  // the dust catcher, the skip incline from the stock house to the top, the casting house at its foot, a steel frame
  {
    const r = 84, at = e.frame(BEARING.furnace, r), haze = e.hazeAt(r) * 0.85;
    e.accent = true;
    e.lathe(at, 0, 4, [[4.2, e.foot], [4.2, 3.5], [5.4, 6.5], [5.2, 9], [3.6, 19.5], [2.6, 21], [1.6, 22.4], [1.6, 23.6]], [0x4a3f38, 0x5a4a40, 0x4f4743, 0x4a4542, 0x3a3836, 0x2f2d2c, 0x2a2928], haze, 12);
    for (let k = 0; k < 12; k += 1) {
      const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
      e.strut(at, [Math.cos(a0) * 6.6, 7.2, 4 + Math.sin(a0) * 6.6], [Math.cos(a1) * 6.6, 7.2, 4 + Math.sin(a1) * 6.6], 0.9, 0x3d3a38, haze);
    }
    for (const a of [0.4, 1.9, 3.6, 5.1]) e.strut(at, [Math.cos(a) * 1.2, 23.4, 4 + Math.sin(a) * 1.2], [Math.cos(a) * 3.5, 25.2, 4 + Math.sin(a) * 3.5], 0.7, 0x3a3836, haze);
    e.strut(at, [3.2, 25.2, 4.5], [8.5, 13, 3], 1.1, 0x3d3a38, haze); // the downcomer
    e.prism(at, 9.2, 3, 2.4, 12.4, 0x4a4542, 0x2f2d2c, haze, 8, e.foot, { rise: 0.7 }); // the dust catcher
    for (const x of [-4.8, 4.8]) for (const z of [0.5, 8]) e.strut(at, [x, e.foot, z], [x * 0.7, 21, z * 0.9 + 0.4], 0.6, 0x3a3836, haze);
    // the skip incline (a lattice girder from the stock house up to the furnace top) and the stock house under its foot
    e.strut(at, [-16, 1.5, 9], [-1.8, 23, 5], 1.0, 0x45403c, haze);
    e.strut(at, [-16, 0, 11], [-1.8, 21.5, 7], 1.0, 0x45403c, haze);
    for (let k = 1; k < 6; k += 1) {
      const t = k / 6;
      e.strut(at, [-16 + 14.2 * t, 1.5 + 21.5 * t, 9 - 4 * t], [-16 + 14.2 * t, e.foot, 9 - 4 * t + 1.5], 0.45, 0x3d3a38, haze);
    }
    e.accent = false;
    e.box(at, -22, -12, 6, 16, 8, 0x5a4e46, 0x3a3836, haze);
    e.box(at, -6, 6, -6, 0, 9.5, 0x6a5444, 0x3a3836, haze, { flat: false }); // the casting house
    e.gable(at, -6.3, 6.3, -6.3, 0.3, 9.5, 12.4, 0x6a5444, 0x3c3a38, haze);
    e.windows(at, -5.6, 5.6, -6, 2, 9, haze, 2.2, 3.4, 0x2c2a28, [1.1, 1.8]);
  }
  // four Cowper stoves in a row south of the furnace, the hot-blast main along their feet
  {
    const r = 80;
    e.accent = true;
    for (let k = 0; k < 4; k += 1) {
      const at = e.frame(BEARING.furnace - (5.6 + k * 2.15) * DEG, r + (k % 2) * 1.5);
      const haze = e.hazeAt(r) * 0.85;
      e.lathe(at, 0, 4, [[2.6, e.foot], [2.6, 18], [2.2, 19.6], [1.2, 20.6], [0, 21]], [0x585450, 0x4a4744, 0x424040, 0x3a3938], haze, 10);
      e.lathe(at, 0, 4, [[2.7, 6.0], [2.7, 6.4]], 0x3a3836, haze, 10);
    }
    e.accent = false;
    const main = e.frame(BEARING.furnace - 8.8 * DEG, r - 3.2);
    e.strut(main, [-7, 4.6, 0], [10, 6.8, 0], 1.0, 0x3d3a38, e.hazeAt(r));
  }
  // the furnace block's two stacks (their plumes are the Garage's atmosphere cards)
  e.accent = true;
  for (const [bearing, r, top] of [[BEARING.stackA, 92, 25.5], [BEARING.stackB + 4 * DEG, 88, 24.0]] as const) {
    const at = e.frame(bearing, r);
    e.lathe(at, 0, 0, [[1.9, e.foot], [1.5, top - 1.2], [1.6, top - 1.0], [1.6, top], [1.3, top]], [0x6e4434, 0x2a2624, 0x1e1c1b, 0x1a1918], e.hazeAt(r) * 0.85, 8);
  }
  e.accent = false;
  // the ore yard: two long stockpiles and the bridge reclaimer straddling one
  {
    const r = 64, haze = e.hazeAt(r);
    for (const [db, len] of [[-12, 1.1], [-4, 0.9]] as const) {
      const at = e.frame(BEARING.oreYard + db * DEG, r);
      e.mound(at, 0, 4, 9, 3.6, 2.5, [0x7a4632, 0x8a5038, 0x6e3e2c], haze, 10, 0.08, len * 0.45);
    }
    const at = e.frame(BEARING.oreYard - 8 * DEG, r - 1);
    for (const x of [-7, 7]) e.box(at, x - 0.5, x + 0.5, 2, 3, 9.5, 0x4f4a45, 0x3a3836, haze);
    e.box(at, -8, 8, 1.8, 3.2, 10.4, 0x5a5550, 0x3a3836, haze);
    e.strut(at, [-6, 9.8, 2.5], [5, 2, 2.5], 0.5, 0x4a4542, haze);
  }
  // the rolling mill: a long sawtooth hall with its louvres and a lit window band
  {
    const r = 88, at = e.frame(BEARING.rollingMill, r), haze = e.hazeAt(r);
    const width = 46, depth = 18, eave = 9.5;
    e.box(at, -width / 2, width / 2, 0, depth, eave, 0x6a5f55, 0x3a3d40, haze, { flat: false });
    e.windows(at, -width / 2, width / 2, 0, 2.2, eave - 1, haze, 3.2, 3.6, 0x2c3034, [2.2, 1.3]);
    e.panel(at, -3, 3, 0, 0, 6, 0x1f2224, haze);
    const teeth = 9;
    for (let i = 0; i < teeth; i += 1) {
      const xa = -width / 2 + (i / teeth) * width, xb = -width / 2 + ((i + 1) / teeth) * width;
      e.quad([at(xa, eave, 0), at(xb, eave, 0), at(xb, eave + 3.4, depth * 0.4), at(xa, eave + 3.4, depth * 0.4)], 0x5d5650, haze);
      e.quad([at(xb, eave, depth), at(xa, eave, depth), at(xa, eave + 3.4, depth * 0.4), at(xb, eave + 3.4, depth * 0.4)], 0x3d4144, haze);
      e.tri([at(xb, eave, 0), at(xb, eave, depth), at(xb, eave + 3.4, depth * 0.4)], 0x6a5f55, haze);
    }
  }
  // the old tip inside the works and the Great Slag Tip beyond them: flat-topped where the tipping track ran, rilled
  e.mound(e.frame(BEARING.oldTip, 96), 0, 6, 26, 9.5, 7, [0x3a3532, 0x46403a, 0x3d3833, 0x332f2c], e.hazeAt(96), 14, 0.07);
  e.mound(e.frame(BEARING.slagTip, 122), 0, 8, 46, 12.6, 18, [0x3e3a36, 0x4a4540, 0x544c44, 0x464038], e.hazeAt(122), 16, 0.05);
  // past the works' south-west edge, where the opening view looks: the Saar works go on (unnamed: the map ends here)
  {
    // a gas holder in its guide frame
    const r = 82, at = e.frame(205 * DEG, r), haze = e.hazeAt(r);
    e.lathe(at, 0, 8, [[9, e.foot], [9, 11.2], [8.6, 12.2], [0, 12.6]], [0x6a6e70, 0x5a5e60, 0x4a4e50], haze, 16);
    e.accent = true;
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      e.strut(at, [Math.cos(a) * 9.6, e.foot, 8 + Math.sin(a) * 9.6], [Math.cos(a) * 9.6, 16, 8 + Math.sin(a) * 9.6], 0.5, 0x3a3e40, haze);
    }
    for (let k = 0; k < 8; k += 1) {
      const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
      e.strut(at, [Math.cos(a0) * 9.6, 15.6, 8 + Math.sin(a0) * 9.6], [Math.cos(a1) * 9.6, 15.6, 8 + Math.sin(a1) * 9.6], 0.35, 0x3a3e40, haze);
    }
    e.accent = false;
  }
  for (const [deg, r, width, eave] of [[218, 74, 30, 8.5], [232, 86, 38, 9.0], [262, 78, 26, 8.0], [292, 70, 22, 7.6]] as const) {
    const at = e.frame(deg * DEG, r), haze = e.hazeAt(r);
    const depth = 16;
    e.box(at, -width / 2, width / 2, 0, depth, eave, deg % 2 ? 0x5d6266 : 0x6a5a4c, 0x3a3d40, haze, { flat: false });
    e.panel(at, -width / 2 + 0.6, width / 2 - 0.6, 0, eave - 1.6, eave - 0.7, 0x2b2e30, haze);
    e.panel(at, -2.4, 2.4, 0, 0, 5.4, 0x1f2224, haze);
    const teeth = Math.round(width / 5);
    for (let i = 0; i < teeth; i += 1) {
      const xa = -width / 2 + (i / teeth) * width, xb = -width / 2 + ((i + 1) / teeth) * width;
      e.quad([at(xa, eave, 0), at(xb, eave, 0), at(xb, eave + 3, depth * 0.4), at(xa, eave + 3, depth * 0.4)], 0x8a9298, haze * 0.9);
      e.quad([at(xb, eave, depth), at(xa, eave, depth), at(xa, eave + 3, depth * 0.4), at(xb, eave + 3, depth * 0.4)], 0x3d4144, haze);
    }
  }
  // a conveyor gallery climbing to a bunker, two works stacks and a cooling tower right of the opening view
  {
    const at = e.frame(244 * DEG, 76), haze = e.hazeAt(76);
    e.strut(at, [-14, 1.5, 4], [6, 11.5, 4], 1.6, 0x5a5550, haze);
    for (const x of [-8, -1]) e.strut(at, [x, e.foot, 4], [x, 2 + (x + 14) * 0.5, 4], 0.4, 0x3a3836, haze);
    e.box(at, 5, 11, 1, 7, 12.6, 0x55504a, 0x3a3836, haze);
  }
  e.accent = true;
  for (const [deg, r, top] of [[196, 90, 23], [199, 94, 21]] as const) {
    const at = e.frame(deg * DEG, r);
    e.lathe(at, 0, 0, [[1.6, e.foot], [1.25, top - 1], [1.35, top], [1.1, top]], [0x7b4e3c, 0x2a2624, 0x1c1a19], e.hazeAt(r) * 0.85, 8);
  }
  e.accent = false;
  {
    const at = e.frame(258 * DEG, 96), haze = e.hazeAt(96);
    e.lathe(at, 0, 6, [[8, e.foot], [7.4, 2], [5.4, 8], [5.0, 10], [5.6, 12.4]], [0x8a8a86, 0x7e7e7a, 0x8a8a86, 0x9a9a96], haze, 14);
  }
  // the land between: works sheds, embankments and birch scrub on the slag (no slab silhouettes)
  for (let k = 0; k < 18; k += 1) {
    const deg = 70 + k * 7.5 + (e.random() - 0.5) * 3;
    if (deg > 186 && deg < 300) continue;
    const r = 58 + e.random() * 16, at = e.frame(deg * DEG, r), haze = e.hazeAt(r);
    if (k % 3 === 0) {
      const w = 8 + e.random() * 8, d = 6 + e.random() * 4, eave = 4 + e.random() * 2;
      e.box(at, -w / 2, w / 2, 0, d, eave, k % 2 ? 0x6e5a4a : 0x5d6064, 0x3e4246, haze, { flat: false });
      e.gable(at, -w / 2 - 0.3, w / 2 + 0.3, -0.3, d + 0.3, eave, eave + 2, k % 2 ? 0x6e5a4a : 0x5d6064, 0x45494c, haze);
    } else if (k % 3 === 1) {
      const n = 2 + Math.floor(e.random() * 2);
      for (let t = 0; t < n; t += 1) e.tree(at, (t - n / 2) * (2.5 + e.random() * 2), e.random() * 2, 6 + e.random() * 4, 2.8 + e.random(), t % 2 ? 0x55603e : 0x4a5436, haze, 0);
    }
  }
  for (let k = 0; k < 6; k += 1) {
    const deg = 300 + k * 10 + (e.random() - 0.5) * 5;
    const r = 56 + e.random() * 10, at = e.frame(deg * DEG, r), haze = e.hazeAt(r);
    const n = 1 + Math.floor(e.random() * 3);
    for (let t = 0; t < n; t += 1) e.tree(at, t * 3.2 - 1.6, e.random() * 2, 6 + e.random() * 4, 2.6 + e.random(), 0x4f5a3a, haze, 0);
  }
}

export const IRONWORKS_SKYLINE: GarageSkyline = Object.freeze({
  landmarks: Object.freeze([
    { name: 'blast furnace', bearing: BEARING.furnace, radius: 84, source: 'the blast furnace block, map (-74, -29)' },
    { name: 'Cowper stoves', bearing: BEARING.furnace - 8.8 * DEG, radius: 80, source: 'four hot-blast stoves beside the furnace block' },
    { name: 'furnace stacks', bearing: BEARING.stackA, radius: 92, source: 'the stacks at map (-44, -36) and (-104, -64), with plumes' },
    { name: 'ore yard and bridge reclaimer', bearing: BEARING.oreYard - 8 * DEG, radius: 64, source: 'the ore yard berms, map (142, 112)' },
    { name: 'rolling mill', bearing: BEARING.rollingMill, radius: 88, source: 'the rolling mill warehouse, map (199, -28)' },
    { name: 'old slag tip', bearing: BEARING.oldTip, radius: 96, source: 'the old tip, map (-160, 75)' },
    { name: 'Great Slag Tip', bearing: BEARING.slagTip, radius: 122, source: 'the Great Slag Tip, map (372, -372)' },
  ]),
  build: ironworksSkylineBuild,
  bandSegments: [96, 80, 64, 48, 48] as const,
});

// ------------------------------------------------------------------ the placement

/** A point in the pack's frame from the opening view's [side, depth] and a height. */
const world = (side: number, y: number, depth: number): KitVec => {
  const p = garageViewPoint(side, depth);
  return [p.x, y, p.z];
};
/** A skyline point in the pack's frame (bearing, radius, height). */
const polar = (bearing: number, radius: number, y: number): KitVec => [Math.cos(bearing) * radius, y, Math.sin(bearing) * radius];

export const IRONWORKS_KIT: GarageKitPlacement = {
  items: [
    // the bay crane: a double-girder process crane on the bay's own crane brackets, at work over a steel coil
    { kind: 'crane', crane: 'overhead', at: [0, 23], yaw: FACE_CAMERA, params: { span: 24.8, runway: 21, railY: 8.72, girders: 2, swl: 40,
      bridgeAt: 0.7, trolleyAt: 0.93, load: { kind: 'coil' }, columns: false, number: 2, face: 1 } },
    // the brand stencilled on the back wall's sheeting under the crane's girder, and a banner on the front right column
    { kind: 'sign', sign: 'supergraphic', rect: 'stencil.wordmark', at: [-2.0, 33.25], yaw: FACE_CAMERA, y: 9.05, size: [6.0, 1.125] },
    { kind: 'display', display: 'banner', rect: 'brand.banner.v', at: [12.8, 12.52], yaw: FACE_CAMERA, y: 7.4, size: [1.0, 4.0],
      options: { hang: 0.5 } },
    // IRONWORKS on the foundry office's brick facade toward the yard (its +X wall at x -32.3), under the parapet
    { kind: 'display', display: 'plate', rect: 'name.foundry', at: [-21.42, 24.25], yaw: Math.PI / 2, y: 7.05, size: [4.5, 0.9],
      datum: true },
    // the control kiosk on the bay's right (its wall carries the slideshow: garageSlideshowPlacement.ts), the safety
    // board beside it, the parts store: coil cradles, a plate stack with its clamp, firebrick pallets, a parked forklift
    { kind: 'piece', key: 'ironworks-kiosk', build: controlKiosk, at: [17.2, 24.8], yaw: FACE_CAMERA, datum: true },
    { kind: 'display', display: 'board', rects: ['picto.head', 'picto.eye', 'picto.ear', 'picto.gloves', 'picto.overhead'],
      at: [21.4, 22.6], yaw: FACE_CAMERA, size: [2.4, 0.7], posts: 1.0 },
    { kind: 'piece', key: 'ironworks-coils', build: coilRow, at: [16.6, 15.6], yaw: FACE_LEFT },
    { kind: 'piece', key: 'ironworks-plates', build: plateStack, at: [20.2, 18.0], yaw: 0.2 },
    { kind: 'piece', key: 'ironworks-firebrick', build: firebrickPallet, at: [22.6, 16.0], yaw: 0.1 },
    { kind: 'piece', key: 'ironworks-firebrick', build: firebrickPallet, at: [23.9, 16.4], yaw: -0.05 },
    { kind: 'prop', name: 'forklift', at: [23.4, 12.4], yaw: FACE_CAMERA + 0.3 },
    { kind: 'prop', name: 'pallet', at: [21.4, 14.0], yaw: 0.05 },
    // the rail spur past the kiosk: flush rails, a slag pot on its carrier and the shunter
    { kind: 'piece', key: 'ironworks-rail-8', build: flushRail(8), at: [17.6, 34.0], yaw: FACE_CAMERA, datum: true },
    { kind: 'piece', key: 'ironworks-rail-8', build: flushRail(8), at: [17.6, 42.0], yaw: FACE_CAMERA, datum: true },
    { kind: 'piece', key: 'ironworks-slag-pot', build: slagPotCarrier, at: [17.6, 33.8], yaw: FACE_CAMERA, datum: true, y: 0.05 },
    { kind: 'piece', key: 'ironworks-shunter', build: shunter, at: [17.6, 41.2], yaw: FACE_CAMERA, datum: true, y: 0.05 },
    // the elevated control pulpit left of the bay, its console's screens, the media board, the PPE station, heat screens
    { kind: 'piece', key: 'ironworks-pulpit', build: controlPulpit, at: [-18.6, 16.4], yaw: FACE_CAMERA },
    { kind: 'display', display: 'station', at: [-18.6, 17.0], yaw: FACE_CAMERA, y: PULPIT_FLOOR,
      screens: ['readout.modules.t90', 'map.foundry', 'readout.armor.abrams'], width: 2.4 },
    { kind: 'display', display: 'board', rects: ['media.foundry', 'media.railyard', 'media.urban'], at: [-14.6, 11.6],
      yaw: FACE_CAMERA + 0.25, size: [2.8, 1.0], posts: 0.9 },
    { kind: 'piece', key: 'ironworks-ppe', build: ppeStation, at: [-22.0, 13.0], yaw: FACE_CAMERA },
    { kind: 'piece', key: 'ironworks-heat-screens', build: heatScreens, at: [-16.2, 8.2], yaw: FACE_CAMERA + 0.4 },
    { kind: 'prop', name: 'extinguisher', at: [-19.6, 13.4], yaw: 0 },
    // the scrap yard: the magnet handler working the pile (the signature), a skip and the gas cage
    { kind: 'piece', key: 'ironworks-scrap', build: scrapPile, at: [-29.6, 13.6], yaw: 0.3 },
    { kind: 'crane', crane: 'magnet', at: [-25.2, 9.4], yaw: 0, params: { slew: -1.5, reach: 6.4 } },
    { kind: 'prop', name: 'skip', at: [-31.0, 6.0], yaw: FACE_CAMERA },
    { kind: 'prop', name: 'gasCage', at: [-14.8, 4.8], yaw: FACE_RIGHT },
    // the oil store by the bay's left front: the bunded rack, the spill kit
    { kind: 'prop', name: 'oilRack', at: [-24.8, 20.6], yaw: FACE_CAMERA },
    { kind: 'prop', name: 'spillBin', at: [-22.4, 21.4], yaw: FACE_CAMERA },
    // the shelters' flanks beside the turntable (the facility's primitive stations there gave way to these)
    { kind: 'prop', name: 'gasCage', at: [15.5, -4.3], yaw: -FACE_CAMERA },
    { kind: 'prop', name: 'pallet', at: [-12.6, -8.8], yaw: 0.2 },
    { kind: 'prop', name: 'drum200', at: [-12.9, -8.6], yaw: 0.4, y: 0.14, blot: false },
    { kind: 'prop', name: 'drum200', at: [-12.3, -9.1], yaw: 1.3, y: 0.14, blot: false },
    { kind: 'prop', name: 'drum200', at: [-12.2, -8.4], yaw: 2.2, y: 0.14, blot: false },
    // the works gate on the yard's right: its fence, the gate road through it, the nameboard
    { kind: 'piece', key: 'ironworks-gate-10', build: worksGate(10), at: [33.0, 12.0], yaw: FACE_RIGHT },
    { kind: 'wall', wall: 'heras', points: [[33.0, -4.0], [33.0, 6.4]], params: { mural: 'brand.banner.h', muralEvery: 4 } },
    { kind: 'wall', wall: 'heras', points: [[33.0, 17.6], [33.0, 26.0]] },
    { kind: 'display', display: 'nameboard', at: [29.4, 4.6], yaw: FACE_LEFT + 0.3, width: 2.6, posts: 1.1 },
    { kind: 'sign', sign: 'post', rect: 'picto.speed10', at: [29.0, 18.4], yaw: FACE_LEFT, size: [0.6, 0.6] },
    // an oil stain where the forklift stands
    { kind: 'sign', sign: 'stencil', rect: 'decal.oil', at: [22.6, 13.6], yaw: 0.6, size: [1.6, 1.4] },
  ],
  atmosphere: {
    drift: 0.018,
    cards: [
      // smoke from the works stack beside the bay and from the furnace block's two stacks; steam off the cooling tower
      ...atmospherePlume(world(20.6, 18.3, 30.4), 12, 2.2, 'smoke', 0.9, 6),
      ...atmospherePlume(polar(BEARING.stackA, 92, 25.5), 18, 3.4, 'smoke', 0.9, 6),
      ...atmospherePlume(polar(BEARING.stackB + 4 * DEG, 88, 24), 16, 3.0, 'smoke', 0.9, 5),
      ...atmospherePlume(polar(BEARING.furnace, 84, 25.4), 9, 2.4, 'steam', 0.9, 4),
      ...atmospherePlume(polar(258 * DEG, 96, 12.4), 14, 6.0, 'steam', 1.2, 5),
      ...atmospherePlume(polar(196 * DEG, 90, 23), 12, 2.6, 'smoke', 1.0, 5),
      // soot haze lying over the works either side of the opening view
      atmosphereBand(polar(150 * DEG, 70, 0), polar(185 * DEG, 74, 0), 10, 'smoke', 0.3),
      atmosphereBand(polar(268 * DEG, 72, 0), polar(320 * DEG, 66, 0), 9, 'smoke', 0.6),
      atmosphereBand(polar(20 * DEG, 76, 0), polar(70 * DEG, 80, 0), 11, 'smoke', 0.1),
    ],
  },
};
