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

// Split selected connected islands from one fused source mesh without
// changing the rendered whole. Some comparison prints collapse armor,
// fittings, and interior pieces into a generic Object_N mesh; a node-name
// regex alone cannot form an honest component mask. This remains strictly in
// the tool-only oracle loader and never supplies production geometry.
function extractConnectedSubset(root, rule, label) {
  if (!rule?.node) return { subsets: [], remainders: [] };
  const subsets = [];
  const remainders = [];
  const scratch = new THREE.Vector3();
  for (const node of matchingNodes(root, rule.node)) {
    if (!node.isMesh || !node.geometry?.index || !node.geometry?.attributes?.position) continue;
    node.updateWorldMatrix(true, false);
    const geometry = node.geometry;
    const index = geometry.index.array;
    const positions = geometry.attributes.position;
    const parents = Array.from({ length: positions.count }, (_, vertex) => vertex);
    const find = (vertex) => {
      let rootVertex = vertex;
      while (parents[rootVertex] !== rootVertex) rootVertex = parents[rootVertex];
      while (parents[vertex] !== vertex) {
        const next = parents[vertex];
        parents[vertex] = rootVertex;
        vertex = next;
      }
      return rootVertex;
    };
    const union = (left, right) => {
      left = find(left);
      right = find(right);
      if (left !== right) parents[right] = left;
    };
    for (let cursor = 0; cursor < index.length; cursor += 3) {
      union(index[cursor], index[cursor + 1]);
      union(index[cursor], index[cursor + 2]);
    }
    const components = new Map();
    for (let cursor = 0; cursor < index.length; cursor += 3) {
      const componentRoot = find(index[cursor]);
      let component = components.get(componentRoot);
      if (!component) {
        component = { indices: [], vertices: new Set(), bounds: new THREE.Box3() };
        components.set(componentRoot, component);
      }
      for (let offset = 0; offset < 3; offset++) {
        const vertex = index[cursor + offset];
        component.indices.push(vertex);
        component.vertices.add(vertex);
      }
    }
    for (const component of components.values()) {
      for (const vertex of component.vertices) {
        scratch.fromBufferAttribute(positions, vertex).applyMatrix4(node.matrixWorld);
        component.bounds.expandByPoint(scratch);
      }
    }
    const selected = [];
    const remaining = [];
    for (const component of components.values()) {
      const vertexCount = component.vertices.size;
      const matches = (rule.minVertices == null || vertexCount >= rule.minVertices)
        && (rule.maxVertices == null || vertexCount <= rule.maxVertices)
        && (rule.worldMinY == null || component.bounds.min.y >= rule.worldMinY)
        && (rule.worldMaxY == null || component.bounds.max.y <= rule.worldMaxY);
      (matches ? selected : remaining).push(...component.indices);
    }
    if (!selected.length || !remaining.length) continue;
    const IndexArray = geometry.index.array.constructor;
    const subsetIndexed = geometry.clone();
    subsetIndexed.setIndex(new THREE.BufferAttribute(IndexArray.from(selected), 1));
    // Compact the position stream as well as the index stream. Box3 and
    // BufferGeometry.computeBoundingBox intentionally scan every attribute
    // vertex, including vertices no longer referenced by a subset index. A
    // sparse clone therefore rendered correctly but reported the original
    // fused node's bounds, poisoning normalization/dimension diagnostics.
    const subsetGeometry = subsetIndexed.toNonIndexed();
    subsetIndexed.dispose();
    subsetGeometry.clearGroups();
    subsetGeometry.computeBoundingBox();
    subsetGeometry.computeBoundingSphere();
    const remainingIndexed = geometry.clone();
    remainingIndexed.setIndex(new THREE.BufferAttribute(IndexArray.from(remaining), 1));
    const remainingGeometry = remainingIndexed.toNonIndexed();
    remainingIndexed.dispose();
    remainingGeometry.clearGroups();
    remainingGeometry.computeBoundingBox();
    remainingGeometry.computeBoundingSphere();
    node.geometry = remainingGeometry;
    remainders.push(node);
    const subset = node.clone(false);
    subset.name = `${node.name}__${label}`;
    subset.geometry = subsetGeometry;
    node.parent.add(subset);
    subsets.push(subset);
  }
  return { subsets, remainders };
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
  const unclassified = new THREE.Group();
  unclassified.name = 'reference_unclassified';
  root.add(hull, turret, unclassified);
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
    // Generic source meshes occasionally fuse several ownership domains into
    // one Object_N node. Allow the fidelity registration to split any number
    // of connected-island rules and route only the selected islands to their
    // honest articulation owner. Remainders stay under authoredFrame (hull)
    // unless the rule explicitly marks them as non-comparable internals.
    const semanticSubsets = { turret: [], gun: [], unclassified: [] };
    const subsetRules = [
      ...(cfg.turretComponentSubset
        ? [{ ...cfg.turretComponentSubset, owner: 'turret' }]
        : []),
      ...(Array.isArray(cfg.componentSubsets) ? cfg.componentSubsets : []),
    ];
    for (let index = 0; index < subsetRules.length; index++) {
      const rule = subsetRules[index];
      const owner = rule.owner || 'unclassified';
      if (!(owner in semanticSubsets)) {
        throw new Error(`${specId} component subset has invalid owner ${owner}`);
      }
      const subset = extractConnectedSubset(
        gltf.scene, rule, `${owner}Subset${index}`);
      semanticSubsets[owner].push(...subset.subsets);
      if (rule.excludeRemainderFromHull) {
        attachAll(unclassified, subset.remainders);
      }
    }
    const turretNodes = [
      ...matchingNodes(gltf.scene, cfg.turretNode),
      ...semanticSubsets.turret,
    ];
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

    const gunNodes = [
      ...matchingNodes(root, cfg.gunNode),
      ...semanticSubsets.gun,
    ];
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

  // §5.317 (t95 WoT print): some textured rips carry near-black albedo
  // regions (gun / track bottoms / glacis) that fall under the gate's mask
  // threshold (red > 40) and read as silhouette HOLES — the ref's own
  // geometry vanishes from its masks (measured: the t95 print's plan-front
  // columns ended at the snout and its front-view bottoms floated at ~0.4 m).
  // maskFloorOracle adds a small constant emissive floor — geometry-neutral
  // and texture-preserving (the floor ADDS; maps stay visible) — so every
  // authored surface clears the threshold. Opt-in per registration; do not
  // combine with brightenOracle (its emissive×map product would re-darken).
  if (cfg.maskFloorOracle) {
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      node.material = materials.map((sourceMaterial) => {
        const material = sourceMaterial.clone();
        if (material.emissive) material.emissive.setRGB(0.24, 0.24, 0.24);
        // Rip-class prints also carry inward-wound faces (aprons / band
        // bottoms) that FrontSide renders cull into the same hole class —
        // force DoubleSide so the authored surface is mask-visible from
        // every gate camera (§C.1 mirrored to the reference side).
        material.side = THREE.DoubleSide;
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
