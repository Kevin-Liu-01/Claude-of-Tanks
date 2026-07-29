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
import { toCreasedNormals, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// CAMO PATTERN SECTION: sourced models get the active camo pattern composited
// over their baked maps (materials.js owns pattern resolution + live
// re-painting on garage/biome switches); procedural add-on parts wear the
// shared camo canvas directly.
import {
  applyCamoToModel, getSharedCamoTexture, getSharedRoughnessTexture,
  getCommunityGearMaterials, vehicleAmbientFloorHook,
} from './materials.js';

const _loader = new GLTFLoader();
// Resilient texture path (killcam_shotinfo r2, harness-reliability critical):
// under parallel-probe memory pressure createImageBitmap fails on the
// loader's internal blob: URLs — 38x "THREE.GLTFLoader: Couldn't load
// texture" console errors, then the tab dies. Decode via HTMLImageElement
// instead, and never reject: retry once next frame, then resolve a neutral
// 1x1 pixel so GLTFLoader's internal console.error path is unreachable and
// the parse always completes.
const FALLBACK_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABXvMqOgAAAABJRU5ErkJggg==';
_loader.register((parser) => {
  const robust = new THREE.TextureLoader(parser.options.manager);
  robust.setCrossOrigin(parser.options.crossOrigin);
  const origLoad = robust.load.bind(robust);
  robust.load = (url, onLoad, onProgress, onError) =>
    origLoad(url, onLoad, onProgress, () => {
      requestAnimationFrame(() => origLoad(url, onLoad, undefined,
        () => origLoad(FALLBACK_PX, onLoad, undefined, onError)));
    });
  parser.textureLoader = robust;
  return { name: 'COT_resilient_textures' };
});
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

// tank_models r2 PRIORITY LANE (critic major: selecting the M1A1 in the live
// garage showed the placeholder box for 15-45 s): on garage open ~20 thumbnail
// GLB jobs (parse + swap) fill the idle queue, and the pedestal hero's jobs
// queued FIFO behind all of them. Swap contexts register here the moment
// applyGlbModel is called; any queued job whose tag matches a pending swap
// whose tank root is attached to the LIVE scene (the pedestal — thumbs build
// in an offscreen booth scene) jumps the queue. Garage has no combat frames
// to protect, so hot jobs also pump on a tight 40 ms spacing.
const _pendingSwapCtx = new Set();

function isMainSceneCtx(ctx) {
  try {
    const D = typeof window !== 'undefined' ? window.__DEBUG : null;
    if (!D || !D.scene) return false;
    let root = ctx.hullG;
    while (root.parent) root = root.parent;
    return root === D.scene;
  } catch (_) { return false; }
}

/** GLB paths whose pending swap targets the LIVE scene (garage pedestal /
 * staged battle tanks) — the priority lane. Null when none. */
function hotTags() {
  let hot = null;
  for (const ctx of _pendingSwapCtx) {
    if (isMainSceneCtx(ctx)) { (hot || (hot = new Set())).add(ctx.cfg.path); }
  }
  return hot;
}

/** Queue index of the highest-priority runnable job (0 when no hot job). */
function nextJobIndex() {
  if (_idleQueue.length < 2 || !_pendingSwapCtx.size) return 0;
  const hot = hotTags();
  if (!hot) return 0;
  const i = _idleQueue.findIndex((j) => j.tag && hot.has(j.tag));
  return i > 0 ? i : 0;
}

// Battle STAGING window: startBattle resets game.timeS to 0 and plays a 3 s
// opening flyby before the player has control. Draining the GLB queue inside
// the first BATTLE_STAGE_GRACE_S seconds lands every roster model during the
// cinematic sweep instead of leaving community/variant AI tanks as
// procedural box stacks for the whole match (content_breadth r1 CRITICAL).
const BATTLE_STAGE_GRACE_S = 6;

function inBattle() {
  try {
    const D = typeof window !== 'undefined' ? window.__DEBUG : null;
    if (!(D && D.game && D.game.phase === 'battle')) return false;
    return !(typeof D.game.timeS === 'number' && D.game.timeS < BATTLE_STAGE_GRACE_S);
  } catch (_) { return false; }
}

// tank_models r3 (CRITICAL: shots/garage.png captured an EMPTY pedestal):
// __SHOTS.set('garage') resumes this queue, but the hero's parse+swap jobs
// then waited behind requestIdleCallback spacing plus ~30 thumbnail GLB loads
// kicked by drainThumbs at the same moment — the swap (which re-shows the
// hidden pedestal root) landed ~1.4-1.6 s after set(), just past the
// harness's ~1.2 s capture (probe: tools/tmp-tm-r3-garageprobe.mjs, reveal
// between +1200 and +1600 ms on the full 10-view replay). In shot phase
// there are no combat frames to protect, so the queue pumps back-to-back on
// a one-frame timer instead; hot main-scene jobs (the pedestal hero) always
// use the tight path.
function inShotPhase() {
  try {
    const D = typeof window !== 'undefined' ? window.__DEBUG : null;
    return !!(D && D.game && D.game.phase === 'shot');
  } catch (_) { return false; }
}

// killcam_shotinfo r2: shot-capture pause — the harness stages its biggest
// worlds exactly when a queued GLB parse would add decode pressure; main.js
// pauses the queue for the whole capture session.
let _queuePaused = false;
/** @param {boolean} v pause (true) / resume (false) the GLB idle queue */
export function pauseIdleQueue(v) {
  _queuePaused = !!v;
  // resume drains everything; pause still pumps hot main-scene jobs (r3 —
  // see pumpIdle) so staged closeup/garage heroes never capture as stand-ins.
  scheduleIdlePump();
}

function pumpIdle() {
  _idlePumpScheduled = false;
  if (!_idleQueue.length) return;
  let takeIdx = -1;
  if (_queuePaused) {
    // r3 (critic critical, second face of the empty-garage bug): the harness
    // pause stranded MAIN-SCENE swaps too — whether tank_closeup_modern
    // showed the sourced Abrams or its procedural stand-in depended on
    // whether the boot queue happened to finish before the first set()
    // paused it (racy across runs). Hot jobs (garage pedestal hero, staged
    // battle tanks in the live scene) now run even while paused; only the
    // bulk thumbnail decodes stay parked for the capture session.
    const hot = hotTags();
    if (hot) takeIdx = _idleQueue.findIndex((j) => j.tag && hot.has(j.tag));
    if (takeIdx < 0) return; // nothing hot — resume via pauseIdleQueue(false)
  }
  let ran = false;
  if (!inBattle()) {
    const job = _idleQueue.splice(takeIdx >= 0 ? takeIdx : nextJobIndex(), 1)[0];
    ran = true;
    try { job.res(job.fn()); } catch (e) { job.rej(e); }
  }
  scheduleIdlePump(ran);
}

function scheduleIdlePump(afterJob = false) {
  if (_idlePumpScheduled || !_idleQueue.length) return;
  if (_queuePaused) {
    // paused: only keep pumping while a hot main-scene job is waiting
    const hot = hotTags();
    if (!hot || !_idleQueue.some((j) => j.tag && hot.has(j.tag))) return;
  }
  _idlePumpScheduled = true;
  // After RUNNING a job, space the next one out on wall clock: chained idle
  // callbacks can run back-to-back inside one rAF gap, and draining a full
  // queue that way measured a 4.3 s frozen frame at battle end. 300 ms spacing
  // guarantees rendered frames between jobs (a drain of the whole 9-GLB queue
  // spreads over ~3 s of end-screen/garage time instead of one freeze).
  // Inside the battle staging window drain fast (the flyby hides the work);
  // everywhere else keep the 300 ms spacing that guarantees rendered frames
  // between jobs. tank_models r2: when the NEXT job is a priority-lane job
  // (garage pedestal hero), pump on a tight spacing — the player is staring
  // at a hidden/placeholder pedestal and there are no combat frames to guard.
  // r3 garage-capture fix (see inShotPhase above): shot phase drains on a
  // ~16 ms cadence — one rendered frame between jobs, hero swap lands well
  // inside the 1.2 s capture window instead of ~1.4 s after it.
  const hot = nextJobIndex() > 0 || inShotPhase();
  if (afterJob) setTimeout(pumpIdle, inBattle() ? 300 : (hot ? 16 : 120));
  else if (hot) setTimeout(pumpIdle, 0);
  else if (typeof requestIdleCallback === 'function') requestIdleCallback(pumpIdle, { timeout: 350 });
  else setTimeout(pumpIdle, 80);
}

/** Run `fn` in the next out-of-battle idle slot (one job per slot).
 * `tag` (GLB url) lets the garage priority lane reorder queued jobs. */
function idleGate(fn, tag = null) {
  return new Promise((res, rej) => {
    _idleQueue.push({ fn, res, rej, tag });
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

// ---------------------------------------------------------------------------
// PERF (performance_budget r3): GPU texture budget — cap baked GLB textures at
// import. The scene-material estimate blew the FROZEN 512 MB gate (measured
// 666-685 MB in the m1a2/verdant probe battle) and the top offenders were
// community/user-drop GLBs shipping full 2048² PBR sets per material: one
// leo2a6 held 168 MB (7x 2048² = 21.3 MB each with mips). At battle camera
// distances (and even the garage turntable at ~5 m) a 1024² sheet on a 7-10 m
// hull is ~2.9 mm/texel — the 2048 originals are pure VRAM on the 2-4 GB
// cards this gate protects. Non-hero vehicles cap ALL maps at 1024; the two
// hero closeup-contract GLBs (m1a2, t90m — MODEL_SOURCE heroTex) keep 2048
// color but cap data maps (normal/rough/metal) at 1024, which are visually
// inert at that texel density. Downscale happens ONCE per cached parse,
// inside the same battle-safe idle slot as the parse itself, so every clone
// shares the small maps and the later initTexture uploads shrink 4x.
const GLB_TEX_CAPS_HERO = { color: 2048, data: 1024 };
const GLB_TEX_CAPS = { color: 1024, data: 1024 };
const _COLOR_SLOTS = new Set(['map', 'emissiveMap']);
function downscaleTex(t, cap) {
  const img = t.image;
  if (!img || !img.width || !img.height) return;
  const m = Math.max(img.width, img.height);
  if (m <= cap) return;
  const s = cap / m;
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    t.image = c;
    t.needsUpdate = true;
    if (typeof img.close === 'function') img.close(); // free the ImageBitmap now
  } catch (_) { /* decode-limbo image — keep the original */ }
}
function capGlbSceneTextures(scene, caps) {
  const seen = new Set();
  scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (!v || !v.isTexture || seen.has(v.uuid)) continue;
        seen.add(v.uuid);
        downscaleTex(v, _COLOR_SLOTS.has(k) ? caps.color : caps.data);
      }
    }
  });
}

