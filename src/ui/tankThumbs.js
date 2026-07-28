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
  // r5: brighter booth — the old 1.05 exposure / 3.4 key rendered murky,
  // low-contrast card thumbs against the dark carousel plates
  // (r6: BASE only — a per-thumb exposure lift below normalizes dark camo)
  const BASE_EXPOSURE = 1.16;
  renderer.toneMappingExposure = BASE_EXPOSURE;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, THUMB_W / THUMB_H, 0.1, 200);
  // studio rig: warm key from the camera side, cool sky fill, hard white-blue
  // rim from behind-above so the silhouette pops off the dark card
  const hemi = new THREE.HemisphereLight(0xc4d4e4, 0x3a362e, 1.35);
  const key = new THREE.DirectionalLight(0xfff0d6, 4.1);
  key.position.set(-7, 8, 4);
  const fill = new THREE.DirectionalLight(0x9fb4cc, 1.0);
  fill.position.set(6, 2, 6);
  const rim = new THREE.DirectionalLight(0xeaf3ff, 3.8);
  rim.position.set(6, 7, -8);
  scene.add(hemi, key, fill, rim);

  const engineCtx = {
    renderer, scene, camera,
    setupShadowMaterial: (m) => m, // no CSM in the portrait booth
    anisotropy: 8, quality: 'high',
  };

  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const _size = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  // r4 AUTOFRAME: measure the RENDERED silhouette (alpha bbox) and correct
  // the camera so every card fills the same frame fraction. Geometry-derived
  // framing (bbox/sphere/hull-length heuristics) kept drifting per model —
  // the GLB Abrams rendered at ~60% the apparent size of its procedural
  // neighbors. Pixels cannot lie: two measure/correct passes converge every
  // vehicle onto the same footprint regardless of antennas, gun overhang or
  // asset-space quirks.
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = THUMB_W; measureCanvas.height = THUMB_H;
  const mctx = measureCanvas.getContext('2d', { willReadFrequently: true });
  const FILL_W = 0.86; // target silhouette width as a fraction of the card
  const FILL_H = 0.74; // target height fraction (leaves nameplate air below)
  function measureAlphaBox() {
    mctx.clearRect(0, 0, THUMB_W, THUMB_H);
    mctx.drawImage(renderer.domElement, 0, 0);
    const d = mctx.getImageData(0, 0, THUMB_W, THUMB_H).data;
    // Coverage-weighted bounds: whip antennas are 1-2px-wide verticals that
    // inflated the raw bbox height (the GLB Abrams framed its HULL at ~60%
    // of its neighbors). Rows with almost no opaque pixels are trimmed; the
    // horizontal gun barrel survives (its rows are long runs), and x-bounds
    // are then taken from the kept rows only.
    const rowCount = new Int32Array(THUMB_H);
    const rowX0 = new Int32Array(THUMB_H).fill(THUMB_W);
    const rowX1 = new Int32Array(THUMB_H).fill(-1);
    let maxRow = 0;
    let lumSum = 0, lumN = 0; // r6: silhouette mean luminance (exposure lift)
    for (let y = 0; y < THUMB_H; y++) {
      for (let x = 0; x < THUMB_W; x++) {
        const o = (y * THUMB_W + x) * 4;
        if (d[o + 3] > 12) {
          rowCount[y]++;
          if (x < rowX0[y]) rowX0[y] = x;
          if (x > rowX1[y]) rowX1[y] = x;
          lumSum += 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
          lumN++;
        }
      }
      if (rowCount[y] > maxRow) maxRow = rowCount[y];
    }
    if (!maxRow) return null;
    const keep = Math.max(3, maxRow * 0.03);
    let x0 = THUMB_W, y0 = -1, x1 = -1, y1 = -1;
    for (let y = 0; y < THUMB_H; y++) {
      if (rowCount[y] < keep) continue;
      if (y0 < 0) y0 = y;
      y1 = y;
      if (rowX0[y] < x0) x0 = rowX0[y];
      if (rowX1[y] > x1) x1 = rowX1[y];
    }
    if (x1 < 0) return null;
    return {
      x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1,
      meanLuma: lumN ? lumSum / (255 * lumN) : 0,
    };
  }
  for (const spec of specs) {
    let visual = null;
    try {
      visual = createTank(spec.id, engineCtx, { camoSeed: 4200, quality: 'high' });
      scene.add(visual.root);
      visual.root.updateMatrixWorld(true);
      box.setFromObject(visual.root);
      box.getCenter(center);
      // 3/4 side-profile, nose to screen-right, ~12° above the deck — the
      // geometric estimate below only SEEDS the autoframe passes.
      const size = box.getSize(_size);
      const halfLen = Math.min(
        Math.hypot(size.x, size.z) * 0.5,
        (spec.dims && spec.dims.hullLengthM ? spec.dims.hullLengthM : Infinity) * 0.62,
      );
      const halfH = Math.min(size.y * 0.5, halfLen * 0.52);
      const az = -64 * Math.PI / 180; // from +Z (hull forward)
      const el = 12 * Math.PI / 180;
      const vTan = Math.tan(camera.fov * Math.PI / 360);
      const hTan = vTan * camera.aspect;
      let dist = Math.max((halfLen * 0.95) / hTan, (halfH * 1.35) / vTan);
      const look = new THREE.Vector3(center.x, center.y - halfLen * 0.05, center.z);
      const frame = () => {
        camera.position.set(
          look.x + Math.sin(az) * Math.cos(el) * dist,
          look.y + Math.sin(el) * dist,
          look.z + Math.cos(az) * Math.cos(el) * dist,
        );
        camera.lookAt(look);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        renderer.render(scene, camera);
      };
      frame();
      for (let pass = 0; pass < 2; pass++) {
        const bb = measureAlphaBox();
        if (!bb) break;
        // scale: bring the larger deficit axis exactly onto its target fill
        const k = Math.min((FILL_W * THUMB_W) / bb.w, (FILL_H * THUMB_H) / bb.h);
        // recenter: pan the rig so the silhouette midpoint hits frame center
        const dxPx = (bb.x0 + bb.x1) / 2 - THUMB_W / 2;
        const dyPx = (bb.y0 + bb.y1) / 2 - THUMB_H / 2;
        const wpp = (2 * dist * vTan) / THUMB_H; // world units per pixel
        _right.setFromMatrixColumn(camera.matrixWorld, 0);
        _up.setFromMatrixColumn(camera.matrixWorld, 1);
        look.addScaledVector(_right, dxPx * wpp).addScaledVector(_up, -dyPx * wpp);
        dist /= k;
        frame();
        if (Math.abs(1 - k) < 0.04 && Math.abs(dxPx) < 4 && Math.abs(dyPx) < 4) break;
      }
      // r6 EXPOSURE NORMALIZATION: dark camo schemes (T-90M Proryv, T-80U,
      // Leclerc, BMP-2) rendered as near-black olive smudges on the dark
      // carousel cards while the Abrams read fine. Lift the tone-map
      // exposure until the silhouette's mean luminance reaches a common
      // floor — every thumb separates from its card at 1080p. Two passes
      // because ACES responds sub-linearly to exposure.
      const TARGET_LUMA = 0.30;
      for (let ep = 0; ep < 2; ep++) {
        const bb = measureAlphaBox();
        if (!bb || bb.meanLuma <= 0.02 || bb.meanLuma >= TARGET_LUMA * 0.97) break;
        renderer.toneMappingExposure = Math.min(BASE_EXPOSURE * 2.1,
          renderer.toneMappingExposure * Math.min(1.65, TARGET_LUMA / bb.meanLuma));
        if (renderer.toneMappingExposure >= BASE_EXPOSURE * 2.1) { frame(); break; }
        frame();
      }
      cache.set(spec.id, renderer.domElement.toDataURL('image/png'));
      renderer.toneMappingExposure = BASE_EXPOSURE; // reset for the next card
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
