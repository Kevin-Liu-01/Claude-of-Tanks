// src/world/trackMarks.ts — the ruts behind the tanks (item 45, world-ruts-rocks-241, 2026-10-22; re-cut by hunk from
// the ground lane's visual/ground-track-marks 2c9a4a4b6 1f23e9d20 458dab891 of 2026-10-08 onto today's ground).
//
// Every tracked hull leaves its two tracks' ruts behind it in soft ground — the rut pressed into the ground, its walls,
// the berm the shoes push up beside it and the grousers' bars across its floor — and they fade over time, faster on the
// grounds that recover (dry sand drifts in, grass stands back up) than on those that keep them (snow, mud).
//
// - What lays them: the simulation's tank poses. A solo battle stamps every hull at every fixed step
//   (battlePresentationRuntime captureSoloPoses, from `entity.state`), a network round at the bridge's pose each frame.
//   A track lays a vertex pair at every TRACK_MARKS.spacingM of its own path, placed exactly on the path between two
//   stamps, so the marks are the same for the same battle at any display rate and from any camera: the camera only fades
//   what is drawn. The marks' clock is the battle's (advance, by the step), not the wall's. A hull the player's side has
//   not spotted lays none (a solo battle's enemies hidden by spotting, as a network round never receives them).
// - What they are: one ring of quads (TRACK_MARKS.segments by the quality preset, trackMarkSegmentsFor; one dynamic
//   buffer, one draw). A quad's vertices carry their place across the track (u, -1..1: the track to ±1 / BERM, the berm
//   past it), their distance along it (v, m: the grousers' pitch), their birth (the marks' clock), their ground and its
//   weight, the hull's depth and its slip (a turning hull's tracks scrub), and the track's across direction. Nothing is
//   allocated per frame; a hull's state is allocated when it first lays.
// - How they draw: the material MODULATES what the terrain drew (out = 2 · src · dst, 0.5 neutral), so a rut keeps the
//   ground's own light, shadow and fog and draws only where the ground is the visible surface. Its relief is shaded
//   from the sun's direction (the scene's shadow-casting directional light): a rut's profile (floor, walls, berm) and
//   the grousers' grooves tilt the ground's normal, and the ratio of the tilted to the level ground's sun term lights the
//   sun-side wall and berm and shades the far ones; the floor and the bars' grooves darken as a hollow does. Each ground
//   has its own look and depth (TRACK_MARK_LOOK in the shader):
//     snow — deep, packed grey-blue floor, crisp bars, bright loose berms;
//     mud — deep, dark and wet, the bars smeared, the berm wet mud;
//     sand — shallow and soft, the floor darker with the damp under the dry skin, pale loose berms, bars faint;
//     grass — the sward flattened (paler, yellower) with torn turf where the hull scrubs, a low berm;
//     soil — a field's turned earth pressed darker, a crumbly lighter berm;
//     a dirt road — a faint compaction only (roads R1 draws the carriageway's own ruts and puddles, 1563baa11f).
//   None on rock (a slope the terrain draws as rock), a paved road or square, a bridge deck, ice or water (the FX
//   layer's wakes stay there).
// - How they go: a mark fades in its ground's last share of life (TRACK_MARKS.lifeS by TRACK_MARK_GROUND_LIFE), as the
//   ring wraps (the oldest fifth of what it holds), past TRACK_MARKS.fadeNearM from the camera; a crater clears those in
//   its bowl and re-seats those on its flank (followCraters, the ground cover's law); a battle starts clean (map.ts
//   resetDestructibles).
// Presentation only: no simulation, collision or network module reads it.
import * as THREE from 'three';
import { terrainNearMeshHeightAt } from './terrain.ts';
import { createCraterFollower, followCraters, type GroundCoverCraters } from './groundCoverCraters.ts';
import type { LandFieldSample } from './landUse.ts';

/** The ground a mark lies on (the shader's look). */
export const TRACK_MARK_GROUND = Object.freeze({ grass: 0, road: 1, sand: 2, snow: 3, mud: 4, soil: 5 });
type TrackMarkGround = (typeof TRACK_MARK_GROUND)[keyof typeof TRACK_MARK_GROUND];

/** Each ground's life as a share of TRACK_MARKS.lifeS (grass stands back up, dry sand drifts in; snow and mud keep). */
export const TRACK_MARK_GROUND_LIFE: Readonly<Record<TrackMarkGround, number>> = Object.freeze({
  0: 0.75, 1: 0.5, 2: 0.6, 3: 1, 4: 1, 5: 0.9,
});

