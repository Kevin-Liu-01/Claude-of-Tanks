import { KitBuilder, type KitVec } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';
import { atmosphereBand, atmospherePlume } from './garageAtmosphereKit.ts';
import { mapBearing, type GarageSkyline, type GarageSkylineEmitter } from './garageSkylineKit.ts';
import { garageViewPoint } from '../game/garagePresentationPose.ts';

/**
 * Cinder Deployment (rail_roundhouse; garage r9, the per-garage brief 6): a brick engine shed and turntable on a Ruhr /
 * Upper Silesian coalfield junction. Headframes, spoil tips, ballast and steam.
 *
 * - The kit: a rail breakdown crane at work on the left siding, lifting a turret off its cribbing; a brick-and-timber
 *   signal box at the throat (its desk's screens in the window band); semaphore signals; Prussian buffer stops at the
 *   sidings' ends; point levers with their weights; the ash pit with its cinder heaps, the rail and sleeper stacks and
 *   the oil-lamp stand; a platform with its canopy.
 * - Displays: the station nameboard CINDER JUNCTION in white on blue enamel on its posts at the throat, the slideshow
 *   on the platform canopy, enamel pictogram signs, three station poster frames on the yard hoarding, the brand's PVC
 *   banner and a column banner, the signal box's desk (readouts and the Cinder Junction map).
 * - The skyline (K10) is the map's own, at its bearings from the spawn: the colliery headframe with its twin sheave
 *   wheels and winding house at the works, the miners' colony's brick terraces, the station with its clock tower, the
 *   wagon rows in the yard's sidings, the coal stage, the brick signal box and semaphores at the west throat, the water
 *   towers, the flat-topped spoil bank and the conical spoil tip with sparse birch; past the map's south edge (where the
 *   opening view looks) the coalfield's moor, allotments and a brickworks chimney.
 */

const FACE_CAMERA = Math.PI / 4;
const FACE_LEFT = -Math.PI / 4;

const SOOT = 0x262728, BRICK = 0x6a3a2c, ENGINEERING = 0x3a2a26, TIMBER = 0x3b3027, RAIL = 0x4a4643, RAIL_HEAD = 0x8c8a86;
const GAUGE = 1.435;

// ------------------------------------------------------------------ signature pieces

/** A length of track on a ballast bed: crowned ballast with sloped shoulders, timber sleepers, chaired rails. */
function trackStub(length: number, ballast = true) {
  return (b: KitBuilder): void => {
    if (ballast) {
      b.polygon([[-2.1, 0.0, -length / 2], [2.1, 0.0, -length / 2], [1.55, 0.24, -length / 2], [-1.55, 0.24, -length / 2]], 0x4a4540, [0, 0, -1]);
      b.polygon([[-2.1, 0.0, length / 2], [-1.55, 0.24, length / 2], [1.55, 0.24, length / 2], [2.1, 0.0, length / 2]], 0x4a4540, [0, 0, 1]);
      for (const s of [-1, 1]) b.polygon([[s * 2.1, 0, -length / 2], [s * 2.1, 0, length / 2], [s * 1.55, 0.24, length / 2], [s * 1.55, 0.24, -length / 2]], 0x47423d, [s, 1, 0]);
      b.polygon([[-1.55, 0.24, -length / 2], [-1.55, 0.24, length / 2], [1.55, 0.24, length / 2], [1.55, 0.24, -length / 2]], 0x3e3a36, [0, 1, 0]);
    }
    const base = ballast ? 0.24 : 0.0;
    for (let z = -length / 2 + 0.33; z < length / 2; z += 0.65) b.box(0, base + 0.07, z, 2.5, 0.14, 0.24, TIMBER, { bevel: 0, noBottom: true });
    for (const x of [-GAUGE / 2, GAUGE / 2]) {
      b.box(x, base + 0.17, 0, 0.12, 0.05, length, RAIL, { bevel: 0, noBottom: true }); // the chairs' line and the foot
      b.box(x, base + 0.24, 0, 0.03, 0.1, length, RAIL, { bevel: 0, noBottom: true }); // the web
      b.box(x, base + 0.305, 0, 0.07, 0.035, length, RAIL_HEAD, { bevel: 0, noBottom: true }); // the head, polished bright
    }
  };
}

/** A Prussian rail-built buffer stop on its stub: bent rail struts, the timber beam in red and white, two buffers, a lamp. */
function bufferStop(b: KitBuilder): void {
  trackStub(4.0)(b);
  const top = 0.24 + 0.3;
  for (const x of [-GAUGE / 2, GAUGE / 2]) {
    b.beam([x, top, 1.6], [x, 1.25, 1.85], 0.1, 0.12, RAIL, { bevel: 0 }); // the rail bent up
    b.beam([x, top, -0.6], [x, 1.2, 1.7], 0.1, 0.12, RAIL, { bevel: 0 }); // its strut
  }
  b.box(0, 1.18, 1.86, 2.6, 0.42, 0.32, 0x8a2e24, { bevel: 0.02 });
  for (let k = 0; k < 4; k += 1) b.box(-0.9 + k * 0.6, 1.18, 2.03, 0.3, 0.4, 0.01, 0xd8d6cc, { bevel: 0, noBottom: true });
  for (const x of [-0.88, 0.88]) {
    b.cylinder(x, 1.06, 1.7, 0.17, 0.3, 10, 0x2a2b2c, { axis: 'z' });
    b.cylinder(x, 1.06, 1.36, 0.22, 0.05, 10, 0x2a2b2c, { axis: 'z' });
  }
  b.box(0, 1.55, 1.86, 0.2, 0.3, 0.2, SOOT, { bevel: 0.01 });
  b.face([-0.07, 1.47, 1.97], [0.07, 1.47, 1.97], [0.07, 1.61, 1.97], [-0.07, 1.61, 1.97], garageDisplayRect('glow.red'));
}

