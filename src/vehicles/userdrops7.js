// USER DROPS wave 8 (scout-gen2 integration, 2026-07-31): the MBT-generations
// candidates from public/models/tanks/candidates-gen2/ (per-folder
// PROVENANCE.md; reference packets docs/references/tanks/scout-gen2-*.md).
// GLBs are baked by tools/build_gen2_tanks.sh; stats inherit the nearest
// researched vehicle (make(donor) pattern, userdrops5/6) and are adjusted to
// published figures so each variant stays identifiable and matchmaking-safe.
//
// LICENSE CLASSES (ATTRIBUTION-DRAFT -> docs/ATTRIBUTION.md gen2 section):
//   * shippable  — CC BY / CC BY-SA sources: model + credit register in
//     EVERY build (the on-card credit satisfies attribution, same rule as
//     the specs.js community roster); GLBs live in community/.
//   * quarantine — CC BY-NC-SA (m_bergman) + the t84 remix whose CC BY label
//     is governed by its NC-SA parents: sources register only behind
//     ALLOW_LOCAL_RECOVERED_MODELS, exactly like userdrops5/6; public builds
//     resolve the rows through their procedural family donors
//     (publicVisualFallback) and tools/strip-nc-assets.mjs deletes the GLBs.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
// Reference assets never become playables, including in local development.
const ALLOW_LOCAL_RECOVERED_MODELS = false;

// credit rows (author/source/license verified in candidates-gen2 PROVENANCE)
const BERGMAN = {
  author: 'm_bergman', source: 'https://www.thingiverse.com/thing:4718232',
  license: 'CC BY-NC-SA 4.0 — LOCAL-ONLY QUARANTINE', quarantine: true,
};
const T84_REMIX = {
  author: 'LastTriarius (remix of ThudOne thing:4885197 + m_bergman parts)',
  source: 'https://www.thingiverse.com/thing:6178654',
  // labeled CC BY 4.0, but both remix parents are CC BY-NC-SA — the NC-SA
  // terms govern the combined work (see ATTRIBUTION license-chain note)
  license: 'effective CC BY-NC-SA 4.0 — LOCAL-ONLY QUARANTINE', quarantine: true,
};
const FOXY = {
  author: 'Foxygamer142', source: 'https://www.thingiverse.com/thing:6799441',
  license: 'CC BY-SA 4.0',
};
const ATMODELER = {
  author: 'ATModeler', source: 'https://www.thingiverse.com/thing:5964554',
  license: 'CC BY 4.0',
};
const AHAB_AMX30 = {
  author: 'Captain_Ahab_62 (Richard Honeycutt)',
  source: 'https://www.thingiverse.com/thing:3602722', license: 'CC BY 4.0',
};
const AHAB_M60A2 = {
  author: 'Captain_Ahab_62 (Richard Honeycutt)',
  source: 'https://www.thingiverse.com/thing:3063170', license: 'CC BY 4.0',
};
const TRIARIUS_T69 = {
  author: 'LastTriarius', source: 'https://www.thingiverse.com/thing:6192142',
  license: 'CC BY 4.0',
};
const JACK = {
  author: 'JackTheTinkerer', source: 'https://www.thingiverse.com/thing:5523615',
  license: 'CC BY 4.0',
};

const make = (baseId, id, name, nation, patch = {}, credit = null) => {
  const s = copy(TANK_SPECS[baseId]);
  s.id = id; s.name = name; s.nation = nation || s.nation; s.variantOf = baseId;
  if (credit && !credit.quarantine) {
    // shippable class: the credit line renders on the nation-tab/garage card
    // in every build (CC BY attribution) and the GLB itself is distributed,
    // so no public visual fallback is needed.
    s.community = { author: credit.author, source: credit.source, license: credit.license };
    s.publicVisualFallback = null;
  } else {
    s.publicVisualFallback = baseId;
    if (ALLOW_LOCAL_RECOVERED_MODELS && credit) {
      s.community = { author: credit.author, source: credit.source, license: credit.license };
    } else {
      delete s.community;
    }
  }
  const gun = s.gun, dims = s.dims, visual = s.visual;
  Object.assign(s, patch);
  if (patch.gun) s.gun = { ...gun, ...patch.gun };
  if (patch.dims) s.dims = { ...dims, ...patch.dims };
  if (patch.visual) s.visual = { ...visual, ...patch.visual };
  // patched armor arrives as a shared-reference spread over a donor's armor —
  // deep-copy before the dims refit below may mutate it (userdrops6 lesson)
  if (patch.armor) s.armor = copy(patch.armor);
  // MODULE HITBOXES: the visual renders at spec.dims while the copied armor
  // stayed donor-sized — refit so hits resolve against the rendered vehicle.
  if (patch.dims) fitArmorToDims(s.armor, dims, s.dims);
  return s;
};

