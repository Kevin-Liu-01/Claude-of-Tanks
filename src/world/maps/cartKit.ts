// src/world/maps/cartKit.ts — the map-vehicles lane's carts and sleds per map (P3, 2026-10-06).
//
// props.ts places three small transport roles (destructibles: a handcart in the yards and the street clutter, a
// haycart beside the farms, a sled on the snow maps) and renders every copy of a role in one instanced draw. The roles,
// their places and their share of the destructible stream are the battlefield's and do not move; what a role IS comes
// from the map's place and year (cartBodies.ts builds them): the handcart is a charrette à bras in Lorraine, a
// Leiterwagen in the Eifel, a rickshaw on Suzhou Creek, a riyakā in the Aso caldera, a water trolley in besieged
// Sarajevo, the hand tool carrier at Taurus-Littrow; the haycart a hay wagon at Prokhorovka, a seaweed cart on the
// Léon coast, a bullock cart at Kohima, a bale trailer in the Fulda Gap; the sled a Hornschlitten, a Podhale horn sled,
// a komatik.
//
// Collision follows each cart (2026-10-06, as the vehicles do): a role's footprint (hw, hl) is its model's visible half
// extents and its obstacle refits to the contact band the model's own solids bear on the ground, both from the coarse
// build fitted as every tier fits it, so desktop and mobile collide identically. Each builder spends exactly the draws
// the legacy builder spent from the destructible stream (civilianVehicleLegacy.ts), so every later pool builds from the
// same stream and no record moves. A model larger than its role's legacy box is scaled down into it.

import * as THREE from 'three';
import { VehicleMesh, linearHex, vehicleWeathering } from './vehicleMesh.ts';
import { keepStreams } from '../geometryStreams.ts';
import { buildCart, cartRunners, cartWheels, type CartModel, type RunnerTrack } from './cartBodies.ts';
import { climateForMap, type VehicleClimate } from './vehicleFleets.ts';
import { LEGACY_DRAWS } from './civilianVehicleLegacy.ts';
import { deriveRuntimeStructureContactBand, type StructureCollisionRuntimeBand } from '../structureCollision.ts';
import { convexHull2 } from '../collision.ts';

type Rng = () => number;
type Builder = (rng: Rng) => THREE.BufferGeometry;

type CartRole = 'handcart' | 'haycart' | 'sled';

interface CartBox {
  readonly halfWidth: number;
  readonly halfLength: number;
  /** The collision record's height (the legacy record's). */
  readonly height: number;
  /** How far a cart may stand over it (a rickshaw's hood, a hay load, a raised pole, a sled's horns). */
  readonly rise: number;
  /** Instanced triangles allowed for one copy (desktop). */
  readonly triangleBudget: number;
}

/** The roles' largest boxes (the legacy kit's footprints): a model is scaled down into its role's. */
const CART_BOXES: Readonly<Record<CartRole, CartBox>> = {
  handcart: { halfWidth: 0.62, halfLength: 1.14, height: 1.1, rise: 0.62, triangleBudget: 5200 },
  haycart: { halfWidth: 1.54, halfLength: 2.16, height: 2.1, rise: 0.85, triangleBudget: 11000 },
  sled: { halfWidth: 0.45, halfLength: 1.0, height: 0.5, rise: 0.8, triangleBudget: 4200 },
};

/** One role's cart on a map: the model and the colours its copies take (sRGB, one per copy by place). */
interface CartEntry {
  readonly model: CartModel;
  readonly paints: readonly number[];
}

// ---------------------------------------------------------------------------------------------------- timber & paint

const GREY_OAK = [0x8a7f70, 0x7a6f60, 0x958a78, 0x6e6457];
const BROWN = [0x7a5a3c, 0x6b4f35, 0x86664a, 0x5e4630];
const PINE = [0xa88a62, 0x9a7c56, 0xb39670, 0x8e7250];
const DARK = [0x4e3f30, 0x5a4a38, 0x463829, 0x60503e];
const BAMBOO = [0x9a8a66, 0x8c7e5c, 0xa69676, 0x847452];
const SUN_BLEACHED = [0xa49a88, 0x968c7a, 0xb0a692, 0x8a806e];
/** Unpainted copies: their timber a little lighter or darker, warmer or greyer, copy by copy. */
const TIMBER_TINTS = [0xffffff, 0xf2eadc, 0xe4dccf, 0xfaf3e6, 0xdcd4c6];

