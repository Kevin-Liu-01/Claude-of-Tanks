import { weaponAssembly } from './weaponStock.ts';
// Owner-directed 2026-09-19 missile-carrier concept, distinct from service ZTZ-100.
// The historical first-party hull and complete running gear remain unchanged.
// The broad shouldered 2x2 banks, angular low body and short backup cannon are
// original concept stock; no historical turret/source-fidelity claim applies.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { buildZtz20Hull, markZtz20Hull, ztz20Receipt, ZTZ20_DATUMS } from './ztz20Family.ts';
import { addClampFrame, addLaunchCanister, elevationSector, type LaunchCanister } from './missileCanisterStock.ts';

const { box, cylX, cylY, cylZ } = KIT;

/** Tag a geometry with its measured part name so the receipt can census the build. */
function part(geometry: THREE.BufferGeometry, name: string): THREE.BufferGeometry {
  geometry.userData.ztz100 = name;
  return geometry;
}

// ---------------------------------------------------------------------------------------------- measured frame
// Release 262 (owner 2026-10-27: "the ztz 100 is its prototype"): the testbed now stands on the ZTZ-20 family hull and
// running gear at its earliest stage (ztz20Family.ts ZTZ20_STAGES.ztz100_prototype: bare glacis, upper skirt band only,
// a closed stern bin, the flat testbed engine deck its missile turret's platter clears); the turret below is unchanged.
export const ZTZ100_PROTOTYPE_DATUMS = Object.freeze({
  ...ZTZ20_DATUMS, turretRoofM: 1.90, overallHeightM: 2.74, trunnion: [0, 2.05, .25] as const, muzzleZ: 3.75,
});

// ----------------------------------------------------------------------------------------------------- turret
// Owner-directed missile-carrier concept. Dimensions are design decisions,
// not measurements of the superseded historical MBT turret.
// 2026-10-22 (lane 240; the owner approved the spec change): the backup gun is a calibre-true 35 mm L/90, its tube 3.15 m
// from the breech face (z .35, inside the receiver) to the muzzle (3.50 ahead of the trunnion), where the old stub
// stopped at 1.45.
const T = { roof: .49, gunY: .64, gunZ: .80, gunLen: 3.50, breechZ: .35, pivotY: 1.41, pivotZ: -.55 } as const;
// 2026-10-21 (owner: "follow that of the object 695, and tagil"): the two armored box banks became open pods of round
// 152 mm HJ-P9 canisters on a 0.30 m pitch, the Object 695 vocabulary; the upper row keeps its height, the lower row
// rises 0.10 m to sit just above the pitch axis. outerRadius/innerRadius are the collar and the dark-lined bore.
export const ZTZ100_PROTOTYPE_LAUNCHER = Object.freeze({
  podCenters: [-1.08, 1.08] as const, pitch: .30,
  columns: [-1.23, -.93, .93, 1.23] as const, rows: [.12, .42] as const,
  rear: -1.10, mouth: 1.00, outerRadius: .143, innerRadius: .112, frames: [-.62, .66] as const,
  gunPivot: [0, T.gunY, T.gunZ] as const, backupLength: T.gunLen,
  backupOuterRadius: .0655, backupInnerRadius: .0175, backupDepth: .09,
});
const L = ZTZ100_PROTOTYPE_LAUNCHER;
export const ZTZ100_PROTOTYPE_CANISTER: LaunchCanister = Object.freeze({
  bodyRadius: .126, collarRadius: L.outerRadius, boreRadius: L.innerRadius, capRadius: .134, bandRadius: .133,
  rear: L.rear, mouth: L.mouth, collarLength: .16, recess: .095,
  bands: Object.freeze([L.frames[0], .02, L.frames[1]]), segments: [20, 12] as const,
});

function bodySection(z: number, width: number, top: number): SolidSection {
  return { z, ring: [[-width + .08, .015], [width - .08, .015], [width, .055],
    [width - .08, top], [-width + .08, top], [-width, .055]] };
}

