// M1A1 family identity kits (release 233; owner 2026-10-21: "make the m1a1 HA, AIM, FEP, HC, and SA look a lot more
// different noticeably than each other. theyre kinda samey rn"). The five marks share the certified Tejas-family hull,
// turret and armour packages (profiles/abrams.ts buildTejasFamily); each now also carries the field kit its own service
// fit is recognised by, sized to read at Garage and battle distance:
//   m1a1ha            Desert Storm breach tank (1991): track-width mine plow carried raised for travel, a bustle rack
//                     piled with bedrolls, ration cases and water cans.
//   m1a1_abrams_hc    Heavy Common, USAREUR (1990s): a camouflage-net bundle and bedrolls strapped over the rack.
//   m1a1_abrams_aim   AIM, OIF (2004): combat identification panels on both bustle flanks and the rack and the FBCB2 /
//                     Blue Force Tracking dome (its SINCGARS pair of long whips comes from its decoration manifest).
//   m1a1_abrams_fep   USMC Firepower Enhancement Package: the second-generation FLIR head on the gunner's primary
//                     sight, the commander's remote thermal sight and the loader's thermal sight on his M240.
//   m1a1_abrams_sa    Situational Awareness with TUSK: the bustle-rack extension, the TUSK tank-infantry phone and the
//                     SA thermal head on the gunner's primary sight.
// Every item is equipment (no armour or hit-model ownership) and every group that rests on the vehicle is authored inside
// P.snapGroup, so the factory seats it on the stock under it. Each mark's paint lives in camoPolicy.ts (sig_<id>).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { box, cylX, cylY, cylZ, sph, torus, xform } from '../factoryGeometry.ts';
import { fabricBody, fabricStrap, type FabricSpec } from '../accessoryPrimitives.ts';
import { FITTINGS } from './kit.ts';
import { ammoCanParts } from './fieldChest.ts';
import type { SnapGroupOptions } from '../tankFactoryCore.ts';

type Vec3 = readonly [number, number, number];

/** The part of the Abrams builder port the identity kits use (profiles/abrams.ts AbramsBuilderPort satisfies it). */
interface AbramsIdentityPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly mats: Record<string, THREE.MeshStandardMaterial>;
  readonly disposables: Array<{ dispose(): void }>;
  readonly q: boolean;
  readonly spec: { readonly id: string };
  add(slot: string, geometry: THREE.BufferGeometry, x?: number, y?: number, z?: number,
    rx?: number, ry?: number, rz?: number): void;
  addEquipment(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  snapGroup(label: string, build: () => void, options?: SnapGroupOptions): void;
}

// Turret-local datums of the Tejas-family bustle (profiles/abrams.ts TEJAS_TURRET; turret rig at the ring).
const RACK_TOP_Y = 0.87;            // rack rail tops (railTopFlush)
const RACK_FLOOR_Y = 0.31;          // rack floor seat (rackCans rkY)
const RACK_FRONT_Z = -3.165;        // bustle rear wall
const RACK_REAR_Z = -3.505;         // rack rear fence
const RACK_HALF_W = 1.07;
const RACK_MID_Z = (RACK_FRONT_Z + RACK_REAR_Z) / 2;
// Gunner's primary sight doghouse (tejasRoofKit, non-CWS roofs): head box (0.52 x 0.10 x 0.38) at (0.78, 0.60, 1.05).
const GPS_X = 0.78;
const GPS_TOP_Y = 0.65;
const GPS_Z = 1.05;

/** A box beam of section w x h running from a to b (its length axis on the segment). */
function beam(a: Vec3, b: Vec3, w: number, h: number): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const len = dir.length();
  const geometry = box(w, h, len);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  geometry.applyMatrix4(new THREE.Matrix4().compose(from.add(to).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return geometry;
}

/** A closed prism: the (z, y) outline extruded across x from x0 to x1 (world orientation, no further transform). */
function prismAcrossX(outline: ReadonlyArray<readonly [number, number]>, x0: number, x1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  outline.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, steps: 1, bevelEnabled: false, curveSegments: 4 });
  // shape (u = -z, v = y, w) -> world (x = w, y = v, z = -u): a quarter turn about +Y, then out to x0
  geometry.rotateY(Math.PI / 2);
  geometry.translate(x0, 0, 0);
  return geometry;
}

