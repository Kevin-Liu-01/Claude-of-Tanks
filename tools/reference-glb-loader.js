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
  authoredFrame.add(gltf.scene);
  root.updateMatrixWorld(true);

  if (!cfg.fixedMount && cfg.turretNode) {
    const turretNodes = matchingNodes(gltf.scene, cfg.turretNode);
    const turretFollowers = matchingNodes(gltf.scene, cfg.turretFollowers);
    attachAll(turret, [...turretNodes, ...turretFollowers]);

    const gunNodes = matchingNodes(root, cfg.gunNode);
    const gunFollowers = matchingNodes(root, cfg.gunFollowers);
    attachAll(gun, [...gunNodes, ...gunFollowers]);
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
