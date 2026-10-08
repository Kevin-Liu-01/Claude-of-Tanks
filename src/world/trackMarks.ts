// src/world/trackMarks.ts — the ground lane (2026-10-08, the coordinator's backlog after wave 265's weathering critics:
// "tank track marks — a ground overlay like the craters' per-battle one, a decaying ring buffer of marks (soil, sand,
// snow); MP-safe, cosmetic only, local per client; budget like craters").
//
// Every presented tank lays its two tracks' marks behind it: a strip per track, a vertex pair every TRACK_MARKS.spacingM
// of the track's own travel, each pair across the track's width at the track's centreline (the hull's half gauge out
// from its centre), conformed to the ground as the nearest terrain mesh draws it (terrain.ts terrainNearMeshHeightAt)
// and lifted a few centimetres. Every segment is written once into a ring of TRACK_MARKS.segments quads (one dynamic
// buffer, one draw): its place across the track (u, -1..1), its distance along it (v, metres: the shoes' pitch), its
// birth (s) and its ground (earth, a road's hard surface, sand, snow, mud). The material MODULATES what the terrain drew
// (out = 2 · src · dst, 0.5 neutral): the lit, shadowed, fogged ground darkened in the track's body and its shoes' bars,
// its berms a touch lighter on sand and snow — so a mark keeps the ground's own light and colour, and draws only where
// the ground is the visible surface (the grass, the props and the hulls stand in front of it). Marks fade in their last
// minute of life and as the ring wraps (the oldest fifth of what it holds fades as it is overwritten), and with the
// camera's distance. A battle starts clean (map.ts resetDestructibles). Cosmetic: no simulation reads it; each client
// lays the marks of the tanks it presents (a hidden tank lays none).
import * as THREE from 'three';
import { terrainNearMeshHeightAt } from './terrain.ts';

/** The ground a mark lies on (the shader's tint). */
export const TRACK_MARK_GROUND = Object.freeze({ earth: 0, hard: 1, sand: 2, snow: 3, mud: 4 });

export const TRACK_MARKS = Object.freeze({
  /** Segments in the ring (desktop), and on the phones. */
  // (16 384 quads hold ~100 s of ten hulls driving within the gate; the phones a quarter)
  segments: 16384,
  segmentsMobile: 4096,
  /** A track lays a vertex pair every this many metres of its own travel (the terrain mesh's cell is 1.33 m). */
  spacingM: 1.0,
  /** A track that jumps further than this between frames (a respawn, a teleport) starts a new strip. */
  breakM: 6,
  /** The mark's lift over the ground mesh (m); the material's polygon offset does the rest. */
  liftM: 0.03,
  /** Life (s): whole until its last `fadeS`. */
  lifeS: 240,
  fadeS: 60,
  /** The share of the ring's span over which its oldest marks fade as they are overwritten. */
  ringFade: 0.2,
  /** Camera distance (m) over which the marks fade out, and beyond which no hull lays them (the ring is kept for the
   * marks the camera can see). */
  fadeNearM: 140,
  fadeFarM: 220,
  gateM: 180,
  /** A hull slower than this lays nothing (m/s). */
  minSpeedMps: 0.4,
});

/** The height field the marks read (terrain.ts HeightField's subset). */
export interface TrackMarksField {
  getHeightAt(x: number, z: number): number;
  getTrackSurfaceAt?(x: number, z: number): number;
  getGroundType?(x: number, z: number): 'hard' | 'medium' | 'soft';
  getWaterMaskAt?(x: number, z: number): number;
}

export interface TrackMarksOptions {
  /** The ring's size (segments). */
  segments?: number;
}

export interface TrackMarksStats {
  /** Segments written since the battle began, and those the ring holds now. */
  written: number;
  held: number;
  /** Tracks being followed. */
  tracks: number;
}

export interface TrackMarks {
  readonly mesh: THREE.Mesh;
  /**
   * One presented hull this frame: its key (any stable object: the entity), its centre on the ground (x, z), its
   * heading (unit xz), its ground speed (m/s), the half gauge (m, hull centre to a track's centreline) and the track's
   * width (m).
   */
  stamp(key: object, x: number, z: number, fx: number, fz: number, speed: number, halfGaugeM: number, trackWidthM: number): void;
  /**
   * Diagnostics and the capture tools (the lab, the census, the cost probe): drive hulls along polylines
   * ([x0, z0, x1, z1, ...] each) at `speedMps`, stamped at 60 Hz, past the camera gate. Returns the stamps made.
   */
  layPaths(paths: readonly (readonly number[])[], speedMps?: number): number;
  /** Advance the marks' clock and set the camera they fade from. */
  update(dt: number, camera: { x: number; y: number; z: number }): void;
  /** A clean ground (a new battle). */
  reset(): void;
  stats(): TrackMarksStats;
  dispose(): void;
}

