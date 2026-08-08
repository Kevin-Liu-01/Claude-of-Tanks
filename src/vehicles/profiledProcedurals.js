// Assembly point for the dedicated procedural silhouettes of sourced and
// recovered variants. The actual profile DATA lives in per-family modules
// under ./profiles/ (one owner per family — see docs/HANDOFF-FABLE.md §8),
// and the shared geometry machinery lives in ./profiles/kit.js. This module
// only merges the family maps and exposes the same PROCEDURAL_PROFILES /
// PROFILED_BUILDERS interface tankFactory.js has always consumed.
//
// All profiles are original primitive reconstructions informed by normalized
// local reference renders and real vehicle dimensions. They intentionally do
// not contain, decode, or reproduce source mesh topology.
import { buildProfile, buildDonorVariant } from './profiles/kit.js';
import { WW2_PROFILES } from './profiles/ww2.js';
import { CASEMATE_PROFILES } from './profiles/casemate.js';
import { SOVIET_HEAVY_PROFILES } from './profiles/soviet-heavy.js';
import { ABRAMS_PROFILES } from './profiles/abrams.js';
import { RUSSIA_PROFILES } from './profiles/russia.js';
import { UK_PROFILES } from './profiles/uk.js';
// §5.75 family-module split: challenger1 moved out of uk.js (the module also
// carries the modern-class challenger2/_3 — those merge via tankFactory).
import { CHALLENGER_PROFILES } from './profiles/challenger.js';
import { LEOPARD_PROFILES } from './profiles/leopard.js';
import { MERKAVA_PROFILES } from './profiles/merkava.js';
import { PATTON_PROFILES } from './profiles/patton.js';
import { MISC_PROFILES } from './profiles/misc.js';

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
