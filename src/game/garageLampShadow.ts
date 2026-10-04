/**
 * garageLampShadow.ts — 2026-10-04 (gauntlet wave 60, item 4; Sonnet: "the contact shadow where the hull meets the
 * turntable is so soft and faint that the tank reads as slightly hovering").
 *
 * The enclosed Garage is lit by its lamps: the two hanging highbays, the wall floods, the key and fill spots and the
 * bay fills. None of them casts a shadow. The sun's cascades are the only shadow maps the frame carries, and a spot or
 * point shadow would draw the hull's convex cascade proxies (the near-detail policy turns the real armour on only for
 * the sun's cascades, renderLayers.ts). So the podium was lit right up to the track. The ground-occlusion block
 * (vehicleGroundOcclusion.ts) dims only the outdoor rig's ambient share, which moved the podium beside the track by
 * 1–4 levels in the Garage (measured, h13). The fill behind the hull did the most damage: the podium is dark and
 * semi-glossy (roughness 0.64), so a lamp behind the hull reaches the viewer as a broad specular sheen over the very
 * floor the hull should shade.
 *
 * In the Garage the hull and the lamps hold still: the hero heading is fixed and so are the lights. So each lamp's
 * umbra under the hull is baked once per hull onto the podium:
 *  - the occluders are the hull solid and its runs, as the ground-occlusion block measures them
 *    (`measureVehicleGroundHull`), plus the turret's box;
 *  - each lamp is sampled over its emitter disc, and each sample projects the occluders' corners from the lamp onto the
 *    podium plane (the convex hull of the projections);
 *  - each sample is weighted by what that lamp gives the podium as the canonical camera sees it: Lambert diffuse plus
 *    a GGX specular lobe at the podium's roughness;
 *  - the sun's cascades shadow the sun already and the ambient is the ground-occlusion block's, so both stay in the
 *    denominator only.
 *
 * The bake gives the share of the podium's light the hull hides, s ∈ [0, 1]. A decal on the podium multiplies the
 * colour by 1 − s: multiply blending, premultiplied, which keeps the scene target's alpha (the sun visibility and
 * vehicle tag the post chain reads). Outside the podium deck, and over a margin at the bake's border, it is exactly 1.
 * A bake costs a few milliseconds on the main thread and runs only when the hull, its pose or the lamps change. The
 * decal is one transparent draw, in the Garage only.
 */
import * as THREE from 'three';
import { measureVehicleGroundHull } from '../engine/vehicleGroundOcclusion.ts';

type GroundHull = NonNullable<ReturnType<typeof measureVehicleGroundHull>>;

/** An axis-aligned occluder box in the hull's root frame: [x0, y0, z0, x1, y1, z1]. */
export type LampShadowBox = readonly [number, number, number, number, number, number];

/** One emitter sample: its position in the root frame and its share of the podium's light. */
export interface LampShadowSample { readonly x: number; readonly y: number; readonly z: number; readonly w: number; }

/** The bake's grid in the root frame: texel (i, j) is centred at (x0 + (i + ½)·cell, z0 + (j + ½)·cell). */
export interface LampShadowGrid { readonly x0: number; readonly z0: number; readonly cell: number; readonly nx: number; readonly nz: number; }

/** Bake texel size in metres. */
export const LAMP_SHADOW_CELL_M = 0.06;
/** How far past the hull and its runs the bake reaches (m): the longest umbra, the turret top under a 34° fill. */
export const LAMP_SHADOW_MARGIN_M = 3.6;
/** The bake fades to exactly 1 over this border (m), so no umbra is ever cut at the decal's edge. */
export const LAMP_SHADOW_BORDER_M = 0.45;
/** Emitter samples per lamp: its centre and a hexagon at 0.7 of its radius. */
export const LAMP_SHADOW_SAMPLES = 7;
/** A lamp giving the podium less than this share is left out of the bake. */
export const LAMP_SHADOW_MIN_SHARE = 0.015;
/** The lamps' share of the podium's light is held to this window. */
export const LAMP_SHADOW_STRENGTH_RANGE = Object.freeze([0.4, 0.9] as const);
/** Box blur radius (texels) and passes: a near-Gaussian penumbra of about one texel on top of the emitter sampling. */
export const LAMP_SHADOW_BLUR = Object.freeze({ radius: 1, passes: 2 });
/** The podium surface the weights assume (garageStage.ts podTopMat): its roughness, F0 and dark painted albedo. */
export const LAMP_SHADOW_SURFACE = Object.freeze({ roughness: 0.64, f0: 0.04, albedo: 0.04 });
/** The decal stands this far (m) over the podium plane. */
export const LAMP_SHADOW_LIFT_M = 0.004;