/** The lateral deck stays below the bank's complete +20 degree rear sweep. */
function armoredBody(P: TankBuilderPort): void {
  P.add('turretDark', part(cylY(1.15, 1.20, .07, P.q ? 48 : 24), 'concept-ring'), 0, -.015, .10);
  P.add('turret', part(sectionSolid([
    bodySection(-1.62, 1.08, .08), bodySection(-1.20, 1.49, .08),
    bodySection(.75, 1.49, .08), bodySection(1.42, .64, .08),
  ]), 'concept-armored-platter'));
  const spine = (z: number, w: number, roof: number): SolidSection => ({ z, ring: [
    [-w, .07], [w, .07], [w, roof - .14], [w - .15, roof],
    [-w + .15, roof], [-w, roof - .14],
  ] });
  P.add('turret', part(sectionSolid([
    spine(-1.58, .58, .44), spine(-1.12, .60, T.roof),
    spine(.34, .60, T.roof), spine(.76, .43, .42),
  ]), 'concept-central-spine'));
  for (const s of [-1, 1]) {
    P.add('turret', part(box(.15, .48, .42), 'pitch-pedestal'), s * .515, .37, T.gunZ);
    P.add('turret', part(cylX(.18, .20, P.q ? 28 : 14), 'pitch-bearing'), s * .515, T.gunY, T.gunZ);
    P.add('turretDark', part(cylX(.095, .018, P.q ? 20 : 10), 'pitch-bearing-cap'), s * .625, T.gunY, T.gunZ);
    // Fixed elevation drive: a gearbox on the pedestal's outer face under the bearing it turns, its motor below. Both
    // stay inboard of x .70 (the journal clears the gearbox by 5 mm); the pitching pods start at .711.
    P.addEquipment('turret', part(box(.10, .20, .28), 'elevation-gearbox'), s * .635, .405, T.gunZ);
    P.addEquipment('turretDark', part(cylZ(.06, .24, P.q ? 16 : 10), 'elevation-motor'), s * .64, .26, T.gunZ + .06);
    // Its pinion, straight below the pitch axis, stands 2 mm off the tips of the pod's elevation sector.
    P.addEquipment('turretDark', part(cylX(.036, .05, P.q ? 16 : 10), 'elevation-pinion'), s * .70, .282, T.gunZ);
  }
}

/** One pod: four canisters (the middle band only at HIGH), a clamp frame at each frame station, two rails under the
 * bottom straps, an inner cradle plate across the inner posts, and the trunnion hub on the fixed bearing's journal. */
function pod(P: TankBuilderPort, side: number): void {
  const C = ZTZ100_PROTOTYPE_CANISTER, c = side * L.podCenters[1], n = P.q ? 24 : 12;
  const columns = L.columns.filter(x => Math.sign(x) === side), bands = P.q ? C.bands : L.frames;
  for (const x of columns) for (const y of L.rows) addLaunchCanister(P, part, C, x, y, bands);
  let bottom = 0;
  for (const z of L.frames) bottom = addClampFrame(P, part, C, columns, L.rows, z).bottom;
  // Ladder cradle: a saddle under each frame from the inner plate to the outer post, two rails ending inside them.
  for (const z of L.frames) {
    P.addEquipment('gunMount', part(new THREE.BoxGeometry(.652, .058, .08), 'pod-saddle'), c - side * .014, bottom - .039, z);
  }
  for (const dx of [-L.pitch / 2, L.pitch / 2]) {
    P.addEquipment('gunMount', part(new THREE.BoxGeometry(.045, .04, 1.34), 'pod-rail'), c + dx, bottom - .034, .02);
  }
  P.addEquipment('gunMount', part(new THREE.BoxGeometry(.03, .52, 1.40), 'pod-cradle-plate'), c - side * .328, .06, .02);
  P.addEquipment('gunMount', part(cylX(.165, .03, n), 'pod-trunnion-hub'), c - side * .354, 0, 0);
  // Elevation sector on the hub, meshing with the pedestal pinion below the axis over the whole -6..+20 degree range.
  P.addEquipment('gunMountDark', part(elevationSector(.10, .30, .02, -120, -74, 10, .025, P.q), 'pod-elevation-sector'),
    c - side * .3535, 0, 0);
  // The journal runs from inside the fixed bearing (x .415-.615) into the hub.
  P.addEquipment('gunMountDark', part(cylX(.13, .16, n), 'bank-pitch-journal'), side * .645, 0, 0);
}