/** A point lever on its sleepers: the cast stand, the lever with its counterweight ball, the rodding run. */
function pointLever(b: KitBuilder): void {
  for (const z of [-0.3, 0.3]) b.box(0, 0.06, z, 1.6, 0.12, 0.22, TIMBER, { bevel: 0, noBottom: true });
  b.box(0, 0.24, 0, 0.5, 0.24, 0.4, SOOT, { bevel: 0.02 });
  b.beam([0, 0.3, 0], [0.42, 1.0, 0.05], 0.05, 0.05, 0xd8d6cc, { bevel: 0 });
  b.lathe(0.47, 1.0, 0.05, [[0, -0.1], [0.1, -0.05], [0.1, 0.05], [0, 0.1]], 8, 0x1c1c1c);
  b.box(-0.9, 0.12, 0, 1.4, 0.05, 0.05, RAIL, { bevel: 0, noBottom: true }); // the rodding toward the switch
}

/** A semaphore signal: lattice post on its base, two arms (the home arm at danger, the distant lowered), spectacles,
 * the ladder and the lamp stage, a finial, its wires down to the ground. */
function semaphore(b: KitBuilder): void {
  b.box(0, 0.25, 0, 0.9, 0.5, 0.9, 0x6c6a66, { bevel: 0.02, noBottom: true });
  const h = 7.2;
  for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [0.14, 0.14], [-0.14, 0.14]] as const) b.beam([x * 1.6, 0.5, z * 1.6], [x, h, z], 0.05, 0.05, SOOT, { bevel: 0 });
  for (let k = 0; k < 7; k += 1) {
    const y = 1.0 + k * 0.9, s = 0.2 - (y / h) * 0.07;
    b.beam([-s, y, s], [s, y + 0.45, s], 0.025, 0.025, SOOT, { bevel: 0 });
    b.beam([s, y + 0.45, -s], [-s, y + 0.9, -s], 0.025, 0.025, SOOT, { bevel: 0 });
  }
  b.lathe(0, h, 0, [[0.12, 0], [0.12, 0.08], [0.06, 0.22], [0, 0.4]], 8, 0xd8d6cc); // the finial
  // the home arm at danger and the distant arm lowered to clear, each with its spectacle
  for (const [y, angle, tone] of [[h - 0.6, 0, 0xa8302a], [h - 2.4, -0.7, 0xc49a2a]] as const) {
    b.push().translate(0.1, y, 0.16).rotateZ(angle);
    b.box(0.75, 0, 0, 1.5, 0.26, 0.03, tone, { bevel: 0.006 });
    b.box(1.25, 0, 0.018, 0.12, 0.27, 0.005, 0xd8d6cc, { bevel: 0, noBottom: true });
    b.box(0.05, -0.12, -0.03, 0.26, 0.3, 0.03, SOOT, { bevel: 0 });
    b.pop();
  }
  b.box(0, h - 3.4, 0.36, 0.7, 0.04, 0.5, SOOT, { bevel: 0 }); // the lamp stage
  b.box(-0.12, h - 3.1, 0.36, 0.2, 0.3, 0.2, SOOT, { bevel: 0.01 });
  b.face([-0.19, h - 3.15, 0.465], [-0.05, h - 3.15, 0.465], [-0.05, h - 3.01, 0.465], [-0.19, h - 3.01, 0.465], garageDisplayRect('glow.warm'));
  for (const x of [-0.25, 0.25]) b.box(x, (h - 3.4) / 2 + 0.5, 0.22, 0.03, h - 3.4 - 1.0, 0.03, SOOT, { bevel: 0 }); // the ladder's stiles
  for (let y = 1.2; y < h - 3.4; y += 0.32) b.box(0, y, 0.22, 0.5, 0.025, 0.025, SOOT, { bevel: 0 });
  b.tube([[0.18, 0.5, 0.0], [0.6, 0.2, 0.3], [1.6, 0.12, 0.4]], 0.01, 3, 0x3a3a38); // the signal wires leaving the base
}

/** The ash pit: a brick-lined pit between the rails of its stub, cinder heaps beside it, a barrow and shovels. */
function ashPit(b: KitBuilder): void {
  for (const x of [-1.4, 1.4]) b.box(x, 0.08, 0, 0.36, 0.16, 6.0, ENGINEERING, { bevel: 0.01, noBottom: true });
  b.box(0, 0.01, 0, 2.5, 0.02, 6.0, 0x161514, { bevel: 0, noBottom: true }); // the pit's dark mouth
  for (const x of [-GAUGE / 2, GAUGE / 2]) b.box(x, 0.24, 0, 0.07, 0.1, 6.0, RAIL_HEAD, { bevel: 0, noBottom: true });
  for (const [x, z, r, h] of [[3.0, -1.2, 1.5, 0.9], [3.4, 1.4, 1.1, 0.65], [-3.0, 0.6, 1.2, 0.7]] as const) {
    b.lathe(x, 0, z, [[r, 0], [r * 0.7, h * 0.55], [r * 0.25, h * 0.92], [0, h]], 10, [0x2a2826, 0x353230, 0x403b37]);
  }
  // the barrow and two shovels
  b.box(-3.0, 0.5, -1.6, 0.6, 0.3, 0.9, 0x3a3c3e, { bevel: 0.02 });
  b.cylinder(-3.0, 0.2, -2.1, 0.2, 0.08, 8, SOOT, { axis: 'x' });
  for (const z of [-1.2, -2.0]) b.beam([-3.0, 0.42, z], [-3.4, 0.5, z + 0.6], 0.03, 0.03, 0x5a4a34, { bevel: 0 });
  b.beam([2.2, 0.05, -2.6], [2.5, 1.1, -2.4], 0.03, 0.03, 0x5a4a34, { bevel: 0 });
  b.box(2.2, 0.08, -2.62, 0.22, 0.02, 0.28, 0x3a3c3e, { bevel: 0 });
}

