import {canonicalConfigurationPath} from './source-configuration-path.mjs';
import { Matrix4, Vector3 } from 'three';

/** Source configuration decisions apply only to their hash-verified input.
 * Unregistered fleet vehicles retain the existing >=1 roof-MG requirement. */
export function roofEquipmentVerdict(id, census, configuration, sourceReceipt = null) {
  if (!census || !Number.isInteger(census.mg) || census.mg < 0
      || !Number.isInteger(census.invalidWeaponMarkers) || census.invalidWeaponMarkers !== 0) {
    return { passed: false, reason: 'Missing census or nonphysical roof-weapon marker' };
  }
  if (!configuration) return { passed: census.mg >= 1, required: '>=1', observed: census.mg };
  const required = configuration.roofMachineGuns;
  if (configuration.id !== id || sourceReceipt?.id !== id
      || configuration.source?.path !== canonicalConfigurationPath(id)
      || !/^[a-f0-9]{64}$/.test(configuration.source?.sha256 ?? '')
      || sourceReceipt?.verified !== true
      || sourceReceipt?.path !== configuration.source?.path
      || sourceReceipt?.sha256 !== configuration.source?.sha256
      || !Number.isInteger(required) || required < 0) {
    return { passed: false, reason: 'Source configuration is unavailable or changed' };
  }
  return { passed: census.mg === required, required, observed: census.mg };
}

/** A group label is insufficient: a counted roof fitting must contain real
 * visible, color-writing stock belonging to that exact fitting root. */
export function censusEquipment(root) {
  let mg = 0, dressing = 0, markedMeshes = 0, invalidWeaponMarkers = 0;
  const byType = {};
  const visible = object => {
    for (let node=object; node; node=node.parent) if (!node.visible) return false;
    return true;
  };
  root.updateMatrixWorld(true);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const ab = new Vector3(), ac = new Vector3(), instance = new Matrix4();
  const hasLiveInstance = object => {
      let liveInstance = false;
      for (let i=0; i<object.count && !liveInstance; i++) {
        object.getMatrixAt(i, instance);
        liveInstance = instance.elements.every(Number.isFinite)
          && Number.isFinite(instance.determinant()) && Math.abs(instance.determinant()) >= 1e-12;
      }
      return liveInstance;
  };
  const rangeHasTriangle = (position, index, start, end) => {
      for (let i=start; i+2<end; i+=3) {
        a.fromBufferAttribute(position,index ? index.getX(i) : i);
        b.fromBufferAttribute(position,index ? index.getX(i+1) : i+1);
        c.fromBufferAttribute(position,index ? index.getX(i+2) : i+2);
        if (![a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z].every(Number.isFinite)) continue;
        const areaSquared = ab.subVectors(b,a).cross(ac.subVectors(c,a)).lengthSq();
        if (Number.isFinite(areaSquared) && areaSquared > 1e-18) return true;
      }
    return false;
  };
  const hasDrawnTriangle = (object, geometry, position) => {
    const index = geometry.index;
    const count = index?.count ?? position.count;
    const drawStart = Math.max(0, geometry.drawRange.start);
    const drawEnd = Math.min(count, drawStart + geometry.drawRange.count);
    const ranges = Array.isArray(object.material) ? geometry.groups : [{start:0,count,materialIndex:0}];
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const range of ranges) {
      const material = materials[range.materialIndex];
      if (!material || material.visible === false || material.colorWrite === false
          || (material.transparent && material.opacity <= 0)) continue;
      const start = Math.max(drawStart,range.start), end = Math.min(drawEnd,range.start+range.count);
      if (rangeHasTriangle(position, index, start, end)) return true;
    }
    return false;
  };
  const rendersStock = object => {
    const geometry = object.geometry, position = geometry?.attributes?.position;
    if (!object.isMesh || !visible(object) || !position || position.count < 3
        || !object.matrixWorld.elements.every(Number.isFinite)
        || !Number.isFinite(object.matrixWorld.determinant())
        || Math.abs(object.matrixWorld.determinant()) < 1e-12) return false;
    if (object.isInstancedMesh && !hasLiveInstance(object)) return false;
    return hasDrawnTriangle(object, geometry, position);
  };
  root.traverse(object => {
    if (object.isMesh && object.userData?.fitting) markedMeshes++;
    if (!object.userData?.fittingRoot) return;
    const type = object.userData.fitting || '?';
    byType[type] = (byType[type] || 0) + 1;
    if (!['pintleMG', 'openYokeRws'].includes(type)) { dressing++; return; }
    let stock = false;
    object.traverse(child => {
      // Nested unrelated fittings cannot validate an empty outer marker.
      for (let ancestor=child; ancestor && ancestor!==object; ancestor=ancestor.parent)
        if (ancestor.userData?.fittingRoot) return;
      if (rendersStock(child)) stock = true;
    });
    if (stock) mg++; else invalidWeaponMarkers++;
  });
  return {mg,dressing,markedMeshes,invalidWeaponMarkers,byType};
}
