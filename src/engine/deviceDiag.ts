// deviceDiag.ts — boot-time GPU self-test + rescue ladder + on-screen
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
// Overlay visibility: explicit only (`?diag` / `?diag=1`). Rescue logic stays
// active and observable through window.__GL_DIAG without covering the game.
import * as THREE from 'three';

interface DeviceDiagResult {
  basic: boolean;
  lit: boolean;
  litShadow: boolean;
  errors: string[];
}

interface GlDiagnosticBag {
  errors: string[];
  rescue?: string;
  _refresh?: () => void;
  _showOverlay?: () => void;
}

interface SceneBandProbe {
  measure(scene: THREE.Scene, camera: THREE.Camera): number;
  dispose(): void;
}

export interface SceneWatchdogResult {
  before: number;
  after: number | null;
  rescued: boolean;
  stage: string | null;
}

interface SceneWatchdogOptions {
  onRescue?: (result: SceneWatchdogResult) => void;
}

interface SceneWatchdogStage {
  label: string;
  can(): boolean;
  apply(): void;
  revert(): void;
}

interface SceneWatchdogProbe {
  measure(): number;
  dispose(): void;
}

declare global {
  interface Window {
    __GL_DIAG?: GlDiagnosticBag;
  }
}

const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const DIAG_PARAM = qs ? qs.get('diag') : null;
const FORCE = qs ? qs.get('diagforce') : null; // 'noshadow' | 'nolit' (test rig)

/** Pure URL gate: diagnostics may run silently, but UI needs explicit opt-in. */
export function diagUiRequested(search = (typeof location !== 'undefined' ? location.search : '')) {
  const params = new URLSearchParams(search || '');
  if (!params.has('diag')) return false;
  const value = String(params.get('diag') ?? '').toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off';
}

const DIAG_UI = diagUiRequested();

/**
 * Battle-time relaxation (perf-r2): three's checkShaderErrors forces a
 * SYNCHRONOUS getProgramInfoLog wait on every program link — the V8 profile
 * billed 0.56 s of link stalls to a 60 s battle window as lazily-created
 * materials (fx variants, wreck swaps, killcam ghosts) compiled mid-fight,
 * each one landing as a frame hitch in the p99 tail. Boot keeps full checks
 * (the whole main pipeline compiles behind the splash and the diag rescue
 * path needs the logs); main.ts calls this once the game is up. ?diag pins
 * the checks for a diagnosis run. onShaderError stays installed either way —
 * it only fires from the check path, so a diag run still collects.
 */
export function relaxShaderChecks(renderer: THREE.WebGLRenderer): void {
  if (DIAG_PARAM != null || FORCE != null) return; // diagnosis run: keep checks
  renderer.debug.checkShaderErrors = false;
}

/** Global shader-error collector — installed once, survives the whole run. */
export function installShaderErrorCollector(renderer: THREE.WebGLRenderer): GlDiagnosticBag {
  const bag = (window.__GL_DIAG = window.__GL_DIAG || { errors: [] });
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    vs: WebGLShader,
    fs: WebGLShader,
  ) => {
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

function probeScene(withBox: boolean) {
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

function readCenter(
  renderer: THREE.WebGLRenderer,
  rt: THREE.WebGLRenderTarget,
  buf: Uint8Array,
): number {
  renderer.readRenderTargetPixels(rt, 8, 8, 1, 1, buf);
  return buf[0] + buf[1] + buf[2];
}

function disposeSceneResources(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  });
}

/**
 * Render the three probes. Restores every renderer state it touches.
 * @returns {{basic:boolean, lit:boolean, litShadow:boolean, errors:string[]}}
 */
