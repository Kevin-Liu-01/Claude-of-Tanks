/**
 * particles.js — fx-internal instanced GPU particle engine.
 *
 * InstancedBufferGeometry billboards (never THREE.Points) per graphics-aaa §9.
 * Pools (locked sizes): smoke 2048 / fire 1024 / dust 1024 / sparks 512 /
 * debris 256 (instanced shaded boxes). Fully GPU-animated: the CPU only writes
 * attribute slots into a ring buffer at emit time (partial uploads via
 * addUpdateRange). A single shared `uTime` uniform drives every pool, so
 * setFrozen() deterministically pins the whole system for screenshots.
 *
 * Zero top-level side effects — all canvas/GL work happens inside
 * createParticleSystem().
 */
import * as THREE from 'three';

/** Canonical PRNG (ARCHITECTURE §1.4). @param {number} a seed @returns {() => number} */
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const POOL_SIZES = { smoke: 2048, fire: 1024, dust: 1024, sparks: 512, debris: 256 };

// ---------------------------------------------------------------------------
// GLSL — shared helpers
// ---------------------------------------------------------------------------

const FOG_PARS_V = `
#ifdef USE_FOG
  varying float vFogDepth;
#endif
`;
const FOG_V = `
#ifdef USE_FOG
  vFogDepth = -mvPosition.z;
#endif
`;
const FOG_PARS_F = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying float vFogDepth;
#endif
`;
// Additive passes fade OUT with fog (never toward fog color).
const FOG_SCALE_F = `
#ifdef USE_FOG
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
#else
  float fogFactor = 0.0;
#endif
`;

// Ballistic displacement with exponential drag:
// x(t) = v0 * (1 - e^{-k t}) / k  (k -> 0 limit = v0 t), plus 0.5 g t^2 up.
const DISPLACE_GLSL = `
vec3 particleDisplace( vec3 vel, float grav, float age, float drag ) {
  float k = max( drag, 1e-4 );
  float s = ( 1.0 - exp( -k * age ) ) / k;
  return vel * s + vec3( 0.0, 0.5 * grav * age * age, 0.0 );
}
`;

// --- puff (smoke / fire / dust) --------------------------------------------

const PUFF_VERT = `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // vel.xyz, life
attribute vec4 aSR;   // size0, size1, rot0, rotVel
attribute vec4 aC0;   // color0.rgb, gravity (+up)
attribute vec4 aC1;   // color1.rgb, peakAlpha
uniform float uTime;
uniform float uDrag;
varying vec2 vUv;
varying vec4 vColor;
${FOG_PARS_V}
${DISPLACE_GLSL}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vUv = uv; vColor = vec4( 0.0 );
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    ${FOG_V.replace('-mvPosition.z','1.0')}
    return;
  }
  float t = age / life;
  vec3 wpos = aPB.xyz + particleDisplace( aVL.xyz, aC0.w, age, uDrag );
  float size = mix( aSR.x, aSR.y, t );
  float ang = aSR.z + aSR.w * age;
  float ca = cos( ang ), sa = sin( ang );
  vec2 corner = vec2( position.x * ca - position.y * sa,
                      position.x * sa + position.y * ca ) * size;
  vec3 camRight = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 camUp    = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  wpos += camRight * corner.x + camUp * corner.y;
  // tier-1 soft handling: alpha-in at birth, long fade-out
  float alpha = aC1.w * smoothstep( 0.0, 0.12, t ) * ( 1.0 - smoothstep( 0.5, 1.0, t ) );
  vColor = vec4( mix( aC0.rgb, aC1.rgb, smoothstep( 0.0, 1.0, t ) ), alpha );
  vUv = uv;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const PUFF_FRAG_NORMAL = `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
${FOG_PARS_F}
void main() {
  float tex = texture2D( uMap, vUv ).a;
  float a = tex * vColor.a;
  if ( a < 0.004 ) discard;
  vec3 col = vColor.rgb;
  ${FOG_SCALE_F}
  #ifdef USE_FOG
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, a );
}
`;

const PUFF_FRAG_ADDITIVE = `
uniform sampler2D uMap;
uniform float uIntensity;
varying vec2 vUv;
varying vec4 vColor;
${FOG_PARS_F}
void main() {
  float tex = texture2D( uMap, vUv ).a;
  float a = tex * vColor.a;
  if ( a < 0.004 ) discard;
  ${FOG_SCALE_F}
  // HDR push so UnrealBloom (threshold 0.85) catches fire/flash pixels
  gl_FragColor = vec4( vColor.rgb * uIntensity * ( 1.0 - fogFactor ), a );
}
`;

