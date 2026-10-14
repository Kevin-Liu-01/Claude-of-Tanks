// src/world/maps/clutterKit.ts — the containers, crates, barrels and yard clutter of each place and period (props lane
// A, family #2, 2026-10-14; the owner: "update all our buildings from before which had this flat ugly looking format of
// low detail ... make sure you touch all props and buildings and objects"; WORKLIST.md #2).
//
// props.ts resolves each clutter kind through `clutterTypes(mapId, mobile)` (LOCAL_TYPES, after the period forms): the
// kind's name, record, placement and pool are unchanged; its build is the map's own form. Every form spends exactly the
// draws its legacy builder spent from the shared destructible stream (the legacy builder runs first and is disposed,
// as the fort, gate and well kinds do), so every later pool keeps its geometry.
//
// The distance form (the coordinator's ruling (A), 2026-10-14): a kind's pool geometry carries its near form (tagged
// aClutterLod = 1) and its far form (2); the baked material's vertex hook (clutterLodHook, chained into its existing
// weathering hook: no new program) folds the near form's vertices to the instance's origin beyond CLUTTER_NEAR_M and the
// far form's within it, so one pool and one draw a kind draw ~300 triangles close and ≤ 60 far. Geometry without the tag
// reads 0 (material.defaultAttributeValues) and is never folded. Only kinds that cast no dynamic shadow take a distance
// form (destructibleRenderPolicy: under 1.15 m and 1 m reach, no collider), so the shadow pass never draws them.
import * as THREE from 'three';
import { DESTRUCTIBLE_TYPES, type DestructiblePropType } from './inhabitKit.ts';
import { hexLin, type Rgb } from './craftMesh.ts';
import {
  caskBroken, caskFar, caskNear, crateBroken, crateFar, crateNear, drumFar, drumNear, palletBroken, palletFar, palletNear,
  vesselBroken, vesselFar, vesselNear, woodpileBroken, woodpileFar, woodpileNear, type PalletForm, type VesselForm, type WoodpileForm,
} from './clutterForms.ts';

/** The vertex attribute that tags a clutter pool's near (1) and far (2) form; untagged geometry reads 0. */
export const CLUTTER_LOD_ATTRIBUTE = 'aClutterLod';
/** The distance (m, in plan from the camera to the instance's origin) past which a clutter instance draws its far form. */
export const CLUTTER_NEAR_M = 45;
/** The program key suffix of a material that runs the hook (props.ts customProgramCacheKey). */
export const CLUTTER_LOD_KEY = '-clod1';

/** The material hook (chained after the props' weathering hook on the baked material). */
export function clutterLodHook(shader: { vertexShader: string }): void {
  const common = '#include <common>', begin = '#include <begin_vertex>';
  if (!shader.vertexShader.includes(common) || !shader.vertexShader.includes(begin)) {
    throw new Error('clutterKit: the baked vertex shader lost its common or begin_vertex chunk');
  }
  shader.vertexShader = shader.vertexShader
    .replace(common, `${common}\nattribute float ${CLUTTER_LOD_ATTRIBUTE};`)
    .replace(begin, /* glsl */`${begin}
{
  // (clutterKit.ts) a clutter pool's near form folds away past CLUTTER_NEAR_M, its far form within it
  if (${CLUTTER_LOD_ATTRIBUTE} > 0.5) {
    vec4 cotClutterAt = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
    cotClutterAt = instanceMatrix * cotClutterAt;
    #endif
    cotClutterAt = modelMatrix * cotClutterAt;
    vec2 cotClutterD = cotClutterAt.xz - cameraPosition.xz;
    bool cotClutterFar = dot(cotClutterD, cotClutterD) > ${(CLUTTER_NEAR_M * CLUTTER_NEAR_M).toFixed(1)};
    if ((${CLUTTER_LOD_ATTRIBUTE} < 1.5) == cotClutterFar) transformed = vec3(0.0);
  }
}`);
}

