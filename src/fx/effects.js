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
import { createParticleSystem, mulberry32 } from './particles.js';

// ---------------------------------------------------------------------------
// Tracer presets (shells-ballistics §10 — colors/widths verbatim)
// ---------------------------------------------------------------------------

const TRACER_PRESETS = {
  AP:     { core: 0xffd27a, glow: 0xff9030, width: 0.10 },
  APCR:   { core: 0xe8f4ff, glow: 0x9cc8ff, width: 0.06 },
  HEAT:   { core: 0xff6a3c, glow: 0xff3020, width: 0.12 },
  HE:     { core: 0xffb02e, glow: 0xffe080, width: 0.18 },
  HESH:   { core: 0xffc46b, glow: 0xffa040, width: 0.16 },
  APFSDS: { core: 0xc8ffd8, glow: 0x60ff90, width: 0.05 },
};

// Nominal muzzle velocities used ONLY by composeFiringMoment (m/s)
const COMPOSE_VELOCITY = { AP: 800, APCR: 1050, HEAT: 780, HE: 750, HESH: 780, APFSDS: 1700 };

const MAX_TRACERS = 96;
const MUZZLE_LIGHT_S = 0.09;   // long enough to still kiss the hull at the 50 ms composed frame
const MUZZLE_LIGHT_PEAK = 520; // hot enough to visibly light barrel, hull front and ground
const EXPLOSION_LIGHT_S = 1.1; // fireball glow lingers, lights the wreck at 0.6 s
// 190 (was 480): warm falloff on terrain/wreck WITHOUT saturating the whole
// hull to emissive orange ("dipped in lava" r1 critique)
const EXPLOSION_LIGHT_PEAK = 190;
const SMOKE_COLUMN_S = 30;

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
 * Soft annulus for the expanding shockwave ring: bright band with feathered
 * inner/outer edges. Alpha-only payload.
 * @returns {THREE.CanvasTexture}
 */
function makeShockRingTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(0.74, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.9)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
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
  const muzzleLight = new THREE.PointLight(0xffb45a, 0, 24, 2);
  const explosionLight = new THREE.PointLight(0xff9550, 0, 42, 2);
  muzzleLight.castShadow = false;
  explosionLight.castShadow = false;
  group.add(muzzleLight, explosionLight);
  const lightStates = [
    { light: muzzleLight, age: Infinity, dur: MUZZLE_LIGHT_S, peak: MUZZLE_LIGHT_PEAK },
    { light: explosionLight, age: Infinity, dur: EXPLOSION_LIGHT_S, peak: EXPLOSION_LIGHT_PEAK },
  ];

  function applyLight(state) {
    const k = Math.max(0, 1 - state.age / state.dur);
    state.light.intensity = state.peak * k * k;
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
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
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

  // --- shockwave rings (pooled, ground-aligned, first ~450 ms of a blast) ----
  const SHOCK_DUR = 0.45;
  const shockTex = makeShockRingTexture();
  const shockGeo = new THREE.CircleGeometry(1, 48);
  shockGeo.rotateX(-Math.PI / 2); // face up
  const shockRings = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockTex,
      color: 0xffdfb8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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
    r.mesh.scale.setScalar(1.6 + 10.5 * k);
    r.mat.opacity = 0.55 * Math.pow(1 - t, 1.6);
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
   * @param {number} reach forward-extent multiplier for the BRIGHT elements
   *   (tongues/spears). 1 for live fire; the screenshot composer passes <1 so
   *   the frozen cone stays inside the combat_firing frame instead of
   *   clipping the screen edge as a blown-out sheet.
   */
  function spawnMuzzleFlash(pos, dir, caliberMm, birthOffset = 0, reach = 1) {
    const s = calScale(caliberMm);
    basisFrom(dir, _v1, _v2);
    // 1. blinding core PINNED to the muzzle tip — ONE compact card (the r1
    //    pair of big star sprites read as a cartoon sticker), very short.
    _puffO.pos[0] = pos.x + dir.x * 0.12; _puffO.pos[1] = pos.y + dir.y * 0.12; _puffO.pos[2] = pos.z + dir.z * 0.12;
    _puffO.vel[0] = dir.x * 1.5; _puffO.vel[1] = dir.y * 1.5; _puffO.vel[2] = dir.z * 1.5;
    _puffO.life = 0.08;
    _puffO.size0 = 0.38 * s; _puffO.size1 = 0.72 * s;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
    col3(0xffffff, _puffO.col0); col3(0xffc558, _puffO.col1);
    _puffO.alpha = 1.0; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('flash', _puffO);
    // 2. volumetric blast cone: layered noisy jet quads oriented ALONG THE
    //    BORE AXIS (not camera-facing) — one long primary jet dead on axis
    //    plus two shorter jets kicked a few degrees off it.
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
      _jetO.life = i === 0 ? 0.105 : 0.085;
      _jetO.width = (i === 0 ? 0.42 : 0.30) * s;
      _jetO.len0 = 0.5 * s;
      _jetO.len1 = (i === 0 ? 2.9 + rng() * 0.7 : 1.8 + rng() * 0.5) * s * reach;
      _jetO.seed = rng();
      col3(i === 0 ? 0xffe6b0 : 0xffcf7e, _jetO.col);
      _jetO.alpha = i === 0 ? 0.95 : 0.75; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
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
      _jetO.width = 0.20 * s;
      _jetO.len0 = 0.25 * s; _jetO.len1 = (0.9 + rng() * 0.45) * s * Math.max(reach, 0.7);
      _jetO.seed = rng();
      col3(0xffc86e, _jetO.col);
      _jetO.alpha = 0.6; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    // 3. barrel-aligned incandescent tongues — thin streak detail inside the
    //    jet cone (kept sparse; the jets carry the volume now).
    for (let i = 0; i < 4; i++) {
      const j = i < 1 ? 0 : 2.4;
      const jx = (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * j;
      const jy = (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * j;
      const jz = (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * j;
      const v = ((i < 1 ? 30 : 22) + rng() * 14) * reach;
      _strkO.pos[0] = pos.x + dir.x * 0.2; _strkO.pos[1] = pos.y + dir.y * 0.2; _strkO.pos[2] = pos.z + dir.z * 0.2;
      _strkO.vel[0] = dir.x * v + jx; _strkO.vel[1] = dir.y * v + jy; _strkO.vel[2] = dir.z * v + jz;
      _strkO.life = 0.07 + rng() * 0.05;
      _strkO.width = (0.06 + rng() * 0.05) * s; _strkO.stretch = 0.05; _strkO.grav = 0;
      col3(0xffc25e, _strkO.col); _strkO.alpha = 0.85; _strkO.seed = rng(); _strkO.birthOffset = birthOffset;
      particles.emit('sparks', _strkO);
    }
    // 4. compact orange petal cards hugging the first meter (hot-to-orange ramp)
    for (let i = 0; i < 3; i++) {
      const along = 0.35 + rng() * 0.9 * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * 0.16 * s;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * 0.16 * s;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * 0.16 * s;
      const v = 5 + rng() * 5;
      _puffO.vel[0] = dir.x * v; _puffO.vel[1] = dir.y * v; _puffO.vel[2] = dir.z * v;
      _puffO.life = 0.05 + rng() * 0.05;
      _puffO.size0 = 0.3 * s; _puffO.size1 = 0.85 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 8;
      col3(0xffe9a0, _puffO.col0); col3(0xff6a14, _puffO.col1);
      _puffO.alpha = 0.5; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
    // 5. irregular propellant donut hugging the muzzle — randomized angle,
    //    radius and forward kick so it never reads as a neat stacked ring
    //    (backdated slightly so it is readable in the 50 ms composed frame)
    const smokeBirth = birthOffset - 0.2;
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = (0.18 + rng() * 0.3) * s;
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
      _puffO.size0 = (0.32 + rng() * 0.22) * s; _puffO.size1 = (1.7 + rng() * 1.0) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xb9b2a6, _puffO.col0); col3(0x8d8a84, _puffO.col1);
      _puffO.alpha = 0.36 + rng() * 0.16; _puffO.grav = 0.7; _puffO.birthOffset = smokeBirth;
      particles.emit('smoke', _puffO);
    }
    // 6. forward cordite plume — a widening cone (lateral spread grows with
    //    distance), long-lived, expanding slowly and drifting with the wind
    for (let i = 0; i < 16; i++) {
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
      _puffO.alpha = 0.30 + rng() * 0.16; _puffO.grav = 0.5; _puffO.birthOffset = smokeBirth;
      particles.emit('smoke', _puffO);
    }
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
    sparkFan(_sv, dir, 12, 34 * s * reach, 0.22, 0xffd58a, 0.4, 0.02, 0.035, birthOffset);
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
    const s = calScale(caliberMm) * (big ? 1.5 : 1);
    const gy = groundY(pos.x, pos.z);
    const baseY = Math.max(pos.y, gy) + 0.5;
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
    // lingering low dust haze
    for (let i = 0; i < (big ? 8 : 5); i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 2.2 * s;
      _puffO.pos[0] = pos.x + Math.cos(a) * d; _puffO.pos[1] = baseY + 0.2; _puffO.pos[2] = pos.z + Math.sin(a) * d;
      _puffO.vel[0] = Math.cos(a) * (1.2 + rng()); _puffO.vel[1] = 0.7 + rng() * 0.6; _puffO.vel[2] = Math.sin(a) * (1.2 + rng());
      _puffO.life = 2.2 + rng() * 1.5;
      _puffO.size0 = 1.0 * s; _puffO.size1 = 3.4 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5);
      col3(0x9a8a68, _puffO.col0); col3(0x877a5f, _puffO.col1);
      _puffO.alpha = 0.35; _puffO.grav = -0.3; _puffO.birthOffset = birthOffset;
      particles.emit('dust', _puffO);
    }
    // dirt clods
    const clods = big ? 10 : 5;
    for (let i = 0; i < clods; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = rng() * 0.7;
      _debO.pos[0] = pos.x; _debO.pos[1] = baseY; _debO.pos[2] = pos.z;
      _debO.vel[0] = Math.cos(a) * Math.sin(tilt) * 14 * s;
      _debO.vel[1] = (9 + rng() * 9) * s;
      _debO.vel[2] = Math.sin(a) * Math.sin(tilt) * 14 * s;
      _debO.life = 2.2; _debO.scale = 0.1 + rng() * 0.12 * s; _debO.spin = 6 + rng() * 14;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
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

  /** Full vehicle destruction sequence, optionally backdated (composer). */
  function spawnDestruction(pos, visual, birthOffset = 0) {
    const gy = groundY(pos.x, pos.z);
    const cy = Math.max(pos.y, gy) + 1.2;
    // white-hot detonation core (first ~200 ms, star sprites, bloom feed)
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = 2 + rng() * 4;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.6; _puffO.pos[1] = cy + (rng() - 0.5) * 0.6; _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v + 2;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = 0.1 + rng() * 0.1;
      _puffO.size0 = 1.4 + rng(); _puffO.size1 = 3.2 + rng() * 1.2;
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
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = 3.5 + rng() * 6;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.4;
      _puffO.pos[1] = cy + (rng() - 0.55) * 1.8;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.4;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v * 0.45 + 0.9;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = 0.7 + rng() * 1.1;
      _puffO.size0 = 1.3 + rng() * 0.9; _puffO.size1 = 3.6 + rng() * 2.2;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffd865, _puffO.col0); col3(0xff3a00, _puffO.col1);
      _puffO.alpha = 0.5; _puffO.grav = 1.0; _puffO.birthOffset = birthOffset - rng() * 0.2;
      particles.emit('fire', _puffO);
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
    for (let i = 0; i < 10; i++) {
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
      _puffO.life = 2.8 + rng() * 3;
      _puffO.size0 = 1.6 + rng() * 0.5; _puffO.size1 = 5.5 + rng() * 2.5;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0x1a1816, _puffO.col0); col3(0x4d4a45, _puffO.col1);
      _puffO.alpha = 0.68 + rng() * 0.14; _puffO.grav = 1.3; _puffO.birthOffset = birthOffset - 0.25;
      particles.emit('smoke', _puffO);
    }
    // shockwave dust ring on the ground — fast, dense, clearly expanding
    const ringN = 26;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2 + rng() * 0.25;
      const rs = 2.0 + rng() * 0.6;
      _puffO.pos[0] = pos.x + Math.cos(a) * rs; _puffO.pos[1] = gy + 0.45; _puffO.pos[2] = pos.z + Math.sin(a) * rs;
      _puffO.vel[0] = Math.cos(a) * (9 + rng() * 6); _puffO.vel[1] = 1 + rng(); _puffO.vel[2] = Math.sin(a) * (9 + rng() * 6);
      _puffO.life = 1.1 + rng() * 0.7;
      _puffO.size0 = 0.8; _puffO.size1 = 3.6 + rng() * 1.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x93805f, _puffO.col0); col3(0x7d6f55, _puffO.col1);
      _puffO.alpha = 0.42 + rng() * 0.12; _puffO.grav = -0.6; _puffO.birthOffset = birthOffset;
      particles.emit('dust', _puffO);
    }
    // scorched earth: persistent soot decal projected onto the terrain
    spawnScorch(pos.x, pos.z, 5.4 + rng() * 1.4);
    // pressure shockwave: fast-expanding ground-aligned ring in the first
    // ~450 ms (additive, fades as it expands)
    spawnShockRing(pos.x, pos.z, Math.max(0, -birthOffset));
    // spark shower — glowing streaks emitted radially, arcing under gravity,
    // with randomized length/width/brightness AND staggered births so the
    // frozen frame mixes fresh leaders with drooping, dying arcs
    sparkFan(_sv.set(pos.x, cy, pos.z), _UP, 44, 21, 1.2, 0xffc470, 1.5, 0.05, 0.085, birthOffset, 0.3);
    // debris shower (irregular scorched chunks, some glowing hot) — high
    // radial speed + strong gravity so chunks read ballistic, never floating
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.85;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = Math.cos(a) * Math.sin(tilt) * (14 + rng() * 14);
      _debO.vel[1] = 5 + rng() * 13;
      _debO.vel[2] = Math.sin(a) * Math.sin(tilt) * (14 + rng() * 14);
      _debO.life = 2.5 + rng() * 1.5;
      _debO.scale = 0.08 + rng() * 0.2;
      _debO.spin = 8 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = rng() < 0.5; _debO.seed = rng(); _debO.birthOffset = birthOffset - rng() * 0.15;
      particles.emit('debris', _debO);
    }
    // three large chunks with smoke trails (sampled along the same drag
    // trajectory the debris shader integrates: k = 0.12, g = -21.6)
    for (let i = 0; i < 3; i++) {
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
    // turret pop — two heavy slabs arcing high
    for (let i = 0; i < 2; i++) {
      _debO.pos[0] = pos.x; _debO.pos[1] = cy + 0.6; _debO.pos[2] = pos.z;
      _debO.vel[0] = (rng() - 0.5) * 6; _debO.vel[1] = 14 + rng() * 8; _debO.vel[2] = (rng() - 0.5) * 6;
      _debO.life = 3.5; _debO.scale = 0.55 + rng() * 0.3; _debO.spin = 3 + rng() * 5;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = 0.2; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
    }
    // explosion light + persistent smoke column + burnt hull swap. Light sits
    // 2.4 m above the hull: warm falloff over wreck/terrain without nuking
    // the hull albedo to flat orange.
    flashLight(lightStates[1], _sv.set(pos.x, cy + 2.4, pos.z), EXPLOSION_LIGHT_PEAK, Math.max(0, -birthOffset));
    columns.push({ key: null, pos: [pos.x, Math.max(pos.y, gy), pos.z], acc: 0, ttl: SMOKE_COLUMN_S, scale: 1.3 });
    if (visual) {
      const delay = 0.15 + birthOffset; // birthOffset ≤ 0 when backdated
      if (delay <= 0) visual.setDestroyed();
      else timers.push({ t: delay, fn: () => visual.setDestroyed() });
    }
  }

  /** One tick of a persistent smoke column emitter. */
  function emitColumnPuff(col, birthOffset = 0) {
    const s = col.scale;
    _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.2 * s;
    _puffO.pos[1] = col.pos[1] + 1.6 + rng() * 0.8;
    _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.2 * s;
    _puffO.vel[0] = (rng() - 0.5) * 0.8; _puffO.vel[1] = 2.2 + rng() * 1.8; _puffO.vel[2] = (rng() - 0.5) * 0.8;
    _puffO.life = 6 + rng() * 3;
    _puffO.size0 = 1.4 * s; _puffO.size1 = (6 + rng() * 3) * s;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.8;
    col3(0x161413, _puffO.col0); col3(0x504e4a, _puffO.col1);
    _puffO.alpha = 0.72; _puffO.grav = 0.35; _puffO.birthOffset = birthOffset;
    particles.emit('smoke', _puffO);
    // occasional flame lick at the base
    if (rng() < 0.4) {
      _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 0.9; _puffO.pos[1] = col.pos[1] + 1.0; _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 0.9;
      _puffO.vel[0] = (rng() - 0.5); _puffO.vel[1] = 2 + rng() * 2; _puffO.vel[2] = (rng() - 0.5);
      _puffO.life = 0.35 + rng() * 0.3;
      _puffO.size0 = 0.6 * col.scale; _puffO.size1 = 1.4 * col.scale;
      col3(0xffcf70, _puffO.col0); col3(0xff5a10, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = 2.5; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  const fx = {
    group,

    /**
     * Per-render-frame advance: particle clock, timers, lights, smoke columns,
     * and tracer ribbons rebuilt from live shell entities.
     * @param {number} dt render delta seconds
     * @param {object[]} shells live ShellEntity[] (§2.5)
     * @param {THREE.Camera} camera active camera (billboarding is GPU-side; unused)
     */
    update(dt, shells, camera) { // eslint-disable-line no-unused-vars
      particles.update(dt);
      if (!frozen) {
        // one-shot timers
        if (timers.length) {
          const due = [];
          for (const tm of timers) { tm.t -= dt; if (tm.t <= 0) due.push(tm); }
          if (due.length) {
            timers = timers.filter((tm) => tm.t > 0);
            for (const tm of due) tm.fn();
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
        // smoke columns
        if (columns.length) {
          let compact = false;
          for (const col of columns) {
            col.ttl -= dt;
            if (col.ttl <= 0) { compact = true; continue; }
            col.acc += dt;
            while (col.acc >= 0.14) { col.acc -= 0.14; emitColumnPuff(col); }
          }
          if (compact) columns = columns.filter((c) => c.ttl > 0);
        }
      }
      // tracer ribbons — live shells first, then composer statics
      let n = 0;
      const shellCount = shells ? shells.length : 0;
      for (let i = 0; i < shellCount && n < MAX_TRACERS; i++) {
        const sh = shells[i];
        if (sh.dead) continue;
        const preset = TRACER_PRESETS[sh.spec && sh.spec.tracer] || TRACER_PRESETS.AP;
        const speed = sh.vel.length();
        const len = THREE.MathUtils.clamp(speed * 0.02, 2, 12);
        _v1.copy(sh.vel).normalize();
        _v2.copy(sh.pos).addScaledVector(_v1, -len);
        col3(preset.core, _coreArr); col3(preset.glow, _glowArr);
        writeTracer(n++, _v2.x, _v2.y, _v2.z, sh.pos.x, sh.pos.y, sh.pos.z,
          preset.width, 1, _coreArr, _glowArr);
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
        fx.destruction(_v3, null);
      });
      bus.on('tank:fire', (e) => {
        if (e.burning) {
          const p = lastKnownPos.get(e.id);
          if (!p) return;
          // one column per tank id; refresh if already burning
          const existing = columns.find((c) => c.key === e.id);
          if (existing) existing.ttl = SMOKE_COLUMN_S;
          else columns.push({ key: e.id, pos: [p[0], p[1], p[2]], acc: 0, ttl: SMOKE_COLUMN_S, scale: 0.8 });
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
      spawnMuzzleFlash(pos, dir, caliberMm, 0);
      flashLight(lightStates[0], _sv.copy(pos).addScaledVector(dir, 0.7), MUZZLE_LIGHT_PEAK, 0);
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
        case 'pen':
          hitFlash(pos, normal, s, 0xffffff, 0xffa030);
          sparkFan(pos, normal, 18, 16 * s, 1.0, 0xffc060, 0.7, 0.03, 0.025);
          impactSmoke(pos, normal, 5, 1.1 * s, 0x2e2c2a, 0x5a5854, 0.65);
          break;
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
     * Vehicle destruction: fireball, turret pop, debris, persistent smoke
     * column; calls visual.setDestroyed() at t ≈ 0.15 s when visual given.
     * @param {THREE.Vector3} pos hull center (world)
     * @param {object|null} visual TankVisual or null
     */
    destruction(pos, visual) {
      spawnDestruction(pos, visual, 0);
    },

    /**
     * Track dust kicked up while driving. Call per frame per track; internally
     * probability-gated by intensity so callers need no rate limiting.
     * @param {THREE.Vector3} pos track contact point (world)
     * @param {THREE.Vector3} dir hull motion direction (unit-ish)
     * @param {number} intensity 0..1 from |speed| / topSpeed
     */
    dust(pos, dir, intensity) {
      if (intensity <= 0.02 || rng() > intensity * 0.9) return;
      const gy = groundY(pos.x, pos.z);
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.6;
      _puffO.pos[1] = Math.max(pos.y, gy) + 0.5;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
      _puffO.vel[0] = -dir.x * (1.5 + rng() * 2) + (rng() - 0.5) * 1.2;
      _puffO.vel[1] = 0.6 + rng() * 0.9 * intensity;
      _puffO.vel[2] = -dir.z * (1.5 + rng() * 2) + (rng() - 0.5) * 1.2;
      _puffO.life = 1.1 + rng() * 1.1;
      _puffO.size0 = 0.5 + intensity * 0.5;
      _puffO.size1 = 2.2 + intensity * 2.4 + rng() * 0.8;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0xa2906c, _puffO.col0); col3(0x8d7f63, _puffO.col1);
      _puffO.alpha = 0.28 + 0.32 * intensity; _puffO.grav = -0.35; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    },

    /**
     * Engine exhaust puff. Probability-gated like dust().
     * @param {THREE.Vector3} pos exhaust stack tip (world)
     * @param {number} intensity 0..1 engine load
     */
    exhaust(pos, intensity) {
      if (rng() > 0.25 + intensity * 0.45) return;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = pos.y; _puffO.pos[2] = pos.z;
      _puffO.vel[0] = (rng() - 0.5) * 0.5;
      _puffO.vel[1] = 1.2 + rng() * 1.2 + intensity;
      _puffO.vel[2] = (rng() - 0.5) * 0.5;
      _puffO.life = 0.8 + rng() * 0.9;
      _puffO.size0 = 0.18 + intensity * 0.15;
      _puffO.size1 = 0.9 + intensity * 0.8;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x3a3835, _puffO.col0); col3(0x6f6d68, _puffO.col1);
      _puffO.alpha = 0.16 + 0.2 * intensity; _puffO.grav = 0.5; _puffO.birthOffset = 0;
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
      tracerGeo.instanceCount = 0;
      timers = [];
      columns = [];
      lastKnownPos.clear();
      for (const m of scorchMeshes) m.visible = false;
      scorchCursor = 0;
      for (const r of shockRings) { r.age = Infinity; r.mesh.visible = false; r.mat.opacity = 0; }
      shockCursor = 0;
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
      // Head capped at 2.6 m: clearly departed the barrel (a visible shot,
      // not an inert flash) yet still inside the combat_firing frame — r1
      // capped it at 0.85 m and the tracer was invisible inside the flash.
      const headDist = Math.min(vel * ageS, 2.6);
      const len = Math.min(THREE.MathUtils.clamp(vel * 0.02, 2, 12), headDist - 0.55);
      _v1.copy(muzzlePos).addScaledVector(dir, headDist);
      _v2.copy(muzzlePos).addScaledVector(dir, Math.max(headDist - len, 0.3));
      col3(preset.core, _coreArr); col3(preset.glow, _glowArr);
      staticTracers.push([
        _v2.x, _v2.y, _v2.z, _v1.x, _v1.y, _v1.z, preset.width * 2.2, 1.0,
        _coreArr[0], _coreArr[1], _coreArr[2], _glowArr[0], _glowArr[1], _glowArr[2],
      ]);
      // muzzle light state at ageS — still glowing at 50 ms (dur 90 ms) so the
      // flash visibly kisses the hull, barrel and ground in the composed frame
      flashLight(lightStates[0], _sv.copy(muzzlePos).addScaledVector(dir, 0.7), MUZZLE_LIGHT_PEAK, ageS);
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
        const ticks = Math.floor(ageS / 0.14);
        for (let i = 0; i < ticks; i++) {
          // backdated births so the column reads as ageS old when frozen
          emitColumnPuff(col, -(ageS - (i + 1) * 0.14));
        }
        col.ttl = SMOKE_COLUMN_S - ageS;
      }
      // light above the hull: terrain and wreck catch warm falloff without
      // the hull saturating to flat emissive orange
      flashLight(lightStates[1], _sv.set(pos.x, pos.y + 2.6, pos.z), EXPLOSION_LIGHT_PEAK, ageS);
    },
  };

  return fx;
}