/** A soft roll or bag along local +Z with its webbing straps, placed at (x, y, z) and turned by yaw. */
function softLoad(P: AbramsIdentityPort, slot: string, strapSlot: string, spec: FabricSpec, at: Vec3, yaw: number): void {
  const body = fabricBody(spec);
  P.addEquipment(slot, body, at[0], at[1], at[2], 0, yaw, 0);
  for (const z of spec.cinch || []) {
    P.addEquipment(strapSlot, fabricStrap(spec, z, 0.032, 0.006), at[0], at[1], at[2], 0, yaw, 0);
  }
}

function roll(len: number, r: number, cinch: readonly number[], seedWrinkle = 0.05): FabricSpec {
  return { len, hw: r, hh: r * 0.92, exponent: 2.2, endScale: 0.82, endLength: 0.08, flatten: 0.22,
    wrinkle: seedWrinkle, cinch, cinchDepth: 0.07 };
}

/** A row of M2A1 ammunition cans standing on y (issue drab, dark hardware). */
function ammoCans(P: AbramsIdentityPort, owner: 'turret' | 'hull', xs: readonly number[], y: number, z: number, yaw = 0): void {
  for (const x of xs) {
    const can = ammoCanParts(P.q);
    for (const g of can.paint) P.addEquipment(owner, g, x, y, z, 0, yaw, 0);
    for (const g of can.dark) P.addEquipment(`${owner}Dark`, g, x, y, z, 0, yaw, 0);
  }
}

/** A ration (MRE) case: a corrugated carton with its binding strap. */
function rationCase(P: AbramsIdentityPort, x: number, y: number, z: number, yaw: number): void {
  P.addEquipment('turretCanvasPale', box(0.42, 0.24, 0.27), x, y + 0.12, z, 0, yaw, 0);
  P.addEquipment('turretDark', box(0.43, 0.016, 0.035), x, y + 0.236, z, 0, yaw, 0);
  P.addEquipment('turretDark', box(0.035, 0.248, 0.278), x, y + 0.122, z, 0, yaw, 0);
}

/** Height of a soft load's centre over the surface it rests on: its pressed base sinks 4 mm into that surface. */
function restY(spec: FabricSpec): number {
  return spec.hh * (1 - (spec.flatten ?? 0)) - 0.004;
}

/** A canvas cover strapped over the rack's rails: the deck the over-rack load rests on (its top is returned). */
function rackCover(P: AbramsIdentityPort, slot: string): number {
  const t = 0.024, y = RACK_TOP_Y - 0.003 + t / 2;
  P.addEquipment(slot, box(2 * RACK_HALF_W + 0.03, t, RACK_FRONT_Z - RACK_REAR_Z + 0.02), 0, y, RACK_MID_Z);
  // two tie-down straps over the cover's front and rear edges into the rails
  for (const z of [RACK_FRONT_Z - 0.05, RACK_REAR_Z + 0.05]) {
    P.addEquipment('turretDark', box(0.035, 0.006, 0.05), -0.70, y + t / 2 + 0.002, z);
    P.addEquipment('turretDark', box(0.035, 0.006, 0.05), 0.70, y + t / 2 + 0.002, z);
  }
  return y + t / 2;
}

// ---------------------------------------------------------------------------------------------------------------------
// M1A1HA — Desert Storm breach tank

/**
 * Track-width mine plow (TWMP) in its raised travel position on the M1A1HA's bow. Hull frame (world coordinates):
 * the lift beam crosses in front of the nose on two hull brackets that bite into the lower glacis; each blade unit
 * hangs on two push arms in front of its track, its curved moldboard, skids and tines 0.40 m over the ground. The
 * blades sit outside the gun lane, and the beam's crown (1.05 m) stays under the 10-degree depressed bore there.
 */