/** The default the hooked material reads for geometry without the tag (three's WebGLBindingStates). */
export function clutterLodDefaults(material: THREE.Material): void {
  const m = material as THREE.Material & { defaultAttributeValues?: Record<string, number[]> };
  m.defaultAttributeValues = { ...(m.defaultAttributeValues ?? {}), [CLUTTER_LOD_ATTRIBUTE]: [0] };
}

/** One pool geometry from a near and a far form (both non-indexed after merge), each tagged. */
export function withDistanceForms(near: THREE.BufferGeometry, far: THREE.BufferGeometry): THREE.BufferGeometry {
  const parts = [near, far].map((g, i) => {
    const flat = g.index ? g.toNonIndexed() : g;
    const n = flat.getAttribute('position').count;
    flat.setAttribute(CLUTTER_LOD_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(n).fill(i + 1), 1));
    return flat;
  });
  const names = ['position', 'normal', 'uv', 'color', CLUTTER_LOD_ATTRIBUTE];
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const list = parts.map((g) => g.getAttribute(name) as THREE.BufferAttribute | undefined);
    if (list.some((a) => !a)) continue;
    const size = list[0]!.itemSize, total = list.reduce((s, a) => s + a!.count, 0);
    const array = new Float32Array(total * size);
    let at = 0;
    for (const a of list) { array.set(a!.array as Float32Array, at); at += a!.count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  for (const g of [...parts, near, far]) if (g !== out) g.dispose();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------------------------------------------- the forms by map

type Hex = number;
/** A drum's paint by map (sRGB hex): shell, hoops and chimes, head, the band where it has one; its rust 0..1. */
interface DrumSpec { form: string; shell: Hex; hoop: Hex; head: Hex; band?: Hex; rust: number }
const DRUM_WW2_DE: DrumSpec = { form: 'kraftstoff-200l', shell: 0x4f5442, hoop: 0x3f4336, head: 0x4b5040, band: 0xc9c5b6, rust: 0.35 };
const DRUM_WW2_US: DrumSpec = { form: 'us-55gal-od', shell: 0x5a5a3c, hoop: 0x47472f, head: 0x57573a, band: 0xc9b24a, rust: 0.3 };
const DRUM_WW2_SU: DrumSpec = { form: 'soviet-200l', shell: 0x46503c, hoop: 0x383f30, head: 0x434c39, rust: 0.4 };
/** Every map's drum: its period's and its place's (the setting year, periodClutterKit MAP_SETTING_YEAR). */
export const DRUM_FORMS: Readonly<Record<string, DrumSpec>> = Object.freeze({
  blackglass: { form: 'asphalt-1937', shell: 0x262624, hoop: 0x1c1c1a, head: 0x2a2a28, band: 0x8a8070, rust: 0.45 },
  fjord: DRUM_WW2_DE, winter: DRUM_WW2_DE, foundry: DRUM_WW2_DE, alpine: DRUM_WW2_DE, reservoir: DRUM_WW2_US,
  autumn: DRUM_WW2_US, polders: DRUM_WW2_US, longleaf: DRUM_WW2_US, monsoon: { ...DRUM_WW2_US, form: 'uk-40gal', band: 0x9a2e26 },
  verdant: DRUM_WW2_SU, steppe: { ...DRUM_WW2_SU, form: 'soviet-200l-1958', shell: 0x5d6a52, rust: 0.25 },
  railyard: { form: 'aral-1962', shell: 0x2f5c9a, hoop: 0x24467a, head: 0xd8d4c8, band: 0xd8d4c8, rust: 0.3 },
  skybridge: { form: 'texaco-1965', shell: 0xb8322a, hoop: 0x8a2a24, head: 0xc9c6bd, band: 0xe8e2d0, rust: 0.2 },
  titan_gorge: { form: 'chevron-1965', shell: 0x2d4f8a, hoop: 0x223d6a, head: 0xc9c6bd, band: 0xc8b04a, rust: 0.3 },
  cliffbridge: { form: 'campsa-1972', shell: 0xb0352a, hoop: 0x84281f, head: 0xd2c070, band: 0xd8b84a, rust: 0.3 },
  moon: { form: 'nasa-canister', shell: 0xdedcd6, hoop: 0x9a9a96, head: 0xe6e4de, band: 0xd8702a, rust: 0 },
  copper_mesa: { form: 'ampol-1976', shell: 0x2f5a3c, hoop: 0x24462f, head: 0xc8c4b8, band: 0xc84a2a, rust: 0.45 },
  orchard: { form: 'levant-1982', shell: 0x3d5f7a, hoop: 0x2f4a60, head: 0x9a9a92, rust: 0.4 },
  urban: { form: 'bp-1984', shell: 0x2f6b3c, hoop: 0x24532f, head: 0xd6c84a, band: 0xd6c84a, rust: 0.25 },
  frontier: { form: 'esso-1984', shell: 0xd8d6d0, hoop: 0x2a3f7a, head: 0xb8322a, band: 0x2a3f7a, rust: 0.2 },
  desert: { form: 'agil-1985', shell: 0x7a7a74, hoop: 0x5a5a56, head: 0x8a8a84, band: 0xc84a2a, rust: 0.5 },
  whiteout: { form: 'usaf-1985', shell: 0x5a5d3e, hoop: 0x45482f, head: 0x5a5d3e, band: 0xc9b24a, rust: 0.2 },
  ruinspires: { form: 'scrap-1992', shell: 0x6a6658, hoop: 0x4c4a40, head: 0x6e6a5c, rust: 0.7 },
  saltwind: { form: 'ina-1992', shell: 0x2d5f8a, hoop: 0x224a6a, head: 0xd8d4c8, band: 0xd8d4c8, rust: 0.35 },
  badlands: { form: 'chemical-blue', shell: 0x2d5ea8, hoop: 0x224a86, head: 0x2d5ea8, rust: 0.15 },
  oasis: { form: 'chemical-blue', shell: 0x2a62a0, hoop: 0x214f84, head: 0x2a62a0, rust: 0.1 },
  delta: { form: 'scrap-2010', shell: 0x5f5a50, hoop: 0x48443c, head: 0x6a645a, rust: 0.75 },
  mangrove: { form: 'chemical-blue', shell: 0x2d5ea8, hoop: 0x224a86, head: 0x2d5ea8, rust: 0.35 },
  caldera: { form: 'jis-2015', shell: 0x3d6a8a, hoop: 0x2f526a, head: 0xd0ccc0, band: 0xd0ccc0, rust: 0.2 },
  airfield: { form: 'ukraine-2022', shell: 0x3f5a3a, hoop: 0x30452c, head: 0x3f5a3a, rust: 0.35 },
  coastal: { form: 'total-2024', shell: 0xd6d4ce, hoop: 0xb8322a, head: 0x2a4f8a, band: 0xd8702a, rust: 0.15 },
  mars: { form: 'store-canister-2100', shell: 0xe1e3e5, hoop: 0x9ea4aa, head: 0xe1e3e5, band: 0xd97d2e, rust: 0 },
});

/** A cask's woods by map (sRGB hex) and its make. */
interface CaskSpec { form: string; wood: Hex; hoop: Hex; head: Hex; staves: number; hoops: number; bilge: number; height: number; radius: number; tar?: boolean }
const OAK: CaskSpec = { form: 'oak-cask', wood: 0x7a5638, hoop: 0x2f2f2d, head: 0x8a6a48, staves: 9, hoops: 4, bilge: 0.05, height: 0.95, radius: 0.27 };
const WINE: CaskSpec = { ...OAK, form: 'wine-cask', wood: 0x8a5e3c, head: 0x9a7452, bilge: 0.06, height: 0.92 };
const TAR: CaskSpec = { form: 'tar-barrel', wood: 0x5a4430, hoop: 0x2a2724, head: 0x3a2e24, staves: 9, hoops: 3, bilge: 0.035, height: 0.82, radius: 0.24, tar: true };
const WHISKEY: CaskSpec = { ...OAK, form: 'white-oak-barrel', wood: 0x6e5034, head: 0x7a5a3e, bilge: 0.045, height: 0.88, radius: 0.28 };
export const CASK_FORMS: Readonly<Record<string, CaskSpec>> = Object.freeze({
  autumn: { ...WINE, form: 'calvados-cask' }, cliffbridge: WINE, saltwind: WINE, orchard: { ...WINE, form: 'arak-cask', wood: 0x7e5a3a },
  fjord: TAR, coastal: TAR, polders: { ...TAR, form: 'herring-barrel', wood: 0x6a5238, tar: false },
  caldera: { form: 'taru', wood: 0x9a7a52, hoop: 0x6a6a3a, head: 0xa88a5e, staves: 9, hoops: 3, bilge: 0.0, height: 0.62, radius: 0.3 },
  longleaf: WHISKEY, titan_gorge: WHISKEY, skybridge: WHISKEY, copper_mesa: WHISKEY,
  verdant: { ...OAK, form: 'bochka', wood: 0x6a5238 }, steppe: { ...OAK, form: 'bochka', wood: 0x6e5a40 }, winter: { ...OAK, form: 'beczka', wood: 0x705438 },
  railyard: OAK, foundry: OAK, urban: OAK, frontier: OAK, reservoir: OAK, alpine: { ...OAK, form: 'larch-cask', wood: 0x8a6440 }, ruinspires: OAK,
  blackglass: { ...OAK, form: 'soy-cask', wood: 0x5a4632, hoops: 3, bilge: 0.02 }, monsoon: { ...OAK, form: 'rum-cask' },
  whiteout: WHISKEY, airfield: OAK,
});

/** Where the barrel is no cask: a turned vessel (sRGB hex) — the Saharan zir, the blue HDPE drum of the 2000s, the
 *  glazed martaban jars of the Mekong and the Jamuna, the store canisters of the stations off the Earth. */
interface VesselSpec { form: string; kind: VesselForm['kind']; body: Hex; trim: Hex; band?: Hex; height: number; radius: number }
const HDPE: VesselSpec = { form: 'hdpe-220l', kind: 'hdpe', body: 0x2a62a0, trim: 0x214f84, height: 0.93, radius: 0.29 };
const JAR: VesselSpec = { form: 'martaban-jar', kind: 'jar', body: 0x5a3a24, trim: 0x3a2a1e, band: 0x7a5a30, height: 0.8, radius: 0.3 };
export const VESSEL_FORMS: Readonly<Record<string, VesselSpec>> = Object.freeze({
  desert: { form: 'zir', kind: 'khabia', body: 0xb0704a, trim: 0x8a5a3a, height: 0.9, radius: 0.32 },
  oasis: HDPE, badlands: { ...HDPE, body: 0x2d5ea8, trim: 0x224a86 },
  delta: JAR, mangrove: { ...JAR, body: 0x6a4a2a, band: 0x8a6a3a },
  moon: { form: 'apollo-canister', kind: 'canister', body: 0xdedcd6, trim: 0x9a9a96, band: 0xd8702a, height: 0.9, radius: 0.28 },
  mars: { form: 'store-canister-2100', kind: 'canister', body: 0xe1e3e5, trim: 0x9ea4aa, band: 0xd97d2e, height: 0.9, radius: 0.28 },
});

/** A woodpile's make and its woods by map (sRGB hex): the birch polennitsa of the Russian, Polish and Ukrainian villages,
 *  the spruce lean-to stacks and holzhausen of the Alps and the North, the oak and pine ricks of the West, the
 *  brushwood bundles of the dry lands and the paddies, the dung stacks of the Bengal chars. */
interface WoodSpec { form: string; kind: WoodpileForm['kind']; bark: Hex; split: Hex; end: Hex; length: number; height: number; depth: number }
const BIRCH = { bark: 0xcfc8b8, split: 0xd2b488, end: 0xdcc08c };
const SPRUCE = { bark: 0x5a4636, split: 0xd0b080, end: 0xdcc08c };
const OAK_WOOD = { bark: 0x5a5248, split: 0xb89a70, end: 0xc4a478 };
const PINE = { bark: 0x6a4a36, split: 0xc8a474, end: 0xd6b47e };
const BRUSH = { bark: 0x6a5a40, split: 0x8a7650, end: 0xb8a070 };
const POLENNITSA: WoodSpec = { form: 'polennitsa', kind: 'polennitsa', ...BIRCH, length: 1.62, height: 0.92, depth: 1.0 };
const RICK: WoodSpec = { form: 'rick', kind: 'rick', ...OAK_WOOD, length: 1.6, height: 0.92, depth: 1.0 };
const LEANTO: WoodSpec = { form: 'lean-to', kind: 'leanto', ...SPRUCE, length: 1.56, height: 0.86, depth: 1.0 };
const ROUND: WoodSpec = { form: 'holzhausen', kind: 'holzhausen', ...SPRUCE, length: 1.3, height: 0.95, depth: 1.3 };
const BUNDLES: WoodSpec = { form: 'brushwood', kind: 'bundles', ...BRUSH, length: 1.5, height: 0.62, depth: 1.0 };
export const WOOD_FORMS: Readonly<Record<string, WoodSpec>> = Object.freeze({
  verdant: POLENNITSA, steppe: POLENNITSA, winter: POLENNITSA, airfield: POLENNITSA,
  fjord: ROUND, frontier: { ...ROUND, ...PINE }, alpine: LEANTO, foundry: LEANTO, railyard: LEANTO, urban: LEANTO,
  caldera: { ...LEANTO, form: 'makiba', bark: 0x6a4a3a, split: 0xc8a070 },
  longleaf: { ...RICK, form: 'cordwood', ...PINE }, titan_gorge: { ...RICK, form: 'juniper-rick', bark: 0x7a6a5a, split: 0xc0a080, end: 0xd0b48a },
  skybridge: { ...RICK, form: 'cordwood', ...PINE }, copper_mesa: { ...RICK, form: 'gum-rick', bark: 0x8a7a68, split: 0xb88a60, end: 0xc89a6a },
  whiteout: { ...RICK, form: 'lumber-rick', ...PINE }, autumn: { ...RICK, form: 'stere' }, coastal: { ...RICK, form: 'stere' },
  polders: { ...RICK, form: 'rick', ...PINE }, reservoir: RICK, cliffbridge: { ...RICK, form: 'olive-rick', bark: 0x6a6458, split: 0xc0a07a },
  saltwind: { ...RICK, form: 'olive-rick', bark: 0x6a6458, split: 0xc0a07a }, ruinspires: RICK,
  desert: { ...BUNDLES, form: 'tamarisk', bark: 0x7a6650 }, oasis: { ...BUNDLES, form: 'palm-rib', bark: 0x8a7458, end: 0xa89060 },
  badlands: { ...BUNDLES, form: 'tamarisk', bark: 0x7a6650 }, orchard: { ...BUNDLES, form: 'prunings', bark: 0x6a6450 },
  blackglass: BUNDLES, monsoon: BUNDLES, mangrove: { ...BUNDLES, form: 'mangrove-wood', bark: 0x5a4a3a },
  delta: { form: 'dung-cakes', kind: 'dung', bark: 0x5a4430, split: 0x6a5038, end: 0x7a6044, length: 1.2, height: 0.8, depth: 1.2 },
});

/** A pallet's make by map: the EUR/EPAL (1961) on Europe's later maps, the American GMA stringer pallet, the rough
 *  plank skid of the 1940s and the Russian yards, the bamboo skid of the paddy and the Yangtze. */
interface PalletSpec { form: string; kind: PalletForm['kind']; wood: Hex; dark: Hex; brand?: Hex }
const EUR: PalletSpec = { form: 'epal', kind: 'eur', wood: 0xc0a074, dark: 0x9a7c58, brand: 0x2a2a2a };
const GMA: PalletSpec = { form: 'gma', kind: 'gma', wood: 0xb89a6a, dark: 0x8a7050 };
const ROUGH: PalletSpec = { form: 'plank-skid', kind: 'rough', wood: 0x9a8058, dark: 0x6a5640 };
const BAMBOO: PalletSpec = { form: 'bamboo-skid', kind: 'bamboo', wood: 0xc8b070, dark: 0x9a8450 };
export const PALLET_FORMS: Readonly<Record<string, PalletSpec>> = Object.freeze({
  railyard: EUR, cliffbridge: EUR, frontier: EUR, urban: EUR, ruinspires: { ...EUR, wood: 0xa88a62 }, saltwind: EUR, coastal: EUR,
  airfield: EUR, orchard: EUR, desert: { ...EUR, wood: 0xb8946a }, oasis: { ...EUR, wood: 0xb8946a }, badlands: EUR,
  longleaf: GMA, skybridge: GMA, titan_gorge: GMA, whiteout: GMA, copper_mesa: GMA, reservoir: GMA, autumn: GMA, polders: GMA,
  moon: { form: 'aluminium-skid', kind: 'gma', wood: 0xc8c8c4, dark: 0x9a9a96 }, mars: { form: 'composite-skid', kind: 'gma', wood: 0xd8d6d0, dark: 0x9ea4aa },
  steppe: ROUGH, winter: ROUGH, fjord: ROUGH, verdant: ROUGH, foundry: ROUGH, alpine: ROUGH,
  blackglass: BAMBOO, delta: BAMBOO, mangrove: BAMBOO, monsoon: BAMBOO, caldera: BAMBOO,
});

/**
 * The kinds a map draws in their lean form (≤ 120 triangles, no distance form) to keep its clutter within +45k
 * triangles of the legacy (the runtime census's instances; clutterKit.selftest pins it): Cape Dyer's 500 drums stand in
 * its caches' rows, where only the tops and the outer ring show.
 */
export const CLUTTER_LEAN: Readonly<Record<string, readonly string[]>> = Object.freeze({ whiteout: ['drum'] });

/** A crate's make by map. */
interface CrateSpec { form: string; w: number; h: number; d: number; boards: number; gap: number; wood: Hex; frame: Hex; inside: Hex;
  kind: 'posts' | 'battens' | 'slats' | 'chest'; handles?: boolean; strap?: Hex; stencil?: Hex }
// (each crate keeps the kind's footprint: its record is the legacy 0.92 m crate's, so a hull meets what it sees)
const AMMO_DE: CrateSpec = { form: 'wehrmacht-ammo', w: 0.92, h: 0.56, d: 0.86, boards: 2, gap: 0.006, wood: 0x5f6146, frame: 0x52543c, inside: 0x15130f, kind: 'battens', handles: true, stencil: 0xd8d2b8 };
const AMMO_US: CrateSpec = { ...AMMO_DE, form: 'us-ammo', wood: 0x6a6a44, frame: 0x5a5a3a, stencil: 0xd8c84a };
const AMMO_SU: CrateSpec = { ...AMMO_DE, form: 'soviet-ammo', h: 0.6, wood: 0x6a6448, frame: 0x5a5440, stencil: 0x2a2a26 };
const SUPPLY: CrateSpec = { form: 'plank-crate', w: 0.92, h: 0.82, d: 0.86, boards: 4, gap: 0.012, wood: 0x9a7f5c, frame: 0x7d6448, inside: 0x1a150f, kind: 'posts', stencil: 0x2a2a2a };
const FRUIT: CrateSpec = { form: 'fruit-bin', w: 0.92, h: 0.62, d: 0.86, boards: 4, gap: 0.03, wood: 0xb0946a, frame: 0x8e7452, inside: 0x2a2018, kind: 'slats' };
const TEA: CrateSpec = { form: 'tea-chest', w: 0.8, h: 0.8, d: 0.8, boards: 2, gap: 0.003, wood: 0xb08a5c, frame: 0x8a6a46, inside: 0x1a140e, kind: 'chest', strap: 0x9a9a92, stencil: 0x3a2a1e };
const PLASTIC: CrateSpec = { form: 'plastic-box', w: 0.92, h: 0.66, d: 0.86, boards: 4, gap: 0.03, wood: 0xc23a2a, frame: 0xa83224, inside: 0x3a1410, kind: 'slats' };
export const CRATE_FORMS: Readonly<Record<string, CrateSpec>> = Object.freeze({
  fjord: AMMO_DE, winter: AMMO_SU, foundry: AMMO_DE, alpine: AMMO_DE, reservoir: AMMO_US, autumn: AMMO_US, polders: AMMO_US,
  longleaf: AMMO_US, monsoon: TEA, verdant: AMMO_SU, blackglass: { ...SUPPLY, form: 'shanghai-crate', wood: 0x8a7050 },
  steppe: SUPPLY, railyard: SUPPLY, skybridge: SUPPLY, titan_gorge: SUPPLY, copper_mesa: SUPPLY, urban: SUPPLY, frontier: { ...SUPPLY, form: 'bundeswehr-crate', wood: 0x6a6a4a },
  desert: SUPPLY, whiteout: { ...SUPPLY, form: 'usaf-crate', wood: 0x6a6a46 }, ruinspires: SUPPLY, moon: { ...SUPPLY, form: 'lunar-crate', wood: 0xc8c8c4 },
  orchard: FRUIT, saltwind: FRUIT, cliffbridge: FRUIT, oasis: { ...FRUIT, form: 'date-crate' },
  delta: TEA, mangrove: PLASTIC, badlands: PLASTIC, caldera: { ...PLASTIC, form: 'plastic-crate-jp', wood: 0x3a6a9a, frame: 0x2f5480, inside: 0x101a26 },
  airfield: { ...AMMO_SU, form: 'ukraine-ammo', wood: 0x4f5a3a }, coastal: { ...PLASTIC, form: 'fish-crate', wood: 0x2a6a9a, frame: 0x235a82, inside: 0x0e1a24 },
  mars: { ...SUPPLY, form: 'cargo-box-2100', wood: 0xc8c8c4, frame: 0x9ea4aa, inside: 0x20242a },
});

// ---------------------------------------------------------------------------------------------------- the pool entries

/** A per-kind stream, named by the map and the kind (a form never draws from the shared destructible stream). */
function kindStream(mapId: string, kind: string): () => number {
  let h = 0x811c9dc5;
  for (const ch of `${mapId}:${kind}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  let a = h | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lin = (hex: Hex): Rgb => hexLin(hex);

/** A kind's entry: the legacy builders run first (their draws), then the map's form near and far in one pool. */
function entry(kind: keyof typeof DESTRUCTIBLE_TYPES, mapId: string, mat: DestructiblePropType['mat'],
  near: (rng: () => number) => THREE.BufferGeometry, far: (() => THREE.BufferGeometry) | null,
  broken: ((rng: () => number) => THREE.BufferGeometry) | null): DestructiblePropType {
  const base = DESTRUCTIBLE_TYPES[kind] as DestructiblePropType;
  return {
    ...base, mat,
    build: (rng) => {
      base.build(rng).dispose();
      const n = near(kindStream(mapId, kind));
      return far ? withDistanceForms(n, far()) : n;
    },
    broken: base.broken && broken ? (rng) => { base.broken!(rng).dispose(); return broken(kindStream(mapId, `${kind}:broken`)); } : base.broken,
    ...(broken ? { ownBroken: true } : {}),
  };
}

/** The forms a map's clutter takes (null: the kind's legacy form there). */
export function clutterFormOf(kind: string, mapId: string): string | null {
  if (kind === 'drum') return DRUM_FORMS[mapId]?.form ?? null;
  if (kind === 'barrel') return CASK_FORMS[mapId]?.form ?? VESSEL_FORMS[mapId]?.form ?? null;
  if (kind === 'crate') return CRATE_FORMS[mapId]?.form ?? null;
  if (kind === 'firewood') return WOOD_FORMS[mapId]?.form ?? null;
  if (kind === 'pallet') return PALLET_FORMS[mapId]?.form ?? null;
  return null;
}

/** The clutter kinds' forms on a map, over the inhabit kit's records (props.ts LOCAL_TYPES). */
export function clutterTypes(mapId: string, _mobile: boolean): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  const drum = DRUM_FORMS[mapId];
  if (drum) {
    const paint = { shell: lin(drum.shell), hoop: lin(drum.hoop), head: lin(drum.head), band: drum.band ? lin(drum.band) : undefined, rust: drum.rust };
    const lean = CLUTTER_LEAN[mapId]?.includes('drum') ?? false;
    out.drum = entry('drum', mapId, 'baked', (rng) => drumNear(paint, rng, lean), lean ? null : () => drumFar(paint), null);
  }
  const cask = CASK_FORMS[mapId], vessel = VESSEL_FORMS[mapId];
  if (cask) {
    const f = { ...cask, wood: lin(cask.wood), hoop: lin(cask.hoop), head: lin(cask.head) };
    out.barrel = entry('barrel', mapId, 'baked', (rng) => caskNear(f, rng), () => caskFar(f), (rng) => caskBroken(f, rng));
  } else if (vessel) {
    const f: VesselForm = { kind: vessel.kind, body: lin(vessel.body), trim: lin(vessel.trim), band: vessel.band ? lin(vessel.band) : undefined,
      height: vessel.height, radius: vessel.radius };
    out.barrel = entry('barrel', mapId, 'baked', (rng) => vesselNear(f, rng), () => vesselFar(f), (rng) => vesselBroken(f, rng));
  }
  const wood = WOOD_FORMS[mapId];
  if (wood) {
    const f: WoodpileForm = { kind: wood.kind, bark: lin(wood.bark), split: lin(wood.split), end: lin(wood.end), length: wood.length, height: wood.height, depth: wood.depth };
    out.firewood = entry('firewood', mapId, 'baked', (rng) => woodpileNear(f, rng), () => woodpileFar(f), (rng) => woodpileBroken(f, rng));
  }
  const pallet = PALLET_FORMS[mapId];
  if (pallet) {
    const f: PalletForm = { kind: pallet.kind, wood: lin(pallet.wood), dark: lin(pallet.dark), brand: pallet.brand ? lin(pallet.brand) : undefined };
    out.pallet = entry('pallet', mapId, 'baked', (rng) => palletNear(f, rng), () => palletFar(f), (rng) => palletBroken(f, rng));
  }
  const crate = CRATE_FORMS[mapId];
  if (crate) {
    const f = { ...crate, wood: lin(crate.wood), frame: lin(crate.frame), inside: lin(crate.inside), strap: crate.strap ? lin(crate.strap) : undefined,
      stencil: crate.stencil ? lin(crate.stencil) : undefined };
    out.crate = entry('crate', mapId, 'baked', (rng) => crateNear(f, rng), () => crateFar(f), (rng) => crateBroken(f, rng));
  }
  return out;
}
