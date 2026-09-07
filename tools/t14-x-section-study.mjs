// CPU-only scalar source/procedural section audit. The private source is never
// rewritten or sent to runtime; returned extrema name the responsible parts.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createTank } from '../src/vehicles/tankFactory.ts';

const bytes = fs.readFileSync(new URL('../public/models/community-candidates/t14_x_source.glb', import.meta.url));
const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const tank = createTank('t14_x', null, { proceduralOnly: true, geometryReceipt: true });
const stations = Array.from({ length: 44 }, (_, i) => -4.3 + i * .2);

function worldTriangles(root) {
  const triangles = [], instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverseVisible(object => {
    if (!object.isMesh || /^procShadow/.test(object.name) || object.userData.geometryAuditIgnore) return;
    const geometry = object.geometry, positions = geometry.attributes.position;
    for (let copy = 0; copy < (object.isInstancedMesh ? object.count : 1); copy++) {
      world.copy(object.matrixWorld);
      if (object.isInstancedMesh) { object.getMatrixAt(copy, instance); world.multiplyMatrices(object.matrixWorld, instance); }
      for (let i = 0; i < (geometry.index?.count ?? positions.count); i += 3) {
        const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(
          positions, geometry.index ? geometry.index.getX(i + offset) : i + offset).applyMatrix4(world));
        triangles.push({ name: object.name, vertices });
      }
    }
  });
  return triangles;
}

function profile(triangles, z) {
  const row = { low: Infinity, high: -Infinity, lowPart: null, highPart: null };
  for (const { name, vertices } of triangles) {
    for (let i = 0; i < 3; i++) {
      const a = vertices[i], b = vertices[(i + 1) % 3];
      if (Math.abs(b.z - a.z) < 1e-9) continue;
      const t = (z - a.z) / (b.z - a.z);
      if (t < 0 || t > 1) continue;
      const y = a.y + (b.y - a.y) * t;
      if (y < row.low) { row.low = y; row.lowPart = name; }
      if (y > row.high) { row.high = y; row.highPart = name; }
    }
  }
  return row;
}
try {
  if (process.argv.includes('--bow')) {
    const ray = new THREE.Raycaster();
    const sample = (root,x,z) => {
      root.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0));
      const hit = ray.intersectObject(root,true).find(h=>h.object.isMesh && !/^procShadow/.test(h.object.name));
      return hit ? {y:+hit.point.y.toFixed(5),name:hit.object.name} : null;
    };
    const rows=[];
    for (const x of [1.10,1.35,1.55,1.64,1.75,1.83]) for (const z of [3.47,3.65,3.77,4.00,4.18,4.26]) {
      rows.push({x,z,source:sample(source.scene,x,z),native:sample(tank.root,x,z)});
    }
    process.stdout.write(`${JSON.stringify(rows)}\n`);
  } else {
    const a = worldTriangles(source.scene), b = worldTriangles(tank.root);
    console.log(JSON.stringify(stations.map(z => ({ z: +z.toFixed(2), source: profile(a, z), native: profile(b, z) })), null, 2));
  }
} finally { tank.dispose(); }