/** Lamp emitter radius (m) by light kind: the highbay's glowing disc, a flood's or spot's lens, a bare bulb. */
function emitterRadius(light: THREE.Light): number {
  if ((light as THREE.SpotLight).isSpotLight) return 0.25;
  return light.intensity >= 20 ? 0.6 : 0.3;
}

/** The hull's occluder boxes in its root frame: the hull solid, both runs and (when measured) the turret. */
export function lampShadowBoxes(h: GroundHull, turret: THREE.Box3 | null): LampShadowBox[] {
  const boxes: LampShadowBox[] = [[-h.hx, h.yb, h.fz0, h.hx, h.yt, h.fz1]];
  const runTop = Math.max(h.yb, h.y0 + 0.05);
  boxes.push([h.xi, h.y0, h.tz0, h.xo, runTop, h.tz1], [-h.xo, h.y0, h.tz0, -h.xi, runTop, h.tz1]);
  if (turret && !turret.isEmpty()) {
    boxes.push([turret.min.x, Math.max(turret.min.y, h.yt), turret.min.z, turret.max.x, turret.max.y, turret.max.z]);
  }
  return boxes;
}

/** Andrew's monotone chain over flat [x, z, x, z, …] points: the convex hull, counter-clockwise, flat. */
export function convexHull2D(points: readonly number[]): number[] {
  const n = points.length / 2;
  if (n < 3) return points.slice();
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => points[2 * a] - points[2 * b] || points[2 * a + 1] - points[2 * b + 1]);
  const cross = (o: number, a: number, b: number): number =>
    (points[2 * a] - points[2 * o]) * (points[2 * b + 1] - points[2 * o + 1])
    - (points[2 * a + 1] - points[2 * o + 1]) * (points[2 * b] - points[2 * o]);
  const lower: number[] = [], upper: number[] = [];
  for (const i of order) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  lower.pop(); upper.pop();
  const out: number[] = [];
  for (const i of lower.concat(upper)) out.push(points[2 * i], points[2 * i + 1]);
  return out;
}

/**
 * The umbra a lamp point throws from a group of boxes onto the plane y = floorY: the convex hull of their corners
 * projected from the lamp. Null when the lamp does not stand above every corner (a low fill under the deck would throw
 * an unbounded shadow; the bake leaves such samples out).
 */
export function projectedShadow(boxes: readonly LampShadowBox[], lamp: { x: number; y: number; z: number },
  floorY: number): number[] | null {
  const pts: number[] = [];
  for (const b of boxes) {
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? b[3] : b[0], y = c & 2 ? b[4] : b[1], z = c & 4 ? b[5] : b[2];
      const height = lamp.y - y;
      if (height <= 0.02) return null;
      const t = (lamp.y - floorY) / height;
      pts.push(lamp.x + (x - lamp.x) * t, lamp.z + (z - lamp.z) * t);
    }
  }
  return convexHull2D(pts);
}

