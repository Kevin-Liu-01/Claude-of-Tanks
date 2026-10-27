// 235 (gun-barrel alignment, class 2): a builder that squashes its turret does it on rig_turret itself, non-uniformly,
// and counter-scales rig_gun so the tube stays round at rest (the T-90AM and T-90M Proryv 0.95 x 0.65 x 0.913, the
// Strv 81, the Merkava 1B to 4B, the FV510 pair, the Challenger 1 and 2 lines). rig_gun then pitched inside a
// non-uniform frame: the drawn tube sheared and laid a smaller angle than the sim (14 deg drew as 10 on the T-90AM), and
// every measure taken in the rig_turret frame read the turret at 1/scale (the combat anatomy's turret cells: the T-90AM
// hit shell 2.30 m tall over a 1.49 m drawn turret).
//
// Once the visual is complete the squash moves one level down. Each child of rig_turret takes it into its own transform:
// its position times the squash, its rotation kept (Euler untouched), the squash seen through that rotation times its
// own scale; a rest rotation that would shear under the squash cannot, so that child is wrapped in a section group that
// carries it. rig_gun takes its trunnion at the squashed seat and the squash times its own scale, which is 1 wherever
// the builder counter-scaled it, so the gun pitches rigidly about the drawn trunnion. A remote roof station pitches its
// own barrel the same way (259): its seat takes the squash and its scale the squashed width on every axis, so the
// authority's roof frame lays the profile's elevation (the station stands at its width instead of the casting's height).
// rig_turret is left at scale 1 and every other world vertex at rest stays where it was. Pure Three.js: no factory state.
import * as THREE from 'three';

/** The squash a non-uniform rig_turret carried, now on its children (rig_turret.userData.turretSectionScale). */
export interface TurretSectionScale {
  readonly scale: readonly [number, number, number];
  /** The local matrix every part that sat at rig_turret's identity frame now carries. */
  readonly frame: THREE.Matrix4;
  /** Children that could not take the squash themselves and sit in a section group. */
  readonly wrapped: readonly string[];
}

/** rig_turret.userData key: the squash baked onto its children (tools and the static merge read it). */
export const TURRET_SECTION_SCALE_KEY = 'turretSectionScale';

const UNIFORM_EPS = 1e-6, DIAGONAL_EPS = 1e-9;

/** The squash a baked rig_turret left on its children, or null (TURRET_SECTION_SCALE_KEY). */
export function turretSectionScaleOf(owner: THREE.Object3D): readonly [number, number, number] | null {
  return (owner.userData[TURRET_SECTION_SCALE_KEY] as readonly [number, number, number] | undefined) ?? null;
}

/** Whether `matrix` is exactly that squash: the frame every part that sat at rig_turret's identity now carries. */
export function isTurretSectionFrame(owner: THREE.Object3D, matrix: THREE.Matrix4): boolean {
  const scale = turretSectionScaleOf(owner);
  if (!scale) return false;
  const e = matrix.elements;
  return e[0] === scale[0] && e[1] === 0 && e[2] === 0 && e[3] === 0
    && e[4] === 0 && e[5] === scale[1] && e[6] === 0 && e[7] === 0
    && e[8] === 0 && e[9] === 0 && e[10] === scale[2] && e[11] === 0
    && e[12] === 0 && e[13] === 0 && e[14] === 0 && e[15] === 1;
}

/**
 * `object`'s local matrix in the frame the factory placed it in, before the bake: under a squashed rig_turret. Null when
 * no squash was baked over it (its own matrix is that frame). A generator that writes a turret-local seat the factory
 * applies before the bake (the marking seats) reads it here: a section group's child kept its matrix, any other child
 * took the squash into its own.
 */
export function preBakeLocalMatrix(object: THREE.Object3D): THREE.Matrix4 | null {
  const parent = object.parent;
  if (!parent || parent.userData.turretSection) return null;
  const scale = turretSectionScaleOf(parent);
  if (!scale) return null;
  object.updateMatrix();
  return new THREE.Matrix4().makeScale(1 / scale[0], 1 / scale[1], 1 / scale[2]).multiply(object.matrix);
}

const _rotation = new THREE.Matrix4(), _composed = new THREE.Matrix4();

