// Frontline atmosphere — the war beyond the map edge.
//
// Owner brief (2026-09-12): "anti air guns going off in back, explosions,
// planes flying above, crazy sounds, smoke". This layer puts a distant front
// behind the enemy side of every battle: tall drifting smoke columns on the
// horizon, artillery flashes at their feet with a delayed rumble, flak
// bursting in the sky, and the occasional aircraft crossing overhead. It is
// deterministic per match seed, costs a handful of draws, owns no scene
// light and no per-frame allocation, and is tuned per map in
// FRONTLINE_INTENSITY below (the map configs stay untouched). Sound travels:
// every event is emitted on the bus with its world position and the audio
// mixer applies the travel delay and a long-range law of its own.
import * as THREE from 'three';
import { isMapId, type MapId } from './maps/catalog.ts';
import { emitBreakFx, emitDestroyed, registerWorldDestructibles } from './destructibles.ts';

export interface FrontlineEventBus {
  emit(event: string, payload: unknown): void;
}

export interface FrontlineHeightField {
  getHeightAt?(x: number, z: number): number;
}

export interface FrontlineSpawns {
  player?: { pos: readonly number[] } | null;
  enemies?: ReadonlyArray<{ pos: readonly number[] }> | null;
}

export interface FrontlineAtmosphereOptions {
  /** World-space parent that lives as long as the battle presentation. */
  parent: THREE.Object3D;
  camera: THREE.Camera;
  bus?: FrontlineEventBus | null;
  getHeightField?: () => FrontlineHeightField | null;
  getSpawns?: () => FrontlineSpawns | null;
  /** Engine hook folding lit materials (the AA guns) into the cascaded-shadow setup. */
  setupMaterial?: (material: THREE.Material) => void;
  releaseMaterial?: (material: THREE.Material) => void;
}

export interface FrontlineEvent {
  kind: 'artillery' | 'flak' | 'flyover' | 'aa' | 'aa-destroyed';
  timeS: number;
  pos: [number, number, number];
}

export interface FrontlineAtmosphere {
  readonly intensity: number;
  readonly bearingDeg: number;
  readonly group: THREE.Group;
  prepare(seed: number | undefined, mapId: string): void;
  update(dtSeconds: number): void;
  /** Multiplies the authored map intensity (quality tiers, campaign missions). */
  setScale(scale: number): void;
  reset(): void;
  dispose(): void;
  /** Events emitted so far this match (bounded; receipts and probes). */
  readonly log: readonly FrontlineEvent[];
  /** The anti-air guns behind the player's line; destroyed guns fall silent (campaign objectives, receipts). */
  readonly aaGuns: readonly { readonly pos: THREE.Vector3; readonly destroyed: boolean }[];
}

/** Per-map front intensity 0..1 (0 = silent). Authored here, not in map configs. */
export const FRONTLINE_INTENSITY: Readonly<Record<MapId, number>> = Object.freeze({
  verdant: 0.45, desert: 0.5, winter: 0.5, urban: 0.8, coastal: 0.4, autumn: 0.45,
  steppe: 0.6, railyard: 0.7, frontier: 0.9, fjord: 0.4, delta: 0.45, badlands: 0.5,
  monsoon: 0.4, alpine: 0.35, caldera: 0.5, foundry: 0.7, ruinspires: 0.75,
  blackglass: 0.55, titan_gorge: 0.5, skybridge: 0.6, polders: 0.45, copper_mesa: 0.5,
  airfield: 0.85, oasis: 0.3, whiteout: 0.25, orchard: 0.3, longleaf: 0.4,
  mangrove: 0.35, saltwind: 0.4, reservoir: 0.4,
});

export const FRONTLINE_LIMITS = Object.freeze({
  columns: [6, 10] as const,
  columnRangeM: [650, 950] as const,
  columnHeightM: [120, 220] as const,
  spriteCap: 32,
  aircraftCap: 2,
  aircraftAltitudeM: [250, 420] as const,
  aircraftSpeedMps: [110, 160] as const,
  aircraftRadiusM: 1300,
  artilleryIntervalS: [5, 18] as const,
  flakIntervalS: [12, 40] as const,
  flyoverIntervalS: [60, 120] as const,
  logCap: 256,
  // campaign slice 2 (2026-09-12): anti-air guns behind the player's line
  aaGuns: [2, 3] as const,
  aaBehindM: [60, 140] as const,
  aaLateralM: [40, 130] as const,
  aaRangeM: 950,
  aaBurstIntervalS: [0.9, 1.7] as const,
  aaShotsPerBurst: 3,
  aaShotGapS: 0.13,
  /** Shell hit volume of one gun: a vertical capsule over its base. */
  aaHitRadiusM: 1.9,
  aaHitHeightM: 2.6,
  tracerCap: 48,
  tracerSpeedMps: 420,
  tracerLifeS: 2.2,
});

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Front bearing: from the player spawn toward the enemy spawns' centroid. */
export function resolveFrontBearingDeg(spawns: FrontlineSpawns | null | undefined, fallbackDeg: number): number {
  const player = spawns?.player?.pos;
  const enemies = spawns?.enemies;
  if (!player || !enemies || enemies.length === 0) return fallbackDeg;
  let ex = 0, ez = 0, n = 0;
  for (const e of enemies) { if (e?.pos) { ex += e.pos[0]; ez += e.pos[2]; n++; } }
  if (!n) return fallbackDeg;
  const dx = ex / n - player[0], dz = ez / n - player[2];
  if (Math.hypot(dx, dz) < 1) return fallbackDeg;
  return THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
}

