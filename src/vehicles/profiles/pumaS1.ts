import { armorLoft } from './europeSourcePrimitives.ts';
import { weaponAssembly } from './weaponStock.ts';
// Independent first-party procedural SPz Puma S1.
//
// The local owner-supplied GLB is used only as a proportion/anatomy oracle.
// This builder shares no donor geometry and never calls the legacy SPz Puma
// builder; every hull station, running-gear course, RCT30 surface and fitting
// below is authored from repository primitives.

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, convexSlab, muzzleTipDot } from './kit.ts';
import {
  applyAdvancedIfvScale,
  type AdvancedIfvScalePort,
} from './advancedIfvScale.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { mountRotated as mount } from './fittingMount.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { hatchParts, reserveDecorVolume } from './fieldChest.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface PumaS1BuilderPort extends AdvancedIfvScalePort {
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material> & {
    readonly canvasCloth: THREE.MeshStandardMaterial;
    readonly wheels?: THREE.MeshStandardMaterial;
  };
  readonly q?: boolean;
  readonly disposables: Array<{ dispose(): void }>;
  readonly geometryReceipt?: boolean;
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  muzzleZ: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addCupola(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): void;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): void;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

interface OpenGunCradleConfig {
  rearZ: number;
  frontZ: number;
  rearHalfWidth: number;
  frontHalfWidth: number;
  rearHalfHeight: number;
  frontHalfHeight: number;
  railThickness: number;
  skinThickness: number;
}

function openCradleBeam(
  P: PumaS1BuilderPort,
  from: Vec3,
  to: Vec3,
  thickness: number,
  dark = false,
): void {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const geometry = new THREE.BoxGeometry(thickness, thickness, direction.length());
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), direction.normalize(),
  ));
  geometry.translate(
    (from[0] + to[0]) * 0.5,
    (from[1] + to[1]) * 0.5,
    (from[2] + to[2]) * 0.5,
  );
  (dark ? P.addGunExtraDark : P.addGunExtra).call(P, geometry);
}

function openCradleSkin(
  P: PumaS1BuilderPort,
  corners: [Vec3, Vec3, Vec3, Vec3],
  thickness: number,
  dark = false,
): void {
  const points = corners.map((corner) => new THREE.Vector3(...corner));
  const normal = points[1].clone().sub(points[0])
    .cross(points[3].clone().sub(points[0]))
    .normalize()
    .multiplyScalar(thickness * 0.5);
  const vertices = points.flatMap((point) => [
    ...point.clone().add(normal).toArray(),
    ...point.clone().sub(normal).toArray(),
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 0, 0, 1, 0, 1, 0,
    1, 1, 1, 1, 0, 1, 0, 1,
  ], 2));
  geometry.setIndex([
    0, 2, 4, 0, 4, 6,
    1, 7, 5, 1, 5, 3,
    0, 1, 3, 0, 3, 2,
    2, 3, 5, 2, 5, 4,
    4, 5, 7, 4, 7, 6,
    6, 7, 1, 6, 1, 0,
  ]);
  geometry.computeVertexNormals();
  if (dark) P.addGunExtraDark(geometry); else P.addGunExtra(geometry);
}