/** The squash seen through `object`'s rest rotation, when that stays axis-aligned (else null): Rᵀ·S·R's diagonal. */
function squashThrough(object: THREE.Object3D, squash: THREE.Vector3): THREE.Vector3 | null {
  const r = _rotation.makeRotationFromQuaternion(object.quaternion).elements;
  const s = [squash.x, squash.y, squash.z];
  const d = new THREE.Vector3();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let v = 0;
    for (let k = 0; k < 3; k++) v += r[i * 4 + k] * s[k] * r[j * 4 + k];
    if (i === j) d.setComponent(i, v);
    else if (Math.abs(v) > DIAGONAL_EPS) return null;
  }
  return d;
}

/** Whether `object`'s local matrix is its position, rotation and scale (a matrix placed by hand cannot take the squash). */
function composedFromTransform(object: THREE.Object3D): boolean {
  if (object.matrixAutoUpdate) return true;
  _composed.compose(object.position, object.quaternion, object.scale);
  const a = _composed.elements, b = object.matrix.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > DIAGONAL_EPS * (1 + Math.abs(b[i]))) return false;
  return true;
}

/** S·T(p)·R·Sc(c) = T(S∘p)·R·Sc(d∘c) when Rᵀ·S·R is the diagonal d. A rigid child keeps d∘c's width on every axis. */
function takeSquash(object: THREE.Object3D, squash: THREE.Vector3, rigid = false): boolean {
  const through = composedFromTransform(object) ? squashThrough(object, squash) : null;
  if (!through) return false;
  object.position.multiply(squash);
  object.scale.multiply(through);
  if (rigid) object.scale.setScalar(object.scale.x);
  if (!object.matrixAutoUpdate) object.updateMatrix();
  return true;
}

/** A remote roof station the authority lays (vehicle-controls-inventory's roof guns): it pitches its own barrel. */
function isRoofStation(object: THREE.Object3D): boolean {
  const data = object.userData;
  return data.remoteControlled === true && data.firingAxis === '+Z' && !data.primaryWeapon && data.hasWeapon !== false;
}

/**
 * Move a non-uniform rig_turret scale onto its children and rig_gun (see the file note). A uniform scale (a whole
 * vehicle scaled) is left as it is: the gun pitches rigidly under it. Returns null when there was nothing to bake, or
 * when rig_gun's own rest rotation would shear under the squash (the tank keeps its old rig).
 */
export function bakeTurretRigScale(turretG: THREE.Object3D, gunG: THREE.Object3D): TurretSectionScale | null {
  const squash = turretG.scale.clone();
  if (Math.max(squash.x, squash.y, squash.z) - Math.min(squash.x, squash.y, squash.z) <= UNIFORM_EPS) return null;
  if (gunG.parent !== turretG || !squashThrough(gunG, squash) || !composedFromTransform(gunG)) return null;
  const wrapped: string[] = [];
  for (const child of [...turretG.children]) {
    // a vehicle marking keeps the seat its solver recorded (vehicleMarkingSeatGroups): it takes a section, never the
    // squash (243: strv81's sideways insignia took it, its local seat no longer the generated one)
    // a roof station pitches inside its own frame, as rig_gun does, so it takes the squash rigidly (259: under the
    // squash the Challenger 2's 43 deg laid 52.5 and the Merkavas' 36-39; the Challenger 1's builder counter-scales
    // its L37s, which stand at 1 either way)
    if (child === gunG || (child.userData.vehicleMarking !== true && takeSquash(child, squash, isRoofStation(child)))) continue;
    // keeps the child's place among its siblings: the coplanar depth layers follow the traversal order
    const section = new THREE.Group();
    section.name = `turretSection_${child.name || child.type}`;
    section.userData.turretSection = true;
    section.scale.copy(squash);
    const at = turretG.children.indexOf(child);
    section.add(child);
    turretG.children.splice(at, 0, section);
    section.parent = turretG;
    section.dispatchEvent({ type: 'added' });
    wrapped.push(child.name || child.type);
  }
  takeSquash(gunG, squash);
  turretG.scale.set(1, 1, 1);
  const scale = [squash.x, squash.y, squash.z] as const;
  turretG.userData[TURRET_SECTION_SCALE_KEY] = scale;
  turretG.updateMatrixWorld(true);
  return { scale, frame: new THREE.Matrix4().makeScale(squash.x, squash.y, squash.z), wrapped };
}