// ---------------------------------------------------------------------------------------------------- the catalogue

const entry = (model: CartModel, paints: readonly number[] = TIMBER_TINTS): CartEntry => ({ model, paints });

/** The French charrette à bras (Lorraine, autumn 1944): grey oak, iron tyres, sacks, level on its prop. */
const CHARRETTE_LORRAINE = entry({ kind: 'charrette', bedL: 1.42, bedW: 0.8, sideH: 0.3, wheelR: 0.46, spokes: 10, arms: 0.84, tyre: 'iron',
  painted: 'none', load: 'sacks', rest: 'prop', wood: GREY_OAK });
/** The Breton charrette (Léon, the 1960s): painted body, crates. */
const CHARRETTE_BRETON = entry({ kind: 'charrette', bedL: 1.38, bedW: 0.78, sideH: 0.28, wheelR: 0.48, spokes: 10, arms: 0.86, tyre: 'iron',
  painted: 'body', load: 'crates', rest: 'arms', wood: GREY_OAK }, [0x4a6a8a, 0x8a3a2a, 0x5a6a4a, 0x3e5a7a]);
/** The Zeeland handkar (autumn 1944): painted body, crates. */
const HANDKAR_ZEELAND = entry({ kind: 'charrette', bedL: 1.36, bedW: 0.78, sideH: 0.32, wheelR: 0.45, spokes: 10, arms: 0.86, tyre: 'iron',
  painted: 'body', load: 'crates', rest: 'prop', wood: BROWN }, [0x2f5a3a, 0x2f4a6a, 0x7a2a22, 0x3a5a4a]);
/** A Savoyard handcart (the Mont-Cenis, April 1945): firewood, dark weathered wood. */
const CHARRETTE_SAVOIE = entry({ kind: 'charrette', bedL: 1.32, bedW: 0.76, sideH: 0.26, wheelR: 0.44, spokes: 10, arms: 0.88, tyre: 'iron',
  painted: 'none', load: 'firewood', rest: 'arms', wood: DARK });
/** An Andalusian carretón (Ronda, the 1970s): painted wheels, sacks. */
const CARRETON_RONDA = entry({ kind: 'charrette', bedL: 1.4, bedW: 0.8, sideH: 0.26, wheelR: 0.47, spokes: 10, arms: 0.84, tyre: 'iron',
  painted: 'wheels', load: 'sacks', rest: 'arms', wood: SUN_BLEACHED }, [0x2f5f8a, 0x2e6a4a, 0x8a3a24]);
/** The British GS handcart at Kohima (1944): khaki body, jerrycans. */
const GS_HANDCART = entry({ kind: 'charrette', bedL: 1.3, bedW: 0.78, sideH: 0.3, wheelR: 0.45, spokes: 10, arms: 0.88, tyre: 'iron',
  painted: 'body', load: 'cans', rest: 'prop', wood: BROWN }, [0x5a5a3a, 0x4e5236, 0x606248]);
/** The Leiterwagen of the 1940s (the Eifel, Podhale, Franconia): ladder sides, iron tyres. */
const LEITERWAGEN_1940S = (load: 'sacks' | 'firewood' | 'cans') => entry({ kind: 'leiterwagen', bedL: 1.18, bedW: 0.46, sides: 'ladder', sideH: 0.4,
  flare: 0.13, wheelF: 0.2, wheelR: 0.25, tyre: 'iron', painted: 'none', load, wood: GREY_OAK });
/** The Bollerwagen of the 1980s (the Fulda Gap, the hill towns): plank sides, rubber tyres on painted wheels. */
const BOLLERWAGEN = entry({ kind: 'leiterwagen', bedL: 1.0, bedW: 0.5, sides: 'boards', sideH: 0.26, flare: 0, wheelF: 0.17, wheelR: 0.17,
  tyre: 'rubber', painted: 'wheels', load: 'cans', wood: PINE }, [0xb83a2a, 0x2f6a3a, 0x2f4a7a]);
/** A wooden box barrow on a wooden wheel (Prokhorovka, the Virgin Lands, Narvik, Louisiana). */
const WOOD_BARROW = (load: 'firewood' | 'sand' | 'empty', wood: readonly number[]) => entry({ kind: 'barrow', style: 'wood', wheelR: 0.22, trayL: 0.82,
  trayW: 0.64, trayD: 0.28, tub: 'galvanised', load, wood });
