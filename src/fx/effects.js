/**
 * effects.js — combat VFX orchestration (public Fx API, ARCHITECTURE §3.8.2).
 *
 * Muzzle flash (light + additive cards + smoke ring), per-type shell tracers,
 * impact effects by HitEvent.kind (spark fans, ricochet streaks, HE dirt
 * plumes, penetration flash, ERA pops), vehicle destruction (fireball, turret
 * pop, debris, persistent smoke column), track dust and engine exhaust.
 *
 * Dynamic light budget: exactly 2 pooled PointLights (muzzle 90 ms,
 * explosion 1.1 s). All randomness via seeded mulberry32; time only advances
 * through update(dt), so setFrozen() fully pins the frame for screenshots.
 */
import * as THREE from 'three';
import { createParticleSystem, mulberry32, makeFbm } from './particles.js';

// ---------------------------------------------------------------------------
// Tracer presets (shells-ballistics §10 — colors/widths verbatim)
// ---------------------------------------------------------------------------

// Widths boosted ~1.7x from the ballistic-scale values: tracers are core
// battlefield readability (WoT deliberately thickens them) and the thin r2
// ribbons were invisible in 60 fps frames.
const TRACER_PRESETS = {
  AP:     { core: 0xffd27a, glow: 0xff9030, width: 0.16 },
  APCR:   { core: 0xe8f4ff, glow: 0x9cc8ff, width: 0.11 },
  HEAT:   { core: 0xff6a3c, glow: 0xff3020, width: 0.19 },
  HE:     { core: 0xffb02e, glow: 0xffe080, width: 0.26 },
  HESH:   { core: 0xffc46b, glow: 0xffa040, width: 0.24 },
  APFSDS: { core: 0xc8ffd8, glow: 0x60ff90, width: 0.10 },
};
// Afterglow: a dying tracer streak lingers this long after the shell dies (or
// outruns the frame) so every 60 fps frame catches a readable line of flight.
// 0.2 (was 0.45): combined with the shorter tail below, a dead shell's streak
// is fully gone within ~200 ms — the r6 kill frame showed one persistent
// horizon-to-horizon incandescent rod crossing the whole valley.
const TRAIL_S = 0.2;

// Nominal muzzle velocities used ONLY by composeFiringMoment (m/s)
const COMPOSE_VELOCITY = { AP: 800, APCR: 1050, HEAT: 780, HE: 750, HESH: 780, APFSDS: 1700 };

const MAX_TRACERS = 96;
const MUZZLE_LIGHT_S = 0.12;   // long enough to still kiss the hull at the 50 ms composed frame
// 210 (was 1150): the 1150 peak stamped a ~20 m saturated yellow disc onto
// the terrain and whited out the bottom half of the scope (r6 "flashbang").
// 210 at range 11 (was 18) still reads a clear warm kick on barrel/glacis/
// ground inside ~5 m against the 4.5-intensity sun, then dies quadratically —
// a muzzle kiss, not a floodlight. Scoped view additionally attenuates the
// LIGHT (see spawnMuzzleFlash return), matching the geometry suppression.
const MUZZLE_LIGHT_PEAK = 210;
const MUZZLE_LIGHT_RANGE = 14; // lighting_post r3: rim the hull front, not just the road
// lighting_post r3: 1.1 s / pow-3 decay left the light at 9% of peak while
// the fireball sprites were at their VISUAL peak (composed ageS 0.6) — the
// scene read as "fire barely influences lighting". 1.6 s + pow 1.6 keeps a
// readable warm pool (~42% at 0.6 s) for the fireball's visible lifetime
// while the front-loaded punch survives (t=0 still peak).
const EXPLOSION_LIGHT_S = 1.6; // fireball glow lingers, lights the wreck at 0.6 s
// 250 with CUBIC decay (was 85 quadratic): 85 was too weak to sell the blast
// on the surrounding terrain in the first 400 ms (r6). The cubic curve front-
// loads the energy — at 0.15 s it is ~3x the old warm-up, while by 0.6 s
// (the composed frame) it is back to ~25, so the wreck albedo never cooks
// to flat emissive orange (the regression that drove the 190 -> 85 cut).
const EXPLOSION_LIGHT_PEAK = 250;
// 40 (was 30) + a 35 s smolder tail (r7: "battlefield shows no lasting
// evidence a tank just died" — WoT wrecks pump a column for 20 s+ and
// smolder for the rest of the match).
const SMOKE_COLUMN_S = 40;
const SMOKE_SMOLDER_S = 35;    // post-column ember/wisp stage on the wreck
const COLUMN_TICK_S = 0.11;    // emitter cadence — overlap keeps the column connected
// PERF: cap concurrent smoke-column emitters. Late battle every wreck runs a
// 30 s column at ~27 puffs/s of 6-10 m billboards; 5+ simultaneous columns is
// pure fill-rate pile-up at retina resolutions (measured 25-28 ms frames in
// the 60 s probe tail). 4 columns reads identically in battle — when a 5th
// kill lands, the column closest to burning out is retired early.
const MAX_COLUMNS = 4;

// ---------------------------------------------------------------------------
// Tracer shader (instanced stretched additive ribbon, camera-facing)
// ---------------------------------------------------------------------------

