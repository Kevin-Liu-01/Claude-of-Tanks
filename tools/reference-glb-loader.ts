import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validatedPreservationOracle, verifyPreservationBytes } from './preservation-oracle.ts';
import type { PreservationSource } from './preservation-oracle.ts';

type SemanticOwner = 'turret' | 'gun' | 'unclassified';

interface ComponentSubsetRule {
  readonly node: string;
  readonly owner?: SemanticOwner;
  readonly minVertices?: number;
  readonly maxVertices?: number;
  readonly worldMinY?: number;
  readonly worldMaxY?: number;
  readonly excludeRemainderFromHull?: boolean;
}

interface ReferenceGlbConfig {
  readonly path: string;
  readonly fixedMount?: boolean;
  readonly turretNode?: string;
  readonly gunNode?: string;
  readonly turretFollowers?: string;
  readonly gunFollowers?: string;
  readonly autoPivot?: boolean;
  readonly pivot?: readonly [number, number, number];
  readonly yawOffset?: number;
  readonly turretYaw?: number;
  readonly turretComponentSubset?: ComponentSubsetRule;
  readonly componentSubsets?: readonly ComponentSubsetRule[];
  readonly maskFloorOracle?: boolean;
  readonly brightenOracle?: boolean;
}

export interface ReferenceGlbSource extends PreservationSource {
  readonly glb?: ReferenceGlbConfig;
}

export interface ReferenceVehicleSpec {
  readonly dims?: { readonly widthM?: number };
}

interface ConnectedComponent {
  readonly indices: number[];
  readonly vertices: Set<number>;
  readonly bounds: THREE.Box3;
}

interface ConnectedSubset {
  readonly subsets: THREE.Mesh[];
  readonly remainders: THREE.Mesh[];
}

interface ReferenceRig {
  readonly root: THREE.Group;
  readonly hull: THREE.Group;
  readonly turret: THREE.Group;
  readonly gun: THREE.Group;
  readonly unclassified: THREE.Group;
  readonly authoredFrame: THREE.Group;
}

type EmissiveMaterial = THREE.MeshLambertMaterial | THREE.MeshPhongMaterial
  | THREE.MeshStandardMaterial | THREE.MeshToonMaterial;

const regex = (pattern: string | null | undefined): RegExp | null => (
  pattern ? new RegExp(pattern) : null
);

function matchingNodes(
  root: THREE.Object3D,
  pattern: string | null | undefined,
): THREE.Object3D[] {
  const re = regex(pattern);
  if (!re) return [];
  const matches: THREE.Object3D[] = [];
  root.traverse((node) => {
    re.lastIndex = 0;
    if (re.test(node.name || '')) matches.push(node);
  });
  return matches;
}

function attachAll(parent: THREE.Object3D, nodes: readonly THREE.Object3D[]): void {
  // Parents first prevents a selected child from being transformed twice
  // when an oracle pattern names both a complete station and one fitting.
  const selected = new Set(nodes);
  const roots = nodes.filter((node) => {
    for (let p: THREE.Object3D | null = node.parent; p; p = p.parent) {
      if (selected.has(p)) return false;
    }
    return true;
  });
  for (const node of roots) parent.attach(node);
}

function findComponentRoot(parents: number[], vertex: number): number {
  let rootVertex = vertex;
  while (parents[rootVertex] !== rootVertex) rootVertex = parents[rootVertex];
  while (parents[vertex] !== vertex) {
    const next = parents[vertex];
    parents[vertex] = rootVertex;
    vertex = next;
  }
  return rootVertex;
}

function unionVertices(parents: number[], left: number, right: number): void {
  const leftRoot = findComponentRoot(parents, left);
  const rightRoot = findComponentRoot(parents, right);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
}

function componentIndex(index: ArrayLike<number>, vertexCount: number): Map<number, ConnectedComponent> {
  const parents = Array.from({ length: vertexCount }, (_, vertex) => vertex);
  for (let cursor = 0; cursor < index.length; cursor += 3) {
    unionVertices(parents, index[cursor], index[cursor + 1]);
    unionVertices(parents, index[cursor], index[cursor + 2]);
  }
  const components = new Map<number, ConnectedComponent>();
  for (let cursor = 0; cursor < index.length; cursor += 3) {
    const root = findComponentRoot(parents, index[cursor]);
    const component = components.get(root) || {
      indices: [],
      vertices: new Set<number>(),
      bounds: new THREE.Box3(),
    };
    for (let offset = 0; offset < 3; offset++) {
      const vertex = index[cursor + offset];
      component.indices.push(vertex);
      component.vertices.add(vertex);
    }
    components.set(root, component);
  }
  return components;
}