/** The contractor's steel barrow on a pneumatic tyre. */
const STEEL_BARROW = (tub: 'painted' | 'galvanised', load: 'sand' | 'bricks' | 'empty', paints: readonly number[] = TIMBER_TINTS) => entry({
  kind: 'barrow', style: 'steel', wheelR: 0.2, trayL: 0.86, trayW: 0.66, trayD: 0.3, tub, load, wood: BROWN }, paints);

/** Each map's three roles. */
interface CartSet { readonly handcart: CartEntry; readonly haycart: CartEntry; readonly sled: CartEntry }

const HAY_WAGON_RUSSIAN = entry({ kind: 'wagon4', bedL: 2.5, bedW: 0.92, body: 'ladder', sideH: 0.82, flare: 0.36, wheelF: 0.4, wheelR: 0.48,
  spokesF: 10, spokesR: 12, track: 1.36, hitch: 'shafts', load: 'hay', painted: 'none', wood: GREY_OAK });
const HAY_WAGON_WEST = (hitch: 'pole-up' | 'pole-down', wood: readonly number[]) => entry({ kind: 'wagon4', bedL: 2.7, bedW: 0.95, body: 'ladder',
  sideH: 0.86, flare: 0.38, wheelF: 0.42, wheelR: 0.52, spokesF: 10, spokesR: 12, track: 1.4, hitch, load: 'hay', painted: 'none', wood });
const BOERENWAGEN = entry({ kind: 'wagon4', bedL: 2.7, bedW: 1.0, body: 'box', sideH: 0.5, flare: 0.05, wheelF: 0.44, wheelR: 0.54, spokesF: 10,
  spokesR: 12, track: 1.44, hitch: 'pole-up', load: 'sacks', painted: 'box', wood: BROWN }, [0x2f5a7a, 0x3a6a4a, 0x8a2a22, 0x2f4a6a]);
const STUDEBAKER = entry({ kind: 'wagon4', bedL: 3.0, bedW: 0.96, body: 'box', sideH: 0.6, flare: 0.02, wheelF: 0.44, wheelR: 0.55, spokesF: 12,
  spokesR: 14, track: 1.42, hitch: 'pole-up', load: 'empty', painted: 'box', gear: 0x9a2a1e, wheelHex: 0x9a2a1e, seat: true, wood: BROWN },
[0x3a6a3a, 0x2e5a3a, 0x40703e]);
// (round 2, wave 152: the pole "points straight up into the air… reading as physically wrong") the dray's pole rests its
// tip on the ground ahead, as a parked dray's does (within the raised pole's reach: the fit and the footprint stand)
const DRAY = entry({ kind: 'wagon4', bedL: 2.9, bedW: 1.3, body: 'flat', sideH: 0.3, flare: 0, wheelF: 0.42, wheelR: 0.5, spokesF: 10, spokesR: 12,
  track: 1.5, hitch: 'pole-rest', load: 'barrels', painted: 'none', wood: DARK });
const BALE_TRAILER = entry({ kind: 'trailer', deckL: 3.0, deckW: 1.9, load: 'bales', wood: PINE }, [0xa82a22, 0x2f6a3a, 0x2f4a7a, 0x9a3a22]);
const SEAWEED_CART = entry({ kind: 'cart2', bedL: 1.9, bedW: 1.2, sideH: 0.42, sides: 'boards', wheelR: 0.72, spokes: 12, tyre: 'iron', shafts: 1.75,
  load: 'seaweed', painted: 'wheels', rest: 'shafts', wood: GREY_OAK }, [0x4a6a8a, 0x8a3a2a, 0x5a5a4a]);
const CARRO_RONDA = entry({ kind: 'cart2', bedL: 2.0, bedW: 1.14, sideH: 0.36, sides: 'rails', wheelR: 0.7, spokes: 12, tyre: 'iron', shafts: 1.7,
  canopy: 'tilt', load: 'sacks', painted: 'wheels', rest: 'shafts', wood: SUN_BLEACHED }, [0x2f5f8a, 0x8a3a24, 0x2e6a4a]);
