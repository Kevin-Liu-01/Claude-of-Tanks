// src/world/landmarks/index.ts — the set-piece builders by kind (the landmarks lane, 2026-10-05). A map authors its set
// pieces in `props.landmarks` (types.ts LandmarkPlacement); plan.ts holds each kind's parameters and footprint,
// compose.ts places them in the props build. Every builder draws the piece in its own frame from its own streams.
import { nodeKitRequire } from '../kitRegistryNode.ts';
import { resolveLandmarkParams } from './plan.ts';
import type { LandmarkBuilder, LandmarkKind, LandmarkParams, LandmarkPlacement } from './types.ts';

// ---- THE LANDMARK REGISTRY (2026-10-15, the perf lane) -------------------------------------------------------------
// Every set-piece kind is ONE ROW of LANDMARK_TABLE: its kind, its module and the module's loader (the builder is the
// module's export of the kind's own name). A new set piece (LOOKS, Lane C, MAPS) is one more row here; nothing else
// imports a builder module. A row may also name what its piece needs beside its own module:
//   spawns — the pieces it places after itself (compose.ts: a built piece's `children`, a square's centre piece);
//   styles — the architecture styles its builder resolves (maps/regional/index.ts: a house row's kit).
// - The browser loads a map's builders when its world build starts (map.ts createMapAsync: loadLandmarkBuilders with
//   landmarkKitsOf), so a battle entry downloads and compiles the set pieces its map places, not all of them.
// - Node (the headless collision builds, the server's world, the receipts, the bake tools) loads every builder with this
//   module, synchronously and in this table's order (kitRegistryNode.ts), exactly as the static imports did.
// A kind of the table read before it is loaded (the browser only) fails closed with its kind: never a silent skip.
type LandmarkModule = Record<string, unknown>;
interface LandmarkRow {
  readonly file: string;
  readonly load: () => Promise<LandmarkModule>;
  readonly spawns?: (params: LandmarkParams) => ReadonlyArray<Pick<LandmarkPlacement, 'kind'> & { params?: LandmarkPlacement['params'] }>;
  readonly styles?: (params: LandmarkParams) => ReadonlyArray<string | null | undefined>;
}
const LANDMARK_TABLE: Readonly<Record<string, LandmarkRow>> = Object.freeze({
  aircraftWreck: { file: './wrecks.ts', load: () => import('./wrecks.ts') },
  airstrip: { file: './stations.ts', load: () => import('./stations.ts') },
  baileyBridge: { file: './bridges.ts', load: () => import('./bridges.ts') },
  bandstand: { file: './parks.ts', load: () => import('./parks.ts') },
  belfry: { file: './towers.ts', load: () => import('./towers.ts') },
  bengalTemple: { file: './temples.ts', load: () => import('./temples.ts') },
  campanile: { file: './towers.ts', load: () => import('./towers.ts') },
  church: { file: './civic.ts', load: () => import('./civic.ts') },
  churchyard: { file: './parks.ts', load: () => import('./parks.ts') },
  colonialBungalow: { file: './colonial.ts', load: () => import('./colonial.ts') },
  columnMonument: { file: './monuments.ts', load: () => import('./monuments.ts') },
  conveyor: { file: './mineWorks.ts', load: () => import('./mineWorks.ts') },
  drumCache: { file: './stations.ts', load: () => import('./stations.ts') },
  equestrianStatue: { file: './monuments.ts', load: () => import('./monuments.ts') },
  fireLookout: { file: './towers.ts', load: () => import('./towers.ts') },
  fuelTankFarm: { file: './tankFarm.ts', load: () => import('./tankFarm.ts') },
  fishRack: { file: './fjordWorks.ts', load: () => import('./fjordWorks.ts') },
  fountain: { file: './parks.ts', load: () => import('./parks.ts') },
  garden: { file: './parks.ts', load: () => import('./parks.ts') },
  grainElevator: { file: './grainElevator.ts', load: () => import('./grainElevator.ts') },
  guyedMast: { file: './stations.ts', load: () => import('./stations.ts') },
  headframe: { file: './mineWorks.ts', load: () => import('./mineWorks.ts') },
  jamesway: { file: './stations.ts', load: () => import('./stations.ts') },
  granary: { file: './civic.ts', load: () => import('./civic.ts') },
  houseRow: { file: './village.ts', load: () => import('./village.ts'),
    styles: (p) => [String(p.kit)] },
  hayRack: { file: './fjordWorks.ts', load: () => import('./fjordWorks.ts') },
  khan: { file: './village.ts', load: () => import('./village.ts') },
  kolkhozArch: { file: './gates.ts', load: () => import('./gates.ts') },
  lavoir: { file: './village.ts', load: () => import('./village.ts') },
  liftBridge: { file: './bridges.ts', load: () => import('./bridges.ts') },
  harbour: { file: './harbour.ts', load: () => import('./harbour.ts') },
  lighthouse: { file: './harbour.ts', load: () => import('./harbour.ts') },
  marketHall: { file: './civic.ts', load: () => import('./civic.ts') },
  memorialWall: { file: './monuments.ts', load: () => import('./monuments.ts') },
  moduleTrain: { file: './stations.ts', load: () => import('./stations.ts') },
  mole: { file: './harbour.ts', load: () => import('./harbour.ts') },
  obelisk: { file: './monuments.ts', load: () => import('./monuments.ts') },
  oreBin: { file: './mineWorks.ts', load: () => import('./mineWorks.ts') },
  oreCars: { file: './mining.ts', load: () => import('./mining.ts') },
  parkGate: { file: './parks.ts', load: () => import('./parks.ts') },
  outfall: { file: './parks.ts', load: () => import('./parks.ts') },
  parkSquare: { file: './parks.ts', load: () => import('./parks.ts'),
    spawns: (p) => (p.centre === 'none' || p.centre === '' ? [] : [{ kind: String(p.centre) as LandmarkKind }]) },
  path: { file: './parks.ts', load: () => import('./parks.ts') },
  piazza: { file: './parks.ts', load: () => import('./parks.ts') },
  quay: { file: './harbour.ts', load: () => import('./harbour.ts') },
  radomeTower: { file: './stations.ts', load: () => import('./stations.ts') },
  statue: { file: './monuments.ts', load: () => import('./monuments.ts') },
  slipway: { file: './harbour.ts', load: () => import('./harbour.ts') },
  snowFence: { file: './stations.ts', load: () => import('./stations.ts') },
  stairway: { file: './parks.ts', load: () => import('./parks.ts') },
  stabbur: { file: './fjordWorks.ts', load: () => import('./fjordWorks.ts') },
  stationHall: { file: './civic.ts', load: () => import('./civic.ts') },
  stoneArchBridge: { file: './bridges.ts', load: () => import('./bridges.ts') },
  tennisCourt: { file: './colonial.ts', load: () => import('./colonial.ts') },
  torii: { file: './gates.ts', load: () => import('./gates.ts') },
  townGate: { file: './gates.ts', load: () => import('./gates.ts') },
  townHall: { file: './civic.ts', load: () => import('./civic.ts') },
  trestleBridge: { file: './bridges.ts', load: () => import('./bridges.ts') },
  triumphalArch: { file: './gates.ts', load: () => import('./gates.ts') },
  troposcatter: { file: './stations.ts', load: () => import('./stations.ts') },
  trussBridge: { file: './bridges.ts', load: () => import('./bridges.ts') },
  viaduct: { file: './bridges.ts', load: () => import('./bridges.ts') },
  waterTower: { file: './waterWorks.ts', load: () => import('./waterWorks.ts') },
  valveTower: { file: './waterWorks.ts', load: () => import('./waterWorks.ts') },
  windmill: { file: './towers.ts', load: () => import('./towers.ts') },
});
/** The kinds compose.ts places itself whenever a map has set pieces (a building's worn approach paths). */
const COMPOSED_KINDS: readonly string[] = ['path'];