function updateComponentBounds(
  components: ReadonlyMap<number, ConnectedComponent>,
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  matrixWorld: THREE.Matrix4,
): void {
  const scratch = new THREE.Vector3();
  for (const component of components.values()) {
    for (const vertex of component.vertices) {
      scratch.fromBufferAttribute(positions, vertex).applyMatrix4(matrixWorld);
      component.bounds.expandByPoint(scratch);
    }
  }
}

function componentMatchesRule(component: ConnectedComponent, rule: ComponentSubsetRule): boolean {
  const vertexCount = component.vertices.size;
  if (rule.minVertices != null && vertexCount < rule.minVertices) return false;
  if (rule.maxVertices != null && vertexCount > rule.maxVertices) return false;
  if (rule.worldMinY != null && component.bounds.min.y < rule.worldMinY) return false;
  return rule.worldMaxY == null || component.bounds.max.y <= rule.worldMaxY;
}

function splitComponentIndices(
  components: ReadonlyMap<number, ConnectedComponent>,
  rule: ComponentSubsetRule,
): { readonly selected: number[]; readonly remaining: number[] } {
  const selected: number[] = [];
  const remaining: number[] = [];
  for (const component of components.values()) {
    (componentMatchesRule(component, rule) ? selected : remaining).push(...component.indices);
  }
  return { selected, remaining };
}

function compactSubsetGeometry(
  geometry: THREE.BufferGeometry,
  indices: readonly number[],
  vertexCount: number,
): THREE.BufferGeometry {
  const values = vertexCount > 0xffff ? new Uint32Array(indices) : new Uint16Array(indices);
  const indexed = geometry.clone();
  indexed.setIndex(new THREE.BufferAttribute(values, 1));
  const compact = indexed.toNonIndexed();
  indexed.dispose();
  compact.clearGroups();
  compact.computeBoundingBox();
  compact.computeBoundingSphere();
  return compact;
}

function splitMeshComponents(
  node: THREE.Mesh,
  rule: ComponentSubsetRule,
  label: string,
): { readonly subset: THREE.Mesh; readonly remainder: THREE.Mesh } | null {
  const index = node.geometry.index;
  const positions = node.geometry.attributes.position;
  if (!index || !positions || !node.parent) return null;
  node.updateWorldMatrix(true, false);
  const geometry = node.geometry;
  const components = componentIndex(index.array, positions.count);
  updateComponentBounds(components, positions, node.matrixWorld);
  const { selected, remaining } = splitComponentIndices(components, rule);
  if (!selected.length || !remaining.length) return null;
  const subsetGeometry = compactSubsetGeometry(geometry, selected, positions.count);
  const remainingGeometry = compactSubsetGeometry(geometry, remaining, positions.count);
  node.geometry = remainingGeometry;
  const subset = node.clone(false);
  subset.name = `${node.name}__${label}`;
  subset.geometry = subsetGeometry;
  node.parent.add(subset);
  return { subset, remainder: node };
}

// Split selected connected islands from one fused source mesh without
// changing the rendered whole. Some comparison prints collapse armor,
// fittings, and interior pieces into a generic Object_N mesh; a node-name
// regex alone cannot form an honest component mask. This remains strictly in
// the tool-only oracle loader and never supplies production geometry.
function extractConnectedSubset(
  root: THREE.Object3D,
  rule: ComponentSubsetRule,
  label: string,
): ConnectedSubset {
  if (!rule?.node) return { subsets: [], remainders: [] };
  const subsets: THREE.Mesh[] = [];
  const remainders: THREE.Mesh[] = [];
  for (const node of matchingNodes(root, rule.node)) {
    if (!(node instanceof THREE.Mesh)) continue;
    const split = splitMeshComponents(node, rule, label);
    if (!split) continue;
    subsets.push(split.subset);
    remainders.push(split.remainder);
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
function isEmissiveMaterial(material: THREE.Material): material is EmissiveMaterial {
  return material instanceof THREE.MeshLambertMaterial
    || material instanceof THREE.MeshPhongMaterial
    || material instanceof THREE.MeshStandardMaterial
    || material instanceof THREE.MeshToonMaterial;
}

function normalizeOracleMaterial(
  sourceMaterial: THREE.Material,
  mode: 'floor' | 'bright',
): THREE.Material {
  const material = sourceMaterial.clone();
  if (isEmissiveMaterial(material)) {
    if (mode === 'floor') {
      material.emissive.setRGB(0.24, 0.24, 0.24);
    } else {
      material.emissive.setHex(0xffffff);
      if (material.map) material.emissiveMap = material.map;
      material.emissiveIntensity = 4;
    }
  }
  if (mode === 'floor') material.side = THREE.DoubleSide;
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.needsUpdate = true;
  return material;
}

function replaceMeshMaterials(
  root: THREE.Object3D,
  mode: 'floor' | 'bright',
): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const replacements = materials.map((material) => normalizeOracleMaterial(material, mode));
    node.material = replacements.length === 1 ? replacements[0]! : replacements;
  });
}

