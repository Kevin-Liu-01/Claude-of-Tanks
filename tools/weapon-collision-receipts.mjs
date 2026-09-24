import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

// Exact authored stock, not convex hulls across hollow tubes or separated pods.
// Indexed vertices keep these sparse, demand-loaded family receipts compact.
export function weaponCollisionReceipts(root, hullRig, turretRig) {
  root.updateMatrixWorld(true);
  const meshes = new Map();
  root.traverse(object => {
    if (object.geometry && !meshes.has(object.name)) meshes.set(object.name, object);
  });
  const rows = [];
  for (const part of root.userData.weaponGeometryParts || []) {
    const mesh = meshes.get(part.bucket);
    if (!mesh) throw new Error(`Missing weapon bucket ${part.bucket}`);
    const owner = part.parent === 'hullG' ? hullRig : turretRig;
    // Combat frames rotate and translate in metres; they do not inherit the
    // presentation rig's scale (the Warrior compresses its turret vertically).
    // Bake that scale into the measured stock instead of cancelling it out.
    const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
    owner.matrixWorld.decompose(position, rotation, scale);
    const matrix = new Matrix4().compose(position, rotation, new Vector3(1, 1, 1))
      .invert().multiply(mesh.matrixWorld);
    const vertices = [], faces = [], byPoint = new Map(), bounds = new Box3();
    const point = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
    const indices = part.positions.map(p => {
      point.fromArray(p).applyMatrix4(matrix);
      const v = point.toArray().map(n => Number(n.toFixed(5))), key = v.join(',');
      if (!byPoint.has(key)) {
        byPoint.set(key, vertices.length); vertices.push(v); bounds.expandByPoint(point);
      }
      return byPoint.get(key);
    });
    for (let i = 0; i < part.indices.length; i += 3) {
      const face = part.indices.slice(i, i + 3).map(j => indices[j]);
      a.fromArray(vertices[face[0]]); b.fromArray(vertices[face[1]]); c.fromArray(vertices[face[2]]);
      if (b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16) faces.push(face);
    }
    if (!faces.length) continue;
    rows.push({ module: part.module, armorMm: part.armorMm,
      turretLocal: part.parent !== 'hullG',
      gunFollow: part.parent === 'gunG' || part.parent === 'recoilG',
      min: bounds.min.toArray().map(n => Number(n.toFixed(5)) - .00002),
      max: bounds.max.toArray().map(n => Number(n.toFixed(5)) + .00002),
      vertices, faces });
  }
  return rows;
}