// ---------------------------------------------------------------- textures ---

/** Procedural column sheet: dense at the foot, thinning and tattering upward. */
function makeColumnTexture(): THREE.DataTexture {
  const w = 64, h = 256, data = new Uint8Array(w * h * 4);
  const rng = mulberry32(0x5eed);
  const blobs: Array<[number, number, number]> = [];
  for (let i = 0; i < 90; i++) blobs.push([rng(), rng(), 0.05 + rng() * 0.12]);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 foot .. 1 top
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      let d = 0;
      for (const [bx, by, br] of blobs) {
        const ddx = (u - bx), ddy = (v - by) * 0.5;
        const r2 = ddx * ddx + ddy * ddy;
        d += Math.max(0, 1 - r2 / (br * br)) * 0.45;
      }
      const centre = 1 - Math.min(1, Math.abs(u - 0.5) * 2.6);
      const rise = 1 - Math.pow(v, 1.6);
      const alpha = Math.min(1, Math.max(0, (d * 0.7 + 0.35) * centre * rise));
      const shade = 0.35 + 0.45 * v + (d - 0.5) * 0.1;
      const i = (y * w + x) * 4;
      data[i] = Math.round(255 * Math.min(1, shade * 0.95));
      data[i + 1] = Math.round(255 * Math.min(1, shade * 0.93));
      data[i + 2] = Math.round(255 * Math.min(1, shade * 0.92));
      data[i + 3] = Math.round(255 * alpha);
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Soft disc with a ragged edge: flak puff and (brightened) artillery flash. */
function makePuffTexture(): THREE.DataTexture {
  const s = 64, data = new Uint8Array(s * s * 4);
  const rng = mulberry32(0xf1ac);
  const lobes: Array<[number, number, number]> = [];
  for (let i = 0; i < 7; i++) { const a = rng() * Math.PI * 2; lobes.push([0.5 + Math.cos(a) * 0.18, 0.5 + Math.sin(a) * 0.18, 0.22 + rng() * 0.12]); }
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = (x + 0.5) / s, v = (y + 0.5) / s;
    let d = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) / 0.42);
    for (const [lx, ly, lr] of lobes) d = Math.max(d, Math.max(0, 1 - Math.hypot(u - lx, v - ly) / lr) * 0.9);
    const alpha = Math.pow(d, 1.4);
    const i = (y * s + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * alpha);
  }
  const texture = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------- shaders ----

const COLUMN_VERT = /* glsl */`
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
uniform float uTime;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv; vSeed = aSeed;
  vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 sx = vec3(instanceMatrix[0].xyz); float w = length(sx);
  vec3 sy = vec3(instanceMatrix[1].xyz); float h = length(sy);
  vec3 toCam = cameraPosition - base.xyz; toCam.y = 0.0;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(1e-4, 0.0, 0.0))));
  float rise = uv.y;
  float sway = sin(uTime * 0.23 + aSeed * 6.2831 + rise * 2.4) * rise * rise * 0.16 * w
             + sin(uTime * 0.07 + aSeed * 3.1) * rise * 0.10 * w;
  float widen = 1.0 + rise * 2.2;
  vec3 world = base.xyz + right * (position.x * w * widen + sway) + vec3(0.0, position.y * h, 0.0);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const COLUMN_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uTintFoot;
uniform vec3 uTintTop;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 uv = vUv;
  uv.x += sin(uTime * 0.05 + vSeed * 9.0 + uv.y * 5.0) * 0.03 * uv.y;
  vec4 s = texture2D(uMap, uv);
  vec3 col = mix(uTintFoot, uTintTop, smoothstep(0.0, 0.9, uv.y)) * s.rgb;
  float a = s.a * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

const SPRITE_VERT = /* glsl */`
attribute vec4 aEvent; // birth, life, size, kind(0 flash, 1 flak)
attribute float aSeed;
varying vec2 vUv;
varying float vAge;
varying float vKind;
varying float vSeed;
uniform float uTime;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv; vKind = aEvent.w; vSeed = aSeed;
  float age = (uTime - aEvent.x) / max(aEvent.y, 1e-3);
  vAge = age;
  vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float grow = aEvent.w > 0.5 ? (0.55 + age * 1.9) : (0.6 + smoothstep(0.0, 0.25, age) * 0.7);
  float size = aEvent.x < 0.0 || age < 0.0 || age > 1.0 ? 0.0 : aEvent.z * grow;
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float rot = aSeed * 6.2831 + (aEvent.w > 0.5 ? age * 0.6 : 0.0);
  vec2 p = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * position.xy;
  vec3 world = base.xyz + (camRight * p.x + camUp * p.y) * size;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SPRITE_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
