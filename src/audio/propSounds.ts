/**
 * What a world prop sounds like when a hull or a round crushes, breaks, topples or knocks it (the 2.0 revival,
 * 2026-10-06). Pure data, DOM-free: the engine plays the layers of a kind's recipe at the prop.
 *
 * Every kind the world builds is named here (src/audio/propSounds.selftest.mjs fails on a kind that is not), so a
 * prop sounds of what it is: until this table, a regex chose for it, a haycart crushed as a car ('cart' matched
 * /car/), sedans, bales and tents as wooden crates, a steel guard post as a wooden fence ('post'), a wooden barrel as a
 * steel drum and the red fuel drum dented without exploding, and the telegraph poles and the loose drums, buckets and
 * bins made no sound at all. The regex remains for a kind this table has not met (a new world kind fails the receipt
 * until it is named here).
 *
 * A toppled prop falls on the props' hinge topple: an eased fall that lands TOPPLE_LAND_S after the crush
 * (src/world/props.ts updateProps), so its landing plays then.
 */

/** One sound of a prop's recipe. */
export interface PropSoundLayer {
  readonly id: string;
  /** Seconds after the crush. */
  readonly delayS: number;
  /** A random extra delay up to this (s): two falls never land in lockstep. */
  readonly jitterS: number;
  readonly gainDb: number;
}

/** A kind's layers; an empty recipe is a deliberate silence (src/audio/propSounds.ts names why). */
export type PropSoundRecipe = readonly PropSoundLayer[];

/** The props' hinge topple lands this long after the crush (props.ts: smoothstep over 0.8 s, then a small bounce). */
export const TOPPLE_LAND_S = 0.8;

const layer = (id: string, delayS = 0, gainDb = 0, jitterS = 0): PropSoundLayer => Object.freeze({ id, delayS, jitterS, gainDb });
const recipe = (...layers: PropSoundLayer[]): PropSoundRecipe => Object.freeze(layers);

const WOOD_SMASH = recipe(layer('crate_break'));
const WOOD_FENCE = recipe(layer('fence_wood'));
const STRAW = recipe(layer('straw_crush'));
const CART = recipe(layer('cart_break'));
const CANVAS = recipe(layer('tent_collapse'));
const CAR = recipe(layer('car_crush'));
const MASONRY = recipe(layer('wall_brick'));
const STONE = recipe(layer('rubble_crunch'));
const HUT = recipe(layer('building_collapse'));
/** A steel shed or office folding up: the hollow boom of its walls, then its sheet and fittings coming down. */
const STEEL_SHED = recipe(layer('container_crush'), layer('debris_metal', 0.35, -5, 0.2));
/** A wooden post or cross: its foot splits, then it lands. */
const WOOD_TOPPLE = recipe(layer('pole_snap', 0, -3), layer('pole_fall', TOPPLE_LAND_S, -4, 0.06));
/** A steel lamp post or sign: it bends over with a scrape of steel, then it lands with its clang and glass. */
const STEEL_TOPPLE = recipe(layer('fence_metal', 0, -3), layer('metal_topple', TOPPLE_LAND_S, -1, 0.06));
/** A loose steel drum, churn, bin, bucket, can or bottle knocked about: a hollow clang and a short roll. */
const KNOCK = recipe(layer('can_knock', 0, -3));

/**
 * Every world kind (src/world/maps/inhabitKit.ts DESTRUCTIBLE_TYPES, sceneryKit.ts SCENERY_DESTRUCTIBLE_TYPES,
 * structureKit.ts DESTRUCTIBLE_BUILDING_TYPES, the sandbag stacks of props.ts, the telegraph poles, the front's AA
 * guns and the trees), with what it sounds like.
 */
