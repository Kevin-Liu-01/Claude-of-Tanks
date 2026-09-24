import * as THREE from 'three';
import type { HeightField } from './terrain.ts';
import { waterContactProfile } from './waterContact.ts';
import type { WaterRippleField } from './waterRipples.ts';

const GRID_STEP_M = 8;
const MIN_COVERAGE = 0.002;

interface ShallowWaterGeometry {
  geometry: THREE.BufferGeometry;
  heightAt(x: number, z: number): number;
}

function surfaceCell(value: number, half: number, step: number, segments: number): number {
  let cell = Math.min(segments - 1, Math.max(0, Math.floor((value + half) / step)));
  // Match the packed Float32 X/Z boundaries, including non-integral grid steps.
  if (cell > 0 && value < Math.fround(cell * step - half)) cell--;
  else if (cell < segments - 1 && value >= Math.fround((cell + 1) * step - half)) cell++;
  return cell;
}

function waterHeightSampler(
  heights: Float32Array,
  admitted: Uint8Array,
  field: Pick<HeightField, 'size' | 'getHeightAt'>,
  segments: number,
): (x: number, z: number) => number {
  const count = segments + 1, step = field.size / segments, half = field.size / 2;
  const boundary = Math.fround(half);
  return (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)
      || x < -boundary || x > boundary || z < -boundary || z > boundary) return field.getHeightAt(x, z);
    const cx = surfaceCell(x, half, step, segments), cz = surfaceCell(z, half, step, segments);
    const cell = cz * segments + cx;
    if (!(admitted[cell >> 3] & (1 << (cell & 7)))) return field.getHeightAt(x, z);
    const x0 = Math.fround(cx * step - half), x1 = Math.fround((cx + 1) * step - half);
    const z0 = Math.fround(cz * step - half), z1 = Math.fround((cz + 1) * step - half);
    const u = (x - x0) / (x1 - x0), v = (z - z0) / (z1 - z0);
    const key = cz * count + cx;
    const a = heights[key], b = heights[key + 1], c = heights[key + count], d = heights[key + count + 1];
    return u + v <= 1 ? a * (1 - u - v) + b * u + c * v
      : b * (1 - v) + c * (1 - u) + d * (u + v - 1);
  };
}

/** One bounded, static surface, not a fluid solver or another scene/reflection pass. */
export function* shallowWaterGeometrySteps(
  field: Pick<HeightField, 'size' | 'getHeightAt' | 'getWaterMaskAt' | 'getWaterDepthAt'>,
): Generator<void, ShallowWaterGeometry | null, void> {
  const segments = Math.ceil(field.size / GRID_STEP_M);
  const count = segments + 1, step = field.size / segments, half = field.size / 2;
  const wet = new Float32Array(count * count);
  for (let z = 0; z < count; z++) {
    for (let x = 0; x < count; x++) wet[z * count + x] = field.getWaterMaskAt(x * step - half, z * step - half);
    yield;
  }
  const slots = new Int32Array(count * count).fill(-1);
  const admitted = new Uint8Array(Math.ceil(segments * segments / 8));
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  function vertex(x: number, z: number): number {
    const key = z * count + x;
    if (slots[key] >= 0) return slots[key];
    const wx = x * step - half, wz = z * step - half;
    const index = positions.length / 3;
    slots[key] = index;
    positions.push(wx, field.getHeightAt(wx, wz) + (field.getWaterDepthAt?.(wx, wz) ?? 0), wz);
    normals.push(0, 1, 0);
    return index;
  }
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const key = z * count + x;
      const corners = Math.max(wet[key], wet[key + 1], wet[key + count], wet[key + count + 1]);
      if (corners <= MIN_COVERAGE
        && field.getWaterMaskAt((x + 0.5) * step - half, (z + 0.5) * step - half) <= MIN_COVERAGE) continue;
      const a = vertex(x, z), b = vertex(x + 1, z), c = vertex(x, z + 1), d = vertex(x + 1, z + 1);
      indices.push(a, c, b, b, c, d);
      const cell = z * segments + x;
      admitted[cell >> 3] |= 1 << (cell & 7);
    }
    yield;
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const packedPositions = geometry.getAttribute('position');
  for (let key = 0; key < slots.length; key++) wet[key] = slots[key] < 0 ? NaN : packedPositions.getY(slots[key]);
  // Reuse the wet grid as exact packed heights; admission cannot be inferred
  // from four populated corners around an omitted cell. At 1024 m these two
  // retained buffers total 66,564 + 2,048 = 68,612 bytes. The separate factory
  // captures neither temporary slots/arrays nor the rendered geometry owner.
  return { geometry, heightAt: waterHeightSampler(wet, admitted, field, segments) };
}

