// src/vehicles/modelLoader.js — sourced-GLB pipeline for the 8-tank roster.
//
// Loads a locally-committed GLB (public/models/tanks/*.glb — NO network/CDN at
// runtime beyond our own origin), normalizes scale/orientation to the real
// vehicle dimensions in specs.js (which derive from docs/research/tank-roster.md),
// runs a material upgrade pass, and re-parents the turret/gun nodes into the
// articulation groups built by tankFactory.createTank so turret yaw / gun pitch
// / recoil keep working.
//
// HARD REQUIREMENT (asset-scout charter): a sourced model MUST have an
// identifiable turret node (and ideally a gun node) that can be re-parented.
// If none is found the load REJECTS and the caller keeps the procedural model —
// a non-articulable turret loses automatically.
//
// Deep-hunt verdict 2026-07: ONE sourced model beat its procedural
// counterpart — "Abrams M1A2 SEPv3" by dannzjs (CC-BY-4.0, see
// docs/ATTRIBUTION.md), preprocessed offline into
// public/models/tanks/m1a2_sepv3_dannzjs.glb with TurretPivot/GunPivot
// grouping baked in. The other 7 tanks remain procedural: every other
// permissively-licensed candidate was either not recognizable as the specific
// real tank, had no articulable turret, or carried no usable materials.
//
// Sync-from-cache path: tankFactory prefers applyGlbModelSync when the GLTF
// is already parsed (garage re-entry, icon generation) so freshly created
// tanks carry the GLB in the same frame; the async path covers first load.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// CAMO PATTERN SECTION: sourced models get the active camo pattern as a tint
// overlay (materials.js owns pattern resolution + live re-tinting).
import { applyCamoToModel } from './materials.js';

const _loader = new GLTFLoader();
const _cache = new Map();    // url -> Promise<GLTF>
const _resolved = new Map(); // url -> GLTF (parse finished; sync path usable)

// Headless-tooling hook (tools/genIcons.mjs): pending-load bookkeeping so the
// icon generator can wait for GLB availability, then re-create tanks and get
// the synchronous swap.
const _stats = { started: 0, settled: 0 };
if (typeof window !== 'undefined') window.__GLB_STATS = _stats;

function loadGltf(url) {
  if (!_cache.has(url)) {
    _stats.started++;
    _cache.set(url, new Promise((res, rej) => _loader.load(url, (g) => {
      _resolved.set(url, g);
      _stats.settled++;
      res(g);
    }, undefined, (e) => { _stats.settled++; rej(e); })));
  }
  return _cache.get(url);
}

/** True when the GLB is parsed and applyGlbModelSync can run. */
export function hasCachedGlb(url) { return _resolved.has(url); }

/** Case-insensitive node search by regex over names. */
function findNode(root, re) {
  let hit = null;
  root.traverse((o) => { if (!hit && re.test(o.name)) hit = o; });
  return hit;
}

/** Bounding box of root EXCLUDING one subtree (gun overhang must not skew the
 * hull-length scale normalization). Box3.setFromObject can't skip subtrees. */
function bboxExcluding(root, skip) {
  const box = new THREE.Box3();
  const skipSet = new Set();
  if (skip) skip.traverse((o) => skipSet.add(o));
  const g = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (skipSet.has(o) || !o.isMesh || !o.geometry) return;
    if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox();
    g.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(g);
  });
  return box;
}

/**
 * Material upgrade pass: correct color space, roughness/metalness sanity,
 * shadow flags. Sourced low-poly assets frequently arrive with metalness 1 /
 * roughness 0 defaults or linear-tagged albedo maps; clamp into the game's
 * PBR envelope so they sit in the same lighting as the procedural fleet.
 */
function upgradeMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.35);
      if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 1, 0.55);
      if (m.emissive && m.emissiveIntensity > 1) m.emissiveIntensity = 1;
    }
  });
}