/** Set every texel of `mask` whose centre lies inside the convex counter-clockwise polygon `poly`. */
export function rasterizeConvex(poly: readonly number[], grid: LampShadowGrid, mask: Uint8Array): void {
  const n = poly.length / 2;
  if (n < 3) return;
  let zMin = Infinity, zMax = -Infinity;
  for (let k = 0; k < n; k++) { zMin = Math.min(zMin, poly[2 * k + 1]); zMax = Math.max(zMax, poly[2 * k + 1]); }
  const j0 = Math.max(0, Math.ceil((zMin - grid.z0) / grid.cell - 0.5));
  const j1 = Math.min(grid.nz - 1, Math.floor((zMax - grid.z0) / grid.cell - 0.5));
  for (let j = j0; j <= j1; j++) {
    const z = grid.z0 + (j + 0.5) * grid.cell;
    let xl = Infinity, xr = -Infinity;
    for (let k = 0; k < n; k++) {
      const ax = poly[2 * k], az = poly[2 * k + 1];
      const bx = poly[(2 * k + 2) % (2 * n)], bz = poly[(2 * k + 3) % (2 * n)];
      if ((az <= z && bz > z) || (bz <= z && az > z)) {
        const x = ax + (z - az) / (bz - az) * (bx - ax);
        xl = Math.min(xl, x); xr = Math.max(xr, x);
      }
    }
    if (!(xr >= xl)) continue;
    const i0 = Math.max(0, Math.ceil((xl - grid.x0) / grid.cell - 0.5));
    const i1 = Math.min(grid.nx - 1, Math.floor((xr - grid.x0) / grid.cell - 0.5));
    for (let i = i0; i <= i1; i++) mask[j * grid.nx + i] = 1;
  }
}

/** Separable box blur in place (edges clamp). */
export function boxBlur(field: Float32Array, nx: number, nz: number, radius: number, passes: number): void {
  if (radius < 1) return;
  const tmp = new Float32Array(field.length);
  const span = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        let s = 0;
        for (let d = -radius; d <= radius; d++) s += field[j * nx + Math.min(nx - 1, Math.max(0, i + d))];
        tmp[j * nx + i] = s / span;
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        let s = 0;
        for (let d = -radius; d <= radius; d++) s += tmp[Math.min(nz - 1, Math.max(0, j + d)) * nx + i];
        field[j * nx + i] = s / span;
      }
    }
  }
}

/**
 * What a light gives the podium at `p` (normal +Y) as the camera at `eye` sees it, per unit of the light's colour
 * luminance × intensity × falloff: Lambert's albedo / π plus a GGX lobe (Smith-Schlick visibility, Schlick Fresnel).
 * `towardLight` is the unit vector from `p` to the light.
 */
export function podiumResponse(towardLight: THREE.Vector3, p: THREE.Vector3, eye: THREE.Vector3,
  surface: { roughness: number; f0: number; albedo: number } = LAMP_SHADOW_SURFACE): number {
  const nl = towardLight.y;
  if (!(nl > 0)) return 0;
  const vx = eye.x - p.x, vy = eye.y - p.y, vz = eye.z - p.z;
  const vl = Math.hypot(vx, vy, vz) || 1;
  const nv = Math.max(vy / vl, 1e-3);
  const hx = vx / vl + towardLight.x, hy = vy / vl + towardLight.y, hz = vz / vl + towardLight.z;
  const hl = Math.hypot(hx, hy, hz) || 1;
  const nh = Math.max(hy / hl, 0);
  const vh = Math.max((vx / vl * hx + vy / vl * hy + vz / vl * hz) / hl, 0);
  const a = surface.roughness * surface.roughness, a2 = a * a;
  const dDen = nh * nh * (a2 - 1) + 1;
  const D = a2 / (Math.PI * dDen * dDen);
  const k = a / 2;
  const G = (nl / (nl * (1 - k) + k)) * (nv / (nv * (1 - k) + k));
  const F = surface.f0 + (1 - surface.f0) * Math.pow(1 - vh, 5);
  const specular = D * G * F / (4 * nl * nv);
  return (surface.albedo / Math.PI + specular) * nl;
}

const _toLight = new THREE.Vector3();
const _lightPos = new THREE.Vector3();
const _target = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _color = new THREE.Color();

