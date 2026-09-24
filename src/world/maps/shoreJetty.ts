// src/world/maps/shoreJetty.ts — round 58 (2026-09-24): a jetty at the water's edge, derived from the lake's authored
// contour and its water level.
//
// The coastal kit's jetty stood at 1.05 R of the lake DISC: 15–30 m inland on Saltmere Bay's flat strand, ten metres
// up the bank on Nordhavn's arm heads, with fixed-height piles and a deck that sagged toward water it never reached.
// This module plans a jetty from the laws the strand's wrack line reads (strandWrack.ts): along the shore azimuth the
// water's edge is the first dry water-mask metre, the sand's end the union wetness under the seaSand threshold, and
// the wrack band between them is the high-water mark. The deck's shore end stands a metre landward of that band on
// the dry upper strand; the deck runs seaward in the kit's 1.9 m spans until it stands over the lake's planar core
// (mask 1, the bed at the level) with room for a boat alongside — sized to the shelf it crosses, or to an authored
// length; its height is a constant freeboard over the water surface at the tip (the sheet's own law: bed + depth);
// every pile is as long as the deck is high over the bed beneath it (mapKits jetty with a support field). A gangway
// steps from the sand up to the shore end; a boat moors alongside the outer spans where the whole hull floats over
// the core. Nothing is hand-placed: an azimuth's contour either admits a jetty of the kit's length or it does not,
// and a headland face or rock flank that admits none keeps its shore.

import { shorelineRadiusAt } from '../shoreline.ts';
import { strandBandAt, wrackBand, type StrandHeightField, type StrandLake } from './strandWrack.ts';

export interface ShoreJettyField extends StrandHeightField {
  /** The sheet's depth over the bed (bed + depth is the water surface); absent, the surface is the level. */
  getWaterDepthAt?(x: number, z: number): number;
}

export interface ShoreJettyOptions {
  /** Complete 1.9 m spans (an authored pier); omitted, the deck is sized to the shelf within 4–10 spans. */
  spans?: number;
  /** Playable half-extent for dressing (the coastal kit's 470 m). */
  extent?: number;
  spawns?: readonly { x: number; z: number }[];
}

export interface ShoreJettyPlan {
  /** The deck's shore end on the dry upper strand. */
  x: number;
  z: number;
  /** Deck direction, seaward (the shore azimuth + π). */
  angle: number;
  /** The shore azimuth from the lake centre. */
  azimuth: number;
  spans: number;
  length: number;
  /** Deck centre height; the planks are 0.09 m thick, so the top is deckY + 0.045. */
  deckY: number;
  /** The water surface at the tip (bed + depth). */
  surface: number;
  level: number;
  /** Radii from the lake centre: the shore end, the water's edge, the planar core's boundary, the tip. */
  shoreR: number;
  edge: number;
  core: number;
  tipR: number;
  /** The gangway from the sand up to the shore end (its run landward along the axis and the ground at its foot);
   * null where the deck lands on the bank at grade. */
  gangway: { run: number; groundY: number } | null;
  /** Where a boat moors: metres seaward of the shore end along the deck, and which side of it (deck width axis). */
  boat: { along: number; side: 1 | -1 } | null;
}

export const JETTY_SPAN_M = 1.9; // the kit's deck span (mapKits jetty)
export const JETTY_DECK_HALF_WIDTH_M = 0.75; // 1.5 m planks
export const JETTY_DECK_THICKNESS_M = 0.09;
export const JETTY_MIN_SPANS = 4; // 7.6 m, the river-landing kit's floor
export const JETTY_MAX_SPANS = 10; // 19 m, its ceiling
export const JETTY_SHORE_MARGIN_M = 1.0; // the shore end stands this far landward of the wrack band's end
export const JETTY_OVER_CORE_M = 4.6; // deck over the planar core past its boundary: a moored hull's length and a span
export const JETTY_FREEBOARD_M = 0.45; // deck top above the water surface
export const JETTY_ROAD_CLEARANCE_M = 7; // the river landings' clearance
export const JETTY_SPAWN_CLEARANCE_M = 26; // the terrain's own pad law
export const JETTY_BANK_CLEARANCE_M = 0.30; // the ground under every station past the shore end stays this far below the underside
export const JETTY_BANK_LANDING_M = 0.05; // on a bank shore the deck lands where the ground comes this close to its underside
export const JETTY_CORE_SEARCH_M = 12; // how far inside the water's edge the planar core is looked for
export const GANGWAY_MIN_RISE_M = 0.40; // a shore end higher than this over the ground gets a gangway
export const GANGWAY_GRADE = 0.36; // rise per metre of run (~20°)
export const GANGWAY_MIN_RUN_M = 1.9;
export const GANGWAY_MAX_RUN_M = 4.2;
export const MOORED_BOAT_HALF_LENGTH_M = 2.9; // the kit's longest clinker hull
export const MOORED_BOAT_HALF_BEAM_M = 0.8;
export const MOORED_BOAT_GAP_M = 0.35; // fender gap between the deck edge and the hull
export const MOORED_BOAT_DRAFT_M = 0.28; // the hull bottom below the surface (the bed lies 0.72 m under it)
const EXTENT_M = 470;

