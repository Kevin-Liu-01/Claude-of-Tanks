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
  vesselBroken, vesselFar, vesselNear, woodpileBroken, woodpileFar, woodpileNear, type CrateForm, type PalletForm, type VesselForm, type WoodpileForm,
} from './clutterForms.ts';
import {
  bottleFar, bottleNear, bucketFar, bucketNear, canFar, canNear, churnFar, churnNear, laundryBroken, laundryNear, potBroken, potFar, potNear,
  redDrumBroken, spoolBroken, spoolNear, wheelFar, wheelNear, type BottleForm, type BucketForm, type CanForm, type ChurnForm, type LaundryForm,
  type PotForm, type SpoolForm, type WheelForm,
} from './clutterLooseForms.ts';
import { MAP_SETTING_YEAR, periodClutterTypes } from './periodClutterKit.ts';

/** The vertex attribute that tags a clutter pool's near (1) and far (2) form, and a lean form drawn at every distance (3);
 *  untagged geometry reads 0. */
export const CLUTTER_LOD_ATTRIBUTE = 'aClutterLod';
/** The distance (m, in plan from the camera to the instance's origin) past which a clutter instance draws its far form. */
export const CLUTTER_NEAR_M = 45;
/** The program key suffix of a material that runs the hook (props.ts customProgramCacheKey). */
export const CLUTTER_LOD_KEY = '-clod1';

