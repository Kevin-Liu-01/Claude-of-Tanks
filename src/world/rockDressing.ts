// Round 75, item 6 (integrator, deploy-100 Verdant hull-side frame): the boulders were smooth low-poly lumps. This
// module owns what changed — the fracture law that turns the legacy displaced icosphere into a faceted, cleaved
// rock (inward plane cuts, a ridged detail octave, normals split by angle so cleavage edges shade crisp and the
// rounded shoulders stay smooth), the per-map dressing (moss on the shaded faces of wet maps, a dust cap and skirt
// on arid maps, a soil blend at the base everywhere so the stone sits in the ground), the generated 256 px rock
// detail tile the rock material samples triplanar (no UVs on a displaced sphere), and the shader hook. The legacy
// geometry's projected hull stays the collision proxy: every cut moves a vertex inward, so the visual rock lies
// inside the hull the dedicated shards already carry and no record moves. Renderer-free apart from the texture
// helpers; Node-runnable.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { normalTextureFromHeight, textureFromRgbaPixels, tileableTorusNoise } from './proceduralTexture.ts';

type ToneFunction = (hue: number, saturation: number, lightness: number) => readonly [number, number, number];

export interface RockDressing {
  /** Moss / lichen weight on the shaded and upward faces (0 on snow and arid maps). */
  moss: number;
  /** Dust cap and skirt weight (arid maps). */
  dust: number;
  /** Linear soil colour the base blends toward (the map's dirt tone). */
  soil: readonly [number, number, number];
}

/** The battlefields' moss and dust weights; a map absent here is dry temperate ground (a little moss, no dust). */
const ROCK_CLIMATE: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  verdant: [0.75, 0], autumn: [0.7, 0], coastal: [0.6, 0], fjord: [0.8, 0], monsoon: [0.85, 0], mangrove: [0.85, 0],
  delta: [0.7, 0], polders: [0.65, 0], orchard: [0.7, 0], longleaf: [0.75, 0], reservoir: [0.7, 0], saltwind: [0.55, 0],
  frontier: [0.5, 0], alpine: [0.45, 0], urban: [0.3, 0.1], railyard: [0.25, 0.15], foundry: [0.25, 0.15],
  ruinspires: [0.25, 0.1], skybridge: [0.2, 0.1], caldera: [0.05, 0.35], blackglass: [0, 0.25], steppe: [0.15, 0.4],
  airfield: [0.2, 0.4], desert: [0, 0.8], badlands: [0, 0.8], copper_mesa: [0, 0.75], titan_gorge: [0, 0.7],
  oasis: [0, 0.7], mars: [0, 0.9], winter: [0, 0], whiteout: [0, 0],
});

const _soil = new THREE.Color();

/** Resolve a map's rock dressing; the soil follows the map's dirt tone law over a loam base. */
export function rockDressingFor(mapId: string, dirtTone: ToneFunction | null | undefined): RockDressing {
  const [moss, dust] = ROCK_CLIMATE[mapId] ?? [0.35, 0];
  let h = 0.085, s = 0.32, l = 0.30;
  if (dirtTone) {
    const t = dirtTone(h, s, l);
    h = Math.min(1, Math.max(0, t[0])); s = Math.min(1, Math.max(0, t[1])); l = Math.min(1, Math.max(0, t[2]));
  }
  _soil.setHSL(h, s, l, THREE.SRGBColorSpace);
  return { moss, dust, soil: [_soil.r, _soil.g, _soil.b] };
}

// ---------------------------------------------------------------------------------------------- geometry

const CLEAVAGE_COS = Math.cos(THREE.MathUtils.degToRad(38));

function keyOf(x: number, y: number, z: number): string {
  return `${Math.round(x * 4000)},${Math.round(y * 4000)},${Math.round(z * 4000)}`;
}

/**
 * Cut fracture planes into a displaced boulder and add the detail octave, every vertex moving inward only, then
 * split the normals by angle. The source is the legacy welded geometry (position and any per-vertex attributes,
 * which expand with the corners); the result is non-indexed with per-corner normals.
 */