/** A rail and sleeper store: rails racked on timber bearers and a criss-cross stack of creosoted sleepers. */
function railStore(b: KitBuilder): void {
  for (const x of [-2.4, 0, 2.4]) b.box(x, 0.1, 0, 0.25, 0.2, 2.0, TIMBER, { bevel: 0, noBottom: true });
  for (let layer = 0; layer < 2; layer += 1) {
    for (let k = 0; k < 5; k += 1) {
      b.box(0, 0.25 + layer * 0.16, -0.7 + k * 0.35, 6.4, 0.14, 0.08, RAIL, { bevel: 0, noBottom: true });
    }
  }
  for (let layer = 0; layer < 6; layer += 1) {
    for (let k = 0; k < 3; k += 1) {
      const along = layer % 2 === 0;
      b.box(4.6 + (along ? 0 : -0.55 + k * 0.55), 0.08 + layer * 0.15, along ? -0.55 + k * 0.55 : 0, along ? 2.6 : 0.25, 0.14, along ? 0.25 : 2.6, TIMBER, { bevel: 0 });
    }
  }
}

/** The oil-lamp stand: a timber rack with tail lamps and oil cans, a drum beside it. */
function lampStand(b: KitBuilder): void {
  for (const x of [-0.7, 0.7]) b.box(x, 0.6, 0, 0.08, 1.2, 0.4, TIMBER, { bevel: 0 });
  for (const y of [0.45, 0.95]) b.box(0, y, 0, 1.5, 0.04, 0.42, TIMBER, { bevel: 0 });
  for (let k = 0; k < 4; k += 1) {
    const x = -0.5 + k * 0.33;
    b.box(x, 1.08, 0, 0.18, 0.22, 0.16, SOOT, { bevel: 0.01 });
    b.face([x - 0.06, 1.04, 0.081], [x + 0.06, 1.04, 0.081], [x + 0.06, 1.14, 0.081], [x - 0.06, 1.14, 0.081], garageDisplayRect(k % 2 ? 'glow.red' : 'glow.warm'));
    b.lathe(x, 0.47, 0, [[0.07, 0], [0.07, 0.2], [0.02, 0.27], [0, 0.27]], 6, 0x5a5048);
  }
}

/**
 * The signal box at the throat: a brick locking room with its arched windows, the timber operating floor above with
 * its continuous window band (mullions, no panes, so the desk's screens read from the yard), a hipped slate roof with a
 * finial and its stove pipe, the external stair and landing. The desk is the 'station' item placed on the floor. Front +Z.
 */
const BOX_FLOOR = 3.0;
function signalBox(b: KitBuilder): void {
  const w = 5.0, d = 3.4, floor = BOX_FLOOR, top = floor + 2.6;
  b.surfaceBox('stone', 0, floor / 2, 0, w, floor, d, 1.2, { noTop: true }); // the brick locking room
  b.box(0, 0.15, 0, w + 0.12, 0.3, d + 0.12, ENGINEERING, { bevel: 0.01, noBottom: true });
  for (const x of [-1.4, 0, 1.4]) b.box(x, 1.6, d / 2 + 0.01, 0.7, 1.1, 0.02, 0x1f2326, { bevel: 0 });
  b.box(0, floor, 0, w + 0.3, 0.16, d + 0.3, TIMBER, { bevel: 0.01 }); // the floor's sill
  // the operating floor: timber corner posts, the low boarded wall, the window band's mullions and head
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const) b.box(x, floor + 1.3, z, 0.14, 2.6, 0.14, 0x4f3a2a, { bevel: 0 });
  b.box(0, floor + 0.5, d / 2, w, 0.9, 0.08, 0x5a4532, { bevel: 0 });
  for (const s of [-1, 1]) b.box(s * w / 2, floor + 0.5, 0, 0.08, 0.9, d, 0x5a4532, { bevel: 0 });
  b.box(0, floor + 1.3, -d / 2, w, 2.6, 0.08, 0x5a4532, { bevel: 0 });
  for (let k = 0; k <= 6; k += 1) b.box(-w / 2 + k * (w / 6), floor + 1.55, d / 2 + 0.02, 0.05, 1.3, 0.05, 0xd8d0bc, { bevel: 0 });
  for (const y of [floor + 0.95, floor + 2.2]) b.box(0, y, d / 2 + 0.03, w, 0.06, 0.06, 0xd8d0bc, { bevel: 0 });
  for (const s of [-1, 1]) for (let k = 0; k <= 4; k += 1) b.box(s * (w / 2 + 0.02), floor + 1.55, -d / 2 + k * (d / 4), 0.05, 1.3, 0.05, 0xd8d0bc, { bevel: 0 });
  b.box(0, top - 0.25, 0, w + 0.1, 0.5, d + 0.1, 0x5a4532, { bevel: 0 }); // the frieze under the eaves
  // the hipped slate roof
  const e = 0.45, rx = w / 2 + e, rz = d / 2 + e, ridge = 1.2;
  b.polygon([[-rx, top, rz], [rx, top, rz], [rx * 0.4, top + ridge, 0], [-rx * 0.4, top + ridge, 0]], 0x3d4247, [0, 1, 1]);
  b.polygon([[rx, top, -rz], [-rx, top, -rz], [-rx * 0.4, top + ridge, 0], [rx * 0.4, top + ridge, 0]], 0x3a3f44, [0, 1, -1]);
  b.polygon([[rx, top, rz], [rx, top, -rz], [rx * 0.4, top + ridge, 0]], 0x41464b, [1, 1, 0]);
  b.polygon([[-rx, top, -rz], [-rx, top, rz], [-rx * 0.4, top + ridge, 0]], 0x41464b, [-1, 1, 0]);
  b.box(0, top + ridge + 0.06, 0, rx * 0.8 + 0.1, 0.1, 0.12, 0x2e3236, { bevel: 0 });
  b.cylinder(-1.2, top + 0.4, -0.8, 0.07, 1.4, 6, SOOT); // the stove pipe
  b.face([-w / 2 + 0.2, top - 0.42, d / 2 + 0.065], [-w / 2 + 2.3, top - 0.42, d / 2 + 0.065], [-w / 2 + 2.3, top - 0.08, d / 2 + 0.065], [-w / 2 + 0.2, top - 0.08, d / 2 + 0.065], garageDisplayRect('name.railyard'));
  // the stair up the right side to a landing at the door
  for (let k = 0; k < 10; k += 1) {
    const t = k / 9;
    b.box(w / 2 + 0.55, 0.15 + t * (floor - 0.3), d / 2 - 0.2 - t * 2.6, 0.8, 0.04, 0.26, TIMBER, { bevel: 0 });
  }
  for (const x of [w / 2 + 0.15, w / 2 + 0.95]) b.beam([x, 0.05, d / 2 - 0.1], [x, floor, -d / 2 + 0.6], 0.04, 0.2, 0x4f3a2a, { bevel: 0 });
  b.beam([w / 2 + 0.98, 1.0, d / 2 - 0.1], [w / 2 + 0.98, floor + 1.0, -d / 2 + 0.6], 0.04, 0.04, 0xd8d0bc, { bevel: 0 });
  b.box(w / 2 + 0.55, floor - 0.05, -d / 2 + 0.3, 0.9, 0.08, 0.8, TIMBER, { bevel: 0 });
}

