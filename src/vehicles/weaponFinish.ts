// src/vehicles/weaponFinish.ts — the fleet's weapon finish: parkerized weapon steel for barrels, receivers, feed
// covers and muzzle devices, and the national drab of the ammunition containers (fleet-weapons lane, 2026-10-09).
//
// Owner, 2026-10-09: "make sure all our autocannons and machine guns look good too. some are drab and plain colored or
// dont have camo applied on right". The census of all 220 hulls (fleet-weapons lane, $SP/weapons/census-report.md)
// found every gun drawn in one flat colour: 1,146 weapon meshes in the hardware gunmetal (#36342f, no albedo map, no
// normal map, no wear), 536 in the scheme's flat fitting paint, and 273 of 273 ammunition cans in that fitting paint.
// The coordinator's rule (same day):
// - barrels, receivers, feed covers and muzzle devices are weapon steel: a dark phosphate (parkerized) finish with
//   grain, oil-darkened and dry-grey patches, an oil sheen that runs in streaks, and bright bare steel worn into the
//   crease edges;
// - shields, remote-station housings and mount plates carry the hull's camouflage (the vehicle-scale box UV);
// - ammunition containers carry their own national drab with worn paint edges, never the scheme's tint;
// - nothing on a weapon is a flat single colour.
//
// Both materials are clones of the vehicle set's own materials (cloneVehicleMaterial), so they join the shadow cascade
// setup and the vehicle light floor exactly as the hardware gunmetal does. Their textures are small shared DataTextures
// (deterministic, no canvas), sampled through a box projection at WEAPON_STEEL_UV_REPEATS_PER_M. The edge wear is a
// shader term over two baked per-vertex attributes (bakeWeaponEdgeWear): each triangle's barycentric corner and the
// inverse heights of its crease edges, so the wear band is measured in metres from the real edges of the part (a box's
// twelve edges, a tube's rims), never along the diagonals of a flat face, and fades out where the band is under a pixel.
// A mesh without the attributes reads zero inverse heights and takes no wear.
import * as THREE from 'three';

/** Texture repeats per metre of the weapon-steel grain (one 256 px tile spans a third of a metre: ~1.3 mm a texel). */
export const WEAPON_STEEL_UV_REPEATS_PER_M = 3;

/**
 * The edge wear's live parameters (material.userData.weaponWear: plain numbers, so Material.clone()'s JSON copy keeps
 * them; the shader reads them through uniform getters at every upload, so a tuning page can change them in place).
 * - wornColor (linear RGB), wornRoughness, wornMetalness: the bare steel that shows through on a worn edge;
 * - core, reach (metres): fully worn inside `core` of a crease edge, broken by the chip mask out to `reach`;
 * - chipLo, chipHi, reachWeight: the chip mask's threshold band and how strongly nearness to the edge raises it.
 * 2026-10-10 (the first garage close-ups): the first set (worn #8f8c84 at roughness 0.34 and metalness 0.85, a 3.5 mm
 * core and a 14 mm reach) wore most of a small receiver to bright steel and read as chrome under the hangar lights; the
 * wear is now a thin, sparse, dark steel line.
 */
export interface WeaponWearParams {
  wornColor: [number, number, number];
  wornRoughness: number;
  wornMetalness: number;
  core: number;
  reach: number;
  chipLo: number;
  chipHi: number;
  reachWeight: number;
}
const linearRgb = (hex: number): [number, number, number] => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
/** Two faces meeting at more than this angle make a crease edge (a 16-sided tube's facets meet at 22.5 degrees). */
const CREASE_COS = Math.cos(THREE.MathUtils.degToRad(38));

export const WEAPON_EDGE_BARY = 'aWeaponEdgeBary';
export const WEAPON_EDGE_INVH = 'aWeaponEdgeInvH';

