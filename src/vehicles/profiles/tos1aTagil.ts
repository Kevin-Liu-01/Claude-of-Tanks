// First-party T-90MS-based game concept. The supplied photograph guides the
// large 24-cell battery, not a historical or production TOS-1A claim.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { TOS1A_TAGIL_LAYOUT as D, TOS1A_TAGIL_LAUNCHER_MUZZLES as MUZZLES, TOS1A_TAGIL_PACK_CONTOUR } from '../tos1aTagilLayout.ts';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { buildT90MSXChassis } from './t90msX.ts';

const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const { cylX, cylY, cylZ } = KIT;
type Point = readonly [number, number, number];
function stock(geometry: THREE.BufferGeometry, name: string): THREE.BufferGeometry {
  geometry.userData.tos1aTagil = name;
  return geometry;
}
function fitting(P: TankBuilderPort, bucket: string, name: string, geometry: THREE.BufferGeometry,
  x = 0, y = 0, z = 0): void {
  P.addEquipment(bucket, stock(geometry, name), x, y, z);
}

function rotatingPlatform(P: TankBuilderPort): void {
  // Bottom overlaps the actual donor bearing by 15 mm. The broad plinth is a
  // shallow load distributor, not a solid box filling the space below the pack.
  P.add('turret', stock(cylY(1.20, 1.20, .08, P.q ? 48 : 16), 'yaw-bearing'), 0, .025, 0);
  const sections = [[-1.63, 1.54, .08], [-1.40, 1.75, .22], [.67, 1.75, .22], [.95, 1.42, .22]] as const;
  P.add('turret', stock(sectionSolid(sections.map(([z, half, roof]) => ({ z,
    ring: [[-half, .05], [half, .05], [half, roof - .02], [half - .055, roof], [-half + .055, roof], [-half, roof - .02]],
  }))), 'load-platform'));
  P.addModuleVisual('gun', 'turretDetail', stock(box(.28, .17, .38), 'traverse-drive'), .91, .275, .26);
  fitting(P, 'turretDark', 'drive-cover', cylY(.115, .115, .036, P.q ? 20 : 8), .91, .369, .26);
  fitting(P, 'turretDetail', 'service-lid', box(.58, .035, .40), 0, .231, .61);
  if (P.q) for (const x of [-.20, .20]) fitting(P, 'turretDark', 'service-hinge', cylX(.025, .13, 8), x, .26, .405);
}

function cradle(P: TankBuilderPort): void {
  P.turretG.userData.gunCradleSeats = { stations: [[-1.63, 1.30, -1.30], [1.63, 1.30, -1.30]] };
  for (const side of [-1, 1]) {
    const x = side * 1.63;
    fitting(P, 'turret', 'cradle-foot', box(.24, .09, .49), x, .246, -1.27);
    fitting(P, 'turret', 'cradle-tower', box(.14, 1.07, .22), x, .745, -1.30);
    fitting(P, 'turret', 'cradle-brace', beamBetween([side * 1.72, .25, -.37], [side * 1.72, 1.30, -1.30], .055, P.q ? 12 : 8), 0, 0, 0);
    fitting(P, 'turretDark', 'fixed-trunnion', cylX(.225, .27, P.q ? 24 : 12), x, 1.30, -1.30);
    fitting(P, 'turretDetail', 'bearing-cover', cylX(.174, .035, P.q ? 24 : 12), side * 1.778, 1.30, -1.30);
    if (P.q) fitting(P, 'turretDark', 'bearing-boss', cylX(.072, .046, P.q ? 16 : 8), side * 1.806, 1.30, -1.30);
    // Coaxial closed stock is the real pitch joint. No rigid fake piston spans
    // the rotating interface, and no detached rod is used to imply contact.
    P.add('gunMount', stock(cylX(.182, .35, P.q ? 24 : 12), 'pitch-pin'), side * 1.51, 0, 0);
    if (P.q) for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      fitting(P, 'turretDark', 'bearing-bolt', cylX(.017, .024, 6), side * 1.800,
        1.30 + Math.sin(angle) * .137, -1.30 + Math.cos(angle) * .137);
    }
  }
}