const TRACER_VERT = `
attribute vec4 aA;     // tail.xyz, width
attribute vec4 aB;     // head.xyz, brightness
attribute vec3 aCore;
attribute vec3 aGlow;
varying vec2 vUv;
varying vec3 vCore;
varying vec3 vGlow;
varying float vBright;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
uniform vec2 uNearFade;
void main() {
  vUv = uv; vCore = aCore; vGlow = aGlow; vBright = aB.w;
  if ( aB.w <= 0.0 ) {
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  vec3 axisRaw = aB.xyz - aA.xyz;
  float len = max( length( axisRaw ), 1e-4 );
  vec3 axis = axisRaw / len;
  vec3 wpos = mix( aA.xyz, aB.xyz, position.x + 0.5 );
  // lens fade: a ribbon segment right at the eye (own shot leaving the scope)
  // must not flood the frame — fade the vertex's brightness in close
  vBright *= smoothstep( uNearFade.x, uNearFade.y, distance( wpos, cameraPosition ) );
  vec3 viewDir = normalize( cameraPosition - wpos );
  vec3 side = cross( axis, viewDir );
  float sl = length( side );
  side = sl > 1e-4 ? side / sl : vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  wpos += side * position.y * aA.w * 6.0;   // ribbon spans core + glow halo
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

const TRACER_FRAG = `
varying vec2 vUv;
varying vec3 vCore;
varying vec3 vGlow;
varying float vBright;
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying float vFogDepth;
#endif
void main() {
  float d = abs( vUv.y * 2.0 - 1.0 );
  float core = smoothstep( 0.22, 0.0, d );
  float glow = pow( max( 1.0 - d, 0.0 ), 2.4 );
  float head = pow( vUv.x, 1.6 );                 // bright at shell, tapered tail
  float a = ( core + glow * 0.5 ) * head * vBright;
  if ( a < 0.004 ) discard;
  #ifdef USE_FOG
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #else
    float fogFactor = 0.0;
  #endif
  vec3 col = ( vCore * core * 5.0 + vGlow * glow * 1.4 ) * head * vBright;
  gl_FragColor = vec4( col * ( 1.0 - fogFactor ), a );
}
`;

// ---------------------------------------------------------------------------
// Module-scope scratch (reused — no per-frame allocation)
// ---------------------------------------------------------------------------

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _camV = new THREE.Vector3(); // camera-relative scratch (never aliased by callers)
const _sv = new THREE.Vector3();     // recipe-internal scratch (never an argument carrier)
const _UP = new THREE.Vector3(0, 1, 0);  // read-only
const _c0 = new THREE.Color();

/** Build an orthonormal basis (outU, outV) perpendicular to unit dir. */
function basisFrom(dir, outU, outV) {
  if (Math.abs(dir.y) < 0.94) outU.set(0, 1, 0);
  else outU.set(1, 0, 0);
  outU.crossVectors(outU, dir).normalize();
  outV.crossVectors(dir, outU).normalize();
}

function col3(hex, out) {
  _c0.setHex(hex);
  out[0] = _c0.r; out[1] = _c0.g; out[2] = _c0.b;
  return out;
}

/**
 * Scorch decal texture: charred black core, sooty radial streaks, irregular
 * bitten rim. RGB near-black, alpha carries the shape.
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeScorchTexture(rng) {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(4,3,3,0.94)');
  g.addColorStop(0.30, 'rgba(9,7,6,0.82)');
  g.addColorStop(0.62, 'rgba(14,11,9,0.38)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // radial soot rays
  for (let i = 0; i < 24; i++) {
    const a = rng() * Math.PI * 2;
    const len = (0.34 + rng() * 0.5) * c;
    const w = (0.03 + rng() * 0.05) * c;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const sg = ctx.createRadialGradient(len * 0.9, 0, 0, len * 0.9, 0, len);
    sg.addColorStop(0, 'rgba(6,5,4,0.5)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(len * 0.9, 0, len, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // irregular rim bite-outs
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const d = (0.55 + rng() * 0.45) * c;
    const bx = c + Math.cos(a) * d;
    const by = c + Math.sin(a) * d;
    const r = (0.07 + rng() * 0.15) * c;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    bg.addColorStop(0, 'rgba(0,0,0,0.85)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Dust-pressure annulus for the expanding shockwave ring: a translucent band
 * with a feathered (never hard) inner edge, radial streak stretching, and
 * fbm-eroded alpha so it reads as a torn dust wave, not solid geometry.
 * Alpha-only payload (RGB white — material color supplies the dirt tint).
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeShockRingTexture(rng) {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  // soft band: wide feathered shoulders on BOTH edges (the r5 hard inner
  // edge is what made the ring read as a whipped-cream torus)
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.40, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.80, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.34)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // radial streak stretching: dust dragged outward by the pressure front
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 42; i++) {
    const a = rng() * Math.PI * 2;
    const r0 = (0.42 + rng() * 0.26) * c;
    const len = (0.26 + rng() * 0.34) * c;
    const w = (0.014 + rng() * 0.035) * c;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const sg = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.55, `rgba(255,255,255,${0.22 + rng() * 0.25})`);
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(r0, -w, len, w * 2);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  // fbm erosion: bite the band apart so no arc is a continuous solid
  const fbm = makeFbm(rng);
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = fbm(x / s * 2.3, y / s * 2.3);
      const m = Math.max(0, Math.min(1, n * 2.0 - 0.35));
      d[(y * s + x) * 4 + 3] = Math.min(255, d[(y * s + x) * 4 + 3] * m);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Preallocated emit-option scratch objects (mutated per emit call)
const _puffO = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 2, rot: 0, rotVel: 0, col0: [0, 0, 0], col1: [0, 0, 0], alpha: 1, grav: 0, birthOffset: 0 };
const _strkO = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.02, grav: -21.6, col: [0, 0, 0], alpha: 1, seed: 0, birthOffset: 0 };
const _debO = { pos: [0, 0, 0], vel: [0, 0, 0], life: 4, axis: [0, 1, 0], spin: 5, scale: 0.2, groundY: 0, hot: false, seed: 0, birthOffset: 0 };
const _jetO = { pos: [0, 0, 0], axis: [0, 0, 1], life: 0.1, width: 0.4, len0: 0.4, len1: 2.5, seed: 0, col: [0, 0, 0], alpha: 1, birthOffset: 0 };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the combat VFX controller.
 * @param {object} engineCtx render-side dependency bundle (ARCHITECTURE §2.8)
 * @param {object} heightField terrain height query (ARCHITECTURE §2.7)
 * @param {{ seed?: number }} [opts] fx seed (default 5000 per §1.4)
 * @returns {object} Fx per ARCHITECTURE §3.8.2
 */
export function createFx(engineCtx, heightField, { seed = 5000 } = {}) {
  const particles = createParticleSystem(engineCtx, { seed });
  const group = new THREE.Group();
  group.name = 'fx';
  group.matrixAutoUpdate = false;
  group.add(particles.group);

  let rng = mulberry32(seed);
  let frozen = false;

  // --- dynamic lights (budget: exactly 2 PointLights) -----------------------
  // Muzzle: warm white-amber (was deep orange — the "saturated ground decal"
  // read); tighter range so it kisses the hull rather than floods the field.
  const muzzleLight = new THREE.PointLight(0xffd9a8, 0, MUZZLE_LIGHT_RANGE, 2);
  const explosionLight = new THREE.PointLight(0xffb27a, 0, 26, 2);
  muzzleLight.castShadow = false;
  explosionLight.castShadow = false;
  group.add(muzzleLight, explosionLight);
  // pow: temporal decay exponent — explosion uses 3 (front-loaded punch that
  // collapses fast, see EXPLOSION_LIGHT_PEAK note), muzzle keeps 2.
  const lightStates = [
    { light: muzzleLight, age: Infinity, dur: MUZZLE_LIGHT_S, peak: MUZZLE_LIGHT_PEAK, pow: 2 },
    { light: explosionLight, age: Infinity, dur: EXPLOSION_LIGHT_S, peak: EXPLOSION_LIGHT_PEAK, pow: 1.6 },
  ];

  function applyLight(state) {
    const k = Math.max(0, 1 - state.age / state.dur);
    state.light.intensity = state.peak * Math.pow(k, state.pow || 2);
  }

  function flashLight(state, pos, peak, ageS = 0) {
    state.light.position.copy(pos);
    state.age = ageS;
    state.peak = peak;
    applyLight(state);
  }

  // --- tracer instanced mesh -------------------------------------------------
  const tracerGeo = new THREE.InstancedBufferGeometry();
  tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  tracerGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  tracerGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const trA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 4), 4);
  const trB = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 4), 4);
  const trCore = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
  const trGlow = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
  for (const a of [trA, trB, trCore, trGlow]) a.setUsage(THREE.DynamicDrawUsage);
  tracerGeo.setAttribute('aA', trA);
  tracerGeo.setAttribute('aB', trB);
  tracerGeo.setAttribute('aCore', trCore);
  tracerGeo.setAttribute('aGlow', trGlow);
  tracerGeo.instanceCount = 0;
  const tracerMat = new THREE.ShaderMaterial({
    vertexShader: TRACER_VERT,
    fragmentShader: TRACER_FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uNearFade: { value: new THREE.Vector2(1.0, 3.8) },
    }),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,   // ribbon winding flips with view direction
    fog: true,
  });
  const tracerMesh = new THREE.Mesh(tracerGeo, tracerMat);
  tracerMesh.frustumCulled = false;
  tracerMesh.matrixAutoUpdate = false;
  tracerMesh.renderOrder = 24;
  group.add(tracerMesh);

  // Static tracers (screenshot composers) survive per-frame rebuilds:
  // [ax,ay,az, bx,by,bz, width, bright, coreR,G,B, glowR,G,B] × N
  const staticTracers = [];
  // Afterglow trails: shellId -> { d: Float32Array(14), age, seen }
  const trails = new Map();
  const _trailCore = [0, 0, 0];
  const _trailGlow = [0, 0, 0];

  // --- scorch decals (pooled, persistent, slope-aligned) ---------------------
  const MAX_SCORCH = 8;
  const scorchTex = makeScorchTexture(mulberry32((seed ^ 0x9e3779) >>> 0));
  const scorchMat = new THREE.MeshBasicMaterial({
    map: scorchTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const scorchGeo = new THREE.CircleGeometry(1, 24);
  scorchGeo.rotateX(-Math.PI / 2); // face up
  const scorchMeshes = [];
  let scorchCursor = 0;
  for (let i = 0; i < MAX_SCORCH; i++) {
    const m = new THREE.Mesh(scorchGeo, scorchMat);
    m.visible = false;
    m.renderOrder = 2; // after terrain, before all particles
    group.add(m);
    scorchMeshes.push(m);
  }

  /** Stamp a charred-ground decal at (x, z), aligned to the terrain slope. */
  function spawnScorch(x, z, radius) {
    const m = scorchMeshes[scorchCursor];
    scorchCursor = (scorchCursor + 1) % MAX_SCORCH;
    const e = 1.6;
    _v4.set(
      -(groundY(x + e, z) - groundY(x - e, z)) / (2 * e),
      1,
      -(groundY(x, z + e) - groundY(x, z - e)) / (2 * e),
    ).normalize();
    m.position.set(x, groundY(x, z) + 0.06, z);
    m.quaternion.setFromUnitVectors(_UP, _v4);
    m.rotateY(rng() * Math.PI * 2);
    m.scale.setScalar(radius);
    m.visible = true;
  }

  // --- shockwave rings (pooled, ground-aligned, first ~400 ms of a blast) ----
  // Normal-blended dusty tint at low opacity: a translucent pressure/dust
  // wave skimming the grass — the r5 additive cream torus read as geometry.
  const SHOCK_DUR = 0.4;
  const shockTex = makeShockRingTexture(mulberry32((seed ^ 0x3c6ef3) >>> 0));
  const shockGeo = new THREE.CircleGeometry(1, 48);
  shockGeo.rotateX(-Math.PI / 2); // face up
  const shockRings = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockTex,
      color: 0x9a8d74,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const m = new THREE.Mesh(shockGeo, mat);
    m.visible = false;
    m.renderOrder = 20;
    group.add(m);
    shockRings.push({ mesh: m, mat, age: Infinity });
  }
  let shockCursor = 0;

  function applyShockRing(r) {
    const t = r.age / SHOCK_DUR;
    if (t >= 1) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    const k = 1 - Math.pow(1 - t, 2.4);         // fast launch, decelerating
    r.mesh.scale.setScalar(1.6 + 11.5 * k);
    r.mat.opacity = 0.30 * Math.pow(1 - t, 1.5);
    r.mesh.visible = true;
  }

  /** Launch a pressure ring expanding across the ground from (x, z). */
  function spawnShockRing(x, z, ageS = 0) {
    const r = shockRings[shockCursor];
    shockCursor = (shockCursor + 1) % shockRings.length;
    r.mesh.position.set(x, groundY(x, z) + 0.35, z);
    r.age = ageS;
    applyShockRing(r);
  }

  // --- muzzle shock rings (pooled, bore-axis aligned, first ~200 ms) ---------
  // Cheap "refraction ring" read: a soft additive annulus perpendicular to
  // the bore that expands away from the brake and fades fast.
  const MUZZLE_RING_DUR = 0.2;
  const muzzleRingGeo = new THREE.PlaneGeometry(2, 2);
  const muzzleRings = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockTex,
      color: 0xfff3dd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(muzzleRingGeo, mat);
    m.visible = false;
    m.renderOrder = 23;
    group.add(m);
    muzzleRings.push({ mesh: m, mat, age: Infinity, att: 1, dir: new THREE.Vector3(0, 0, 1), origin: new THREE.Vector3() });
  }
  let muzzleRingCursor = 0;
  const _Z = new THREE.Vector3(0, 0, 1); // read-only

  function applyMuzzleRing(r) {
    const t = r.age / MUZZLE_RING_DUR;
    if (t >= 1) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    const k = 1 - Math.pow(1 - t, 2.2);
    r.mesh.position.copy(r.origin).addScaledVector(r.dir, 0.25 + 1.7 * k);
    r.mesh.scale.setScalar(0.35 + 1.5 * k);
    // view-angle fade: full strength looking down the bore, HARD-GATED off
    // below ~55° alignment — the pow(align, 1.6) residual left a bright
    // vertical spike from side-on cameras that crossed the horizontal tracer
    // into a 4-point lens-flare diamond (r6 fire2/kill frames).
    let align = 1;
    const cam = engineCtx && engineCtx.camera;
    if (cam) {
      _v4.copy(cam.position).sub(r.mesh.position);
      const len = _v4.length();
      if (len > 1e-4) align = Math.abs(_v4.dot(r.dir)) / len;
    }
    const aGate = THREE.MathUtils.smoothstep(align, 0.62, 0.9);
    if (aGate <= 0.001) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    r.mat.opacity = 0.30 * r.att * Math.pow(1 - t, 1.7) * aGate;
    r.mesh.visible = true;
  }

  /** Expanding pressure ring blown out along the bore axis. */
  function spawnMuzzleRing(pos, dir, s, ageS = 0, att = 1) {
    const r = muzzleRings[muzzleRingCursor];
    muzzleRingCursor = (muzzleRingCursor + 1) % muzzleRings.length;
    r.origin.copy(pos);
    r.dir.copy(dir);
    r.att = att;
    r.mesh.quaternion.setFromUnitVectors(_Z, dir);
    r.mesh.scale.setScalar(s);
    r.age = ageS;
    applyMuzzleRing(r);
  }

  // --- armor scar decals (pooled quads re-parented onto struck hulls) --------
  const MAX_SCARS = 14;
  const scarTex = makeScorchTexture(mulberry32((seed ^ 0x51f7a3) >>> 0));
  const scarMat = new THREE.MeshBasicMaterial({
    map: scarTex,
    color: 0x141110,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const scarGeo = new THREE.PlaneGeometry(1, 1);
  const scarMeshes = [];
  let scarCursor = 0;
  for (let i = 0; i < MAX_SCARS; i++) {
    const m = new THREE.Mesh(scarGeo, scarMat);
    m.visible = false;
    m.renderOrder = 3;
    m.castShadow = m.receiveShadow = false;
    scarMeshes.push(m); // parented lazily onto whichever tank is struck
  }
  const _scarQ = new THREE.Quaternion();
  const _scarQ2 = new THREE.Quaternion();

  const _coreArr = [0, 0, 0];
  const _glowArr = [0, 0, 0];

  function writeTracer(i, ax, ay, az, bx, by, bz, width, bright, core, glow) {
    let j = i * 4;
    trA.array[j] = ax; trA.array[j + 1] = ay; trA.array[j + 2] = az; trA.array[j + 3] = width;
    trB.array[j] = bx; trB.array[j + 1] = by; trB.array[j + 2] = bz; trB.array[j + 3] = bright;
    j = i * 3;
    trCore.array[j] = core[0]; trCore.array[j + 1] = core[1]; trCore.array[j + 2] = core[2];
    trGlow.array[j] = glow[0]; trGlow.array[j + 1] = glow[1]; trGlow.array[j + 2] = glow[2];
  }

  // --- timers, continuous emitters, event bookkeeping ------------------------
  /** @type {{t:number, fn:Function}[]} pending one-shot callbacks (sim-frozen aware) */
  let timers = [];
  /** @type {{key:string|null, pos:number[], acc:number, ttl:number, scale:number}[]} smoke-column emitters */
  let columns = [];
  /** last known world position per tank id (fed by bus events that carry pos) */
  const lastKnownPos = new Map();

  function groundY(x, z) {
    return heightField && heightField.getHeightAt ? heightField.getHeightAt(x, z) : 0;
  }

  function calScale(caliberMm) {
    return THREE.MathUtils.clamp(caliberMm / 100, 0.5, 1.7);
  }

  // --------------------------------------------------------------------------
  // Effect recipes (birthOffset lets the screenshot composers backdate spawns)
  // --------------------------------------------------------------------------

  /**
   * True when the camera is scoped (sniper view) and `pos` is the player's
   * own muzzle right in front of the lens — WoT hides own-gun flash geometry
   * in the scope and sells the shot with light + shake instead.
   */
  function scopedOwnGun(pos) {
    const cam = engineCtx && engineCtx.camera;
    return !!(cam && cam.userData && cam.userData.scoped &&
      cam.position.distanceToSquared(pos) < 100);
  }

  /**
   * @param {number} reach forward-extent multiplier for the BRIGHT elements
   *   (tongues/spears). 1 for live fire; the screenshot composer passes <1 so
   *   the frozen cone stays inside the combat_firing frame instead of
   *   clipping the screen edge as a blown-out sheet.
   * @returns {number} muzzle-light peak factor (bore-axis view attenuation)
   */
  function spawnMuzzleFlash(pos, dir, caliberMm, birthOffset = 0, reach = 1) {
    const s = calScale(caliberMm);
    // Sniper-scope suppression: no flash geometry an inch from the lens —
    // only a thinned propellant haze; the muzzle light + camera kick carry it.
    const scoped = scopedOwnGun(pos);
    // Bore-axis view attenuation: from the dead-astern chase camera every
    // additive card + jet stacks along the view ray into one full-screen
    // white fountain. Shrink (~45%) and dim (~60%) the bright elements as
    // |view · bore| -> 1; side-on framings are untouched.
    let axial = 0;
    let camD = 30;
    const cam = engineCtx && engineCtx.camera;
    if (cam) {
      _camV.copy(pos).sub(cam.position);
      const l = _camV.length();
      camD = l;
      if (l > 1e-4) axial = Math.abs(_camV.dot(dir)) / l;
    }
    // Close-camera energy discipline (r7 "one shot covers 60% of the frame"):
    // inside ~14 m the flash already subtends a big screen area, so the
    // additive stack + bloom snowballed it into a diagonal white wash. Scale
    // brightness AND card size down as the camera closes in; far framings
    // (staged combat_firing at 13 m orbit ≈ 0.75/0.9) are barely touched.
    const nearAtt = THREE.MathUtils.clamp((camD - 3) / 11, 0, 1);
    const nearA = 0.4 + 0.6 * nearAtt;
    const nearS = 0.68 + 0.32 * nearAtt;
    const axSize = (1 - 0.45 * axial * axial) * nearS;
    const axAtt = (1 - 0.62 * axial * axial) * nearA;
    const lightK = (1 - 0.5 * axial * axial) * (0.55 + 0.45 * nearAtt);
    basisFrom(dir, _v1, _v2);
    if (!scoped) {
    // 1. blinding core PINNED to the muzzle tip: a 1-frame pure-white pop
    //    stacked on a compact 90 ms core so the gameplay framing always
    //    reads a distinct white-hot heart inside the orange combustion.
    //    Sizes/alphas raised (r6): the brightest pixel cluster of the whole
    //    flash must sit ON the barrel-tip pixels — the composed frame's
    //    center-of-brightness used to live 1.5-3 m downrange in the tracer
    //    bridge, reading as a shell airburst off a bare muzzle.
    _puffO.pos[0] = pos.x + dir.x * 0.12; _puffO.pos[1] = pos.y + dir.y * 0.12; _puffO.pos[2] = pos.z + dir.z * 0.12;
    _puffO.vel[0] = dir.x * 1.5; _puffO.vel[1] = dir.y * 1.5; _puffO.vel[2] = dir.z * 1.5;
    _puffO.life = 0.045;
    // 0.75/0.95 (was 0.95/1.2): the big soft-radial card froze as a smooth
    // translucent ORB one radius downrange in the composed frame (r7)
    _puffO.size0 = 0.75 * s * axSize; _puffO.size1 = 0.95 * s * axSize;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xffffff, _puffO.col0); col3(0xffffff, _puffO.col1);
    _puffO.alpha = 0.45 + 0.55 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('flash', _puffO);
    _puffO.life = 0.09;
    _puffO.size0 = 0.55 * s * axSize; _puffO.size1 = 0.9 * s * axSize;
    _puffO.rotVel = (rng() - 0.5) * 2;
    col3(0xffffff, _puffO.col0); col3(0xffc558, _puffO.col1);
    particles.emit('flash', _puffO);
    // 1b. pressure "refraction" ring snapping out along the bore axis.
    // lighting_post r3: halve att for backdated (composed screenshot) births
    // — at the 50 ms composed age the two ring planes rendered as translucent
    // bokeh-disk ghosts beside the flash.
    spawnMuzzleRing(_sv.set(pos.x + dir.x * 0.3, pos.y + dir.y * 0.3, pos.z + dir.z * 0.3),
      dir, s * axSize, Math.max(0, -birthOffset), birthOffset < 0 ? axAtt * 0.5 : axAtt);
    // 2. volumetric blast cone: layered noisy jet quads oriented ALONG THE
    //    BORE AXIS (not camera-facing) — one primary jet dead on axis plus
    //    two shorter jets kicked a few degrees off it. Kept UNDER a barrel
    //    length and translucent: the r2 cone stacked into one giant opaque
    //    orange airbrush smear two barrel-lengths long.
    for (let i = 0; i < 3; i++) {
      const off = i === 0 ? 0 : 0.10 + rng() * 0.08;
      const a = rng() * Math.PI * 2;
      _sv.set(
        dir.x + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * off,
        dir.y + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * off,
        dir.z + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * off,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.1; _jetO.pos[1] = pos.y + dir.y * 0.1; _jetO.pos[2] = pos.z + dir.z * 0.1;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = i === 0 ? 0.09 : 0.075;
      _jetO.width = (i === 0 ? 0.30 : 0.22) * s * axSize;
      _jetO.len0 = 0.35 * s;
      // r7: the 1.7-2.1 barrel-length cone was the backbone of the screen
      // wash — a real 120 mm flash body is ~1 barrel-length. Kept bright,
      // made COMPACT.
      _jetO.len1 = (i === 0 ? 1.2 + rng() * 0.3 : 0.85 + rng() * 0.25) * s * reach;
      _jetO.seed = rng();
      col3(i === 0 ? 0xffe6b0 : 0xffcf7e, _jetO.col);
      _jetO.alpha = (i === 0 ? 0.7 : 0.45) * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    // 2a2. BACK-SPLASH: two short jets swept backward around the brake plus a
    //    small halo puff BEHIND the tip. Real 120 mm blast wraps the muzzle
    //    device; with every element forward-biased the flash mass sat wholly
    //    downrange and a thin/dark barrel read as bare with a detached
    //    airburst (r6 canonical-frame critical). Straddling the tip welds the
    //    flash onto the tube from any camera.
    for (let i = 0; i < 2; i++) {
      const a = rng() * Math.PI * 2;
      _sv.set(
        -dir.x * 0.6 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)),
        -dir.y * 0.6 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)),
        -dir.z * 0.6 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)),
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.06; _jetO.pos[1] = pos.y + dir.y * 0.06; _jetO.pos[2] = pos.z + dir.z * 0.06;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.07 + rng() * 0.02;
      _jetO.width = 0.20 * s * axSize;
      _jetO.len0 = 0.2 * s; _jetO.len1 = (0.55 + rng() * 0.2) * s;
      _jetO.seed = rng();
      col3(0xffd88a, _jetO.col);
      _jetO.alpha = 0.5 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    _puffO.pos[0] = pos.x - dir.x * 0.22; _puffO.pos[1] = pos.y - dir.y * 0.22; _puffO.pos[2] = pos.z - dir.z * 0.22;
    _puffO.vel[0] = -dir.x * 1.2; _puffO.vel[1] = -dir.y * 1.2 + 0.3; _puffO.vel[2] = -dir.z * 1.2;
    _puffO.life = 0.07;
    _puffO.size0 = 0.5 * s * axSize; _puffO.size1 = 0.72 * s * axSize;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xfff1cc, _puffO.col0); col3(0xffb050, _puffO.col1);
    _puffO.alpha = 0.55 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('flash', _puffO);
    // 2b. muzzle-brake side jets — short lateral cones venting from the brake
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5 + rng() * 0.5;
      _sv.set(
        _v1.x * Math.cos(a) + _v2.x * Math.sin(a) + dir.x * 0.45,
        _v1.y * Math.cos(a) + _v2.y * Math.sin(a) + dir.y * 0.45,
        _v1.z * Math.cos(a) + _v2.z * Math.sin(a) + dir.z * 0.45,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.22; _jetO.pos[1] = pos.y + dir.y * 0.22; _jetO.pos[2] = pos.z + dir.z * 0.22;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.06 + rng() * 0.02;
      _jetO.width = 0.16 * s * axSize;
      _jetO.len0 = 0.22 * s; _jetO.len1 = (0.55 + rng() * 0.25) * s * Math.max(reach, 0.7);
      _jetO.seed = rng();
      col3(0xffc86e, _jetO.col);
      _jetO.alpha = 0.42 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    // 2c. radial flash petals: 2 short-lived soft lobes kicked ~55-70 degrees
    //    off the bore. Tamed from the r5 tune (3 thin 1.2 m spikes at alpha
    //    0.5): side-on those rendered as a bright THIN VERTICAL LINE through
    //    the flash that crossed the horizontal tracer into the r6 "4-point
    //    lens-flare diamond" read. Wider, shorter, dimmer = combustion lobes.
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * Math.PI * 2 + rng() * 1.5;
      const tilt = 0.95 + rng() * 0.28;
      const st = Math.sin(tilt), ct = Math.cos(tilt);
      _sv.set(
        dir.x * ct + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st,
        dir.y * ct + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st,
        dir.z * ct + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.16; _jetO.pos[1] = pos.y + dir.y * 0.16; _jetO.pos[2] = pos.z + dir.z * 0.16;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.07 + rng() * 0.03;
      _jetO.width = 0.17 * s * axSize;
      _jetO.len0 = 0.16 * s; _jetO.len1 = (0.45 + rng() * 0.25) * s;
      _jetO.seed = rng();
      col3(0xffdf9a, _jetO.col);
      _jetO.alpha = 0.3 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    // 3. barrel-aligned incandescent tongues — thin streak detail inside the
    //    jet cone (kept sparse; the jets carry the volume now).
    // r7: was 4 streaks at v≈24-34 with 2.4 m lateral jitter — from any live
    // camera they froze as 3-4 PARALLEL TRACER LINES fanning under the bore.
    // Two tongues, dead on axis, half the speed, tight jitter.
    for (let i = 0; i < 2; i++) {
      const j = i < 1 ? 0 : 0.8;
      const jx = (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * j;
      const jy = (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * j;
      const jz = (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * j;
      const v = ((i < 1 ? 14 : 11) + rng() * 4) * reach;
      _strkO.pos[0] = pos.x + dir.x * 0.2; _strkO.pos[1] = pos.y + dir.y * 0.2; _strkO.pos[2] = pos.z + dir.z * 0.2;
      _strkO.vel[0] = dir.x * v + jx; _strkO.vel[1] = dir.y * v + jy; _strkO.vel[2] = dir.z * v + jz;
      _strkO.life = 0.06 + rng() * 0.04;
      _strkO.width = (0.06 + rng() * 0.05) * s; _strkO.stretch = 0.05; _strkO.grav = 0;
      col3(0xffc25e, _strkO.col); _strkO.alpha = 0.7 * axAtt; _strkO.seed = rng(); _strkO.birthOffset = birthOffset;
      particles.emit('sparks', _strkO);
    }
    // 4. compact orange petal cards hugging the first 0.8 m (hot-to-orange ramp)
    for (let i = 0; i < 3; i++) {
      const along = 0.3 + rng() * 0.55 * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * 0.16 * s;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * 0.16 * s;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * 0.16 * s;
      const v = 4 + rng() * 4;
      _puffO.vel[0] = dir.x * v; _puffO.vel[1] = dir.y * v; _puffO.vel[2] = dir.z * v;
      _puffO.life = 0.05 + rng() * 0.05;
      _puffO.size0 = 0.26 * s; _puffO.size1 = 0.62 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 8;
      col3(0xffe9a0, _puffO.col0); col3(0xff6a14, _puffO.col1);
      _puffO.alpha = 0.38 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
    // 4b. AFTERFLASH: the blinding pop must not be a two-state nuclear-then-
    //     nothing lifecycle. A 100-250 ms cooling stage — small orange licks
    //     collapsing toward ember red — bridges flash -> propellant smoke
    //     over ~6-15 rendered frames.
    for (let i = 0; i < 6; i++) {
      const along = (0.22 + rng() * 0.7) * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * 0.14 * s;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * 0.14 * s;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * 0.14 * s;
      const v = 2.2 + rng() * 2.8;
      _puffO.vel[0] = dir.x * v + (rng() - 0.5) * 0.6;
      _puffO.vel[1] = dir.y * v + 0.35 + rng() * 0.4;
      _puffO.vel[2] = dir.z * v + (rng() - 0.5) * 0.6;
      _puffO.life = 0.10 + rng() * 0.15;
      _puffO.size0 = 0.34 * s; _puffO.size1 = (0.85 + rng() * 0.55) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 6;
      col3(0xffb45e, _puffO.col0); col3(0xb3491a, _puffO.col1);
      _puffO.alpha = 0.4 * (0.4 + 0.6 * axAtt); _puffO.grav = 0.6; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
    // 4c. gray takeover: quick warm-gray puffs AT the muzzle, alpha'd in by
    //     ~70 ms — the stage the flash visibly collapses INTO before the
    //     long-lived propellant plume reads (backdated for a fast alpha-in).
    for (let i = 0; i < 6; i++) {
      const along = 0.28 + rng() * 0.5;
      _puffO.pos[0] = pos.x + dir.x * along; _puffO.pos[1] = pos.y + dir.y * along; _puffO.pos[2] = pos.z + dir.z * along;
      _puffO.vel[0] = dir.x * (2.6 + rng() * 2) + (rng() - 0.5) * 0.8;
      _puffO.vel[1] = dir.y * (2.6 + rng() * 2) + 0.5 + rng() * 0.5;
      _puffO.vel[2] = dir.z * (2.6 + rng() * 2) + (rng() - 0.5) * 0.8;
      _puffO.life = 0.65 + rng() * 0.55;
      _puffO.size0 = 0.32 * s; _puffO.size1 = (1.5 + rng() * 0.7) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xa89f92, _puffO.col0); col3(0x837f77, _puffO.col1);
      _puffO.alpha = 0.4; _puffO.grav = 0.5; _puffO.birthOffset = birthOffset - 0.07;
      particles.emit('smoke', _puffO);
    }
    } // end !scoped
    // 5. irregular propellant donut hugging the muzzle — randomized angle,
    //    radius and forward kick so it never reads as a neat stacked ring
    //    (backdated slightly so it is readable in the 50 ms composed frame).
    //    Scoped: thinned to a faint haze so the scope never floods.
    const smokeBirth = birthOffset - 0.2;
    const smokeA = scoped ? 0.45 : 1;
    for (let i = 0; i < (scoped ? 5 : 18); i++) {
      const a = rng() * Math.PI * 2;
      const r = (0.15 + rng() * 0.24) * s;
      const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
      const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
      const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
      const along = 0.4 + rng() * 0.5;
      _puffO.pos[0] = pos.x + dir.x * along + rx * r;
      _puffO.pos[1] = pos.y + dir.y * along + ry * r;
      _puffO.pos[2] = pos.z + dir.z * along + rz * r;
      const v = 2.4 + rng() * 2.6;
      const fwd = 2.2 + rng() * 2.4;
      _puffO.vel[0] = rx * v + dir.x * fwd; _puffO.vel[1] = ry * v + dir.y * fwd; _puffO.vel[2] = rz * v + dir.z * fwd;
      _puffO.life = 1.6 + rng() * 1.5;
      _puffO.size0 = (0.38 + rng() * 0.26) * s; _puffO.size1 = (2.0 + rng() * 1.1) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xb9b2a6, _puffO.col0); col3(0x8d8a84, _puffO.col1);
      _puffO.alpha = (0.36 + rng() * 0.16) * smokeA; _puffO.grav = 0.7; _puffO.birthOffset = smokeBirth;
      particles.emit('smoke', _puffO);
    }
    // 6. forward cordite plume — a widening cone (lateral spread grows with
    //    distance), long-lived, expanding slowly and drifting with the wind
    for (let i = 0; i < (scoped ? 6 : 20); i++) {
      const along = 0.8 + rng() * 3.2 * s;
      const lat = along * 0.24 * (rng() - 0.5) * 2;
      const la = rng() * Math.PI * 2;
      const lx = _v1.x * Math.cos(la) + _v2.x * Math.sin(la);
      const ly = _v1.y * Math.cos(la) + _v2.y * Math.sin(la);
      const lz = _v1.z * Math.cos(la) + _v2.z * Math.sin(la);
      _puffO.pos[0] = pos.x + dir.x * along + lx * lat;
      _puffO.pos[1] = pos.y + dir.y * along + ly * lat;
      _puffO.pos[2] = pos.z + dir.z * along + lz * lat;
      const v = 4 + rng() * 5;
      _puffO.vel[0] = dir.x * v + lx * 1.1 + 0.4 + (rng() - 0.5) * 0.6;
      _puffO.vel[1] = dir.y * v + ly * 1.1 + 0.7 + rng() * 0.7;
      _puffO.vel[2] = dir.z * v + lz * 1.1 + (rng() - 0.5) * 0.6;
      _puffO.life = 2.2 + rng() * 2.0;
      _puffO.size0 = (0.45 + rng() * 0.3) * s; _puffO.size1 = (2.4 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xcfc8ba, _puffO.col0); col3(0x97948e, _puffO.col1);
      _puffO.alpha = (0.30 + rng() * 0.16) * smokeA; _puffO.grav = 0.5; _puffO.birthOffset = smokeBirth;
      particles.emit('smoke', _puffO);
    }
    // Scoped LIGHT attenuation (r6): the muzzle light an inch from the lens
    // whited out the bottom half of the scope — suppress it like the
    // geometry, leaving a readable kick without the flashbang.
    if (scoped) return lightK * 0.2; // no wisps/bore sparks/ground wash an inch from the lens
    // 6b. lingering wisp curling off the hot muzzle itself
    for (let i = 0; i < 5; i++) {
      const along = 0.15 + rng() * 0.3;
      _puffO.pos[0] = pos.x + dir.x * along; _puffO.pos[1] = pos.y + dir.y * along; _puffO.pos[2] = pos.z + dir.z * along;
      _puffO.vel[0] = dir.x * 0.6 + (rng() - 0.5) * 0.4;
      _puffO.vel[1] = 0.9 + rng() * 0.6;
      _puffO.vel[2] = dir.z * 0.6 + (rng() - 0.5) * 0.4;
      _puffO.life = 1.8 + rng() * 1.2;
      _puffO.size0 = 0.25 * s; _puffO.size1 = (1.4 + rng() * 0.5) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0xc9c2b4, _puffO.col0); col3(0x94918a, _puffO.col1);
      _puffO.alpha = 0.24; _puffO.grav = 0.5; _puffO.birthOffset = smokeBirth;
      particles.emit('smoke', _puffO);
    }
    // 7. hot spark spray down the bore line (after basis users — sparkFan
    //    re-derives its own basis and clobbers _v1/_v2)
    _sv.set(pos.x + dir.x * 0.6, pos.y + dir.y * 0.6, pos.z + dir.z * 0.6);
    // r7: 26 m/s over 0.4 s threw 8-10 m incandescent rays that stacked into
    // the diagonal wash — halved speed/life keeps a 2-3 m ember spray
    sparkFan(_sv, dir, Math.round(9 * (0.4 + 0.6 * axAtt)), 14 * s * reach, 0.22, 0xffd58a, 0.28, 0.018, 0.03, birthOffset);
    // 8. muzzle-blast ground interaction (low muzzles only): a radial dust
    //    donut expanding under the brake + a forward blast wash 2-4 m ahead
    const gy = groundY(pos.x, pos.z);
    if (pos.y - gy < 3.5) {
      // 8a. recoil dust donut directly beneath the muzzle
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + rng() * 0.5;
        const r0 = 0.7 + rng() * 0.5;
        _puffO.pos[0] = pos.x + dir.x * 0.8 + Math.cos(a) * r0;
        _puffO.pos[1] = gy + 0.3;
        _puffO.pos[2] = pos.z + dir.z * 0.8 + Math.sin(a) * r0;
        _puffO.vel[0] = Math.cos(a) * (3.5 + rng() * 3) + dir.x * 1.5;
        _puffO.vel[1] = 0.8 + rng() * 0.9;
        _puffO.vel[2] = Math.sin(a) * (3.5 + rng() * 3) + dir.z * 1.5;
        _puffO.life = 0.9 + rng() * 0.7;
        _puffO.size0 = 0.5; _puffO.size1 = 1.9 + rng() * 0.9;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
        col3(0xa08a67, _puffO.col0); col3(0x8a7a5e, _puffO.col1);
        _puffO.alpha = 0.42; _puffO.grav = -0.4; _puffO.birthOffset = birthOffset - 0.08;
        particles.emit('dust', _puffO);
      }
      // 8b. forward blast wash
      for (let i = 0; i < 8; i++) {
        const a = rng() * Math.PI * 2;
        const ahead = 2.2 + rng() * 1.8;
        _puffO.pos[0] = pos.x + dir.x * ahead + Math.cos(a) * 1.2;
        _puffO.pos[1] = gy + 0.4;
        _puffO.pos[2] = pos.z + dir.z * ahead + Math.sin(a) * 1.2;
        _puffO.vel[0] = Math.cos(a) * (2.5 + rng() * 2.5) + dir.x * 4;
        _puffO.vel[1] = 0.9 + rng() * 1.1;
        _puffO.vel[2] = Math.sin(a) * (2.5 + rng() * 2.5) + dir.z * 4;
        _puffO.life = 1.0 + rng() * 0.8;
        _puffO.size0 = 0.7; _puffO.size1 = 2.4 + rng();
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
        col3(0xa08a67, _puffO.col0); col3(0x8a7a5e, _puffO.col1);
        _puffO.alpha = 0.38; _puffO.grav = -0.4; _puffO.birthOffset = birthOffset - 0.1;
        particles.emit('dust', _puffO);
      }
    }
    return lightK;
  }

  /** APFSDS sabot petals discarding just past the muzzle (shells doc §10). */
  function spawnSabotPetals(pos, dir, birthOffset = 0) {
    basisFrom(dir, _v1, _v2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng();
      const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
      const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
      const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
      _debO.pos[0] = pos.x + dir.x * 1.5; _debO.pos[1] = pos.y + dir.y * 1.5; _debO.pos[2] = pos.z + dir.z * 1.5;
      _debO.vel[0] = dir.x * 60 + rx * 14; _debO.vel[1] = dir.y * 60 + ry * 14 + 2; _debO.vel[2] = dir.z * 60 + rz * 14;
      _debO.life = 1.4; _debO.scale = 0.09; _debO.spin = 20 + rng() * 20;
      _debO.axis[0] = rx; _debO.axis[1] = ry; _debO.axis[2] = rz;
      _debO.groundY = groundY(pos.x, pos.z);
      _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
    }
  }

  /**
   * Cone of spark streaks around `normal`. `jitterS` staggers births so a
   * frozen frame shows a mix of ages — long fresh leaders, short dying
   * drooping arcs — never a symmetric fan of identical lines.
   */
  function sparkFan(pos, normal, count, speed, spread, colHex, life, width, stretch, birthOffset = 0, jitterS = 0) {
    basisFrom(normal, _v1, _v2);
    col3(colHex, _strkO.col);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = rng() * spread;
      const st = Math.sin(tilt);
      const cx = Math.cos(a) * st, sx = Math.sin(a) * st, n = Math.cos(tilt);
      const v = speed * (0.4 + rng() * 0.9);
      _strkO.pos[0] = pos.x + normal.x * 0.05; _strkO.pos[1] = pos.y + normal.y * 0.05; _strkO.pos[2] = pos.z + normal.z * 0.05;
      _strkO.vel[0] = (normal.x * n + _v1.x * cx + _v2.x * sx) * v;
      _strkO.vel[1] = (normal.y * n + _v1.y * cx + _v2.y * sx) * v;
      _strkO.vel[2] = (normal.z * n + _v1.z * cx + _v2.z * sx) * v;
      _strkO.life = life * (0.5 + rng() * 0.8);
      // per-spark width/brightness variation so the shower never reads as
      // uniform confetti — a few fat bright leaders among dim thin trails
      _strkO.width = width * (0.6 + rng() * 0.9); _strkO.stretch = stretch * (0.7 + rng() * 0.7);
      _strkO.grav = -21.6;
      _strkO.alpha = 0.5 + rng() * 0.5; _strkO.seed = rng();
      _strkO.birthOffset = birthOffset - rng() * jitterS;
      particles.emit('sparks', _strkO);
    }
  }

  /** Drifting smoke puffs leaving an impact point along `normal`. */
  function impactSmoke(pos, normal, count, size, colHex0, colHex1, alpha, birthOffset = 0) {
    for (let i = 0; i < count; i++) {
      _puffO.pos[0] = pos.x + normal.x * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.pos[1] = pos.y + normal.y * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.pos[2] = pos.z + normal.z * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.vel[0] = normal.x * (1.5 + rng() * 2) + (rng() - 0.5);
      _puffO.vel[1] = normal.y * (1.5 + rng() * 2) + 0.8 + rng() * 0.5;
      _puffO.vel[2] = normal.z * (1.5 + rng() * 2) + (rng() - 0.5);
      _puffO.life = 0.9 + rng() * 1.0;
      _puffO.size0 = size * 0.4; _puffO.size1 = size * (1.4 + rng() * 0.6);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(colHex0, _puffO.col0); col3(colHex1, _puffO.col1);
      _puffO.alpha = alpha; _puffO.grav = 0.9; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
  }

  /** Very short additive flash burst at a hit point. */
  function hitFlash(pos, normal, s, colHex0, colHex1, birthOffset = 0) {
    for (let i = 0; i < 3; i++) {
      _puffO.pos[0] = pos.x + normal.x * 0.15; _puffO.pos[1] = pos.y + normal.y * 0.15; _puffO.pos[2] = pos.z + normal.z * 0.15;
      _puffO.vel[0] = normal.x * 2; _puffO.vel[1] = normal.y * 2; _puffO.vel[2] = normal.z * 2;
      _puffO.life = 0.06 + rng() * 0.05;
      _puffO.size0 = 0.5 * s; _puffO.size1 = 1.6 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
      col3(colHex0, _puffO.col0); col3(colHex1, _puffO.col1);
      _puffO.alpha = 1.0; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
  }

  /** HE / terrain dirt plume: dark column + radial skirt + clods + dust ring. */
  function dirtPlume(pos, caliberMm, big, birthOffset = 0) {
    const s = calScale(caliberMm) * (big ? 1.7 : 1.15);
    const gy = groundY(pos.x, pos.z);
    const baseY = Math.max(pos.y, gy) + 0.5;
    // dark ejecta core: a dense near-black heart the caliber punches out of
    // the soil — the r5 plume was one small brown puff with no core
    for (let i = 0; i < (big ? 6 : 4); i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.4 * s;
      _puffO.pos[1] = baseY + rng() * 0.3;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.4 * s;
      _puffO.vel[0] = (rng() - 0.5) * 1.6; _puffO.vel[1] = (9 + rng() * 6) * s; _puffO.vel[2] = (rng() - 0.5) * 1.6;
      _puffO.life = 0.9 + rng() * 0.7;
      _puffO.size0 = 0.5 * s; _puffO.size1 = (1.9 + rng() * 0.9) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x362b1e, _puffO.col0); col3(0x4b3e2c, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = -7; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // central dirt column
    const colN = big ? 14 : 8;
    for (let i = 0; i < colN; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.8 * s;
      _puffO.pos[1] = baseY + rng() * 0.6;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.8 * s;
      _puffO.vel[0] = (rng() - 0.5) * 2.5; _puffO.vel[1] = (7 + rng() * 7) * s; _puffO.vel[2] = (rng() - 0.5) * 2.5;
      _puffO.life = 1.3 + rng() * 1.2;
      _puffO.size0 = 0.7 * s; _puffO.size1 = (2.8 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x5c4a33, _puffO.col0); col3(0x77664d, _puffO.col1);
      _puffO.alpha = 0.85; _puffO.grav = -6; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // radial skirt
    const skN = big ? 12 : 7;
    for (let i = 0; i < skN; i++) {
      const a = (i / skN) * Math.PI * 2 + rng() * 0.5;
      _puffO.pos[0] = pos.x + Math.cos(a) * 0.5 * s; _puffO.pos[1] = baseY; _puffO.pos[2] = pos.z + Math.sin(a) * 0.5 * s;
      _puffO.vel[0] = Math.cos(a) * (5 + rng() * 3) * s;
      _puffO.vel[1] = 2.5 + rng() * 2;
      _puffO.vel[2] = Math.sin(a) * (5 + rng() * 3) * s;
      _puffO.life = 1.0 + rng() * 0.8;
      _puffO.size0 = 0.6 * s; _puffO.size1 = 2.2 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x6b5940, _puffO.col0); col3(0x857556, _puffO.col1);
      _puffO.alpha = 0.6; _puffO.grav = -3; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // lingering dust pall: a drifting haze that hangs ~3 s at the impact
    // point after the plume collapses (r5: pall was far too short)
    for (let i = 0; i < (big ? 10 : 7); i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 2.4 * s;
      _puffO.pos[0] = pos.x + Math.cos(a) * d; _puffO.pos[1] = baseY + 0.2; _puffO.pos[2] = pos.z + Math.sin(a) * d;
      _puffO.vel[0] = Math.cos(a) * (1.0 + rng()) + 0.3; _puffO.vel[1] = 0.6 + rng() * 0.6; _puffO.vel[2] = Math.sin(a) * (1.0 + rng());
      _puffO.life = 3.2 + rng() * 1.8;
      _puffO.size0 = 1.0 * s; _puffO.size1 = (4.4 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5);
      col3(0x9a8a68, _puffO.col0); col3(0x877a5f, _puffO.col1);
      _puffO.alpha = 0.30 + rng() * 0.1; _puffO.grav = -0.25; _puffO.birthOffset = birthOffset + rng() * 0.5;
      particles.emit('dust', _puffO);
    }
    // dirt clods + arcing clod tracer streaks: each clod drags a dotted trail
    // of dark ejecta sampled along the same drag trajectory the debris shader
    // integrates (k = 0.12, g = -21.6) — the WoT "soil fountain" signature
    const clods = big ? 9 : 6;
    for (let i = 0; i < clods; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = rng() * 0.7;
      const vx = Math.cos(a) * Math.sin(tilt) * 14 * s;
      const vy = (9 + rng() * 9) * s;
      const vz = Math.sin(a) * Math.sin(tilt) * 14 * s;
      _debO.pos[0] = pos.x; _debO.pos[1] = baseY; _debO.pos[2] = pos.z;
      _debO.vel[0] = vx; _debO.vel[1] = vy; _debO.vel[2] = vz;
      _debO.life = 2.2; _debO.scale = 0.1 + rng() * 0.12 * s; _debO.spin = 6 + rng() * 14;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
      if (i >= (big ? 7 : 5)) continue; // trails on the first 5-7 clods only
      for (let ts = 0.06; ts < 1.0; ts += 0.1) {
        const sd = (1 - Math.exp(-0.12 * ts)) / 0.12;
        const px = pos.x + vx * sd;
        const py = baseY + vy * sd - 10.8 * ts * ts;
        const pz = pos.z + vz * sd;
        if (py < gy + 0.25) break;
        _puffO.pos[0] = px + (rng() - 0.5) * 0.12; _puffO.pos[1] = py; _puffO.pos[2] = pz + (rng() - 0.5) * 0.12;
        _puffO.vel[0] = (rng() - 0.5) * 0.3; _puffO.vel[1] = -0.4 - rng() * 0.5; _puffO.vel[2] = (rng() - 0.5) * 0.3;
        _puffO.life = 0.5 + rng() * 0.4;
        _puffO.size0 = 0.15 * s; _puffO.size1 = 0.5 * s;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x4a3b29, _puffO.col0); col3(0x5d5040, _puffO.col1);
        _puffO.alpha = 0.7; _puffO.grav = -1.5; _puffO.birthOffset = birthOffset + ts * 0.9;
        particles.emit('smoke', _puffO);
      }
    }
  }

  /** HE detonation fireball (scaled by caliber) — flash + fire + black smoke. */
  function heFireball(pos, caliberMm, birthOffset = 0) {
    const s = calScale(caliberMm) * 1.3;
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = (3 + rng() * 5) * s;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = pos.y + 0.2; _puffO.pos[2] = pos.z;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v + 1.5;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = 0.25 + rng() * 0.25;
      _puffO.size0 = 0.8 * s; _puffO.size1 = 2.6 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 5;
      col3(0xfff0b0, _puffO.col0); col3(0xff5a10, _puffO.col1);
      _puffO.alpha = 1.0; _puffO.grav = 2; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
    impactSmoke(_sv.set(pos.x, pos.y + 0.4, pos.z), _UP, 8, 1.6 * s, 0x2c2a28, 0x565450, 0.7, birthOffset);
  }

  /**
   * Full vehicle destruction sequence, optionally backdated (composer).
   * `cause` varies the spectacle so kills stop reading as one canned clip:
   *  - 'ammorack': the full turret-toss detonation (geyser, hatch jets, max
   *    debris) — the rare spectacular;
   *  - 'shot': plain HP kill — solid fireball but no rack geyser, fewer
   *    debris, turret stays seated (gun droop + hatch smoke);
   *  - 'fire': burn-out — flashover whoosh + heavy smoke, almost no debris.
   */
  function spawnDestruction(pos, visual, birthOffset = 0, cause = 'ammorack') {
    const rack = cause === 'ammorack';
    const burn = cause === 'fire';
    const gy = groundY(pos.x, pos.z);
    const cy = Math.max(pos.y, gy) + 1.2;
    // distance-compensated spectacle (r7: a 244 m kill read as a ~40 px
    // orange puff) — scale the big volumetric cards up with camera distance
    const dk = distBoost(pos.x, cy, pos.z);
    // white-hot detonation core (first ~200 ms, star sprites, bloom feed)
    for (let i = 0; i < (burn ? 1 : 3); i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = 2 + rng() * 4;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.6; _puffO.pos[1] = cy + (rng() - 0.5) * 0.6; _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v + 2;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = 0.1 + rng() * 0.1;
      _puffO.size0 = (1.4 + rng()) * dk; _puffO.size1 = (3.2 + rng() * 1.2) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xffffff, _puffO.col0); col3(0xffb040, _puffO.col1);
      _puffO.alpha = 1.0; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('flash', _puffO);
    }
    // incandescent fireball — turbulent noise cards with erosion dissolve
    // (blackbody ramp yellow-white -> deep orange-red). Staggered lifetimes
    // so a frozen frame catches fresh dense cores AND half-eroded churn.
    // Alpha kept moderate: the core must keep its white->orange->smoke
    // gradient instead of stacking to a clipped featureless sheet.
    // Spawn cluster kept TIGHT with big overlapping cards: separated centers
    // read as 5-6 individual cotton-ball spheres (r5) instead of one mass.
    // FEWER, LARGER, MORE OPAQUE cards (r6: by 1.0-1.6 s the many mid-size
    // half-eroded cards resolved into coarse confetti stipple over the trees
    // instead of volumetric churn — density per card matters more than count)
    const fireN = rack ? 22 : (burn ? 10 : 17);
    const fireS = burn ? 0.7 : 1;
    for (let i = 0; i < fireN; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = (3.4 + rng() * 5.0) * fireS;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2 * fireS;
      _puffO.pos[1] = cy + (rng() - 0.55) * 1.2;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2 * fireS;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v * 0.45 + 0.9;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      // staggered long tail: the burn must survive past 2.5 s, not collapse
      // into a thin sprite ribbon at 1.4 s (r2 critique)
      _puffO.life = 1.2 + rng() * 1.7;
      _puffO.size0 = (2.2 + rng() * 1.2) * fireS * dk; _puffO.size1 = (5.6 + rng() * 2.8) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffd865, _puffO.col0); col3(0xff3a00, _puffO.col1);
      _puffO.alpha = 0.66; _puffO.grav = 1.0; _puffO.birthOffset = birthOffset - rng() * 0.25;
      particles.emit('fire', _puffO);
    }
    // fire-to-smoke takeover: dark roil born WHERE the flame puffs are as
    // they die (0.4-1.4 s in), so the fireball transitions into a churning
    // black mass instead of thinning to sparse sprites
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = (0.6 + rng() * 1.5) * fireS;
      _puffO.pos[0] = pos.x + Math.cos(a) * r;
      _puffO.pos[1] = cy + rng() * 2.2;
      _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (1.2 + rng() * 1.8);
      _puffO.vel[1] = 2.2 + rng() * 2.6;
      _puffO.vel[2] = Math.sin(a) * (1.2 + rng() * 1.8);
      _puffO.life = 2.4 + rng() * 2.2;
      _puffO.size0 = (1.4 + rng() * 0.8) * dk; _puffO.size1 = (4.6 + rng() * 2.2) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x27231f, _puffO.col0); col3(0x565349, _puffO.col1);
      _puffO.alpha = 0.62 + rng() * 0.14; _puffO.grav = 1.1;
      _puffO.birthOffset = birthOffset + 0.4 + rng() * 1.0;
      particles.emit('smoke', _puffO);
    }
    // dark combustion intrusions INSIDE the fireball volume — sooty pockets
    // mixed into the flame mass give the churn its internal structure
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.5 + rng() * 1.1;
      _puffO.pos[0] = pos.x + Math.cos(a) * r;
      _puffO.pos[1] = cy + (rng() - 0.3) * 1.4;
      _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (1.5 + rng() * 2); _puffO.vel[1] = 1.8 + rng() * 2.2; _puffO.vel[2] = Math.sin(a) * (1.5 + rng() * 2);
      _puffO.life = 1.1 + rng() * 0.9;
      _puffO.size0 = 1.0 + rng() * 0.6; _puffO.size1 = 3.0 + rng() * 1.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x211d1a, _puffO.col0); col3(0x3d3833, _puffO.col1);
      _puffO.alpha = 0.5 + rng() * 0.2; _puffO.grav = 1.2; _puffO.birthOffset = birthOffset - rng() * 0.15;
      particles.emit('smoke', _puffO);
    }
    // ground-hugging fire skirt around the hull — welds the blast to the
    // vehicle and the terrain (no more floating airburst read)
    for (let i = 0; i < (burn ? 4 : 10); i++) {
      const a = rng() * Math.PI * 2;
      const r = 1.2 + rng() * 1.0;
      _puffO.pos[0] = pos.x + Math.cos(a) * r; _puffO.pos[1] = gy + 0.5 + rng() * 0.4; _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (3.5 + rng() * 3);
      _puffO.vel[1] = 1.2 + rng() * 1.2;
      _puffO.vel[2] = Math.sin(a) * (3.5 + rng() * 3);
      _puffO.life = 0.55 + rng() * 0.5;
      _puffO.size0 = 0.8 + rng() * 0.4; _puffO.size1 = 2.2 + rng() * 0.8;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffc040, _puffO.col0); col3(0xff4a08, _puffO.col1);
      _puffO.alpha = 0.55; _puffO.grav = 1.5; _puffO.birthOffset = birthOffset - rng() * 0.15;
      particles.emit('fire', _puffO);
    }
    // ammo-rack geyser: a violent vertical fire column blasting out of the
    // turret ring — the signature of the rack cook-off that pops the turret.
    // RESERVED for ammo-rack kills so the toss stays a spectacle.
    for (let i = 0; i < (rack ? 9 : 0); i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _puffO.pos[1] = cy + 0.4 + rng() * 0.6;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _puffO.vel[0] = (rng() - 0.5) * 2.2;
      _puffO.vel[1] = 9 + rng() * 7;
      _puffO.vel[2] = (rng() - 0.5) * 2.2;
      _puffO.life = 0.55 + rng() * 0.55;
      _puffO.size0 = 0.8 + rng() * 0.5; _puffO.size1 = 2.0 + rng() * 1.0;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 5;
      col3(0xffe9a0, _puffO.col0); col3(0xff4a06, _puffO.col1);
      _puffO.alpha = 0.7; _puffO.grav = -2; _puffO.birthOffset = birthOffset - rng() * 0.12;
      particles.emit('fire', _puffO);
    }
    // hatch blowouts: sharp angled jets venting from crew hatches as the
    // overpressure escapes — short, directional, incandescent
    for (let i = 0; i < (rack ? 3 : (burn ? 0 : 2)); i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.45; // off-vertical
      _sv.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
      _jetO.pos[0] = pos.x + (rng() - 0.5) * 1.0;
      _jetO.pos[1] = cy + 0.3;
      _jetO.pos[2] = pos.z + (rng() - 0.5) * 1.0;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.14 + rng() * 0.08;
      _jetO.width = 0.30 + rng() * 0.12;
      _jetO.len0 = 0.5; _jetO.len1 = 2.6 + rng() * 1.4;
      _jetO.seed = rng();
      col3(0xffd98c, _jetO.col);
      _jetO.alpha = 0.85; _jetO.birthOffset = birthOffset - rng() * 0.05;
      particles.emit('jet', _jetO);
    }
    // rising fire licks feeding the base of the smoke column
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2; _puffO.pos[1] = cy + rng() * 0.6; _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = Math.cos(a) * (0.5 + rng()); _puffO.vel[1] = 4 + rng() * 4; _puffO.vel[2] = Math.sin(a) * (0.5 + rng());
      _puffO.life = 0.6 + rng() * 0.6;
      _puffO.size0 = 0.9 + rng() * 0.5; _puffO.size1 = 2.4 + rng();
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffc040, _puffO.col0); col3(0xff4a08, _puffO.col1);
      _puffO.alpha = 0.6; _puffO.grav = 3; _puffO.birthOffset = birthOffset - rng() * 0.2;
      particles.emit('fire', _puffO);
    }
    // rolling black smoke cap + buoyant column starters. Backdated 0.25 s so
    // the fade-in is already complete when the composer freezes at 0.6 s (and
    // live, thick smoke erupts with the fireball instead of trailing it).
    for (let i = 0; i < 30; i++) {
      const a = rng() * Math.PI * 2;
      const v = 1 + rng() * 2.5;
      const high = i < 12; // first batch caps the fireball from above
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.6;
      _puffO.pos[1] = cy + (high ? 1.2 + rng() * 2.2 : rng() * 1.2);
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.6;
      _puffO.vel[0] = Math.cos(a) * v; _puffO.vel[1] = 3.2 + rng() * 4.0; _puffO.vel[2] = Math.sin(a) * v;
      // life 4-8 (was 2.8-5.8): these cards must bridge the fireball into the
      // established column — the r7 sequence had a visible smoke HOLE at
      // +3-6 s while the slow column puffs were still climbing
      _puffO.life = 4.0 + rng() * 4.0;
      _puffO.size0 = (1.6 + rng() * 0.5) * dk; _puffO.size1 = (6.2 + rng() * 2.8) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      // every third puff is a lighter grey so the cap keeps internal contrast
      // instead of stacking to one flat ink-black silhouette. Albedo lifted
      // out of pure black (r5: "flat ink silhouette") — the flipbook + sun
      // rim shading needs SOME reflectance to sculpt the volume.
      if (i % 3 === 2) { col3(0x45413c, _puffO.col0); col3(0x7d7a72, _puffO.col1); }
      else { col3(0x2b2723, _puffO.col0); col3(0x5c5952, _puffO.col1); }
      _puffO.alpha = 0.58 + rng() * 0.16; _puffO.grav = 1.3; _puffO.birthOffset = birthOffset - 0.25;
      particles.emit('smoke', _puffO);
    }
    // shockwave dust ring on the ground — fast, clearly expanding, but
    // ORGANIC: jittered radius/angle/size and ~30% of slots dropped so the
    // ring never resolves into evenly spaced puffs on a perfect circle (r5)
    const ringN = burn ? 10 : 34;
    for (let i = 0; i < ringN; i++) {
      if (rng() < 0.3) continue;
      const a = (i / ringN) * Math.PI * 2 + (rng() - 0.5) * 0.85;
      const rs = 1.4 + rng() * 1.7;
      const sizeK = 0.6 + rng() * 0.9;
      _puffO.pos[0] = pos.x + Math.cos(a) * rs; _puffO.pos[1] = gy + 0.45; _puffO.pos[2] = pos.z + Math.sin(a) * rs;
      _puffO.vel[0] = Math.cos(a) * (7 + rng() * 8); _puffO.vel[1] = 1 + rng(); _puffO.vel[2] = Math.sin(a) * (7 + rng() * 8);
      _puffO.life = 1.0 + rng() * 0.9;
      _puffO.size0 = 0.8 * sizeK; _puffO.size1 = (3.2 + rng() * 2.2) * sizeK;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x93805f, _puffO.col0); col3(0x7d6f55, _puffO.col1);
      _puffO.alpha = 0.30 + rng() * 0.22; _puffO.grav = -0.6; _puffO.birthOffset = birthOffset - rng() * 0.1;
      particles.emit('dust', _puffO);
    }
    // scorched earth: persistent soot decal projected onto the terrain
    spawnScorch(pos.x, pos.z, (burn ? 3.6 : 5.4) + rng() * 1.4);
    // pressure shockwave: fast-expanding ground-aligned ring in the first
    // ~450 ms (additive, fades as it expands) — a burn-out has no blast wave
    if (!burn) spawnShockRing(pos.x, pos.z, Math.max(0, -birthOffset));
    // spark shower — glowing streaks emitted radially, arcing under gravity,
    // with randomized length/width/brightness AND staggered births so the
    // frozen frame mixes fresh leaders with drooping, dying arcs
    sparkFan(_sv.set(pos.x, cy, pos.z), _UP, rack ? 28 : (burn ? 8 : 18), 16, 1.1, 0xffc470, 1.4, 0.05, 0.085, birthOffset, 0.35);
    // debris shower (irregular scorched chunks, a FEW glowing hot) — high
    // radial speed + strong gravity so chunks read ballistic, never floating.
    // r6 "orange popcorn": too many hot lumps froze in tree canopies with no
    // motion cue. Fewer/smaller chunks on flatter arcs, hot fraction cut, and
    // every hot chunk drags a velocity-aligned spark streak so a frozen frame
    // reads MOTION, not confetti pasted into the foliage.
    for (let i = 0; i < (rack ? 20 : (burn ? 5 : 12)); i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.85;
      const bo = birthOffset - rng() * 0.15;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = Math.cos(a) * Math.sin(tilt) * (13 + rng() * 11);
      _debO.vel[1] = 4 + rng() * 9;
      _debO.vel[2] = Math.sin(a) * Math.sin(tilt) * (13 + rng() * 11);
      _debO.life = 1.7 + rng() * 1.1;
      _debO.scale = 0.09 + rng() * 0.17;
      _debO.spin = 8 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = rng() < 0.3; _debO.seed = rng(); _debO.birthOffset = bo;
      particles.emit('debris', _debO);
      if (_debO.hot) {
        // paired incandescent streak: same launch state, drag-decayed by the
        // sparks shader along the same trajectory family — the motion cue
        _strkO.pos[0] = pos.x; _strkO.pos[1] = cy; _strkO.pos[2] = pos.z;
        _strkO.vel[0] = _debO.vel[0]; _strkO.vel[1] = _debO.vel[1]; _strkO.vel[2] = _debO.vel[2];
        _strkO.life = 0.7 + rng() * 0.5;
        _strkO.width = 0.035 + rng() * 0.03; _strkO.stretch = 0.06; _strkO.grav = -21.6;
        col3(0xffc274, _strkO.col); _strkO.alpha = 0.8; _strkO.seed = rng();
        _strkO.birthOffset = bo;
        particles.emit('sparks', _strkO);
      }
    }
    // large chunks with smoke trails (sampled along the same drag
    // trajectory the debris shader integrates: k = 0.12, g = -21.6)
    for (let i = 0; i < (rack ? 3 : (burn ? 0 : 2)); i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.5;
      const vx = Math.cos(a) * Math.sin(tilt) * 14;
      const vy = 12 + rng() * 8;
      const vz = Math.sin(a) * Math.sin(tilt) * 14;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = vx; _debO.vel[1] = vy; _debO.vel[2] = vz;
      _debO.life = 3; _debO.scale = 0.28 + rng() * 0.12; _debO.spin = 5 + rng() * 8;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
      for (let ts = 0.08; ts < 1.5; ts += 0.11) {
        const sd = (1 - Math.exp(-0.12 * ts)) / 0.12;
        const px = pos.x + vx * sd;
        const py = cy + vy * sd - 10.8 * ts * ts;
        const pz = pos.z + vz * sd;
        if (py < gy + 0.3) break;
        _puffO.pos[0] = px + (rng() - 0.5) * 0.15; _puffO.pos[1] = py; _puffO.pos[2] = pz + (rng() - 0.5) * 0.15;
        _puffO.vel[0] = (rng() - 0.5) * 0.4; _puffO.vel[1] = 0.5 + rng() * 0.4; _puffO.vel[2] = (rng() - 0.5) * 0.4;
        _puffO.life = 0.9 + rng() * 0.6;
        _puffO.size0 = 0.35; _puffO.size1 = 1.3 + rng() * 0.4;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x2a2826, _puffO.col0); col3(0x555350, _puffO.col1);
        _puffO.alpha = 0.55; _puffO.grav = 0.6; _puffO.birthOffset = birthOffset + ts;
        particles.emit('smoke', _puffO);
      }
    }
    // one heavy hatch slab arcing high (the REAL turret pops via
    // visual.setDestroyed's physics arc — see tankFactory). Rack kills only.
    if (rack) {
      _debO.pos[0] = pos.x; _debO.pos[1] = cy + 0.6; _debO.pos[2] = pos.z;
      _debO.vel[0] = (rng() - 0.5) * 6; _debO.vel[1] = 14 + rng() * 8; _debO.vel[2] = (rng() - 0.5) * 6;
      _debO.life = 3.5; _debO.scale = 0.45 + rng() * 0.2; _debO.spin = 5 + rng() * 6;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = 0.2; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
    }
    // settling dust: a delayed low blanket that drifts in AFTER the fireball
    // dies (positive birthOffset relative to the blast = future birth)
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const d = 1.5 + rng() * 3.5;
      _puffO.pos[0] = pos.x + Math.cos(a) * d;
      _puffO.pos[1] = gy + 0.35;
      _puffO.pos[2] = pos.z + Math.sin(a) * d;
      _puffO.vel[0] = Math.cos(a) * (0.5 + rng() * 0.6);
      _puffO.vel[1] = 0.25 + rng() * 0.3;
      _puffO.vel[2] = Math.sin(a) * (0.5 + rng() * 0.6);
      _puffO.life = 3.5 + rng() * 2.5;
      _puffO.size0 = 1.2; _puffO.size1 = 4.2 + rng() * 1.6;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.6;
      col3(0x8f8168, _puffO.col0); col3(0x7b7059, _puffO.col1);
      _puffO.alpha = 0.22 + rng() * 0.08; _puffO.grav = -0.25;
      _puffO.birthOffset = birthOffset + 1.2 + rng() * 1.2;
      particles.emit('dust', _puffO);
    }
    // explosion light + persistent smoke column + burnt hull swap. Light sits
    // 2.4 m above the hull: warm falloff over wreck/terrain without nuking
    // the hull albedo to flat orange.
    flashLight(lightStates[1], _sv.set(pos.x, cy + 3.6, pos.z),
      EXPLOSION_LIGHT_PEAK * (burn ? 0.5 : 1), Math.max(0, -birthOffset));
    // INSTANT dark smoke stalk (r7 distant-kill readability): a column of
    // dense near-black puffs already standing 4-14 m over the wreck at the
    // moment of the blast, so a 200-400 m kill shows a rising black marker
    // instead of waiting ~8 s for the slow column puffs to climb.
    for (let i = 0; i < (burn ? 6 : 12); i++) {
      const h = (i / 12) * 12 + rng() * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * (1.0 + h * 0.16);
      _puffO.pos[1] = cy + 1.5 + h;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * (1.0 + h * 0.16);
      _puffO.vel[0] = (rng() - 0.5) * 0.9; _puffO.vel[1] = 3.0 + rng() * 2.0; _puffO.vel[2] = (rng() - 0.5) * 0.9;
      _puffO.life = 5 + rng() * 3;
      _puffO.size0 = (2.0 + rng() * 1.0 + h * 0.10) * dk;
      _puffO.size1 = (6.0 + rng() * 2.5 + h * 0.22) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.0;
      if (i % 3 === 2) { col3(0x3d3934, _puffO.col0); col3(0x6e6a63, _puffO.col1); }
      else { col3(0x282420, _puffO.col0); col3(0x54514a, _puffO.col1); }
      _puffO.alpha = 0.55 + rng() * 0.15; _puffO.grav = 1.0;
      // staggered fade-in bottom-to-top: the stalk GROWS out of the fireball
      _puffO.birthOffset = birthOffset - 0.15 + (h / 14) * 0.55;
      particles.emit('smoke', _puffO);
    }
    columns.push({ key: null, pos: [pos.x, Math.max(pos.y, gy), pos.z], acc: 0, ttl: SMOKE_COLUMN_S, scale: burn ? 1.45 : 1.3 });
    capColumns();
    if (visual) {
      const delay = 0.15 + birthOffset; // birthOffset ≤ 0 when backdated
      if (delay <= 0) visual.setDestroyed({ pop: rack, ageS: -delay });
      else timers.push({ t: delay, fn: () => visual.setDestroyed({ pop: rack }) });
    }
  }

  /** Camera-distance size compensation so kills stay legible at 200-400 m. */
  function distBoost(x, y, z) {
    const cam = engineCtx && engineCtx.camera;
    if (!cam) return 1;
    _camV.set(x, y, z);
    const d = cam.position.distanceTo(_camV);
    // 1 inside 90 m, up to ~1.9 at 300 m (applied to SIZE; alpha untouched)
    return Math.pow(THREE.MathUtils.clamp(d / 90, 1, 2.4), 0.75);
  }

  /** One tick of a persistent smoke column emitter (stage-decayed). */
  function emitColumnPuff(col, birthOffset = 0) {
    // Stage decay: a fresh kill pumps thick black smoke; over the column's
    // life it thins toward pale grey wisps instead of cutting off.
    const stage = Math.min(1, Math.max(0, col.ttl / SMOKE_COLUMN_S));
    const dk = distBoost(col.pos[0], col.pos[1], col.pos[2]);
    const s = col.scale * (0.62 + 0.38 * stage) * dk;
    // 3 overlapping puffs per tick at staggered heights, the lowest born
    // right AT the flame origin so the column stays welded to the burning
    // hull (r5: base visibly detached from the wreck flame by a gap).
    // Albedo is dark-grey, never pure black — the flipbook + sun-side rim
    // shading needs reflectance to read as a lit volume against the sky.
    // r7 densify: bigger cards, faster rise, longer life — at +3-6 s the old
    // tune read as a faint wisp, not the dense dark column a fresh kill pumps.
    for (let k = 0; k < 3; k++) {
      _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * (0.8 + k * 0.5) * s;
      _puffO.pos[1] = col.pos[1] + 0.5 + rng() * (0.7 + k * 1.5);
      _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * (0.8 + k * 0.5) * s;
      _puffO.vel[0] = (rng() - 0.5) * 1.1; _puffO.vel[1] = (2.3 + 1.2 * stage) + rng() * 2.2; _puffO.vel[2] = (rng() - 0.5) * 1.1;
      _puffO.life = 7.5 + rng() * 3.5;
      _puffO.size0 = (1.8 + rng() * 0.8 + k * 0.4) * s; _puffO.size1 = (8.0 + rng() * 4.0 + k * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.8;
      const grey = rng();
      if (stage > 0.5) {
        if (grey < 0.6) { col3(0x2e2a26, _puffO.col0); col3(0x625e58, _puffO.col1); }
        else { col3(0x3b3733, _puffO.col0); col3(0x716d66, _puffO.col1); }
      } else if (grey < 0.5) { col3(0x413e3a, _puffO.col0); col3(0x7b786f, _puffO.col1); }
      else { col3(0x4c4945, _puffO.col0); col3(0x8a877f, _puffO.col1); }
      _puffO.alpha = 0.34 + 0.42 * stage; _puffO.grav = 0.35; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // flame licks at the base (rarer as the fire burns down) — the smoke
    // column's origin must visibly BE the fire, not float above it
    if (rng() < 0.3 + 0.4 * stage) {
      _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 0.9; _puffO.pos[1] = col.pos[1] + 0.7; _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 0.9;
      _puffO.vel[0] = (rng() - 0.5); _puffO.vel[1] = 2.2 + rng() * 2.2; _puffO.vel[2] = (rng() - 0.5);
      _puffO.life = 0.4 + rng() * 0.35;
      _puffO.size0 = 0.6 * col.scale * dk; _puffO.size1 = 1.6 * col.scale * dk;
      col3(0xffcf70, _puffO.col0); col3(0xff5a10, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = 2.5; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
  }

  /**
   * Smolder-stage tick (after the main column burns out): thin grey wisps +
   * the odd ember fleck, so the wreck keeps marking the battlefield instead
   * of going cold the moment the column emitter dies (r7 aftermath critique).
   */
  function emitSmolderPuff(col) {
    const k = Math.max(0, col.smolder / SMOKE_SMOLDER_S); // 1 -> 0 over the tail
    const dk = distBoost(col.pos[0], col.pos[1], col.pos[2]);
    _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.4;
    _puffO.pos[1] = col.pos[1] + 0.6 + rng() * 0.8;
    _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.4;
    _puffO.vel[0] = (rng() - 0.5) * 0.8 + 0.3; _puffO.vel[1] = 1.2 + rng() * 1.2; _puffO.vel[2] = (rng() - 0.5) * 0.8;
    _puffO.life = 5 + rng() * 3;
    _puffO.size0 = (0.9 + rng() * 0.5) * dk; _puffO.size1 = (4.0 + rng() * 2.0) * dk;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.6;
    col3(0x4a4642, _puffO.col0); col3(0x7e7a73, _puffO.col1);
    _puffO.alpha = 0.14 + 0.20 * k; _puffO.grav = 0.3; _puffO.birthOffset = 0;
    particles.emit('smoke', _puffO);
    // occasional ember fleck popping off the hot hull
    if (rng() < 0.25 + 0.3 * k) {
      _strkO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.2;
      _strkO.pos[1] = col.pos[1] + 0.5;
      _strkO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.2;
      _strkO.vel[0] = (rng() - 0.5) * 1.5; _strkO.vel[1] = 2 + rng() * 2.5; _strkO.vel[2] = (rng() - 0.5) * 1.5;
      _strkO.life = 0.5 + rng() * 0.5;
      _strkO.width = 0.02 + rng() * 0.015; _strkO.stretch = 0.03; _strkO.grav = -9;
      col3(0xffb060, _strkO.col); _strkO.alpha = 0.7; _strkO.seed = rng(); _strkO.birthOffset = 0;
      particles.emit('sparks', _strkO);
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Enforce MAX_COLUMNS by retiring the lowest-remaining-ttl emitter. */
  function capColumns() {
    while (columns.length > MAX_COLUMNS) {
      let low = 0;
      for (let i = 1; i < columns.length; i++) {
        if (columns[i].ttl < columns[low].ttl) low = i;
      }
      columns.splice(low, 1);
    }
  }

  const _due = []; // reused timer-fire scratch (cleared after each use)

  const fx = {
    group,

    /**
     * Per-render-frame advance: particle clock, timers, lights, smoke columns,
     * and tracer ribbons rebuilt from live shell entities.
     * @param {number} dt render delta seconds
     * @param {object[]} shells live ShellEntity[] (§2.5)
     * @param {THREE.Camera} camera active camera (billboarding is GPU-side; unused)
     */
    update(dt, shells, camera) {
      particles.update(dt);
      if (!frozen) {
        // one-shot timers (module-scope scratch — timer callbacks can re-enter
        // fx spawn paths, so _due is length-cleared again AFTER the fire loop
        // and never retains dead closures)
        if (timers.length) {
          _due.length = 0;
          for (const tm of timers) { tm.t -= dt; if (tm.t <= 0) _due.push(tm); }
          if (_due.length) {
            timers = timers.filter((tm) => tm.t > 0);
            for (const tm of _due) tm.fn();
            _due.length = 0;
          }
        }
        // lights
        for (const st of lightStates) {
          if (st.age < st.dur) { st.age += dt; applyLight(st); }
          else if (st.light.intensity !== 0) st.light.intensity = 0;
        }
        // shockwave rings
        for (const r of shockRings) {
          if (r.age < SHOCK_DUR) { r.age += dt; applyShockRing(r); }
          else if (r.mesh.visible) { r.mesh.visible = false; r.mat.opacity = 0; }
        }
        // muzzle pressure rings
        for (const r of muzzleRings) {
          if (r.age < MUZZLE_RING_DUR) { r.age += dt; applyMuzzleRing(r); }
          else if (r.mesh.visible) { r.mesh.visible = false; r.mat.opacity = 0; }
        }
        // burning-wreck flicker: while the explosion light is idle, park it
        // over the newest smoke column so fires read as living light sources
        const exSt = lightStates[1];
        if (exSt.age >= exSt.dur && columns.length) {
          const col = columns[columns.length - 1];
          explosionLight.position.set(col.pos[0], col.pos[1] + 2.2, col.pos[2]);
          const t = particles.getTime();
          explosionLight.intensity = (4.6 + 2.4 * Math.sin(t * 13.7) + 1.7 * Math.sin(t * 7.1 + 1.9)) * col.scale;
        }
        // smoke columns (main stage), then a long smolder tail on the wreck
        if (columns.length) {
          let compact = false;
          for (const col of columns) {
            if (col.ttl > 0) {
              col.ttl -= dt;
              if (col.ttl <= 0) { col.ttl = 0; col.smolder = SMOKE_SMOLDER_S; col.acc = 0; continue; }
              col.acc += dt;
              while (col.acc >= COLUMN_TICK_S) { col.acc -= COLUMN_TICK_S; emitColumnPuff(col); }
            } else {
              col.smolder = (col.smolder === undefined ? SMOKE_SMOLDER_S : col.smolder) - dt;
              if (col.smolder <= 0) { compact = true; continue; }
              col.acc += dt;
              while (col.acc >= 0.45) { col.acc -= 0.45; emitSmolderPuff(col); }
            }
          }
          if (compact) columns = columns.filter((c) => c.ttl > 0 || c.smolder > 0);
        }
      }
      // tracer ribbons — live shells first, then fading afterglow trails
      // (an APFSDS crosses the whole engagement in ~0.2 s; without the
      // lingering trail almost no 60 fps frame ever caught a streak),
      // then composer statics
      let n = 0;
      const shellCount = shells ? shells.length : 0;
      for (let i = 0; i < shellCount && n < MAX_TRACERS; i++) {
        const sh = shells[i];
        if (sh.dead) continue;
        const preset = TRACER_PRESETS[sh.spec && sh.spec.tracer] || TRACER_PRESETS.AP;
        const speed = sh.vel.length();
        // 5-11 m bright bolt head, always readable in a single frame (clamped
        // so a fresh shell's tail never pokes back out of the muzzle)
        const len = Math.min(THREE.MathUtils.clamp(speed * 0.012, 5, 11),
          Math.max(sh.distM || 0, 2));
        _v1.copy(sh.vel).normalize();
        _v2.copy(sh.pos).addScaledVector(_v1, -len);
        col3(preset.core, _coreArr); col3(preset.glow, _glowArr);
        // enemy fire reads at 2x width/brightness — battlefield legibility
        let wide = sh.isPlayer ? 1 : 2.0;
        let bright = sh.isPlayer ? 1.15 : 1.6;
        // dead-astern boost: a ribbon seen within ~15° of the bore axis is
        // foreshortened to a dot — widen/brighten so the player's own shot
        // stays readable from the default chase camera (r5: invisible)
        if (camera) {
          _camV.copy(sh.pos).sub(camera.position);
          const cl = _camV.length();
          if (cl > 1e-4) {
            const k = THREE.MathUtils.smoothstep(Math.abs(_camV.dot(_v1)) / cl, 0.9, 0.995);
            wide *= 1 + 2.6 * k;
            bright *= 1 + 0.9 * k;
          }
        }
        writeTracer(n++, _v2.x, _v2.y, _v2.z, sh.pos.x, sh.pos.y, sh.pos.z,
          preset.width * wide, bright, _coreArr, _glowArr);
        // dim PATH ribbon: a short exponential-feeling tail behind the bright
        // bolt (the tracer ribbon's built-in head->tail gradient does the
        // fade). Capped at ~28 m (was 80) and thinner/dimmer — the r6 kill
        // frame showed the 80 m ribbon as a full-flight-path laser beam.
        // Clamped by distM so it never pokes back out of the muzzle.
        const pathLen = Math.min(speed * 0.025, 28, sh.distM || 0);
        _v3.copy(sh.pos).addScaledVector(_v1, -pathLen);
        if (n < MAX_TRACERS) {
          writeTracer(n++, _v3.x, _v3.y, _v3.z, _v2.x, _v2.y, _v2.z,
            preset.width * wide * 1.1, bright * 0.18, _coreArr, _glowArr);
        }
        // record/refresh the afterglow trail (full path ribbon) for this shell
        let tr = trails.get(sh.id);
        if (!tr) { tr = { d: new Float32Array(14), age: 0, seen: true }; trails.set(sh.id, tr); }
        tr.age = 0; tr.seen = true;
        const d = tr.d;
        d[0] = _v3.x; d[1] = _v3.y; d[2] = _v3.z; d[3] = sh.pos.x; d[4] = sh.pos.y; d[5] = sh.pos.z;
        d[6] = preset.width * wide; d[7] = bright * 0.5;
        d[8] = _coreArr[0]; d[9] = _coreArr[1]; d[10] = _coreArr[2];
        d[11] = _glowArr[0]; d[12] = _glowArr[1]; d[13] = _glowArr[2];
      }
      // afterglow: trails not refreshed this frame fade out over TRAIL_S
      if (trails.size) {
        for (const [id, tr] of trails) {
          if (tr.seen) { tr.seen = false; continue; }
          if (!frozen) tr.age += dt;
          if (tr.age >= TRAIL_S) { trails.delete(id); continue; }
          if (n >= MAX_TRACERS) continue;
          const k = 1 - tr.age / TRAIL_S;
          const d = tr.d;
          _trailCore[0] = d[8]; _trailCore[1] = d[9]; _trailCore[2] = d[10];
          _trailGlow[0] = d[11]; _trailGlow[1] = d[12]; _trailGlow[2] = d[13];
          // no width growth (was *(1 + age*2.2)): the widening made the dying
          // streak read as a thick persistent beam instead of a fading trail
          writeTracer(n++, d[0], d[1], d[2], d[3], d[4], d[5],
            d[6], d[7] * k * k,
            _trailCore, _trailGlow);
        }
      }
      for (let i = 0; i < staticTracers.length && n < MAX_TRACERS; i++) {
        const t = staticTracers[i];
        writeTracer(n++, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7],
          [t[8], t[9], t[10]], [t[11], t[12], t[13]]);
      }
      tracerGeo.instanceCount = n;
      if (n > 0 || tracerGeo._lastCount !== 0) {
        for (const a of [trA, trB, trCore, trGlow]) a.needsUpdate = true;
      }
      tracerGeo._lastCount = n;
    },

    /**
     * Subscribe to combat bus events (ARCHITECTURE §1.5 payloads).
     * @param {object} bus injected event bus
     */
    bindBus(bus) {
      bus.on('shell:fired', (e) => {
        _v3.set(e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]);
        _v4.set(e.dir[0], e.dir[1], e.dir[2]);
        fx.muzzleFlash(_v3, _v4, e.caliberMm);
        if (e.shellType === 'APFSDS') spawnSabotPetals(_v3, _v4);
      });
      bus.on('shell:hit', (e) => {
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        _v4.set(e.normal[0], e.normal[1], e.normal[2]);
        if (e.targetId) lastKnownPos.set(e.targetId, [e.pos[0], e.pos[1], e.pos[2]]);
        fx.impact(e.kind, _v3, _v4, e.caliberMm);
      });
      bus.on('shell:expired', (e) => {
        if (!e.hitTerrain) return;
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        dirtPlume(_v3, 76, false);
      });
      bus.on('tank:destroyed', (e) => {
        lastKnownPos.set(e.id, [e.pos[0], e.pos[1], e.pos[2]]);
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        fx.destruction(_v3, null, e.cause || 'shot');
      });
      bus.on('module:state', (e) => {
        // de-track moment: thrown link fragments, a grinding spark burst and a
        // heavy dust kick at the running gear (the thrown-track ribbon, band
        // slump and road-wheel scatter live on the visual — tankFactory
        // setTrackState — this is the particle side of the same beat)
        if ((e.module === 'trackL' || e.module === 'trackR') && e.state === 'red') {
          const p = lastKnownPos.get(e.id);
          if (!p) return;
          _v3.set(p[0], p[1], p[2]);
          sparkFan(_v3, _UP, 14, 11, 1.2, 0xffce8a, 0.5, 0.03, 0.03, 0, 0.12);
          // link fragments: flat dark chips whipped off the sprocket
          for (let i = 0; i < 8; i++) {
            const a = rng() * Math.PI * 2;
            _debO.pos[0] = p[0]; _debO.pos[1] = p[1] + 0.3; _debO.pos[2] = p[2];
            _debO.vel[0] = Math.cos(a) * (3.5 + rng() * 5);
            _debO.vel[1] = 3.5 + rng() * 5;
            _debO.vel[2] = Math.sin(a) * (3.5 + rng() * 5);
            _debO.life = 1.6; _debO.scale = 0.07 + rng() * 0.08; _debO.spin = 14 + rng() * 16;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(p[0], p[2]); _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          // low grinding dust burst rolling out from under the hull
          for (let i = 0; i < 12; i++) {
            const a = rng() * Math.PI * 2;
            _puffO.pos[0] = p[0] + (rng() - 0.5) * 1.6;
            _puffO.pos[1] = p[1] + 0.25;
            _puffO.pos[2] = p[2] + (rng() - 0.5) * 1.6;
            _puffO.vel[0] = Math.cos(a) * (1.5 + rng() * 2.5); _puffO.vel[1] = 0.8 + rng(); _puffO.vel[2] = Math.sin(a) * (1.5 + rng() * 2.5);
            _puffO.life = 1.3 + rng() * 1.0;
            _puffO.size0 = 0.5; _puffO.size1 = 2.3 + rng() * 1.0;
            _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
            col3(0x9a8a68, _puffO.col0); col3(0x857a60, _puffO.col1);
            _puffO.alpha = 0.42; _puffO.grav = -0.4; _puffO.birthOffset = -rng() * 0.15;
            particles.emit('dust', _puffO);
          }
        }
      });
      bus.on('tank:fire', (e) => {
        if (e.burning) {
          const p = lastKnownPos.get(e.id);
          if (!p) return;
          // one column per tank id; refresh if already burning
          const existing = columns.find((c) => c.key === e.id);
          if (existing) existing.ttl = SMOKE_COLUMN_S;
          else { columns.push({ key: e.id, pos: [p[0], p[1], p[2]], acc: 0, ttl: SMOKE_COLUMN_S, scale: 0.8 }); capColumns(); }
        } else {
          columns = columns.filter((c) => c.key !== e.id);
        }
      });
    },

    /**
     * Muzzle flash: light + additive flash cards + smoke ring + ground dust.
     * @param {THREE.Vector3} pos muzzle tip (world)
     * @param {THREE.Vector3} dir unit fire direction
     * @param {number} caliberMm gun caliber (scales the effect)
     */
    muzzleFlash(pos, dir, caliberMm) {
      const lightK = spawnMuzzleFlash(pos, dir, caliberMm, 0);
      // At the tip, ~0.45 m above the bore (was 0.7 m downrange): the light
      // must paint the barrel TUBE warm so the flash visibly hangs off the
      // gun — pushed forward it lit only air/ground and a dark thin barrel
      // read as bare next to a detached blob (r6 canonical-frame critical).
      _sv.copy(pos).addScaledVector(dir, 0.1);
      _sv.y += 0.45;
      flashLight(lightStates[0], _sv, MUZZLE_LIGHT_PEAK * lightK, 0);
    },

    /**
     * Armor / terrain impact effect selected by HitEvent.kind.
     * @param {string} kind HitEvent.kind (§2.6)
     * @param {THREE.Vector3} pos impact point (world)
     * @param {THREE.Vector3} normal outward surface normal
     * @param {number} caliberMm shell caliber
     */
    impact(kind, pos, normal, caliberMm) {
      const s = calScale(caliberMm);
      switch (kind) {
        case 'pen': {
          // layered penetration (r6: "a single small star sprite"):
          // flash core + directional spall cone off the plate normal +
          // wide secondary fan + dust/smoke ring + lingering crater glow
          hitFlash(pos, normal, s, 0xffffff, 0xffa030);
          // dust ring puffing out radially in the armor plane (before the
          // sparkFans — they clobber the shared _v1/_v2 basis)
          basisFrom(normal, _v1, _v2);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + rng() * 0.6;
            const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
            const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
            const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
            _puffO.pos[0] = pos.x + rx * 0.3 + normal.x * 0.1;
            _puffO.pos[1] = pos.y + ry * 0.3 + normal.y * 0.1;
            _puffO.pos[2] = pos.z + rz * 0.3 + normal.z * 0.1;
            _puffO.vel[0] = rx * (3 + rng() * 2.5) + normal.x * 0.8;
            _puffO.vel[1] = ry * (3 + rng() * 2.5) + normal.y * 0.8 + 0.5;
            _puffO.vel[2] = rz * (3 + rng() * 2.5) + normal.z * 0.8;
            _puffO.life = 0.7 + rng() * 0.5;
            _puffO.size0 = 0.30 * s; _puffO.size1 = (1.2 + rng() * 0.6) * s;
            _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
            col3(0x8f8272, _puffO.col0); col3(0x6f675c, _puffO.col1);
            _puffO.alpha = 0.4; _puffO.grav = 0.3; _puffO.birthOffset = 0;
            particles.emit('dust', _puffO);
          }
          // brief incandescent crater glow pinned at the hole
          _puffO.pos[0] = pos.x + normal.x * 0.08; _puffO.pos[1] = pos.y + normal.y * 0.08; _puffO.pos[2] = pos.z + normal.z * 0.08;
          _puffO.vel[0] = 0; _puffO.vel[1] = 0; _puffO.vel[2] = 0;
          _puffO.life = 0.5;
          _puffO.size0 = 0.42 * s; _puffO.size1 = 0.30 * s;
          _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
          col3(0xffb050, _puffO.col0); col3(0xa2300a, _puffO.col1);
          _puffO.alpha = 0.85; _puffO.grav = 0; _puffO.birthOffset = 0;
          particles.emit('fire', _puffO);
          // tight bright spall cone + wide dimmer secondary fan
          sparkFan(pos, normal, 22, 26 * s, 0.45, 0xffd27e, 0.55, 0.032, 0.03, 0, 0.1);
          sparkFan(pos, normal, 14, 14 * s, 1.05, 0xffb860, 0.75, 0.024, 0.022, 0, 0.15);
          impactSmoke(pos, normal, 5, 1.1 * s, 0x2e2c2a, 0x5a5854, 0.65);
          break;
        }
        case 'he_pen':
          hitFlash(pos, normal, s * 1.3, 0xffffff, 0xff7018);
          heFireball(pos, caliberMm);
          sparkFan(pos, normal, 22, 18 * s, 1.1, 0xffc060, 0.8, 0.035, 0.028);
          break;
        case 'nonpen':
          sparkFan(pos, normal, 22, 20 * s, 0.9, 0xffd884, 0.55, 0.025, 0.022);
          impactSmoke(pos, normal, 4, 0.8 * s, 0x8a867e, 0xa7a49c, 0.45);
          break;
        case 'ricochet': {
          // elongated deflection streaks skimming along the plate
          basisFrom(normal, _v1, _v2);
          for (let i = 0; i < 8; i++) {
            const a = rng() * Math.PI * 2;
            const v = 30 + rng() * 25;
            _strkO.pos[0] = pos.x; _strkO.pos[1] = pos.y; _strkO.pos[2] = pos.z;
            _strkO.vel[0] = (normal.x * 0.35 + _v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * v;
            _strkO.vel[1] = (normal.y * 0.35 + _v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * v;
            _strkO.vel[2] = (normal.z * 0.35 + _v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * v;
            _strkO.life = 0.28 + rng() * 0.25;
            _strkO.width = 0.03; _strkO.stretch = 0.05; _strkO.grav = -21.6;
            col3(0xffe0a0, _strkO.col); _strkO.alpha = 1.0; _strkO.seed = rng(); _strkO.birthOffset = 0;
            particles.emit('sparks', _strkO);
          }
          sparkFan(pos, normal, 8, 12 * s, 1.1, 0xffcf80, 0.4, 0.02, 0.02);
          break;
        }
        case 'spaced_absorb':
          hitFlash(pos, normal, s * 0.7, 0xffe9b0, 0xff9040);
          sparkFan(pos, normal, 10, 12 * s, 1.0, 0xffce7a, 0.45, 0.022, 0.02);
          impactSmoke(pos, normal, 3, 0.7 * s, 0x77746e, 0x93908a, 0.4);
          break;
        case 'era': {
          // reactive tile pop: sharp directed blast + brick fragments
          hitFlash(pos, normal, s * 1.4, 0xffffff, 0xff6a10);
          sparkFan(pos, normal, 26, 24 * s, 0.8, 0xffc860, 0.6, 0.03, 0.026);
          impactSmoke(pos, normal, 6, 1.3 * s, 0x35322f, 0x605d58, 0.7);
          for (let i = 0; i < 4; i++) {
            _debO.pos[0] = pos.x; _debO.pos[1] = pos.y; _debO.pos[2] = pos.z;
            _debO.vel[0] = normal.x * (10 + rng() * 8) + (rng() - 0.5) * 6;
            _debO.vel[1] = normal.y * (10 + rng() * 8) + 4 + rng() * 4;
            _debO.vel[2] = normal.z * (10 + rng() * 8) + (rng() - 0.5) * 6;
            _debO.life = 1.8; _debO.scale = 0.12 + rng() * 0.08; _debO.spin = 10 + rng() * 15;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(pos.x, pos.z); _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          break;
        }
        case 'he_splash':
          heFireball(pos, caliberMm);
          if (pos.y - groundY(pos.x, pos.z) < 2.5) dirtPlume(pos, caliberMm, true);
          break;
        case 'terrain':
          dirtPlume(pos, caliberMm, caliberMm >= 105);
          break;
        default:
          sparkFan(pos, normal, 10, 12 * s, 1.0, 0xffd884, 0.5, 0.025, 0.022);
          break;
      }
    },

    /**
     * Stamp a persistent armor-scar decal onto a struck vehicle at a
     * penetration (or heavy non-pen) point. The pooled quad is re-parented
     * into the tank's root so it rides the hull afterwards.
     * @param {object} visual TankVisual (needs .root)
     * @param {THREE.Vector3} pos world impact point
     * @param {THREE.Vector3} normal outward surface normal (world)
     * @param {number} caliberMm scales the scar
     */
    armorScar(visual, pos, normal, caliberMm) {
      if (!visual || !visual.root) return;
      const m = scarMeshes[scarCursor];
      scarCursor = (scarCursor + 1) % MAX_SCARS;
      const root = visual.root;
      root.updateMatrixWorld(true);
      if (m.parent !== root) { if (m.parent) m.parent.remove(m); root.add(m); }
      // world -> hull-local position, lifted slightly off the plate
      _v1.copy(pos).addScaledVector(normal, 0.04);
      root.worldToLocal(m.position.copy(_v1));
      // world normal -> hull-local orientation (plane faces +Z)
      _scarQ.copy(root.quaternion).invert();
      _v2.copy(normal).applyQuaternion(_scarQ).normalize();
      m.quaternion.setFromUnitVectors(_Z, _v2);
      _scarQ2.setFromAxisAngle(_v2, rng() * Math.PI * 2);
      m.quaternion.premultiply(_scarQ2);
      m.scale.setScalar(0.30 * calScale(caliberMm) * (0.8 + rng() * 0.5));
      m.visible = true;
    },

    /**
     * Vehicle destruction: fireball, debris, persistent smoke column; calls
     * visual.setDestroyed() at t ≈ 0.15 s when visual given (turret pop only
     * on ammo-rack kills).
     * @param {THREE.Vector3} pos hull center (world)
     * @param {object|null} visual TankVisual or null
     * @param {'ammorack'|'shot'|'fire'} [cause] kill cause (varies the show)
     */
    destruction(pos, visual, cause = 'ammorack') {
      spawnDestruction(pos, visual, 0, cause);
    },

    /**
     * Track dust kicked up while driving. Call per frame per track; internally
     * probability-gated by intensity so callers need no rate limiting.
     * @param {THREE.Vector3} pos track contact point (world)
     * @param {THREE.Vector3} dir hull motion direction (unit-ish)
     * @param {number} intensity 0..1 from |speed| / topSpeed
     */
    dust(pos, dir, intensity) {
      if (intensity <= 0.02) return;
      // surface type: dirt roads ('hard') kick 2x rooster tails, soft marsh mud less
      const gt = heightField && heightField.getGroundType
        ? heightField.getGroundType(pos.x, pos.z) : 'medium';
      const surf = gt === 'hard' ? 1.9 : (gt === 'soft' ? 0.7 : 1);
      if (rng() > intensity * 0.85 * surf) return;
      const gy = groundY(pos.x, pos.z);
      // ground-tinted media (r5: desert-sand cloud over green grass): packed
      // dirt roads throw warm tan, turf/loam a desaturated grey-earth, marsh
      // mud a dark umber — never one homogeneous sand color everywhere.
      let c0, c1;
      if (gt === 'hard') { c0 = 0xb4a181; c1 = 0x99896d; }
      else if (gt === 'soft') { c0 = 0x6e6353; c1 = 0x5d554a; }
      else { c0 = 0x898371; c1 = 0x757060; }
      // per-puff turbulence: randomized scale/opacity so the wake is a mix of
      // small dense kicks and big thin veils, not one uniform fog mass
      const kSize = 0.6 + rng() * 0.85;
      const kA = 0.55 + rng() * 0.7;
      // rooster-tail wake: kicked up-and-back off the sprocket, big and
      // long-lived so a moving tank drags a hanging dust cloud. r7: the wake
      // was practically invisible driving straight on the dirt road — same-hue
      // low puffs vanished against the road texture. The plume now RISES
      // (2-4 m/s at speed) so it silhouettes against the background, and dry
      // 'hard' surfaces read a shade lighter than the packed road they hang
      // over.
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.7;
      _puffO.pos[1] = Math.max(pos.y, gy) + 0.5 + rng() * 0.4;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.7;
      _puffO.vel[0] = -dir.x * (2.4 + rng() * 2.8) + (rng() - 0.5) * 1.4 + 0.35;
      _puffO.vel[1] = 1.0 + (1.7 + rng() * 1.7) * intensity;
      _puffO.vel[2] = -dir.z * (2.4 + rng() * 2.8) + (rng() - 0.5) * 1.4;
      _puffO.life = 2.4 + rng() * 1.8;
      // continuous onset: size AND alpha ramp with intensity from near-zero
      // (r5: zero dust at speed, then a huge opaque cloud one second later)
      _puffO.size0 = (0.5 + intensity * 0.95) * kSize * Math.min(surf, 1.4);
      _puffO.size1 = (2.6 + intensity * 5.2 + rng() * 1.4) * kSize * Math.min(surf, 1.4);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(c0, _puffO.col0); col3(c1, _puffO.col1);
      _puffO.alpha = (0.16 + 0.44 * intensity) * kA * Math.min(surf, 1.25);
      _puffO.grav = -0.28; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    },

    /**
     * Engine exhaust puff. Probability-gated like dust().
     * Default is the LIGHT profile (near-transparent warm grey, fast
     * dissipation) — correct for gas-turbine/modern powerpacks. Pass
     * sooty=true for WWII diesels to keep the darker puffing character
     * (r6: the Abrams dragged black soot blobs that hung against the sky).
     * @param {THREE.Vector3} pos exhaust stack tip (world)
     * @param {number} intensity 0..1 engine load
     * @param {boolean} [sooty=false] dark diesel puffs instead of thin haze
     */
    exhaust(pos, intensity, sooty = false) {
      if (rng() > 0.25 + intensity * 0.45) return;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = pos.y; _puffO.pos[2] = pos.z;
      _puffO.vel[0] = (rng() - 0.5) * 0.5;
      _puffO.vel[1] = 1.2 + rng() * 1.2 + intensity;
      _puffO.vel[2] = (rng() - 0.5) * 0.5;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      if (sooty) {
        // diesel: dark puffs, but shorter-lived and thinner than the r5 tune
        // so they shear apart instead of lingering high against the sky
        _puffO.life = 0.6 + rng() * 0.6;
        _puffO.size0 = 0.18 + intensity * 0.15;
        _puffO.size1 = 0.9 + intensity * 0.8;
        col3(0x45423e, _puffO.col0); col3(0x767470, _puffO.col1);
        _puffO.alpha = 0.13 + 0.16 * intensity;
      } else {
        // turbine: a faint hot shimmer-grey that dissipates in under a second
        _puffO.life = 0.35 + rng() * 0.4;
        _puffO.size0 = 0.16 + intensity * 0.12;
        _puffO.size1 = 0.7 + intensity * 0.6;
        col3(0x8d8b86, _puffO.col0); col3(0x9a9894, _puffO.col1);
        _puffO.alpha = 0.06 + 0.08 * intensity;
      }
      _puffO.grav = 0.5; _puffO.birthOffset = 0;
      particles.emit('smoke', _puffO);
    },

    /**
     * Freeze/unfreeze all fx (particle clock, timers, emitters, lights).
     * @param {boolean} f
     * @param {number|null} [atTimeS] pin the shared clock to this time
     */
    setFrozen(f, atTimeS = null) {
      frozen = f;
      particles.setFrozen(f, atTimeS);
    },

    /**
     * Re-seed the deterministic effect RNG.
     * @param {number} newSeed
     */
    resetSeed(newSeed) {
      rng = mulberry32(newSeed);
    },

    /** Kill all particles, tracers, decals, timers, emitters and lights. */
    resetAll() {
      particles.resetAll();
      staticTracers.length = 0;
      trails.clear();
      tracerGeo.instanceCount = 0;
      timers = [];
      columns = [];
      lastKnownPos.clear();
      for (const m of scorchMeshes) m.visible = false;
      scorchCursor = 0;
      for (const r of shockRings) { r.age = Infinity; r.mesh.visible = false; r.mat.opacity = 0; }
      shockCursor = 0;
      for (const r of muzzleRings) { r.age = Infinity; r.mesh.visible = false; r.mat.opacity = 0; }
      muzzleRingCursor = 0;
      for (const m of scarMeshes) { m.visible = false; if (m.parent) m.parent.remove(m); }
      scarCursor = 0;
      for (const st of lightStates) { st.age = Infinity; st.light.intensity = 0; }
    },

    /**
     * Deterministic screenshot composer: a firing moment frozen at ageS —
     * muzzle flash + smoke ring + tracer streak already down-range.
     * @param {{ muzzlePos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number,
     *           tracerType: string, ageS: number }} o
     */
    composeFiringMoment({ muzzlePos, dir, caliberMm, tracerType, ageS }) {
      const preset = TRACER_PRESETS[tracerType] || TRACER_PRESETS.AP;
      const vel = COMPOSE_VELOCITY[tracerType] || 800;
      // reach 0.55: the combat_firing camera has ~3.5 m of clear down-range
      // before the frame edge; the jet cone is compressed to sit inside it
      spawnMuzzleFlash(muzzlePos, dir, caliberMm, -ageS, 0.55);
      if (tracerType === 'APFSDS') spawnSabotPetals(muzzlePos, dir, -ageS);
      // shell position at ageS, tracer streak trailing back toward the muzzle.
      // Head capped at 2.2 m: clearly departed the barrel (a visible shot,
      // not an inert flash) yet still inside the combat_firing frame.
      // Width/brightness CUT HARD from r5 (2.2x/1.0 + a 3.0x/0.75 bridge):
      // those two fat additive ribbons out-shone the flash itself, so the
      // frame's brightest mass floated 1.5-3 m downrange of a bare barrel tip
      // (r6 critical). The tracer is now a slim bolt; the boosted core/jets
      // at the bore own the center-of-brightness.
      const headDist = Math.min(vel * ageS, 1.7);
      const len = Math.min(THREE.MathUtils.clamp(vel * 0.02, 2, 12), headDist - 0.55);
      _v1.copy(muzzlePos).addScaledVector(dir, headDist);
      _v2.copy(muzzlePos).addScaledVector(dir, Math.max(headDist - len, 0.3));
      col3(preset.core, _coreArr); col3(preset.glow, _glowArr);
      // ONE slim bolt (r7: the 1.3x/0.8 + 1.2x/0.32 pair read as multiple
      // simultaneous tracers from a single shot). The flash core owns the
      // frame's brightest pixels; the bolt just says "departed".
      staticTracers.push([
        _v2.x, _v2.y, _v2.z, _v1.x, _v1.y, _v1.z, preset.width * 1.05, 0.62,
        _coreArr[0], _coreArr[1], _coreArr[2], _glowArr[0], _glowArr[1], _glowArr[2],
      ]);
      // muzzle light state at ageS — still glowing at 50 ms (dur 120 ms).
      // Pulled BACK onto the tube (muzzle - 0.9 m, +0.4 up): it must paint
      // the barrel itself warm so the composed frame reads flash-ON-gun even
      // where the thin tube crosses a dark backdrop (r6 critical).
      _sv.copy(muzzlePos).addScaledVector(dir, -0.9);
      _sv.y += 0.4;
      flashLight(lightStates[0], _sv, MUZZLE_LIGHT_PEAK, ageS);
    },

    /**
     * Deterministic screenshot composer: a destruction frozen at ageS —
     * fireball + debris mid-flight + smoke column establishing.
     * @param {{ pos: THREE.Vector3, ageS: number }} o
     */
    composeExplosionMoment({ pos, ageS }) {
      if (!window.__FX_SKIP_DESTRUCTION) spawnDestruction(pos, null, -ageS);
      // pre-seed the smoke column puffs that would have been emitted by now
      const col = columns[columns.length - 1];
      if (col) {
        const ticks = Math.floor(ageS / COLUMN_TICK_S);
        for (let i = 0; i < ticks; i++) {
          // backdated births so the column reads as ageS old when frozen
          emitColumnPuff(col, -(ageS - (i + 1) * COLUMN_TICK_S));
        }
        col.ttl = SMOKE_COLUMN_S - ageS;
      }
      // light above the hull: terrain and wreck catch warm falloff without
      // the hull saturating to flat emissive orange
      flashLight(lightStates[1], _sv.set(pos.x, pos.y + 3.8, pos.z), EXPLOSION_LIGHT_PEAK, ageS);
    },
  };

  return fx;
}
