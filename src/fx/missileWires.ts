/**
 * missileWires.ts — a wire-guided missile's command wire, paid out from its launcher (FX lane, 2026-10-14).
 *
 * The owner: "make sure the actual tow from tow missiles is attached to the tow launcher if it has a missile with string."
 * Round 9a drew the wires as faint additive capsules from the point the round was fired at: a launcher that drove on or
 * slewed its turret left the wire's end hanging in the air where it had been, and the additive glint all but vanished
 * against the sky.
 *
 * A TOW, Konkurs/Fagot, MILAN/HOT, Malyutka or Jyu-MAT unspools its wire from the missile's tail as it flies: the wire
 * is laid in the air along the path the missile took and sinks slowly as a fine wire does, pulled straight over its last
 * metres by the missile and over its first by the tube it leaves. Its fixed end is the launcher's tube mouth, live every
 * frame, so the near stretch swings with the vehicle and the turret. When the missile strikes or self-destructs, the wire
 * parts at the missile, goes slack, drops to the ground and fades out there.
 *
 * Drawn as thin camera-facing lines (never under ~1 px; their coverage pays the difference, with a floor so the wire
 * stays readable), dark steel lit by the time of day with a specular glint where a stretch faces the sun to the eye.
 * Budget: one draw call; WIRE_SLOTS wires of up to two strands, WIRE_POINTS laid points each, in fixed buffers; a live
 * wire's vertices are rewritten every frame (its sag, its launcher), uploaded per line; nothing allocates per frame and
 * nothing is drawn while no wire lives.
 */
import * as THREE from 'three';
import { LATE_FX_LAYER } from './layers.ts';
import type { SceneLightUniforms } from './sceneLight.ts';

export const WIRE_SLOTS = 16;
/** points laid along a wire's flight (when it fills, every other one goes and the spacing doubles: never cut short) */
export const WIRE_POINTS = 40;
const STRANDS = 2;
/** vertices per strand: the laid points and the missile's tail, two each */
const LINE_V = (WIRE_POINTS + 1) * 2;
const LINES = WIRE_SLOTS * STRANDS;
const STRIDE = 8;

/** a point every LAY_M of flight */
export const WIRE_LAY_M = 5;
/** the wire's diameter (m): a guidance wire is a fraction of a millimetre; drawn no thinner than DRAW_MIN_PX */
const WIRE_D = 0.0006;
const DRAW_MIN_PX = 2.0;
/** the least coverage it keeps however far (so the paid-out wire reads as a thread to the missile) */
const COVER_FLOOR = 0.34;
/** a laid stretch sinks toward this speed (m/s) and reaches it over FALL_T s */
const FALL_V = 0.42, FALL_T = 0.5;
/** pulled straight over its last TAUT_M to the missile and its first LEAVE_M out of the tube */
const TAUT_M = 14, LEAVE_M = 3;
/** the launcher's own motion carries along the wire, fading over FOLLOW_M from the tube */
const FOLLOW_M = 22;
/** once parted: slack, it falls faster (m/s) and fades out on the ground */
const SLACK_V = 1.6, SLACK_T = 0.45, FADE0 = 2.2, FADE1 = 3.6;
/** the two strands of a twin-wire round ride this far apart (m) */
const STRAND_GAP = 0.035;

export interface MissileWires {
  readonly mesh: THREE.Mesh;
  /** A wire for round `key`, `strands` (1 or 2), paid out from the tube mouth at (x, y, z) at fx time `now`. */
  begin(key: number, strands: number, x: number, y: number, z: number, now: number): number;
  /** The slot `key` holds, or -1. */
  slotOf(key: number): number;
  /** The launcher's tube mouth now: the wire's fixed end (it follows the vehicle and the turret). */
  anchor(slot: number, x: number, y: number, z: number): void;
  /** The missile's tail now: the wire pays out to it and is laid where it passes. */
  tail(slot: number, x: number, y: number, z: number, now: number): void;
  /** The missile is gone (struck, self-destructed): the wire parts at its end, goes slack and settles. */
  cut(slot: number, now: number): void;
  /** Per render frame: write every live wire (its sag, its launcher, its fall once parted); hide when none lives. */
  update(now: number, groundY: (x: number, z: number) => number): void;
  shiftTime(delta: number): void;
  reset(): void;
  /** receipts: live wires, parted ones still settling, laid points */
  stats(): { live: number; parted: number; points: number };
  /** receipts: a strand's drawn points (x, y, z, alpha) this frame */
  strandPoints(slot: number, strand: number): number[];
}