function createReferenceRig(specId: string, yawOffset: number): ReferenceRig {
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
  const authoredFrame = new THREE.Group();
  authoredFrame.name = 'reference_authored_frame';
  authoredFrame.rotation.y = yawOffset;
  root.add(hull, turret, unclassified);
  hull.add(authoredFrame);
  turret.add(gun);
  return { root, hull, turret, gun, unclassified, authoredFrame };
}

function centerPathologicalScene(scene: THREE.Object3D): void {
  const rawBox = new THREE.Box3().setFromObject(scene);
  if (rawBox.isEmpty()) return;
  const center = rawBox.getCenter(new THREE.Vector3());
  const diagonal = rawBox.getSize(new THREE.Vector3()).length();
  if (Math.hypot(center.x, center.z) <= 0.35 * Math.max(diagonal, 1e-6)) return;
  scene.position.x -= center.x;
  scene.position.z -= center.z;
}

function subsetRules(cfg: ReferenceGlbConfig): ComponentSubsetRule[] {
  const rules: ComponentSubsetRule[] = [];
  if (cfg.turretComponentSubset) {
    rules.push({ ...cfg.turretComponentSubset, owner: 'turret' });
  }
  if (cfg.componentSubsets) rules.push(...cfg.componentSubsets);
  return rules;
}

function extractSemanticSubsets(
  scene: THREE.Object3D,
  cfg: ReferenceGlbConfig,
  unclassified: THREE.Group,
): Record<SemanticOwner, THREE.Mesh[]> {
  const semantic: Record<SemanticOwner, THREE.Mesh[]> = {
    turret: [],
    gun: [],
    unclassified: [],
  };
  const rules = subsetRules(cfg);
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    const owner: SemanticOwner = rule.owner || 'unclassified';
    const subset = extractConnectedSubset(scene, rule, `${owner}Subset${index}`);
    semantic[owner].push(...subset.subsets);
    if (rule.excludeRemainderFromHull) attachAll(unclassified, subset.remainders);
  }
  return semantic;
}

function seatTurretPivot(
  root: THREE.Group,
  turret: THREE.Group,
  turretNodes: readonly THREE.Object3D[],
  cfg: ReferenceGlbConfig,
): void {
  if (!cfg.autoPivot || !turretNodes.length) return;
  const pivot = Array.isArray(cfg.pivot)
    ? new THREE.Vector3().fromArray(cfg.pivot)
    : turretNodes[0].getWorldPosition(new THREE.Vector3());
  turret.position.copy(pivot);
  root.updateMatrixWorld(true);
}

function seatGunPivot(
  root: THREE.Group,
  turret: THREE.Group,
  gun: THREE.Group,
  gunNodes: readonly THREE.Object3D[],
  cfg: ReferenceGlbConfig,
): void {
  if (!cfg.autoPivot || !gunNodes.length) return;
  const pivotWorld = gunNodes[0].getWorldPosition(new THREE.Vector3());
  gun.position.copy(turret.worldToLocal(pivotWorld.clone()));
  root.updateMatrixWorld(true);
}

function applyParkedTurretYaw(
  root: THREE.Group,
  turret: THREE.Group,
  turretNodes: readonly THREE.Object3D[],
  turretYaw: number | undefined,
): void {
  if (!turretYaw) return;
  const clusterBox = new THREE.Box3();
  for (const node of turretNodes) clusterBox.expandByObject(node);
  if (clusterBox.isEmpty()) clusterBox.setFromObject(turret);
  if (clusterBox.isEmpty()) return;
  const pivot = clusterBox.getCenter(new THREE.Vector3());
  for (const child of turret.children) {
    child.position.x -= pivot.x;
    child.position.z -= pivot.z;
  }
  turret.rotation.y = Number(turretYaw);
  turret.position.x = pivot.x;
  turret.position.z = pivot.z;
  root.updateMatrixWorld(true);
}

