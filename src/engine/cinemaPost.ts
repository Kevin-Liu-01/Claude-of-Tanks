/**
 * cinemaPost.ts — Scene Studio picture passes (media r5, 2026-10-01): the film-grade lens, HDR
 * highlights, display grade and finish that `__STUDIO.setPicture()` adds on top of the house
 * render (src/game/studioPicture.ts owns the schema, the looks and the camera physics).
 *
 * Nothing here runs outside Scene Studio and nothing runs while a stage is neutral: the stage's
 * pass is simply not in the composer. Inserted into post.ts' existing chain at runtime:
 *
 *   sceneAA → aerial → GTAO → lateFx → TAA → [LENS: depth of field] → bloom (strength/threshold
 *   hook) → sun shafts → lens flare (intensity hooks) → [HDR: highlights, exposure, white
 *   balance] → house OutputGradePass (ACES + sRGB + grade) → [GRADE: display grade] → SMAA →
 *   [FINISH: wraps FSR at native size, then CA / vignette / grain / letterbox]
 *
 * LENS — thin-lens depth of field gathered at half resolution from the scene depth. The signed
 * circle of confusion (negative = near field) comes from the Studio's lens state each frame, so
 * focus follows a moving actor. A 2×2 prefilter weights blurred texels over focused ones, a tile
 * max + 3×3 neighbourhood max dilates the near field so a blurred foreground spreads over the
 * focused subject, and the gather keeps two layers: the far layer only accepts samples whose CoC
 * (clamped to the centre's) covers the tap distance — a focused edge never bleeds into the blur
 * behind it and a blurred background never smears over a focused edge — and the near layer
 * accumulates foreground coverage with area (1/r²) weights for a physically shaped alpha. The
 * full-resolution composite upsamples the far layer bilaterally on CoC so focused silhouettes keep
 * their native pixels. Sky (device depth 1) is infinitely far. Transparent combat media are not
 * in the depth buffer: the late-FX layer is re-rendered at quarter resolution against depth planes
 * at 0.8 / 1.25 / 2 × the focus distance and its coverage binned, so an in-focus muzzle flash stays
 * sharp against the sky. Preview uses 4 rings (81 taps), capture 7 rings (225 taps). The
 * anamorphic option squeezes the aperture into a tall oval.
 *
 * HDR — after bloom, in linear light: exposure (stops) and an LMS white balance applied to the
 * frame and to the sun shafts / lens flare the house grade would otherwise add unexposed (the
 * pass adds them itself and zeroes the grade's light-target gate for that frame), anamorphic
 * horizontal streaks from a soft-thresholded half-resolution highlight buffer (Kawase-style
 * exponentially spaced passes on a quarter-height buffer), and halation: a red-orange film glow
 * from a separable gaussian of the same highlights.
 *
 * GRADE — display-referred, after the house tonemap/grade: lift/gamma/gain, a symmetric power
 * S-curve contrast around a pivot, filmic toe and shoulder, saturation and vibrance, monochrome
 * with a channel mix, and luminance-keyed split toning.
 *
 * FINISH — once per output frame at native resolution, after FSR: spectral radial chromatic
 * aberration, linear-light vignette, deterministic luma-weighted film grain (integer hash, seeded
 * by the Studio clock and scene seed) and letterbox mattes in whole pixels. Callable standalone
 * on any texture (`renderFinish`) and removable from the composer (`setFinishBypass`) so the film
 * renderer can accumulate sub-samples and finish the average once.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { PostRuntime } from './post.ts';
import type { LateFxSceneView } from './lateFxSceneView.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';

// --- engine-facing settings (studioPicture.ts derives them) -----------------------------------

interface CinemaLensFrame {
  /** Focus distance along the optical axis (m). */
  readonly focusM: number;
  /** Signed CoC diameter per unit of (1 − s/d), as a fraction of the frame height. */
  readonly cocScale: number;
}

export interface CinemaSettings {
  readonly lens: null | {
    readonly anamorphic: number;
    /** Max CoC radius as a fraction of the frame height. */
    readonly maxRadius: number;
  };
  readonly hdr: null | {
    readonly exposure: number;
    readonly whiteBalance: readonly number[];
    readonly streaks: null | { readonly amount: number; readonly threshold: number; readonly length: number; readonly tint: readonly number[] };
    readonly halation: null | { readonly amount: number; readonly threshold: number; readonly radius: number; readonly tint: readonly number[] };
  };
  readonly bloom: null | { readonly strength: number; readonly threshold: number };
  readonly lightFx: null | {
    readonly shafts: 'auto' | 'on' | 'off';
    readonly shaftsIntensity: number;
    readonly flare: 'auto' | 'on' | 'off';
    readonly flareIntensity: number;
  };
  readonly grade: null | {
    readonly lift: readonly number[];
    readonly gamma: readonly number[];
    readonly gain: readonly number[];
    readonly contrast: number;
    readonly pivot: number;
    readonly toe: number;
    readonly shoulder: number;
    readonly saturation: number;
    readonly vibrance: number;
    readonly mono: number;
    readonly monoMix: readonly number[];
    readonly shadowTint: readonly number[];
    readonly highlightTint: readonly number[];
    readonly splitBalance: number;
    /** Warms, greens, blues: [hue shift (deg), saturation scale, lightness]. */
    readonly bands: ReadonlyArray<readonly [number, number, number]>;
  };
  readonly finish: null | {
    readonly chromaticAberration: number;
    readonly vignette: readonly [number, number, number];
    readonly grain: readonly [number, number, number, number];
    /** Target aspect ratio for the matte (0 = none). */
    readonly letterbox: number;
  };
}

type CinemaQuality = 'preview' | 'capture';

interface CinemaProviders {
  /** Lens state for this frame (camera FOV/aspect and the focus target are read live). */
  lens(): CinemaLensFrame;
  /** Grain seed for this output frame (Studio clock + scene seed). */
  grainSeed(): number;
}

// --- shared GLSL ------------------------------------------------------------------------------

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const DEPTH_GLSL = /* glsl */ `
uniform float uNear;
uniform float uFar;
uniform float uFocusM;
uniform float uCocPx;       // CoC RADIUS in full-res px per unit of (1 - s/d)
uniform float uMaxCocPx;    // max radius (full-res px)
uniform sampler2D tFxNear;  // late-FX coverage in front of 0.8 × focus
uniform sampler2D tFxFocus; // ... in front of 1.25 × focus
uniform sampler2D tFxMid;   // ... in front of 2 × focus
uniform sampler2D tFxAll;   // ... in front of the opaque scene
uniform float uFxOn;
uniform float uFxNearCoc;   // CoC radius of the near bin's representative depth
uniform float uFxMidCoc;    // ... of the 1.25–2 × focus bin
uniform float uFxFarCoc;    // CoC radius at 2 × focus (the far bin's near edge)
float cinemaCoc( float depth ) {
  // device depth → distance along the view axis; the cleared sky (depth 1) is at infinity
  float invD = depth >= 0.999999 ? 0.0 : ( uFar - depth * ( uFar - uNear ) ) / ( uNear * uFar );
  return clamp( uCocPx * ( 1.0 - uFocusM * invD ), -uMaxCocPx, uMaxCocPx );
}
float fxCoverage( sampler2D t, vec2 uv ) {
  vec4 c = texture2D( t, uv );
  return 1.0 - exp( -( c.a + 0.6 * dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
}
// Transparent combat media are not in the depth buffer. Their coverage in front of three depth
// planes around the focus splits them into near / in-focus / mid / far bins, so an in-focus
// muzzle flash against the sky stays sharp instead of inheriting the sky's infinite distance.
float effectiveCoc( vec2 uv, float depth ) {
  float rc = cinemaCoc( depth );
  if ( uFxOn < 0.5 ) return rc;
  float allC = fxCoverage( tFxAll, uv );
  if ( allC < 0.02 ) return rc;
  float nearC = min( fxCoverage( tFxNear, uv ), allC );
  float focusC = clamp( fxCoverage( tFxFocus, uv ), nearC, allC );
  float midC = clamp( fxCoverage( tFxMid, uv ), focusC, allC );
  // far bin: between 2 × focus and the surface behind, halfway in CoC
  float farCoc = 0.5 * ( max( rc, uFxFarCoc ) + uFxFarCoc );
  float fxCoc = ( nearC * uFxNearCoc + ( midC - focusC ) * uFxMidCoc + ( allC - midC ) * farCoc ) / allC;
  return mix( rc, fxCoc, clamp( allC * 1.6, 0.0, 1.0 ) );
}`;

/** Concentric-ring disc kernel: ring i holds 8i taps at radius i/rings (uniform area density). */
function diskKernelGlsl(rings: number): string {
  const taps: string[] = [];
  for (let i = 1; i <= rings; i++) {
    const count = 8 * i;
    const r = i / rings;
    for (let j = 0; j < count; j++) {
      const a = ((j + (i % 2) * 0.5) / count) * Math.PI * 2 + i * 0.37;
      taps.push(`vec3(${(Math.cos(a) * r).toFixed(6)},${(Math.sin(a) * r).toFixed(6)},${r.toFixed(6)})`);
    }
  }
  return `const int KERNEL_N = ${taps.length};\nconst vec3 KERNEL[${taps.length}] = vec3[${taps.length}](\n${taps.join(',\n')}\n);`;
}

