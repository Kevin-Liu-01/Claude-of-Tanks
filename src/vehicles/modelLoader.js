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
// 2026-07 scouting verdict: every permissively-licensed candidate found on the
// allowed sources (poly.pizza, kenney.nl, opengameart.org, GitHub) was either
// (a) not recognizable as the specific real tank (poly.pizza carries only
// stylized generic "Tank" models), (b) a single fused mesh with no turret node
// (all three GLB candidates inspected), or (c) a .blend file unloadable by
// GLTFLoader (opengameart's Tiger/T-34-85/Abrams). All 8 tanks therefore ship
// with source 'procedural' in specs.js; this loader is the ready path for any
// future GLB that passes the bar.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _loader = new GLTFLoader();
const _cache = new Map(); // url -> Promise<GLTF>

function loadGltf(url) {
  if (!_cache.has(url)) {
    _cache.set(url, new Promise((res, rej) => _loader.load(url, res, undefined, rej)));
  }
  return _cache.get(url);
}

/** Case-insensitive node search by regex over names. */
function findNode(root, re) {
  let hit = null;
  root.traverse((o) => { if (!hit && re.test(o.name)) hit = o; });
  return hit;
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
 *                                 regex sources; sensible defaults below)
 * @param {THREE.Group} ctx.hullG  hull group (procedural children hidden, GLB hull added)
 * @param {THREE.Group} ctx.turretG turret yaw group
 * @param {THREE.Group} ctx.recoilG gun recoil group
 * @returns {Promise<boolean>}
 */
export async function applyGlbModel({ spec, cfg, hullG, turretG, recoilG }) {
  const gltf = await loadGltf(cfg.path);
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
  const bb = new THREE.Box3().setFromObject(scene);
  const size = bb.getSize(new THREE.Vector3());
  // Uniform scale: match hull length (z); overallLength includes gun overhang,
  // so prefer hullLengthM when the gun node is separable.
  const targetLen = gun ? spec.dims.hullLengthM : spec.dims.overallLengthM;
  const s = targetLen / Math.max(size.z, 1e-3);
  scene.scale.setScalar(s);
  scene.position.y = -bb.min.y * s;                       // ground at y=0
  scene.position.x = -(bb.min.x + bb.max.x) / 2 * s;      // center in plan
  scene.position.z = -(bb.min.z + bb.max.z) / 2 * s;
  scene.updateMatrixWorld(true);

  upgradeMaterials(scene);

  // ---- re-parent turret (and gun) into the articulation groups, preserving
  // world transforms relative to the normalized scene ----
  const reparent = (node, group) => {
    node.updateMatrixWorld(true);
    const m = node.matrixWorld.clone();
    group.updateMatrixWorld(true);
    m.premultiply(group.matrixWorld.clone().invert());
    node.removeFromParent();
    m.decompose(node.position, node.quaternion, node.scale);
    group.add(node);
  };
  if (gun) reparent(gun, recoilG);
  reparent(turret, turretG);

  // ---- swap: hide procedural render meshes, keep anchors/instancing intact ----
  for (const g of [hullG, turretG, recoilG]) {
    for (const child of g.children) {
      if (child !== turret && child !== gun && (child.isMesh || child.isLOD || child.isInstancedMesh)) {
        child.visible = false;
      }
    }
  }
  hullG.add(scene);
  return true;
}