// ---- deterministic texture field -------------------------------------------------------------------------------
const TEX = 256;
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Tileable value noise on a `cells` lattice over the TEX square. */
function valueNoise(x: number, y: number, cells: number, seed: number): number {
  const fx = (x / TEX) * cells, fy = (y / TEX) * cells;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const w = (i: number, j: number) => hash2(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  const a = w(x0, y0), b = w(x0 + 1, y0), c = w(x0, y0 + 1), d = w(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, base: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0, cells = base;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x, y, cells, seed + o * 101) * amp;
    norm += amp; amp *= 0.5; cells *= 2;
  }
  return sum / norm;
}

interface WeaponTextures { albedo: THREE.DataTexture; rough: THREE.DataTexture; normal: THREE.DataTexture }
let shared: WeaponTextures | null = null;

function dataTexture(data: Uint8Array, srgb: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, TEX, TEX, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The shared weapon-finish textures (built once per process):
 * - albedo: a near-white multiplier — fine phosphate grain (+-4 %) over broad oil-darkened and dry-grey patches
 *   (+-9 %), so a receiver or a barrel never reads as one flat tone;
 * - rough: R the chip mask that breaks the edge wear up, G the roughness (oil streaks run a little smoother, about 0.76
 *   of the dry phosphate), B the metalness multiplier (dry patches a little less metallic);
 * - normal: the phosphate's fine tooth.
 */
export function weaponFinishTextures(): WeaponTextures {
  if (shared) return shared;
  const albedo = new Uint8Array(TEX * TEX * 4);
  const rough = new Uint8Array(TEX * TEX * 4);
  const height = new Float32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = y * TEX + x;
      const grain = hash2(x, y, 11) - 0.5;
      const patch = fbm(x, y, 3, 3, 23) - 0.5;
      // oil runs: stretched along u (the box projection's long axis on most barrel and receiver faces)
      const streak = fbm(x * 0.25, y * 2.2, 4, 3, 37);
      const oily = Math.min(1, Math.max(0, (streak - 0.52) * 3.2));
      const lum = 0.93 + grain * 0.08 + patch * 0.18 - oily * 0.05;
      const warm = patch * 0.025;
      albedo[i * 4] = Math.round(255 * Math.min(1, Math.max(0, lum + warm)));
      albedo[i * 4 + 1] = Math.round(255 * Math.min(1, Math.max(0, lum)));
      albedo[i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, lum - warm * 1.4)));
      albedo[i * 4 + 3] = 255;
      const chip = fbm(x, y, 16, 3, 53);
      rough[i * 4] = Math.round(255 * chip);
      rough[i * 4 + 1] = Math.round(255 * Math.min(1, Math.max(0, 0.98 - oily * 0.22 + grain * 0.06 + patch * 0.10)));
      rough[i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, 0.92 + patch * 0.16)));
      rough[i * 4 + 3] = 255;
      height[i] = grain * 0.7 + (fbm(x, y, 32, 2, 71) - 0.5) * 0.6;
    }
  }
  const normal = new Uint8Array(TEX * TEX * 4);
  const at = (x: number, y: number) => height[((y + TEX) % TEX) * TEX + ((x + TEX) % TEX)];
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = y * TEX + x;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.9, dy = (at(x, y + 1) - at(x, y - 1)) * 0.9;
      const len = Math.hypot(dx, dy, 1);
      normal[i * 4] = Math.round(255 * (0.5 - dx / len * 0.5));
      normal[i * 4 + 1] = Math.round(255 * (0.5 - dy / len * 0.5));
      normal[i * 4 + 2] = Math.round(255 * (0.5 + 0.5 / len));
      normal[i * 4 + 3] = 255;
    }
  }
  shared = { albedo: dataTexture(albedo, true), rough: dataTexture(rough, false), normal: dataTexture(normal, false) };
  return shared;
}

// ---- edge-wear bake ----------------------------------------------------------------------------------------------
/**
 * Bake the crease-edge wear attributes onto a NON-INDEXED geometry (mergeAll's output): per vertex its barycentric
 * corner, and per triangle the inverse heights to the triangle's three edges, zero for an edge that is not a crease
 * (the shared diagonal of a flat face, the seam between smooth facets). An open boundary (a tube's mouth) is a crease.
 * Returns the number of crease edges marked.
 */
