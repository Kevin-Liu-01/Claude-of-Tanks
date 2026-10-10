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
  /** The piece is all dressing (a square's green, a path, a churchyard without its gateway): no solid, no collision record. */
  dressing?: (p: LandmarkParams) => boolean;
  /** The piece follows the ground itself (draped paving and beds, a terrace that levels itself and banks to the slope):
   *  the composer seats it at any fall under its footprint (the 3.2 m limit keeps a rigid piece from burying its side). */
  drapes?: boolean;
  /** Its surface carries the map's street life (a market square's setts, a path): on a vetoed ground (types.ts `ground`)
   *  what the passes after it stand on it stays. */
  open?: boolean;
  /** Its solid as rectangles in its frame ([cx, cz, hw, hl]) where the footprint's one rectangle overstates it (a gate's
   *  tower between thin wall stubs): the composer tests these, not the footprint, against the solids already standing,
   *  and a vetoed ground is theirs. */
  solids?: (p: LandmarkParams) => ReadonlyArray<readonly [number, number, number, number]>;
  /** The ground it is seated on, [hw, hl], where its footprint reaches past it (a tower mill's sails sweep over ground
   *  its base never touches): the composer seats it, and measures its fall, on this rectangle alone. */
  seat?: (p: LandmarkParams) => readonly [number, number] | null;
}

/** True when a placement builds no solid (plan.ts `dressing`): it publishes no collision record. */
export function isDressingPiece(placement: LandmarkPlacement): boolean {
  return LANDMARK_KINDS[placement.kind].dressing?.(resolveLandmarkParams(placement)) ?? false;
}

const num = (p: LandmarkParams, key: string): number => Number(p[key]);

