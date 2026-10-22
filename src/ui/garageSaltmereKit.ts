import * as THREE from 'three';

import { KitBuilder, type KitVec } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';
import type { KitCraneReceipt } from './garageCraneKit.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';
import { atmosphereBand } from './garageAtmosphereKit.ts';
import { arcWeight, mapBearing, type GarageSkyline, type GarageSkylineEmitter } from './garageSkylineKit.ts';

/**
 * Saltmere Deployment (naval_drydock; garage r9, the per-garage brief 5): a granite graving dock on a Breton fishing
 * coast (the Pays de Léon). Turquoise water, whitewash and slate, the lighthouse on its headland.
 *
 * - The kit: the portal jib crane rebuilt from plate and lattice (bogies on the rails set in the quay's setts, a braced
 *   portal, the slewing machinery house with its cab and counterweight, a lattice jib luffed over the dock) at work
 *   lifting the patrol craft's gun shield off its mount for overhaul; the harbour master's hut with its desk and screens;
 *   the harbour master's flag mast; stacked lobster pots, a net drying frame, orange buoys on their rope, rope coils;
 *   gulls perched on the dock's bollards (static).
 * - Displays: the slideshow's CRT on the far pierhead, the brand's banner lashed to the caisson's rail, a big
 *   crest-and-wordmark banner on the boatshed's sea wall, the harbour notice board with three prints, the nameboard,
 *   the harbour master's screens (readouts and the Saltmere Bay map).
 * - The skyline (K10): the map's coast composed about the quay. The garage stands on Saltmere's strand, the bay before
 *   it: the map's bearings are taken from the south strand (map 255, -210) and turned so the bay lies where the graving
 *   dock opens (the opening view's direction; the terrain patch's own anchor, alpha's spawn, is 330 m inland and would
 *   put the sea behind the dock's caisson). Open turquoise water fills 150 degrees of the horizon, islets stand offshore,
 *   the dune-backed strand curves to the granite headland with its white lighthouse banded black, the whitewashed
 *   fishing village with its slate roofs and granite steeple runs along the coast road, and the bocage downs (small
 *   fields boxed by hedge banks, wind-shaped maritime pines) close the land behind.
 */

const FACE_CAMERA = Math.PI / 4;

const HARBOUR_BLUE = 0x4d666b, HOUSE = 0x8a9497, ROOF = 0x4f5658, IRON = 0x26292b, RUST = 0x6e4630, ROPE = 0x8c7a55;
const WHITEWASH = 0xe6e3da, SLATE = 0x4a5058, GRANITE = 0x8d8c86;

// ------------------------------------------------------------------ the portal jib crane

/** A lattice member from a to c in a given paint (chords and zig-zag lacing on its four faces). */
function lattice(b: KitBuilder, a: KitVec, c: KitVec, depth0: number, depth1: number, width0: number, width1: number, bays: number,
  color: number): void {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c);
  const axis = C.clone().sub(A).normalize();
  const side = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(side, axis).normalize();
  const point = (t: number, su: number, sw: number): KitVec => {
    const d = depth0 + (depth1 - depth0) * t, w = width0 + (width1 - width0) * t;
    const p = A.clone().lerp(C, t).addScaledVector(up, su * d / 2).addScaledVector(side, sw * w / 2);
    return [p.x, p.y, p.z];
  };
  const corners: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [su, sw] of corners) b.beam(point(0, su, sw), point(1, su, sw), 0.1, 0.1, color, { bevel: 0 });
  for (let i = 0; i < bays; i += 1) {
    const t0 = i / bays, t1 = (i + 1) / bays;
    for (let f = 0; f < 4; f += 1) {
      const [su0, sw0] = corners[f], [su1, sw1] = corners[(f + 1) % 4];
      const flip = (i + f) % 2 === 0;
      b.beam(point(flip ? t0 : t1, su0, sw0), point(flip ? t1 : t0, su1, sw1), 0.05, 0.05, color, { bevel: 0 });
    }
  }
}

/** Where the portal crane's hook hangs (its frame): over the patrol craft's gun on the forecastle. */
const CRANE_SLEW = -1.33;
const CRANE_REACH = 9.17;

/**
 * The portal jib crane: four box legs on bogies over the two rails set in the setts (the facility lays the rails), the
 * legs braced in pairs, the portal deck with its guardrail and ladder, the slewing ring; the machinery house in
 * stiffened plate with its framed windows, louvres, roof vents, door and landing, the cab with its glazing, the
 * A-frame, a salt-rusted counterweight; a lattice jib luffed to reach `CRANE_REACH` at `CRANE_SLEW`, its luffing ropes,
 * the head sheave, the hoist rope, the hook block and the gun shield on its slings; the capacity plate and a beacon.
 * Frame: the rails along z at x = +/-2.5, the portal centred at the origin.
 */