/** The platform at the throat: a coped platform edge, its surface, cast-iron columns and a ridge canopy with its
 * valance; the slideshow hangs from the canopy's beam (the shared kit's column mount at the frame's origin). Front +Z. */
function platformCanopy(b: KitBuilder): void {
  const len = 12, w = 3.4, deck = 0.9;
  b.box(0, deck / 2, -len / 2 + 1.0, w, deck, len, 0x6c6a66, { bevel: 0.02, noBottom: true }); // the platform
  b.box(w / 2 - 0.2, deck + 0.03, -len / 2 + 1.0, 0.5, 0.06, len, 0x8a8880, { bevel: 0.01 }); // the coping
  b.box(w / 2 - 0.62, deck + 0.004, -len / 2 + 1.0, 0.1, 0.01, len, 0xc4a24a, { bevel: 0, noBottom: true }); // the edge line
  const roofY = 4.3;
  for (let k = 0; k < 3; k += 1) {
    const z = 0.2 - k * 4.5;
    b.lathe(0, deck, z, [[0.14, 0], [0.09, 0.25], [0.08, roofY - deck - 0.4], [0.16, roofY - deck]], 8, 0x2a3a34);
    b.beam([-1.8, roofY, z], [1.8, roofY + 0.5, z], 0.12, 0.18, 0x2a3a34, { bevel: 0 });
  }
  for (const s of [-1, 1]) {
    const x0 = s * 0.05, x1 = s * 2.2;
    b.polygon([[x0, roofY + 0.75, 1.4], [x1, roofY + 0.3, 1.4], [x1, roofY + 0.3, -len + 1.6], [x0, roofY + 0.75, -len + 1.6]], 0x4a4f52, [0, 1, 0]);
    b.box(x1, roofY + 0.05, -len / 2 + 1.5, 0.04, 0.5, len + 0.2, 0xd8d0bc, { bevel: 0, noBottom: true }); // the valance
  }
}

/** A timber poster hoarding: boards on posts carrying the three station poster frames (the frames are print items). */
function hoarding(b: KitBuilder): void {
  for (const x of [-3.4, 0, 3.4]) b.box(x, 1.3, -0.08, 0.12, 2.6, 0.12, TIMBER, { bevel: 0, noBottom: true });
  b.box(0, 1.55, -0.03, 7.0, 1.9, 0.04, 0x4a3a2c, { bevel: 0 });
  b.box(0, 2.6, 0.0, 7.2, 0.08, 0.16, TIMBER, { bevel: 0 });
}

/** Timber packing under the breakdown crane's four outrigger mats (the crane stands on its rails, 0.32 m up). */
function outriggerPacking(b: KitBuilder): void {
  for (const x of [-3.0, 3.0]) for (const z of [-2.2, 2.2]) {
    for (let layer = 0; layer < 2; layer += 1) {
      b.box(x, 0.08 + layer * 0.16, z, layer ? 1.0 : 0.3, 0.16, layer ? 0.3 : 1.0, TIMBER, { bevel: 0 });
      b.box(x + (layer ? 0 : 0.4), 0.08 + layer * 0.16, z + (layer ? 0.4 : 0), layer ? 1.0 : 0.3, 0.16, layer ? 0.3 : 1.0, TIMBER, { bevel: 0 });
    }
  }
}

/** Timber cribbing under the breakdown crane's lift: a criss-cross stack the turret is being lifted off. */
function cribbing(b: KitBuilder): void {
  for (let layer = 0; layer < 3; layer += 1) {
    for (let k = 0; k < 3; k += 1) {
      const along = layer % 2 === 0;
      b.box(along ? 0 : -0.7 + k * 0.7, 0.08 + layer * 0.16, along ? -0.7 + k * 0.7 : 0, along ? 2.4 : 0.28, 0.15, along ? 0.28 : 2.4, TIMBER, { bevel: 0 });
    }
  }
}

// ------------------------------------------------------------------ the skyline (K10)