const DONKEY_CART = (load: 'sacks' | 'hay' | 'crates' | 'firewood') => entry({ kind: 'cart2', bedL: 1.55, bedW: 1.06, sideH: 0.3, sides: 'boards',
  wheelR: 0.31, spokes: 0, tyre: 'pneumatic', shafts: 1.55, load, painted: 'body', rest: 'shafts', wood: SUN_BLEACHED },
[0x2f6f9a, 0x3a8a5a, 0xd8b030, 0xc83a2a]);
const SAVOY_HAY_CART = entry({ kind: 'cart2', bedL: 1.9, bedW: 1.12, sideH: 0.42, sides: 'ladder', wheelR: 0.62, spokes: 12, tyre: 'iron', shafts: 1.6,
  load: 'hay', painted: 'none', rest: 'prop', wood: DARK });
const KJERRE = entry({ kind: 'cart2', bedL: 1.7, bedW: 1.04, sideH: 0.36, sides: 'boards', wheelR: 0.58, spokes: 12, tyre: 'iron', shafts: 1.75,
  load: 'hay', painted: 'body', rest: 'shafts', wood: GREY_OAK }, [0x8a2a1e, 0x9a3a28, 0x7a2a22]);
const BULLOCK_CART = (load: 'sacks' | 'empty') => entry({ kind: 'cart2', bedL: 2.15, bedW: 1.0, sideH: 0.34, sides: 'rails', wheelR: 0.7, spokes: 12,
  tyre: 'iron', shafts: 1.45, pole: true, canopy: 'chhai', load, painted: 'none', rest: 'shafts', wood: BAMBOO });
const HAY_SLEDGE = entry({ kind: 'sledge', bedL: 2.6, bedW: 1.0, load: 'hay', wood: GREY_OAK });
const HORN_SLED = (load: 'hay' | 'firewood' | 'empty', wood: readonly number[]) => entry({ kind: 'sled', style: 'horn', len: 2.0, width: 0.66, load, wood });
// (wave 211: "flat, untextured, saturated-orange timber") the komatik's planks weathered grey by the Arctic
const KOMATIK = entry({ kind: 'sled', style: 'komatik', len: 2.0, width: 0.8, load: 'gear', wood: GREY_OAK });

const TYRE_CART = (load: 'crates' | 'sacks' | 'cans') => entry({ kind: 'tyrecart', deckL: 1.42, deckW: 0.86, wheelR: 0.27, painted: true, load,
  wood: SUN_BLEACHED }, [0x2f6f9a, 0x3a8a5a, 0xd8b030, 0xb83a2a, 0x2f4a7a]);

