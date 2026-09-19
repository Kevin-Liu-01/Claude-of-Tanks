import { Box3, Triangle, Vector3 } from 'three';

// Narrow diagnostic proof, not a replacement collision detector. The caller
// supplies current world matrices. Uncertain input keeps the original failure.
// Exact-coordinate welding deliberately refuses nearly closed/open seams.
const EXPANSION_M = 1e-6;
const unsupported = (reason) => ({ separated: false, reason });

function closedStock(mesh) {
  const { matrix, position, index, count } = validateClosedStock(mesh);
  const { vertices, welds } = weldWorldVertices(position, matrix);
  const triangles = closedTriangles(position, index, count, vertices, welds);

  // Edge connectivity keeps separate closed shells separate even when their
  // vertices touch. A witness on one shell must never excuse another shell.
  const components = closedComponents(triangles, vertices);
  if (!components.length) throw new Error('empty-component-stock');
  return { triangles: triangles.map(t => t.triangle), components, vertices: vertices.length };
}

/**
 * Prove whole-mesh stock separation conservatively. A positive result requires
 * closed oriented components, no candidate triangle touching any expanded band
 * triangle AABB, and a vertex outside the other's expanded full AABB in BOTH
 * directions for every component pair. The last condition excludes containment.
 * Passing says nothing about other candidate meshes or moving shoe geometry.
 */
export function provesClosedMeshSeparation(candidateMesh, bandMeshes) {
  if (!Array.isArray(bandMeshes) || !bandMeshes.length || new Set(bandMeshes).size !== bandMeshes.length)
    return unsupported('missing-or-duplicate-band-stock');
  let candidate, bands;
  try { candidate = closedStock(candidateMesh); bands = bandMeshes.map(closedStock); }
  catch (error) { return unsupported(error.message); }
  const components = {
    candidate: candidate.components.map(c => ({ triangles: c.triangleIndices.length,
      vertices: c.points.length, bounds: [c.bounds.min.toArray(), c.bounds.max.toArray()], signedVolume: c.signedVolume })),
    bands: bands.map((b, i) => ({ name: bandMeshes[i].name,
      components: b.components.map(c => ({ triangles: c.triangleIndices.length,
        vertices: c.points.length, bounds: [c.bounds.min.toArray(), c.bounds.max.toArray()], signedVolume: c.signedVolume })) })),
  };
  let trianglePairs = 0;
  const witnesses = [];
  for (let bi = 0; bi < bands.length; bi++) {
    const result = proveBand(candidate, bands[bi], bi, components, witnesses, trianglePairs);
    if (result.failure) return result.failure;
    trianglePairs = result.trianglePairs;
  }
  return { separated: true, reason: 'closed-components-proven-separated', components, trianglePairs,
    evidence: { exactCoordinateWelding: true, bandTriangleBoundsExpansionM: EXPANSION_M,
      containmentWitnesses: witnesses, wholeMeshesChecked: true } };
}

function validateClosedStock(mesh) {
  if (!mesh?.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.isBatchedMesh)
    throw new Error('unsupported-mesh');
  const matrix = mesh.matrixWorld;
  if (!matrix?.isMatrix4 || !matrix.elements.every(Number.isFinite)
      || matrix.elements[3] !== 0 || matrix.elements[7] !== 0
      || matrix.elements[11] !== 0 || matrix.elements[15] !== 1
      || !Number.isFinite(matrix.determinant()) || matrix.determinant() === 0)
    throw new Error('invalid-world-transform');
  const { geometry, position, index, count } = validateTriangleStock(mesh);
  validateCompleteGroups(geometry, count);
  return { matrix, position, index, count };
}

function validateTriangleStock(mesh) {
  const geometry = mesh.geometry, position = geometry?.getAttribute?.('position'), index = geometry?.index;
  if (!geometry?.isBufferGeometry || !position || position.itemSize !== 3
      || !Number.isInteger(position.count) || position.count < 3
      || position.isGLBufferAttribute || geometry.morphAttributes?.position?.length)
    throw new Error('unsupported-position-stock');
  const count = validateTriangleIndex(geometry, position, index);
  return { geometry, position, index, count };
}

function validateTriangleIndex(geometry, position, index) {
  if (index && (index.itemSize !== 1 || index.normalized || !Number.isInteger(index.count)
      || !ArrayBuffer.isView(index.array) || index.count <= 0 || index.count > index.array.length))
    throw new Error('invalid-index-stock');
  const count = index ? index.count : position.count;
  if (!Number.isInteger(count) || count <= 0 || count % 3 || geometry.drawRange.start !== 0
      || (geometry.drawRange.count !== Infinity && geometry.drawRange.count !== count))
    throw new Error('incomplete-triangle-stock');

  return count;
}

function validateCompleteGroups(geometry, count) {
  // Material groups may partition complete stock, but a partial/overlapping
  // triangle selection is not a closed physical solid proven by this helper.
  if (geometry.groups.length) {
    const ranges = geometry.groups.map(g => ({ start:g.start, count:g.count })).sort((a,b) => a.start-b.start);
    let end = 0;
    for (const range of ranges) {
      if (!Number.isInteger(range.start) || !Number.isInteger(range.count)
          || range.start !== end || range.count <= 0 || range.count % 3)
        throw new Error('incomplete-triangle-groups');
      end += range.count;
    }
    if (end !== count) throw new Error('incomplete-triangle-groups');
  }

}

