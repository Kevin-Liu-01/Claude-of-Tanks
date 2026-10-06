// src/world/landmarks/plan.ts — the set-piece library's renderer-free plan (the landmarks lane, 2026-10-05): every
// kind's family, parameters and defaults, the footprint it stands on, and the ground the vegetation keeps clear for it
// (the trees grow before the props exist, so the clearance is read from the map config alone, as sceneryPlan.ts does).
import type { LandmarkKind, LandmarkParams, LandmarkPlacement } from './types.ts';
import type { StructureClearance } from '../vegetationClearance.ts';

type LandmarkFamily = 'bridge' | 'monument' | 'park' | 'gate' | 'tower' | 'civic' | 'wreck' | 'harbour';

interface LandmarkKindSpec {
  family: LandmarkFamily;
  /** The parameters a map may author, with their defaults (numbers in metres unless named otherwise). */
  defaults: LandmarkParams;
  /** Half extents of the standing footprint in the piece's frame: [across (x), along (z)]. */
  footprint(p: LandmarkParams): readonly [number, number];
  /** The piece stands astride a road (a gate, an arch, a bridge): the road admission is its passage's, not its body's. */
  spansRoad?: boolean;
  /** How far its footprint keeps from a road's line (default the carriageway's 3.5 m core): a plot a map lane hands over
   *  against an apron (whose paving the road field counts) keeps none. */
  roadMargin?: number;
  /** The piece stands in the water and reaches its bank (a reservoir's valve tower and its bridge): the composer admits
   *  water under its footprint and the bank's fall above its foot, as it does a bridge's. */
  inWater?: boolean;
}

const num = (p: LandmarkParams, key: string): number => Number(p[key]);