function packContour(inset = 0): THREE.Vector2[] {
  return TOS1A_TAGIL_PACK_CONTOUR.map(([x, y]) => new THREE.Vector2(
    x - Math.sign(x) * inset, y - Math.sign(y) * inset));
}
function extrusion(shape: THREE.Shape, start: number, end: number, segments = 8): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth: end - start, bevelEnabled: false, steps: 1, curveSegments: segments }).translate(0, 0, start);
}
function shell(P: TankBuilderPort): void {
  const skin = new THREE.Shape(packContour());
  skin.holes.push(new THREE.Path(packContour(.035).reverse()));
  P.add('gunMount', stock(extrusion(skin, -1, D.skinFrontZ), 'pack-skin'));
  P.add('gunMount', stock(extrusion(new THREE.Shape(packContour()), -1, -.965), 'back-plate'));
  // One finite inner backing sheet seats every tube at the same deep terminal.
  fitting(P, 'gunMountDark', 'breech-floor', box(2.94, 1.08, .027), 0, 0, -.9535);
  const front = new THREE.Shape(packContour());
  for (const { x, y } of MUZZLES) {
    const hole = new THREE.Path(); hole.absarc(x, y, .156, 0, Math.PI * 2, true); front.holes.push(hole);
  }
  P.add('gunMount', stock(extrusion(front, 2.50, D.skinFrontZ, P.q ? 8 : 2), 'perforated-front'));
}

function launchCell(P: TankBuilderPort, axis: typeof MUZZLES[number]): void {
  const n = P.q ? 20 : 12;
  // Closed annular material surrounds a genuinely open, deep launch mouth.
  // A separate dark breech face closes the rear, so there is no painted hole.
  const profile = [[.17, -.985], [.17, 2.60], [.11, 2.60], [.11, -.94], [.17, -.985]];
  const tube = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), n).rotateX(Math.PI / 2);
  // Partition the existing triangles, retaining their exact positions/normals.
  // Segment 2 is the inward cylindrical wall: unpainted dark metal, not camo.
  // Together these two material surfaces remain one closed annular stock.
  const liner = tube.clone(), painted: number[] = [], inward: number[] = [];
  const indices = tube.index!.array;
  for (let sector = 0; sector < n; sector++) for (let segment = 0; segment < 4; segment++) {
    const offset = (sector * 4 + segment) * 6;
    (segment === 2 ? inward : painted).push(...indices.slice(offset, offset + 6));
  }
  tube.setIndex(painted); liner.setIndex(inward);
  P.addModuleVisual('missileRack', 'gunMount', stock(tube, 'launch-cell'), axis.x, axis.y, 0);
  P.add('gunMountDark', stock(liner, 'launch-cell-liner'), axis.x, axis.y, 0);
}
function packSideRibs(P: TankBuilderPort, side: number): void {
  // Side ribs follow the thin wall without closing the air beneath the pack.
  for (const z of P.q ? [-.76, .30, 1.45, 2.28] : [-.76, 2.28]) {
    fitting(P, 'gunMount', 'side-rib', box(.030, .78, .055), side * 1.558, 0, z);
    if (P.q) for (const y of [-.35, .35]) fitting(P, 'gunMountDark', 'latch', box(.041, .082, .105), side * 1.576, y, z);
  }
}
function packSideAccess(P: TankBuilderPort, side: number): void {
  if (P.q) fitting(P, 'gunMountDark', 'side-access-rim', cylX(.146, .025, P.q ? 24 : 12), side * 1.56, .09, -.52);
  fitting(P, 'gunMount', 'side-access-cover', cylX(P.q ? .122 : .146, P.q ? .033 : .07, P.q ? 24 : 12), side * (P.q ? 1.583 : 1.57), .09, -.52);
}
function packLiftingEyes(P: TankBuilderPort, side: number): void {
  for (const z of [-.74, 2.30]) {
    fitting(P, 'gunMountDark', 'lifting-foot', box(.075, .035, .11), side * 1.565, .42, z);
    fitting(P, 'gunMountDark', 'lifting-eye', KIT.torus(.052, .013, P.q ? 6 : 3, P.q ? 16 : 8).rotateY(Math.PI / 2), side * 1.608, .47, z);
  }
}
function packFittings(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    packSideRibs(P, side); packSideAccess(P, side); packLiftingEyes(P, side);
  }
  for (const x of P.q ? [-1.09, 0, 1.09] : [0]) fitting(P, 'gunMount', 'rear-hinge', cylX(.035, .22, P.q ? 12 : 8), x, -.51, -1.025);
}