function addMinePlow(P: AbramsIdentityPort): void {
  const BEAM_Z = 4.04, BEAM_Y = 0.98, BLADE_X0 = 0.94, BLADE_X1 = 1.86;
  // Hull brackets: from inside the nose casting out to the beam.
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(0.22, 0.26, 0.42), side * 0.56, 0.96, 3.86);
    P.addEquipment('hullDark', cylX(0.032, 0.27, P.q ? 12 : 8), side * 0.56, BEAM_Y, BEAM_Z);   // pivot pin
    // electro-hydraulic lift ram from the upper bracket to the beam arm
    P.addEquipment('hullDark', beam([side * 0.70, 1.17, 3.84], [side * 0.70, 1.02, 4.10], 0.06, 0.06));
    P.addEquipment('hullDetail', box(0.10, 0.09, 0.14), side * 0.70, 1.19, 3.84);
  }
  P.addEquipment('hullDetail', box(3.74, 0.15, 0.17), 0, BEAM_Y, BEAM_Z);                        // lift beam
  // Mounting frame (blind critic r1: the blades read "hung on rather than mounted"): a lower frame bar across the nose
  // and a diagonal strut from each beam end back to it, so every blade unit is carried by a braced triangle.
  // (the bar passes through both hull brackets, which carry it into the nose)
  P.addEquipment('hullDetail', box(2.02, 0.12, 0.14), 0, 0.80, 3.75);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', beam([side * 1.80, BEAM_Y - 0.02, BEAM_Z - 0.04], [side * 0.96, 0.80, 3.77], 0.08, 0.09));
    P.addEquipment('hullDetail', beam([side * 1.30, BEAM_Y - 0.04, BEAM_Z - 0.05], [side * 0.78, 0.81, 3.77], 0.07, 0.08));
  }
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? BLADE_X0 : -BLADE_X1, x1 = side > 0 ? BLADE_X1 : -BLADE_X0;
    // Moldboard: a curved 20 mm plate, concave forward, its cutting edge low and leading.
    const face: Array<[number, number]> = [[4.74, 0.38], [4.63, 0.54], [4.555, 0.72], [4.515, 0.90], [4.52, 1.04],
      [4.565, 1.12]];
    const back = face.map(([z, y]) => [z - 0.03, y - 0.004] as [number, number]).reverse();
    P.addEquipment('hullDetail', prismAcrossX([...face, ...back], x0, x1));
    // Back stiffeners and the two push arms to the lift beam.
    for (const fx of [0.16, 0.50, 0.84]) {
      const x = x0 + (x1 - x0) * fx;
      P.addEquipment('hullDetail', prismAcrossX([[4.525, 0.46], [4.495, 1.04], [4.42, 0.99], [4.45, 0.50]], x - 0.025, x + 0.025));
    }
    for (const fx of [0.22, 0.78]) {
      const x = x0 + (x1 - x0) * fx;
      P.addEquipment('hullDetail', beam([x, BEAM_Y - 0.02, BEAM_Z + 0.06], [x, 0.74, 4.48], 0.10, 0.12));
    }
    // Skids under the moldboard ends (depth shoes) and the cutting tines along its edge.
    for (const x of [x0 + 0.06, x1 - 0.06]) {
      P.addEquipment('hullDetail', box(0.06, 0.07, 0.40), x, 0.43, 4.50);
      P.addEquipment('hullDetail', beam([x, 0.47, 4.36], [x, 0.66, 4.50], 0.05, 0.05));
    }
    const tines = P.q ? 6 : 4;
    for (let i = 0; i < tines; i++) {
      const x = x0 + 0.09 + (x1 - x0 - 0.18) * (i / (tines - 1));
      P.addEquipment('hullDark', beam([x, 0.47, 4.66], [x, 0.34, 4.82], 0.07, 0.06));
    }
  }
  // The dog-bone chain links the two blade units low across the centre.
  const chain = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.95, 0.50, 4.50), new THREE.Vector3(-0.45, 0.42, 4.52), new THREE.Vector3(0, 0.40, 4.53),
    new THREE.Vector3(0.45, 0.42, 4.52), new THREE.Vector3(0.95, 0.50, 4.50),
  ], false, 'centripetal'), 16, 0.018, 6, false);
  P.addEquipment('hullDark', chain);
  P.hullG.userData.m1a1haMinePlowReceipt = Object.freeze({
    designFamily: 'cot-twmp-travel-v1', bladeUnits: 2, bladeBottomY: 0.31, beamTopY: BEAM_Y + 0.075,
    forwardZ: 4.85, mountedOn: 'lower-glacis-brackets', equipmentOwned: true,
  });
}

