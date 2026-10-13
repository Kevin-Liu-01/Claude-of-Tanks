/**
 * smokeRibbons.ts — a missile's smoke trail as one continuous ribbon (EF.04, 2026-10-13).
 *
 * The owner: "fix the missile trace from launching missiles, make that look a lot better and be unique for different
 * tank types and missile types!" Round 9a laid each missile's trail as media puffs one per 3.5-12 m of a flight at
 * 115-600 m/s, born 0.3-1.2 m wide: from the side a string of beads (the young trail ~10-25 % covered), and 26-400
 * puffs alive per missile. A real motor's trail is a thin unbroken line that swells, sags in the air and tears apart.
 *
 * Here the trail is a camera-facing strip through points dropped along the flight (every few metres, each with the time
 * the motor passed it): width, opacity and colour follow each point's own age (thin at the motor, swelling, thinning
 * from the edges as it dies), the air carries every point with the wind and lets it rise, and a seeded noise tears the
 * edges. It is lit as the volumetric media are (their sun, sky and ground uniforms: the time of day's light), drawn in
 * the late pass just under them, so the media puffs a family still lays read as body inside the line.
 *
 * Budget: one draw call; RIBBONS x POINTS points (two vertices each) in fixed buffers. A point is written once, when
 * it is dropped (its neighbour's tangent with it); a ribbon's index range is rewritten only when it gains a point; the
 * shader ages everything. Nothing allocates per frame; nothing is drawn while no ribbon is alive.
 */
import * as THREE from 'three';
import { LATE_FX_LAYER } from './layers.ts';
import type { VolumeShading } from './volumeMedia.ts';

export const RIBBON_SLOTS = 24;
export const RIBBON_POINTS = 96;

/** A ribbon's look (from the missile's smoke look): widths (m) at birth and full growth, life (s), peak opacity, the
 *  albedo at birth and aged (linear), its rise (m/s) and wind coupling, and how much its edges tear (0..1). */
export interface RibbonLook {
  readonly width0: number;
  readonly width1: number;
  readonly life: number;
  readonly density: number;
  readonly c0: readonly [number, number, number];
  readonly c1: readonly [number, number, number];
  readonly rise: number;
  readonly windK: number;
  readonly tear: number;
}

export interface SmokeRibbons {
  readonly mesh: THREE.Mesh;
  /** Start a ribbon for `key` (a round's id); returns its slot (reusing the stalest one when all are taken). */
  begin(key: number, look: RibbonLook, seed: number): number;
  /** The slot `key` holds, or -1. */
  slotOf(key: number): number;
  /** Drop a point at (x, y, z), passed by the motor at fx time `birth`, `flightS` seconds after launch. */
  point(slot: number, x: number, y: number, z: number, birth: number, flightS?: number): void;
  /** Per render frame (fx time `now`): hide when nothing is alive. */
  update(now: number): void;
  shiftTime(delta: number): void;
  reset(): void;
  /** receipts: live ribbons, points written, the index count drawn */
  stats(): { live: number; points: number; indices: number };
}