varying float vAge;
varying float vKind;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main() {
  if (vAge < 0.0 || vAge > 1.0) discard;
  float mask = texture2D(uMap, vUv).a;
  vec3 col; float a;
  if (vKind > 0.5) {
    // flak: dark oily puff that browns as it thins
    col = mix(vec3(0.16, 0.15, 0.14), vec3(0.34, 0.30, 0.26), vAge);
    a = mask * pow(1.0 - vAge, 1.5) * 0.85;
  } else {
    // artillery flash: white-hot heart, orange skirt, gone in a blink
    float pulse = 1.0 - smoothstep(0.0, 1.0, vAge);
    col = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.94, 0.78), pow(mask, 2.0)) * (1.2 + pulse);
    a = mask * pulse;
  }
  a *= uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

const TRACER_VERT = /* glsl */`
attribute vec4 aTracer; // birth, life, length, seed
varying float vAge;
varying vec2 vUv;
uniform float uTime;
uniform float uSpeed;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  float age = (uTime - aTracer.x) / max(aTracer.y, 1e-3);
  vAge = age;
  vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 dir = normalize(vec3(instanceMatrix[2].xyz));
  float travelled = max(0.0, uTime - aTracer.x) * uSpeed;
  vec3 head = base.xyz + dir * travelled;
  vec3 toCam = normalize(cameraPosition - head);
  vec3 side = normalize(cross(dir, toCam) + vec3(1e-4));
  float alive = (aTracer.x < 0.0 || age < 0.0 || age > 1.0) ? 0.0 : 1.0;
  float len = aTracer.z * alive;
  float width = 0.22 * alive;
  vec3 world = head - dir * (uv.y * len) + side * (position.x * width);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const TRACER_FRAG = /* glsl */`
