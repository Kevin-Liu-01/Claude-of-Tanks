// ARES APC (`ares_apc_x`) is an independent first-party procedural build.
// The owner's CC-BY-NC reference GLB is a hash-pinned, offline comparison
// oracle only; no source vertex, material, texture, node, or topology enters
// the playable runtime. Scalar dimensions below come from the assembled model
// in docs/references/tanks/ares_apc_x.md.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { blindTube, cappedTube } from './measuredPrimitives.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { ARES_APC_X_DATUMS } from '../aresApcXFrame.ts';

export { ARES_APC_X_DATUMS } from '../aresApcXFrame.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;

function part(geometry: THREE.BufferGeometry, name: string): THREE.BufferGeometry {
  geometry.userData.aresApc = name;
  return geometry;
}

function hullRoof(z: number): number {
  if (z <= 0.5) return 2.27;
  if (z <= 1.0) return 2.27 - (z - 0.5) * 0.42;
  if (z <= 2.0) return 2.06 - (z - 1.0) * 0.05;
  if (z <= 2.4) return 2.01 - (z - 2.0) * 0.40;
  return 1.85 - (z - 2.4) * (0.50 / 1.206);
}

function hullFloor(z: number): number {
  if (z <= 2.65) return 0.43;
  if (z <= 3.0) return 0.43 + (z - 2.65) * 0.59;
  return 0.637 + (z - 3.0) * 0.91;
}

function hullHalfWidth(z: number): number {
  if (z <= 2.7) return 1.525;
  return 1.525 - (z - 2.7) * (0.35 / 0.906);
}

function hullSection(z: number): SolidSection {
  const floor = hullFloor(z);
  const roof = hullRoof(z);
  const shoulder = hullHalfWidth(z);
  // The animated shoe envelope begins at x=1.00 and reaches y=1.185.
  // Preserve the source shoulder above it while keeping the lower tub and
  // its transition fully inboard until the course has cleared vertically.
  const tub = Math.min(0.96, shoulder - 0.12);
  const upper = Math.max(floor + 0.16, roof - 0.14);
  return { z, ring: [
    [-0.78, floor], [0.78, floor], [tub, floor + 0.13], [tub, 1.20],
    [shoulder, 1.27], [shoulder, upper], [shoulder - 0.10, roof],
    [-(shoulder - 0.10), roof], [-shoulder, upper], [-shoulder, 1.27],
    [-tub, 1.20], [-tub, floor + 0.13],
  ] };
}

function hullBody(P: TankBuilderPort): void {
  // The fixed source ruler distinguishes the armored nose from the forward
  // brush guard. Keep the closed body at the measured 6.975 m mask extent;
  // the guard/tow fittings retain the full 7.212 m physical envelope.
  const stations = [-2.58, -2.40, -1.0, 0, 0.5, 1.0, 1.5, 2.0, 2.4, 2.7, 3.0, 3.25, 3.439];
  P.add('hull', part(sectionSolid(stations.map(hullSection)), 'closed-hull-body'));

  // The source has two full-depth aft shoulder pods around a recessed troop
  // ramp, not a single filled stern block. Air remains between the ramp and
  // pod returns, preserving the defining rear architecture.
  for (const side of [-1, 1]) {
    const rearRing: readonly SectionPoint[] = side < 0
      ? [[-1.95, 1.27], [-0.96, 1.20], [-0.72, 0.92], [-0.62, 0.92], [-0.62, 2.26], [-1.95, 2.26]]
      : [[0.62, 0.92], [0.72, 0.92], [0.96, 1.20], [1.95, 1.27], [1.95, 2.26], [0.62, 2.26]];
    const frontRing: readonly SectionPoint[] = side < 0
      ? [[-1.91, 1.27], [-0.96, 1.20], [-0.72, 0.62], [-0.62, 0.62], [-0.62, 2.27], [-1.91, 2.27]]
      : [[0.62, 0.62], [0.72, 0.62], [0.96, 1.20], [1.91, 1.27], [1.91, 2.27], [0.62, 2.27]];
    P.add('hull', part(sectionSolid([
      { z: -3.606, ring: rearRing },
      { z: -2.40, ring: frontRing },
    ]), 'aft-shoulder-pod'));
  }
  P.addHatch('hull', part(box(1.25, 1.43, 0.12), 'rear-troop-ramp'), -0.05, 1.345, -2.655);
  P.add('hullDark', part(box(1.13, 0.018, 0.025), 'ramp-upper-seam'), -0.05, 2.04, -2.724);
  for (const side of [-1, 1]) {
    P.add('hullDark', part(cylX(0.035, 0.16, P.q ? 12 : 8), 'ramp-hinge'), side * 0.47, 0.69, -2.73);
    P.add('hullDetail', part(box(0.055, 0.22, 0.035), 'ramp-lock'), side * 0.48, 1.54, -2.73);
  }
}

