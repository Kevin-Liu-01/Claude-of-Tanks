// Assembly point for the dedicated procedural silhouettes of sourced and
// recovered variants. The actual profile DATA lives in per-family modules
// under ./profiles/ (one owner per family — see docs/BUILD-STANDARD.md),
// and the shared geometry machinery lives in ./profiles/kit.js. This module
// only merges the family maps and exposes the same PROCEDURAL_PROFILES /
// PROFILED_BUILDERS interface tankFactory.ts has always consumed.
//
// All profiles are original primitive reconstructions informed by normalized
// local reference renders and real vehicle dimensions. They intentionally do
// not contain, decode, or reproduce source mesh topology.
import { buildProfile, buildDonorVariant } from './profiles/kit.js';
import { WW2_PROFILES } from './profiles/ww2.js';
import { CASEMATE_PROFILES } from './profiles/casemate.js';
import { SOVIET_HEAVY_PROFILES } from './profiles/soviet-heavy.js';
import { ABRAMS_PROFILES } from './profiles/abrams.js';
import { RUSSIA_PROFILES as RUSSIA_RESIDUE_PROFILES } from './profiles/russia.js';
import { T90_PROFILES } from './profiles/t90.js';
import { T72_PROFILES } from './profiles/t72.js';
import { T80_PROFILES } from './profiles/t80.js';
import { UK_PROFILES } from './profiles/uk.js';
// §5.75 family-module split: challenger1 moved out of uk.js (the module also
// carries the modern-class challenger2/_3 — those merge via tankFactory).
import { CHALLENGER_PROFILES } from './profiles/challenger.js';
import { LEOPARD_PROFILES } from './profiles/leopard.js';
import { MERKAVA_PROFILES } from './profiles/merkava.js';
import { PATTON_PROFILES } from './profiles/patton.js';
import { MISC_PROFILES } from './profiles/misc.js';
import { ITALY_PROFILES } from './profiles/italy.js';
import { UKRAINE_PROFILES } from './profiles/ukraine.js';
import { CHINA_PROFILES } from './profiles/china.js';
import { SWEDEN_PROFILES } from './profiles/sweden.js';
import { POLAND_PROFILES } from './profiles/poland.js';
import { KOREA_PROFILES } from './profiles/korea.js';
import { JAPAN_PROFILES } from './profiles/japan.js';
import { GERMANY_PROFILES } from './profiles/germany.js';
import { AFV_FAMILY_PROFILES } from './profiles/afvFamily.js';
import { SHERIDAN_PROFILES } from './profiles/sheridan.js';

// Preserve the historical Russia key order exactly while the builders live
// in family modules. Carousel/roster order is part of the pure-refactor law.
const RUSSIA_PROFILES = {
  t90a: T90_PROFILES.t90a,
  t90: T90_PROFILES.t90,
  t90ms: T90_PROFILES.t90ms,
  t90a_burlak: T90_PROFILES.t90a_burlak,
  t62mv1: RUSSIA_RESIDUE_PROFILES.t62mv1,
  t64bv1: RUSSIA_RESIDUE_PROFILES.t64bv1,
  pt91m: T90_PROFILES.pt91m,
  t72b_1987: T72_PROFILES.t72b_1987,
  t72b3m: T72_PROFILES.t72b3m,
  t72bu: T72_PROFILES.t72bu,
  t90sm: T90_PROFILES.t90sm,
  t90a_vladimir: T90_PROFILES.t90a_vladimir,
  t80: T80_PROFILES.t80,
  t80b: T80_PROFILES.t80b,
  t80bv: T80_PROFILES.t80bv,
  t90m: T90_PROFILES.t90m,
  t90m_proryv: T90_PROFILES.t90m_proryv,
  t54: RUSSIA_RESIDUE_PROFILES.t54,
  t44: RUSSIA_RESIDUE_PROFILES.t44,
  // §5.304: type59 renders the china.js redesign (WZ-120 dome on the widened
  // obr-1975 chassis). Keyed HERE to preserve the historical carousel
  // position (pure-refactor law); the CHINA_PROFILES spread below re-assigns
  // the same object without moving the key.
  type59: CHINA_PROFILES.type59,
  t84: T80_PROFILES.t84,
};

export const PROCEDURAL_PROFILES = {
  ...WW2_PROFILES,
  ...CASEMATE_PROFILES,
  ...SOVIET_HEAVY_PROFILES,
  ...ABRAMS_PROFILES,
  ...RUSSIA_PROFILES,
  ...UK_PROFILES,
  ...CHALLENGER_PROFILES,
  ...LEOPARD_PROFILES,
  ...MERKAVA_PROFILES,
  ...PATTON_PROFILES,
  ...MISC_PROFILES,
  ...ITALY_PROFILES,
  ...UKRAINE_PROFILES,
  ...CHINA_PROFILES,
  ...SWEDEN_PROFILES,
  ...POLAND_PROFILES,
  ...KOREA_PROFILES,
  ...JAPAN_PROFILES,
  ...GERMANY_PROFILES,
  ...AFV_FAMILY_PROFILES,
  ...SHERIDAN_PROFILES,
};

// A profile may carry `build(P, profile)` for a fully custom construction
// (Abrams family), `base` + optional `kit(P, profile)` for a canonical-donor
// variant, or neither for the generic parametric buildProfile path.
export const PROFILED_BUILDERS = Object.fromEntries(Object.entries(PROCEDURAL_PROFILES)
  .map(([id, profile]) => [id, (P) => profile.build
    ? profile.build(P, profile)
    : profile.base
    ? buildDonorVariant(P, profile)
    : buildProfile(P, profile)]));