varying float vAge;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
void main() {
  if (vAge < 0.0 || vAge > 1.0) discard;
  float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float tail = 1.0 - vUv.y;
  vec3 col = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.9, 0.6), core * tail);
  float a = pow(core, 1.6) * tail * (1.0 - smoothstep(0.7, 1.0, vAge));
  if (a < 0.02) discard;
  gl_FragColor = vec4(col * 1.6, a);
  #include <fog_fragment>
}`;

// ---------------------------------------------------------------- factory ----

interface Aircraft {
  root: THREE.Object3D;
  p0: THREE.Vector3;
  v: THREE.Vector3;
  t0: number;
  durationS: number;
  active: boolean;
}

export function createFrontlineAtmosphere(options: FrontlineAtmosphereOptions): FrontlineAtmosphere {
  const { parent, camera, bus = null, getHeightField, getSpawns } = options;
  if (!parent || !camera) throw new TypeError('frontline atmosphere requires a parent and a camera');
  const group = new THREE.Group();
  group.name = 'frontline-atmosphere';
  group.visible = false;
  parent.add(group);

  const columnTexture = makeColumnTexture();
  const puffTexture = makePuffTexture();
  const columnUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uMap: { value: null }, uTime: { value: 0 }, uOpacity: { value: 0.58 },
    uTintFoot: { value: new THREE.Color(0x3a3531) }, uTintTop: { value: new THREE.Color(0xb8b4ae) },
  }]);
  columnUniforms.uMap.value = columnTexture;
  const columnMaterial = new THREE.ShaderMaterial({
    uniforms: columnUniforms, vertexShader: COLUMN_VERT, fragmentShader: COLUMN_FRAG,
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  const spriteUniformsFor = (): Record<string, THREE.IUniform> => {
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uTime: { value: 0 }, uOpacity: { value: 1 } }]);
    u.uMap.value = puffTexture;
    return u;
  };
  const flashMaterial = new THREE.ShaderMaterial({
    uniforms: spriteUniformsFor(), vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
    transparent: true, depthWrite: false, fog: true, blending: THREE.AdditiveBlending,
  });
  const flakMaterial = new THREE.ShaderMaterial({
    uniforms: spriteUniformsFor(), vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
    transparent: true, depthWrite: false, fog: true,
  });
  const aircraftMaterial = new THREE.MeshBasicMaterial({ color: 0x22262b, fog: true });

  const quad = new THREE.PlaneGeometry(1, 1);
  const columnGeometry = quad.clone().translate(0, 0.5, 0);
  const columnCap = FRONTLINE_LIMITS.columns[1] + FRONTLINE_LIMITS.aaGuns[1]; // + one wreck plume per destroyed gun
  const columnSeeds = new THREE.InstancedBufferAttribute(new Float32Array(columnCap), 1);
  columnGeometry.setAttribute('aSeed', columnSeeds);
  const columns = new THREE.InstancedMesh(columnGeometry, columnMaterial, columnCap);
  columns.name = 'frontline-smoke-columns';
  columns.frustumCulled = false;
  columns.renderOrder = 4;
  columns.count = 0;
  group.add(columns);

  const spriteCap = FRONTLINE_LIMITS.spriteCap;
  const makeSpritePool = (material: THREE.ShaderMaterial, name: string) => {
    const geometry = quad.clone();
    const events = new THREE.InstancedBufferAttribute(new Float32Array(spriteCap * 4).fill(-1), 4);
    const seeds = new THREE.InstancedBufferAttribute(new Float32Array(spriteCap), 1);
    events.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aEvent', events);
    geometry.setAttribute('aSeed', seeds);
    const mesh = new THREE.InstancedMesh(geometry, material, spriteCap);
    mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = 5;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < spriteCap; i++) mesh.setMatrixAt(i, identity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return { mesh, events, seeds, cursor: 0 };
  };
  const flashes = makeSpritePool(flashMaterial, 'frontline-artillery-flashes');
  const flak = makeSpritePool(flakMaterial, 'frontline-flak');

  const aircraftGeometry = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const push = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); parts.push(g); };
    push(new THREE.BoxGeometry(1.3, 1.2, 10.5), 0, 0, 0);            // fuselage
    push(new THREE.BoxGeometry(15.5, 0.28, 2.4), 0, -0.1, 0.9);       // wing
    push(new THREE.BoxGeometry(5.4, 0.22, 1.5), 0, 0.3, -4.6);        // tailplane
    push(new THREE.BoxGeometry(0.22, 2.0, 1.7), 0, 1.2, -4.7);        // fin
    push(new THREE.BoxGeometry(0.9, 0.9, 2.2), -3.6, -0.5, 1.3);      // engine nacelles
    push(new THREE.BoxGeometry(0.9, 0.9, 2.2), 3.6, -0.5, 1.3);
    const merged = mergeBoxGeometries(parts);
    for (const g of parts) g.dispose();
    return merged;
  })();
  const aircraft: Aircraft[] = [];
  for (let i = 0; i < FRONTLINE_LIMITS.aircraftCap; i++) {
    const root = new THREE.Mesh(aircraftGeometry, aircraftMaterial);
    root.name = `frontline-aircraft-${i}`;
    root.frustumCulled = false;
    root.visible = false;
    group.add(root);
    aircraft.push({ root, p0: new THREE.Vector3(), v: new THREE.Vector3(), t0: 0, durationS: 0, active: false });
  }

  // ---- anti-air guns (campaign slice 2) -----------------------------------
  const aaBaseGeometry = mergeBoxGeometries([
    new THREE.BoxGeometry(1.6, 0.35, 1.6).translate(0, 0.17, 0),
    new THREE.BoxGeometry(0.7, 0.9, 0.7).translate(0, 0.8, 0),
    new THREE.BoxGeometry(0.5, 0.25, 2.2).translate(0, 0.3, 0),
    new THREE.BoxGeometry(2.2, 0.25, 0.5).translate(0, 0.3, 0),
  ]);
  const aaHeadGeometry = mergeBoxGeometries([
    new THREE.BoxGeometry(0.9, 0.5, 0.9),
    new THREE.BoxGeometry(1.7, 1.1, 0.08).translate(0, 0.25, 0.35),
    new THREE.BoxGeometry(0.12, 0.12, 2.7).translate(-0.22, 0.1, 1.6),
    new THREE.BoxGeometry(0.12, 0.12, 2.7).translate(0.22, 0.1, 1.6),
    new THREE.BoxGeometry(0.4, 0.3, 0.6).translate(0.55, 0.0, -0.2),
  ]);
  const aaMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4f44, roughness: 0.82, metalness: 0.18 });
  options.setupMaterial?.(aaMaterial); // outside the cascade setup every cascade light strikes it at once
  const aaCap = FRONTLINE_LIMITS.aaGuns[1];
  const aaBases = new THREE.InstancedMesh(aaBaseGeometry, aaMaterial, aaCap);
  aaBases.name = 'frontline-aa-bases'; aaBases.count = 0; aaBases.castShadow = true; aaBases.receiveShadow = true;
  const aaHeads = new THREE.InstancedMesh(aaHeadGeometry, aaMaterial, aaCap);
  aaHeads.name = 'frontline-aa-heads'; aaHeads.count = 0; aaHeads.castShadow = true;
  aaHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(aaBases, aaHeads);
  interface AaGun { pos: THREE.Vector3; yaw: number; pitch: number; nextBurstAt: number; shotsLeft: number; nextShotAt: number; destroyed: boolean; }
  const aaGuns: AaGun[] = [];
  const tracerGeometry = quad.clone();
  const tracerAttr = new THREE.InstancedBufferAttribute(new Float32Array(FRONTLINE_LIMITS.tracerCap * 4).fill(-1), 4);
  tracerAttr.setUsage(THREE.DynamicDrawUsage);
  tracerGeometry.setAttribute('aTracer', tracerAttr);
  const tracerMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSpeed: { value: FRONTLINE_LIMITS.tracerSpeedMps } }]),
    vertexShader: TRACER_VERT, fragmentShader: TRACER_FRAG,
    transparent: true, depthWrite: false, fog: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const tracers = new THREE.InstancedMesh(tracerGeometry, tracerMaterial, FRONTLINE_LIMITS.tracerCap);
  tracers.name = 'frontline-aa-tracers'; tracers.frustumCulled = false; tracers.renderOrder = 6;
  tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  {
    const identity = new THREE.Matrix4();
    for (let i = 0; i < FRONTLINE_LIMITS.tracerCap; i++) tracers.setMatrixAt(i, identity);
  }
  group.add(tracers);
  let tracerCursor = 0;
  const _aim = new THREE.Vector3(), _muzzle = new THREE.Vector3(), _lead = new THREE.Vector3();
  const _headQ = new THREE.Quaternion(), _e = new THREE.Euler(), _one = new THREE.Vector3(1, 1, 1);
  const _origin = new THREE.Vector3(0, 0, 0);

  const log: FrontlineEvent[] = [];
  let intensity = 0, bearingDeg = 0, scale = 1, mapIntensity = 0;
  let rng = mulberry32(1);
  let time = 0;
  let nextArtillery = 0, nextFlak = 0, nextFlyover = 0;
  let prepared = false;
  const columnAnchors: THREE.Vector3[] = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  const groundY = (x: number, z: number): number => {
    const hf = getHeightField?.();
    const y = hf?.getHeightAt?.(x, z);
    return typeof y === 'number' && Number.isFinite(y) ? y : 0;
  };
  const effective = (): number => Math.min(1, Math.max(0, mapIntensity * scale));
  const interval = (range: readonly [number, number]): number => {
    const k = Math.max(0.15, effective());
    return lerp(range[0], range[1], rng()) / k;
  };
  const record = (kind: FrontlineEvent['kind'], pos: THREE.Vector3): FrontlineEvent => {
    const event: FrontlineEvent = { kind, timeS: time, pos: [pos.x, pos.y, pos.z] };
    if (log.length >= FRONTLINE_LIMITS.logCap) log.shift();
    log.push(event);
    return event;
  };
  const spawnSprite = (pool: typeof flashes, pos: THREE.Vector3, life: number, size: number, kind: number): void => {
    const i = pool.cursor; pool.cursor = (pool.cursor + 1) % spriteCap;
    _m.compose(pos, _q.identity(), _s.set(1, 1, 1));
    pool.mesh.setMatrixAt(i, _m);
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.events.setXYZW(i, time, life, size, kind);
    pool.events.needsUpdate = true;
    pool.seeds.setX(i, rng());
    pool.seeds.needsUpdate = true;
  };

  function layoutColumns(): void {
    columnAnchors.length = 0;
    const count = Math.round(lerp(FRONTLINE_LIMITS.columns[0], FRONTLINE_LIMITS.columns[1], effective()));
    const bearing = THREE.MathUtils.degToRad(bearingDeg);
    for (let i = 0; i < count; i++) {
      const spread = (rng() - 0.5) * THREE.MathUtils.degToRad(130);
      const a = bearing + spread;
      const r = lerp(FRONTLINE_LIMITS.columnRangeM[0], FRONTLINE_LIMITS.columnRangeM[1], rng());
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const h = lerp(FRONTLINE_LIMITS.columnHeightM[0], FRONTLINE_LIMITS.columnHeightM[1], rng());
      const w = h * (0.30 + rng() * 0.14);
      const y = groundY(x, z) - 6;
      _p.set(x, y, z);
      columnAnchors.push(_p.clone());
      _m.compose(_p, _q.identity(), _s.set(w, h, 1));
      columns.setMatrixAt(i, _m);
      columnSeeds.setX(i, rng());
    }
    columns.count = count;
    columns.instanceMatrix.needsUpdate = true;
    columnSeeds.needsUpdate = true;
  }

  function fireArtillery(): void {
    if (columnAnchors.length === 0) return;
    const anchor = columnAnchors[Math.floor(rng() * columnAnchors.length)];
    _p.copy(anchor);
    _p.x += (rng() - 0.5) * 90; _p.z += (rng() - 0.5) * 90;
    _p.y = groundY(_p.x, _p.z) + 6 + rng() * 6;
    const size = 26 + rng() * 34;
    spawnSprite(flashes, _p, 0.14 + rng() * 0.06, size, 0);
    const event = record('artillery', _p);
    bus?.emit('atmosphere:artillery', { pos: event.pos, size: size / 60 });
  }

  function burstFlak(): void {
    const plane = aircraft.find((a) => a.active);
    const n = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      if (plane) {
        const lead = 1.5 + rng() * 3.5;
        _p.copy(plane.p0).addScaledVector(plane.v, time - plane.t0 + lead);
        _p.x += (rng() - 0.5) * 120; _p.y += (rng() - 0.5) * 60; _p.z += (rng() - 0.5) * 120;
      } else {
        const a = THREE.MathUtils.degToRad(bearingDeg + (rng() - 0.5) * 120);
        const r = 300 + rng() * 500;
        _p.set(Math.sin(a) * r, 0, Math.cos(a) * r);
        _p.y = groundY(_p.x, _p.z) + lerp(FRONTLINE_LIMITS.aircraftAltitudeM[0], FRONTLINE_LIMITS.aircraftAltitudeM[1], rng());
      }
      spawnSprite(flak, _p, 1.8 + rng() * 0.9, 4 + rng() * 4, 1);
      // stagger the report of each burst by a fraction of a second on the bus side
      const event = record('flak', _p);
      bus?.emit('atmosphere:flak', { pos: event.pos, delayS: i * (0.12 + rng() * 0.16) });
    }
  }

  function launchAircraft(): void {
    const slot = aircraft.find((a) => !a.active);
    if (!slot) return;
    const heading = THREE.MathUtils.degToRad(bearingDeg + 90 + (rng() - 0.5) * 70) + (rng() < 0.5 ? Math.PI : 0);
    const across = THREE.MathUtils.degToRad(bearingDeg) + (rng() - 0.5) * 0.8;
    const offset = (rng() - 0.5) * 500;
    const cx = Math.sin(across) * 150 + Math.cos(across) * offset;
    const cz = Math.cos(across) * 150 - Math.sin(across) * offset;
    const speed = lerp(FRONTLINE_LIMITS.aircraftSpeedMps[0], FRONTLINE_LIMITS.aircraftSpeedMps[1], rng());
    const alt = lerp(FRONTLINE_LIMITS.aircraftAltitudeM[0], FRONTLINE_LIMITS.aircraftAltitudeM[1], rng());
    const R = FRONTLINE_LIMITS.aircraftRadiusM;
    slot.v.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
    slot.p0.set(cx - Math.sin(heading) * R, groundY(cx, cz) + alt, cz - Math.cos(heading) * R);
    slot.t0 = time;
    slot.durationS = (2 * R) / speed;
    slot.active = true;
    slot.root.visible = true;
    slot.root.rotation.set(0, heading, (rng() - 0.5) * 0.24);
    const event = record('flyover', slot.p0);
    bus?.emit('atmosphere:flyover', { p0: event.pos, v: [slot.v.x, slot.v.y, slot.v.z], durationS: slot.durationS });
  }

  function stepAircraft(): void {
    for (const plane of aircraft) {
      if (!plane.active) continue;
      const t = time - plane.t0;
      if (t > plane.durationS) { plane.active = false; plane.root.visible = false; continue; }
      plane.root.position.copy(plane.p0).addScaledVector(plane.v, t);
    }
  }

  /** Guns sit behind the player's spawn, away from the front, spread sideways. */
  function layoutAaGuns(): void {
    aaGuns.length = 0;
    const spawns = getSpawns?.();
    const player = spawns?.player?.pos;
    const count = Math.round(lerp(FRONTLINE_LIMITS.aaGuns[0], FRONTLINE_LIMITS.aaGuns[1], effective()));
    const bearing = THREE.MathUtils.degToRad(bearingDeg);
    const fx = Math.sin(bearing), fz = Math.cos(bearing);
    const px = player ? player[0] : -fx * 300, pz = player ? player[2] : -fz * 300;
    for (let i = 0; i < count; i++) {
      const behind = lerp(FRONTLINE_LIMITS.aaBehindM[0], FRONTLINE_LIMITS.aaBehindM[1], rng());
      const lateral = lerp(FRONTLINE_LIMITS.aaLateralM[0], FRONTLINE_LIMITS.aaLateralM[1], rng()) * (i % 2 === 0 ? 1 : -1);
      const x = THREE.MathUtils.clamp(px - fx * behind + fz * lateral, -470, 470);
      const z = THREE.MathUtils.clamp(pz - fz * behind - fx * lateral, -470, 470);
      const pos = new THREE.Vector3(x, groundY(x, z), z);
      aaGuns.push({ pos, yaw: bearing, pitch: 0.35, nextBurstAt: 0, shotsLeft: 0, nextShotAt: 0, destroyed: false });
      _m.compose(pos, _q.setFromAxisAngle(_up, bearing + (rng() - 0.5) * 0.4), _one);
      aaBases.setMatrixAt(i, _m);
    }
    aaBases.count = count; aaHeads.count = count;
    aaBases.instanceMatrix.needsUpdate = true;
    writeAaHeads();
  }

  function writeAaHeads(): void {
    for (let i = 0; i < aaGuns.length; i++) {
      const gun = aaGuns[i];
      _e.set(-gun.pitch, gun.yaw, 0, 'YXZ');
      _headQ.setFromEuler(_e);
      _m.compose(_p.copy(gun.pos).setY(gun.pos.y + 1.45), _headQ, _one);
      aaHeads.setMatrixAt(i, _m);
    }
    aaHeads.instanceMatrix.needsUpdate = true;
  }

  function fireTracer(gun: AaGun): void {
    _muzzle.set(0, 0.1, 2.9).applyQuaternion(_headQ.setFromEuler(_e.set(-gun.pitch, gun.yaw, 0, 'YXZ')));
    _muzzle.add(gun.pos).y += 1.45;
    _aim.set(0, 0, 1).applyQuaternion(_headQ);
    // small dispersion so bursts fan out around the lead point
    _aim.x += (rng() - 0.5) * 0.03; _aim.y += (rng() - 0.5) * 0.03; _aim.z += (rng() - 0.5) * 0.03;
    _aim.normalize();
    const i = tracerCursor; tracerCursor = (tracerCursor + 1) % FRONTLINE_LIMITS.tracerCap;
    _m.lookAt(_aim, _origin, _up); // Matrix4.lookAt: local +z = eye - target = the shot direction
    _m.setPosition(_muzzle);
    tracers.setMatrixAt(i, _m);
    tracers.instanceMatrix.needsUpdate = true;
    tracerAttr.setXYZW(i, time, FRONTLINE_LIMITS.tracerLifeS, 9 + rng() * 5, rng());
    tracerAttr.needsUpdate = true;
    spawnSprite(flashes, _muzzle, 0.07, 2.4 + rng() * 1.2, 0);
  }

  function stepAaGuns(dt: number): void {
    if (!aaGuns.length) return;
    const plane = aircraft.find((a) => a.active);
    let moved = false;
    for (const gun of aaGuns) {
      if (gun.destroyed) continue; // a knocked-out mount neither tracks nor fires
      if (plane) {
        // lead the aircraft by the tracer flight time
        _lead.copy(plane.p0).addScaledVector(plane.v, time - plane.t0);
        const dist = _lead.distanceTo(gun.pos);
        if (dist < FRONTLINE_LIMITS.aaRangeM) {
          _lead.addScaledVector(plane.v, dist / FRONTLINE_LIMITS.tracerSpeedMps);
          const dx = _lead.x - gun.pos.x, dz = _lead.z - gun.pos.z, dy = _lead.y - (gun.pos.y + 1.45);
          const wantYaw = Math.atan2(dx, dz);
          const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
          let dYaw = wantYaw - gun.yaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
          gun.yaw += THREE.MathUtils.clamp(dYaw, -2.2 * dt, 2.2 * dt);
          gun.pitch += THREE.MathUtils.clamp(wantPitch - gun.pitch, -1.4 * dt, 1.4 * dt);
          moved = true;
          if (time >= gun.nextBurstAt && gun.shotsLeft === 0) {
            gun.shotsLeft = FRONTLINE_LIMITS.aaShotsPerBurst;
            gun.nextShotAt = time;
            gun.nextBurstAt = time + lerp(FRONTLINE_LIMITS.aaBurstIntervalS[0], FRONTLINE_LIMITS.aaBurstIntervalS[1], rng());
            const event = record('aa', gun.pos);
            bus?.emit('atmosphere:aa', { pos: event.pos, shots: FRONTLINE_LIMITS.aaShotsPerBurst, gapS: FRONTLINE_LIMITS.aaShotGapS });
          }
        }
      } else {
        // idle: settle to a raised watch over the front
        const restPitch = 0.35;
        gun.pitch += THREE.MathUtils.clamp(restPitch - gun.pitch, -0.5 * dt, 0.5 * dt);
        moved = moved || Math.abs(restPitch - gun.pitch) > 1e-3;
      }
      while (gun.shotsLeft > 0 && time >= gun.nextShotAt) {
        fireTracer(gun);
        gun.shotsLeft--;
        gun.nextShotAt += FRONTLINE_LIMITS.aaShotGapS;
      }
    }
    if (moved) writeAaHeads();
  }

  // ---- AA guns are destructible (owner brief: "anti air guns going off in
  // back" that the player can silence). Shell sweeps and HE impacts test each
  // live gun's capsule; a hit drops the mount, lights a wreck plume, stops the
  // bursts and publishes 'aa-destroyed' for audio, HUD and campaign scoring.
  let unregisterAa: (() => void) | null = null;
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sc = new THREE.Vector3(), _sd = new THREE.Vector3();
  /** Squared distance between segments p1→q1 and p2→q2 (Ericson 5.1.9). */
  function segmentDistanceSq(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): number {
    const d1 = _sa.subVectors(q1, p1), d2 = _sb.subVectors(q2, p2), r = _sc.subVectors(p1, p2);
    const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
    let s = 0, t = 0;
    if (a <= 1e-9 && e <= 1e-9) return r.lengthSq();
    if (a <= 1e-9) t = THREE.MathUtils.clamp(f / e, 0, 1);
    else {
      const c = d1.dot(r);
      if (e <= 1e-9) s = THREE.MathUtils.clamp(-c / a, 0, 1);
      else {
        const b = d1.dot(d2), denom = a * e - b * b;
        s = denom !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
        else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
      }
    }
    _sd.copy(p1).addScaledVector(d1, s).sub(_sc.copy(p2).addScaledVector(d2, t));
    return _sd.lengthSq();
  }
  function destroyGun(index: number, dirX: number, dirZ: number, cause: 'shell' | 'blast'): void {
    const gun = aaGuns[index];
    if (!gun || gun.destroyed) return;
    gun.destroyed = true;
    gun.shotsLeft = 0;
    gun.pitch = -0.55;                       // barrel dropped onto the mount
    gun.yaw += (rng() - 0.5) * 0.9;
    // the base slumps toward the hit
    const lean = Math.atan2(dirX, dirZ);
    _m.compose(gun.pos, _q.setFromEuler(_e.set(0.32, lean, 0.18, 'YXZ')), _one);
    aaBases.setMatrixAt(index, _m);
    aaBases.instanceMatrix.needsUpdate = true;
    writeAaHeads();
    // a wreck plume: a short smoke column of its own on the burning mount
    const slot = columns.count;
    if (slot < columnCap) {
      _p.copy(gun.pos); _p.y -= 2;
      _m.compose(_p, _q.identity(), _s.set(8, 24, 1));
      columns.setMatrixAt(slot, _m);
      columnSeeds.setX(slot, rng());
      columns.count = slot + 1;
      columns.instanceMatrix.needsUpdate = true;
      columnSeeds.needsUpdate = true;
    }
    emitBreakFx('drumblast', gun.pos.x, gun.pos.y + 0.9, gun.pos.z, dirX, dirZ, 2.4);
    emitDestroyed({ kind: 'aaGun', pos: [gun.pos.x, gun.pos.y, gun.pos.z], cause });
    const event = record('aa-destroyed', gun.pos);
    bus?.emit('atmosphere:aa-destroyed', { pos: event.pos, cause });
  }
  function aaSweep(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const r2 = FRONTLINE_LIMITS.aaHitRadiusM * FRONTLINE_LIMITS.aaHitRadiusM;
    for (let i = 0; i < aaGuns.length; i++) {
      const gun = aaGuns[i];
      if (gun.destroyed) continue;
      _muzzle.set(ax, ay, az); _aim.set(bx, by, bz);
      _lead.copy(gun.pos); _lead.y += FRONTLINE_LIMITS.aaHitHeightM;
      if (segmentDistanceSq(_muzzle, _aim, gun.pos, _lead) <= r2) destroyGun(i, bx - ax, bz - az, 'shell');
    }
  }
  function aaImpact(x: number, y: number, z: number, options: { r: number; he: boolean }): void {
    const reach = options.r + FRONTLINE_LIMITS.aaHitRadiusM;
    for (let i = 0; i < aaGuns.length; i++) {
      const gun = aaGuns[i];
      if (gun.destroyed) continue;
      const dx = x - gun.pos.x, dz = z - gun.pos.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (y < gun.pos.y - options.r || y > gun.pos.y + FRONTLINE_LIMITS.aaHitHeightM + options.r) continue;
      destroyGun(i, -dx, -dz, options.he ? 'blast' : 'shell');
    }
  }
  function registerAaDestructibles(mapId: string): void {
    unregisterAa?.();
    unregisterAa = registerWorldDestructibles({
      key: `frontline-aa:${mapId}`,
      isActive: () => prepared && group.visible && !!group.parent,
      sweep: aaSweep,
      impact: aaImpact,
    });
  }

  function prepare(seed: number | undefined, mapId: string): void {
    reset();
    mapIntensity = isMapId(mapId) ? FRONTLINE_INTENSITY[mapId] : 0.45;
    intensity = effective();
    rng = mulberry32(((seed ?? 0) * 7919 + hashId(mapId)) | 0);
    bearingDeg = resolveFrontBearingDeg(getSpawns?.(), rng() * 360);
    layoutColumns();
    layoutAaGuns();
    registerAaDestructibles(mapId);
    nextArtillery = 2 + rng() * 4;
    nextFlak = 6 + rng() * 10;
    nextFlyover = 20 + rng() * 40;
    prepared = intensity > 0.001;
    group.visible = prepared;
  }

  function update(dtSeconds: number): void {
    if (!prepared || !(dtSeconds > 0)) return;
    const dt = Math.min(0.1, dtSeconds);
    time += dt;
    columnUniforms.uTime.value = time;
    flashMaterial.uniforms.uTime.value = time;
    flakMaterial.uniforms.uTime.value = time;
    tracerMaterial.uniforms.uTime.value = time;
    if (time >= nextArtillery) { fireArtillery(); nextArtillery = time + interval(FRONTLINE_LIMITS.artilleryIntervalS); }
    if (time >= nextFlak) { burstFlak(); nextFlak = time + interval(FRONTLINE_LIMITS.flakIntervalS); }
    if (time >= nextFlyover) { launchAircraft(); nextFlyover = time + interval(FRONTLINE_LIMITS.flyoverIntervalS); }
    stepAircraft();
    stepAaGuns(dt);
  }

  function reset(): void {
    prepared = false;
    group.visible = false;
    time = 0;
    log.length = 0;
    columns.count = 0;
    for (const pool of [flashes, flak]) {
      pool.events.array.fill(-1); pool.events.needsUpdate = true; pool.cursor = 0;
    }
    for (const plane of aircraft) { plane.active = false; plane.root.visible = false; }
    aaGuns.length = 0; aaBases.count = 0; aaHeads.count = 0;
    tracerAttr.array.fill(-1); tracerAttr.needsUpdate = true; tracerCursor = 0;
    unregisterAa?.(); unregisterAa = null;
  }

  function dispose(): void {
    reset();
    parent.remove(group);
    columnGeometry.dispose(); quad.dispose();
    flashes.mesh.geometry.dispose(); flak.mesh.geometry.dispose();
    aircraftGeometry.dispose(); aaBaseGeometry.dispose(); aaHeadGeometry.dispose(); tracerGeometry.dispose();
    columnMaterial.dispose(); flashMaterial.dispose(); flakMaterial.dispose(); aircraftMaterial.dispose();
    options.releaseMaterial?.(aaMaterial);
    aaMaterial.dispose(); tracerMaterial.dispose();
    columnTexture.dispose(); puffTexture.dispose();
  }

  return {
    get intensity() { return intensity; },
    get aaGuns() { return aaGuns; },
    get bearingDeg() { return bearingDeg; },
    group,
    prepare,
    update,
    setScale(next: number) { scale = Math.min(2, Math.max(0, next)); intensity = effective(); },
    reset,
    dispose,
    log,
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

/** Merge same-layout non-indexed box geometries into one buffer (no utils import). */
function mergeBoxGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [];
  for (const g of parts) {
    const nonIndexed = g.index ? g.toNonIndexed() : g;
    positions.push(...Array.from(nonIndexed.getAttribute('position').array as ArrayLike<number>));
    normals.push(...Array.from(nonIndexed.getAttribute('normal').array as ArrayLike<number>));
    if (nonIndexed !== g) nonIndexed.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  return merged;
}
