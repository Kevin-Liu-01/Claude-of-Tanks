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
  for (const spec of specs) {
    let visual = null;
    try {
      visual = createTank(spec.id, engineCtx, { camoSeed: 4200, quality: 'high' });
      scene.add(visual.root);
      visual.root.updateMatrixWorld(true);
      box.setFromObject(visual.root);
      box.getBoundingSphere(sph);
      box.getCenter(center);
      // 3/4 side-profile, nose to screen-right, ~11° above the deck
      const az = -64 * Math.PI / 180; // from +Z (hull forward)
      const el = 12 * Math.PI / 180;
      const hFov = 2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
      const dist = (sph.radius * 0.84) / Math.sin(hFov / 2);
      camera.position.set(
        center.x + Math.sin(az) * Math.cos(el) * dist,
        center.y + Math.sin(el) * dist,
        center.z + Math.cos(az) * Math.cos(el) * dist,
      );
      camera.lookAt(center.x, center.y - sph.radius * 0.04, center.z);
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

/**
 * Render portraits for all specs once (idempotent). Upgrades every
 * <img data-cot-thumb> in the document and fires `cot:tank-thumbs`.
 * @param {TankSpec[]} specs
 */
export function ensureTankThumbs(specs) {
  if (started) return;
  started = true;
  // First pass renders SYNCHRONOUSLY at garage boot so the carousel never
  // shows the flat baked icons in a capture: glb-sourced vehicles render
  // their procedural stand-in now and are re-rendered the moment the GLB
  // finishes parsing (kicked off by the boot pedestal).
  renderAll(specs);
  if (cache.size) {
    applyTankThumbs(document);
    document.dispatchEvent(new CustomEvent('cot:tank-thumbs'));
  }
  const glbSpecs = specs.filter((s) => {
    const src = MODEL_SOURCE[s.id];
    return src && src.source === 'glb';
  });
  if (!glbSpecs.length) return;
  (async () => {
    await waitForGlbModels(glbSpecs, 15000);
    renderAll(glbSpecs);
    applyTankThumbs(document);
    document.dispatchEvent(new CustomEvent('cot:tank-thumbs'));
  })();
}