function halfTarget(name: string, count = 1, filter: THREE.MagnificationTextureFilter = THREE.LinearFilter): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, count,
    minFilter: filter, magFilter: filter,
  });
  target.textures.forEach((texture, i) => { texture.name = count > 1 ? `${name}.${i}` : name; texture.generateMipmaps = false; });
  return target;
}

function quadMaterial(
  name: string,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  glsl3 = false,
  defines: Record<string, string | number> = {},
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name, uniforms, vertexShader: QUAD_VERTEX, fragmentShader, defines,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    ...(glsl3 ? { glslVersion: THREE.GLSL3 } : {}),
  });
  return material;
}

function setTargetSize(target: THREE.WebGLRenderTarget, width: number, height: number): void {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  if (target.width !== w || target.height !== h) target.setSize(w, h);
}

// --- LENS: depth of field ---------------------------------------------------------------------

const DOF_PREFILTER = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
${DEPTH_GLSL}
varying vec2 vUv;
void main() {
  ivec2 full = textureSize( tColor, 0 ) - 1;
  ivec2 base = ivec2( gl_FragCoord.xy ) * 2;
  ivec2 p0 = min( base, full ), p1 = min( base + ivec2( 1, 0 ), full );
  ivec2 p2 = min( base + ivec2( 0, 1 ), full ), p3 = min( base + ivec2( 1, 1 ), full );
  vec3 c0 = texelFetch( tColor, p0, 0 ).rgb, c1 = texelFetch( tColor, p1, 0 ).rgb;
  vec3 c2 = texelFetch( tColor, p2, 0 ).rgb, c3 = texelFetch( tColor, p3, 0 ).rgb;
  vec4 r = vec4( effectiveCoc( vUv, texelFetch( tDepth, p0, 0 ).r ), effectiveCoc( vUv, texelFetch( tDepth, p1, 0 ).r ),
    effectiveCoc( vUv, texelFetch( tDepth, p2, 0 ).r ), effectiveCoc( vUv, texelFetch( tDepth, p3, 0 ).r ) );
  // blurred texels outweigh focused ones, so a focused silhouette cannot tint the blur layers
  vec4 w = clamp( abs( r ), 0.02, 1.0 );
  vec3 c = ( c0 * w.x + c1 * w.y + c2 * w.z + c3 * w.w ) / dot( w, vec4( 1.0 ) );
  float rMin = min( min( r.x, r.y ), min( r.z, r.w ) );
  float rMax = max( max( r.x, r.y ), max( r.z, r.w ) );
  gl_FragColor = vec4( c, -rMin > rMax ? rMin : rMax );
}`;

const DOF_TILE_MAX = /* glsl */ `
uniform sampler2D tPre;
uniform int uTile;
void main() {
  ivec2 size = textureSize( tPre, 0 ) - 1;
  ivec2 base = ivec2( gl_FragCoord.xy ) * uTile;
  float nearR = 0.0, farR = 0.0;
  for ( int y = 0; y < 64; y++ ) {
    if ( y >= uTile ) break;
    for ( int x = 0; x < 64; x++ ) {
      if ( x >= uTile ) break;
      float r = texelFetch( tPre, min( base + ivec2( x, y ), size ), 0 ).a;
      nearR = max( nearR, -r );
      farR = max( farR, r );
    }
  }
  gl_FragColor = vec4( nearR, farR, 0.0, 1.0 );
}`;

const DOF_NEIGHBOR_MAX = /* glsl */ `
uniform sampler2D tTile;
void main() {
  ivec2 size = textureSize( tTile, 0 ) - 1;
  ivec2 p = ivec2( gl_FragCoord.xy );
  vec2 m = vec2( 0.0 );
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ )
    m = max( m, texelFetch( tTile, clamp( p + ivec2( x, y ), ivec2( 0 ), size ), 0 ).rg );
  gl_FragColor = vec4( m, 0.0, 1.0 );
}`;

function dofGatherShader(rings: number): string {
  return /* glsl */ `
