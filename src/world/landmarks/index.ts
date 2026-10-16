// src/world/landmarks/index.ts — the set-piece builders by kind (the landmarks lane, 2026-10-05). A map authors its set
// pieces in `props.landmarks` (types.ts LandmarkPlacement); plan.ts holds each kind's parameters and footprint,
// compose.ts places them in the props build. Every builder draws the piece in its own frame from its own streams.
import { preloadEveryKit } from '../kitRegistryNode.ts';
import { resolveLandmarkParams } from './plan.ts';
import type { LandmarkBuilder, LandmarkKind, LandmarkParams, LandmarkPlacement } from './types.ts';

// ---- THE LANDMARK REGISTRY (2026-10-15, the perf lane) -------------------------------------------------------------
// Every set-piece kind is ONE ROW of LANDMARK_TABLE: its kind and its module's loader (the builder is the module's
// export of the kind's own name). A new set piece (LOOKS, Lane C, MAPS) is one more row here; nothing else loads a
// builder module on demand. A row may also name what its piece needs beside its own module:
//   spawns — the pieces it places after itself (compose.ts: a built piece's `children`, a square's centre piece);
//   styles — the architecture styles its builder resolves (maps/regional/index.ts: a house row's kit).
// - The browser loads a map's builders when its world build starts (worldKits.ts loadMapKits, from map.ts
//   createMapAsync), so a battle entry downloads and compiles the set pieces its map places, not all of them.
// - Node (the headless collision builds, the server's world, the receipts, the bake tools) loads every builder with this
//   module, in this table's order, before any module importing it runs (kitRegistryNode.ts), as the static imports did.
// A kind of the table read before it is loaded (the browser only) fails closed with its kind: never a silent skip.
type LandmarkModule = Record<string, unknown>;
interface LandmarkRow {
  readonly load: () => Promise<LandmarkModule>;
  readonly spawns?: (params: LandmarkParams) => ReadonlyArray<Pick<LandmarkPlacement, 'kind'> & { params?: LandmarkPlacement['params'] }>;
  readonly styles?: (params: LandmarkParams) => ReadonlyArray<string | null | undefined>;
}
const LANDMARK_TABLE: Readonly<Record<string, LandmarkRow>> = Object.freeze({
  aircraftWreck: { load: () => import('./wrecks.ts') },
  airstrip: { load: () => import('./stations.ts') },
  baileyBridge: { load: () => import('./bridges.ts') },
  bandstand: { load: () => import('./parks.ts') },
  belfry: { load: () => import('./towers.ts') },
  bengalTemple: { load: () => import('./temples.ts') },
  campanile: { load: () => import('./towers.ts') },
  church: { load: () => import('./civic.ts') },
  churchyard: { load: () => import('./parks.ts') },
  colonialBungalow: { load: () => import('./colonial.ts') },
  columnMonument: { load: () => import('./monuments.ts') },
  conveyor: { load: () => import('./mineWorks.ts') },
  drumCache: { load: () => import('./stations.ts') },
  equestrianStatue: { load: () => import('./monuments.ts') },
  fireLookout: { load: () => import('./towers.ts') },
  floodMast: { load: () => import('./airfieldWorks.ts') },
  fuelTankFarm: { load: () => import('./tankFarm.ts') },
  fishRack: { load: () => import('./fjordWorks.ts') },
  fountain: { load: () => import('./parks.ts') },
  garden: { load: () => import('./parks.ts') },
  grainElevator: { load: () => import('./grainElevator.ts') },
  guyedMast: { load: () => import('./stations.ts') },
  headframe: { load: () => import('./mineWorks.ts') },
  jamesway: { load: () => import('./stations.ts') },
  granary: { load: () => import('./civic.ts') },
  houseRow: { load: () => import('./village.ts'),
    styles: (p) => [String(p.kit)] },
  hayRack: { load: () => import('./fjordWorks.ts') },
  khan: { load: () => import('./village.ts') },
  kolkhozArch: { load: () => import('./gates.ts') },
  lavoir: { load: () => import('./village.ts') },
  liftBridge: { load: () => import('./bridges.ts') },
  harbour: { load: () => import('./harbour.ts') },
  lighthouse: { load: () => import('./harbour.ts') },
  marketHall: { load: () => import('./civic.ts') },
  memorialWall: { load: () => import('./monuments.ts') },
  moduleTrain: { load: () => import('./stations.ts') },
  mole: { load: () => import('./harbour.ts') },
  obelisk: { load: () => import('./monuments.ts') },
  oreBin: { load: () => import('./mineWorks.ts') },
  oreCars: { load: () => import('./mining.ts') },
  parkGate: { load: () => import('./parks.ts') },
  outfall: { load: () => import('./parks.ts') },
  parkSquare: { load: () => import('./parks.ts'),
    spawns: (p) => (p.centre === 'none' || p.centre === '' ? [] : [{ kind: String(p.centre) as LandmarkKind }]) },
  path: { load: () => import('./parks.ts') },
  piazza: { load: () => import('./parks.ts') },
  quay: { load: () => import('./harbour.ts') },
  radomeTower: { load: () => import('./stations.ts') },
  statue: { load: () => import('./monuments.ts') },
  slipway: { load: () => import('./harbour.ts') },
  snowFence: { load: () => import('./stations.ts') },
  stairway: { load: () => import('./parks.ts') },
  stabbur: { load: () => import('./fjordWorks.ts') },
  stationHall: { load: () => import('./civic.ts') },
  stoneArchBridge: { load: () => import('./bridges.ts') },
  tennisCourt: { load: () => import('./colonial.ts') },
  torii: { load: () => import('./gates.ts') },
  townGate: { load: () => import('./gates.ts') },
  townHall: { load: () => import('./civic.ts') },
  trestleBridge: { load: () => import('./bridges.ts') },
  triumphalArch: { load: () => import('./gates.ts') },
  troposcatter: { load: () => import('./stations.ts') },
  trussBridge: { load: () => import('./bridges.ts') },
  viaduct: { load: () => import('./bridges.ts') },
  waterTower: { load: () => import('./waterWorks.ts') },
  valveTower: { load: () => import('./waterWorks.ts') },
  windmill: { load: () => import('./towers.ts') },
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

// Node: every builder now, one module after another in the table's order (kitRegistryNode.ts)
if (preloadEveryKit()) for (const kind of Object.keys(LANDMARK_TABLE)) admitBuilders(kind, await LANDMARK_TABLE[kind].load());
