/**
 * combat/craters.ts — shell craters and scorch on the ground, one draw (combat-fx lane, 2026-10-05).
 *
 * A ground impact leaves its mark: a dark pit of turned-up earth, a rim of thrown soil, ragged ejecta rays and, for an
 * explosive shell, black soot — in the colours of the ground it hit (dark soil on snow, darkened sand, black mud,
 * scorched rock). All craters share ONE dynamic buffer and one procedural shader (the shape, the rays and the ragged
 * edge come from the media warp texture), each disc draped over the terrain at stamp time like the wreck scorch.
 * Ring of CRATER_SLOTS; the oldest goes first, and every crater fades out after CRATER_HOLD_S.
 */
import * as THREE from 'three';

export const CRATER_SLOTS = 40;
const SEG = 16;
const RINGS = 2;
const VERTS = 1 + SEG * RINGS;
export const CRATER_HOLD_S = 75;
const CRATER_FADE_S = 20;

/** Surface kinds the crater shader knows (match surface.ts SURFACE_INDEX). */
export type CraterKind = 0 | 1 | 2 | 3 | 4;

const CRATER_VERT = /* glsl */ `
attribute vec4 aInfo;   // birth, kind, explosive (0/1), seed
uniform float uTime;
varying vec2 vDisc;
varying vec4 vInfo;
varying float vAge;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  vDisc = uv * 2.0 - 1.0;
  vInfo = aInfo;
  vAge = uTime - aInfo.x;
  vec4 mvPosition = viewMatrix * vec4( position, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = ( vAge < 0.0 || vAge > ${(CRATER_HOLD_S + CRATER_FADE_S).toFixed(1)} )
    ? vec4( 0.0, 0.0, 2.0, 1.0 ) : projectionMatrix * mvPosition;
}
`;