function portalJibCrane(b: KitBuilder): KitCraneReceipt {
  const start = b.triangleCount;
  const gauge = 5.0, legX = 3.2, portalY = 5.6;
  for (const x of [-gauge / 2, gauge / 2]) for (const z of [-legX, legX]) {
    b.box(x, 0.5, z, 0.6, 0.5, 2.0, IRON, { bevel: 0.03 }); // the bogie
    for (const dz of [-0.6, 0.6]) b.cylinder(x - 0.15, 0.3, z + dz, 0.28, 0.3, 10, 0x1e2022, { axis: 'x' });
    b.box(x, 0.8 + (portalY - 0.8) / 2, z, 0.55, portalY - 0.8, 0.5, HARBOUR_BLUE, { bevel: 0.03 }); // the box leg
    b.box(x, portalY - 1.4, z + (z > 0 ? -0.26 : 0.26), 0.56, 1.2, 0.02, RUST, { bevel: 0 }); // rust run from the joint
    b.box(x, 1.05, z, 0.62, 0.5, 0.56, 0x343a3b, { bevel: 0.02 }); // grime at the foot
  }
  for (const x of [-gauge / 2, gauge / 2]) {
    b.beam([x, 1.2, -legX], [x, portalY - 0.6, legX], 0.18, 0.18, HARBOUR_BLUE, { bevel: 0.01 });
    b.beam([x, 1.2, legX], [x, portalY - 0.6, -legX], 0.18, 0.18, HARBOUR_BLUE, { bevel: 0.01 });
    b.box(x, portalY - 0.3, 0, 0.55, 0.6, 2 * legX + 0.55, HARBOUR_BLUE, { bevel: 0.02 });
    for (const z of [-legX, legX]) b.box(x * 0.92, 0.32, z + (z > 0 ? 1.15 : -1.15), 0.4, 0.4, 0.3, 0xb48a2c, { bevel: 0.01 }); // rail clamps
  }
  b.box(0, portalY + 0.2, 0, gauge + 1.0, 0.4, 2 * legX + 1.0, HARBOUR_BLUE, { bevel: 0.03 }); // the portal deck
  for (const x of [-(gauge / 2 + 0.45), gauge / 2 + 0.45]) {
    for (const y of [portalY + 0.85, portalY + 1.4]) b.box(x, y, 0, 0.04, 0.04, 2 * legX + 0.9, 0x2e3436, { bevel: 0 });
    for (const z of [-legX, 0, legX]) b.box(x, portalY + 0.95, z, 0.04, 0.9, 0.04, 0x2e3436, { bevel: 0 });
  }
  for (const s of [-0.2, 0.2]) b.box(gauge / 2 + 0.38, (0.8 + portalY) / 2, legX - 0.75 + s, 0.04, portalY - 0.8, 0.04, IRON, { bevel: 0 });
  for (let y = 1.1; y < portalY; y += 0.3) b.box(gauge / 2 + 0.38, y, legX - 0.75, 0.03, 0.03, 0.42, IRON, { bevel: 0 });
  b.cylinder(0, portalY + 0.4, 0, 1.8, 0.3, 16, IRON); // the slewing ring
  // the slewing superstructure: forward (+z) is the jib's side
  const houseY = portalY + 0.7;
  b.push().translate(0, 0, 0).rotateY(CRANE_SLEW);
  b.box(0, houseY + 1.4, -0.6, 3.6, 2.8, 5.2, HOUSE, { bevel: 0.03 });
  b.box(0, houseY + 2.86, -0.6, 3.8, 0.12, 5.4, ROOF, { bevel: 0.01 });
  for (const s of [-1, 1]) {
    b.polygon([[s * 1.9, houseY + 2.92, -3.3], [s * 1.9, houseY + 2.92, 2.1], [0, houseY + 3.32, 2.1], [0, houseY + 3.32, -3.3]], ROOF, [s * 0.3, 1, 0]);
    b.box(s * 1.94, houseY + 2.86, -0.6, 0.1, 0.1, 5.4, 0x2e3436, { bevel: 0 }); // the gutter
  }
  for (const z of [-3.3, 2.1]) b.polygon([[-1.9, houseY + 2.92, z], [1.9, houseY + 2.92, z], [0, houseY + 3.32, z]], HOUSE, [0, 0, z > 0 ? 1 : -1]);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k += 1) b.box(s * 1.815, houseY + 1.4, -3.0 + k * 0.96, 0.05, 2.7, 0.06, 0x2e3436, { bevel: 0 });
    b.box(s * 1.84, houseY + 2.72, -0.6, 0.07, 0.07, 5.3, 0x2e3436, { bevel: 0 }); // the drip rail
    for (const dz of [-2.0, -0.6, 0.8]) {
      b.box(s * 1.82, houseY + 1.9, dz, 0.03, 0.62, 0.84, 0x2a3438, { bevel: 0 });
      b.box(s * 1.835, houseY + 1.9, dz, 0.03, 0.66, 0.05, 0x2e3436, { bevel: 0 });
    }
    for (let k = 0; k < 5; k += 1) b.box(s * 1.83, houseY + 0.55 + k * 0.11, -2.95, 0.05, 0.05, 0.9, 0x5d676a, { bevel: 0 });
  }
  for (const dz of [-1.8, -0.2]) b.box(0, houseY + 3.4, dz, 0.7, 0.3, 0.7, ROOF, { bevel: 0.01 });
  b.box(1.2, houseY + 1.6, 2.4, 1.3, 1.8, 1.4, HOUSE, { bevel: 0.03 }); // the cab
  b.box(1.2, houseY + 1.85, 3.11, 1.1, 1.0, 0.03, 0x2a3438, { bevel: 0 });
  b.box(1.2, houseY + 1.85, 3.13, 0.05, 1.0, 0.04, 0x2e3436, { bevel: 0 });
  b.box(1.81, houseY + 1.0, 1.6, 0.04, 1.9, 0.8, 0x3a4245, { bevel: 0 }); // the door, its landing and rail
  b.box(2.3, houseY - 0.02, 1.6, 0.9, 0.06, 1.0, 0x2e3436, { bevel: 0 });
  b.box(2.72, houseY + 0.5, 1.6, 0.04, 1.0, 1.0, 0x2e3436, { bevel: 0 });
  b.box(0, houseY + 1.2, -3.8, 3.2, 2.0, 1.4, 0x5a5f60, { bevel: 0.03 }); // the counterweight
  b.box(0, houseY + 1.2, -4.51, 3.0, 1.6, 0.02, RUST, { bevel: 0 });
  for (const s of [-1, 1]) {
    b.beam([s * 1.2, houseY + 3.0, 1.4], [s * 0.4, houseY + 6.6, -0.4], 0.2, 0.2, HARBOUR_BLUE, { bevel: 0.01 });
    b.beam([s * 1.2, houseY + 3.0, -2.6], [s * 0.4, houseY + 6.6, -0.4], 0.2, 0.2, HARBOUR_BLUE, { bevel: 0.01 });
  }
  // the lattice jib from its heel on the house front, luffed to reach over the gun
  const heel: KitVec = [0, houseY + 0.6, 2.0];
  const jibLen = 9.6;
  const luff = Math.acos(THREE.MathUtils.clamp((CRANE_REACH - heel[2]) / jibLen, -1, 1));
  const tip: KitVec = [0, heel[1] + Math.sin(luff) * jibLen, heel[2] + Math.cos(luff) * jibLen];
  lattice(b, heel, tip, 0.9, 0.4, 1.4, 0.5, 9, HARBOUR_BLUE);
  b.cylinder(0.25, tip[1], tip[2], 0.4, 0.5, 12, IRON, { axis: 'x' }); // the head sheave
  for (const s of [-0.15, 0.15]) b.tube([[s, houseY + 6.6, -0.4], [s, tip[1] + 0.3, tip[2]]], 0.02, 4, 0x2a2c2c); // luffing ropes
  // the amber beacon on the roof's ridge
  b.box(0, houseY + 3.38, 0.8, 0.16, 0.12, 0.16, 0x2a2c2d, { bevel: 0.01 });
  b.face([-0.06, houseY + 3.44, 0.88], [0.06, houseY + 3.44, 0.88], [0.06, houseY + 3.6, 0.88], [-0.06, houseY + 3.6, 0.88], garageDisplayRect('glow.amber'));
  b.pop();
  const tipWorld: KitVec = [Math.sin(CRANE_SLEW) * tip[2], tip[1], Math.cos(CRANE_SLEW) * tip[2]];
  // the hoist rope, the hook block and the gun shield it lifts off the forecastle
  const hookY = 3.5;
  for (const s of [-0.06, 0.06]) b.tube([[tipWorld[0] + s, tipWorld[1] - 0.35, tipWorld[2]], [tipWorld[0] + s, hookY + 0.9, tipWorld[2]]], 0.012, 5, 0x2a2c2c);
  b.box(tipWorld[0], hookY + 0.68, tipWorld[2], 0.38, 0.46, 0.14, 0xb88a2a, { bevel: 0.015 });
  b.cylinder(tipWorld[0], hookY + 0.24, tipWorld[2], 0.04, 0.24, 8, IRON);
  b.torus(tipWorld[0] + 0.06, hookY + 0.12, tipWorld[2], 0.11, 0.035, 8, 5, 0xb88a2a, 'z', Math.PI * 1.45);
  {
    const gx = tipWorld[0], gz = tipWorld[2], top = hookY - 1.1;
    for (const [sx, sz] of [[-0.45, -0.5], [0.45, -0.5], [0.45, 0.5], [-0.45, 0.5]] as const) b.tube([[gx, hookY + 0.15, gz], [gx + sx, top, gz + sz]], 0.012, 4, 0xc79a2c);
    b.push().translate(gx, top - 0.3, gz).rotateY(CRANE_SLEW + Math.PI / 2);
    b.box(0, 0, 0, 1.0, 0.6, 1.2, 0x6b7276, { bevel: 0.05 }); // the shield
    b.box(0, -0.05, 0.62, 0.8, 0.5, 0.06, 0x5e6569, { bevel: 0 });
    b.cylinder(0, -0.05, 0.6, 0.06, 1.9, 8, IRON, { axis: 'z' }); // its barrel
    b.box(0, -0.38, 0, 0.7, 0.08, 0.8, IRON, { bevel: 0 }); // the trunnion cradle
    b.pop();
  }
  // the capacity plate on the portal girder
  b.push().translate(0, portalY - 0.3, legX + 0.28);
  b.uprightFace(0, 0, 0, 1.2, 0.45, garageDisplayRect('plate.swl.20'));
  b.pop();
  // the power cable from the cable drum on the portal to its pit in the quay
  b.cylinder(-gauge / 2 - 0.4, 1.4, -legX, 0.45, 0.4, 12, 0x2e3436, { axis: 'x' });
  b.tube([[-gauge / 2 - 0.6, 1.0, -legX], [-gauge / 2 - 0.7, 0.05, -legX - 1.6], [-gauge / 2 - 0.7, 0.02, -legX - 4.0]], 0.03, 4, 0x1c1d1e);
  return { kind: 'portal-jib', rail: true, endStops: true, trolley: true, hoist: true, reeving: true, hookBlock: true, festoon: true,
    plate: true, atWork: true, load: 'turret', hook: [tipWorld[0], hookY, tipWorld[2]], triangles: b.triangleCount - start };
}