export function fractureRockGeometry(
  source: THREE.BufferGeometry, variant: number, noise: SimplexNoise, rng: () => number,
): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source.clone();
  const p = geo.attributes.position;
  const cuts = 4 + variant + ((rng() * 2) | 0);
  const planes: Array<[number, number, number, number]> = [];
  for (let k = 0; k < cuts * 4 && planes.length < cuts; k++) {
    const a = rng() * Math.PI * 2, e = (rng() - 0.35) * Math.PI * 0.6;
    const n: [number, number, number] = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
    if (n[1] < -0.25) continue; // never cut the seated bottom
    planes.push([n[0], n[1], n[2], 0.58 + rng() * 0.26]);
  }
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    for (const [nx, ny, nz, d] of planes) {
      const proj = x * nx + y * ny + z * nz;
      if (proj > d) { const t = proj - d; x -= t * nx; y -= t * ny; z -= t * nz; }
    }
    // the detail octave: ridged fine fractures carved in, a grain that only recedes
    const ridged = 1 - Math.abs(noise.noise3d(x * 9 + variant * 23, y * 9 - 5, z * 9 + 3));
    const grain = noise.noise3d(x * 15 - variant * 7, y * 15 + 11, z * 15) * 0.5 + 0.5;
    const f = 1 - Math.pow(ridged, 4) * 0.05 - grain * 0.02;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  // face normals, then per-corner normals averaged over the faces that share the corner within the cleavage angle
  const faceCount = p.count / 3;
  const faceNormals = new Float32Array(faceCount * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const byPosition = new Map<string, number[]>();
  for (let f = 0; f < faceCount; f++) {
    a.fromBufferAttribute(p, f * 3); b.fromBufferAttribute(p, f * 3 + 1); c.fromBufferAttribute(p, f * 3 + 2);
    n.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
    faceNormals[f * 3] = n.x; faceNormals[f * 3 + 1] = n.y; faceNormals[f * 3 + 2] = n.z;
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k, key = keyOf(p.getX(i), p.getY(i), p.getZ(i));
      let list = byPosition.get(key);
      if (!list) byPosition.set(key, list = []);
      list.push(f);
    }
  }
  const normals = new Float32Array(p.count * 3);
  for (let f = 0; f < faceCount; f++) {
    const fx = faceNormals[f * 3], fy = faceNormals[f * 3 + 1], fz = faceNormals[f * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k;
      let sx = 0, sy = 0, sz = 0;
      for (const g of byPosition.get(keyOf(p.getX(i), p.getY(i), p.getZ(i))) ?? [f]) {
        const gx = faceNormals[g * 3], gy = faceNormals[g * 3 + 1], gz = faceNormals[g * 3 + 2];
        if (gx * fx + gy * fy + gz * fz < CLEAVAGE_COS) continue;
        sx += gx; sy += gy; sz += gz;
      }
      const len = Math.hypot(sx, sy, sz) || 1;
      normals[i * 3] = sx / len; normals[i * 3 + 1] = sy / len; normals[i * 3 + 2] = sz / len;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** True when every vertex of the geometry projects inside (or onto) the convex hull, an XZ polygon as [x, z, ...]. */
export function projectsInsideHull(geometry: THREE.BufferGeometry, hull: readonly number[], tolerance = 1e-4): boolean {
  const p = geometry.attributes.position;
  const count = hull.length / 2;
  // the hull is counter-clockwise from convexHull2 (monotone chain); a point is inside when it is left of (or on) every edge
  let orientation = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count, k = (i + 2) % count;
    orientation += (hull[j * 2] - hull[i * 2]) * (hull[k * 2 + 1] - hull[j * 2 + 1]) - (hull[j * 2 + 1] - hull[i * 2 + 1]) * (hull[k * 2] - hull[j * 2]);
  }
  const sign = orientation >= 0 ? 1 : -1;
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v), z = p.getZ(v);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const cross = (hull[j * 2] - hull[i * 2]) * (z - hull[i * 2 + 1]) - (hull[j * 2 + 1] - hull[i * 2 + 1]) * (x - hull[i * 2]);
      if (cross * sign < -tolerance) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------- the detail tile

interface RockDetailSlice { fine: true; stage: string }

export interface RockDetailTextures {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  surface: THREE.CanvasTexture;
}

function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }

/**
 * A 256 px tileable rock tile: fracture lines (ridged noise) over a granular grain, near-white luminance so the
 * vertex tone stays the rock's colour; the ORM packs occlusion in the lines. Sixteen rows a checkpoint.
 */
export function* makeRockDetail(
  noi: SimplexNoise, anisotropy: number,
): Generator<RockDetailSlice, RockDetailTextures, void> {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), orm = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = (x + 0.5) / s, v = (y + 0.5) / s, i = y * s + x, j = i * 4;
      const lines = Math.pow(1 - Math.abs(tileableTorusNoise(noi, u, v, 3, 3, 211)), 6) * 0.7
        + Math.pow(1 - Math.abs(tileableTorusNoise(noi, u, v, 7, 7, 223)), 8) * 0.5;
      const grain = tileableTorusNoise(noi, u, v, 19, 19, 239) * 0.5 + 0.5;
      const flake = tileableTorusNoise(noi, u, v, 41, 41, 251) * 0.5 + 0.5;
      const height = clamp(0.62 + grain * 0.22 + flake * 0.1 - lines * 0.5, 0, 1);
      const lum = clamp(0.78 + grain * 0.14 + flake * 0.06 - lines * 0.42, 0.2, 1);
      const value = lum * 255;
      px[j] = value; px[j + 1] = value; px[j + 2] = value; px[j + 3] = 255;
      orm[j] = clamp(0.62 + height * 0.38, 0, 1) * 255;
      orm[j + 1] = clamp(0.8 + (1 - height) * 0.18, 0, 1) * 255;
      orm[j + 2] = 0;
      orm[j + 3] = 255;
      hgt[i] = height;
    }
    if ((y + 1) % 16 === 0) yield { fine: true, stage: `rock-rows-${y + 1}` };
  }
  return {
    albedo: textureFromRgbaPixels(px, s, { srgb: true, anisotropy }),
    normal: normalTextureFromHeight(hgt, s, 0.5, anisotropy),
    surface: textureFromRgbaPixels(orm, s, { anisotropy }),
  };
}

