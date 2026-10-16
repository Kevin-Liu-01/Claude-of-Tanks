// src/world/wreckDebris.ts — what a burnt-out tank leaves round it, built from a tank's own kinds of parts and seated
// piece by piece on the ground (Lane C, #8 r2, 2026-10-14).
//
// The census graded the old debris 0: "BoxGeometry pads and CylinderGeometry discs, mostly buried whole" — plain boxes
// for the torn track, ten-sided discs for the road wheels, thin boxes for the plates, all laid in the hulk's own sunk
// plane, so about two thirds of them lay wholly under the terrain and a few floated over slopes. Now:
//   - the thrown track is a run of linked shoes (plates with their guide horns, the pins across their hinges and, on a
//     post-war track, the end connectors), lying inner face up in short runs that snake away from a sprocket;
//   - the road wheels are wheels: a tyre band (rubber; steel on a wartime all-steel wheel), the dished disc, the hub cap
//     and the nuts on the bolt circle, lying flat or leaning on an edge;
//   - torn armour folded along a tear with the primer showing on the torn edge, a bent skirt or fender, a stowage bin
//     with its lid sprung, a hatch lid, a drum or jerrycan, and on a post-war hulk its roof machine gun;
//   - every piece is seated on the terrain under its own footprint (planGroundedObbPose, a 2 cm embed), not in the
//     hulk's plane, so nothing is buried whole and nothing floats.
// Built in the vehicle toolkit (vehicleMesh.ts) in the burnt state's colours; the streams the wreck merge takes
// (position, normal, colour; indexed). Deterministic by seed; no Math.random, no clock.
import * as THREE from 'three';
import { VehicleMesh, linearHex, material, vehicleWeathering } from './maps/vehicleMesh.ts';
import { planGroundedObbPose } from './propPlacement.ts';
import type { HeightField } from './terrain.ts';
import { keepStreams } from './geometryStreams.ts';

const STEEL = material('steel', [0.07, 0.064, 0.058], 0.7, 0.4, 0, 1);
const STEEL_DARK = material('steel', [0.035, 0.032, 0.03], 0.75, 0.35, 0, 1);
const RUST = material('rust', linearHex(0x5a2c16), 0.85, 0.1, 0, 1);
const PRIMER = material('paint', linearHex(0x7a3424), 0.75, 0, 0, 1);
const RUBBER = material('rubber', [0.028, 0.026, 0.024], 0.9, 0, 0, 1);
const CANVAS = material('canvas', linearHex(0x3a362c), 0.95, 0, 0, 1);

/** One piece in the hulk's frame: where it lies (x, z), its heading, and its footprint's half extents for the seat. */
export interface WreckDebrisPiece {
  geo: THREE.BufferGeometry;
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hl: number;
}

export interface WreckDebris {
  pieces: WreckDebrisPiece[];
  tris: number;
}

export interface WreckDebrisOptions {
  /** A post-war vehicle (rubber-tyred wheels, end connectors, a roof machine gun); wartime: all-steel, single horns. */
  modern?: boolean;
  /** The hulk's ground contact in its frame [minX, maxX, minZ, maxZ] (wrecks.ts WreckBake.contact): the debris lies round
   *  it, the thrown track off one side of it. */
  contact?: readonly [number, number, number, number];
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The toolkit mesh to the wreck merge's streams, its base on y = 0 (and its footprint's half extents). */
function finish(mesh: VehicleMesh, seed: number): { geo: THREE.BufferGeometry; hw: number; hl: number } {
  // (built fresh with its three streams, never trimmed: deleteAttribute leaves the attributes in V8's dictionary mode)
  const geo = keepStreams(mesh.build(vehicleWeathering({
    dirtRgb: linearHex(0x2c2620), dirt: 0.5, dirtTop: 0.4, dustRgb: linearHex(0x4a4238), dust: 0.25, rust: 0.6,
    burnt: true, wheels: [], seed, voxelAo: false,
  })), ['position', 'normal', 'color']);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  geo.translate(0, -b.min.y, 0);
  delete geo.userData.noCollisionVertices;
  delete geo.userData.bodyBox;
  return { geo, hw: Math.max(0.05, Math.max(-b.min.x, b.max.x)), hl: Math.max(0.05, Math.max(-b.min.z, b.max.z)) };
}

/** A short run of linked track shoes lying inner face up (along z): plates, guide horns, the pins across the hinges and,
 *  post-war, the end connectors; one shoe of a run may lie flipped, its grouser up. */
