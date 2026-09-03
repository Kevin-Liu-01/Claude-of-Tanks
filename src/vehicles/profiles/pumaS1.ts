// Independent first-party procedural SPz Puma S1.
//
// The local owner-supplied GLB is used only as a proportion/anatomy oracle.
// This builder shares no donor geometry and never calls the legacy SPz Puma
// builder; every hull station, running-gear course, RCT30 surface and fitting
// below is authored from repository primitives.

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, muzzleTipDot } from './kit.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface PumaS1BuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material>;
  readonly q?: boolean;
  readonly geometryReceipt?: boolean;
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  muzzleZ: number;
  topY?: number;
  gear?: unknown;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addCupola(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addEquipment(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): unknown;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): unknown;
}

function mount(
  P: PumaS1BuilderPort,
  owner: Owner,
  object: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotation: Vec3 = [0, 0, 0],
): void {
  object.position.set(x, y, z);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(object);
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
  P.addGunExtra(geometry);
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
  }
}

function addHullShell(P: PumaS1BuilderPort): void {
  const { box, frustum, polyMultiLoft } = KIT;
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
  const monocoquePlan: [number, number][] = [
    [-1.56, 1.68], [1.56, 1.68], [1.66, 1.42], [1.66, -3.28],
    [1.49, -3.65], [-1.49, -3.65], [-1.66, -3.28], [-1.66, 1.42],
  ];
  P.add('hull', polyMultiLoft(monocoquePlan, [
    { height: 0.00, inset: 1.00 },
    { height: 0.36, inset: 0.96 },
    { height: 0.70, inset: 0.89 },
  ]), 0, 1.34, 0);
  P.add('hull', box(2.12, 0.54, 0.16), 0, 1.02, 3.72, -0.08, 0, 0);
  P.add('hullDark', box(2.64, 0.035, 2.44), 0, 2.045, -1.52);
  for (let index = 0; index < 12; index++) {
    P.add('hullDetail', box(2.42, 0.018, 0.052), 0, 2.069, -2.57 + index * 0.16);
  }

  // Driver hatch, hull camera pods and tow/lift hardware are sunk into the
  // roof/glacis planes. Equipment uses camouflage-aware buckets.
  P.addCupola('hull', KIT.cylY(0.32, 0.34, 0.055, 20), 0.68, 2.075, 1.48);
  P.add('hullDark', KIT.torus(0.31, 0.014, 20), 0.68, 2.108, 1.48);
  for (const x of [0.48, 0.68, 0.88]) KIT.periscope(P, 'hullDetail', x, 2.095, 1.80);
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({
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
  P.add('hull', box(2.98, 1.18, 0.20), 0, 1.15, -3.66);
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
      // One broad armored cassette and one shallow applique lid per station:
      // the large facets and restrained seams match the Revolution jacket
      // grammar without creating a toy-like ERA checkerboard.
      P.addExternalArmor('hull', KIT.box(0.18, panelHeight, panelLength - 0.028),
        side * 1.91, (panelTopY + panelBottomY) * 0.5, z);
      P.addExternalArmor('hull', KIT.box(0.035, panelHeight - 0.12, panelLength - 0.10),
        side * 2.0175, (panelTopY + panelBottomY) * 0.5, z);
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
    P.add('hullRubber', KIT.box(0.045, 0.16, jacketFrontZ - jacketRearZ + 0.02),
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
  const { box, cylY, cylZ, polyMultiLoft, polyTurret, buildGun } = KIT;
  // The unmanned RCT shell uses a narrow gun nose, hard shoulder breaks and a
  // crown that rises aft. Ten deliberate facets keep the silhouette angular
  // without turning the module into a rounded or box-backed generic turret.
  const plan = [
    [-0.40, 1.62], [0.34, 1.62], [0.76, 1.32], [0.98, 0.70],
    [1.00, -1.15], [0.72, -1.58], [-0.78, -1.56], [-1.00, -1.12],
    [-1.02, 0.58], [-0.78, 1.30],
  ];
  P.add('turretDark', polyTurret(plan, 0.12, 1.04, 1.00), 0, -0.065, -0.02);
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.02, inset: 1.00 },
    { height: 0.36, inset: 0.96 },
    { height: 0.72, inset: 0.82 },
  ]));
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
  P.addGunExtraDark(cylZ(0.019, 1.95, 12), 0.20, -0.025, 1.72);
  muzzleTipDot(P, 0.20, -0.025, 2.70, 0.012, { parent: 'gunG' });
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
  P.addEquipment('turret', box(0.52, 0.20, 0.54), 0.62, 0.72, 0.52, 0, -0.05, 0);
  P.addEquipment('turret', KIT.cylY(0.25, 0.27, 0.075, 18), 0.62, 0.855, 0.52);
  const pumaRoofOptics = FITTINGS.openYokeRws({
    mats: P.mats,
    bodySlot: 'turret',
    sizeStandard: 'k2b-compact-tower',
    scale: 0.80,
    towerRise: 0.10,
    variant: 'korean-twin',
    sensorHead: true,
    sensorMount: 'roof',
    weapon: false,
    seed: 172,
  });
  pumaRoofOptics.name = 'pumaS1K2bStyleRoofOptics';
  pumaRoofOptics.userData.hostVariant = 'spz_puma_s1';
  pumaRoofOptics.userData.sensorRole = 'commander-panoramic';
  mount(P, 'turret', pumaRoofOptics, 0.62, 0.88, 0.52, [0, -0.05, 0]);
  P.turretG.userData.pumaS1RoofOpticsReceipt = Object.freeze({
    designFamily: pumaRoofOptics.userData.designFamily,
    variant: pumaRoofOptics.userData.stationVariant,
    mountLocal: Object.freeze([0.62, 0.88, 0.52]),
    scale: pumaRoofOptics.userData.scale,
    sizeStandard: pumaRoofOptics.userData.sizeStandard,
    towerRiseM: pumaRoofOptics.userData.towerRise,
    hasWeapon: pumaRoofOptics.userData.hasWeapon,
    sensorMount: pumaRoofOptics.userData.sensorMount,
    integratedSensorHead: pumaRoofOptics.userData.hasIntegratedSensorHead,
    turretOwned: true,
  });

  // A separate compact RCT30-inspired weapon station occupies the former RWS
  // seat. Its offset firing line clears both the panoramic tower and the main
  // cannon, while the arrow brow and faceted yoke are unique to Puma S1.
  const pumaRoofRws = FITTINGS.openYokeRws({
    mats: P.mats,
    bodySlot: 'turret',
    sizeStandard: 'puma-s1-compact-rws',
    scale: 0.68,
    towerRise: 0.08,
    variant: 'puma-s1-compact',
    ammoSide: 1,
    sensorHead: false,
    elev: 0.055,
    caliberMm: 12.7,
    weaponName: 'Puma S1 compact remote machine gun',
    seed: 173,
  });
  pumaRoofRws.name = 'pumaS1CompactRoofRws';
  pumaRoofRws.userData.hostVariant = 'spz_puma_s1';
  mount(P, 'turret', pumaRoofRws, 0.42, 0.74, -0.90, [0, 0.04, 0]);
  P.turretG.userData.pumaS1RoofRwsReceipt = Object.freeze({
    designFamily: pumaRoofRws.userData.designFamily,
    variant: pumaRoofRws.userData.stationVariant,
    mountLocal: Object.freeze([0.42, 0.74, -0.90]),
    scale: pumaRoofRws.userData.scale,
    sizeStandard: pumaRoofRws.userData.sizeStandard,
    towerRiseM: pumaRoofRws.userData.towerRise,
    caliberMm: pumaRoofRws.userData.caliberMm,
    visibleFeedBelt: pumaRoofRws.userData.hasVisibleFeedBelt,
    integratedSensorHead: pumaRoofRws.userData.hasIntegratedSensorHead,
    turretOwned: true,
  });

  // Twin MELLS/Spike LR2 cells use square armored launch boxes like the Puma
  // S1 demonstrator.  The shallow square mouths are unmistakable from the
  // front and replace every circular tube/ring from the prior iteration.
  const launcherX = -1.02;
  P.addEquipment('turret', box(0.24, 0.48, 0.60), launcherX, 0.47, 0.08, 0, 0, -0.08);
  P.addEquipment('turret', box(0.18, 0.20, 0.54), -0.84, 0.47, 0.08, 0, 0, -0.42);
  for (const y of [0.36, 0.59]) {
    P.addEquipment('turret', box(0.30, 0.20, 0.78), launcherX, y, 0.40);
    P.add('turretDark', box(0.205, 0.135, 0.024), launcherX, y, 0.802);
    P.add('turretDetail', box(0.235, 0.165, 0.014), launcherX, y, 0.818);
    P.add('turretDark', box(0.168, 0.105, 0.018), launcherX, y, 0.830);
  }
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
      hullConstruction: 'planar-roof-puma-glacis-monocoque-v6',
      turretConstruction: 'planar-faceted-rct30-citadel-v4',
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
      rearTrackDepartureZM: -2.37,
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
      remoteSecondaryWeapon: '12.7mm Puma S1 compact RWS',
      gunCenterlineOffsetFromTurretM: 0.14,
      gunSideEquipmentPods: 2,
      gunSideOpticApertures: 4,
      rotatingOpticAssembly: 'right-front-armored-yoke',
      mellsLauncherArchitecture: 'twin-square-armored-cells-v1',
      turretFlankElectronicsBoxes: 2,
      roofElectronicsBoxes: 2,
      planarRoofCrown: true,
      monotonicArmorInset: true,
      concaveSurfaceCount: 0,
    });
  }
}

export const PUMA_S1_PROFILES = Object.freeze({
  spz_puma_s1: Object.freeze({ build: buildPumaS1 }),
}) satisfies VehicleProfileRecord;