/** The kinds, their parameters and their footprints. */
export const LANDMARK_KINDS: Readonly<Record<LandmarkKind, LandmarkKindSpec>> = Object.freeze({
  // ------------------------------------------------------------------------------------------------ bridges
  // span: abutment face to abutment face; deck: the deck's top over the piece's ground (y = 0 at the stream bed)
  // (the wing walls splay 3 m out into the banks past the end posts)
  stoneArchBridge: { family: 'bridge', spansRoad: true, defaults: { span: 30, width: 7, arches: 3, deck: 5, drivable: true },
    footprint: (p) => [num(p, 'width') / 2 + 3.4, num(p, 'span') / 2 + 5.4] },
  // (the footways cantilever 2 m outside the trusses)
  trussBridge: { family: 'bridge', spansRoad: true, defaults: { span: 42, width: 7, panels: 7, deck: 5, truss: 6, drivable: true },
    footprint: (p) => [num(p, 'width') / 2 + 2.3, num(p, 'span') / 2 + 4] },
  trestleBridge: { family: 'bridge', spansRoad: true, defaults: { span: 24, width: 5, deck: 4, drivable: true },
    footprint: (p) => [num(p, 'width') / 2 + 1.5, num(p, 'span') / 2 + 2] },
  baileyBridge: { family: 'bridge', spansRoad: true, defaults: { bays: 8, width: 4.2, deck: 2.4, drivable: true },
    footprint: (p) => [num(p, 'width') / 2 + 1.0, num(p, 'bays') * 3.048 / 2 + 6] },
  // (the abutments run 3.2 m back into the banks; the balance beams' tails reach back over the approaches)
  // (the balances' tails reach back over the approach; the long form — `approach` or `rise` — runs on over its lift piers,
  // its fixed spans, its abutments and its ramps, each ramp at most (rise + 0.5) / grade long: bridges.ts liftBridge)
  liftBridge: { family: 'bridge', spansRoad: true, defaults: { span: 14, width: 5.5, deck: 2.4, drivable: true, approach: 0, rise: 0, grade: 1 / 7 },
    footprint: (p) => {
      const span = num(p, 'span'), approach = Math.max(0, num(p, 'approach')), rise = Math.max(0, num(p, 'rise'));
      const balances = span / 2 + 0.75 + Math.max(3.6, span * 0.42);
      const grade = Math.min(0.25, Math.max(0.05, num(p, 'grade')));
      const long = approach > 0 || rise > 0 ? span / 2 + (approach > 0 ? 2.6 : 0) + approach + 3.2 + (rise > 0 ? (rise + 0.5) / grade : 0) + 0.3 : 0;
      return [num(p, 'width') / 2 + 1.1, Math.max(balances, long)];
    } },
  viaduct: { family: 'bridge', defaults: { arches: 7, archSpan: 12, height: 22, width: 8 },
    footprint: (p) => [num(p, 'width') / 2 + 0.8, (num(p, 'arches') * (num(p, 'archSpan') + 3) + 3) / 2] },
  // ------------------------------------------------------------------------------------------------ monuments
  obelisk: { family: 'monument', defaults: { height: 9, finial: 'star', railing: true },
    footprint: (p) => { const r = 1.6 + num(p, 'height') * 0.12 + (p.railing ? 1.4 : 0); return [r, r]; } },
  columnMonument: { family: 'monument', defaults: { height: 16 },
    footprint: (p) => { const r = 2.2 + num(p, 'height') * 0.1; return [r, r]; } },
  memorialWall: { family: 'monument', defaults: { length: 18, height: 3.2, flame: true },
    footprint: (p) => [num(p, 'length') / 2 + 1.5, 4.5] },
  statue: { family: 'monument', defaults: { height: 3.2, plinth: 3.0, pose: 'greatcoat', metal: 'bronze' },
    footprint: (p) => { const r = 1.5 + num(p, 'plinth') * 0.35; return [r, r]; } },
  equestrianStatue: { family: 'monument', defaults: { scale: 1.6, plinth: 3.6 },
    footprint: (p) => [1.6 + num(p, 'scale') * 0.9, 2.6 + num(p, 'scale') * 1.7] },
  // ------------------------------------------------------------------------------------------------ parks and squares
  fountain: { family: 'park', defaults: { radius: 4.5, tiers: 2 },
    footprint: (p) => [num(p, 'radius') + 0.4, num(p, 'radius') + 0.4] },
  bandstand: { family: 'park', defaults: { radius: 4.2 },
    footprint: (p) => [num(p, 'radius') + 0.9, num(p, 'radius') + 0.9] },
  // (the end piers' caps past the railings; the open leaves swing 2 m into the park)
  parkGate: { family: 'park', spansRoad: true, defaults: { width: 4.4, railing: 10 },
    footprint: (p) => [num(p, 'width') / 2 + num(p, 'railing') + 2.3, 2.2] },
  // a square: a lawn, its paths and railing, benches and lamps (the props destructibles) round a centre piece
  parkSquare: { family: 'park', defaults: { width: 30, depth: 24, paths: 'cross', railing: true, benches: 4, lamps: 4, centre: 'none', centreHeight: 0 },
    footprint: (p) => [num(p, 'width') / 2 + 1.0, num(p, 'depth') / 2 + 1.0] },
  // ------------------------------------------------------------------------------------------------ gates and arches
  townGate: { family: 'gate', spansRoad: true, defaults: { passage: 5, height: 18, depth: 8, walls: 6 },
    footprint: (p) => [num(p, 'passage') / 2 + 2.4 + num(p, 'walls'), num(p, 'depth') / 2 + 0.6] },
  triumphalArch: { family: 'gate', spansRoad: true, defaults: { passage: 7, height: 16, arches: 1 },
    footprint: (p) => [(num(p, 'arches') > 1 ? num(p, 'passage') * 1.9 : num(p, 'passage') / 2 + 3.4) + 0.4, 3.4] },
  // (the flags stream a metre past the pillars)
  kolkhozArch: { family: 'gate', spansRoad: true, defaults: { span: 10, height: 6.2 },
    footprint: (p) => [num(p, 'span') / 2 + 1.7, 0.9] },
  torii: { family: 'gate', spansRoad: true, defaults: { span: 6, height: 7.5 },
    footprint: (p) => [num(p, 'span') / 2 + 1.6, 0.9] },
  // ------------------------------------------------------------------------------------------------ towers
  belfry: { family: 'tower', defaults: { height: 26, side: 6, crown: 'onion' },
    footprint: (p) => [num(p, 'side') / 2 + 0.8, num(p, 'side') / 2 + 0.8] },
  campanile: { family: 'tower', defaults: { height: 30, side: 5 },
    footprint: (p) => [num(p, 'side') / 2 + 0.5, num(p, 'side') / 2 + 0.5] },
  waterTower: { family: 'tower', defaults: { height: 18, style: 'railway' },
    footprint: (p) => { const r = p.style === 'railway' ? 4.6 : p.style === 'rozhnovsky' ? 3.4 : 4.2; return [r, r]; } },
  fireLookout: { family: 'tower', defaults: { height: 22 },
    footprint: (p) => { const r = 2.6 + num(p, 'height') * 0.05; return [r, r]; } },
  // ------------------------------------------------------------------------------------------------ harbour works
  // (the light's battered plinth, and the skerry's boulders round it when it stands on a rock: harbour.ts lighthouse)
  lighthouse: { family: 'harbour', inWater: true, defaults: { height: 11, radius: 1.6, paint: 'red', base: 'plinth', rise: 1.5 },
    footprint: (p) => { const r = num(p, 'radius') + 1.1 + (p.base === 'rock' ? 1.3 : 0.05); return [r, r]; } },
  // (the frame from the root's end to the round head's: the light's axis `length` from the root, the head's platform
  // half the width and 1.6 m past it, the batter; the steps by the root stand inside the head's width)
  mole: { family: 'harbour', inWater: true,
    defaults: { length: 40, width: 6, deck: 2.2, sea: 'left', light: 'red', height: 11, radius: 1.6 },
    footprint: (p) => { const Rh = num(p, 'width') / 2 + 1.6; return [Rh + 0.45, (num(p, 'length') + Rh) / 2 + 0.45]; } },
  // (the tower's axis at (bridge - radius) / 2 along its frame, the bridge's bank end at -(bridge + radius) / 2: the whole
  // piece centred on its frame; its batter, cornice and roof 1.1 m past the shaft)
  valveTower: { family: 'tower', inWater: true, defaults: { radius: 4.2, bridge: 34, width: 3.2, chamber: 5.4 },
    footprint: (p) => [Math.max(num(p, 'radius') + 1.1, num(p, 'width') / 2 + 1.2), (num(p, 'bridge') + num(p, 'radius')) / 2 + 1.1] },
  // (the sails sweep a disc across the front; the tail pole reaches back to its capstan)
  windmill: { family: 'tower', defaults: { style: 'smock', height: 14 },
    footprint: (p) => (p.style === 'post' ? [Math.min(9.5, num(p, 'height') - 3.6) + 0.6, 8.0]
      : p.style === 'tower' ? [12.0, 8.0] : [Math.min(10, num(p, 'height') - 2.1) + 0.6, 9.2]) },
  // ------------------------------------------------------------------------------------------------ civic buildings
  church: { family: 'civic', defaults: { tradition: 'orthodox', length: 30, width: 11, tower: 27, domes: 1 },
    // (the porticos with their steps stand 3 m off the cube's north and south faces)
    // (an Orthodox church's porticos stand 3 m off the cube; a Western church's apse rounds off past its chancel)
    footprint: (p) => (p.tradition === 'orthodox' ? [num(p, 'width') / 2 + 3.1, num(p, 'length') / 2 + 1.4]
      : [num(p, 'width') / 2 + 1.0, num(p, 'length') / 2 + num(p, 'width') * 0.36 + 0.6]) },
  // (frame: the Hessian Fachwerk-Rathaus, its corner turrets 1.3 m proud of the front)
  townHall: { family: 'civic', defaults: { width: 22, depth: 13, storeys: 3, tower: 34, frame: false },
    footprint: (p) => [num(p, 'width') / 2 + (p.frame ? 1.5 : 1.0), num(p, 'depth') / 2 + 1.6] },
  stationHall: { family: 'civic', defaults: { length: 34, depth: 10, canopy: 30 },
    // the platform canopy stands on the +z (track) side
    footprint: (p) => [Math.max(num(p, 'length'), num(p, 'canopy')) / 2 + 2.2, num(p, 'depth') / 2 + 5.4] },
  marketHall: { family: 'civic', defaults: { length: 26, width: 13, bays: 6 },
    footprint: (p) => [num(p, 'width') / 2 + 0.8, num(p, 'length') / 2 + 0.8] },
  grainElevator: { family: 'civic', defaults: { rows: 2, cols: 4, radius: 3.2, height: 28, head: 38 },
    // the silos along x, the head house at their +x end
    footprint: (p) => [num(p, 'cols') * num(p, 'radius') + 9.0, num(p, 'rows') * num(p, 'radius') + 1.4] },
  // ------------------------------------------------------------------------------------------------ colonial
  // the Deputy Commissioner's bungalow: the body, its verandas on the front and both ends, the porch and its steps (the
  // front is +z)
  colonialBungalow: { family: 'civic', defaults: { width: 17, depth: 11, veranda: 2.6, damage: 0 },
    footprint: (p) => [num(p, 'width') / 2 + num(p, 'veranda') + 0.7, num(p, 'depth') / 2 + num(p, 'veranda') + 3.9] },
  // the terraced tennis court (a doubles court and its run-off, 36.6 × 18.3 m) and its retaining walls
  tennisCourt: { family: 'park', defaults: { damage: 0 }, footprint: () => [9.9, 19.1] as const },
  // ------------------------------------------------------------------------------------------------ temples
  // the Bengal aat-chala temple: the plinth (0.9 m round the cella), the steps 1.3 m out at the front, the eaves' overhang
  bengalTemple: { family: 'civic', defaults: { side: 7.5 },
    footprint: (p) => [num(p, 'side') / 2 + 1.1, num(p, 'side') / 2 + 2.2] },
  // ------------------------------------------------------------------------------------------------ wrecks
  // the An-225 Mriya in the ruin of its hangar (Hostomel, February 2022): a plot `width` × `depth` whose open front (+z)
  // faces an apron, and a `strip` beyond it where burnt debris spills (dressing only); the piece's origin is the centre
  // of plot and strip together
  aircraftWreck: { family: 'wreck', roadMargin: 0, defaults: { model: 'an225', width: 56, depth: 36, strip: 12 },
    footprint: (p) => [num(p, 'width') / 2, (num(p, 'depth') + num(p, 'strip') + 2) / 2] },
  // a collective farm's grain store (zernosklad): a long single-storey store, its loading doors and ramps on the front
  granary: { family: 'civic', defaults: { length: 30, width: 11, walls: 'brick' },
    footprint: (p) => [num(p, 'length') / 2 + 0.8, num(p, 'width') / 2 + 2.6] },
});

