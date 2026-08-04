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

/**
 * Battle-time relaxation (perf-r2): three's checkShaderErrors forces a
 * SYNCHRONOUS getProgramInfoLog wait on every program link — the V8 profile
 * billed 0.56 s of link stalls to a 60 s battle window as lazily-created
 * materials (fx variants, wreck swaps, killcam ghosts) compiled mid-fight,
 * each one landing as a frame hitch in the p99 tail. Boot keeps full checks
 * (the whole main pipeline compiles behind the splash and the diag rescue
 * path needs the logs); main.js calls this once the game is up. ?diag pins
 * the checks for a diagnosis run. onShaderError stays installed either way —
 * it only fires from the check path, so a diag run still collects.
 */
export function relaxShaderChecks(renderer) {
  if (DIAG_PARAM != null || FORCE != null) return; // diagnosis run: keep checks
  renderer.debug.checkShaderErrors = false;
}

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
    // lit, shadows OFF — render twice, judge the second frame (the owner's
    // iPhone produced a one-boot litShadow false-negative: first-frame
    // warmup/compile flakes must not cost the session a pipeline stage)
    {
      renderer.shadowMap.enabled = false;
      const p = probeScene(false);
      for (let i = 0; i < 2; i++) {
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(p.scene, p.cam);
      }
      out.lit = FORCE === 'nolit' ? false : readCenter(renderer, rt, buf) > 24;
      p.scene.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
    }
    // lit, shadows ON (CSM-style depth compare path compiles here) — three
    // warmup frames before judging, same flake defense
    {
      renderer.shadowMap.enabled = true;
      const p = probeScene(true);
      p.sun.castShadow = true;
      p.sun.shadow.mapSize.set(256, 256);
      p.sun.shadow.camera.near = 0.5;
      p.sun.shadow.camera.far = 30;
      p.ground.receiveShadow = true;
      if (p.box) p.box.castShadow = true;
      for (let i = 0; i < 3; i++) {
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(p.scene, p.cam);
      }
      out.litShadow = (FORCE === 'noshadow' || FORCE === 'flakyshadow')
        ? false : readCenter(renderer, rt, buf) > 24;
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

/**
 * Environment validity gate (mobile r4). The owner's iPhone proved the PMREM
 * environment bake is the black-scene culprit (watchdog rescue
 * 'environment-off', band 2.3 -> 22.7): on that GPU the bake yields a
 * poisoned (NaN/black) texture whose IBL term blackens every lit material,
 * while desktop bakes are healthy. Validate the installed environment by
 * rendering a chrome probe sphere lit by NOTHING but the env — a healthy sky
 * bake reflects bright horizon (clearly non-black); a poisoned one reads
 * black. When invalid: strip scene.environment and add a compensating
 * ambient tuned to the lost IBL diffuse so the scene lights correctly from
 * frame one (shadows/fog untouched). Re-run after EVERY bake — the sky
 * re-bakes per map (sun tracking), which would otherwise reinstall the
 * poisoned texture mid-session.
 */
let _envCompLight = null;
export function enforceEnvValidity(renderer, scene) {
  if (!scene.environment) return true;
  let lum = -1;
  const prevTarget = renderer.getRenderTarget();
  const rt = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true });
  try {
    const probe = new THREE.Scene();
    probe.environment = scene.environment;
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    cam.position.set(0, 0, 2.4);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.15 }),
    );
    probe.add(ball);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(probe, cam);
    const buf = new Uint8Array(4);
    renderer.readRenderTargetPixels(rt, 8, 8, 1, 1, buf);
    lum = buf[0] + buf[1] + buf[2];
    ball.geometry.dispose();
    ball.material.dispose();
  } catch (_) {
    lum = -1; // treat an unreadable probe as invalid — never risk a black scene
  } finally {
    renderer.setRenderTarget(prevTarget);
    rt.dispose();
  }
  const ok = lum > 12 && FORCE !== 'badenv';
  const bag = window.__GL_DIAG;
  if (ok) {
    if (_envCompLight) { scene.remove(_envCompLight); _envCompLight = null; }
    return true;
  }
  scene.environment = null;
  if (!_envCompLight) {
    // tuned against the desktop verdant battle band (mobile r4 probe):
    // env-on 23.85 vs env-off+ambient sweep 1.0->17.3 / 2.0->20.3 /
    // 3.0->23.4 / 4.5->28.0 — 3.1 interpolates to the env-on level
    _envCompLight = new THREE.AmbientLight(0xc3d2e4, ENV_COMP_INTENSITY);
    scene.add(_envCompLight);
    if (bag && bag.errors.length < 8) bag.errors.push(`env bake invalid (probe ${lum}) — compensated ambient engaged`);
    appendRescue('environment-fallback (bake validation)');
  }
  return false;
}
const ENV_COMP_INTENSITY = 3.1;

