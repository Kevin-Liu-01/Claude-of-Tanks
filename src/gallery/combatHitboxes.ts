import * as THREE from 'three';
import type { AnatomyResource, AnatomyVolumePort, InternalArmorModelPort } from '../vehicles/internalAnatomyVisuals.ts';

type Shape = NonNullable<AnatomyVolumePort['shapes']>[number];
export interface HitboxArmor extends InternalArmorModelPort {
  trackShapes?: readonly { x0: number; x1: number; poly: readonly (readonly [number, number])[]; module: string }[];
}

function boxGeometry(min: readonly number[], max: readonly number[]): THREE.BufferGeometry {
  return new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    .translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
}

function shapeGeometry(shape: Shape): THREE.BufferGeometry {
  if (shape.kind === 'ellipsoid') return new THREE.SphereGeometry(1, 24, 16)
    .scale(...shape.radii).translate(...shape.center);
  if (shape.kind === 'ellipticCylinder') {
    const geometry = new THREE.CylinderGeometry(1, 1, shape.halfLength * 2, 32);
    geometry.scale(shape.radii[0], 1, shape.radii[1]);
    if (shape.axis === 0) geometry.rotateZ(-Math.PI / 2);
    if (shape.axis === 2) geometry.rotateX(Math.PI / 2);
    // Perpendicular radii are indexed by ascending coordinate axis in armor.ts.
    return geometry.translate(...shape.center);
  }
  const start = new THREE.Vector3(...shape.a), end = new THREE.Vector3(...shape.b);
  const delta = end.clone().sub(start), length = delta.length();
  const geometry = new THREE.CapsuleGeometry(shape.radius, length, 8, 16);
  if (length > 0) geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.divideScalar(length)));
  return geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
}

function volumeGeometries(volume: AnatomyVolumePort): THREE.BufferGeometry[] {
  if (volume.shapes?.length) return volume.shapes.map(shapeGeometry);
  if (volume.parts?.length) return volume.parts.map(part => boxGeometry(part.min, part.max));
  return [boxGeometry(volume.min, volume.max)];
}

/** Keep combat coordinates independent of presentation-only turret/weapon scaling. */
export function createCombatFrames(root: THREE.Object3D, armor: HitboxArmor) {
  const hull = new THREE.Group(), turret = new THREE.Group(), trunnion = new THREE.Group(), gun = new THREE.Group();
  root.add(hull); hull.add(turret); turret.add(trunnion); trunnion.add(gun);
  turret.position.fromArray(armor.turretPivot || [0, 0, 0]);
  trunnion.position.fromArray(armor.gunPivot || [0, 0, 0]);
  gun.position.copy(trunnion.position).negate();
  const turretRig = root.getObjectByName('rig_turret'), gunRig = root.getObjectByName('rig_gun');
  function update(): void {
    turret.rotation.y = turretRig?.rotation.y || 0;
    trunnion.rotation.x = gunRig?.rotation.x || 0;
  }
  update();
  return { hull, turret, gun, update };
}

/** True combat primitives, including compound shapes, not enclosing visual-model boxes. */
export function addCombatHitboxes(
  mode: 'modules' | 'crew', armor: HitboxArmor, hull: THREE.Object3D, turret: THREE.Object3D,
  gun: THREE.Object3D | undefined, resources: AnatomyResource[], pickables: THREE.Mesh[],
): void {
  let roofFrame: THREE.Group | undefined;
  if (armor.roofGun) {
    const mount = armor.roofGun, frame = new THREE.Group();
    frame.position.fromArray(mount.position); frame.quaternion.fromArray(mount.rotation); frame.scale.fromArray(mount.scale);
    roofFrame = new THREE.Group(); roofFrame.position.fromArray(mount.pivot);
    frame.add(roofFrame); (mount.owner === 'turret' ? turret : hull).add(frame);
  }
  function add(geometry: THREE.BufferGeometry, volume: AnatomyVolumePort, index: number): void {
    const key = mode === 'modules' ? volume.module : volume.crew;
    const material = new THREE.MeshBasicMaterial({ color: mode === 'modules' ? 0xe9a346 : 0x64cfdb, transparent: true, opacity: .15, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `gallery_hitbox_${mode}_${key}_${index}`;
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    mesh.userData.inspection = { mode, id: key, title: key, module: volume.module, crew: volume.crew, hitbox: true,
      owner: volume.roofGunFollow ? 'Roof weapon' : volume.gunFollow ? 'Gun' : volume.turretLocal ? 'Turret' : 'Hull',
      dimensionsM: size.toArray().map(value => +value.toFixed(3)) };
    const parent = volume.roofGunFollow && roofFrame ? roofFrame : volume.gunFollow && gun ? gun : volume.turretLocal ? turret : hull;
    parent.add(mesh); pickables.push(mesh); resources.push(geometry, material);
    const edges = new THREE.EdgesGeometry(geometry, 12), lineMaterial = new THREE.LineBasicMaterial({ color: material.color, depthTest: false, transparent: true, opacity: .8 });
    const lines = new THREE.LineSegments(edges, lineMaterial); lines.raycast = () => {}; mesh.add(lines);
    resources.push(edges, lineMaterial);
  }
  const volumes = mode === 'modules' ? armor.modules || [] : armor.crew || [];
  const tracks = mode === 'modules' ? armor.trackShapes || [] : [];
  for (const volume of volumes) {
    if (tracks.some(track => track.module === volume.module)) continue;
    volumeGeometries(volume).forEach((geometry, index) => add(geometry, volume, index));
  }
  for (const [index, track] of tracks.entries()) {
    const shape = new THREE.Shape();
    track.poly.forEach(([y, z], i) => i ? shape.lineTo(z, y) : shape.moveTo(z, y));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: track.x1 - track.x0, bevelEnabled: false, steps: 1 });
    // Extrusion (z,y,x) -> tank-local (x,y,z), preserving actual track prism gaps.
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) position.setXYZ(i, position.getZ(i) + track.x0, position.getY(i), position.getX(i));
    geometry.computeVertexNormals();
    add(geometry, { module: track.module, min: [0, 0, 0], max: [0, 0, 0] }, index);
  }
}
