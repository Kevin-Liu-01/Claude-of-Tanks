import { KitBuilder, type KitVec } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';

/**
 * K1, the cranes (garage r9). Parametric lifting gear with real structure: every crane has a job, a support and its
 * connections, and the receipt each builder returns lists the parts a working crane cannot do without (rail or runway
 * with end stops, trolley and hoist, rope reeving and hook block, festoon or cable, capacity plate). A crane is either
 * AT WORK (hook down, slings or a lifting beam, a real load hanging plumb under the hook) or PARKED (hook up, bridge at
 * the runway end).
 *
 * All steel goes to the builder's vertex-colour solids (a pack's baked bucket: no draw of its own); capacity plates,
 * bridge numbers and beacons are atlas faces on the pack's one DISPLAY-LIT draw.
 *
 * Frames: metres, +Y up, the crane standing on y = 0. The overhead crane's runway runs along local Z, its span along X.
 */

type KitLoadKind = 'powerpack' | 'turret' | 'roadwheels' | 'barrel' | 'hull' | 'coil' | 'crate';

export interface KitCraneLoad {
  readonly kind: KitLoadKind;
  /** Rigging: four-leg slings to the load, a spreader (lifting) beam, or a C-hook (coils). */
  readonly rigging?: 'slings' | 'beam' | 'c-hook';
}

export interface KitCraneReceipt {
  readonly kind: string;
  readonly rail: boolean;
  readonly endStops: boolean;
  readonly trolley: boolean;
  readonly hoist: boolean;
  readonly reeving: boolean;
  readonly hookBlock: boolean;
  readonly festoon: boolean;
  readonly plate: boolean;
  readonly atWork: boolean;
  readonly load: KitLoadKind | null;
  /** The hook's point in the crane frame (the load hangs plumb under it). */
  readonly hook: KitVec;
  readonly triangles: number;
}

export interface OverheadCraneParams {
  /** Rail centre to rail centre (m). */
  readonly span: number;
  /** Runway length (m). */
  readonly runway: number;
  /** Rail top height above the floor (m). */
  readonly railY: number;
  readonly girders?: 1 | 2;
  /** Safe working load in tonnes (5, 20 or 40 pick the plate). */
  readonly swl?: 5 | 20 | 40;
  /** Bridge position along the runway, 0..1 (parked cranes sit at an end: 0 or 1). */
  readonly bridgeAt?: number;
  /** Trolley position across the span, 0..1. */
  readonly trolleyAt?: number;
  /** Height of the hook's bottom above the floor (a parked hook rides up under the girder). */
  readonly hookY?: number;
  readonly load?: KitCraneLoad | null;
  /** Build runway columns with corbels (false when a building's columns carry the runway). */
  readonly columns?: boolean;
  /** Column spacing along the runway (m). */
  readonly bay?: number;
  /** Bridge number shown on the girder (1-8). */
  readonly number?: number;
  /** The side the drive walkway and plates face (+1: +Z, -1: -Z). */
  readonly face?: 1 | -1;
}

const plateRect = (swl: number): string => (swl >= 40 ? 'plate.swl.40' : swl >= 20 ? 'plate.swl.20' : 'plate.swl.5');

/** A rope of `falls` parts from a drum (top) to a hook block (bottom), each part a thin 6-sided strand. */
function reeve(b: KitBuilder, top: KitVec, bottom: KitVec, falls: number, color: number): void {
  const offsets = falls >= 4 ? [[-0.07, -0.05], [0.07, -0.05], [-0.07, 0.05], [0.07, 0.05]] : [[-0.05, 0], [0.05, 0]];
  for (const [dx, dz] of offsets.slice(0, falls)) {
    b.tube([[top[0] + dx, top[1], top[2] + dz], [bottom[0] + dx * 0.6, bottom[1], bottom[2] + dz * 0.6]], 0.011, 6, color);
  }
}

/** A hook block hanging with its bottom at `hookY` under (x, z): sheave cheeks, the sheave, the hook and its latch. */
function hookBlock(b: KitBuilder, x: number, hookY: number, z: number, scale = 1): KitVec {
  const { skin } = b;
  const s = scale;
  const top = hookY + 0.95 * s;
  b.push().translate(x, 0, z);
  // the yellow-banded block; full-size blocks show their cheek plates and sheave
  b.box(0, top - 0.24 * s, 0, 0.36 * s, 0.46 * s, 0.1 * s, skin.accent, { bevel: 0.015 });
  if (s >= 0.6) {
    for (const side of [-1, 1]) b.box(0, top - 0.24 * s, side * 0.09 * s, 0.42 * s, 0.5 * s, 0.03 * s, skin.steel, { bevel: 0 });
    b.cylinder(0, top - 0.22 * s, -0.13 * s, 0.05 * s, 0.26 * s, 10, skin.steel, { axis: 'z' });
  }
  // the trunnion and the shank
  b.box(0, top - 0.52 * s, 0, 0.2 * s, 0.1 * s, 0.14 * s, skin.steel, { bevel: 0 });
  b.cylinder(0, top - 0.78 * s, 0, 0.04 * s, 0.26 * s, 8, skin.steel);
  // the hook: a forged bow and its point, opening toward +X, with the safety latch across the mouth
  b.torus(0.06 * s, hookY + 0.12 * s, 0, 0.11 * s, 0.035 * s, 8, 5, skin.accent, 'z', Math.PI * 1.45);
  b.beam([0.14 * s, hookY + 0.2 * s, 0], [-0.01 * s, hookY + 0.25 * s, 0], 0.012 * s, 0.03 * s, skin.steel, { bevel: 0 });
  b.pop();
  return [x, hookY + 0.2 * s, z];
}

/** How far a load's underside hangs below the hook's bottom, by kind and its default rigging (m). */
const LOAD_DROP: Readonly<Record<KitLoadKind, number>> = Object.freeze({
  powerpack: 2.5, turret: 2.3, roadwheels: 2.2, barrel: 2.15, hull: 3.35, coil: 1.8, crate: 2.3,
});

/** A working hook height: the crane's own default, raised so the load clears the floor by `clear` metres. */
function workingHookY(preferred: number, load: KitCraneLoad | null | undefined, clear = 0.6): number {
  return load ? Math.max(preferred, LOAD_DROP[load.kind] + clear) : preferred;
}