precision highp float;
uniform sampler2D tPre;
uniform sampler2D tNeighbor;
uniform vec2 uFullTexel;     // 1 / full-res size (offsets are authored in full-res px)
uniform float uSqueeze;      // anamorphic: horizontal aperture scale (1 = round)
in vec2 vUv;
layout( location = 0 ) out vec4 oFar;
layout( location = 1 ) out vec4 oNear;
${diskKernelGlsl(rings)}
void main() {
  vec4 centre = textureLod( tPre, vUv, 0.0 );
  float rc = centre.a;
  float nearMax = textureLod( tNeighbor, vUv, 0.0 ).r;
  float R = max( max( rc, 0.0 ), nearMax );
  if ( R < 0.5 ) {
    oFar = vec4( centre.rgb, rc );
    oNear = vec4( 0.0 );
    return;
  }
  float spacing = R / ${rings.toFixed(1)};
  float margin = max( 1.0, spacing * 1.15 );
  vec4 far = vec4( centre.rgb, 1.0 ) * ( rc >= -0.5 ? 1.0 : 0.0 );
  float nr0 = -rc;
  float nw0 = nr0 > 0.5 ? ( R * R ) / ( nr0 * nr0 ) : 0.0;
  vec4 near = vec4( centre.rgb * nw0, nw0 );
  for ( int k = 0; k < KERNEL_N; k++ ) {
    vec3 tap = KERNEL[ k ];
    vec2 off = tap.xy * R;
    off.x *= uSqueeze;
    vec4 s = textureLod( tPre, vUv + off * uFullTexel, 0.0 );
    float dist = tap.z * R;
    // far field: the sample's CoC, never wider than the centre's, must reach this pixel
    float bgR = max( min( rc, s.a ), 0.0 );
    float wf = clamp( ( bgR - dist + margin ) / margin, 0.0, 1.0 );
    far += vec4( s.rgb, 1.0 ) * wf;
    // near field: any foreground sample whose own CoC reaches this pixel, area-weighted
    float nr = -s.a;
    float wn = nr > 0.5 ? clamp( ( nr - dist + margin ) / margin, 0.0, 1.0 ) * ( R * R ) / ( nr * nr ) : 0.0;
    near += vec4( s.rgb * wn, wn );
  }
  oFar = vec4( far.rgb / max( far.a, 1e-4 ), rc );
  float alpha = clamp( near.a / float( KERNEL_N + 1 ), 0.0, 1.0 );
  oNear = vec4( near.a > 1e-5 ? near.rgb / near.a : vec3( 0.0 ), alpha );
}`;
}

/** 3×3 tent on both layers; far taps are weighted by CoC agreement so focused texels never spread. */
const DOF_POSTFILTER = /* glsl */ `
precision highp float;
uniform sampler2D tFar;
uniform sampler2D tNear;
uniform vec2 uTexel;
in vec2 vUv;
layout( location = 0 ) out vec4 oFar;
layout( location = 1 ) out vec4 oNear;
void main() {
  vec4 fc = textureLod( tFar, vUv, 0.0 );
  vec4 far = vec4( 0.0 ), near = vec4( 0.0 );
  float wsum = 0.0;
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 uv = vUv + vec2( float( x ), float( y ) ) * uTexel;
    float tent = ( x == 0 ? 2.0 : 1.0 ) * ( y == 0 ? 2.0 : 1.0 );
    vec4 f = textureLod( tFar, uv, 0.0 );
    float agree = fc.a > 0.5 ? clamp( 1.0 - abs( f.a - fc.a ) / max( fc.a, 1.0 ), 0.0, 1.0 ) : float( x == 0 && y == 0 );
    far += vec4( f.rgb, 1.0 ) * tent * agree;
    vec4 n = textureLod( tNear, uv, 0.0 );
    near += vec4( n.rgb * n.a, n.a ) * tent;
    wsum += tent;
  }
  oFar = vec4( far.a > 1e-4 ? far.rgb / far.a : fc.rgb, fc.a );
  oNear = vec4( near.a > 1e-5 ? near.rgb / near.a : vec3( 0.0 ), near.a / wsum );
}`;

const DOF_COMPOSITE = /* glsl */ `
uniform sampler2D tSharp;
uniform sampler2D tDepth;
uniform sampler2D tFar;
uniform sampler2D tNear;
uniform vec2 uHalfSize;
${DEPTH_GLSL}
varying vec2 vUv;
void main() {
  vec3 sharp = texture2D( tSharp, vUv ).rgb;
  float rc = effectiveCoc( vUv, texture2D( tDepth, vUv ).r );
  // bilateral 2×2 upsample of the far layer: texels whose CoC disagrees with this pixel lose weight
  vec2 hp = vUv * uHalfSize - 0.5;
  vec2 f = fract( hp );
  ivec2 i0 = ivec2( floor( hp ) );
  ivec2 hmax = ivec2( uHalfSize ) - 1;
  vec4 acc = vec4( 0.0 );
  for ( int y = 0; y <= 1; y++ ) for ( int x = 0; x <= 1; x++ ) {
    vec4 t = texelFetch( tFar, clamp( i0 + ivec2( x, y ), ivec2( 0 ), hmax ), 0 );
    float wb = ( x == 1 ? f.x : 1.0 - f.x ) * ( y == 1 ? f.y : 1.0 - f.y );
    float wc = 1.0 / ( 1.0 + abs( t.a - rc ) * 1.5 );
    acc += vec4( t.rgb, 1.0 ) * ( wb * wc + 1e-5 );
  }
  vec3 farC = acc.rgb / acc.a;
  vec3 col = mix( sharp, farC, smoothstep( 0.35, 1.6, rc ) );
  vec4 n = texture2D( tNear, vUv );
  float nearA = n.a;
  if ( n.a > 1e-4 ) nearA = max( nearA, smoothstep( 0.35, 1.6, -rc ) );
  col = mix( col, n.rgb, clamp( nearA, 0.0, 1.0 ) );
  gl_FragColor = vec4( col, 1.0 );
}`;

/** Depth planes (× focus distance) that split late-FX coverage into near / in focus / mid / far. */
const FX_SLICES = Object.freeze([0.8, 1.25, 2]);
/** Representative distances of the near and mid bins (× focus distance). */
const FX_NEAR_REPRESENTATIVE = 0.55;
const FX_MID_REPRESENTATIVE = 1.55;

const FX_DEPTH_PLANE = /* glsl */ `
uniform sampler2D tDepth;
uniform float uPlane;
varying vec2 vUv;
void main() {
  gl_FragDepth = min( texture2D( tDepth, vUv ).r, uPlane );
  gl_FragColor = vec4( 0.0 );
}`;

interface SoftParticleState {
  uSoftViewport: THREE.IUniform<THREE.Vector2>;
  isActive(): boolean;
}

const _savedViewport = new THREE.Vector2();
const _finishSize = new THREE.Vector2();
const _savedClear = new THREE.Color();

/**
 * Quarter-resolution coverage of the late-FX layer in front of three depth planes (near slice,
 * far slice, the opaque scene). Re-renders the same pooled FX with their own materials — no
 * shader is patched — against a depth buffer of min(scene depth, plane).
 */
class FxSlices {
  readonly targets: THREE.WebGLRenderTarget[];
  private readonly plane: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly view: LateFxSceneView;
  private readonly scene: THREE.Scene;
  private readonly lateFx: { softState: SoftParticleState | null; readonly renderSceneView: LateFxSceneView };

  constructor(scene: THREE.Scene, depth: THREE.DepthTexture, lateFx: { softState: SoftParticleState | null; readonly renderSceneView: LateFxSceneView }) {
    this.scene = scene;
    this.lateFx = lateFx;
    this.view = lateFx.renderSceneView; // the late-FX pass's view of this scene (post.ts)
    this.targets = ['near', 'focus', 'mid', 'all'].map((name) => {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
      target.texture.name = `Cinema.fxCoverage.${name}`;
      return target;
    });
    this.plane = new THREE.ShaderMaterial({
      name: 'Cinema.fxDepthPlane', vertexShader: QUAD_VERTEX, fragmentShader: FX_DEPTH_PLANE,
      uniforms: { tDepth: { value: depth }, uPlane: { value: 1 } },
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, colorWrite: false, toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.plane);
  }

  /** Render coverage; false when no late FX are alive (the lens then reads plain depth). */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, fullW: number, fullH: number, focusM: number): boolean {
    const soft = this.lateFx.softState;
    if (!soft || !soft.isActive()) return false;
    const w = Math.max(1, Math.ceil(fullW / 4)), h = Math.max(1, Math.ceil(fullH / 4));
    for (const target of this.targets) setTargetSize(target, w, h);
    const near = camera.near, far = camera.far;
    const deviceDepth = (z: number): number => THREE.MathUtils.clamp((far / (far - near)) * (1 - near / Math.max(near, z)), 0, 1);
    const planes = [...FX_SLICES.map((k) => deviceDepth(focusM * k)), 1];
    const scene = this.scene;
    const oldMask = camera.layers.mask;
    const oldBackground = scene.background;
    const oldAutoUpdate = scene.matrixWorldAutoUpdate;
    const oldAutoClear = renderer.autoClear;
    const oldViewport = _savedViewport.copy(soft.uSoftViewport.value);
    const oldClear = renderer.getClearColor(_savedClear);
    const oldAlpha = renderer.getClearAlpha();
    try {
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      soft.uSoftViewport.value.set(w, h);
      for (let i = 0; i < this.targets.length; i++) {
        renderer.setRenderTarget(this.targets[i]);
        renderer.clear(true, false, false);
        this.plane.uniforms.uPlane.value = planes[i];
        this.quad.render(renderer);
        camera.layers.set(LATE_FX_LAYER);
        scene.background = null;
        scene.matrixWorldAutoUpdate = false; // the frame's scene pass already updated every transform
        renderer.render(this.view.select(camera), camera);
        camera.layers.mask = oldMask;
        scene.background = oldBackground;
        scene.matrixWorldAutoUpdate = oldAutoUpdate;
      }
    } finally {
      camera.layers.mask = oldMask;
      scene.background = oldBackground;
      scene.matrixWorldAutoUpdate = oldAutoUpdate;
      soft.uSoftViewport.value.copy(oldViewport);
      renderer.autoClear = oldAutoClear;
      renderer.setClearColor(oldClear, oldAlpha);
    }
    return true;
  }

  dispose(): void {
    for (const target of this.targets) target.dispose();
    this.plane.dispose();
    this.quad.dispose();
  }
}

class CinemaLensPass extends Pass {
  private readonly pre = halfTarget('Cinema.dofPre');
  private readonly tile = halfTarget('Cinema.dofTile', 1, THREE.NearestFilter);
  private readonly neighbor = halfTarget('Cinema.dofNeighbor', 1, THREE.NearestFilter);
  private readonly gather = halfTarget('Cinema.dofGather', 2);
  private readonly filtered = halfTarget('Cinema.dofFiltered', 2);
  private readonly depthUniforms = {
    uNear: { value: 0.5 }, uFar: { value: 4000 }, uFocusM: { value: 20 }, uCocPx: { value: 0 }, uMaxCocPx: { value: 1 },
    tFxNear: { value: null as THREE.Texture | null }, tFxFocus: { value: null as THREE.Texture | null },
    tFxMid: { value: null as THREE.Texture | null }, tFxAll: { value: null as THREE.Texture | null },
    uFxOn: { value: 0 }, uFxNearCoc: { value: 0 }, uFxMidCoc: { value: 0 }, uFxFarCoc: { value: 0 },
  };
  private readonly fx: FxSlices;
  private readonly prefilter: THREE.ShaderMaterial;
  private readonly tileMax: THREE.ShaderMaterial;
  private readonly neighborMax: THREE.ShaderMaterial;
  private readonly gatherMaterials: Record<CinemaQuality, THREE.ShaderMaterial>;
  private readonly postfilter: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private fullW = 1;
  private fullH = 1;
  quality: CinemaQuality = 'preview';
  anamorphic = 0;
  maxRadius = 0.028;
  lastFrame: CinemaLensFrame = { focusM: 20, cocScale: 0 };
  private readonly camera: THREE.PerspectiveCamera;
  private readonly provider: () => CinemaLensFrame;

  constructor(
    camera: THREE.PerspectiveCamera,
    depth: THREE.DepthTexture,
    provider: () => CinemaLensFrame,
    scene: THREE.Scene,
    lateFx: { softState: SoftParticleState | null; readonly renderSceneView: LateFxSceneView },
  ) {
    super();
    this.camera = camera;
    this.provider = provider;
    this.needsSwap = true;
    this.fx = new FxSlices(scene, depth, lateFx);
    const d = this.depthUniforms;
    d.tFxNear.value = this.fx.targets[0].texture;
    d.tFxFocus.value = this.fx.targets[1].texture;
    d.tFxMid.value = this.fx.targets[2].texture;
    d.tFxAll.value = this.fx.targets[3].texture;
    this.prefilter = quadMaterial('Cinema.dofPrefilter', DOF_PREFILTER, { tColor: { value: null }, tDepth: { value: depth }, ...d });
    this.tileMax = quadMaterial('Cinema.dofTileMax', DOF_TILE_MAX, { tPre: { value: this.pre.texture }, uTile: { value: 8 } });
    this.neighborMax = quadMaterial('Cinema.dofNeighborMax', DOF_NEIGHBOR_MAX, { tTile: { value: this.tile.texture } });
    const gatherUniforms = (): Record<string, THREE.IUniform> => ({
      tPre: { value: this.pre.texture }, tNeighbor: { value: this.neighbor.texture },
      uFullTexel: { value: new THREE.Vector2(1, 1) }, uSqueeze: { value: 1 },
    });
    this.gatherMaterials = {
      preview: quadMaterial('Cinema.dofGather.preview', dofGatherShader(4), gatherUniforms(), true),
      capture: quadMaterial('Cinema.dofGather.capture', dofGatherShader(7), gatherUniforms(), true),
    };
    this.postfilter = quadMaterial('Cinema.dofPostfilter', DOF_POSTFILTER, {
      tFar: { value: this.gather.textures[0] }, tNear: { value: this.gather.textures[1] }, uTexel: { value: new THREE.Vector2(1, 1) },
    }, true);
    this.composite = quadMaterial('Cinema.dofComposite', DOF_COMPOSITE, {
      tSharp: { value: null }, tDepth: { value: depth }, tFar: { value: this.filtered.textures[0] },
      tNear: { value: this.filtered.textures[1] }, uHalfSize: { value: new THREE.Vector2(1, 1) }, ...d,
    });
  }

  setSize(width: number, height: number): void {
    this.fullW = Math.max(1, Math.round(width));
    this.fullH = Math.max(1, Math.round(height));
    const hw = Math.ceil(this.fullW / 2), hh = Math.ceil(this.fullH / 2);
    for (const target of [this.pre, this.gather, this.filtered]) setTargetSize(target, hw, hh);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const fullW = readBuffer.width, fullH = readBuffer.height;
    if (fullW !== this.fullW || fullH !== this.fullH) this.setSize(fullW, fullH);
    const halfW = this.pre.width, halfH = this.pre.height;
    const frame = this.provider();
    this.lastFrame = frame;
    const d = this.depthUniforms;
    d.uNear.value = this.camera.near;
    d.uFar.value = this.camera.far;
    d.uFocusM.value = frame.focusM;
    d.uCocPx.value = 0.5 * frame.cocScale * fullH;
    const maxR = Math.max(1, this.maxRadius * fullH);
    d.uMaxCocPx.value = maxR;
    // tiles cover at least the largest near radius so a 3×3 neighbourhood reaches every source
    const tileHalf = THREE.MathUtils.clamp(Math.ceil(maxR / 2), 4, 64);
    setTargetSize(this.tile, Math.ceil(halfW / tileHalf), Math.ceil(halfH / tileHalf));
    setTargetSize(this.neighbor, this.tile.width, this.tile.height);
    this.tileMax.uniforms.uTile.value = tileHalf;
    d.uFxOn.value = this.fx.render(renderer, this.camera, fullW, fullH, frame.focusM) ? 1 : 0;
    const binCoc = (k: number): number => THREE.MathUtils.clamp(d.uCocPx.value * (1 - 1 / k), -maxR, maxR);
    d.uFxNearCoc.value = binCoc(FX_NEAR_REPRESENTATIVE);
    d.uFxMidCoc.value = binCoc(FX_MID_REPRESENTATIVE);
    d.uFxFarCoc.value = binCoc(FX_SLICES[2]);

    const quad = this.quad;
    this.prefilter.uniforms.tColor.value = readBuffer.texture;
    quad.material = this.prefilter;
    renderer.setRenderTarget(this.pre);
    quad.render(renderer);
    quad.material = this.tileMax;
    renderer.setRenderTarget(this.tile);
    quad.render(renderer);
    quad.material = this.neighborMax;
    renderer.setRenderTarget(this.neighbor);
    quad.render(renderer);

    const gather = this.gatherMaterials[this.quality];
    gather.uniforms.uFullTexel.value.set(1 / fullW, 1 / fullH);
    gather.uniforms.uSqueeze.value = 1 - 0.5 * this.anamorphic;
    quad.material = gather;
    renderer.setRenderTarget(this.gather);
    quad.render(renderer);
    this.postfilter.uniforms.uTexel.value.set(1 / halfW, 1 / halfH);
    quad.material = this.postfilter;
    renderer.setRenderTarget(this.filtered);
    quad.render(renderer);

    this.composite.uniforms.tSharp.value = readBuffer.texture;
    this.composite.uniforms.uHalfSize.value.set(halfW, halfH);
    quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    quad.render(renderer);
  }

  dispose(): void {
    for (const target of [this.pre, this.tile, this.neighbor, this.gather, this.filtered]) target.dispose();
    this.fx.dispose();
    for (const material of [this.prefilter, this.tileMax, this.neighborMax, this.gatherMaterials.preview,
      this.gatherMaterials.capture, this.postfilter, this.composite]) material.dispose();
    this.quad.dispose();
  }
}

// --- HDR: highlights, exposure, white balance ------------------------------------------------

const HDR_COMMON = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tLight;
uniform float uLightOn;
uniform mat3 uWB;
uniform float uExposure;
vec3 cinemaExposed( vec2 uv ) {
  vec3 c = texture2D( tColor, uv ).rgb;
  if ( uLightOn > 0.5 ) c += texture2D( tLight, uv ).rgb;
  return max( uWB * c, vec3( 0.0 ) ) * uExposure;
}
vec3 cinemaKnee( vec3 c, float threshold ) {
  float br = max( max( c.r, c.g ), c.b );
  float knee = threshold * 0.5;
  float soft = clamp( br - threshold + knee, 0.0, 2.0 * knee );
  soft = soft * soft / ( 4.0 * knee + 1e-5 );
  return c * ( max( soft, br - threshold ) / max( br, 1e-5 ) );
}`;