/**
 * Water pass 6 (2026-09-14): a vehicle in the water disturbs the surface.
 * Water pass 7 (2026-09-20, owner: "right now it's just a bunch of radiating
 * circles that follow you"): the disturbance carries the hull's footprint,
 * heading and speed, so the shader draws a bow wave, two diverging arms,
 * transverse waves and a churned wash lane behind the stern — a wake that
 * trails the vehicle — instead of concentric rings pulsing around a point.
 */
export interface WaterDisturbance {
  readonly x: number;
  readonly z: number;
  /** 0..1 — how much of the hull is in the water and how hard it works the surface. */
  readonly strength: number;
  /** Direction of travel in world XZ (the hull's facing when standing); any length, defaults to +Z. */
  readonly dirX?: number;
  readonly dirZ?: number;
  /** Ground speed in m/s (magnitude); WAKE_FULL_SPEED_MPS and above throws the full wake. */
  readonly speed?: number;
  /** Hull footprint half extents in metres (defaults: 3.4 x 1.8). */
  readonly halfLength?: number;
  readonly halfWidth?: number;
}
const WATER_DISTURBANCE_CAP = 8;
/** Ground speed at which a wake reaches its full length and amplitude. */
export const WAKE_FULL_SPEED_MPS = 8;
const WAKE_DEFAULT_HALF_LENGTH_M = 3.4;
const WAKE_DEFAULT_HALF_WIDTH_M = 1.8;

interface ShallowWaterSurface {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Water pass 8: the reactive field this sheet reads, or null (mobile tier, headless). */
  readonly ripples: WaterRippleField | null;
  /** Advance the sheet's clock and, with an anchor, integrate the reactive field around it. */
  update(deltaSeconds: number, anchorX?: number, anchorZ?: number): void;
  setTime(timeSeconds: number): void;
  /** Publish the vehicles in the water this frame (at most WATER_DISTURBANCE_CAP; strength 0..1). */
  setDisturbances(sources: readonly WaterDisturbance[]): void;
}

type ShallowWaterShader = Parameters<NonNullable<THREE.MeshStandardMaterial['onBeforeCompile']>>[0];
/**
 * Water pass 3 (2026-09-12): the engine hook that folds the surface into the
 * cascaded-shadow setup. Until now the water material set `onBeforeCompile`
 * on its own and never joined it, so all four cascade directional lights
 * struck the sheet at once — four suns on every bay, which every earlier
 * water tuning (roughness floors, opacity, sky reflection) was fighting.
 */
type ShallowWaterMaterialSetup =
  (material: THREE.MeshStandardMaterial, hook: (shader: ShallowWaterShader) => void) => void;

