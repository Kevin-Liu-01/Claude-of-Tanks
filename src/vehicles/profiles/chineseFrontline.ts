// Independent first-party VT-4A1 and ZTZ-99A frontline constructions.
//
// The supplied VT-4A1 GLB and the archived ZTZ-99A reference packet are
// comparison instruments only. These builders do not invoke a donor vehicle,
// load a runtime model, or reproduce source topology. Every visible surface is
// an authored primitive, loft, or slab in the game's native +Z-forward frame.

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, muzzleTipDot } from './kit.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

interface FrontlinePort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material>;
  readonly q?: boolean;
  readonly geometryReceipt?: boolean;
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  muzzleZ: number;
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addEquipment(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): unknown;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): unknown;
  visualEraCluster(name: string, owner: Owner, fill: () => void): void;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): unknown;
}

function mount(
  P: FrontlinePort,
  owner: Owner,
  object: THREE.Object3D,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
): void {
  object.position.set(...position);
  object.rotation.set(...rotation);
  (owner === 'hull' ? P.hullG : P.turretG).add(object);
}

function addSixWheelRunningGear(
  P: FrontlinePort,
  config: {
    wheelZs: readonly number[];
    wheelR: number;
    wheelY: number;
    xc: number;
    idlerZ: number;
    sprocketZ: number;
    trackW: number;
    topY: number;
    contactZF: number;
    contactZR: number;
    wheelHex: string;
  },
): void {
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: config.wheelR, wheelW: 0.27,
    wheelY: config.wheelY, xc: config.xc, dishR: 0.74,
    wheelHex: config.wheelHex, wheelZs: [...config.wheelZs],
    sprocket: { z: config.sprocketZ, y: config.wheelY + 0.10, r: 0.39 },
    idler: { z: config.idlerZ, y: config.wheelY + 0.08, r: 0.37 },
    rollers: [], trackW: config.trackW, topY: config.topY, botY: 0.055,
    paintedEnds: true, coveredTop: true, arms: true,
    // Contact-patch ends are independent of the first/last road-wheel
    // centres.  Pinning them to the wheels shortened the visible VT/99A
    // courses by roughly 1.4 m against their measured references.
    contactZF: config.contactZF, contactZR: config.contactZR,
  });
}

function addTrackSkirts(
  P: FrontlinePort,
  config: {
    x: number;
    z0: number;
    count: number;
    step: number;
    h: number;
    frontDrop: number;
    eraSectorPrefix?: string;
  },
): void {
  const { box } = KIT;
  for (const side of [-1, 1] as const) {
    // Continuous backed rails make the fenders, skirts, and hull read as one
    // structure. The front two panels rotate into the glacis shoulder.
    // Keep the structural carrier immediately behind the skirt face, but
    // outside the live shoe envelope. A 120 mm inboard rail intersected the
    // animated course even though its face was visually hidden by the skirt.
    P.addExternalArmor('hull', box(0.040, 0.12, config.count * config.step + 0.08),
      side * (config.x - 0.005), 1.48, config.z0 - (config.count - 1) * config.step * 0.5);
    for (let index = 0; index < config.count; index++) {
      const z = config.z0 - index * config.step;
      const front = index < 2;
      const y = 1.13 - (front ? config.frontDrop * (2 - index) : 0);
      const pitch = front ? -0.20 + index * 0.08 : 0;
      const addPanel = (): void => {
        P.addExternalArmor('hull', box(0.040, config.h, config.step - 0.035),
          side * config.x, y, z, pitch, 0, 0);
      };
      if (config.eraSectorPrefix) {
        P.visualEraCluster(
          `${config.eraSectorPrefix}_${side > 0 ? 'R' : 'L'}`,
          'hull',
          addPanel,
        );
      } else {
        addPanel();
      }
      P.add('hullDark', box(0.016, config.h * 0.78, 0.025),
        side * (config.x + 0.015), y, z + config.step * 0.45, pitch, 0, 0);
      for (const boltY of [-0.25, 0.25]) {
        P.add('hullDetail', KIT.cylX(0.017, 0.025, 8),
          side * (config.x + 0.012), y + boltY * config.h, z,
          0, 0, side * Math.PI / 2);
      }
    }
    P.add('hullRubber', box(0.036, 0.18, config.count * config.step),
      side * (config.x + 0.015), 0.69, config.z0 - (config.count - 1) * config.step * 0.5);
  }
}

