// src/engine/nearVehicleShadowMerge.ts — (battle-spikes-253, the draw-count plan's step 3; the vehicles lane's
// conditions) A near hull's detail casters merged per articulation owner for the shadow pass. The nearest hulls cast
// their real armour into the cascades that cover them (nearVehicleShadowDetail.ts): 22-42 shadow draws a frame for the
// nearest at urban 7v7, 10-17 for each of the others. Those draws write depth only, so the opaque ones merge across
// materials: per owner (the detail mesh's parent, a static LOD wrapper skipped: the hull, the turret, the gun's mount
// and recoil, a roof station, a mission attachment) and per effective shadow side, in the owner's own frame, so the
// turret's yaw, the gun's elevation and its recoil cast exactly as the detail does. A merged caster carries positions
// only and stands on the shadow-only layer, under its owner only while its cascade renders.
//
// What keeps its own cast: anything cut out (alpha test, alpha or displacement maps, transparency: field nets and
// leaves, lattice and slat panels), anything instanced, skinned or morphed (the running gear), anything whose buffers a
// runtime writes, a draw with its own depth material or draw range. Each source is stamped as merged (its geometry,
// material, position version, visibility up to the hull, parent and cast flag); a stamp that no longer holds (an ERA
// block blown, a part detached or hidden by damage, a bent gun, a wreck's material swap) makes the hull cast its detail
// again until the set is rebuilt from the hull as it stands.
import {
  BufferAttribute, BufferGeometry, FrontSide, Matrix4, Mesh, MeshBasicMaterial, Vector3,
  type Material, type Object3D, type Side,
} from 'three';
import { markShadowOnly } from './renderLayers.ts';

interface SourceStamp {
  readonly mesh: Mesh;
  readonly geometry: BufferGeometry;
  readonly material: Material;
  readonly parent: Object3D;
  readonly version: number;
}

export interface MergedHullCasters {
  /** One per owner and effective shadow side, detached until its cascade renders. */
  readonly casters: readonly Mesh[];
  /** The owner each caster draws under (casters[i] under owners[i]). */
  readonly owners: readonly Object3D[];
  /** The detail meshes the casters cast for. */
  readonly covered: ReadonlySet<Object3D>;
  readonly stamps: readonly SourceStamp[];
  readonly root: Object3D;
}

const casterMaterials = new Map<string, MeshBasicMaterial>();
/** A depth-only material casting from `side` (shadowSide null: three's own mapping from side), shared by every caster. */
function casterMaterial(side: Side, shadowSide: Side | null): MeshBasicMaterial {
  const key = `${side}|${shadowSide ?? ''}`;
  let material = casterMaterials.get(key);
  if (!material) {
    material = new MeshBasicMaterial({ colorWrite: false, side });
    material.shadowSide = shadowSide;
    material.name = 'nearHullMergedCaster';
    casterMaterials.set(key, material);
  }
  return material;
}

type Castable = Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean; isSkinnedMesh?: boolean };

/** Whether a detail mesh is a real opaque caster whose depth a merged copy writes exactly. */
export function mergeableShadowSource(object: Object3D): boolean {
  const mesh = object as Castable;
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.isSkinnedMesh || !mesh.parent) return false;
  if (mesh.castShadow || mesh.customDepthMaterial || Array.isArray(mesh.material) || !mesh.material) return false;
  if (mesh.userData.fieldSuit === true || mesh.userData.vehicleFoliage === true || /Lattice|Slat/i.test(mesh.name)) return false;
  const material = mesh.material as Material & { alphaMap?: unknown; displacementMap?: unknown; wireframe?: boolean };
  if (material.transparent || material.alphaTest > 0 || material.alphaMap || material.displacementMap || material.wireframe) return false;
  if (material.clippingPlanes?.length) return false;
  const geometry = mesh.geometry;
  if (Object.keys(geometry.morphAttributes).length || mesh.morphTargetInfluences?.length) return false;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  const position = geometry.getAttribute('position') as BufferAttribute | undefined;
  if (!position || (position as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) return false;
  for (const attribute of Object.values(geometry.attributes)) {
    if ((attribute as BufferAttribute).usage !== 35044 /* StaticDrawUsage */) return false;
  }
  return true;
}

/** The owner a source casts under: its parent, past a static LOD wrapper; null when it is not under `root`. */
function ownerOf(mesh: Object3D, root: Object3D): Object3D | null {
  let owner = mesh.parent;
  while (owner && owner !== root && (owner as { isLOD?: boolean }).isLOD) owner = owner.parent;
  for (let node: Object3D | null = owner; node; node = node.parent) if (node === root) return owner;
  return null;
}

/** Whether `mesh` and every ancestor up to `root` is visible (a LOD level not shown is hidden by its LOD). */
function shownUnder(mesh: Object3D, root: Object3D): boolean {
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (node === root) return true;
    if (!node.visible) return false;
  }
  return false;
}

const _matrix = new Matrix4();
const _v = new Vector3();

/**
 * Merge `detail`'s opaque casters per owner and effective shadow side; null when fewer than two sources would share a
 * caster anywhere (nothing to save). The casters are built detached.
 */