// ------------------------------------------------------------------ the harbour's own pieces

/** Stacked lobster pots: domed creels of withy and net on their flat bases, roped, a few toppled. */
function lobsterPots(b: KitBuilder): void {
  const r = b.rng;
  const slots: Array<[number, number, number]> = [[0, 0, 0], [0.68, 0, 0], [1.36, 0, 0], [0.34, 0.5, 0.0], [1.02, 0.5, 0], [0.68, 1.0, 0], [-0.2, 0, 0.75], [0.5, 0, 0.78]];
  for (const [x, y, z] of slots) {
    b.box(x, y + 0.03, z, 0.62, 0.06, 0.48, 0x5a4a34, { bevel: 0 });
    b.lathe(x, y + 0.06, z, [[0.3, 0], [0.3, 0.12], [0.24, 0.32], [0.1, 0.42], [0, 0.44]], 8, [0x6a5a3a, 0x5c4e34, 0x4f4430, 0x463c2a], { axis: 'y' });
    b.torus(x, y + 0.36, z, 0.1, 0.02, 6, 3, 0x2a3a3a, 'y');
    if (r() < 0.4) b.lathe(x + 0.18, y + 0.2, z + 0.12, [[0, 0], [0.06, 0.02], [0.06, 0.1], [0, 0.12]], 6, 0xd06a2a);
  }
  b.tube(KitBuilder.catenary([-0.3, 0.45, -0.25], [1.7, 0.45, -0.25], 0.15, 6), 0.012, 3, ROPE);
}