function loadGltf(url, texCaps = GLB_TEX_CAPS) {
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
        }), url);
        // PERF r3: shrink oversized baked maps before the scene is cached —
        // see the texture-cap block above. GLTFLoader resolves before its
        // textures finish decoding; images that are not ready yet are capped
        // lazily by capGlbSceneTextures on the next swap of the same URL.
        capGlbSceneTextures(g.scene, texCaps);
        // PERF (performance_budget r2): the cache must retain gltf.scene (the
        // clone source for later createTank calls) — but gltf.parser hangs on
        // to the decoded JSON tree, its own per-load caches and associations,
        // none of which any swap path reads (applySwap only touches .scene).
        // With 5-7 GLB vehicles resident per battle this parse scaffolding was
        // a measurable slice of the +140 MB retained-set growth the r2 heap
        // gate flagged. The fetch ArrayBuffer (buf) is dropped by scope end;
        // geometry attribute views keep the GLB body alive — that part IS the
        // live mesh data.
        g.parser = null;
        g.userData = {};
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

/**
 * tank_models r1: delete whole CONNECTED COMPONENTS that lie fully inside one
 * of the AABBs (union-find over the index buffer). Centroid carves can't
 * remove the asset's dagger-fin "smoke launcher" blades without also holing
 * the turret shell they overlap — components are exact: the blade prisms are
 * separate islands, the shell is one huge island that never fits in the box.
 */