const VERTEX = /* glsl */`
attribute vec4 aMark;
uniform float uTime;
uniform vec4 uLife;   // (life s, fade s, the ring's oldest birth, its fade span s — 0 until the ring has wrapped)
uniform vec4 uCam;    // (camera xyz, 0)
uniform vec2 uFar;    // (fade from m, gone by m)
varying vec2 vMark;
varying float vA;
varying float vGround;
varying float vDist;
void main() {
  float birth = aMark.z;
  float age = uTime - birth;
  float a = age < 0.0 ? 0.0 : 1.0 - smoothstep(uLife.x - uLife.y, uLife.x, age);
  // (the lab's first frames: an unwrapped ring's -Infinity edge made this NaN and every mark vanished) the ring's fade
  // only once it has wrapped
  if (uLife.w > 0.0) a *= smoothstep(uLife.z, uLife.z + uLife.w, birth);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float dist = distance(wp.xyz, uCam.xyz);
  a *= 1.0 - smoothstep(uFar.x, uFar.y, dist);
  vA = a;
  vDist = dist;
  vMark = aMark.xy;
  vGround = aMark.w;
  gl_Position = a <= 0.001 ? vec4(0.0, 0.0, 2.0, 1.0) : projectionMatrix * viewMatrix * wp;
}`;

const FRAGMENT = /* glsl */`
varying vec2 vMark;
varying float vA;
varying float vGround;
varying float vDist;
// a value noise along the strip (metres): the track's own unevenness — the ground pressed harder in one stretch than
// the next, the edge pushed out here and torn there
float tmHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float tmNoise(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(tmHash(i), tmHash(i + 1.0), f); }
void main() {
  float v = vMark.y;
  // (the lab's frames: crisp, even stripes read as lines painted on the ground) the edge wanders a few centimetres and
  // tears, the pressing comes and goes along the strip, and the whole mark softens with the distance
  float u = abs(vMark.x) + (tmNoise(v * 2.3) - 0.5) * 0.16 + (tmNoise(v * 7.1 + 3.7) - 0.5) * 0.08;
  float body = 1.0 - smoothstep(0.74, 1.0, u);
  float berm = smoothstep(0.66, 0.84, u) * (1.0 - smoothstep(0.88, 1.0, u));
  float press = 0.62 + 0.38 * tmNoise(v * 0.59 + 11.3) * (0.7 + 0.3 * tmNoise(v * 1.9 + 5.1));
  press *= mix(1.0, 0.55, smoothstep(15.0, 90.0, vDist));
  // the shoes' grousers across the track every 0.17 m (bars a third of the pitch), faded before they can alias
  float q = v / 0.17;
  float w = fwidth(q);
  float f = fract(q);
  float bar = smoothstep(0.30 - w, 0.30 + w, f) * (1.0 - smoothstep(0.62 - w, 0.62 + w, f)) * (1.0 - smoothstep(0.20, 0.55, w));
  // the shoes' own ragged print: the bars break toward the edges and come and go with the pressing
  bar *= (1.0 - smoothstep(0.55, 0.92, u)) * (0.55 + 0.45 * tmNoise(v * 3.3 + 1.9));
  vec3 body3, bar3; float bermK;
  if (vGround < 0.5) {        // earth: the sward crushed into the soil, darker and browner
    body3 = vec3(0.82, 0.77, 0.70); bar3 = vec3(0.72, 0.67, 0.60); bermK = 0.95;
  } else if (vGround < 1.5) { // a road: the dirt and rubber carried onto it, faint, no print
    body3 = vec3(0.93, 0.92, 0.91); bar3 = body3; bermK = 1.0;
  } else if (vGround < 2.5) { // sand: pressed darker, the berm's loose sand paler
    body3 = vec3(0.87, 0.84, 0.80); bar3 = vec3(0.80, 0.77, 0.73); bermK = 1.07;
  } else if (vGround < 3.5) { // snow: packed grey-blue, the berm's loose snow brighter
    body3 = vec3(0.85, 0.88, 0.94); bar3 = vec3(0.78, 0.82, 0.89); bermK = 1.08;
  } else {                    // mud: wet and dark
    body3 = vec3(0.66, 0.62, 0.57); bar3 = vec3(0.56, 0.52, 0.48); bermK = 0.90;
  }
  vec3 m = mix(body3, bar3, bar);
  m = mix(m, vec3(bermK), berm);
  m = mix(vec3(1.0), m, body * vA * press);
  // modulate: out = 2 · src · dst (0.5 leaves the ground as it is)
  gl_FragColor = vec4(m * 0.5, 1.0);
}`;

