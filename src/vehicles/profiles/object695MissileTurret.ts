import { weaponAssembly } from './weaponStock.ts';
// First-party missile-hunter concept. No source mesh or donor
// turret is an input. The Object hull supplies the unchanged receiving ring.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { openTube } from './europeSourcePrimitives.ts';

const { cylX, cylY, cylZ } = KIT;
// Welded frame members and thin sensor casings use compact flat stock.
// The armored base retains its authored bevels and all round hardware keeps
// circular radial subdivisions selected by quality.
const box = (width: number, height: number, depth: number): THREE.BufferGeometry => new THREE.BoxGeometry(width, height, depth);
type Point = readonly [number, number, number];

export const OBJECT695_MISSILE_TURRET = Object.freeze({
  gunPivot: [0, .88, .20] as const, barrelLength: 1.35,
  baseTop: .32, podCentersX: [-1.10, 1.10] as const,
  columns: [-.285, 0, .285] as const, rows: [.25, .55] as const,
  mouthZ: .82, terminalZ: .729, rearZ: -.601, podTop: .689,
  mastTop: 1.75, physicalTubes: 12,
});

function tag(geometry: THREE.BufferGeometry, name: string): THREE.BufferGeometry {
  geometry.userData.object695Concept = name;
  return geometry;
}

function equipment(P: TankBuilderPort, bucket: string, name: string,
  geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0): void {
  P.addEquipment(bucket, tag(geometry, name), x, y, z);
}

function beam(P: TankBuilderPort, bucket: string, name: string, a: Point, b: Point, width: number, depth: number): void {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start), center = start.add(end).multiplyScalar(.5);
  const geometry = box(width, delta.length() + .014, depth).applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  equipment(P, bucket, name, geometry, center.x, center.y, center.z);
}

function rotatingBase(P: TankBuilderPort): void {
  P.add('turret', tag(cylY(.88, .88, .12, P.q ? 32 : 16), 'ring'), 0, .085, 0);
  const sections = [[-.84, .56], [-.58, .78], [.48, .70], [.87, .46]] as const;
  P.add('turret', tag(sectionSolid(sections.map(([z, width]) => ({ z,
    ring: [[-width, .12], [width, .12], [width, .24], [width - .07, .32],
      [-width + .07, .32], [-width, .24]],
  }))), 'low-base'));
  // Removable access cover and rim sit on the armored base, below the cradle.
  equipment(P, 'turret', 'service-cover', box(.46, .032, .42), 0, .334, -.46);
  for (const x of [-.18, .18]) equipment(P, 'turretDark', 'cover-hinge', box(.075, .045, .045), x, .35, -.65);
}

function fixedCradleSupports(P: TankBuilderPort): void {
  // These are receiving stations, not armor or a precomputed pass. The offline
  // articulation check traces the actual feet/towers/bearings from the low
  // armored base into the pitching crossbeam at each legal pose.
  P.turretG.userData.gunCradleSeats = { stations: [[-.47, .88, .20], [.47, .88, .20]] };
  for (const side of [-1, 1]) {
    equipment(P, 'turret', 'support-foot', box(.26, .075, .47), side * .47, .348, .16);
    equipment(P, 'turret', 'support-tower', box(.13, .54, .26), side * .47, .605, .20);
    beam(P, 'turret', 'support-brace', [side * .47, .36, -.40], [side * .47, .84, .20], .075, .085);
    equipment(P, 'turretDark', 'trunnion-bearing', cylX(.135, .24, P.q ? 16 : 12), side * .47, .88, .20);
    equipment(P, 'turret', 'bearing-cap', cylX(.093, .025, P.q ? 16 : 10), side * .602, .88, .20);
  }
}

function pitchingFrame(P: TankBuilderPort): void {
  // The two spaced yokes meet the pivot beam. There is no broad plate under
  // the launchers: the large central and fore/aft openings are physical air.
  equipment(P, 'gunMount', 'pivot-crossbeam', box(1.18, .15, .20));
  for (const side of [-1, 1]) {
    for (const z of [-.38, .48]) {
      beam(P, 'gunMount', 'pod-yoke', [side * .46, 0, 0], [side * 1.10, .095, z], .075, .09);
      equipment(P, 'gunMount', 'pod-saddle', box(.84, .055, .085), side * 1.10, .105, z);
    }
    for (const dx of [-.36, .36]) equipment(P, 'gunMount', 'pod-rail', box(.045, .055, 1.20), side * 1.10 + dx, .105, .02);
  }
}