export function runDeviceDiag(renderer: THREE.WebGLRenderer): DeviceDiagResult {
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
      try {
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(scene, cam);
        out.basic = readCenter(renderer, rt, buf) > 24;
      } finally {
        disposeSceneResources(scene);
      }
    }
    // lit, shadows OFF — render twice, judge the second frame (the owner's
    // iPhone produced a one-boot litShadow false-negative: first-frame
    // warmup/compile flakes must not cost the session a pipeline stage)
    {
      renderer.shadowMap.enabled = false;
      const p = probeScene(false);
      try {
        for (let i = 0; i < 2; i++) {
          renderer.setRenderTarget(rt);
          renderer.clear();
          renderer.render(p.scene, p.cam);
        }
        out.lit = FORCE === 'nolit' ? false : readCenter(renderer, rt, buf) > 24;
      } finally {
        disposeSceneResources(p.scene);
      }
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
      try {
        for (let i = 0; i < 3; i++) {
          renderer.setRenderTarget(rt);
          renderer.clear();
          renderer.render(p.scene, p.cam);
        }
        out.litShadow = (FORCE === 'noshadow' || FORCE === 'flakyshadow')
          ? false : readCenter(renderer, rt, buf) > 24;
      } finally {
        disposeSceneResources(p.scene);
        p.sun.shadow.map?.dispose();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (bag.errors.length < 8) bag.errors.push(`diag threw: ${message.slice(0, 200)}`);
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
export function applyDiagRescue(
  renderer: THREE.WebGLRenderer,
  diag: DeviceDiagResult,
): 'shadows-off' | null {
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
let _envCompLight: THREE.AmbientLight | null = null;
export function enforceEnvValidity(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  radianceScale = 1,
): boolean {
  if (!scene.environment) return true;
  // Validate the bake at unit authored radiance. A deliberately dim night
  // environment must not be mistaken for the poisoned/black mobile texture.
  const scale = Number.isFinite(radianceScale) ? Math.max(.001, Math.min(1, radianceScale)) : 1;
  let lum = -1;
  let probe = null;
  const prevTarget = renderer.getRenderTarget();
  const rt = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true });
  try {
    probe = new THREE.Scene();
    probe.environment = scene.environment;
    probe.environmentIntensity = 1 / scale;
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
  } catch (_) {
    lum = -1; // treat an unreadable probe as invalid — never risk a black scene
  } finally {
    if (probe) disposeSceneResources(probe);
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
    _envCompLight = new THREE.AmbientLight(0xc3d2e4, ENV_COMP_INTENSITY * scale);
    scene.add(_envCompLight);
    if (bag && bag.errors.length < 8) bag.errors.push(`env bake invalid (probe ${lum}) — compensated ambient engaged`);
    appendRescue('environment-fallback (bake validation)');
  }
  // Re-bakes reuse the existing rescue owner; night/day changes must not
  // retain whichever compensation strength happened to be installed first.
  _envCompLight.intensity = ENV_COMP_INTENSITY * scale;
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
/**
 * Own one reusable lower-band readback target for a diagnostic transaction.
 * Every measurement restores the caller's render target; dispose ends the
 * transaction and makes accidental reuse fail loudly.
 */
function createSceneBandProbe(renderer: THREE.WebGLRenderer): SceneBandProbe {
  const rt = new THREE.WebGLRenderTarget(64, 36, { depthBuffer: true });
  const buf = new Uint8Array(64 * 22 * 4);
  let disposed = false;
  return {
    measure(scene: THREE.Scene, camera: THREE.Camera): number {
      if (disposed) throw new Error('scene-band probe already disposed');
      const prev = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(rt, 0, 0, 64, 22, buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 4) sum += buf[i] + buf[i + 1] + buf[i + 2];
        return sum / (buf.length / 4) / 3;
      } finally {
        renderer.setRenderTarget(prev);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rt.dispose();
    },
  };
}

function recompileScene(scene: THREE.Scene): void {
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mm = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mm) m.needsUpdate = true;
  });
}

function appendRescue(label: string): void {
  const bag = window.__GL_DIAG;
  if (!bag) return;
  bag.rescue = bag.rescue ? `${bag.rescue} + ${label}` : label;
  if (bag._showOverlay) bag._showOverlay();
  else if (bag._refresh) bag._refresh();
}

function createWatchdogProbe(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): SceneWatchdogProbe {
  if (FORCE === 'blackscene') {
    const simulated = [0, 0, 42, 42];
    let index = 0;
    return {
      measure() {
        return simulated[Math.min(index++, simulated.length - 1)];
      },
      dispose() {},
    };
  }
  const probe = createSceneBandProbe(renderer);
  return {
    measure: () => probe.measure(scene, camera),
    dispose: () => probe.dispose(),
  };
}