// Published dims from the scout packets (docs/references/tanks/scout-gen2-*).
// heightM uses the over-mounted-MG convention ONLY where the mesh actually
// mounts one (t54/t44 carry a printed DShK — m26/m45 precedent, userdrops6);
// every other row keeps the published roof datum.
const SPECS = [
  // -- Soviet mediums: T-34-85 -> T-44 -> T-54 lineage ----------------------
  make('t34_85', 't44', 'T-44', 'USSR',
    { hp: 900, weightTons: 31.8, topSpeedKmh: 60, gun: { reloadS: 6.8 },
      dims: { hullLengthM: 6.07, overallLengthM: 7.65, widthM: 3.18, heightM: 2.72 },
      visual: { number: '32' } }, FOXY),
  make('t62mv1', 't54', 'T-54', 'USSR/Russia',
    { hp: 1600, enginePowerHp: 520, weightTons: 36, topSpeedKmh: 50,
      gun: { caliberMm: 100, reloadS: 8.6 },
      dims: { hullLengthM: 6.45, overallLengthM: 9.00, widthM: 3.27, heightM: 2.65 },
      visual: { marking: 'number', number: '324' } }, BERGMAN),
  make('t62mv1', 'type59', 'Type 59', 'China',
    // §5.304 REDESIGN (owner order verbatim 2026-08-17: "update our t62 obr
    // 1975 10% wider and then redeisgn our type 59 to be based off of
    // that"): the visual is profiles/china.js buildType59 — the WZ-120
    // (T-54A-family) dome + 100 mm kit on the WIDENED obr-1975 chassis.
    // Stats stay the Type 59's; dims RE-DERIVE from the widened base
    // (hull/width = the t62mv1 rows, height = the authored cupola crown,
    // overall = the authored 100 mm gun-forward total). silhouette* rows
    // are type59's OWN gate-measured envelope (they also override the
    // donor-inherited t62mv1 print rows — the §5.259 leak class, which
    // zeroed this id's dims row until this landing). The LastTriarius
    // Type 69 print remains the registered measurement oracle; its gate
    // deltas vs this owner-decreed redesign are documented divergence
    // (docs/references/tanks/type59.md §5.304), never chased back.
    { hp: 1580, enginePowerHp: 520, weightTons: 36, topSpeedKmh: 50,
      gun: { caliberMm: 100, reloadS: 8.8 },
      dims: { hullLengthM: 6.63, overallLengthM: 9.52, widthM: 3.63, heightM: 2.59,
        // gate-measured authored envelope (§5.304 run receipts: 12%-band
        // body trace includes the base's drum/fender tail like t62mv1's;
        // height p95 = the cupola crown band)
        silhouetteHullLengthM: 7.13, silhouetteOverallLengthM: 9.52,
        silhouetteHeightM: 2.60 },
      // china-palette hooks (PLA green family, ztz85_iii grammar — values
      // distinct per §H.4 family separation)
      visual: { marking: 'number', number: '406', base: '#374836',
        weather: '#49573f', patches: ['#2a3629', '#5c6349', '#6f684e'],
        camoScale: 0.52 } }, TRIARIUS_T69),
  // -- T-80 turbine family ---------------------------------------------------
  make('t80u', 't80', 'T-80', 'USSR/Russia',
    { hp: 1780, enginePowerHp: 1000, weightTons: 42, gun: { reloadS: 7.8 },
      dims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
      visual: { number: '117' } }, BERGMAN),
  make('t80u', 't80b', 'T-80B', 'USSR/Russia',
    { hp: 1830, enginePowerHp: 1100, weightTons: 42.5, gun: { reloadS: 7.6 },
      dims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
      visual: { number: '225' } }, BERGMAN),
  // full-ERA T-80BV — the scout round's closest silhouette proxy for the
  // roster-listed T-80BVM (Kontakt-1 vs Relikt; PROVENANCE note)
  make('t80u', 't80bv', 'T-80BV', 'USSR/Russia',
    { hp: 1900, enginePowerHp: 1100, weightTons: 43.7, gun: { reloadS: 7.4 },
      dims: { hullLengthM: 6.78, overallLengthM: 9.66, widthM: 3.52, heightM: 2.20 },
      visual: { number: '319' } }, BERGMAN),
  // -- NATO cold-war ---------------------------------------------------------
  make('leo1a5', 'amx30', 'AMX-30B', 'France',
    { hp: 1600, enginePowerHp: 720, weightTons: 36, reverseSpeedKmh: 11,
      gun: { reloadS: 7.0 },
      // Owner-authoritative 2026-08-15 GLB, measured on one of the two
      // geometrically identical tanks stored in that scene (never on the
      // doubled scene envelope).
      dims: { hullLengthM: 6.85, overallLengthM: 9.55, widthM: 3.11,
        heightM: 2.87, silhouetteHeightM: 3.42 },
      visual: { marking: 'number', number: '53' } }, AHAB_AMX30),
  make('leo1a5', 'amx30b2', 'AMX-30B2', 'France',
    { hp: 1700, enginePowerHp: 750, weightTons: 37, reverseSpeedKmh: 11,
      gun: { reloadS: 6.6 },
      dims: { hullLengthM: 6.85, overallLengthM: 9.55, widthM: 3.11,
        heightM: 2.87, silhouetteHeightM: 3.42, silhouetteWidthM: 3.34 },
      visual: { marking: 'number', number: '68' } }, AHAB_AMX30),
  make('m60a1', 'm48', 'M48A5 Patton', 'USA',
    // hullLengthM 6.42 -> 6.87 (m48 build round 2026-08-08): the 6.42 row
    // is an inetres A5-line defect — its own M48A3 row reads 6.882 m on the
    // SAME hull (the A5 is a rebuilt A3), and the Hunnicutt-class table
    // gives 687.1 cm "length without gun, with fenders" for A2/A3/A5
    // (docs/references/tanks/m48.md, two-source rule).
    { hp: 1700, enginePowerHp: 750, weightTons: 49.6, gun: { reloadS: 7.8 },
      dims: { hullLengthM: 6.87, overallLengthM: 9.31, widthM: 3.63, heightM: 3.09 },
      visual: { marking: 'star', number: 'A31' } }, ATMODELER),
  make('m60a1', 'm60a2', 'M60A2 Starship', 'USA',
    { hp: 1800, enginePowerHp: 750, weightTons: 52,
      // 152 mm M162 gun/launcher: big-alpha slow cycle vs its Patton peers
      gun: { caliberMm: 152, reloadS: 11.5 },
      dims: { hullLengthM: 6.95, overallLengthM: 7.27, widthM: 3.63, heightM: 3.11 },
      visual: { marking: 'star', number: 'S12' } }, AHAB_M60A2),
  // donor is chieftain_mk10, NOT centurion5: this module is chain-imported
  // from userdrops6.js, so ES hoisting evaluates it BEFORE the userdrops6
  // rows exist — only specs.js/modern*/variants/userdrops1-5 ids are legal
  // donors here. The L7 caliber is patched in over the Chieftain's 120.
  make('chieftain_mk10', 'vickers_mk1', 'Vickers MBT Mk.1', 'UK',
    { hp: 1500, enginePowerHp: 650, weightTons: 38.6, topSpeedKmh: 48,
      gun: { caliberMm: 105, reloadS: 6.8 },
      dims: { hullLengthM: 7.92, overallLengthM: 9.79, widthM: 3.17, heightM: 2.71 },
      visual: { number: 'V1' } }, JACK),
  // -- Ukraine ---------------------------------------------------------------
  make('t80u', 't84', 'T-84 Oplot', 'Ukraine',
    { hp: 2100, enginePowerHp: 1200, weightTons: 46, topSpeedKmh: 65,
      gun: { reloadS: 6.8 },
      dims: { hullLengthM: 7.08, overallLengthM: 9.72, widthM: 3.56, heightM: 2.22 },
      visual: { number: '240' } }, T84_REMIX),
  // -- §5.38 T-90 family (owner priority wave 2026-08-08) ---------------------
  // Three new marks off the t90a base (variants.js donor — legal here, the
  // userdrops5 t72bu precedent). The KojfDiscord AW-series prints are
  // LOCAL-ONLY QUARANTINE measurement references (docs/ATTRIBUTION.md series
  // entry): NO MODEL_SOURCE rows and no credit cards — every playable renders
  // its OWN procedural build (profiles/russia.js, RUSSIA_PROFILES).
  // t90: base 1992 obr. — V-84MS 840 hp, cast turret, K-5 clamshell, NSVT.
  make('t90a', 't90', 'T-90', 'USSR/Russia',
    { hp: 1880, enginePowerHp: 840, weightTons: 46.5,
      gun: { reloadS: 7.8 },
      visual: { number: '417' } }),
  // t90ms: Tagil export demonstrator — V-92S2F 1130 hp, welded turret with
  // the big bustle + rear cage + UDP T05BV-1 RWS; desert-sand factory paint
  // (the export-demo look; also the garage tell vs the green t90sm).
  make('t90a', 't90ms', 'T-90MS Tagil', 'USSR/Russia',
    { hp: 2020, enginePowerHp: 1130, weightTons: 48, topSpeedKmh: 65,
      gun: { reloadS: 7.1 },
      visual: { scheme: 'solid', base: '#6a6047', weather: '#75694e', patches: [], number: '340' } }),
  // t90a_burlak: experimental Burlak bustle-autoloader turret on the T-90A
  // hull (t90a stats; height to the taller bustle roof; the rear-rack
  // autoloader feeds a touch faster than the carousel). overallLengthM:
  // the Burlak bustle overhangs the hull rear ~0.24 past the T-90A datum
  // (print -3.66 corroborates) — 9.76 is the variant's honest gun-forward
  // total (ASK-OWNER note in the packet; §5.38 named only heightM 2.30).
  make('t90a', 't90a_burlak', 'T-90A Burlak', 'USSR/Russia',
    { gun: { reloadS: 7.0 },
      dims: { heightM: 2.30, overallLengthM: 9.76 },
      visual: { number: '059' } }),
];

