/**
 * structureScars.ts — a breach on the phone tier (destruction-fx lane, 2026-10-08).
 *
 * The desktop tiers cut a stage builder's holes out of the intact wall (structureMask.ts: the one fragment discard the
 * props buckets' patch keeps). The phone tier keeps its buckets free of any discard, so its walls stand uncut; this
 * draws each cut as what the eye reads instead, on the wall's face: a hole is a dark breach with a blocky broken edge
 * of exposed masonry and a soot halo, a shallow cut (a spall, the render broken back round a hole) a patch of the
 * wall's core. One draw for every scar of the match (a ring of SLOTS, oldest replaced first); a collapse takes its
 * building's scars with it. Event time only; nothing per frame.
 */
import * as THREE from 'three';

const SLOTS = 96;

const VERT = /* glsl */ `
attribute vec4 aC;   // centre x, y, z, radius
attribute vec4 aN;   // face normal x, z, kind (1 hole, 0 shallow), seed
varying vec2 vLocal;
varying float vKind;
varying float vSeed;
varying vec3 vNormal;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  vec3 n = normalize( vec3( aN.x, 0.0, aN.y ) );
  // right x up = n: the quad's front face looks out of the wall (b5: with right = (-n.z, 0, n.x) it faced into the
  // wall and the phone tier culled every scar)
  vec3 right = vec3( n.z, 0.0, -n.x );
  vec3 up = vec3( 0.0, 1.0, 0.0 );
  // the quad reaches past the breach to carry its soot halo
  float reach = aC.w * ( aN.z > 0.5 ? 1.45 : 1.15 );
  vLocal = position.xy * reach / max( aC.w, 1e-3 );
  vKind = aN.z;
  vSeed = aN.w;
  vNormal = n;
  vec3 wp = aC.xyz + n * 0.025 + ( right * position.x + up * position.y ) * reach;
  vec4 mv = viewMatrix * vec4( wp, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = aC.w > 0.0 ? projectionMatrix * mv : vec4( 0.0, 0.0, 2.0, 1.0 );
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
varying vec2 vLocal;
varying float vKind;
varying float vSeed;
varying vec3 vNormal;
#ifdef USE_FOG
  uniform vec3 fogColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  varying float vFogDepth;
#endif
float h1( vec2 c ) { return fract( sin( dot( c, vec2( 127.1, 311.7 ) ) + vSeed * 43.7 ) * 43758.5453 ); }
void main() {
  float r = length( vLocal );
  // brick-sized cells of the edge break at different radii (the desktop cut's blocky law)
  float edge = 0.8 + 0.4 * h1( floor( vLocal * 5.0 ) );
  vec3 col;
  float a;
  vec3 masonry = vec3( 0.21, 0.15, 0.11 );
  if ( vKind > 0.5 ) {
    if ( r < edge * 0.92 ) {
      // the breach: the dark room behind it, a little light falling in at the top
      col = mix( vec3( 0.012, 0.011, 0.01 ), vec3( 0.05, 0.045, 0.04 ), smoothstep( -0.6, 0.9, vLocal.y ) );
      a = 1.0;
    } else if ( r < edge * 1.1 ) {
      // the broken edge: exposed masonry
      col = masonry * ( 0.75 + 0.5 * h1( floor( vLocal * 11.0 ) + 3.1 ) );
      a = 1.0;
    } else {
      // soot blown across the face round the breach
      col = vec3( 0.03, 0.028, 0.026 );
      a = 0.55 * ( 1.0 - smoothstep( edge * 1.1, 1.45, r ) );
    }
  } else {
    if ( r > edge ) discard;
    col = masonry * ( 0.85 + 0.4 * h1( floor( vLocal * 9.0 ) + 7.7 ) );
    a = 1.0;
  }
  if ( a < 0.01 ) discard;
  float ndl = max( dot( vNormal, uSunDir ), 0.0 );
  col *= uSunCol * ndl + uSkyCol;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, a );
}
`;

