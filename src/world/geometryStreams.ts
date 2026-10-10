// src/world/geometryStreams.ts — geometry built fresh instead of trimmed (the map-vehicles lane, hold 6, 2026-10-06).
//
// three's BufferGeometry.deleteAttribute deletes a key from the geometry's attributes object, which drops that object
// to V8's dictionary mode. Three's renderer walks every drawn geometry's attributes with for...in each frame
// (WebGLGeometries.update); one dictionary-mode object drawn every frame leaves that loop megamorphic for every geometry
// in the scene — about +1 ms of CPU a frame at Cinder Junction and Glacier Pass. A geometry the renderer draws directly
// (an instanced pool's geometry, a shadow stand-in, a moored hull, a tree's cards) is built with keepStreams instead; a
// temporary that is merged into a fresh geometry (mergeGeometries, mergeVertices) may still drop keys.
// drawnGeometryShape.selftest (every map and garage) and the fleet pass (fleetPassHigh, every tank) hold every drawn
// geometry to fast properties (geometryStreams.test-support.mjs).

import * as THREE from 'three';

/** A geometry holding only `names` of `source`'s streams (shared, not copied), its index, groups and userData. */
export function keepStreams(source: THREE.BufferGeometry, names: readonly string[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const attribute = source.getAttribute(name);
    if (attribute) out.setAttribute(name, attribute);
  }
  if (source.index) out.setIndex(source.index);
  for (const group of source.groups) out.addGroup(group.start, group.count, group.materialIndex);
  out.userData = source.userData;
  return out;
}