const SETS: Readonly<Record<string, CartSet>> = {
  verdant: { handcart: WOOD_BARROW('firewood', GREY_OAK), haycart: HAY_WAGON_RUSSIAN, sled: HORN_SLED('firewood', GREY_OAK) },
  steppe: { handcart: WOOD_BARROW('sand', SUN_BLEACHED), haycart: HAY_WAGON_RUSSIAN, sled: HORN_SLED('empty', GREY_OAK) },
  winter: { handcart: LEITERWAGEN_1940S('firewood'), haycart: HAY_SLEDGE, sled: HORN_SLED('firewood', DARK) },
  alpine: { handcart: CHARRETTE_SAVOIE, haycart: SAVOY_HAY_CART, sled: HORN_SLED('hay', DARK) },
  autumn: { handcart: CHARRETTE_LORRAINE, haycart: HAY_WAGON_WEST('pole-down', GREY_OAK), sled: HORN_SLED('empty', GREY_OAK) },
  reservoir: { handcart: LEITERWAGEN_1940S('sacks'), haycart: HAY_WAGON_WEST('pole-up', GREY_OAK), sled: HORN_SLED('firewood', GREY_OAK) },
  foundry: { handcart: entry({ kind: 'tipcart', wheelR: 0.33, tubL: 0.92, tubW: 0.72, tubD: 0.42, load: 'coal', wood: DARK }),
    haycart: DRAY, sled: HORN_SLED('empty', DARK) },
  polders: { handcart: HANDKAR_ZEELAND, haycart: BOERENWAGEN, sled: HORN_SLED('empty', BROWN) },
  urban: { handcart: BOLLERWAGEN, haycart: BALE_TRAILER, sled: HORN_SLED('empty', PINE) },
  frontier: { handcart: BOLLERWAGEN, haycart: BALE_TRAILER, sled: HORN_SLED('empty', PINE) },
  railyard: { handcart: entry({ kind: 'trolley', deckL: 1.9, deckW: 0.74, load: 'crates', wood: BROWN }, [0x3a4a3a, 0x2a2e30, 0x34443a]),
    haycart: DRAY, sled: HORN_SLED('empty', DARK) },
  coastal: { handcart: CHARRETTE_BRETON, haycart: SEAWEED_CART, sled: HORN_SLED('empty', GREY_OAK) },
  cliffbridge: { handcart: CARRETON_RONDA, haycart: CARRO_RONDA, sled: HORN_SLED('empty', SUN_BLEACHED) },
  saltwind: { handcart: STEEL_BARROW('galvanised', 'sand'), haycart: DONKEY_CART('firewood'), sled: HORN_SLED('empty', SUN_BLEACHED) },
  fjord: { handcart: WOOD_BARROW('firewood', GREY_OAK), haycart: KJERRE, sled: HORN_SLED('firewood', GREY_OAK) },
  longleaf: { handcart: WOOD_BARROW('empty', PINE), haycart: STUDEBAKER, sled: HORN_SLED('empty', PINE) },
  monsoon: { handcart: GS_HANDCART, haycart: BULLOCK_CART('empty'), sled: HORN_SLED('empty', BAMBOO) },
  mangrove: { handcart: STEEL_BARROW('painted', 'sand', [0x2f5a8a, 0x6a7a84, 0x3a6a8a]), haycart: BULLOCK_CART('sacks'), sled: HORN_SLED('empty', BAMBOO) },
  delta: { handcart: entry({ kind: 'thela', deckL: 1.9, deckW: 0.94, load: 'sacks', wood: BROWN }, [0x2f6f9a, 0xc83a2a, 0x3a8a4a, 0xd8a030]),
    haycart: BULLOCK_CART('sacks'), sled: HORN_SLED('empty', BAMBOO) },
  blackglass: { handcart: entry({ kind: 'rickshaw', wood: DARK }, [0x1c1612, 0x4a1a14, 0x2a2018, 0x3a2a1a]),
    haycart: DONKEY_CART('sacks'), sled: HORN_SLED('empty', DARK) },
  caldera: { handcart: entry({ kind: 'riyaka', deckL: 1.32, deckW: 0.82, load: 'crates', wood: PINE }, [0x8a9096, 0x3a5a8a, 0x6a7a6a, 0x9aa0a4]),
    haycart: DONKEY_CART('crates'), sled: HORN_SLED('empty', PINE) },
  ruinspires: { handcart: entry({ kind: 'cantrolley', wood: DARK }), haycart: DONKEY_CART('firewood'), sled: HORN_SLED('empty', DARK) },
  airfield: { handcart: entry({ kind: 'bottlecart', wood: BROWN }, [0xd8b030, 0xc8642a, 0x5a6a5a]), haycart: HAY_WAGON_RUSSIAN, sled: HORN_SLED('empty', PINE) },
  whiteout: { handcart: entry({ kind: 'drumtruck', wood: PINE }, [0xa8301f, 0x2f4f7a, 0xd8b030, 0x4a5a3a]), haycart: HAY_SLEDGE, sled: KOMATIK },
  skybridge: { handcart: STEEL_BARROW('painted', 'sand', [0xc8502a, 0x2f5a3a, 0xa82a22]), haycart: STUDEBAKER, sled: HORN_SLED('empty', PINE) },
  titan_gorge: { handcart: STEEL_BARROW('galvanised', 'empty'), haycart: STUDEBAKER, sled: HORN_SLED('empty', SUN_BLEACHED) },
  copper_mesa: { handcart: STEEL_BARROW('painted', 'bricks', [0x2e5a3a, 0x9a2a22, 0x3a4a6a]), haycart: DONKEY_CART('firewood'), sled: HORN_SLED('empty', BROWN) },
  badlands: { handcart: TYRE_CART('sacks'), haycart: DONKEY_CART('sacks'), sled: HORN_SLED('empty', SUN_BLEACHED) },
  oasis: { handcart: TYRE_CART('crates'), haycart: DONKEY_CART('hay'), sled: HORN_SLED('empty', SUN_BLEACHED) },
  desert: { handcart: TYRE_CART('cans'), haycart: DONKEY_CART('sacks'), sled: HORN_SLED('empty', SUN_BLEACHED) },
  orchard: { handcart: TYRE_CART('crates'), haycart: DONKEY_CART('crates'), sled: HORN_SLED('empty', SUN_BLEACHED) },
  moon: { handcart: entry({ kind: 'toolcarrier', wood: PINE }, [0xffffff]), haycart: DONKEY_CART('sacks'), sled: HORN_SLED('empty', PINE) },
  mars: { handcart: entry({ kind: 'evacart', wood: PINE }, [0xffffff]), haycart: DONKEY_CART('sacks'), sled: HORN_SLED('empty', PINE) },
};

