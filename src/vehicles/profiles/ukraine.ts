import { buildOplotBM } from './oplotBM.ts';
import { T80_MARK_PROFILES } from './t80Marks.ts';
import { buildT80UKursk } from './t80uKursk.ts';
import { buildT64BV2017 } from './t64bvK1.ts';
import { buildT64BM1M } from './t64bm1m.ts';
import { buildT64B1V2022 } from './t64KontaktFamily.ts';
import type { SnapGroupOptions, TankBuilderPort } from '../tankFactoryCore.ts';
// Ukrainian tracked-vehicle family — §5.248 GROUND-UP REBUILDS (ukraine wave).
//
// Every build below is a first-party procedural §K construction measured from
// its OWN registered print (docs/references/vertex/<id>.json extracts +
// tools/tmp-ua-digest.mjs mappings) with PUBLISHED dims sovereign:
//   t64bv_donbas       <- t64bv_donbass_manako.glb  (CC-BY-NC kitbash, local-only)
//   (ua_t80bv and t80u_kursk, release 274, are the T-80 marks' build and the T-80U X build in their Ukrainian field
//   fits: profiles/t80Marks.ts and profiles/t80uKursk.ts)
//   (t84bm_oplot_m, the T-84U Oplot, is built by profiles/oplotBM.ts as the Oplot-M/T family's 2000 stage, release 262)
// No source vertex, index, texture or topology ships — prints are measured
// visual/metric oracles only (docs/ATTRIBUTION.md §5.248). The previous
// donor-clone builders (variantOf composition over t64bv1/t80bv/t80u/t84)
// are fully replaced per the owner's §5.248 ground-up order; ua_m1a1 keeps
// its certified abrams base + first-party cage (not in the §5.248 drop set).
//
// Print stylization notes (banked in the packets; the curve-axis warps are
// REPORTED to the orchestrator lane per BUILD-STANDARD §E, never run here):
//   oplot print hull -10.4% short / pano band +13.8% tall at width-true;
//   donbass print hull -9.6% short, roof kit band +22%; t80bv print +6.4%
//   long with a +23% kit band; kursk -2.6% overall (usable as-is).