const ANCHOR = [-40, -400] as const; // alpha's spawn south of the yard (garageTerrainPatches.generated.ts)
const BEARING = {
  headframe: mapBearing(ANCHOR, [178, -144]), // the southern works (the pit) and its stack
  colony: mapBearing(ANCHOR, [240, -165]), // the miners' rowhouses past the works gate
  station: mapBearing(ANCHOR, [-4, -44]), // the station building on the square's south side
  yard: mapBearing(ANCHOR, [-40, -10]), // the sidings between the throats
  coalStage: mapBearing(ANCHOR, [-120, 38]),
  signalBox: mapBearing(ANCHOR, [-150, -10]), // the west throat
  waterTowerW: mapBearing(ANCHOR, [-196, 24]),
  waterTowerE: mapBearing(ANCHOR, [196, -24]),
  spoilBank: mapBearing(ANCHOR, [-176, -160]),
  spoilTip: mapBearing(ANCHOR, [-322, -238]),
} as const;
const DEG = Math.PI / 180;

function cinderSkylineBuild(e: GarageSkylineEmitter): void {
  // the colliery headframe: two legs and the back stay in steel, the twin sheave wheels at the top, the winding house
  {
    const r = 82, at = e.frame(BEARING.headframe, r), haze = e.hazeAt(r);
    e.accent = true;
    for (const x of [-2.4, 2.4]) e.strut(at, [x, e.foot, 0], [x * 0.55, 22, 2], 0.7, 0x3d4042, haze);
    e.strut(at, [0, e.foot, 12], [0, 21.5, 2.6], 0.9, 0x3d4042, haze); // the back stay
    for (let k = 1; k < 5; k += 1) e.strut(at, [-2.4 + k * 0.38, k * 4.6, k * 0.4], [2.4 - k * 0.38, k * 4.6, k * 0.4], 0.3, 0x3d4042, haze);
    for (const x of [-1.0, 1.0]) {
      const wheel = e.frame(BEARING.headframe + x * 0.012, r + 1.6);
      for (let k = 0; k < 10; k += 1) {
        const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
        e.strut(wheel, [Math.cos(a0) * 2.0, 23 + Math.sin(a0) * 2.0, 0], [Math.cos(a1) * 2.0, 23 + Math.sin(a1) * 2.0, 0], 0.25, 0x2a2c2e, haze);
      }
      e.strut(wheel, [-2, 23, 0], [2, 23, 0], 0.12, 0x2a2c2e, haze);
      e.strut(wheel, [0, 21, 0], [0, 25, 0], 0.12, 0x2a2c2e, haze);
    }
    e.accent = false;
    e.box(at, -5, 5, 10, 18, 9, BRICK, 0x3e4246, haze, { flat: false }); // the winding house
    e.gable(at, -5.3, 5.3, 9.7, 18.3, 9, 11.6, BRICK, 0x45494c, haze);
    e.windows(at, -4.4, 4.4, 10, 2, 8.6, haze, 2.2, 3.2, 0x2c3339, [1.0, 2.0]);
    e.accent = true;
    e.lathe(at, 9, 20, [[1.5, e.foot], [1.15, 21], [1.25, 22], [1.0, 22]], [0x6e4434, 0x2a2624, 0x1c1a19], haze * 0.9, 8);
    e.accent = false;
    e.box(at, -14, -6, 4, 14, 7.5, 0x5d6064, 0x3a3d40, haze); // the washery
  }
  // the miners' colony: two rows of brick terraces with their chimney stacks
  {
    const r = 92, haze = e.hazeAt(r);
    for (const [db, dz] of [[-3, 0], [3.5, 7]] as const) {
      const at = e.frame(BEARING.colony + db * DEG, r + dz);
      e.box(at, -15, 15, 0, 7, 6.2, 0x7a4a3a, 0x3e4246, haze, { flat: false });
      e.gable(at, -15.3, 15.3, -0.3, 7.3, 6.2, 8.6, 0x7a4a3a, 0x4a3a34, haze);
      e.windows(at, -15, 15, 0, 1.0, 6.0, haze, 2.5, 2.8, 0x2c3034, [0.9, 1.3]);
      for (let k = -2; k <= 2; k += 1) e.box(at, k * 6 - 0.35, k * 6 + 0.35, 3.2, 3.9, 9.6, 0x5a3a2c, 0x2a2624, haze);
    }
  }
  // the station: the hall with its clock tower
  {
    const r = 88, at = e.frame(BEARING.station, r), haze = e.hazeAt(r);
    e.box(at, -14, 14, 0, 10, 8, 0x8a6a54, 0x3e4246, haze, { flat: false });
    e.gable(at, -14.3, 14.3, -0.3, 10.3, 8, 11, 0x8a6a54, 0x45494c, haze);
    e.windows(at, -13.5, 13.5, 0, 1.4, 7.4, haze, 2.6, 3.2, 0x2c3339, [1.2, 2.2]);
    e.accent = true;
    e.box(at, -2, 2, -0.6, 3.4, 17, 0x8a6a54, 0x45494c, haze, { flat: false });
    e.prism(at, 0, 1.4, 2.4, 17, 0x4a4f55, 0x3a3f44, haze, 4, 17, { rise: 3.2 });
    e.panel(at, -1.0, 1.0, -0.6, 14.4, 16.0, 0xe4dcc8, haze * 0.7); // the clock face
    e.accent = false;
  }
  // wagon rows in the sidings: coal opens, vans and tank wagons, buffer to buffer
  for (const [db, r, kinds] of [[-14, 66, 'oovto'], [-4, 70, 'votoo'], [8, 74, 'ootvo'], [18, 72, 'ovoot']] as const) {
    let x = -16;
    for (const kind of kinds) {
      const at = e.frame(BEARING.yard + db * DEG, r), haze = e.hazeAt(r);
      if (kind === 'o') { // a coal open heaped with coal
        e.box(at, x, x + 6.6, 0, 2.7, 3.0, 0x4a3a30, 0x1e1c1a, haze);
        e.quad([at(x + 0.3, 3.0, 0.3), at(x + 6.3, 3.0, 0.3), at(x + 5.6, 3.6, 1.35), at(x + 1.0, 3.6, 1.35)], 0x1a1918, haze);
      } else if (kind === 'v') { // a van
        e.box(at, x, x + 7, 0, 2.7, 3.6, 0x6a3a2c, 0x5a5550, haze, { flat: false });
        e.gableEnd(at, x, x + 7, 0, 2.7, 3.6, 4.0, 0x6a3a2c, 0x5a5550, haze);
      } else { // a tank wagon
        e.box(at, x, x + 7, 0.8, 1.9, 1.2, 0x2a2b2c, 0x2a2b2c, haze);
        e.strut(at, [x + 0.4, 2.4, 1.35], [x + 6.6, 2.4, 1.35], 2.2, 0x2e3032, haze);
      }
      x += 7.3;
    }
  }
  // the coal stage: brick piers carrying the coaling road, the tubs' chutes
  {
    const r = 74, at = e.frame(BEARING.coalStage, r), haze = e.hazeAt(r);
    for (const x of [-9, -3, 3, 9]) e.box(at, x - 0.6, x + 0.6, 0, 6, 5.2, BRICK, 0x3a2a26, haze);
    e.box(at, -10, 10, -0.2, 6.2, 6.4, 0x4a3a30, 0x1e1c1a, haze);
    e.box(at, -8, 8, 0.4, 5.4, 9.5, 0x5a4a3c, 0x3e3a36, haze, { flat: false });
    e.gable(at, -8.3, 8.3, 0.1, 5.7, 9.5, 11.4, 0x5a4a3c, 0x3e4246, haze);
    for (const x of [-6, -2, 2, 6]) e.quad([at(x - 0.4, 6.4, -0.2), at(x + 0.4, 6.4, -0.2), at(x + 0.4, 4.4, -1.6), at(x - 0.4, 4.4, -1.6)], 0x2a2b2c, haze);
  }
  // the signal box at the west throat and its semaphores
  {
    const r = 64, at = e.frame(BEARING.signalBox, r), haze = e.hazeAt(r);
    e.box(at, -3, 3, 0, 4, 3.2, BRICK, 0x3e4246, haze);
    e.box(at, -3.1, 3.1, -0.1, 4.1, 5.8, 0x5a4532, 0x3e4246, haze, { flat: false });
    e.panel(at, -3.0, 3.0, -0.1, 3.6, 5.2, 0xc8c0a8, haze * 0.8);
    for (let k = 0; k <= 6; k += 1) e.panel(at, -3 + k - 0.05, -3 + k + 0.05, -0.12, 3.6, 5.2, 0x4f3a2a, haze);
    e.gable(at, -3.6, 3.6, -0.6, 4.6, 5.8, 7.4, 0x5a4532, 0x3d4247, haze);
    e.accent = true;
    for (const [db, dr] of [[-5, -2], [4, 3], [9, -1]] as const) {
      const post = e.frame(BEARING.signalBox + db * DEG, r + dr);
      e.strut(post, [0, e.foot, 0], [0, 9.5, 0], 0.32, 0x2a2b2c, haze);
      e.strut(post, [0.1, 8.6, 0], [1.9, 8.6, 0], 0.32, 0xa8302a, haze);
      e.strut(post, [0.1, 6.8, 0], [1.6, 5.9, 0], 0.3, 0xc49a2a, haze);
    }
    e.accent = false;
  }
  // the water towers on their trestles
  e.accent = true;
  for (const [bearing, r] of [[BEARING.waterTowerW, 96], [BEARING.waterTowerE, 100]] as const) {
    const at = e.frame(bearing, r), haze = e.hazeAt(r);
    for (const [lx, lz] of [[-2.2, 1], [2.2, 1], [-2.2, 5], [2.2, 5]] as const) e.strut(at, [lx, e.foot, lz], [lx * 0.8, 11, lz * 0.9 + 0.3], 0.5, 0x4a3e34, haze);
    e.lathe(at, 0, 3, [[3.4, 11], [3.4, 15.4], [3.0, 16.0], [0, 16.8]], [0x6b5a48, 0x4a3e34, 0x3e3a36], haze, 12);
  }
  e.accent = false;
  // the spoil bank (flat-topped where the tipping track ran) and the conical spoil tip with its sparse birch
  e.mound(e.frame(BEARING.spoilBank, 84), 0, 8, 30, 10.8, 14, [0x2e2b29, 0x363230, 0x2f2c2a, 0x2a2826], e.hazeAt(84), 14, 0.06, 0.55);
  {
    const r = 104, at = e.frame(BEARING.spoilTip, r), haze = e.hazeAt(r);
    e.mound(at, 0, 10, 34, 13.0, 0, [0x2c2a28, 0x34302d, 0x2e2b29, 0x262422], haze, 16, 0.05);
    for (let k = 0; k < 6; k += 1) {
      const a = 1.2 + k * 0.9, d = 18 + (k % 3) * 5;
      e.tree(at, Math.cos(a) * d, 10 + Math.sin(a) * d * 0.5, 5 + (k % 2) * 2, 2.2, 0x6a7448, haze, 0);
    }
  }
  // past the map's south edge (the opening view): the coalfield's moor, allotments with their sheds, a brickworks
  {
    const at = e.frame(232 * DEG, 84), haze = e.hazeAt(84);
    e.box(at, -12, 12, 0, 14, 7, 0x7a4a3a, 0x3e4246, haze, { flat: false });
    e.gable(at, -12.3, 12.3, -0.3, 14.3, 7, 9.4, 0x7a4a3a, 0x45494c, haze);
    e.windows(at, -11.5, 11.5, 0, 1.6, 6.4, haze, 3.0, 3.0, 0x2c3034, [1.4, 1.6]);
    e.box(at, 14, 26, 2, 12, 4.2, 0x5a4a3c, 0x3e3a36, haze); // the kilns
    e.accent = true;
    e.lathe(at, 20, 7, [[1.6, e.foot], [1.2, 19], [1.3, 20], [1.0, 20]], [0x7b4e3c, 0x2a2624, 0x1c1a19], haze * 0.9, 8);
    e.accent = false;
  }
  // birch and willow scrub in clumps with gaps, allotment sheds between them
  for (let k = 0; k < 16; k += 1) {
    const deg = 168 + k * 9.5 + (e.random() - 0.5) * 6;
    if (deg > 222 && deg < 244) continue;
    const r = 56 + e.random() * 18, at = e.frame(deg * DEG, r), haze = e.hazeAt(r);
    if (k % 3 === 0) { // an allotment shed
      e.box(at, -1.5, 1.5, 0, 2.4, 2.2, 0x5a4a3a, 0x3e3a36, haze, { flat: false });
      e.gable(at, -1.7, 1.7, -0.2, 2.6, 2.2, 3.0, 0x5a4a3a, 0x3e4246, haze);
    } else if (k % 3 === 1) {
      const n = 2 + Math.floor(e.random() * 3);
      for (let t = 0; t < n; t += 1) e.tree(at, (t - n / 2) * (2 + e.random() * 2), e.random() * 3, 5 + e.random() * 5, 2.4 + e.random() * 1.6, [0x5a6a40, 0x6a7448, 0x4e5c38][t % 3], haze, 0);
    }
  }
  // telegraph poles along the line's embankment, left of the yard
  for (let k = 0; k < 8; k += 1) {
    const at = e.frame((128 + k * 2.6) * DEG, 60), haze = e.hazeAt(60);
    e.strut(at, [0, e.foot, 0], [0, 7.5, 0], 0.22, 0x3a322a, haze);
    e.strut(at, [-0.8, 7.0, 0], [0.8, 7.0, 0], 0.12, 0x3a322a, haze);
  }
}