/** Plan a jetty at the shore azimuth of a sea lake, or null where its contour admits none. */
export function planShoreJetty(
  field: ShoreJettyField, lake: StrandLake, azimuth: number, options: ShoreJettyOptions = {},
): ShoreJettyPlan | null {
  if (lake.shelfM === undefined || !Number.isFinite(lake.level) || !(lake.r > 0)) return null;
  if (options.spans !== undefined && (!Number.isInteger(options.spans) || options.spans < 1)) {
    throw new RangeError('spans must be a positive whole number of 1.9 m spans');
  }
  const level = lake.level!;
  const band = strandBandAt(field, lake, azimuth);
  if (!band) return null;
  const extent = options.extent ?? EXTENT_M;
  const cos = Math.cos(azimuth), sin = Math.sin(azimuth);
  // the deck frame: origin at the shore end, d seaward along the axis, a across it (the kit's deck width axis)
  const angle = azimuth + Math.PI;
  const dx = Math.cos(angle), dz = Math.sin(angle), ax = -dz, az = dx;
  const radial = (r: number): [number, number] => [lake.x + cos * r, lake.z + sin * r];
  const isCore = (px: number, pz: number): boolean =>
    field.getWaterMaskAt(px, pz) === 1 && Math.abs(field.getHeightAt(px, pz) - level) <= 1e-6;
  const coreAcross = (r: number): boolean => {
    const [cx, cz] = radial(r);
    for (const across of [-JETTY_DECK_HALF_WIDTH_M, 0, JETTY_DECK_HALF_WIDTH_M]) {
      if (!isCore(cx + ax * across, cz + az * across)) return false;
    }
    return true;
  };
  const clear = (px: number, pz: number): boolean => {
    if (Math.max(Math.abs(px), Math.abs(pz)) > extent) return false;
    if (field._roadDist(px, pz) < JETTY_ROAD_CLEARANCE_M) return false;
    if (options.spawns) for (const spawn of options.spawns) {
      if (Math.hypot(px - spawn.x, pz - spawn.z) < JETTY_SPAWN_CLEARANCE_M) return false;
    }
    return true;
  };
  // the planar core's boundary inside the water's edge, the deck's full width
  let core = NaN;
  for (let r = band.edge; r >= band.edge - JETTY_CORE_SEARCH_M; r -= 0.25) if (coreAcross(r)) { core = r; break; }
  if (Number.isNaN(core)) return null;
  // the deck: a constant freeboard over the water surface, which is the same over the whole planar core (bed + depth)
  const [coreX, coreZ] = radial(core);
  const surface = level + (field.getWaterDepthAt?.(coreX, coreZ) ?? 0);
  const deckY = surface + JETTY_FREEBOARD_M - JETTY_DECK_THICKNESS_M / 2;
  const underside = deckY - JETTY_DECK_THICKNESS_M / 2, top = deckY + JETTY_DECK_THICKNESS_M / 2;
  const groundAcross = (r: number): number => {
    const [cx, cz] = radial(r);
    let highest = -Infinity;
    for (const across of [-JETTY_DECK_HALF_WIDTH_M, 0, JETTY_DECK_HALF_WIDTH_M]) {
      highest = Math.max(highest, field.getHeightAt(cx + ax * across, cz + az * across));
    }
    return highest;
  };
  // the shore end: a metre landward of the wrack band on a flat strand (Saltmere, Saltwind — the deck stands over the
  // sand and a gangway climbs to it); on a bank shore (Nordhavn's arm heads, where the ground rises through the deck
  // height within a few metres of the water) the deck lands ON the bank where the ground meets its underside
  let shoreR = wrackBand(band)[1] + JETTY_SHORE_MARGIN_M;
  if (groundAcross(shoreR) > underside - JETTY_BANK_CLEARANCE_M) {
    while (shoreR > band.edge + 0.5 && groundAcross(shoreR) > underside - JETTY_BANK_LANDING_M) shoreR -= 0.25;
    if (groundAcross(shoreR) > underside - JETTY_BANK_LANDING_M) return null;
  }
  const spans = options.spans ?? Math.min(JETTY_MAX_SPANS, Math.max(JETTY_MIN_SPANS,
    Math.ceil((shoreR - core + JETTY_OVER_CORE_M) / JETTY_SPAN_M)));
  const length = spans * JETTY_SPAN_M;
  const tipR = shoreR - length;
  if (tipR > core - JETTY_SPAN_M || !coreAcross(tipR)) return null; // at least a full span stands over the core
  const [x, z] = radial(shoreR);
  // every pile station of the whole length, both sides: clear, inside the square, the ground under the deck (the
  // shore end may sit on the bank; every station seaward of it clears the ground by a pile's worth)
  for (let k = 0; k <= spans; k++) {
    const along = k * JETTY_SPAN_M;
    for (const side of [-1, 1]) {
      const px = x + dx * along + ax * side * JETTY_DECK_HALF_WIDTH_M;
      const pz = z + dz * along + az * side * JETTY_DECK_HALF_WIDTH_M;
      const clearance = k === 0 ? JETTY_BANK_LANDING_M : JETTY_BANK_CLEARANCE_M;
      if (!clear(px, pz) || field.getHeightAt(px, pz) > underside - clearance) return null;
    }
  }
  // the gangway where the shore end stands over the sand: its foot on dry ground landward of the shore end, its run
  // from the rise it has to climb; a deck that lands on the bank needs none
  let gangway: ShoreJettyPlan['gangway'] = null;
  if (top - groundAcross(shoreR) > GANGWAY_MIN_RISE_M) {
    let run = GANGWAY_MIN_RUN_M, groundY = field.getHeightAt(x - dx * run, z - dz * run);
    for (let i = 0; i < 3; i++) {
      run = Math.min(GANGWAY_MAX_RUN_M, Math.max(GANGWAY_MIN_RUN_M, (top - groundY) / GANGWAY_GRADE));
      groundY = field.getHeightAt(x - dx * run, z - dz * run);
    }
    const footX = x - dx * run, footZ = z - dz * run;
    if (!clear(footX, footZ) || groundY > top - 0.25) return null;
    for (const across of [-0.6, 0, 0.6]) {
      if (field.getWaterMaskAt(footX + ax * across, footZ + az * across) !== 0) return null;
    }
    gangway = { run, groundY };
  }
  // a boat alongside the outer spans, its whole hull over the core; the far side of the deck if the near side is not
  const along = length - 0.9 * JETTY_SPAN_M;
  let boat: ShoreJettyPlan['boat'] = null;
  for (const side of [1, -1] as const) {
    const across = side * (JETTY_DECK_HALF_WIDTH_M + MOORED_BOAT_GAP_M + MOORED_BOAT_HALF_BEAM_M);
    let afloat = true;
    for (const [u, v] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const bx = x + dx * (along + u * MOORED_BOAT_HALF_LENGTH_M) + ax * (across + v * MOORED_BOAT_HALF_BEAM_M);
      const bz = z + dz * (along + u * MOORED_BOAT_HALF_LENGTH_M) + az * (across + v * MOORED_BOAT_HALF_BEAM_M);
      if (!isCore(bx, bz) || Math.max(Math.abs(bx), Math.abs(bz)) > extent) { afloat = false; break; }
    }
    if (afloat) { boat = { along, side }; break; }
  }
  return {
    x, z, angle, azimuth, spans, length, deckY, surface, level,
    shoreR, edge: band.edge, core, tipR,
    gangway, boat,
  };
}

/** The local radius of the authored contour at the plan's azimuth (for callers that reason in units of it). */
export function shoreJettyLocalRadius(lake: StrandLake, plan: ShoreJettyPlan): number {
  return shorelineRadiusAt(lake, plan.azimuth);
}

/** The landing's own seeded stream for the pieces that key on the jetty (gangway, bollards, lines, the moored boat),
 * so their draws never shift the kit's main sequence — the boats, driftwood and buoys of every later shore keep their
 * places. The generator is terrain.ts's mulberry32, keyed by the shore end and the deck length. */
export function landingStream(plan: Pick<ShoreJettyPlan, 'x' | 'z' | 'spans'>): () => number {
  let a = (Math.imul(Math.round(plan.x * 8), 73856093) ^ Math.imul(Math.round(plan.z * 8), 19349663)
    ^ Math.imul(plan.spans, 83492791)) | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