function createWatchdogStages(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): SceneWatchdogStage[] {
  let previousShadowEnabled = false;
  let previousEnvironment: THREE.Texture | null = null;
  let previousFog: THREE.Fog | THREE.FogExp2 | null = null;
  return [
    {
      label: 'shadows-off',
      can: () => renderer.shadowMap.enabled,
      apply() {
        previousShadowEnabled = renderer.shadowMap.enabled;
        renderer.shadowMap.enabled = false;
        recompileScene(scene);
      },
      revert() {
        renderer.shadowMap.enabled = previousShadowEnabled;
        recompileScene(scene);
      },
    },
    {
      label: 'environment-off',
      can: () => !!scene.environment,
      apply() {
        previousEnvironment = scene.environment;
        scene.environment = null;
        recompileScene(scene);
      },
      revert() {
        scene.environment = previousEnvironment;
        recompileScene(scene);
      },
    },
    {
      label: 'fog-off',
      can: () => !!scene.fog,
      apply() {
        previousFog = scene.fog;
        scene.fog = null;
        recompileScene(scene);
      },
      revert() {
        scene.fog = previousFog;
        recompileScene(scene);
      },
    },
  ];
}

function keepRequiredWatchdogStages(
  applied: readonly SceneWatchdogStage[],
  probe: SceneWatchdogProbe,
  note: (message: string) => void,
): void {
  const priorStages = applied.slice(0, -1);
  for (const stage of priorStages) stage.revert();
  if (priorStages.length === 0) return;
  const confirm = probe.measure();
  if (confirm >= 6) return;
  for (const stage of priorStages) stage.apply();
  note(`watchdog: revert broke it (band ${confirm.toFixed(1)}) — keeping all stages`);
}

function markWatchdogRescued(
  out: SceneWatchdogResult,
  stage: SceneWatchdogStage,
  luminance: number,
  onRescue?: (result: SceneWatchdogResult) => void,
): void {
  out.after = luminance;
  out.rescued = true;
  out.stage = stage.label;
  appendRescue(`${stage.label} (scene watchdog, band ${out.before.toFixed(1)}->${luminance.toFixed(1)})`);
  onRescue?.(out);
}