export const CINDER_SKYLINE: GarageSkyline = Object.freeze({
  landmarks: Object.freeze([
    { name: 'colliery headframe', bearing: BEARING.headframe, radius: 82, source: 'the southern works and its stack, map (178, -144)' },
    { name: 'spoil tip', bearing: BEARING.spoilTip, radius: 104, source: 'the western spoil tip, map (-322, -238)' },
    { name: 'spoil bank', bearing: BEARING.spoilBank, radius: 84, source: 'the washery spoil bank, map (-176, -160)' },
    { name: 'signal box', bearing: BEARING.signalBox, radius: 64, source: 'the west throat, map (-150, -10)' },
    { name: 'wagon rows', bearing: BEARING.yard, radius: 70, source: 'the yard sidings between the throats' },
    { name: 'station', bearing: BEARING.station, radius: 88, source: 'the station building, map (-4, -44)' },
    { name: 'coal stage', bearing: BEARING.coalStage, radius: 74, source: 'the goods side coal stage, map (-120, 38)' },
    { name: "miners' colony", bearing: BEARING.colony, radius: 92, source: 'the rowhouses, map (240, -165)' },
  ]),
  build: cinderSkylineBuild,
  bandSegments: [96, 80, 64, 48, 48] as const,
});

// ------------------------------------------------------------------ the placement