function trackRun(rng: () => number, modern: boolean, shoes: number, seed: number) {
  const mesh = new VehicleMesh();
  const tw = modern ? 0.63 : 0.7, pitch = modern ? 0.19 : 0.16, t = 0.045;
  const z0 = -((shoes - 1) * pitch) / 2;
  for (let k = 0; k < shoes; k++) {
    const z = z0 + k * pitch, dip = (rng() - 0.5) * 0.03;
    mesh.push().translate(0, t / 2 + Math.max(0, dip), z).rotateX((rng() - 0.5) * 0.12);
    mesh.box(0, 0, 0, tw, t, pitch * 0.9, k % 4 === 3 ? RUST : STEEL, 0);
    const flipped = rng() < 0.12;
    if (flipped) mesh.box(0, t / 2 + 0.02, 0, tw, 0.04, 0.035, STEEL_DARK, 0);
    else if (modern) for (const x of [-0.09, 0.09]) mesh.box(x, t / 2 + 0.055, 0, 0.05, 0.11, 0.07, STEEL_DARK, 0);
    else mesh.box(0, t / 2 + 0.06, 0, 0.06, 0.12, 0.08, STEEL_DARK, 0);
    mesh.pop();
    if (k + 1 < shoes) {
      mesh.box(0, t * 0.6, z + pitch / 2, tw * 1.02, 0.028, 0.028, STEEL_DARK, 0);
      if (modern) for (const sx of [-1, 1]) mesh.box(sx * (tw / 2 + 0.03), t * 0.6, z + pitch / 2, 0.05, 0.06, 0.09, STEEL_DARK, 0);
    }
  }
  return finish(mesh, seed);
}

/** A road wheel: the tyre band, the dished disc, the hub cap and the nuts round it (axis x), lying flat or leaning. */
function roadWheel(rng: () => number, modern: boolean, seed: number) {
  const mesh = new VehicleMesh();
  const r = modern ? 0.33 + rng() * 0.05 : 0.3, w = modern ? 0.2 : 0.17, lean = Math.PI / 2 - (rng() < 0.4 ? 0.2 + rng() * 0.25 : rng() * 0.08);
  // lean: the axis tipped up from horizontal (pi/2: the wheel lies flat; a little less: one edge up on the rubble)
  mesh.push().rotateZ(lean);
  const band = modern ? RUBBER : STEEL;
  mesh.lathe([[r * 0.8, -w / 2], [r * 0.97, -w / 2], [r, -w * 0.3], [r, w * 0.3], [r * 0.97, w / 2], [r * 0.8, w / 2]], 14, () => band, { flip: true });
  mesh.lathe([[r * 0.8, w * 0.42], [r * 0.45, w * 0.3], [r * 0.2, w * 0.36], [0.0001, w * 0.36]], 12, () => STEEL);
  mesh.lathe([[0.0001, -w * 0.4], [r * 0.8, -w * 0.4]], 12, () => STEEL_DARK, { flip: true });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    mesh.box(w * 0.4, Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, 0.035, 0.04, 0.04, RUST, 0);
  }
  mesh.pop();
  return finish(mesh, seed);
}

/** Torn armour: a plate folded along its tear, the primer showing on the torn edge. */
function tornPlate(rng: () => number, modern: boolean, seed: number) {
  const mesh = new VehicleMesh();
  const wd = 0.55 + rng() * 0.5, d1 = 0.3 + rng() * 0.35, d2 = 0.2 + rng() * 0.3, th = modern ? 0.05 : 0.04, fold = 0.35 + rng() * 0.4;
  mesh.box(0, th / 2, d1 / 2, wd, th, d1, STEEL, 0);
  mesh.push().translate(0, 0, 0).rotateX(fold);
  mesh.box(0, th / 2, -d2 / 2, wd * (0.7 + rng() * 0.3), th, d2, STEEL, 0);
  mesh.box(0, th / 2, -d2, wd * 0.7, th * 1.05, 0.03, PRIMER, 0);
  mesh.pop();
  mesh.box(-wd / 2, th / 2, d1 / 2, 0.025, th * 1.05, d1 * 0.8, PRIMER, 0);
  return finish(mesh, seed);
}

/** A side skirt or fender bent along its length in three runs, its bolt flange along the top. */
function bentSkirt(rng: () => number, seed: number) {
  const mesh = new VehicleMesh();
  const len = 0.6 + rng() * 0.3, h = 0.45 + rng() * 0.2;
  let z = 0, yaw = 0;
  for (let k = 0; k < 3; k++) {
    mesh.push().translate(0, 0, z).rotateY(yaw);
    mesh.box(0, 0.03, len / 2, h, 0.03, len, k === 1 ? RUST : STEEL, 0);
    mesh.box(h / 2, 0.05, len / 2, 0.05, 0.06, len, STEEL_DARK, 0);
    mesh.pop();
    z += Math.cos(yaw) * len;
    yaw += (rng() - 0.5) * 0.6;
  }
  return finish(mesh, seed);
}