function addDesertStormStowage(P: AbramsIdentityPort): void {
  // A cargo deck of two battens over the rack, then bedrolls, ration cases and a tarp-wrapped bundle on it.
  P.snapGroup('m1a1ha-rack-top-load', () => {
    const deck = rackCover(P, 'turretCanvasPale');
    const left = roll(0.86, 0.12, [-0.28, 0.28]), right = roll(0.70, 0.11, [-0.22, 0.22], 0.07);
    softLoad(P, 'turretCloth', 'turretDark', left, [-0.55, deck + restY(left), RACK_MID_Z], Math.PI / 2);
    softLoad(P, 'turretCanvasPale', 'turretDark', right, [0.62, deck + restY(right), RACK_MID_Z], Math.PI / 2);
    rationCase(P, 0.06, deck - 0.003, RACK_MID_Z + 0.01, 0.04);
  }, { reachM: 0.06, mode: 'down' });
  // Four 20 l water cans on a shelf hung from the rack's rear fence.
  P.snapGroup('m1a1ha-rack-water-cans', () => {
    const shelfZ = RACK_REAR_Z - 0.21;
    P.addEquipment('turretDetail', box(0.96, 0.025, 0.40), 0.30, RACK_FLOOR_Y - 0.0125, shelfZ);
    for (const x of [-0.13, 0.73]) {
      P.addEquipment('turretDetail', beam([x, RACK_FLOOR_Y - 0.02, shelfZ - 0.18], [x, RACK_TOP_Y - 0.10, RACK_REAR_Z - 0.01],
        0.03, 0.03));
    }
    const cans = FITTINGS.jerryCans({ mats: P.mats, count: 4, gap: 0.05, seed: 1991, slot: 'canvasPale' });
    cans.position.set(0.30, RACK_FLOOR_Y, shelfZ);
    P.turretG.add(cans);
  }, { reachM: 0.05 });
  // Ammunition cans for the coax lashed on the bustle roof beside the blow-off panels.
  P.snapGroup('m1a1ha-roof-ammo', () => ammoCans(P, 'turret', [-1.02, -0.70], 0.762, -2.62, Math.PI / 2),
    { reachM: 0.05, mode: 'down' });
}

// ---------------------------------------------------------------------------------------------------------------------
// M1A1 HC — USAREUR Heavy Common

function addHeavyCommonStowage(P: AbramsIdentityPort): void {
  P.snapGroup('m1a1hc-net-bundle', () => {
    const deck = rackCover(P, 'turretCloth');
    // The woodland camouflage net folded into one long bundle across the rack, with two bedrolls lashed on its ends.
    const net: FabricSpec = { len: 1.20, hw: 0.16, hh: 0.13, exponent: 2.8, endScale: 0.62, endLength: 0.10, flatten: 0.30,
      wrinkle: 0.09, cinch: [-0.40, 0, 0.40], cinchDepth: 0.10 };
    softLoad(P, 'turretCloth', 'turretDark', net, [-0.30, deck + restY(net), RACK_MID_Z], Math.PI / 2);
    const bed = roll(0.62, 0.10, [-0.2, 0.2]);
    softLoad(P, 'turretCloth', 'turretDark', bed, [0.68, deck + restY(bed), RACK_MID_Z + 0.02], Math.PI / 2);
  }, { reachM: 0.06, mode: 'down' });
  // Two fuel cans in a bracket on the bustle roof's right rear corner.
  P.snapGroup('m1a1hc-roof-cans', () => {
    const cans = FITTINGS.jerryCans({ mats: P.mats, count: 2, gap: 0.04, seed: 1996, slot: 'detail' });
    cans.position.set(0.64, 0.752, -2.86);
    P.turretG.add(cans);
  }, { reachM: 0.05, mode: 'down' });
}

