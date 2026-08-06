// Recovered m_bergman pack: every distinct tank/assault-gun in part 1 that
// was not already represented by the earlier BMP/Stryker imports.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
const ALLOW_LOCAL_RECOVERED_MODELS = typeof import.meta !== 'undefined' &&
  import.meta.env && !import.meta.env.VITE_PUBLIC_BUILD;
const make = (baseId, id, name, nation, patch = {}) => {
  const s = copy(TANK_SPECS[baseId]);
  s.id = id; s.name = name; s.nation = nation || s.nation; s.variantOf = baseId;
  s.publicVisualFallback = baseId;
  if (ALLOW_LOCAL_RECOVERED_MODELS) {
    s.community = {
      author: 'm_bergman', source: 'https://www.thingiverse.com/thing:4718232',
      license: 'CC BY-NC-SA — LOCAL-ONLY QUARANTINE',
    };
  } else {
    delete s.community;
  }
  const gun = s.gun, dims = s.dims, visual = s.visual;
  Object.assign(s, patch);
  if (patch.gun) s.gun = { ...gun, ...patch.gun };
  if (patch.dims) s.dims = { ...dims, ...patch.dims };
  if (patch.visual) s.visual = { ...visual, ...patch.visual };
  // A patched armor arrives as a top-level spread over a DONOR's armor — its
  // plate/box arrays are shared references. Deep-copy before the dims fit
  // below may mutate them (charioteer would otherwise rescale the Jagdtiger).
  if (patch.armor) s.armor = copy(patch.armor);
  // MODULE HITBOXES (module_hitbox r1): visuals render at spec.dims (geometry
  // gate) while copied armor stayed donor-sized — refit the copy so hit
  // resolution agrees with the rendered vehicle (see specs.fitArmorToDims).
  if (patch.dims) fitArmorToDims(s.armor, dims, s.dims);
  return s;
};