/** Core swap, fully synchronous once the parsed GLTF is in hand. */
function applySwap(gltf, { spec, cfg, hullG, turretG, recoilG }) {
  const scene = gltf.scene.clone(true);

  // ---- articulation gate ----
  const turret = findNode(scene, new RegExp(cfg.turretNode || 'turret', 'i'));
  if (!turret) {
    throw new Error(`glb model for ${spec.id} has no articulable turret node — keeping procedural`);
  }
  const gun = findNode(turret, new RegExp(cfg.gunNode || 'gun|barrel|cannon', 'i'));

  // ---- orient, then scale/ground to real dimensions ----
  scene.rotation.y = cfg.yawOffset || 0;
  scene.updateMatrixWorld(true);
  // Hull-only box for the scale: the gun overhang would otherwise shrink the
  // whole vehicle by the barrel length (m1a2: -22%).
  const hullBB = gun ? bboxExcluding(scene, gun) : bboxExcluding(scene, null);
  const size = hullBB.getSize(new THREE.Vector3());
  const targetLen = gun ? spec.dims.hullLengthM : spec.dims.overallLengthM;
  const s = targetLen / Math.max(size.z, 1e-3);
  scene.scale.setScalar(s);
  scene.position.y = -hullBB.min.y * s;                       // ground at y=0
  scene.position.x = -(hullBB.min.x + hullBB.max.x) / 2 * s;  // center in plan
  scene.position.z = -(hullBB.min.z + hullBB.max.z) / 2 * s;
  scene.updateMatrixWorld(true);

  upgradeMaterials(scene);
  // camo overlay/tint: respects the asset's baked weathering (albedo maps are
  // kept; hull materials are tinted toward the pattern base color) and stays
  // live when the garage picker or an AUTO biome switch changes the pattern.
  applyCamoToModel(scene, spec);

  // ---- re-parent turret (and gun) into the articulation groups ----
  // The swap can land while the tank is already posed in the world (async
  // load, terrain tilt, yawed turret), so the relative math must run with
  // BOTH nodes in the same tree and the articulation groups at neutral:
  // attach the GLB under hullG first, zero yaw/pitch/recoil, bake, restore.
  hullG.add(scene);
  const gunG = recoilG.parent && recoilG.parent !== turretG ? recoilG.parent : null;
  const saved = {
    ty: turretG.rotation.y, gx: gunG ? gunG.rotation.x : 0, rz: recoilG.position.z,
  };
  turretG.rotation.y = 0;
  if (gunG) gunG.rotation.x = 0;
  recoilG.position.z = 0;
  // One consistent matrix refresh over the whole tank subtree — any stale
  // world component above the tank root cancels in the inverse product.
  const tankRoot = hullG.parent || hullG;
  tankRoot.updateMatrixWorld(true);
  const reparent = (node, group) => {
    const m = node.matrixWorld.clone();
    m.premultiply(group.matrixWorld.clone().invert());
    node.removeFromParent();
    m.decompose(node.position, node.quaternion, node.scale);
    group.add(node);
  };
  if (gun) reparent(gun, recoilG);
  reparent(turret, turretG);
  turretG.rotation.y = saved.ty;
  if (gunG) gunG.rotation.x = saved.gx;
  recoilG.position.z = saved.rz;

  // ---- swap: hide procedural render meshes, keep anchors/instancing intact.
  // gunG (recoilG's parent) carries the procedural mantlet (gunMount bucket)
  // and must be swept too.
  for (const g of [hullG, turretG, recoilG, ...(gunG ? [gunG] : [])]) {
    for (const child of g.children) {
      if (child !== turret && child !== gun && child !== recoilG && child !== scene &&
          (child.isMesh || child.isLOD || child.isInstancedMesh)) {
        child.visible = false;
      }
    }
  }
  return true;
}

/**
 * Synchronous swap when the GLB is already parsed (see hasCachedGlb).
 * @returns {boolean} true when applied
 */
export function applyGlbModelSync(ctx) {
  const gltf = _resolved.get(ctx.cfg.path);
  if (!gltf) return false;
  return applySwap(gltf, ctx);
}

/**
 * Swap a sourced GLB in place of the procedural meshes of a TankVisual.
 * Called (fire-and-forget) by tankFactory.createTank when the spec's model
 * source is 'glb'. Resolves true on success; rejects (procedural retained)
 * when the asset fails the articulation requirement.
 *
 * @param {object} ctx
 * @param {object} ctx.spec        TankSpec (specs.js)
 * @param {object} ctx.cfg         spec.model.glb config: { path, yawOffset?,
 *                                 turretNode?, gunNode? } (node fields are
 *                                 regex sources; sensible defaults above)
 * @param {THREE.Group} ctx.hullG  hull group (procedural children hidden, GLB hull added)
 * @param {THREE.Group} ctx.turretG turret yaw group
 * @param {THREE.Group} ctx.recoilG gun recoil group
 * @returns {Promise<boolean>}
 */
export async function applyGlbModel(ctx) {
  const gltf = await loadGltf(ctx.cfg.path);
  return applySwap(gltf, ctx);
}