/** A real load under the hook at (x, z): the hook's eye at `hookY`, the load's top `drop` metres below. */
function hangLoad(b: KitBuilder, x: number, hookY: number, z: number, load: KitCraneLoad): number {
  const { skin } = b;
  const eye: KitVec = [x, hookY + 0.12, z];
  const rope = 0x2a2c2c;
  let footprint: { w: number; d: number; h: number } = { w: 1.4, d: 1.0, h: 0.9 };
  const rigging = load.rigging ?? (load.kind === 'coil' ? 'c-hook' : load.kind === 'barrel' || load.kind === 'hull' ? 'beam' : 'slings');
  let topY = hookY - 1.4;
  if (rigging === 'c-hook') topY = hookY - 0.35;
  if (rigging === 'beam') {
    // a spreader beam under the hook on two short slings, two legs down to the load
    const beamY = hookY - 0.75;
    for (const side of [-1, 1]) b.tube([eye, [x + side * 0.9, beamY + 0.12, z]], 0.012, 4, rope);
    b.ibeam([x - 1.3, beamY, z], [x + 1.3, beamY, z], 0.22, 0.12, skin.accent);
    topY = beamY - 1.0;
  }
  b.push().translate(x, 0, z);
  switch (load.kind) {
    case 'powerpack': { // engine and transmission block with its cooling pack and capped hose stubs
      footprint = { w: 2.3, d: 1.3, h: 1.1 };
      const y = topY - footprint.h;
      b.box(0, y + 0.5, 0, 2.1, 1.0, 1.2, 0x3b3e3a, { bevel: 0.03 });
      b.box(-0.55, y + 1.0, 0, 0.9, 0.22, 1.1, 0x2c2e2c, { bevel: 0.02 });
      for (let i = 0; i < 6; i += 1) b.box(0.45 + i * 0.1, y + 1.04, 0, 0.03, 0.12, 1.0, 0x1d1f1e, { bevel: 0 });
      b.cylinder(-1.05, y + 0.45, 0.3, 0.16, 0.22, 10, 0x4a4c48, { axis: 'x' });
      for (const dz of [-0.35, 0.35]) b.cylinder(0.2, y + 1.0, dz, 0.06, 0.18, 8, 0xb04a2a);
      break;
    }
    case 'turret': { // a turret shell: faceted cheeks, the mantlet stub and the ring underneath
      footprint = { w: 2.6, d: 2.2, h: 0.9 };
      const y = topY - footprint.h;
      b.cylinder(0, y, 0, 1.0, 0.18, 14, skin.steel);
      b.box(0, y + 0.52, 0, 2.4, 0.66, 2.0, skin.paint, { bevel: 0.08 });
      b.box(1.3, y + 0.5, 0, 0.5, 0.5, 0.8, skin.paint, { bevel: 0.05 });
      b.box(-0.3, y + 0.9, 0.4, 0.5, 0.18, 0.5, skin.paint, { bevel: 0.03 });
      break;
    }
    case 'roadwheels': { // a road-wheel station: arm, hub and the paired wheels
      footprint = { w: 1.4, d: 0.8, h: 0.8 };
      const y = topY - footprint.h;
      for (const dz of [-0.16, 0.16]) b.cylinder(0, y + 0.4, dz - 0.08, 0.38, 0.16, 16, 0x1a1b1b, { axis: 'z' });
      b.cylinder(0, y + 0.4, -0.3, 0.12, 0.6, 10, skin.steel, { axis: 'z' });
      b.beam([0, y + 0.4, 0], [0.6, y + 0.62, 0], 0.12, 0.14, skin.paint);
      break;
    }
    case 'barrel': { // a gun barrel with its fume extractor and muzzle brake
      footprint = { w: 5.4, d: 0.4, h: 0.4 };
      const y = topY - 0.2;
      b.cylinder(-2.7, y, 0, 0.13, 5.2, 12, skin.paint, { axis: 'x', bevel: 0.01 });
      b.cylinder(-0.6, y, 0, 0.2, 0.9, 12, skin.paint, { axis: 'x', bevel: 0.02 });
      b.cylinder(-2.75, y, 0, 0.17, 0.35, 12, skin.steel, { axis: 'x', bevel: 0.02 });
      break;
    }
    case 'hull': { // a stripped hull tub
      footprint = { w: 6.8, d: 3.4, h: 1.6 };
      const y = topY - footprint.h;
      b.box(0, y + 0.8, 0, 6.6, 1.3, 3.3, skin.paint, { bevel: 0.08 });
      b.box(3.1, y + 0.55, 0, 0.8, 0.9, 3.2, skin.paint, { bevel: 0.06 });
      for (const dz of [-1.75, 1.75]) b.box(0, y + 0.85, dz, 6.4, 0.06, 0.24, skin.steel, { bevel: 0.01 });
      break;
    }
    case 'coil': { // a steel coil on a C-hook
      footprint = { w: 1.6, d: 1.4, h: 1.6 };
      const cy = topY - 0.95;
      b.lathe(0, cy, 0, [[0.32, -0.7], [0.82, -0.7], [0.82, 0.7], [0.32, 0.7], [0.32, -0.7]], 18, 0x8c9094, { axis: 'z' });
      b.box(0, topY + 0.15, 0, 0.3, 0.4, 0.3, skin.accent, { bevel: 0.02 });
      b.box(0.05, cy - 0.05, 0, 0.18, 0.16, 1.8, skin.accent, { bevel: 0.02 });
      b.box(-0.95, (cy + topY) / 2, -0.85, 0.18, topY - cy + 0.3, 0.16, skin.accent, { bevel: 0.02 });
      break;
    }
    default: { // a lifting crate
      footprint = { w: 1.4, d: 1.0, h: 0.9 };
      const y = topY - footprint.h;
      b.box(0, y + 0.45, 0, 1.4, 0.9, 1.0, skin.wood, { bevel: 0.02 });
      break;
    }
  }
  b.pop();
  if (rigging === 'slings') {
    // four legs from the hook to the load's lifting points, plumb over its centre of gravity
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      b.tube([eye, [x + sx * footprint.w * 0.38, topY, z + sz * footprint.d * 0.38]], 0.014, 4, 0xc79a2c);
    }
  } else if (rigging === 'beam') {
    for (const side of [-1, 1]) b.tube([[x + side * 1.2, hookY - 0.86, z], [x + side * 1.2, topY, z]], 0.014, 4, 0xc79a2c);
  }
  return topY - footprint.h;
}

/**
 * A single- or double-girder overhead travelling crane on its runway: runway beams (on columns with corbels, or on a
 * building's), rails with clips, end stops with buffers, end trucks with wheels and drive motors, box girders with
 * diaphragm stiffeners, a drive-side walkway with handrail and toe board, a festoon rail with its cable loops, the hoist
 * (drum, motor, gearbox, brake) and its 4-fall rope, the hook block, a pendant control, the capacity plate, the bridge
 * number and an amber beacon. Budget: 3,200 triangles single, 4,500 double.
 */
