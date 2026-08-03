// deviceDiag.js — boot-time GPU self-test + rescue ladder + on-screen
// diagnostic overlay.
//
// WHY (mobile r2): the owner's iPhone renders every LIT mesh black (terrain,
// vehicles, buildings) while unlit surfaces (sky, horizon ring, HUD) are
// fine — on a device we cannot attach an inspector to, and which no desktop
// browser reproduces (Mac WebKit + Chromium render the same bundle
// correctly; the uniform/sampler census puts every program inside iOS
// limits). Instead of guessing, the game proves at boot which pipeline stage
// the device can actually render:
//
//   basic      — unlit MeshBasicMaterial
//   lit        — MeshStandardMaterial, shadow maps OFF
//   litShadow  — MeshStandardMaterial, shadow maps ON (the custom CSM
//                getShadow injection + penumbra probe ride along exactly as
//                in the live scene)
//
// Each probe renders one tiny frame to a 16x16 target and reads a pixel that
// must be non-black. If `lit` passes but `litShadow` fails, the renderer's
// shadow maps are disabled for the session (flat-lit beats black) and the
// overlay says so. Any shader link errors captured by renderer.debug's
// onShaderError are shown too, so a single screenshot from the failing
// device names the root cause.
//
// Overlay visibility: always with ?diag=1; automatically when a rescue
// engaged or `lit` failed — but never under navigator.webdriver unless
// ?diag=1 (screenshot-contract safety).
import * as THREE from 'three';

const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const DIAG_PARAM = qs ? qs.get('diag') : null;
const FORCE = qs ? qs.get('diagforce') : null; // 'noshadow' | 'nolit' (test rig)

/** Global shader-error collector — installed once, survives the whole run. */
export function installShaderErrorCollector(renderer) {
  const bag = (window.__GL_DIAG = window.__GL_DIAG || { errors: [] });
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    try {
      const pl = String(gl.getProgramInfoLog(program) || '').trim();
      const fl = String(gl.getShaderInfoLog(fs) || '').trim();
      const vl = String(gl.getShaderInfoLog(vs) || '').trim();
      const msg = [pl, fl && `FS: ${fl}`, vl && `VS: ${vl}`].filter(Boolean).join(' | ').slice(0, 400);
      if (bag.errors.length < 8) bag.errors.push(msg || 'link failed (no info log)');
      // also refresh the overlay if it is already mounted
      if (bag._refresh) bag._refresh();
    } catch (_) { /* diagnostics must never throw */ }
  };
  return bag;
}

function probeScene(withBox) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
  cam.position.set(0, 4, 6);
  cam.lookAt(0, 0, 0);
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(3, 8, 2);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd4e8, 0x4a4034, 0.35));
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x7a9a4d, roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  let box = null;
  if (withBox) {
    box = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xb8452c, roughness: 0.8 }),
    );
    box.position.set(-2.5, 0.7, 0); // off to the side: read pixel stays SUNLIT
    scene.add(box);
  }
  return { scene, cam, sun, ground, box };
}

function readCenter(renderer, rt, buf) {
  renderer.readRenderTargetPixels(rt, 8, 8, 1, 1, buf);
  return buf[0] + buf[1] + buf[2];
}

/**
 * Render the three probes. Restores every renderer state it touches.
 * @returns {{basic:boolean, lit:boolean, litShadow:boolean, errors:string[]}}
 */
