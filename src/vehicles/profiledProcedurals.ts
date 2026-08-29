// Eager assembly point for release tools and headless fleet audits. Browser
// boot demand-loads the same family maps through fleetFactory.ts.
import { buildProfile, buildDonorVariant } from './profiles/kit.ts';
import { WW2_PROFILES } from './profiles/ww2.ts';
import { CASEMATE_PROFILES } from './profiles/casemate.ts';
import { SOVIET_HEAVY_PROFILES } from './profiles/soviet-heavy.ts';
import { ABRAMS_PROFILES } from './profiles/abrams.ts';
import { RUSSIA_PROFILES as RUSSIA_RESIDUE_PROFILES } from './profiles/russia.ts';
import { T90_PROFILES } from './profiles/t90.ts';
import { T72_PROFILES } from './profiles/t72.ts';
import { T80_PROFILES } from './profiles/t80.ts';
import { UK_PROFILES } from './profiles/uk.ts';
import { CHALLENGER_PROFILES } from './profiles/challenger.ts';
import { LEOPARD_PROFILES } from './profiles/leopard.js';
import { MERKAVA_PROFILES } from './profiles/merkava.js';
import { PATTON_PROFILES } from './profiles/patton.ts';
import { MISC_PROFILES } from './profiles/misc.ts';
import { ITALY_PROFILES } from './profiles/italy.ts';
import { UKRAINE_PROFILES } from './profiles/ukraine.ts';
import { CHINA_PROFILES } from './profiles/china.ts';
import { SWEDEN_PROFILES } from './profiles/sweden.ts';
import { POLAND_PROFILES } from './profiles/poland.ts';
import { KOREA_PROFILES } from './profiles/korea.ts';
import { JAPAN_PROFILES } from './profiles/japan.ts';
import { GERMANY_PROFILES } from './profiles/germany.ts';
import { AFV_FAMILY_PROFILES } from './profiles/afvFamily.ts';
import { SHERIDAN_PROFILES } from './profiles/sheridan.ts';
import {
  createProfileBuilders,
  type VehicleProfileRecord,
} from './profileBuilderAdapter.ts';

// Preserve the historical Russia key order exactly while the builders live
// in family modules. Carousel/roster order is part of the pure-refactor law.
const RUSSIA_PROFILES: VehicleProfileRecord = {
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
  // China owns the redesigned Type 59 object, but its historical key position
  // remains in this Russia-order bridge.
  type59: CHINA_PROFILES.type59,
  t84: T80_PROFILES.t84,
};

export const PROCEDURAL_PROFILES: VehicleProfileRecord = {
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

export const PROFILED_BUILDERS = createProfileBuilders(PROCEDURAL_PROFILES, {
  buildProfile,
  buildDonorVariant,
});