function addOpenTrapezoidGunCradle(
  P: PumaS1BuilderPort,
  config: OpenGunCradleConfig,
): void {
  const section = (fraction: number) => ({
    z: THREE.MathUtils.lerp(config.rearZ, config.frontZ, fraction),
    halfWidth: THREE.MathUtils.lerp(config.rearHalfWidth, config.frontHalfWidth, fraction),
    halfHeight: THREE.MathUtils.lerp(config.rearHalfHeight, config.frontHalfHeight, fraction),
  });
  const rear = section(0);
  const front = section(1);

  // The upper and lower skins read as one clean, tapered weapon shroud while
  // its open nose and tail leave the cannon tubes physically unobstructed.
  openCradleSkin(P, [
    [-rear.halfWidth, rear.halfHeight, rear.z],
    [rear.halfWidth, rear.halfHeight, rear.z],
    [front.halfWidth, front.halfHeight, front.z],
    [-front.halfWidth, front.halfHeight, front.z],
  ], config.skinThickness);
  openCradleSkin(P, [
    [-rear.halfWidth, -rear.halfHeight, rear.z],
    [-front.halfWidth, -front.halfHeight, front.z],
    [front.halfWidth, -front.halfHeight, front.z],
    [rear.halfWidth, -rear.halfHeight, rear.z],
  ], config.skinThickness);

  // Four corner chords establish a crisp outer edge around the skins.
  for (const side of [-1, 1] as const) {
    for (const vertical of [-1, 1] as const) {
      openCradleBeam(P,
        [side * rear.halfWidth, vertical * rear.halfHeight, rear.z],
        [side * front.halfWidth, vertical * front.halfHeight, front.z],
        config.railThickness);
    }
  }

  // Each flank is mostly skinned. Three narrow forward-raked webs divide the
  // reveal into four slash-shaped ports; all openings remain side-only.
  const sidePoint = (side: -1 | 1, fraction: number, heightScale: number): Vec3 => {
    const current = section(fraction);
    return [side * current.halfWidth, heightScale * current.halfHeight, current.z];
  };
  const portHalfHeight = 0.24;
  const webCenters = [0.285, 0.50, 0.715] as const;
  const webHalfWidth = 0.035;
  const webRake = 0.060;
  for (const side of [-1, 1] as const) {
    openCradleSkin(P, [
      sidePoint(side, 0, portHalfHeight), sidePoint(side, 1, portHalfHeight),
      sidePoint(side, 1, 1), sidePoint(side, 0, 1),
    ], config.skinThickness);
    openCradleSkin(P, [
      sidePoint(side, 0, -1), sidePoint(side, 1, -1),
      sidePoint(side, 1, -portHalfHeight), sidePoint(side, 0, -portHalfHeight),
    ], config.skinThickness);
    openCradleSkin(P, [
      sidePoint(side, 0, -portHalfHeight), sidePoint(side, 0.08, -portHalfHeight),
      sidePoint(side, 0.14, portHalfHeight), sidePoint(side, 0, portHalfHeight),
    ], config.skinThickness);
    for (const center of webCenters) {
      openCradleSkin(P, [
        sidePoint(side, center - webHalfWidth, -portHalfHeight),
        sidePoint(side, center + webHalfWidth, -portHalfHeight),
        sidePoint(side, center + webRake + webHalfWidth, portHalfHeight),
        sidePoint(side, center + webRake - webHalfWidth, portHalfHeight),
      ], config.skinThickness);
    }
    openCradleSkin(P, [
      sidePoint(side, 0.86, -portHalfHeight), sidePoint(side, 1, -portHalfHeight),
      sidePoint(side, 1, portHalfHeight), sidePoint(side, 0.92, portHalfHeight),
    ], config.skinThickness);
    // 2026-10-10 (fleet-weapons lane, round 3; wave 348c's critics: the shroud "hovers above a dark open gap with
    // stair-stepped teeth along its edge, so the gun mount reads as an open, unattached shell"): a dark backing plate
    // closes the slash ports 30 mm inside the flank, so they read as recessed louvres in a closed shroud.
    const recess = (fraction: number, heightScale: number): Vec3 => {
      const p = sidePoint(side, fraction, heightScale);
      return [p[0] - side * .03, p[1], p[2]];
    };
    openCradleSkin(P, [
      recess(0.02, -portHalfHeight * 1.08), recess(0.98, -portHalfHeight * 1.08),
      recess(0.98, portHalfHeight * 1.08), recess(0.02, portHalfHeight * 1.08),
    ], config.skinThickness, true);
  }
}