export interface StructureScars {
  readonly mesh: THREE.Mesh;
  /** A cut drawn on its wall (world centre, radius, the face's outward normal; deep: a hole through the wall). */
  add(structureId: number, x: number, y: number, z: number, radiusM: number, nx: number, nz: number, deep: boolean, seed: number): void;
  /** A building came down: its scars go with it. */
  clearStructure(structureId: number): void;
  /** A section of it fell: the scars standing in it (world centre) go with it. */
  clearWhere(structureId: number, inside: (x: number, y: number, z: number) => boolean): void;
  /** The sun and sky the scars are lit by (event time: when a scar is added). */
  light(scene: THREE.Scene | null | undefined): void;
  reset(): void;
  readonly count: number;
}

export function createStructureScars(): StructureScars {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const C = new Float32Array(SLOTS * 4), N = new Float32Array(SLOTS * 4);
  const aC = new THREE.InstancedBufferAttribute(C, 4), aN = new THREE.InstancedBufferAttribute(N, 4);
  aC.setUsage(THREE.DynamicDrawUsage); aN.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aC', aC);
  geo.setAttribute('aN', aN);
  geo.instanceCount = 0;
  const uSunDir = { value: new THREE.Vector3(0.527, 0.574, -0.627).normalize() };
  const uSunCol = { value: new THREE.Vector3(1.2, 1.15, 1.05) };
  const uSkyCol = { value: new THREE.Vector3(0.35, 0.37, 0.4) };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uSunDir, uSunCol, uSkyCol }),
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'fx-structure-scars';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  const owner = new Int32Array(SLOTS).fill(-1);
  let cursor = 0, used = 0;
  const upload = (slot: number): void => {
    aC.addUpdateRange(slot * 4, 4); aC.needsUpdate = true;
    aN.addUpdateRange(slot * 4, 4); aN.needsUpdate = true;
  };
  return {
    mesh,
    add(structureId, x, y, z, radiusM, nx, nz, deep, seed) {
      if (!(radiusM > 0)) return;
      const slot = cursor;
      cursor = (cursor + 1) % SLOTS;
      used = Math.min(SLOTS, used + 1);
      const nl = Math.hypot(nx, nz) || 1;
      C[slot * 4] = x; C[slot * 4 + 1] = y; C[slot * 4 + 2] = z; C[slot * 4 + 3] = radiusM;
      N[slot * 4] = nx / nl; N[slot * 4 + 1] = nz / nl; N[slot * 4 + 2] = deep ? 1 : 0; N[slot * 4 + 3] = seed % 97;
      owner[slot] = structureId;
      upload(slot);
      geo.instanceCount = used;
      mesh.visible = true;
    },
    clearStructure(structureId) {
      for (let i = 0; i < SLOTS; i++) {
        if (owner[i] !== structureId) continue;
        C[i * 4 + 3] = 0;
        owner[i] = -1;
        upload(i);
      }
    },
    clearWhere(structureId, inside) {
      for (let i = 0; i < SLOTS; i++) {
        if (owner[i] !== structureId || !(C[i * 4 + 3] > 0) || !inside(C[i * 4], C[i * 4 + 1], C[i * 4 + 2])) continue;
        C[i * 4 + 3] = 0;
        owner[i] = -1;
        upload(i);
      }
    },
    light(scene) {
      const ud = scene?.userData as { sunDirWorld?: THREE.Vector3; lightRig?: { sunIntensity?: number; sunColor?: THREE.Color;
        hemiIntensity?: number; hemiSky?: THREE.Color } } | undefined;
      const sd = ud?.sunDirWorld;
      if (sd && sd.lengthSq() > 1e-8) uSunDir.value.copy(sd).normalize();
      const rig = ud?.lightRig;
      if (rig) {
        const si = (rig.sunIntensity ?? 4.5) / Math.PI;
        const sc = rig.sunColor;
        uSunCol.value.set(sc ? sc.r * si : si, sc ? sc.g * si : si, sc ? sc.b * si : si);
        const hi = (rig.hemiIntensity ?? 0.4) * 1.6 / Math.PI;
        const sky = rig.hemiSky;
        uSkyCol.value.set(sky ? sky.r * hi : hi, sky ? sky.g * hi : hi, sky ? sky.b * hi : hi);
      }
    },
    reset() {
      C.fill(0); N.fill(0); owner.fill(-1);
      cursor = 0; used = 0;
      geo.instanceCount = 0;
      aC.clearUpdateRanges(); aC.needsUpdate = true;
      aN.clearUpdateRanges(); aN.needsUpdate = true;
      mesh.visible = false;
    },
    get count() { return used; },
  };
}