const HDR_EXTRACT = /* glsl */ `
precision highp float;
${HDR_COMMON}
uniform float uHalThreshold;
uniform float uStreakThreshold;
uniform float uStreakClamp;
uniform float uHalClamp;
in vec2 vUv;
layout( location = 0 ) out vec4 oHal;
layout( location = 1 ) out vec4 oStreak;
// Flash-aware: a muzzle-flash or fireball core saturates the glow sources instead of dumping
// unbounded energy into them, so a night flash cannot white out the frame through its streak.
vec3 capEnergy( vec3 c, float cap ) {
  float m = max( max( c.r, c.g ), c.b );
  return m > cap ? c * ( cap / m ) : c;
}
void main() {
  vec3 c = cinemaExposed( vUv );   // bilinear 2×2 box at the half-res texel centre
  oHal = vec4( capEnergy( cinemaKnee( c, uHalThreshold ), uHalClamp ), 1.0 );
  oStreak = vec4( capEnergy( cinemaKnee( c, uStreakThreshold ), uStreakClamp ), 1.0 );
}`;

const GAUSS_TAPS = 24;
const HDR_GAUSS = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;           // texel step in uv
uniform float uWeights[ ${GAUSS_TAPS + 1} ];
uniform float uOffsets[ ${GAUSS_TAPS + 1} ];
uniform int uTaps;
varying vec2 vUv;
void main() {
  vec3 acc = texture2D( tSrc, vUv ).rgb * uWeights[ 0 ];
  for ( int i = 1; i <= ${GAUSS_TAPS}; i++ ) {
    if ( i > uTaps ) break;
    vec2 o = uDir * uOffsets[ i ];
    acc += ( texture2D( tSrc, vUv + o ).rgb + texture2D( tSrc, vUv - o ).rgb ) * uWeights[ i ];
  }
  gl_FragColor = vec4( acc, 1.0 );
}`;

/**
 * Anamorphic streaks as a horizontal-only mip pyramid (after Keijiro Takahashi's KinoStreak):
 * every level halves the width with a 6-tap tent, the upsample chain mixes each level with the
 * wider one by `stretch`, so the streak keeps a sharp core and an exponentially long tail.
 */
const STREAK_DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSrcTexel;
uniform float uFirst;        // 1: the first level also halves the height (2-row box)
varying vec2 vUv;
vec3 tap( float u ) {
  vec2 uv = vec2( u, vUv.y );
  if ( uFirst > 0.5 ) return 0.5 * ( texture2D( tSrc, uv + vec2( 0.0, 0.5 * uSrcTexel.y ) ).rgb + texture2D( tSrc, uv - vec2( 0.0, 0.5 * uSrcTexel.y ) ).rgb );
  return texture2D( tSrc, uv ).rgb;
}
void main() {
  float dx = uSrcTexel.x;
  vec3 c = tap( vUv.x - 5.0 * dx ) + 2.0 * tap( vUv.x - 3.0 * dx ) + 3.0 * tap( vUv.x - dx )
    + 3.0 * tap( vUv.x + dx ) + 2.0 * tap( vUv.x + 3.0 * dx ) + tap( vUv.x + 5.0 * dx );
  gl_FragColor = vec4( c / 12.0, 1.0 );
}`;

const STREAK_UP = /* glsl */ `
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uLowTexel;
uniform float uStretch;
varying vec2 vUv;
void main() {
  float dx = uLowTexel.x * 1.5;
  vec3 low = texture2D( tLow, vUv - vec2( dx, 0.0 ) ).rgb * 0.25 + texture2D( tLow, vUv ).rgb * 0.5
    + texture2D( tLow, vUv + vec2( dx, 0.0 ) ).rgb * 0.25;
  gl_FragColor = vec4( mix( texture2D( tHigh, vUv ).rgb, low, uStretch ), 1.0 );
}`;