export function runDeviceDiag(renderer) {
  const bag = window.__GL_DIAG || { errors: [] };
  const out = { basic: false, lit: false, litShadow: false, errors: bag.errors };
  const prevShadow = renderer.shadowMap.enabled;
  const prevTarget = renderer.getRenderTarget();
  const rt = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true });
  const buf = new Uint8Array(4);
  try {
    // basic (unlit)
    {
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
      cam.position.set(0, 0, 3);
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0xcc3322 })));
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      out.basic = readCenter(renderer, rt, buf) > 24;
      scene.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
    }
    // lit, shadows OFF
    {
      renderer.shadowMap.enabled = false;
      const p = probeScene(false);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(p.scene, p.cam);
      out.lit = FORCE === 'nolit' ? false : readCenter(renderer, rt, buf) > 24;
      p.scene.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
    }
    // lit, shadows ON (CSM-style depth compare path compiles here)
    {
      renderer.shadowMap.enabled = true;
      const p = probeScene(true);
      p.sun.castShadow = true;
      p.sun.shadow.mapSize.set(256, 256);
      p.sun.shadow.camera.near = 0.5;
      p.sun.shadow.camera.far = 30;
      p.ground.receiveShadow = true;
      if (p.box) p.box.castShadow = true;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(p.scene, p.cam);
      out.litShadow = FORCE === 'noshadow' ? false : readCenter(renderer, rt, buf) > 24;
      p.scene.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
      if (p.sun.shadow.map) p.sun.shadow.map.dispose();
    }
  } catch (e) {
    if (bag.errors.length < 8) bag.errors.push('diag threw: ' + String(e && e.message ? e.message : e).slice(0, 200));
  } finally {
    renderer.shadowMap.enabled = prevShadow;
    renderer.setRenderTarget(prevTarget);
    rt.dispose();
  }
  return out;
}

/**
 * Degrade the renderer so the device renders SOMETHING correct.
 * @returns {?string} rescue applied ('shadows-off') or null
 */
export function applyDiagRescue(renderer, diag) {
  if (diag.lit && !diag.litShadow) {
    // flat-lit beats black: the shadow depth-compare path is the only stage
    // this device fails — run the session without shadow maps.
    renderer.shadowMap.enabled = false;
    return 'shadows-off';
  }
  return null;
}

/** Small fixed overlay; safe to call unconditionally (it decides visibility). */
export function mountDiagOverlay({ tier, diag, rescue, renderer }) {
  const webdriver = typeof navigator !== 'undefined' && navigator.webdriver;
  const wanted = DIAG_PARAM === '1' || (!webdriver && (rescue || !diag.lit));
  if (!wanted) return;
  const gl = renderer.getContext();
  const cap = (k) => { try { return gl.getParameter(gl[k]); } catch (_) { return '?'; } };
  const el = document.createElement('div');
  el.id = 'cot-diag';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:400;background:rgba(5,8,11,.88);'
    + 'color:#ffd27a;font:10px/1.5 ui-monospace,Menlo,monospace;padding:8px 10px;border:1px solid #6b5a33;'
    + 'border-radius:4px;max-width:82vw;pointer-events:none;white-space:pre-wrap;';
  const bag = window.__GL_DIAG || { errors: [] };
  const render = () => {
    const ok = (v) => (v ? 'OK' : 'FAIL');
    el.textContent =
      `COT DIAG  tier=${tier}  ${String(cap('VERSION')).slice(0, 40)}\n`
      + `fragVec=${cap('MAX_FRAGMENT_UNIFORM_VECTORS')} vertVec=${cap('MAX_VERTEX_UNIFORM_VECTORS')} `
      + `tex=${cap('MAX_TEXTURE_IMAGE_UNITS')} texSize=${cap('MAX_TEXTURE_SIZE')} dpr=${window.devicePixelRatio}\n`
      + `probe: basic=${ok(diag.basic)} lit=${ok(diag.lit)} lit+shadow=${ok(diag.litShadow)}`
      + (rescue ? `\nRESCUE: ${rescue === 'shadows-off' ? 'shadow maps disabled for this session' : rescue}` : '')
      + (bag.errors.length ? `\nshader errors (${bag.errors.length}):\n` + bag.errors.map((e) => '  ' + e.slice(0, 220)).join('\n') : '');
  };
  bag._refresh = render;
  render();
  const mount = () => document.body.appendChild(el);
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount, { once: true });
}
