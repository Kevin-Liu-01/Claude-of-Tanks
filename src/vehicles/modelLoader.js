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
// SEPv3 FIDELITY PASS (r5 critique): the raw asset carries several
// not-an-Abrams features — a second RWS on the loader's station, two tall
// deck stovepipes, boxy headlight towers on an upright front plate, a fin
// mast, and a K2-ish down-sloping turret front. applyModelFixes() carves
// those out of the merged meshes (triangle-index surgery in the shared raw
// coordinate frame: x lateral, -y forward, z up) and adds the missing
// recognition set (GPS doghouse forward-right, CITV pedestal forward-left,
// flat near-vertical DU cheek plates + flat roofline, fender lights).
// upgradeMaterials() clamps the M256 to a matte CARC-painted sleeve and kills
// the light-lens blowout; materials.applyCamoToModel composites the camo
// pattern onto the baked albedo in texture space (pattern tile + luminance-
// normalized detail overlay) so all garage patterns restyle the whole vehicle.
//
// Sync-from-cache path: tankFactory prefers applyGlbModelSync when the GLTF
// is already parsed (garage re-entry, icon generation) so freshly created
// tanks carry the GLB in the same frame; the async path covers first load.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// CAMO PATTERN SECTION: sourced models get the active camo pattern composited
// over their baked maps (materials.js owns pattern resolution + live
// re-painting on garage/biome switches); procedural add-on parts wear the
// shared camo canvas directly.
import { applyCamoToModel, getSharedCamoTexture } from './materials.js';

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

// ---------------------------------------------------------------------------
// SEPv3 fidelity surgery (m1a2 GLB). All coordinates are the asset's shared
// RAW frame (every node except the Sketchfab Z-up fix is identity): x lateral
// (+x = tank right), y longitudinal (-y = front), z up. One raw unit ≈ 0.80 m.
// ---------------------------------------------------------------------------

/** Delete every triangle whose centroid falls inside any of the AABBs.
 * Index-only surgery: vertices stay, so interleaved attributes are untouched.
 * Geometries are shared between clones — carve once, flag via userData. */
function carveTriangles(geo, boxes) {
  if (!geo.index || geo.userData.__carved) return;
  geo.userData.__carved = true;
  const idx = geo.index.array;
  const pos = geo.attributes.position;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    let inside = false;
    for (const [x0, x1, y0, y1, z0, z1] of boxes) {
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1 && cz >= z0 && cz <= z1) { inside = true; break; }
    }
    if (!inside) { keep.push(a, b, c); }
  }
  geo.setIndex(keep.length > 65535
    ? new THREE.BufferAttribute(new Uint32Array(keep), 1)
    : new THREE.BufferAttribute(new Uint16Array(keep), 1));
}

