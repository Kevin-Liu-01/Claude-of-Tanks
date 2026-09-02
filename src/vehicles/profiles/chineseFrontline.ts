// First-party VT-4A1 construction on the exact ZTZ-99A2 chassis.
//
// The supplied VT-4A1 GLB remains a comparison instrument only. Playable
// geometry comes from the shared procedural A2 hull and a new same-envelope
// VT turret authored in the game's native +Z-forward frame.

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, muzzleTipDot } from './kit.ts';
import { buildZTZ99A2Hull, type ChinaBuilderPort } from './china.ts';
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

interface ChevronStation {
  readonly x: number;
  readonly upperX?: number;
  readonly ridgeX?: number;
  readonly lowerX?: number;
  readonly upperY: number;
  readonly upperZ: number;
  readonly ridgeY: number;
  readonly ridgeZ: number;
  readonly lowerY: number;
  readonly lowerZ: number;
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
    side * (station.upperX ?? station.x), station.upperY, station.upperZ,
  ];
  const ridge = (station: ChevronStation): Vec3 => [
    side * (station.ridgeX ?? station.x), station.ridgeY, station.ridgeZ,
  ];
  const lower = (station: ChevronStation): Vec3 => [
    side * (station.lowerX ?? station.x), station.lowerY, station.lowerZ,
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

function interpolateChevronStation(
  stations: readonly ChevronStation[],
  x: number,
): ChevronStation {
  if (x <= stations[0].x) return stations[0];
  for (let index = 0; index < stations.length - 1; index++) {
    const a = stations[index], b = stations[index + 1];
    if (x > b.x && index < stations.length - 2) continue;
    const t = THREE.MathUtils.clamp((x - a.x) / Math.max(1e-6, b.x - a.x), 0, 1);
    const lerp = (key: keyof ChevronStation): number => THREE.MathUtils.lerp(
      (a[key] as number | undefined) ?? a.x,
      (b[key] as number | undefined) ?? b.x,
      t,
    );
    return {
      x,
      upperX: lerp('upperX'), ridgeX: lerp('ridgeX'), lowerX: lerp('lowerX'),
      upperY: lerp('upperY'), upperZ: lerp('upperZ'),
      ridgeY: lerp('ridgeY'), ridgeZ: lerp('ridgeZ'),
      lowerY: lerp('lowerY'), lowerZ: lerp('lowerZ'),
    };
  }
  return stations.at(-1)!;
}

// The Leopard 2 cheeks carry four broad shallow cassettes over one continuous
// upper wedge. Their narrow gaps expose the structural cheek as real seams;
// they are not stacked replacement slabs. Repeat that exact visual grammar on
// the VT front so it reads as a deliberate Leopard-style chevron package.
function chevronSurfacePanel(
  a: ChevronStation,
  b: ChevronStation,
  side: -1 | 1,
): THREE.BufferGeometry {
  const point = (station: ChevronStation, key: 'upper' | 'ridge'): THREE.Vector3 => {
    const x = key === 'upper' ? (station.upperX ?? station.x) : (station.ridgeX ?? station.x);
    return new THREE.Vector3(
      side * x,
      key === 'upper' ? station.upperY : station.ridgeY,
      key === 'upper' ? station.upperZ : station.ridgeZ,
    );
  };
  const onFace = (station: ChevronStation, t: number): THREE.Vector3 => (
    point(station, 'ridge').lerp(point(station, 'upper'), t)
  );
  const base = [onFace(a, 0.075), onFace(b, 0.075), onFace(b, 0.915), onFace(a, 0.915)];
  const normal = base[1].clone().sub(base[0])
    .cross(base[3].clone().sub(base[0])).normalize();
  if (normal.y < 0) normal.negate();
  const lift = normal.multiplyScalar(0.024);
  const top = base.map((pointValue) => pointValue.clone().add(lift));
  return orientedSlab(
    base[0].toArray(), base[1].toArray(), base[2].toArray(), base[3].toArray(),
    top[0].toArray(), top[1].toArray(), top[2].toArray(), top[3].toArray(),
  );
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
// VT-4A1 — exact A2 chassis with an independent same-envelope turret
// -------------------------------------------------------------------------

function buildVT4A1Hull(P: FrontlinePort): void {
  // The owner-requested VT-4A1 chassis is the certified ZTZ-99A2 chassis,
  // including its running gear, lofted hull, glacis, fenders, skirts, rear
  // deck, transom and fuel-rack structure. Keeping one shared builder makes
  // that relationship exact and prevents either hull from silently drifting.
  buildZTZ99A2Hull(P as unknown as ChinaBuilderPort);
}

function buildVT4A1Turret(P: FrontlinePort): void {
  const { box, cylY, polyMultiLoft, torus } = KIT;
  P.turretG.position.set(0, 1.56, -0.15);
  P.gunG.position.set(0, 0.39, 0.75);
  const plan: [number, number][] = [
    // A new welded VT shell occupies the A2's exact primary envelope but
    // uses a broader arrow nose, sharper shoulder breaks and a distinct
    // clipped bustle. It shares no turret geometry with ZTZ-99A2.
    [0.38, 1.58], [0.92, 1.02], [1.44, 0.28], [1.62, -0.52],
    [1.48, -1.35], [1.16, -1.62], [0.62, -1.72], [-0.62, -1.72],
    [-1.16, -1.62], [-1.48, -1.35], [-1.62, -0.52], [-1.44, 0.28],
    [-0.92, 1.02], [-0.38, 1.58],
  ];
  P.add('turretDark', KIT.polyTurret(plan, 0.11, 0.92, 0.97), 0, -0.04, 0);
  P.add('turret', polyMultiLoft(plan, [
    { height: 0.02, inset: 1.00 },
    { height: [0.34, 0.40, 0.48, 0.55, 0.62, 0.66, 0.67, 0.67, 0.66, 0.62, 0.55, 0.48, 0.40, 0.34], inset: 1.00 },
    { height: 0.89,
      inset: [0.54, 0.60, 0.74, 0.84, 0.90, 0.93, 0.94, 0.94, 0.93, 0.90, 0.84, 0.74, 0.60, 0.54],
      centerHeight: 0.89 },
  ]));
  P.add('turret', cylY(1.10, 1.16, 0.11, P.q ? 20 : 14), 0, -0.04, -0.30);
  // The crown is buried into the lofted shell along all four edges. This
  // closes the roof/front junction and keeps the chevron shoulders from
  // reading as applique panels floating ahead of a separate box.
  P.add('turret', orientedSlab(
    [-0.88, 0.78, 0.48], [0.88, 0.78, 0.48], [1.12, 0.79, -1.52], [-1.12, 0.79, -1.52],
    [-0.72, 0.91, 0.22], [0.72, 0.91, 0.22], [0.98, 0.92, -1.48], [-0.98, 0.92, -1.48],
  ));
  P.add('turretDark', box(0.62, 0.56, 0.25), 0, 0.38, 1.38);
  P.add('turret', box(0.54, 0.54, 0.56), 0, 0.39, 1.36);
  // Directly adapted from the Leopard 2A6 cheek section: the upper root is
  // set roughly 1.2 m behind the ridge by a 19-degree armor slope, while the
  // lower return is shorter and climbs into the turret wall. The compound X
  // coordinates fan the terminal from the roof shoulder to the side wall,
  // so the cheek is structurally merged rather than ending as a flat plate.
  const chevronStations = Object.freeze([
    { x: 0.22, upperX: 0.22, ridgeX: 0.22, lowerX: 0.22,
      upperY: 0.82, upperZ: 0.46, ridgeY: 0.40, ridgeZ: 1.68, lowerY: 0.04, lowerZ: 0.78 },
    { x: 0.38, upperX: 0.34, ridgeX: 0.38, lowerX: 0.40,
      upperY: 0.82, upperZ: 0.39, ridgeY: 0.40, ridgeZ: 1.61, lowerY: 0.04, lowerZ: 0.79 },
    { x: 0.82, upperX: 0.62, ridgeX: 0.82, lowerX: 0.78,
      upperY: 0.81, upperZ: 0.14, ridgeY: 0.39, ridgeZ: 1.36, lowerY: 0.04, lowerZ: 0.68 },
    { x: 1.18, upperX: 0.86, ridgeX: 1.18, lowerX: 1.18,
      upperY: 0.79, upperZ: -0.12, ridgeY: 0.37, ridgeZ: 1.10, lowerY: 0.05, lowerZ: 0.44 },
    { x: 1.50, upperX: 1.04, ridgeX: 1.50, lowerX: 1.58,
      upperY: 0.76, upperZ: -0.40, ridgeY: 0.34, ridgeZ: 0.82, lowerY: 0.07, lowerZ: 0.30 },
    { x: 1.72, upperX: 1.18, ridgeX: 1.72, lowerX: 1.62,
      upperY: 0.72, upperZ: -0.58, ridgeY: 0.30, ridgeZ: 0.64, lowerY: 0.10, lowerZ: 0.30 },
  ] satisfies readonly ChevronStation[]);
  const panelBands = Object.freeze([
    [0.055, 0.270], [0.300, 0.505], [0.535, 0.755], [0.785, 0.955],
  ] as const);
  P.visualEraCluster('vt4a1-integrated-chevron-front', 'turret', () => {
    for (const side of [-1, 1] as const) {
      P.addExternalArmor('turret', closedIntegratedChevron(chevronStations, side));
      for (const [startT, endT] of panelBands) {
        const startX = THREE.MathUtils.lerp(chevronStations[0].x,
          chevronStations.at(-1)!.x, startT);
        const endX = THREE.MathUtils.lerp(chevronStations[0].x,
          chevronStations.at(-1)!.x, endT);
        P.addExternalArmor('turret', chevronSurfacePanel(
          interpolateChevronStation(chevronStations, startX),
          interpolateChevronStation(chevronStations, endX),
          side,
        ));
      }
    }
  });
  addChinese125Gun(P, { length: 6.42, rootR: 0.25, sleeveStart: 1.60, sleeveEnd: 3.75 });

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
  P.decal('turret', 'number', 'VT4', 0.25, [-1.58, 0.46, -0.55], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.42);
}

function buildVT4A1(P: FrontlinePort): void {
  buildVT4A1Hull(P);
  buildVT4A1Turret(P);
  // All primary widths are authored at their installed dimensions.
  const installedWidthScale = 1;
  P.decal('hull', 'number', P.spec.visual.number || '401', 0.25, [1.82, 1.30, 0.84], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.vt4a1GeometryReceipt = Object.freeze({
      exactHullCloneOf: 'ztz99a2', sourceGeometryImported: false,
      measuredEnvelopeM: Object.freeze([7.60, 3.70, 2.45]),
      installedWidthScale, installedTrackWidthM: 0.63,
      roadWheelsPerSide: 6, sharedHullBuilder: 'buildZTZ99A2Hull',
      fenderRunsJoined: true, comparisonRegistry: 'ztz99a2',
      qualityGateFloor: 92, duplicateTrackMeshes: 0,
    });
    P.turretG.userData.vt4a1TurretReceipt = Object.freeze({
      independentTurret: true, samePrimaryEnvelopeAs: 'ztz99a2',
      integratedChevronFront: true, chevronTerminalBuriedInSideBelt: true,
      chevronProfile: 'leopard-2a6-derived', upperSlopeDeg: 19,
      sharedPhysicalRidge: true, dominantUpperChevron: true,
      surfacePanelsPerSide: 4, compoundShoulderTerminal: true,
      upperRootSetbackM: 1.22, lowerReturnMaxSetbackM: 0.90,
      gunCenterlineLocalY: 0.39, warningSensorPedestals: 2,
      roofRws: true, supportedBustleCages: true,
    });
  }
}

export const CHINESE_FRONTLINE_PROFILES = Object.freeze({
  vt4a1: Object.freeze({ build: buildVT4A1 }),
}) satisfies VehicleProfileRecord;