const SPECS = [
  make('is3', 'is3_bergman', 'IS-3 (Bergman)', 'USSR', { visual: { number: '703' } }),
  make('sturmtiger', 'isu152', 'ISU-152', 'USSR',
    { hp: 1450, weightTons: 47.3, topSpeedKmh: 37, reverseSpeedKmh: 14, gun: { caliberMm: 152, reloadS: 15.5 },
      dims: { hullLengthM: 6.77, overallLengthM: 9.05, widthM: 3.07, heightM: 2.48 } }),
  make('jagdtiger', 'isu122s', 'ISU-122S', 'USSR',
    { hp: 1400, weightTons: 46, topSpeedKmh: 37, reverseSpeedKmh: 14, gun: { caliberMm: 122, reloadS: 9.5 },
      dims: { hullLengthM: 6.77, overallLengthM: 9.85, widthM: 3.07, heightM: 2.48 } }),
  make('chieftain_mk10', 'centurion3', 'Centurion Mk.3', 'UK',
    { hp: 1500, weightTons: 51, topSpeedKmh: 35, gun: { caliberMm: 84, reloadS: 7.0 },
      dims: { hullLengthM: 7.56, overallLengthM: 9.83, widthM: 3.38, heightM: 2.94 } }),
  make('chieftain_mk10', 'centurion5', 'Centurion Mk.5/2', 'UK',
    { hp: 1650, weightTons: 52, topSpeedKmh: 35, gun: { caliberMm: 105, reloadS: 7.4 },
      dims: { hullLengthM: 7.56, overallLengthM: 9.83, widthM: 3.38, heightM: 2.94 } }),
  make('panther_g', 'comet', 'A34 Comet', 'UK',
    { hp: 1150, weightTons: 33.5, topSpeedKmh: 51, gun: { caliberMm: 77, reloadS: 5.2 },
      dims: { hullLengthM: 6.55, overallLengthM: 7.66, widthM: 3.05, heightM: 2.68 } }),
  make('panther_g', 'challenger_cruiser', 'A30 Challenger', 'UK',
    { hp: 1050, weightTons: 33, topSpeedKmh: 52, gun: { caliberMm: 76.2, reloadS: 5.8 },
      dims: { hullLengthM: 8.03, overallLengthM: 8.15, widthM: 2.91, heightM: 2.77 } }),
  make('jagdtiger', 'charioteer', 'FV4101 Charioteer', 'UK',
    {
      hp: 1250, weightTons: 30, topSpeedKmh: 56,
      gun: { caliberMm: 84, reloadS: 7.0 },
      // Gameplay ancestry supplies balance defaults only; the Charioteer has
      // a rotating turret and must not inherit the Jagdtiger's casemate flag.
      armor: { ...TANK_SPECS.jagdtiger.armor, turretless: false },
      dims: { hullLengthM: 6.55, overallLengthM: 9.20, widthM: 3.05, heightM: 2.58 },
    }),
  make('leo2a4', 'leopard2_proto', 'Leopard 2 Prototype', 'Germany',
    { hp: 2050, weightTons: 55, topSpeedKmh: 68, gun: { reloadS: 6.8 },
      dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.70, heightM: 2.48 } }),
  make('m1a1', 'm1a1_aim', 'M1A1 AIM Abrams', 'USA',
    { hp: 2400, weightTons: 63, gun: { reloadS: 6.2 } }),
  make('m60a1', 'm46_patton', 'M46 Patton', 'USA',
    { hp: 1450, weightTons: 44, topSpeedKmh: 48, gun: { caliberMm: 90, reloadS: 7.0 },
      dims: { hullLengthM: 6.33, overallLengthM: 8.48, widthM: 3.51, heightM: 3.18 },
      // bakeDirt deck equalizer (f243966): the Bergman refs paint from the
      // shared canvas with NO deck penalty — knob-on is ref-parity for this
      // print class (m47-top census gap 1029 -> 401 measured).
      visual: { bakeDirtDeckEq: true } }),
  make('m60a1', 'm47_patton', 'M47 Patton', 'USA',
    { hp: 1550, weightTons: 46, topSpeedKmh: 48, gun: { caliberMm: 90, reloadS: 6.8 },
      dims: { hullLengthM: 6.33, overallLengthM: 8.51, widthM: 3.51, heightM: 3.35 },
      visual: { bakeDirtDeckEq: true } }),
  make('m4a3e8', 'm26_pershing', 'M26 Pershing', 'USA',
    { hp: 1450, weightTons: 41.9, topSpeedKmh: 40, gun: { caliberMm: 90, reloadS: 7.5 },
      // heightM uses the over-mounted-M2 convention (matching the m46/m47
      // rows): published 2.78 is the no-MG datum, but the gate measures the
      // build's roof INCLUDING the pintle M2 (~14 body columns) — batch-8
      // packet proves no build satisfies both 2.78 and turretCurves >= 90.
      // 3.08 = extract bodyTopM 3.078 (m26 r2 re-derivation, 166 columns
      // above 3.0 are real mounted-M2 print geometry; lands with batch-42).
      dims: { hullLengthM: 6.33, overallLengthM: 8.65, widthM: 3.51, heightM: 3.08 } }),
  make('m4a3e8', 'm45_patton', 'M45 Patton', 'USA',
    { hp: 1500, weightTons: 42, topSpeedKmh: 40, gun: { caliberMm: 105, reloadS: 9.0 },
      // stub 105mm howitzer barely clears the bow; the seated oracle's muzzle
      // reads ~6.6 overall (batch-8 packet), not the earlier 6.4 estimate.
      // heightM: over-mounted-M2 convention, same ruling as m26 above.
      dims: { hullLengthM: 6.33, overallLengthM: 6.6, widthM: 3.51, heightM: 3.0 } }),
  make('m60a1', 'm60a3', 'M60A3', 'USA',
    { hp: 1800, weightTons: 52.6, topSpeedKmh: 48, gun: { reloadS: 7.2 },
      dims: { hullLengthM: 6.946, overallLengthM: 9.436, widthM: 3.631, heightM: 3.27 } }),
];

const ROOT = '/models/tanks/community/recovered/';
const articulated = (id, file = id, cfg = {}) => {
  MODEL_SOURCE[id] = { source: 'glb', glb: {
    path: `${ROOT}${file}.glb`, turretNode: '^Turret$', autoPivot: true, paintUntextured: true,
    ...cfg,
  } };
};
const fixed = (id) => {
  MODEL_SOURCE[id] = { source: 'glb', glb: { path: `${ROOT}${id}.glb`, fixedMount: true, paintUntextured: true } };
};