export const TRACK_MARKS = Object.freeze({
  /** A track lays a vertex pair every this many metres of its own path (the terrain mesh's cell is 1.33 m). */
  spacingM: 0.9,
  /** A track that jumps further than this between stamps (a respawn, a teleport) starts a new strip. */
  breakM: 6,
  /** The mark's lift over the drawn ground (m); the material's polygon offset does the rest. */
  liftM: 0.035,
  /** The strip's half width over the track's: the berm outside the track's edge (u = ±1 / BERM at the edge). */
  berm: 1.45,
  /** Life (s, a ground's share of it): whole until its last `fadeShare`. */
  lifeS: 300,
  fadeShare: 0.3,
  /** The share of the ring's span over which its oldest marks fade as they are overwritten. */
  ringFade: 0.2,
  /** Camera distance (m) over which the marks fade out. */
  fadeNearM: 150,
  fadeFarM: 240,
  /** The ground's slope (1 − n.y) over which the terrain turns to rock (terrain.ts's slope→rock band starts at 0.095):
   * the marks thin out across it and lay nothing past it. */
  rockSlope: [0.11, 0.2] as const,
  /** The paved share of a carriageway (roadPave.ts) over which the marks thin out and lay nothing past it. */
  pave: [0.12, 0.45] as const,
  /** The grousers' pitch along the track (m). */
  pitchM: 0.16,
  /** How long after its last stamp the marks count as being laid (the FX layer's own dry prints stand down meanwhile). */
  activeS: 2,
});

/**
 * The ring's size by quality preset (engine/quality.ts PresetName): about 100 s of ten hulls driving on the desktop's
 * Ultra, a quarter of it on a phone's lowest. A preset outside the table takes the medium desktop's.
 */
const SEGMENTS_BY_PRESET: Readonly<Record<string, number>> = Object.freeze({
  ultra: 16384, high: 12288, medium: 8192, low: 4096, ultralow: 2048,
  'mobile-high': 4096, mobile: 3072, 'mobile-low': 2048, 'mobile-ultralow': 1024,
});
export function trackMarkSegmentsFor(preset: string | null | undefined): number {
  return SEGMENTS_BY_PRESET[preset ?? ''] ?? SEGMENTS_BY_PRESET.medium;
}

/** The height field the marks read (terrain.ts HeightField's subset). */
export interface TrackMarksField {
  getHeightAt(x: number, z: number): number;
  getGroundType?(x: number, z: number): 'hard' | 'medium' | 'soft';
  getTrackSurfaceAt?(x: number, z: number): number;
  getWaterMaskAt?(x: number, z: number): number;
  getRoadPaveAt?(x: number, z: number): number;
  _roadDist?(x: number, z: number): number;
  _landUseAt?(x: number, z: number, out: LandFieldSample): LandFieldSample;
}

export interface TrackMarksOptions {
  /** The ring's size (segments). */
  segments?: number;
}

/** A hull's tracks for layPaths: the half gauge and the track's width (m), its depth (1 for a 45 t MBT). */
export interface TrackMarksHull {
  halfGaugeM?: number;
  trackWidthM?: number;
  depth?: number;
}

export interface TrackMarksStats {
  /** Segments written since the battle began, those the ring holds now, and its size. */
  written: number;
  held: number;
  segments: number;
  /** Hulls followed. */
  hulls: number;
}

export interface TrackMarks {
  readonly mesh: THREE.Mesh;
  /** Advance the marks' clock by the battle's step (s). */
  advance(dt: number): void;
  /**
   * One hull's pose: its key (any stable object: the entity), its centre on the ground (x, z), its yaw (forward is
   * (sin, cos)), the half gauge (m, hull centre to a track's centreline), the track's width (m) and its depth (the
   * hull's weight on the ground: 1 for a 45 t MBT).
   */
  stamp(key: object, x: number, z: number, yaw: number, halfGaugeM: number, trackWidthM: number, depth: number): void;
  /**
   * Diagnostics and the capture tools: drive hulls along polylines ([x0, z0, x1, z1, ...] each) at `speedMps`, stamped
   * at 60 Hz with the clock advanced as a battle's, on the given hull (an MBT's by default). Returns the stamps made.
   */
  layPaths(paths: readonly (readonly number[])[], speedMps?: number, hull?: TrackMarksHull): number;
  /** True while hulls are laying marks (a stamp within TRACK_MARKS.activeS of the marks' clock). */
  active(): boolean;
  /** Set the camera the marks fade from (each frame). */
  update(camera: { x: number; y: number; z: number }): void;
  /** Follow the battle's craters (map.ts, after the ground cover's law is synced). */
  followCraters(law: GroundCoverCraters): void;
  /** A clean ground (a new battle). */
  reset(): void;
  stats(): TrackMarksStats;
  dispose(): void;
}