function addHullShell(P: PumaS1BuilderPort): void {
  const { box, frustum } = KIT;
  // The widened lower tub reaches the inner shoe faces and provides a real
  // structural seat for the fender bridge instead of leaving a daylight slot.
  P.add('hull', box(2.22, 0.66, 7.18), 0, 0.73, 0);
  P.add('hull', frustum(1.10, 3.50, -3.48, 1.10, 2.74, -3.48, 0.78, 1.42));
  P.add('hull', orientedSlab(
    [-1.10, 0.43, 2.18], [1.10, 0.43, 2.18], [1.10, 0.43, 3.55], [-1.10, 0.43, 3.55],
    [-1.18, 1.50, 1.92], [1.18, 1.50, 1.92], [1.05, 1.56, 3.55], [-1.05, 1.56, 3.55],
  ));
  P.add('hull', orientedSlab(
    [-1.05, 1.56, 3.55], [1.05, 1.56, 3.55], [1.56, 1.82, 1.60], [-1.56, 1.82, 1.60],
    [-1.12, 1.72, 3.55], [1.12, 1.72, 3.55], [1.56, 1.98, 1.60], [-1.56, 1.98, 1.60],
  ));
  // Puma protection wraps a high troop cell. Its broad upper shoulders
  // have a short outward knee, unlike the Swedish narrow roof bevel.
  P.add('hull', armorLoft([
    [-3.65, 1.40, 1.49, 1.37, 1.28, 1.78, 2.04],
    [-3.26, 1.51, 1.66, 1.48, 1.28, 1.80, 2.04],
    [ .88, 1.51, 1.66, 1.48, 1.28, 1.80, 2.04],
    [1.44, 1.48, 1.66, 1.47, 1.28, 1.80, 2.08],
    [1.72, 1.42, 1.56, 1.43, 1.28, 1.79, 1.98],
  ]));
  P.add('hull', box(2.12, 0.54, 0.16), 0, 1.02, 3.72, -0.08, 0, 0);
  P.add('hullDark', box(2.64, 0.035, 2.44), 0, 2.045, -1.52);
  for (let index = 0; index < 12; index++) {
    P.add('hullDetail', box(2.42, 0.018, 0.052), 0, 2.069, -2.57 + index * 0.16);
  }

  // Driver hatch, hull camera pods and tow/lift hardware are sunk into the
  // roof/glacis planes. Equipment uses camouflage-aware buckets.
  // Owner markup 2026-10-14: the driver's hatch was a bare disc with a dark ring. It is now a real closed hatch
  // (coaming, lid with centre plate and stiffeners, hinge to the rear, grab handle, locking lever, seal).
  {
    const hatch = hatchParts(0.31, !!P.q, -1);
    for (const g of hatch.lid) P.addCupola('hull', g, 0.68, 2.0475, 1.48);
    for (const g of hatch.dark) P.add('hullDark', g, 0.68, 2.0475, 1.48);
  }
  for (const x of [0.48, 0.68, 0.88]) KIT.periscope(P, 'hullDetail', x, 2.095, 1.80);
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.135, r: 0.047, shield: true,
      rake: -0.28, seed: side < 0 ? 110 : 111,
    }), side * 1.04, 1.52, 2.72, [-0.35, 0, 0]);
    P.addEquipment('hull', box(0.34, 0.24, 0.31), side * 1.10, 1.54, 2.40, -0.24, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.21, 0.105, 0.018),
      side * 1.10, 1.58, 2.58, -0.24, 0, 0);
    KIT.liftEye(P, 'hullDetail', side * 1.00, 1.34, 3.11);
  }
  KIT.towCable(P, [[-1.20, 1.49, 2.58], [-0.62, 1.31, 3.02],
    [0.62, 1.31, 3.02], [1.20, 1.49, 2.58]]);

  // Rear troop ramp and its physical hinges/locks.
  // A full-depth rear bulkhead now overlaps the lower tub, the monocoque's
  // raked stern and the troop-ramp backing.  The old ramp began 8-14 cm
  // behind those structures, which exposed a daylight seam from low rear
  // quarters even though every individual panel was nominally hull-owned.
  // Keep the aft face locked to the ramp stack while pulling the hidden
  // forward face behind the compact track's rear shoe envelope. At the
  // reduced vehicle scale the former 0.20 m depth landed inside a wrap shoe
  // by 16 mm even though the unscaled audit grid rounded it clear.
  P.add('hull', box(2.98, 1.18, 0.14), 0, 1.15, -3.69);
  P.add('hullDark', box(1.72, 1.12, 0.045), 0, 1.14, -3.755);
  P.add('hull', box(1.56, 0.92, 0.055), 0, 1.15, -3.785);
  P.add('hullDetail', box(1.38, 0.035, 0.020), 0, 1.15, -3.818);
  for (const x of [-0.58, 0, 0.58]) {
    P.add('hullDark', KIT.cylX(0.055, 0.19, 12), x, 1.66, -3.82);
    P.add('hullDetail', box(0.08, 0.21, 0.035), x, 0.87, -3.82);
  }
  for (const side of [-1, 1]) {
    P.addEquipment('hull', box(0.36, 0.44, 0.31), side * 1.24, 1.46, -3.55);
    P.add('hullDark', box(0.22, 0.24, 0.022), side * 1.24, 1.45, -3.806);
    P.addModuleVisual('optics', 'hullGlass', box(0.12, 0.085, 0.012),
      side * 1.24, 1.52, -3.820);
  }
}

