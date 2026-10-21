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
 *  - A GPU probe every PROBE_EVERY frames (at once while anything looks wrong): two fullscreen draws over a 16 x 9 target,
 *    each fragment one cell of 8 x 8 taps of the resolved scene colour and depth, under two reusable ANY_SAMPLES_PASSED
 *    occlusion queries: one keeps the cells that hold any colour or depth (on an airless map only the cells looking at
 *    ground within reach, a black lunar sky overhead not being a black world), one answers when at least 1 % of the
 *    cells hold a NaN, read from its bits (round 3: saturated and infinite HDR, the sun disc, is light). The answers
 *    arrive frames later; the probe never stalls a frame, reads back no buffer and allocates nothing.
 *    (A pixel-pack-buffer readback trips Chrome's READ-usage shadow warning on every cycle, a known Chromium issue.)
 *  - Verdicts (a revealed battle, no Studio or shot staging, a live context, a focused document): BLACK-WORLD = no cell
 *    with colour or depth, NAN = NaN in 1 % of the cells, a CPU violation = its own class; two failing verdicts in a row
 *    open an incident. Its receipt (window.__GL_DIAG.blackWorld, a ring of 8; one console warning; one entry-telemetry
 *    `error` record, at most MAX_REPORTS a page) names the class, the probe's cell census (one synchronous read, at the incident only), every top-level
 *    root, the scene target and its framebuffers, the GL errors, the warm stage and the timing, so the owner's next
 *    black frame names its own cause.
 *  - The heal ladder, one step per two more failing verdicts, never while covered, one ladder per incident per 10 s:
 *    H1 re-assert state (the camera mask taken at reveal, scene visibility, no override, the canonical passes, the scene
 *    target's viewport, the battlefield and presentation roots, the live rare warm closed so its finally blocks run),
 *    H2 reallocate every composer target and reset the temporal histories, H3 MSAA off for the rest of that battle (the
 *    next covered entry takes the preset's samples back), H4 (only when every CPU signal
 *    is healthy, once a page) a context lose/restore through the renderer's recovery, whose own loss record takes the
 *    graphics-recovery preset one rung down; H3 waits for a black that has lasted a second, H4 three (a context restore
 *    blacks the frame for seconds itself), both measured from the ladder's own start. H1 and H2 change nothing on a
 *    healthy frame and only ever act on a frame that is already black. A rung is named the healer only when it changed
 *    something and the healthy verdict is one of the next two after it; a black that ends otherwise ended on its own
 *    (`self`). (Round 2, 2026-10-20, eng D2/D3: the preset no longer ratchets one rung per ladder, and a fault that
 *    cleared itself is no longer reported as healed by H1. Round 3, eng E3: the incident H4 restores stays open while the
 *    context is away, and the first verdict after the return credits it.)
 *  - Downstream of the scene target (round 2, D2): a third occlusion query compares the resolved scene colour with the
 *    chain's colour after the late-FX pass (the aerial pass's output and the late composite of it). A battle whose scene
 *    target holds the world while that colour is exactly zero over most of it (a dropped aerial draw, a dropped late-FX
 *    copy: the owner's signature over a healthy scene target) is a `downstream-black` incident.
 *  - The probe's programs link under the cover (parallel compile), never on the first revealed frame (round 2: the
 *    first probe used to compile them there, a 0.5-0.8 s freeze two frames after the reveal).
 *
 * Installed on instances (post.render, post.sceneAA.render), never on a prototype; window.__COT_BLACK_GUARD.enabled is
 * the A/B switch (tools/frame-budget-probe.mjs --toggle=black-guard). ?gldiag=1 (debug builds) adds the per-pass GL
 * error watch after every resolution change (P8: the dropped draws' program, named).
 */
import * as THREE from 'three';
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
/** On an airless map a black probe counts only with at least this share of the cells looking at ground within reach. */
export const GROUND_CELL_SHARE = 0.2;
/** Verdicts in a row that open an incident, and more failing ones per heal step. */
export const FAILS_TO_OPEN = 2;
export const FAILS_PER_STEP = 2;
/** CPU-only verdict cadence while a CPU signal stays wrong and no probe can answer (a pass switched off). */
export const CPU_VERDICT_FRAMES = 4;
/** One ladder per incident per this many ms. */
export const LADDER_COOLDOWN_MS = 10_000;
/** The device rungs wait for a black that has lasted: H3 (MSAA off, the recovery preset) and H4 (a context restore, which
 * blacks the frame for seconds itself) never answer a transient black. */
export const H3_AFTER_MS = 1000;
export const H4_AFTER_MS = 3000;
export const RECEIPT_RING = 8;
/** Telemetry records a page (round 3, eng E1: the entry telemetry's error budget is 3 a session and shared with crashes). */
export const MAX_REPORTS = 2;
/** A context restore the guard asked for (H4) keeps its incident open this long while the context is away (eng E3). */
export const RESTORE_WAIT_MS = 15_000;
/** Scene-pass draw calls under this are an empty scene pass. */
export const MIN_SCENE_CALLS = 3;
/** A rung is credited with the heal when the healthy verdict is one of this many after it acted. */
export const HEAL_CREDIT_VERDICTS = 2;
/** Downstream black: at least this share of the cells whose scene colour is lit read exactly zero after the late-FX pass,
 * and at least DOWN_LOST_MIN_CELLS of them (a fifth of the probe). */
export const DOWN_LOST_SHARE = 0.6;
export const DOWN_LOST_MIN_CELLS = Math.ceil(0.2 * PROBE_CELLS);

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

/** A NaN verdict needs at least this many NaN cells (1 % of the probe): one stray NaN texel is no poisoned history. */
export const NAN_MIN_CELLS = Math.ceil(0.01 * PROBE_CELLS);

/**
 * A NaN read from its bits (IEEE 754: an all-ones exponent, a non-zero mantissa), the one test no fast-math compile can
 * fold away. Saturated and infinite HDR is light, never a fault (round 3, eng E1 / repro R2-SUN-FALSE-POSITIVE): the sun
 * disc's ~9e4 radiance (sky.ts uSunDiscRadiance) fills the half-float scene target with 65504 on Metal and may store +Inf
 * on other GPUs, and the old `!(abs(c) < 6e4)` test opened a nan-history incident over a fully lit day frame.
 */
export const NAN_BITS_GLSL = /* glsl */ `
bool bwgNan( float x ) {
  uint b = floatBitsToUint( x );
  return ( b & 0x7f800000u ) == 0x7f800000u && ( b & 0x007fffffu ) != 0u;
}
bool bwgNan3( vec3 c ) { return bwgNan( c.r ) || bwgNan( c.g ) || bwgNan( c.b ); }`;

/** One cell's census: any colour above 0 (saturated and +Inf HDR included), any NaN, any depth below 1, and whether
 * the cell looks at ground. */
const PROBE_CELL_GLSL = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uFarFromNdc;
uniform vec4 uCamReach; // the camera's position, and the slope below which a view ray meets ground within reach
uniform float uAllCells;
${NAN_BITS_GLSL}
void cellCensus( out float lit, out float bad, out float deep, out float ground ) {
  vec2 cell = floor( gl_FragCoord.xy );
  lit = 0.0; bad = 0.0; deep = 0.0;
  for ( int j = 0; j < 8; j++ ) {
    for ( int i = 0; i < 8; i++ ) {
      vec2 uv = ( cell + ( vec2( float( i ), float( j ) ) + 0.5 ) / 8.0 ) / vec2( ${PROBE_COLUMNS}.0, ${PROBE_ROWS}.0 );
      vec4 c = texture2D( tColor, uv );
      float d = texture2D( tDepth, uv ).x;
      if ( bwgNan3( c.rgb ) ) bad = 1.0;
      else if ( c.r > 0.0 || c.g > 0.0 || c.b > 0.0 ) lit = 1.0;
      if ( d < 1.0 ) deep = 1.0;
    }
  }
  vec4 far = uFarFromNdc * vec4( ( cell + 0.5 ) / vec2( ${PROBE_COLUMNS}.0, ${PROBE_ROWS}.0 ) * 2.0 - 1.0, 1.0, 1.0 );
  ground = normalize( far.xyz / far.w - uCamReach.xyz ).y < uCamReach.w ? 1.0 : 0.0;
}`;
/** Kept (and counted by the lit query): a cell with colour or depth (on an airless map, a ground cell). */
const PROBE_LIT_FRAGMENT = `${PROBE_CELL_GLSL}
void main() {
  float lit, bad, deep, ground;
  cellCensus( lit, bad, deep, ground );
  if ( !( ( lit > 0.5 || deep > 0.5 ) && ( ground > 0.5 || uAllCells > 0.5 ) ) ) discard;
  gl_FragColor = vec4( 1.0 );
}`;
/** Every cell's NaN flag into the probe target (R), for the count below. */
const PROBE_NAN_FRAGMENT = `${PROBE_CELL_GLSL}
void main() {
  float lit, bad, deep, ground;
  cellCensus( lit, bad, deep, ground );
  gl_FragColor = vec4( bad, 0.0, 0.0, 1.0 );
}`;
/** Kept (and counted by the NaN query): one fragment, when at least NAN_MIN_CELLS cells of the probe target hold a NaN. */
const PROBE_NAN_COUNT_FRAGMENT = /* glsl */ `
uniform sampler2D tCells;
void main() {
  float n = 0.0;
  for ( int y = 0; y < ${PROBE_ROWS}; y++ ) {
    for ( int x = 0; x < ${PROBE_COLUMNS}; x++ ) {
      if ( texelFetch( tCells, ivec2( x, y ), 0 ).r > 0.5 ) n += 1.0;
    }
  }
  if ( n < ${NAN_MIN_CELLS}.0 ) discard;
  gl_FragColor = vec4( 1.0 );
}`;
/**
 * Kept (by the downstream query) when the chain lost the world after the scene target: one fragment over the whole
 * probe grid (2 x 2 taps a cell) counts the cells whose resolved scene colour is lit and, of them, those whose colour
 * after the late-FX pass is exactly zero.
 */
const PROBE_DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDown;
void main() {
  float sceneLit = 0.0;
  float lost = 0.0;
  for ( int y = 0; y < ${PROBE_ROWS}; y++ ) {
    for ( int x = 0; x < ${PROBE_COLUMNS}; x++ ) {
      float s = 0.0;
      float d = 0.0;
      for ( int j = 0; j < 2; j++ ) {
        for ( int i = 0; i < 2; i++ ) {
          vec2 uv = ( vec2( float( x ), float( y ) ) + ( vec2( float( i ), float( j ) ) + 0.5 ) / 2.0 )
            / vec2( ${PROBE_COLUMNS}.0, ${PROBE_ROWS}.0 );
          vec3 c = texture2D( tColor, uv ).rgb;
          vec3 o = texture2D( tDown, uv ).rgb;
          if ( abs( c.r ) < 6.0e4 && abs( c.g ) < 6.0e4 && abs( c.b ) < 6.0e4 && ( c.r > 0.0 || c.g > 0.0 || c.b > 0.0 ) ) s = 1.0;
          if ( !( o.r == 0.0 && o.g == 0.0 && o.b == 0.0 ) ) d = 1.0;
        }
      }
      sceneLit += s;
      if ( s > 0.5 && d < 0.5 ) lost += 1.0;
    }
  }
  if ( !( lost >= ${DOWN_LOST_SHARE} * sceneLit && lost >= ${DOWN_LOST_MIN_CELLS}.0 ) ) discard;
  gl_FragColor = vec4( 1.0 );
}`;
/** The incident's census (read back once, synchronously): R lit, G non-finite, B depth, A ground. */
const PROBE_CENSUS_FRAGMENT = `${PROBE_CELL_GLSL}
void main() {
  float lit, bad, deep, ground;
  cellCensus( lit, bad, deep, ground );
  gl_FragColor = vec4( lit, bad, deep, ground );
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
  lateFx: AnyPass & { target: THREE.WebGLRenderTarget; prepared?: boolean; needsSwap?: boolean;
    render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget,
      deltaTime?: number, maskActive?: boolean): void };
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
  /** The cell census at the incident (counts of 144 cells), and the last probe's answers. */
  probe: { black: number; nan: number; lit: number; deep: number; ground: number; groundBlack: number; anyLit: boolean;
    anyNan: boolean; downLost: boolean } | null;
  roots: Array<{ name: string; type: string; visible: boolean; mask: number; parent: string; children: number }>;
  world: { name: string; visible: boolean; attached: boolean } | null;
  target: Record<string, unknown>;
  gl: Record<string, unknown>;
  state: Record<string, unknown>;
  warm: Record<string, unknown>;
  steps: IncidentStep[];
  /** H1 re-asserted after the ladder ran out, inside its cooldown */
  repeats?: number;
  /** When the last rung that changed something acted: the world is back on the next frame when that rung healed it */
  lastStepAtMs?: number;
  /** How the incident ended: a healthy verdict, the battle left (the player left, a cover came up) or the page hidden
   * with it open, or a ladder that ran out unhealed */
  endedBy?: 'healthy' | 'left' | 'ladder' | 'page';
  healedBy: RenderBlackWorldStep | null;
  healedAtMs: number | null;
  /** ms from the incident's first failing verdict to the healthy one */
  healMs: number | null;
  closed: boolean;
}

export interface BlackWorldGuard {
  enabled: boolean;
  /**
   * (round 3, repro R2-PERF-INCONCLUSIVE) measure the guard's own cost while true: the main-thread ms it spends outside
   * the frame it wraps, and the GPU ms of its probe draws (a timer query); stats() reports them, resetTiming() zeroes them.
   */
  timing: boolean;
  resetTiming(): void;
  /**
   * A battle entry (solo deployment, network reveal) armed the guard: a new reveal snapshot, the probe's programs
   * submitted for a parallel link, and (only while the entry is still covered: a chunk that arrives after the reveal
   * never resets a presented frame's history) fresh temporal histories.
   */
  onCoveredEntry(options?: { covered?: boolean }): void;
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
  __DEBUG?: { shotMode?: boolean };
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

/** The incident census of one synchronous read (RGBA8: R lit, G non-finite, B depth, A ground): counts only. */
export function countProbeCells(cells: Uint8Array,
  out: { black: number; nan: number; lit: number; deep: number; ground: number; groundBlack: number }): void {
  let black = 0, nan = 0, lit = 0, deep = 0, ground = 0, groundBlack = 0;
  for (let i = 0; i < PROBE_CELLS; i++) {
    const r = cells[i * 4] > 127, g = cells[i * 4 + 1] > 127, b = cells[i * 4 + 2] > 127, a = cells[i * 4 + 3] > 127;
    if (r) lit++;
    if (g) nan++;
    if (b) deep++;
    const isBlack = !r && !b && !g;
    if (isBlack) black++;
    if (a) { ground++; if (isBlack) groundBlack++; }
  }
  out.black = black; out.nan = nan; out.lit = lit; out.deep = deep; out.ground = ground; out.groundBlack = groundBlack;
}

const _ray = new THREE.Vector3();
/** The cells whose centre ray meets the ground within 80 % of the far plane (the camera `height` m above it). */
export function countGroundCells(world: THREE.Matrix4, projectionInverse: THREE.Matrix4, height: number, far: number): number {
  const reachSlope = groundReachSlope(height, far);
  let ground = 0;
  for (let y = 0; y < PROBE_ROWS; y++) {
    for (let x = 0; x < PROBE_COLUMNS; x++) {
      _ray.set(((x + 0.5) / PROBE_COLUMNS) * 2 - 1, ((y + 0.5) / PROBE_ROWS) * 2 - 1, 1).applyMatrix4(projectionInverse)
        .transformDirection(world);
      if (_ray.y < reachSlope) ground++;
    }
  }
  return ground;
}

/** A view ray below this slope meets ground within 80 % of the far plane from `height` m up. */
export function groundReachSlope(height: number, far: number): number {
  return -Math.max(1, height) / (0.8 * far);
}

/**
 * The verdict the CPU bits and a probe reach (`anyLit`: some cell holds colour or depth, ground cells only on an airless
 * map; `ground`: the ground cells in view, read only on an airless map); null is healthy.
 */
export function judgeVerdict(cpuBits: number,
  probe: { anyLit: boolean; anyNan: boolean; allCells: boolean; ground: number; downLost?: boolean } | null):
  RenderBlackWorldClass | null {
  for (let i = 0; i < CPU_CLASS.length; i++) if (cpuBits & CPU_CLASS[i][0]) return CPU_CLASS[i][1];
  if (!probe) return null;
  if (probe.anyNan) return 'nan-history';
  if (!probe.anyLit && (probe.allCells || probe.ground >= Math.ceil(GROUND_CELL_SHARE * PROBE_CELLS))) {
    return cpuBits & CPU.EMPTY ? 'empty-scene-pass' : 'gl-masked';
  }
  // the scene target holds the world, the chain's colour after the late-FX pass lost it (round 2, D2)
  if (probe.anyLit && probe.downLost === true) return 'downstream-black';
  return null;
}

function createGuard(initial: BlackWorldGuardPorts): { guard: BlackWorldGuard; update(ports: BlackWorldGuardPorts): void } {
  let ports = initial;
  const { renderer, scene, camera, post } = initial;
  const host = globalThis as typeof globalThis & GuardHost;
  const now = (): number => (ports.now ? ports.now() : performance.now());
  const sceneAA = post.sceneAA;
  const sceneTarget = sceneAA.sceneTarget;
  const lateFx = post.lateFx;
  const originalSceneRender = sceneAA.render;
  const originalLateRender = lateFx.render;
  const originalPostRender = post.render;

  // ---- preallocated probe ----
  const probeTarget = new THREE.WebGLRenderTarget(PROBE_COLUMNS, PROBE_ROWS, {
    type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  probeTarget.texture.name = 'BlackWorldGuard.probe';
  // the downstream query's one fragment (round 2, D2)
  const probeDownTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  probeDownTarget.texture.name = 'BlackWorldGuard.probeDown';
  const probeUniforms = {
    tColor: { value: null as THREE.Texture | null }, tDepth: { value: null as THREE.Texture | null },
    tDown: { value: null as THREE.Texture | null },
    // the NaN count reads the probe target's own cells (one texel a cell)
    tCells: { value: probeTarget.texture as THREE.Texture },
    // (a double stored in a shared `{ value }` uniform slot is boxed every frame; a vector's own fields are not)
    uFarFromNdc: { value: new THREE.Matrix4() }, uCamReach: { value: new THREE.Vector4() }, uAllCells: { value: 1 },
  };
  const probeMaterial = (name: string, fragmentShader: string): THREE.ShaderMaterial => new THREE.ShaderMaterial({
    name, uniforms: probeUniforms, fragmentShader,
    vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
  });
  const probeLit = probeMaterial('BlackWorldGuard.ProbeLit', PROBE_LIT_FRAGMENT);
  const probeNan = probeMaterial('BlackWorldGuard.ProbeNan', PROBE_NAN_FRAGMENT);
  const probeCensus = probeMaterial('BlackWorldGuard.ProbeCensus', PROBE_CENSUS_FRAGMENT);
  const probeDown = probeMaterial('BlackWorldGuard.ProbeDown', PROBE_DOWN_FRAGMENT);
  const probeNanCount = probeMaterial('BlackWorldGuard.ProbeNanCount', PROBE_NAN_COUNT_FRAGMENT);
  // one fullscreen triangle per program (its own meshes, so renderer.compileAsync can link them under the cover)
  const probeGeometry = new THREE.BufferGeometry();
  probeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  const probeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const probeMesh = (material: THREE.ShaderMaterial): THREE.Mesh => {
    const mesh = new THREE.Mesh(probeGeometry, material);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  };
  const meshLit = probeMesh(probeLit), meshNan = probeMesh(probeNan), meshCensus = probeMesh(probeCensus);
  const meshDown = probeMesh(probeDown), meshNanCount = probeMesh(probeNanCount);
  const drawProbe = (mesh: THREE.Mesh): void => { renderer.render(mesh, probeCamera); };
  const cells = new Uint8Array(PROBE_CELLS * 4);
  const census = { black: 0, nan: 0, lit: 0, deep: 0, ground: 0, groundBlack: 0 };
  const answer = { anyLit: true, anyNan: false, allCells: true, ground: 0, downLost: false };
  const probeWorld = new THREE.Matrix4();
  const probeProjectionInverse = new THREE.Matrix4();
  // the probe's camera height over the ground and far plane (a typed array: a double kept in a closure slot is boxed)
  const probeView = new Float64Array(2);
  let queryLit: WebGLQuery | null = null;
  let queryNan: WebGLQuery | null = null;
  let queryDown: WebGLQuery | null = null;
  let queryContext: WebGL2RenderingContext | null = null;
  let pending = false;
  let pendingDown = false; // the downstream query rides the same cycle when the late-FX pass ran after the scene probe
  let pendingSince = 0;
  let probeWanted = false;
  let downWanted = false;
  let probeResult = false; // the queries answered this frame
  // the probe's programs: submitted under the cover for a parallel link; no probe draws before they are ready
  let probeReady = false;
  let probeWarming = false;

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
  // the context restores this guard asked for: at most one a page (one guard a renderer, one renderer a page), since each
  // takes the recovery preset one rung down
  let contextRestores = 0;
  // H4's restore in flight (eng E3): the incident stays open while the context is away, its credit waits for the return
  let restoreAskedAt = -1;
  // H3's MSAA-off lasts the battle it healed (eng E2): the samples and preset it lowered, taken back at the next entry
  let h3Lowered: { samples: number; preset: string } | null = null;
  let reports = 0;
  // the ladder's own start (the device rungs' age: a ladder that restarts after its cooldown waits for them again)
  let ladderStartedAt = 0;
  // the last rung that changed something, and the verdicts since: the heal's credit (eng D3)
  let lastStep: RenderBlackWorldStep | null = null;
  let verdictsSinceAct = 0;
  let reported = false;
  const receipts: BlackWorldReceipt[] = [];
  const stats = { frames: 0, probes: 0, readbacks: 0, verdicts: 0, incidents: 0, heals: 0, skippedFences: 0 };
  // the guard's own cost while guard.timing: [cpu ms, timed frames, max frame ms, probe GPU ms, timed probes, this frame's
  // ms inside the wrapped passes] (a typed array: no boxed doubles)
  const timed = new Float64Array(6);
  let timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null | undefined;
  let timerQuery: WebGLQuery | null = null;
  let timerPending = false;
  let timerContext: WebGL2RenderingContext | null = null;

  const gl = (): WebGL2RenderingContext => renderer.getContext() as WebGL2RenderingContext;
  const canProbe = (context: WebGL2RenderingContext): boolean => typeof context.createQuery === 'function';

  const coverShown = (): boolean => {
    if (!coverElement && frame - coverLookupFrame >= 60 && typeof document !== 'undefined') {
      coverLookupFrame = frame;
      coverElement = document.querySelector('.cot-bl');
    }
    return !!coverElement && coverElement.classList.contains('on');
  };
  // (a staged shot view stands the guard aside while the shot mode lasts, eng D9)
  const exempt = (): boolean => (ports.isExempt ? ports.isExempt() : (!!host.__STUDIO?.active || host.__DEBUG?.shotMode === true));
  const focused = (): boolean => (ports.hasFocus ? ports.hasFocus()
    : typeof document === 'undefined' || (document.hasFocus() && !document.hidden));
  const worldGroup = (): THREE.Object3D | null => ports.getWorld?.()?.group ?? null;

  // ---- the probe (inside the scene pass, after the scene drew) ----
  function ensureQueries(context: WebGL2RenderingContext): boolean {
    if (queryLit && queryNan && queryDown && queryContext === context) return true;
    pending = false;
    pendingDown = false;
    queryContext = context;
    queryLit = context.createQuery();
    queryNan = context.createQuery();
    queryDown = context.createQuery();
    return !!(queryLit && queryNan && queryDown);
  }

  /**
   * The probe's programs, submitted for the driver's parallel link into the probe's own targets (the program keys match
   * the probe's draws); the probe draws only once they answer. Under the cover of a battle entry, never on the first
   * revealed frames (the start hitch the visual critic measured).
   */
  function warmProbePrograms(): void {
    if (probeReady || probeWarming) return;
    const context = gl();
    if (!canProbe(context) || context.isContextLost()) return;
    const compileAsync = (renderer as { compileAsync?: (scene: THREE.Object3D, camera: THREE.Camera) => Promise<unknown> }).compileAsync;
    if (typeof compileAsync !== 'function') { probeReady = true; return; }
    probeWarming = true;
    const previous = renderer.getRenderTarget();
    const pendingLinks: Promise<unknown>[] = [];
    try {
      renderer.setRenderTarget(probeTarget);
      for (const mesh of [meshLit, meshNan, meshCensus]) pendingLinks.push(compileAsync.call(renderer, mesh, probeCamera));
      renderer.setRenderTarget(probeDownTarget);
      for (const mesh of [meshDown, meshNanCount]) pendingLinks.push(compileAsync.call(renderer, mesh, probeCamera));
    } catch {
      probeWarming = false;
      probeReady = true; // a renderer that cannot submit them links at the first probe, as before
      return;
    } finally {
      renderer.setRenderTarget(previous);
    }
    const settle = (): void => { probeWarming = false; probeReady = !gl().isContextLost(); };
    void Promise.all(pendingLinks).then(settle, settle);
  }

  /** The probe's uniforms from the live camera and the frame's scene target. */
  function aimProbe(): void {
    probeUniforms.tColor.value = sceneTarget.texture;
    probeUniforms.tDepth.value = sceneTarget.depthTexture;
    probeUniforms.uFarFromNdc.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    // (field stores, no calls taking fresh doubles: an argument a callee is not inlined for is boxed)
    const e = camera.matrixWorld.elements;
    const datum = post.aerial.uniforms.uHazeDatum?.value;
    probeView[0] = e[13] - (typeof datum === 'number' && datum === datum && datum - datum === 0 ? datum : 0);
    probeView[1] = camera.far;
    const reach = probeUniforms.uCamReach.value;
    reach.x = e[12];
    reach.y = e[13];
    reach.z = e[14];
    // groundReachSlope's law
    reach.w = -(probeView[0] > 1 ? probeView[0] : 1) / (0.8 * probeView[1]);
    // an airless map's sky is black space: only the ground cells can say the world drew
    probeUniforms.uAllCells.value = post.aerial.uniforms.uAirless?.value === 1 ? 0 : 1;
  }

  function issueProbe(): void {
    const context = gl();
    if (pending || !probeReady || !canProbe(context) || context.isContextLost() || !ensureQueries(context)) return;
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    try {
      aimProbe();
      answer.allCells = probeUniforms.uAllCells.value === 1;
      probeWorld.copy(camera.matrixWorld);
      probeProjectionInverse.copy(camera.projectionMatrixInverse);
      renderer.autoClear = false;
      renderer.setRenderTarget(probeTarget);
      const timer = guard.timing ? beginTimer(context) : false;
      context.beginQuery(context.ANY_SAMPLES_PASSED, queryLit!);
      drawProbe(meshLit);
      context.endQuery(context.ANY_SAMPLES_PASSED);
      // every cell's NaN flag, then one fragment that counts them (round 3, E1: a stray NaN texel is no poisoned history)
      drawProbe(meshNan);
      renderer.setRenderTarget(probeDownTarget);
      context.beginQuery(context.ANY_SAMPLES_PASSED, queryNan!);
      drawProbe(meshNanCount);
      context.endQuery(context.ANY_SAMPLES_PASSED);
      if (timer) context.endQuery(timerExt!.TIME_ELAPSED_EXT);
      pending = true;
      pendingDown = false;
      downWanted = true; // the late-FX pass of this same frame adds the downstream query
      pendingSince = frame;
      stats.probes++;
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
  }

  /** The probe's GPU time (timing only): one timer query around its draws, read once it answers. */
  function beginTimer(context: WebGL2RenderingContext): boolean {
    if (timerPending) return false;
    if (timerExt === undefined || timerContext !== context) {
      timerContext = context;
      timerExt = context.getExtension('EXT_disjoint_timer_query_webgl2') as typeof timerExt ?? null;
      timerQuery = timerExt ? context.createQuery() : null;
    }
    if (!timerExt || !timerQuery) return false;
    context.beginQuery(timerExt.TIME_ELAPSED_EXT, timerQuery);
    timerPending = true;
    return true;
  }

  function collectTimer(): void {
    if (!timerPending || !timerExt || !timerQuery || !timerContext || timerContext.isContextLost()) return;
    if (!timerContext.getQueryParameter(timerQuery, timerContext.QUERY_RESULT_AVAILABLE)) return;
    timerPending = false;
    if (timerContext.getParameter(timerExt.GPU_DISJOINT_EXT)) return;
    timed[3] += (timerContext.getQueryParameter(timerQuery, timerContext.QUERY_RESULT) as number) / 1e6;
    timed[4]++;
  }

  /** The downstream query (round 2, D2): the frame's resolved scene colour against the chain's colour after late FX. */
  function issueDownProbe(down: THREE.Texture): void {
    const context = gl();
    if (!pending || pendingDown || !queryDown || queryContext !== context || context.isContextLost()) return;
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    try {
      probeUniforms.tColor.value = sceneTarget.texture;
      probeUniforms.tDown.value = down;
      renderer.autoClear = false;
      renderer.setRenderTarget(probeDownTarget);
      context.beginQuery(context.ANY_SAMPLES_PASSED, queryDown);
      drawProbe(meshDown);
      context.endQuery(context.ANY_SAMPLES_PASSED);
      pendingDown = true;
    } finally {
      probeUniforms.tDown.value = null;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
  }

  function collectProbe(): void {
    probeResult = false;
    if (!pending) return;
    const context = gl();
    if (context.isContextLost() || queryContext !== context) { pending = false; return; }
    if (!context.getQueryParameter(queryLit!, context.QUERY_RESULT_AVAILABLE)
      || !context.getQueryParameter(queryNan!, context.QUERY_RESULT_AVAILABLE)
      || (pendingDown && !context.getQueryParameter(queryDown!, context.QUERY_RESULT_AVAILABLE))) {
      if (frame - pendingSince > 120) { pending = false; pendingDown = false; stats.skippedFences++; }
      return;
    }
    pending = false;
    answer.anyLit = !!context.getQueryParameter(queryLit!, context.QUERY_RESULT);
    answer.anyNan = !!context.getQueryParameter(queryNan!, context.QUERY_RESULT);
    answer.downLost = pendingDown && !!context.getQueryParameter(queryDown!, context.QUERY_RESULT);
    pendingDown = false;
    // the ground census only decides an airless map's black probe
    answer.ground = !answer.anyLit && !answer.allCells
      ? countGroundCells(probeWorld, probeProjectionInverse, probeView[0], probeView[1]) : 0;
    lastNan = answer.anyNan;
    probeResult = true;
    stats.readbacks++;
  }

  /** The incident's cell census: the census draw over the frame's scene target, read back once (a stall, once). */
  function readCensus(): BlackWorldReceipt['probe'] {
    const context = gl();
    const previous = renderer.getRenderTarget();
    try {
      aimProbe();
      renderer.setRenderTarget(probeTarget);
      drawProbe(meshCensus);
      context.readPixels(0, 0, PROBE_COLUMNS, PROBE_ROWS, context.RGBA, context.UNSIGNED_BYTE, cells);
      countProbeCells(cells, census);
      return { ...census, anyLit: answer.anyLit, anyNan: answer.anyNan, downLost: answer.downLost };
    } catch {
      return null;
    } finally {
      renderer.setRenderTarget(previous);
    }
  }

  // ---- the wrappers ----
  function guardedSceneRender(this: unknown, r: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget, deltaTime?: number, maskActive?: boolean): void {
    if (!guard.enabled || !active) {
      originalSceneRender.call(this, r, writeBuffer, readBuffer, deltaTime, maskActive);
      return;
    }
    const timing = guard.timing;
    const t0 = timing ? performance.now() : 0;
    const info = r.info;
    const before = info.render.calls;
    sceneMask = camera.layers.mask;
    if (captureGl) glAtScene = readGlState('before');
    const t1 = timing ? performance.now() : 0;
    originalSceneRender.call(this, r, writeBuffer, readBuffer, deltaTime, maskActive);
    const t2 = timing ? performance.now() : 0;
    sceneCalls = info.autoReset ? info.render.calls : info.render.calls - before;
    sceneRan = true;
    if (captureGl) { captureGl = false; if (glAtScene) glAtScene.after = readGlState('after'); }
    if (probeWanted) { probeWanted = false; issueProbe(); }
    if (timing) timed[5] += (t1 - t0) + (performance.now() - t2);
  }

  /** After the late-FX pass: the chain's colour from here on (its swap target when it drew, else its input). */
  function guardedLateRender(this: { needsSwap?: boolean }, r: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget, deltaTime?: number, maskActive?: boolean): void {
    originalLateRender.call(this, r, writeBuffer, readBuffer, deltaTime, maskActive);
    if (!downWanted || !guard.enabled || !active) return;
    const t0 = guard.timing ? performance.now() : 0;
    downWanted = false;
    const out = this.needsSwap ? writeBuffer : readBuffer;
    if (out?.texture) issueDownProbe(out.texture);
    if (guard.timing) timed[5] += performance.now() - t0;
  }

  function guardedPostRender(dt: number, frameWallDtSeconds?: number): void {
    if (!guard.enabled) { originalPostRender.call(post, dt, frameWallDtSeconds); return; }
    const timing = guard.timing;
    const t0 = timing ? performance.now() : 0;
    sceneRan = false;
    downWanted = false;
    active = isActive();
    const t1 = timing ? performance.now() : 0;
    originalPostRender.call(post, dt, frameWallDtSeconds);
    const t2 = timing ? performance.now() : 0;
    // (a frame whose late-FX pass never ran leaves no downstream probe pending for a warm's lone late-FX render)
    downWanted = false;
    if (active) afterFrame();
    else {
      if (failStreak) { failStreak = 0; lastFailClass = null; }
      // (eng D7) the battle ended with the incident open (the player left a black screen, a cover came up): it reports now;
      // (round 3, eng E3) not while the guard's own context restore (H4) is away, whose return the incident waits for
      if (incident && !incident.closed && !reported && !awaitingRestore()) endIncident('left', now());
    }
    if (timing) {
      const ms = (t1 - t0) + (performance.now() - t2) + timed[5];
      timed[5] = 0;
      timed[0] += ms;
      timed[1]++;
      if (ms > timed[2]) timed[2] = ms;
      collectTimer();
    }
  }

  /** H4's restore is in flight: the same battle, the context away (or just back and not yet judged), inside its wait. */
  function awaitingRestore(): boolean {
    if (restoreAskedAt < 0) return false;
    if (ports.game.phase === 'battle' && verdictsSinceAct === 0 && now() - restoreAskedAt < RESTORE_WAIT_MS) return true;
    restoreAskedAt = -1;
    return false;
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

    // a verdict point: the probe's queries answered, or a decisive CPU signal held (it needs no probe to be believed)
    const cpuOnly = (bits & CPU_DECISIVE) !== 0 && frame - lastVerdictFrame >= CPU_VERDICT_FRAMES;
    // (an unfocused document presents nothing the player sees: no verdict either way)
    if ((probeResult || cpuOnly) && focused()) {
      lastVerdictFrame = frame;
      stats.verdicts++;
      onVerdict(judgeVerdict(bits, probeResult ? answer : null), t);
    }
    if (incident && !incident.closed && !reported && incident.steps.length && t - incident.steps[incident.steps.length - 1].atMs > 2000
      && !awaitingRestore()) {
      // a ladder that ended unhealed still reports once (healedBy null)
      incident.endedBy = 'ladder';
      report(incident);
    }
    // the next probe: on cadence, or at once while anything looks wrong
    if (!pending && (frame >= nextProbeFrame || bits !== 0 || failStreak > 0 || (incident && !incident.closed))) {
      probeWanted = true;
      nextProbeFrame = frame + PROBE_EVERY;
    }
  }

  function onVerdict(verdict: RenderBlackWorldClass | null, t: number): void {
    if (incident && !incident.closed) verdictsSinceAct++;
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
    // (a ladder that ran out re-asserts the state on every failing verdict: the cheapest rung, invisible when healthy)
    if (failsSinceStep >= (stepIndex >= 4 ? 1 : FAILS_PER_STEP)) step(t);
  }

  // ---- the receipt ----
  function openIncident(blackClass: RenderBlackWorldClass, t: number): void {
    stats.incidents++;
    stepIndex = 0;
    lastStep = null;
    verdictsSinceAct = 0;
    ladderStartedAt = t;
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
      probe: readCensus(),
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

  /**
   * A healthy verdict closes the incident. The rung that acted last (and changed something) is credited only when this
   * verdict is one of the next HEAL_CREDIT_VERDICTS after it; otherwise the black ended on its own (`self`): a fault
   * that cleared by itself is never reported as healed by the rung that happened to run before it (eng D3).
   */
  function closeIncident(t: number): void {
    if (!incident) return;
    incident.closed = true;
    incident.endedBy = 'healthy';
    incident.healedBy = lastStep && verdictsSinceAct <= HEAL_CREDIT_VERDICTS ? lastStep : 'self';
    incident.healedAtMs = Math.round(t);
    incident.healMs = Math.round(t - firstFailAt);
    if (glAtScene) incident.gl.scene = glAtScene;
    glAtScene = null;
    stats.heals++;
    report(incident);
  }

  /** The battle ended (or the page is going away) with the incident open: it is closed unhealed and reported now. */
  function endIncident(endedBy: 'left' | 'page', t: number): void {
    if (!incident || incident.closed) return;
    incident.closed = true;
    incident.endedBy = endedBy;
    incident.healedBy = null;
    incident.healedAtMs = null;
    incident.healMs = Math.round(t - firstFailAt);
    if (glAtScene) incident.gl.scene = glAtScene;
    glAtScene = null;
    report(incident);
  }

  function report(receipt: BlackWorldReceipt): void {
    if (reported) return;
    reported = true;
    restoreAskedAt = -1;
    // (the console warning and the ring hold every incident; the beacon only the first MAX_REPORTS a page)
    if (reports >= MAX_REPORTS) return;
    reports++;
    const step = (receipt.healedBy ?? 'none') as RenderBlackWorldStep;
    const code = renderBlackWorldCode(receipt.class, receipt.healedBy ? step : 'none');
    if (!code || !ports.report) return;
    const cpu = receipt.cpu as { sceneCalls: number; cameraMask: number; sceneVisible: boolean; override: string | null };
    const state = receipt.state as { dyn: number | null; perfTrim: number | null; msaa: number; preset: string; focus: boolean | null;
      hidden: boolean | null; pointerLock: boolean | null; settingsOpen: boolean | null };
    const deferred = receipt.warm.deferred as { done: boolean; cancelled: boolean; stages: string[] } | null;
    const fb = receipt.target.framebuffer as { msaa?: number; resolve?: number } | undefined;
    const seconds = (ms: number | null): number | null => (ms !== null ? Math.round(ms / 100) / 10 : null);
    let rung = -1;
    for (const entry of receipt.steps) rung = Math.max(rung, ['H1', 'H2', 'H3', 'H4'].indexOf(entry.step));
    const message = renderBlackWorldMessage({
      calls: cpu.sceneCalls, mask: cpu.cameraMask, vis: cpu.sceneVisible, ovr: !!cpu.override,
      pass: post.sceneAA.enabled && post.aerial.enabled && post.lateFx.enabled,
      world: receipt.world ? receipt.world.visible && receipt.world.attached : null,
      roots: receipt.roots.filter((root) => root.visible).length,
      vp: (receipt.target.viewport as number[] | undefined)?.[2] ?? null,
      fb: fb?.resolve ?? null, err: (receipt.gl.errors as number[])[0] ?? 0,
      black: receipt.probe?.black ?? null, nan: receipt.probe?.nan ?? null, ground: receipt.probe?.ground ?? null,
      lost: receipt.probe ? receipt.probe.downLost : null, left: receipt.endedBy === 'left' || receipt.endedBy === 'page',
      dyn: state.dyn, trim: state.perfTrim, msaa: state.msaa, preset: state.preset,
      focus: state.focus, hidden: state.hidden, lock: state.pointerLock, settings: state.settingsOpen,
      warm: deferred ? (deferred.cancelled ? 'cancelled' : deferred.done ? 'done' : deferred.stages.at(-1) ?? 'none') : 'none',
      rare: (receipt.warm.rareStep as string | null) ?? 'none',
      // (seconds to a tenth: the most telling fields lead the message, eng D1)
      reveal: seconds(receipt.sinceRevealMs), resize: seconds(receipt.sinceResizeMs), resume: seconds(receipt.sinceResumeMs),
      // the highest rung the ladder reached
      steps: rung >= 0 ? ['H1', 'H1-H2', 'H1-H2-H3', 'H1-H2-H3-H4'][rung] : 'none',
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
      // the bound draw framebuffer against the scene target's own (eng D8: a draw into another one lands nowhere seen)
      const properties = renderer.properties.get(sceneTarget) as { __webglFramebuffer?: WebGLFramebuffer; __webglMultisampledFramebuffer?: WebGLFramebuffer };
      const bound = context.getParameter(context.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const drawFramebuffer = bound === null ? 'canvas' : bound === properties.__webglMultisampledFramebuffer ? 'scene-msaa'
        : bound === properties.__webglFramebuffer ? 'scene-resolve' : 'other';
      return {
        phase, colorMask: read(context.COLOR_WRITEMASK), depthMask: read(context.DEPTH_WRITEMASK),
        depthTest: read(context.DEPTH_TEST), depthFunc: read(context.DEPTH_FUNC), viewport: read(context.VIEWPORT),
        scissorTest: read(context.SCISSOR_TEST), scissor: read(context.SCISSOR_BOX), blend: read(context.BLEND),
        cull: read(context.CULL_FACE), cullMode: read(context.CULL_FACE_MODE), frontFace: read(context.FRONT_FACE),
        rasterizerDiscard: read(context.RASTERIZER_DISCARD),
        stencilTest: read(context.STENCIL_TEST), stencilFunc: read(context.STENCIL_FUNC), stencilRef: read(context.STENCIL_REF),
        stencilMask: read(context.STENCIL_VALUE_MASK), stencilWriteMask: read(context.STENCIL_WRITEMASK),
        drawFramebuffer,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      };
    } catch (error) { return { phase, error: String(error).slice(0, 120) }; }
  }

  // ---- the heal ladder ----
  /** A rung acted: it is the one a following healthy verdict credits. */
  function noteActed(name: RenderBlackWorldStep, t: number): void {
    lastStep = name;
    verdictsSinceAct = 0;
    if (incident) incident.lastStepAtMs = Math.round(t);
  }

  /** H1 again (a ladder waiting for a device rung, or one that ran out): invisible on a healthy frame. */
  function reassert(t: number): void {
    if (!incident) return;
    incident.repeats = (incident.repeats ?? 0) + 1;
    let changed = false;
    try { changed = healState(); } catch { /* the next verdict tries again */ }
    if (changed) noteActed('H1', t);
  }

  function step(t: number): void {
    if (!incident) return;
    failsSinceStep = 0;
    if (stepIndex >= 4) {
      // the ladder ran out: the state re-asserted again (H1 is invisible on a healthy frame), and the whole ladder once
      // more for the same incident only after the cooldown, its device rungs waiting from the new start
      if (t - ladderEndedAt < LADDER_COOLDOWN_MS) { reassert(t); return; }
      stepIndex = 0;
      ladderStartedAt = t;
    }
    // the context restore answers a GL-level black only: never a CPU signal, nor a non-finite value, which the
    // histories' reset (H2) is the cure for
    const cpuHealthy = (cpuBits & CPU_DECISIVE) === 0 && incident.class !== 'nan-history';
    while (stepIndex < 4) {
      const name = (['H1', 'H2', 'H3', 'H4'] as const)[stepIndex];
      const age = t - ladderStartedAt;
      if ((name === 'H3' && age < H3_AFTER_MS) || (name === 'H4' && cpuHealthy && age < H4_AFTER_MS)) {
        // too early for a device rung: the state again (invisible when healthy), the rung on a later failing verdict
        reassert(t);
        return;
      }
      stepIndex++;
      const atMs = Math.round(t);
      if (name === 'H4' && (!cpuHealthy || contextRestores > 0)) {
        incident.steps.push({ step: 'H4', atMs, note: !cpuHealthy
          ? (incident.class === 'nan-history' ? 'skipped: a non-finite value a context restore cannot fix'
            : 'skipped: a CPU signal a context restore cannot fix')
          : 'skipped: the page has had its context restore' });
        continue;
      }
      if (name === 'H3' && sceneTarget.samples === 0) {
        incident.steps.push({ step: 'H3', atMs, note: 'skipped: MSAA already off' });
        continue;
      }
      incident.steps.push({ step: name, atMs });
      let acted = true;
      try {
        if (name === 'H1') acted = healState();
        else if (name === 'H2') healTargets();
        else if (name === 'H3') healDevice();
        else healContext();
      } catch (error) {
        incident.steps[incident.steps.length - 1].note = `failed: ${String(error).slice(0, 80)}`;
      }
      console.warn(`[gl] black world heal ${name} (${incident.class})`);
      if (!acted) {
        // a GL-level black with every CPU signal healthy: nothing to re-assert, so the targets' rung acts at once
        incident.steps[incident.steps.length - 1].note = 'nothing to re-assert';
        continue;
      }
      noteActed(name, t);
      if (stepIndex >= 4) ladderEndedAt = t;
      return;
    }
    ladderEndedAt = t;
  }

  /** H1: the reveal's state again; nothing changes on a healthy frame. Returns whether anything was wrong. */
  function healState(): boolean {
    let changed = false;
    // the live rare warm first (its finally blocks restore what it hid)
    const rareBefore = host.__COMBAT_RARE_WARM_STEP ?? null;
    try { ports.combatWarm?.cancelRare?.(); } catch { /* a warm that cannot close finishes on its own */ }
    if (rareBefore !== null && (host.__COMBAT_RARE_WARM_STEP ?? null) === null) changed = true;
    const mask = revealMask | 1;
    if (camera.layers.mask !== mask) { camera.layers.mask = mask; changed = true; }
    if (!scene.visible) { scene.visible = true; changed = true; }
    if (scene.overrideMaterial !== null) { scene.overrideMaterial = null; changed = true; }
    if (!sceneAA.enabled || !post.aerial.enabled || !post.lateFx.enabled) {
      sceneAA.enabled = true;
      post.aerial.enabled = true;
      post.lateFx.enabled = true;
      changed = true;
    }
    const w = sceneTarget.width, h = sceneTarget.height, vp = sceneTarget.viewport, sc = sceneTarget.scissor;
    if (vp.x !== 0 || vp.y !== 0 || vp.z !== w || vp.w !== h) { vp.set(0, 0, w, h); changed = true; }
    if (sc.x !== 0 || sc.y !== 0 || sc.z !== w || sc.w !== h || sceneTarget.scissorTest) {
      sc.set(0, 0, w, h);
      sceneTarget.scissorTest = false;
      changed = true;
    }
    const world = worldGroup() ?? revealWorld;
    if (world) {
      if (world.parent !== scene) { scene.add(world); changed = true; }
      if (!world.visible) { world.visible = true; changed = true; }
    }
    for (const root of revealRoots) {
      if (root.parent === null) { scene.add(root); changed = true; }
      if (root.parent === scene && !root.visible) { root.visible = true; changed = true; }
    }
    return changed;
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

  /**
   * H3: the scene target without MSAA (the preset stays: round 2, eng D2, the old relief here dropped it one rung a
   * ladder, and a persistent black ratcheted a session to the floor preset).
   */
  function healDevice(): void {
    if (sceneTarget.samples === 0) return;
    // (round 3, eng E2) for this battle only: the next covered entry takes the preset's samples back, and the canvas
    // says what the scene target holds (post.msaaSamples reads the target itself)
    h3Lowered = { samples: sceneTarget.samples, preset: presetName() };
    sceneAA.setSamples(0);
    publishSamples();
  }

  function publishSamples(): void {
    const dataset = (renderer.domElement as { dataset?: DOMStringMap } | undefined)?.dataset;
    if (dataset) dataset.sceneMsaaSamples = String(sceneTarget.samples);
  }

  /** H3's MSAA back at a covered entry, unless a preset change since then set the samples itself. */
  function restoreSamples(): void {
    const lowered = h3Lowered;
    h3Lowered = null;
    if (!lowered || sceneTarget.samples !== 0 || presetName() !== lowered.preset) return;
    sceneAA.setSamples(lowered.samples);
    publishSamples();
  }

  /**
   * H4: a context lose/restore through the renderer's own recovery (contextRecovery.ts), once a page: the renderer's
   * loss record takes the graphics-recovery preset one rung down, the only preset change the guard ever causes.
   */
  function healContext(): void {
    const context = gl();
    const lose = context.getExtension('WEBGL_lose_context');
    if (!lose) return;
    contextRestores++;
    restoreAskedAt = now();
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
  const onContextLost = (): void => {
    pending = false; pendingDown = false; queryLit = queryNan = queryDown = null; queryContext = null; probeReady = false;
  };
  // the restored context links the probe's programs again (in parallel, as under a cover)
  const onContextRestored = (): void => { warmProbePrograms(); };
  // (eng D7) a page going away with an incident open reports it first: in the capture phase, ahead of the entry
  // telemetry's own pagehide / hidden flush, which then carries it
  const onPageHide = (): void => { if (incident && !incident.closed && !reported) endIncident('page', now()); };
  const onHiddenCapture = (): void => { if (typeof document !== 'undefined' && document.hidden) onPageHide(); };
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);
    document.addEventListener('pointerlockchange', onPointerLock);
    window.addEventListener('pagehide', onPageHide, true);
    document.addEventListener('visibilitychange', onHiddenCapture, true);
  }
  renderer.domElement?.addEventListener?.('webglcontextlost', onContextLost);
  renderer.domElement?.addEventListener?.('webglcontextrestored', onContextRestored);

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
  lateFx.render = guardedLateRender as typeof lateFx.render;
  post.render = guardedPostRender;
  if (gldiag) installGlDiag();

  const guard: BlackWorldGuard = {
    enabled: true,
    timing: false,
    resetTiming() { timed.fill(0); },
    onCoveredEntry(options) {
      // (eng D6) a chunk that arrives after the reveal never resets a presented frame's histories
      if (options?.covered !== false) { resetHistories(); restoreSamples(); }
      revealAt = -1;
      failStreak = 0;
      lastFailClass = null;
      if (incident && !incident.closed) endIncident('left', now());
      incident = null;
      ladderEndedAt = -Infinity;
      warmProbePrograms();
    },
    stats() {
      return { ...stats, enabled: guard.enabled, active, frame, cpuBits, failStreak, pending: !!pending,
        lastClass: lastFailClass, incident: incident && !incident.closed ? incident.class : null,
        lastLit: answer.anyLit, lastNan: answer.anyNan, lastDownLost: answer.downLost, probeReady,
        // (round 3) the guard's own cost while timing
        timedFrames: timed[1], selfCpuMsMean: timed[1] ? timed[0] / timed[1] : null, selfCpuMsMax: timed[2],
        timedProbes: timed[4], probeGpuMsMean: timed[4] ? timed[3] / timed[4] : null };
    },
    receipts,
    dispose() {
      if (sceneAA.render === (guardedSceneRender as unknown)) sceneAA.render = originalSceneRender;
      if (lateFx.render === (guardedLateRender as unknown)) lateFx.render = originalLateRender;
      if (post.render === guardedPostRender) post.render = originalPostRender;
      for (const restore of gldiagRestore.splice(0)) restore();
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.removeEventListener('focus', onResume);
        document.removeEventListener('visibilitychange', onResume);
        document.removeEventListener('pointerlockchange', onPointerLock);
        window.removeEventListener('pagehide', onPageHide, true);
        document.removeEventListener('visibilitychange', onHiddenCapture, true);
      }
      renderer.domElement?.removeEventListener?.('webglcontextlost', onContextLost);
      renderer.domElement?.removeEventListener?.('webglcontextrestored', onContextRestored);
      try {
        if (queryContext && !queryContext.isContextLost()) {
          for (const query of [queryLit, queryNan, queryDown]) if (query) queryContext.deleteQuery(query);
        }
      } catch { /* lost */ }
      queryLit = queryNan = queryDown = null; pending = false; pendingDown = false;
      probeGeometry.dispose(); probeLit.dispose(); probeNan.dispose(); probeCensus.dispose(); probeDown.dispose();
      probeNanCount.dispose();
      probeTarget.dispose(); probeDownTarget.dispose();
      guards.delete(renderer);
      if (host.__COT_BLACK_GUARD === guard) delete host.__COT_BLACK_GUARD;
    },
  };
  host.__COT_BLACK_GUARD = guard;
  // installed under a battle entry's cover: the probe's programs start linking now (onCoveredEntry asks again)
  warmProbePrograms();

  return {
    guard,
    update(next) {
      if (next.post !== post || next.renderer !== renderer) return;
      ports = { ...ports, ...next };
    },
  };
}

const _cssSize = new THREE.Vector2();