const VERT = /* glsl */ `
attribute vec4 aP;   // the point (world), the time the motor passed it
attribute vec4 aT;   // tangent (world), side (-1 | +1)
attribute vec4 aW;   // width0, width1, life, density
attribute vec4 aC0;  // albedo at birth, rise
attribute vec4 aC1;  // albedo aged, wind coupling
attribute vec4 aS;   // metres along the trail, seed, tear, the round's flight time when it passed (s)
uniform float uTime;
uniform vec3 uWind;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying float vSide;
varying float vA;
varying float vT;
varying vec3 vCol;
varying vec2 vN;
varying float vTear;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  float age = uTime - aP.w;
  float t = age / max( aW.z, 0.05 );
  if ( age < 0.0 || t >= 1.0 || aW.w <= 0.0 ) {
    vSide = 0.0; vA = 0.0; vT = 0.0; vCol = vec3( 0.0 ); vN = vec2( 0.0 ); vTear = 0.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  // the air takes it: the wind (eased in as the exhaust's own push dies) and a slow rise
  float carry = age - 0.6 * ( 1.0 - exp( -age / 0.6 ) );
  vec3 c = aP.xyz + uWind * ( aC1.w * carry ) + vec3( 0.0, aC0.w * age, 0.0 );
  // it swells fast behind the motor, then slowly
  float grow = 1.0 - pow( 1.0 - t, 2.6 );
  // (the coordinator, filmed at 300-800 m: "the TOW line is very thin and pale against bright steppe grass") the first
  // second and a half of a flight (the launch charge's and the motor's first burn, the part a player watches leave)
  // lays a slightly denser, warmer-grey and wider line, which then thins to the motor's own
  float early = 1.0 - smoothstep( 0.7, 1.6, aS.w );
  float w = mix( aW.x, aW.y, grow ) * ( 1.0 + 0.3 * early );
  vec3 view = cameraPosition - c;
  vec3 side = cross( aT.xyz, view );
  float sl = length( side );
  side = sl > 1e-5 ? side / sl : vec3( 0.0, 1.0, 0.0 );
  vec3 p = c + side * ( 0.5 * w * aT.w );
  vSide = aT.w;
  vT = t;
  // opacity: in at once behind the motor (a fraction of a second), thinning through the second half of its life; a
  // ribbon seen end-on (its tangent toward the eye) is denser where it overlaps itself, so ease it
  float endOn = abs( dot( normalize( aT.xyz ), normalize( view ) ) );
  vA = min( 0.95, aW.w * ( 1.0 + 0.55 * early ) ) * smoothstep( 0.0, 0.05, age ) * ( 1.0 - smoothstep( 0.45, 1.0, t ) )
    * mix( 1.0, 0.55, endOn * endOn );
  // lit as the media are: the sun through thin smoke (forward scattering when it stands behind), the sky, the ground
  vec3 vd = normalize( view );
  float fwd = 0.55 + 0.45 * pow( max( 0.0, dot( -vd, uSunDir ) ), 3.0 );
  float skyLum = dot( uSkyCol, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 albedo = mix( aC0.rgb, aC1.rgb, smoothstep( 0.0, 1.0, t ) );
  albedo = mix( albedo, albedo * vec3( 0.8, 0.76, 0.7 ), 0.65 * early );
  vCol = albedo * ( uSunCol * fwd * 0.62 + mix( vec3( skyLum ), uSkyCol, 0.5 ) * 0.9 + uGroundCol * 0.25 );
  vN = vec2( aS.x * 0.42 - age * 0.6, aS.y * 17.0 );
  vTear = aS.z * ( 0.35 + 0.65 * t );
  vec4 mv = viewMatrix * vec4( p, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying float vSide;
varying float vA;
varying float vT;
varying vec3 vCol;
varying vec2 vN;
varying float vTear;
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
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + 1.0 ), u.x ), u.y );
}
void main() {
  if ( vA <= 0.002 ) discard;
  float s = abs( vSide );
  // a soft round profile across the strip, its edge torn by noise that grows with age
  float n = vnoise( vec2( vN.x, vSide * 1.7 + vN.y ) ) * 0.65 + vnoise( vec2( vN.x * 2.3, vSide * 3.1 - vN.y ) ) * 0.35;
  float edge = 1.0 - smoothstep( 0.35 - 0.3 * vTear, 1.0, s + vTear * ( n - 0.5 ) * 1.2 );
  float core = mix( 1.0, 0.55 + 0.9 * n, vTear );
  float a = vA * edge * clamp( core, 0.0, 1.2 );
  if ( a < 0.003 ) discard;
  vec3 col = vCol;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col = mix( col, fogColor, fogFactor );
  #endif
  gl_FragColor = vec4( col, min( a, 1.0 ) );
}
`;