// ---------------------------------------------------------------------------------------------------------------------
// M1A1 AIM — OIF combat identification and digital radio fit

/** A combat identification panel (CIP): a thermal-film panel in a steel frame on two stand-off brackets. */
function addCip(P: AbramsIdentityPort, label: string, center: Vec3, yaw: number, w: number, h: number,
  feet: readonly Vec3[]): void {
  P.snapGroup(label, () => {
    const panel = box(w, h, 0.018);
    panel.userData.issueDrab = true;
    P.addEquipment('turret', panel, center[0], center[1], center[2], 0, yaw, 0);
    const frame = [box(w + 0.04, 0.035, 0.03), box(w + 0.04, 0.035, 0.03), box(0.035, h, 0.03), box(0.035, h, 0.03)];
    const off: Vec3[] = [[0, h / 2, 0], [0, -h / 2, 0], [-w / 2, 0, 0], [w / 2, 0, 0]];
    const s = Math.sin(yaw), c = Math.cos(yaw);
    frame.forEach((g, i) => {
      const [ox, oy] = off[i];
      P.addEquipment('turretDetail', g, center[0] + ox * c, center[1] + oy, center[2] - ox * s, 0, yaw, 0);
    });
    // each stand-off arm runs square to the panel from its foot on the vehicle and bites 3 mm into the panel's back
    const n = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    for (const foot of feet) {
      const d = new THREE.Vector3(center[0] - foot[0], center[1] - foot[1], center[2] - foot[2]).dot(n) - 0.006;
      P.addEquipment('turretDetail', beam(foot, [foot[0] + n.x * d, foot[1], foot[2] + n.z * d], 0.035, 0.05));
    }
  }, { reachM: 0.10 });
}

function addAimFit(P: AbramsIdentityPort): void {
  // Bustle-flank CIPs, vertical on brackets standing off the stowage bays, and a third on the rack's rear fence.
  for (const side of [-1, 1]) {
    const x = side * 1.80;
    addCip(P, `m1a1aim-cip-${side > 0 ? 'right' : 'left'}`, [x, 0.42, -2.58], side * Math.PI / 2, 0.70, 0.56,
      // feet sink into the tumblehome wall (x 1.61 at y 0.30, 1.53 at y 0.56) and the bays on the left flank
      [[side * 1.56, 0.30, -2.40], [side * 1.45, 0.56, -2.76]]);
  }
  addCip(P, 'm1a1aim-cip-rear', [0.36, 0.58, RACK_REAR_Z - 0.06], 0, 0.72, 0.50,
    [[0.04, 0.58, RACK_REAR_Z + 0.01], [0.68, 0.58, RACK_REAR_Z + 0.01]]);
  // (The SINCGARS pair of long whips is the AIM's decoration manifest, decorations.ts.)
  // FBCB2 / Blue Force Tracking: the satellite dome on its short mast over the bustle roof.
  P.snapGroup('m1a1aim-bft-dome', () => {
    P.addEquipment('turretDetail', cylY(0.10, 0.12, 0.05, P.q ? 18 : 10), -0.42, 0.775, -2.30);
    P.addEquipment('turretDark', cylY(0.035, 0.04, 0.16, 10), -0.42, 0.875, -2.30);
    P.addEquipment('turretDetail', cylY(0.15, 0.15, 0.035, P.q ? 24 : 12), -0.42, 0.965, -2.30);
    P.addEquipment('turretCanvasPale', xform(sph(0.15, P.q ? 20 : 10, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.72, 1]),
      -0.42, 0.98, -2.30);
  }, { reachM: 0.06, mode: 'down' });
}

// ---------------------------------------------------------------------------------------------------------------------
// FLIR heads on the gunner's primary sight (FEP and SA)

