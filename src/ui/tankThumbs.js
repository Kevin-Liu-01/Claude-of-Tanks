// src/ui/tankThumbs.js — runtime-rendered tank portraits for the garage
// carousel and tech tree. Each vehicle is rendered ONCE to a small offscreen
// WebGL canvas at a fixed WoT-style 3/4 side-profile angle (nose screen-right,
// low elevation) under a warm key + cool rim light, then cached as a PNG data
// URL. 100% self-contained: the models are the game's own createTank visuals,
// no external assets. The pre-baked public/icons/<id>_angle.png stays as the
// instant fallback until these portraits land (a few hundred ms after boot).
//
// Consumers: give any <img> a `data-cot-thumb="<specId>"` attribute and it is
// upgraded in place when portraits are ready; a `cot:tank-thumbs` document
// event fires once afterwards for anything that renders lazily.
import * as THREE from 'three';
import { createTank } from '../vehicles/tankFactory.js';
import { MODEL_SOURCE } from '../vehicles/specs.js';

const THUMB_W = 424; // 4x the 106x64 carousel slot — crisp at any sane DPR
const THUMB_H = 256;

const cache = new Map(); // specId -> dataURL
let started = false;

/** Cached portrait data URL (null until rendered). @param {string} specId */
export function getTankThumb(specId) {
  return cache.get(specId) || null;
}

/** Swap every <img data-cot-thumb> under `root` to its cached portrait. */
export function applyTankThumbs(root) {
  if (!root || !root.querySelectorAll) return;
  for (const img of root.querySelectorAll('img[data-cot-thumb]')) {
    const url = cache.get(img.dataset.cotThumb);
    if (url && img.src !== url) img.src = url;
  }
}

// The m1a2 visual swaps in its sourced GLB asynchronously on first load (the
// boot pedestal kicks that fetch off). Portraits wait for every glb-sourced
// model to be parsed (or a timeout) so no card ships the procedural stand-in.
async function waitForGlbModels(specs, timeoutMs) {
  const paths = [];
  for (const s of specs) {
    const src = MODEL_SOURCE[s.id];
    if (src && src.source === 'glb' && src.glb && src.glb.path) paths.push(src.glb.path);
  }
  if (!paths.length) return;
  try {
    const m = await import('../vehicles/modelLoader.js');
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      if (paths.every((p) => m.hasCachedGlb(p))) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (e) { /* loader unavailable — render the procedural models */ }
}

function renderAll(specs) {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W; canvas.height = THUMB_H;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
  } catch (e) {
    return; // no second context available — keep the baked icon fallback
  }
  renderer.setSize(THUMB_W, THUMB_H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, THUMB_W / THUMB_H, 0.1, 200);
  // studio rig: warm key from the camera side, cool sky fill, hard white-blue
  // rim from behind-above so the silhouette pops off the dark card
  const hemi = new THREE.HemisphereLight(0xc4d4e4, 0x3a362e, 1.15);
  const key = new THREE.DirectionalLight(0xfff0d6, 3.4);
  key.position.set(-7, 8, 4);
  const fill = new THREE.DirectionalLight(0x9fb4cc, 0.8);
  fill.position.set(6, 2, 6);
  const rim = new THREE.DirectionalLight(0xeaf3ff, 3.6);
  rim.position.set(6, 7, -8);
  scene.add(hemi, key, fill, rim);

  const engineCtx = {
    renderer, scene, camera,
    setupShadowMaterial: (m) => m, // no CSM in the portrait booth
    anisotropy: 8, quality: 'high',
  };

  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const sph = new THREE.Sphere();
  const _size = new THREE.Vector3();
  for (const spec of specs) {
    let visual = null;
    try {
      visual = createTank(spec.id, engineCtx, { camoSeed: 4200, quality: 'high' });
      scene.add(visual.root);
      visual.root.updateMatrixWorld(true);
      box.setFromObject(visual.root);
      box.getBoundingSphere(sph);
      box.getCenter(center);
      // 3/4 side-profile, nose to screen-right, ~11° above the deck.
      // FRAMING (hud_ui r2): normalize the camera distance by the hull
      // FOOTPRINT box, not the bounding sphere — antenna masts and stray gun
      // tips inflated some vehicles' spheres so their cards rendered at a
      // visibly smaller scale than the rest of the row. Every card now fills
      // the same fraction of the frame with the same yaw/elevation/light.
      const size = box.getSize(_size);
      // tank_models r2: clamp to the spec hull length — the GLB swap's long
      // gun overhang (box.setFromObject includes the barrel) measured ~2x the
      // WWII hull-ish boxes and rendered the modern MBT cards at half scale.
      const halfLen = Math.min(
        Math.hypot(size.x, size.z) * 0.5,
        (spec.dims && spec.dims.hullLengthM ? spec.dims.hullLengthM : Infinity) * 0.62,
      );
      // cap mast/antenna influence on height framing (they read as air)
      const halfH = Math.min(size.y * 0.5, halfLen * 0.52);
      const az = -64 * Math.PI / 180; // from +Z (hull forward)
      const el = 12 * Math.PI / 180;
      const vTan = Math.tan(camera.fov * Math.PI / 360);
      const hTan = vTan * camera.aspect;
      const dist = Math.max((halfLen * 0.95) / hTan, (halfH * 1.35) / vTan);
      camera.position.set(
        center.x + Math.sin(az) * Math.cos(el) * dist,
        center.y + Math.sin(el) * dist,
        center.z + Math.cos(az) * Math.cos(el) * dist,
      );
      camera.lookAt(center.x, center.y - halfLen * 0.05, center.z);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      cache.set(spec.id, renderer.domElement.toDataURL('image/png'));
    } catch (e) {
      /* keep the baked icon for this vehicle */
    }
    if (visual) {
      scene.remove(visual.root);
      try { visual.dispose(); } catch (e) { /* already partially disposed */ }
    }
  }
  renderer.dispose();
  if (renderer.forceContextLoss) { try { renderer.forceContextLoss(); } catch (e) { /* fine */ } }
}