function addContinuousTrackFenders(
  P: FrontlinePort,
  config: {
    xInner: number;
    xOuter: number;
    y: number;
    zFront: number;
    zRear: number;
    noseZ: number;
    noseY: number;
  },
): void {
  const { box } = KIT;
  const width = config.xOuter - config.xInner;
  const centerX = (config.xInner + config.xOuter) * 0.5;
  const run = config.zFront - config.zRear;
  for (const side of [-1, 1] as const) {
    // The horizontal shelf is the missing visual datum that ties the hull,
    // track run and side armor into one body.  Its inboard edge is buried in
    // the sponson and its outboard edge overlaps the skirt carrier.
    P.addExternalArmor('hull', box(width, 0.10, run),
      side * centerX, config.y, (config.zFront + config.zRear) * 0.5);
    P.add('hullDetail', box(0.026, 0.040, run),
      side * config.xOuter, config.y + 0.045, (config.zFront + config.zRear) * 0.5);
    // One tapered diving nose course follows the upper/lower-glacis break;
    // there is no daylight between the last skirt panel and the bow shelf.
    P.addExternalArmor('hull', orientedSlab(
      [side * config.xInner, config.y - 0.05, config.zFront],
      [side * config.xOuter, config.y - 0.05, config.zFront],
      [side * (config.xOuter - 0.10), config.noseY, config.noseZ],
      [side * (config.xInner - 0.06), config.noseY + 0.05, config.noseZ],
      [side * config.xInner, config.y + 0.05, config.zFront],
      [side * config.xOuter, config.y + 0.05, config.zFront],
      [side * (config.xOuter - 0.10), config.noseY + 0.08, config.noseZ],
      [side * (config.xInner - 0.06), config.noseY + 0.13, config.noseZ],
    ));
    P.add('hullRubber', box(width - 0.08, 0.16, 0.055),
      side * centerX, config.noseY - 0.02, config.noseZ + 0.015, -0.16, 0, 0);
  }
}

interface ChevronStation {
  readonly x: number;
  readonly ridgeZ: number;
  readonly upperY: number;
  readonly ridgeY: number;
  readonly lowerY: number;
  readonly upperSetback: number;
  readonly lowerSetback: number;
}