const DEFAULT_SET: CartSet = { handcart: CHARRETTE_LORRAINE, haycart: HAY_WAGON_WEST('pole-down', GREY_OAK), sled: HORN_SLED('empty', GREY_OAK) };

/** Each map's carts (its Reference: line's place and year; the default set elsewhere). */
export function cartsForMap(mapId: string): CartSet {
  return SETS[mapId] ?? DEFAULT_SET;
}

// ---------------------------------------------------------------------------------------------------- building

interface BuildContext {
  readonly climate: VehicleClimate;
  /** Mobile tier: coarse sections, no voxel occlusion, no fine hardware. */
  readonly coarse: boolean;
}

/**
 * A model's fit in its role: the offset that centres its intact footprint on the record (the builders set their parts
 * by the axle) and the scale that brings it into the role's box (never up), from the coarse intact build; every tier,
 * intact or wrecked, takes the same fit, so the tiers' plans agree and a wreck keeps its cart's size.
 */
interface CartFit { readonly cx: number; readonly cz: number; readonly s: number }
/** The builders' own salt (board shades, the loads' lumps): one for every build of a model, so the fit, the solid and
 * every tier see the same cart. */
const CART_SEED = 0x51ed;
const FITS = new WeakMap<CartModel, Map<CartRole, CartFit>>();
function cartFit(model: CartModel, role: CartRole): CartFit {
  let byRole = FITS.get(model);
  if (!byRole) { byRole = new Map(); FITS.set(model, byRole); }
  const known = byRole.get(role);
  if (known) return known;
  const mesh = new VehicleMesh();
  mesh.coarse = true;
  buildCart(mesh, model, { coarse: true, wrecked: false, seed: CART_SEED });
  const g = mesh.build(vehicleWeathering({ seed: 1, voxelAo: false }));
  const b = g.userData.bodyBox as THREE.Box3;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const box = CART_BOXES[role];
  const s = Math.min(1, box.halfWidth / Math.max(1e-6, (b.max.x - b.min.x) / 2), box.halfLength / Math.max(1e-6, (b.max.z - b.min.z) / 2));
  g.dispose();
  const fit = { cx, cz, s };
  byRole.set(role, fit);
  return fit;
}

/** Build a role's cart into a fresh mesh, centred on its footprint. */
function cartMesh(e: CartEntry, role: CartRole, coarse: boolean, wrecked: boolean, snow = false): VehicleMesh {
  const { cx, cz } = cartFit(e.model, role);
  const mesh = new VehicleMesh();
  mesh.coarse = coarse;
  mesh.push().translate(-cx, 0, -cz);
  buildCart(mesh, e.model, { coarse, wrecked, seed: CART_SEED, snow });
  mesh.pop();
  return mesh;
}

/** Scale a built cart by its fit and stand its lowest point on y = 0. */
function applyFit(geometry: THREE.BufferGeometry, s: number): void {
  geometry.computeBoundingBox();
  const lift = -geometry.boundingBox!.min.y;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) position.setXYZ(i, position.getX(i) * s, (position.getY(i) + lift) * s, position.getZ(i) * s);
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const body = geometry.userData.bodyBox as THREE.Box3 | undefined;
  if (body) { body.min.set(body.min.x * s, (body.min.y + lift) * s, body.min.z * s); body.max.set(body.max.x * s, (body.max.y + lift) * s, body.max.z * s); }
}