/** The 35 mm L/90 backup gun (2026-10-22, lane 240), the Type 89's KDE vocabulary at this mount: a stepped tube
 * through a recoil jacket to a conical flash hider with vent rings, its bore open at the hider's face. The mount that
 * carries 3.15 m of tube: the mantlet block and slide bearing, a cradle under the receiver with a recoil buffer either
 * side, and a guide collar round the receiver's front, all on the pitching mount (the recoiling parts clear them by a
 * centimetre or more). */
function backupCannon(P: TankBuilderPort): void {
  const D = ZTZ100_PROTOTYPE_LAUNCHER, n = P.q ? 32 : 16, m = P.q ? 20 : 12;
  P.addEquipment('gunMount', part(box(.34, .29, .43), 'backup-mantlet'), 0, 0, -.04);
  P.addEquipment('gunMount', part(cylZ(.092, .28, n), 'backup-slide-bearing'), 0, 0, .30);
  // the cradle's top 8 mm under the receiver, its tail in the mantlet block; the buffers ride its upper corners
  P.addEquipment('gunMount', part(box(.17, .07, .62), 'backup-cradle'), 0, -.105, .44);
  for (const s of [-1, 1]) {
    P.addEquipment('gunMountDark', part(cylZ(.028, .52, m), 'backup-recoil-buffer'), s * .075, -.07, .43);
  }
  P.addEquipment('gunMount', part(cylZ(.078, .08, n), 'backup-guide-collar'), 0, -.004, .78);
  P.add('gun', part(cylZ(.062, .80, n), 'backup-receiver'), 0, 0, .45);
  P.add('gun', part(cylZ(.056, .80, n, .062), 'backup-jacket'), 0, 0, 1.25);
  P.add('gun', part(cylZ(.044, 1.65, m), 'backup-barrel'), 0, 0, 2.465);
  // the flash hider: an open cone (its face is the mouth ring), closed behind by an annulus onto the tube
  const hiderLen = .22, hiderZ = T.gunLen - hiderLen / 2;
  P.add('gun', part(new THREE.CylinderGeometry(D.backupOuterRadius, .048, hiderLen, n, 1, true).rotateX(Math.PI / 2),
    'backup-flash-hider'), 0, 0, hiderZ);
  P.add('gun', part(new THREE.RingGeometry(.040, .048, n).rotateY(Math.PI), 'backup-flash-hider-heel'), 0, 0, T.gunLen - hiderLen);
  // vent rings: closed bands round the cone (their inner faces inside its wall, the bore left open)
  const band = new THREE.LatheGeometry([new THREE.Vector2(.045, -.008), new THREE.Vector2(.071, -.008),
    new THREE.Vector2(.071, .008), new THREE.Vector2(.045, .008), new THREE.Vector2(.045, -.008)], n).rotateX(Math.PI / 2);
  for (const z of [.055, .115, .175]) P.add('gunDark', part(band.clone(), 'backup-vent-ring'), 0, 0, T.gunLen - z);
  band.dispose();
  const throat = new THREE.CylinderGeometry(D.backupInnerRadius, D.backupInnerRadius, D.backupDepth, n, 1, true).rotateX(Math.PI / 2);
  const index = throat.index!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b);
  }
  throat.computeVertexNormals();
  P.add('gunDark', part(throat, 'backup-inner-wall'), 0, 0, T.gunLen - D.backupDepth / 2);
  P.add('gun', part(new THREE.RingGeometry(D.backupInnerRadius, D.backupOuterRadius, n), 'backup-mouth'), 0, 0, T.gunLen);
  P.add('gunDark', part(new THREE.CircleGeometry(D.backupInnerRadius, n), 'backup-backstop'), 0, 0, T.gunLen - D.backupDepth);
  P.muzzleZ = T.gunLen;
  P.physicalMuzzleBore = { outerRadiusM: D.backupOuterRadius, innerRadiusM: D.backupInnerRadius, depthM: D.backupDepth };
}

