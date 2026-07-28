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
// COMMUNITY TANKS: bone-rigged assets (recon_tank turret/barrel bones,
// quaternius track rig) need skeleton-aware cloning — Object3D.clone leaves
// the cloned SkinnedMeshes bound to the ORIGINAL scene's bones (verts render
// unscaled at the origin / vanish). SkeletonUtils.clone retargets them.
import { clone as cloneWithSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
// COMMUNITY TANKS r8: crease-aware normal smoothing for faceted low-poly
// assets (Newc42 octagonal road wheels shaded as hard 45° facets — "octagon
// wheels" critique). 47° crease smooths wheel rims/cylinders while keeping
// hull plate corners (>=60°) sharp.
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// CAMO PATTERN SECTION: sourced models get the active camo pattern composited
// over their baked maps (materials.js owns pattern resolution + live
// re-painting on garage/biome switches); procedural add-on parts wear the
// shared camo canvas directly.
import {
  applyCamoToModel, getSharedCamoTexture, getSharedRoughnessTexture,
  getCommunityGearMaterials, vehicleAmbientFloorHook,
} from './materials.js';

const _loader = new GLTFLoader();
const _cache = new Map();    // url -> Promise<GLTF>
const _resolved = new Map(); // url -> GLTF (parse finished; sync path usable)

// Headless-tooling hook (tools/genIcons.mjs): pending-load bookkeeping so the
// icon generator can wait for GLB availability, then re-create tanks and get
// the synchronous swap.
const _stats = { started: 0, settled: 0 };
if (typeof window !== 'undefined') window.__GLB_STATS = _stats;

// ---------------------------------------------------------------------------
// PERF (performance_budget r4, docs/perf-r3.json remainingKnownHitch): the
// GLTF parse + swap + first-render program compile/texture upload used to run
// the moment the async fetch resolved — a ~200 ms main-thread hitch that
// landed INSIDE combat frames (probe: 55-773 ms frames t=5-15 s as sourced-GLB
// textures/programs bound mid-battle). All main-thread GLB work now goes
// through a battle-safe idle queue:
//   - the network fetch starts immediately (no main-thread cost),
//   - parse and swap wait until game.phase !== 'battle', and run at most ONE
//     job per idle callback so garage/end-screen frames absorb single hitches,
//   - after a swap lands, its textures are uploaded (renderer.initTexture) and
//     programs compiled (renderer.compile) in the SAME idle slot, so the next
//     rendered frame pays no first-use GPU binds.
// Battles simply keep the procedural stand-in until the next safe moment
// (garage, end screen, shot staging) — a AAA frame gate never trades a live
// combat frame for an asset upgrade. Screenshot staging is phase 'shot', so
// the queue drains during the harness's settle window.
const _idleQueue = [];
let _idlePumpScheduled = false;

function inBattle() {
  try {
    const D = typeof window !== 'undefined' ? window.__DEBUG : null;
    return !!(D && D.game && D.game.phase === 'battle');
  } catch (_) { return false; }
}

function pumpIdle() {
  _idlePumpScheduled = false;
  if (!_idleQueue.length) return;
  let ran = false;
  if (!inBattle()) {
    const job = _idleQueue.shift();
    ran = true;
    try { job.res(job.fn()); } catch (e) { job.rej(e); }
  }
  scheduleIdlePump(ran);
}

function scheduleIdlePump(afterJob = false) {
  if (_idlePumpScheduled || !_idleQueue.length) return;
  _idlePumpScheduled = true;
  // After RUNNING a job, space the next one out on wall clock: chained idle
  // callbacks can run back-to-back inside one rAF gap, and draining a full
  // queue that way measured a 4.3 s frozen frame at battle end. 300 ms spacing
  // guarantees rendered frames between jobs (a drain of the whole 9-GLB queue
  // spreads over ~3 s of end-screen/garage time instead of one freeze).
  if (afterJob) setTimeout(pumpIdle, 300);
  else if (typeof requestIdleCallback === 'function') requestIdleCallback(pumpIdle, { timeout: 350 });
  else setTimeout(pumpIdle, 80);
}

/** Run `fn` in the next out-of-battle idle slot (one job per slot). */
function idleGate(fn) {
  return new Promise((res, rej) => {
    _idleQueue.push({ fn, res, rej });
    scheduleIdlePump();
  });
}

/** Pre-upload the swapped subtree's textures and compile its programs against
 * the live scene NOW (inside the idle slot) so the next rendered frame pays
 * no first-use texture upload / shader compile. Best-effort. */
function warmSwappedModel(ctx) {
  try {
    const D = typeof window !== 'undefined' ? window.__DEBUG : null;
    if (!D || !D.renderer) return;
    let root = ctx.hullG;
    while (root.parent) root = root.parent;
    ctx.hullG.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) { try { D.renderer.initTexture(v); } catch (_) { /* fine */ } }
        }
      }
    });
    if (root.isScene && D.camera) D.renderer.compile(root, D.camera);
    else if (D.scene && D.camera) D.renderer.compile(ctx.hullG, D.camera, D.scene);
  } catch (_) { /* warm-up only — never block the swap */ }
}

