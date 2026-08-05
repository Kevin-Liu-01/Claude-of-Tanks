// Recovered-drop wave 6: distinct Cold-War/modern vehicles from the owner's
// source archives. Geometry was normalized by tools/build_recovered_fleet.sh;
// class stats inherit the nearest researched vehicle and are then adjusted to
// keep each variant identifiable and matchmaking-safe.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
const ALLOW_LOCAL_RECOVERED_MODELS = typeof import.meta !== 'undefined' &&
  import.meta.env && !import.meta.env.VITE_PUBLIC_BUILD;
const make = (baseId, id, name, nation, patch = {}) => {
  const spec = copy(TANK_SPECS[baseId]);
  spec.id = id;
  spec.name = name;
  spec.nation = nation || spec.nation;
  spec.variantOf = baseId;
  spec.publicVisualFallback = baseId;
  if (ALLOW_LOCAL_RECOVERED_MODELS) {
    spec.community = {
      author: 'Recovered owner drop', source: `user-drops-recovered/${id}`,
      license: 'Redistribution not cleared — LOCAL-ONLY QUARANTINE',
    };
  } else {
    delete spec.community;
  }
  const baseGun = spec.gun;
  const baseDims = spec.dims;
  const baseVisual = spec.visual;
  Object.assign(spec, patch);
  if (patch.gun) spec.gun = { ...baseGun, ...patch.gun };
  if (patch.dims) spec.dims = { ...baseDims, ...patch.dims };
  if (patch.visual) spec.visual = { ...baseVisual, ...patch.visual };
  // MODULE HITBOXES (module_hitbox r1): the visual renders at spec.dims (the
  // geometry gate enforces it) while the copied armor stayed donor-sized —
  // e.g. m60a1 carried Leopard-1-sized armor 1.2 m shorter than its render,
  // so shots at the rendered turret resolved as air. Refit the copy.
  if (patch.dims) fitArmorToDims(spec.armor, baseDims, spec.dims);
  return spec;
};