function routeArticulatedComponents(
  scene: THREE.Object3D,
  rig: ReferenceRig,
  cfg: ReferenceGlbConfig,
): void {
  if (cfg.fixedMount || !cfg.turretNode) return;
  const semantic = extractSemanticSubsets(scene, cfg, rig.unclassified);
  const turretNodes = [...matchingNodes(scene, cfg.turretNode), ...semantic.turret];
  const turretFollowers = matchingNodes(scene, cfg.turretFollowers);
  seatTurretPivot(rig.root, rig.turret, turretNodes, cfg);
  attachAll(rig.turret, [...turretNodes, ...turretFollowers]);

  const gunNodes = [...matchingNodes(rig.root, cfg.gunNode), ...semantic.gun];
  const gunFollowers = matchingNodes(rig.root, cfg.gunFollowers);
  seatGunPivot(rig.root, rig.turret, rig.gun, gunNodes, cfg);
  attachAll(rig.gun, [...gunNodes, ...gunFollowers]);
  applyParkedTurretYaw(rig.root, rig.turret, turretNodes, cfg.turretYaw);
}

function normalizeReferenceWidth(root: THREE.Group, spec: ReferenceVehicleSpec | null | undefined): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const width = box.getSize(new THREE.Vector3()).x;
  const targetWidth = Number(spec?.dims?.widthM || 0);
  if (width <= 1e-6 || targetWidth <= 0) return;
  const scale = targetWidth / width;
  root.scale.setScalar(scale);
  root.position.y = -box.min.y * scale;
}

function applyOracleMaterialPolicy(root: THREE.Group, cfg: ReferenceGlbConfig): void {
  if (cfg.maskFloorOracle) replaceMeshMaterials(root, 'floor');
  if (cfg.brightenOracle) replaceMeshMaterials(root, 'bright');
}

export async function loadReferenceGlb(
  source: ReferenceGlbSource | null | undefined,
  specId: string,
  spec: ReferenceVehicleSpec | null | undefined,
): Promise<{ readonly root: THREE.Group; readonly specId: string }> {
  const cfg = source?.glb;
  if (!cfg?.path) throw new Error(`${specId} has no source GLB path`);

  const preservation = validatedPreservationOracle(source, specId);
  const loader = new GLTFLoader();
  const gltf = preservation ? await (async () => {
    const response = await fetch(cfg.path);
    if (!response.ok) throw new Error(`${specId}: preservation baseline unavailable`);
    const bytes = await response.arrayBuffer();
    await verifyPreservationBytes(bytes, preservation);
    return loader.parseAsync(bytes, '');
  })() : await loader.loadAsync(cfg.path);
  const rig = createReferenceRig(specId, Number(cfg.yawOffset || 0));
  // Off-origin print class (§5.248 ukraine finds: t80u_kursk diorama at
  // -1124u, t64bv_donbass at +4.2 m). An off-center model breaks every
  // subsequent origin-anchored rotation (yawOffset here, the page's
  // gun-forward flip) and blows the shared comparison frame apart, so
  // center the RAW footprint INSIDE the authored frame — before any yaw —
  // when its offset is pathological (> 0.35 of the model diagonal; every
  // near-centered print keeps its exact historical transform).
  if (!preservation) centerPathologicalScene(gltf.scene);
  rig.authoredFrame.add(gltf.scene);
  rig.root.updateMatrixWorld(true);
  routeArticulatedComponents(gltf.scene, rig, cfg);

  // Source files arrive in metres, centimetres, millimetres, or arbitrary
  // DCC units. Register on the published vehicle width before any scoring;
  // width is stable and is not inflated by the cannon or roof antennas.
  // A historical first-party baseline already has its exact authored metres,
  // origin and ground plane. Rescaling it would hide candidate scale drift.
  if (!preservation) normalizeReferenceWidth(rig.root, spec);

  // §5.317 (t95 WoT print): some textured rips carry near-black albedo
  // regions (gun / track bottoms / glacis) that fall under the gate's mask
  // threshold (red > 40) and read as silhouette HOLES — the ref's own
  // geometry vanishes from its masks (measured: the t95 print's plan-front
  // columns ended at the snout and its front-view bottoms floated at ~0.4 m).
  // maskFloorOracle adds a small constant emissive floor — geometry-neutral
  // and texture-preserving (the floor ADDS; maps stay visible) — so every
  // authored surface clears the threshold. Opt-in per registration; do not
  // combine with brightenOracle (its emissive×map product would re-darken).
  applyOracleMaterialPolicy(rig.root, cfg);

  // A few legacy source sheets bake almost all illumination into a very dark
  // albedo. Their silhouettes remain valid, but a shaded comparison becomes
  // unreadable. Opt-in emissive reuse reveals the authored texture without
  // replacing it or changing any geometry.
  rig.root.userData.__glbSwapped = true;
  rig.root.userData.__comparisonOracle = true;
  rig.root.updateMatrixWorld(true);
  return { root: rig.root, specId };
}