/** Nets drying on their frame: two pole trestles, a ridge pole, the net hanging in swags, floats along its head. */
function netFrame(b: KitBuilder): void {
  for (const x of [-2.4, 2.4]) {
    b.beam([x, 0, -0.6], [x, 2.3, 0], 0.08, 0.08, 0x6a5840, { bevel: 0 });
    b.beam([x, 0, 0.6], [x, 2.3, 0], 0.08, 0.08, 0x6a5840, { bevel: 0 });
  }
  b.rod([-2.7, 2.3, 0], [2.7, 2.3, 0], 0.05, 6, 0x6a5840);
  for (let k = 0; k < 6; k += 1) {
    const x0 = -2.3 + k * 0.77, x1 = x0 + 0.77;
    for (const s of [-1, 1]) {
      b.polygon([[x0, 2.28, 0.02 * s], [x1, 2.28, 0.02 * s], [x1 - 0.05, 0.5 + (k % 2) * 0.2, 0.34 * s], [x0 + 0.05, 0.45 + ((k + 1) % 2) * 0.2, 0.34 * s]],
        k % 2 ? 0x3a5048 : 0x40584c, [0, 0, s]);
    }
    b.lathe(x0 + 0.38, 2.2, 0.06, [[0, -0.06], [0.06, 0], [0, 0.06]], 6, 0xd06a2a);
  }
}

/** Orange buoys strung on a rope between two short posts, fenders and a coil of hawser at their feet. */
function buoyLine(b: KitBuilder): void {
  for (const x of [-1.8, 1.8]) b.box(x, 0.45, 0, 0.12, 0.9, 0.12, 0x5a4a34, { bevel: 0 });
  const rope = KitBuilder.catenary([-1.8, 0.82, 0], [1.8, 0.82, 0], 0.25, 8);
  b.tube(rope, 0.014, 3, ROPE);
  for (let k = 1; k < 8; k += 1) {
    const [x, y, z] = rope[k];
    b.lathe(x, y - 0.42, z, [[0, 0], [0.13, 0.04], [0.17, 0.17], [0.13, 0.3], [0, 0.34]], 8, k % 3 ? 0xd2652a : 0xd8d6cc);
  }
  for (let k = 0; k < 4; k += 1) b.torus(0.4, 0.04 + k * 0.08, 0.6, 0.42 - k * 0.04, 0.04, 12, 4, ROPE, 'y');
  b.cylinder(-1.1, 0.0, 0.6, 0.24, 0.6, 10, 0x1c1c1c, { axis: 'x' }); // a tyre fender lying
}

/** A herring gull perched (static): body, head, beak, tail and folded wings in grey and white. */
function gull(b: KitBuilder): void {
  b.lathe(0, 0.06, 0, [[0, -0.16], [0.06, -0.1], [0.075, 0.02], [0.05, 0.14], [0, 0.18]], 6, [0xe8e8e4, 0xeeeeea, 0xeeeeea, 0xe2e2de], { axis: 'z' });
  b.box(0, 0.16, 0.13, 0.07, 0.07, 0.08, 0xf0f0ec, { bevel: 0.02 });
  b.box(0, 0.15, 0.19, 0.016, 0.018, 0.05, 0xd8b030, { bevel: 0 });
  for (const s of [-1, 1]) b.box(s * 0.07, 0.09, -0.02, 0.025, 0.06, 0.24, 0x9aa2a8, { bevel: 0.01 });
  b.box(0, 0.08, -0.2, 0.06, 0.02, 0.1, 0x2a2c2e, { bevel: 0 });
  for (const s of [-0.025, 0.025]) b.box(s, 0.03, 0, 0.01, 0.06, 0.01, 0xd8a868, { bevel: 0 });
}

/** The harbour master's flag mast: a white pole in its tabernacle with a yard, halyards and the flag streaming. */
function flagMast(b: KitBuilder): void {
  b.box(0, 0.2, 0, 0.7, 0.4, 0.7, GRANITE, { bevel: 0.03, noBottom: true });
  b.cylinder(0, 0.4, 0, 0.09, 8.4, 8, 0xe8e6e0, { topRadius: 0.05 });
  b.rod([-1.1, 6.6, 0], [1.1, 6.6, 0], 0.035, 6, 0xe8e6e0);
  b.lathe(0, 8.8, 0, [[0.08, 0], [0.08, 0.06], [0, 0.14]], 6, 0xc8a038);
  b.tube([[0.05, 8.7, 0], [0.12, 4.0, 0.05], [0.08, 1.2, 0.05]], 0.008, 3, 0xd8d6cc);
  // the flag on the yard's arm, rippled in three panels downwind (+x)
  const fy = 6.55;
  for (let k = 0; k < 3; k += 1) {
    const x0 = 1.1 + k * 0.42, x1 = x0 + 0.42, z0 = Math.sin(k * 1.4) * 0.08, z1 = Math.sin((k + 1) * 1.4) * 0.08;
    for (const s of [1, -1]) b.polygon([[x0, fy, z0 + s * 0.003], [x1, fy - 0.03, z1 + s * 0.003], [x1, fy - 0.8, z1 + s * 0.003], [x0, fy - 0.78, z0 + s * 0.003]], k % 2 ? 0x2c4a7a : 0xd8d6cc, [0, 0, s]);
  }
  for (const s of [1, -1]) b.polygon([[1.1, fy, 0.004 * s], [1.52, fy - 0.03, Math.sin(1.4) * 0.08 + 0.004 * s], [1.52, fy - 0.4, Math.sin(1.4) * 0.08 + 0.004 * s], [1.1, fy - 0.38, 0.004 * s]], 0x2a2c2e, [0, 0, s]);
}

