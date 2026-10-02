// Read side of the static draw merge side table (staticDrawMerge.ts, P21).
// A merged battle/Garage draw keeps one row per folded source mesh: its name,
// userData, depth layer, own geometry and frame chain. Consumers that measure
// per mesh (rest contact, presentation floor, showroom framing) replay the
// sources through this leaf module (three and the fitting ownership registry
// only), so engine owners can read it without loading the merge builder.
import * as THREE from 'three';
import { disposeOwnedFittingGeometry } from './ownedFittingGeometry.ts';

export const STATIC_MERGE_PARTS_KEY = 'staticMergeParts';

/** Side-table row for one source mesh folded into a merged draw. */
export interface StaticMergePart {
  readonly name: string;
  readonly userData: Readonly<Record<string, unknown>>;
  readonly layer: number;
  /** The source's own geometry (positions in its own frame). */
  readonly geometry: THREE.BufferGeometry;
  /** Local matrix of the transparent LOD wrapper the source sat in, if any. */
  readonly wrapperMatrix: THREE.Matrix4 | null;
  /** The source mesh's local matrix (relative to its wrapper or owner). */
  readonly matrix: THREE.Matrix4;
  readonly vertexStart: number;
  readonly vertexCount: number;
  /** -1 for non-indexed merges. */
  readonly indexStart: number;
  readonly indexCount: number;
}

const IDENTITY = new THREE.Matrix4();
const _wrapperWorld = new THREE.Matrix4();

export function staticMergePartsOf(object: THREE.Object3D): readonly StaticMergePart[] {
  const parts = object.userData?.[STATIC_MERGE_PARTS_KEY] as readonly StaticMergePart[] | undefined;
  return Array.isArray(parts) ? parts : [];
}

/**
 * The exact world matrix the source mesh would have had: three composes
 * child.matrixWorld = parent.matrixWorld × child.matrix at each level, so
 * replay that product order from the merged mesh's unchanged owner. A merged
 * draw that kept a finite LOD switch sits inside that (identity) wrapper.
 */
export function staticMergePartMatrixWorld(
  mesh: THREE.Object3D, part: StaticMergePart, out: THREE.Matrix4,
): THREE.Matrix4 {
  const parent = mesh.parent;
  const ownerWorld = parent instanceof THREE.LOD && part.wrapperMatrix
    ? parent.parent?.matrixWorld ?? IDENTITY : parent?.matrixWorld ?? IDENTITY;
  if (part.wrapperMatrix) {
    _wrapperWorld.multiplyMatrices(ownerWorld, part.wrapperMatrix);
    return out.multiplyMatrices(_wrapperWorld, part.matrix);
  }
  return out.multiplyMatrices(ownerWorld, part.matrix);
}

/** The visual's disposal walk releases each folded source's owned fitting buffer
 * exactly once (ownedFittingGeometry.ts), as it did while the source was a mesh. */
export function releaseStaticMergeParts(mesh: THREE.Object3D): void {
  for (const part of staticMergePartsOf(mesh)) disposeOwnedFittingGeometry(part.geometry);
}

/** The folded source a raycast face of a merged draw belongs to (null for a live mesh). */
export function staticMergePartForFace(mesh: THREE.Object3D, faceIndex: number | null | undefined): StaticMergePart | null {
  if (faceIndex == null) return null;
  const corner = faceIndex * 3;
  for (const part of staticMergePartsOf(mesh)) {
    if (part.indexStart >= 0 ? corner >= part.indexStart && corner < part.indexStart + part.indexCount
      : corner >= part.vertexStart && corner < part.vertexStart + part.vertexCount) return part;
  }
  return null;
}

/** Find a source mesh by its authored name, live or folded into a merged draw. */
export function findStaticMergePart(
  root: THREE.Object3D, name: string,
): { mesh: THREE.Object3D; part: StaticMergePart | null } | null {
  let found: { mesh: THREE.Object3D; part: StaticMergePart | null } | null = null;
  root.traverse((object) => {
    if (found) return;
    const parts = staticMergePartsOf(object);
    if (!parts.length) {
      if (object.name === name) found = { mesh: object, part: null };
      return;
    }
    const part = parts.find((entry) => entry.name === name);
    if (part) found = { mesh: object, part };
  });
  return found;
}