function runningGear(P: TankBuilderPort): void {
  const D = ARES_APC_X_DATUMS;
  // owner 2026-09-22 ("standardize our wheels across NATIONS"): the road-wheel face is the UK IFV nation
    // construction (fv510_milan_x, nationWheelSets.ts), fitted by the running-gear builder into this hull's own wheel envelope.
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: D.wheelR, wheelW: 0.354, wheelY: D.wheelY,
    wheelZs: [...D.wheelStations], xc: D.trackX, roadWheelOutsetM: 0.031,
    sprocket: { ...D.sprocket }, idler: { ...D.idler },
    rollers: [
      { z: -1.55, y: 0.93, r: 0.11 }, { z: -0.45, y: 0.96, r: 0.11 },
      { z: 0.72, y: 0.98, r: 0.11 }, { z: 1.84, y: 1.01, r: 0.11 },
    ],
    trackW: D.trackW, trackTh: 0.055, topY: 1.07, botY: 0.028,
    contactZR: -1.63, contactZF: 2.72, deadSag: 0.025, coveredTop: true,
    trackPattern: 'british-rubber-pad',
    suspensionPattern: 'torsion-swing-arm', wheelSeat: 'authored', bandSeat: 'ground',
    arms: P.q,
  });
}

function sideArmor(P: TankBuilderPort): void {
  const stations = [-2.56, -1.5, 0, 1.5, 2.4, 3.0, 3.42];
  for (const side of [-1, 1]) {
    const armorSections: SolidSection[] = stations.map((z) => {
      const top = Math.min(2.27, hullRoof(z) + 0.01);
      const ring: readonly SectionPoint[] = side < 0
        ? [[-1.935, 1.21], [-1.538, 1.21], [-1.538, top], [-1.935, top]]
        : [[1.538, 1.21], [1.935, 1.21], [1.935, top], [1.538, top]];
      return { z, ring };
    });
    P.addExternalArmor('hull', part(sectionSolid(armorSections), 'continuous-side-applique'));
    for (const z of P.q ? [-1.72, -0.88, -0.04, 0.80, 1.64, 2.48] : []) {
      const top = Math.min(2.27, hullRoof(z) + 0.01);
      P.add('hullDetail', part(box(0.014, top - 1.21, 0.018), 'applique-shallow-seam'),
        side * 1.943, (top + 1.21) / 2, z);
      for (const y of [1.25, top - 0.09]) {
        P.add('hullDetail', part(cylX(0.013, 0.02, 8), 'applique-fastener'), side * 1.943, y, z);
      }
    }
    P.addMudguard('ares-apc-skirt', 'hullRubber', part(box(0.035, 0.58, 5.62), 'track-skirt'),
      side * 1.665, 0.82, 0.20);
    P.add('hullDark', part(box(0.06, 0.05, 6.04), 'skirt-support-rail'), side * 1.61, 1.12, 0.20);
  }
}

function frontGuard(P: TankBuilderPort): void {
  // Open brush-guard lattice: real rails with real air, never a texture or a
  // filled plate. The source guard spans the broad sloping bow.
  for (const side of [-1, 1]) {
    P.add('hullDark', part(box(0.045, 0.47, 0.045), 'front-guard-post'), side * 1.93, 1.21, 3.34, -0.22);
    P.add('hullDark', part(box(0.045, 0.37, 0.045), 'front-guard-post'), side * 0.88, 1.19, 3.41, -0.22);
  }
  for (const y of [1.05, 1.27, 1.45]) {
    P.add('hullDark', part(cylX(0.024, 3.91, P.q ? 10 : 6), 'front-guard-rail'), 0, y, 3.41 - (y - 1.05) * 0.36);
  }
  for (const side of [-1, 1]) {
    P.add('hullDark', part(torus(0.075, 0.022, P.q ? 14 : 8), 'tow-eye'), side * 0.92, 0.92, 3.584, Math.PI / 2);
    P.add('hullDetail', part(box(0.21, 0.12, 0.10), 'headlamp-housing'), side * 1.31, 1.38, 3.29, -0.28);
    P.add('hullGlass', part(markVehicleNightLens(cylZ(0.055, 0.015, P.q ? 14 : 8), 'headlight'), 'headlamp-lens'),
      side * 1.31, 1.39, 3.35, -0.28);
  }
}