// ---------------------------------------------------------------------------------------------- the shader hook

interface RockShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

function mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/rockDressing: shader anchor missing: ${anchor}`);
  return out;
}

/**
 * Patch the rock material's program after the props grime hook (which supplies vGrimeW / vGrimeN and uGrime):
 * the instance's ground height rides an instanced attribute, the detail tile is sampled triplanar in world
 * space, and the map's moss, dust and soil laws blend on top of the vertex tone.
 */
export function applyRockShaderHook(shader: RockShader, dressing: RockDressing): void {
  shader.uniforms.uRockMoss = { value: dressing.moss };
  shader.uniforms.uRockDust = { value: dressing.dust };
  shader.uniforms.uRockSoil = { value: new THREE.Vector3(...dressing.soil) };
  shader.vertexShader = mustReplace(shader.vertexShader, 'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;',
    'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nattribute float aRockGround;\nvarying float vRockAbove;');
  shader.vertexShader = mustReplace(shader.vertexShader, '  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}',
    '  vGrimeN = normalize(mat3(modelMatrix) * gn);\n  vRockAbove = vGrimeW.y - aRockGround;\n}');
  shader.fragmentShader = mustReplace(shader.fragmentShader, 'uniform sampler2D uGrime;',
    'uniform sampler2D uGrime;\nvarying float vRockAbove;\nuniform float uRockMoss;\nuniform float uRockDust;\nuniform vec3 uRockSoil;');
  // the triplanar detail multiplies in the map slot (order-free); the moss, dust and soil laws mix after the
  // vertex tone has multiplied (three's color_fragment), so they are the final colour, not a tint under it
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`
vec3 rockTw = abs(vGrimeN); rockTw = rockTw * rockTw * rockTw * rockTw; rockTw /= max(1e-4, rockTw.x + rockTw.y + rockTw.z);
vec3 rockPw = vGrimeW * 0.62;
float rockDetail = 0.8;
#ifdef USE_MAP
rockDetail = texture2D(map, rockPw.yz).r * rockTw.x + texture2D(map, rockPw.xz).r * rockTw.y + texture2D(map, rockPw.xy).r * rockTw.z;
diffuseColor.rgb *= 0.42 + 0.66 * rockDetail;
#endif`);
  // the normal tile, triplanar in world space: three's tangent frame (normal_fragment_maps) divides by the UV
  // derivatives, which are zero on a mesh without UVs, so its chunk is replaced outright
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>', /* glsl */`
#ifdef USE_NORMALMAP
{
  vec3 rockTx = texture2D(normalMap, rockPw.yz).xyz * 2.0 - 1.0;
  vec3 rockTy = texture2D(normalMap, rockPw.xz).xyz * 2.0 - 1.0;
  vec3 rockTz = texture2D(normalMap, rockPw.xy).xyz * 2.0 - 1.0;
  vec3 rockPert = vec3(0.0, rockTx.x, rockTx.y) * rockTw.x + vec3(rockTy.x, 0.0, rockTy.y) * rockTw.y + vec3(rockTz.x, rockTz.y, 0.0) * rockTw.z;
  vec3 rockN = normalize(normalize(vGrimeN) + rockPert * 0.55);
  normal = normalize((viewMatrix * vec4(rockN, 0.0)).xyz);
}
#endif`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <color_fragment>', /* glsl */`#include <color_fragment>
{
  // moss on the shaded side and the tops of wet maps, in the tile's grain
  vec2 flank = normalize(vGrimeN.xz + vec2(1e-4, 0.0));
  float shaded = 0.5 - 0.5 * dot(flank, vec2(0.55, -0.83));
  float mossMask = uRockMoss * smoothstep(0.15, 0.85, shaded * 0.6 + max(0.0, vGrimeN.y) * 0.7)
    * smoothstep(0.32, 0.72, texture2D(uGrime, vGrimeW.xz * 0.55 + vGrimeW.y * 0.31).g);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.23, 0.09) * (0.6 + 0.7 * rockDetail), mossMask * 0.85);
  // dust: a pale cap on the upward faces and a skirt at the base of arid maps
  float dustMask = uRockDust * (0.4 * smoothstep(0.35, 0.9, vGrimeN.y) + 0.6 * (1.0 - smoothstep(0.0, 1.1, vRockAbove)));
  diffuseColor.rgb = mix(diffuseColor.rgb, uRockSoil * 1.35, dustMask * 0.65);
  // the base sits in the ground: soil climbs the lower third of a metre, broken by the grime field
  float soilMask = (1.0 - smoothstep(-0.12, 0.34, vRockAbove)) * (0.55 + 0.45 * texture2D(uGrime, vGrimeW.xz * 1.3).r);
  diffuseColor.rgb = mix(diffuseColor.rgb, uRockSoil, soilMask * 0.92);
}`);
}