export function buildOverheadCrane(b: KitBuilder, params: OverheadCraneParams): KitCraneReceipt {
  const start = b.triangleCount;
  const { skin } = b;
  const { span, runway, railY } = params;
  const girders = params.girders ?? 1;
  const face = params.face ?? 1;
  const halfSpan = span / 2, halfRun = runway / 2;
  const bridgeZ = THREE_lerp(-halfRun + 1.8, halfRun - 1.8, params.bridgeAt ?? 0.5);
  const trolleyX = THREE_lerp(-halfSpan + 1.4, halfSpan - 1.4, params.trolleyAt ?? 0.5);
  const atWork = Boolean(params.load);
  const girderY = railY + 0.62;
  const girderH = girders === 2 ? 1.05 : 0.9;
  const beamDepth = 0.6;
  const steel = skin.steel;
  const crane = skin.accent;

  // runway: beams on corbels, rails with clips, end stops with buffers
  for (const side of [-1, 1]) {
    const x = side * halfSpan;
    b.ibeam([x, railY - 0.12 - beamDepth / 2, -halfRun], [x, railY - 0.12 - beamDepth / 2, halfRun], beamDepth, 0.3, steel);
    b.box(x, railY - 0.06, 0, 0.07, 0.12, runway, 0x6e7276, { bevel: 0.01, noBottom: true });
    for (let z = -halfRun + 1.0; z < halfRun; z += 2.0) b.box(x, railY - 0.1, z, 0.22, 0.03, 0.08, 0x3a3c3e, { bevel: 0, noBottom: true });
    for (const end of [-1, 1]) {
      const z = end * (halfRun - 0.15);
      b.box(x, railY + 0.18, z, 0.3, 0.36, 0.26, crane, { bevel: 0.02 });
      b.cylinder(x, railY + 0.2, end > 0 ? z - 0.37 : z + 0.13, 0.11, 0.24, 8, 0x1d1e1f, { axis: 'z' });
    }
    if (params.columns !== false) {
      const bay = params.bay ?? 6;
      const count = Math.max(2, Math.round(runway / bay) + 1);
      for (let i = 0; i < count; i += 1) {
        const z = -halfRun + 0.3 + (i / (count - 1)) * (runway - 0.6);
        const top = railY - 0.12 - beamDepth;
        b.box(x + side * 0.42, (top + 0.5) / 2, z, 0.3, top + 0.5, 0.4, steel, { bevel: 0.015, noBottom: true });
        // corbel bracket under the runway beam, base plate on its plinth
        b.box(x + side * 0.12, top - 0.18, z, 0.42, 0.36, 0.3, steel, { bevel: 0 });
        b.box(x + side * 0.42, 0.02, z, 0.6, 0.04, 0.6, steel, { bevel: 0, noBottom: true });
        b.box(x + side * 0.42, -0.05, z, 0.8, 0.12, 0.8, skin.concrete, { bevel: 0.02, noBottom: true });
      }
    }
  }

  // the bridge: end trucks with wheels and drives, box girders with stiffeners
  const girderZs = girders === 2 ? [-0.75, 0.75] : [0];
  for (const side of [-1, 1]) {
    const x = side * halfSpan;
    b.box(x, railY + 0.36, bridgeZ, 0.46, 0.5, girders === 2 ? 3.4 : 3.0, crane, { bevel: 0.025 });
    for (const dz of [-1.1, 1.1]) b.cylinder(x - 0.13, railY + 0.22, bridgeZ + dz, 0.24, 0.26, 10, 0x2a2c2d, { axis: 'x' });
    // the drive: geared motor on the truck's outer face
    b.cylinder(x + side * 0.24, railY + 0.4, bridgeZ - 0.6, 0.16, 0.4, 10, 0x3a4048, { axis: 'x' });
    b.box(x + side * 0.3, railY + 0.4, bridgeZ - 0.2, 0.22, 0.28, 0.3, 0x3a4048, { bevel: 0.015 });
  }
  for (const dz of girderZs) {
    const z = bridgeZ + dz;
    const x0 = -halfSpan + 0.2, x1 = halfSpan - 0.2;
    b.box(0, girderY + girderH / 2, z, x1 - x0, girderH - 0.06, 0.5, crane, { bevel: 0.02 });
    for (const y of [girderY + girderH - 0.015, girderY + 0.015]) b.box(0, y, z, x1 - x0 + 0.02, 0.03, 0.62, crane, { bevel: 0.006 });
    const stiffeners = Math.max(4, Math.round(span / 2.0));
    for (let i = 1; i < stiffeners; i += 1) {
      const x = x0 + (i / stiffeners) * (x1 - x0);
      for (const s of [-1, 1]) b.box(x, girderY + girderH / 2, z + s * 0.255, 0.04, girderH - 0.1, 0.012, crane, { bevel: 0 });
    }
  }

  // drive-side walkway with handrail and toe board
  {
    const z = bridgeZ + face * (girders === 2 ? 1.45 : 0.62);
    const deckY = girderY + girderH;
    b.box(0, deckY + 0.02, z, span - 1.0, 0.04, 0.7, 0x4c4f50, { bevel: 0.006 });
    b.box(0, deckY + 0.1, z + face * 0.33, span - 1.0, 0.12, 0.02, crane, { bevel: 0 });
    const posts = Math.max(3, Math.round((span - 1) / 2.0));
    for (let i = 0; i <= posts; i += 1) {
      const x = -halfSpan + 0.5 + (i / posts) * (span - 1.0);
      b.box(x, deckY + 0.55, z + face * 0.33, 0.04, 1.06, 0.04, crane, { bevel: 0 });
    }
    for (const y of [deckY + 1.08, deckY + 0.6]) b.box(0, y, z + face * 0.33, span - 1.0, 0.04, 0.04, crane, { bevel: 0 });
  }

  // the festoon: C-rail along the girder with its cable loops gathered between the trolley and the girder end
  const festoonZ = bridgeZ - face * (girders === 2 ? 1.1 : 0.38);
  const festoonY = girderY + girderH + 0.2;
  b.box(0, festoonY, festoonZ, span - 0.8, 0.06, 0.05, 0x5b5f61, { bevel: 0 });
  for (let i = 0; i < 6; i += 1) b.box(-halfSpan + 0.6 + i * 1.6, festoonY - 0.12, festoonZ, 0.04, 0.2, 0.04, 0x5b5f61, { bevel: 0 });
  {
    const endX = -halfSpan + 0.6;
    const loops = 6;
    const reach = Math.max(1.2, trolleyX - endX);
    for (let i = 0; i < loops; i += 1) {
      const xa = endX + (i / loops) * reach, xb = endX + ((i + 1) / loops) * reach;
      b.tube(KitBuilder.catenary([xa, festoonY - 0.05, festoonZ], [xb, festoonY - 0.05, festoonZ], 0.32 + 0.04 * (i % 2), 5), 0.016, 4, 0x1c1d1e);
    }
  }

  // the hoist: drum, motor, gearbox and brake on the trolley (underhung on one girder, crabbing on two)
  const hoistY = girders === 2 ? girderY + girderH + 0.45 : girderY - 0.42;
  b.push().translate(trolleyX, 0, bridgeZ);
  if (girders === 2) {
    b.box(0, girderY + girderH + 0.12, 0, 2.0, 0.16, 2.2, crane, { bevel: 0.02 });
    for (const dz of [-0.75, 0.75]) for (const dx of [-0.7, 0.7]) b.cylinder(dx, girderY + girderH + 0.04, dz - 0.06, 0.12, 0.12, 10, 0x2a2c2d, { axis: 'z' });
  } else {
    for (const s of [-1, 1]) b.box(0, girderY - 0.14, s * 0.34, 0.9, 0.36, 0.05, crane, { bevel: 0.01 });
  }
  b.cylinder(-0.55, hoistY, 0, 0.3, 1.1, 14, 0x5a5e60, { axis: 'x', bevel: 0.02 });
  b.cylinder(0.6, hoistY, 0, 0.2, 0.55, 12, 0x34383d, { axis: 'x', bevel: 0.015 });
  b.box(0.42, hoistY, 0.28, 0.32, 0.46, 0.22, 0x34383d, { bevel: 0.02 });
  b.cylinder(1.18, hoistY, 0, 0.12, 0.12, 10, crane, { axis: 'x' });
  b.pop();
  const hookY = params.hookY ?? (atWork ? workingHookY(railY - 4.6, params.load) : railY - 1.6);
  const hook = hookBlock(b, trolleyX, hookY, bridgeZ, girders === 2 ? 1.25 : 1);
  reeve(b, [trolleyX, hoistY - 0.25, bridgeZ], [trolleyX, hookY + (girders === 2 ? 1.19 : 0.95), bridgeZ], 4, 0x2a2c2c);
  let loadKind: KitLoadKind | null = null;
  if (params.load) {
    hangLoad(b, trolleyX, hookY, bridgeZ, params.load);
    loadKind = params.load.kind;
  }
  // pendant control on its cable, hanging to a hand's height
  {
    const px = trolleyX + 0.5, pz = bridgeZ + face * 0.35;
    b.tube([[px, hoistY - 0.2, pz], [px, 1.62, pz]], 0.01, 4, 0x1c1d1e);
    b.box(px, 1.45, pz, 0.12, 0.32, 0.1, crane, { bevel: 0.015 });
  }

  // capacity plate and bridge number on the girder's face, the amber beacon on its top
  const plateZ = bridgeZ + girderZs[girderZs.length - 1] + face * 0.262;
  const plateFace = face > 0 ? 0 : Math.PI;
  b.push().translate(0, girderY + girderH * 0.5, plateZ).rotateY(plateFace);
  b.uprightFace(0, 0, 0, 1.2, 0.45, garageDisplayRect(plateRect(params.swl ?? 20)));
  // the bridge number is paint with alpha: a decal on a dark plate (as an opaque display face it read as a white blob)
  b.box(1.0, 0, 0.004, 0.46, 0.46, 0.008, 0x1c1e20, { bevel: 0 });
  b.decal([0.8, -0.2, 0.011], [1.2, -0.2, 0.011], [1.2, 0.2, 0.011], [0.8, 0.2, 0.011],
    garageDisplayRect(`num.0${Math.min(8, Math.max(1, params.number ?? 1))}`));
  b.pop();
  {
    const bx = 0, by = girderY + girderH + 0.06, bz = bridgeZ + girderZs[0];
    b.box(bx, by + 0.05, bz, 0.16, 0.1, 0.16, 0x2a2c2d, { bevel: 0.01 });
    const amber = garageDisplayRect('glow.amber');
    const h = 0.16, t = by + 0.1;
    b.face([bx - 0.06, t, bz + 0.06], [bx + 0.06, t, bz + 0.06], [bx + 0.06, t + h, bz + 0.06], [bx - 0.06, t + h, bz + 0.06], amber);
    b.face([bx + 0.06, t, bz - 0.06], [bx - 0.06, t, bz - 0.06], [bx - 0.06, t + h, bz - 0.06], [bx + 0.06, t + h, bz - 0.06], amber);
    b.face([bx + 0.06, t, bz + 0.06], [bx + 0.06, t, bz - 0.06], [bx + 0.06, t + h, bz - 0.06], [bx + 0.06, t + h, bz + 0.06], amber);
    b.face([bx - 0.06, t, bz - 0.06], [bx - 0.06, t, bz + 0.06], [bx - 0.06, t + h, bz + 0.06], [bx - 0.06, t + h, bz - 0.06], amber);
  }
  return {
    kind: girders === 2 ? 'overhead-double' : 'overhead-single',
    rail: true, endStops: true, trolley: true, hoist: true, reeving: true, hookBlock: true, festoon: true, plate: true,
    atWork, load: loadKind, hook, triangles: b.triangleCount - start,
  };
}