const HDR_COMPOSITE = /* glsl */ `
${HDR_COMMON}
uniform sampler2D tHal;
uniform sampler2D tStreak;
uniform vec3 uHalTint;
uniform float uHalAmount;
uniform vec3 uStreakTint;
uniform float uStreakAmount;
varying vec2 vUv;
const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );
void main() {
  vec3 c = cinemaExposed( vUv );
  if ( uHalAmount > 0.0 ) {
    vec3 h = texture2D( tHal, vUv ).rgb;
    c += mix( vec3( dot( h, LUMA ) ), h, 0.25 ) * uHalTint * uHalAmount;
  }
  if ( uStreakAmount > 0.0 ) {
    vec3 s = texture2D( tStreak, vUv ).rgb;
    c += mix( vec3( dot( s, LUMA ) ), s, 0.3 ) * uStreakTint * uStreakAmount;
  }
  gl_FragColor = vec4( c, 1.0 );
}`;

const STREAK_MAX_LEVELS = 10;

class CinemaHdrPass extends Pass {
  private readonly extract = halfTarget('Cinema.hdrExtract', 2);
  private readonly halPing = halfTarget('Cinema.halationPing');
  private readonly halPong = halfTarget('Cinema.halationPong');
  private readonly streakDown: THREE.WebGLRenderTarget[] = [];
  private readonly streakUp: THREE.WebGLRenderTarget[] = [];
  private readonly common = {
    tLight: { value: null as THREE.Texture | null }, uLightOn: { value: 0 },
    uWB: { value: new THREE.Matrix3() }, uExposure: { value: 1 },
  };
  private readonly extractMaterial: THREE.ShaderMaterial;
  private readonly gaussMaterial: THREE.ShaderMaterial;
  private readonly streakDownMaterial: THREE.ShaderMaterial;
  private readonly streakUpMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  settings: NonNullable<CinemaSettings['hdr']> | null = null;
  private readonly grade: THREE.ShaderMaterial;

  constructor(grade: THREE.ShaderMaterial) {
    super();
    this.grade = grade;
    this.needsSwap = true;
    this.extractMaterial = quadMaterial('Cinema.hdrExtract', HDR_EXTRACT, {
      tColor: { value: null }, ...this.common, uHalThreshold: { value: 1 }, uStreakThreshold: { value: 3 },
      uStreakClamp: { value: 8 }, uHalClamp: { value: 6 },
    }, true);
    this.gaussMaterial = quadMaterial('Cinema.halationBlur', HDR_GAUSS, {
      tSrc: { value: null }, uDir: { value: new THREE.Vector2() },
      uWeights: { value: new Array(GAUSS_TAPS + 1).fill(0) }, uOffsets: { value: new Array(GAUSS_TAPS + 1).fill(0) },
      uTaps: { value: 1 },
    });
    this.streakDownMaterial = quadMaterial('Cinema.streakDown', STREAK_DOWN, {
      tSrc: { value: null }, uSrcTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 },
    });
    this.streakUpMaterial = quadMaterial('Cinema.streakUp', STREAK_UP, {
      tLow: { value: null }, tHigh: { value: null }, uLowTexel: { value: new THREE.Vector2() }, uStretch: { value: 0.75 },
    });
    for (let i = 0; i < STREAK_MAX_LEVELS; i++) {
      this.streakDown.push(halfTarget(`Cinema.streakDown${i}`));
      this.streakUp.push(halfTarget(`Cinema.streakUp${i}`));
    }
    this.compositeMaterial = quadMaterial('Cinema.hdrComposite', HDR_COMPOSITE, {
      tColor: { value: null }, ...this.common, tHal: { value: this.halPong.texture }, tStreak: { value: null },
      uHalTint: { value: new THREE.Vector3(1, 0.36, 0.12) }, uHalAmount: { value: 0 },
      uStreakTint: { value: new THREE.Vector3(0.55, 0.72, 1) }, uStreakAmount: { value: 0 },
    });
  }

  setSize(width: number, height: number): void {
    const hw = Math.ceil(width / 2), hh = Math.ceil(height / 2);
    for (const target of [this.extract, this.halPing, this.halPong]) setTargetSize(target, hw, hh);
    // streak pyramid: quarter height throughout, width halving from W/2 down to ~16 texels
    let w = hw;
    for (let i = 0; i < STREAK_MAX_LEVELS; i++) {
      setTargetSize(this.streakDown[i], w, Math.ceil(hh / 2));
      setTargetSize(this.streakUp[i], w, Math.ceil(hh / 2));
      w = Math.max(1, Math.ceil(w / 2));
    }
  }

  private gaussian(sigmaTexels: number): void {
    // linear-sampling gaussian: pairs of discrete taps merged into one bilinear fetch
    const radius = Math.min(GAUSS_TAPS * 2, Math.ceil(sigmaTexels * 3));
    const discrete: number[] = [];
    for (let i = 0; i <= radius; i++) discrete.push(Math.exp(-(i * i) / (2 * sigmaTexels * sigmaTexels)));
    const total = discrete[0] + 2 * discrete.slice(1).reduce((a, b) => a + b, 0);
    const weights = this.gaussMaterial.uniforms.uWeights.value as number[];
    const offsets = this.gaussMaterial.uniforms.uOffsets.value as number[];
    weights.fill(0); offsets.fill(0);
    weights[0] = discrete[0] / total;
    let taps = 0;
    for (let i = 1; i <= radius; i += 2) {
      const w1 = discrete[i] / total, w2 = i + 1 <= radius ? discrete[i + 1] / total : 0;
      taps++;
      weights[taps] = w1 + w2;
      offsets[taps] = (i * w1 + (i + 1) * w2) / Math.max(1e-9, w1 + w2);
    }
    this.gaussMaterial.uniforms.uTaps.value = taps;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const s = this.settings;
    if (!s) return;
    if (this.extract.width !== Math.ceil(readBuffer.width / 2) || this.extract.height !== Math.ceil(readBuffer.height / 2)) {
      this.setSize(readBuffer.width, readBuffer.height);
    }
    // the house grade adds the sun shafts + flare before its tonemap; take them over (exposed)
    const gu = this.grade.uniforms;
    this.common.tLight.value = gu.tLightFx?.value ?? null;
    this.common.uLightOn.value = gu.uLightFx && gu.uLightFx.value > 0.5 && this.common.tLight.value ? 1 : 0;
    if (gu.uLightFx) gu.uLightFx.value = 0;
    const wb = s.whiteBalance;
    this.common.uWB.value.set(wb[0], wb[1], wb[2], wb[3], wb[4], wb[5], wb[6], wb[7], wb[8]);
    this.common.uExposure.value = s.exposure;
    const quad = this.quad;
    const cu = this.compositeMaterial.uniforms;
    cu.uHalAmount.value = s.halation ? s.halation.amount : 0;
    cu.uStreakAmount.value = s.streaks ? s.streaks.amount : 0;
    if (s.halation || s.streaks) {
      const eu = this.extractMaterial.uniforms;
      eu.tColor.value = readBuffer.texture;
      eu.uHalThreshold.value = s.halation ? s.halation.threshold : 1e4;
      eu.uStreakThreshold.value = s.streaks ? s.streaks.threshold : 1e4;
      quad.material = this.extractMaterial;
      renderer.setRenderTarget(this.extract);
      quad.render(renderer);
    }
    if (s.halation) {
      const h = s.halation;
      // radius 1 = a σ of 0.45 % of the frame height (≈ 4.9 px at 1080p), in half-res texels
      this.gaussian(Math.max(0.6, h.radius * 0.0045 * readBuffer.height * 0.5));
      const gu2 = this.gaussMaterial.uniforms;
      quad.material = this.gaussMaterial;
      gu2.tSrc.value = this.extract.textures[0];
      gu2.uDir.value.set(1 / this.halPing.width, 0);
      renderer.setRenderTarget(this.halPing);
      quad.render(renderer);
      gu2.tSrc.value = this.halPing.texture;
      gu2.uDir.value.set(0, 1 / this.halPing.height);
      renderer.setRenderTarget(this.halPong);
      quad.render(renderer);
      cu.uHalTint.value.set(h.tint[0], h.tint[1], h.tint[2]);
    }
    if (s.streaks) {
      const st = s.streaks;
      const du = this.streakDownMaterial.uniforms;
      quad.material = this.streakDownMaterial;
      let source: THREE.Texture = this.extract.textures[1];
      let srcW = this.extract.width, srcH = this.extract.height;
      let levels = 0;
      for (let i = 0; i < STREAK_MAX_LEVELS; i++) {
        const target = this.streakDown[i];
        if (i > 0 && target.width < 16) break;
        du.tSrc.value = source;
        du.uSrcTexel.value.set(1 / srcW, 1 / srcH);
        du.uFirst.value = i === 0 ? 1 : 0;
        renderer.setRenderTarget(target);
        quad.render(renderer);
        source = target.texture; srcW = target.width; srcH = target.height;
        levels = i + 1;
      }
      const uu = this.streakUpMaterial.uniforms;
      uu.uStretch.value = THREE.MathUtils.lerp(0.55, 0.92, st.length);
      quad.material = this.streakUpMaterial;
      let low: THREE.WebGLRenderTarget = this.streakDown[levels - 1];
      for (let i = levels - 2; i >= 0; i--) {
        uu.tLow.value = low.texture;
        uu.tHigh.value = this.streakDown[i].texture;
        uu.uLowTexel.value.set(1 / low.width, 1 / low.height);
        renderer.setRenderTarget(this.streakUp[i]);
        quad.render(renderer);
        low = this.streakUp[i];
      }
      cu.tStreak.value = low.texture;
      cu.uStreakTint.value.set(st.tint[0], st.tint[1], st.tint[2]);
    }
    cu.tColor.value = readBuffer.texture;
    quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    quad.render(renderer);
  }

  dispose(): void {
    for (const target of [this.extract, this.halPing, this.halPong, ...this.streakDown, ...this.streakUp]) target.dispose();
    for (const material of [this.extractMaterial, this.gaussMaterial, this.streakDownMaterial, this.streakUpMaterial,
      this.compositeMaterial]) material.dispose();
    this.quad.dispose();
  }
}