export function createShallowWaterSurface(
  geometry: THREE.BufferGeometry,
  mask: THREE.Texture,
  waveNormal: THREE.Texture,
  size: number,
  mapId: string,
  ramp: readonly [number, number],
  setup: ShallowWaterMaterialSetup | null = null,
  ripples: WaterRippleField | null = null,
  outlandWater: { texture: THREE.Texture; sizeM: number; sectorBlend?: readonly [number, number] } | null = null,
): ShallowWaterSurface {
  const profile = waterContactProfile(mapId);
  const clock = { value: 0 };
  // Water pass 7: vehicle wakes. Slot A is (x, z, dirX, dirZ) in the map's tank frame,
  // slot B is (speed 0..1, strength 0..1, half length m, half width m).
  const wakeA = Array.from({ length: WATER_DISTURBANCE_CAP }, () => new THREE.Vector4(0, 0, 0, 1));
  const wakeB = Array.from({ length: WATER_DISTURBANCE_CAP },
    () => new THREE.Vector4(0, 0, WAKE_DEFAULT_HALF_LENGTH_M, WAKE_DEFAULT_HALF_WIDTH_M));
  const wakeCount = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    color: profile.color, roughness: profile.roughness, metalness: 0,
    // Water 2026-09-12: 0.28 -> 0.55 — the surface mirrors more sky at grazing
    // angles (the 1049e4e bay carried visible sky and sun glints).
    // Water pass 3 (2026-09-12): 0.55 -> 0.9 now that the sheet is lit once
    // (cascade setup) instead of by four suns.
    envMapIntensity: 0.9,
    transparent: true, opacity: profile.opacity, depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.forceSinglePass = true;
  material.name = `water:${profile.kind}`;
  const hook = (shader: ShallowWaterShader): void => {
    Object.assign(shader.uniforms, {
      uWaterMask: { value: mask }, uWaterWave: { value: waveNormal },
      uWaterSize: { value: size }, uWaterTime: clock,
      uWaterRamp: { value: new THREE.Vector2(...ramp) },
      uWaterFlow: { value: new THREE.Vector2(profile.flowX, profile.flowZ) },
      uWaterShore: { value: new THREE.Color(profile.shoreColor) },
      uWaterShallow: { value: new THREE.Color(profile.shallowColor) },
      uWaterFoam: { value: profile.foam },
      uWaterWaveScale: { value: profile.waveScale },
      uWaterWaveStrength: { value: profile.waveStrength },
      // QA only: 1 paints the turbidity field as greyscale so a headless shot can prove the plumbing
      uWaterDebug: { value: 0 },
      uWaterWakeA: { value: wakeA },
      uWaterWakeB: { value: wakeB },
      uWaterWakeCount: wakeCount,
      // Water pass 8 (2026-09-23): the world-anchored reactive field (waterRipples.ts). The sampler shares the
      // field's own value object so its ping-pong swap reaches the sheet without a per-frame uniform write.
      uWaterRipple: ripples?.stateUniform ?? { value: null },
      uWaterRippleParams: { value: ripples?.params ?? new THREE.Vector4(1, 0, 0, 0) },
      uWaterRippleTexel: { value: ripples?.texel ?? new THREE.Vector2(1, 1) },
      // Round 47: the terrain's baked bay-contour mask (the same texture the ring faces read), 0 size = absent
      uOutlandWater: { value: outlandWater?.texture ?? null },
      uOutlandWaterSize: { value: outlandWater?.sizeM ?? 0 },
      uOutlandSeaBlend: { value: new THREE.Vector2(...(outlandWater?.sectorBlend ?? [120, 360])) },
    });
    material.userData.waterShader = shader;
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vWaterWorld;');
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWaterWorld;
      uniform sampler2D uWaterMask;
      uniform sampler2D uWaterWave;
      uniform float uWaterSize;
      uniform float uWaterTime;
      uniform vec2 uWaterRamp;
      uniform vec2 uWaterFlow;
      uniform vec3 uWaterShore;
      uniform vec3 uWaterShallow;
      uniform float uWaterFoam;
      uniform float uWaterWaveScale;
      uniform float uWaterWaveStrength;
      uniform float uWaterDebug;
      uniform vec4 uWaterWakeA[8];
      uniform vec4 uWaterWakeB[8];
      uniform int uWaterWakeCount;
      uniform sampler2D uWaterRipple;
      uniform vec4 uWaterRippleParams;
      uniform vec2 uWaterRippleTexel;
      uniform sampler2D uOutlandWater;   // round 47: the map's bay contours baked past the square (R = wetness)
      uniform float uOutlandWaterSize;   // 0 = no contour (frozen fields, receipts): the round-40 ramp alone
      uniform vec2 uOutlandSeaBlend;     // round 47: metres past the edge where the open-sea sector fades in / is open
      /** Water pass 8: 1 inside the reactive field's window around the camera focus, 0 past its fade band. */
      float waterRippleWindow(vec2 world) {
        if (uWaterRippleParams.w < 0.5) return 0.0;
        vec2 off = abs(world - uWaterRippleParams.yz) / uWaterRippleParams.x;
        return 1.0 - smoothstep(0.36, 0.44, max(off.x, off.y));
      }
      float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float waterValueNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), u.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      /** Water pass 5: sediment / weed-bed field, 0..1, ~45 m and ~17 m octaves. */
      float waterTurbidityField(vec2 world) {
        float n = waterValueNoise(world / 45.0) * 0.65 + waterValueNoise(world / 17.0 + vec2(3.7, 9.1)) * 0.35;
        return smoothstep(0.25, 0.85, n);
      }
      float waterDeep;
      float waterBank;
      float waterGrazing;
      float waterTurbidity;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 waterUV = (vWaterWorld.xz + uWaterSize * 0.5) / uWaterSize;
      // Round 40 (2026-09-22): the sea apron past the square (edgeWater.ts) shares this material. Past the edge the
      // mask has no meaning, so the apron continues the edge texel's wetness (the bay may be a shoal there) and deepens
      // to open water over the next 320 m — no colour step at the seam, no shore ramp or foam line offshore.
      // Round 47 (2026-09-23, owner: "evident right angle with shore and water at the border"): past the edge the
      // wetness is the map's own bay contour (uOutlandWater, baked over ±1536 m) blended toward open sea between 120
      // and 360 m out, so the apron's shoreline is the bay's curve continued, not a chord or a cell edge.
      vec2 waterUvC = clamp(waterUV, 0.0, 1.0);
      float pastEdgeM = max(max(-waterUV.x, waterUV.x - 1.0), max(-waterUV.y, waterUV.y - 1.0)) * uWaterSize;
      float edgeWet = smoothstep(uWaterRamp.x, uWaterRamp.y, texture2D(uWaterMask, waterUvC).b);
      float wet = mix(edgeWet, 1.0, smoothstep(0.0, 320.0, pastEdgeM));
      if (uOutlandWaterSize > 0.5 && pastEdgeM > 0.0) {
        // the same authored ramp the square applies to its mask: the apron ends where the sheet inside would, not up the bank
        float coast = smoothstep(uWaterRamp.x, uWaterRamp.y, texture2D(uOutlandWater, vWaterWorld.xz / uOutlandWaterSize + 0.5).r);
        wet = max(coast, smoothstep(uOutlandSeaBlend.x, uOutlandSeaBlend.y, pastEdgeM));
      }
      if (wet < 0.015) discard;
      vec3 eye = normalize(cameraPosition - vWaterWorld);
      float grazing = pow(1.0 - abs(eye.y), 3.0);
      waterGrazing = grazing;
      waterDeep = smoothstep(0.18, 0.86, wet);
      waterBank = smoothstep(0.015, 0.20, wet) * (1.0 - smoothstep(0.32, 0.74, wet));
      // Water 2026-09-12: the bed shows through the shallows — the deep colour
      // rises out of a sunlit bank tint instead of one flat sheet.
      // Water pass 5 (2026-09-13): the bank colour reaches further into the body
      // (0.05..0.75 -> 0.02..0.90) so a lake is not one saturated sheet 20 m out.
      diffuseColor.rgb = mix(uWaterShallow, diffuseColor.rgb, smoothstep(0.02, 0.90, waterDeep));
      // Water pass 4 (2026-09-13, owner: "significantly better, more varied,
      // more like real life"): the deep body darkens harder and the surface
      // leans on what the SKY does — mirror-like at grazing angles, bed and
      // body colour when looked into — instead of one saturated sheet.
      diffuseColor.rgb *= mix(0.90, 0.58, waterDeep);
      diffuseColor.rgb *= 1.0 - 0.35 * grazing;
      diffuseColor.a = smoothstep(0.0, 0.55, wet) * mix(opacity, 0.86, grazing);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec2 waveUV = vWaterWorld.xz * uWaterWaveScale;
      vec2 drift = uWaterFlow * uWaterTime;
      vec4 waveNear = texture2D(uWaterWave, waveUV + drift);
      vec4 waveBroad = texture2D(uWaterWave, waveUV * 0.61 - drift * 0.7);
      vec2 wave = waveNear.xy * 2.0 - 1.0;
      // water pass 3 (2026-09-12): the broad swell carries more of the relief so
      // the open sea keeps the 1049e4e bay's long wave bands, not just fine chop
      wave += (waveBroad.xy * 2.0 - 1.0) * 0.9;
      // Water pass 4: a fine, faster ripple layer breaks the two-scale pattern
      // into sun sparkle instead of a printed texture.
      vec4 waveFine = texture2D(uWaterWave, waveUV * 2.7 + drift * 1.9 + vec2(0.37, 0.11));
      wave += (waveFine.xy * 2.0 - 1.0) * 0.35;
      // Water pass 6 (2026-09-14, owner: "more interactive") pushed concentric rings out
      // of every vehicle. Water pass 7 (2026-09-20, owner: "right now it's just a bunch of
      // radiating circles that follow you"): each vehicle is a hull footprint with a
      // heading and a speed. A standing hull only laps the water at its skirt; a moving
      // one throws a bow wave, two diverging arms, transverse waves between them and a
      // churned wash lane that fades out behind the stern. Everything is built in the
      // hull frame, so the pattern trails the vehicle instead of pulsing around it, and
      // a fragment beyond a slot's reach skips that slot entirely.
      float wakeFoam = 0.0;
      float wakeWash = 0.0;
      // Water pass 8 (2026-09-23, owner: "not reactive, a static PNG following you"): inside the reactive field's
      // window the surface is the simulated one — its height gradient tilts the normal, its foam whitens, its crests
      // catch light — and the hull-frame pattern below is switched off for every slot the field covers, keeping only
      // the contact line at the skirt. Slots beyond the window (far vehicles, mobile tier) keep the procedural wake.
      float rippleW = waterRippleWindow(vWaterWorld.xz);
      vec2 rippleGrad = vec2(0.0);
      float rippleH = 0.0;
      float rippleFoam = 0.0;
      if (rippleW > 0.001) {
        vec2 ruv = fract(vWaterWorld.xz / uWaterRippleParams.x);
        vec4 rc = texture2D(uWaterRipple, ruv);
        float rr = texture2D(uWaterRipple, ruv + vec2(uWaterRippleTexel.x, 0.0)).r;
        float ru = texture2D(uWaterRipple, ruv + vec2(0.0, uWaterRippleTexel.x)).r;
        rippleGrad = vec2(rr - rc.r, ru - rc.r) / uWaterRippleTexel.y;
        // a real slope, capped: a 30 cm crest over a texel is a breaking face, not a mirror flip
        float gl = length(rippleGrad);
        rippleGrad *= (min(gl, 0.45) / max(gl, 1e-4)) * rippleW;
        rippleH = rc.r * rippleW;
        // the fine wave texture breaks the foam field into streaks and clots instead of a flat white lane
        rippleFoam = rc.a * rippleW * (0.35 + 1.3 * waveFine.x);
      }
      for (int i = 0; i < 8; i++) {
        if (i >= uWaterWakeCount) break;
        vec4 wa = uWaterWakeA[i];
        vec4 wb = uWaterWakeB[i];
        vec2 rel = vWaterWorld.xz - wa.xy;
        float spd = wb.x;
        float hl = wb.z, hw = wb.w;
        float reach = hl + 7.0 + spd * 26.0;
        if (dot(rel, rel) > reach * reach) continue;
        vec2 fwd = wa.zw;
        vec2 side = vec2(-fwd.y, fwd.x);
        float along = dot(rel, fwd);
        float across = dot(rel, side);
        float str = wb.y;
        float phase = float(i) * 1.7;
        // the procedural wake only where the reactive field does not reach this slot's hull
        float proc = 1.0 - waterRippleWindow(wa.xy);
        float mov0 = smoothstep(0.04, 0.35, spd);
        float calm = (1.0 - mov0) * (0.3 + 0.7 * proc);
        float mov = mov0 * proc;
        // rounded hull footprint: 0 under the hull, metres outside it
        vec2 q = vec2(abs(along) - hl, abs(across) - hw);
        float hullDist = length(max(q, 0.0));
        vec2 radial = rel / max(length(rel), 1e-3);
        // standing: short damped ripples lapping out from the skirt, and a thin contact line
        float lap = sin(hullDist * 5.5 - uWaterTime * 3.4 + phase) * exp(-hullDist * 0.9);
        wave += radial * lap * 0.9 * calm * str;
        // a thin bright line where the water meets the skirt, never a whitened slab under the footprint
        wakeFoam += exp(-hullDist * 3.0) * smoothstep(0.0, 0.3, hullDist) * 0.42 * str;
        // bow wave: a mound pushed ahead of the bow, its slope facing forward on the front face
        float bowCentre = hl + 0.6 + 1.3 * spd;
        float bowAcross = exp(-pow(across / (hw + 1.0), 2.0));
        float bow = exp(-pow((along - bowCentre) * 1.5, 2.0)) * bowAcross;
        wave += fwd * (-(along - bowCentre) * 3.2 * bow) * mov * str;
        wave += side * (-across / (hw + 1.0) * 1.2 * bow) * mov * str;
        wakeFoam += bow * smoothstep(0.35, 1.0, spd) * 0.8 * str * proc; // the field's own bow mound whitens inside the window
        // diverging arms: two crests running back and outward from the bow corners (~23 degrees)
        float behindBow = max(hl - along, 0.0);
        float armLine = hw + behindBow * 0.42;
        float da = (abs(across) - armLine) * 0.92;
        float armEnv = exp(-abs(da) * 0.75) * exp(-behindBow * 0.09) * (1.0 - smoothstep(hl - 1.0, hl + 0.5, along));
        float arm = sin(da * 3.2 - uWaterTime * 1.5 + phase) * armEnv * (0.7 + 0.6 * waveFine.x);
        vec2 armN = normalize(side * sign(across) + fwd * 0.42);
        wave += armN * arm * 0.85 * mov * str;
        wakeFoam += smoothstep(0.5, 1.0, armEnv) * exp(-behindBow * 0.16) * (0.28 + 0.5 * waveNear.y) * mov * str;
        // transverse waves between the arms behind the stern; the wavelength grows with speed
        float behindStern = max(-hl - along, 0.0);
        float inside = 1.0 - smoothstep(armLine - 1.5, armLine, abs(across));
        float trans = sin(behindStern * (1.25 / (0.4 + spd)) + uWaterTime * 0.8) * exp(-behindStern * 0.11) * inside * step(0.001, behindStern);
        wave += fwd * trans * 0.9 * mov * str;
        // wash lane: churned, foamy water the tracks leave behind, spreading and fading out
        float trailLen = hl + 4.0 + spd * 22.0;
        float back = clamp(behindStern / trailLen, 0.0, 1.0);
        float laneHalf = hw * (1.0 + 0.7 * back);
        float lane = (1.0 - smoothstep(laneHalf, laneHalf + 1.2, abs(across))) * step(0.001, behindStern);
        float wash = lane * (1.0 - back) * (1.0 - back) * mov * str;
        wakeWash += wash;
        wave += (waveFine.xy * 2.0 - 1.0) * wash * 1.2;
        wakeFoam += wash * (0.16 + 0.6 * smoothstep(0.35, 0.8, waveFine.x * 0.6 + waveNear.y * 0.4));
      }
      // the simulated surface tilts the normal by its real slope (×1.6: a 5 cm ripple still reads at 20 m)
      normal = normalize((viewMatrix * vec4(normalize(vec3(wave.x * uWaterWaveStrength - rippleGrad.x * 1.6, 1.0,
        wave.y * uWaterWaveStrength - rippleGrad.y * 1.6)), 0.0)).xyz);
      normal *= faceDirection;
      // Surface colour breakup reuses the same two wave fetches: moving
      // two-scale value variation, a shore tint band and sparse crests.
      // diffuseColor is consumed by the lighting pass after this point.
      float broadWave = waveBroad.x;
      float fineWave = waveNear.y;
      diffuseColor.rgb *= 0.96 + (broadWave - 0.5) * 0.22 + (fineWave - 0.5) * 0.06;
      // Water pass 5 (2026-09-13, owner: "more varied colours, more like real
      // life"): a very large-scale drift of the same wave texture stands in for
      // suspended sediment and weed beds — the body brightens and dulls in
      // 40-60 m patches (0.42 x the wave scale) and leans toward the bank colour
      // where it is thick.
      // (a normal-map fetch read as one flat sheet at this scale — a normal map
      // hugs 0.5 — so the field is two octaves of value noise on world position)
      float turbidity = waterTurbidityField(vWaterWorld.xz + drift * 6.0);
      waterTurbidity = turbidity;
      diffuseColor.rgb *= 0.80 + turbidity * 0.40;
      diffuseColor.rgb = mix(diffuseColor.rgb, uWaterShallow * 0.80, smoothstep(0.45, 0.90, turbidity) * 0.38 * waterDeep);
      diffuseColor.rgb = mix(diffuseColor.rgb, uWaterShore, waterBank * (0.24 + broadWave * 0.12));
      diffuseColor.rgb += vec3(0.018, 0.026, 0.028)
        * smoothstep(0.66, 0.90, broadWave) * (0.35 + fineWave * 0.65) * waterDeep;
      // Water 2026-09-12: shoreline foam — broken wave crests pile up on the
      // bank band and a few sparse crests whiten open water on the sea maps.
      float foamBank = smoothstep(0.52, 0.86, broadWave * 0.7 + fineWave * 0.5) * waterBank;
      float foamCrest = smoothstep(0.80, 0.96, broadWave) * smoothstep(0.55, 0.9, fineWave) * waterDeep * 0.6;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.85, 0.84), (foamBank * 0.55 + foamCrest * 0.45) * uWaterFoam);
      // Water pass 8: crests catch the light and troughs darken; the field's foam is churn and breaking water
      diffuseColor.rgb *= 1.0 + clamp(rippleH, -0.2, 0.2) * 0.6;
      wakeFoam += rippleFoam * 0.45 + smoothstep(0.25, 0.60, length(rippleGrad)) * 0.25 * (0.5 + waveFine.y);
      wakeWash += rippleFoam * 0.3;
      // Water pass 6/7: the wash lane stirs bed sediment into the body colour, and churned
      // water around and behind a vehicle whitens regardless of the map's foam profile.
      diffuseColor.rgb = mix(diffuseColor.rgb, uWaterShallow * 0.95, clamp(wakeWash, 0.0, 1.0) * 0.35 * waterDeep);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.90, 0.90), clamp(wakeFoam, 0.0, 0.85) * 0.85);
    `);
    // The game's strong sun/bloom exposure turns a broad default dielectric
    // highlight into a white sheet. Keep the directional glint, at a bounded
    // energy, without changing world lighting or adding a reflection pass.
    // Water pass 3 (2026-09-12): the old 0.16 / 0.35 / 0.18 clamps were
    // fighting four cascade suns; lit once, the sheet needs most of its
    // dielectric glint back or the waves read as one flat sheet.
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>',
      '#include <lights_physical_fragment>\nmaterial.specularColor *= 0.85;\nmaterial.specularF90 = 0.9;');
    // Water pass 4: the sky reflection follows the water's own fresnel — a mirror
    // toward the horizon, a window into the shallows underfoot — and the sun
    // glitter keeps most of its energy (the old 0.55 clamp deleted the glints;
    // bloom now carries them as sparkle, not a white sheet).
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>',
      // Water pass 5: wind-ruffled, sediment-laden patches mirror less sky, so the
      // sheet reads as water of varying depth and colour instead of one reflection.
      '#include <lights_fragment_maps>\nradiance *= mix(0.45, 1.75, waterGrazing);\nradiance *= 1.15 - 0.55 * smoothstep(0.35, 0.85, waterTurbidity);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight -= max(vec3(0.0), totalSpecular - vec3(1.15));\nif (uWaterDebug > 0.5) { outgoingLight = vec3(waterTurbidity); diffuseColor.a = 1.0; }\n#include <opaque_fragment>');
  };
  if (setup) setup(material, hook);
  else material.onBeforeCompile = hook;
  material.customProgramCacheKey = () => 'shallow-water-v12';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `shallow_water_${mapId}`;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  // Surface first, then its foam/track rings and transparent combat particles.
  mesh.renderOrder = 2;
  return {
    mesh,
    ripples,
    update(dt, anchorX, anchorZ) {
      if (!(Number.isFinite(dt) && dt > 0)) return;
      clock.value += Math.min(dt, 0.1);
      if (ripples && anchorX !== undefined && anchorZ !== undefined) ripples.step(dt, anchorX, anchorZ);
    },
    setTime(t) { if (Number.isFinite(t)) clock.value = Math.max(0, t); },
    setDisturbances(sources) {
      ripples?.setDisturbances(sources);
      const n = Math.min(WATER_DISTURBANCE_CAP, sources.length);
      for (let i = 0; i < n; i++) {
        const s = sources[i];
        let dx = s.dirX ?? 0, dz = s.dirZ ?? 1;
        const len = Math.hypot(dx, dz);
        if (Number.isFinite(len) && len > 1e-6) { dx /= len; dz /= len; } else { dx = 0; dz = 1; }
        const rawSpeed = Math.abs(s.speed ?? 0);
        const speed = Number.isFinite(rawSpeed) ? Math.min(1, rawSpeed / WAKE_FULL_SPEED_MPS) : 0;
        const strength = Number.isFinite(s.strength) ? Math.min(1, Math.max(0, s.strength)) : 0;
        wakeA[i].set(s.x, s.z, dx, dz);
        wakeB[i].set(speed, strength,
          Math.max(0.5, s.halfLength ?? WAKE_DEFAULT_HALF_LENGTH_M),
          Math.max(0.3, s.halfWidth ?? WAKE_DEFAULT_HALF_WIDTH_M));
      }
      wakeCount.value = n;
    },
  };
}