// PERF (perf-budget r3): portrait rendering is a WORK QUEUE, not a sync
// boot pass. The old sync renderAll put ~1.5-2 s of createTank + second-WebGL-
// context boot on the __GAME_READY critical path, and the follow-up GLB
// re-render pass fired on a wall-clock timer that landed MID-BATTLE (probe
// measured 3.0 s + 1.3 s frames when it ran under a battle). Chunks render one
// vehicle at a time on idle callbacks and only while `canWork()` allows (the
// garage gates this on its own visibility — battles never stall); the
// screenshot recipes drain synchronously via drainTankThumbs() so captured
// garage/techtree frames always carry finished portraits.
const queue = [];
let canWorkFn = () => true;
let pumpScheduled = false;

function notifyDone() {
  applyTankThumbs(document);
  document.dispatchEvent(new CustomEvent('cot:tank-thumbs'));
}

function pump() {
  pumpScheduled = false;
  if (!queue.length) return;
  if (canWorkFn()) {
    const spec = queue.shift();
    renderAll([spec]);
    notifyDone();
  }
  schedulePump();
}

function schedulePump() {
  if (pumpScheduled || !queue.length) return;
  pumpScheduled = true;
  if (typeof requestIdleCallback === 'function') requestIdleCallback(pump, { timeout: 700 });
  else setTimeout(pump, 120);
}

/** Synchronously finish every queued portrait (screenshot determinism). */
export function drainTankThumbs() {
  if (!queue.length) return;
  const rest = queue.splice(0, queue.length);
  renderAll(rest);
  notifyDone();
}

/**
 * Queue portraits for all specs once (idempotent). Upgrades every
 * <img data-cot-thumb> in the document and fires `cot:tank-thumbs` as
 * chunks complete. GLB-sourced vehicles are re-queued once their model
 * parses so no card keeps the procedural stand-in.
 * @param {TankSpec[]} specs
 * @param {{canWork?: () => boolean}} [opts] chunk gate (e.g. garage visible)
 */
export function ensureTankThumbs(specs, opts = {}) {
  if (started) return;
  started = true;
  if (opts.canWork) canWorkFn = opts.canWork;
  queue.push(...specs);
  schedulePump();
  const glbSpecs = specs.filter((s) => {
    const src = MODEL_SOURCE[s.id];
    return src && src.source === 'glb';
  });
  if (!glbSpecs.length) return;
  (async () => {
    await waitForGlbModels(glbSpecs, 15000);
    queue.push(...glbSpecs);
    schedulePump();
  })();
}