/**
 * The harbour master's hut: whitewashed granite walls on a dressed plinth, a slate roof with its chimney, a door and a
 * deep office window toward the yard (open, its desk's screens read through it: the desk is the 'station' item). Front +Z.
 */
const HUT_FLOOR = 0.3;
function harbourMasterHut(b: KitBuilder): void {
  const w = 4.4, d = 3.4, eave = 2.9;
  b.box(0, 0.15, 0, w + 0.2, 0.3, d + 0.2, GRANITE, { bevel: 0.02, noBottom: true });
  // the front wall around the office window and the door, the side and back walls
  b.box(0, (eave + 0.3) / 2, -d / 2 + 0.15, w, eave - 0.3, 0.3, WHITEWASH, { bevel: 0.02 });
  for (const s of [-1, 1]) b.box(s * (w / 2 - 0.15), (eave + 0.3) / 2, 0, 0.3, eave - 0.3, d, WHITEWASH, { bevel: 0.02 });
  b.box(-1.55, (eave + 0.3) / 2, d / 2 - 0.15, 0.7, eave - 0.3, 0.3, WHITEWASH, { bevel: 0.02 });
  b.box(1.75, (eave + 0.3) / 2, d / 2 - 0.15, 0.3, eave - 0.3, 0.3, WHITEWASH, { bevel: 0.02 });
  b.box(-0.2, 0.75, d / 2 - 0.15, 2.0, 0.9, 0.3, WHITEWASH, { bevel: 0.02 }); // the sill wall
  b.box(-0.2, 2.55, d / 2 - 0.15, 2.0, 0.6, 0.3, WHITEWASH, { bevel: 0.02 }); // the lintel wall
  b.box(-0.2, 1.22, d / 2 + 0.02, 2.1, 0.06, 0.12, GRANITE, { bevel: 0 }); // the granite sill
  for (const x of [-0.85, -0.2, 0.45]) b.box(x, 1.75, d / 2 - 0.05, 0.05, 1.0, 0.05, 0x2c4a5a, { bevel: 0 }); // the sash's mullions
  b.box(1.15, 1.1, d / 2 - 0.1, 0.84, 1.95, 0.06, 0x2c4a5a, { bevel: 0 }); // the door
  for (const [x, y] of [[-1.9, 0.9], [-1.9, 2.0], [2.0, 0.7], [2.0, 2.2]] as const) b.box(x, y, d / 2 + 0.005, 0.32, 0.22, 0.02, GRANITE, { bevel: 0 }); // quoins
  // the slate roof, its ridge and the end chimney
  const roofTop = eave + 1.5;
  for (const s of [-1, 1]) b.polygon([[-w / 2 - 0.25, eave, s * (d / 2 + 0.3)], [w / 2 + 0.25, eave, s * (d / 2 + 0.3)], [w / 2 + 0.25, roofTop, 0], [-w / 2 - 0.25, roofTop, 0]], SLATE, [0, 1, s]);
  for (const s of [-1, 1]) b.polygon([[s * (w / 2), eave, d / 2], [s * (w / 2), eave, -d / 2], [s * (w / 2), roofTop - 0.1, 0]], WHITEWASH, [s, 0, 0]);
  b.box(0, roofTop + 0.03, 0, w + 0.55, 0.08, 0.16, 0x3a3f44, { bevel: 0 });
  b.box(w / 2 - 0.3, roofTop + 0.4, 0, 0.5, 1.0, 0.6, GRANITE, { bevel: 0.02 });
  // a lit office lamp inside and a ships' bell by the door
  b.face([-1.0, 2.2, -d / 2 + 0.31], [0.6, 2.2, -d / 2 + 0.31], [0.6, 2.32, -d / 2 + 0.31], [-1.0, 2.32, -d / 2 + 0.31], garageDisplayRect('glow.warm'));
  b.lathe(1.75, 2.1, d / 2 + 0.12, [[0, 0], [0.09, 0.0], [0.07, 0.16], [0, 0.2]], 8, 0xb08a3a);
}

/** The pierhead's harbour board frame: two granite pillars and an iron lintel the slideshow's freestanding legs stand
 * between (the slideshow's own frame is the shared kit's). */
function pierheadPlinth(b: KitBuilder): void {
  b.box(0, 0.06, -0.12, 3.0, 0.12, 1.2, GRANITE, { bevel: 0.02, noBottom: true });
}

/** A granite mooring bollard, rope-worn, with a coil of hawser on its foot. */
function graniteBollard(b: KitBuilder): void {
  b.lathe(0, 0, 0, [[0.26, 0], [0.24, 0.5], [0.3, 0.6], [0.32, 0.72], [0.22, 0.8], [0, 0.82]], 10, [0x2a2c2e, 0x2a2c2e, 0x3a3c3e, 0x2a2c2e, 0x26282a]);
  for (let k = 0; k < 3; k += 1) b.torus(0, 0.05 + k * 0.08, 0.55, 0.32 - k * 0.04, 0.035, 10, 4, ROPE, 'y');
}

// ------------------------------------------------------------------ the skyline (K10)

/**
 * Bearings: the map's coast seen from Saltmere's south strand (map 255, -210), turned by `TURN` so the open bay between
 * its two headlands centres where the graving dock opens to the sea (the opening view's direction, 225 degrees).
 */