// --- GRADE: display-referred colour -----------------------------------------------------------

const GRADE_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 uLift;
uniform vec3 uGammaInv;
uniform vec3 uGain;
uniform float uContrast;
uniform float uPivot;
uniform float uToe;
uniform float uShoulder;
uniform float uSaturation;
uniform float uVibrance;
uniform float uMono;
uniform vec3 uMonoMix;
uniform vec3 uShadowTint;     // zero-luma chroma offsets × amount
uniform vec3 uHighlightTint;
uniform float uSplitBalance;
uniform vec3 uBands[ 3 ];     // warms / greens / blues: hue shift (rad), saturation, lightness
uniform float uBandsOn;
varying vec2 vUv;
const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );
// band centres / half widths on the RGB hue wheel (degrees → radians): orange, yellow-green, sky blue
const vec3 BAND_CENTRE = vec3( 32.0, 102.0, 212.0 ) * 0.0174533;
const vec3 BAND_HALF = vec3( 40.0, 48.0, 52.0 ) * 0.0174533;
vec3 rotateHue( vec3 c, float a ) {
  // Rodrigues rotation about the grey axis
  const vec3 k = vec3( 0.57735027 );
  float cs = cos( a ), sn = sin( a );
  return c * cs + cross( k, c ) * sn + k * dot( k, c ) * ( 1.0 - cs );
}
vec3 bands( vec3 c ) {
  float mx = max( max( c.r, c.g ), c.b ), mn = min( min( c.r, c.g ), c.b );
  float chroma = mx - mn;
  if ( chroma < 0.01 ) return c;
  float hue = atan( 1.7320508 * ( c.g - c.b ), 2.0 * c.r - c.g - c.b );
  float gate = smoothstep( 0.02, 0.16, chroma );
  for ( int i = 0; i < 3; i++ ) {
    float dh = abs( mod( hue - BAND_CENTRE[ i ] + 3.14159265, 6.2831853 ) - 3.14159265 );
    float w = gate * ( 0.5 + 0.5 * cos( 3.14159265 * clamp( dh / BAND_HALF[ i ], 0.0, 1.0 ) ) );
    if ( w <= 0.0 ) continue;
    vec3 b = uBands[ i ];
    if ( b.x != 0.0 ) c = rotateHue( c, b.x * w );
    float l = dot( c, LUMA );
    c = l + ( c - l ) * ( 1.0 + ( b.y - 1.0 ) * w );
    c *= 1.0 + 0.6 * b.z * w;
  }
  return c;
}
vec3 contrastCurve( vec3 x ) {
  // symmetric power S-curve: continuous slope uContrast at the pivot, 0 → 0 and 1 → 1
  vec3 lo = uPivot * pow( max( x / uPivot, 0.0 ), vec3( uContrast ) );
  vec3 hi = 1.0 - ( 1.0 - uPivot ) * pow( max( ( 1.0 - x ) / ( 1.0 - uPivot ), 0.0 ), vec3( uContrast ) );
  return mix( lo, hi, step( uPivot, x ) );
}
vec3 toeCurve( vec3 x ) {
  if ( uToe > 0.0 ) {
    // filmic toe: darkens the bottom of the range, 1 stays 1
    const float a = 0.06;
    return x * pow( x / ( x + a ), vec3( uToe ) ) * pow( 1.0 + a, uToe );
  }
  // negative toe: matte/faded blacks
  return x + ( -uToe ) * 0.075 * pow( 1.0 - clamp( x, 0.0, 1.0 ), vec3( 3.0 ) );
}
vec3 shoulderCurve( vec3 x ) {
  // cubic Hermite from the knee (slope 1) to white; + softens, − hardens the top end
  float knee = 0.62 - 0.12 * max( uShoulder, 0.0 );
  float white = 1.0 - 0.035 * max( uShoulder, 0.0 );
  float topSlope = clamp( 1.0 - 0.95 * uShoulder, 0.05, 2.2 );
  vec3 u = clamp( ( x - knee ) / ( 1.0 - knee ), 0.0, 1.0 );
  vec3 u2 = u * u, u3 = u2 * u;
  float span = 1.0 - knee;
  vec3 h = ( 2.0 * u3 - 3.0 * u2 + 1.0 ) * knee + ( u3 - 2.0 * u2 + u ) * span
    + ( -2.0 * u3 + 3.0 * u2 ) * white + ( u3 - u2 ) * span * topSlope;
  return mix( x, h, step( knee, x ) );
}
void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;
  c = max( ( c + uLift * ( 1.0 - c ) ) * uGain, 0.0 );
  c = pow( c, uGammaInv );
  if ( uContrast != 1.0 ) c = contrastCurve( clamp( c, 0.0, 1.0 ) );
  if ( uToe != 0.0 ) c = toeCurve( max( c, 0.0 ) );
  if ( uShoulder != 0.0 ) c = shoulderCurve( c );
  float l = dot( c, LUMA );
  float sat = uSaturation;
  if ( uVibrance != 0.0 ) {
    float mx = max( max( c.r, c.g ), c.b ), mn = min( min( c.r, c.g ), c.b );
    float chroma = ( mx - mn ) / max( mx, 1e-4 );
    sat *= 1.0 + uVibrance * ( 1.0 - chroma ) * ( 1.0 - chroma );
  }
  c = l + ( c - l ) * sat;
  if ( uBandsOn > 0.5 ) c = max( bands( c ), 0.0 );
  if ( uMono > 0.0 ) c = mix( c, vec3( dot( c, uMonoMix ) ), uMono );
  l = clamp( dot( c, LUMA ), 0.0, 1.0 );
  float bal = uSplitBalance * 0.25;
  float shadowW = 1.0 - smoothstep( 0.0, 0.62 + bal, l );
  float highW = smoothstep( 0.32 + bal, 1.0, l );
  c += uShadowTint * shadowW * smoothstep( 0.0, 0.08, l );
  c += uHighlightTint * highW;
  gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
}`;

class CinemaGradePass extends Pass {
  readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor() {
    super();
    this.needsSwap = true;
    this.material = quadMaterial('Cinema.grade', GRADE_FRAGMENT, {
      tDiffuse: { value: null }, uLift: { value: new THREE.Vector3() }, uGammaInv: { value: new THREE.Vector3(1, 1, 1) },
      uGain: { value: new THREE.Vector3(1, 1, 1) }, uContrast: { value: 1 }, uPivot: { value: 0.43 }, uToe: { value: 0 },
      uShoulder: { value: 0 }, uSaturation: { value: 1 }, uVibrance: { value: 0 }, uMono: { value: 0 },
      uMonoMix: { value: new THREE.Vector3(0.2126, 0.7152, 0.0722) }, uShadowTint: { value: new THREE.Vector3() },
      uHighlightTint: { value: new THREE.Vector3() }, uSplitBalance: { value: 0 },
      uBands: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] }, uBandsOn: { value: 0 },
    });
    this.quad = new FullScreenQuad(this.material);
  }

  apply(g: NonNullable<CinemaSettings['grade']>): void {
    const u = this.material.uniforms;
    u.uLift.value.set(g.lift[0], g.lift[1], g.lift[2]);
    u.uGammaInv.value.set(1 / g.gamma[0], 1 / g.gamma[1], 1 / g.gamma[2]);
    u.uGain.value.set(g.gain[0], g.gain[1], g.gain[2]);
    u.uContrast.value = g.contrast;
    u.uPivot.value = g.pivot;
    u.uToe.value = g.toe;
    u.uShoulder.value = g.shoulder;
    u.uSaturation.value = g.saturation;
    u.uVibrance.value = g.vibrance;
    u.uMono.value = g.mono;
    u.uMonoMix.value.set(g.monoMix[0], g.monoMix[1], g.monoMix[2]);
    u.uShadowTint.value.set(g.shadowTint[0], g.shadowTint[1], g.shadowTint[2]);
    u.uHighlightTint.value.set(g.highlightTint[0], g.highlightTint[1], g.highlightTint[2]);
    u.uSplitBalance.value = g.splitBalance;
    let bandsOn = 0;
    g.bands.forEach((band, i) => {
      (u.uBands.value as THREE.Vector3[])[i].set(band[0] * Math.PI / 180, band[1], band[2]);
      if (band[0] !== 0 || band[1] !== 1 || band[2] !== 0) bandsOn = 1;
    });
    u.uBandsOn.value = bandsOn;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}

// --- FINISH: chromatic aberration, vignette, grain, letterbox ---------------------------------

function finishShader(caTaps: number): string {
  return /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tColor;
uniform vec2 uSize;          // output px
uniform float uCA;           // corner displacement (fraction of the half diagonal)
uniform vec3 uVignette;      // amount, roundness, softness
uniform vec4 uGrain;         // amount, cell px, colour, response
uniform uint uSeed;
uniform vec2 uBars;          // matte px (x, y)
in vec2 vUv;
layout( location = 0 ) out vec4 oColor;
const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );
vec3 toLinear( vec3 c ) { return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) ); }
vec3 toDisplay( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
uint hash3( uvec3 v ) {
  // PCG-style integer mix: identical on every GPU, unlike fract(sin())
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x ^ v.y ^ v.z;
}
float latticeValue( ivec2 cell, uint channel ) {
  uint h = hash3( uvec3( uvec2( cell + 32768 ), uSeed ^ ( channel * 0x9E3779B9u ) ) );
  // triangular distribution (two uniforms): film grain is clumpy, not flat white noise
  float a = float( h & 0xFFFFu ) / 65535.0, b = float( h >> 16u ) / 65535.0;
  return a + b - 1.0;
}
float grainNoise( vec2 p, uint channel ) {
  vec2 i = floor( p );
  vec2 f = p - i;
  vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  ivec2 c = ivec2( i );
  float v00 = latticeValue( c, channel ), v10 = latticeValue( c + ivec2( 1, 0 ), channel );
  float v01 = latticeValue( c + ivec2( 0, 1 ), channel ), v11 = latticeValue( c + ivec2( 1, 1 ), channel );
  return mix( mix( v00, v10, u.x ), mix( v01, v11, u.x ), u.y );
}
vec3 spectral( float t ) {
  return clamp( vec3( 0.5 + 1.5 * t, 1.0 - 1.5 * abs( t ), 0.5 - 1.5 * t ), 0.0, 1.0 );
}
void main() {
  vec2 px = gl_FragCoord.xy;
  if ( px.y < uBars.y || px.y > uSize.y - uBars.y || px.x < uBars.x || px.x > uSize.x - uBars.x ) {
    oColor = vec4( 0.0, 0.0, 0.0, 1.0 );
    return;
  }
  float aspect = uSize.x / uSize.y;
  vec2 d = vUv - 0.5;
  vec2 dc = d * vec2( aspect, 1.0 );
  float r2 = dot( dc, dc ) / ( 0.25 * ( aspect * aspect + 1.0 ) );  // 1 at the frame corner
  vec3 col;
  if ( uCA > 0.0 ) {
    vec2 shift = d * uCA * r2 * 2.0;
    vec3 acc = vec3( 0.0 ), wsum = vec3( 0.0 );
    for ( int k = 0; k < ${caTaps}; k++ ) {
      float t = ( float( k ) + 0.5 ) / float( ${caTaps} ) * 2.0 - 1.0;
      vec3 w = spectral( t );
      acc += w * toLinear( texture( tColor, vUv + shift * t ).rgb );
      wsum += w;
    }
    col = acc / wsum;
  } else {
    col = toLinear( texture( tColor, vUv ).rgb );
  }
  if ( uVignette.x > 0.0 ) {
    vec2 shape = vec2( mix( 1.0, aspect, uVignette.y ), 1.0 );
    float rr = length( d * shape ) / length( 0.5 * shape );
    float start = mix( 0.72, 0.18, uVignette.z );
    float end = mix( 1.05, 1.45, uVignette.z );
    float fall = smoothstep( start, end, rr );
    // in stops, like a lens wide open: amount 0.3 ≈ 0.9 stop at the corners, 1 ≈ 3 stops
    col *= exp2( -uVignette.x * 3.2 * fall * ( 2.0 - fall ) );
  }
  col = toDisplay( max( col, 0.0 ) );
  if ( uGrain.x > 0.0 ) {
    vec2 gp = px / uGrain.y;
    float n = grainNoise( gp, 0u ) + 0.5 * grainNoise( gp * 2.03 + 17.31, 3u );
    vec3 g = vec3( n );
    if ( uGrain.z > 0.0 ) {
      vec3 nc = vec3( grainNoise( gp + 41.7, 1u ), grainNoise( gp + 73.1, 2u ), grainNoise( gp + 11.9, 4u ) );
      g = mix( g, nc * 1.2, uGrain.z );
    }
    float l = clamp( dot( col, LUMA ), 0.0, 1.0 );
    float bell = 1.0 - pow( abs( l - 0.42 ) / 0.58, 2.0 );
    float resp = mix( 1.0, max( bell, 0.08 ), uGrain.w );
    col += g * uGrain.x * 0.26 * resp;   // amount 1 ≈ σ 0.08 display (heavy 16 mm), 0.1 ≈ 2 LSB
  }
  // interleaved-gradient dither before the 8-bit canvas
  float ign = fract( 52.9829189 * fract( dot( px, vec2( 0.06711056, 0.00583715 ) ) ) );
  col += ( ign - 0.5 ) / 255.0;
  oColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}`;
}