/** One role's geometry on a map: intact or wrecked. */
function buildRole(e: CartEntry, role: CartRole, ctx: BuildContext, wrecked: boolean, seed: number): THREE.BufferGeometry {
  const { cz, s } = cartFit(e.model, role);
  const geometry = cartMesh(e, role, ctx.coarse, wrecked, ctx.climate.snow ?? false).build(vehicleWeathering({
    dirtRgb: linearHex(ctx.climate.dirt), dirt: Math.min(1, ctx.climate.dirtAmount * (wrecked ? 1.3 : 1.1)), dirtTop: 0.45,
    dustRgb: linearHex(ctx.climate.dust), dust: ctx.climate.dustAmount,
    rust: 0.55, burnt: false, wheels: cartWheels(e.model).map((w) => ({ ...w, z: w.z - cz })), seed, voxelAo: !ctx.coarse,
  }));
  applyFit(geometry, s);
  delete geometry.userData.outboard;
  return geometry;
}

/**
 * A role's canonical solid: the coarse intact build, positions only, fitted as every tier fits it. This is where the
 * role's collision comes from on desktop and mobile alike, and the shadow passes' stand-in for the full cart (desktop).
 */
function canonicalSolid(e: CartEntry, role: CartRole): THREE.BufferGeometry {
  // positions only, on a fresh geometry (keepStreams: never deleteAttribute on a geometry the renderer draws)
  const geometry = keepStreams(cartMesh(e, role, true, false).build(vehicleWeathering({ seed: 1, voxelAo: false })), ['position']);
  // the dressing (lashings, twine, the hood's bows, rivets) neither collides nor casts
  const skip = geometry.userData.noCollisionVertices as Uint8Array | undefined;
  if (skip) {
    const index = geometry.index!.array, kept: number[] = [];
    for (let t = 0; t < index.length; t += 3) {
      if (!(skip[index[t]] && skip[index[t + 1]] && skip[index[t + 2]])) kept.push(index[t], index[t + 1], index[t + 2]);
    }
    geometry.setIndex(kept);
  }
  delete geometry.userData.outboard;
  delete geometry.userData.noCollisionVertices;
  applyFit(geometry, cartFit(e.model, role).s);
  return geometry;
}

/** A role's collision on a map: its visible half extents and the contact band of its solids. */
interface CartFootprint {
  hw: number;
  hl: number;
  contactBand: StructureCollisionRuntimeBand;
  /** The body's plan at every height (its wheels, flaring sides and load; the shafts and handles are dressing), local
   *  and fitted, flat [x, z, ...]: what a fence, a wall or a tree must stay clear of (props.ts seats the carts). */
  hull: readonly number[];
}
const FOOTPRINTS = new WeakMap<CartModel, Map<CartRole, CartFootprint>>();
const mm = (v: number) => Math.round(v * 1000) / 1000;

/** The plan of a solid's kept triangles (the dressing is out of its index), millimetre-rounded. */
function bodyHull(solid: THREE.BufferGeometry): number[] {
  const position = solid.attributes.position, used = new Set<number>(solid.index!.array as ArrayLike<number> as number[]);
  const points: [number, number][] = [];
  for (const v of used) points.push([mm(position.getX(v)), mm(position.getZ(v))]);
  return convexHull2(points);
}

/** The footprint a map's role collides with (once per model and role in a session: maps share models). */
function cartFootprint(e: CartEntry, role: CartRole): CartFootprint {
  let byRole = FOOTPRINTS.get(e.model);
  if (!byRole) { byRole = new Map(); FOOTPRINTS.set(e.model, byRole); }
  const known = byRole.get(role);
  if (known) return known;
  const solid = canonicalSolid(e, role);
  const b = solid.userData.bodyBox as THREE.Box3;
  const footprint = {
    hw: mm(Math.max(-b.min.x, b.max.x)), hl: mm(Math.max(-b.min.z, b.max.z)),
    contactBand: deriveRuntimeStructureContactBand({ baked: [solid] }),
    hull: bodyHull(solid),
  };
  solid.dispose();
  byRole.set(role, footprint);
  return footprint;
}

/** A builder that spends exactly `draws` values of the destructible stream and builds from a seed taken from the first. */
function spending(draws: number, make: (seed: number) => THREE.BufferGeometry): Builder {
  return (rng: Rng) => {
    let seed = 0x5eed;
    if (draws > 0) {
      seed = Math.floor(rng() * 0x7fffffff);
      for (let k = 1; k < draws; k++) rng();
    }
    return make(seed);
  };
}