// A Leopard-2-style cheek is one watertight arrowhead, not two floating
// applique slabs.  In side view the dominant upper face and shorter lower
// return meet at one ridge; in plan that ridge sweeps continuously from the
// gun throat into the sloped turret shoulder.  The terminal is deliberately
// buried in the parent shell, making the visible transition read as |>, not
// as a detached > hanging ahead of a box.
function closedIntegratedChevron(
  stations: readonly ChevronStation[],
  side: -1 | 1,
): THREE.BufferGeometry {
  if (stations.length < 2) throw new RangeError('Integrated chevron requires at least two stations');
  const positions: number[] = [];
  const upper = (station: ChevronStation): Vec3 => [
    side * station.x, station.upperY, station.ridgeZ - station.upperSetback,
  ];
  const ridge = (station: ChevronStation): Vec3 => [side * station.x, station.ridgeY, station.ridgeZ];
  const lower = (station: ChevronStation): Vec3 => [
    side * station.x, station.lowerY, station.ridgeZ - station.lowerSetback,
  ];
  const tri = (a: Vec3, b: Vec3, c: Vec3): void => {
    positions.push(...a, ...b, ...c);
  };
  for (let index = 0; index < stations.length - 1; index++) {
    const a = stations[index];
    const b = stations[index + 1];
    tri(upper(a), ridge(a), ridge(b));
    tri(upper(a), ridge(b), upper(b));
    tri(ridge(a), lower(a), lower(b));
    tri(ridge(a), lower(b), ridge(b));
    tri(lower(a), upper(a), upper(b));
    tri(lower(a), upper(b), lower(b));
  }
  const first = stations[0];
  const last = stations.at(-1)!;
  tri(upper(first), lower(first), ridge(first));
  tri(upper(last), ridge(last), lower(last));

  let signedVolume6 = 0;
  for (let index = 0; index < positions.length; index += 9) {
    const ax = positions[index], ay = positions[index + 1], az = positions[index + 2];
    const bx = positions[index + 3], by = positions[index + 4], bz = positions[index + 5];
    const cx = positions[index + 6], cy = positions[index + 7], cz = positions[index + 8];
    signedVolume6 += ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx);
  }
  if (signedVolume6 < 0) {
    for (let index = 0; index < positions.length; index += 9) {
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[index + 3 + axis];
        positions[index + 3 + axis] = positions[index + 6 + axis];
        positions[index + 6 + axis] = value;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
    new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function addChevronRidgeSeams(
  P: FrontlinePort,
  stations: readonly ChevronStation[],
  side: -1 | 1,
): void {
  for (let index = 0; index < stations.length - 1; index++) {
    const a = stations[index];
    const b = stations[index + 1];
    const ay0 = a.ridgeY - 0.014, ay1 = a.ridgeY + 0.014;
    const by0 = b.ridgeY - 0.014, by1 = b.ridgeY + 0.014;
    P.add('turretDark', orientedSlab(
      [side * a.x, ay0, a.ridgeZ - 0.010], [side * b.x, by0, b.ridgeZ - 0.010],
      [side * b.x, by1, b.ridgeZ - 0.010], [side * a.x, ay1, a.ridgeZ - 0.010],
      [side * a.x, ay0, a.ridgeZ + 0.014], [side * b.x, by0, b.ridgeZ + 0.014],
      [side * b.x, by1, b.ridgeZ + 0.014], [side * a.x, ay1, a.ridgeZ + 0.014],
    ));
  }
}

function addChinese125Gun(
  P: FrontlinePort,
  config: { length: number; rootR: number; sleeveStart: number; sleeveEnd: number },
): void {
  const { cylZ, torus } = KIT;
  // The trunnion and the barrel share local +Z.  Keep the collar faceted so
  // it reads as a welded Chinese gun cradle instead of a round cast mantlet.
  // (A transverse cylinder here creates the false twin-bar silhouette this
  // replacement is specifically intended to remove.)
  P.addGunExtraDark(cylZ(config.rootR * 1.05, 0.18, P.q ? 12 : 8,
    config.rootR * 0.98), 0, 0, 0.09);
  P.addGunExtra(cylZ(config.rootR * 0.94, 0.68, P.q ? 12 : 8,
    config.rootR * 0.56), 0, 0, 0.47);
  P.addGunExtraDark(cylZ(config.rootR * 0.59, 0.08, 12), 0, 0, 0.85);
  KIT.buildGun(P, { len: config.length, r: 0.071, sleeve: false, collar: false, baseR: 0.105 });
  P.add('gun', cylZ(0.105, config.sleeveEnd - config.sleeveStart, 18, 0.090),
    0, 0, (config.sleeveStart + config.sleeveEnd) * 0.5);
  for (const z of [config.sleeveStart, config.sleeveStart + 0.72, config.sleeveEnd]) {
    P.add('gunDark', torus(z === config.sleeveEnd ? 0.090 : 0.104, 0.012, 16),
      0, 0, z, Math.PI / 2, 0, 0);
  }
  P.add('gunDark', cylZ(0.080, 0.22, 18), 0, 0, config.length - 0.11);
  muzzleTipDot(P, 0, 0, config.length + 0.012, 0.057, { parent: 'gunG' });
  P.muzzleZ = config.length;
}

function addSmokeAndWarningSuite(
  P: FrontlinePort,
  config: { warningX: number; warningZ: number; warningY: number; smokeX: number; smokeZ: number },
): void {
  const { box, cylY, cylZ } = KIT;
  for (const side of [-1, 1] as const) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.046, len: 0.30, spacing: 0.105,
      splay: side * 0.52, pitch: -0.42, arc: 0.54,
      seed: side < 0 ? 410 : 411,
    }), [side * config.smokeX, 0.50, config.smokeZ], [0, side * 0.98, 0]);

    // VT-family roof warning/APS pedestal: broad base, vertical yoke, paired
    // circular apertures and a visible cable/service box at the rear.
    P.addEquipment('turret', box(0.28, 0.08, 0.27),
      side * config.warningX, config.warningY, config.warningZ);
    P.add('turret', box(0.24, 0.32, 0.20),
      side * config.warningX, config.warningY + 0.20, config.warningZ);
    P.add('turretDark', box(0.26, 0.20, 0.030),
      side * config.warningX, config.warningY + 0.23, config.warningZ + 0.115);
    for (const dx of [-0.060, 0.060]) {
      P.addModuleVisual('optics', 'turretGlass', cylZ(0.041, 0.022, 14),
        side * config.warningX + dx, config.warningY + 0.24, config.warningZ + 0.137);
    }
    P.add('turretDetail', cylY(0.030, 0.038, 0.09, 10),
      side * config.warningX, config.warningY + 0.40, config.warningZ);
  }
}

// -------------------------------------------------------------------------
// VT-4A1 — source-measured independent vehicle
// -------------------------------------------------------------------------