for (const spec of SPECS) {
  TANK_SPECS[spec.id] = TANK_SPECS[spec.id] || spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

// ---------------------------------------------------------------------------
// model sources — every gen2 bake exports the same node contract
// (Root > HullMesh + Turret > TurretMesh, fused gun rides the turret)
// ---------------------------------------------------------------------------
const COMMUNITY = '/models/tanks/community/';
const glb = (file) => ({
  source: 'glb',
  glb: { path: `${COMMUNITY}${file}`, turretNode: '^Turret$', autoPivot: true, paintUntextured: true },
});

// shippable class (CC BY / CC BY-SA) — registered in every build
// t44 §5.45 BUILD LANDED (russia lane 2026-08-08): the id renders OUR
// procedural build everywhere (profiles/russia.js buildT44); the Foxygamer
// CC BY-SA print is retained only as offline comparison provenance.
// Measurement registration moved to
// the three override maps (§10-pattern mirror, helper-expanded config).
MODEL_SOURCE.t44 = {
  source: 'procedural',
  candidateGlb: { path: '/models/tanks/community/t44_foxygamer.glb', turretNode: '^Turret$', autoPivot: true, paintUntextured: true },
};
// m48 §5.45 BUILD LANDED (patton lane 2026-08-08): the id renders OUR
// procedural build everywhere (profiles/patton.js buildM48); the ATModeler
// print remains offline comparison provenance for repeatable A/B audits.
// Measurement registration moved to the three
// override maps (§10-pattern mirror, helper-expanded config).
MODEL_SOURCE.m48 = {
  source: 'procedural',
  candidateGlb: { path: '/models/tanks/community/m48a5_atmodeler.glb', turretNode: '^Turret$', autoPivot: true, paintUntextured: true },
};
// FLEET FLIP 2026-08-04: MODEL_SOURCE_RETIRED.m60a2 = glb('m60a2_ahab.glb');
// FRANCE ROUND 2026-08-07 (owner: "the amx 30bs' hulls are backwards"):
// the ahab bakes carry an INTERNAL hull/turret 180 — build_gen2_tanks.py
// rotates the hull RZ(-90) but the turret RZ(+90), so the hull glacis
// renders at -z while the gun points +z (vertex extracts amx30/amx30b2:
// glacisSign -1, gunSign +1, agree:false). A MODEL_SOURCE yawOffset cannot
// fix an internal disagreement (a scene yaw flips BOTH), so the playables
// flip to the misc.js procedural builds; the one-line re-bake fix
// (hull RZ(-90) -> RZ(90) in the manifest) is the §E lane's, and the
// re-baked GLBs can then re-register as measurement oracles.
// MODEL_SOURCE_RETIRED.amx30 = glb('amx30b_ahab.glb');
// MODEL_SOURCE_RETIRED.amx30b2 = glb('amx30b2_ahab.glb');
// type59 §5.45 BUILD LANDED (russia lane 2026-08-08): renders buildType59
// everywhere; the LastTriarius Type 69 CC BY print retires to candidateGlb
// (same flip pattern as t44/m48 above).
// §5.304 (2026-08-17): buildType59 REDESIGNED onto the widened obr-1975
// chassis (profiles/china.js — owner order). The flip mechanics here are
// unchanged: source stays 'procedural', the Type 69 print stays on disk as
// the registered measurement oracle (three override maps) and comparison
// provenance — its rows now measure an owner-decreed divergence.
MODEL_SOURCE.type59 = {
  source: 'procedural',
  candidateGlb: { path: '/models/tanks/community/type69_lasttriarius.glb', turretNode: '^Turret$', autoPivot: true, paintUntextured: true },
};
// FLEET FLIP 2026-08-04: MODEL_SOURCE_RETIRED.vickers_mk1 = glb('vickers_mk1_jack.glb');

// quarantine class (NC-SA) — local builds only; public builds keep these ids
// on their procedural family fallbacks and strip-nc-assets deletes the files
// t84 GRADUATED 2026-08-04 (dual gate: 90.2 x2 f27feef + critic PASS 9.14
// floor 9.0, 346c758; hash frozen 531fe4f0) — registration retired per
// GEOMETRY-GATE §10; the reference lives on only in the three local
// measurement override maps.
if (ALLOW_LOCAL_RECOVERED_MODELS) {
  // FLEET FLIP (owner directive 2026-08-04, "every single mbt" under CUSTOM):
  // t80/t80b/t80bv render procedural; recovered prints stay measurement
  // oracles via the three override maps. t54 keeps its GLB (winding parked).
  for (const id of ['t54']) {
    MODEL_SOURCE[id] = glb(`recovered/${id}.glb`);
  }
}

export const USERDROP7_TANK_IDS = SPECS.map((s) => s.id);
// every wave-8 row is sourced-from-online (era bucketing intent, cf.
// USERDROP5_SOURCED_IDS) — t84 graduated out (dual gate, §10); the §5.38
// t90 family rows were born procedural (never sourced); t44/type59 flipped
// procedural at their §5.45 builds (m48/m60a2/vickers precedent).
export const USERDROP7_SOURCED_IDS = USERDROP7_TANK_IDS.filter((id) => !['t84', 't80', 't80b', 't80bv', 'm60a2', 'vickers_mk1', 'amx30', 'amx30b2', 't90', 't90ms', 't90a_burlak', 'm48', 't44', 'type59'].includes(id));