function sight(P: TankBuilderPort, center: Point, size: Point, name: string): void {
  const [x, y, z] = center, [w, h, d] = size;
  fitting(P, 'turret', `${name}-case`, box(w, h, d), x, y, z);
  P.addModuleVisual('optics', 'turretGlass', stock(box(w * .68, h * .56, .012), name), x, y, z + d / 2 + .003);
  fitting(P, 'turretDark', `${name}-visor`, box(w + .025, .025, .075), x, y + h / 2, z + d / 2 - .01);
}
function sights(P: TankBuilderPort): void {
  fitting(P, 'turret', 'optic-pedestal', box(.40, .18, .32), .35, .31, .53);
  sight(P, [.35, .41, .53], [.32, .16, .27], 'aiming-optic');
  for (const side of [-1, 1]) {
    fitting(P, 'turret', 'navigation-foot', box(.22, .095, .28), side * .71, .247, .64);
    sight(P, [side * .71, .352, .67], [.21, .14, .23], side < 0 ? 'thermal-optic' : 'rangefinder-optic');
  }
}

function roofMachineGun(P: TankBuilderPort): void {
  // A small game-equipment station remains outside the pack sweep. It shares
  // the yaw platform and has a continuous pedestal/receiver/barrel assembly.
  fitting(P, 'turret', 'mg-foot', box(.22, .075, .27), -1.64, .246, .43);
  fitting(P, 'turretDark', 'mg-pedestal', cylY(.046, .064, .49, P.q ? 16 : 8), -1.64, .512, .43);
  const mg = sourceMachineGun(P, [0, 0, 0]);
  mg.add('turretDark', box(.094, .11, .24), -1.64, .805, .43);
  mg.add('turretDark', blindTube(.019, .004, .63, .10, P.q ? 16 : 10), -1.64, .826, .835);
  mg.add('turretDark', cylZ(.013, .30, P.q ? 12 : 8), -1.64, .792, .67);
  mg.add('turretDetail', box(.085, .14, .15), -1.723, .78, .42);
  mg.add('turretDark', box(.086, .040, .10), -1.682, .806, .43);
  mg.add('turretDark', box(.032, .14, .042), -1.64, .754, .304);
  mg.finish();
}

function retainStructuralPresentation(P: TankBuilderPort): void {
  const previous = P.postAssemble;
  P.postAssemble = rig => {
    previous?.(rig);
    // These existing buckets contain permanent side armor/cages, the actual
    // load-bearing cradle, sights and sleeve interiors. They are not optional
    // distance details on this battery. The donor's own LOD policy is untouched.
    for (const name of ['hullDetail', 'hullExternalArmor', 'hullDark',
      'turretEquipment', 'turretDetail', 'turretDark', 'turretGlass', 'gunMountDark']) {
      const mesh = rig.root.getObjectByName(name), wrapper = mesh?.parent;
      if (!(mesh instanceof THREE.Mesh) || !(wrapper instanceof THREE.LOD) || !wrapper.parent)
        throw new Error(`TOS permanent stock ${name} requires its expected detail wrapper`);
      if (!wrapper.matrix.equals(new THREE.Matrix4()) || wrapper.levels.some(level =>
        level.object !== mesh && (level.object instanceof THREE.Mesh || level.object.children.length)))
        throw new Error(`TOS unexpected transformed or populated detail wrapper for ${name}`);
      const owner = wrapper.parent, index = owner.children.indexOf(wrapper);
      wrapper.remove(mesh); wrapper.levels.length = 0; wrapper.clear(); wrapper.removeFromParent();
      owner.add(mesh);
      // Retain traversal/batching order along with every mesh transform.
      owner.children.splice(index, 0, owner.children.pop()!);
      mesh.visible = true;
    }
  };
}

export function buildTos1aTagil(P: TankBuilderPort): void {
  buildT90MSXChassis(P);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(...D.gunPivot);
  rotatingPlatform(P); cradle(P); shell(P);
  for (const muzzle of MUZZLES) launchCell(P, muzzle);
  packFittings(P); sights(P); roofMachineGun(P);
  retainStructuralPresentation(P);
  P.muzzleZ = D.mouthZ;
  P.topY = D.gunPivot[1] + .61;
}
export const TOS1A_TAGIL_PROFILES = { tos1a_tagil: { build: buildTos1aTagil } } as const;