function addGpsFlirHead(P: AbramsIdentityPort, label: string, w: number, h: number, d: number, hood: boolean): void {
  P.snapGroup(label, () => {
    const y = GPS_TOP_Y + h / 2 - 0.012;
    const z = GPS_Z - 0.02;
    P.addEquipment('turret', box(w, h, d), GPS_X, y, z);
    P.addEquipment('turretDetail', box(w + 0.02, 0.022, d + 0.02), GPS_X, y + h / 2 + 0.011, z);
    const faceZ = z + d / 2;
    P.addEquipment('turretDark', box(w * 0.78, h * 0.62, 0.022), GPS_X, y - 0.004, faceZ + 0.006);
    P.addEquipment('turretGlass', box(w * 0.66, h * 0.44, 0.012), GPS_X, y - 0.004, faceZ + 0.019);
    // armoured door hinges either side of the window
    for (const sx of [-1, 1]) P.addEquipment('turretDark', cylY(0.016, 0.016, h * 0.58, 8), GPS_X + sx * w * 0.42, y, faceZ + 0.01);
    if (hood) {
      // SA: the sun hood over the window and its side cheeks
      P.addEquipment('turret', box(w + 0.03, 0.022, 0.12), GPS_X, y + h * 0.34, faceZ + 0.05);
      for (const sx of [-1, 1]) P.addEquipment('turret', box(0.02, h * 0.55, 0.12), GPS_X + sx * (w / 2 + 0.005), y + 0.02, faceZ + 0.05);
    }
  }, { reachM: 0.05, mode: 'down' });
}

// ---------------------------------------------------------------------------------------------------------------------
// M1A1 FEP — USMC Firepower Enhancement Package

/** The loader's thermal weapon sight rides his M240 (on the pitching gun, so it follows the working station). */
function addLoaderThermalSight(P: AbramsIdentityPort): void {
  const station = P.turretG.children.find((child) => child.name.startsWith('fitting_abramsLoaderM240_'));
  const body = station?.getObjectByName('americanM240Body');
  const carrier = body?.parent;
  if (!station || !body || !carrier) return;
  const bodyBox = new THREE.Box3().setFromObject(body);
  carrier.updateWorldMatrix(true, false);
  const toCarrier = new THREE.Matrix4().copy(carrier.matrixWorld).invert();
  // the receiver's top centre and its length, in the carrier's frame
  const top = new THREE.Vector3((bodyBox.min.x + bodyBox.max.x) / 2, bodyBox.max.y, (bodyBox.min.z + bodyBox.max.z) / 2)
    .applyMatrix4(toCarrier);
  const sight = new THREE.Group();
  sight.name = 'fepLoaderThermalSight';
  const parts: Array<[THREE.BufferGeometry, THREE.Material]> = [
    [xform(box(0.07, 0.075, 0.20), 0, 0.050, -0.02), P.mats.dark],                  // sight body
    [xform(cylZ(0.034, 0.05, 12), 0, 0.055, 0.105), P.mats.dark],                   // objective barrel
    [xform(cylZ(0.026, 0.006, 12), 0, 0.055, 0.132), P.mats.glass ?? P.mats.dark],  // objective glass
    [xform(cylZ(0.022, 0.05, 10), 0, 0.050, -0.145), P.mats.dark],                  // eyepiece
    [xform(box(0.05, 0.016, 0.12), 0, 0.006, 0), P.mats.dark],                      // rail mount on the receiver cover
  ];
  for (const [geometry, material] of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    sight.add(mesh);
    P.disposables.push(geometry);
  }
  sight.position.copy(top);
  carrier.add(sight);
  station.userData.loaderThermalSight = Object.freeze({ host: P.spec.id, seat: 'receiver-cover-rail', pitchesWithGun: true });
}