const VERT = /* glsl */ `
attribute vec4 aP;   // the point (world), its alpha (0: unused)
attribute vec4 aT;   // the wire's tangent there (world), side (-1 | +1)
uniform vec2 uViewport;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
varying float vA;
varying float vSide;
varying vec3 vCol;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  // (an unused point sits on the line's last one with no alpha: its quads have no area; never thrown off screen, where
  // a quad half on the line would draw a sliver toward the far plane)
  vec4 mv = viewMatrix * vec4( aP.xyz, 1.0 );
  mv.z = min( mv.z, -0.05 );
  vec4 c0 = projectionMatrix * mv;
  vec3 ahead = aP.xyz + aT.xyz * max( 0.05, 0.02 * -mv.z );
  vec4 c1 = projectionMatrix * ( viewMatrix * vec4( ahead, 1.0 ) );
  vec2 h = 0.5 * uViewport;
  vec2 s0 = c0.xy / c0.w * h, s1 = c1.xy / max( c1.w, 1e-4 ) * h;
  vec2 d = s1 - s0;
  float l = length( d );
  d = l > 1e-4 ? d / l : vec2( 1.0, 0.0 );
  vec2 n = vec2( -d.y, d.x );
  // its true width on screen, and the width drawn: never under DRAW_MIN px (a tent across it, so its total coverage holds
  // still as it crawls over the pixels), its coverage paying the difference down to a floor that keeps it readable
  float ppm = projectionMatrix[ 1 ][ 1 ] * h.y / c0.w;
  float trueW = ${WIRE_D.toFixed(5)} * ppm;
  float drawW = max( trueW, ${DRAW_MIN_PX.toFixed(2)} );
  float cover = max( min( 1.0, trueW / ( 0.5 * drawW ) ), ${COVER_FLOOR.toFixed(2)} );
  c0.xy += n * ( aT.w * 0.5 * drawW ) / h * c0.w;
  gl_Position = c0;
  vSide = aT.w;
  // dark drawn steel: the sky and the ground on it, the sun on its round side, and the glint where the half-way vector
  // stands square to the wire (a stretch that faces the sun to the eye flashes along its length)
  vec3 v = normalize( cameraPosition - aP.xyz );
  vec3 t = normalize( aT.xyz );
  float lt = dot( uSunDir, t );
  float diffuse = sqrt( max( 0.0, 1.0 - lt * lt ) ) * max( 0.0, 0.35 + 0.65 * uSunDir.y );
  vec3 hv = normalize( uSunDir + v );
  float ht = dot( hv, t );
  float glint = pow( max( 0.0, 1.0 - ht * ht ), 90.0 ) * step( 0.0, uSunDir.y );
  vec3 albedo = vec3( 0.2, 0.19, 0.17 );
  vCol = albedo * ( uSunCol * diffuse * 0.6 + uSkyCol * 0.9 + uGroundCol * 0.35 ) + uSunCol * glint * 0.9;
  vA = max( 0.0, aP.w ) * cover * ( 1.0 + 1.6 * glint );
  #ifdef USE_FOG
    vFogDepth = -mv.z;
  #endif
}
`;