interface FinishFrame {
  readonly seed?: number;
}

class CinemaFinish {
  private readonly materials: Record<CinemaQuality, THREE.ShaderMaterial>;
  private readonly quad = new FullScreenQuad();
  private readonly uniforms = {
    tColor: { value: null as THREE.Texture | null }, uSize: { value: new THREE.Vector2(1, 1) }, uCA: { value: 0 },
    uVignette: { value: new THREE.Vector3() }, uGrain: { value: new THREE.Vector4() }, uSeed: { value: 0 },
    uBars: { value: new THREE.Vector2() },
  };
  settings: NonNullable<CinemaSettings['finish']> | null = null;
  quality: CinemaQuality = 'preview';

  constructor() {
    this.materials = {
      preview: quadMaterial('Cinema.finish.preview', finishShader(5), this.uniforms, true),
      capture: quadMaterial('Cinema.finish.capture', finishShader(12), this.uniforms, true),
    };
  }

  render(renderer: THREE.WebGLRenderer, input: THREE.Texture, target: THREE.WebGLRenderTarget | null, seed: number, width: number, height: number): void {
    const s = this.settings;
    const u = this.uniforms;
    u.tColor.value = input;
    u.uSize.value.set(width, height);
    u.uCA.value = s ? s.chromaticAberration * 0.012 : 0;
    u.uVignette.value.set(s ? s.vignette[0] : 0, s ? s.vignette[1] : 0.5, s ? s.vignette[2] : 0.5);
    // grain cell: `size` px at 1080 lines, scaled with the output so preview and 4K match
    u.uGrain.value.set(s ? s.grain[0] : 0, Math.max(0.75, (s ? s.grain[1] : 1) * height / 1080), s ? s.grain[2] : 0, s ? s.grain[3] : 0);
    u.uSeed.value = seed >>> 0;
    const bars = letterboxBars(s ? s.letterbox : 0, width, height);
    u.uBars.value.set(bars.x, bars.y);
    this.quad.material = this.materials[this.quality];
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.materials.preview.dispose();
    this.materials.capture.dispose();
    this.quad.dispose();
  }
}

/** Matte bars in whole pixels (same law as studioPicture.ts `pictureLetterboxBars`). */
export function letterboxBars(targetAspect: number, width: number, height: number): { x: number; y: number } {
  if (!(targetAspect > 0) || width <= 0 || height <= 0) return { x: 0, y: 0 };
  const aspect = width / height;
  if (Math.abs(aspect - targetAspect) < 1e-3) return { x: 0, y: 0 };
  if (targetAspect > aspect) return { x: 0, y: Math.round((height - width / targetAspect) / 2) };
  return { x: Math.round((width - height * targetAspect) / 2), y: 0 };
}

interface UpscalerLike extends Pass {
  readonly outputSize: THREE.Vector2;
}

/** Last pass: runs FSR into a native-size target, then the finish to the canvas. */
class CinemaFinishPass extends Pass {
  private readonly output = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  private readonly upscaler: UpscalerLike;
  private readonly finish: CinemaFinish;
  private readonly seed: () => number;