import * as THREE from 'three';
import { UA_CAGE_STATIONS as ABRAMS_DRONE_CAGE_STATIONS } from '../ukrainianDroneCage.ts';
import { KIT, FITTINGS } from './kit.ts';
import { addMissionAttachmentReceiver } from '../missionAttachmentReceiver.ts';
import { ABRAMS_PROFILES } from './abrams.ts';
import { buildOnDonor } from './donorBuild.ts';
import type { ProfileBuilderPort, VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { mount as seat } from './fittingMount.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';

interface DisposableResource {
  dispose(): void;
}

interface UkraineBuilderPort {
  postAssemble: TankBuilderPort['postAssemble'];
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: {
    readonly hull: THREE.Material;
    readonly canvasCloth: THREE.MeshStandardMaterial;
    readonly dark: THREE.Material;
    readonly detail: THREE.Material;
    readonly wood: THREE.MeshStandardMaterial;
  };
  readonly spec: { id: string; readonly visual: { readonly number?: string } };
  readonly disposables: DisposableResource[];
  /** The factory port's deferred stage (a suit is laid there after the build; donorBuild.ts claims the UA M1A1's). */
  readonly afterAssemble: TankBuilderPort['afterAssemble'];
  /** false on the low geometry tier (the factory's `geometryQuality: 'low'`). */
  readonly q?: boolean;
  muzzleZ?: number;
  topY?: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addExternalArmor(owner: VehicleAssemblyOwner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
  visualEraCluster(key: string, owner: VehicleAssemblyOwner, build: () => void): void;
  offsetBuckets: TankBuilderPort['offsetBuckets'];
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  /** Seats the fittings authored in `build` on their rig group's stock once the profile is done (fittingSnap.ts). */
  snapGroup(label: string, build: () => void, options?: SnapGroupOptions): void;
}

interface CageStation {
  readonly z: number;
  readonly x: number;
  readonly base: number;
  readonly roof: number;
  readonly rail?: number;
}


// ---------------------------------------------------------------------------
// ua_m1a1 — unchanged certified composition (abrams base + first-party
// drone cage). NOT part of the §5.248 drop set.
// ---------------------------------------------------------------------------
function addCageBar(
  P: UkraineBuilderPort,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): void {
  // open lattice (2026-09-15): cage bars are exterior air for the body rasters — the interior-fill
  // generator once filled this cage as turret interior (the grey side panels the owner saw)
  P.add('turretOpenLatticeDark', KIT.box(w, h, d), x, y, z, rx, ry, rz);
}

function addPitchedAbramsCageBar(
  P: UkraineBuilderPort,
  side: number,
  a: CageStation,
  b: CageStation,
  yKey: 'base' | 'roof' | 'rail',
  thickness: number,
): void {
  const dz = b.z - a.z;
  const aY = yKey === 'rail' ? a.rail! : a[yKey];
  const bY = yKey === 'rail' ? b.rail! : b[yKey];
  const dy = bY - aY;
  const len = Math.hypot(dz, dy);
  addCageBar(P, thickness, thickness, len,
    side * (a.x + b.x) * 0.5, (aY + bY) * 0.5, (a.z + b.z) * 0.5,
    -Math.atan2(dy, dz), 0, 0);
}

function addAbramsCageSideFrames(P: UkraineBuilderPort, thickness: number): void {
  const { box } = KIT;
  const stations = ABRAMS_DRONE_CAGE_STATIONS;
  for (const side of [-1, 1]) {
    for (const station of stations) {
      // (release 268 builder E, the A/B critics: "dark mounting slabs at the cage's front feet, beside the gun root, look
      // unattached": the front frame stands 0.4 m ahead of the cheeks, over nothing of the turret it rides with, so its
      // posts carry no mounting slabs; the frames behind it bolt to the turret's flanks)
      if (station !== stations[0]) {
        P.addEquipment('turret', box(0.48, 0.11, 0.30), side * (station.x - 0.25), station.base, station.z, 0, 0, side * 0.08);
      }
      addCageBar(P, thickness, station.roof - station.base, thickness,
        side * station.x, (station.roof + station.base) * 0.5, station.z);
      for (const fraction of [0.32, 0.62]) {
        addCageBar(P, thickness * 0.70, thickness * 0.70, 0.34,
          side * station.x,
          THREE.MathUtils.lerp(station.base, station.roof, fraction),
          station.z);
      }
    }
    for (let index = 0; index < stations.length - 1; index++) {
      const a = stations[index];
      const b = stations[index + 1];
      addPitchedAbramsCageBar(P, side, a, b, 'base', thickness);
      addPitchedAbramsCageBar(P, side, a, b, 'roof', thickness);
      for (const fraction of [0.34, 0.66]) {
        const aRail = { ...a, rail: THREE.MathUtils.lerp(a.base, a.roof, fraction) };
        const bRail = { ...b, rail: THREE.MathUtils.lerp(b.base, b.roof, fraction) };
        addPitchedAbramsCageBar(P, side, aRail, bRail, 'rail', thickness * 0.70);
      }
      const dz = b.z - a.z;
      const dy = b.roof - a.base;
      addCageBar(P, thickness * 0.76, thickness * 0.76, Math.hypot(dz, dy),
        side * (a.x + b.x) * 0.5, (a.base + b.roof) * 0.5, (a.z + b.z) * 0.5,
        -Math.atan2(dy, dz), 0, 0);
    }
  }
}

function addAbramsCageRoof(P: UkraineBuilderPort, thickness: number): void {
  const stations = ABRAMS_DRONE_CAGE_STATIONS;
  const frontTieOverlap = thickness * 0.50;
  const frontTieSpan = 0.50 + frontTieOverlap * 2;
  for (let index = 0; index < stations.length; index++) {
    const station = stations[index];
    if (index === 0) {
      for (const side of [-1, 1]) {
        addCageBar(P, station.x - 0.50, thickness, thickness,
          side * (0.50 + (station.x - 0.50) * 0.5), station.roof, station.z);
      }
    } else {
      addCageBar(P, station.x * 2, thickness, thickness, 0, station.roof, station.z);
    }
  }
  for (const x of [-1.38, -0.69, 0, 0.69, 1.38]) {
    for (let index = 0; index < stations.length - 1; index++) {
      const a = stations[index];
      const b = stations[index + 1];
      const dz = b.z - a.z;
      const dy = b.roof - a.roof;
      addCageBar(P, thickness * 0.76, thickness * 0.76, Math.hypot(dz, dy), x,
        (a.roof + b.roof) * 0.5, (a.z + b.z) * 0.5,
        -Math.atan2(dy, dz), 0, 0);
    }
  }
  for (const side of [-1, 1]) {
    addCageBar(P, frontTieSpan, thickness * 0.76, thickness * 0.76,
      side * 0.25, stations[0].roof, stations[0].z);
  }
  P.turretG.userData.uaM1A1CageRailReceipt = Object.freeze({
    centerRailHalfWidthM: thickness * 0.76 * 0.5,
    frontRibInnerXM: 0.50,
    connectorSpanM: frontTieSpan,
    connectorCenterXM: 0.25,
    overlapM: frontTieOverlap,
    yM: stations[0].roof,
    zM: stations[0].z,
  });
}

function addAbramsCageShoulders(P: UkraineBuilderPort, thickness: number): void {
  const front = ABRAMS_DRONE_CAGE_STATIONS[0];
  for (const side of [-1, 1]) {
    const width = front.x - 0.50;
    for (const fraction of [0, 0.33, 0.66, 1]) {
      const y = THREE.MathUtils.lerp(front.base, front.roof, fraction);
      addCageBar(P, width, thickness * 0.72, thickness * 0.72,
        side * (0.50 + width * 0.5), y, front.z - fraction * 0.16);
    }
    for (const x of [0.50, 0.97, 1.44, front.x]) {
      addCageBar(P, thickness * 0.72, front.roof - front.base, thickness * 0.72,
        side * x, (front.roof + front.base) * 0.5, front.z - 0.08,
        -0.17, 0, 0);
    }
  }
}

function addAbramsCageRearPayload(P: UkraineBuilderPort, thickness: number): void {
  const { box, cylY } = KIT;
  const rear = ABRAMS_DRONE_CAGE_STATIONS.at(-1)!;
  addCageBar(P, rear.x * 2, thickness, thickness, 0, rear.base, rear.z);
  addCageBar(P, rear.x * 2, thickness, thickness, 0, rear.roof, rear.z);
  for (let index = 0; index <= 8; index++) {
    addCageBar(P, thickness, rear.roof - rear.base, thickness,
      -rear.x + index * rear.x * 0.25, (rear.roof + rear.base) * 0.5, rear.z);
  }
  for (const fraction of [0.28, 0.55, 0.80]) {
    addCageBar(P, rear.x * 2, thickness * 0.70, thickness * 0.70,
      0, THREE.MathUtils.lerp(rear.base, rear.roof, fraction), rear.z);
  }

  // Release 268 builder E: the turret under the cage is the owner's model's (profiles/m1a1Turret.ts): its bustle ends at
  // z -2.56 with the M1A1's own rack hung behind it (to -2.97) and the roof 8 cm lower (0.709). The cage keeps its
  // stations (the spec's drone screens); its payload rides that turret: the EW boxes on the roof's rear corners, the
  // rolled covers on the blow-off panels, the whips on the roof's antenna bases, and two braces carry the rear wall's
  // feet into the rack's rear frame.
  const roofY = 0.709;
  for (const side of [-1, 1]) {
    P.addEquipment('turret', box(0.48, 0.30, 0.40), side * 0.80, roofY + 0.15 - 0.004, -2.355);
    P.add('turretDark', box(0.42, 0.025, 0.34), side * 0.80, roofY + 0.30 + 0.008, -2.355);
    P.addEquipment('turret', cylY(0.15, 0.15, 0.48, 14), side * 0.42, roofY + 0.046 + 0.148, -1.70,
      0, 0, Math.PI / 2);
    seat(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: 0.72, r: 0.011,
      rake: -side * 0.10, seed: 1110 + (side > 0 ? 1 : 0),
    }), side * 1.10, roofY - 0.79 + 0.833 + 0.05, -2.35);
    const foot: [number, number, number] = [side * (rear.x - 0.25), rear.base, rear.z];
    const rackCorner: [number, number, number] = [side * 1.04, 0.25, -2.975];
    const dx = rackCorner[0] - foot[0], dy = rackCorner[1] - foot[1], dz = rackCorner[2] - foot[2];
    const len = Math.hypot(dx, dy, dz);
    const brace = KIT.box(thickness * 0.76, thickness * 0.76, len);
    brace.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(dx, dy, dz).normalize()));
    P.add('turretOpenLatticeDark', brace, (foot[0] + rackCorner[0]) / 2, (foot[1] + rackCorner[1]) / 2,
      (foot[2] + rackCorner[2]) / 2);
  }
}