/** A light's falloff × cone at world point `p` (three's physically based point and spot attenuation). */
export function lightAttenuation(light: THREE.Light, lightPos: THREE.Vector3, p: THREE.Vector3): number {
  const d = lightPos.distanceTo(p);
  const point = light as THREE.PointLight;
  const decay = point.decay ?? 2, cutoff = point.distance ?? 0;
  let f = 1 / Math.max(Math.pow(d, decay), 0.01);
  if (cutoff > 0) f *= Math.pow(THREE.MathUtils.clamp(1 - Math.pow(d / cutoff, 4), 0, 1), 2);
  const spot = light as THREE.SpotLight;
  if (spot.isSpotLight) {
    spot.target.getWorldPosition(_target);
    _axis.subVectors(_target, lightPos).normalize();
    const cosAngle = _toLight.subVectors(p, lightPos).normalize().dot(_axis);
    const cone = Math.cos(spot.angle), penumbra = Math.cos(spot.angle * (1 - spot.penumbra));
    f *= THREE.MathUtils.smoothstep(cosAngle, cone, penumbra);
  }
  return f;
}

/** Luminance of a light's colour × intensity. */
function lightLuminance(light: THREE.Light): number {
  _color.copy(light.color);
  return light.intensity * (0.2126 * _color.r + 0.7152 * _color.g + 0.0722 * _color.b);
}

/** What the bake needs from the scene, in world space. */
export interface LampShadowLighting {
  /** The shadowless lamps (point and spot lights). */
  readonly lamps: readonly THREE.Light[];
  /** The shadowed sun: its luminance × intensity and its direction toward the sun (unit), or null. */
  readonly sun: { readonly luminance: number; readonly direction: THREE.Vector3 } | null;
  /** The ambient's irradiance luminance on an up-facing podium (hemisphere sky pole). */
  readonly ambient: number;
}

export interface LampShadowBake {
  readonly grid: LampShadowGrid;
  /** Colour multiplier per texel, row-major, j along +Z of the root frame. */
  readonly factor: Float32Array;
  /** The lamps' share of the podium's light (the strength the umbra darkens by). */
  readonly strength: number;
  /** Lamps baked (after the share cut) and samples that threw an umbra. */
  readonly lamps: number;
  readonly samples: number;
}

/**
 * Bake the hull's lamp umbra over its podium. Everything is world space except the occluders, which are in the hull's
 * root frame (`rootMatrixWorld` maps root to world). `eye` is the canonical Garage camera, `podium` the deck centre
 * (its y the podium top) and radius.
 */