export function bakeWeaponEdgeWear(geometry: THREE.BufferGeometry): number {
  if (geometry.index) throw new Error('bakeWeaponEdgeWear requires a non-indexed geometry');
  const pos = geometry.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);
  const bary = new Float32Array(pos.count * 3);
  const invH = new Float32Array(pos.count * 3);
  const q = (v: number) => Math.round(v * 2e4);
  const key = (i: number) => `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
  const normals = new Float32Array(triCount * 3);
  const area = new Float32Array(triCount);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const edges = new Map<string, number[]>();
  const vk: string[] = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) vk[i] = key(i);
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const len = n.length();
    area[t] = len / 2;
    if (len > 1e-12) n.multiplyScalar(1 / len);
    normals.set([n.x, n.y, n.z], t * 3);
    for (let e = 0; e < 3; e++) {
      const k0 = vk[t * 3 + ((e + 1) % 3)], k1 = vk[t * 3 + ((e + 2) % 3)];
      if (k0 === k1) continue;
      const ek = k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`;
      const list = edges.get(ek);
      if (list) list.push(t * 3 + e); else edges.set(ek, [t * 3 + e]);
    }
  }
  const crease = new Uint8Array(triCount * 3);
  let marked = 0;
  for (const list of edges.values()) {
    for (const te of list) {
      const t = Math.floor(te / 3);
      let isCrease = list.length === 1;
      for (const other of list) {
        if (other === te) continue;
        const u = Math.floor(other / 3);
        const dot = normals[t * 3] * normals[u * 3] + normals[t * 3 + 1] * normals[u * 3 + 1] + normals[t * 3 + 2] * normals[u * 3 + 2];
        if (dot < CREASE_COS) { isCrease = true; break; }
      }
      if (isCrease) { crease[te] = 1; marked++; }
    }
  }
  for (let t = 0; t < triCount; t++) {
    for (let v = 0; v < 3; v++) bary[(t * 3 + v) * 3 + v] = 1;
    if (area[t] < 1e-12) continue;
    for (let e = 0; e < 3; e++) {
      if (!crease[t * 3 + e]) continue;
      // edge e is opposite vertex e: its height from vertex e is 2 * area / |edge|
      a.fromBufferAttribute(pos, t * 3 + ((e + 1) % 3)); b.fromBufferAttribute(pos, t * 3 + ((e + 2) % 3));
      const edgeLen = a.distanceTo(b);
      const h = (2 * area[t]) / Math.max(edgeLen, 1e-9);
      for (let v = 0; v < 3; v++) invH[(t * 3 + v) * 3 + e] = 1 / Math.max(h, 1e-5);
    }
  }
  geometry.setAttribute(WEAPON_EDGE_BARY, new THREE.BufferAttribute(bary, 3));
  geometry.setAttribute(WEAPON_EDGE_INVH, new THREE.BufferAttribute(invH, 3));
  return marked;
}