/** A placement's parameters over its kind's defaults. An unknown kind fails closed. */
export function resolveLandmarkParams(placement: LandmarkPlacement): LandmarkParams {
  const spec = LANDMARK_KINDS[placement.kind];
  if (!spec) throw new Error(`Unknown landmark kind ${placement.kind}`);
  const authored = Object.entries(placement.params ?? {}).filter((entry): entry is [string, number | string | boolean] => entry[1] !== undefined);
  return Object.freeze({ ...spec.defaults, ...Object.fromEntries(authored) });
}

/** The standing footprint's half extents [across, along] of a placement. */
export function landmarkFootprint(placement: LandmarkPlacement): readonly [number, number] {
  return LANDMARK_KINDS[placement.kind].footprint(resolveLandmarkParams(placement));
}

/** The vegetation's working margin round a set piece (eaves, scaffolding, a crown's sway). */
const TREE_MARGIN_M = 2.5;

/**
 * The vegetation keep-out of a map's set pieces, from its config alone: each piece's footprint, turned to its heading,
 * with a working margin. A map without set pieces gets none, and its vegetation is exact.
 */
export function landmarkClearances(landmarks: readonly LandmarkPlacement[] | null | undefined): StructureClearance[] {
  if (!landmarks?.length) return [];
  return landmarks.map((placement) => {
    const [hw, hl] = landmarkFootprint(placement);
    const yaw = (placement.yawDeg ?? 0) * Math.PI / 180;
    return { x: placement.x, z: placement.z, halfWidth: hw + TREE_MARGIN_M, halfLength: hl + TREE_MARGIN_M,
      cos: Math.cos(yaw), sin: Math.sin(yaw) };
  });
}