export function bakeLampShadow(options: {
  boxes: readonly LampShadowBox[];
  rootMatrixWorld: THREE.Matrix4;
  lighting: LampShadowLighting;
  eye: THREE.Vector3;
  podium: { centre: THREE.Vector3; radius: number };
  cellM?: number;
}): LampShadowBake {
  const { boxes, rootMatrixWorld, lighting, eye, podium } = options;
  const toRoot = new THREE.Matrix4().copy(rootMatrixWorld).invert();
  const scale = new THREE.Vector3().setFromMatrixScale(rootMatrixWorld);
  const unit = Math.max(1e-6, (scale.x + scale.y + scale.z) / 3); // metres per root unit
  // the grid: the boxes' footprint plus the margin, in root units
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const b of boxes) { bx0 = Math.min(bx0, b[0]); bz0 = Math.min(bz0, b[2]); bx1 = Math.max(bx1, b[3]); bz1 = Math.max(bz1, b[5]); }
  const cell = (options.cellM ?? LAMP_SHADOW_CELL_M) / unit, margin = LAMP_SHADOW_MARGIN_M / unit;
  const nx = Math.max(2, Math.ceil((bx1 - bx0 + 2 * margin) / cell));
  const nz = Math.max(2, Math.ceil((bz1 - bz0 + 2 * margin) / cell));
  const grid: LampShadowGrid = { x0: (bx0 + bx1) / 2 - nx * cell / 2, z0: (bz0 + bz1) / 2 - nz * cell / 2, cell, nx, nz };
  // the podium plane in the root frame (the root stands upright: its y axis is the world's)
  const floorRoot = new THREE.Vector3(podium.centre.x, podium.centre.y, podium.centre.z).applyMatrix4(toRoot);
  const floorY = floorRoot.y;
  // reference podium points beside the hull (world): the weights are what the lamps give the podium there
  const refs: THREE.Vector3[] = [];
  const midX = (bx0 + bx1) / 2, midZ = (bz0 + bz1) / 2, out = 0.6 / unit;
  for (const [x, z] of [[bx1 + out, midZ], [bx0 - out, midZ], [midX, bz1 + out], [midX, bz0 - out]] as const) {
    refs.push(new THREE.Vector3(x, floorY, z).applyMatrix4(rootMatrixWorld));
  }
  const response = (towardLight: THREE.Vector3, p: THREE.Vector3): number => podiumResponse(towardLight, p, eye);
  const lampWeights: number[] = [];
  let lampSum = 0;
  for (const light of lighting.lamps) {
    light.getWorldPosition(_lightPos);
    let w = 0;
    for (const p of refs) {
      _toLight.subVectors(_lightPos, p).normalize();
      const r = response(_toLight, p);
      w += r * lightAttenuation(light, _lightPos, p) * lightLuminance(light);
    }
    w /= refs.length;
    lampWeights.push(w);
    lampSum += w;
  }
  let other = Math.max(0, lighting.ambient) * LAMP_SHADOW_SURFACE.albedo / Math.PI;
  if (lighting.sun && lighting.sun.direction.y > 0) {
    let s = 0;
    for (const p of refs) s += response(lighting.sun.direction, p);
    other += lighting.sun.luminance * s / refs.length;
  }
  const strength = lampSum > 0
    ? THREE.MathUtils.clamp(lampSum / (lampSum + other), LAMP_SHADOW_STRENGTH_RANGE[0], LAMP_SHADOW_STRENGTH_RANGE[1]) : 0;
  const field = new Float32Array(nx * nz);
  const mask = new Uint8Array(nx * nz);
  const hullBoxes = boxes.slice(0, 3), extraBoxes = boxes.slice(3);
  let lamps = 0, samples = 0;
  const lampRoot = new THREE.Vector3();
  for (let l = 0; l < lighting.lamps.length; l++) {
    const share = lampSum > 0 ? lampWeights[l] / lampSum : 0;
    if (share < LAMP_SHADOW_MIN_SHARE) continue;
    lamps++;
    const light = lighting.lamps[l];
    light.getWorldPosition(_lightPos);
    const radius = emitterRadius(light) / unit;
    for (let s = 0; s < LAMP_SHADOW_SAMPLES; s++) {
      const angle = (s - 1) * Math.PI / 3;
      const r = s === 0 ? 0 : 0.7 * radius;
      lampRoot.copy(_lightPos).applyMatrix4(toRoot);
      const sample = { x: lampRoot.x + r * Math.cos(angle), y: lampRoot.y, z: lampRoot.z + r * Math.sin(angle) };
      const main = projectedShadow(hullBoxes, sample, floorY);
      if (!main) continue;
      samples++;
      mask.fill(0);
      rasterizeConvex(main, grid, mask);
      for (const box of extraBoxes) {
        const poly = projectedShadow([box], sample, floorY);
        if (poly) rasterizeConvex(poly, grid, mask);
      }
      const w = share / LAMP_SHADOW_SAMPLES;
      for (let k = 0; k < mask.length; k++) if (mask[k]) field[k] += w;
    }
  }
  boxBlur(field, nx, nz, LAMP_SHADOW_BLUR.radius, LAMP_SHADOW_BLUR.passes);
  // the colour multiplier; 1 off the podium deck and over the border ramp
  const factor = new Float32Array(nx * nz);
  const border = LAMP_SHADOW_BORDER_M / unit;
  const world = new THREE.Vector3();
  for (let j = 0; j < nz; j++) {
    const z = grid.z0 + (j + 0.5) * cell;
    const ej = Math.min(j + 0.5, nz - j - 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const x = grid.x0 + (i + 0.5) * cell;
      const edge = Math.min(ej, Math.min(i + 0.5, nx - i - 0.5) * cell);
      world.set(x, floorY, z).applyMatrix4(rootMatrixWorld);
      const radial = Math.hypot(world.x - podium.centre.x, world.z - podium.centre.z);
      const fade = THREE.MathUtils.smoothstep(edge, 0, border) * (1 - THREE.MathUtils.smoothstep(radial, podium.radius - 0.12, podium.radius - 0.02));
      factor[j * nx + i] = 1 - strength * Math.min(1, field[j * nx + i]) * fade;
    }
  }
  return { grid, factor, strength, lamps, samples };
}