function roofHatches(P: TankBuilderPort): void {
  const hatches = [
    [0.326, 2.30, -1.83, 0.833, 0.966, 0.03],
    [0.68, 2.04, 1.55, 0.76, 0.79, -0.10],
    [0.62, 2.39, 0.22, 0.83, 0.78, 0.02],
    [-0.43, 2.30, -0.30, 0.76, 0.72, 0.02],
  ] as const;
  for (const [x, y, z, w, d, rz] of hatches) {
    const bevel = Math.min(0.11, w * 0.16, d * 0.16);
    P.addHatch('hull', part(KIT.polyMultiLoft([
      [-w / 2 + bevel, -d / 2], [w / 2 - bevel, -d / 2], [w / 2, -d / 2 + bevel],
      [w / 2, d / 2 - bevel], [w / 2 - bevel, d / 2], [-w / 2 + bevel, d / 2],
      [-w / 2, d / 2 - bevel], [-w / 2, -d / 2 + bevel],
    ], [
      { height: 0, inset: 1 },
      { height: 0.055, inset: 0.96 },
    ]), 'beveled-roof-hatch'), x, y - 0.035, z, 0, 0, rz);
    P.add('hullDark', part(box(w * 0.70, 0.018, 0.028), 'hatch-hinge'), x, y + 0.035, z - d * 0.48, 0, 0, rz);
    P.add('hullDark', part(torus(0.065, 0.012, P.q ? 12 : 8), 'hatch-handle'), x + w * 0.25, y + 0.045, z + d * 0.18, Math.PI / 2);
  }
  for (const x of [-0.78, 0.82]) {
    P.add('hullGlass', part(box(0.22, 0.07, 0.025), 'driver-periscope'), x, 1.94, 2.16, -0.16);
  }
}

function smokeLaunchers(P: TankBuilderPort): void {
  // Four banks of four source-counted tubes: two banks per side, sixteen
  // open mouths total. Each tube is a blind annular solid with a real bore.
  const banks = [
    [-1, -1.020, 0.484], [-1, -0.738, 1.105],
    [1, 1.342, 1.012], [1, 1.410, 1.212],
  ] as const;
  for (const [side, x, z] of banks) {
    P.addEquipment('hull', part(box(0.34, 0.20, 0.25), 'smoke-bank-base'), x, 2.18, z, 0.10, 0, side * 0.14);
    for (let index = 0; index < 4; index++) {
      const row = Math.floor(index / 2), column = index % 2;
      P.add('hullDark', part(blindTube(0.038, 0.025, 0.25, 0.055, P.q ? 16 : 6), 'smoke-tube'),
        x + side * (column - 0.5) * 0.095, 2.28 + row * 0.09, z + (column - 0.5) * 0.10,
        -0.30, side * 0.36, 0);
    }
  }
}

function exactL111A1(P: TankBuilderPort): void {
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material,
    x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    P.disposables.push(geometry);
  };
  // Gun-local origin is the actual trunnion. The receiver core belongs to
  // the standard pitching gunMount bucket and the barrel to the recoil
  // bucket. Besides preserving the real articulation hierarchy, those two
  // authored solids are the inputs for the bounded moving shadow proxy.
  P.add('gunMount', part(box(0.22, 0.20, 0.70), 'l111a1-receiver'), 0, -0.01, -0.11);
  P.add('gunMount', part(cylX(0.055, 0.54, P.q ? 18 : 8), 'l111a1-trunnion'),
    0, -0.07, 0.04);
  // Owner 2026-09-22 ("the point of adding holes instead of carving them into
  // the barrel is that we save on triangles"): the L111A1 barrel is closed
  // solid stock. Until then it was a blindTube with a .016 bore 35 mm deep
  // that sat entirely behind the factory's dark mouth disc (recorded here).
  P.add('gun', part(cappedTube(0.030, 0.94, P.q ? 64 : 8), 'l111a1-barrel'),
    0, 0.01, 0.77);
  P.add('gunDark', part(cylZ(0.052, 0.20, P.q ? 18 : 8), 'l111a1-jacket'),
    0, 0.01, 0.38);
  P.add('gunMount', part(box(0.539, 0.396, 0.221), 'l111a1-ammo-box'),
    0.43, -0.07, 0.02);
  P.add('gunMount', part(box(0.24, 0.10, 0.18), 'l111a1-feed-bridge'),
    0.23, 0.01, 0.27, 0, -0.20);
  // The Ares carries an exposed ready-use disintegrating-link belt between
  // the side box and receiver. Keep each cartridge physically round and
  // merge the complete belt into the single articulated mount draw.
  const beltRounds = P.q ? 22 : 7;
  for (let index = 0; index < beltRounds; index++) {
    const t = index / (beltRounds - 1);
    P.add('gunMountDark', part(cylZ(0.009, 0.11, P.q ? 8 : 5), 'l111a1-ready-round'),
      0.055 + 0.42 * t, 0.128 + 0.008 * Math.sin(t * Math.PI), 0.19 + 0.035 * t,
      0, 0.10, 0);
  }

  // The source-measured external weapon fittings remain a visible exact
  // group for the fleet fitting census. They share gunG with gunMount, so
  // the top cover and EO head pitch with the receiver/feed assembly.
  add(part(box(0.20, 0.025, 0.64), 'l111a1-top-cover'), P.mats.detail, 0, 0.105, -0.10);
  add(part(box(0.36, 0.46, 0.82), 'rws-optic-head'), P.mats.detail, 0.02, -0.16, 0.02);
  add(part(box(0.20, 0.13, 0.012), 'rws-optic-aperture'), P.mats.glass, 0.02, -0.12, 0.436);
  group.name = 'aresL111A1ExactRemoteWeapon';
  group.userData.weaponName = 'L111A1 12.7 mm remote weapon';
  group.userData.remoteControlled = true;
  group.userData.firingAxis = '+Z';
  group.userData.muzzleLocalZ = ARES_APC_X_DATUMS.muzzleZ - ARES_APC_X_DATUMS.trunnion[2];
  FITTINGS.markExact(group, 'pintleMG');
  P.gunG.add(group);
  P.muzzleZ = group.userData.muzzleLocalZ;
}