// --- streak (sparks / ricochet) --------------------------------------------

const STREAK_VERT = `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // vel.xyz, life
attribute vec4 aWS;   // width, stretch (s of length per m/s), gravity, seed
attribute vec4 aC;    // color.rgb, peakAlpha
uniform float uTime;
uniform float uDrag;
varying vec2 vUv;
varying vec4 vColor;
${FOG_PARS_V}
${DISPLACE_GLSL}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vUv = uv; vColor = vec4( 0.0 );
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    ${FOG_V.replace('-mvPosition.z','1.0')}
    return;
  }
  float t = age / life;
  vec3 grav = vec3( 0.0, aWS.z, 0.0 );
  vec3 wpos = aPB.xyz + particleDisplace( aVL.xyz, aWS.z, age, uDrag );
  vec3 vcur = aVL.xyz * exp( -uDrag * age ) + grav * age;
  float speed = max( length( vcur ), 0.01 );
  vec3 axis = vcur / speed;
  float halfLen = max( aWS.x, speed * aWS.y * 0.5 );
  vec3 viewDir = normalize( cameraPosition - wpos );
  vec3 side = cross( axis, viewDir );
  float sl = length( side );
  side = sl > 1e-4 ? side / sl : vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  wpos += axis * ( position.x * 2.0 * halfLen ) + side * ( position.y * 2.0 * aWS.x );
  float alpha = aC.w * ( 1.0 - smoothstep( 0.55, 1.0, t ) );
  vColor = vec4( aC.rgb, alpha );
  vUv = uv;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const STREAK_FRAG = `