const loadedBuilders: Partial<Record<LandmarkKind, LandmarkBuilder>> = {};
const notLoaded = (kind: string): Error => new Error(`Landmark ${kind} is not loaded: the world build loads its map's set pieces first `
  + '(landmarks/index.ts loadLandmarkBuilders)');
/** The builders by kind: every loaded one (in Node all of them); a table kind not loaded yet throws, any other reads undefined. */
export const LANDMARK_BUILDERS: Readonly<Partial<Record<LandmarkKind, LandmarkBuilder>>> = new Proxy(loadedBuilders, {
  get(target, key, receiver) {
    if (typeof key === 'string' && !Object.hasOwn(target, key) && Object.hasOwn(LANDMARK_TABLE, key)) throw notLoaded(key);
    return Reflect.get(target, key, receiver);
  },
  set: () => false,
  defineProperty: () => false,
  deleteProperty: () => false,
});
function admitBuilders(kind: string, module: LandmarkModule): void {
  if (Object.hasOwn(loadedBuilders, kind)) return;
  const builder = module[kind];
  if (typeof builder !== 'function') throw new Error(`Landmark ${kind}: its module does not export it`);
  loadedBuilders[kind as LandmarkKind] = builder as LandmarkBuilder;
}

/** What a map's set pieces need loaded: their kinds (with every piece they place, and compose's own), and the
 *  architecture styles their builders resolve. Kinds outside the table are left to compose.ts, which skips them. */
export function landmarkKitsOf(placements: readonly LandmarkPlacement[] | null | undefined): { kinds: string[]; styles: string[] } {
  const kinds = new Set<string>(), styles = new Set<string>();
  if (!placements?.length) return { kinds: [], styles: [] };
  const queue: Array<Pick<LandmarkPlacement, 'kind'> & { params?: LandmarkPlacement['params'] }> = [
    ...placements, ...COMPOSED_KINDS.map((kind) => ({ kind: kind as LandmarkKind })),
  ];
  for (let guard = 0; queue.length && guard < 100000; guard++) {
    const placement = queue.shift()!;
    const row = LANDMARK_TABLE[placement.kind];
    if (!row) continue;
    kinds.add(placement.kind);
    if (!row.spawns && !row.styles) continue;
    const params = resolveLandmarkParams(placement as LandmarkPlacement);
    for (const id of row.styles?.(params) ?? []) if (id != null) styles.add(id);
    for (const child of row.spawns?.(params) ?? []) queue.push(child);
  }
  return { kinds: [...kinds], styles: [...styles] };
}

/** Load these kinds' builders (each module once; kinds outside the table are skipped, as compose.ts skips them). */
export async function loadLandmarkBuilders(kinds: Iterable<string>): Promise<void> {
  const wanted = [...new Set(kinds)].filter((kind) => Object.hasOwn(LANDMARK_TABLE, kind) && !Object.hasOwn(loadedBuilders, kind));
  const modules = await Promise.all(wanted.map((kind) => LANDMARK_TABLE[kind].load()));
  wanted.forEach((kind, k) => admitBuilders(kind, modules[k]));
}

// Node: every builder now, synchronously, in the table's order (kitRegistryNode.ts)
{
  const load = nodeKitRequire(import.meta.url);
  if (load) for (const kind of Object.keys(LANDMARK_TABLE)) admitBuilders(kind, load(LANDMARK_TABLE[kind].file));
}