function addRunningGear(P: PumaS1BuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.72, wheelR: 0.345, wheelW: 0.24, wheelY: 0.42, xc: 1.47,
    wheelZs: [2.42, 1.51, 0.59, -0.34, -1.28, -2.20],
    sprocket: { z: 3.17, y: 0.965, r: 0.35 },
    idler: { z: -3.15, y: 0.84, r: 0.30 },
    rollerR: 0.09,
    rollers: [{ z: 2.08, y: 1.02 }, { z: 0.72, y: 1.03 }, { z: -0.62, y: 1.03 },
      { z: -1.94, y: 1.01 }],
    trackW: 0.56, trackTh: 0.092, topY: 1.28, botY: 0.055,
    trackPattern: 'compact-ifv', linkPitchM: 0.155, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: false,
    // The loaded course leaves the ground beneath the aft road-wheel
    // quadrant.  Continuing it to -2.63 made the joint happen in empty space
    // behind that wheel before the run climbed around the rear idler.
    contactZF: 2.70, contactZR: -2.37,
  });

  // The native course terminates immediately beneath a Revolution-style
  // AMAP jacket.  Its inboard carrier overlaps the monocoque side wall, while
  // the broad, raked protection modules sit outside the shoe envelope.  This
  // makes the skirt read as one load-bearing hull system instead of a floating
  // two-row brick wall.
  for (const side of [-1, 1]) {
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.82, 0.82, 2.48], [side * 2.00, 0.82, 2.48],
      [side * 1.96, 0.82, 3.55], [side * 1.82, 0.82, 3.55],
      [side * 1.80, 1.54, 2.48], [side * 1.98, 1.54, 2.48],
      [side * 1.94, 1.72, 3.55], [side * 1.80, 1.72, 3.55],
    ));
    // One cyclic, non-self-crossing shoulder volume replaces the old bow-tie
    // cap plus overlapping tie strip.  Its inner rail overlaps the authored
    // hull shoulder, its outer rail overlaps the AMAP downfold, and its crown
    // follows the upper-glacis fall all the way to the nose on both sides.
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.44, 1.54, 2.42], [side * 1.96, 1.54, 2.42],
      [side * 1.92, 1.54, 3.55], [side * 1.04, 1.54, 3.55],
      [side * 1.44, 2.04, 2.42], [side * 1.88, 1.98, 2.42],
      [side * 1.92, 1.72, 3.55], [side * 1.04, 1.72, 3.55],
    ));
    const jacketRearZ = -3.40;
    const jacketFrontZ = 2.48;
    const panelCount = 8;
    const panelLength = (jacketFrontZ - jacketRearZ) / panelCount;
    // Deep monocoque carrier: its lower inner face clears the animated shoe
    // envelope by 21 mm, while its upper edge leans inward and is locked to
    // the hull by the continuous fender flanges above.
    P.addExternalArmor('hull', orientedSlab(
      [side * 1.78, 0.72, jacketRearZ], [side * 1.90, 0.72, jacketRearZ],
      [side * 1.90, 0.72, jacketFrontZ], [side * 1.78, 0.72, jacketFrontZ],
      [side * 1.76, 1.88, jacketRearZ], [side * 1.90, 1.88, jacketRearZ],
      [side * 1.90, 1.88, jacketFrontZ], [side * 1.76, 1.88, jacketFrontZ],
    ));
    P.add('hull', KIT.box(0.24, 0.15, jacketFrontZ - jacketRearZ + 0.06),
      side * 1.60, 1.98, (jacketFrontZ + jacketRearZ) * 0.5);
    P.add('hull', KIT.box(0.36, 0.12, jacketFrontZ - jacketRearZ + 0.02),
      side * 1.49, 1.84, (jacketFrontZ + jacketRearZ) * 0.5);

    for (let index = 0; index < panelCount; index++) {
      const z = jacketRearZ + panelLength * (index + 0.5);
      const frontPanel = index === panelCount - 1;
      const panelTopY = frontPanel ? 1.77 : 1.88;
      const panelBottomY = frontPanel ? 0.82 : 0.74;
      const panelHeight = panelTopY - panelBottomY;
      // Thick removable Puma modules have a bevel at both edges, with
      // the broad center face proud of the carrier and a folded top return.
      const half = (panelLength - .028) / 2;
      P.addExternalArmor('hull', convexSlab(
        [side*1.82,panelBottomY,z-half], [side*1.82,panelBottomY,z+half],
        [side*2.01,panelBottomY+.13,z+half], [side*2.01,panelBottomY+.13,z-half],
        [side*1.82,panelTopY,z-half], [side*1.82,panelTopY,z+half],
        [side*2.01,panelTopY-.13,z+half], [side*2.01,panelTopY-.13,z-half],
      ));
      P.addExternalArmor('hull', KIT.box(.025,panelHeight-.28,panelLength-.10),
        side*2.020,(panelTopY+panelBottomY)*.5,z);
      if (index > 0) {
        P.add('hullDark', KIT.box(0.024, panelHeight - 0.14, 0.020),
          side * 2.038, (panelTopY + panelBottomY) * 0.5,
          jacketRearZ + panelLength * index);
      }
      for (const y of [panelBottomY + 0.16, panelTopY - 0.16]) {
        P.add('hullDetail', KIT.cylX(0.016, 0.024, 8), side * 2.040, y, z,
          0, 0, side * Math.PI / 2);
      }
    }
    // A recessed waist shadow and deep lower rubber lip articulate the jacket
    // while preserving a single continuous protective mass.
    P.add('hullDark', KIT.box(0.028, 0.026, jacketFrontZ - jacketRearZ - 0.10),
      side * 2.038, 1.31, (jacketFrontZ + jacketRearZ) * 0.5);
    P.hangMudguard('puma-jacket-hem', 'hullRubber', KIT.box(0.045, 0.16, jacketFrontZ - jacketRearZ + 0.02),
      side * 2.022, 0.72, (jacketFrontZ + jacketRearZ) * 0.5);

    // Recessed flank camera and paired marker lamps remain readable above the
    // armor instead of being texture-only marks compressed across the plates.
    for (const z of [1.05, -1.34]) {
      P.addEquipment('hull', KIT.box(0.095, 0.25, 0.32),
        side * 1.98, 1.82, z, 0, 0, side * 0.03);
      P.addModuleVisual('optics', 'hullDark', KIT.box(0.024, 0.17, 0.23),
        side * 2.036, 1.82, z, 0, 0, side * 0.03);
      P.addModuleVisual('optics', 'hullGlass', KIT.box(0.013, 0.10, 0.15),
        side * 2.056, 1.82, z, 0, 0, side * 0.03);
    }
    for (const z of [2.17, -2.72]) {
      P.addEquipment('hull', KIT.box(0.080, 0.13, 0.18), side * 2.012, 1.84, z);
      P.addModuleVisual('optics', 'hullGlass', KIT.box(0.012, 0.075, 0.105),
        side * 2.058, 1.84, z);
    }
  }
}