const SPECS = [
  make('challenger2', 'challenger1', 'Challenger 1 Mk.3', 'UK',
    { hp: 2100, weightTons: 62, topSpeedKmh: 56, gun: { reloadS: 7.2 },
      dims: { hullLengthM: 8.32, overallLengthM: 11.5, widthM: 3.52, heightM: 2.95 } }),
  make('chieftain_mk10', 'chieftain5', 'Chieftain Mk.5', 'UK',
    { hp: 1850, topSpeedKmh: 48, gun: { reloadS: 7.8 },
      dims: { hullLengthM: 7.52, overallLengthM: 10.79, widthM: 3.50, heightM: 2.90 } }),
  make('m2a2_bradley', 'fv510', 'FV510 Warrior', 'UK',
    { hp: 1250, weightTons: 25.4, topSpeedKmh: 75, gun: { caliberMm: 30, reloadS: 0.45 },
      dims: { hullLengthM: 6.34, overallLengthM: 6.34, widthM: 3.03, heightM: 2.80 } }),
  make('leo2a7', 'leo2_revolution', 'Leopard 2 Revolution', 'Germany',
    { hp: 2550, weightTons: 60, topSpeedKmh: 70,
      dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 4.00, heightM: 2.64 } }),
  make('leo2a6', 'leo2a5', 'Leopard 2A5', 'Germany',
    { hp: 2350, weightTons: 59.5, gun: { reloadS: 6.4 },
      dims: { hullLengthM: 7.72, overallLengthM: 9.97, widthM: 3.75, heightM: 2.64 },
      // bakeDirt deck equalizer (f243966; r10 A/B: deck med -> 56.6 toward
      // ref 59.9, deck sub45 -507, hero-rr -307, gear/rear/glacis identical;
      // caution logged: deck over92 72 -> 154 vs ref 29 — critic adjudicates).
      visual: { bakeDirtDeckEq: true } }),
  make('leo2a7', 'leo2a7v', 'Leopard 2A7V', 'Germany',
    { hp: 2650, weightTons: 66.5, topSpeedKmh: 63,
      dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 4.00, heightM: 2.64 } }),
  make('m1a1', 'm1a1ha', 'M1A1HA Abrams', 'USA',
    { hp: 2350, weightTons: 62, gun: { reloadS: 6.3 } }),
  make('m1a2', 'm1a2_sepv2', 'M1A2 Abrams SEPv2', 'USA',
    { hp: 2600, weightTons: 66.8, gun: { reloadS: 6.0 } }),
  // DUAL-GATE GRADUATE (2026-07-31, commit 0f5cd55): m60a1's procedural build
  // passed geometry min 90.7 + shaded parity min 9/10 — the recovered GLB is
  // retired and the procedural model ships EVERYWHERE (local + public), so no
  // publicVisualFallback: its own regenerated icons are legal to distribute.
  make('leo1a5', 'm60a1', 'M60A1 Patton', 'USA',
    { hp: 1750, weightTons: 49.7, topSpeedKmh: 48, reverseSpeedKmh: 16, gun: { reloadS: 7.6 },
      publicVisualFallback: null, community: null,
      dims: { hullLengthM: 6.946, overallLengthM: 9.436, widthM: 3.631, heightM: 3.27 } }),
  make('t72b3', 'pt91m', 'PT-91M Pendekar', 'Poland',
    { hp: 2050, weightTons: 48.5, topSpeedKmh: 70, reverseSpeedKmh: 20,
      dims: { hullLengthM: 6.86, overallLengthM: 9.53, widthM: 3.59, heightM: 2.19 } }),
  make('merkava4', 'merkava1b', 'Merkava Mk.1B', 'Israel',
    { hp: 1900, weightTons: 60, topSpeedKmh: 46, gun: { reloadS: 7.8 },
      dims: { hullLengthM: 7.45, overallLengthM: 8.63, widthM: 3.70, heightM: 2.65 } }),
  make('merkava4', 'merkava2b', 'Merkava Mk.2B', 'Israel',
    { hp: 2050, weightTons: 63, topSpeedKmh: 46, gun: { reloadS: 7.5 },
      dims: { hullLengthM: 7.45, overallLengthM: 8.78, widthM: 3.70, heightM: 2.65 } }),
  make('merkava4', 'merkava2d', 'Merkava Mk.2D', 'Israel',
    { hp: 2150, weightTons: 65, topSpeedKmh: 50, gun: { reloadS: 7.2 },
      dims: { hullLengthM: 7.45, overallLengthM: 8.78, widthM: 3.70, heightM: 2.65 } }),
  make('merkava4', 'merkava3b', 'Merkava Mk.3B', 'Israel',
    { hp: 2250, weightTons: 65, topSpeedKmh: 60, gun: { reloadS: 6.8 },
      dims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 } }),
  make('merkava4', 'merkava3c', 'Merkava Mk.3C', 'Israel',
    { hp: 2300, weightTons: 65, topSpeedKmh: 60, gun: { reloadS: 6.6 },
      dims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 } }),
  make('merkava4', 'merkava3d', 'Merkava Mk.3D', 'Israel',
    { hp: 2350, weightTons: 65, topSpeedKmh: 60, gun: { reloadS: 6.4 },
      dims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 } }),
  make('merkava4', 'merkava4b', 'Merkava Mk.4B', 'Israel',
    { hp: 2500, weightTons: 65, topSpeedKmh: 64, gun: { reloadS: 6.1 } }),
  make('leo1a5', 't62mv1', 'T-62MV-1', 'USSR/Russia',
    { hp: 1650, weightTons: 38, topSpeedKmh: 50, reverseSpeedKmh: 8, gun: { reloadS: 8.2 },
      dims: { hullLengthM: 6.63, overallLengthM: 9.34, widthM: 3.30, heightM: 2.40 } }),
  make('t72b3', 't64bv1', 'T-64BV1', 'USSR/Russia',
    { hp: 1850, weightTons: 42.4, topSpeedKmh: 60, reverseSpeedKmh: 12, gun: { reloadS: 7.4 },
      dims: { hullLengthM: 6.54, overallLengthM: 9.23, widthM: 3.42, heightM: 2.17 } }),
  make('t72b3', 't72b_1987', 'T-72B obr. 1987', 'USSR/Russia',
    { hp: 1950, weightTons: 44.5, topSpeedKmh: 60, reverseSpeedKmh: 12, gun: { reloadS: 7.2 } }),
  make('t72b3', 't72b3m', 'T-72B3M obr. 2022', 'Russia',
    { hp: 2250, enginePowerHp: 1130, topSpeedKmh: 70, reverseSpeedKmh: 20, gun: { reloadS: 6.5 } }),
  make('t90a', 't72bu', 'T-72BU', 'USSR/Russia',
    { hp: 2050, weightTons: 46.5, topSpeedKmh: 65, gun: { reloadS: 7.0 } }),
  make('t90m', 't90sm', 'T-90SM', 'Russia',
    { hp: 2400, weightTons: 48, topSpeedKmh: 72, gun: { reloadS: 6.4 },
      dims: { hullLengthM: 6.86, overallLengthM: 9.63, widthM: 3.78, heightM: 2.23 } }),
  make('type10', 'type90', 'Type 90 Kyu-maru', 'Japan',
    { hp: 2200, weightTons: 50.2, topSpeedKmh: 70, gun: { reloadS: 5.5 },
      dims: { hullLengthM: 7.45, overallLengthM: 9.76, widthM: 3.43, heightM: 2.34 } }),
  make('t90a', 't90a_vladimir', 'T-90A Vladimir', 'Russia',
    { hp: 2150, topSpeedKmh: 65, gun: { reloadS: 6.8 } }),
];