const STRAND = [255, -210] as const;
const DEG = Math.PI / 180;
const SOUTH_HEAD = [300, -430] as const, NORTH_HEAD = [330, 400] as const;
const TURN = 225 * DEG - (mapBearing(STRAND, SOUTH_HEAD) + mapBearing(STRAND, NORTH_HEAD)) / 2;
const coastBearing = (point: readonly [number, number]): number => mapBearing(STRAND, point) + TURN;
const BEARING = {
  headland: coastBearing(SOUTH_HEAD), // the southern cove's granite headland and its light, past the map's south edge
  village: coastBearing([150, 30]), // the fishing village on the coast road behind the strand
  northHead: coastBearing(NORTH_HEAD),
  downs: coastBearing([-40, -236]), // the south downs
} as const;
/** The sea's arc: from the southern headland to the northern one, past the bay and its coves. */
const SEA_FROM = BEARING.headland + 6 * DEG;
const SEA_TO = BEARING.northHead - 6 * DEG;

function saltmereSkylineBuild(e: GarageSkylineEmitter): void {
  // the headland: granite rising from the sea, the white lighthouse banded black, its keeper's cottage and pines
  {
    const r = 92, at = e.frame(BEARING.headland, r), haze = e.hazeAt(r) * 0.8;
    e.mound(at, 0, 6, 26, 6.2, 6, [0x5a6050, 0x6a6e5c, 0x7a7c70, 0x5d6a4a], haze, 14, 0.09, 0.7);
    e.mound(at, -14, 2, 9, 1.4, 2, [0x8a8a82, 0x7e7e76], haze, 10, 0.12);
    e.accent = true;
    e.lathe(at, 4, 6, [[1.5, 5.0], [1.3, 9.5], [1.22, 11.5], [1.15, 14.2], [1.1, 16.6], [1.5, 16.8], [1.5, 17.2], [0.9, 17.2]],
      [WHITEWASH, WHITEWASH, 0x1e2022, WHITEWASH, WHITEWASH, 0x2a2c2e, 0x2a2c2e], haze, 10);
    e.lathe(at, 4, 6, [[0.85, 17.2], [0.85, 18.6], [1.0, 18.8], [0, 19.8]], [0xd8c48a, 0x2a2c2e, 0x2a2c2e], haze * 0.6, 10);
    e.accent = false;
    e.box(at, 7, 12, 4, 8, 7.4, WHITEWASH, SLATE, haze, { flat: false, foot: 5 });
    e.gable(at, 6.7, 12.3, 3.7, 8.3, 7.4, 9.0, WHITEWASH, SLATE, haze);
    for (let k = 0; k < 4; k += 1) e.tree(at, -6 - k * 3.5, 10 + (k % 2) * 2, 5 + (k % 2), 4.2, 0x3e5034, haze, 3.2 - k * 0.6, 6);
  }
  // islets offshore, granite with a surf line
  for (const [deg, r, size, lean] of [[-38, 110, 8, 0.3], [-14, 128, 5, -0.4], [12, 104, 6.5, 0.2], [34, 140, 7, -0.2]] as const) {
    const at = e.frame(225 * DEG + deg * DEG, r), haze = e.hazeAt(r) * 0.8;
    const h = 1.4 + size * 0.22;
    // the surf breaking round it, then the granite dome worn round by the sea, a cap of turf on the larger ones
    e.lathe(at, 0, 0, [[size * 1.5, -2.6], [size * 1.32, -2.12], [size * 1.12, -2.18]], 0xdfe4e2, haze, 12);
    e.lathe(at, lean * size, 0, [[size * 1.15, -2.6], [size, -1.2], [size * 0.82, h * 0.35], [size * 0.52, h * 0.82], [size * 0.2, h], [0, h * 1.02]],
      [0x5e605a, 0x6e7068, 0x7a7c72, size > 6 ? 0x5e6a4a : 0x80827a, 0x5e6a4a], haze, 12);
  }
  // the whitewashed fishing village along the coast road: cottages with slate roofs, the granite steeple
  {
    let x = -30;
    const r = 78, at = e.frame(BEARING.village, r), haze = e.hazeAt(r);
    while (x < 34) {
      const w = 6 + e.random() * 5, d = 6 + e.random() * 2, eave = 4.6 + e.random() * 1.6;
      const z = Math.abs(x) * 0.12 + e.random() * 3;
      const wall = e.random() < 0.8 ? WHITEWASH : 0xb8b4a8;
      e.box(at, x, x + w, z, z + d, eave, wall, SLATE, haze, { flat: false });
      e.gable(at, x - 0.3, x + w + 0.3, z - 0.3, z + d + 0.3, eave, eave + 2.6, wall, SLATE, haze);
      e.windows(at, x, x + w, z, 1.0, eave - 0.2, haze, 2.0, 2.4, 0x2c4a5a, [0.8, 1.1]);
      e.box(at, x + w - 1.2, x + w - 0.4, z + d * 0.4, z + d * 0.6, eave + 3.4, 0x8d8c86, 0x3a3f44, haze); // its chimney
      x += w + 1.0 + e.random() * 2.5;
    }
    e.accent = true;
    const church = e.frame(BEARING.village + 6 * DEG, r + 6);
    e.box(church, -5, 5, 0, 14, 8, 0x9a988e, SLATE, haze, { flat: false });
    e.gable(church, -5.3, 5.3, -0.3, 14.3, 8, 11.6, 0x9a988e, SLATE, haze);
    e.box(church, -1.8, 1.8, -1.6, 2.0, 15, 0x9a988e, SLATE, haze, { flat: false });
    e.prism(church, 0, 0.2, 2.4, 15, 0x7e7c74, 0x6e6c64, haze, 8, 15, { rise: 8.2, topRadius: 2.4 });
    e.accent = false;
    // the harbour wall with its light and two boats along the strand below the village
    const mole = e.frame(BEARING.village - 18 * DEG, 66);
    e.box(mole, -14, 10, -1, 2, 0.6, 0x8d8c86, 0x9a9890, haze);
    e.accent = true;
    e.lathe(mole, 10, 0.5, [[0.7, 0.6], [0.6, 6.0], [0.8, 6.2], [0, 7.2]], [WHITEWASH, 0xa8302a, 0xa8302a], haze, 8);
    e.accent = false;
    for (const bx of [-9, -3]) {
      e.box(mole, bx, bx + 4.2, -3.6, -2.4, -1.2, 0x2c4a6a, 0xd8d6cc, haze, { foot: -2.3 });
      e.strut(mole, [bx + 2.2, -1.2, -3.0], [bx + 2.2, 3.4, -3.0], 0.12, 0xd8d6cc, haze);
    }
  }
  // farmsteads and maritime pines on the downs behind
  for (let k = 0; k < 16; k += 1) {
    const deg = (BEARING.village / DEG) + 30 + k * 9 + (e.random() - 0.5) * 4;
    const r = 60 + e.random() * 22, at = e.frame(deg * DEG, r), haze = e.hazeAt(r);
    if (k % 4 === 1) {
      e.box(at, -4, 4, 0, 6, 4.8, WHITEWASH, SLATE, haze, { flat: false });
      e.gable(at, -4.3, 4.3, -0.3, 6.3, 4.8, 7.0, WHITEWASH, SLATE, haze);
    } else {
      for (let t = 0; t < 2; t += 1) e.tree(at, t * 4 - 2, e.random() * 2, 6 + e.random() * 2.5, 4.8, t % 2 ? 0x3a4c32 : 0x42563a, haze, 1.0, 6);
    }
  }
}