function hash01(x: number, z: number, salt: number): number {
  let h = Math.imul(Math.round(x * 16) | 0, 0x9e3779b1) ^ Math.imul(Math.round(z * 16) | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Each copy's colour: one of the entry's by its place on the map, a little faded or fresh. */
function paintPicker(e: CartEntry, salt: number): (out: THREE.Color, x: number, z: number, slot: number) => void {
  const colours = e.paints.map((hex) => new THREE.Color(hex));
  return (out, x, z, slot) => {
    const pick = hash01(x, z, salt + slot * 7);
    out.copy(colours[Math.min(colours.length - 1, Math.floor(pick * colours.length))]);
    out.multiplyScalar(0.88 + 0.16 * hash01(z, x, salt + 13));
  };
}

interface CartOverride {
  build: Builder;
  broken: Builder;
  instancePaint: (out: THREE.Color, x: number, z: number, slot: number) => void;
  /** Desktop tiers: the coarse solid casts the pool's shadows (no stream draws). */
  shadowBuild?: () => THREE.BufferGeometry;
  /** The role's footprint and contact band on this map (the same on every tier), read on first use. */
  readonly hw: number;
  readonly hl: number;
  /** Its body's plan (CartFootprint hull), the same on every tier. */
  readonly bodyHull: readonly number[];
  readonly contactBand: StructureCollisionRuntimeBand;
  /** Round 3: a sled's runner tracks on a snowbound map, in the placed copy's frame (the fit's centre and scale). */
  readonly runners?: RunnerTrack;
}

/** A sled's runner tracks in the fitted frame (its builder's layout, shifted to the footprint's centre and scaled). */
function fittedRunners(e: CartEntry, role: CartRole): RunnerTrack | undefined {
  const raw = cartRunners(e.model);
  if (!raw) return undefined;
  const { cz, s } = cartFit(e.model, role);
  return { xs: raw.xs.map((x) => x * s), z0: (raw.z0 - cz) * s, z1: (raw.z1 - cz) * s, width: raw.width * s };
}

/** One map's carts: each role's builders from the map's set and soil, its copies' colours, its collision (lazily). */
export function cartOverrides(mapId: string, mobile: boolean): Record<CartRole, CartOverride> {
  const ctx: BuildContext = { climate: climateForMap(mapId), coarse: mobile };
  const set = cartsForMap(mapId);
  let salt = 0;
  for (let i = 0; i < mapId.length; i++) salt = (Math.imul(salt, 31) + mapId.charCodeAt(i)) | 0;
  const out = {} as Record<CartRole, CartOverride>;
  for (const role of Object.keys(CART_BOXES) as CartRole[]) {
    const e = set[role];
    const o = {
      build: spending(LEGACY_DRAWS[role].build, (seed) => buildRole(e, role, ctx, false, seed)),
      broken: spending(LEGACY_DRAWS[role].broken, (seed) => buildRole(e, role, ctx, true, seed)),
      instancePaint: paintPicker(e, salt + role.length * 131),
      ...(mobile ? {} : { shadowBuild: () => canonicalSolid(e, role) }),
      ...(ctx.climate.snow ? { runners: fittedRunners(e, role) } : {}),
    };
    out[role] = Object.defineProperties(o, {
      hw: { enumerable: true, get: () => cartFootprint(e, role).hw },
      hl: { enumerable: true, get: () => cartFootprint(e, role).hl },
      contactBand: { enumerable: true, get: () => cartFootprint(e, role).contactBand },
      bodyHull: { enumerable: true, get: () => cartFootprint(e, role).hull },
    }) as CartOverride;
  }
  return out;
}

const DEFAULT_CONTEXT: BuildContext = { climate: climateForMap(''), coarse: false };

/** The roles with the default set's builders (the destructible table's own entries; each map overrides them). */
export const CART_RECEIPTS = Object.fromEntries((Object.keys(CART_BOXES) as CartRole[]).map((role) => {
  const e = DEFAULT_SET[role];
  return [role, {
    ...CART_BOXES[role],
    build: spending(LEGACY_DRAWS[role].build, (seed) => buildRole(e, role, DEFAULT_CONTEXT, false, seed)),
    broken: spending(LEGACY_DRAWS[role].broken, (seed) => buildRole(e, role, DEFAULT_CONTEXT, true, seed)),
    footprint: () => cartFootprint(e, role),
  }];
})) as Record<CartRole, CartBox & { build: Builder; broken: Builder; footprint: () => CartFootprint }>;

/** Every map's sets, for the receipts. */
export const CART_SETS_FOR_TEST = SETS;