const ROOT = '/models/tanks/community/recovered/';
const source = (id, cfg = {}) => {
  MODEL_SOURCE[id] = { source: 'glb', glb: { path: `${ROOT}${id}.glb`, paintUntextured: true, ...cfg } };
};
const articulated = (id, cfg = {}) => source(id, {
  turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true, ...cfg,
});
const CHALLENGER_TURRET_FOLLOWERS =
  'vehicle#(?:ammo_|antenna_|bone_mg_aa_|ex_decor_(?:0[1-3]|0[5-9]|1[0-2])_|hatch_0[2-5]_)';
const CHALLENGER_GUN_FOLLOWERS = 'vehicle#(?:gun_mask_|bone_mg_gun_twin_)';
// ex_armor_[lr]_NN are the HULL SKIRT runs (26 nodes on the 2B print) — the
// old (?!body) lookahead swept them into rig_turret and capped the family's
// reference turret masks at 26-58 no matter what the procedural built
// (round-3 finding, quantified in docs/references/tanks/merkava2b.md).
const MERKAVA_TURRET_FOLLOWERS =
  'vehicle#(?:antenna_|bone_|ex_armor_(?!body|[lr]_)|ex_decor_(?:0[1-9]|13)|ex_decor_[lr]_02|hatch_(?:0[4-9]|1[0-3]))';
const MERKAVA_GUN_FOLLOWERS = 'vehicle#gun_barrel_';

// Specs/gameplay ship everywhere. Public builds deliberately omit the
// recovered GLBs and resolve each row through its procedural family model;
// private/local builds install the exact recovered source below.
for (const spec of SPECS) {
  TANK_SPECS[spec.id] = TANK_SPECS[spec.id] || spec;
  if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
}