const FRAG = /* glsl */ `
varying float vA;
varying float vSide;
varying vec3 vCol;
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
  float a = vA * ( 1.0 - abs( vSide ) );
  if ( a < 0.004 ) discard;
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

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createMissileWires(light: SceneLightUniforms): MissileWires {
  const data = new Float32Array(LINES * LINE_V * STRIDE);
  const buf = new THREE.InterleavedBuffer(data, STRIDE);
  buf.setUsage(THREE.DynamicDrawUsage);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aP', new THREE.InterleavedBufferAttribute(buf, 4, 0));
  geo.setAttribute('aT', new THREE.InterleavedBufferAttribute(buf, 4, 4));
  // three sizes the draw from a position attribute; the shader never reads it
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINES * LINE_V * 3), 3));
  const idx = new Uint16Array(LINES * (WIRE_POINTS) * 6);
  for (let line = 0; line < LINES; line++) {
    for (let j = 0; j < WIRE_POINTS; j++) {
      const o = (line * WIRE_POINTS + j) * 6, a = line * LINE_V + j * 2, b = a + 2;
      idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = b; idx[o + 3] = b; idx[o + 4] = a + 1; idx[o + 5] = b + 1;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const uViewport = { value: new THREE.Vector2(1920, 1080) };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uViewport, uSunDir: light.uSunDir, uSunCol: light.uSunCol, uSkyCol: light.uSkyCol, uGroundCol: light.uGroundCol,
    }),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'fx-missile-wires';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // the late pass, with the missile bodies (the wire runs from the launcher into the body's tail)
  mesh.renderOrder = 24.5;
  mesh.layers.set(LATE_FX_LAYER);
  mesh.visible = false;
  const _vp = new THREE.Vector4();
  mesh.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(_vp);
    uViewport.value.set(Math.max(1, _vp.z), Math.max(1, _vp.w));
  };

  // a slot's round (its key may be any number, negative too: whether a slot is taken is its own flag)
  const keys = new Float64Array(WIRE_SLOTS);
  const used = new Uint8Array(WIRE_SLOTS);
  const strandsOf = new Int8Array(WIRE_SLOTS);
  const count = new Int32Array(WIRE_SLOTS);
  // laid points: x, y, z, the time laid, the metres of wire out to it
  const laid = new Float64Array(WIRE_SLOTS * WIRE_POINTS * 5);
  const launch = new Float64Array(WIRE_SLOTS * 3);
  const anc = new Float64Array(WIRE_SLOTS * 3);
  const tl = new Float64Array(WIRE_SLOTS * 3);
  const cutAt = new Float64Array(WIRE_SLOTS).fill(-1);
  const layStep = new Float64Array(WIRE_SLOTS).fill(WIRE_LAY_M);
  const bornAt = new Float64Array(WIRE_SLOTS);
  const wrote = new Uint8Array(LINES);
  // per-frame scratch: one strand's points before its tangents (x, y, z) and their along-wire distance
  const px = new Float64Array(WIRE_POINTS + 1), py = new Float64Array(WIRE_POINTS + 1), pz = new Float64Array(WIRE_POINTS + 1);
  const ps = new Float64Array(WIRE_POINTS + 1);
  let points = 0;

  function clearLine(line: number): void {
    if (!wrote[line]) return;
    const o0 = line * LINE_V * STRIDE;
    for (let v = 0; v < LINE_V; v++) for (let c = 0; c < STRIDE; c++) data[o0 + v * STRIDE + c] = data[o0 + (v & 1) * STRIDE + c];
    for (let v = 0; v < LINE_V; v++) data[o0 + v * STRIDE + 3] = 0;
    buf.addUpdateRange(o0, LINE_V * STRIDE);
    buf.needsUpdate = true;
    wrote[line] = 0;
  }
  function free(slot: number): void {
    used[slot] = 0; count[slot] = 0; cutAt[slot] = -1;
    for (let s = 0; s < STRANDS; s++) clearLine(slot * STRANDS + s);
  }
  function lay(slot: number, x: number, y: number, z: number, now: number): void {
    let n = count[slot];
    if (n >= WIRE_POINTS) {
      // full: every other point goes (the tube's and the newest stay) and the next are laid twice as far apart, so the
      // wire keeps an even resolution from the tube to the missile however long it flies
      const base = slot * WIRE_POINTS * 5;
      let w = 1;
      for (let r = 1; r < n; r++) {
        if (r % 2 === 0 && r < n - 1) continue;
        if (w !== r) for (let c = 0; c < 5; c++) laid[base + w * 5 + c] = laid[base + r * 5 + c];
        w++;
      }
      n = w;
      layStep[slot] *= 2;
    }
    const o = (slot * WIRE_POINTS + n) * 5;
    const p = o - 5;
    laid[o] = x; laid[o + 1] = y; laid[o + 2] = z; laid[o + 3] = now;
    laid[o + 4] = n > 0 ? laid[p + 4] + Math.hypot(x - laid[p], y - laid[p + 1], z - laid[p + 2]) : 0;
    count[slot] = n + 1;
    points++;
  }

  function writeStrand(slot: number, strand: number, now: number, groundY: (x: number, z: number) => number, fade: number): void {
    const line = slot * STRANDS + strand;
    const n = count[slot];
    const base = slot * WIRE_POINTS * 5;
    const parted = cutAt[slot] >= 0;
    const cutAge = parted ? now - cutAt[slot] : 0;
    const dx = anc[slot * 3] - launch[slot * 3], dy = anc[slot * 3 + 1] - launch[slot * 3 + 1], dz = anc[slot * 3 + 2] - launch[slot * 3 + 2];
    const tx = tl[slot * 3], ty = tl[slot * 3 + 1], tz = tl[slot * 3 + 2];
    const lastO = base + (n - 1) * 5;
    const total = laid[lastO + 4] + (parted ? 0 : Math.hypot(tx - laid[lastO], ty - laid[lastO + 1], tz - laid[lastO + 2]));
    // the strands ride either side of the line from the tube to the missile (a level side vector)
    let sx = -(tz - anc[slot * 3 + 2]), sz = tx - anc[slot * 3];
    const sl = Math.hypot(sx, sz);
    if (sl > 1e-6) { sx /= sl; sz /= sl; } else { sx = 1; sz = 0; }
    const off = strandsOf[slot] > 1 ? (strand === 0 ? -STRAND_GAP : STRAND_GAP) : 0;
    const fallK = strand === 0 ? 1 : 0.9;
    const slack = parted ? SLACK_V * (cutAge - SLACK_T * (1 - Math.exp(-cutAge / SLACK_T))) : 0;
    let m = 0;
    for (let k = 0; k < n; k++) {
      const o = base + k * 5;
      const s = laid[o + 4];
      const w = k === 0 ? 1 : Math.exp(-s / FOLLOW_M);
      let x = laid[o] + dx * w, y = laid[o + 1] + dy * w, z = laid[o + 2] + dz * w;
      const age = now - laid[o + 3];
      const fall = FALL_V * (age - FALL_T * (1 - Math.exp(-age / FALL_T)));
      const taut = parted ? 1 : smooth(0, TAUT_M, total - s);
      const leave = smooth(0, LEAVE_M, s);
      const sink = (fall * taut + slack) * leave * fallK;
      const side = off * Math.min(1, s / 2);
      x += sx * side; z += sz * side;
      y = Math.max(y - sink, groundY(x, z) + 0.03);
      px[m] = x; py[m] = y; pz[m] = z; ps[m] = s; m++;
    }
    if (!parted) { px[m] = tx + sx * off; py[m] = ty; pz[m] = tz + sz * off; ps[m] = total; m++; }
    const o0 = line * LINE_V * STRIDE;
    for (let k = 0; k < m; k++) {
      const a = Math.max(0, k - 1), b = Math.min(m - 1, k + 1);
      let ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a];
      const ul = Math.hypot(ux, uy, uz);
      if (ul > 1e-6) { ux /= ul; uy /= ul; uz /= ul; } else { ux = 0; uy = 0; uz = 1; }
      for (let e = 0; e < 2; e++) {
        const o = o0 + (k * 2 + e) * STRIDE;
        data[o] = px[k]; data[o + 1] = py[k]; data[o + 2] = pz[k]; data[o + 3] = m > 1 ? fade : 0;
        data[o + 4] = ux; data[o + 5] = uy; data[o + 6] = uz; data[o + 7] = e === 0 ? -1 : 1;
      }
    }
    // the rest of the line draws nothing: its last point repeated with its tangent and no alpha (quads of no area)
    const lo = o0 + (m - 1) * 2 * STRIDE;
    for (let k = m; k <= WIRE_POINTS; k++) {
      for (let e = 0; e < 2; e++) {
        const o = o0 + (k * 2 + e) * STRIDE;
        for (let c = 0; c < STRIDE; c++) data[o + c] = data[lo + e * STRIDE + c];
        data[o + 3] = 0;
      }
    }
    buf.addUpdateRange(o0, LINE_V * STRIDE);
    buf.needsUpdate = true;
    wrote[line] = 1;
  }

  return {
    mesh,
    begin(key, strands, x, y, z, now) {
      let slot = -1, oldest = Infinity;
      for (let i = 0; i < WIRE_SLOTS; i++) {
        if (used[i] && keys[i] === key) return i;
        // a free slot, else the parted wire that parted first, else the oldest wire
        const rank = !used[i] ? -Infinity : cutAt[i] >= 0 ? cutAt[i] - 1e6 : bornAt[i];
        if (rank < oldest) { oldest = rank; slot = i; }
      }
      free(slot);
      keys[slot] = key; used[slot] = 1; strandsOf[slot] = Math.max(1, Math.min(STRANDS, strands | 0)); bornAt[slot] = now;
      layStep[slot] = WIRE_LAY_M;
      launch[slot * 3] = x; launch[slot * 3 + 1] = y; launch[slot * 3 + 2] = z;
      anc[slot * 3] = x; anc[slot * 3 + 1] = y; anc[slot * 3 + 2] = z;
      tl[slot * 3] = x; tl[slot * 3 + 1] = y; tl[slot * 3 + 2] = z;
      lay(slot, x, y, z, now);
      return slot;
    },
    slotOf(key) {
      for (let i = 0; i < WIRE_SLOTS; i++) if (used[i] && keys[i] === key) return i;
      return -1;
    },
    anchor(slot, x, y, z) {
      if (slot < 0 || !used[slot] || cutAt[slot] >= 0) return;
      anc[slot * 3] = x; anc[slot * 3 + 1] = y; anc[slot * 3 + 2] = z;
    },
    tail(slot, x, y, z, now) {
      if (slot < 0 || !used[slot] || cutAt[slot] >= 0) return;
      tl[slot * 3] = x; tl[slot * 3 + 1] = y; tl[slot * 3 + 2] = z;
      const o = (slot * WIRE_POINTS + count[slot] - 1) * 5;
      if (Math.hypot(x - laid[o], y - laid[o + 1], z - laid[o + 2]) >= layStep[slot]) lay(slot, x, y, z, now);
    },
    cut(slot, now) {
      if (slot < 0 || !used[slot] || cutAt[slot] >= 0) return;
      // the stretch out to where the missile was is laid as it stood: it parts there
      const o = (slot * WIRE_POINTS + count[slot] - 1) * 5;
      const x = tl[slot * 3], y = tl[slot * 3 + 1], z = tl[slot * 3 + 2];
      if (Math.hypot(x - laid[o], y - laid[o + 1], z - laid[o + 2]) > 0.05) lay(slot, x, y, z, now);
      cutAt[slot] = now;
    },
    update(now, groundY) {
      let any = false;
      for (let i = 0; i < WIRE_SLOTS; i++) {
        if (!used[i]) continue;
        const fade = cutAt[i] >= 0 ? 1 - smooth(FADE0, FADE1, now - cutAt[i]) : 1;
        if (fade <= 0) { free(i); continue; }
        any = true;
        for (let s = 0; s < STRANDS; s++) {
          if (s < strandsOf[i]) writeStrand(i, s, now, groundY, fade);
          else clearLine(i * STRANDS + s);
        }
      }
      mesh.visible = any;
    },
    shiftTime(delta) {
      for (let i = 0; i < WIRE_SLOTS; i++) {
        if (!used[i]) continue;
        for (let k = 0; k < count[i]; k++) laid[(i * WIRE_POINTS + k) * 5 + 3] += delta;
        if (cutAt[i] >= 0) cutAt[i] += delta;
        bornAt[i] += delta;
      }
    },
    reset() {
      for (let i = 0; i < WIRE_SLOTS; i++) free(i);
      mesh.visible = false;
    },
    stats() {
      let live = 0, parted = 0;
      for (let i = 0; i < WIRE_SLOTS; i++) if (used[i]) { if (cutAt[i] >= 0) parted++; else live++; }
      return { live, parted, points };
    },
    strandPoints(slot, strand) {
      const out: number[] = [];
      const o0 = (slot * STRANDS + strand) * LINE_V * STRIDE;
      for (let k = 0; k <= WIRE_POINTS; k++) {
        const o = o0 + k * 2 * STRIDE;
        if (data[o + 3] > 0) out.push(data[o], data[o + 1], data[o + 2], data[o + 3]);
      }
      return out;
    },
  };
}