/** A stowage bin on its side, its lid sprung open on the hinge, a burnt bedroll half out of it. */
function stowageBin(rng: () => number, seed: number) {
  const mesh = new VehicleMesh();
  const w = 0.7 + rng() * 0.3, h = 0.32, d = 0.36;
  mesh.box(0, h / 2, 0, w, h, d, STEEL, 0);
  mesh.box(0, h * 0.5, 0, w - 0.04, h - 0.03, d - 0.03, STEEL_DARK, 0);
  mesh.push().translate(0, h, -d / 2).rotateX(-1.9);
  mesh.box(0, 0.015, d / 2, w, 0.03, d, STEEL, 0);
  mesh.pop();
  for (const x of [-w / 3, w / 3]) mesh.box(x, h, -d / 2, 0.06, 0.04, 0.04, RUST, 0);
  mesh.push().translate(w * 0.2, 0.1, d / 2 + 0.1).rotateZ(Math.PI / 2);
  mesh.lathe([[0.0001, -0.25], [0.1, -0.25], [0.1, 0.25], [0.0001, 0.25]], 8, () => CANVAS);
  mesh.pop();
  return finish(mesh, seed);
}

/** A hatch lid blown off its ring: the disc, its hinge block and the periscope's housing. */
function hatchLid(rng: () => number, modern: boolean, seed: number) {
  const mesh = new VehicleMesh();
  const r = modern ? 0.4 : 0.33;
  mesh.push().rotateZ(Math.PI / 2 - (rng() < 0.5 ? 0 : 0.2));
  mesh.lathe([[0.0001, -0.025], [r, -0.025], [r * 0.96, 0.04], [r * 0.6, 0.07], [0.0001, 0.07]], 14, () => STEEL);
  mesh.pop();
  mesh.box(r * 0.95, 0.06, 0, 0.12, 0.08, 0.3, STEEL_DARK, 0);
  if (modern) mesh.box(-r * 0.2, 0.12, 0.1, 0.16, 0.1, 0.12, STEEL_DARK, 0);
  return finish(mesh, seed);
}

/** A drum (wartime: the 200 l fuel drum with its chimes) or a jerrycan, burnt and on its side. */
function drum(rng: () => number, modern: boolean, seed: number) {
  const mesh = new VehicleMesh();
  if (!modern || rng() < 0.4) {
    mesh.push().translate(0, 0.29, 0).rotateY(Math.PI / 2);
    mesh.lathe([[0.0001, -0.44], [0.29, -0.44], [0.3, -0.42], [0.29, -0.4], [0.29, 0.4], [0.3, 0.42], [0.29, 0.44], [0.0001, 0.44]],
      12, () => RUST);
    mesh.pop();
  } else {
    mesh.box(0, 0.08, 0, 0.47, 0.16, 0.35, STEEL, 0);
    mesh.box(0.2, 0.17, 0, 0.08, 0.04, 0.12, STEEL_DARK, 0);
  }
  return finish(mesh, seed);
}

/** The roof machine gun (a .50 on its cradle): the receiver, the barrel and its jacket, the spade grips. */
function roofGun(rng: () => number, seed: number) {
  const mesh = new VehicleMesh();
  mesh.box(0, 0.09, 0, 0.2, 0.16, 0.6, STEEL_DARK, 0);
  mesh.tube([[0, 0.12, 0.3], [0, 0.1 - rng() * 0.06, 1.35]], 0.025, 6, STEEL_DARK, { caps: true });
  mesh.tube([[0, 0.12, 0.3], [0, 0.11, 0.62]], 0.045, 6, STEEL, { caps: true });
  for (const x of [-0.08, 0.08]) mesh.box(x, 0.1, -0.36, 0.035, 0.12, 0.08, STEEL_DARK, 0);
  mesh.box(0, 0.03, 0.05, 0.36, 0.06, 0.2, RUST, 0);
  return finish(mesh, seed);
}

/**
 * The debris of one hulk, piece by piece in its frame (+z its nose): a thrown track off one side from the rear, two or
 * three road wheels, torn plates, a bent skirt, a stowage bin, a hatch lid, a drum, and on a post-war hulk its roof gun,
 * each clear of the hull's ground contact.
 */