interface TrackState {
  has: boolean;
  /** The last pair's centre and its two edges (x, y, z each) and the distance along the strip there. */
  cx: number; cz: number;
  l: [number, number, number];
  r: [number, number, number];
  v: number;
}
interface HullState { tracks: [TrackState, TrackState] }

function newTrack(): TrackState {
  return { has: false, cx: 0, cz: 0, l: [0, 0, 0], r: [0, 0, 0], v: 0 };
}

export function createTrackMarks(field: TrackMarksField, options: TrackMarksOptions = {}): TrackMarks {
  const segments = Math.max(64, Math.floor(options.segments ?? TRACK_MARKS.segments));
  const positions = new Float32Array(segments * 4 * 3);
  const marks = new Float32Array(segments * 4 * 4);
  // every slot unborn (birth far in the future: invisible) until written
  for (let i = 0; i < segments * 4; i++) marks[i * 4 + 2] = 1e9;
  const births = new Float64Array(segments).fill(Number.NEGATIVE_INFINITY);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  const mark = new THREE.BufferAttribute(marks, 4);
  position.setUsage(THREE.DynamicDrawUsage);
  mark.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aMark', mark);
  const index = new (segments * 4 > 65535 ? Uint32Array : Uint16Array)(segments * 6);
  // (the lab's first frames: wound l0 → r0 → r1 the quads faced down, and the front-face cull dropped every mark seen
  // from above) l0 → r1 → r0 and l0 → l1 → r1: counter-clockwise from above, facing up
  for (let s = 0; s < segments; s++) {
    const v = s * 4, i = s * 6;
    index[i] = v; index[i + 1] = v + 2; index[i + 2] = v + 1;
    index[i + 3] = v; index[i + 4] = v + 3; index[i + 5] = v + 2;
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  // the ring spans the whole map: the bounds never cull it (the vertex stage drops the dead and the far)
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const uniforms = {
    uTime: { value: 0 },
    uLife: { value: new THREE.Vector4(TRACK_MARKS.lifeS, TRACK_MARKS.fadeS, 0, 0) },
    uCam: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFar: { value: new THREE.Vector2(TRACK_MARKS.fadeNearM, TRACK_MARKS.fadeFarM) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'world-track-marks',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    lights: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.SrcColorFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'track-marks';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;

  let hulls = new WeakMap<object, HullState>();
  let followed = 0;
  let cursor = 0, written = 0, time = 0;
  let camX = 0, camZ = 0, camKnown = false, gated = true;
  const meshAt = (x: number, z: number): number => terrainNearMeshHeightAt((px, pz) => field.getHeightAt(px, pz), x, z);

  function groundAt(x: number, z: number): number {
    const type = field.getGroundType ? field.getGroundType(x, z) : 'medium';
    if (type === 'hard') return TRACK_MARK_GROUND.hard;
    if (type === 'soft') return TRACK_MARK_GROUND.mud;
    const surface = field.getTrackSurfaceAt ? field.getTrackSurfaceAt(x, z) : 0;
    return surface === 2 ? TRACK_MARK_GROUND.sand : surface === 3 ? TRACK_MARK_GROUND.snow : TRACK_MARK_GROUND.earth;
  }

  function writeSegment(a: TrackState, l: [number, number, number], r: [number, number, number], v1: number, ground: number): void {
    const s = cursor;
    cursor = (cursor + 1) % segments;
    const p = s * 12, m = s * 16;
    // the quad: the last pair (left, right) and this one (right, left)
    positions[p] = a.l[0]; positions[p + 1] = a.l[1]; positions[p + 2] = a.l[2];
    positions[p + 3] = a.r[0]; positions[p + 4] = a.r[1]; positions[p + 5] = a.r[2];
    positions[p + 6] = r[0]; positions[p + 7] = r[1]; positions[p + 8] = r[2];
    positions[p + 9] = l[0]; positions[p + 10] = l[1]; positions[p + 11] = l[2];
    const us = [-1, 1, 1, -1], vs = [a.v, a.v, v1, v1];
    for (let k = 0; k < 4; k++) {
      marks[m + k * 4] = us[k];
      marks[m + k * 4 + 1] = vs[k];
      marks[m + k * 4 + 2] = time;
      marks[m + k * 4 + 3] = ground;
    }
    births[s] = time;
    position.addUpdateRange(p, 12);
    mark.addUpdateRange(m, 16);
    position.needsUpdate = true;
    mark.needsUpdate = true;
    written++;
  }

  const _l: [number, number, number] = [0, 0, 0];
  const _r: [number, number, number] = [0, 0, 0];

  function stampTrack(t: TrackState, cx: number, cz: number, rx: number, rz: number, hw: number): void {
    // the pair across the track at its centre: left and right edges, on the drawn ground
    const lx = cx - rx * hw, lz = cz - rz * hw, gx = cx + rx * hw, gz = cz + rz * hw;
    if (!t.has) {
      t.has = true; t.cx = cx; t.cz = cz; t.v = 0;
      t.l[0] = lx; t.l[1] = meshAt(lx, lz) + TRACK_MARKS.liftM; t.l[2] = lz;
      t.r[0] = gx; t.r[1] = meshAt(gx, gz) + TRACK_MARKS.liftM; t.r[2] = gz;
      return;
    }
    const d = Math.hypot(cx - t.cx, cz - t.cz);
    if (d > TRACK_MARKS.breakM) { t.has = false; stampTrack(t, cx, cz, rx, rz, hw); return; }
    if (d < TRACK_MARKS.spacingM) return;
    _l[0] = lx; _l[1] = meshAt(lx, lz) + TRACK_MARKS.liftM; _l[2] = lz;
    _r[0] = gx; _r[1] = meshAt(gx, gz) + TRACK_MARKS.liftM; _r[2] = gz;
    const v1 = t.v + d;
    // in water the wake is the FX layer's: no mark, and the strip starts again on the far bank
    const wet = field.getWaterMaskAt ? field.getWaterMaskAt(cx, cz) : 0;
    if (wet <= 0.02) writeSegment(t, _l, _r, v1, groundAt(cx, cz));
    t.cx = cx; t.cz = cz; t.v = v1;
    t.l[0] = _l[0]; t.l[1] = _l[1]; t.l[2] = _l[2];
    t.r[0] = _r[0]; t.r[1] = _r[1]; t.r[2] = _r[2];
  }

  function stamp(key: object, x: number, z: number, fx: number, fz: number, speed: number, halfGaugeM: number, trackWidthM: number): void {
    if (!(speed >= TRACK_MARKS.minSpeedMps)) return;
    if (gated && camKnown && Math.hypot(x - camX, z - camZ) > TRACK_MARKS.gateM) return;
    let hull = hulls.get(key);
    if (!hull) { hull = { tracks: [newTrack(), newTrack()] }; hulls.set(key, hull); followed++; }
    const fl = Math.hypot(fx, fz) || 1;
    const ux = fx / fl, uz = fz / fl;
    const rx = uz, rz = -ux; // the hull's right in world xz
    const hw = Math.max(0.15, trackWidthM * 0.5);
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      stampTrack(hull.tracks[side], x + rx * halfGaugeM * sgn, z + rz * halfGaugeM * sgn, rx, rz, hw);
    }
  }

  return {
    mesh,
    stamp,
    layPaths(paths, speedMps = 8) {
      const step = speedMps / 60;
      let n = 0;
      gated = false;
      try {
        for (const path of paths) {
          const key = {};
          for (let i = 0; i + 3 < path.length; i += 2) {
            const ax = path[i], az = path[i + 1], bx = path[i + 2], bz = path[i + 3];
            const len = Math.hypot(bx - ax, bz - az) || 1, fx = (bx - ax) / len, fz = (bz - az) / len;
            for (let d = 0; d < len; d += step) { stamp(key, ax + fx * d, az + fz * d, fx, fz, speedMps, 1.55, 0.6); n++; }
          }
        }
      } finally { gated = true; }
      return n;
    },
    update(dt, camera) {
      time += Math.max(0, dt);
      uniforms.uTime.value = time;
      camX = camera.x; camZ = camera.z; camKnown = true;
      uniforms.uCam.value.set(camera.x, camera.y, camera.z, 0);
      // the ring's oldest held mark (the slot the next write overwrites) and the span its fade runs over
      const oldest = births[cursor];
      if (Number.isFinite(oldest)) {
        uniforms.uLife.value.z = oldest;
        uniforms.uLife.value.w = Math.max(1, (time - oldest) * TRACK_MARKS.ringFade);
      } else {
        uniforms.uLife.value.z = 0;
        uniforms.uLife.value.w = 0; // the ring has not wrapped: no ring fade
      }
    },
    reset() {
      for (let i = 0; i < segments * 4; i++) marks[i * 4 + 2] = 1e9;
      births.fill(Number.NEGATIVE_INFINITY);
      mark.clearUpdateRanges();
      mark.needsUpdate = true; // one whole upload: the battle's start
      cursor = 0; written = 0; time = 0; followed = 0;
      // every followed track forgets its strip: the hull's next frame starts a new one
      hulls = new WeakMap();
    },
    stats() {
      let held = 0;
      for (let s = 0; s < segments; s++) if (Number.isFinite(births[s]) && time - births[s] < TRACK_MARKS.lifeS) held++;
      return { written, held, tracks: followed * 2 };
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