function saltmereCrest(angle: number, layerIndex: number, crest: number): number {
  // the land drops into the sea across its arc (the strand at the arc's ends), the downs stand elsewhere
  const sea = arcWeight(angle, SEA_FROM, SEA_TO, 0.28);
  return THREE.MathUtils.lerp(crest + layerIndex * 0.25, -3.2, sea);
}

function saltmereGround(out: THREE.Color, angle: number, t: number, _y: number, slope: number, layerIndex: number, noise: number): boolean {
  const sea = arcWeight(angle, SEA_FROM, SEA_TO, 0.28);
  if (sea > 0.02 && t < 0.5) {
    // the dune-backed strand where the land runs down into the bay: pale sand over the dunes' marram
    out.copy(SAND).lerp(MARRAM, Math.min(1, t * 2 + noise * 0.3));
    return true;
  }
  if (slope > 0.75) return false;
  // bocage: small fields boxed by hedge banks, a different crop in each
  const u = (angle / (Math.PI * 2)) * (34 + layerIndex * 10);
  const v = t * (4 + layerIndex);
  const hedge = Math.min(Math.abs(u - Math.round(u)), Math.abs(v - Math.round(v)) * 1.6) < 0.07;
  if (hedge) { out.copy(HEDGE); return true; }
  const field = (Math.floor(u) * 7 + Math.floor(v) * 3) % 5;
  out.copy(FIELDS[field]).lerp(PASTURE, noise * 0.3);
  return true;
}
const SAND = new THREE.Color(0xd6c8a0), MARRAM = new THREE.Color(0x9a9a6a), HEDGE = new THREE.Color(0x2c3e26);
const PASTURE = new THREE.Color(0x6f7f56);
const FIELDS = [0x5c7a48, 0x6e8a50, 0x8a9a5a, 0x4f6c40, 0x7a8c4c].map((hex) => new THREE.Color(hex));

export const SALTMERE_SKYLINE: GarageSkyline = Object.freeze({
  landmarks: Object.freeze([
    { name: 'sea', bearing: (SEA_FROM + SEA_TO) / 2, radius: 120, source: `the bay, ${Math.round((SEA_TO - SEA_FROM) / DEG)} degrees of open water` },
    { name: 'lighthouse headland', bearing: BEARING.headland, radius: 92, source: "the southern cove's headland, map (300, -430)" },
    { name: 'whitewashed slate village', bearing: BEARING.village, radius: 78, source: 'the fishing village on the coast road, map (150, 30)' },
    { name: 'islets', bearing: 225 * DEG, radius: 110, source: 'four granite islets offshore in the bay' },
    { name: 'bocage downs', bearing: BEARING.downs, radius: 80, source: 'the south downs and their hedge banks, map (-40, -236)' },
  ]),
  build: saltmereSkylineBuild,
  crest: saltmereCrest,
  ground: saltmereGround,
  seaArc: [SEA_FROM, SEA_TO] as const,
});

// ------------------------------------------------------------------ the placement

/** The patrol craft's gun shield on its mount in the dock, from the dock's frame (garageFacilityDetails.ts). */
const CRANE_AT = [23.5, 22.15] as const;