// ---- edge-wear shader ----------------------------------------------------------------------------------------------
const WEAR_VERTEX_HEAD = `
attribute vec3 ${WEAPON_EDGE_BARY};
attribute vec3 ${WEAPON_EDGE_INVH};
varying vec3 vWeaponEdgeBary;
varying vec3 vWeaponEdgeInvH;`;
const WEAR_FRAGMENT_HEAD = `
uniform vec3 uWeaponWornColor;
uniform float uWeaponWornRoughness;
uniform float uWeaponWornMetalness;
uniform float uWeaponWearCore;
uniform float uWeaponWearReach;
uniform vec3 uWeaponChip;
varying vec3 vWeaponEdgeBary;
varying vec3 vWeaponEdgeInvH;
float weaponEdgeDistance() {
	float d = 1e3;
	if ( vWeaponEdgeInvH.x > 0.0 ) d = min( d, vWeaponEdgeBary.x / vWeaponEdgeInvH.x );
	if ( vWeaponEdgeInvH.y > 0.0 ) d = min( d, vWeaponEdgeBary.y / vWeaponEdgeInvH.y );
	if ( vWeaponEdgeInvH.z > 0.0 ) d = min( d, vWeaponEdgeBary.z / vWeaponEdgeInvH.z );
	return d;
}`;
// The wear amount: a solid core on the crease, chipped out to the reach by the rough map's R channel, and faded where
// the band is narrower than about a pixel and a half (no shimmering outline at range).
const WEAR_FRAGMENT_AMOUNT = `
float weaponWear = 0.0;
{
	float ed = weaponEdgeDistance();
	if ( ed < uWeaponWearReach ) {
		float chip = 0.5;
		#ifdef USE_ROUGHNESSMAP
		chip = texture2D( roughnessMap, vRoughnessMapUv ).r;
		#endif
		float core = 1.0 - smoothstep( uWeaponWearCore * 0.5, uWeaponWearCore, ed );
		float reach = 1.0 - smoothstep( uWeaponWearCore, uWeaponWearReach, ed );
		float chipped = smoothstep( uWeaponChip.x, uWeaponChip.y, chip + reach * uWeaponChip.z );
		float px = max( fwidth( ed ), 1e-6 );
		float resolve = clamp( ( uWeaponWearCore / px - 0.6 ) / 1.2, 0.0, 1.0 );
		weaponWear = max( core, chipped * reach ) * resolve;
	}
}`;