/**
 * Black-scene watchdog (mobile r3). The owner's iPhone passes all three
 * probes above — vanilla lit + vanilla-shadowed rendering work — yet the
 * REAL scene's lit meshes are black. The remaining suspect set (custom CSM
 * getShadow injection, fog/haze patches, material chains) all share one
 * property: shadows-off makes their black variant impossible or moot. So
 * instead of guessing which, render the ACTUAL scene once to a tiny target;
 * if the lower band reads black, disable shadow maps, force a recompile
 * (programs drop USE_SHADOWMAP and the CSM injection with it) and re-check.
 * Costs one 64x36 render when healthy; runs at garage-ready and at battle
 * start.
 * @returns {{before:number, after:?number, rescued:boolean}}
 */
/** Mean luminance of the lower 60% band of one real scene render (0-255). */
function measureSceneBand(renderer, scene, camera) {
  const rt = new THREE.WebGLRenderTarget(64, 36, { depthBuffer: true });
  const buf = new Uint8Array(64 * 22 * 4);
  try {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, 64, 22, buf);
    renderer.setRenderTarget(prev);
    let s = 0;
    for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i + 1] + buf[i + 2];
    return s / (buf.length / 4) / 3;
  } finally {
    rt.dispose();
  }
}

function recompileScene(scene) {
  scene.traverse((o) => {
    if (!o.material) return;
    const mm = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mm) m.needsUpdate = true;
  });
}

function appendRescue(label) {
  const bag = window.__GL_DIAG;
  if (!bag) return;
  bag.rescue = bag.rescue ? `${bag.rescue} + ${label}` : label;
  if (bag._showOverlay) bag._showOverlay();
  else if (bag._refresh) bag._refresh();
}

/**
 * Shadow reclaim (mobile r5). The owner's phone hit a one-boot litShadow
 * probe false-negative, so the boot rescue turned shadows off even though
 * the env fallback was the real cure — the session ran flatter than the
 * device deserves. Once the live scene proves HEALTHY, try shadows back on
 * and keep them only if the measured frame stays healthy. Runs at
 * garage-ready, after the black-scene watchdog; skipped when
 * ?diagforce=noshadow explicitly wants shadows held off.
 * @returns {{reclaimed:boolean, reason:string}}
 */