function carveComponents(geo, boxes, flag) {
  if (!geo.index || geo.userData[flag]) return;
  geo.userData[flag] = true;
  const idx = geo.index.array;
  const pos = geo.attributes.position;
  const n = pos.count;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) {
    const ra = find(idx[t]), rb = find(idx[t + 1]), rc = find(idx[t + 2]);
    if (rb !== ra) parent[rb] = ra;
    if (rc !== ra) parent[rc] = ra;
  }
  // component bboxes
  const bb = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let e = bb.get(r);
    if (!e) { e = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity, false]; bb.set(r, e); }
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (x < e[0]) e[0] = x; if (x > e[1]) e[1] = x;
    if (y < e[2]) e[2] = y; if (y > e[3]) e[3] = y;
    if (z < e[4]) e[4] = z; if (z > e[5]) e[5] = z;
  }
  for (const e of bb.values()) {
    for (const [x0, x1, y0, y1, z0, z1] of boxes) {
      if (e[0] >= x0 && e[1] <= x1 && e[2] >= y0 && e[3] <= y1 && e[4] >= z0 && e[5] <= z1) { e[6] = true; break; }
    }
  }
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (!bb.get(find(idx[t]))[6]) keep.push(idx[t], idx[t + 1], idx[t + 2]);
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
        // r5 (critic minor): flat shelf plate floating off the LEFT turret
        // cheek with no mounting — a stray prop cluster the real SEPv3
        // doesn't carry at that station
        [-1.62, -0.55, -1.95, -1.15, 2.25, 2.95],
      ]);
      // r5 (critic minor): the two whip antennas ran to ceiling height
      // (raw z 4.0 -> 7.0 ≈ 2.4 m of whip). Compress the whip columns to
      // ~45% length; bases/mounts below z 4.0 are untouched. Geometry is
      // shared between clones — run once.
      if (!o.geometry.userData.__cotAntennaTrim) {
        o.geometry.userData.__cotAntennaTrim = true;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const z = pos.getZ(i);
          if (z <= 4.0) continue;
          const x = pos.getX(i), y = pos.getY(i);
          const antL = (x + 1.4) * (x + 1.4) + (y - 3.1) * (y - 3.1) < 0.16;
          const antR = (x - 1.3) * (x - 1.3) + (y - 3.15) * (y - 3.15) < 0.16;
          if (antL || antR) pos.setZ(i, 4.0 + (z - 4.0) * 0.45);
        }
        pos.needsUpdate = true;
        o.geometry.computeBoundingBox();
        o.geometry.computeBoundingSphere();
      }
    } else if (mn === 'Radiator') {
      // two large circular deck fans — no Abrams variant carries these
      // (r6 critique); replaced by flat rectangular grille panels below
      o.visible = false;
    } else if (/rot/i.test(mn)) {
      // tank_models r1 (critic: "turret-cheek smoke launcher reads as a
      // dagger-shaped fin"): the asset simplifies each M250 cluster into two
      // long blade prisms hugging the cheek. Component-exact removal (they
      // overlap the shell in x, so a centroid carve would hole the turret);
      // proper angled 6-tube fans are added below.
      carveComponents(o.geometry, [
        [1.45, 2.10, -2.35, -0.65, 1.98, 2.95],
        [-2.10, -1.45, -2.35, -0.65, 1.98, 2.95],
      ], '__cotBladeCarve');
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
    // r2 (critic minor: roof furniture "flat-shaded hard-edged lego with no
    // panel/bolt detail"): panel split seams + hinge blocks + corner bolts on
    // the doghouse so the box reads as an assembled armored housing.
    addPart(turret, dark, new THREE.BoxGeometry(0.62, 0.015, 0.015), bx, by, 3.26);       // lid seam
    addPart(turret, dark, new THREE.BoxGeometry(0.015, 0.54, 0.015), bx - 0.20, by, 3.26); // panel seam
    addPart(turret, mat, new THREE.BoxGeometry(0.10, 0.06, 0.05), bx + 0.18, by + 0.24, 3.30); // hinge
    addPart(turret, mat, new THREE.BoxGeometry(0.10, 0.06, 0.05), bx - 0.18, by + 0.24, 3.30);
    for (const [ox, oy] of [[-0.26, -0.20], [0.26, -0.20], [-0.26, 0.20], [0.26, 0.20]]) {
      addPart(turret, dark, new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6)
        .rotateX(Math.PI / 2), bx + ox, by + oy, 3.345);                        // corner bolts
    }
    // CITV pedestal + rotating head forward-left (hunter-killer sight)
    const cx = -0.85, cy = -0.90;
    addPart(turret, mat, new THREE.CylinderGeometry(0.16, 0.19, 0.22, seg)
      .rotateX(Math.PI / 2), cx, cy, 3.14);
    addPart(turret, mat, new THREE.CylinderGeometry(0.135, 0.135, 0.26, seg)
      .rotateX(Math.PI / 2), cx, cy, 3.38);
    addPart(turret, mat, new THREE.BoxGeometry(0.32, 0.34, 0.28), cx, cy, 3.64);
    addPart(turret, dark, new THREE.BoxGeometry(0.22, 0.05, 0.15), cx, cy - 0.18, 3.64); // mirror window
  }

  // M250 smoke launcher clusters (tank_models r1): angled 6-tube fans on the
  // cheek shoulders replacing the carved dagger-blade simplification. Dark
  // steel tubes on a scheme-painted wedge mount (§6.5 recognition item).
  {
    const dark250 = new THREE.MeshStandardMaterial({
      name: 'AddOnM250_addon', color: 0x1c1f1c, roughness: 0.8, metalness: 0.18 });
    for (const s of [-1, 1]) {
      const bx = s * 1.78, by = -1.82, bz = 2.80;
      addPart(turret, mat, new THREE.BoxGeometry(0.30, 0.22, 0.16)
        .rotateZ(s * 0.62), bx, by, bz);
      for (let k = 0; k < 6; k++) {
        const a = 0.26 + k * 0.13;               // fan spread, outward from bore line
        const tilt = 0.24;                        // muzzle-up cant
        const tube = new THREE.CylinderGeometry(0.030, 0.034, 0.30, 10)
          .rotateX(-tilt)                         // axis y -> forward, tipped up
          .rotateZ(-s * a);                       // fanned outboard
        const dx = Math.sin(a) * 0.17, dy = -Math.cos(a) * 0.17;
        addPart(turret, dark250, tube, bx + s * dx, by + dy, bz + 0.10 + Math.sin(tilt) * 0.1);
      }
    }
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
        // tank_models r1 (critic: "the barrel's thermal-sleeve step is
        // drainpipe-fat"): the asset's mid-tube sleeve section runs r≈0.26
        // (0.42 m dia) against a 0.144 forward tube. Radially compress the
        // sleeve band toward the bore axis to a credible ~0.20 step.
        gun.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const g2 = o.geometry;
          if (g2.userData.__cotSleeveSlim) return;
          g2.userData.__cotSleeveSlim = true;
          const p2 = g2.attributes.position;
          let touched = false;
          for (let i = 0; i < p2.count; i++) {
            const y2 = p2.getY(i);
            if (y2 < -4.6 || y2 > -3.05) continue;
            const dx2 = p2.getX(i) - cx, dz2 = p2.getZ(i) - cz;
            const r2 = Math.hypot(dx2, dz2);
            if (r2 <= 0.17 || r2 > 0.32) continue;   // keep bore + rotor hardware
            const k2 = (0.17 + (r2 - 0.17) * 0.35) / r2;
            p2.setX(i, cx + dx2 * k2);
            p2.setZ(i, cz + dz2 * k2);
            touched = true;
          }
          if (touched) {
            p2.needsUpdate = true;
            g2.computeBoundingBox();
            g2.computeBoundingSphere();
          }
        });
        const evacY = minY + 0.42 * (-2.7 - minY);   // ~42% back from the muzzle
        // r2 (critic minor: "fat cylindrical collar reads oversized vs the
        // real M256"): evacuator bulge trimmed 0.205 -> 0.19 (~1.3x tube,
        // photo-matched) and the MRS collar slimmed to a near-flush ring.
        addPart(gun, mat, new THREE.CylinderGeometry(0.19, 0.19, 0.58, seg), cx, evacY, cz);
        addPart(gun, mat, new THREE.CylinderGeometry(0.19, 0.150, 0.16, seg), cx, evacY - 0.37, cz);
        addPart(gun, mat, new THREE.CylinderGeometry(0.150, 0.19, 0.16, seg), cx, evacY + 0.37, cz);
        addPart(gun, mat, new THREE.CylinderGeometry(0.132, 0.132, 0.10, seg), cx, minY + 0.30, cz); // MRS collar
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