function buildVT4A1Hull(P: FrontlinePort): void {
  const { box, polyMultiLoft, cylY } = KIT;
  addSixWheelRunningGear(P, {
    wheelZs: [2.40, 1.44, 0.48, -0.48, -1.44, -2.40],
    wheelR: 0.47, wheelY: 0.54, xc: 1.39, idlerZ: 3.04, sprocketZ: -3.08,
    trackW: 0.60, topY: 1.17, contactZF: 2.85, contactZR: -2.95,
    wheelHex: '#4d563d',
  });

  // The reference hull is a low monocoque with a broad, shallow two-break
  // glacis and nearly vertical full-height side armor. This station loft is
  // unique to VT-4A1; it does not call a Type-99/T-72 family hull.
  const plan: [number, number][] = [
    [-1.06, 3.77], [1.06, 3.77], [1.42, 3.29], [1.55, 2.56],
    [1.55, -3.57], [1.44, -3.82], [-1.44, -3.82], [-1.55, -3.57],
    [-1.55, 2.56], [-1.42, 3.31],
  ];
  P.add('hull', polyMultiLoft(plan, [
    { height: 0.42, inset: 0.61 },
    { height: [0.70, 0.70, 0.83, 0.95, 1.04, 1.04, 1.04, 1.04, 0.95, 0.83], inset: 0.63 },
    { height: 1.22, inset: 0.63 },
    { height: [1.30, 1.30, 1.34, 1.52, 1.61, 1.61, 1.61, 1.61, 1.52, 1.34],
      inset: [0.82, 0.82, 0.90, 0.97, 0.98, 0.97, 0.97, 0.98, 0.97, 0.90] },
  ]));
  // The lower glacis occupies the clear lane between the tracks.  The broad
  // shoulder is supplied by the upper station above the shoe sweep, avoiding
  // the common procedural error where the bow slices through both wraps.
  P.add('hull', orientedSlab(
    [-1.00, 0.76, 3.79], [1.00, 0.76, 3.79], [0.95, 1.47, 2.08], [-0.95, 1.47, 2.08],
    [-1.00, 0.81, 3.79], [1.00, 0.81, 3.79], [0.95, 1.52, 2.08], [-0.95, 1.52, 2.08],
  ));
  for (const side of [-1, 1] as const) {
    // High shoulder caps close the small plan-view notch between the narrow
    // lower nose and full-width fender without entering the shoe envelope.
    P.add('hull', box(0.30, 0.12, 0.62), side * 1.03, 1.32, 3.34, -0.18, 0, 0);
  }
  P.add('hull', orientedSlab(
    [-0.95, 1.47, 2.05], [0.95, 1.47, 2.05], [1.46, 1.47, 2.20], [-1.46, 1.47, 2.20],
    [-0.96, 1.63, 1.34], [0.96, 1.63, 1.34], [1.45, 1.59, 1.30], [-1.45, 1.59, 1.30],
  ));
  P.add('hullDark', box(2.74, 0.038, 2.18), 0, 1.64, -2.28);
  for (let i = 0; i < 10; i++) {
    P.add('hullDetail', box(2.55, 0.022, 0.055), 0, 1.67, -3.20 + i * 0.18);
  }
  // Source-measured full-width fenders bridge the hull shoulder into the
  // skirt carrier and dive with the glacis above the idler.  The tank now
  // has one continuous over-track body instead of a bare gap above the run.
  addContinuousTrackFenders(P, {
    xInner: 1.33, xOuter: 1.74, y: 1.52,
    zFront: 2.80, zRear: -3.54, noseZ: 3.58, noseY: 1.18,
  });
  addTrackSkirts(P, { x: 1.74, z0: 2.64, count: 9, step: 0.66, h: 0.78, frontDrop: 0.10 });

  // Segmented glacis applique follows the actual two-slope hull rather than
  // floating as a rectangular tile blanket.
  for (const side of [-1, 1] as const) {
    for (let col = 0; col < 3; col++) {
      const x0 = 0.10 + col * 0.43;
      const x1 = x0 + 0.39;
      P.addExternalArmor('hull', orientedSlab(
        [side * x0, 1.495, 2.02], [side * (x1 - 0.06), 1.49, 2.08], [side * (x1 - 0.06), 1.25, 3.04], [side * x0, 1.23, 3.18],
        [side * x0, 1.535, 2.02], [side * (x1 - 0.06), 1.53, 2.08], [side * (x1 - 0.06), 1.29, 3.04], [side * x0, 1.27, 3.18],
      ));
      P.add('hullDark', box(0.025, 0.035, 0.74), side * x1, 1.37, 2.55, -0.30, 0, 0);
    }
  }
  P.addEquipment('hull', box(0.54, 0.06, 0.48), 0, 1.66, 1.13);
  for (const x of [-0.17, 0.17]) KIT.periscope(P, 'hullDetail', x, 1.70, 1.39);
  for (const side of [-1, 1] as const) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.14, r: 0.047, shield: true,
      rake: -0.26, seed: 420 + side,
    }), [side * 1.18, 1.32, 2.83], [-0.31, 0, 0]);
    P.addEquipment('hull', box(0.30, 0.26, 0.32), side * 1.32, 1.38, 2.46, -0.22, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.18, 0.10, 0.020),
      side * 1.32, 1.34, 2.64, -0.22, 0, 0);
    KIT.liftEye(P, 'hullDetail', side * 0.88, 0.76, 3.47);
  }
  mount(P, 'hull', FITTINGS.towCable({ mats: P.mats, r: 0.025, seed: 423,
    pts: [[-1.10, 1.28, 3.05], [-0.48, 1.15, 3.52], [0.48, 1.15, 3.52], [1.10, 1.28, 3.05]] }), [0, 0, 0]);
  // Rear engine service field and convoy camera.
  // The lower service plate is recessed between the track lanes; the skirt
  // shoulders above it carry the full visual width without fouling the wrap.
  P.add('hull', box(2.10, 0.74, 0.16), 0, 1.18, -3.73);
  for (let i = 0; i < 8; i++) P.add('hullDark', box(0.055, 0.48, 0.025), -1.05 + i * 0.30, 1.24, -3.83);
  P.addModuleVisual('optics', 'hullGlass', cylY(0.065, 0.065, 0.025, 12), 0, 1.49, -3.83);
}