function addTurret(P: PumaS1BuilderPort): void {
  const { box, cylY, cylZ, buildGun } = KIT;
  // Low unmanned RCT body: square service bustle, asymmetric forward
  // cheeks and a spine rising behind the gun. The sensor-side shoulder is
  // wider than the MELLS side, matching its separate equipment functions.
  P.add('turretDark', cylY(.89, .97, .12, 32), 0, -.02, -.15);
  const rct = armorLoft([
    [-1.58, .64, .78, .70, .03, .40, .69],
    [-1.20, .87, 1.00, .90, .02, .42, .74],
    [ -.15, .91, 1.02, .88, .02, .40, .74],
    [ .58, .85, .98, .75, .03, .30, .70],
    [1.07, .46, .72, .49, .04, .22, .54],
    [1.43, .24, .35, .27, .06, .15, .35],
  ]);
  // Only the forward right cheek broadens; no global scale changes the bore
  // or the launcher seats. The body remains a closed section solid.
  const vertices = rct.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    if (vertices.getX(i) > 0 && vertices.getZ(i) > .10)
      vertices.setX(i, vertices.getX(i) + .10 * Math.min(1, (vertices.getZ(i) - .10) / .48));
  }
  rct.computeVertexNormals(); rct.computeBoundingBox();
  P.add('turret', rct);
  for (const side of [-1, 1]) {
    P.add('turret', orientedSlab(
      [side * 0.28, 0.04, 1.46], [side * 1.03, 0.08, 0.62],
      [side * 1.00, 0.10, -0.18], [side * 0.50, 0.05, -0.26],
      [side * 0.24, 0.66, 1.14], [side * 0.72, 0.66, 0.42],
      [side * 0.88, 0.62, -0.18], [side * 0.45, 0.63, -0.26],
    ));
  }

  // MK30 trunnion with a genuine coax bore. A restrained hollow trapezoid
  // cradle surrounds both tubes, with its only openings cut into the flanks.
  P.addGunExtraDark(cylZ(0.145, 0.46, 22), 0, 0, 0.62);
  addOpenTrapezoidGunCradle(P, {
    rearZ: 0.20, frontZ: 1.432,
    rearHalfWidth: 0.245, frontHalfWidth: 0.168,
    rearHalfHeight: 0.154, frontHalfHeight: 0.098,
    railThickness: 0.0322, skinThickness: 0.0224,
  });
  // The 30 mm tube has a substantial external jacket at the muzzle. The
  // factory's canonical measured bore assembly seats against its real cap;
  // avoiding a second authored bore keeps the small-caliber throat perfectly
  // concentric instead of letting two independently segmented discs compete.
  buildGun(P, { len: 2.85, r: 0.056, sleeve: false, collar: true, baseR: 0.112 });
  // 227 gun-gaps (owner 2026-10-17, "fix any of these" with the C2 gun gap): the recoiling base (r 0.116) ends 0.068 m
  // behind the trunnion, right at the turret face; at full depression its top rim rocks 2 cm forward off the face and
  // opened a 14 mm notch along the gun line (5 of 24 directions). A 0.090 m trunnion sleeve now continues the base aft
  // into the face to 0.11 m behind the trunnion, inside the base's own section, so the gun line never stands clear of
  // a surface at any pitch. (r3: the r2 0.110 x 0.16 m sleeve reached the field suit's gun keep-out and re-laid the
  // turret's net and garnish, the yellow clump becoming grass; at this section the suit's net and leaves hash
  // identical to the pre-lane build.)
  P.addGunExtra(cylZ(0.090, 0.07, 22), 0, 0, -0.075);
  // 2026-10-10 (fleet-weapons lane, round 3; wave 348c's critics: a thin plain-grey rod as long as the gun running from
  // the gun's root across the lower left beside the barrel): the coax's barrel runs inside the cradle and stands 0.19 m
  // proud of its front with its flash hider, as a coaxial machine gun does; it was a 1.95 m rod out to the cannon's muzzle.
  // The barrel ends 2 cm inside its hider: a barrel cap flush with the hider's face is a duplicated disc (the
  // circular-cap lint).
  P.addGunExtraDark(cylZ(0.019, 0.85, 12), 0.20, -0.025, 1.175);
  P.addGunExtraDark(cylZ(0.025, 0.05, 12), 0.20, -0.025, 1.595);
  muzzleTipDot(P, 0.20, -0.025, 1.62, 0.012, { parent: 'gunG' });
  P.gunG.userData.pumaS1OpenGunCradleReceipt = Object.freeze({
    architecture: 'hollow-trapezoid-slash-port-cradle-v3',
    movingWithGun: true,
    verticalOffsetM: -0.13,
    scaleFromInitialCompactEnvelope: 0.70,
    lengthM: 1.232,
    diagonalSidePortsPerSide: 4,
    topBottomSkins: true,
    sideSkinPanelsPerSide: 7,
    openFrontRear: true,
    surroundsMainBarrel: true,
    surroundsCoax: true,
  });

  // Puma-specific front electronics shoulders wrap the cannon root without
  // becoming armor or entering its recoil tree. Their faceted enclosures,
  // paired apertures and protected lamp banks match the dense RCT30 face while
  // preserving an open, readable gun corridor at every pitch angle.
  for (const side of [-1, 1] as const) {
    P.addEquipment('turret', orientedSlab(
      [side * 0.30, 0.22, 0.70], [side * 0.86, 0.24, 0.58],
      [side * 0.70, 0.24, 1.36], [side * 0.32, 0.22, 1.49],
      [side * 0.30, 0.62, 0.70], [side * 0.78, 0.63, 0.58],
      [side * 0.61, 0.62, 1.34], [side * 0.28, 0.58, 1.47],
    ));
    P.addEquipment('turret', box(0.21, 0.29, 0.43),
      side * 0.70, 0.43, 0.91, 0, -side * 0.10, 0);
    P.addModuleVisual('optics', 'turretDark', box(0.25, 0.18, 0.026),
      side * 0.48, 0.49, 1.492, 0, side * 0.025, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.17, 0.105, 0.014),
      side * 0.48, 0.49, 1.509, 0, side * 0.025, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.062, 0.052, 0.015),
      side * 0.61, 0.36, 1.437, 0, side * 0.05, 0);
    // The left cheek carries the compact protected lamp bank. The opposite
    // cheek is reserved for the complete rotating panoramic installation
    // below, so no loose circular pod competes with its silhouette.
    if (side < 0) {
      mount(P, 'turret', FITTINGS.lightCluster({
        mats: P.mats, pods: 2, spacing: 0.095, r: 0.035, shield: true,
        rake: -0.16, seed: 164,
      }), side * 0.76, 0.37, 1.26, [-0.05, 0, 0]);
    }

    // Flank mission-module boxes, louvres and fasteners project beyond the
    // base shell, producing the layered Puma silhouette visible in profile.
    P.addEquipment('turret', box(0.20, 0.44, 0.72),
      side * 1.01, 0.47, -0.50, 0, 0, -side * 0.045);
    for (let index = 0; index < 4; index++) {
      P.addEquipment('turret', box(0.022, 0.030, 0.48),
        side * 1.122, 0.35 + index * 0.082, -0.50);
    }
    for (const z of [-0.72, -0.28]) {
      P.addEquipment('turret', KIT.cylX(0.020, 0.025, 8),
        side * 1.139, 0.56, z);
    }

    // Low roof electronics are physically seated on the crown and leave both
    // the panoramic head and remote weapon tower with distinct envelopes.
    P.addEquipment('turret', box(0.40, 0.12, 0.34),
      side * 0.58, 0.79, -0.05, 0, side * 0.04, 0);
    P.addEquipment('turret', box(0.43, 0.025, 0.37),
      side * 0.58, 0.862, -0.05, 0, side * 0.04, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.16, 0.055, 0.016),
      side * 0.58, 0.80, 0.129, 0, side * 0.04, 0);
  }
  // A complete right-front rotating optic installation replaces the former
  // loose cheek apertures. A wide armored pedestal, azimuth turntable and
  // unarmed yoke make the whole assembly read as one founded subsystem.
  // Owner markup 2026-10-14 on this pedestal's broad flat flank: the panoramic sight stands on a round armoured column
  // under its turntable, as the Puma's commander sight does, not on a 0.5 m slab.
  P.addEquipment('turret', KIT.cylY(0.25, 0.28, 0.20, 20), 0.62, 0.72, 0.52);
  P.addEquipment('turret', KIT.cylY(0.25, 0.27, 0.075, 18), 0.62, 0.855, 0.52);
  // Critic panel 2026-10-15 on the owner markup: the sight column carries the commander's PERI RTWL head, the Puma's real
  // stabilised panoramic periscope (an armoured box with its day, thermal and laser windows behind a brow), not an empty
  // open-yoke station. Head 0.44 x 0.30 x 0.42 m on the turntable; the windows face forward.
  {
    const { box: b, cylY: cy, cylZ: cz } = KIT;
    const hx = 0.62, hz = 0.52, base = 0.8925, headY = base + 0.15;
    P.addEquipment('turret', cy(0.20, 0.22, 0.04, 20), hx, base + 0.02, hz);                     // azimuth bearing housing
    P.addEquipment('turret', b(0.44, 0.30, 0.42), hx, headY, hz);                                 // armoured head
    P.addEquipment('turret', b(0.40, 0.035, 0.38), hx, headY + 0.1675, hz);                      // roof plate
    P.addEquipment('turret', b(0.48, 0.035, 0.16), hx, headY + 0.13, hz + 0.24, -0.18, 0, 0);    // armoured brow
    for (const side of [-1, 1]) P.addEquipment('turret', b(0.03, 0.22, 0.12), hx + side * 0.21, headY - 0.01, hz + 0.24); // window cheeks
    P.add('turretDark', b(0.38, 0.19, 0.02), hx, headY - 0.01, hz + 0.215);                      // window frame
    P.addModuleVisual('optics', 'turretGlass', b(0.17, 0.12, 0.012), hx - 0.085, headY, hz + 0.228);      // day channel
    P.addModuleVisual('optics', 'turretGlass', b(0.12, 0.12, 0.012), hx + 0.085, headY, hz + 0.228);      // thermal channel
    P.addModuleVisual('optics', 'turretGlass', cz(0.028, 0.012, 14), hx + 0.085, headY - 0.085, hz + 0.228); // laser port
    P.add('turretDark', b(0.36, 0.012, 0.012), hx, headY + 0.075, hz + 0.232);                   // wiper bar
    for (const side of [-1, 1]) P.add('turretDark', b(0.025, 0.06, 0.05), hx + side * 0.235, headY + 0.05, hz - 0.08); // lifting lugs
  }
  P.turretG.userData.pumaS1RoofOpticsReceipt = Object.freeze({
    sight: 'PERI RTWL commander panoramic periscope',
    mountLocal: Object.freeze([0.62, 0.8925, 0.52]),
    headSizeM: Object.freeze([0.44, 0.30, 0.42]),
    windows: 3,
    hasWeapon: false,
    turretOwned: true,
  });

  // VH.14 (the coordinator's ruling: roof weapons match the real vehicle; critic panel 2026-10-15 on the owner markup's
  // surface 5): the Puma S1 carries its 30 mm, a coaxial MG4 and MELLS and no roof weapon, so the compact 12.7 mm remote
  // station that stood on the rear roof is gone. The decor keeps out of the volume its tower stood in (measured on main;
  // its barrel was never a keep-out), so the roof and bustle loads keep their seats (fieldChest.ts reserveDecorVolume).
  reserveDecorVolume(P.turretG, [0.1834, 0.666, -0.9843], [0.6562, 1.0868, -0.5903]);

  // Twin MELLS/Spike LR2 cells use square armored launch boxes like the Puma
  // S1 demonstrator.  The shallow square mouths are unmistakable from the
  // front and replace every circular tube/ring from the prior iteration.
  weaponAssembly(P, () => {
    const launcherX = -1.02;
    P.addEquipment('turret', box(0.24, 0.48, 0.60), launcherX, 0.47, 0.08, 0, 0, -0.08);
    P.addEquipment('turret', box(0.18, 0.20, 0.54), -0.84, 0.47, 0.08, 0, 0, -0.42);
    for (const y of [0.36, 0.59]) {
      P.addEquipment('turret', box(0.30, 0.20, 0.78), launcherX, y, 0.40);
      P.add('turretDark', box(0.205, 0.135, 0.024), launcherX, y, 0.802);
      P.add('turretDetail', box(0.235, 0.165, 0.014), launcherX, y, 0.818);
      P.add('turretDark', box(0.168, 0.105, 0.018), launcherX, y, 0.830);
    }
  });
  P.turretG.userData.pumaS1MellsLauncherReceipt = Object.freeze({
    architecture: 'twin-square-armored-cells-v1',
    launchCells: 2,
    circularLaunchTubes: 0,
    mountSide: 'vehicle-left',
    turretOwned: true,
  });

  for (const side of [-1, 1]) {
    P.add('turret', box(0.24, 0.16, 0.40), side * 1.01, 0.34, 0.06, 0, 0, -side * 0.14);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.041, len: 0.27, spacing: 0.095,
      splay: side * 0.46, pitch: -0.40, arc: 0.56, seed: side < 0 ? 180 : 181,
    }), side * 1.08, 0.44, 0.11, [0, side * 0.98, 0]);
    P.addModuleVisual('optics', 'turretDark', box(0.20, 0.16, 0.18),
      side * 0.88, 0.72, -0.70);
    P.addModuleVisual('optics', 'turretGlass', box(0.13, 0.09, 0.012),
      side * 0.88, 0.72, -0.60);
  }
  for (const [x, z, h, seed] of [[-0.78, -1.16, 0.88, 190], [0.76, -1.16, 0.74, 191]] as const) {
    P.add('turretDark', cylY(0.040, 0.055, 0.09, 10), x, 0.78, z);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.010, seed }),
      x, 0.80, z);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.30, d: 0.36, h: 0.18, fill: 0.45, rails: 3, seed: 210,
  }), 0, 0.42, -1.52);

  P.decal('turret', 'crossgrey', null, 0.27, [-1.15, 0.44, -0.70], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.86);
}