export const SALTMERE_KIT: GarageKitPlacement = {
  items: [
    // the portal jib crane on its rails along the dock's far side, at work over the patrol craft's forecastle
    { kind: 'piece', key: 'saltmere-portal-jib', build: portalJibCrane, at: CRANE_AT, yaw: FACE_CAMERA, datum: true, y: 0.02, grounded: false },
    // gulls on the far bollards and the caisson's rail
    { kind: 'piece', key: 'saltmere-gull', build: gull, at: [20.15, 27.35], yaw: 0.6, datum: true, y: 0.74, grounded: false },
    { kind: 'piece', key: 'saltmere-gull', build: gull, at: [20.15, 32.55], yaw: -2.2, datum: true, y: 0.74, grounded: false },
    { kind: 'piece', key: 'saltmere-gull', build: gull, at: [9.05, 32.55], yaw: 2.6, datum: true, y: 0.74, grounded: false },
    // the slideshow's CRT on its stand on the far pierhead's plinth (garageSlideshowPlacement.ts), the brand on the caisson's rail
    { kind: 'piece', key: 'saltmere-plinth', build: pierheadPlinth, at: [23.5, 37.25], yaw: FACE_CAMERA, datum: true, grounded: false },
    { kind: 'display', display: 'pvc', rect: 'brand.banner.h', at: [17.7, 33.82], yaw: FACE_CAMERA, y: 1.25, size: [3.2, 0.5],
      options: { gap: 0.12 }, datum: true },
    // the harbour master's hut beyond the crane's runway, its desk and screens in the office window, its flag mast
    { kind: 'piece', key: 'saltmere-hut', build: harbourMasterHut, at: [30.4, 16.4], yaw: FACE_CAMERA - 0.35, datum: true },
    { kind: 'display', display: 'station', at: [30.42, 17.03], yaw: FACE_CAMERA - 0.35, y: HUT_FLOOR + 0.32, datum: true,
      screens: ['readout.armor.k2', 'map.coastal', 'readout.modules.abrams'], width: 2.2 },
    { kind: 'piece', key: 'saltmere-flag', build: flagMast, at: [27.6, 19.6], yaw: FACE_CAMERA, datum: true },
    { kind: 'display', display: 'plate', rect: 'brand.crest.metal', at: [28.35, 15.32], yaw: FACE_CAMERA - 0.35, y: 2.6,
      size: [0.5, 0.5], datum: true },
    // the fishermen's quay by the working fishery: lobster pots, the net frame, buoys, the notice board, the nameboard
    { kind: 'piece', key: 'saltmere-pots', build: lobsterPots, at: [-15.8, 20.8], yaw: FACE_CAMERA + 0.2 },
    { kind: 'piece', key: 'saltmere-pots-b', build: lobsterPots, at: [-13.6, 22.4], yaw: FACE_CAMERA - 0.5 },
    { kind: 'piece', key: 'saltmere-nets', build: netFrame, at: [-20.4, 18.6], yaw: FACE_CAMERA + 0.1 },
    { kind: 'piece', key: 'saltmere-buoys', build: buoyLine, at: [-11.4, 18.0], yaw: FACE_CAMERA - 0.2 },
    { kind: 'piece', key: 'saltmere-bollard', build: graniteBollard, at: [-9.2, 21.2], yaw: 0.4 },
    { kind: 'display', display: 'board', rects: ['still.coastal', 'still.verdant', 'still.alpine'], at: [-16.4, 16.2],
      yaw: FACE_CAMERA + 0.2, size: [2.6, 1.0], posts: 0.9 },
    { kind: 'display', display: 'nameboard', at: [-16.2, 10.8], yaw: FACE_CAMERA + 0.25, width: 2.6, posts: 1.1 },
    { kind: 'display', display: 'pvc', rect: 'brand.banner.h', at: [-19.4, 13.2], yaw: FACE_CAMERA + 0.2, y: 1.4, size: [3.4, 0.53],
      options: { gap: 0.2 } },
    { kind: 'sign', sign: 'post', rect: 'picto.speed10', at: [-13.6, 8.4], yaw: FACE_CAMERA, size: [0.6, 0.6] },
    // the parts and fuel cell on the left quay: a gas cage, the oil rack, the spill kit
    { kind: 'prop', name: 'gasCage', at: [-24.6, 16.0], yaw: FACE_CAMERA },
    { kind: 'prop', name: 'oilRack', at: [-27.8, 20.4], yaw: FACE_CAMERA },
    { kind: 'prop', name: 'spillBin', at: [-25.6, 19.4], yaw: FACE_CAMERA },
    // the shelters' flanks beside the turntable (the facility's primitive stations there gave way to these): the gas
    // cage by the Burlak's shelter, rigging and stores by the T-90M's
    { kind: 'prop', name: 'gasCage', at: [14.3, -4.7], yaw: -FACE_CAMERA },
    { kind: 'prop', name: 'pallet', at: [-13.9, -7.5], yaw: 0.1 },
    { kind: 'prop', name: 'ammoCrate', at: [-13.9, -7.5], yaw: 0.1, y: 0.14, blot: false },
    { kind: 'prop', name: 'coiledHose', at: [-12.5, -6.4], yaw: 0.5, params: { color: 0x8c7a55 } },
    { kind: 'prop', name: 'tarpStack', at: [-15.4, -8.8], yaw: 0.3 },
    // rust bleed and oil where the cage and the hut's door stand on the quay
    { kind: 'sign', sign: 'stencil', rect: 'decal.oil', at: [15.2, -3.6], yaw: 0.5, size: [1.6, 1.2] },
    { kind: 'sign', sign: 'stencil', rect: 'decal.grime', at: [29.2, 14.2], yaw: 0.9, size: [2.4, 1.4], datum: true },
    // the wet dock floor's puddles, standing between the keel blocks
    { kind: 'sign', sign: 'stencil', rect: 'decal.oil', at: [16.4, 25.0], yaw: 0.3, size: [1.4, 2.2], datum: true, y: -5.38 },
    { kind: 'sign', sign: 'stencil', rect: 'decal.grime', at: [17.0, 30.5], yaw: 1.2, size: [2.0, 1.3], datum: true, y: -5.38 },
  ],
  atmosphere: {
    drift: 0.012,
    cards: [
      // haze on the far shore: over the headland and the village, and a sea mist band far out past the islets
      atmosphereBand(polarOf(BEARING.headland - 0.25, 84, -1), polarOf(BEARING.headland + 0.2, 98, -1), 7, 'mist', 0.2),
      atmosphereBand(polarOf(BEARING.village - 0.35, 70, -0.5), polarOf(BEARING.village + 0.3, 72, -0.5), 6, 'mist', 0.6),
      atmosphereBand(polarOf(268 * DEG, 150, -2.3), polarOf(300 * DEG, 150, -2.3), 5, 'mist', 0.4),
      atmosphereBand(polarOf(150 * DEG, 150, -2.3), polarOf(184 * DEG, 150, -2.3), 5, 'mist', 0.7),
    ],
  },
};

function polarOf(bearing: number, radius: number, y: number): KitVec {
  return [Math.cos(bearing) * radius, y, Math.sin(bearing) * radius];
}