export function reclaimShadows(renderer, scene, camera) {
  const bag = window.__GL_DIAG;
  const note = (m) => { if (bag && bag.errors.length < 8) bag.errors.push(m); };
  if (renderer.shadowMap.enabled) return { reclaimed: false, reason: 'already-on' };
  if (FORCE === 'noshadow') return { reclaimed: false, reason: 'forced-off' };
  try {
    const before = measureSceneBand(renderer, scene, camera);
    if (before < 6) return { reclaimed: false, reason: 'scene-black' };
    renderer.shadowMap.enabled = true;
    recompileScene(scene);
    // warmup render before judging (same flake defense as the boot probes)
    measureSceneBand(renderer, scene, camera);
    const after = measureSceneBand(renderer, scene, camera);
    if (after >= 6) {
      note(`shadows reclaimed (band ${before.toFixed(1)} -> ${after.toFixed(1)})`);
      appendRescue('shadows-reclaimed');
      return { reclaimed: true, reason: 'healthy' };
    }
    renderer.shadowMap.enabled = false;
    recompileScene(scene);
    note(`shadow reclaim failed (band ${after.toFixed(1)}) — staying off`);
    return { reclaimed: false, reason: 'still-black' };
  } catch (e) {
    note('reclaim threw: ' + String(e && e.message ? e.message : e).slice(0, 160));
    renderer.shadowMap.enabled = false;
    return { reclaimed: false, reason: 'threw' };
  }
}

export function runSceneBlackWatchdog(renderer, scene, camera, { onRescue } = {}) {
  const rt = new THREE.WebGLRenderTarget(64, 36, { depthBuffer: true });
  const buf = new Uint8Array(64 * 22 * 4);
  // FORCE==='blackscene' test rig: simulated band readings — black baseline,
  // stage 1 (shadows) does NOT cure, stage 2 (environment) does, and the
  // confirm re-measure after reverting stage 1 stays cured. Exercises the
  // full ladder walk + revert logic deterministically on a healthy desktop.
  const sim = FORCE === 'blackscene' ? [0, 0, 42, 42] : null;
  let simI = 0;
  const measure = () => {
    if (sim) return sim[Math.min(simI++, sim.length - 1)];
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    // lower 60% of the frame — terrain/vehicle band; sky stays out of it
    renderer.readRenderTargetPixels(rt, 0, 0, 64, 22, buf);
    renderer.setRenderTarget(prev);
    let s = 0;
    for (let i = 0; i < buf.length; i += 4) s += buf[i] + buf[i + 1] + buf[i + 2];
    return s / (buf.length / 4) / 3;
  };
  const recompile = () => scene.traverse((o) => {
    if (!o.material) return;
    const mm = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mm) m.needsUpdate = true;
  });
  // Rescue ladder, cheapest-degradation first. Each stage: {apply, revert,
  // label}. The owner's device proved shadows-off alone does NOT cure the
  // black scene (live ?diagforce=noshadow test), so the ladder continues to
  // the scene ENVIRONMENT (PMREM bake NaN/black poisons every lit material's
  // IBL sum while env-free probe scenes pass — the current prime suspect)
  // and then fog. The first curing stage stays; non-curing stages revert.
  const stages = [
    {
      label: 'shadows-off',
      can: () => renderer.shadowMap.enabled,
      apply() { this._v = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false; recompile(); },
      revert() { renderer.shadowMap.enabled = this._v; recompile(); },
    },
    {
      label: 'environment-off',
      can: () => !!scene.environment,
      apply() { this._v = scene.environment; scene.environment = null; recompile(); },
      revert() { scene.environment = this._v; recompile(); },
    },
    {
      label: 'fog-off',
      can: () => !!scene.fog,
      apply() { this._v = scene.fog; scene.fog = null; recompile(); },
      revert() { scene.fog = this._v; recompile(); },
    },
  ];
  const out = { before: 0, after: null, rescued: false, stage: null };
  const bag = window.__GL_DIAG;
  const note = (m) => { if (bag && bag.errors.length < 8) bag.errors.push(m); };
  try {
    out.before = measure();
    // darkest legitimate biome band measures far above this; a failed lit
    // pipeline reads ~0
    if (out.before >= 6) return out;
    const applied = [];
    for (const st of stages) {
      if (!st.can()) continue;
      st.apply();
      applied.push(st);
      const lum = measure();
      note(`watchdog: +${st.label} -> band ${lum.toFixed(1)}`);
      if (lum >= 6) {
        // cured — drop every earlier stage that wasn't needed, confirm
        for (const prev of applied.slice(0, -1)) prev.revert();
        if (applied.length > 1) {
          const confirm = measure();
          if (confirm < 6) { // interaction: the earlier stages mattered too
            for (const prev of applied.slice(0, -1)) prev.apply();
            note(`watchdog: revert broke it (band ${confirm.toFixed(1)}) — keeping all stages`);
          }
        }
        out.after = lum;
        out.rescued = true;
        out.stage = st.label;
        appendRescue(`${st.label} (scene watchdog, band ${out.before.toFixed(1)}->${lum.toFixed(1)})`);
        if (onRescue) onRescue(out);
        return out;
      }
    }
    // nothing cured it: revert everything, report
    for (const st of applied.reverse()) st.revert();
    note(`watchdog: black scene (band ${out.before.toFixed(1)}) — no ladder stage cured it`);
    if (bag && bag._showOverlay) bag._showOverlay();
  } catch (e) {
    note('watchdog threw: ' + String(e && e.message ? e.message : e).slice(0, 160));
  } finally {
    rt.dispose();
  }
  return out;
}