const VERTEX = /* glsl */`
attribute vec4 aMark;   // (u across, v along m, birth s, ground + weight share)
attribute vec4 aMark2;  // (depth, slip, the track's across direction xz scaled by its half width m)
uniform float uTime;
uniform vec4 uLife;     // (life s, fade share, the ring's oldest birth, its fade span s — 0 until the ring has wrapped)
uniform vec4 uGroundLife0; // grounds 0..3's life shares
uniform vec2 uGroundLife1; // grounds 4..5's
uniform vec4 uCam;      // (camera xyz, 0)
uniform vec2 uFar;      // (fade from m, gone by m)
varying vec4 vMark;
varying vec3 vAcross;
varying vec3 vInfo;     // (alpha, distance, slip)
varying float vDepth;
void main() {
  float birth = aMark.z;
  float g = floor(aMark.w);
  float share = g < 0.5 ? uGroundLife0.x : g < 1.5 ? uGroundLife0.y : g < 2.5 ? uGroundLife0.z : g < 3.5 ? uGroundLife0.w
    : g < 4.5 ? uGroundLife1.x : uGroundLife1.y;
  float life = uLife.x * share;
  float age = uTime - birth;
  float a = age < 0.0 ? 0.0 : 1.0 - smoothstep(life * (1.0 - uLife.y), life, age);
  // (the ground lane's lab, 2026-10-08: an unwrapped ring's -Infinity edge made this NaN) the ring's fade only once it
  // has wrapped
  if (uLife.w > 0.0) a *= smoothstep(uLife.z, uLife.z + uLife.w, birth);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float dist = distance(wp.xyz, uCam.xyz);
  a *= 1.0 - smoothstep(uFar.x, uFar.y, dist);
  vInfo = vec3(a, dist, aMark2.y);
  vMark = aMark;
  vDepth = aMark2.x;
  vAcross = vec3(aMark2.z, 0.0, aMark2.w);
  gl_Position = a <= 0.001 ? vec4(0.0, 0.0, 2.0, 1.0) : projectionMatrix * viewMatrix * wp;
}`;