const KIND_SOUNDS: Readonly<Record<string, PropSoundRecipe>> = Object.freeze({
  // --- the telegraph lines (props.ts crushProp): the foot cracks, the wires whip as it goes over, it lands
  utility_pole: recipe(layer('pole_snap'), layer('pole_wires', 0.3, -3, 0.1), layer('pole_fall', TOPPLE_LAND_S, -2, 0.06)),
  // --- the inhabiting kit: wood
  crate: WOOD_SMASH, pallet: WOOD_SMASH, firewood: WOOD_SMASH, trough: WOOD_SMASH, bench: WOOD_SMASH, sled: WOOD_SMASH,
  rugframe: WOOD_SMASH, cablespool: WOOD_SMASH, ammobox: WOOD_SMASH,
  // bBarrel is a coopered wooden barrel (staves and hoops), not a steel drum
  barrel: WOOD_SMASH,
  fenceplank: WOOD_FENCE, fencepicket: WOOD_FENCE, fencewattle: WOOD_FENCE, fencerail: WOOD_FENCE, gate: WOOD_FENCE,
  // straw
  bale: STRAW, stook: STRAW, haystack: STRAW, strawstack: STRAW,
  // carts: the haycart's load goes down under its wheels
  handcart: CART, haycart: recipe(layer('cart_break'), layer('straw_crush', 0.08, -5)),
  // canvas: tents, the laundry line's two posts and sheets, and the market stall's awning over its wooden frame
  tent: CANVAS, laundry: recipe(layer('tent_collapse', 0, -5)), stall: recipe(layer('crate_break'), layer('tent_collapse', 0.05, -6)),
  // clay: the souk's and the ksar's jar clusters
  pot: recipe(layer('pottery_smash')),
  // steel and glass: the street lamp and the road sign topple; the transformer box dents
  lamp: STEEL_TOPPLE, roadsign: STEEL_TOPPLE,
  transformer: recipe(layer('container_crush')),
  // the red fuel drum bursts into a fireball (its blast then breaks what stands round it)
  drumred: recipe(layer('fuel_drum_blast'), layer('container_crush', 0, -8)),
  // masonry and concrete
  walladobe: MASONRY, wallstone: STONE, barrier: STONE, tomb: STONE, bildstock: STONE, bunker: HUT,
  // vehicles of every era (the map-vehicles lane's fleets keep these eight roles)
  truck: CAR, jeep: CAR, sedan: CAR, wagon: CAR, pickup: CAR, van: CAR, truckbox: CAR, truckflatbed: CAR,
  // wire and bags
  barbedwire: recipe(layer('wire_snag')),
  sandbagbig: recipe(layer('sandbag_thump')), sandbagsmall: recipe(layer('sandbag_thump')), sandbagwall: recipe(layer('sandbag_thump')),
  // --- the scenery kit: Longleaf's sawmill yard (the maps-longleaf lane's kinds, named at the batch-4 merge): the drying
  // stacks of sawn boards and the log deck at the slip break as stacked timber
  lumberstack: WOOD_SMASH, logdeck: WOOD_SMASH,
  // wooden crosses topple, the steel wind pump goes over like a lamp, only far bigger
  waysidecross: WOOD_TOPPLE, orthodoxcross: WOOD_TOPPLE,
  windpump: recipe(layer('hedgehog_clang', 0, -2), layer('metal_topple', TOPPLE_LAND_S, 0, 0.06), layer('debris_metal', TOPPLE_LAND_S + 0.15, -6)),
  // --- loose dressing (cls 'physics'): knocked about, never destroyed
  drum: KNOCK, churn: KNOCK, trashcan: KNOCK, gasbottle: KNOCK, bucket: KNOCK, jerrycan: KNOCK,
  // a loose wheel and tyre: a dull rubber thump
  loosewheel: recipe(layer('sandbag_thump', 0, -6)),
  // A plastic traffic cone shoved by a hull makes nothing a crew could hear over its own engine: deliberately silent.
  cone: recipe(),
  // --- the light buildings (structureKit.ts DESTRUCTIBLE_BUILDING_TYPES, by their debris material)
  fieldhut: HUT, leanto: HUT, huntingblind: HUT, fishershack: HUT, saunahut: HUT, alpinerefuge: HUT, stilthouse: HUT, longhouse: HUT,
  deserttent: CANVAS, commandtent: CANVAS, fieldhospital: CANVAS,
  guardpost: STEEL_SHED, motorpool: STEEL_SHED, quonsethut: STEEL_SHED, transformershed: STEEL_SHED, checkpointhut: STEEL_SHED,
  securityoffice: recipe(layer('container_crush'), layer('glass_shatter', 0.1, -6), layer('debris_metal', 0.35, -5, 0.2)),
  servicegarage: STEEL_SHED, relaystation: STEEL_SHED,
  corneroffice: recipe(layer('container_crush'), layer('glass_shatter', 0.1, -6), layer('debris_metal', 0.35, -5, 0.2)),
  // Olympus Basin's orbital structures (heard through Mars' thin air)
  missioncontrol: STEEL_SHED, ascentlander: STEEL_SHED, rovergarage: STEEL_SHED, habdome: STEEL_SHED, habmodule: STEEL_SHED,
  commsmast: STEEL_SHED, solararray: STEEL_SHED, fueltanks: STEEL_SHED, landingpad: STEEL_SHED,
  greenhouse: recipe(layer('glass_shatter'), layer('container_crush', 0.05, -4)),
  // --- the front's anti-aircraft guns (frontlineAtmosphere.ts)
  aaGun: recipe(layer('he_armor'), layer('debris_metal', 0.45, -2, 0.3)),
});

