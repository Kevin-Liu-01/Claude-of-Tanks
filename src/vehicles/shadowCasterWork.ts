import * as THREE from 'three';

interface ShadowCasterWork {
  /** Near-detail submissions, before light-frustum culling. Not frame timing. */
  readonly lod: 'near';
  readonly cameraLayerMask: number;
  readonly draws: number;
  readonly triangles: number;
}

/** Measure the actual casting meshes before the factory replaces them.
 * Construction support meshes are only a sparse subset of that workload.
 * This diagnostic never changes visibility, LOD state or shadow flags. */
export function measureNearShadowCasterWork(
  roots: readonly THREE.Object3D[], cameraLayerMask = 1,
): ShadowCasterWork {
  let draws = 0;
  let triangles = 0;
  const visited = new Set<THREE.Object3D>();
  const visit = (object: THREE.Object3D, selectedLod = false): void => {
    if (visited.has(object) || (!object.visible && !selectedLod)) return;
    visited.add(object);
    if (object instanceof THREE.Mesh && object.castShadow && (object.layers.mask & cameraLayerMask) !== 0) {
      const work = measureMeshSubmissions(object);
      draws += work.draws;
      triangles += work.triangles;
    }
    if (object instanceof THREE.LOD && object.levels.length) {
      const near = object.levels[0].object;
      const levels = new Set(object.levels.map(level => level.object));
      if (levels.size !== object.levels.length) {
        throw new Error('Shadow workload needs distinct LOD level objects');
      }
      for (const child of object.children) {
        if (child === near) visit(child, true);
        else if (!levels.has(child)) visit(child);
      }
    } else {
      for (const child of object.children) visit(child);
    }
  };
  const rootSet = new Set(roots);
  for (const root of rootSet) {
    let current: THREE.Object3D | null = root;
    let visible = true;
    while (current) {
      const parent: THREE.Object3D | null = current.parent;
      if (parent instanceof THREE.LOD
        && new Set(parent.levels.map(entry => entry.object)).size !== parent.levels.length) {
        throw new Error('Shadow workload needs distinct LOD level objects');
      }
      const level = parent instanceof THREE.LOD
        ? parent.levels.find(entry => entry.object === current) : undefined;
      if ((current !== root && rootSet.has(current))
        || (level ? level !== (parent as THREE.LOD).levels[0] : !current.visible)) {
        visible = false;
        break;
      }
      current = parent;
    }
    if (visible) visit(root, true);
  }
  return Object.freeze({ lod: 'near', cameraLayerMask, draws, triangles });
}

/** One eligible mesh contributes its real clipped material submissions. */
function measureMeshSubmissions(object: THREE.Mesh): { draws: number; triangles: number } {
  let draws = 0;
  let triangles = 0;
  if ('isBatchedMesh' in object && object.isBatchedMesh) {
    throw new Error('Shadow workload needs explicit batched-mesh submission accounting');
  }
  const geometry = object.geometry;
  const available = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  const rangeStart = Math.max(0, geometry.drawRange.start);
  const rangeEnd = Math.min(available, geometry.drawRange.start + geometry.drawRange.count);
  const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
  if (object instanceof THREE.InstancedMesh
    && (!Number.isInteger(instances) || instances < 0 || instances > object.instanceMatrix.count)) {
    throw new Error('Shadow workload needs a valid active instance count');
  }
  const add = (material: THREE.Material | undefined, start: number, count: number): void => {
    if (!material?.visible || instances <= 0) return;
    if ('wireframe' in material && material.wireframe) {
      throw new Error('Shadow workload does not treat wireframe lines as triangles');
    }
    const vertices = Math.max(0, Math.min(rangeEnd, start + count) - Math.max(rangeStart, start));
    if (vertices < 3) return;
    draws++;
    triangles += Math.floor(vertices / 3) * instances;
  };
  if (Array.isArray(object.material)) {
    for (const group of geometry.groups) add(object.material[group.materialIndex ?? 0], group.start, group.count);
  } else {
    add(object.material, 0, available);
  }
  return { draws, triangles };
}
