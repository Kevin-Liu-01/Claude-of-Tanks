import * as T from 'three';

// Compare actual oriented triangles in the assembly frame, independently of
// how stationary material buckets are split across a moving roof station.
export function neutralStock(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), rows = [];
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.shadowOnly || mesh.userData.vehicleMarking
      || /interior|Shadow/.test(mesh.name)) return;
    const g = mesh.geometry, p = g.attributes.position, index = g.index;
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let instance = 0; instance < count; instance++) {
      const matrix = inverse.clone().multiply(mesh.matrixWorld);
      if (mesh.isInstancedMesh) { const local = new T.Matrix4(); mesh.getMatrixAt(instance, local); matrix.multiply(local); }
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const vertices = [0,1,2].map(j => new T.Vector3().fromBufferAttribute(p, index ? index.getX(i+j) : i+j)
          .applyMatrix4(matrix).toArray().map(n => Math.round(n * 1e5)).join(','));
        // Rotate the vertex order to retain winding while ignoring start corner.
        rows.push([0,1,2].map(j => [...vertices.slice(j),...vertices.slice(0,j)].join(';')).sort()[0]);
      }
    }
  });
  return rows.sort();
}
