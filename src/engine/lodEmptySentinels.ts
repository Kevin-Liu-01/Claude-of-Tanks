import { LOD, type Object3D } from 'three';

/** Keep the native far-level visibility/hysteresis state without walking a
 * renderless sentinel every frame. Apply only to finalized live visuals:
 * authoring workers serialize their level references by child index. */
export function detachEmptyLodSentinels(root: Object3D): number {
  let detached = 0;
  root.traverse(object => {
    if (!(object instanceof LOD) || object.levels.length < 2) return;
    const sentinel = object.levels[object.levels.length - 1].object;
    if (sentinel.type !== 'Object3D' || sentinel.children.length || sentinel.name
      || Object.keys(sentinel.userData).length || sentinel.parent !== object) return;
    // Do not removeLevel: native LOD.update must retain this exact object.
    object.remove(sentinel);
    detached++;
  });
  return detached;
}
