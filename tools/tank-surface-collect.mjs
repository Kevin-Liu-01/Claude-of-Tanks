// Shared surface collector for the tank body checks (sealed views, watertight flood fill): flattens a built tank
// into world-space triangles with a per-triangle material class and owning mesh name.
import * as THREE from 'three';
import { createCanvas, Path2D as NapiPath2D, ImageData as NapiImageData, Image as NapiImage } from '@napi-rs/canvas';

// Builders paint their canvas textures (ghillie nets, markings, kit fabrics) through
// document.createElement('canvas'); without a document they fall back to flat single-sided
// defaults that do not match the browser. Give node a 2D canvas so materials are set as shipped.
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = NapiPath2D;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = NapiImageData;
if (typeof globalThis.Image === 'undefined') globalThis.Image = NapiImage;
if (typeof globalThis.document === 'undefined') {
  const makeCanvas = () => createCanvas(1, 1);
  globalThis.document = {
    createElement(tag) { return String(tag).toLowerCase() === 'canvas' ? makeCanvas() : { style: {}, setAttribute() {}, appendChild() {} }; },
    createElementNS(_ns, tag) { return this.createElement(tag); },
    body: { appendChild() {}, removeChild() {} },
  };
}

export function materialClass(material, decal = false) {
  if (!material || material.visible === false || material.colorWrite === false) return null;
  if (decal) return { transparent: true, side: THREE.DoubleSide };
  const transparent = (material.transparent && material.opacity < 0.98) || material.alphaTest > 0 || !!material.alphaMap
    || material.depthWrite === false;
  return { transparent, side: material.side ?? THREE.FrontSide };
}

/** Flatten the visible tank into world-space triangles with per-triangle class and owner. */
export function collectTriangles(root) {
  root.updateMatrixWorld(true);
  const tris = []; // {a,b,c (Vector3), cls, mesh}
  const meshes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const m = new THREE.Matrix4();
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry; const pos = geo.getAttribute('position'); if (!pos) return;
    const index = geo.index ? geo.index.array : null;
    const triCount = index ? index.length / 3 : pos.count / 3;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    const groups = Array.isArray(o.material) && geo.groups.length ? geo.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    const meshIndex = meshes.length; meshes.push(o.name || o.type);
    const decal = /^vehicleMarking_/.test(o.name || ''); // 2D markings/soot are decals, never hull surfaces
    if (o.isBatchedMesh) {
      // BatchedMesh: each instance draws one geometry range of the shared buffer through its own matrix
      const cls = materialClass(materials[0], decal); if (!cls) return;
      const range = {}; const im = new THREE.Matrix4();
      for (let i = 0; i < o.instanceCount; i++) {
        if (o.getVisibleAt && !o.getVisibleAt(i)) continue;
        const gid = o.getGeometryIdAt(i); if (gid < 0) continue;
        o.getGeometryRangeAt(gid, range); o.getMatrixAt(i, im); const world = im.clone().premultiply(o.matrixWorld); const flip = world.determinant() < 0;
        for (let k = range.start; k + 2 < range.start + range.count; k += 3) {
          const i0 = index ? index[k] : k, i1 = index ? index[k + 1] : k + 1, i2 = index ? index[k + 2] : k + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(world); b.fromBufferAttribute(pos, i1).applyMatrix4(world); c.fromBufferAttribute(pos, i2).applyMatrix4(world);
          tris.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, cx: c.x, cy: c.y, cz: c.z, transparent: cls.transparent, side: cls.side, mesh: meshIndex, flip });
        }
      }
      return;
    }
    const instanceMatrices = [];
    if (o.isInstancedMesh) { for (let i = 0; i < o.count; i++) { const im = new THREE.Matrix4(); o.getMatrixAt(i, im); instanceMatrices.push(im.premultiply(o.matrixWorld)); } }
    else instanceMatrices.push(o.matrixWorld);
    for (const group of groups) {
      const cls = materialClass(materials[group.materialIndex] ?? materials[0], decal); if (!cls) continue;
      const startTri = Math.floor(group.start / 3), endTri = Math.min(triCount, Math.floor((group.start + group.count) / 3));
      for (const world of instanceMatrices) {
        const flip = world.determinant() < 0;
        for (let t = startTri; t < endTri; t++) {
          const i0 = index ? index[t * 3] : t * 3, i1 = index ? index[t * 3 + 1] : t * 3 + 1, i2 = index ? index[t * 3 + 2] : t * 3 + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(world);
          b.fromBufferAttribute(pos, i1).applyMatrix4(world);
          c.fromBufferAttribute(pos, i2).applyMatrix4(world);
          tris.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, cx: c.x, cy: c.y, cz: c.z, transparent: cls.transparent, side: cls.side, mesh: meshIndex, flip });
        }
      }
    }
  });
  return { tris, meshes };
}