/** The material hook (chained after the props' weathering hook on the baked material). */
export function clutterLodHook(shader: { vertexShader: string }): void {
  const common = '#include <common>', begin = '#include <begin_vertex>', colour = '#include <color_vertex>';
  if (!shader.vertexShader.includes(common) || !shader.vertexShader.includes(begin) || !shader.vertexShader.includes(colour)) {
    throw new Error('clutterKit: the baked vertex shader lost its common, color_vertex or begin_vertex chunk');
  }
  shader.vertexShader = shader.vertexShader
    .replace(common, `${common}\nattribute float ${CLUTTER_LOD_ATTRIBUTE};`)
    .replace(colour, /* glsl */`${colour}
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
{
  // (clutterKit.ts) each clutter instance a tone of its own (a stack of drums or casks never one colour): its shade and
  // warmth from a hash of where it stands
  if (${CLUTTER_LOD_ATTRIBUTE} > 0.5) {
    vec4 cotTintAt = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
    cotTintAt = instanceMatrix * cotTintAt;
    #endif
    vec2 cotTintCell = floor(cotTintAt.xz * 4.0);
    float cotTintA = fract(sin(dot(cotTintCell, vec2(12.9898, 78.233))) * 43758.5453);
    float cotTintB = fract(sin(dot(cotTintCell, vec2(39.3468, 11.1351))) * 24634.6345);
    vColor.rgb *= (0.9 + 0.2 * cotTintA) * vec3(1.0 + (cotTintB - 0.5) * 0.06, 1.0, 1.0 - (cotTintB - 0.5) * 0.08);
  }
}
#endif`)
    .replace(begin, /* glsl */`${begin}
{
  // (clutterKit.ts) a clutter pool's near form folds away past CLUTTER_NEAR_M, its far form within it (a lean form never)
  if (${CLUTTER_LOD_ATTRIBUTE} > 0.5 && ${CLUTTER_LOD_ATTRIBUTE} < 2.5) {
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

/** A lean form's pool geometry: drawn at every distance, its instances toned (tagged 3). */
export function leanForm(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  flat.setAttribute(CLUTTER_LOD_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(flat.getAttribute('position').count).fill(3), 1));
  if (flat !== g) g.dispose();
  return flat;
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

// ---------------------------------------------------------------------------------------------------- the loose kinds

/** Each map's jerrycan (sRGB hex): the Wehrmacht pattern and its US and UK copies in the war, the NATO and civilian
 *  steel cans after it (red for petrol), moulded plastic from the 2000s, Shanghai's square kerosene tin, the stations'
 *  canisters. */
interface CanSpec { form: string; kind: CanForm['kind']; body: Hex; trim: Hex; label?: Hex }
const WEHR: CanSpec = { form: 'wehrmachtkanister', kind: 'steel', body: 0x5a5a48, trim: 0x44443a };
const WEHR_GELB: CanSpec = { ...WEHR, body: 0x8a7e56, trim: 0x6a6044 };
const US_CAN: CanSpec = { form: 'us-jerrycan', kind: 'steel', body: 0x4f5338, trim: 0x3e422c };
const NATO_CAN: CanSpec = { form: 'nato-jerrycan', kind: 'steel', body: 0x4a5038, trim: 0x383d2a };
const RED_CAN: CanSpec = { form: 'petrol-can', kind: 'steel', body: 0x9a2a20, trim: 0x6a1e18 };
export const CAN_FORMS: Readonly<Record<string, CanSpec>> = Object.freeze({
  fjord: { ...WEHR, body: 0x4a4c48 }, foundry: WEHR_GELB, alpine: WEHR_GELB, winter: WEHR_GELB, verdant: WEHR_GELB,
  reservoir: US_CAN, autumn: US_CAN, polders: US_CAN, longleaf: US_CAN, monsoon: { ...US_CAN, form: 'blitz-can', body: 0x5a5a40 },
  blackglass: { form: 'kerosene-tin', kind: 'tin', body: 0xa8a090, trim: 0x7a7468 },
  steppe: { ...NATO_CAN, form: 'soviet-kanistra', body: 0x4a5a3a }, railyard: RED_CAN, skybridge: RED_CAN, titan_gorge: US_CAN,
  cliffbridge: RED_CAN, copper_mesa: NATO_CAN, orchard: NATO_CAN, urban: RED_CAN, frontier: NATO_CAN, desert: { ...NATO_CAN, body: 0xa89060, trim: 0x7a6a48 },
  whiteout: US_CAN, ruinspires: NATO_CAN, saltwind: RED_CAN, airfield: { ...NATO_CAN, form: 'ukraine-kanistra', body: 0x4a5a3a },
  badlands: { form: 'water-can', kind: 'plastic', body: 0xd8d6d0, trim: 0x2a5aa0 }, oasis: { form: 'plastic-can', kind: 'plastic', body: 0xd8b020, trim: 0x202020 },
  delta: { form: 'plastic-can', kind: 'plastic', body: 0x2a5aa0, trim: 0xd8d6d0 }, mangrove: { form: 'plastic-can', kind: 'plastic', body: 0xd8b020, trim: 0x202020 },
  caldera: { form: 'poly-tank', kind: 'plastic', body: 0xb83028, trim: 0x2a4a8a }, coastal: { form: 'plastic-can', kind: 'plastic', body: 0xb0302a, trim: 0x202020 },
  moon: { form: 'apollo-canister', kind: 'canister', body: 0xdedcd6, trim: 0x9a9a96, label: 0xd8702a },
  mars: { form: 'store-canister', kind: 'canister', body: 0xe1e3e5, trim: 0x9ea4aa, label: 0xd97d2e },
});

/** Each map's bucket: the galvanised pail, the enamelled one of the Russian and Polish villages, the coopered pail of the
 *  North and of Shanghai, the tyre-rubber bucket of the dry lands, the plastic bucket of the modern maps. */
interface BucketSpec { form: string; kind: BucketForm['kind']; body: Hex; trim: Hex; inside: Hex }
const GALV: BucketSpec = { form: 'galvanised-pail', kind: 'galv', body: 0x9aa0a0, trim: 0x7a8080, inside: 0x4a4c4c };
const ENAMEL: BucketSpec = { form: 'enamel-pail', kind: 'enamel', body: 0xe0ded6, trim: 0x2a4a8a, inside: 0xd0cec6 };
const WOOD_PAIL: BucketSpec = { form: 'coopered-pail', kind: 'wood', body: 0x9a7a52, trim: 0x3a3632, inside: 0x3a2a1a };
const RUBBER: BucketSpec = { form: 'tyre-bucket', kind: 'rubber', body: 0x2a2a2a, trim: 0x1c1c1c, inside: 0x161616 };
const plasticPail = (body: Hex): BucketSpec => ({ form: 'plastic-bucket', kind: 'plastic', body, trim: body, inside: body });
export const BUCKET_FORMS: Readonly<Record<string, BucketSpec>> = Object.freeze({
  verdant: ENAMEL, steppe: ENAMEL, winter: ENAMEL, fjord: WOOD_PAIL, alpine: WOOD_PAIL, blackglass: { ...WOOD_PAIL, body: 0x8a6a42 },
  desert: RUBBER, oasis: RUBBER, badlands: RUBBER,
  delta: plasticPail(0x2a6aa8), mangrove: plasticPail(0xc83a2a), airfield: plasticPail(0x3a6a3a), coastal: plasticPail(0x2a5aa0),
  caldera: plasticPail(0x3a6a9a), moon: plasticPail(0xd8d6d0), mars: plasticPail(0xd8d6d0),
  foundry: GALV, reservoir: GALV, autumn: GALV, polders: GALV, longleaf: GALV, monsoon: GALV, railyard: GALV, skybridge: GALV,
  titan_gorge: GALV, cliffbridge: GALV, copper_mesa: GALV, orchard: GALV, urban: GALV, frontier: GALV, whiteout: GALV, ruinspires: GALV, saltwind: GALV,
});

/** Each map's gas bottle: the industrial oxygen or acetylene cylinder through the war (its country's colour), the
 *  domestic bottle after (the Soviet red, the Spanish butano orange, Butagaz's blue, the Japanese grey LPG bottle). */
interface BottleSpec { form: string; kind: BottleForm['kind']; body: Hex; collar: Hex; band?: Hex }
const OXY_DE: BottleSpec = { form: 'sauerstoff', kind: 'industrial', body: 0x2a4a8a, collar: 0x5a5a5a };
const OXY_US: BottleSpec = { form: 'oxygen-us', kind: 'industrial', body: 0x3a5a3a, collar: 0x5a5a5a };
const OXY_UK: BottleSpec = { form: 'oxygen-uk', kind: 'industrial', body: 0x262626, collar: 0x5a5a5a, band: 0xd8d8d0 };
const lpg = (body: Hex, form = 'lpg-bottle'): BottleSpec => ({ form, kind: 'domestic', body, collar: 0x8a8a86 });
export const BOTTLE_FORMS: Readonly<Record<string, BottleSpec>> = Object.freeze({
  fjord: OXY_DE, foundry: OXY_DE, alpine: OXY_DE, winter: OXY_DE, verdant: { ...OXY_DE, form: 'kislorod', body: 0x3a5a9a },
  reservoir: OXY_US, autumn: OXY_US, polders: OXY_US, longleaf: OXY_US, monsoon: OXY_UK, blackglass: OXY_UK,
  steppe: lpg(0xb8302a, 'propan'), railyard: lpg(0x8a8c8a), skybridge: lpg(0xc8c8c4), titan_gorge: lpg(0xc8c8c4), cliffbridge: lpg(0xe0702a, 'butano'),
  copper_mesa: lpg(0xc8c8c4), orchard: lpg(0x6a7a8a), urban: lpg(0x8a8c8a), frontier: lpg(0xa83a2a), desert: lpg(0x8a8a86),
  whiteout: { ...OXY_US, form: 'usaf-cylinder', body: 0xb8a030 }, ruinspires: lpg(0x5a6a7a), saltwind: lpg(0x6a7a8a), badlands: lpg(0x3a5a8a),
  oasis: lpg(0x3a5a8a), delta: lpg(0x2a6a4a), mangrove: lpg(0x2a4a8a), caldera: lpg(0xb0b0a8), airfield: lpg(0xb8302a, 'propan'), coastal: lpg(0x2a5aa0, 'butagaz'),
  moon: { form: 'oxygen-tank', kind: 'industrial', body: 0xdedcd6, collar: 0x9a9a96, band: 0xd8702a },
  mars: { form: 'oxygen-tank', kind: 'industrial', body: 0xe1e3e5, collar: 0x9ea4aa, band: 0xd97d2e },
});

/** Each map's churn: the galvanised milk churn of the West, the aluminium bidon of the East and the paddies, the American
 *  milk can, the stations' water cans. */
interface ChurnSpec { form: string; kind: ChurnForm['kind']; body: Hex; trim: Hex }
const CHURN: ChurnSpec = { form: 'milk-churn', kind: 'churn', body: 0xa0a4a4, trim: 0x808484 };
const BIDON: ChurnSpec = { form: 'bidon', kind: 'bidon', body: 0xc0c4c8, trim: 0x9aa0a4 };
const MILK_CAN: ChurnSpec = { form: 'milk-can', kind: 'can', body: 0xa8acac, trim: 0x84888a };
export const CHURN_FORMS: Readonly<Record<string, ChurnSpec>> = Object.freeze({
  verdant: BIDON, steppe: BIDON, winter: BIDON, blackglass: BIDON, monsoon: BIDON, delta: BIDON, mangrove: BIDON,
  longleaf: MILK_CAN, skybridge: MILK_CAN, titan_gorge: MILK_CAN,
  autumn: CHURN, polders: CHURN, reservoir: CHURN, alpine: CHURN, fjord: CHURN, frontier: CHURN, cliffbridge: CHURN, saltwind: CHURN,
  coastal: CHURN, ruinspires: CHURN, orchard: CHURN,
  moon: { form: 'water-can', kind: 'bidon', body: 0xdedcd6, trim: 0x9a9a96 }, mars: { form: 'water-can', kind: 'bidon', body: 0xe1e3e5, trim: 0x9ea4aa },
});

/** Each map's loose wheel: a cart's spoked wheel where carts still ran, a lorry's or a car's tyre on its steel wheel
 *  (painted the army's colour in the war), the lunar rover's wire-mesh wheel. */
interface WheelSpec { form: string; kind: WheelForm['kind']; rubber: Hex; rim: Hex; hub: Hex }
const CART: WheelSpec = { form: 'cart-wheel', kind: 'cart', rubber: 0x7a5a3a, rim: 0x3a3632, hub: 0x5a4430 };
const tyre = (rim: Hex): WheelSpec => ({ form: 'tyre-on-rim', kind: 'tyre', rubber: 0x262626, rim, hub: 0x3a3a36 });
export const WHEEL_FORMS: Readonly<Record<string, WheelSpec>> = Object.freeze({
  verdant: CART, winter: CART, steppe: CART, monsoon: CART, blackglass: CART, delta: CART, mangrove: CART,
  fjord: tyre(0x4a4c48), foundry: tyre(0x6a6a4a), alpine: tyre(0x6a6a4a), reservoir: tyre(0x4f5338), autumn: tyre(0x4f5338), polders: tyre(0x4f5338),
  longleaf: tyre(0x4f5338), railyard: tyre(0x7a7a76), skybridge: tyre(0x9a9a96), titan_gorge: tyre(0x9a9a96), cliffbridge: tyre(0x8a8a86),
  copper_mesa: tyre(0x8a8a86), orchard: tyre(0x7a7a76), urban: tyre(0x9a9a96), frontier: tyre(0x4a5038), desert: tyre(0xa89060), whiteout: tyre(0x4f5338),
  ruinspires: tyre(0x6a6a66), saltwind: tyre(0x8a8a86), badlands: tyre(0x8a8a86), oasis: tyre(0x9a9a96), caldera: tyre(0xa8a8a4), airfield: tyre(0x4a5a3a),
  coastal: tyre(0xa8a8a4), moon: { form: 'rover-wheel', kind: 'mesh', rubber: 0xa8a8a0, rim: 0x6a6a66, hub: 0x8a8a86 },
  mars: { form: 'rover-wheel', kind: 'mesh', rubber: 0xb8b4a8, rim: 0x7a7670, hub: 0x9a968e },
});

/** Each map's pot cluster: the Saharan zir, the Levant's and Dalmatia's storage jars, the Navajo olla, the Bengal matka. */
interface PotSpec { form: string; kind: PotForm['kind']; body: Hex; slip: Hex }
export const POT_FORMS: Readonly<Record<string, PotSpec>> = Object.freeze({
  desert: { form: 'zir', kind: 'zir', body: 0xb0704a, slip: 0xd8b890 }, oasis: { form: 'zir', kind: 'zir', body: 0xa86a48, slip: 0xd0b088 },
  badlands: { form: 'zir', kind: 'zir', body: 0xa0603e, slip: 0xc8a07a }, orchard: { form: 'jarra', kind: 'amphora', body: 0xb8805a, slip: 0xd8c0a0 },
  saltwind: { form: 'amphora', kind: 'amphora', body: 0xa87050, slip: 0xc8a888 }, titan_gorge: { form: 'olla', kind: 'olla', body: 0xc8a07a, slip: 0x6a3a2a },
  delta: { form: 'matka', kind: 'matka', body: 0xa05a3a, slip: 0x5a3020 }, mangrove: { form: 'matka', kind: 'matka', body: 0x9a5a3a, slip: 0x5a3020 },
  monsoon: { form: 'matka', kind: 'matka', body: 0x985a3e, slip: 0x5a3020 },
});

/** Each map's laundry: the linen of the European and American farms, the robes of the oases, the saris and lungis of the
 *  Bengal chars and the Mekong. */
interface LaundrySpec { form: string; post: Hex; cloths: readonly Hex[]; long?: boolean }
const LINEN: LaundrySpec = { form: 'linen', post: 0x6a5a48, cloths: [0xe8e4d8, 0x8a3a3a, 0x3a5a8a] };
export const LAUNDRY_FORMS: Readonly<Record<string, LaundrySpec>> = Object.freeze({
  verdant: { ...LINEN, cloths: [0xe0dccc, 0xb8b0a0, 0x7a3a34] }, autumn: LINEN, frontier: { ...LINEN, cloths: [0xe8e4d8, 0x5a7aa8, 0xd8c8a0] },
  reservoir: LINEN, polders: { ...LINEN, cloths: [0xe8e4d8, 0x3a5a8a, 0xe8e4d8] }, longleaf: { ...LINEN, cloths: [0xd8ccb0, 0x6a7a9a, 0xe8e4d8] },
  coastal: { ...LINEN, cloths: [0xe8e8e0, 0x2a4a8a, 0xc83a2a] }, orchard: { ...LINEN, cloths: [0xe8e4d8, 0xd8a83a, 0x3a7a5a] },
  saltwind: { ...LINEN, cloths: [0xf0eee6, 0x3a6aa8, 0xe8e4d8] }, desert: { form: 'robes', post: 0x7a6650, cloths: [0xe8e2d0, 0x2a3a6a, 0xa8784a] },
  oasis: { form: 'robes', post: 0x7a6650, cloths: [0xe8e2d0, 0x3a4a7a, 0xc8b8a0] },
  delta: { form: 'saris', post: 0x5a4a3a, cloths: [0xc83a2a, 0xe8a030, 0x2a7a5a], long: true },
  mangrove: { form: 'saris', post: 0x5a4a3a, cloths: [0x3a6aa8, 0xc83a5a, 0xe8d8a0], long: true },
  monsoon: { form: 'lungis', post: 0x5a4a3a, cloths: [0x3a5a7a, 0xe8e4d8, 0x8a3a2a], long: true },
});

/** The red drum's paint by period: the war's red with its white band, the hazard-labelled drum after. */
const RED_DRUM_WAR = { shell: 0xa82a20, hoop: 0x7a1e18, head: 0xa82a20, band: 0xd8d2c0, rust: 0.35 };
const RED_DRUM_LATE = { shell: 0xb02a22, hoop: 0x801e18, head: 0xb02a22, band: 0xe8a020, rust: 0.2 };

/** A map's cable drum: the cable lead-sheathed before 1955 (periodClutterKit MODERN_KIND_INTRODUCED), PVC black after;
 *  the stations' steel spool and its orange cable. */
function spoolOf(mapId: string): { form: string; spec: { cheek: Hex; cable: Hex; steel?: boolean } } {
  if (mapId === 'moon' || mapId === 'mars') return { form: 'steel-spool', spec: { cheek: 0xb8b8b4, cable: 0xd8702a, steel: true } };
  const year = MAP_SETTING_YEAR[mapId] ?? 2000;
  return year < 1955 ? { form: 'lead-cable-drum', spec: { cheek: 0x8a6a48, cable: 0x6a6c70 } } : { form: 'cable-drum', spec: { cheek: 0x9a7a52, cable: 0x232323 } };
}

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
/** props.ts's mulberry32, the stream its seat checks build a kind's footprint with (destructibleFootprint: 0x0f0f7). */
function seatStream(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lin = (hex: Hex): Rgb => hexLin(hex);

/** How far a standing kind's foot reaches under its seat: a pool instance stands level at its centre's height, so on a
 *  slope its downhill side would show a gap under a crate or a woodpile (WORKLIST #2: "seat each stack on the terrain
 *  under it, slight embed"); the vertices on its foot run this far down into the ground. A physics body keeps its foot. */
const SKIRT_M = 0.12;
function skirt(g: THREE.BufferGeometry, depth: number): THREE.BufferGeometry {
  if (!(depth > 0)) return g;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.004) pos.setY(i, pos.getY(i) - depth);
  pos.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A kind's entry: the legacy builders run first (their draws), then the map's form near and far in one pool. */
function entry(kind: keyof typeof DESTRUCTIBLE_TYPES, mapId: string, mat: DestructiblePropType['mat'],
  near: (rng: () => number) => THREE.BufferGeometry, far: (() => THREE.BufferGeometry) | null,
  broken: ((rng: () => number) => THREE.BufferGeometry) | null): DestructiblePropType {
  const base = DESTRUCTIBLE_TYPES[kind] as DestructiblePropType;
  return {
    ...base, mat,
    // (the coordinator's ruling on #2, 2026-10-14: "a map vehicle is worth more than a clutter band") the seat checks —
    // a parked vehicle's or a cart's seat, a destructible's clearance of the road core (props.ts destructibleFootprint) —
    // read the kind's footprint as the map placed it before its regional form: the form yields its seat to them, so
    // every vehicle, cart and record stands where it stood
    footprintBuild: () => (periodClutterTypes(mapId)[kind] ?? base).build(seatStream(0x0f0f7)),
    build: (rng) => {
      base.build(rng).dispose();
      const sk = base.cls === 'physics' ? 0 : SKIRT_M;
      const n = skirt(near(kindStream(mapId, kind)), sk);
      return far ? withDistanceForms(n, skirt(far(), sk)) : leanForm(n);
    },
    broken: base.broken && broken ? (rng) => { base.broken!(rng).dispose(); return broken(kindStream(mapId, `${kind}:broken`)); } : base.broken,
    ...(broken ? { ownBroken: true } : {}),
  };
}

/** A map's crate, pallet and cable drum as forms (the yard kit stacks them: yardClutterKit.ts). */
export function crateFormOf(mapId: string): CrateForm | null {
  const c = CRATE_FORMS[mapId];
  return c ? { ...c, wood: lin(c.wood), frame: lin(c.frame), inside: lin(c.inside), strap: c.strap ? lin(c.strap) : undefined, stencil: c.stencil ? lin(c.stencil) : undefined } : null;
}
export function palletFormOf(mapId: string): PalletForm | null {
  const p = PALLET_FORMS[mapId];
  return p ? { kind: p.kind, wood: lin(p.wood), dark: lin(p.dark), brand: p.brand ? lin(p.brand) : undefined } : null;
}
export function spoolFormOf(mapId: string): SpoolForm {
  const s = spoolOf(mapId).spec;
  return { cheek: lin(s.cheek), cable: lin(s.cable), steel: s.steel };
}

/** The forms a map's clutter takes (null: the kind's legacy form there). */
export function clutterFormOf(kind: string, mapId: string): string | null {
  if (kind === 'drum') return DRUM_FORMS[mapId]?.form ?? null;
  if (kind === 'barrel') return CASK_FORMS[mapId]?.form ?? VESSEL_FORMS[mapId]?.form ?? null;
  if (kind === 'crate') return CRATE_FORMS[mapId]?.form ?? null;
  if (kind === 'firewood') return WOOD_FORMS[mapId]?.form ?? null;
  if (kind === 'pallet') return PALLET_FORMS[mapId]?.form ?? null;
  if (kind === 'jerrycan') return CAN_FORMS[mapId]?.form ?? null;
  if (kind === 'bucket') return BUCKET_FORMS[mapId]?.form ?? null;
  if (kind === 'gasbottle') return BOTTLE_FORMS[mapId]?.form ?? null;
  if (kind === 'churn') return CHURN_FORMS[mapId]?.form ?? null;
  if (kind === 'loosewheel') return WHEEL_FORMS[mapId]?.form ?? null;
  if (kind === 'pot') return POT_FORMS[mapId]?.form ?? null;
  if (kind === 'laundry') return LAUNDRY_FORMS[mapId]?.form ?? null;
  const year = MAP_SETTING_YEAR[mapId];
  if (kind === 'drumred') return year === undefined ? null : year < 1950 ? 'red-drum-1940s' : 'red-drum-hazard';
  if (kind === 'cablespool') return year === undefined ? null : spoolOf(mapId).form;
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
  const pallet = palletFormOf(mapId);
  if (pallet) {
    const f = pallet;
    out.pallet = entry('pallet', mapId, 'baked', (rng) => palletNear(f, rng), () => palletFar(f), (rng) => palletBroken(f, rng));
  }
  const f = crateFormOf(mapId);
  if (f) {
    out.crate = entry('crate', mapId, 'baked', (rng) => crateNear(f, rng), () => crateFar(f), (rng) => crateBroken(f, rng));
  }
  const can = CAN_FORMS[mapId];
  if (can) {
    const f: CanForm = { kind: can.kind, body: lin(can.body), trim: lin(can.trim), label: can.label ? lin(can.label) : undefined };
    out.jerrycan = entry('jerrycan', mapId, 'baked', (rng) => canNear(f, rng), () => canFar(f), null);
  }
  const bucket = BUCKET_FORMS[mapId];
  if (bucket) {
    const f: BucketForm = { kind: bucket.kind, body: lin(bucket.body), trim: lin(bucket.trim), inside: lin(bucket.inside) };
    out.bucket = entry('bucket', mapId, 'baked', (rng) => bucketNear(f, rng), () => bucketFar(f), null);
  }
  const bottle = BOTTLE_FORMS[mapId];
  if (bottle) {
    const f: BottleForm = { kind: bottle.kind, body: lin(bottle.body), collar: lin(bottle.collar), band: bottle.band ? lin(bottle.band) : undefined };
    out.gasbottle = entry('gasbottle', mapId, 'baked', (rng) => bottleNear(f, rng), () => bottleFar(f), null);
  }
  const churn = CHURN_FORMS[mapId];
  if (churn) {
    const f: ChurnForm = { kind: churn.kind, body: lin(churn.body), trim: lin(churn.trim) };
    out.churn = entry('churn', mapId, 'baked', (rng) => churnNear(f, rng), () => churnFar(f), null);
  }
  const wheel = WHEEL_FORMS[mapId];
  if (wheel) {
    const f: WheelForm = { kind: wheel.kind, rubber: lin(wheel.rubber), rim: lin(wheel.rim), hub: lin(wheel.hub) };
    out.loosewheel = entry('loosewheel', mapId, 'baked', (rng) => wheelNear(f, rng), () => wheelFar(f), null);
  }
  const pot = POT_FORMS[mapId];
  if (pot) {
    const f: PotForm = { kind: pot.kind, body: lin(pot.body), slip: lin(pot.slip) };
    out.pot = entry('pot', mapId, 'baked', (rng) => potNear(f, rng), () => potFar(f), (rng) => potBroken(f, rng));
  }
  const laundry = LAUNDRY_FORMS[mapId];
  if (laundry) {
    // (the line casts its own shadow: one form at every distance)
    const f: LaundryForm = { post: lin(laundry.post), cloths: laundry.cloths.map(lin), long: laundry.long };
    out.laundry = entry('laundry', mapId, 'baked', (rng) => laundryNear(f, rng), null, (rng) => laundryBroken(f, rng));
  }
  const year = MAP_SETTING_YEAR[mapId];
  if (year !== undefined) {
    const r = year < 1950 ? RED_DRUM_WAR : RED_DRUM_LATE;
    const paint = { shell: lin(r.shell), hoop: lin(r.hoop), head: lin(r.head), band: lin(r.band), rust: r.rust };
    out.drumred = entry('drumred', mapId, 'baked', (rng) => drumNear(paint, rng), () => drumFar(paint), (rng) => redDrumBroken(paint.shell, rng));
    // (the cable drum casts its own shadow: one form at every distance)
    const f = spoolFormOf(mapId);
    out.cablespool = entry('cablespool', mapId, 'baked', (rng) => spoolNear(f, rng), null, (rng) => spoolBroken(f, rng));
  }
  return out;
}
