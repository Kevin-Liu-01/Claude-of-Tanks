/**
 * blackWorldGuard.ts — the battle's self-healing black-world guard (2026-10-19, black-screen-228; the owner: "black
 * screens are still coming up for me the first time i load into maps ... redrock divide ... it can also happen when i
 * esc out and come back in").
 *
 * The owner's frame: the whole world and sky exactly 0, the HUD, nameplates and the late-FX dust drawn over it at full
 * strength. The scene pass (SceneAAPass) landed no fragment in a complete, cleared and resolved scene target: colour 0,
 * depth 1. What triggers it was never reproduced (0 of ~180 natural runs), so this guard does three things on every
 * revealed battle frame, from a lazy chunk (nothing in the game entry):
 *
 *  - CPU signals, O(1) a frame: the scene pass's draw calls, the camera's layer 0, scene.visible, the override
 *    material, the canonical passes (scene, aerial, late FX), the scene target's viewport, the battlefield root.
 *  - A GPU probe every PROBE_EVERY frames (at once while anything looks wrong): one fullscreen draw into a 16 x 9 RGBA8
 *    target, each cell 8 x 8 taps of the resolved scene colour and depth (R = any finite colour above 0, G = any
 *    non-finite value, B = any depth below 1), read back through a pixel-pack buffer and a fence, collected frames
 *    later: the probe never stalls a frame and allocates nothing but the fence the API hands back.
 *  - Verdicts (a revealed battle, no Studio or shot staging, a live context, a focused document): BLACK-WORLD = at
 *    least 90 % of the cells without colour or depth while at least a fifth of them look at ground within reach (a black
 *    lunar sky overhead is not a black world), NAN = at least 2 cells non-finite, a CPU violation = its own class; two
 *    failing verdicts in a row open an incident. Its receipt (window.__GL_DIAG.blackWorld, a ring of 8; one console
 *    warning; one entry-telemetry `error` record) names the class, every top-level root, the scene target and its
 *    framebuffers, the GL errors, the warm stage and the timing, so the owner's next black frame names its own cause.
 *  - The heal ladder, one step per two more failing verdicts, never while covered, one ladder per incident per 10 s:
 *    H1 re-assert state (the camera mask taken at reveal, scene visibility, no override, the canonical passes, the scene
 *    target's viewport, the battlefield and presentation roots, the live rare warm closed so its finally blocks run),
 *    H2 reallocate every composer target and reset the temporal histories, H3 MSAA off and (only when every CPU signal
 *    is healthy) the graphics-recovery preset, H4 (only then too) a context lose/restore through the renderer's recovery.
 *    H1 and H2 change nothing on a healthy frame and only ever act on a frame that is already black.
 *
 * Installed on instances (post.render, post.sceneAA.render), never on a prototype; window.__COT_BLACK_GUARD.enabled is
 * the A/B switch (tools/frame-budget-probe.mjs --toggle=black-guard). ?gldiag=1 (debug builds) adds the per-pass GL
 * error watch after every resolution change (P8: the dropped draws' program, named).
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import {
  RENDER_BLACK_WORLD_STAGE,
  renderBlackWorldCode,
  renderBlackWorldMessage,
  type RenderBlackWorldClass,
  type RenderBlackWorldStep,
} from '../../server/telemetryRecord.ts';

export const PROBE_COLUMNS = 16;
export const PROBE_ROWS = 9;
export const PROBE_CELLS = PROBE_COLUMNS * PROBE_ROWS;
/** Frames between healthy-state probes (~0.2 s at 60 Hz). */
export const PROBE_EVERY = 12;
/** A BLACK-WORLD probe: this share of the cells without colour or depth ... */
export const BLACK_CELL_SHARE = 0.9;
/** ... while at least this share of the cells look at ground within reach of the far plane. */
export const GROUND_CELL_SHARE = 0.2;
/** A NAN probe: at least this many non-finite cells (1 % of 144, rounded up). */
export const NAN_CELLS = 2;
/** Verdicts in a row that open an incident, and more failing ones per heal step. */
export const FAILS_TO_OPEN = 2;
export const FAILS_PER_STEP = 2;
/** CPU-only verdict cadence while a CPU signal stays wrong and no probe can answer (a pass switched off). */
export const CPU_VERDICT_FRAMES = 4;
/** One ladder per incident per this many ms. */
export const LADDER_COOLDOWN_MS = 10_000;
export const RECEIPT_RING = 8;
/** Scene-pass draw calls under this are an empty scene pass. */
export const MIN_SCENE_CALLS = 3;

// CPU signal bits (cpuBits); the first set bit in CLASS_ORDER names a CPU incident
export const CPU = Object.freeze({
  MASK: 1, SCENE_HIDDEN: 2, OVERRIDE: 4, PASSES: 8, VIEWPORT: 16, ROOTS: 32, EMPTY: 64,
});
const CPU_CLASS: ReadonlyArray<readonly [number, RenderBlackWorldClass]> = Object.freeze([
  [CPU.MASK, 'camera-layer-mask'], [CPU.SCENE_HIDDEN, 'scene-hidden'], [CPU.OVERRIDE, 'override'], [CPU.PASSES, 'passes'],
  [CPU.VIEWPORT, 'viewport'], [CPU.ROOTS, 'roots-hidden'],
] as const);
/** The bits a CPU signal alone may open an incident on (an empty scene pass waits for the probe's confirmation). */
const CPU_DECISIVE = CPU.MASK | CPU.SCENE_HIDDEN | CPU.OVERRIDE | CPU.PASSES | CPU.VIEWPORT | CPU.ROOTS;

