import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const regex = (pattern) => pattern ? new RegExp(pattern) : null;

function matchingNodes(root, pattern) {
  const re = regex(pattern);
  if (!re) return [];
  const matches = [];
  root.traverse((node) => {
    re.lastIndex = 0;
    if (re.test(node.name || '')) matches.push(node);
  });
  return matches;
}

function attachAll(parent, nodes) {
  // Parents first prevents a selected child from being transformed twice
  // when an oracle pattern names both a complete station and one fitting.
  const selected = new Set(nodes);
  const roots = nodes.filter((node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (selected.has(p)) return false;
    }
    return true;
  });
  for (const node of roots) parent.attach(node);
}

/**
 * Tool-only source-oracle loader.
 *
 * Runtime tank GLB swapping was intentionally retired for performance and
 * authorship. Fidelity tooling still needs to inspect quarantined source
 * files, so this loader creates only the semantic rig required by the mask,
 * profile, and critic pages. It never enters createTank or a production
 * bundle and it never copies source geometry into an authored vehicle.
 */
export async function loadReferenceGlb(source, specId, spec) {
  const cfg = source?.glb;
  if (!cfg?.path) throw new Error(`${specId} has no source GLB path`);

  const gltf = await new GLTFLoader().loadAsync(cfg.path);
  const root = new THREE.Group();
  root.name = `reference_${specId}`;
  const hull = new THREE.Group();
  hull.name = 'rig_hull';
  const turret = new THREE.Group();
  turret.name = 'rig_turret';
  const gun = new THREE.Group();
  gun.name = 'rig_gun';
  root.add(hull, turret);
  turret.add(gun);

  const authoredFrame = new THREE.Group();
  authoredFrame.name = 'reference_authored_frame';
  authoredFrame.rotation.y = Number(cfg.yawOffset || 0);
  hull.add(authoredFrame);
  // Off-origin print class (§5.248 ukraine finds: t80u_kursk diorama at
  // -1124u, t64bv_donbass at +4.2 m). An off-center model breaks every
  // subsequent origin-anchored rotation (yawOffset here, the page's
  // gun-forward flip) and blows the shared comparison frame apart, so
  // center the RAW footprint INSIDE the authored frame — before any yaw —
  // when its offset is pathological (> 0.35 of the model diagonal; every
  // near-centered print keeps its exact historical transform).
  {
    const rawBox = new THREE.Box3().setFromObject(gltf.scene);
    if (!rawBox.isEmpty()) {
      const rawC = rawBox.getCenter(new THREE.Vector3());
      const diag = rawBox.getSize(new THREE.Vector3()).length();
      if (Math.hypot(rawC.x, rawC.z) > 0.35 * Math.max(diag, 1e-6)) {
        gltf.scene.position.x -= rawC.x;
        gltf.scene.position.z -= rawC.z;
      }
    }
  }
  authoredFrame.add(gltf.scene);
  root.updateMatrixWorld(true);

  if (!cfg.fixedMount && cfg.turretNode) {
    const turretNodes = matchingNodes(gltf.scene, cfg.turretNode);
    const turretFollowers = matchingNodes(gltf.scene, cfg.turretFollowers);
    // Keep the comparison rig on the source file's authored rotation centre.
    // Re-parenting a turret under a pivot left at the scene origin makes it
    // orbit the hull during yaw, which corrupts both articulation boards and
    // component masks. Most articulated source files retain a useful object
    // origin even when their mesh vertices were baked in an arbitrary DCC
    // frame; explicit `pivot` remains available for the exceptions.
    if (cfg.autoPivot && turretNodes.length) {
      const pivot = Array.isArray(cfg.pivot)
        ? new THREE.Vector3().fromArray(cfg.pivot)
        : turretNodes[0].getWorldPosition(new THREE.Vector3());
      turret.position.copy(pivot);
      root.updateMatrixWorld(true);
    }
    attachAll(turret, [...turretNodes, ...turretFollowers]);

    const gunNodes = matchingNodes(root, cfg.gunNode);
    const gunFollowers = matchingNodes(root, cfg.gunFollowers);
    if (cfg.autoPivot && gunNodes.length) {
      const pivotWorld = gunNodes[0].getWorldPosition(new THREE.Vector3());
      gun.position.copy(turret.worldToLocal(pivotWorld.clone()));
      root.updateMatrixWorld(true);
    }
    attachAll(gun, [...gunNodes, ...gunFollowers]);

    // PARKED-POSE CORRECTION (§5.269 upior class, additive + opt-in): some
    // prints are AUTHORED with the turret slewed away from the fleet's
    // gun-forward rest law (the upior concept parks its whole station 180°
    // over the engine deck). cfg.turretYaw re-poses the articulated rig
    // about its own footprint center (the autoPivot convention) AFTER the
    // attach so masks, curves and dims compare rest-law frames. Absent the
    // param, nothing moves — every existing registration is byte-identical.
    if (cfg.turretYaw) {
      // Pivot on the TURRET-SHELL footprint only: a rear-hanging parked gun
      // biases the whole-cluster center ~0.5 m off the ring (measured on
      // the upior probe: muzzle landed 1.0 m short of the bow).
      const clusterBox = new THREE.Box3();
      for (const node of turretNodes) clusterBox.expandByObject(node);
      if (clusterBox.isEmpty()) clusterBox.setFromObject(turret);
      if (!clusterBox.isEmpty()) {
        const pivot = clusterBox.getCenter(new THREE.Vector3());
        for (const child of turret.children) {
          child.position.x -= pivot.x;
          child.position.z -= pivot.z;
        }
        turret.rotation.y = Number(cfg.turretYaw);
        turret.position.x = pivot.x;
        turret.position.z = pivot.z;
        root.updateMatrixWorld(true);
      }
    }
  }

  // Source files arrive in metres, centimetres, millimetres, or arbitrary
  // DCC units. Register on the published vehicle width before any scoring;
  // width is stable and is not inflated by the cannon or roof antennas.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const width = box.getSize(new THREE.Vector3()).x;
  const targetWidth = Number(spec?.dims?.widthM || 0);
  if (width > 1e-6 && targetWidth > 0) {
    const scale = targetWidth / width;
    root.scale.setScalar(scale);
    root.position.y = -box.min.y * scale;
  }

  // A few legacy source sheets bake almost all illumination into a very dark
  // albedo. Their silhouettes remain valid, but a shaded comparison becomes
  // unreadable. Opt-in emissive reuse reveals the authored texture without
  // replacing it or changing any geometry.
  if (cfg.brightenOracle) {
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      node.material = materials.map((sourceMaterial) => {
        const material = sourceMaterial.clone();
        if (material.emissive) material.emissive.setHex(0xffffff);
        if ('emissiveMap' in material && material.map) material.emissiveMap = material.map;
        if ('emissiveIntensity' in material) material.emissiveIntensity = 4;
        material.transparent = false;
        material.opacity = 1;
        material.alphaTest = 0;
        material.depthWrite = true;
        material.needsUpdate = true;
        return material;
      });
      if (node.material.length === 1) [node.material] = node.material;
    });
  }

  root.userData.__glbSwapped = true;
  root.userData.__comparisonOracle = true;
  root.updateMatrixWorld(true);
  return { root, specId };
}