function paintUntextured(root, spec, normScale, cfg = {}) {
  // tank_models r1 (kv2 "two material worlds"): stripBakedTextures treats the
  // asset's REAL baked textures as paint to replace — hull/turret route onto
  // the shared camo canvas (keeping the baked normal map for surface detail),
  // named gear nodes take the dark gear materials. For the kv2 the baked
  // rust-orange carnival albedo + silver grille moiré could never cohere with
  // the repainted fleet.
  const strip = !!cfg.stripBakedTextures;
  const stripCache = new Map();
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
      camoMat.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    }
    return camoMat;
  };
  // Maps one material slot to its replacement (null = keep). Array-material
  // meshes are handled per slot — the Quaternius/konserwa assets ship
  // multi-primitive meshes that the old single-material pass skipped
  // entirely, which is how the banana-cream factory palette survived r6.
  const replacement = (o, m) => {
    if (!m || !m.color) return null;
    if (m.map && !isPalette(m) && !strip) return null;   // real texture: composite path
    const path = `${nodePath(o)}/${m.name || ''}`;
    if (TRACK_RE.test(path)) return getCommunityGearMaterials(spec).track;
    if (WHEEL_RE.test(path)) return getCommunityGearMaterials(spec).wheel;
    if (m.map && !isPalette(m) && strip) {
      // painted shell with a stripped baked albedo: camo canvas + the
      // asset's own normal map (per-source-material clone, cached)
      let sm = stripCache.get(m.uuid);
      if (!sm) {
        sm = ensureCamoMat().clone();
        sm.name = 'AddOnCamoHullStrip';
        if (m.normalMap) { sm.normalMap = m.normalMap; sm.normalScale = new THREE.Vector2(0.8, 0.8); }
        sm.onBeforeCompile = vehicleAmbientFloorHook;
        sm.customProgramCacheKey = () => 'veh-ambient-floor-v2';
        stripCache.set(m.uuid, sm);
      }
      return sm;
    }
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

// ---------------------------------------------------------------------------
// r10 per-spec GLB touch-ups (tank_models r10 critique items)
// ---------------------------------------------------------------------------

/** Split a geometry's triangles into [keep, alt] index groups by a per-vertex
 * predicate (triangle goes 'alt' when >=2 of its verts match), then assign
 * [originalMat, altMat]. Geometry is shared between clones — the index
 * surgery runs once (userData flag); the material array is set per clone. */
function splitTrianglesToGroups(o, vertPred, altMat) {
  const g = o.geometry;
  if (!g.userData.__cotSplitDone) {
    const pos = g.attributes.position;
    const src = g.index ? Array.from(g.index.array) : [...Array(pos.count).keys()];
    const keep = [], alt = [];
    for (let t = 0; t + 2 < src.length; t += 3) {
      const a = src[t], b = src[t + 1], c = src[t + 2];
      const n = (vertPred(a) ? 1 : 0) + (vertPred(b) ? 1 : 0) + (vertPred(c) ? 1 : 0);
      (n >= 2 ? alt : keep).push(a, b, c);
    }
    const arr = keep.concat(alt);
    g.setIndex(pos.count > 65535
      ? new THREE.BufferAttribute(new Uint32Array(arr), 1)
      : new THREE.BufferAttribute(new Uint16Array(arr), 1));
    g.clearGroups();
    g.addGroup(0, keep.length, 0);
    g.addGroup(keep.length, alt.length, 1);
    g.userData.__cotSplitDone = true;
  }
  const base = Array.isArray(o.material) ? o.material[0] : o.material;
  o.material = [base, altMat];
}

/**
 * m1a2: the asset's gun tube ('DMainMetal_Guns') is an UNTEXTURED material —
 * the plain-tint pass left it a flat green plastic prop while hull/turret
 * carry the camo composite (r10 critique). Box-UV the tube onto the live
 * shared camo canvas so the barrel restyles with every garage pattern; the
 * 'AddOn' name opts it out of applyCamoToModel's plain-tint path.
 */
function paintGlbGunTube(gun, spec) {
  const tube = new THREE.MeshStandardMaterial({
    name: 'AddOnGunCamo', map: getSharedCamoTexture(spec),
    roughness: 0.8, metalness: 0.08,
    roughnessMap: getSharedRoughnessTexture(spec),
    envMapIntensity: 0.4,
  });
  const ws = new THREE.Vector3();
  gun.updateWorldMatrix(true, true);
  gun.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m || m.map || !/guns/i.test(m.name || '')) continue;
      o.getWorldScale(ws);
      boxUVRaw(o.geometry, 0.5 * (Math.max(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z)) || 1));
      if (Array.isArray(o.material)) o.material[i] = tube; else o.material = tube;
    }
  });
}

/**
 * tank_models r2 — Abrams variant GLB kit fixes (m1a1 / m1a2_tusk), applied
 * to the baked node tree BEFORE orientation/scale normalization. The baked
 * add-on nodes live at scene level in a y-up/z-forward frame (hull kit) or
 * stay raw z-up under TurretPivot/GunPivot (turret/gun kit) — verified by
 * offline JSON-chunk probe (scratchpad glbdump.mjs).
 *  - ARAT1/ARAT2 tiles (critic: "oversized bright-tan PYRAMID studs in a
 *    perfect grid"): flattened to plate-like wedges (x = outward stud axis
 *    compressed 70%) and grown along the skirt run so the two rows read as
 *    near-continuous angled plate rows, not a stud grid. Their tint follows
 *    the shared camo canvas (see the m1a2_tusk visual + FACTORY_OVERRIDE
 *    change that pulls it onto the hull's woodland scheme).
 *  - TUSK slat cage: baked ~0.5 m adrift BEHIND the hull rear plate (read as
 *    a floating mesh slab) — pulled flush against the rear engine quarters.
 *  - MRSCollar / BoreEvac (critic: "oversized beige cylinder cap on the
 *    muzzle"): radially slimmed toward the M256's slim MRS-collar scale.
 */
function applyAbramsVariantFixes(scene, spec) {
  const isTusk = spec.id === 'm1a2_tusk';
  scene.traverse((o) => {
    const n = o.name || '';
    if (isTusk && /^ARAT1/.test(n)) o.scale.set(0.16, 1.30, 1.52);
    else if (isTusk && /^ARAT2/.test(n)) o.scale.set(0.20, 1.20, 1.60);
    else if (isTusk && /^Slat(Bar|Rail)/.test(n)) o.position.z += 0.44;
    else if (isTusk && /^SlatMount/.test(n)) o.position.z += 0.44;
    else if (/^MRSCollar/.test(n)) o.scale.set(0.74, 1, 0.74);
    else if (/^BoreEvac/.test(n)) o.scale.set(0.86, 1, 0.86);
  });
}