export function buildWreckDebris(seed: number, opts: WreckDebrisOptions = {}): WreckDebris {
  const rng = mulberry32((seed ^ 0x71ac5eed) >>> 0);
  const modern = opts.modern !== false;
  const [cx0, cx1, cz0, cz1] = opts.contact ?? (modern ? [-1.85, 1.85, -4.0, 4.0] : [-1.6, 1.6, -3.3, 3.3]);
  const pieces: WreckDebrisPiece[] = [];
  let serial = 0;
  const add = (made: { geo: THREE.BufferGeometry; hw: number; hl: number }, x: number, z: number, yaw: number): void => {
    pieces.push({ geo: made.geo, x, z, yaw, hw: made.hw, hl: made.hl });
  };
  // the thrown track: off one side, from the rear sprocket, in short runs snaking back and out
  const side = rng() < 0.5 ? -1 : 1;
  let x = side * ((side > 0 ? cx1 : -cx0) + 0.45), z = cz0 + 0.6, heading = Math.PI + side * (0.25 + rng() * 0.3);
  const runs = modern ? 4 : 3;
  for (let k = 0; k < runs; k++) {
    const shoes = 3 + ((rng() * 2) | 0);
    const made = trackRun(rng, modern, shoes, seed + serial++);
    const len = made.hl * 2;
    x += Math.sin(heading) * len * 0.5; z += Math.cos(heading) * len * 0.5;
    add(made, x, z, heading);
    x += Math.sin(heading) * (len * 0.5 + 0.04); z += Math.cos(heading) * (len * 0.5 + 0.04);
    heading += side * (rng() - 0.3) * 0.5;
  }
  // round the hull, clear of its contact: a ring of seats, each taken once
  const ring = (r0: number, r1: number): [number, number] => {
    const a = rng() * Math.PI * 2, r = r0 + rng() * (r1 - r0);
    const ex = Math.max(-cx0, cx1) + r, ez = Math.max(-cz0, cz1) + r;
    return [Math.sin(a) * ex, Math.cos(a) * ez];
  };
  const wheels = 2 + (rng() < 0.4 ? 1 : 0);
  for (let k = 0; k < wheels; k++) { const [px, pz] = ring(0.6, 2.6); add(roadWheel(rng, modern, seed + serial++), px, pz, rng() * Math.PI * 2); }
  for (let k = 0; k < 2; k++) { const [px, pz] = ring(0.8, 3.2); add(tornPlate(rng, modern, seed + serial++), px, pz, rng() * Math.PI * 2); }
  { const [px, pz] = ring(0.4, 1.6); add(bentSkirt(rng, seed + serial++), px, pz, rng() * Math.PI * 2); }
  { const [px, pz] = ring(0.5, 2.2); add(stowageBin(rng, seed + serial++), px, pz, rng() * Math.PI * 2); }
  { const [px, pz] = ring(0.8, 3.5); add(hatchLid(rng, modern, seed + serial++), px, pz, rng() * Math.PI * 2); }
  { const [px, pz] = ring(1.0, 3.0); add(drum(rng, modern, seed + serial++), px, pz, rng() * Math.PI * 2); }
  if (modern && rng() < 0.6) { const [px, pz] = ring(0.8, 2.8); add(roofGun(rng, seed + serial++), px, pz, rng() * Math.PI * 2); }
  let tris = 0;
  for (const p of pieces) tris += (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3;
  return { pieces, tris: tris | 0 };
}

const _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * The debris seated on the terrain, piece by piece (each on the ground under its own footprint, tilted to it, a 2 cm
 * embed), for a hulk at (x, z) heading `yaw`: the pieces in world space in the wreck merge's streams. With no height
 * field (the receipts' flat ground) every piece lies on y = 0. Consumes the pieces' geometries (one each, in order).
 */
export function seatWreckDebris(debris: WreckDebris, heightField: HeightField | null, x: number, z: number, yaw: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const s = Math.sin(yaw), c = Math.cos(yaw);
  for (const piece of debris.pieces) {
    const wx = x + piece.x * c + piece.z * s, wz = z - piece.x * s + piece.z * c, pyaw = yaw + piece.yaw;
    const g = piece.geo;
    g.rotateY(pyaw);
    if (heightField) {
      const pose = planGroundedObbPose(heightField, wx, wz, piece.hw, piece.hl, pyaw, 0.02);
      _q.setFromUnitVectors(_up, _n.set(pose.normalX, pose.normalY, pose.normalZ));
      g.applyQuaternion(_q);
      g.translate(wx, pose.y, wz);
    } else {
      g.translate(wx, 0, wz);
    }
    out.push(g);
  }
  return out;
}