export function buildMergedHullCasters(root: Object3D, detail: readonly Object3D[]): MergedHullCasters | null {
  const groups = new Map<string, { owner: Object3D; side: Side; shadowSide: Side | null; sources: Mesh[] }>();
  const seen = new Set<Object3D>();
  for (const object of detail) {
    // (a detail list may name a mesh twice: the static merge's swap maps several sources to one merged mesh)
    if (seen.has(object) || !mergeableShadowSource(object) || !shownUnder(object, root)) continue;
    seen.add(object);
    const mesh = object as Mesh;
    const owner = ownerOf(mesh, root);
    if (!owner) continue;
    const material = mesh.material as Material;
    const side = material.side ?? FrontSide;
    const shadowSide = material.shadowSide ?? null;
    const key = `${owner.uuid}|${side}|${shadowSide ?? ''}`;
    let group = groups.get(key);
    if (!group) groups.set(key, group = { owner, side, shadowSide, sources: [] });
    group.sources.push(mesh);
  }
  const casters: Mesh[] = [], owners: Object3D[] = [], stamps: SourceStamp[] = [];
  const covered = new Set<Object3D>();
  for (const { owner, side, shadowSide, sources } of groups.values()) {
    if (sources.length < 2) continue;
    let vertices = 0, corners = 0;
    for (const mesh of sources) {
      const geometry = mesh.geometry;
      vertices += geometry.getAttribute('position').count;
      corners += geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
    }
    const positions = new Float32Array(vertices * 3);
    const index = vertices > 65535 ? new Uint32Array(corners) : new Uint16Array(corners);
    let vertexAt = 0, cornerAt = 0;
    for (const mesh of sources) {
      // the source in the owner's frame: the product of the local matrices from the owner down (a LOD wrapper's too)
      _matrix.copy(mesh.matrix);
      for (let node = mesh.parent; node && node !== owner; node = node.parent) _matrix.premultiply(node.matrix);
      const geometry = mesh.geometry;
      const position = geometry.getAttribute('position');
      for (let v = 0; v < position.count; v++) {
        _v.fromBufferAttribute(position, v).applyMatrix4(_matrix);
        positions[(vertexAt + v) * 3] = _v.x; positions[(vertexAt + v) * 3 + 1] = _v.y; positions[(vertexAt + v) * 3 + 2] = _v.z;
      }
      // a mirroring matrix: three flips the front face for the source's draw, so the merged copy winds it back
      const mirrored = _matrix.determinant() < 0;
      const count = geometry.index ? geometry.index.count : position.count;
      for (let c = 0; c < count; c += 3) {
        const a = geometry.index ? geometry.index.getX(c) : c, b = geometry.index ? geometry.index.getX(c + 1) : c + 1;
        const d = geometry.index ? geometry.index.getX(c + 2) : c + 2;
        index[cornerAt + c] = vertexAt + a;
        index[cornerAt + c + 1] = vertexAt + (mirrored ? d : b);
        index[cornerAt + c + 2] = vertexAt + (mirrored ? b : d);
      }
      vertexAt += position.count; cornerAt += count;
      covered.add(mesh);
      stamps.push({ mesh, geometry, material: mesh.material as Material, parent: mesh.parent!, version: (position as BufferAttribute).version });
    }
    const merged = new BufferGeometry();
    merged.setAttribute('position', new BufferAttribute(positions, 3));
    merged.setIndex(new BufferAttribute(index, 1));
    merged.computeBoundingSphere();
    const caster = markShadowOnly(new Mesh(merged, casterMaterial(side, shadowSide)));
    caster.name = 'nearHullMergedCaster';
    caster.castShadow = true;
    caster.receiveShadow = false;
    caster.matrixAutoUpdate = false;
    caster.matrixWorldAutoUpdate = false;
    caster.userData.nearHullMergedCaster = true;
    casters.push(caster);
    owners.push(owner);
  }
  return casters.length ? { casters, owners, covered, stamps, root } : null;
}

/** Whether every source still stands as it was merged (else the hull casts its detail until the set is rebuilt). */
export function mergedHullCastersHold(merged: MergedHullCasters): boolean {
  for (const stamp of merged.stamps) {
    const mesh = stamp.mesh;
    if (mesh.geometry !== stamp.geometry || mesh.material !== stamp.material || mesh.parent !== stamp.parent || mesh.castShadow) return false;
    if ((mesh.geometry.getAttribute('position') as BufferAttribute).version !== stamp.version || !shownUnder(mesh, merged.root)) return false;
  }
  return true;
}

/** Attach each caster under its owner for one cascade's render, its world matrix the owner's. */
export function attachMergedHullCasters(merged: MergedHullCasters): void {
  for (let i = 0; i < merged.casters.length; i++) {
    const caster = merged.casters[i], owner = merged.owners[i];
    owner.add(caster);
    caster.matrixWorld.copy(owner.matrixWorld);
  }
}

export function detachMergedHullCasters(merged: MergedHullCasters): void {
  for (const caster of merged.casters) caster.removeFromParent();
}

export function disposeMergedHullCasters(merged: MergedHullCasters): void {
  detachMergedHullCasters(merged);
  for (const caster of merged.casters) caster.geometry.dispose();
}