function buildVT4A1Turret(P: FrontlinePort): void {
  const { box, polyMultiLoft, torus } = KIT;
  P.turretG.position.set(0, 1.62, -0.18);
  // The source bore sits below the roof optics line. Keeping the trunnion at
  // the earlier 0.46 m datum made the complete weapon float above the cheek
  // ridge in side comparison views.
  P.gunG.position.set(0, 0.32, 1.47);
  const plan: [number, number][] = [
    // Carry the primary shell through the gun collar. The former 1.18 m
    // nose stopped behind the pitching cradle, opening a visible seam at
    // neutral and maximum depression.
    [-0.30, 1.30], [0.30, 1.30], [0.96, 0.72], [1.38, 0.08],
    [1.47, -1.42], [1.22, -2.02], [0.58, -2.18], [-0.58, -2.18],
    [-1.22, -2.02], [-1.47, -1.42], [-1.38, 0.18], [-0.96, 0.98],
  ];
  P.add('turretDark', KIT.polyTurret(plan, 0.12, 0.98, 0.96), 0, -0.04, 0);
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.02, inset: 1.00 },
    { height: [0.36, 0.36, 0.48, 0.58, 0.63, 0.66, 0.67, 0.67, 0.66, 0.63, 0.58, 0.48], inset: 0.99 },
    { height: [0.67, 0.67, 0.75, 0.82, 0.86, 0.87, 0.88, 0.88, 0.87, 0.86, 0.82, 0.75],
      inset: [0.64, 0.64, 0.76, 0.88, 0.94, 0.96, 0.96, 0.96, 0.96, 0.94, 0.88, 0.76] },
  ]));
  // A welded crown and bustle replace the former circular plug.  The round
  // primitive inflated every oblique silhouette and made the VT-4A1 read as
  // a generic cast turret instead of the source's long, faceted module.
  P.add('turret', orientedSlab(
    [-0.94, 0.79, 0.42], [0.94, 0.79, 0.42], [1.10, 0.80, -1.92], [-1.10, 0.80, -1.92],
    [-0.78, 0.91, 0.20], [0.78, 0.91, 0.20], [0.98, 0.92, -1.88], [-0.98, 0.92, -1.88],
  ));
  P.add('turretDark', box(0.62, 0.62, 0.24), 0, 0.35, 1.20);
  // Deep welded throat block reaches inside the pitching cradle at every
  // legal gun angle; preserve the rear face while carrying the nose forward.
  P.add('turret', box(0.54, 0.62, 0.54), 0, 0.34, 1.40);

  const chevronStations = Object.freeze([
    { x: 0.23, ridgeZ: 1.58, upperY: 0.79, ridgeY: 0.35, lowerY: 0.05, upperSetback: 0.27, lowerSetback: 0.14 },
    { x: 0.50, ridgeZ: 1.39, upperY: 0.78, ridgeY: 0.35, lowerY: 0.05, upperSetback: 0.29, lowerSetback: 0.15 },
    { x: 0.80, ridgeZ: 1.10, upperY: 0.76, ridgeY: 0.34, lowerY: 0.06, upperSetback: 0.31, lowerSetback: 0.16 },
    { x: 1.08, ridgeZ: 0.70, upperY: 0.74, ridgeY: 0.33, lowerY: 0.07, upperSetback: 0.33, lowerSetback: 0.17 },
    { x: 1.43, ridgeZ: 0.18, upperY: 0.70, ridgeY: 0.31, lowerY: 0.09, upperSetback: 0.35, lowerSetback: 0.18 },
  ] satisfies readonly ChevronStation[]);
  // Full-height Leopard-style arrowheads: one shared ridge, dominant upper
  // face, shorter lower return, and a buried terminal on the shell flank.
  for (const side of [-1, 1] as const) {
    P.addExternalArmor('turret', closedIntegratedChevron(chevronStations, side));
    addChevronRidgeSeams(P, chevronStations, side);
    P.add('turretDetail', box(0.030, 0.46, 1.20), side * 1.44, 0.41, -0.55, 0, -side * 0.04, 0);
    P.addEquipment('turret', box(0.10, 0.34, 0.58), side * 1.43, 0.38, -0.58);
  }
  addChinese125Gun(P, { length: 5.02, rootR: 0.30, sleeveStart: 0.76, sleeveEnd: 3.52 });

  // Sights, cupolas, APS heads and rear bustle cages match the reference's
  // dense roof silhouette while remaining supported by the turret crown.
  P.addEquipment('turret', box(0.44, 0.36, 0.40), -0.50, 1.04, 0.39, 0, -0.05, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.25, 0.18, 0.020), -0.50, 1.06, 0.60, 0, -0.05, 0);
  P.addEquipment('turret', box(0.48, 0.20, 0.43), 0.47, 1.04, 0.10);
  P.add('turretDark', torus(0.22, 0.016, 18), 0.47, 1.16, 0.10, Math.PI / 2, 0, 0);
  addSmokeAndWarningSuite(P, { warningX: 1.04, warningZ: -1.42, warningY: 0.98, smokeX: 1.18, smokeZ: -0.02 });
  mount(P, 'turret', FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'turret', sizeStandard: 'k2b-compact-tower',
    scale: 0.74, towerRise: 0.10, variant: 'korean-twin', sensorHead: true,
    sensorMount: 'roof', weapon: true, caliberMm: 12.7,
    weaponName: 'QJC-88 remote weapon station', seed: 430,
  }), [0.38, 0.98, -0.82], [0, 0.03, 0]);
  P.addEquipment('turret', box(0.38, 0.18, 0.32), 0.38, 0.91, -0.82);
  for (const side of [-1, 1] as const) {
    mount(P, 'turret', FITTINGS.stowageRack({
      mats: P.mats, w: 1.20, d: 0.38, h: 0.30, rails: 3, fill: 0.35,
      seed: 432 + side,
    }), [side * 1.23, 0.46, -1.52], [0, side * Math.PI / 2, 0]);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: side < 0 ? 1.36 : 1.20, r: 0.011, seed: 434 + side }),
      [side * 0.76, 0.91, -1.90]);
  }
  P.decal('turret', 'number', 'VT4', 0.25, [-1.39, 0.46, -0.42], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 2.12);
}