/** Install the crease-edge wear on a weapon-finish material (wraps its existing compile hook, like applyBurnHook). */
export function installWeaponEdgeWear(material: THREE.MeshStandardMaterial, params: WeaponWearParams): void {
  if (material.userData.weaponEdgeWear) return;
  material.userData.weaponEdgeWear = true;
  material.userData.weaponWear = { ...params, wornColor: [...params.wornColor] };
  const prevHook = typeof material.onBeforeCompile === 'function' ? material.onBeforeCompile : null;
  const prevKey = material.customProgramCacheKey;
  const live = (): WeaponWearParams => material.userData.weaponWear as WeaponWearParams;
  const wornColor = new THREE.Color();
  const chip = new THREE.Vector3();
  material.onBeforeCompile = function (shader, renderer) {
    if (prevHook) prevHook.call(this, shader, renderer);
    // getters: three reads a uniform's value at every upload, so the live parameters apply without a recompile
    shader.uniforms.uWeaponWornColor = { get value() { const c = live().wornColor; return wornColor.setRGB(c[0], c[1], c[2]); } };
    shader.uniforms.uWeaponWornRoughness = { get value() { return live().wornRoughness; } };
    shader.uniforms.uWeaponWornMetalness = { get value() { return live().wornMetalness; } };
    shader.uniforms.uWeaponWearCore = { get value() { return live().core; } };
    shader.uniforms.uWeaponWearReach = { get value() { return live().reach; } };
    shader.uniforms.uWeaponChip = { get value() { const p = live(); return chip.set(p.chipLo, p.chipHi, p.reachWeight); } };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${WEAR_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	vWeaponEdgeBary = ${WEAPON_EDGE_BARY};
	vWeaponEdgeInvH = ${WEAPON_EDGE_INVH};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${WEAR_FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>${WEAR_FRAGMENT_AMOUNT}
	diffuseColor.rgb = mix( diffuseColor.rgb, uWeaponWornColor, weaponWear );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = mix( roughnessFactor, uWeaponWornRoughness, weaponWear );`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	metalnessFactor = mix( metalnessFactor, uWeaponWornMetalness, weaponWear );`);
  };
  const tag = '|weapon-wear-v2';
  material.customProgramCacheKey = function () {
    return (typeof prevKey === 'function' ? prevKey.call(this) : '') + tag;
  };
  material.needsUpdate = true;
}

// ---- national ammunition drab -------------------------------------------------------------------------------------
/** The ammunition containers' own drab by army family (sRGB): issue colours, never the vehicle scheme's tint. */
const AMMO_DRAB: Readonly<Record<string, number>> = Object.freeze({
  nato: 0x4b4f32,      // US / NATO olive drab (M2A1 / M19A1 cans)
  warpac: 0x4c5440,    // Soviet / Russian green-grey ammunition boxes
  china: 0x53573c,     // PLA olive boxes
  israel: 0x55553a,    // IDF olive
});
const NATION_AMMO_FAMILY: Readonly<Record<string, string>> = Object.freeze({
  'USSR/Russia': 'warpac', Russia: 'warpac', USSR: 'warpac', Ukraine: 'warpac', Poland: 'warpac',
  China: 'china', Israel: 'israel',
});
export function ammoDrabFor(nation: string | undefined): number {
  return AMMO_DRAB[NATION_AMMO_FAMILY[nation ?? ''] ?? 'nato'];
}

export interface WeaponFinishMaterials {
  weaponSteel: THREE.MeshStandardMaterial;
  ammoDrab: THREE.MeshStandardMaterial;
}
type CloneVehicleMaterial = <T extends THREE.Material>(source: T, configure?: (clone: T) => void) => T;

/**
 * The weapon-finish pair for one vehicle, cloned from its hardware gunmetal and fitting paint so they share every
 * vehicle hook (cascade shadows, light floor, sky trim). Weapon steel: phosphate grey-black (#2b2c29) with the grain,
 * patch and oil-streak maps, a satin phosphate (roughness 0.8, metalness 0.4, dry patches less), sky light trimmed to
 * 0.25 so a receiver top never mirrors the hangar lights; a thin, sparse line of dark bare steel on its crease edges.
 * Ammunition drab: the nation's issue colour, matte paint (roughness 0.82) whose worn edges show dull steel.
 */
export const WEAPON_STEEL_WEAR: Readonly<WeaponWearParams> = Object.freeze({
  wornColor: linearRgb(0x5c5a54), wornRoughness: 0.5, wornMetalness: 0.7,
  core: 0.002, reach: 0.008, chipLo: 0.68, chipHi: 0.76, reachWeight: 0.35,
});
export const AMMO_DRAB_WEAR: Readonly<WeaponWearParams> = Object.freeze({
  wornColor: linearRgb(0x66635b), wornRoughness: 0.6, wornMetalness: 0.5,
  core: 0.002, reach: 0.008, chipLo: 0.68, chipHi: 0.76, reachWeight: 0.35,
});
export function createWeaponFinishMaterials(
  dark: THREE.MeshStandardMaterial,
  detail: THREE.MeshStandardMaterial,
  nation: string | undefined,
  cloneVehicleMaterial: CloneVehicleMaterial,
): WeaponFinishMaterials {
  const tex = weaponFinishTextures();
  const weaponSteel = cloneVehicleMaterial(dark, (m) => {
    m.color.set(0x2b2c29);
    m.map = tex.albedo;
    m.roughness = 0.8;
    m.roughnessMap = tex.rough;
    m.metalness = 0.4;
    m.metalnessMap = tex.rough;
    m.normalMap = tex.normal;
    m.normalScale = new THREE.Vector2(0.45, 0.45);
    m.envMapIntensity = 0.25;
    m.vertexColors = false;
  });
  weaponSteel.name = 'cot:weapon-steel';
  weaponSteel.userData = { ...weaponSteel.userData, appearanceRole: 'gunmetal', weaponFinish: 'weaponSteel',
    weaponUvScale: WEAPON_STEEL_UV_REPEATS_PER_M };
  installWeaponEdgeWear(weaponSteel, WEAPON_STEEL_WEAR);
  // The can's drab and the belt's dull brass ride the vertex colours (ammoVertexColour), so one material draws both.
  const ammoDrab = cloneVehicleMaterial(detail, (m) => {
    m.color.set(0xffffff);
    m.vertexColors = true;
    m.map = tex.albedo;
    m.roughness = 0.82;
    m.roughnessMap = tex.rough;
    m.metalness = 0.08;
    m.metalnessMap = null;
    m.normalMap = tex.normal;
    m.normalScale = new THREE.Vector2(0.3, 0.3);
    m.envMapIntensity = 0.25;
  });
  ammoDrab.name = 'cot:ammo-drab';
  const drab = new THREE.Color(ammoDrabFor(nation));
  ammoDrab.userData = { ...ammoDrab.userData, appearanceRole: 'fittingPaint', weaponFinish: 'ammoDrab',
    weaponUvScale: WEAPON_STEEL_UV_REPEATS_PER_M, ammoDrabLinear: [drab.r, drab.g, drab.b] };
  installWeaponEdgeWear(ammoDrab, AMMO_DRAB_WEAR);
  return { weaponSteel, ammoDrab };
}

/** Dull cartridge brass (linear) for the belt's rounds on the ammunition material. */
const CARTRIDGE_BRASS_LINEAR: readonly [number, number, number] = [0.26, 0.165, 0.05];

/**
 * Fill the vertex colours an ammunition-material mesh draws with: the can's national drab, or the rounds' brass.
 * Any other material keeps a neutral white (the camouflage and weapon-steel paths read white as "no tint").
 */
export function paintAmmoVertexColours(geometry: THREE.BufferGeometry, material: THREE.Material, cartridge: boolean): void {
  const drab = material.userData?.ammoDrabLinear as [number, number, number] | undefined;
  const rgb = !drab ? [1, 1, 1] : cartridge ? CARTRIDGE_BRASS_LINEAR : drab;
  const count = geometry.getAttribute('position').count;
  const colour = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colour.set(rgb, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
}

/**
 * Project the weapon-finish grain and bake the edge wear on a weapon geometry, in place. The positions never change
 * (the asset and ledger fingerprints hash them), so an indexed geometry keeps its index and takes the grain without the
 * baked wear (the wear needs one triangle per three vertices; every merged weapon geometry already has that layout).
 */
export function prepareWeaponFinishGeometry(geometry: THREE.BufferGeometry,
  boxUV: (geometry: THREE.BufferGeometry, scale: number) => THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  boxUV(geometry, WEAPON_STEEL_UV_REPEATS_PER_M);
  if (!geometry.index) bakeWeaponEdgeWear(geometry);
  return geometry;
}

// ---- main autocannon barrels ----------------------------------------------------------------------------------------
/**
 * Main autocannons whose real barrel is bare parkerized steel rather than painted with the vehicle: the M242
 * Bushmaster family (the Bradley's and the Linebacker's 25 mm barrel is issued black and stays unpainted in the field).
 * Every other IFV autocannon in the fleet (the 2A42/2A72 on the BMPs, the CV90's Bofors, Puma's MK30-2, the Warrior's
 * Rarden, the Lynx, Type 89, K21 and Dardo guns) is painted with its vehicle and keeps the camouflaged barrel bucket.
 * One table: change a barrel's finish here, never with an id literal elsewhere.
 */
const WEAPON_STEEL_MAIN_BARRELS: ReadonlySet<string> = new Set(['m2a2_bradley', 'm3a3_bradley', 'ua_m2a3_bradley', 'm6_linebacker']);
export function mainBarrelIsWeaponSteel(specId: string): boolean { return WEAPON_STEEL_MAIN_BARRELS.has(specId); }

// ---- exact-weapon link -----------------------------------------------------------------------------------------------
// One rendered material set links its hardware gunmetal to its weapon steel and its fitting paint to its camouflage
// paint, so an exact (source-measured) weapon can take the finish without a material bag (kit.ts markExact). A WeakMap,
// never userData: Material.clone() deep-copies userData through JSON.
const WEAPON_FINISH_LINKS = new WeakMap<THREE.Material, THREE.Material>();
export function linkWeaponFinish(from: THREE.Material, to: THREE.Material): void { WEAPON_FINISH_LINKS.set(from, to); }
export function weaponFinishFor(material: THREE.Material | null | undefined): THREE.Material | undefined {
  return material ? WEAPON_FINISH_LINKS.get(material) : undefined;
}