const world = (side: number, y: number, depth: number): KitVec => {
  const p = garageViewPoint(side, depth);
  return [p.x, y, p.z];
};
const polar = (bearing: number, radius: number, y: number): KitVec => [Math.cos(bearing) * radius, y, Math.sin(bearing) * radius];

export const CINDER_KIT: GarageKitPlacement = {
  items: [
    // the station nameboard on its posts at the throat, right of the shed (the opening view's right third)
    { kind: 'display', display: 'nameboard', at: [15.0, 22.4], yaw: FACE_CAMERA, width: 3.0, posts: 1.9 },
    // the platform at the throat with its canopy; the slideshow hangs from the canopy (garageSlideshowPlacement.ts), a
    // column banner beside it, the enamel pictograms on the columns
    { kind: 'piece', key: 'cinder-platform', build: platformCanopy, at: [18.6, 22.0], yaw: FACE_CAMERA, datum: true },
    { kind: 'display', display: 'banner', rect: 'brand.banner.v', at: [17.6, 26.15], yaw: FACE_CAMERA, y: 4.25, size: [0.8, 2.3], options: { hang: 0.06 },
      datum: true },
    { kind: 'sign', sign: 'plate', rect: 'picto.speed10', at: [18.6, 21.7], yaw: FACE_CAMERA, y: 1.75, size: [0.42, 0.42], datum: true },
    { kind: 'sign', sign: 'plate', rect: 'picto.nosmoking', at: [18.6, 26.2], yaw: FACE_CAMERA, y: 1.75, size: [0.42, 0.42], datum: true },
    // the signal box at the throat, its desk in the window band, a semaphore at the shed's road ends, the point levers
    { kind: 'piece', key: 'cinder-signal-box', build: signalBox, at: [17.0, 10.8], yaw: FACE_CAMERA - 0.3 },
    { kind: 'display', display: 'station', at: [17.15, 11.28], yaw: FACE_CAMERA - 0.3, y: BOX_FLOOR + 0.42,
      screens: ['readout.armor.leopard', 'map.railyard', 'readout.modules.burlak'], width: 2.4 },
    { kind: 'piece', key: 'cinder-semaphore', build: semaphore, at: [11.6, 16.2], yaw: FACE_CAMERA },
    { kind: 'piece', key: 'cinder-point-lever', build: pointLever, at: [9.6, 12.4], yaw: FACE_CAMERA + 0.2 },
    { kind: 'piece', key: 'cinder-point-lever', build: pointLever, at: [-9.8, 12.6], yaw: FACE_CAMERA - 0.2 },
    // buffer stops where the yard's outer roads end at the sidings
    { kind: 'piece', key: 'cinder-buffer', build: bufferStop, at: [23.2, 8.0], yaw: (3 * Math.PI) / 4, datum: true },
    // the breakdown crane at work on the left siding, lifting a turret off its cribbing
    { kind: 'piece', key: 'cinder-siding-14', build: trackStub(14, false), at: [-27.6, 7.6], yaw: FACE_LEFT, datum: true },
    { kind: 'piece', key: 'cinder-outrigger-packing', build: outriggerPacking, at: [-27.6, 7.6], yaw: FACE_LEFT, datum: true, grounded: false },
    { kind: 'crane', crane: 'breakdown', at: [-27.6, 7.6], yaw: FACE_LEFT, y: 0.31, datum: true, params: { slew: 0.5, jibAngle: 0.62, load: { kind: 'turret' } } },
    { kind: 'piece', key: 'cinder-cribbing', build: cribbing, at: [-35.5, 2.84], yaw: 0.2, datum: true },
    // oil and ash worked into the ground where the crane, the ash pit and the lamp stand stand
    { kind: 'sign', sign: 'stencil', rect: 'decal.oil', at: [-28.4, 6.8], yaw: 0.7, size: [3.2, 2.2] },
    { kind: 'sign', sign: 'stencil', rect: 'decal.grime', at: [-17.0, 13.0], yaw: 0.2, size: [2.6, 1.6] },
    { kind: 'sign', sign: 'stencil', rect: 'decal.oil', at: [13.4, 19.2], yaw: 1.4, size: [1.6, 1.3] },
    // the ash pit, the rail and sleeper store, the oil-lamp stand, the yard's poster hoarding and the brand's banner
    { kind: 'piece', key: 'cinder-ash-pit', build: ashPit, at: [-14.4, 16.2], yaw: FACE_CAMERA },
    { kind: 'piece', key: 'cinder-rail-store', build: railStore, at: [22.6, 1.6], yaw: FACE_CAMERA + 0.1 },
    { kind: 'piece', key: 'cinder-lamps', build: lampStand, at: [12.8, 19.6], yaw: FACE_CAMERA },
    { kind: 'piece', key: 'cinder-hoarding', build: hoarding, at: [-17.6, 9.4], yaw: FACE_CAMERA + 0.15 },
    { kind: 'display', display: 'print', rect: 'media.railyard', at: [-17.6 - 2.27, 9.4 - 0.34], yaw: FACE_CAMERA + 0.15, y: 1.55, size: [1.9, 1.07], options: { light: false } },
    { kind: 'display', display: 'print', rect: 'media.foundry', at: [-17.6, 9.4], yaw: FACE_CAMERA + 0.15, y: 1.55, size: [1.9, 1.07], options: { light: false } },
    { kind: 'display', display: 'print', rect: 'media.winter', at: [-17.6 + 2.27, 9.4 + 0.34], yaw: FACE_CAMERA + 0.15, y: 1.55, size: [1.9, 1.07], options: { light: false } },
    { kind: 'display', display: 'pvc', rect: 'brand.banner.h', at: [-12.6, 6.2], yaw: FACE_CAMERA + 0.25, y: 1.5, size: [3.6, 0.56], options: { gap: 0.2 } },
    { kind: 'prop', name: 'drum200', at: [13.6, 18.4], yaw: 0.3 },
    { kind: 'prop', name: 'drum200', at: [14.2, 18.9], yaw: 1.1 },
    { kind: 'prop', name: 'extinguisher', at: [12.0, 20.4], yaw: 0 },
    // the yard's brick boundary wall behind the throat (the map's walls run behind each service road)
    { kind: 'wall', wall: 'brick', points: [[26.6, 1.8], [26.6, 16.6]], params: { height: 2.1 } },
    // the shelters' flanks beside the turntable (the facility's primitive stations there gave way to these)
    { kind: 'prop', name: 'gasCage', at: [15.1, -4.9], yaw: -FACE_CAMERA },
    { kind: 'prop', name: 'pallet', at: [-13.0, -9.6], yaw: 0.2 },
    { kind: 'prop', name: 'drum200', at: [-13.3, -9.4], yaw: 0.4, y: 0.14, blot: false },
    { kind: 'prop', name: 'drum200', at: [-12.7, -9.9], yaw: 1.3, y: 0.14, blot: false },
    { kind: 'prop', name: 'drum200', at: [-12.6, -9.2], yaw: 2.2, y: 0.14, blot: false },
    { kind: 'prop', name: 'spillBin', at: [-14.6, -8.6], yaw: FACE_CAMERA },
  ],
  atmosphere: {
    drift: 0.02,
    cards: [
      // steam leaking from the shed's smoke lanterns, the headframe's winding-house stack, the brickworks chimney
      ...atmospherePlume(world(-6.2, 10.9, 27), 7, 1.6, 'steam', 0.8, 5),
      ...atmospherePlume(world(6.2, 10.9, 27.5), 6, 1.3, 'steam', 0.8, 4),
      ...atmospherePlume(polar(BEARING.headframe + 0.07, 92, 22), 14, 2.6, 'smoke', 0.9, 5),
      ...atmospherePlume(polar(232 * DEG + 0.13, 91, 20), 12, 2.4, 'smoke', 1.0, 5),
      // a light coal haze over the yard's flanks and the sidings
      atmosphereBand(polar(150 * DEG, 66, 0), polar(185 * DEG, 70, 0), 8, 'smoke', 0.2),
      atmosphereBand(polar(270 * DEG, 68, 0), polar(320 * DEG, 64, 0), 8, 'smoke', 0.5),
      atmosphereBand(polar(60 * DEG, 70, 0), polar(115 * DEG, 74, 0), 9, 'smoke', 0.8),
    ],
  },
};