function addFepFit(P: AbramsIdentityPort): void {
  addGpsFlirHead(P, 'm1a1fep-gps-flir', 0.46, 0.17, 0.30, false);
  addLoaderThermalSight(P);
  // Commander's remote thermal sight (CRTS) on a short armoured mast beside the commander's hatch.
  P.snapGroup('m1a1fep-crts', () => {
    const x = -1.12, z = -0.30, base = 0.79;
    P.addEquipment('turretDetail', cylY(0.07, 0.08, 0.04, P.q ? 16 : 10), x, base + 0.02, z);
    P.addEquipment('turret', cylY(0.042, 0.048, 0.18, 12), x, base + 0.13, z);
    P.addEquipment('turret', box(0.20, 0.14, 0.22), x, base + 0.29, z + 0.01);
    P.addEquipment('turretDetail', box(0.215, 0.02, 0.235), x, base + 0.37, z + 0.01);
    P.addEquipment('turretDark', box(0.15, 0.085, 0.02), x, base + 0.29, z + 0.125);
    P.addEquipment('turretGlass', box(0.12, 0.06, 0.012), x, base + 0.29, z + 0.137);
  }, { reachM: 0.08, mode: 'down' });
  // USMC rack load: ammunition cans and a sea bag over the rack.
  P.snapGroup('m1a1fep-rack-load', () => {
    const deck = rackCover(P, 'turretCloth');
    ammoCans(P, 'turret', [0.42, 0.74], deck - 0.003, RACK_MID_Z, Math.PI / 2);
    const seaBag: FabricSpec = { len: 0.72, hw: 0.15, hh: 0.13, exponent: 3, endScale: 0.55, endLength: 0.14,
      flatten: 0.3, wrinkle: 0.07, cinch: [-0.2, 0.2], cinchDepth: 0.08 };
    softLoad(P, 'turretCloth', 'turretDark', seaBag, [-0.45, deck + restY(seaBag), RACK_MID_Z], Math.PI / 2);
  }, { reachM: 0.06, mode: 'down' });
}

// ---------------------------------------------------------------------------------------------------------------------
// M1A1 SA — Situational Awareness with TUSK

function addSaFit(P: AbramsIdentityPort): void {
  addGpsFlirHead(P, 'm1a1sa-gps-flir', 0.40, 0.19, 0.28, true);
  // Bustle-rack extension: a second open lattice basket hung behind the rack, loaded.
  P.snapGroup('m1a1sa-bustle-rack-extension', () => {
    const depth = 0.42;
    const rack = FITTINGS.stowageRack({ mats: P.mats, w: 2.06, d: depth, h: 0.46, rails: 2, posts: 7, mesh: true,
      fill: 0.82, seed: 2008, rotation: [0, Math.PI, 0] });
    rack.position.set(0, RACK_FLOOR_Y - 0.02, RACK_REAR_Z - 0.03 - depth / 2);
    rack.name = 'm1a1sa_bustle_rack_extension';
    P.turretG.add(rack);
    // hanger brackets from the rack's floor rail and top rail into the extension
    for (const x of [-0.86, 0, 0.86]) {
      P.addEquipment('turretDetail', box(0.05, 0.04, 0.10), x, RACK_FLOOR_Y - 0.01, RACK_REAR_Z - 0.03);
      P.addEquipment('turretDetail', box(0.05, 0.04, 0.10), x, RACK_TOP_Y - 0.04, RACK_REAR_Z - 0.03);
    }
  }, { reachM: 0.05 });
  // TUSK tank-infantry phone box on the right rear of the hull.
  P.snapGroup('m1a1sa-tusk-phone', () => {
    const x = 1.30, y = 1.50, z = -3.99;
    P.addEquipment('hullDetail', box(0.20, 0.26, 0.10), x, y, z);
    P.addEquipment('hullDetail', box(0.21, 0.02, 0.11), x, y + 0.14, z);
    P.addEquipment('hullDark', box(0.06, 0.16, 0.04), x - 0.04, y - 0.01, z - 0.065);
    P.addEquipment('hullDark', torus(0.035, 0.008, 10), x + 0.06, y - 0.06, z - 0.06);
  }, { reachM: 0.10 });
}

/** The variant's identity kit; the base M1A1 (the family reference) and other hulls get none. */
export function addM1A1VariantIdentity(P: AbramsIdentityPort): void {
  switch (P.spec.id) {
    case 'm1a1ha': addMinePlow(P); addDesertStormStowage(P); break;
    case 'm1a1_abrams_hc': addHeavyCommonStowage(P); break;
    case 'm1a1_abrams_aim': addAimFit(P); break;
    case 'm1a1_abrams_fep': addFepFit(P); break;
    case 'm1a1_abrams_sa': addSaFit(P); break;
    default: return;
  }
  P.turretG.userData.m1a1IdentityKit = Object.freeze({ host: P.spec.id, release: 233 });
}