/** Every kind named above (the receipt checks the world's kinds against it). */
export const PROP_SOUND_KINDS: ReadonlySet<string> = new Set(Object.keys(KIND_SOUNDS));

/** The trees (state.ts 'tree' crushes): the trunk snaps, and a tall one falls through its branches after. */
function treeRecipe(heightM: number): PropSoundRecipe {
  return heightM > 4 ? recipe(layer('tree_snap'), layer('tree_fall', 0.45, -2, 0.3)) : recipe(layer('tree_snap'));
}

/** A kind no table entry names: the old regexes, without their 'cart'-as-car slip. */
function guessRecipe(k: string, heightM: number): PropSoundRecipe {
  if (/tree|sapling|stump|trunk|palm|pine|bush|shrub/.test(k)) return treeRecipe(heightM);
  if (/chain|wire|barbed/.test(k)) return recipe(layer('wire_snag'));
  if (/cart|wheelbarrow/.test(k)) return CART;
  if (/fence|rail|gate|post/.test(k)) return recipe(layer(/metal|steel|iron|chain/.test(k) ? 'fence_metal' : 'fence_wood'));
  if (/\bcar\b|car$|truck|van|bus|jeep|vehicle|tractor|sedan|pickup/.test(k)) return CAR;
  if (/container|drum|tank|cylinder/.test(k)) return recipe(layer('container_crush'));
  if (/hedgehog|obstacle|tetra/.test(k)) return recipe(layer('hedgehog_clang'));
  if (/sandbag|bag/.test(k)) return recipe(layer('sandbag_thump'));
  if (/bale|hay|straw/.test(k)) return STRAW;
  if (/tent|canvas/.test(k)) return CANVAS;
  if (/rubble|rock|stone|debris|brick|concrete/.test(k)) return STONE;
  if (/glass|window|greenhouse/.test(k)) return recipe(layer('glass_shatter'));
  if (/wall|pillar|column/.test(k)) return MASONRY;
  if (/house|building|hut|shed|barn|tower|kiosk|shack|silo/.test(k)) return HUT;
  if (/aagun|gun/.test(k)) return KIND_SOUNDS.aaGun;
  return WOOD_SMASH;
}

/** The layers that sound a prop of this kind (`height` sizes a tree's fall). */
export function propSoundRecipe(kind: string, heightM = 0): PropSoundRecipe {
  if (kind === 'tree') return treeRecipe(heightM);
  return Object.hasOwn(KIND_SOUNDS, kind) ? KIND_SOUNDS[kind] : guessRecipe(kind.toLowerCase(), heightM);
}

/** Whether a kind has its own entry (not the regex guess). */
export function hasPropSound(kind: string): boolean {
  return kind === 'tree' || PROP_SOUND_KINDS.has(kind);
}

/** Every asset a prop can play: the battle set pins them, so no first crush of a battle is silent while it decodes. */
export function propSoundAssets(): string[] {
  const ids = new Set<string>(['tree_snap', 'tree_fall']);
  for (const layers of Object.values(KIND_SOUNDS)) for (const l of layers) ids.add(l.id);
  return [...ids].sort();
}