const FRAGMENT = /* glsl */`
uniform vec3 uSun;      // toward the sun (unit), y > 0 by day
uniform vec2 uStrip;    // (the berm share: the strip's half width over the track's, the grousers' pitch m)
varying vec4 vMark;
varying vec3 vAcross;
varying vec3 vInfo;
varying float vDepth;
float tmHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float tmNoise(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(tmHash(i), tmHash(i + 1.0), f); }
// the rut's profile across the track, a = |u| · BERM (0 at the middle, 1 at the track's edge, BERM at the berm's foot):
// the floor at −1, the wall rising over the track's outer fifth (wider and slumped on a soft ground), the berm's crest
// just past the edge
float tmProfile(float a, float berm, float soft) {
  return -(1.0 - smoothstep(0.8 - 0.22 * soft, 1.02, a)) + berm * smoothstep(0.9, 1.1, a) * (1.0 - smoothstep(1.12, 1.45, a));
}
// a grouser's groove along the track (f: the place in its pitch, 0..1): pressed in over its middle third
float tmGroove(float f) { return smoothstep(0.22, 0.38, f) * (1.0 - smoothstep(0.54, 0.7, f)); }
void main() {
  float alpha = vInfo.x, dist = vInfo.y, slip = clamp(vInfo.z, 0.0, 1.0);
  float g = floor(vMark.w), weight = clamp(fract(vMark.w) * 1.0010010, 0.0, 1.0);
  float v = vMark.y;
  // (the lab's frames, 2026-10-08: crisp, even stripes read as lines painted on the ground) the edge wanders a few
  // centimetres and tears, the pressing comes and goes along the strip
  // (CPU previews, 2026-10-22: even edges and an even press read as painted stripes) each side's edge its own wander,
  // torn finer where it breaks, the press coming and going over a few metres
  float side = vMark.x < 0.0 ? 0.0 : 17.0;
  float a = (abs(vMark.x) + (tmNoise(v * 1.7 + side) - 0.5) * 0.14 + (tmNoise(v * 6.3 + 3.7 + side) - 0.5) * 0.08
    + (tmNoise(v * 19.0 + side) - 0.5) * 0.04) * uStrip.x;
  float press = 0.55 + 0.45 * tmNoise(v * 0.47 + 11.3) * (0.75 + 0.25 * tmNoise(v * 2.1 + 5.1));
  // the ground's look: its depth (m at depth 1), its berm's height (of the depth), the bars' share, the floor's and the
  // berm's albedo ratios, and how soft its edges are
  float depthM, bermK, barK, soft;
  vec3 floorC, bermC, scarC;
  if (g < 0.5) {        // grass: the sward flattened paler and yellower, torn turf where the hull scrubs
    depthM = 0.035; bermK = 0.35; barK = 0.35; soft = 0.6;
    floorC = vec3(1.02, 1.0, 0.82); bermC = vec3(0.96, 0.95, 0.9); scarC = vec3(0.58, 0.52, 0.47);
  } else if (g < 1.5) { // a dirt road: a faint compaction, no berm
    depthM = 0.008; bermK = 0.0; barK = 0.25; soft = 0.4;
    floorC = vec3(0.93, 0.92, 0.91); bermC = vec3(1.0); scarC = vec3(0.9, 0.89, 0.88);
  } else if (g < 2.5) { // sand: shallow and soft, the damp under the dry skin, pale loose berms
    depthM = 0.06; bermK = 0.55; barK = 0.18; soft = 1.0;
    floorC = vec3(0.86, 0.83, 0.79); bermC = vec3(1.07, 1.06, 1.04); scarC = vec3(0.82, 0.79, 0.75);
  } else if (g < 3.5) { // snow: deep, packed grey-blue, crisp bars, bright loose berms
    depthM = 0.13; bermK = 0.6; barK = 0.9; soft = 0.35;
    floorC = vec3(0.8, 0.85, 0.95); bermC = vec3(1.03, 1.03, 1.04); scarC = vec3(0.74, 0.79, 0.9);
  } else if (g < 4.5) { // mud: deep, dark and wet, the bars smeared
    depthM = 0.11; bermK = 0.5; barK = 0.5; soft = 0.7;
    floorC = vec3(0.56, 0.53, 0.5); bermC = vec3(0.8, 0.77, 0.74); scarC = vec3(0.48, 0.45, 0.43);
  } else {              // a field's turned soil: pressed darker, a crumbly lighter berm
    depthM = 0.07; bermK = 0.5; barK = 0.6; soft = 0.6;
    floorC = vec3(0.8, 0.77, 0.74); bermC = vec3(1.06, 1.04, 1.02); scarC = vec3(0.7, 0.67, 0.64);
  }
  float depth = depthM * vDepth * press;
  // the berm heaped unevenly: thicker where the shoes threw more, nearly gone between
  bermK *= 0.45 + 1.1 * tmNoise(v * 0.83 + side * 1.7 + 2.9);
  // the relief fades into an albedo smudge with distance (its bars alias first)
  float nearK = 1.0 - smoothstep(25.0, 110.0, dist);
  // across: the profile's slope (per metre across: the track's half width is (strip half width) / BERM)
  float e = 0.03;
  float dh = (tmProfile(a + e, bermK, soft) - tmProfile(max(a - e, 0.0), bermK, soft)) / (a < e ? a + e : 2.0 * e);
  float halfTrackM = max(0.1, length(vAcross));
  float sAcross = dh * depth / halfTrackM * sign(vMark.x);
  // along: the grousers' grooves every pitch, a third of it wide, faded before they alias, smeared by the scrub and in
  // the soft grounds
  float q = v / uStrip.y, w = fwidth(q), f = fract(q);
  float barFade = (1.0 - smoothstep(0.2, 0.5, w)) * (1.0 - smoothstep(0.66, 0.95, a)) * barK * (1.0 - 0.8 * slip);
  float groove = smoothstep(0.3 - w - 0.08 * soft, 0.3 + w + 0.08 * soft, f) * (1.0 - smoothstep(0.62 - w - 0.08 * soft, 0.62 + w + 0.08 * soft, f));
  float grooveM = 0.012 * barFade * (0.5 + 0.5 * vDepth);
  float sAlong = -grooveM * (tmGroove(f + 0.02) - tmGroove(max(f - 0.02, 0.0))) / (0.04 * uStrip.y);
  vec3 across = vAcross / halfTrackM, along = vec3(-across.z, 0.0, across.x);
  vec3 n = normalize(vec3(0.0, 1.0, 0.0) - across * sAcross * nearK - along * sAlong * nearK);
  vec3 sun = normalize(uSun + vec3(0.0, 1e-4, 0.0));
  float level = max(sun.y, 0.12);
  float lit = clamp(max(dot(n, sun), 0.0) / level, 0.55, 1.45);
  // the sun's share of the ground's light (low at night and at a low sun, where the relief reads by its hollows)
  float direct = 0.5 * smoothstep(0.02, 0.25, sun.y);
  float relief = mix(1.0, lit, direct);
  // the hollow: the floor and the grooves a little darker, as much as the rut is deep
  float floorK = 1.0 - smoothstep(0.7, 1.0, a);
  float hollow = 1.0 - (0.18 * floorK * clamp(depth / 0.1, 0.0, 1.0) + 0.12 * groove * barFade) * (0.4 + 0.6 * nearK);
  // the albedo: the floor's and the berm's, the bars' grooves the floor's a shade deeper, the turf torn where it scrubs
  float bermW = smoothstep(0.92, 1.08, a) * (1.0 - smoothstep(1.15, 1.45, a));
  vec3 albedo = mix(floorC, bermC, bermW);
  albedo = mix(albedo, albedo * mix(vec3(1.0), scarC / max(floorC, vec3(0.05)), 0.4), groove * barFade);
  float scar = smoothstep(0.55, 0.8, tmNoise(v * 1.3 + 7.7) * 0.6 + tmNoise(v * 4.1 + abs(vMark.x) * 3.0) * 0.4 + slip * 0.35 - 0.05)
    * floorK * (g < 0.5 || g > 4.5 ? 1.0 : 0.5);
  albedo = mix(albedo, scarC, scar * clamp(0.25 + slip * 0.75 + (vDepth - 0.8) * 0.4, 0.0, 1.0));
  // the strip's own edge: nothing past the berm's foot
  float body = 1.0 - smoothstep(1.3, 1.45, a);
  vec3 m = albedo * relief * hollow;
  m = mix(vec3(1.0), m, body * alpha * weight);
  // modulate: out = 2 · src · dst (0.5 leaves the ground as it is)
  gl_FragColor = vec4(clamp(m * 0.5, 0.0, 1.0), 1.0);
}`;