function sensorsAndHatches(P: TankBuilderPort): void {
  const n = P.q ? 24 : 12;
  P.addEquipment('turret', part(cylY(.18, .21, .10, n), 'sensor-bearing'), .23, T.roof + .04, -.10);
  P.addEquipment('turret', part(box(.31, .31, .32), 'sensor-head'), .23, T.roof + .24, -.10);
  P.addModuleVisual('optics', 'turretGlass', part(box(.21, .14, .015), 'sensor-front-window'), .23, T.roof + .27, .065);
  P.addEquipment('turret', part(box(.35, .04, .38), 'sensor-sunshade'), .23, T.roof + .405, -.08);
  // Offset moving sight sees down the bore direction beside the backup tube.
  P.addEquipment('gunMount', part(box(.24, .08, .17), 'gunner-sight-foot'), -.18, .11, .10);
  P.addEquipment('gunMount', part(box(.08, .14, .17), 'gunner-sight-stem'), -.27, .17, .10);
  P.addEquipment('gunMount', part(box(.28, .16, .26), 'gunner-sight-body'), -.27, .27, .10);
  P.addModuleVisual('optics', 'gunMountGlass', part(box(.18, .08, .015), 'gunner-sight-window'), -.27, .285, .235);
  P.addHatch('turret', part(box(.67, .055, .64), 'service-hatch'), 0, T.roof + .0175, -.91);
  for (const x of [-.23, .23]) P.addEquipment('turret', part(cylX(.045, .15, 10), 'service-hatch-hinge'), x, T.roof + .04, -1.21);
  P.addEquipment('turretDark', part(box(.23, .025, .045), 'service-hatch-handle'), 0, T.roof + .06, -.64);
  P.addEquipment('turret', part(cylY(.035, .05, .09, 10), 'antenna-base'), 0, T.roof + .015, -1.39);
  P.addEquipment('turretDark', part(cylY(.010, .010, .43, 8), 'antenna-stub'), 0, T.roof + .26, -1.39);
}

function turret(P: TankBuilderPort): void {
  armoredBody(P);
  weaponAssembly(P, () => { for (const side of [-1, 1]) pod(P, side); });
  backupCannon(P);
  sensorsAndHatches(P);
  P.topY = 1.24;
}

function buildZtz100Prototype(P: TankBuilderPort): void {
  buildZtz20Hull(P, 'ztz100_prototype');
  turret(P);
  markZtz20Hull(P);
  if (P.geometryReceipt) {
    P.hullG.userData.ztz20Receipt = ztz20Receipt('ztz100_prototype');
    P.hullG.userData.ztz100Receipt = Object.freeze({
      architecture: 'ztz100-prototype-missile-concept', datums: ZTZ100_PROTOTYPE_DATUMS, hullStations: ztz20Receipt('ztz100_prototype').hullStations,
      launcherTubesByWeapon: { 'HJ-P9 Tandem': 8, 'HJ-P9 Blast': 8 }, physicalLauncherTubes: 8,
      roadWheelsPerSide: 7, gunLengthM: T.gunLen, launcherTopM: 2.64, pivot: [0, T.pivotY, T.pivotZ], trunnion: [0, T.gunY, T.gunZ],
    });
  }
}

export const ZTZ100_PROTOTYPE_PROFILES = Object.freeze({
  ztz100_prototype: Object.freeze({ build: buildZtz100Prototype }),
}) satisfies VehicleProfileRecord;