uniform float uIntensity;
varying vec2 vUv;
varying vec4 vColor;
${FOG_PARS_F}
void main() {
  float dy = abs( vUv.y * 2.0 - 1.0 );
  float dx = abs( vUv.x * 2.0 - 1.0 );
  float profile = ( 1.0 - dy * dy ) * ( 1.0 - dx * dx * dx );
  float core = smoothstep( 0.55, 0.0, dy );
  float a = profile * vColor.a;
  if ( a < 0.004 ) discard;
  ${FOG_SCALE_F}
  vec3 col = ( vColor.rgb + vec3( core ) * 0.7 ) * uIntensity;
  gl_FragColor = vec4( col * ( 1.0 - fogFactor ), a );
}
`;

// --- debris (instanced shaded boxes) ----------------------------------------

const DEBRIS_VERT = `
attribute vec4 aPB;   // origin.xyz, birth
attribute vec4 aVL;   // vel.xyz, life
attribute vec4 aAR;   // spinAxis.xyz, spinRate
attribute vec4 aSG;   // scale, groundY, hot(0|1), seed
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vTint;
varying float vHot;
varying float vFade;
${FOG_PARS_V}
${DISPLACE_GLSL}
mat3 axisAngle( vec3 axis, float ang ) {
  float c = cos( ang ), s = sin( ang ), ic = 1.0 - c;
  vec3 a = axis;
  return mat3(
    ic*a.x*a.x + c,     ic*a.x*a.y + a.z*s, ic*a.x*a.z - a.y*s,
    ic*a.x*a.y - a.z*s, ic*a.y*a.y + c,     ic*a.y*a.z + a.x*s,
    ic*a.x*a.z + a.y*s, ic*a.y*a.z - a.x*s, ic*a.z*a.z + c );
}
void main() {
  float life = aVL.w;
  float age = uTime - aPB.w;
  if ( life <= 0.0 || age < 0.0 || age > life ) {
    vNormalW = vec3( 0.0, 1.0, 0.0 ); vTint = vec3( 0.0 ); vHot = 0.0; vFade = 0.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    ${FOG_V.replace('-mvPosition.z','1.0')}
    return;
  }
  float t = age / life;
  vec3 center = aPB.xyz + particleDisplace( aVL.xyz, -21.6, age, 0.12 );
  float grounded = step( center.y, aSG.y + aSG.x * 0.45 );
  center.y = max( center.y, aSG.y + aSG.x * 0.45 );
  float spin = aAR.w * age * mix( 1.0, 0.06, grounded );
  mat3 rot = axisAngle( normalize( aAR.xyz ), spin );
  float fade = 1.0 - smoothstep( 0.82, 1.0, t );
  vec3 wpos = center + rot * ( position * aSG.x * fade );
  vNormalW = rot * normal;
  float sv = fract( aSG.w * 17.31 );
  vTint = mix( vec3( 0.16, 0.15, 0.14 ), vec3( 0.32, 0.26, 0.20 ), sv );
  vHot = aSG.z * exp( -age * 3.2 );
  vFade = fade;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  ${FOG_V}
  gl_Position = projectionMatrix * mvPosition;
}
`;

const DEBRIS_FRAG = `
uniform vec3 uSunDir;
varying vec3 vNormalW;
varying vec3 vTint;
varying float vHot;
varying float vFade;
${FOG_PARS_F}
void main() {
  if ( vFade <= 0.001 ) discard;
  vec3 n = normalize( vNormalW );
  float nl = max( dot( n, uSunDir ), 0.0 );
  float hemi = 0.28 + 0.22 * ( n.y * 0.5 + 0.5 );
  vec3 col = vTint * ( hemi + nl * 1.1 );
  col += vec3( 2.4, 0.85, 0.22 ) * vHot;   // cooling ember glow (bloom feed)
  ${FOG_SCALE_F}
  #ifdef USE_FOG
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, 1.0 );
}
`;

// ---------------------------------------------------------------------------
// Procedural textures (canvas, seeded)
// ---------------------------------------------------------------------------

/**
 * Soft puff sprite: radial gradient modulated by seeded blob noise so smoke
 * reads as vapor, not a flat disc. Alpha-only payload (RGB white).
 * @param {() => number} rng
 * @param {number} blobbiness 0..1 — how broken-up the silhouette is
 * @returns {THREE.CanvasTexture}
 */
function makePuffTexture(rng, blobbiness) {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // Base radial falloff
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.12)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // Seeded sub-puff blobs (lighten) + bite-outs (destination-out) for texture
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = (0.10 + rng() * 0.24) * s;
    const cx = s / 2 + Math.cos(a) * rng() * s * 0.22;
    const cy = s / 2 + Math.sin(a) * rng() * s * 0.22;
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    bg.addColorStop(0, 'rgba(255,255,255,0.30)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'destination-out';
  const bites = Math.round(6 + blobbiness * 10);
  for (let i = 0; i < bites; i++) {
    const a = rng() * Math.PI * 2;
    const d = (0.28 + rng() * 0.22) * s;
    const cx = s / 2 + Math.cos(a) * d;
    const cy = s / 2 + Math.sin(a) * d;
    const r = (0.06 + rng() * 0.14) * s * (0.5 + blobbiness);
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    bg.addColorStop(0, `rgba(0,0,0,${0.35 + blobbiness * 0.35})`);
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex; // alpha map, stays linear
}

// ---------------------------------------------------------------------------
// Pool plumbing
// ---------------------------------------------------------------------------

/** Unit billboard quad: position.xy in [-0.5, 0.5], uv in [0,1]. */
function makeQuadGeometry(count) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.instanceCount = 0;
  geo._capacity = count;
  return geo;
}

function makeBoxGeometry(count) {
  const box = new THREE.BoxGeometry(1, 0.7, 0.55);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', box.getAttribute('position'));
  geo.setAttribute('normal', box.getAttribute('normal'));
  geo.setAttribute('uv', box.getAttribute('uv'));
  geo.setIndex(box.getIndex());
  geo.instanceCount = 0;
  geo._capacity = count;
  return geo;
}

/**
 * A ring-buffered instanced pool. `layout` maps attr name -> itemSize.
 * Writes go through a staging cursor; touched spans upload via updateRanges.
 */
class Pool {
  constructor(name, geometry, material, layout, capacity, lifeAttr, lifeComp) {
    this.name = name;
    this.capacity = capacity;
    this.cursor = 0;
    this.highWater = 0;
    this.lifeAttr = lifeAttr;
    this.lifeComp = lifeComp;
    this.attrs = {};
    for (const key of Object.keys(layout)) {
      const itemSize = layout[key];
      const attr = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * itemSize), itemSize);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.attrs[key] = attr;
      geometry.setAttribute(key, attr);
    }
    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** Claim the next ring slot; returns the instance index. */
  claim() {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.highWater = Math.max(this.highWater, i + 1);
    this.geometry.instanceCount = this.highWater;
    return i;
  }

  /** Mark one instance's span dirty on every attribute. */
  dirty(i) {
    for (const key of Object.keys(this.attrs)) {
      const a = this.attrs[key];
      a.addUpdateRange(i * a.itemSize, a.itemSize);
      a.needsUpdate = true;
    }
  }

  /** Kill every live particle (zero the life component) and reset the ring. */
  killAll() {
    const a = this.attrs[this.lifeAttr];
    const arr = a.array;
    const k = a.itemSize;
    for (let i = 0; i < this.capacity; i++) arr[i * k + this.lifeComp] = 0;
    a.clearUpdateRanges();
    a.needsUpdate = true;
    this.cursor = 0;
    this.highWater = 0;
    this.geometry.instanceCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create the pooled instanced particle system.
 * @param {import('../engine/renderer.js').EngineCtx|object} engineCtx render bundle (§2.8)
 * @param {{ seed?: number }} [opts]
 * @returns {Particles} { group, update(dt), setFrozen(frozen, atTimeS), emit(poolName, opts), pools, resetAll() }
 */
export function createParticleSystem(engineCtx, { seed = 5000 } = {}) {
  const texRng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'fx-particles';
  group.matrixAutoUpdate = false;

  const uTime = { value: 0 };
  let frozen = false;

  const smokeTex = makePuffTexture(texRng, 0.65);
  const fireTex = makePuffTexture(texRng, 0.35);
  const dustTex = makePuffTexture(texRng, 0.8);

  const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

  function puffMaterial(map, additive, drag, intensity) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT,
      fragmentShader: additive ? PUFF_FRAG_ADDITIVE : PUFF_FRAG_NORMAL,
      uniforms: Object.assign(fogUniforms(), {
        uTime,
        uMap: { value: map },
        uDrag: { value: drag },
        uIntensity: { value: intensity },
      }),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    return mat;
  }

  const PUFF_LAYOUT = { aPB: 4, aVL: 4, aSR: 4, aC0: 4, aC1: 4 };
  const STREAK_LAYOUT = { aPB: 4, aVL: 4, aWS: 4, aC: 4 };
  const DEBRIS_LAYOUT = { aPB: 4, aVL: 4, aAR: 4, aSG: 4 };

  const pools = {
    smoke: new Pool('smoke', makeQuadGeometry(POOL_SIZES.smoke),
      puffMaterial(smokeTex, false, 0.9, 1), PUFF_LAYOUT, POOL_SIZES.smoke, 'aVL', 3),
    fire: new Pool('fire', makeQuadGeometry(POOL_SIZES.fire),
      puffMaterial(fireTex, true, 1.6, 2.0), PUFF_LAYOUT, POOL_SIZES.fire, 'aVL', 3),
    dust: new Pool('dust', makeQuadGeometry(POOL_SIZES.dust),
      puffMaterial(dustTex, false, 1.4, 1), PUFF_LAYOUT, POOL_SIZES.dust, 'aVL', 3),
    sparks: new Pool('sparks', makeQuadGeometry(POOL_SIZES.sparks),
      new THREE.ShaderMaterial({
        vertexShader: STREAK_VERT,
        fragmentShader: STREAK_FRAG,
        uniforms: Object.assign(fogUniforms(), {
          uTime, uDrag: { value: 1.1 }, uIntensity: { value: 2.6 },
        }),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,   // streak ribbon winding flips with view direction
        fog: true,
      }), STREAK_LAYOUT, POOL_SIZES.sparks, 'aVL', 3),
    debris: new Pool('debris', makeBoxGeometry(POOL_SIZES.debris),
      new THREE.ShaderMaterial({
        vertexShader: DEBRIS_VERT,
        fragmentShader: DEBRIS_FRAG,
        uniforms: Object.assign(fogUniforms(), {
          uTime,
          uSunDir: { value: new THREE.Vector3(0.45, 0.75, 0.48).normalize() },
        }),
        fog: true,
      }), DEBRIS_LAYOUT, POOL_SIZES.debris, 'aVL', 3),
  };

  // Draw order: opaque debris first (default), then dust → smoke → fire → sparks
  pools.debris.mesh.renderOrder = 0;
  pools.dust.mesh.renderOrder = 20;
  pools.smoke.mesh.renderOrder = 21;
  pools.fire.mesh.renderOrder = 22;
  pools.sparks.mesh.renderOrder = 23;
  for (const key of Object.keys(pools)) group.add(pools[key].mesh);

  // --- emit dispatch --------------------------------------------------------

  function emitPuff(pool, o) {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, vl = A.aVL.array, sr = A.aSR.array,
          c0 = A.aC0.array, c1 = A.aC1.array;
    let j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    vl[j] = o.vel[0]; vl[j + 1] = o.vel[1]; vl[j + 2] = o.vel[2]; vl[j + 3] = o.life;
    sr[j] = o.size0; sr[j + 1] = o.size1; sr[j + 2] = o.rot || 0; sr[j + 3] = o.rotVel || 0;
    c0[j] = o.col0[0]; c0[j + 1] = o.col0[1]; c0[j + 2] = o.col0[2]; c0[j + 3] = o.grav || 0;
    c1[j] = o.col1[0]; c1[j + 1] = o.col1[1]; c1[j + 2] = o.col1[2]; c1[j + 3] = o.alpha;
    pool.dirty(i);
  }

  function emitStreak(pool, o) {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, vl = A.aVL.array, ws = A.aWS.array, c = A.aC.array;
    const j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    vl[j] = o.vel[0]; vl[j + 1] = o.vel[1]; vl[j + 2] = o.vel[2]; vl[j + 3] = o.life;
    ws[j] = o.width; ws[j + 1] = o.stretch; ws[j + 2] = (o.grav !== undefined ? o.grav : -21.6);
    ws[j + 3] = o.seed || 0;
    c[j] = o.col[0]; c[j + 1] = o.col[1]; c[j + 2] = o.col[2]; c[j + 3] = o.alpha;
    pool.dirty(i);
  }

  function emitDebris(pool, o) {
    const i = pool.claim();
    const birth = uTime.value + (o.birthOffset || 0);
    const A = pool.attrs;
    const pb = A.aPB.array, vl = A.aVL.array, ar = A.aAR.array, sg = A.aSG.array;
    const j = i * 4;
    pb[j] = o.pos[0]; pb[j + 1] = o.pos[1]; pb[j + 2] = o.pos[2]; pb[j + 3] = birth;
    vl[j] = o.vel[0]; vl[j + 1] = o.vel[1]; vl[j + 2] = o.vel[2]; vl[j + 3] = o.life;
    ar[j] = o.axis[0]; ar[j + 1] = o.axis[1]; ar[j + 2] = o.axis[2]; ar[j + 3] = o.spin;
    sg[j] = o.scale; sg[j + 1] = o.groundY; sg[j + 2] = o.hot ? 1 : 0; sg[j + 3] = o.seed || 0;
    pool.dirty(i);
  }

  const EMITTERS = {
    smoke: (o) => emitPuff(pools.smoke, o),
    fire: (o) => emitPuff(pools.fire, o),
    dust: (o) => emitPuff(pools.dust, o),
    sparks: (o) => emitStreak(pools.sparks, o),
    debris: (o) => emitDebris(pools.debris, o),
  };

  return {
    group,
    pools,

    /** Current internal clock (seconds). @returns {number} */
    getTime() { return uTime.value; },

    /**
     * Advance the shared particle clock (no-op while frozen).
     * @param {number} dt seconds
     */
    update(dt) {
      if (!frozen) uTime.value += dt;
    },

    /**
     * Freeze/unfreeze GPU animation; optionally pin the clock.
     * @param {boolean} f
     * @param {number|null} [atTimeS]
     */
    setFrozen(f, atTimeS = null) {
      frozen = f;
      if (atTimeS !== null && atTimeS !== undefined) uTime.value = atTimeS;
    },

    /**
     * Spawn one particle into a named pool.
     * @param {'smoke'|'fire'|'dust'|'sparks'|'debris'} poolName
     * @param {object} opts pool-specific fields (pos, vel, life, ...; birthOffset backdates)
     */
    emit(poolName, opts) {
      const fn = EMITTERS[poolName];
      if (!fn) throw new Error(`particles: unknown pool '${poolName}'`);
      fn(opts);
    },

    /** Kill all live particles and reset every ring buffer. */
    resetAll() {
      for (const key of Object.keys(pools)) pools[key].killAll();
    },
  };
}