if (ALLOW_LOCAL_RECOVERED_MODELS) {
  articulated('challenger1', {
    turretFollowers: CHALLENGER_TURRET_FOLLOWERS,
    gunFollowers: CHALLENGER_GUN_FOLLOWERS,
  });
  // This OBJ retains its authored Z-up frame after import; rotate Z-up to the
  // runtime's Y-up convention before modelLoader measures and normalizes it.
  // Oracle repair (tools/repair_oracles.py): the GLB's original `Turret` node
  // was the CHASSIS; the repaired file seats the real casting under `Turret`
  // (ring pivot at the authored y=0 station) and the L11 under `Gun`.
  // chieftain5: DUAL-GATE GRADUATE (2026-08-04) — the program's 18th, the
  // UK family's FIRST. Geometry min 91.2 gatePassed x2 (turret 94.1) +
  // graduation critic 9.0 on ALL FOURTEEN views (floor 5.0 -> 7.0 -> 9.0
  // across r4-r6; right view 9.5). NO MODEL_SOURCE — freeze hash e8919e36
  // via tmp-hashgeo; the recovered Z-up print stays as the measurement
  // oracle (all three override maps carry the registration incl.
  // pitchOffset -PI/2).
  articulated('fv510', { yawOffset: Math.PI });
  articulated('leo2_revolution', { yawOffset: Math.PI });
  // leo2a5: DUAL-GATE GRADUATE (2026-08-04, the 21st — geometry 90.8 x2 +
  // critic 9.0 every view at r10; ladder 7.7 -> 9.0 over five rounds;
  // 04c3e11). Registration retired per §10; freeze hash bc9bad30; the
  // recovered print stays a measurement oracle via the three maps.
  source('leo2a7v', {
    // The author exported the complete upper fighting compartment (including
    // the L/55 and mantlet) as this distinct mesh.
    turretNode: '^desirefx_me_003$', autoPivot: true,
  });
  // m1a1ha: DUAL-GATE GRADUATE (2026-08-02, freeze hash 88a4a978) — no
  // MODEL_SOURCE; procedural ships everywhere (tejas GLB stays as oracle).
  source('m1a2_sepv2', {
    turretNode: '^Turret$', gunNode: '^misc_b$', autoPivot: true,
    yawOffset: Math.PI,
    turretFollowers: '^(?:ammo_(?:5|box)|armor_turret|ex_armoc|ex_armor(?!_body)|ex_era_turret|ex_decor_04|glsaa_[6-8]|hatch_0[34]|mg_aamount_h|misc_a|optic_commander)$',
  });
  // m60a1: NO source() call — dual-gate graduate, procedural build ships in
  // every flavor. The recovered m60a1.glb FILE stays on disk: userdrops6's
  // m60a3 still aliases it directly (and has NOT passed the gate).
  // pt91m: DUAL-GATE GRADUATE (2026-08-03) — the program's 14th. Geometry
  // min 91.3 gatePassed x2 + graduation critic 9.0 on ALL FOURTEEN views
  // (floor 8.2 -> 8.6 -> 9.0 across r25-r28; crown-air column cert audited
  // and binding). NO MODEL_SOURCE — freeze hash via tmp-hashgeo; the
  // recovered GLB stays as the measurement oracle (all three override
  // maps; NOTE the print is authored -z-forward: the critic + evaluator
  // harnesses need yawOffset PI in their entries, the fidelity page does
  // not — probe-proven both ways).
  // merkava3b + merkava3c: DUAL-GATE GRADUATES (2026-08-02) — no
  // MODEL_SOURCE; procedural ships everywhere (hashes 5296950a/5287233e;
  // critic 9.0 all nine views, r8). GLBs stay as measurement oracles.
  // merkava3d: DUAL-GATE GRADUATE (2026-08-03) — the program's 13th.
  // Geometry min 90.4 gatePassed x2 + graduation critic 9.0 on ALL
  // FOURTEEN views (floor climbed 8.6 -> 8.9 -> 9.0 across r11-r13; five
  // arbitration certs transfer with the graduation record). NO
  // MODEL_SOURCE — freeze hash 954a9650 via tmp-hashgeo; the recovered
  // GLB stays as the measurement oracle (all three override maps).
  // merkava1b: DUAL-GATE GRADUATE (2026-08-04) — the program's 16th, the
  // merkava family's FOURTH. Geometry min 90.0 gatePassed x2 at the exact
  // razor + graduation critic 9.0 on ALL FOURTEEN views (floor 8.4 -> 9.0
  // across r12-r13; three arbitration certs decisive). NO MODEL_SOURCE —
  // freeze hash 106b0074 via tmp-hashgeo; the recovered GLB stays as the
  // measurement oracle (all three override maps carry the registration).
  for (const id of ['merkava2b', 'merkava2d', 'merkava4b']) {
    articulated(id, {
      turretFollowers: MERKAVA_TURRET_FOLLOWERS,
      gunFollowers: MERKAVA_GUN_FOLLOWERS,
    });
  }
  for (const id of ['t64bv1', 'type90']) {
    source(id, {
      turretNode: '^Turret$', autoPivot: true, yawOffset: -Math.PI / 2,
    });
  }
  // batch-13b RULING (no surgery): t72bu's batch-9 split already created a
  // Gun node under Turret, but this registration never DECLARED it — the
  // turret mask swallowed the whole tube subtree (plan_turret read the ref
  // turret to z 5.89) and turret rows capped at 11. gunNode resolves it.
  source('t72bu', {
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    yawOffset: -Math.PI / 2,
  });
  // batch-13 (tools/repair_oracles.py 't72b_1987'): the fused 2A46M — 7
  // loose tube components inside TurretMesh — is component-split into
  // GunMesh under a new Gun node (no trim; the warped tube already ends at
  // published overall -0.3%). gunNode resolves it so turret masks compare
  // tube-less turret to tube-less turret at every yaw pose.
  source('t72b_1987', {
    turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
    yawOffset: -Math.PI / 2,
  });
  // t62mv1: oracle ADOPTED from the gen2 bergman bake (batch-9 verdict —
  // true-to-published stature vs the print pack's +6.1% roof; clean two-shell
  // CAD, real Turret split). Gen2 node contract needs no yaw correction, and
  // the bake carries a correct authored Turret pivot — autoPivot would read
  // the long fused tube as the turret footprint and re-seat the upper vehicle
  // (same defect class as the m1a1_aim ruling in userdrops6.js).
  // The old t62mv1.glb print stays on disk for provenance only.
  // batch-10 (tools/repair_oracles.py 't62_bergman'): the authored-long fused
  // 2A20 is plane-split out of TurretMesh into GunMesh under a new Gun node
  // and muzzle-trimmed to published overall length; gunNode resolves it so
  // the loader keys normalization on hullLengthM over the gun-excluded box
  // (gun=null previously keyed overallLengthM on the +14% tube: the tank
  // shipped ~12% undersized and 1.5 m displaced — the gate's hull-8 row).
  source('t62mv1', {
    path: `${ROOT}t62_bergman.glb`, turretNode: '^Turret$', gunNode: '^Gun$',
    autoPivot: false,
  });
  // t72b3m: DUAL-GATE GRADUATE (2026-08-04) — the program's 15th. Geometry
  // min 91.8 gatePassed x2 + graduation critic 9.0 on ALL FOURTEEN views
  // (floor 8.0 -> 8.5 -> 9.0 across thirteen builder rounds; three views
  // banked early and held; five-for-five order reproduction, zero flips).
  // NO MODEL_SOURCE — freeze hash c19ec9f0 via tmp-hashgeo; the recovered
  // GLB stays as the measurement oracle (all three override maps carry the
  // registration incl. yawOffset PI).
  source('t90sm', {
    turretNode: '^misc_a$', gunNode: '^misc_b$', autoPivot: true,
    yawOffset: Math.PI,
  });
  source('t90a_vladimir', {
    // Highest-detail turret assembly; the remaining desirefx meshes are hull,
    // running gear, side skirts and LOD layers and must stay with the chassis.
    turretNode: '^desirefx[._]?me_001$', autoPivot: true,
  });
}

export const USERDROP5_TANK_IDS = SPECS.map((s) => s.id);

// PROVENANCE-INTENT (era bucketing): the wave-5 rows whose visual is sourced
// from an online/recovered model in the full local build. Public builds skip
// the quarantined registrations above, so MODEL_SOURCE is NOT a public-safe
// signal — the garage catalog keys era buckets off this list instead, keeping
// local and public grouping identical. m60a1 is excluded: it graduated the
// dual gate and its procedural build ships everywhere (a true original now).
export const USERDROP5_SOURCED_IDS = USERDROP5_TANK_IDS.filter((id) => !['m60a1', 'm1a1ha', 'merkava3b', 'merkava3c', 'merkava3d', 'pt91m', 't72b3m', 'merkava1b', 'chieftain5', 'leo2a5'].includes(id));