function THREE_lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

interface LatticeParams {
  /** Truss depth (m) and width (m) between its chords. */
  readonly depth: number;
  readonly width: number;
  /** Panels along the member (lacing bays). */
  readonly bays?: number;
  /** Chord and lacing angle-section sizes (m). */
  readonly chord?: number;
  readonly lacing?: number;
}

/**
 * A lattice member from a to b: four angle-section chords, zig-zag angle lacing on all four faces, gusset plates at the
 * panel points and a bolt group on each gusset. For lattice gantry legs, girders and jibs. Budget: about 5,000
 * triangles per crane.
 */
export function buildLatticeMember(b: KitBuilder, a: KitVec, c: KitVec, params: LatticeParams): number {
  const start = b.triangleCount;
  const steel = b.skin.steel;
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  const bays = params.bays ?? Math.max(2, Math.round(length / Math.max(params.depth, 0.6)));
  const chord = params.chord ?? 0.1, lacing = params.lacing ?? 0.06;
  // a local frame: the member along its own axis, the depth "up" (or across for a vertical leg)
  const ax = dx / length, ay = dy / length, az = dz / length;
  const upGuess = Math.abs(ay) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let wx = upGuess[1] * az - upGuess[2] * ay, wy = upGuess[2] * ax - upGuess[0] * az, wz = upGuess[0] * ay - upGuess[1] * ax;
  const wl = Math.hypot(wx, wy, wz); wx /= wl; wy /= wl; wz /= wl;
  const ux = ay * wz - az * wy, uy = az * wx - ax * wz, uz = ax * wy - ay * wx;
  const point = (t: number, su: number, sw: number): KitVec => [
    a[0] + dx * t + ux * su * params.depth / 2 + wx * sw * params.width / 2,
    a[1] + dy * t + uy * su * params.depth / 2 + wy * sw * params.width / 2,
    a[2] + dz * t + uz * su * params.depth / 2 + wz * sw * params.width / 2,
  ];
  const corners: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  corners.forEach(([su, sw], index) => b.angle(point(0, su, sw), point(1, su, sw), chord, 0.012, steel, index * Math.PI / 2));
  for (let i = 0; i < bays; i += 1) {
    const t0 = i / bays, t1 = (i + 1) / bays;
    for (let f = 0; f < 4; f += 1) {
      const [su0, sw0] = corners[f], [su1, sw1] = corners[(f + 1) % 4];
      const flip = (i + f) % 2 === 0;
      b.angle(point(flip ? t0 : t1, su0, sw0), point(flip ? t1 : t0, su1, sw1), lacing, 0.008, steel, f * Math.PI / 2, true);
    }
    // gusset plates and bolt groups at the panel points on two faces
    if (i > 0) {
      for (const [su, sw] of [[1, 1], [-1, -1]] as const) {
        const p = point(t0, su, sw);
        b.box(p[0], p[1], p[2], 0.16, 0.16, 0.16, steel, { bevel: 0 });
      }
    }
  }
  return b.triangleCount - start;
}