/** Fine rod lattice (owner 2026-09-16: "add the smaller thinner cage layers from the m1a1_abrams_hc abrams ua
 * cages to the M1A1 SA"): 6 mm rods at 155 mm pitch — longitudinal rods per bay following the pitched
 * canopy, transverse rods along the bays, vertical rods hanging on both flanks and across the rear wall —
 * welded into the 32 mm frame (rod centres sit inside the frame's half-thickness). The front bay keeps
 * the gun corridor (|x| < 0.50) open like the heavy ribs do. Open lattice: exterior air for the rasters. */
function addAbramsCageFineLattice(P: UkraineBuilderPort): void {
  const rod = 0.006, pitch = 0.155;
  const stations = ABRAMS_DRONE_CAGE_STATIONS;
  const lerp = THREE.MathUtils.lerp;
  let rods = 0;
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): void => {
    addCageBar(P, w, h, d, x, y, z, rx, 0, 0);
    rods++;
  };
  for (let index = 0; index < stations.length - 1; index++) {
    const a = stations[index];
    const b = stations[index + 1];
    const dz = b.z - a.z;
    const dy = b.roof - a.roof;
    const length = Math.hypot(dz, dy);
    const pitchX = -Math.atan2(dy, dz);
    const halfX = Math.min(a.x, b.x) - 0.08;
    const columns = Math.round(2 * halfX / pitch);
    for (let i = 0; i <= columns; i++) {
      const x = -halfX + i * (2 * halfX / columns);
      if (index === 0 && Math.abs(x) < 0.50) continue;
      bar(rod, rod, length - 0.04, x, (a.roof + b.roof) * 0.5 + 0.012, (a.z + b.z) * 0.5, pitchX);
    }
    const rows = Math.max(1, Math.round(Math.abs(dz) / pitch));
    for (let j = 1; j < rows; j++) {
      const t = j / rows;
      const z = lerp(a.z, b.z, t);
      const y = lerp(a.roof, b.roof, t) + 0.018;
      const halfWidth = lerp(a.x, b.x, t) - 0.05;
      if (index === 0) {
        for (const side of [-1, 1]) bar(halfWidth - 0.50, rod, rod, side * (0.50 + (halfWidth - 0.50) * 0.5), y, z);
      } else {
        bar(halfWidth * 2, rod, rod, 0, y, z);
      }
      for (const side of [-1, 1]) {
        const base = lerp(a.base, b.base, t);
        const roof = lerp(a.roof, b.roof, t);
        // Art fixes 230 (2026-10-21): the rods stopped 9 mm short of the 32 mm base and roof rails and followed the
        // station taper while each bay's rails stand at its mean x, so eight hung free. Each now stands inside the
        // rails' half-thickness at the bay's x and runs 6 mm into both.
        bar(rod, roof - base - 0.012, rod, side * ((a.x + b.x) * 0.5 + 0.012), (base + roof) * 0.5, z);
      }
    }
  }
  const rear = stations[stations.length - 1];
  const rearColumns = Math.round((rear.x * 2 - 0.10) / pitch);
  for (let i = 0; i <= rearColumns; i++) {
    const x = -rear.x + 0.05 + i * ((rear.x * 2 - 0.10) / rearColumns);
    bar(rod, rear.roof - rear.base - 0.012, rod, x, (rear.roof + rear.base) * 0.5, rear.z - 0.012);
  }
  P.turretG.userData.uaM1A1CageLatticeReceipt = Object.freeze({ rodM: rod, pitchM: pitch, rods });
}