/** A town gate's two wall stubs, -x and +x of its passage (m): each its own length, else `walls`. */
export function gateStubs(p: LandmarkParams): readonly [number, number] {
  const walls = Math.max(0, num(p, 'walls')), own = (key: string): number => (num(p, key) >= 0 ? num(p, key) : walls);
  return [own('wallsLeft'), own('wallsRight')];
}

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
  obelisk: { family: 'monument', defaults: { height: 9, finial: 'star', railing: true, inscription: '' },
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
  // (style 'ottoman': the octagonal basin round its pillar, its corners on the radius / cos 22.5 degrees; style 'markt':
  // the Franconian trough on its step, 0.6 m past the corners)
  fountain: { family: 'park', defaults: { radius: 4.5, tiers: 2, style: 'tiered' },
    footprint: (p) => { const r = (p.style === 'ottoman' ? num(p, 'radius') / Math.cos(Math.PI / 8) + 0.1 : p.style === 'markt' ? num(p, 'radius') / Math.cos(Math.PI / 8) + 0.6 : num(p, 'radius')) + 0.4; return [r, r]; } },
  bandstand: { family: 'park', defaults: { radius: 4.2 },
    footprint: (p) => [num(p, 'radius') + 0.9, num(p, 'radius') + 0.9] },
  // (the end piers' caps past the railings; the open leaves swing 2 m into the park)
  parkGate: { family: 'park', spansRoad: true, defaults: { width: 4.4, railing: 10 },
    footprint: (p) => [num(p, 'width') / 2 + num(p, 'railing') + 2.3, 2.2] },
  // a square: a lawn, its paths and railing, benches and lamps (the props destructibles) round a centre piece
  parkSquare: { family: 'park', dressing: () => true, defaults: { width: 30, depth: 24, paths: 'cross', railing: true, benches: 4, lamps: 4, centre: 'none', centreHeight: 0 },
    footprint: (p) => [num(p, 'width') / 2 + 1.0, num(p, 'depth') / 2 + 1.0] },
  // the ground before a church's front: its fence round the open sides, the holy gate (or a plain one), the path and
  // the graves (the gateway's piers and cornice 0.35 m past the front fence)
  churchyard: { family: 'park', drapes: true, dressing: (p) => p.holyGate === false || p.gate === 'left' || p.gate === 'right', defaults: { width: 24, depth: 12, fence: 'fencepicket', holyGate: true, path: 1.6,
    graves: 10, tradition: 'orthodox', back: 'open', gate: 'front' },
    footprint: (p) => [num(p, 'width') / 2 + 0.4, num(p, 'depth') / 2 + (p.holyGate === false ? 0.4 : 0.8)] },
  // a garden: its fence round a lawn, the gate in its front (+z), the gravel path from the gate to its back, the borders
  // and the box at the path's mouth
  garden: { family: 'park', drapes: true, dressing: () => true, defaults: { width: 14, depth: 10, fence: 'fencepicket', path: 1.4, back: 'open', beds: true },
    footprint: (p) => [num(p, 'width') / 2 + 0.3, num(p, 'depth') / 2 + 0.8] },
  // a path draped over the ground from the piece's origin along its +z (`length` m, `width` wide): flagstones or setts
  // (the map's masonry), gravel or beaten earth — an approach from a road to a gate, a track to a door. It meets the road
  // it leaves (no road margin) and stands on nothing.
  path: { family: 'park', roadMargin: 0, drapes: true, open: true, dressing: () => true, defaults: { length: 12, width: 1.6, surface: 'stone' },
    footprint: (p) => [num(p, 'width') / 2 + 0.2, num(p, 'length') / 2 + 0.2] },
  // a stepped lane from the piece's origin along its +z (`length` m, `width` wide): its landings paved over the ground and
  // a flight of steps set into every stretch steeper than `steep` (stone blocks, or a mule stair's curbs and treads:
  // `steps: 'cordonata'`), risers near `rise` m, low stone kerbs either side (0.22 m past the width). It meets the road it
  // leaves (no road margin) and stands on nothing (the map-revival lane, 2026-10-07: Orchard's village lanes).
  stairway: { family: 'park', roadMargin: 0, drapes: true, open: true, dressing: () => true,
    defaults: { length: 12, width: 2.4, surface: 'stone', steps: 'block', rise: 0.17, steep: 0.25, kerbs: true },
    footprint: (p) => [num(p, 'width') / 2 + 0.35, num(p, 'length') / 2 + 0.2] },
  // ------------------------------------------------------------------------------------------------ gates and arches
  // (`wallsLeft` / `wallsRight`: each stub's own length, -x / +x of the passage, where the road crosses a gap in the wall
  // off its middle; a negative value takes `walls`)
  townGate: { family: 'gate', spansRoad: true, defaults: { passage: 5, height: 18, depth: 8, walls: 6, wallsLeft: -1, wallsRight: -1 },
    footprint: (p) => [num(p, 'passage') / 2 + 2.4 + Math.max(...gateStubs(p)), num(p, 'depth') / 2 + 0.6],
    // the tower over the passage, and each wall stub with its wall-walk behind it (gates.ts: the stub 0.6 m either side
    // of the wall's line, the walk on its corbels a metre behind): a house standing a few metres behind the wall is no
    // conflict
    solids: (p) => {
      const tower = num(p, 'passage') / 2 + 2.4, d = num(p, 'depth') / 2 + 0.6, [left, right] = gateStubs(p);
      const stubs: Array<readonly [number, number, number, number]> = [];
      if (left > 0) stubs.push([-(tower + left / 2), -0.5, left / 2, 1.1]);
      if (right > 0) stubs.push([tower + right / 2, -0.5, right / 2, 1.1]);
      return [[0, 0, tower, d], ...stubs];
    } },
  triumphalArch: { family: 'gate', spansRoad: true, defaults: { passage: 7, height: 16, arches: 1 },
    footprint: (p) => [(num(p, 'arches') > 1 ? num(p, 'passage') * 1.9 : num(p, 'passage') / 2 + 3.4) + 0.4, 3.4] },
  // (the flags stream a metre past the pillars)
  // (`sign`: the farm's name on the banner, both faces; `wings`: a fence run of that length off each pillar, the props'
  // own destructible `wingFence` modules)
  kolkhozArch: { family: 'gate', spansRoad: true, defaults: { span: 10, height: 6.2, sign: 'КОЛХОЗ «КРАСНЫЙ ОКТЯБРЬ»', wings: 0, wingFence: 'fencepicket' },
    footprint: (p) => [num(p, 'span') / 2 + 1.7 + Math.max(0, num(p, 'wings')), 0.9] },
  torii: { family: 'gate', spansRoad: true, defaults: { span: 6, height: 7.5 },
    footprint: (p) => [num(p, 'span') / 2 + 1.6, 0.9] },
  // ------------------------------------------------------------------------------------------------ towers
  // (style 'podhale': the timber dzwonnica, its pent roof skirting the battered lower storey inside the side at its foot)
  belfry: { family: 'tower', defaults: { height: 26, side: 6, crown: 'onion', style: 'masonry' },
    footprint: (p) => [num(p, 'side') / 2 + 0.8, num(p, 'side') / 2 + 0.8] },
  // (its broad step and the door's flight are dressing within a metre of the shaft: the footprint, and the ground it
  // reserves, stay the shaft's own)
  campanile: { family: 'tower', defaults: { height: 30, side: 5 },
    footprint: (p) => [num(p, 'side') / 2 + 0.5, num(p, 'side') / 2 + 0.5] },
  waterTower: { family: 'tower', defaults: { height: 18, style: 'railway' },
    footprint: (p) => { const r = p.style === 'railway' ? 4.6 : p.style === 'rozhnovsky' ? 3.4 : 4.2; return [r, r]; } },
  fireLookout: { family: 'tower', defaults: { height: 22 },
    footprint: (p) => { const r = 2.6 + num(p, 'height') * 0.05; return [r, r]; } },
  // ------------------------------------------------------------------------------------------------ village works
  // (the floor a step proud of the walls, the hipped roof's eaves past them)
  lavoir: { family: 'civic', defaults: { length: 12, depth: 7, bays: 3 },
    footprint: (p) => [num(p, 'length') / 2 + 0.6, num(p, 'depth') / 2 + 0.6] },
  // (the street range alone for `form: 'arcade'`; the gate's dressed frame 0.25 m proud of the street front)
  // (`forecourt`: a paved front that deep before the street front; the footprint keeps its depth both ways)
  khan: { family: 'civic', defaults: { width: 26, depth: 24, range: 6, form: 'court', forecourt: 0 },
    footprint: (p) => [num(p, 'width') / 2 + 0.2 + (num(p, 'forecourt') > 0 ? 0.6 : 0),
      (p.form === 'arcade' ? num(p, 'range') : num(p, 'depth')) / 2 + 0.45 + Math.max(0, num(p, 'forecourt') || 0)] },
  // ------------------------------------------------------------------------------------------------ harbour works
  // (the light's battered plinth, and the skerry's boulders round it when it stands on a rock: harbour.ts lighthouse)
  lighthouse: { family: 'harbour', inWater: true, defaults: { height: 11, radius: 1.6, paint: 'red', base: 'plinth', rise: 1.5 },
    footprint: (p) => { const r = num(p, 'radius') + 1.1 + (p.base === 'rock' ? 1.3 : 0.05); return [r, r]; } },
  // (the frame from the root's end to the round head's: the light's axis `length` from the root, the head's platform
  // half the width and 1.6 m past it, the batter; the steps by the root stand inside the head's width)
  // a quay wall `length` along the sea (local x), its top `top` over the lowest ground, `depth` back to the land
  quay: { family: 'harbour', inWater: true, drapes: true, defaults: { length: 40, depth: 14, top: 1.4 },
    footprint: (p) => [num(p, 'length') / 2 + 0.4, num(p, 'depth') / 2 + 0.4] },
  // a slipway running down along +z from its head into the water (dressing)
  slipway: { family: 'harbour', inWater: true, drapes: true, dressing: () => true, defaults: { length: 12, width: 5, head: 0.2, toe: -0.6 },
    footprint: (p) => [num(p, 'width') / 2 + 0.4, num(p, 'length') / 2 + 0.3] },
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
      : p.style === 'tower' ? [12.0, 8.0] : [Math.min(10, num(p, 'height') - 2.1) + 0.6, 9.2]),
    // (a tower mill stands on its brick base, 4.5 m round: on a terp's crest its sails' span reaches over the batter)
    seat: (p) => (p.style === 'tower' ? [4.6, 4.6] : null) },
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
  // (round 2: the banks fall from the terrace's edge to the slope, `bank` metres out at most; `steps` the side whose bank
  // carries a flight of steps, -1, +1 or 0)
  tennisCourt: { family: 'park', drapes: true, defaults: { damage: 0, steps: 0, bank: 4 },
    footprint: (p) => [9.9 + 0.5 + Math.max(0, num(p, 'bank')), 19.1 + 0.5 + Math.max(0, num(p, 'bank'))] },
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
 * with a working margin — or, for a kind that names its solid's rectangles (a gate's tower and its wall stubs), each of
 * those with the margin, so a gate's short stub clears no trees past its end. A map without set pieces gets none, and its
 * vegetation is exact.
 */
export function landmarkClearances(landmarks: readonly LandmarkPlacement[] | null | undefined): StructureClearance[] {
  if (!landmarks?.length) return [];
  return landmarks.flatMap((placement) => {
    const yaw = (placement.yawDeg ?? 0) * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw);
    const params = resolveLandmarkParams(placement), spec = LANDMARK_KINDS[placement.kind];
    const rects = spec.solids?.(params) ?? [[0, 0, ...spec.footprint(params)] as const];
    return rects.map(([cx, cz, hw, hl]) => ({ x: placement.x + cx * c + cz * s, z: placement.z - cx * s + cz * c,
      halfWidth: hw + TREE_MARGIN_M, halfLength: hl + TREE_MARGIN_M, cos: c, sin: s }));
  });
}