const PROBE_FRAGMENT = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
void main() {
  vec2 cell = floor( gl_FragCoord.xy );
  float lit = 0.0, bad = 0.0, deep = 0.0;
  for ( int j = 0; j < 8; j++ ) {
    for ( int i = 0; i < 8; i++ ) {
      vec2 uv = ( cell + ( vec2( float( i ), float( j ) ) + 0.5 ) / 8.0 ) / vec2( ${PROBE_COLUMNS}.0, ${PROBE_ROWS}.0 );
      vec4 c = texture2D( tColor, uv );
      float d = texture2D( tDepth, uv ).x;
      // comparisons with NaN are false, also under fast math
      if ( !( abs( c.r ) < 6.0e4 && abs( c.g ) < 6.0e4 && abs( c.b ) < 6.0e4 ) ) bad = 1.0;
      else if ( c.r > 0.0 || c.g > 0.0 || c.b > 0.0 ) lit = 1.0;
      if ( d < 1.0 ) deep = 1.0;
    }
  }
  gl_FragColor = vec4( lit, bad, deep, 1.0 );
}`;

type AnyPass = Pass & { enabled: boolean };

/** The post runtime as the guard reads it (engine/post.ts PostRuntime). */
export interface GuardPost {
  render(dt: number, frameWallDtSeconds?: number): void;
  setSize(width: number, height: number): void;
  sceneAA: AnyPass & {
    sceneTarget: THREE.WebGLRenderTarget;
    setSamples(samples: number): void;
    render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget,
      deltaTime?: number, maskActive?: boolean): void;
  };
  aerial: AnyPass & { uniforms: Record<string, THREE.IUniform> };
  lateFx: AnyPass & { target: THREE.WebGLRenderTarget; prepared?: boolean };
  gtao?: AnyPass & { setSize(width: number, height: number): void };
  taa?: { resetHistory(): void };
  composer: { passes: AnyPass[]; renderTarget1?: THREE.WebGLRenderTarget; renderTarget2?: THREE.WebGLRenderTarget };
  readonly dynScale?: number;
  readonly perfTrim?: number;
  readonly msaaSamples?: number;
}

interface GuardEntity { visual?: { root?: THREE.Object3D | null } | null }
interface GuardGame { phase?: string; tanks?: readonly unknown[] }

export interface BlackWorldGuardPorts {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  post: GuardPost;
  game: GuardGame;
  getWorld?(): { group?: THREE.Object3D | null } | null;
  /** The battle entry's cover (the loader and its reveal barrier); the loader element is read too. */
  isCovered?(): boolean;
  combatWarm?: { cancelRare?(): void } | null;
  /** H3 on a CPU-healthy black: the graphics-recovery preset a context loss takes (quality.ts, one rung down). */
  relieveGraphics?(): void;
  /** The resolved graphics preset, for the receipt. */
  presetName?(): string;
  /** One record per incident (the entry telemetry's error path). */
  report?(stage: string, message: string, code: string): void;
  now?(): number;
  /** Document focus and visibility (tests replace them). */
  hasFocus?(): boolean;
  isHidden?(): boolean;
  /** Studio, cinema and shot staging own their frames. */
  isExempt?(): boolean;
}

interface IncidentStep { step: RenderBlackWorldStep; atMs: number; note?: string }

export interface BlackWorldReceipt {
  class: RenderBlackWorldClass;
  openedAtMs: number;
  sinceRevealMs: number | null;
  sinceResizeMs: number | null;
  sinceResumeMs: number | null;
  cpu: Record<string, unknown>;
  probe: { black: number; nan: number; lit: number; deep: number; ground: number; groundBlack: number } | null;
  roots: Array<{ name: string; type: string; visible: boolean; mask: number; parent: string; children: number }>;
  world: { name: string; visible: boolean; attached: boolean } | null;
  target: Record<string, unknown>;
  gl: Record<string, unknown>;
  state: Record<string, unknown>;
  warm: Record<string, unknown>;
  steps: IncidentStep[];
  /** H1 re-asserted after the ladder ran out, inside its cooldown */
  repeats?: number;
  healedBy: RenderBlackWorldStep | null;
  healedAtMs: number | null;
  /** ms from the incident's first failing verdict to the healthy one */
  healMs: number | null;
  closed: boolean;
}

export interface BlackWorldGuard {
  enabled: boolean;
  /** Under the cover of a battle entry (solo deployment, network reveal): fresh histories, a new reveal snapshot. */
  onCoveredEntry(): void;
  stats(): Record<string, number | boolean | string | null>;
  readonly receipts: BlackWorldReceipt[];
  dispose(): void;
}

interface GuardHost {
  __GL_DIAG?: { blackWorld?: BlackWorldReceipt[]; passErrors?: unknown[] } & Record<string, unknown>;
  __COT_BLACK_GUARD?: BlackWorldGuard;
  __BATTLE_DEFERRED_WARM?: { done?: boolean; cancelled?: boolean; error?: string; stages?: Record<string, number> };
  __COMBAT_RARE_WARM_STEP?: string | null;
  __STUDIO?: { active?: boolean };
  __COT_SHOT_STAGED?: boolean;
}

const guards = new WeakMap<THREE.WebGLRenderer, { guard: BlackWorldGuard; update(ports: BlackWorldGuardPorts): void }>();

/** Install (once per renderer) or re-port the guard; returns it. */
export function installBlackWorldGuard(ports: BlackWorldGuardPorts): BlackWorldGuard {
  const existing = guards.get(ports.renderer);
  if (existing) { existing.update(ports); return existing.guard; }
  const created = createGuard(ports);
  guards.set(ports.renderer, created);
  return created.guard;
}

/** Classify one probe readback (RGBA8 cells): counts only, no allocation. */
export function countProbeCells(cells: Uint8Array, out: { black: number; nan: number; lit: number; deep: number }): void {
  let black = 0, nan = 0, lit = 0, deep = 0;
  for (let i = 0; i < PROBE_CELLS; i++) {
    const r = cells[i * 4] > 127, g = cells[i * 4 + 1] > 127, b = cells[i * 4 + 2] > 127;
    if (r) lit++;
    if (g) nan++;
    if (b) deep++;
    if (!r && !b && !g) black++;
  }
  out.black = black; out.nan = nan; out.lit = lit; out.deep = deep;
}

const _ray = new THREE.Vector3();
/**
 * The cells whose centre ray meets the ground within 80 % of the far plane (the camera `height` m above it), and of
 * those the black ones. Only read once a probe already counts a black world (never on a healthy frame).
 */
export function countGroundCells(cells: Uint8Array, world: THREE.Matrix4, projectionInverse: THREE.Matrix4, height: number,
  far: number, out: { ground: number; groundBlack: number }): void {
  const reachSlope = -Math.max(1, height) / (0.8 * far);
  let ground = 0, groundBlack = 0;
  for (let y = 0; y < PROBE_ROWS; y++) {
    for (let x = 0; x < PROBE_COLUMNS; x++) {
      _ray.set(((x + 0.5) / PROBE_COLUMNS) * 2 - 1, ((y + 0.5) / PROBE_ROWS) * 2 - 1, 1).applyMatrix4(projectionInverse)
        .transformDirection(world);
      if (!(_ray.y < reachSlope)) continue;
      ground++;
      const i = (y * PROBE_COLUMNS + x) * 4;
      if (cells[i] <= 127 && cells[i + 2] <= 127) groundBlack++;
    }
  }
  out.ground = ground; out.groundBlack = groundBlack;
}

/** The verdict a probe (with its ground census) and the CPU bits reach; null is healthy. */
export function judgeVerdict(cpuBits: number, probe: { black: number; nan: number; ground: number; groundBlack: number } | null):
  RenderBlackWorldClass | null {
  for (let i = 0; i < CPU_CLASS.length; i++) if (cpuBits & CPU_CLASS[i][0]) return CPU_CLASS[i][1];
  if (!probe) return null;
  if (probe.nan >= NAN_CELLS) return 'nan-history';
  if (probe.black >= Math.ceil(BLACK_CELL_SHARE * PROBE_CELLS) && probe.ground >= Math.ceil(GROUND_CELL_SHARE * PROBE_CELLS)
    && probe.groundBlack >= Math.ceil(0.8 * probe.ground)) {
    return cpuBits & CPU.EMPTY ? 'empty-scene-pass' : 'gl-masked';
  }
  return null;
}

function createGuard(initial: BlackWorldGuardPorts): { guard: BlackWorldGuard; update(ports: BlackWorldGuardPorts): void } {
  let ports = initial;
  const { renderer, scene, camera, post } = initial;
  const host = globalThis as typeof globalThis & GuardHost;
  const now = (): number => (ports.now ? ports.now() : performance.now());
  const sceneAA = post.sceneAA;
  const sceneTarget = sceneAA.sceneTarget;
  const originalSceneRender = sceneAA.render;
  const originalPostRender = post.render;

  // ---- preallocated probe ----
  const probeTarget = new THREE.WebGLRenderTarget(PROBE_COLUMNS, PROBE_ROWS, {
    type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  probeTarget.texture.name = 'BlackWorldGuard.probe';
  const probeMaterial = new THREE.ShaderMaterial({
    name: 'BlackWorldGuard.Probe',
    uniforms: { tColor: { value: null }, tDepth: { value: null } },
    vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: PROBE_FRAGMENT,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
  });
  const probeQuad = new FullScreenQuad(probeMaterial);
  const cells = new Uint8Array(PROBE_CELLS * 4);
  const counts = { black: 0, nan: 0, lit: 0, deep: 0, ground: 0, groundBlack: 0 };
  const probeWorld = new THREE.Matrix4();
  const probeProjectionInverse = new THREE.Matrix4();
  // the probe's camera height over the ground and far plane (a typed array: a double kept in a closure slot is boxed)
  const probeView = new Float64Array(2);
  let pbo: WebGLBuffer | null = null;
  let pboContext: WebGL2RenderingContext | null = null;
  let pending: WebGLSync | null = null;
  let pendingSince = 0;
  let probeWanted = false;
  let probeResult = false; // a readback landed this frame

  // ---- frame state ----
  let frame = 0;
  let nextProbeFrame = PROBE_EVERY;
  let lastVerdictFrame = 0;
  let sceneRan = false;
  let sceneCalls = 0;
  let sceneMask = 1;
  let cpuBits = 0;
  let failStreak = 0;
  let lastFailClass: RenderBlackWorldClass | null = null;
  let firstFailAt = 0;
  let active = false;
  let revealAt = -1;
  let lastResizeAt = -1;
  let lastResumeAt = -1;
  let lastWidth = sceneTarget.width;
  let lastHeight = sceneTarget.height;
  let lastNan = false;
  let revealMask = 1;
  const revealRoots: THREE.Object3D[] = [];
  let revealWorld: THREE.Object3D | null = null;
  let coverElement: Element | null = null;
  let coverLookupFrame = -1_000;
  let captureGl = false;
  let glAtScene: Record<string, unknown> | null = null;

  // ---- incidents ----
  let incident: BlackWorldReceipt | null = null;
  let failsSinceStep = 0;
  let stepIndex = 0;
  let ladderEndedAt = -Infinity;
  let lastStep: RenderBlackWorldStep | null = null;
  let reported = false;
  const receipts: BlackWorldReceipt[] = [];
  const stats = { frames: 0, probes: 0, readbacks: 0, verdicts: 0, incidents: 0, heals: 0, skippedFences: 0 };

  const gl = (): WebGL2RenderingContext => renderer.getContext() as WebGL2RenderingContext;
  const canProbe = (context: WebGL2RenderingContext): boolean => typeof context.fenceSync === 'function'
    && typeof context.getBufferSubData === 'function';

  const coverShown = (): boolean => {
    if (!coverElement && frame - coverLookupFrame >= 60 && typeof document !== 'undefined') {
      coverLookupFrame = frame;
      coverElement = document.querySelector('.cot-bl');
    }
    return !!coverElement && coverElement.classList.contains('on');
  };
  const exempt = (): boolean => (ports.isExempt ? ports.isExempt() : (!!host.__STUDIO?.active || host.__COT_SHOT_STAGED === true));
  const focused = (): boolean => (ports.hasFocus ? ports.hasFocus()
    : typeof document === 'undefined' || (document.hasFocus() && !document.hidden));
  const worldGroup = (): THREE.Object3D | null => ports.getWorld?.()?.group ?? null;

  // ---- the probe (inside the scene pass, after the scene drew) ----
  function ensurePbo(context: WebGL2RenderingContext): WebGLBuffer | null {
    if (pbo && pboContext === context) return pbo;
    pending = null;
    pboContext = context;
    pbo = context.createBuffer();
    if (!pbo) return null;
    context.bindBuffer(context.PIXEL_PACK_BUFFER, pbo);
    context.bufferData(context.PIXEL_PACK_BUFFER, cells.byteLength, context.STREAM_READ);
    context.bindBuffer(context.PIXEL_PACK_BUFFER, null);
    return pbo;
  }

  function issueProbe(): void {
    const context = gl();
    if (pending || !canProbe(context) || context.isContextLost()) return;
    const buffer = ensurePbo(context);
    if (!buffer) return;
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    try {
      probeMaterial.uniforms.tColor.value = sceneTarget.texture;
      probeMaterial.uniforms.tDepth.value = sceneTarget.depthTexture;
      renderer.autoClear = false;
      renderer.setRenderTarget(probeTarget);
      probeQuad.render(renderer);
      context.bindBuffer(context.PIXEL_PACK_BUFFER, buffer);
      context.readPixels(0, 0, PROBE_COLUMNS, PROBE_ROWS, context.RGBA, context.UNSIGNED_BYTE, 0);
      context.bindBuffer(context.PIXEL_PACK_BUFFER, null);
      pending = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
      pendingSince = frame;
      probeWorld.copy(camera.matrixWorld);
      probeProjectionInverse.copy(camera.projectionMatrixInverse);
      const datum = post.aerial.uniforms.uHazeDatum?.value;
      probeView[0] = camera.matrixWorld.elements[13] - (typeof datum === 'number' && Number.isFinite(datum) ? datum : 0);
      probeView[1] = camera.far;
      stats.probes++;
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
  }

  function collectProbe(): void {
    probeResult = false;
    if (!pending) return;
    const context = gl();
    if (context.isContextLost() || pboContext !== context) { pending = null; return; }
    const status = context.clientWaitSync(pending, 0, 0);
    if (status === context.TIMEOUT_EXPIRED) {
      if (frame - pendingSince > 120) { context.deleteSync(pending); pending = null; stats.skippedFences++; }
      return;
    }
    context.deleteSync(pending);
    pending = null;
    if (status === context.WAIT_FAILED) { stats.skippedFences++; return; }
    context.bindBuffer(context.PIXEL_PACK_BUFFER, pbo);
    context.getBufferSubData(context.PIXEL_PACK_BUFFER, 0, cells);
    context.bindBuffer(context.PIXEL_PACK_BUFFER, null);
    countProbeCells(cells, counts);
    counts.ground = 0; counts.groundBlack = 0;
    if (counts.black >= Math.ceil(BLACK_CELL_SHARE * PROBE_CELLS)) {
      countGroundCells(cells, probeWorld, probeProjectionInverse, probeView[0], probeView[1], counts);
    }
    lastNan = counts.nan > 0;
    probeResult = true;
    stats.readbacks++;
  }

  // ---- the wrappers ----
  function guardedSceneRender(this: unknown, r: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget, deltaTime?: number, maskActive?: boolean): void {
    if (!guard.enabled || !active) {
      originalSceneRender.call(this, r, writeBuffer, readBuffer, deltaTime, maskActive);
      return;
    }
    const info = r.info;
    const before = info.render.calls;
    sceneMask = camera.layers.mask;
    if (captureGl) glAtScene = readGlState('before');
    originalSceneRender.call(this, r, writeBuffer, readBuffer, deltaTime, maskActive);
    sceneCalls = info.autoReset ? info.render.calls : info.render.calls - before;
    sceneRan = true;
    if (captureGl) { captureGl = false; if (glAtScene) glAtScene.after = readGlState('after'); }
    if (probeWanted) { probeWanted = false; issueProbe(); }
  }

  function guardedPostRender(dt: number, frameWallDtSeconds?: number): void {
    if (!guard.enabled) { originalPostRender.call(post, dt, frameWallDtSeconds); return; }
    sceneRan = false;
    active = isActive();
    originalPostRender.call(post, dt, frameWallDtSeconds);
    if (active) afterFrame();
    else if (failStreak || incident) { failStreak = 0; lastFailClass = null; }
  }

  function isActive(): boolean {
    const battle = ports.game.phase === 'battle' && !(ports.isCovered?.() ?? false) && !coverShown() && !exempt()
      && !gl().isContextLost();
    if (battle && revealAt < 0) noteReveal();
    if (!battle && revealAt >= 0 && ports.game.phase !== 'battle') revealAt = -1;
    return battle;
  }

  function noteReveal(): void {
    revealAt = now();
    revealMask = camera.layers.mask | 1;
    revealRoots.length = 0;
    const tanks = tankRoots();
    for (const child of scene.children) {
      if (!child.visible || (child as THREE.Light).isLight || child.name === 'fx' || tanks.has(child)) continue;
      if (!(child as THREE.Mesh).isMesh && child.children.length === 0) continue;
      revealRoots.push(child);
    }
    revealWorld = worldGroup();
    failStreak = 0; lastFailClass = null; nextProbeFrame = frame + 2;
  }

  function tankRoots(): Set<THREE.Object3D> {
    const set = new Set<THREE.Object3D>();
    for (const entity of ports.game.tanks ?? []) {
      const root = (entity as GuardEntity | null)?.visual?.root;
      if (root) set.add(root);
    }
    return set;
  }

  function afterFrame(): void {
    frame++;
    stats.frames++;
    const t = now();
    if (sceneTarget.width !== lastWidth || sceneTarget.height !== lastHeight) {
      lastWidth = sceneTarget.width; lastHeight = sceneTarget.height; lastResizeAt = t;
      if (gldiag) gldiagUntil = frame + 120;
    }
    collectProbe();
    let bits = 0;
    if (!sceneRan || !sceneAA.enabled || !post.aerial.enabled || !post.lateFx.enabled) bits |= CPU.PASSES;
    if (sceneRan && (sceneMask & 1) === 0) bits |= CPU.MASK;
    if (!scene.visible) bits |= CPU.SCENE_HIDDEN;
    if (scene.overrideMaterial !== null) bits |= CPU.OVERRIDE;
    const viewport = sceneTarget.viewport;
    if (!(viewport.z >= 1 && viewport.w >= 1) || !(sceneTarget.width >= 1 && sceneTarget.height >= 1)
      || (sceneTarget.scissorTest && !(sceneTarget.scissor.z >= 1 && sceneTarget.scissor.w >= 1))) bits |= CPU.VIEWPORT;
    const world = revealWorld;
    if (world && (!world.visible || world.parent !== scene)) bits |= CPU.ROOTS;
    if (sceneRan && sceneCalls < MIN_SCENE_CALLS) bits |= CPU.EMPTY;
    cpuBits = bits;

    // a verdict point: a readback landed, or a decisive CPU signal held with no probe able to answer
    const cpuOnly = (bits & CPU_DECISIVE) !== 0 && frame - lastVerdictFrame >= CPU_VERDICT_FRAMES && !pending;
    // (an unfocused document presents nothing the player sees: no verdict either way)
    if ((probeResult || cpuOnly) && focused()) {
      lastVerdictFrame = frame;
      stats.verdicts++;
      onVerdict(judgeVerdict(bits, probeResult ? counts : null), t);
    }
    if (incident && !incident.closed && !reported && incident.steps.length && t - incident.steps[incident.steps.length - 1].atMs > 2000) {
      // a ladder that ended unhealed still reports once (healedBy null)
      report(incident);
    }
    // the next probe: on cadence, or at once while anything looks wrong
    if (!pending && (frame >= nextProbeFrame || bits !== 0 || failStreak > 0 || (incident && !incident.closed))) {
      probeWanted = true;
      nextProbeFrame = frame + PROBE_EVERY;
    }
  }

  function onVerdict(verdict: RenderBlackWorldClass | null, t: number): void {
    if (!verdict) {
      if (incident && !incident.closed) closeIncident(t);
      failStreak = 0; lastFailClass = null;
      return;
    }
    if (failStreak === 0) firstFailAt = t;
    failStreak++;
    lastFailClass = verdict;
    if (!incident || incident.closed) {
      if (failStreak < FAILS_TO_OPEN) return;
      openIncident(verdict, t);
      step(t);
      return;
    }
    failsSinceStep++;
    if (failsSinceStep >= FAILS_PER_STEP) step(t);
  }

  // ---- the receipt ----
  function openIncident(blackClass: RenderBlackWorldClass, t: number): void {
    stats.incidents++;
    stepIndex = 0;
    lastStep = null;
    failsSinceStep = 0;
    reported = false;
    const roots = scene.children.map((child) => ({
      name: child.name || '', type: child.type, visible: child.visible, mask: child.layers.mask,
      parent: child.parent === scene ? 'scene' : child.parent ? 'other' : 'detached', children: child.children.length,
    }));
    const world = worldGroup();
    const lm = scene.userData.lightModel as { exposure?: number; night?: number } | undefined;
    const deferred = host.__BATTLE_DEFERRED_WARM;
    incident = {
      class: blackClass,
      openedAtMs: Math.round(t),
      sinceRevealMs: revealAt >= 0 ? Math.round(t - revealAt) : null,
      sinceResizeMs: lastResizeAt >= 0 ? Math.round(t - lastResizeAt) : null,
      sinceResumeMs: lastResumeAt >= 0 ? Math.round(t - lastResumeAt) : null,
      cpu: {
        bits: cpuBits, sceneRan, sceneCalls, cameraMask: sceneMask, revealMask, sceneVisible: scene.visible,
        override: scene.overrideMaterial ? (scene.overrideMaterial.name || scene.overrideMaterial.type) : null,
        passes: post.composer.passes.map((pass) => `${pass.constructor?.name ?? 'Pass'}:${pass.enabled ? 1 : 0}`),
        clippingPlanes: renderer.clippingPlanes.length, localClipping: renderer.localClippingEnabled,
        shadowMap: renderer.shadowMap.enabled, background: scene.background ? 'set' : null, fog: !!scene.fog,
        camera: { near: camera.near, far: camera.far, fov: camera.fov,
          finite: camera.matrixWorld.elements.every(Number.isFinite) && camera.projectionMatrix.elements.every(Number.isFinite) },
        exposure: lm?.exposure ?? null, night: lm?.night ?? null,
      },
      probe: probeResult || counts.black + counts.lit + counts.deep > 0
        ? { black: counts.black, nan: counts.nan, lit: counts.lit, deep: counts.deep, ground: counts.ground, groundBlack: counts.groundBlack }
        : null,
      roots,
      world: world ? { name: world.name, visible: world.visible, attached: world.parent === scene } : null,
      target: describeTarget(),
      gl: { errors: drainErrors() },
      state: {
        dyn: post.dynScale ?? null, perfTrim: post.perfTrim ?? null, msaa: sceneTarget.samples,
        preset: presetName(),
        focus: typeof document !== 'undefined' ? document.hasFocus() : null,
        hidden: typeof document !== 'undefined' ? document.hidden : null,
        pointerLock: typeof document !== 'undefined' ? !!document.pointerLockElement : null,
        settingsOpen: typeof document !== 'undefined' ? !!document.querySelector('.cot-settings.open') : null,
      },
      warm: {
        deferred: deferred ? { done: !!deferred.done, cancelled: !!deferred.cancelled, error: deferred.error ? 'error' : null,
          stages: deferred.stages ? Object.keys(deferred.stages) : [] } : null,
        rareStep: host.__COMBAT_RARE_WARM_STEP ?? null,
      },
      steps: [],
      healedBy: null,
      healedAtMs: null,
      healMs: null,
      closed: false,
    };
    // the GL state at the next scene pass (before and after it draws)
    captureGl = true;
    const ring = ((host.__GL_DIAG ??= { errors: [] } as GuardHost['__GL_DIAG'] & object).blackWorld ??= []);
    ring.push(incident);
    if (ring.length > RECEIPT_RING) ring.splice(0, ring.length - RECEIPT_RING);
    receipts.push(incident);
    if (receipts.length > RECEIPT_RING) receipts.splice(0, receipts.length - RECEIPT_RING);
    console.warn(`[gl] black world (${blackClass}): the guard heals it; receipt in window.__GL_DIAG.blackWorld`, incident);
  }

  function closeIncident(t: number): void {
    if (!incident) return;
    incident.closed = true;
    incident.healedBy = lastStep ?? 'none';
    incident.healedAtMs = Math.round(t);
    incident.healMs = Math.round(t - firstFailAt);
    if (glAtScene) incident.gl.scene = glAtScene;
    glAtScene = null;
    stats.heals++;
    report(incident);
  }

  function report(receipt: BlackWorldReceipt): void {
    if (reported) return;
    reported = true;
    const step = (receipt.healedBy ?? 'none') as RenderBlackWorldStep;
    const code = renderBlackWorldCode(receipt.class, receipt.healedBy ? step : 'none');
    if (!code || !ports.report) return;
    const cpu = receipt.cpu as { sceneCalls: number; cameraMask: number; sceneVisible: boolean; override: string | null };
    const state = receipt.state as { dyn: number | null; perfTrim: number | null; msaa: number; preset: string; focus: boolean | null;
      hidden: boolean | null; pointerLock: boolean | null; settingsOpen: boolean | null };
    const deferred = receipt.warm.deferred as { done: boolean; cancelled: boolean; stages: string[] } | null;
    const fb = receipt.target.framebuffer as { msaa?: number; resolve?: number } | undefined;
    const message = renderBlackWorldMessage({
      calls: cpu.sceneCalls, mask: cpu.cameraMask, vis: cpu.sceneVisible, ovr: !!cpu.override,
      pass: post.sceneAA.enabled && post.aerial.enabled && post.lateFx.enabled,
      world: receipt.world ? receipt.world.visible && receipt.world.attached : null,
      roots: receipt.roots.filter((root) => root.visible).length,
      vp: (receipt.target.viewport as number[] | undefined)?.[2] ?? null,
      fb: fb?.resolve ?? null, err: (receipt.gl.errors as number[])[0] ?? 0,
      black: receipt.probe?.black ?? null, nan: receipt.probe?.nan ?? null, ground: receipt.probe?.ground ?? null,
      dyn: state.dyn, trim: state.perfTrim, msaa: state.msaa, preset: state.preset,
      focus: state.focus, hidden: state.hidden, lock: state.pointerLock, settings: state.settingsOpen,
      warm: deferred ? (deferred.cancelled ? 'cancelled' : deferred.done ? 'done' : deferred.stages.at(-1) ?? 'none') : 'none',
      rare: (receipt.warm.rareStep as string | null) ?? 'none',
      reveal: receipt.sinceRevealMs !== null ? receipt.sinceRevealMs / 1000 : null,
      resize: receipt.sinceResizeMs !== null ? receipt.sinceResizeMs / 1000 : null,
      resume: receipt.sinceResumeMs !== null ? receipt.sinceResumeMs / 1000 : null,
      steps: receipt.steps.length ? receipt.steps.map((entry) => entry.step).join('-') : 'none',
      heal: receipt.healedBy ?? 'none',
    });
    try { ports.report(RENDER_BLACK_WORLD_STAGE, message, code); } catch { /* the beacon never breaks the guard */ }
  }

  function presetName(): string {
    try { return ports.presetName?.() || 'unknown'; } catch { return 'unknown'; }
  }

  function describeTarget(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      width: sceneTarget.width, height: sceneTarget.height, samples: sceneTarget.samples,
      viewport: sceneTarget.viewport.toArray(), scissor: sceneTarget.scissor.toArray(), scissorTest: sceneTarget.scissorTest,
      late: [post.lateFx.target.width, post.lateFx.target.height],
    };
    try {
      const context = gl();
      const properties = renderer.properties.get(sceneTarget) as { __webglFramebuffer?: WebGLFramebuffer; __webglMultisampledFramebuffer?: WebGLFramebuffer };
      const previous = renderer.getRenderTarget();
      const status = (framebuffer: WebGLFramebuffer | undefined): number | null => {
        if (!framebuffer) return null;
        renderer.state.bindFramebuffer(context.FRAMEBUFFER, framebuffer);
        return context.checkFramebufferStatus(context.FRAMEBUFFER);
      };
      out.framebuffer = { resolve: status(properties.__webglFramebuffer), msaa: status(properties.__webglMultisampledFramebuffer) };
      renderer.setRenderTarget(previous);
      renderer.state.bindFramebuffer(context.FRAMEBUFFER, previous
        ? (renderer.properties.get(previous) as { __webglFramebuffer?: WebGLFramebuffer }).__webglFramebuffer ?? null : null);
    } catch (error) { out.framebufferError = String(error).slice(0, 120); }
    return out;
  }

  function drainErrors(): number[] {
    const errors: number[] = [];
    try {
      const context = gl();
      for (let i = 0; i < 8; i++) {
        const error = context.getError();
        if (error === context.NO_ERROR) break;
        errors.push(error);
      }
    } catch { /* lost */ }
    return errors;
  }

  function readGlState(phase: string): Record<string, unknown> {
    try {
      const context = gl();
      const read = (name: number): unknown => {
        const value = context.getParameter(name) as unknown;
        return ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value;
      };
      return {
        phase, colorMask: read(context.COLOR_WRITEMASK), depthMask: read(context.DEPTH_WRITEMASK),
        depthTest: read(context.DEPTH_TEST), depthFunc: read(context.DEPTH_FUNC), viewport: read(context.VIEWPORT),
        scissorTest: read(context.SCISSOR_TEST), scissor: read(context.SCISSOR_BOX), blend: read(context.BLEND),
        cull: read(context.CULL_FACE), rasterizerDiscard: read(context.RASTERIZER_DISCARD),
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      };
    } catch (error) { return { phase, error: String(error).slice(0, 120) }; }
  }

  // ---- the heal ladder ----
  function step(t: number): void {
    if (!incident) return;
    failsSinceStep = 0;
    if (stepIndex >= 4) {
      // the ladder ran out: the state re-asserted again (H1 is invisible on a healthy frame), and the whole ladder once
      // more for the same incident only after the cooldown
      if (t - ladderEndedAt < LADDER_COOLDOWN_MS) {
        incident.repeats = (incident.repeats ?? 0) + 1;
        lastStep = 'H1';
        try { healState(); } catch { /* the next verdict tries again */ }
        return;
      }
      stepIndex = 0;
    }
    const cpuHealthy = (cpuBits & CPU_DECISIVE) === 0;
    while (stepIndex < 4) {
      const name = (['H1', 'H2', 'H3', 'H4'] as const)[stepIndex++];
      if ((name === 'H4') && !cpuHealthy) {
        incident.steps.push({ step: 'H4', atMs: Math.round(t), note: 'skipped: a CPU signal a context restore cannot fix' });
        continue;
      }
      incident.steps.push({ step: name, atMs: Math.round(t) });
      lastStep = name;
      try {
        if (name === 'H1') healState();
        else if (name === 'H2') healTargets();
        else if (name === 'H3') healDevice(cpuHealthy);
        else healContext();
      } catch (error) {
        incident.steps[incident.steps.length - 1].note = `failed: ${String(error).slice(0, 80)}`;
      }
      console.warn(`[gl] black world heal ${name} (${incident.class})`);
      if (stepIndex >= 4) ladderEndedAt = t;
      return;
    }
    ladderEndedAt = t;
  }

  /** H1: the reveal's state again; nothing changes on a healthy frame. */
  function healState(): void {
    camera.layers.mask = revealMask | 1;
    scene.visible = true;
    scene.overrideMaterial = null;
    sceneAA.enabled = true;
    post.aerial.enabled = true;
    post.lateFx.enabled = true;
    sceneTarget.viewport.set(0, 0, sceneTarget.width, sceneTarget.height);
    sceneTarget.scissor.set(0, 0, sceneTarget.width, sceneTarget.height);
    sceneTarget.scissorTest = false;
    const world = worldGroup() ?? revealWorld;
    if (world) {
      if (world.parent !== scene) scene.add(world);
      world.visible = true;
    }
    for (const root of revealRoots) {
      if (root.parent === null) scene.add(root);
      if (root.parent === scene) root.visible = true;
    }
    try { ports.combatWarm?.cancelRare?.(); } catch { /* a warm that cannot close finishes on its own */ }
  }

  /** H2: every composer target reallocates at its next use; every temporal history starts over. */
  function healTargets(): void {
    sceneTarget.dispose();
    post.lateFx.target.dispose();
    post.lateFx.prepared = false;
    post.composer.renderTarget1?.dispose();
    post.composer.renderTarget2?.dispose();
    resetHistories();
    const size = renderer.getSize(_cssSize);
    post.setSize(size.x, size.y);
    drainErrors();
  }

  /** H3: the scene target without MSAA, and on a CPU-healthy black the graphics-recovery preset (one rung down). */
  function healDevice(cpuHealthy: boolean): void {
    if (sceneTarget.samples !== 0) sceneAA.setSamples(0);
    if (cpuHealthy && ports.relieveGraphics) {
      ports.relieveGraphics();
      // the preset change resizes and re-samples the chain; the scene target stays single-sampled for this incident
      if (sceneTarget.samples !== 0) sceneAA.setSamples(0);
    }
  }

  /** H4: a context lose/restore through the renderer's own recovery (contextRecovery.ts). */
  function healContext(): void {
    const context = gl();
    const lose = context.getExtension('WEBGL_lose_context');
    if (!lose) return;
    lose.loseContext();
    setTimeout(() => { try { lose.restoreContext(); } catch { /* the recovery notice owns it */ } }, 120);
  }

  function resetHistories(): void {
    try { post.taa?.resetHistory(); } catch { /* none */ }
    // the AO history (post.ts resetTemporalAoHistory) resets on any setSize, here at its current size
    try { if (post.gtao) post.gtao.setSize(sceneTarget.width, sceneTarget.height); } catch { /* none */ }
    try { (scene.userData.volumetricClouds as { resetHistory?(): void } | undefined)?.resetHistory?.(); } catch { /* none */ }
  }

  // ---- resume and context events ----
  const onResume = (): void => {
    if (typeof document !== 'undefined' && document.hidden) return;
    lastResumeAt = now();
    // a resume never shows a re-converging history unless the last probe saw a non-finite cell
    if (lastNan) { resetHistories(); lastNan = false; }
  };
  const onPointerLock = (): void => { if (typeof document !== 'undefined' && document.pointerLockElement) onResume(); };
  const onContextLost = (): void => { pending = null; pbo = null; pboContext = null; };
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);
    document.addEventListener('pointerlockchange', onPointerLock);
  }
  renderer.domElement?.addEventListener?.('webglcontextlost', onContextLost);

  // ---- ?gldiag=1: the GL error after each pass inside 120 frames of a resolution change (P8) ----
  const gldiag = typeof location !== 'undefined' && /[?&]gldiag=1(?:&|$)/.test(location.search);
  let gldiagUntil = 0;
  const gldiagRestore: Array<() => void> = [];

  function installGlDiag(): void {
    const watch = (label: string, owner: { render: (...args: never[]) => unknown }): void => {
      const original = owner.render;
      owner.render = function (this: unknown, ...args: never[]) {
        const result = original.apply(this, args);
        if (frame < gldiagUntil) {
          const error = gl().getError();
          if (error !== 0) notePassError(label, error);
        }
        return result;
      } as typeof owner.render;
      gldiagRestore.push(() => { owner.render = original; });
    };
    post.composer.passes.forEach((pass, index) => watch(`${pass.constructor?.name ?? 'Pass'}#${index}`, pass as never));
    const clouds = scene.userData.volumetricClouds as { beforeSceneRender?: (...args: never[]) => unknown } | undefined;
    if (clouds?.beforeSceneRender) {
      const original = clouds.beforeSceneRender;
      clouds.beforeSceneRender = function (this: unknown, ...args: never[]) {
        const result = original.apply(this, args);
        if (frame < gldiagUntil) {
          const error = gl().getError();
          if (error !== 0) notePassError('clouds', error);
        }
        return result;
      };
      gldiagRestore.push(() => { clouds.beforeSceneRender = original; });
    }
  }

  function notePassError(label: string, error: number): void {
    const context = gl();
    const program = context.getParameter(context.CURRENT_PROGRAM) as WebGLProgram | null;
    const info = (renderer.info.programs as Array<{ program?: WebGLProgram; name?: string; cacheKey?: string }> | null ?? [])
      .find((entry) => entry.program === program);
    const row = { frame, label, error, program: info?.name ?? null, key: info?.cacheKey?.slice(0, 160) ?? null, dyn: post.dynScale ?? null };
    const bag = (host.__GL_DIAG ??= { errors: [] } as GuardHost['__GL_DIAG'] & object);
    const rows = (bag.passErrors ??= []);
    if (rows.length < 64) rows.push(row);
    console.warn('[gl] pass error', row);
  }

  // ---- install ----
  sceneAA.render = guardedSceneRender as typeof sceneAA.render;
  post.render = guardedPostRender;
  if (gldiag) installGlDiag();

  const guard: BlackWorldGuard = {
    enabled: true,
    onCoveredEntry() {
      resetHistories();
      revealAt = -1;
      failStreak = 0;
      lastFailClass = null;
      if (incident && !incident.closed) { report(incident); incident.closed = true; }
      incident = null;
      ladderEndedAt = -Infinity;
    },
    stats() {
      return { ...stats, enabled: guard.enabled, active, frame, cpuBits, failStreak, pending: !!pending,
        lastClass: lastFailClass, incident: incident && !incident.closed ? incident.class : null,
        lastBlack: counts.black, lastNan: counts.nan, lastGround: counts.ground };
    },
    receipts,
    dispose() {
      if (sceneAA.render === (guardedSceneRender as unknown)) sceneAA.render = originalSceneRender;
      if (post.render === guardedPostRender) post.render = originalPostRender;
      for (const restore of gldiagRestore.splice(0)) restore();
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.removeEventListener('focus', onResume);
        document.removeEventListener('visibilitychange', onResume);
        document.removeEventListener('pointerlockchange', onPointerLock);
      }
      renderer.domElement?.removeEventListener?.('webglcontextlost', onContextLost);
      try { if (pbo && pboContext && !pboContext.isContextLost()) pboContext.deleteBuffer(pbo); } catch { /* lost */ }
      pbo = null; pending = null;
      probeQuad.dispose(); probeMaterial.dispose(); probeTarget.dispose();
      guards.delete(renderer);
      if (host.__COT_BLACK_GUARD === guard) delete host.__COT_BLACK_GUARD;
    },
  };
  host.__COT_BLACK_GUARD = guard;

  return {
    guard,
    update(next) {
      if (next.post !== post || next.renderer !== renderer) return;
      ports = { ...ports, ...next };
    },
  };
}

const _cssSize = new THREE.Vector2();