export function createSmokeRibbons(shading: VolumeShading): SmokeRibbons {
  const N = RIBBON_SLOTS * RIBBON_POINTS;
  const geo = new THREE.BufferGeometry();
  const mk = (name: string): THREE.BufferAttribute => {
    const a = new THREE.BufferAttribute(new Float32Array(N * 2 * 4), 4);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const aP = mk('aP'), aT = mk('aT'), aW = mk('aW'), aC0 = mk('aC0'), aC1 = mk('aC1'), aS = mk('aS');
  // three needs a position attribute to size the draw; the shader never reads it
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
  const index = new THREE.BufferAttribute(new Uint16Array(RIBBON_SLOTS * (RIBBON_POINTS - 1) * 6), 1);
  index.setUsage(THREE.DynamicDrawUsage);
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uTime: shading.uTime, uWind: shading.uWind, uSunDir: shading.uSunDir, uSunCol: shading.uSunCol,
      uSkyCol: shading.uSkyCol, uGroundCol: shading.uGroundCol,
    }),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'fx-smoke-ribbons';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // the late pass: over the battle smoke (21), just under the volumetric media (21.4)
  mesh.renderOrder = 21.3;
  mesh.layers.set(LATE_FX_LAYER);
  mesh.visible = false;

  const keys = new Float64Array(RIBBON_SLOTS).fill(-1);
  const count = new Int32Array(RIBBON_SLOTS);     // points written (all time)
  const lastBirth = new Float64Array(RIBBON_SLOTS).fill(-1e9);
  const along = new Float64Array(RIBBON_SLOTS);
  const lx = new Float64Array(RIBBON_SLOTS), ly = new Float64Array(RIBBON_SLOTS), lz = new Float64Array(RIBBON_SLOTS);
  const lifeOf = new Float32Array(RIBBON_SLOTS);
  const looks: (RibbonLook | null)[] = new Array(RIBBON_SLOTS).fill(null);
  const seeds = new Float32Array(RIBBON_SLOTS);
  let liveUntil = -Infinity, points = 0, lastNow = 0;
  const ATTRS: readonly THREE.BufferAttribute[] = [aP, aT, aW, aC0, aC1, aS];

  const markRange = (attr: THREE.BufferAttribute, firstVertex: number, vertices: number): void => {
    attr.addUpdateRange(firstVertex * 4, vertices * 4);
    attr.needsUpdate = true;
  };
  function writeVertex(v: number, slot: number, x: number, y: number, z: number, birth: number, tx: number, ty: number,
    tz: number, side: number, s: number, flightS: number): void {
    const l = looks[slot]!;
    const o = v * 4;
    aP.array[o] = x; aP.array[o + 1] = y; aP.array[o + 2] = z; aP.array[o + 3] = birth;
    aT.array[o] = tx; aT.array[o + 1] = ty; aT.array[o + 2] = tz; aT.array[o + 3] = side;
    aW.array[o] = l.width0; aW.array[o + 1] = l.width1; aW.array[o + 2] = l.life; aW.array[o + 3] = l.density;
    aC0.array[o] = l.c0[0]; aC0.array[o + 1] = l.c0[1]; aC0.array[o + 2] = l.c0[2]; aC0.array[o + 3] = l.rise;
    aC1.array[o] = l.c1[0]; aC1.array[o + 1] = l.c1[1]; aC1.array[o + 2] = l.c1[2]; aC1.array[o + 3] = l.windK;
    aS.array[o] = s; aS.array[o + 1] = seeds[slot]; aS.array[o + 2] = l.tear; aS.array[o + 3] = flightS;
  }
  /** a point's tangent: toward its successor (the newest: along the flight from its predecessor) */
  function setTangent(slot: number, k: number, tx: number, ty: number, tz: number): void {
    const base = (slot * RIBBON_POINTS + k) * 2;
    for (let e = 0; e < 2; e++) {
      const o = (base + e) * 4;
      aT.array[o] = tx; aT.array[o + 1] = ty; aT.array[o + 2] = tz;
    }
    markRange(aT, base, 2);
  }
  /** the slot's quads, oldest point first (a ring once it has wrapped) */
  function writeIndex(slot: number): void {
    const n = Math.min(count[slot], RIBBON_POINTS);
    const start = count[slot] > RIBBON_POINTS ? count[slot] % RIBBON_POINTS : 0;
    const arr = index.array as Uint16Array;
    const o0 = slot * (RIBBON_POINTS - 1) * 6;
    const base = slot * RIBBON_POINTS * 2;
    for (let j = 0; j < RIBBON_POINTS - 1; j++) {
      const o = o0 + j * 6;
      if (j >= n - 1) { arr[o] = arr[o + 1] = arr[o + 2] = arr[o + 3] = arr[o + 4] = arr[o + 5] = base; continue; }
      const a = base + ((start + j) % RIBBON_POINTS) * 2, b = base + ((start + j + 1) % RIBBON_POINTS) * 2;
      arr[o] = a; arr[o + 1] = a + 1; arr[o + 2] = b;
      arr[o + 3] = b; arr[o + 4] = a + 1; arr[o + 5] = b + 1;
    }
    index.addUpdateRange(o0, (RIBBON_POINTS - 1) * 6);
    index.needsUpdate = true;
  }
  function clearSlot(slot: number): void {
    count[slot] = 0; along[slot] = 0; lastBirth[slot] = -1e9;
    const base = slot * RIBBON_POINTS * 2;
    for (let v = 0; v < RIBBON_POINTS * 2; v++) aW.array[(base + v) * 4 + 3] = 0;
    markRange(aW, base, RIBBON_POINTS * 2);
    writeIndex(slot);
  }

  return {
    mesh,
    begin(key, look, seed) {
      // its own slot, else a free or burnt-out one, else the one that burns out soonest
      let slot = -1, soonest = Infinity;
      for (let i = 0; i < RIBBON_SLOTS; i++) {
        if (keys[i] === key) return i;
        const out = keys[i] < 0 ? -Infinity : lastBirth[i] + lifeOf[i];
        if (out < soonest) { soonest = out; slot = i; }
      }
      keys[slot] = key; looks[slot] = look; lifeOf[slot] = look.life; seeds[slot] = seed;
      clearSlot(slot);
      return slot;
    },
    slotOf(key) {
      for (let i = 0; i < RIBBON_SLOTS; i++) if (keys[i] === key) return i;
      return -1;
    },
    point(slot, x, y, z, birth, flightS = 99) {
      if (slot < 0 || !looks[slot]) return;
      const k = count[slot] % RIBBON_POINTS;
      let tx = 0, ty = 0, tz = 1;
      if (count[slot] > 0) {
        tx = x - lx[slot]; ty = y - ly[slot]; tz = z - lz[slot];
        const l = Math.hypot(tx, ty, tz) || 1;
        along[slot] += l;
        tx /= l; ty /= l; tz /= l;
        // the previous point now knows its successor
        setTangent(slot, (count[slot] - 1) % RIBBON_POINTS, tx, ty, tz);
      }
      const v = (slot * RIBBON_POINTS + k) * 2;
      writeVertex(v, slot, x, y, z, birth, tx, ty, tz, -1, along[slot], flightS);
      writeVertex(v + 1, slot, x, y, z, birth, tx, ty, tz, 1, along[slot], flightS);
      for (let a = 0; a < ATTRS.length; a++) markRange(ATTRS[a]!, v, 2);
      lx[slot] = x; ly[slot] = y; lz[slot] = z;
      count[slot]++;
      points++;
      lastBirth[slot] = birth;
      if (birth + lifeOf[slot] > liveUntil) liveUntil = birth + lifeOf[slot];
      writeIndex(slot);
    },
    update(now) {
      lastNow = now;
      mesh.visible = now <= liveUntil;
    },
    shiftTime(delta) {
      for (let v = 0; v < N * 2; v++) aP.array[v * 4 + 3] += delta;
      markRange(aP, 0, N * 2);
      for (let i = 0; i < RIBBON_SLOTS; i++) lastBirth[i] += delta;
      liveUntil += delta; lastNow += delta;
    },
    reset() {
      for (let i = 0; i < RIBBON_SLOTS; i++) { keys[i] = -1; looks[i] = null; clearSlot(i); }
      liveUntil = -Infinity;
      mesh.visible = false;
    },
    stats() {
      let live = 0;
      for (let i = 0; i < RIBBON_SLOTS; i++) if (keys[i] >= 0 && count[i] > 0 && lastBirth[i] + lifeOf[i] >= lastNow) live++;
      return { live, points, indices: index.count };
    },
  };
}