export interface PortalGantryParams {
  readonly span: number;
  readonly height: number;
  /** Rail length the bogies run on (m). */
  readonly runway: number;
  /** Lattice legs and girder (true) or plated box sections. */
  readonly lattice?: boolean;
  readonly swl?: 5 | 20 | 40;
  readonly hookY?: number;
  readonly load?: KitCraneLoad | null;
  readonly trolleyAt?: number;
  readonly bridgeAt?: number;
}

/**
 * A portal (goliath) gantry: two legs with bracing on sill beams, bogies on ground rails with end stops, the girder,
 * a hoist trolley with its reeving, hook block and festoon, a caged ladder up one leg and the capacity plate. Budget:
 * 3,800 triangles plated, more when lattice.
 */
export function buildPortalGantry(b: KitBuilder, params: PortalGantryParams): KitCraneReceipt {
  const start = b.triangleCount;
  const { skin } = b;
  const { span, height, runway } = params;
  const half = span / 2;
  const crane = skin.accent, steel = skin.steel;
  const bridgeZ = THREE_lerp(-runway / 2 + 2, runway / 2 - 2, params.bridgeAt ?? 0.5);
  const trolleyX = THREE_lerp(-half + 1.5, half - 1.5, params.trolleyAt ?? 0.5);
  const girderY = height;
  // ground rails with clips, end stops
  for (const side of [-1, 1]) {
    const x = side * half;
    b.box(x, 0.06, 0, 0.08, 0.12, runway, 0x6e7276, { bevel: 0.01, noBottom: true });
    b.box(x, 0.02, 0, 0.5, 0.04, runway, skin.concrete, { bevel: 0.01, noBottom: true });
    for (const end of [-1, 1]) b.box(x, 0.25, end * (runway / 2 - 0.2), 0.35, 0.5, 0.3, crane, { bevel: 0.02 });
  }
  for (const side of [-1, 1]) {
    const x = side * half;
    // sill beam and bogies
    b.box(x, 0.55, bridgeZ, 0.5, 0.5, 4.2, crane, { bevel: 0.025 });
    for (const dz of [-1.5, 1.5]) {
      b.box(x, 0.32, bridgeZ + dz, 0.42, 0.4, 0.9, crane, { bevel: 0.02 });
      for (const w of [-0.25, 0.25]) b.cylinder(x - 0.12, 0.2, bridgeZ + dz + w, 0.18, 0.24, 10, 0x2a2c2d, { axis: 'x' });
    }
    // legs: an A in the runway direction, braced
    for (const dz of [-1.7, 1.7]) {
      if (params.lattice) buildLatticeMember(b, [x, 0.8, bridgeZ + dz], [x, girderY - 0.4, bridgeZ + dz * 0.3], { depth: 0.6, width: 0.6, bays: Math.max(3, Math.round(height / 1.4)) });
      else b.beam([x, 0.8, bridgeZ + dz], [x, girderY - 0.4, bridgeZ + dz * 0.3], 0.5, 0.5, crane, { bevel: 0.02 });
    }
    b.beam([x, height * 0.45, bridgeZ - 1.2], [x, height * 0.45, bridgeZ + 1.2], 0.18, 0.18, crane, { bevel: 0.01 });
  }
  // girder
  if (params.lattice) buildLatticeMember(b, [-half - 0.8, girderY + 0.5, bridgeZ], [half + 0.8, girderY + 0.5, bridgeZ], { depth: 1.1, width: 0.9 });
  else {
    b.box(0, girderY + 0.5, bridgeZ - 0.4, span + 1.6, 1.0, 0.45, crane, { bevel: 0.02 });
    b.box(0, girderY + 0.5, bridgeZ + 0.4, span + 1.6, 1.0, 0.45, crane, { bevel: 0.02 });
  }
  // trolley and hoist on top, reeving down between the girders
  b.push().translate(trolleyX, 0, bridgeZ);
  b.box(0, girderY + 1.12, 0, 1.8, 0.2, 1.6, crane, { bevel: 0.02 });
  b.cylinder(-0.5, girderY + 1.5, 0, 0.28, 1.0, 14, 0x5a5e60, { axis: 'x', bevel: 0.02 });
  b.cylinder(0.55, girderY + 1.5, 0, 0.18, 0.5, 12, 0x34383d, { axis: 'x' });
  b.box(0.4, girderY + 1.5, 0.3, 0.3, 0.42, 0.2, 0x34383d, { bevel: 0.02 });
  b.pop();
  const atWork = Boolean(params.load);
  const hookY = params.hookY ?? (atWork ? workingHookY(Math.max(2.4, height - 3.6), params.load) : height - 1.4);
  const hook = hookBlock(b, trolleyX, hookY, bridgeZ, 1.1);
  reeve(b, [trolleyX, girderY + 1.2, bridgeZ], [trolleyX, hookY + 1.05, bridgeZ], 4, 0x2a2c2c);
  let loadKind: KitLoadKind | null = null;
  if (params.load) { hangLoad(b, trolleyX, hookY, bridgeZ, params.load); loadKind = params.load.kind; }
  // festoon cable loops along the girder's back
  for (let i = 0; i < 5; i += 1) {
    const xa = -half + i * 1.1, xb = -half + (i + 1) * 1.1;
    b.tube(KitBuilder.catenary([xa, girderY + 1.05, bridgeZ - 0.75], [xb, girderY + 1.05, bridgeZ - 0.75], 0.3, 6), 0.016, 4, 0x1c1d1e);
  }
  b.box(0, girderY + 1.12, bridgeZ - 0.75, span, 0.05, 0.05, 0x5b5f61, { bevel: 0 });
  // caged ladder up the near leg
  {
    const x = half + 0.45, z = bridgeZ + 0.9;
    for (const s of [-0.22, 0.22]) b.box(x, girderY / 2 + 0.5, z + s, 0.04, girderY - 0.2, 0.04, crane, { bevel: 0 });
    for (let y = 1.0; y < girderY; y += 0.3) b.box(x, y, z, 0.03, 0.03, 0.44, steel, { bevel: 0 });
    for (let y = 2.4; y < girderY; y += 0.9) b.torus(x + 0.35, y, z, 0.36, 0.02, 10, 3, crane, 'y', Math.PI);
  }
  // capacity plate on the girder face
  b.push().translate(0, girderY + 0.5, bridgeZ + (params.lattice ? 0.47 : 0.63));
  b.uprightFace(0, 0, 0, 1.3, 0.5, garageDisplayRect(plateRect(params.swl ?? 20)));
  b.pop();
  return {
    kind: params.lattice ? 'portal-lattice' : 'portal-gantry', rail: true, endStops: true, trolley: true, hoist: true,
    reeving: true, hookBlock: true, festoon: true, plate: true, atWork, load: loadKind, hook, triangles: b.triangleCount - start,
  };
}