/**
 * COMMUNITY TANKS r10 cohesion surgery (runs after paintUntextured, before
 * the camo composite — replacement materials carry 'AddOn' names so
 * applyCamoToModel treats them as gear, not paint):
 *  - q_heavy: the giant smooth track-loop fairing is part of the same 'Main'
 *    material as the hull, so the material-level pass could never separate it
 *    ("pool-toy beige track loops"). Split its triangles by lateral position:
 *    everything outboard of 60% half-width goes dark worn track steel.
 *  - recon_tank: the composite camo painted brown pattern patches across the
 *    wheel drums, reading as cartoon hub decals. Split the single skinned
 *    mesh by bone binding — verts weighted to Wheel_* bones repaint as
 *    scheme-solid running gear. The bone-driven barrel also slims to a
 *    57 mm-credible tube.
 *  - newc_pziii: the 5 cm KwK barrel was a camo-colored pencil that vanished
 *    at garage distance — thicken laterally and hand it the dark gear steel.
 */
function applyCommunityFixes(scene, spec, gun) {
  if (spec.id === 'q_heavy') {
    const gear = getCommunityGearMaterials(spec);
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || !/AddOnCamoHull/.test(m.name || '')) return;
      const pos = o.geometry.attributes.position;
      if (!pos) return;
      // lateral axis for this asset's skinned body geometry is Y (verified
      // against the rig's bind pose); the fairing capsules live outboard.
      let maxY = 0;
      for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, Math.abs(pos.getY(i)));
      const bb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
      const spanY = bb.max.y - bb.min.y;
      const spanX = bb.max.x - bb.min.x;
      const spanZ = bb.max.z - bb.min.z;
      // only the low wide body band carries the fairing (skip turret shells)
      if (spanY < spanZ || spanY > spanX) return;
      const thresh = maxY * 0.60;
      splitTrianglesToGroups(o, (i) => Math.abs(pos.getY(i)) > thresh, gear.track);
    });
    // r5 (critic major: "track loops grossly oversized — the near track reads
    // like a standalone vehicle"): shrink the whole track assembly relative
    // to the hull. In the normalized frame the loops ran ground->1.17 m tall
    // and 0.78 m wide EACH on a 1.58 m hull — WWII heavies carry ~0.9 m gear.
    // World-space remap shared by every running-gear piece: height compressed
    // 24% toward the ground line, each loop's cross-section pulled 34% toward
    // its own side axis (|x| 1.53).
    {
      const yBot = 0.04, kY = 0.76, xSide = 1.53, kX = 0.66;
      const fWorld = (p) => {
        p.y = yBot + (p.y - yBot) * kY;
        const s = p.x < 0 ? -1 : 1;
        p.x = s * (xSide + (Math.abs(p.x) - xSide) * kX);
        return p;
      };
      // (a) cleat-link rings: 154 static bones per side, flat under 'Root' —
      // remap each bone's world position and shrink the pads with it.
      const seenBones = new Set();
      const wp = new THREE.Vector3();
      const parentInv = new THREE.Matrix4();
      scene.traverse((o) => {
        if (!o.isSkinnedMesh || !o.skeleton) return;
        for (const b of o.skeleton.bones) {
          if (seenBones.has(b) || !/TankTrack/i.test(b.name || '')) continue;
          seenBones.add(b);
          b.getWorldPosition(wp);
          fWorld(wp);
          parentInv.copy(b.parent.matrixWorld).invert();
          b.position.copy(wp.applyMatrix4(parentInv));
          b.scale.multiplyScalar(0.78);
          b.updateMatrixWorld(true);
        }
      });
      // (b) fairing capsule / stud band / wheels: separate one-bone (Root)
      // skinned meshes — bake the bone transform T from 4 probe points, then
      // remap geometry as v' = T^-1 * fWorld(T * v). Exact for single-bone
      // rigid bindings; meshes with mixed bindings are left alone.
      const isRigid = (o) => {
        const si = o.geometry.attributes.skinIndex;
        if (!si) return false;
        const first = si.getX(0);
        for (let i = 0; i < si.count; i += 37) if (si.getX(i) !== first) return false;
        return true;
      };
      scene.traverse((o) => {
        if (!o.isSkinnedMesh || !o.geometry || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const gearish = mats.every((mm) => mm && /AddOnTrack|AddOnWheel|CommunityTrack|CommunityWheel/i.test(mm.name || ''));
        if (!gearish || !isRigid(o) || o.geometry.userData.__cotGearShrunk) return;
        o.geometry.userData.__cotGearShrunk = true;
        o.updateWorldMatrix(true, false);
        // single-bone rigid binding: bind->world is one affine matrix,
        // assembled straight from the skinning chain (matrixWorld ×
        // bindMatrixInverse × boneWorld × inverseBind × bindMatrix).
        const T = new THREE.Matrix4();
        const bi = o.geometry.attributes.skinIndex.getX(0);
        const bone = o.skeleton.bones[bi];
        T.multiplyMatrices(o.matrixWorld, o.bindMatrixInverse);
        T.multiply(bone.matrixWorld);
        T.multiply(o.skeleton.boneInverses[bi]);
        T.multiply(o.bindMatrix);
        const Tinv = T.clone().invert();
        const pos = o.geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(T);
          fWorld(v);
          v.applyMatrix4(Tinv);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        o.geometry.computeBoundingBox();
        o.geometry.computeBoundingSphere();
      });
    }
  } else if (spec.id === 'recon_tank') {
    const gear = getCommunityGearMaterials(spec);
    scene.traverse((o) => {
      if (!o.isSkinnedMesh || !o.skeleton) return;
      const wheelBone = o.skeleton.bones.map((b) => /wheel/i.test(b.name || ''));
      if (!wheelBone.some(Boolean)) return;
      const si = o.geometry.attributes.skinIndex;
      const sw = o.geometry.attributes.skinWeight;
      if (!si || !sw) return;
      refineCommunityGeometry(o);   // bake the vertex dust/AO the gear mats expect
      const isWheelVert = (i) => {
        let best = 0, bestW = -1;
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          if (w > bestW) { bestW = w; best = si.getComponent(i, k); }
        }
        return !!wheelBone[best];
      };
      splitTrianglesToGroups(o, isWheelVert, gear.wheel);
    });
    // 57 mm gun: bone-driven tube, slim laterally (bone Y runs along the bore)
    if (gun) { gun.scale.x *= 0.62; gun.scale.z *= 0.62; gun.updateMatrixWorld(true); }
  } else if (spec.id === 'newc_pziii' && gun) {
    const gear = getCommunityGearMaterials(spec);
    gun.traverse((o) => {
      if (o.isMesh) o.material = gear.track;
    });
    gun.scale.x *= 1.5;
    gun.scale.y *= 1.5;
    gun.updateMatrixWorld(true);
  } else if (spec.id === 't90a') {
    // tank_models r2 (critic: "running gear, wheels and skirts rendered fully
    // tan/beige against a green upper hull with a sawtooth boundary"): the
    // offline bake fused the SIDE SKIRTS into the 'tracks_running_gear' node,
    // so the whole band — skirts included — took the dark/dusty gear steel.
    // Real T-90A skirts are hull-painted. Split the gear mesh's triangles:
    // everything above the wheel line rejoins the live camo canvas (skirts +
    // covered top run), wheels/track stay gear steel.
    const camoSkirt = new THREE.MeshStandardMaterial({
      name: 'AddOnCamoHullSkirt', map: getSharedCamoTexture(spec),
      roughness: 0.86, metalness: 0.08,
      roughnessMap: getSharedRoughnessTexture(spec),
      vertexColors: true,
      envMapIntensity: 0.55,
    });
    camoSkirt.onBeforeCompile = vehicleAmbientFloorHook;
    camoSkirt.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || !/tracks_running_gear/i.test(o.name || '')) return;
      const pos = o.geometry.attributes.position;
      if (!pos) return;
      boxUVRaw(o.geometry, 0.34);
      splitTrianglesToGroups(o,
        (i) => pos.getY(i) > 0.84 && Math.abs(pos.getX(i)) > 1.35, camoSkirt);
    });
    // Kontakt-5 clam-shell wedges on the turret cheeks — "the single most
    // identifying T-90A feature" (critic). The decimated asset's cheek wedges
    // read flat; stand a proud angled plate pair flanking the gun, painted on
    // the shared camo canvas. TurretPivot-local frame is y-up/z-forward
    // (offline probe: TurretMesh spans y -0.05..1.52, z -2.54..2.24).
    const turretP = findNode(scene, /^TurretPivot$/i);
    if (turretP) {
      const mat = addOnMaterial(spec);
      for (const sgn of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.30, 0.40, 0.86);
        addOnUV(g);
        const m = new THREE.Mesh(g, mat);
        m.position.set(sgn * 0.52, 0.42, 1.42);
        m.rotation.set(-0.14, sgn * 0.95, sgn * 0.10);
        m.castShadow = m.receiveShadow = true;
        turretP.add(m);
      }
    }
  } else if (spec.id === 'is7') {
    // tank_models r1 (critic: "IS-7 is one coat of waxy monochrome green
    // including its tracks and wheels"): the print asset fuses the whole
    // running gear into the hull mesh with a single untextured material, so
    // the node-name gear split never fires. Split the HULL mesh's triangles
    // by position — everything outboard of the sponson line and below the
    // fender level is track/wheel steel.
    const gear = getCommunityGearMaterials(spec);
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry || /turret/i.test(o.name || '')) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || !/AddOnCamoHull/.test(m.name || '')) return;
      const pos = o.geometry.attributes.position;
      if (!pos) return;
      splitTrianglesToGroups(o,
        (i) => Math.abs(pos.getX(i)) > 1.15 && pos.getY(i) < 1.18, gear.track);
    });
  } else if (spec.id === 'kf51') {
    // tank_models r4 (critic: "KF51 has no side skirts — modern-roster.md
    // specifies overlapping angled slats + chunky mud flaps — and the rusted
    // orange-brown wheel finish clashes with the pristine camo hull"):
    // 1. gear albedo: the asset's 'Panther_KF51_Treads'/'..._Wheels'
    //    materials route to the shared dark gear steel / scheme wheel pair
    //    (same cohesion language as the rest of the fleet);
    // 2. the missing slat-skirt row + mud flaps are added as scheme-painted
    //    add-on geometry in a metric-frame rig (the rig's local transform
    //    cancels the scene normalization, so parts are authored in meters).
    const gear = getCommunityGearMaterials(spec);
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        if (!m) continue;
        const r = /Treads/i.test(m.name || '') ? gear.track
          : /Wheels/i.test(m.name || '') ? gear.wheel : null;
        if (!r) continue;
        refineCommunityGeometry(o);
        if (Array.isArray(o.material)) o.material[i] = r; else o.material = r;
      }
    });
    const rig = new THREE.Object3D();
    rig.name = 'Kf51SkirtRig';
    scene.add(rig);
    rig.matrix.copy(scene.matrix).invert();
    rig.matrix.decompose(rig.position, rig.quaternion, rig.scale);
    const mat = addOnMaterial(spec);
    for (const sgn of [-1, 1]) {
      // continuous upper skirt band along the sponson line
      addPart(rig, mat, new THREE.BoxGeometry(0.05, 0.24, 6.5), sgn * 1.73, 1.17, 0.05);
      // overlapping angled slat row over the upper wheel run
      for (let k = 0; k < 9; k++) {
        const slat = addPart(rig, mat, new THREE.BoxGeometry(0.045, 0.36, 0.80),
          sgn * 1.745, 0.90, 3.15 - k * 0.72, sgn * 0.07);
        slat.rotation.z = sgn * 0.12;
      }
      // chunky mud flaps, front + rear (dark gear rubber/steel)
      addPart(rig, gear.track, new THREE.BoxGeometry(0.52, 0.44, 0.05), sgn * 1.48, 0.62, 3.74);
      addPart(rig, gear.track, new THREE.BoxGeometry(0.52, 0.44, 0.05), sgn * 1.48, 0.62, -3.72);
    }
  }
}