// 8-corner solid (plan rings bottom then top); normals from the flat faces.
function slab8(b0, b1, b2, b3, t0, t1, t2, t3) {
  const P = [];
  const quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad(b0, b1, t1, t0);
  quad(b1, b2, t2, t1);
  quad(b2, b3, t3, t2);
  quad(b3, b0, t0, t3);
  quad(t0, t1, t2, t3);
  quad(b3, b2, b1, b0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((P.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

// Box-projected UVs in the raw asset frame so add-on parts sample the shared
// camo canvas at the same world density as the composited plates. One raw
// unit ≈ 0.80 m on this asset (hull 9.89 units -> 7.93 m), camoScale 0.5.
const ADDON_UV_SCALE = 0.5 * 0.8;
function addOnUV(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }
    else if (nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u * ADDON_UV_SCALE; uv[i * 2 + 1] = v * ADDON_UV_SCALE;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Add-on part material: wears the live shared camo canvas directly, so the
 * corrections paint-match the composited GLB plates in every pattern. */
function addOnMaterial(spec) {
  return new THREE.MeshStandardMaterial({
    name: 'AddOnCamo', map: getSharedCamoTexture(spec),
    roughness: 0.82, metalness: 0.08,
  });
}

function addPart(parent, mat, geo, x = 0, y = 0, z = 0, ry = 0) {
  if (mat.map) addOnUV(geo);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Abrams-only geometry corrections, applied in the raw asset frame before
 * orientation/scale normalization. `turret` is the TurretPivot node (identity
 * transform, so children added here live in the same raw frame).
 */
function applyModelFixes(scene, turret, spec) {
  // ---- carve: not-an-Abrams clutter --------------------------------------
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const mn = (mat && mat.name) || '';
    if (mn === 'MainMetal_Props_NONE') {
      carveTriangles(o.geometry, [
        // second RWS on the loader's station (body + gun + mount bits)
        [-1.05, 0.15, 1.68, 2.40, 3.00, 4.20],
        // twin tall deck stovepipes + their drum bases (no Abrams has these)
        [1.42, 1.95, 3.42, 3.85, 2.70, 5.30],
        [-2.02, -1.52, 3.42, 3.85, 2.70, 5.30],
      ]);
    } else if (mn === 'material') {
      carveTriangles(o.geometry, [
        // sight/fin mast of the deleted second RWS (rear-left roof)
        [-0.85, -0.25, 0.70, 2.60, 3.35, 4.30],
        // thin fin blade forward-right (reads as a folded CIP, not SEPv3)
        [0.52, 0.82, -1.05, 0.65, 3.15, 4.30],
      ]);
    } else if (mn === 'DMainMetal_Props') {
      carveTriangles(o.geometry, [
        // hardware bits belonging to the deleted second RWS
        [-0.85, -0.25, 1.55, 2.10, 3.30, 3.90],
      ]);
    } else if (mn === 'MainMetal_LH') {
      if (o.geometry.attributes.position.count <= 32) {
        // headlight lens quads of the deleted towers
        o.visible = false;
      } else {
        carveTriangles(o.geometry, [
          // boxy twin headlight towers on the front plate (real SEPv3 carries
          // small service lights on the fenders — kept, they're separate parts)
          [-1.10, -0.55, -3.92, -3.58, 1.48, 1.78],
          [0.92, 1.50, -3.92, -3.58, 1.48, 1.78],
        ]);
      }
    }
  });

  // ---- add: the SEPv3 recognition set -------------------------------------
  // Snug fit against the measured shell profile (plan half-width runs
  // ~0.7 @ y-2.6 -> ~1.65 @ y-1.7 -> ~2.0 @ y-1.0; roof z rises 2.85 -> 3.29).
  const mat = addOnMaterial(spec);
  const seg = 20;

  // Flat, near-vertical DU cheek plates proud of the sloping wedge front:
  // they square the K2-ish nose into the Abrams' vertical faceted cheeks.
  // TWO plan segments per side — front cheek + angled side shoulder — both
  // outside the shell's bulging plan (the single-segment version let a baked
  // white CIP facet poke through as a blinding triangle).
  const cheekSeg = (s, Ax, Ay, Bx, By, ztA, ztB) => {
    const len = Math.hypot(Bx - Ax, By - Ay);
    const nx = s * ((By - Ay) / len), ny = -s * ((Bx - Ax) / len); // face perp
    const A = [s * Ax, -Ay], B = [s * Bx, -By];
    const A2 = [s * Ax - nx * 0.16, -(Ay - ny * 0.16)], B2 = [s * Bx - nx * 0.16, -(By - ny * 0.16)];
    // keep plan winding clockwise on both sides (mirroring flips it otherwise)
    const ring = s > 0 ? [A, B, B2, A2] : [B, A, A2, B2];
    const zt = (p) => (p === A || p === A2 ? ztA : ztB);          // sloped top edge
    const g = slab8(
      [ring[0][0], 2.12, ring[0][1]], [ring[1][0], 2.12, ring[1][1]], [ring[2][0], 2.12, ring[2][1]], [ring[3][0], 2.12, ring[3][1]],
      [ring[0][0], zt(ring[0]), ring[0][1]], [ring[1][0], zt(ring[1]), ring[1][1]], [ring[2][0], zt(ring[2]), ring[2][1]], [ring[3][0], zt(ring[3]), ring[3][1]],
    );
    // slab8 was authored in (x, y, z-forward) terms; rotate into the raw frame
    // (z up, -y forward): x stays, yUp -> z, zFwd -> -y.
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    return g;
  };
  for (const s of [-1, 1]) {
    addPart(turret, mat, cheekSeg(s, 0.72, -2.66, 1.72, -1.93, 2.84, 2.92)); // front cheek
    addPart(turret, mat, cheekSeg(s, 1.70, -1.97, 2.06, -1.26, 2.92, 3.02)); // side shoulder
  }

  // Near-level roofline cap over the wedge nose: reads as the Abrams' flat
  // roof running forward to the cheek tops (gentle 6-ish° slope, no eaves).
  // The center strip forward of the trunnion stays OPEN so the elevated gun
  // and mantlet never punch through the plate (embrasure recess).
  {
    // roof slope line: stays just ABOVE the shell's rising wedge roof all the
    // way back (shell z 2.98 @ y-1.45, 3.12 @ y-0.45) so no baked-glossy strip
    // of the old sloping nose pokes through the new flat roofline
    const zB = (y) => 2.82 + 0.34 * ((y + 2.55) / 2.1);
    const mkCap = (ring) => {
      const g = slab8(
        ...ring.map(([x, y]) => [x, zB(y), -y]),
        ...ring.map(([x, y]) => [x, zB(y) + 0.07, -y]),
      );
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      addPart(turret, mat, g);
    };
    // wings over the cheeks (clockwise plan rings per side)
    mkCap([[0.58, -2.55], [0.82, -2.55], [1.90, -0.45], [0.58, -0.45]]);
    mkCap([[-0.82, -2.55], [-0.58, -2.55], [-0.58, -0.45], [-1.90, -0.45]]);
    // center strip behind the embrasure recess
    mkCap([[-0.58, -1.58], [0.58, -1.58], [0.58, -0.45], [-0.58, -0.45]]);
  }

  // GPS doghouse (gunner's primary sight) forward-right: angular box with a
  // recessed dark window + shutter brow, seated on the new roof plane.
  {
    const dark = new THREE.MeshStandardMaterial({
      name: 'AddOnDark', color: 0x15181a, roughness: 0.5, metalness: 0.3 });
    const bx = 0.72, by = -1.75;
    addPart(turret, mat, new THREE.BoxGeometry(0.60, 0.52, 0.40), bx, by, 3.14);
    addPart(turret, mat, new THREE.BoxGeometry(0.64, 0.28, 0.07), bx, by - 0.16, 3.31); // brow
    addPart(turret, dark, new THREE.BoxGeometry(0.46, 0.05, 0.18), bx, by - 0.26, 3.16); // window
    // CITV pedestal + rotating head forward-left (hunter-killer sight)
    const cx = -0.85, cy = -0.90;
    addPart(turret, mat, new THREE.CylinderGeometry(0.16, 0.19, 0.22, seg)
      .rotateX(Math.PI / 2), cx, cy, 3.14);
    addPart(turret, mat, new THREE.CylinderGeometry(0.135, 0.135, 0.26, seg)
      .rotateX(Math.PI / 2), cx, cy, 3.38);
    addPart(turret, mat, new THREE.BoxGeometry(0.32, 0.34, 0.28), cx, cy, 3.64);
    addPart(turret, dark, new THREE.BoxGeometry(0.22, 0.05, 0.15), cx, cy - 0.18, 3.64); // mirror window
  }

  // Fender service lights replacing the deleted towers: small drums with a
  // dim lens on each front fender corner. Parented next to the turret pivot's
  // sibling meshes (node inside the Z-up fix) so raw coords apply.
  {
    const hullParent = turret.parent || scene;
    // matte near-black lens: a glossy cap catches a blinding daylight
    // specular streak (the r5 "headlight blowout")
    const lens = new THREE.MeshStandardMaterial({
      name: 'AddOnLens', color: 0x22261f, roughness: 0.6, metalness: 0.15 });
    for (const s of [-1, 1]) {
      const x = s < 0 ? -1.55 : 1.92;
      // unrotated cylinder axis = raw y = longitudinal: drum faces forward
      addPart(hullParent, mat, new THREE.CylinderGeometry(0.085, 0.095, 0.16, 12), x, -3.62, 1.86);
      addPart(hullParent, lens, new THREE.CylinderGeometry(0.065, 0.065, 0.03, 12), x, -3.70, 1.86);
    }
  }
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
      if (m.emissive) { m.emissive.setRGB(0, 0, 0); m.emissiveIntensity = 0; }
      const name = m.name || '';
      if (/guns/i.test(name)) {
        // The M256 wears a matte CARC-painted thermal sleeve — never bare
        // polished steel (r5: "chrome barrel"). The baked metallicRoughness
        // map holds near-zero gloss pockets that defeat scalar clamps, so it
        // goes entirely; the camo composite repaints the textured tube and
        // untextured breech parts get a CARC tint.
        m.roughnessMap = null;
        m.metalnessMap = null;
        m.roughness = 0.74;
        m.metalness = 0.16;
        if (!m.map && m.color) m.color.setRGB(0.3, 0.32, 0.26);
      } else if (/^light$/i.test(name)) {
        // Lens strips: dim glass, no daylight blowout (r5 headlight critique).
        m.roughness = 0.3;
        m.metalness = 0.4;
        if (m.color) m.color.setRGB(0.22, 0.24, 0.22);
      } else if (/rot|armor|shield/i.test(name)) {
        // turret shell / applique / skirts: matte CARC — baked glossy pockets
        // (vision blocks etc.) fired a blinding sky glint off the roof inside
        // the embrasure; drop the maps, not just the scalars.
        m.roughnessMap = null;
        m.metalnessMap = null;
        m.roughness = 0.72;
        m.metalness = 0.18;
      }
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

  // ---- fidelity surgery in the raw asset frame (before orient/scale) ----
  if (spec.id === 'm1a2') applyModelFixes(scene, turret, spec);

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
  // camo: texture-space pattern composite onto the asset's baked albedo
  // (materials.js owns it — pattern tile + luminance-normalized grayscale
  // detail overlay + alpha restore; weathering/AO preserved).
  // Live when the garage picker or an AUTO biome switch changes the pattern.
  applyCamoToModel(scene, spec, s);

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