function loadGltf(url) {
  if (!_cache.has(url)) {
    _stats.started++;
    _cache.set(url, (async () => {
      let buf;
      try {
        // fetch immediately (network only); the parse is the main-thread cost
        // and waits for a battle-safe idle slot.
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        buf = await resp.arrayBuffer();
      } catch (e) {
        _stats.settled++;
        throw e;
      }
      try {
        const g = await idleGate(() => new Promise((res, rej) => {
          _loader.parse(buf, url.slice(0, url.lastIndexOf('/') + 1), res, rej);
        }));
        _resolved.set(url, g);
        _stats.settled++;
        return g;
      } catch (e) {
        _stats.settled++;
        throw e;
      }
    })());
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
    } else if (mn === 'Radiator') {
      // two large circular deck fans — no Abrams variant carries these
      // (r6 critique); replaced by flat rectangular grille panels below
      o.visible = false;
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
  // r9: front cheek edge pulled back (0.72,-2.66 -> 0.86,-2.50) and its top
  // dropped a step — the old plate's forward-top corner overhung the mantlet
  // and read as a pointed slab glitch at closeup (judged critique).
  for (const s of [-1, 1]) {
    addPart(turret, mat, cheekSeg(s, 0.86, -2.50, 1.72, -1.93, 2.80, 2.92)); // front cheek
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
    // r9: wing tips pulled back with the trimmed cheeks (-2.55 -> -2.42)
    mkCap([[0.58, -2.42], [0.82, -2.42], [1.90, -0.45], [0.58, -0.45]]);
    mkCap([[-0.82, -2.42], [-0.58, -2.42], [-0.58, -0.45], [-1.90, -0.45]]);
    // center strip behind the embrasure recess
    mkCap([[-0.58, -1.58], [0.58, -1.58], [0.58, -0.45], [-0.58, -0.45]]);
  }

  // GPS doghouse (gunner's primary sight) forward-right: angular box with a
  // recessed dark window + shutter brow, seated on the new roof plane.
  {
    const dark = new THREE.MeshStandardMaterial({
      name: 'AddOnDark', color: 0x15181a, roughness: 0.68, metalness: 0.14 });
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

  // Bustle-rack soft stowage (r9 minor): the asset's rack contents are bare
  // rectangular slabs — lay a few rounded tarp/duffel lumps with dark strap
  // rings over them so the rack reads packed with crew gear. Raw turret-local
  // coords measured by ray probe: rack wall x ±2.03, contents y 1.7..3.1,
  // tops z ~2.8.
  {
    const cloth = new THREE.MeshStandardMaterial({
      name: 'AddOnCloth', color: 0x555038, roughness: 0.96, metalness: 0.0 });
    const cloth2 = new THREE.MeshStandardMaterial({
      name: 'AddOnCloth2', color: 0x4a4d3a, roughness: 0.96, metalness: 0.0 });
    const strap = new THREE.MeshStandardMaterial({
      name: 'AddOnStrap_addon', color: 0x23241f, roughness: 0.9, metalness: 0.05 });
    const duffels = [
      // [x, y, z, len, r, yaw, mat]
      [-1.05, 2.35, 2.88, 1.15, 0.20, 0.10, cloth],
      [0.35, 2.30, 2.92, 1.30, 0.22, -0.06, cloth2],
      [1.35, 2.45, 2.84, 0.85, 0.17, 0.22, cloth],
      [-0.35, 2.95, 2.80, 1.05, 0.18, -0.14, cloth2],
    ];
    for (const [dx, dy, dz, len, r, yaw, cm] of duffels) {
      const cap = new THREE.CapsuleGeometry(r, len, 6, 12).rotateZ(Math.PI / 2).rotateY(yaw);
      const m = addPart(turret, cm, cap, dx, dy, dz);
      m.rotation.z = (dx * 7.3) % 0.14 - 0.07;      // slight settle lean
      for (const f of [-0.28, 0.3]) {
        addPart(turret, strap,
          new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.05, 12).rotateZ(Math.PI / 2).rotateY(yaw),
          dx + Math.cos(yaw) * f * len, dy - Math.sin(yaw) * f * len, dz);
      }
    }
  }

  // Rear engine deck: flat rectangular grille panels where the carved-out
  // circular fans sat (real SEPv3 deck is flat panels with transverse louver
  // grilles). Base plate wears the camo; recessed dark louver bars on top.
  {
    const hullParent2 = turret.parent || scene;
    const grillDark = new THREE.MeshStandardMaterial({
      name: 'AddOnGrille', color: 0x191c18, roughness: 0.85, metalness: 0.12 });
    const gx = 0.19, gy = 4.77;                       // carved fan footprint center
    addPart(hullParent2, mat, new THREE.BoxGeometry(2.5, 1.04, 0.05), gx, gy, 2.22);
    for (let k = 0; k < 6; k++) {
      addPart(hullParent2, grillDark, new THREE.BoxGeometry(2.34, 0.09, 0.05),
        gx, gy - 0.44 + k * 0.176, 2.235);
    }
    // panel split seams so the deck reads as serviceable hatches
    addPart(hullParent2, grillDark, new THREE.BoxGeometry(0.03, 1.0, 0.052), gx, gy, 2.235);
  }

  // M256 bore evacuator + muzzle reference sensor collar (r8 minor critique:
  // the asset's tube is a bare smooth cylinder — the evacuator bulge is the
  // first thing a WoT remodel audience checks on an Abrams gun). Built from
  // the measured gun-subtree bbox in the raw frame (barrel runs along -y),
  // parented to the gun node so it pitches/recoils with the tube.
  {
    const gun = findNode(turret, /GunPivot/i) || findNode(scene, /GunPivot/i);
    if (gun) {
      const bb = new THREE.Box3();
      gun.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (o.geometry.boundingBox === null) o.geometry.computeBoundingBox();
        bb.union(o.geometry.boundingBox);
      });
      if (!bb.isEmpty()) {
        const minY = bb.min.y;
        // tube center at the muzzle: average the verts of the last half-unit
        let sx = 0, sz = 0, sn = 0;
        gun.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i += 5) {
            if (pos.getY(i) < minY + 0.5) { sx += pos.getX(i); sz += pos.getZ(i); sn++; }
          }
        });
        const cx = sn ? sx / sn : 0, cz = sn ? sz / sn : 3.0;
        const evacY = minY + 0.42 * (-2.7 - minY);   // ~42% back from the muzzle
        addPart(gun, mat, new THREE.CylinderGeometry(0.205, 0.205, 0.60, seg), cx, evacY, cz);
        addPart(gun, mat, new THREE.CylinderGeometry(0.205, 0.150, 0.17, seg), cx, evacY - 0.38, cz);
        addPart(gun, mat, new THREE.CylinderGeometry(0.150, 0.205, 0.17, seg), cx, evacY + 0.38, cz);
        addPart(gun, mat, new THREE.CylinderGeometry(0.175, 0.175, 0.15, seg), cx, minY + 0.32, cz); // MRS collar
      }
    }
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