/**
 * tank_models r1: white tactical number quads for sourced-GLB turrets (the
 * procedural fleet gets numbers via tankFactory decals; GLB variants shipped
 * bare — modern-roster.md §13.5 explicitly specs the T-90A's "112").
 */
function addGlbTurretNumber(turret, text, spots, size = 0.6) {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 256;
  const c2 = cnv.getContext('2d');
  c2.clearRect(0, 0, 256, 256);
  c2.font = `bold ${Math.min(150, Math.floor(430 / Math.max(1, text.length)))}px sans-serif`;
  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  c2.lineWidth = 12;
  c2.strokeStyle = 'rgba(20,20,20,0.6)';
  c2.strokeText(text, 128, 128);
  c2.fillStyle = 'rgba(216,214,206,0.95)';
  c2.fillText(text, 128, 128);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({
    name: 'AddOnNumber_addon', map: tex, transparent: true,
    roughness: 0.85, metalness: 0.05,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    depthWrite: false,
  });
  for (const [x, y, z, ry] of spots) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = false;
    m.receiveShadow = true;
    turret.add(m);
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

// ---------------------------------------------------------------------------
// PERF (performance_budget r2): cascade shadow-proxy LODs for GLB vehicles.
//
// Measured on HEAD (tools/tmp-perf-diag.mjs + A/B lever probe, m1a2/verdant
// 60 s battle): the swapped GLB fleet carries 25-83 shadow-casting meshes per
// vehicle (upgradeMaterials set castShadow=true on EVERY sub-mesh, including
// each signature-kit add-on part), and each caster costs one draw per CSM
// cascade it intersects. Turning tank casters off measured calls median
// 569 -> 271 and worst-frame 991 -> 303, triangles median -0.96 M — tank
// shadow passes alone were ~55% of all draw calls and the entire worst-frame
// budget breach (probe max 1095 vs the 900 gate).
//
// The AAA fix is a shadow proxy: the procedural stand-in meshes that the swap
// just hid ARE a spec-accurate low-poly version of the vehicle — merge their
// casting geometry into ONE position-only mesh per articulation group (hull /
// turret / gun so the proxy tracks yaw + elevation), let those cast, and turn
// every GLB sub-mesh's castShadow off. Shadow silhouettes stay (same spec
// dimensions), draws per tank drop from ~25-83 x cascades to 3 x cascades.
// The proxy wears a colorWrite:false depthWrite:false material: three's
// shadow pass only respects object.visible + layers vs the MAIN camera
// (WebGLShadowMap.renderObject), so a shadow-only mesh must stay visible and
// simply write nothing in the color pass (3 null draws per vehicle).
const _shadowProxyMat = new THREE.MeshBasicMaterial({
  name: 'ShadowProxy', colorWrite: false, depthWrite: false,
});
function buildShadowProxy(g, label) {
  const sources = [];
  g.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const collect = (node) => {
    if (node.isLOD) {
      // highest-detail level only — the proxy is already the LOD
      if (node.levels && node.levels[0] && node.levels[0].object) collect(node.levels[0].object);
      return;
    }
    if (node.isMesh && !node.isInstancedMesh && node.castShadow && node.geometry &&
        node.geometry.attributes && node.geometry.attributes.position &&
        node.geometry.attributes.position.count >= 12) {
      sources.push(node);
    }
    for (const c of node.children) collect(c);
  };
  for (const child of g.children) {
    // only the procedural stand-ins the swap just hid
    if (child.visible === false && (child.isMesh || child.isLOD || child.isInstancedMesh)) collect(child);
  }
  if (!sources.length) return null;
  const geos = [];
  for (const m of sources) {
    m.updateWorldMatrix(true, false);
    // depth-only pass: position (+index) is all a shadow map samples
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', m.geometry.attributes.position.clone());
    if (m.geometry.index) geo.setIndex(m.geometry.index.clone());
    geo = geo.toNonIndexed ? (geo.index ? geo.toNonIndexed() : geo) : geo;
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    geos.push(geo);
  }
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (!merged) return null;
  const proxy = new THREE.Mesh(merged, _shadowProxyMat);
  proxy.name = `shadowProxy_${label}`;
  proxy.castShadow = true;
  proxy.receiveShadow = false;
  proxy.frustumCulled = true;
  // shadow-only: must never intercept aim/LOS/picking Raycasters — the
  // procedural silhouette overhangs the GLB hull in places
  proxy.raycast = () => {};
  g.add(proxy);
  return proxy;
}

// ---------------------------------------------------------------------------
// PERF (performance_budget r3): main-pass kit merge for multi-mesh GLBs.
// See the applySwap call site for the budget rationale. Groups static,
// visible, single-material, unskinned leaf meshes of one articulation
// subtree by (material instance, attribute layout, indexed-ness), bakes each
// mesh's transform relative to the subtree root, merges every 2+ bucket into
// ONE mesh, and removes the originals. Material instances are reused as-is,
// so the camo repaint registry keeps working; buckets of one are untouched.
function mergeStaticKit(container, label) {
  const buckets = new Map();
  container.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  container.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o === container) return;
    if (!o.visible || Array.isArray(o.material) || !o.material) return;
    if (o.name && o.name.startsWith('shadowProxy_')) return;
    const g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return;
    // subtree visibility up to (not including) the container
    let p = o.parent;
    while (p && p !== container) { if (p.visible === false) return; p = p.parent; }
    const layout = Object.keys(g.attributes).sort().join(',');
    const key = `${o.material.uuid}|${layout}|${g.index ? 'i' : 'n'}`;
    let b = buckets.get(key);
    if (!b) { b = { mat: o.material, meshes: [] }; buckets.set(key, b); }
    b.meshes.push(o);
  });
  let mergedCount = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const geos = [];
    const srcs = [];
    for (const m of b.meshes) {
      m.updateWorldMatrix(true, false);
      rel.multiplyMatrices(inv, m.matrixWorld);
      // mirrored kit parts (negative-determinant transform) would merge with
      // flipped winding — leave them as their own draw
      if (rel.determinant() < 0) continue;
      const geo = m.geometry.clone();
      geo.applyMatrix4(rel);
      geos.push(geo);
      srcs.push(m);
    }
    if (geos.length < 2) { for (const g of geos) g.dispose(); continue; }
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch (_) { merged = null; }
    for (const g of geos) g.dispose(); // merge copies data; clones are scratch
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.name = `kitMerged_${label}_${mergedCount++}`;
    // per-instance merged geometry (clones share cache geometry, merges
    // cannot) — tankFactory dispose() frees anything tagged __kitMerged.
    mesh.userData.__kitMerged = true;
    mesh.castShadow = false;   // shadow proxies carry the cascade silhouette
    mesh.receiveShadow = true;
    container.add(mesh);
    for (const m of srcs) m.removeFromParent();
  }
}