/** The decal's RGBA8 texels (linear colour multiplier, opaque). */
export function lampShadowTexels(bake: LampShadowBake): Uint8Array {
  const { nx, nz } = bake.grid;
  const data = new Uint8Array(nx * nz * 4);
  for (let k = 0; k < nx * nz; k++) {
    const v = Math.round(THREE.MathUtils.clamp(bake.factor[k], 0, 1) * 255);
    data[4 * k] = v; data[4 * k + 1] = v; data[4 * k + 2] = v; data[4 * k + 3] = 255;
  }
  return data;
}

export interface GarageLampShadow {
  /** The decal (a Garage root: mount it with the stage). */
  readonly mesh: THREE.Mesh;
  /** The last bake (null before the first hull). */
  readonly bake: LampShadowBake | null;
  dispose(): void;
}

/**
 * The Garage decal. It follows the hull the light rig selects near the podium (scene.userData.nearVehicles, the
 * ground-occlusion block's selection) and bakes again when the hull, its pose or the lamps change. It runs from the
 * decal's own onBeforeRender (frustum culling off, so it is asked every Garage frame); with no hull on the podium it
 * multiplies by one.
 */
export function createGarageLampShadow(options: {
  scene: THREE.Scene;
  /** Roots whose point and spot lights are the Garage's lamps. */
  lampRoots: readonly THREE.Object3D[];
  garagePosition: THREE.Vector3;
  podiumTopY: number;
  podiumRadius: number;
  /** The canonical camera offset from the garage position (garagePresentationPose.ts). */
  cameraOffset: readonly [number, number, number];
  /** Tests: the hull measure (default measureVehicleGroundHull). */
  measure?: (root: THREE.Object3D) => GroundHull | null;
}): GarageLampShadow {
  const { scene, lampRoots, garagePosition, podiumTopY, podiumRadius, cameraOffset } = options;
  const measure = options.measure ?? measureVehicleGroundHull;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    map: white, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
    fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  material.name = 'garage-lamp-shadow';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'garageLampShadow';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  let texture: THREE.DataTexture | null = null;
  let bake: LampShadowBake | null = null;
  let key = '';
  const eye = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const toRoot = new THREE.Matrix4();
  const floorPoint = new THREE.Vector3();
  const rootScale = new THREE.Vector3();

  const isShown = (object: THREE.Object3D): boolean => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  const collectLighting = (): LampShadowLighting => {
    const lamps: THREE.Light[] = [];
    for (const root of lampRoots) {
      root.traverse((o) => {
        const light = o as THREE.Light;
        if ((light as THREE.PointLight).isPointLight || (light as THREE.SpotLight).isSpotLight) {
          if (light.intensity > 0 && !light.castShadow && isShown(light)) lamps.push(light);
        }
      });
    }
    let sun: LampShadowLighting['sun'] = null;
    let ambient = 0;
    for (const child of scene.children) {
      const directional = child as THREE.DirectionalLight;
      if (!sun && directional.isDirectionalLight && directional.castShadow && directional.visible) {
        const direction = new THREE.Vector3().subVectors(directional.position, directional.target.position).normalize();
        sun = { luminance: lightLuminance(directional), direction };
      }
      const hemi = child as THREE.HemisphereLight;
      if (hemi.isHemisphereLight && hemi.visible) ambient += lightLuminance(hemi);
    }
    return { lamps, sun, ambient };
  };
  const pedestalRoot = (): THREE.Object3D | null => {
    const near = scene.userData.nearVehicles as readonly { root: THREE.Object3D }[] | undefined;
    if (!near) return null;
    for (const entry of near) {
      const root = entry?.root;
      if (!root || !root.visible || !root.parent) continue;
      const e = root.matrixWorld.elements;
      if (Math.abs(e[12] - garagePosition.x) < 4 && Math.abs(e[14] - garagePosition.z) < 4) return root;
    }
    return null;
  };
  const turretBounds = (root: THREE.Object3D): THREE.Box3 | null => {
    const box = new THREE.Box3();
    const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const part = new THREE.Box3();
    const relative = new THREE.Matrix4();
    root.traverse((o) => {
      const meshObject = o as THREE.Mesh;
      if (!meshObject.isMesh || !/^turret/.test(meshObject.name) || !meshObject.geometry) return;
      if (!meshObject.geometry.boundingBox) meshObject.geometry.computeBoundingBox();
      const bb = meshObject.geometry.boundingBox;
      if (!bb || bb.isEmpty()) return;
      relative.multiplyMatrices(toRoot, meshObject.matrixWorld);
      box.union(part.copy(bb).applyMatrix4(relative));
    });
    return box.isEmpty() ? null : box;
  };
  const setIdentity = (): void => {
    if (material.map !== white) { material.map = white; material.needsUpdate = true; }
    key = '';
  };

  const syncBake = (root: THREE.Object3D | null): void => {
    const shape = root ? measure(root) : null;
    if (!root || !shape) { setIdentity(); return; }
    const lighting = collectLighting();
    const e = root.matrixWorld.elements;
    let signature = `${root.uuid}|${e.map((v) => v.toFixed(3)).join(',')}`;
    for (const lamp of lighting.lamps) {
      lamp.getWorldPosition(_lightPos);
      signature += `|${lamp.intensity.toFixed(2)}@${_lightPos.x.toFixed(2)},${_lightPos.y.toFixed(2)},${_lightPos.z.toFixed(2)}`;
    }
    if (signature === key && bake) return;
    const boxes = lampShadowBoxes(shape, turretBounds(root));
    centre.set(garagePosition.x, garagePosition.y + podiumTopY, garagePosition.z);
    eye.set(garagePosition.x + cameraOffset[0], garagePosition.y + cameraOffset[1], garagePosition.z + cameraOffset[2]);
    bake = bakeLampShadow({ boxes, rootMatrixWorld: root.matrixWorld, lighting, eye, podium: { centre, radius: podiumRadius } });
    key = signature;
    const { grid } = bake;
    toRoot.copy(root.matrixWorld).invert();
    const floorY = floorPoint.copy(centre).applyMatrix4(toRoot).y;
    const lift = LAMP_SHADOW_LIFT_M / Math.max(1e-6, rootScale.setFromMatrixScale(root.matrixWorld).y);
    const x0 = grid.x0, x1 = grid.x0 + grid.nx * grid.cell, z0 = grid.z0, z1 = grid.z0 + grid.nz * grid.cell;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0, x0, floorY + lift, z0); position.setXYZ(1, x1, floorY + lift, z0);
    position.setXYZ(2, x1, floorY + lift, z1); position.setXYZ(3, x0, floorY + lift, z1);
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
    texture?.dispose();
    texture = new THREE.DataTexture(lampShadowTexels(bake), grid.nx, grid.nz, THREE.RGBAFormat);
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    material.map = texture;
    material.needsUpdate = true;
  };

  // asked every Garage frame (frustum culling is off); the decal rides the hull's matrix, which three has already
  // updated, and three computes the decal's model-view matrix after this hook
  mesh.onBeforeRender = () => {
    const root = pedestalRoot();
    syncBake(root);
    if (root && key) {
      mesh.matrix.copy(root.matrixWorld);
      mesh.matrixWorld.copy(root.matrixWorld);
    }
  };

  return {
    mesh,
    get bake() { return bake; },
    dispose() {
      texture?.dispose();
      white.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
