// Field kit fitted over a reconstructed hull (main 5f8eefaa4: side screens and their mounting pads, roof cages, roof
// weapon stations, rear stowage, ghillie) is not part of the source surfaces that a source receipt witnesses. The
// census records the kit parts its builders add to shared buckets (the screen pads merge into the detail buckets);
// the filter drops hits on those parts, on ghillie and open-lattice meshes and on stations tagged fieldKitStation, so
// a witness ray reports the first source surface behind the kit. Rig poses are read on every cast (turret yaw tests).
import * as THREE from 'three';

const KIT_BUILDERS = /addLeclercFieldProtection|upgradeOplotFieldEquipment|addFieldRoofCage|addFieldRoofWeapon|addRearFieldStowage/;

/** Pass `partCensus` to createTank; `parts` then holds every bucket part a field-kit builder added. */
export function fieldKitCensus() {
  const parts = [];
  return {
    parts,
    partCensus(bucket, part) {
      const limit = Error.stackTraceLimit;
      Error.stackTraceLimit = 40;
      try { if (KIT_BUILDERS.test(new Error().stack)) parts.push({ bucket, part }); } finally { Error.stackTraceLimit = limit; }
    },
  };
}

export function fieldKitFilter(root, census) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const rig = (bucket) => root.getObjectByName(bucket.startsWith('turret') ? 'rig_turret' : bucket.startsWith('gun') ? 'rig_gun' : 'rig_hull');
  const proxies = census.parts.map(({ bucket, part }) => {
    const proxy = new THREE.Mesh(part, material);
    proxy.matrixAutoUpdate = false;
    proxy.userData.rig = rig(bucket);
    return proxy;
  });
  const kitObject = (object) => {
    for (let p = object; p && p !== root; p = p.parent) if (p.userData?.fieldKitStation === true || /_ghillie_|OpenLattice/.test(p.name)) return true;
    return false;
  };
  return {
    kitParts: proxies.length,
    kitObject,
    /** The raycaster's hits on `meshes` in distance order, field kit removed. */
    hits(raycaster, meshes) {
      for (const proxy of proxies) proxy.matrixWorld.copy(proxy.userData.rig.matrixWorld);
      const kit = raycaster.intersectObjects(proxies, false).map((hit) => hit.distance);
      return raycaster.intersectObjects(meshes, false)
        .filter((hit) => !kitObject(hit.object) && !kit.some((distance) => Math.abs(distance - hit.distance) < 1e-5));
    },
    dispose() { material.dispose(); },
  };
}