/** A pillar or wall jib crane: slew bearing, jib, trolley and chain hoist. Budget: 900 triangles. */
export function buildJibCrane(b: KitBuilder, params: { readonly height: number; readonly reach: number; readonly slew?: number;
  readonly mount?: 'pillar' | 'wall'; readonly hookY?: number; readonly load?: KitCraneLoad | null; readonly swl?: 5 | 20 | 40 }): KitCraneReceipt {
  const start = b.triangleCount;
  const { skin } = b;
  const crane = skin.accent;
  const { height, reach } = params;
  const mount = params.mount ?? 'pillar';
  if (mount === 'pillar') {
    b.box(0, -0.06, 0, 1.1, 0.12, 1.1, skin.concrete, { bevel: 0.02, noBottom: true });
    b.box(0, 0.02, 0, 0.6, 0.04, 0.6, skin.steel, { bevel: 0.01 });
    b.cylinder(0, 0.04, 0, 0.16, height - 0.2, 12, crane, { bevel: 0.01 });
  } else {
    b.box(-0.08, height - 0.5, 0, 0.06, 1.2, 0.4, skin.steel, { bevel: 0.01 });
  }
  b.push().translate(0, height - 0.2, 0).rotateY(params.slew ?? 0);
  b.cylinder(0, -0.12, 0, 0.22, 0.16, 12, 0x3a3e42); // slew bearing
  b.ibeam([0, 0.12, 0], [reach, 0.12, 0], 0.26, 0.14, crane);
  b.beam([0.1, -0.5, 0], [reach * 0.55, 0.0, 0], 0.08, 0.08, crane, { bevel: 0 }); // tie
  b.box(reach - 0.05, 0.12, 0, 0.1, 0.3, 0.22, crane, { bevel: 0.01 }); // end stop
  const tx = reach * 0.72;
  b.box(tx, -0.06, 0, 0.3, 0.12, 0.24, 0x34383d, { bevel: 0.01 });
  b.box(tx, -0.32, 0, 0.26, 0.32, 0.22, crane, { bevel: 0.02 }); // chain hoist body
  b.pop();
  const atWork = Boolean(params.load);
  const hookY = params.hookY ?? (atWork ? workingHookY(1.4, params.load, 0.35) : height - 1.4);
  const slew = params.slew ?? 0;
  const hx = Math.cos(slew) * reach * 0.72, hz = -Math.sin(slew) * reach * 0.72;
  b.tube([[hx, height - 0.72, hz], [hx, hookY + 0.32, hz]], 0.012, 4, 0x3a3a38);
  b.tube([[hx + 0.05, height - 0.72, hz], [hx + 0.08, height - 1.6, hz]], 0.012, 4, 0x3a3a38); // the slack chain
  const hook = hookBlock(b, hx, hookY, hz, 0.5);
  let loadKind: KitLoadKind | null = null;
  if (params.load) { hangLoad(b, hx, hookY, hz, params.load); loadKind = params.load.kind; }
  b.push().translate(0, height - 0.08, 0).rotateY(slew).translate(reach * 0.4, 0, 0.075);
  b.uprightFace(0, 0, 0, 0.5, 0.19, garageDisplayRect(plateRect(params.swl ?? 5)));
  b.pop();
  return {
    kind: `jib-${mount}`, rail: true, endStops: true, trolley: true, hoist: true, reeving: true, hookBlock: true,
    festoon: true, plate: true, atWork, load: loadKind, hook, triangles: b.triangleCount - start,
  };
}

/** A portable aluminium A-frame gantry with a beam trolley and chain hoist. Budget: 700 triangles. */
export function buildAFrameGantry(b: KitBuilder, params: { readonly span: number; readonly height: number;
  readonly hookY?: number; readonly load?: KitCraneLoad | null }): KitCraneReceipt {
  const start = b.triangleCount;
  const alu = 0xa7adb0, crane = b.skin.accent;
  const { span, height } = params;
  for (const side of [-1, 1]) {
    const x = side * span / 2;
    for (const dz of [-0.9, 0.9]) b.beam([x, 0.12, dz], [x, height, 0], 0.08, 0.08, alu, { bevel: 0.008 });
    b.beam([x, height * 0.35, -0.6], [x, height * 0.35, 0.6], 0.05, 0.05, alu, { bevel: 0.005 });
    for (const dz of [-0.9, 0.9]) b.cylinder(x, 0, dz, 0.07, 0.12, 8, 0x1d1e1f, { axis: 'z' }); // castors
  }
  b.ibeam([-span / 2 - 0.15, height + 0.12, 0], [span / 2 + 0.15, height + 0.12, 0], 0.22, 0.11, alu);
  b.box(0, height - 0.08, 0, 0.28, 0.12, 0.2, 0x34383d, { bevel: 0.01 });
  b.box(0, height - 0.32, 0, 0.24, 0.3, 0.2, crane, { bevel: 0.02 });
  const atWork = Boolean(params.load);
  const hookY = params.hookY ?? (atWork ? workingHookY(1.3, params.load, 0.35) : height - 1.2);
  b.tube([[0, height - 0.48, 0], [0, hookY + 0.32, 0]], 0.01, 4, 0x3a3a38);
  const hook = hookBlock(b, 0, hookY, 0, 0.45);
  let loadKind: KitLoadKind | null = null;
  if (params.load) { hangLoad(b, 0, hookY, 0, params.load); loadKind = params.load.kind; }
  b.push().translate(0.6, height + 0.12, 0.06);
  b.uprightFace(0, 0, 0, 0.4, 0.15, garageDisplayRect('plate.swl.5'));
  b.pop();
  return { kind: 'a-frame', rail: true, endStops: true, trolley: true, hoist: true, reeving: true, hookBlock: true,
    festoon: true, plate: true, atWork, load: loadKind, hook, triangles: b.triangleCount - start };
}