function weldWorldVertices(position, matrix) {
  const vertices = [], welds = [], vertexMap = new Map();
  for (let i = 0; i < position.count; i++) {
    const p = new Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix);
    if (!p.toArray().every(Number.isFinite)) throw new Error('nonfinite-position');
    if (!p.toArray().every(v => v + EXPANSION_M > v && v - EXPANSION_M < v))
      throw new Error('unrepresentable-clearance-margin');
    const key = `${p.x},${p.y},${p.z}`;
    let id = vertexMap.get(key);
    if (id === undefined) { id = vertices.length; vertexMap.set(key, id); vertices.push(p); }
    welds.push(id);
  }
  return { vertices, welds };
}

function closedTriangles(position, index, count, vertices, welds) {
  const triangles = [], edges = new Map(), triangleKeys = new Set();
  for (let offset = 0; offset < count; offset += 3) {
    const { ids, triangle } = stockTriangle(offset, position, index, vertices, welds, triangleKeys);
    const triangleIndex = triangles.length;
    triangles.push({ triangle, ids, neighbors: [] });
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
      const uses = edges.get(key) ?? [];
      uses.push({ triangle: triangleIndex, direction: a < b ? 1 : -1 });
      edges.set(key, uses);
    }
  }
  if (!triangles.length) throw new Error('empty-triangle-stock');
  for (const uses of edges.values()) {
    if (uses.length !== 2 || uses[0].direction === uses[1].direction)
      throw new Error('open-or-inconsistent-topology');
    triangles[uses[0].triangle].neighbors.push(uses[1].triangle);
    triangles[uses[1].triangle].neighbors.push(uses[0].triangle);
  }
  return triangles;
}

function closedComponents(triangles, vertices) {
  const visited = new Set(), components = [];
  for (let start = 0; start < triangles.length; start++) {
    if (visited.has(start)) continue;
    const { selected, pointIds } = connectedTriangles(start, triangles, visited);
    const points = [...pointIds].map(i => vertices[i]), bounds = new Box3().setFromPoints(points);
    const anchor = points[0], a = new Vector3(), b = new Vector3(), c = new Vector3();
    let volume6 = 0;
    for (const i of selected) {
      const t = triangles[i].triangle;
      a.subVectors(t.a, anchor); b.subVectors(t.b, anchor); c.subVectors(t.c, anchor);
      volume6 += a.dot(b.cross(c));
    }
    if (!Number.isFinite(volume6) || volume6 === 0) throw new Error('zero-volume-component');
    components.push({ points, bounds, triangleIndices: selected, signedVolume: volume6 / 6 });
  }
  return components;
}

function connectedTriangles(start, triangles, visited) {
    const pending = [start], selected = [], pointIds = new Set();
    visited.add(start);
    while (pending.length) {
      const i = pending.pop(), t = triangles[i];
      selected.push(i); t.ids.forEach(v => pointIds.add(v));
      for (const neighbor of t.neighbors) if (!visited.has(neighbor)) {
        visited.add(neighbor); pending.push(neighbor);
      }
    }
  return { selected, pointIds };
}

function proveBand(candidate, band, bi, components, witnesses, trianglePairs) {
    for (let ci = 0; ci < candidate.components.length; ci++) {
      const cc = candidate.components[ci], candidateBounds = cc.bounds.clone().expandByScalar(EXPANSION_M);
      for (let bci = 0; bci < band.components.length; bci++) {
        const bc = band.components[bci], bandBounds = bc.bounds.clone().expandByScalar(EXPANSION_M);
        const candidateOutside = cc.points.find(p => !bandBounds.containsPoint(p));
        const bandOutside = bc.points.find(p => !candidateBounds.containsPoint(p));
        if (!candidateOutside || !bandOutside)
          return { failure: { separated: false, reason: 'containment-or-ambiguous-bounds', components, trianglePairs,
            evidence: { band: bi, candidateComponent: ci, bandComponent: bci } } };
        witnesses.push({ band: bi, candidateComponent: ci, bandComponent: bci,
          candidateOutsideBandBounds: candidateOutside.toArray(), bandOutsideCandidateBounds: bandOutside.toArray() });
      }
    }
    for (let bti = 0; bti < band.triangles.length; bti++) {
      const t = band.triangles[bti];
      const bounds = new Box3().setFromPoints([t.a, t.b, t.c]).expandByScalar(EXPANSION_M);
      for (let cti = 0; cti < candidate.triangles.length; cti++) {
        trianglePairs++;
        if (bounds.intersectsTriangle(candidate.triangles[cti]))
          return { failure: { separated: false, reason: 'surface-intersection-or-conservative-contact', components, trianglePairs,
            evidence: { band: bi, candidateTriangle: cti, bandTriangle: bti } } };
      }
    }
  return { trianglePairs };
}

function stockTriangle(offset, position, index, vertices, welds, triangleKeys) {
    const ids = [];
    for (let j = 0; j < 3; j++) {
      const i = index ? index.getX(offset + j) : offset + j;
      if (!Number.isInteger(i) || i < 0 || i >= position.count) throw new Error('invalid-index');
      ids.push(welds[i]);
    }
    const triangle = new Triangle(...ids.map(i => vertices[i]));
    const area = triangle.getArea();
    if (new Set(ids).size !== 3 || !Number.isFinite(area) || area <= 0)
      throw new Error('degenerate-triangle');
    const triangleKey = [...ids].sort((a, b) => a - b).join(',');
    if (triangleKeys.has(triangleKey)) throw new Error('duplicate-triangle');
    triangleKeys.add(triangleKey);
  return { ids, triangle };
}