const CRATER_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform float uSunUp;
varying vec2 vDisc;
varying vec4 vInfo;
varying float vAge;
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
void main() {
  float r = length( vDisc );
  float ang = atan( vDisc.y, vDisc.x );
  vec2 seedOfs = vec2( fract( vInfo.w * 7.13 ), fract( vInfo.w * 3.71 ) );
  float nEdge = texture2D( uNoise, vDisc * 0.45 + seedOfs ).r;
  float nRay = texture2D( uNoise, vec2( ang * 0.95, r * 0.12 ) + seedOfs * 2.0 ).g;
  float nFine = texture2D( uNoise, vDisc * 1.7 + seedOfs.yx ).r;
  float rr = r + ( nEdge - 0.5 ) * 0.38;
  if ( rr > 1.0 ) discard;
  float kind = vInfo.y;
  float explosive = vInfo.z;
  // pit, rim and rays
  float pit = 1.0 - smoothstep( 0.18, 0.42, rr );
  float rim = smoothstep( 0.28, 0.45, rr ) * ( 1.0 - smoothstep( 0.5, 0.72, rr ) );
  float rays = smoothstep( 0.52, 0.78, nRay ) * ( 1.0 - smoothstep( 0.45, 1.0, rr ) ) * smoothstep( 0.3, 0.5, rr );
  float outer = 1.0 - smoothstep( 0.6, 1.0, rr );
  // colours of the turned ground (linear): soil, sand, snow, mud, rock
  vec3 pitCol = vec3( 0.022, 0.017, 0.012 );
  vec3 rimCol = vec3( 0.045, 0.035, 0.024 );
  vec3 rayCol = vec3( 0.06, 0.048, 0.034 );
  float cover = 0.92;
  if ( kind > 0.5 && kind < 1.5 ) { pitCol = vec3( 0.16, 0.12, 0.075 ); rimCol = vec3( 0.24, 0.185, 0.12 ); rayCol = vec3( 0.3, 0.24, 0.16 ); cover = 0.7; }
  else if ( kind > 1.5 && kind < 2.5 ) { pitCol = vec3( 0.03, 0.025, 0.02 ); rimCol = vec3( 0.07, 0.06, 0.05 ); rayCol = vec3( 0.32, 0.33, 0.35 ); cover = 0.9; }
  else if ( kind > 2.5 && kind < 3.5 ) { pitCol = vec3( 0.012, 0.01, 0.008 ); rimCol = vec3( 0.025, 0.02, 0.015 ); rayCol = vec3( 0.035, 0.028, 0.02 ); cover = 0.95; }
  else if ( kind > 3.5 ) { pitCol = vec3( 0.03, 0.03, 0.03 ); rimCol = vec3( 0.07, 0.068, 0.065 ); rayCol = vec3( 0.12, 0.118, 0.112 ); cover = 0.75; }
  vec3 col = mix( rayCol, rimCol, smoothstep( 0.0, 1.0, rim + pit * 0.3 ) );
  col = mix( col, pitCol, pit );
  col *= 0.8 + 0.4 * nFine;
  // an explosive shell leaves soot: a black heart and dark streaks
  float soot = explosive * ( pit * 0.9 + rays * 0.5 + outer * 0.25 ) * ( 0.7 + 0.3 * nFine );
  col = mix( col, vec3( 0.008, 0.007, 0.006 ), clamp( soot, 0.0, 0.85 ) );
  float a = max( max( pit, rim * 0.85 ), max( rays * 0.75, outer * ( 0.28 + 0.3 * explosive ) ) ) * cover;
  a *= 1.0 - smoothstep( ${CRATER_HOLD_S.toFixed(1)}, ${(CRATER_HOLD_S + CRATER_FADE_S).toFixed(1)}, vAge );
  // a fresh crater settles in over its first quarter second (the ejecta is still in the air)
  a *= smoothstep( 0.0, 0.25, vAge );
  if ( a < 0.01 ) discard;
  col *= uSunCol * uSunUp + uSkyCol;
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

export class CraterDecals {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: THREE.BufferAttribute;
  private readonly info: THREE.BufferAttribute;
  private readonly template: Float32Array;
  private cursor = 0;
  private any = false;

  constructor(uniforms: Record<string, THREE.IUniform>) {
    const template = new Float32Array(VERTS * 2);
    for (let r = 1; r <= RINGS; r++) {
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        const rad = r / RINGS;
        const v = 1 + (r - 1) * SEG + s;
        template[v * 2] = Math.cos(a) * rad;
        template[v * 2 + 1] = Math.sin(a) * rad;
      }
    }
    this.template = template;
    const positions = new Float32Array(CRATER_SLOTS * VERTS * 3);
    const uvs = new Float32Array(CRATER_SLOTS * VERTS * 2);
    const info = new Float32Array(CRATER_SLOTS * VERTS * 4).fill(-1e9);
    const index: number[] = [];
    for (let c = 0; c < CRATER_SLOTS; c++) {
      const base = c * VERTS;
      for (let v = 0; v < VERTS; v++) {
        uvs[(base + v) * 2] = template[v * 2] * 0.5 + 0.5;
        uvs[(base + v) * 2 + 1] = template[v * 2 + 1] * 0.5 + 0.5;
      }
      for (let s = 0; s < SEG; s++) index.push(base, base + 1 + s, base + 1 + (s + 1) % SEG);
      for (let r = 1; r < RINGS; r++) {
        const a0 = base + 1 + (r - 1) * SEG, b0 = base + 1 + r * SEG;
        for (let s = 0; s < SEG; s++) {
          const s1 = (s + 1) % SEG;
          index.push(a0 + s, b0 + s, b0 + s1, a0 + s, b0 + s1, a0 + s1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(positions, 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.info = new THREE.BufferAttribute(info, 4);
    this.info.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aInfo', this.info);
    geo.setIndex(index);
    geo.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      vertexShader: CRATER_VERT,
      fragmentShader: CRATER_FRAG,
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uniforms),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'Combat craters';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 2.5; // after terrain and the wreck scorch, before every particle
  }

  /** Stamp one crater at (x, z), draped over the ground. */
  stamp(x: number, z: number, radius: number, kind: CraterKind, explosive: boolean, seed: number,
    yaw: number, birth: number, groundY: (x: number, z: number) => number): void {
    const c = this.cursor;
    this.cursor = (this.cursor + 1) % CRATER_SLOTS;
    const base = c * VERTS;
    const p = this.pos.array as Float32Array;
    const inf = this.info.array as Float32Array;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let v = 0; v < VERTS; v++) {
      const lx = this.template[v * 2], lz = this.template[v * 2 + 1];
      const wx = x + (lx * cy - lz * sy) * radius;
      const wz = z + (lx * sy + lz * cy) * radius;
      const o = (base + v) * 3;
      p[o] = wx; p[o + 1] = groundY(wx, wz) + 0.05; p[o + 2] = wz;
      const q = (base + v) * 4;
      inf[q] = birth; inf[q + 1] = kind; inf[q + 2] = explosive ? 1 : 0; inf[q + 3] = seed;
    }
    this.pos.addUpdateRange(base * 3, VERTS * 3);
    this.info.addUpdateRange(base * 4, VERTS * 4);
    this.pos.needsUpdate = true;
    this.info.needsUpdate = true;
    if (!this.any) { this.any = true; this.mesh.geometry.setDrawRange(0, Infinity); }
  }

  shiftTime(delta: number): void {
    const inf = this.info.array as Float32Array;
    for (let i = 0; i < inf.length; i += 4) if (inf[i] > -1e8) inf[i] += delta;
    this.info.clearUpdateRanges();
    this.info.addUpdateRange(0, inf.length);
    this.info.needsUpdate = true;
  }

  reset(): void {
    (this.info.array as Float32Array).fill(-1e9);
    this.info.clearUpdateRanges();
    this.info.needsUpdate = true;
    this.cursor = 0;
    this.any = false;
    this.mesh.geometry.setDrawRange(0, 0);
  }
}