/** Small fixed overlay; safe to call unconditionally (it decides visibility). */
export function mountDiagOverlay({ tier, diag, rescue, renderer }) {
  const webdriver = typeof navigator !== 'undefined' && navigator.webdriver;
  const wanted = DIAG_PARAM === '1' || (!webdriver && (rescue || !diag.lit));
  const gl = renderer.getContext();
  const cap = (k) => { try { return gl.getParameter(gl[k]); } catch (_) { return '?'; } };
  const el = document.createElement('div');
  el.id = 'cot-diag';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:400;background:rgba(5,8,11,.88);'
    + 'color:#ffd27a;font:10px/1.5 ui-monospace,Menlo,monospace;padding:8px 10px;border:1px solid #6b5a33;'
    + 'border-radius:4px;max-width:82vw;pointer-events:none;white-space:pre-wrap;';
  const bag = window.__GL_DIAG || (window.__GL_DIAG = { errors: [] });
  // seed the boot-probe rescue so later rescues APPEND instead of hiding it
  // (the owner's phone ran shadows-off + environment-fallback simultaneously
  // and the panel only showed the latter)
  if (rescue && !bag.rescue) bag.rescue = rescue;
  const render = () => {
    const ok = (v) => (v ? 'OK' : 'FAIL');
    const liveRescue = bag.rescue; // all rescues accumulate here
    el.textContent =
      `COT DIAG  tier=${tier}  ${String(cap('VERSION')).slice(0, 40)}\n`
      + `fragVec=${cap('MAX_FRAGMENT_UNIFORM_VECTORS')} vertVec=${cap('MAX_VERTEX_UNIFORM_VECTORS')} `
      + `tex=${cap('MAX_TEXTURE_IMAGE_UNITS')} texSize=${cap('MAX_TEXTURE_SIZE')} dpr=${window.devicePixelRatio}\n`
      + `probe: basic=${ok(diag.basic)} lit=${ok(diag.lit)} lit+shadow=${ok(diag.litShadow)}`
      + (liveRescue ? `\nRESCUE: ${liveRescue === 'shadows-off' ? 'shadow maps disabled for this session' : liveRescue}` : '')
      + (bag.errors.length ? `\nnotes (${bag.errors.length}):\n` + bag.errors.map((e) => '  ' + e.slice(0, 220)).join('\n') : '');
  };
  bag._refresh = render;
  render();
  let mounted = false;
  const mount = () => {
    if (mounted) return;
    mounted = true;
    if (document.body) document.body.appendChild(el);
    else window.addEventListener('DOMContentLoaded', () => document.body.appendChild(el), { once: true });
  };
  // a late watchdog rescue must surface the panel even when boot was healthy
  bag._showOverlay = () => { render(); if (!webdriver || DIAG_PARAM === '1') mount(); };
  if (wanted) mount();
}