function canister(P: TankBuilderPort, x: number, y: number): void {
  const segments = P.q ? 16 : 8;
  P.addModuleVisual('missileRack', 'gunMount', tag(cylZ(.124, 1.30, segments), 'canister-body'), x, y, .07);
  // A finite mouth collar surrounds a recessed sealed launch terminal.
  // Body cap Z.72 closes it; the thin dark seal reaches Z.729 within the open collar.
  const profile = [[.124, .66], [.139, .68], [.139, .82], [.109, .82], [.109, .715]];
  const collar = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments).rotateX(Math.PI / 2);
  // Lathe's +Y axis becomes +Z with a positive X quarter turn.
  equipment(P, 'gunMount', 'canister-mouth', collar, x, y, 0);
  equipment(P, 'gunMountDark', 'launch-terminal', cylZ(.108, .008, segments), x, y, .725);
  equipment(P, 'gunMount', 'canister-rear-cap', cylZ(.132, .034, segments), x, y, -.584);
  for (const z of [-.38, .48]) equipment(P, 'gunMount', 'canister-band', cylZ(.130, .044, segments), x, y, z);
}

function launcherPods(P: TankBuilderPort): void {
  for (const center of OBJECT695_MISSILE_TURRET.podCentersX) {
    for (const x of OBJECT695_MISSILE_TURRET.columns) for (const y of OBJECT695_MISSILE_TURRET.rows) canister(P, center + x, y);
    // Narrow corner posts and top braces link the two rows while keeping the
    // separate circular cells and the inter-cell gaps visible in both LODs.
    for (const z of [-.38, .48]) {
      for (const dx of [-.41, .41]) equipment(P, 'gunMount', 'pod-corner', box(.035, .56, .06), center + dx, .38, z);
      equipment(P, 'gunMount', 'pod-top-strap', box(.855, .032, .06), center, .66, z);
    }
    if (P.q) for (const z of [-.38, .48]) for (const dx of [-.41, .41]) {
      equipment(P, 'gunMountDark', 'strap-fastener', cylY(.021, .021, .012, 8), center + dx, .683, z);
    }
  }
}

function sensorBox(P: TankBuilderPort, name: string, center: Point, size: Point): void {
  const [x, y, z] = center, [width, height, depth] = size, wall = .026;
  for (const side of [-1, 1]) {
    equipment(P, 'turret', `${name}-side`, box(wall, height, depth), x + side * (width - wall) / 2, y, z);
    equipment(P, 'turret', `${name}-lid`, box(width, wall, depth), x, y + side * (height - wall) / 2, z);
  }
  equipment(P, 'turret', `${name}-back`, box(width, height, wall), x, y, z - (depth - wall) / 2);
  P.addModuleVisual('optics', 'turretGlass', tag(box(width - .052, height - .052, .014), name), x, y, z + depth / 2 - .034);
}

function sensors(P: TankBuilderPort): void {
  equipment(P, 'turret', 'mast-foot', box(.27, .12, .29), 0, .39, -.62);
  equipment(P, 'turret', 'mast-stem', cylY(.066, .087, 1.04, P.q ? 16 : 8), 0, .92, -.62);
  equipment(P, 'turretDark', 'mast-turntable', cylY(.145, .145, .07, P.q ? 16 : 12), 0, 1.445, -.62);
  sensorBox(P, 'panoramic-optic', [0, 1.60, -.62], [.31, .30, .30]);
  for (const side of [-1, 1]) equipment(P, 'turret', 'forward-optic-bracket', box(.16, .07, .36), side * .47, .635, .44);
  sensorBox(P, 'thermal-optic', [-.47, .76, .50], [.26, .20, .25]);
  sensorBox(P, 'rangefinder-optic', [.47, .755, .50], [.23, .19, .25]);
}

function backupCannon(P: TankBuilderPort): void {
  equipment(P, 'gunMount', 'backup-cradle', box(.22, .24, .54), 0, -.015, .10);
  P.add('gun', tag(box(.14, .17, .28), 'backup-recoiling-breech'), 0, 0, .12);
  openTube(P, .04, .24, OBJECT695_MISSILE_TURRET.barrelLength, .015);
  P.add('gun', tag(cylZ(.063, .18, P.q ? 16 : 12), 'backup-sleeve'), 0, 0, .36);
}

export function buildObject695MissileTurret(P: TankBuilderPort): void {
  P.gunG.position.set(...OBJECT695_MISSILE_TURRET.gunPivot);
  rotatingBase(P);
  weaponAssembly(P, () => { fixedCradleSupports(P); pitchingFrame(P); }, 'gun');
  weaponAssembly(P, () => launcherPods(P));
  sensors(P);
  backupCannon(P);
  P.topY = OBJECT695_MISSILE_TURRET.mastTop;
}