function buildPumaS1(P: PumaS1BuilderPort): void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  addHullShell(P);
  addRunningGear(P);
  addTurret(P);
  P.decal('hull', 'crossgrey', null, 0.34, [-1.94, 1.47, 0.12], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || 'S1-481', 0.23,
    [1.94, 1.21, 1.05], Math.PI / 2);
  P.decal('hull', 'number', 'Y-481', 0.21, [-0.54, 1.33, 3.48], 0, -0.34);

  if (P.geometryReceipt) {
    P.hullG.userData.pumaS1Receipt = Object.freeze({
      independentFromLegacyPuma: true,
      hullConstruction: 'puma-high-shoulder-troop-cell-v7',
      turretConstruction: 'asymmetric-rct30-spine-bustle-v5',
      roadWheelsPerSide: 6,
      canonicalTrackCourses: 1,
      duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel',
      trackCenterlineM: 1.47,
      sideArmorCassettesPerSide: 8,
      sideArmorLayers: 2,
      sideArmorInnerSeatM: 1.76,
      sideArmorOuterEnvelopeM: 2.058,
      skirtArchitecture: 'segmented-sloped-amap-jacket',
      skirtAttachment: 'direct-monocoque-overlap-seat-v4',
      frontSkirtTransition: 'revolution-amap-glacis-downfold-v4',
      frontShoulderBridge: 'cyclic-hull-amap-overlap-volume-v1',
      rearTrackDepartureZM: -2.20, // 2026-09-14: loaded run leaves the ground under the aft axle (tangent wrap)
      rearBulkheadClosureDepthM: 0.20,
      nativeTrackPattern: 'compact-ifv',
      baseGunAssembly: 'compact-slash-port-mk30-cradle-v7',
      mellsLaunchTubes: 0,
      mellsSquareLaunchCells: 2,
      panoramicOpticStages: 2,
      crewLocation: 'protected-hull-cell',
      planarRoofCell: true,
      upperGlacisConstruction: 'separate-planar-wedge',
      monotonicArmorInset: true,
      concaveSurfaceCount: 0,
      fenderBridge: 'continuous-hull-skirt-seat',
      rearTroopRamp: true,
    });
    P.turretG.userData.pumaS1TurretReceipt = Object.freeze({
      unmanned: true,
      gun: 'MK30-2/ABM',
      launcher: 'MELLS-Spike-LR2',
      stabilizedPanoramicSight: true,
      allAroundCameraCount: 4,
      remoteSecondaryWeapon: null,
      gunCenterlineOffsetFromTurretM: 0.14,
      gunSideEquipmentPods: 2,
      gunSideOpticApertures: 4,
      rotatingOpticAssembly: 'right-front-peri-rtwl',
      mellsLauncherArchitecture: 'twin-square-armored-cells-v1',
      turretFlankElectronicsBoxes: 2,
      roofElectronicsBoxes: 2,
      planarRoofCrown: true,
      monotonicArmorInset: true,
      concaveSurfaceCount: 0,
    });
  }
  applyAdvancedIfvScale(P, 'cot-spz-puma-s1-compact-r1');
}

export const PUMA_S1_PROFILES = Object.freeze({
  spz_wotan: Object.freeze({ build: buildPumaS1 }),
}) satisfies VehicleProfileRecord;