function addAbramsDroneCage(P: UkraineBuilderPort): void {
  const { box } = KIT;
  const t = 0.032;
  // The Ukrainian field cage follows the Abrams turret's wedge instead of
  // enclosing it in a cuboid.  Four frame stations create a low front brow,
  // a pitched crown and a slightly falling rear canopy.  All coordinates are
  // turret-local, so the complete cage, payload and jammer yaw as one unit.
  // The native M1A1HA turret reaches about x=+/-1.71 and z=-3.16..+2.40.
  // Keep the cage outside that envelope instead of using the armor skin as
  // its centerline. The front remains shorter for the gun aperture, while
  // the bustle station clears the ammunition compartment and rear rack.
  addAbramsCageSideFrames(P, t);

  // Transverse roof ribs join both side frames.  The front rib is split at
  // x ±0.50 to preserve the gun/elevation corridor; aft ribs cross the full
  // canopy above the turret equipment.
  addAbramsCageRoof(P, t);

  // Tapered front shoulder screens frame the mantlet rather than crossing
  // it. Their upper rail follows the pitched first bay.
  addAbramsCageShoulders(P, t);

  // Connected rear wall and filled bustle payload.  The rack, spare aerial
  // boxes, EW heads and rolled covers eliminate the former empty black cage.
  addAbramsCageRearPayload(P, t);
  // The fine rod layers (owner 2026-09-16) hang inside the heavy frame.
  addAbramsCageFineLattice(P);
  // Forward EO/EW cluster is planted on a real crossmember and remains
  // below the canopy crown.
  // (release 268 builder E, the floating-kit class: it hung 6 cm under the cage's centre rail, touching nothing; it
  // hangs from that rail, its top on the rail's underside at its front edge)
  const [crown0, crown1] = ABRAMS_DRONE_CAGE_STATIONS;
  const railUnderAt = (z: number): number =>
    crown0.roof + (crown1.roof - crown0.roof) * (crown0.z - z) / (crown0.z - crown1.z) - t * 0.76 / 2;
  const eoY = railUnderAt(0.84) - 0.05;
  addCageBar(P, 0.72, 0.10, 0.20, 0, eoY, 0.74);
  P.add('turretGlass', box(0.28, 0.095, 0.026), 0, eoY + 0.02, 0.855);
  // 2026-10-19 (owner float sweep): the sensor box stood 165 mm over the roof (its window 3 mm off its face); the
  // window now lies on the face and the pair stands on the roof.
  P.snapGroup('ua-m1a1-cage-sensor', () => {
    // (builder E: on the 0.709 roof of the owner's model's turret)
    P.addEquipment('turret', box(0.24, 0.20, 0.20), -0.96, 0.818, -1.62);
    P.add('turretGlass', box(0.13, 0.07, 0.024), -0.96, 0.848, -1.509);
  }, { reachM: 0.18, mode: 'down' });
  P.decal('turret', 'number', 'UA M1', 0.24, [-1.422, 0.32, -0.80], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

function buildUAM1A1(P: UkraineBuilderPort): void {
  // buildTejasFamily branches on the source family id: the exact M1A1HA id for the base build only (donorBuild.ts), the
  // Ukrainian identity back before the first-party cage and decals; the Ukrainian suit claimed first, laid after the build.
  // Release 268: the HA base lends its shell, not its Desert Storm kit. The host id tells buildTejasFamily and the
  // M1A1 identity kits that this is a Ukrainian M1A1 SA: no track-width mine plow, no 1991 rack stowage, no gun
  // searchlight (research/ua_m1a1/photos).
  buildOnDonor(P, 'm1a1ha', (port) => ABRAMS_PROFILES.m1a1ha.build(port));
  addAbramsDroneCage(P);
  addMissionAttachmentReceiver(P, 'ua_m1a1');
}

export const UKRAINE_PROFILES = {
  t64bv_donbas: { build: (P: TankBuilderPort) => buildT64BV2017(P) },
  t64bm1m: { build: (P: TankBuilderPort) => buildT64BM1M(P) },
  t64b1v_2022: { build: (P: TankBuilderPort) => buildT64B1V2022(P) },
  // 274: the Ukrainian T-80BV is the T-80BV mark in its 2015-24 field fit (profiles/t80Marks.ts)
  ua_t80bv: T80_MARK_PROFILES.ua_t80bv,
  // 274: the T-80U Kursk is the T-80U X build in its 2022 Ukrainian field fit (profiles/t80uKursk.ts)
  t80u_kursk: { build: (builder: ProfileBuilderPort) => buildT80UKursk(builder as TankBuilderPort) },
  t84bm_oplot_m: { build: (builder: ProfileBuilderPort) => buildOplotBM(builder as TankBuilderPort, 'u') },
  bm_oplot_m: { build: (builder: ProfileBuilderPort) => buildOplotBM(builder as TankBuilderPort, 'm') },
  bm_oplot_t: { build: (builder: ProfileBuilderPort) => buildOplotBM(builder as TankBuilderPort, 't') },
  pt84_orzel: { build: (builder: ProfileBuilderPort) => buildOplotBM(builder as TankBuilderPort, 'pl') },
  pt84_sokol: { build: (builder: ProfileBuilderPort) => buildOplotBM(builder as TankBuilderPort, 'pls') },
  pt84_zbik: { build: (builder: ProfileBuilderPort) => buildOplotBM(builder as TankBuilderPort, 'plz') },
  ua_m1a1: { build: (builder: ProfileBuilderPort) => buildUAM1A1(builder as UkraineBuilderPort) },
} satisfies VehicleProfileRecord;