function remoteWeaponStation(P: TankBuilderPort): void {
  const T = ARES_APC_X_DATUMS.turretPivot;
  // Closed deck plinth bridges the bearing across the adjacent hatch seam.
  // It belongs to the hull and overlaps both the roof skin and yaw bearing,
  // leaving no player-visible slit into the vehicle.
  P.add('hull', part(cylY(0.34, 0.38, 0.08, P.q ? 48 : 10), 'rws-deck-plinth'),
    T[0], 2.285, T[2]);
  // These three closed pieces are the station's armored yaw structure, not
  // detachable roof dressing. Keeping them on the turret owner gives combat
  // anatomy a real remote-station collision shell.
  P.add('turret', part(cylY(0.24, 0.29, 0.10, P.q ? 48 : 10), 'rws-bearing'), 0, 0.05, 0);
  P.add('turretDark', part(torus(0.245, 0.020, P.q ? 22 : 10), 'rws-slew-ring'), 0, 0.11, 0);
  P.add('turret', part(box(0.56, 0.34, 0.52), 'rws-pedestal'), 0, 0.32, -0.03);
  for (const side of [-1, 1]) {
    P.add('turretDark', part(box(0.055, 0.72, 0.16), 'rws-cradle-arm'), side * 0.40, 0.57, -0.06, 0, 0, side * 0.05);
    P.add('turretDark', part(cylX(0.05, 0.08, P.q ? 14 : 8), 'rws-cradle-cap'), side * 0.40, 0.82, -0.10);
  }
  P.add('turret', part(box(0.28, 0.38, 0.42), 'rws-service-box'), 0.31, 0.55, -0.22);
  P.addModuleVisual('optics', 'turretGlass', part(box(0.16, 0.12, 0.016), 'rws-fixed-optic'), -0.02, 0.64, 0.411);
  P.add('turretDark', part(cylY(0.008, 0.008, 0.46, 8), 'rws-vertical-aerial'), 0.17, 0.76, -0.34);
  exactL111A1(P);
  P.topY = Math.max(P.topY || 0, ARES_APC_X_DATUMS.dims.silhouetteHeightM - T[1]);
}

function buildAresApcX(P: TankBuilderPort): void {
  hullBody(P);
  runningGear(P);
  sideArmor(P);
  frontGuard(P);
  roofHatches(P);
  smokeLaunchers(P);
  remoteWeaponStation(P);
  for (const side of [-1, 1]) {
    P.decal('hull', 'roundel', null, 0.20, [side * 1.946, 1.72, -0.60], side * -Math.PI / 2);
    P.decal('hull', 'number', P.spec.visual.number || '93', 0.25, [side * 1.946, 1.50, 1.30], side * -Math.PI / 2);
  }
  if (P.geometryReceipt) {
    P.hullG.userData.aresApcReceipt = Object.freeze({
      architecture: 'ares-apc-x-r1',
      datums: ARES_APC_X_DATUMS,
      roadWheelsPerSide: 7,
      returnRollersPerSide: 4,
      roofHatches: 4,
      smokeTubes: 16,
      troopRamp: true,
      sourceRuntimeGeometry: false,
      independentProceduralBuild: true,
    });
  }
}

export const ARES_APC_X_PROFILES = Object.freeze({
  ares_apc_x: Object.freeze({ build: buildAresApcX }),
}) satisfies VehicleProfileRecord;
