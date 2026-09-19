import * as THREE from 'three';

const rendersStock = material => Boolean(material && material.visible !== false
  && material.colorWrite !== false && !(material.transparent && material.opacity <= 0));

/** Neutral FrontSide rays retain each face's original rendered-stock eligibility.
 * Material groups and draw ranges remain intact; hidden stock cannot certify a web. */
export function sourceOpeningRayProbe(root) {
  const originals = new Map();
  const neutral = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  root.traverse(object => {
    if (!object.isMesh) return;
    const original = object.material;
    originals.set(object, original);
    object.material = Array.isArray(original) ? original.map(() => neutral) : neutral;
  });
  root.updateMatrixWorld(true);
  return {
    cast(origin, direction, far = 20) {
      return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far)
        .intersectObject(root, true).find(hit => {
          for (let node = hit.object; node; node = node.parent) {
            if (!node.visible || node.userData?.shadowOnly || /shadow/i.test(node.name)) return false;
          }
          const original = originals.get(hit.object);
          const material = Array.isArray(original) ? original[hit.face?.materialIndex ?? 0] : original;
          return rendersStock(material);
        });
    },
    dispose() {
      for (const [object, material] of originals) object.material = material;
      originals.clear();
      neutral.dispose();
    },
  };
}