/** A gable hoist beam (Kranbalken) over a loading door: beam, pulley, rope and hook. Budget: 250 triangles. */
export function buildGableHoistBeam(b: KitBuilder, params: { readonly reach: number; readonly hookY: number }): KitCraneReceipt {
  const start = b.triangleCount;
  const wood = b.skin.wood;
  b.box(0, 0, params.reach / 2, 0.24, 0.3, params.reach + 0.4, wood, { bevel: 0.02 });
  b.cylinder(0.0, -0.18, params.reach - 0.15, 0.13, 0.08, 10, 0x3a3c3e, { axis: 'x' });
  b.tube([[0, -0.3, params.reach - 0.15], [0, params.hookY + 0.3, params.reach - 0.15]], 0.014, 5, 0x8a7a5a);
  b.tube([[0.08, -0.3, params.reach - 0.15], [0.08, params.hookY - 0.8, params.reach - 0.4]], 0.014, 5, 0x8a7a5a);
  const hook = hookBlock(b, 0, params.hookY, params.reach - 0.15, 0.35);
  return { kind: 'gable-hoist', rail: true, endStops: true, trolley: true, hoist: true, reeving: true, hookBlock: true,
    festoon: false, plate: false, atWork: false, load: null, hook, triangles: b.triangleCount - start };
}

/** A monorail beam cantilevered from a portal with its trolley and electric chain hoist. Budget: 600 triangles. */
export function buildMonorailBeam(b: KitBuilder, params: { readonly length: number; readonly height: number;
  readonly trolleyAt?: number; readonly hookY?: number; readonly load?: KitCraneLoad | null }): KitCraneReceipt {
  const start = b.triangleCount;
  const crane = b.skin.accent;
  const { length, height } = params;
  b.ibeam([0, height, 0], [0, height, length], 0.3, 0.16, crane);
  b.box(0, height + 0.1, 0.15, 0.5, 0.5, 0.3, b.skin.steel, { bevel: 0.02 }); // wall bracket
  b.beam([0, height + 0.15, 0.2], [0, height + 1.2, length * 0.55], 0.08, 0.08, b.skin.steel, { bevel: 0 }); // tie rod
  b.box(0, height - 0.05, length - 0.06, 0.24, 0.3, 0.1, crane, { bevel: 0.01 }); // end stop
  const tz = THREE_lerp(1, length - 0.6, params.trolleyAt ?? 0.75);
  b.box(0, height - 0.24, tz, 0.26, 0.12, 0.36, 0x34383d, { bevel: 0.01 });
  b.box(0, height - 0.5, tz, 0.3, 0.36, 0.26, crane, { bevel: 0.02 });
  const atWork = Boolean(params.load);
  const hookY = params.hookY ?? (atWork ? workingHookY(1.2, params.load, 0.35) : height - 1.4);
  b.tube([[0, height - 0.68, tz], [0, hookY + 0.32, tz]], 0.011, 4, 0x3a3a38);
  b.tube([[0.06, height - 0.68, tz], [0.1, height - 1.7, tz + 0.05]], 0.011, 4, 0x3a3a38);
  const hook = hookBlock(b, 0, hookY, tz, 0.5);
  let loadKind: KitLoadKind | null = null;
  if (params.load) { hangLoad(b, 0, hookY, tz, params.load); loadKind = params.load.kind; }
  b.push().translate(0.085, height, length * 0.4).rotateY(Math.PI / 2);
  b.uprightFace(0, 0, 0, 0.5, 0.19, garageDisplayRect('plate.swl.5'));
  b.pop();
  return { kind: 'monorail', rail: true, endStops: true, trolley: true, hoist: true, reeving: true, hookBlock: true,
    festoon: true, plate: true, atWork, load: loadKind, hook, triangles: b.triangleCount - start };
}

/** A rail breakdown crane on its bogies: carbody, counterweight, jib, outriggers down, hook at work. Budget: 4,000. */
export function buildRailBreakdownCrane(b: KitBuilder, params: { readonly jibAngle?: number; readonly slew?: number;
  readonly load?: KitCraneLoad | null }): KitCraneReceipt {
  const start = b.triangleCount;
  const { skin } = b;
  const body = skin.paint, crane = skin.accent;
  // the underframe on two bogies, buffers both ends
  b.box(0, 1.15, 0, 2.6, 0.4, 10.5, body, { bevel: 0.03 });
  for (const end of [-1, 1]) {
    b.box(0, 0.75, end * 3.6, 2.2, 0.35, 2.4, 0x1e1f20, { bevel: 0.02 });
    for (const w of [-0.75, 0.75]) for (const side of [-1, 1]) b.cylinder(side * 0.72 - (side > 0 ? 0.12 : 0), 0.46, end * 3.6 + w, 0.46, 0.12, 14, 0x232526, { axis: 'x' });
    for (const side of [-1, 1]) b.cylinder(side * 0.8, 1.1, end > 0 ? 5.25 : -5.6, 0.2, 0.35, 10, 0x3a3c3e, { axis: 'z' });
  }
  // outriggers down on timber mats
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    b.beam([side * 1.3, 1.1, end * 2.2], [side * 3.0, 1.0, end * 2.2], 0.3, 0.3, crane);
    b.box(side * 3.0, 0.5, end * 2.2, 0.25, 1.0, 0.25, crane, { bevel: 0.02 });
    b.box(side * 3.0, 0.06, end * 2.2, 1.0, 0.12, 1.0, skin.wood, { bevel: 0.01, noBottom: true });
  }
  // the superstructure: cab and machinery house, counterweight, the jib
  b.push().translate(0, 1.35, -0.8).rotateY(params.slew ?? 0.4);
  b.cylinder(0, 0, 0, 1.3, 0.2, 18, 0x3a3e42);
  b.box(0, 1.3, -0.6, 2.6, 2.2, 4.0, body, { bevel: 0.04 });
  b.box(0, 1.0, -2.9, 2.5, 1.6, 0.8, 0x2a2b2c, { bevel: 0.04 });
  b.box(0.9, 2.0, 1.0, 0.8, 1.0, 0.9, body, { bevel: 0.03 });
  const angle = params.jibAngle ?? 0.62;
  const jibLength = 11;
  const tip: KitVec = [0, 0.9 + Math.sin(angle) * jibLength, 0.8 + Math.cos(angle) * jibLength];
  buildLatticeMember(b, [0, 0.9, 1.2], tip, { depth: 0.7, width: 0.8, bays: 9, chord: 0.11, lacing: 0.055 });
  b.tube([[0, 2.6, -2.2], [tip[0], tip[1] + 0.3, tip[2]]], 0.018, 5, 0x2a2c2c); // luffing ropes
  b.pop();
  const slew = params.slew ?? 0.4;
  const tipWorld: KitVec = [Math.sin(slew) * tip[2], 1.35 + tip[1], -0.8 + Math.cos(slew) * tip[2]];
  const atWork = Boolean(params.load);
  const hookY = atWork ? workingHookY(3.2, params.load) : tipWorld[1] - 2.5;
  reeve(b, [tipWorld[0], tipWorld[1] - 0.2, tipWorld[2]], [tipWorld[0], hookY + 1.0, tipWorld[2]], 2, 0x2a2c2c);
  const hook = hookBlock(b, tipWorld[0], hookY, tipWorld[2], 1.1);
  let loadKind: KitLoadKind | null = null;
  if (params.load) { hangLoad(b, tipWorld[0], hookY, tipWorld[2], params.load); loadKind = params.load.kind; }
  b.push().translate(1.31, 1.15, 1.5).rotateY(Math.PI / 2);
  b.uprightFace(0, 0, 0, 1.1, 0.4, garageDisplayRect('plate.swl.40'));
  b.pop();
  return { kind: 'rail-breakdown', rail: true, endStops: true, trolley: true, hoist: true, reeving: true, hookBlock: true,
    festoon: true, plate: true, atWork, load: loadKind, hook, triangles: b.triangleCount - start };
}