function tryWatchdogStages(
  stages: readonly SceneWatchdogStage[],
  probe: SceneWatchdogProbe,
  out: SceneWatchdogResult,
  note: (message: string) => void,
  onRescue?: (result: SceneWatchdogResult) => void,
): boolean {
  const applied: SceneWatchdogStage[] = [];
  for (const stage of stages) {
    if (!stage.can()) continue;
    stage.apply();
    applied.push(stage);
    const luminance = probe.measure();
    note(`watchdog: +${stage.label} -> band ${luminance.toFixed(1)}`);
    if (luminance < 6) continue;
    keepRequiredWatchdogStages(applied, probe, note);
    markWatchdogRescued(out, stage, luminance, onRescue);
    return true;
  }
  for (let index = applied.length - 1; index >= 0; index--) applied[index].revert();
  return false;
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
export function reclaimShadows(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): { reclaimed: boolean; reason: string } {
  const bag = window.__GL_DIAG;
  const note = (message: string) => {
    if (bag && bag.errors.length < 8) bag.errors.push(message);
  };
  if (renderer.shadowMap.enabled) return { reclaimed: false, reason: 'already-on' };
  if (FORCE === 'noshadow') return { reclaimed: false, reason: 'forced-off' };
  const probe = createSceneBandProbe(renderer);
  try {
    const before = probe.measure(scene, camera);
    if (before < 6) return { reclaimed: false, reason: 'scene-black' };
    renderer.shadowMap.enabled = true;
    recompileScene(scene);
    // warmup render before judging (same flake defense as the boot probes)
    probe.measure(scene, camera);
    const after = probe.measure(scene, camera);
    if (after >= 6) {
      note(`shadows reclaimed (band ${before.toFixed(1)} -> ${after.toFixed(1)})`);
      appendRescue('shadows-reclaimed');
      return { reclaimed: true, reason: 'healthy' };
    }
    renderer.shadowMap.enabled = false;
    recompileScene(scene);
    note(`shadow reclaim failed (band ${after.toFixed(1)}) — staying off`);
    return { reclaimed: false, reason: 'still-black' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    note(`reclaim threw: ${message.slice(0, 160)}`);
    renderer.shadowMap.enabled = false;
    return { reclaimed: false, reason: 'threw' };
  } finally {
    probe.dispose();
  }
}

export function runSceneBlackWatchdog(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  { onRescue }: SceneWatchdogOptions = {},
): SceneWatchdogResult {
  const probe = createWatchdogProbe(renderer, scene, camera);
  const stages = createWatchdogStages(renderer, scene);
  const out: SceneWatchdogResult = {
    before: 0,
    after: null,
    rescued: false,
    stage: null,
  };
  const bag = window.__GL_DIAG;
  const note = (message: string) => {
    if (bag && bag.errors.length < 8) bag.errors.push(message);
  };
  try {
    out.before = probe.measure();
    // darkest legitimate biome band measures far above this; a failed lit
    // pipeline reads ~0
    if (out.before >= 6) return out;
    if (tryWatchdogStages(stages, probe, out, note, onRescue)) return out;
    note(`watchdog: black scene (band ${out.before.toFixed(1)}) — no ladder stage cured it`);
    if (bag && bag._showOverlay) bag._showOverlay();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    note(`watchdog threw: ${message.slice(0, 160)}`);
  } finally {
    probe.dispose();
  }
  return out;
}

/** Explicit, fixed Shadow Saver panel. Rescue itself always runs silently. */
export function mountDiagOverlay({
  tier,
  diag,
  rescue,
  renderer,
}: {
  tier: string;
  diag: DeviceDiagResult;
  rescue: string | null;
  renderer: THREE.WebGLRenderer;
}): void {
  const gl = renderer.getContext();
  const cap = (key: keyof WebGLRenderingContext): string => {
    try {
      const constant = gl[key as keyof typeof gl];
      return typeof constant === 'number' ? String(gl.getParameter(constant)) : '?';
    } catch (_) {
      return '?';
    }
  };
  const el = document.createElement('aside');
  el.id = 'cot-diag';
  el.setAttribute('aria-label', 'COT Shadow Saver diagnostics');
  el.style.cssText = [
    'position:fixed', 'left:14px', 'bottom:14px', 'z-index:400',
    'width:min(430px,calc(100vw - 28px))', 'box-sizing:border-box',
    'color:#edf3f1', 'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'font-variant-numeric:tabular-nums',
    'background:linear-gradient(145deg,rgba(10,15,19,.97),rgba(24,20,14,.94))',
    'border:1px solid rgba(229,176,86,.46)', 'border-radius:10px',
    'box-shadow:0 18px 55px rgba(0,0,0,.52),inset 0 1px rgba(255,255,255,.05)',
    'backdrop-filter:blur(14px)', 'overflow:hidden', 'pointer-events:auto',
  ].join(';');
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.08)">
      <div aria-hidden="true" style="width:27px;height:27px;display:grid;place-items:center;border:1px solid rgba(239,190,102,.5);border-radius:50%;color:#f2c36f">◈</div>
      <div style="flex:1;min-width:0"><b style="font:700 12px/1 system-ui,sans-serif;letter-spacing:.12em">COT SHADOW SAVER</b>
        <div data-summary style="margin-top:4px;color:#aab7b9">Checking renderer health…</div></div>
      <button data-collapse type="button" aria-label="Collapse Shadow Saver" style="border:0;background:transparent;color:#9ca8ab;font:18px/1 sans-serif;cursor:pointer;padding:5px">−</button>
    </div>
    <div data-body style="padding:11px 12px 12px">
      <div data-probes style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:9px"></div>
      <div data-caps style="color:#aebbc0;white-space:pre-wrap"></div>
      <div data-rescue style="display:none;margin-top:9px;padding:8px;border-left:2px solid #f0b95e;background:rgba(240,185,94,.08);color:#f4cf8c"></div>
      <div data-notes style="display:none;margin-top:8px;max-height:120px;overflow:auto;color:#dcae93;white-space:pre-wrap"></div>
    </div>`;
  const summaryEl = el.querySelector<HTMLElement>('[data-summary]')!;
  const probesEl = el.querySelector<HTMLElement>('[data-probes]')!;
  const capsEl = el.querySelector<HTMLElement>('[data-caps]')!;
  const rescueEl = el.querySelector<HTMLElement>('[data-rescue]')!;
  const notesEl = el.querySelector<HTMLElement>('[data-notes]')!;
  const bodyEl = el.querySelector<HTMLElement>('[data-body]')!;
  const collapseEl = el.querySelector<HTMLButtonElement>('[data-collapse]')!;
  const bag = window.__GL_DIAG || (window.__GL_DIAG = { errors: [] });
  // seed the boot-probe rescue so later rescues APPEND instead of hiding it
  // (the owner's phone ran shadows-off + environment-fallback simultaneously
  // and the panel only showed the latter)
  if (rescue && !bag.rescue) bag.rescue = rescue;
  const render = () => {
    const liveRescue = bag.rescue; // all rescues accumulate here
    const healthy = !!(diag.basic && diag.lit && diag.litShadow && !liveRescue && !bag.errors.length);
    summaryEl.textContent = healthy ? 'Renderer healthy · no intervention' :
      liveRescue ? 'Compatibility rescue active' : 'Renderer probe needs attention';
    summaryEl.style.color = healthy ? '#78d4ae' : '#f2c36f';
    probesEl.replaceChildren();
    for (const [label, value] of [['BASIC', diag.basic], ['LIT', diag.lit], ['SHADOWS', diag.litShadow]]) {
      const card = document.createElement('div');
      card.style.cssText = `padding:7px;border-radius:5px;text-align:center;background:${value ? 'rgba(84,181,139,.09)' : 'rgba(230,111,77,.10)'};border:1px solid ${value ? 'rgba(84,181,139,.25)' : 'rgba(230,111,77,.3)'}`;
      card.innerHTML = `<span style="display:block;font:700 9px/1 system-ui,sans-serif;letter-spacing:.12em;color:#91a1a4">${label}</span><b style="display:block;margin-top:5px;color:${value ? '#78d4ae' : '#ff9b7b'}">${value ? 'PASS' : 'FAIL'}</b>`;
      probesEl.appendChild(card);
    }
    capsEl.textContent =
      `${tier} tier · ${String(cap('VERSION')).slice(0, 52)}\n` +
      `uniforms F${cap('MAX_FRAGMENT_UNIFORM_VECTORS')} / V${cap('MAX_VERTEX_UNIFORM_VECTORS')}   ` +
      `textures ${cap('MAX_TEXTURE_IMAGE_UNITS')} @ ${cap('MAX_TEXTURE_SIZE')}   dpr ${window.devicePixelRatio}`;
    rescueEl.style.display = liveRescue ? 'block' : 'none';
    rescueEl.textContent = liveRescue
      ? `RESCUE · ${liveRescue === 'shadows-off' ? 'shadow maps disabled for this session' : liveRescue}`
      : '';
    notesEl.style.display = bag.errors.length ? 'block' : 'none';
    notesEl.textContent = bag.errors.length
      ? `NOTES (${bag.errors.length})\n${bag.errors.map((error: string) => `• ${String(error).slice(0, 220)}`).join('\n')}`
      : '';
  };
  bag._refresh = render;
  render();
  let mounted = false;
  let collapsed = false;
  collapseEl.addEventListener('click', () => {
    collapsed = !collapsed;
    bodyEl.style.display = collapsed ? 'none' : 'block';
    collapseEl.textContent = collapsed ? '+' : '−';
    collapseEl.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} Shadow Saver`);
  });
  const mount = () => {
    if (mounted) return;
    mounted = true;
    if (document.body) document.body.appendChild(el);
    else window.addEventListener('DOMContentLoaded', () => document.body.appendChild(el), { once: true });
  };
  // Late rescues refresh explicit panels but never surface hidden UI.
  bag._showOverlay = () => {
    render();
    if (DIAG_UI) {
      mount();
      el.style.display = '';
    }
  };
  if (DIAG_UI) mount();
}