interface TrackState {
  has: boolean;
  /** The last pair's centre, its two edges (x, y, z each), the distance along the strip there, its ground. */
  cx: number; cz: number;
  l: [number, number, number];
  r: [number, number, number];
  v: number;
}
interface HullState {
  tracks: [TrackState, TrackState];
  yaw: number;
  t: number;
  slip: number;
}

function newTrack(): TrackState {
  return { has: false, cx: 0, cz: 0, l: [0, 0, 0], r: [0, 0, 0], v: 0 };
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A crop's ground (landUse.ts LAND_CROP): the turned soils, the paved hardstanding (none), a court's gravel (a road's),
 * the paddies' mud; every other crop is a sward or a standing crop the hull flattens. */
function cropGround(crop: number): TrackMarkGround | -1 {
  if (crop === 4 || crop === 6 || crop === 7 || crop === 11 || crop === 12) return TRACK_MARK_GROUND.soil;
  if (crop === 18) return -1;
  if (crop === 15 || crop === 16 || crop === 19) return TRACK_MARK_GROUND.road;
  if (crop === 8 || crop === 9 || crop === 10) return TRACK_MARK_GROUND.mud;
  return TRACK_MARK_GROUND.grass;
}

export function createTrackMarks(field: TrackMarksField, options: TrackMarksOptions = {}): TrackMarks {
  const segments = Math.max(64, Math.floor(options.segments ?? trackMarkSegmentsFor(null)));
  const positions = new Float32Array(segments * 4 * 3);
  const marks = new Float32Array(segments * 4 * 4);
  const marks2 = new Float32Array(segments * 4 * 4);
  // every slot unborn (birth far in the future: invisible) until written
  for (let i = 0; i < segments * 4; i++) marks[i * 4 + 2] = 1e9;
  const births = new Float64Array(segments).fill(Number.NEGATIVE_INFINITY);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  const mark = new THREE.BufferAttribute(marks, 4);
  const mark2 = new THREE.BufferAttribute(marks2, 4);
  position.setUsage(THREE.DynamicDrawUsage);
  mark.setUsage(THREE.DynamicDrawUsage);
  mark2.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aMark', mark);
  geometry.setAttribute('aMark2', mark2);
  const index = new (segments * 4 > 65535 ? Uint32Array : Uint16Array)(segments * 6);
  // (the ground lane's lab, 2026-10-08: wound l0 → r0 → r1 the quads faced down and the front-face cull dropped every
  // mark seen from above) l0 → r1 → r0 and l0 → l1 → r1: counter-clockwise from above, facing up
  for (let s = 0; s < segments; s++) {
    const v = s * 4, i = s * 6;
    index[i] = v; index[i + 1] = v + 2; index[i + 2] = v + 1;
    index[i + 3] = v; index[i + 4] = v + 3; index[i + 5] = v + 2;
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  // the ring spans the whole map: the bounds never cull it (the vertex stage drops the dead and the far)
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const life = TRACK_MARK_GROUND_LIFE;
  const uniforms = {
    uTime: { value: 0 },
    uLife: { value: new THREE.Vector4(TRACK_MARKS.lifeS, TRACK_MARKS.fadeShare, 0, 0) },
    uGroundLife0: { value: new THREE.Vector4(life[0], life[1], life[2], life[3]) },
    uGroundLife1: { value: new THREE.Vector2(life[4], life[5]) },
    uCam: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFar: { value: new THREE.Vector2(TRACK_MARKS.fadeNearM, TRACK_MARKS.fadeFarM) },
    uSun: { value: new THREE.Vector3(0.45, 0.75, 0.3).normalize() },
    uStrip: { value: new THREE.Vector2(TRACK_MARKS.berm, TRACK_MARKS.pitchM) },
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
  // the sun: the scene's shadow-casting directional light, found once (again only when it leaves the scene)
  let sunLight: THREE.DirectionalLight | null = null;
  mesh.onBeforeRender = (_renderer, scene) => {
    if (!sunLight || !sunLight.parent) {
      sunLight = null;
      for (const child of scene.children) {
        const light = child as THREE.DirectionalLight;
        if (light.isDirectionalLight && light.castShadow) { sunLight = light; break; }
      }
      if (!sunLight) return;
    }
    const sun = uniforms.uSun.value;
    sun.copy(sunLight.position).sub(sunLight.target.position);
    if (sun.lengthSq() > 1e-12) sun.normalize();
  };

  let hulls = new WeakMap<object, HullState>();
  let followed = 0;
  let cursor = 0, written = 0, time = 0;
  let lastLaid = Number.NEGATIVE_INFINITY;
  let craterLaw: GroundCoverCraters | null = null;
  const craterFollower = createCraterFollower();
  const meshAt = (x: number, z: number): number => terrainNearMeshHeightAt((px, pz) => field.getHeightAt(px, pz), x, z)
    + (craterLaw && craterLaw.active ? craterLaw.liftAt(x, z) : 0);
  const landSample = {} as LandFieldSample;
  let groundWeight = 0;

  /** The ground at (x, z) (its weight in groundWeight), or -1 where none is laid. */
  function groundAt(x: number, z: number, slope: number): TrackMarkGround | -1 {
    groundWeight = 1 - smooth(TRACK_MARKS.rockSlope[0], TRACK_MARKS.rockSlope[1], slope);
    if (groundWeight <= 0.02) return -1;
    if (field.getWaterMaskAt && field.getWaterMaskAt(x, z) > 0.02) return -1;
    const pave = field.getRoadPaveAt ? field.getRoadPaveAt(x, z) : 0;
    if (pave > 0) {
      groundWeight *= 1 - smooth(TRACK_MARKS.pave[0], TRACK_MARKS.pave[1], pave);
      if (groundWeight <= 0.02) return -1;
    }
    const type = field.getGroundType ? field.getGroundType(x, z) : 'medium';
    if (type === 'hard') {
      // a dirt carriageway (its paved share is 0): a faint compaction; ice and a bridge deck: none
      return field._roadDist && field._roadDist(x, z) < 4.3 ? TRACK_MARK_GROUND.road : -1;
    }
    if (type === 'soft') return TRACK_MARK_GROUND.mud;
    const surface = field.getTrackSurfaceAt ? field.getTrackSurfaceAt(x, z) : 0;
    if (surface === 2) return TRACK_MARK_GROUND.sand;
    if (surface === 3) return TRACK_MARK_GROUND.snow;
    if (field._landUseAt) {
      const land = field._landUseAt(x, z, landSample);
      if (land.active > 0) {
        if (land.track > 0.5) return TRACK_MARK_GROUND.road;
        return cropGround(land.edgeM > land.marginM ? land.crop : 0);
      }
    }
    return TRACK_MARK_GROUND.grass;
  }

  function writeSegment(a: TrackState, l: [number, number, number], r: [number, number, number], v1: number,
    ground: number, weight: number, depth: number, slip: number, ax: number, az: number, halfTrackM: number): void {
    const s = cursor;
    cursor = (cursor + 1) % segments;
    const p = s * 12, m = s * 16;
    // the quad: the last pair (left, right) and this one (right, left)
    positions[p] = a.l[0]; positions[p + 1] = a.l[1]; positions[p + 2] = a.l[2];
    positions[p + 3] = a.r[0]; positions[p + 4] = a.r[1]; positions[p + 5] = a.r[2];
    positions[p + 6] = r[0]; positions[p + 7] = r[1]; positions[p + 8] = r[2];
    positions[p + 9] = l[0]; positions[p + 10] = l[1]; positions[p + 11] = l[2];
    const packed = ground + Math.min(0.999, Math.max(0, weight));
    for (let k = 0; k < 4; k++) {
      const o = m + k * 4;
      marks[o] = k === 1 || k === 2 ? 1 : -1;
      marks[o + 1] = k < 2 ? a.v : v1;
      marks[o + 2] = time;
      marks[o + 3] = packed;
      marks2[o] = depth; marks2[o + 1] = slip; marks2[o + 2] = ax * halfTrackM; marks2[o + 3] = az * halfTrackM;
    }
    births[s] = time;
    position.addUpdateRange(p, 12);
    mark.addUpdateRange(m, 16);
    mark2.addUpdateRange(m, 16);
    position.needsUpdate = true;
    mark.needsUpdate = true;
    mark2.needsUpdate = true;
    written++;
  }

  const _l: [number, number, number] = [0, 0, 0];
  const _r: [number, number, number] = [0, 0, 0];

  function pairAt(x: number, z: number, rx: number, rz: number, hw: number,
    l: [number, number, number], r: [number, number, number]): void {
    const lx = x - rx * hw, lz = z - rz * hw, gx = x + rx * hw, gz = z + rz * hw;
    l[0] = lx; l[1] = meshAt(lx, lz) + TRACK_MARKS.liftM; l[2] = lz;
    r[0] = gx; r[1] = meshAt(gx, gz) + TRACK_MARKS.liftM; r[2] = gz;
  }

  function stampTrack(t: TrackState, cx: number, cz: number, rx: number, rz: number, hw: number, depth: number, slip: number): void {
    if (!t.has) {
      t.has = true; t.cx = cx; t.cz = cz; t.v = 0;
      pairAt(cx, cz, rx, rz, hw, t.l, t.r);
      return;
    }
    let dx = cx - t.cx, dz = cz - t.cz, d = Math.hypot(dx, dz);
    if (d > TRACK_MARKS.breakM) { t.has = false; stampTrack(t, cx, cz, rx, rz, hw, depth, slip); return; }
    // a pair every spacing of the track's own path, placed on the path between the stamps (the same pairs for the same
    // battle however often it is stamped)
    const step = TRACK_MARKS.spacingM;
    while (d >= step) {
      const k = step / d;
      const px = t.cx + dx * k, pz = t.cz + dz * k;
      pairAt(px, pz, rx, rz, hw, _l, _r);
      // the ground's slope from the pair itself: across from its two edges, along from the last pair's
      const across = (_r[1] - _l[1]) / (2 * hw);
      const along = ((_l[1] + _r[1]) - (t.l[1] + t.r[1])) / (2 * step);
      const slope = 1 - 1 / Math.sqrt(1 + across * across + along * along);
      const ground = groundAt(px, pz, slope);
      const v1 = t.v + step;
      if (ground >= 0) writeSegment(t, _l, _r, v1, ground, groundWeight, depth, slip, rx, rz, hw / TRACK_MARKS.berm);
      t.cx = px; t.cz = pz; t.v = v1;
      t.l[0] = _l[0]; t.l[1] = _l[1]; t.l[2] = _l[2];
      t.r[0] = _r[0]; t.r[1] = _r[1]; t.r[2] = _r[2];
      dx = cx - px; dz = cz - pz; d = Math.hypot(dx, dz);
    }
  }

  function stamp(key: object, x: number, z: number, yaw: number, halfGaugeM: number, trackWidthM: number, depth: number): void {
    if (!(Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(yaw))) return;
    let hull = hulls.get(key);
    if (!hull) { hull = { tracks: [newTrack(), newTrack()], yaw, t: time, slip: 0 }; hulls.set(key, hull); followed++; }
    // the scrub of a turning hull: its tracks' ends slide sideways at the yaw rate times half their length
    const dt = time - hull.t;
    if (dt > 1e-6) {
      let dy = yaw - hull.yaw;
      dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
      const target = Math.min(1, Math.abs(dy / dt) * 1.2);
      hull.slip += (target - hull.slip) * Math.min(1, dt / 0.25);
      hull.yaw = yaw; hull.t = time;
    }
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = fz, rz = -fx; // the hull's across in world xz
    const hw = Math.max(0.15, trackWidthM * 0.5) * TRACK_MARKS.berm;
    const before = written;
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      stampTrack(hull.tracks[side], x + rx * halfGaugeM * sgn, z + rz * halfGaugeM * sgn, rx, rz, hw, depth, hull.slip);
    }
    if (written !== before) lastLaid = time;
  }

  function clearSegment(s: number): void {
    for (let k = 0; k < 4; k++) marks[s * 16 + k * 4 + 2] = 1e9; // unborn: dropped in the vertex stage
    births[s] = Number.NEGATIVE_INFINITY;
  }

  return {
    mesh,
    advance(dt) { if (dt > 0) { time += dt; uniforms.uTime.value = time; } },
    stamp,
    active: () => time - lastLaid < TRACK_MARKS.activeS,
    layPaths(paths, speedMps = 8, hull = {}) {
      const step = speedMps / 60;
      const halfGauge = hull.halfGaugeM ?? 1.5, width = hull.trackWidthM ?? 0.6, depth = hull.depth ?? 1;
      let n = 0;
      for (const path of paths) {
        const key = {};
        for (let i = 0; i + 3 < path.length; i += 2) {
          const ax = path[i], az = path[i + 1], bx = path[i + 2], bz = path[i + 3];
          const len = Math.hypot(bx - ax, bz - az) || 1, yaw = Math.atan2(bx - ax, bz - az);
          for (let d = 0; d < len; d += step) {
            stamp(key, ax + (bx - ax) * d / len, az + (bz - az) * d / len, yaw, halfGauge, width, depth);
            time += 1 / 60;
            n++;
          }
        }
      }
      uniforms.uTime.value = time;
      return n;
    },
    update(camera) {
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
    followCraters(law) {
      craterLaw = law;
      followCraters(law, craterFollower, () => { /* the marks laid before keep their seats; a reset clears them */ },
        (x0, z0, x1, z1) => {
          let lo = segments, hi = -1;
          for (let s = 0; s < segments; s++) {
            if (!Number.isFinite(births[s])) continue;
            const p = s * 12;
            const mx = (positions[p] + positions[p + 6]) * 0.5, mz = (positions[p + 2] + positions[p + 8]) * 0.5;
            if (mx < x0 || mx > x1 || mz < z0 || mz > z1) continue;
            // the crater's bowl takes the mark; its flank re-seats it on the ground the overlay drapes
            if (law.holeAt(mx, mz)) clearSegment(s);
            else for (let k = 0; k < 4; k++) {
              const o = p + k * 3;
              positions[o + 1] = meshAt(positions[o], positions[o + 2]) + TRACK_MARKS.liftM;
            }
            if (s < lo) lo = s;
            if (s > hi) hi = s;
          }
          if (hi >= lo) {
            position.addUpdateRange(lo * 12, (hi - lo + 1) * 12);
            mark.addUpdateRange(lo * 16, (hi - lo + 1) * 16);
            position.needsUpdate = true;
            mark.needsUpdate = true;
          }
        });
    },
    reset() {
      for (let s = 0; s < segments; s++) clearSegment(s);
      mark.clearUpdateRanges();
      mark.needsUpdate = true; // one whole upload: the battle's start
      cursor = 0; written = 0; time = 0; followed = 0; lastLaid = Number.NEGATIVE_INFINITY;
      uniforms.uTime.value = 0;
      // every followed track forgets its strip: the hull's next stamp starts a new one
      hulls = new WeakMap();
    },
    stats() {
      let held = 0;
      for (let s = 0; s < segments; s++) if (Number.isFinite(births[s]) && time - births[s] < TRACK_MARKS.lifeS) held++;
      return { written, held, segments, hulls: followed };
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