/** Effective-visibility traverse: skip subtrees hidden by the swap sweep. */
function visibleMeshes(root, fn) {
  const walk = (node) => {
    if (node.visible === false) return;
    if (node.isMesh || node.isInstancedMesh) fn(node);
    for (const c of node.children) walk(c);
  };
  walk(root);
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
  // tank_models r2: variant GLB kit fixes (ARAT flatten, slat cage seat,
  // muzzle collar slim) — see applyAbramsVariantFixes
  if (spec.id === 'm1a1' || spec.id === 'm1a2_tusk') applyAbramsVariantFixes(scene, spec);

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

  // tank_models r2 (critic minor: the buh Leopard 2A6's "L/55 should overhang
  // dramatically" but reads closer to L/44): measure the barrel reach from the
  // authored trunnion origin in the normalized frame and stretch the gun node
  // along its bore when it lands short of the spec's 6.6 m Rh-120 L/55. The
  // authored 'gun' node carries an identity rotation (offline probe), so its
  // local z IS the bore axis after the yaw normalization above.
  if (spec.id === 'leo2a6' && gun) {
    const gb = bboxExcluding(gun, null);
    const go = new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld);
    const reach = gb.max.z - go.z;
    const want = spec.armor.gunBarrel.lengthM;
    if (reach > 2 && reach < want * 0.97) {
      gun.scale.z *= want / reach;
      scene.updateMatrixWorld(true);
    }
  }

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
  if (cfg.paintUntextured) paintUntextured(scene, spec, s, cfg);
  // r10: camo-paint the m1a2's untextured gun tube (flat-green prop critique)
  if (spec.id === 'm1a2' && gun) paintGlbGunTube(gun, spec);
  // r10: per-spec community cohesion surgery (q_heavy loops, recon wheels
  // + barrel, newc_pziii gun) — see applyCommunityFixes
  applyCommunityFixes(scene, spec, gun);
  // tank_models r1: T-90A '112' turret number (modern-roster.md §13.5) —
  // coords are TurretPivot-local (raw frame minus the pivot translation).
  if (spec.id === 't90a' && turret) {
    addGlbTurretNumber(turret, '112', [
      [1.38, 0.55, -1.05, Math.PI / 2],
      [-1.38, 0.55, -1.05, -Math.PI / 2],
    ], 0.55);
  }
  // camo: texture-space pattern composite onto the asset's baked albedo
  // (materials.js owns it — pattern tile + luminance-normalized grayscale
  // detail overlay + alpha restore; weathering/AO preserved).
  // Live when the garage picker or an AUTO biome switch changes the pattern.
  applyCamoToModel(scene, spec, { shareCap: cfg.heroTex ? 1024 : 512 });

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
    const tipPts = [];
    gun.traverse((n) => {
      if (!n.isMesh || !n.geometry || !n.geometry.getAttribute) return;
      const pa = n.geometry.getAttribute('position');
      if (!pa) return;
      rel.multiplyMatrices(invRec, n.matrixWorld);
      const step = Math.max(1, Math.floor(pa.count / 4000));
      for (let i = 0; i < pa.count; i += step) {
        vtx.fromBufferAttribute(pa, i).applyMatrix4(rel);
        tipPts.push(vtx.x, vtx.y, vtx.z);
        if (vtx.z > tipZ) tipZ = vtx.z;
      }
    });
    if (tipZ > 0.8 && Number.isFinite(tipZ)) {
      // lighting_post r5: bore-line centroid over the last 0.35 units of tube
      // — anchors the flash to the ACTUAL tube axis, not the procedural
      // barrel's origin. The r3 pass re-derived only Z; X/Y stayed at the
      // procedural (0,0), which floats ~0.3-0.5 m off any GLB whose tube
      // centerline is not at recoilG-local y=0 (m1a2: flash ~0.4 m above the
      // bore tip, combat_firing 07:28 batch).
      let cx = 0, cy = 0, cn = 0;
      for (let i = 0; i < tipPts.length; i += 3) {
        if (tipPts[i + 2] > tipZ - 0.35) { cx += tipPts[i]; cy += tipPts[i + 1]; cn++; }
      }
      muzzle.position.set(cn ? cx / cn : 0, cn ? cy / cn : 0, tipZ - 0.04);
    }
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
  // tank_models r1: flag the swap so later visibility toggles on procedural
  // gear (tankFactory setBroken repair path) never resurrect the hidden
  // stand-in meshes beside the GLB.
  hullG.userData.__glbSwapped = true;

  // PERF (performance_budget r3): GLB kit-merge — the draw-call worst-frame
  // fix the r2 shadow proxy left unfinished. Community/print GLBs ship the
  // vehicle as 25-83 separate kit meshes; the proxy removed their CASCADE
  // draws but every mesh still costs one MAIN-pass draw, so a random roster
  // fielding several unmerged GLBs measured 1095 worst-frame calls vs the
  // 900 budget (round-2 critic) while merged-kit rosters passed with 2x
  // headroom. After all name-targeted surgery/camo passes are done (order
  // matters: this runs LAST), merge static single-material leaf meshes per
  // articulation subtree (hull scene / turret / gun keep articulating).
  // Buckets key on material instance + attribute layout, so the camo
  // repaint path (materials.js entry.mats — material references, not mesh
  // references) keeps restyling merged kits live. Skinned/instanced/multi-
  // material meshes are left alone. kv2: 83 meshes -> 7. Merged geometry is
  // per-instance (clones share cache geometry, merges cannot) — tankFactory
  // dispose() frees anything tagged __kitMerged on eviction.
  mergeStaticKit(scene, 'hull');
  if (turret) mergeStaticKit(turret, 'turret');
  if (gun) mergeStaticKit(gun, 'gun');

  // PERF (performance_budget r2): shadow-proxy LODs — see buildShadowProxy.
  // Order matters: proxies are built FROM the just-hidden procedural casters,
  // then every still-visible (= GLB + kit) mesh stops casting. The proxies are
  // idempotent per group (repeat swaps on the same visual bail on the flag).
  if (!hullG.userData.__shadowProxied) {
    hullG.userData.__shadowProxied = true;
    buildShadowProxy(hullG, 'hull');
    buildShadowProxy(turretG, 'turret');
    buildShadowProxy(recoilG, 'gun');
    if (gunG) buildShadowProxy(gunG, 'mantlet');
    // hullG and turretG are SIBLINGS under the tank root (tankFactory
    // articulation layout) — sweep the whole root or the turret-side GLB
    // subtree (where most signature-kit addPart meshes live) keeps casting.
    const sweepRoot = (hullG.parent && !hullG.parent.isScene) ? hullG.parent : hullG;
    visibleMeshes(sweepRoot, (o) => {
      if (o.name && o.name.startsWith('shadowProxy_')) return;
      o.castShadow = false;
    });
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
  // tank_models r2: register the pending swap BEFORE the load so the priority
  // lane can bump this tank's parse job the moment its root joins the live
  // scene (garage pedestal selection vs the thumbs booth queue).
  _pendingSwapCtx.add(ctx);
  try {
    // PERF r3: hero closeup-contract GLBs keep 2048 color maps; everything
    // else imports at the 1024 cap (see capGlbSceneTextures).
    const gltf = await loadGltf(ctx.cfg.path, ctx.cfg.heroTex ? GLB_TEX_CAPS_HERO : GLB_TEX_CAPS);
    // late-decoded textures (resilient-loader retries) get capped on the
    // next swap — no-op when the parse-time pass already shrank everything.
    capGlbSceneTextures(gltf.scene, ctx.cfg.heroTex ? GLB_TEX_CAPS_HERO : GLB_TEX_CAPS);
    // PERF (performance_budget r4): the swap itself (skeleton clone, triangle
    // surgery, creased normals, camo composite) is also a main-thread chunk —
    // run it through the same battle-safe idle gate, then pre-upload textures
    // and compile programs in the same slot so the next frame binds nothing new.
    return await idleGate(() => {
      // The visual may have been evicted/disposed while the job waited (battle
      // roster change, thumbs booth teardown): a detached tank root means the
      // procedural stand-in is gone from the scene — skip the dead swap.
      let root = ctx.hullG;
      while (root.parent) root = root.parent;
      if (!root.isScene) return false;
      const ok = applySwap(gltf, ctx);
      if (ok) warmSwappedModel(ctx);
      // tank_models r2 (critic major: pedestal placeholder/blank for 15-45 s):
      // main.js hides the garage hero while its GLB loads, but its reveal poll
      // waits for the WHOLE load queue to settle (~20 thumb GLBs) — the hero
      // stayed hidden long after its own swap landed (probe: swap at t+8 s,
      // reveal never before t+30 s). The swap is the authoritative "this
      // tank's real model is on stage" moment: re-show the tank root here.
      // Battle spotting re-asserts visibility per frame, so this only ever
      // matters on the garage pedestal.
      if (ok && !inBattle()) {
        const tankRoot = ctx.hullG.parent;
        if (tankRoot && tankRoot.visible === false) tankRoot.visible = true;
      }
      return ok;
    }, ctx.cfg.path);
  } finally {
    _pendingSwapCtx.delete(ctx);
  }
}