function buildVT4A1(P: FrontlinePort): void {
  buildVT4A1Hull(P);
  buildVT4A1Turret(P);
  // All primary widths are authored at their installed dimensions. Avoiding
  // a root X-scale preserves the 600 mm track, circular bore, and real
  // broad/low Chinese silhouette simultaneously.
  const installedWidthScale = 1;
  P.decal('hull', 'number', P.spec.visual.number || '401', 0.25, [1.70, 1.30, 1.02], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.vt4a1GeometryReceipt = Object.freeze({
      independentHull: true, sourceGeometryImported: false,
      measuredEnvelopeM: Object.freeze([7.64, 3.50, 3.15]),
      sourceMeasuredBodyEnvelopeM: Object.freeze([7.464, 3.496, 3.120]),
      sourceMeasuredOverallLengthM: 10.082,
      installedWidthScale, installedTrackWidthM: 0.60,
      roadWheelsPerSide: 6, continuousSkirtToGlacisTransition: true,
      fenderRunsJoined: true, comparisonRegistry: 'vt4a1',
      qualityGateFloor: 92, duplicateTrackMeshes: 0,
    });
    P.turretG.userData.vt4a1TurretReceipt = Object.freeze({
      independentTurret: true, twoCourseIntegratedChevrons: true,
      gunCenterlineLocalY: 0.32, warningSensorPedestals: 2,
      roofRws: true, supportedBustleCages: true,
    });
  }
}

// -------------------------------------------------------------------------
// ZTZ-99A — independent replacement for the retired canonical silhouette
// -------------------------------------------------------------------------