  constructor(upscaler: UpscalerLike, finish: CinemaFinish, seed: () => number) {
    super();
    this.upscaler = upscaler;
    this.finish = finish;
    this.seed = seed;
    this.needsSwap = false;
    this.output.texture.name = 'Cinema.finishInput';
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const w = this.upscaler.outputSize.x, h = this.upscaler.outputSize.y;
    setTargetSize(this.output, w, h);
    const toScreen = this.upscaler.renderToScreen;
    this.upscaler.renderToScreen = false;
    try {
      this.upscaler.render(renderer, this.output, readBuffer, 0, false);
    } finally {
      this.upscaler.renderToScreen = toScreen;
    }
    this.finish.render(renderer, this.output.texture, this.renderToScreen ? null : writeBuffer, this.seed(), w, h);
  }

  dispose(): void {
    this.output.dispose();
  }
}

// --- runtime --------------------------------------------------------------------------------------

export interface CinemaRuntime {
  /** Insert/remove/retune the stages for these settings (null = remove everything). */
  apply(settings: CinemaSettings | null): void;
  setQuality(quality: CinemaQuality): void;
  /** Film accumulation: keep the finish out of the composer (the canvas shows the pre-finish image). */
  setFinishBypass(bypass: boolean): void;
  /** Run the finish once on any texture (film lane), to a target or the canvas (null). */
  renderFinish(input: THREE.Texture, target: THREE.WebGLRenderTarget | null, frame?: FinishFrame): void;
  readonly lensFrame: CinemaLensFrame | null;
  readonly activeStages: readonly string[];
  dispose(): void;
}

type BloomRender = UnrealBloomPass['render'];

/**
 * Build the Studio picture runtime over the live post stack. Allocates nothing on the GPU until a
 * stage is first applied; `apply(null)` / `dispose()` restore the house chain exactly.
 */
export function createCinemaPost(
  post: PostRuntime,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  providers: CinemaProviders,
): CinemaRuntime {
  const composer = post.composer;
  const gradePass = composer.passes.find((pass) => (pass as Pass & { isOutputGradePass?: boolean }).isOutputGradePass) as
    (Pass & { material: THREE.ShaderMaterial & { uniforms: Record<string, THREE.IUniform> } }) | undefined;
  if (!gradePass) throw new Error('cinemaPost: house output grade pass not found');
  const depth = post.sceneAA.sceneTarget.depthTexture;
  if (!depth) throw new Error('cinemaPost: scene depth texture not found');
  const upscaler = post.upscaler as unknown as UpscalerLike;

  let lens: CinemaLensPass | null = null;
  let hdr: CinemaHdrPass | null = null;
  let grade: CinemaGradePass | null = null;
  let finish: CinemaFinish | null = null;
  let finishPass: CinemaFinishPass | null = null;
  let quality: CinemaQuality = 'preview';
  let finishBypass = false;
  let current: CinemaSettings | null = null;
  let bloomHooked = false;
  let lightHooked = false;
  let lightOverride = false;

  const insertBefore = (pass: Pass, anchor: Pass): void => {
    if (composer.passes.includes(pass)) return;
    const index = composer.passes.indexOf(anchor);
    if (index < 0) throw new Error('cinemaPost: anchor pass missing');
    composer.insertPass(pass, index);
  };
  const insertAfter = (pass: Pass, anchor: Pass): void => {
    if (composer.passes.includes(pass)) return;
    const index = composer.passes.indexOf(anchor);
    if (index < 0) throw new Error('cinemaPost: anchor pass missing');
    composer.insertPass(pass, index + 1);
  };
  const remove = (pass: Pass | null): void => { if (pass) composer.removePass(pass); };

  function hookBloom(on: boolean): void {
    const bloom = post.bloom as UnrealBloomPass & { render: BloomRender };
    if (on && !bloomHooked) {
      const original = Object.getPrototypeOf(bloom).render as BloomRender;
      bloom.render = function cinemaBloom(this: UnrealBloomPass, ...args: Parameters<BloomRender>) {
        const b = current?.bloom;
        const strength = this.strength, threshold = this.threshold;
        if (b) { this.strength = strength * b.strength; this.threshold = threshold * b.threshold; }
        try { original.apply(this, args); } finally { this.strength = strength; this.threshold = threshold; }
      };
      bloomHooked = true;
    } else if (!on && bloomHooked) {
      delete (bloom as { render?: BloomRender }).render;
      bloomHooked = false;
    }
  }

  function hookLightFx(on: boolean): void {
    const shafts = post.sunShafts as typeof post.sunShafts & { update: (active: boolean) => void };
    const flare = post.lensFlare as typeof post.lensFlare & { update: (active: boolean) => void };
    if (on && !lightHooked) {
      const shaftsUpdate = Object.getPrototypeOf(shafts).update as (active: boolean) => void;
      const flareUpdate = Object.getPrototypeOf(flare).update as (active: boolean) => void;
      shafts.update = (active: boolean): void => {
        shaftsUpdate.call(shafts, active);
        const l = current?.lightFx;
        if (l) shafts.strength *= l.shaftsIntensity;
      };
      flare.update = (active: boolean): void => {
        flareUpdate.call(flare, active);
        const l = current?.lightFx;
        if (l) flare.color.multiplyScalar(l.flareIntensity);
      };
      lightHooked = true;
    } else if (!on && lightHooked) {
      delete (shafts as { update?: unknown }).update;
      delete (flare as { update?: unknown }).update;
      lightHooked = false;
    }
    const l = on ? current?.lightFx : null;
    const overrides: Partial<{ sunShafts: boolean; lensFlare: boolean }> = {};
    if (l && l.shafts !== 'auto') overrides.sunShafts = l.shafts === 'on';
    if (l && l.flare !== 'auto') overrides.lensFlare = l.flare === 'on';
    if (Object.keys(overrides).length) {
      post.setLightFx(overrides);
      lightOverride = true;
    } else if (lightOverride) {
      post.setLightFx(null);
      lightOverride = false;
    }
  }

  function syncFinishPass(): void {
    const want = !!current?.finish && !finishBypass;
    if (want && finish) {
      finishPass ??= new CinemaFinishPass(upscaler, finish, providers.grainSeed);
      if (!composer.passes.includes(finishPass)) composer.addPass(finishPass);
      upscaler.enabled = false;
    } else {
      remove(finishPass);
      upscaler.enabled = true;
    }
  }

  const runtime: CinemaRuntime = {
    apply(settings) {
      current = settings;
      // LENS
      if (settings?.lens) {
        lens ??= new CinemaLensPass(camera, depth, providers.lens, post.lateFx.scene, post.lateFx);
        lens.quality = quality;
        lens.anamorphic = settings.lens.anamorphic;
        lens.maxRadius = settings.lens.maxRadius;
        insertBefore(lens, post.bloom);
      } else remove(lens);
      // HDR
      if (settings?.hdr) {
        hdr ??= new CinemaHdrPass(gradePass.material);
        hdr.settings = settings.hdr;
        insertBefore(hdr, gradePass);
      } else remove(hdr);
      // GRADE
      if (settings?.grade) {
        grade ??= new CinemaGradePass();
        grade.apply(settings.grade);
        insertAfter(grade, gradePass);
      } else remove(grade);
      // FINISH
      if (settings?.finish) {
        finish ??= new CinemaFinish();
        finish.quality = quality;
        finish.settings = settings.finish;
      }
      syncFinishPass();
      hookBloom(!!settings?.bloom);
      hookLightFx(!!settings?.lightFx);
    },
    setQuality(next) {
      quality = next;
      if (lens) lens.quality = next;
      if (finish) finish.quality = next;
    },
    setFinishBypass(bypass) {
      finishBypass = bypass;
      syncFinishPass();
    },
    renderFinish(input, target, frame = {}) {
      finish ??= new CinemaFinish();
      finish.quality = quality;
      if (!finish.settings && current?.finish) finish.settings = current.finish;
      const size = target ? _finishSize.set(target.width, target.height) : renderer.getDrawingBufferSize(_finishSize);
      const saved = finish.settings;
      if (!current?.finish) finish.settings = null;
      try {
        finish.render(renderer, input, target, frame.seed ?? providers.grainSeed(), size.x, size.y);
      } finally {
        finish.settings = saved;
      }
    },
    get lensFrame() { return lens && composer.passes.includes(lens) ? lens.lastFrame : null; },
    get activeStages() {
      const stages: string[] = [];
      if (lens && composer.passes.includes(lens)) stages.push('lens');
      if (current?.bloom) stages.push('bloom');
      if (current?.lightFx) stages.push('lightFx');
      if (hdr && composer.passes.includes(hdr)) stages.push('hdr');
      if (grade && composer.passes.includes(grade)) stages.push('grade');
      if (finishPass && composer.passes.includes(finishPass)) stages.push('finish');
      return stages;
    },
    dispose() {
      runtime.apply(null);
      lens?.dispose(); hdr?.dispose(); grade?.dispose(); finish?.dispose(); finishPass?.dispose();
      lens = null; hdr = null; grade = null; finish = null; finishPass = null;
    },
  };
  return runtime;
}