// All balance/spec rows are redistribution-safe code and remain playable in
// public builds through their procedural family fallbacks. Only the recovered
// NC model sources below are local/private.
for (const spec of SPECS) {
  TANK_SPECS[spec.id] = TANK_SPECS[spec.id] || spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

if (ALLOW_LOCAL_RECOVERED_MODELS) {
  articulated('is3_bergman', 'bergman_is3');
  // isu152: DUAL-GATE GRADUATE (2026-08-03) — the procedural build is the
  // model of record everywhere (geometry min 90.2 gatePassed x2, graduation
  // critic 9.0 on ALL fourteen views at round r6; floor climbed 4.0 -> 7.0
  // -> 8.0 -> 8.5 -> 9.0 across six builder + four critic rounds). The
  // recovered GLB (batch-17-warped) stays on disk as the measurement oracle
  // only (override configs in procedural-fidelity.html + tmp-tank-critic
  // .html); NO MODEL_SOURCE — freeze hash via tmp-hashgeo.
  // isu122s: DUAL-GATE GRADUATE (2026-08-03) — the procedural build is the
  // model of record everywhere (geometry min 90.1 gatePassed, independent
  // critic 9.0+ on all fourteen views, round 11; floor climbed 4.0 -> 9.0
  // across eleven visual rounds). The recovered GLB stays on disk as the
  // measurement oracle only (override configs in procedural-fidelity.html
  // + tmp-tank-critic.html); NO MODEL_SOURCE — freeze hash via tmp-hashgeo.
  // m47_patton: DUAL-GATE GRADUATE (2026-08-04, the patton family's first —
  // geometry 90.5 gatePassed x2, graduation critic 9.0 on ALL fourteen views
  // at r8; ladder 8.3 -> 8.5 -> 8.8 -> 9.0; commit eeaa462). Registration
  // retired per §10 — the recovered GLB stays a measurement oracle via the
  // three override maps; freeze hash 70941de0 via tmp-hashgeo.
  // FLEET FLIP (owner directive 2026-08-04): centurion3/5, m26/m45/m46
  // render procedural + CUSTOM; prints stay measurement oracles via the
  // three maps. comet/cruiser/charioteer/proto keep GLBs (0-row builds).
  for (const id of ['comet', 'challenger_cruiser', 'charioteer',
    'leopard2_proto']) articulated(id);
  // The Bergman Abrams exports an empty Turret pivot at the scene origin.
  // Its authored hull/turret placement is already correct; autoPivot treated
  // the long fused cannon as the turret footprint and moved the entire upper
  // vehicle off the pedestal. Keep the neutral placement and rotate it around
  // the spec's real turret-ring pivot instead.
  // FLEET FLIP 2026-08-04: m1a1_aim -> procedural + CUSTOM (was articulated autoPivot:false)
  // m60a3: GRADUATED (third complete dual-gate pass — geometry min 90.0,
  // visual min 9/10, commit 967be0e). The certified procedural build is the
  // model of record everywhere; the old m60a1-GLB alias is retired. The
  // reference file remains a measurement oracle for regression sweeps.
}

export const USERDROP6_TANK_IDS = SPECS.map((s) => s.id);
// Sourced-intent roster for garage bucketing: dual-gate GRADUATES leave this
// list (they render our builds and chip under CUSTOM), everything else stays
// in its era bucket even when public builds render procedural fallbacks.
export const USERDROP6_SOURCED_IDS = USERDROP6_TANK_IDS.filter((id) => !['m60a3', 'isu122s', 'isu152', 'm47_patton', 'centurion3', 'centurion5', 'm46_patton', 'm26_pershing', 'm45_patton', 'm1a1_aim'].includes(id));

// USER DROPS wave 8 (scout-gen2 integration): chain-loaded here because
// tankFactory.js (the usual registration hook) is frozen during the fleet
// waves — this import keeps wave-8 rows registered for every consumer that
// imports the spec chain (game, icons page, fidelity/geometry harnesses).
import './userdrops7.js';