/** A material-ropeway pylon with its saddles, track and haul ropes and a carrier. Budget: 1,500 triangles. */
export function buildRopewayPylon(b: KitBuilder, params: { readonly height: number; readonly ropeTo?: KitVec }): number {
  const start = b.triangleCount;
  const { height } = params;
  buildLatticeMember(b, [0, 0, 0], [0, height, 0], { depth: 1.0, width: 1.0, bays: Math.max(4, Math.round(height / 1.5)), chord: 0.09, lacing: 0.05 });
  b.box(0, 0.1, 0, 1.6, 0.2, 1.6, b.skin.concrete, { bevel: 0.02, noBottom: true });
  b.beam([-1.6, height + 0.1, 0], [1.6, height + 0.1, 0], 0.22, 0.22, b.skin.steel);
  for (const side of [-1, 1]) {
    b.box(side * 1.4, height + 0.3, 0, 0.2, 0.2, 0.6, 0x3a3c3e, { bevel: 0.01 }); // saddles
    const to = params.ropeTo ?? [side * 1.4, height - 6, 30];
    b.tube(KitBuilder.catenary([side * 1.4, height + 0.42, 0], [to[0] + side * 1.4, to[1], to[2]], 1.2, 8), 0.02, 5, 0x2a2c2c);
  }
  // a carrier hanging on the track rope
  b.box(1.4, height - 1.8, 6, 0.6, 0.5, 0.9, b.skin.paint, { bevel: 0.02 });
  b.tube([[1.4, height - 1.5, 6], [1.4, height + 0.05, 6]], 0.02, 4, 0x3a3c3e);
  return b.triangleCount - start;
}

/** A tracked scrap handler: base, boom, stick and a lifting magnet on its chains. Budget: 2,500 triangles. */
export function buildMagnetHandler(b: KitBuilder, params: { readonly slew?: number; readonly reach?: number }): KitCraneReceipt {
  const start = b.triangleCount;
  const { skin } = b;
  for (const side of [-1, 1]) {
    b.box(side * 1.3, 0.5, 0, 0.7, 0.9, 4.4, 0x232526, { bevel: 0.05 });
    for (let i = 0; i < 5; i += 1) b.cylinder(side * 1.3 - 0.32, 0.35, -1.6 + i * 0.8, 0.26, 0.64, 12, 0x2e3031, { axis: 'x' });
  }
  b.box(0, 1.1, 0, 2.0, 0.4, 2.6, 0x2e3031, { bevel: 0.03 });
  b.push().translate(0, 1.4, 0).rotateY(params.slew ?? -0.5);
  b.cylinder(0, 0, 0, 1.0, 0.2, 16, 0x3a3e42);
  b.box(0, 0.9, -0.5, 2.4, 1.4, 3.0, skin.paint, { bevel: 0.04 });
  b.box(-0.8, 2.4, 0.6, 0.9, 1.6, 1.0, skin.paint, { bevel: 0.03 }); // the elevated cab
  b.box(-0.8, 2.6, 1.11, 0.8, 0.9, 0.02, 0x2b3238, { bevel: 0 });
  const reach = params.reach ?? 7;
  const elbow: KitVec = [0.4, 6.8, 3.6];
  const tip: KitVec = [0.4, 4.2, reach];
  b.beam([0.4, 1.4, 0.6], elbow, 0.5, 0.6, skin.accent, { bevel: 0.03 });
  b.beam(elbow, tip, 0.36, 0.4, skin.accent, { bevel: 0.03 });
  b.rod([0.4, 1.6, 0.4], [0.4, 5.6, 2.9], 0.09, 10, 0xb0b4b6);
  b.pop();
  const slew = params.slew ?? -0.5;
  const tipWorld: KitVec = [Math.cos(slew) * 0.4 + Math.sin(slew) * tip[2], 1.4 + tip[1], -Math.sin(slew) * 0.4 + Math.cos(slew) * tip[2]];
  const magnetY = 1.6;
  for (const [dx, dz] of [[-0.45, 0], [0.45, 0], [0, 0.45]]) b.tube([[tipWorld[0], tipWorld[1] - 0.2, tipWorld[2]], [tipWorld[0] + dx, magnetY + 0.45, tipWorld[2] + dz]], 0.02, 4, 0x2a2c2c);
  b.cylinder(tipWorld[0], magnetY, tipWorld[2], 0.75, 0.4, 18, 0x2a2c2e, { bevel: 0.03 });
  return { kind: 'magnet-handler', rail: true, endStops: true, trolley: true, hoist: true, reeving: true, hookBlock: true,
    festoon: true, plate: false, atWork: true, load: null, hook: [tipWorld[0], magnetY, tipWorld[2]], triangles: b.triangleCount - start };
}