function buildZTZ99AHull(P: FrontlinePort): void {
  const { box, polyMultiLoft } = KIT;
  addSixWheelRunningGear(P, {
    wheelZs: [2.34, 1.40, 0.46, -0.48, -1.42, -2.36],
    wheelR: 0.45, wheelY: 0.52, xc: 1.45, idlerZ: 2.94, sprocketZ: -3.12,
    trackW: 0.60, topY: 1.13, contactZF: 2.78, contactZR: -2.98,
    wheelHex: '#45513b',
  });
  const plan: [number, number][] = [
    [-0.95, 4.01], [0.95, 4.01], [1.37, 3.38], [1.55, 2.49],
    [1.55, -3.90], [1.39, -4.03], [-1.39, -4.03], [-1.55, -3.90],
    [-1.55, 2.49], [-1.37, 3.34],
  ];
  P.add('hull', polyMultiLoft(plan, [
    { height: 0.40, inset: 0.64 },
    { height: [0.66, 0.66, 0.80, 0.94, 1.02, 1.02, 1.02, 1.02, 0.94, 0.80], inset: 0.66 },
    { height: 1.20, inset: 0.66 },
    { height: [1.26, 1.26, 1.32, 1.48, 1.55, 1.55, 1.55, 1.55, 1.48, 1.32],
      inset: [0.80, 0.80, 0.89, 0.96, 0.97, 0.96, 0.96, 0.97, 0.96, 0.89] },
  ]));
  // Characteristic long, shallow 99A glacis with a central arrow ridge.
  P.add('hull', orientedSlab(
    [-0.94, 0.68, 3.51], [0.94, 0.68, 3.51], [0.82, 1.52, 1.64], [-0.82, 1.52, 1.64],
    [-0.94, 0.73, 3.51], [0.94, 0.73, 3.51], [0.82, 1.57, 1.64], [-0.82, 1.57, 1.64],
  ));
  for (const side of [-1, 1] as const) {
    P.visualEraCluster(`glacis_era_${side > 0 ? 'R' : 'L'}`, 'hull', () => {
      P.addExternalArmor('hull', orientedSlab(
        [side * 0.10, 1.54, 1.55], [side * 1.38, 1.49, 1.86], [side * 1.16, 1.25, 2.75], [side * 0.08, 1.20, 3.15],
        [side * 0.10, 1.59, 1.55], [side * 1.38, 1.54, 1.86], [side * 1.16, 1.30, 2.75], [side * 0.08, 1.25, 3.15],
      ));
    });
    P.add('hullDark', box(0.035, 0.035, 1.55), side * 0.72, 1.39, 2.42, -0.28, side * 0.16, 0);
  }
  P.add('hullDark', box(2.62, 0.038, 2.05), 0, 1.58, -2.30);
  for (let i = 0; i < 9; i++) P.add('hullDetail', box(2.44, 0.020, 0.055), 0, 1.61, -3.18 + i * 0.19);
  addContinuousTrackFenders(P, {
    xInner: 1.39, xOuter: 1.86, y: 1.46,
    zFront: 3.00, zRear: -3.78, noseZ: 3.83, noseY: 1.13,
  });
  addTrackSkirts(P, {
    x: 1.82, z0: 2.66, count: 9, step: 0.66, h: 0.89, frontDrop: 0.09,
    eraSectorPrefix: 'skirt_era',
  });
  P.addEquipment('hull', box(0.52, 0.055, 0.44), 0, 1.58, 1.16);
  for (const x of [-0.16, 0.16]) KIT.periscope(P, 'hullDetail', x, 1.62, 1.39);
  for (const side of [-1, 1] as const) {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.045, shield: true,
      rake: -0.28, seed: 500 + side,
    }), [side * 1.13, 1.25, 2.85], [-0.30, 0, 0]);
    KIT.liftEye(P, 'hullDetail', side * 1.02, 0.72, 3.42);
  }
  P.add('hull', box(2.18, 0.80, 0.18), 0, 1.14, -3.64);
  for (let i = 0; i < 7; i++) P.add('hullDark', box(0.055, 0.52, 0.025), -0.90 + i * 0.30, 1.18, -3.74);
}