// COMMUNITY TANKS: box-projected UVs in the asset's raw frame at the shared
// camo canvas world density (uv = raw * camoScale * normScale), so untextured
// CAD/flat-color models sample the live per-spec camo like procedural hulls.
function boxUVRaw(geo, scale) {
  if (geo.userData.__cotBoxUV) return;
  geo.userData.__cotBoxUV = true;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }
    else if (nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * COMMUNITY TANKS material-upgrade pass for untextured / palette-atlas
 * assets (r7 rework):
 *  - meshes whose NODE name marks them as running gear take shared dark gear
 *    materials — tracks worn steel, wheel dishes scheme-painted solid — so
 *    CAD and low-poly models stop rendering "all one green" with zero
 *    material separation;
 *  - tiny palette-atlas maps (Newc42 8x1 colorAtlas: every face samples ONE
 *    texel, so the texture-space camo composite can never show a pattern —
 *    'Desert' rendered flat chocolate) are STRIPPED and the shell box-UV'd
 *    onto the live camo canvas;
 *  - untextured painted materials also take the camo canvas, with the shared
 *    roughness map for micro variation (the flat constant read waxy);
 *  - very dark flat mats (bare hardware) keep their factory color — the
 *    'addon' marker opts them out of materials.js's plain-tint pass.
 */
// r8 cohesion pass shared by all paintUntextured (CAD / low-poly) assets:
//  - crease-aware smooth normals (faceted octagon wheels -> round shading);
//  - baked per-vertex dust/AO gradient in WORLD y (the same language as the
//    procedural fleet's bakeDirt) so community models stop reading as
//    pristine pastel clay next to the weathered core roster.
// Geometry is shared between clones — process once, flag via userData.
const CREASE_ANGLE = (47 * Math.PI) / 180;
function refineCommunityGeometry(o) {
  const src = o.geometry;
  if (!src) return;
  // clones share the source GLTF geometry: reuse the refined copy
  if (src.userData.__cotRefinedGeo) { o.geometry = src.userData.__cotRefinedGeo; return; }
  if (src.userData.__cotRefinedSelf) return;
  let geo = src;
  if (!o.isSkinnedMesh && src.attributes.position.count < 200000) {
    try {
      geo = toCreasedNormals(src, CREASE_ANGLE);
      geo.userData = {};
    } catch (e) { geo = src; /* exotic attribute layout — keep original shading */ }
  }
  // vertex dirt: world-space vertical dust gradient + downward-face AO
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  o.updateWorldMatrix(true, false);
  const m = o.matrixWorld;
  const e = m.elements;
  const sy = Math.hypot(e[1], e[5], e[9]) || 1;   // world scale of local y (approx)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const t = Math.min(1, Math.max(0, (1.45 - wy) / 1.45));
    const d = Math.min(0.8, Math.pow(t, 1.7) * 1.05);
    const nyw = nor ? (e[1] * nor.getX(i) + e[5] * nor.getY(i) + e[9] * nor.getZ(i)) / sy : 0;
    const ao = 1 - Math.max(0, -nyw) * 0.26;
    const h = Math.sin(x * 12.9898 + z * 78.233 + y * 37.719) * 43758.5453;
    const n = ((h - Math.floor(h)) - 0.5) * 0.08;
    col[i * 3] = ((1 - d) + d * 0.7 + n) * ao;
    col[i * 3 + 1] = ((1 - d) + d * 0.62 + n) * ao;
    col[i * 3 + 2] = ((1 - d) + d * 0.5 + n) * ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.userData.__cotRefinedSelf = true;
  if (geo !== src) {
    src.userData.__cotRefinedGeo = geo;
    o.geometry = geo;
  }
}

function paintUntextured(root, spec, normScale) {
  const repeatsPerM = spec.visual && spec.visual.camoScale != null ? spec.visual.camoScale : 0.34;
  // Per-mesh UV density: raw vertex units vary wildly between assets (the
  // Quaternius rig bakes a large node-chain scale, so its raw verts span
  // ~0.02 units — a raw-unit UV projection collapsed to ONE texel and the
  // whole tank sampled flat gold). getWorldScale captures normScale AND any
  // node-chain scale above the mesh, giving repeats-per-METER everywhere.
  const _ws = new THREE.Vector3();
  const meshUvScale = (o) => {
    // r8: SKINNED meshes carry their scale in the armature bones, not the
    // mesh node — getWorldScale missed it and the quaternius Tank_body
    // sampled ~one texel (the "blank tan band" side). Derive meters-per-
    // local-unit from the rest-pose bbox span vs the vehicle's real length.
    if (o.isSkinnedMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      o.geometry.boundingBox.getSize(_ws);
      const span = Math.max(_ws.x, _ws.y, _ws.z) || 1;
      return repeatsPerM * (spec.dims.hullLengthM / span);
    }
    o.getWorldScale(_ws);
    const k = Math.max(Math.abs(_ws.x), Math.abs(_ws.y), Math.abs(_ws.z)) || normScale;
    return repeatsPerM * k;
  };
  let camoMat = null;
  // 'gear' (Wei He merged running-gear mesh) goes with the tracks: the node
  // carries track runs + wheels in one shell, and dark steel separates it
  // from the painted hull far better than scheme paint would.
  const TRACK_RE = /track|tread|gear/i;
  const WHEEL_RE = /wheel|suspension|sprocket|idler|roller/i;
  const nodePath = (o) => {
    let s = '';
    for (let n = o; n && n !== root; n = n.parent) s += `/${n.name || ''}`;
    return s;
  };
  const isPalette = (m) => m.map && m.map.image &&
    (m.map.image.width || 0) * (m.map.image.height || 0) <= 4096;
  const ensureCamoMat = () => {
    if (!camoMat) {
      camoMat = new THREE.MeshStandardMaterial({
        name: 'AddOnCamoHull', map: getSharedCamoTexture(spec),
        roughness: 0.86, metalness: 0.08,
        roughnessMap: getSharedRoughnessTexture(spec),
        vertexColors: true,   // r8: baked dust/AO gradient (refineCommunityGeometry)
        envMapIntensity: 0.55,
      });
      camoMat.onBeforeCompile = vehicleAmbientFloorHook;
      camoMat.customProgramCacheKey = () => 'veh-ambient-floor-v1';
    }
    return camoMat;
  };
  // Maps one material slot to its replacement (null = keep). Array-material
  // meshes are handled per slot — the Quaternius/konserwa assets ship
  // multi-primitive meshes that the old single-material pass skipped
  // entirely, which is how the banana-cream factory palette survived r6.
  const replacement = (o, m) => {
    if (!m || !m.color) return null;
    if (m.map && !isPalette(m)) return null;             // real texture: composite path
    const path = `${nodePath(o)}/${m.name || ''}`;
    if (TRACK_RE.test(path)) return getCommunityGearMaterials(spec).track;
    if (WHEEL_RE.test(path)) return getCommunityGearMaterials(spec).wheel;
    // q_heavy (Quaternius): 'Main_Light' + 'Main_Details' cover the giant
    // smooth wheel-fairing capsule and stud band BETWEEN the track runs —
    // as camo/keep they read as a blank tan band with no wheels (r7
    // critique, verified by per-primitive hide bisect). They are running
    // gear: paint them like the tracks.
    if (spec.id === 'q_heavy' && /Main_Light|Main_Details/i.test(m.name || '')) {
      return getCommunityGearMaterials(spec).track;
    }
    if (!m.map) {
      const luma = 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
      if (luma < 0.11) {
        // bare hardware / rubber: keep, and exempt from the camo base tint
        if (!/addon/i.test(m.name || '')) m.name = `${m.name || 'dark'}_addon_keep`;
        return null;
      }
    }
    return ensureCamoMat();
  };
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (Array.isArray(o.material)) {
      let anyCamo = false;
      let anyReplaced = false;
      for (let i = 0; i < o.material.length; i++) {
        const r = replacement(o, o.material[i]);
        if (r) { o.material[i] = r; anyReplaced = true; if (r === camoMat) anyCamo = true; }
      }
      if (anyReplaced) refineCommunityGeometry(o);   // r8: smooth normals + vertex dirt
      if (anyCamo) boxUVRaw(o.geometry, meshUvScale(o));
      return;
    }
    const r = replacement(o, o.material);
    if (r) {
      refineCommunityGeometry(o);                    // r8: smooth normals + vertex dirt
      if (r === camoMat) boxUVRaw(o.geometry, meshUvScale(o));
      o.material = r;
    }
  });
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
        // Lens strips: fully matte, near-black. The r5 "dim glass" (rough .3
        // metal .4) still fired a glowing full-width bar off the light strip
        // under the garage spots (r6 critique) — real lamp clusters read as
        // dark recessed glass at any distance, so kill the specular entirely.
        m.roughnessMap = null;
        m.metalnessMap = null;
        m.roughness = 0.72;
        m.metalness = 0.08;
        if (m.color) m.color.setRGB(0.09, 0.10, 0.09);
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
function applySwap(gltf, { spec, cfg, hullG, turretG, recoilG, muzzle }) {
  const scene = cloneWithSkeleton(gltf.scene);

  // ---- articulation gate ----
  // COMMUNITY TANKS: cfg.fixedGun marks casemate vehicles (Strv 103) — the
  // whole model rides the hull and the sim aims a virtual turret through the
  // (empty) articulation groups; everything else still REQUIRES a turret node.
  const turret = cfg.fixedGun
    ? null
    : findNode(scene, new RegExp(cfg.turretNode || 'turret', 'i'));
  if (!turret && !cfg.fixedGun) {
    throw new Error(`glb model for ${spec.id} has no articulable turret node — keeping procedural`);
  }
  // Gun node: prefer a child of the turret; community assets often ship the
  // gun as a turret SIBLING (is3, quaternius), so an explicit cfg.gunNode is
  // also resolved scene-wide.
  const gunRe = new RegExp(cfg.gunNode || 'gun|barrel|cannon', 'i');
  const gun = turret
    ? (findNode(turret, gunRe) || (cfg.gunNode ? findNode(scene, gunRe) : null))
    : null;

  // ---- fidelity surgery in the raw asset frame (before orient/scale) ----
  if (spec.id === 'm1a2') applyModelFixes(scene, turret, spec);

  // Skinned assets (recon_tank bones, quaternius track rig): bone-driven
  // verts move outside the mesh's static bounds — never frustum-cull them.
  scene.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });

  // ---- orient, then scale/ground to real dimensions ----
  scene.rotation.y = cfg.yawOffset || 0;
  scene.updateMatrixWorld(true);
  // Hull-only box for the scale: the gun overhang would otherwise shrink the
  // whole vehicle by the barrel length (m1a2: -22%). cfg.scaleToOverall keeps
  // the full box for single-skinned-mesh models whose barrel verts cannot be
  // excluded (the gun "node" is a bone with no meshes of its own).
  const useHullLen = gun && !cfg.scaleToOverall;
  const hullBB = useHullLen ? bboxExcluding(scene, gun) : bboxExcluding(scene, null);
  const size = hullBB.getSize(new THREE.Vector3());
  const targetLen = useHullLen ? spec.dims.hullLengthM : spec.dims.overallLengthM;
  // r7 footprint clamp: length-only normalization let proportionally fat
  // assets (Quaternius heavy) out-mass every real vehicle on the pedestal —
  // never exceed the spec width by more than 8%. Height gets 30% headroom:
  // dims.heightM is to the turret ROOF, while the asset bbox includes RWS /
  // sights / antennas (the m1a2's CROWS would otherwise shrink the tank).
  const s = Math.min(
    targetLen / Math.max(size.z, 1e-3),
    (spec.dims.widthM * 1.08) / Math.max(size.x, 1e-3),
    (spec.dims.heightM * 1.30) / Math.max(size.y, 1e-3),
  );
  scene.scale.setScalar(s);
  scene.position.y = -hullBB.min.y * s;                       // ground at y=0
  scene.position.x = -(hullBB.min.x + hullBB.max.x) / 2 * s;  // center in plan
  scene.position.z = -(hullBB.min.z + hullBB.max.z) / 2 * s;
  scene.updateMatrixWorld(true);

  // ---- COMMUNITY TANKS: derive articulation pivots from the asset ---------
  // Computed in the scene's normalized frame (== tank-root local: hullG and
  // turretG are unrotated root children) BEFORE attach, so a posed tank
  // (async swap mid-battle) cannot skew the boxes.
  let autoTurretPos = null;
  let autoGunPos = null;
  let autoMuzzleLen = null;
  if (cfg.autoPivot && turret) {
    const tb = new THREE.Box3().setFromObject(turret);
    const to = new THREE.Vector3().setFromMatrixPosition(turret.matrixWorld);
    const tbLoose = tb.clone().expandByScalar(0.6);
    if (cfg.pivot) {
      // explicit override, raw (pre-yaw) model units
      autoTurretPos = new THREE.Vector3(cfg.pivot[0], cfg.pivot[1], cfg.pivot[2])
        .applyMatrix4(scene.matrixWorld);
    } else if (tb.isEmpty() || (to.y > 0.25 && tbLoose.containsPoint(to))) {
      // authored ring-center origin; bone turrets (no meshes of their own —
      // the skinned hull carries the verts) ALWAYS use the bone origin
      autoTurretPos = to.clone();
    } else {
      // fallback: ring axis at the turret footprint center, ring plane at its base
      autoTurretPos = new THREE.Vector3(
        (tb.min.x + tb.max.x) / 2, Math.max(tb.min.y, 0.4), (tb.min.z + tb.max.z) / 2);
    }
    if (gun) {
      const gb = bboxExcluding(gun, null);
      const go = new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld);
      if (gb.isEmpty()) {
        autoGunPos = go.clone();                   // bone gun (skinned rigs)
      } else if (go.y > 0.25 && gb.clone().expandByScalar(0.8).containsPoint(go)) {
        autoGunPos = go.clone();                   // authored trunnion origin
        autoMuzzleLen = gb.max.z - go.z;
      } else {
        // trunnion at the breech end of the gun box
        autoGunPos = new THREE.Vector3(
          (gb.min.x + gb.max.x) / 2, (gb.min.y + gb.max.y) / 2,
          gb.min.z + (gb.max.z - gb.min.z) * 0.12);
        autoMuzzleLen = gb.max.z - autoGunPos.z;
      }
    }
  }

  upgradeMaterials(scene);
  // COMMUNITY TANKS material-upgrade pass: flat-color / CAD assets get their
  // untextured painted surfaces box-UV'd onto the live shared camo canvas
  // (full pattern support); very dark untextured mats (tracks, tires) keep
  // their factory look ('addon' marker opts them out of the camo tint).
  if (cfg.paintUntextured) paintUntextured(scene, spec, s);
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
  // COMMUNITY TANKS autoPivot: seat the articulation groups on the pivots
  // derived from the asset (root-local == the scene's pre-attach frame).
  if (autoTurretPos) {
    turretG.position.copy(autoTurretPos);
    if (autoGunPos && gunG) gunG.position.copy(autoGunPos).sub(autoTurretPos);
    if (autoMuzzleLen != null && muzzle) muzzle.position.z = Math.max(0.8, autoMuzzleLen + 0.05);
  }
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
  // ---- muzzle anchor from REAL barrel geometry (effects_combat r3) ---------
  // The fx muzzle anchor sat at P.muzzleZ = spec barrel length, but the GLB
  // swap rescales the whole vehicle to hull length — on the m1a2 the anchor
  // ended ~2 m PAST the visible barrel tip, so every muzzle flash / tracer /
  // recoil read spawned detached in mid-air (r7 "flash floats 1.5-2
  // barrel-lengths downrange with a visible gap"). Re-derive the anchor from
  // the actual gun-mesh vertices in recoilG space (chain product cancels any
  // stale pose above recoilG). Bone-rigged guns without own meshes keep the
  // autoPivot/spec anchor.
  if (gun && muzzle) {
    recoilG.updateMatrixWorld(true);
    const invRec = new THREE.Matrix4().copy(recoilG.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const vtx = new THREE.Vector3();
    let tipZ = -Infinity;
    gun.traverse((n) => {
      if (!n.isMesh || !n.geometry || !n.geometry.getAttribute) return;
      const pa = n.geometry.getAttribute('position');
      if (!pa) return;
      rel.multiplyMatrices(invRec, n.matrixWorld);
      const step = Math.max(1, Math.floor(pa.count / 4000));
      for (let i = 0; i < pa.count; i += step) {
        vtx.fromBufferAttribute(pa, i).applyMatrix4(rel);
        if (vtx.z > tipZ) tipZ = vtx.z;
      }
    });
    if (tipZ > 0.8 && Number.isFinite(tipZ)) muzzle.position.z = tipZ - 0.04;
  }
  if (turret) reparent(turret, turretG);
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
  const ok = applySwap(gltf, ctx);
  // Sync swaps run inside createTank (garage entry / battle staging, never a
  // combat frame) — pay the texture uploads + program compiles here too.
  if (ok) warmSwappedModel(ctx);
  return ok;
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
  // PERF (performance_budget r4): the swap itself (skeleton clone, triangle
  // surgery, creased normals, camo composite) is also a main-thread chunk —
  // run it through the same battle-safe idle gate, then pre-upload textures
  // and compile programs in the same slot so the next frame binds nothing new.
  return idleGate(() => {
    // The visual may have been evicted/disposed while the job waited (battle
    // roster change, thumbs booth teardown): a detached tank root means the
    // procedural stand-in is gone from the scene — skip the dead swap.
    let root = ctx.hullG;
    while (root.parent) root = root.parent;
    if (!root.isScene) return false;
    const ok = applySwap(gltf, ctx);
    if (ok) warmSwappedModel(ctx);
    return ok;
  });
}
