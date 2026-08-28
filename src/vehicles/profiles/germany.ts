// German Leopard-family derivatives. The owner-supplied GLBs are external
// comparison material only: no source mesh, topology, material, animation or
// texture data enters runtime.
//
// §5.248 germany-leopards round: the leo2a4m/leo2a6m donor-wrapper builders
// (buildLeo2A4 / buildLeo2A6 + add-on packages) are RETIRED — both ids now
// build ground-up in profiles/leopard.js (buildLeo2A4M / buildLeo2A6M,
// print-measured §K builds). This module keeps only the OTCO field-mod
// package, which deliberately layers on the resident leo2a4.

import { KIT, FITTINGS, orientedSlab } from './kit.js';
import { buildLeo2A4 } from './leopard.js';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3Tuple = [number, number, number];
type Quad = [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];
type AssemblyOwner = 'hull' | 'turret';

interface TransformPort {
  readonly position: { set(x: number, y: number, z: number): unknown };
  readonly rotation: { set(x: number, y: number, z: number): unknown };
}

interface GroupPort {
  add(object: TransformPort): unknown;
}

interface GermanBuilderPort {
  readonly hullG: GroupPort;
  readonly turretG: GroupPort;
  readonly mats: unknown;
  topY?: number;
  add(slot: string, geometry: unknown, ...transform: number[]): unknown;
  addGunExtra(geometry: unknown, ...transform: number[]): unknown;
  addGunExtraDark(geometry: unknown, ...transform: number[]): unknown;
  decal(
    owner: AssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    yaw: number,
  ): unknown;
}

function mount(
  P: GermanBuilderPort,
  owner: AssemblyOwner,
  fitting: TransformPort,
  x: number,
  y: number,
  z: number,
  rotation: Vec3Tuple | null = null,
): void {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function plate(
  P: GermanBuilderPort,
  owner: AssemblyOwner,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rotation: Vec3Tuple | null = null,
  cap = true,
): void {
  const r = rotation || [0, 0, 0];
  const body = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(body, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (cap) P.add(detail, KIT.box(w * 0.72, 0.014, Math.max(0.03, d * 0.08)),
    x, y + h * 0.5 + 0.008, z + d * 0.20, r[0], r[1], r[2]);
}

function mirroredSlab(side: number, lower: Quad, upper: Quad): unknown {
  const row = (points: Quad): Quad => {
    const mapped: Quad = [
      [side * points[0][0], points[0][1], points[0][2]],
      [side * points[1][0], points[1][1], points[1][2]],
      [side * points[2][0], points[2][1], points[2][2]],
      [side * points[3][0], points[3][1], points[3][2]],
    ];
    return side < 0 ? [mapped[1], mapped[0], mapped[3], mapped[2]] : mapped;
  };
  return orientedSlab(...row(lower), ...row(upper));
}

function radioPair(P: GermanBuilderPort, y: number, z: number, seed: number, spread = 1.03): void {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.035, 0.045, 0.06, 10), side * spread, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.78 : 0.66, r: 0.011,
      rake: side * 0.038, seed: seed + (side > 0 ? 1 : 0),
    }), side * spread, y + 0.02, z);
  }
}

function roofWeapon(
  P: GermanBuilderPort,
  x: number,
  y: number,
  z: number,
  seed: number,
  scale = 0.82,
  yaw = 0,
): void {
  P.add('turret', KIT.box(0.50, 0.075, 0.46), x, y, z);
  P.add('turretDark', KIT.box(0.39, 0.020, 0.35), x, y + 0.048, z);
  P.add('turret', KIT.cylY(0.20, 0.22, 0.075, 18), x, y + 0.09, z);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale, elev: 0.11,
    shield: true, ammo: true, ring: { r: 0.16, stubs: 3 }, seed,
  }), x, y + 0.11, z, [0, yaw, 0]);
}

function gunPlant(P: GermanBuilderPort, width: number, depth: number, coaxX = 0.31): void {
  P.addGunExtra(KIT.box(width, 0.52, 0.26), 0, -0.015, 0.39);
  P.addGunExtra(KIT.cylZ(0.21, depth, 20, 0.17), 0, 0, 0.70);
  P.addGunExtraDark(KIT.cylZ(0.038, 0.095, 10), coaxX, 0.075, 0.60);
  for (const side of [-1, 1]) P.addGunExtraDark(KIT.cylZ(0.026, 0.070, 10),
    side * width * 0.34, -0.12, 0.48);
}

function addOTCOPackage(P: GermanBuilderPort): void {
  // Retain the boxy A4 turret but give this field-modernized variant a dense
  // net/stowage silhouette and a supported roof weapon. The quarantined game
  // extraction supplies only broad visual cues, never topology.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) plate(P, 'turret', side * 1.46,
      0.34 + (i & 1) * 0.025, 0.80 - i * 0.52,
      0.10, 0.34, 0.46, [0, 0, side * 0.035], false);
    P.add('turretCloth', mirroredSlab(side, [
      [0.52, 0.22, 1.62], [1.50, 0.20, 1.20], [1.47, 0.18, -1.92], [0.64, 0.18, -2.05],
    ], [
      [0.48, 0.33, 1.55], [1.48, 0.34, 1.14], [1.45, 0.31, -1.86], [0.61, 0.31, -1.98],
    ]));
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.042, len: 0.28, splay: side,
      pitch: -0.42, arc: 0.52, slot: 'detail', seed: 2400 + (side > 0 ? 1 : 0),
    }), side * 1.22, 0.54, 0.08);
  }
  P.add('turretDark', KIT.box(2.20, 0.30, 0.055), 0, 0.34, -2.48);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 2.14, d: 0.48, h: 0.30, fill: 0.62, rails: 3, seed: 2420,
  }), 0, 0.48, -2.34);
  roofWeapon(P, 0.48, 0.86, -0.72, 2430, 0.82, 0.04);
  radioPair(P, 0.72, -2.40, 2440, 1.05);
  gunPlant(P, 0.78, 0.39);
  P.decal('turret', 'number', 'OTCO', 0.20, [-1.47, 0.39, -0.72], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.42);
}

function buildLeo2A4OTCO(P: GermanBuilderPort): void {
  buildLeo2A4(P);
  addOTCOPackage(P);
}

export const GERMANY_PROFILES = {
  leo2a4_otco: { build: buildLeo2A4OTCO },
} satisfies VehicleProfileRecord;