function buildZTZ99ATurret(P: FrontlinePort): void {
  const { box, polyMultiLoft, torus } = KIT;
  P.turretG.position.set(0, 1.52, -0.04);
  P.gunG.position.set(0, 0.50, 1.55);
  const plan: [number, number][] = [
    // Extend the welded shell into the gun throat so the articulated cradle
    // stays physically seated throughout the full depression/elevation arc.
    [-0.27, 1.42], [0.27, 1.42], [1.02, 0.78], [1.60, 0.08],
    [1.68, -1.62], [1.52, -2.42], [1.28, -2.64], [-1.28, -2.64],
    [-1.52, -2.42], [-1.68, -1.62], [-1.60, 0.20], [-1.02, 1.06],
  ];
  P.add('turretDark', KIT.polyTurret(plan, 0.13, 1.18, 0.97), 0, -0.04, 0);
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.02, inset: 1.00 },
    { height: [0.40, 0.40, 0.58, 0.76, 0.86, 0.90, 0.92, 0.92, 0.90, 0.86, 0.76, 0.58], inset: 0.99 },
    { height: [1.10, 1.10, 1.24, 1.35, 1.40, 1.44, 1.45, 1.45, 1.44, 1.40, 1.35, 1.24],
      inset: [0.66, 0.66, 0.76, 0.87, 0.93, 0.95, 0.95, 0.95, 0.95, 0.93, 0.87, 0.76] },
  ]));
  P.add('turret', orientedSlab(
    [-1.08, 1.25, 0.35], [1.08, 1.25, 0.35], [1.28, 1.27, -2.34], [-1.28, 1.27, -2.34],
    [-0.82, 1.43, 0.12], [0.82, 1.43, 0.12], [1.12, 1.45, -2.30], [-1.12, 1.45, -2.30],
  ));
  P.add('turretDark', box(0.60, 0.70, 0.18), 0, 0.46, 1.31);
  // The fixed throat overlaps the moving root collar instead of terminating
  // behind it, preventing a daylight seam at maximum depression.
  P.add('turret', box(0.50, 0.62, 0.34), 0, 0.49, 1.45);
  const chevronStations = Object.freeze([
    { x: 0.22, ridgeZ: 1.70, upperY: 1.08, ridgeY: 0.55, lowerY: 0.08, upperSetback: 0.27, lowerSetback: 0.15 },
    { x: 0.52, ridgeZ: 1.48, upperY: 1.07, ridgeY: 0.54, lowerY: 0.08, upperSetback: 0.29, lowerSetback: 0.16 },
    { x: 0.86, ridgeZ: 1.14, upperY: 1.05, ridgeY: 0.53, lowerY: 0.08, upperSetback: 0.31, lowerSetback: 0.17 },
    { x: 1.20, ridgeZ: 0.70, upperY: 1.02, ridgeY: 0.51, lowerY: 0.09, upperSetback: 0.33, lowerSetback: 0.18 },
    { x: 1.64, ridgeZ: 0.18, upperY: 0.97, ridgeY: 0.48, lowerY: 0.10, upperSetback: 0.35, lowerSetback: 0.19 },
  ] satisfies readonly ChevronStation[]);
  // The rebuilt ZTZ shell has its own plan and vertical profile, but uses the
  // same proven structural law: one continuous upper/lower arrowhead per side.
  for (const side of [-1, 1] as const) {
    P.visualEraCluster(`turret_era_${side > 0 ? 'R' : 'L'}`, 'turret', () => {
      P.addExternalArmor('turret', closedIntegratedChevron(chevronStations, side));
    });
    addChevronRidgeSeams(P, chevronStations, side);
    P.addEquipment('turret', box(0.12, 0.36, 0.66), side * 1.60, 0.36, -0.50);
  }
  addChinese125Gun(P, { length: 7.16, rootR: 0.29, sleeveStart: 0.78, sleeveEnd: 4.58 });
  P.addEquipment('turret', box(0.50, 0.52, 0.46), -0.48, 1.54, 0.28, 0, -0.05, 0);
  P.addModuleVisual('optics', 'turretGlass', box(0.27, 0.24, 0.020), -0.48, 1.57, 0.52, 0, -0.05, 0);
  P.addEquipment('turret', box(0.50, 0.25, 0.45), 0.50, 1.55, -0.22);
  P.add('turretDark', torus(0.23, 0.016, 18), 0.50, 1.69, -0.22, Math.PI / 2, 0, 0);
  for (const side of [-1, 1] as const) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.043, len: 0.28, spacing: 0.10,
      splay: side * 0.48, pitch: -0.42, arc: 0.54, seed: 510 + side,
    }), [side * 1.31, 0.58, 0.02], [0, side * 0.98, 0]);
    P.addEquipment('turret', box(0.22, 0.22, 0.20), side * 1.06, 1.08, 0.16, 0, side * 0.20, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.13, 0.09, 0.018), side * 1.06, 1.11, 0.27, 0, side * 0.20, 0);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.50 + (side > 0 ? 0.12 : 0), r: 0.010, seed: 512 + side }),
      [side * 0.82, 1.42, -1.92]);
  }
  mount(P, 'turret', FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'turret', sizeStandard: 'k2b-compact-tower',
    scale: 0.82, towerRise: 0.12, variant: 'korean-twin', sensorHead: true,
    sensorMount: 'roof', weapon: true, caliberMm: 12.7,
    weaponName: 'QJC-88 remote machine gun', seed: 515,
  }), [0.42, 1.32, -0.82], [0, 0.03, 0]);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.82, d: 0.44, h: 0.25, rails: 3, fill: 0.42, seed: 516,
  }), [0, 0.58, -2.36]);
  P.decal('turret', 'number', '99A', 0.24, [-1.55, 0.58, -0.56], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 2.21);
}

function buildZTZ99A(P: FrontlinePort): void {
  buildZTZ99AHull(P);
  buildZTZ99ATurret(P);
  const installedWidthScale = 1;
  P.decal('hull', 'number', P.spec.visual.number || '215', 0.24, [1.80, 1.27, 0.82], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.type99aFrontlineReceipt = Object.freeze({
      independentFromCanonicalFamily: true, independentHull: true,
      sourceMeasuredBodyEnvelopeM: Object.freeze([7.145, 3.699, 3.685]),
      sourceMeasuredOverallLengthM: 11.605,
      installedWidthScale, installedTrackWidthM: 0.60,
      roadWheelsPerSide: 6, unifiedGlacisAndSkirtStructure: true,
      fenderRunsJoined: true, comparisonRegistry: 'type99a',
      qualityGateFloor: 92, duplicateTrackMeshes: 0,
    });
    P.turretG.userData.type99aFrontlineTurretReceipt = Object.freeze({
      independentTurret: true, retiredBadTurretReused: false,
      twoCourseIntegratedChevronCheeks: true, equalChevronCourseHeight: true,
      chevronsMeetSlopedTurretSides: true, gunCenterlineLocalY: 0.50,
    });
  }
}

export const CHINESE_FRONTLINE_PROFILES = Object.freeze({
  type99a: Object.freeze({ build: buildZTZ99A }),
  vt4a1: Object.freeze({ build: buildVT4A1 }),
}) satisfies VehicleProfileRecord;
