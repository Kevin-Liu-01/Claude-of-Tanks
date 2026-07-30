// Recovered-drop wave 6: distinct Cold-War/modern vehicles from the owner's
// source archives. Geometry was normalized by tools/build_recovered_fleet.sh;
// class stats inherit the nearest researched vehicle and are then adjusted to
// keep each variant identifiable and matchmaking-safe.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
const ALLOW_LOCAL_RECOVERED_MODELS = typeof import.meta !== 'undefined' &&
  import.meta.env && !import.meta.env.VITE_PUBLIC_BUILD;
const make = (baseId, id, name, nation, patch = {}) => {
  const spec = copy(TANK_SPECS[baseId]);
  spec.id = id;
  spec.name = name;
  spec.nation = nation || spec.nation;
  spec.variantOf = baseId;
  spec.community = {
    author: 'Recovered owner drop', source: `user-drops-recovered/${id}`,
    license: 'Redistribution not cleared — LOCAL-ONLY QUARANTINE',
  };
  const baseGun = spec.gun;
  const baseDims = spec.dims;
  const baseVisual = spec.visual;
  Object.assign(spec, patch);
  if (patch.gun) spec.gun = { ...baseGun, ...patch.gun };
  if (patch.dims) spec.dims = { ...baseDims, ...patch.dims };
  if (patch.visual) spec.visual = { ...baseVisual, ...patch.visual };
  return spec;
};

const SPECS = ALLOW_LOCAL_RECOVERED_MODELS ? [
  make('challenger2', 'challenger1', 'Challenger 1 Mk.3', 'UK',
    { hp: 2100, weightTons: 62, topSpeedKmh: 56, gun: { reloadS: 7.2 } }),
  make('chieftain_mk10', 'chieftain5', 'Chieftain Mk.5', 'UK',
    { hp: 1850, topSpeedKmh: 48, gun: { reloadS: 7.8 } }),
  make('m2a2_bradley', 'fv510', 'FV510 Warrior', 'UK',
    { hp: 1250, weightTons: 25.4, topSpeedKmh: 75, gun: { caliberMm: 30, reloadS: 0.45 } }),
  make('leo2a7', 'leo2_revolution', 'Leopard 2 Revolution', 'Germany',
    { hp: 2550, weightTons: 60, topSpeedKmh: 70 }),
  make('leo2a6', 'leo2a5', 'Leopard 2A5', 'Germany',
    { hp: 2350, weightTons: 59.5, gun: { reloadS: 6.4 } }),
  make('leo2a7', 'leo2a7v', 'Leopard 2A7V', 'Germany',
    { hp: 2650, weightTons: 66.5, topSpeedKmh: 63 }),
  make('m1a1', 'm1a1ha', 'M1A1HA Abrams', 'USA',
    { hp: 2350, weightTons: 62, gun: { reloadS: 6.3 } }),
  make('m1a2', 'm1a2_sepv2', 'M1A2 Abrams SEPv2', 'USA',
    { hp: 2600, weightTons: 66.8, gun: { reloadS: 6.0 } }),
  make('leo1a5', 'm60a1', 'M60A1 Patton', 'USA',
    { hp: 1750, weightTons: 49.7, topSpeedKmh: 48, reverseSpeedKmh: 16, gun: { reloadS: 7.6 } }),
  make('t72b3', 'pt91m', 'PT-91M Pendekar', 'Poland',
    { hp: 2050, weightTons: 48.5, topSpeedKmh: 70, reverseSpeedKmh: 20 }),
  make('merkava4', 'merkava1b', 'Merkava Mk.1B', 'Israel',
    { hp: 1900, weightTons: 60, topSpeedKmh: 46, gun: { reloadS: 7.8 } }),
  make('merkava4', 'merkava2b', 'Merkava Mk.2B', 'Israel',
    { hp: 2050, weightTons: 63, topSpeedKmh: 46, gun: { reloadS: 7.5 } }),
  make('merkava4', 'merkava2d', 'Merkava Mk.2D', 'Israel',
    { hp: 2150, weightTons: 65, topSpeedKmh: 50, gun: { reloadS: 7.2 } }),
  make('merkava4', 'merkava3b', 'Merkava Mk.3B', 'Israel',
    { hp: 2250, weightTons: 65, topSpeedKmh: 60, gun: { reloadS: 6.8 } }),
  make('merkava4', 'merkava3c', 'Merkava Mk.3C', 'Israel',
    { hp: 2300, weightTons: 65, topSpeedKmh: 60, gun: { reloadS: 6.6 } }),
  make('merkava4', 'merkava3d', 'Merkava Mk.3D', 'Israel',
    { hp: 2350, weightTons: 65, topSpeedKmh: 60, gun: { reloadS: 6.4 } }),
  make('merkava4', 'merkava4b', 'Merkava Mk.4B', 'Israel',
    { hp: 2500, weightTons: 65, topSpeedKmh: 64, gun: { reloadS: 6.1 } }),
  make('leo1a5', 't62mv1', 'T-62MV-1', 'USSR/Russia',
    { hp: 1650, weightTons: 38, topSpeedKmh: 50, reverseSpeedKmh: 8, gun: { reloadS: 8.2 } }),
  make('t72b3', 't64bv1', 'T-64BV1', 'USSR/Russia',
    { hp: 1850, weightTons: 42.4, topSpeedKmh: 60, reverseSpeedKmh: 12, gun: { reloadS: 7.4 } }),
  make('t72b3', 't72b_1987', 'T-72B obr. 1987', 'USSR/Russia',
    { hp: 1950, weightTons: 44.5, topSpeedKmh: 60, reverseSpeedKmh: 12, gun: { reloadS: 7.2 } }),
  make('t72b3', 't72b3m', 'T-72B3M obr. 2022', 'Russia',
    { hp: 2250, enginePowerHp: 1130, topSpeedKmh: 70, reverseSpeedKmh: 20, gun: { reloadS: 6.5 } }),
  make('t90a', 't72bu', 'T-72BU', 'USSR/Russia',
    { hp: 2050, weightTons: 46.5, topSpeedKmh: 65, gun: { reloadS: 7.0 } }),
  make('t90m', 't90sm', 'T-90SM', 'Russia',
    { hp: 2400, weightTons: 48, topSpeedKmh: 72, gun: { reloadS: 6.4 } }),
  make('type10', 'type90', 'Type 90 Kyu-maru', 'Japan',
    { hp: 2200, weightTons: 50.2, topSpeedKmh: 70, gun: { reloadS: 5.5 } }),
  make('t90a', 't90a_vladimir', 'T-90A Vladimir', 'Russia',
    { hp: 2150, topSpeedKmh: 65, gun: { reloadS: 6.8 } }),
] : [];

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
const MERKAVA_TURRET_FOLLOWERS =
  'vehicle#(?:antenna_|bone_|ex_armor_(?!body)|ex_decor_(?:0[1-9]|13)|ex_decor_[lr]_02|hatch_(?:0[4-9]|1[0-3]))';
const MERKAVA_GUN_FOLLOWERS = 'vehicle#gun_barrel_';

if (ALLOW_LOCAL_RECOVERED_MODELS) {
  for (const spec of SPECS) {
    TANK_SPECS[spec.id] = TANK_SPECS[spec.id] || spec;
    if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
  }
  articulated('challenger1', {
    turretFollowers: CHALLENGER_TURRET_FOLLOWERS,
    gunFollowers: CHALLENGER_GUN_FOLLOWERS,
  });
  // This OBJ retains its authored Z-up frame after import; rotate Z-up to the
  // runtime's Y-up convention before modelLoader measures and normalizes it.
  source('chieftain5', {
    turretNode: '^Turret$', autoPivot: true, pitchOffset: -Math.PI / 2,
  });
  articulated('fv510', { yawOffset: Math.PI });
  articulated('leo2_revolution', { yawOffset: Math.PI });
  articulated('leo2a5');
  source('leo2a7v', {
    // The author exported the complete upper fighting compartment (including
    // the L/55 and mantlet) as this distinct mesh.
    turretNode: '^desirefx_me_003$', autoPivot: true,
  });
  MODEL_SOURCE.m1a1ha = {
    source: 'glb',
    glb: {
      path: '/models/tanks/m1a2_tejas.glb',
      turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
      yawOffset: -Math.PI / 2, paintUntextured: true, heroTex: true,
    },
  };
  source('m1a2_sepv2', {
    turretNode: '^Turret$', gunNode: '^misc_b$', autoPivot: true,
    yawOffset: Math.PI,
    turretFollowers: '^(?:ammo_(?:5|box)|armor_turret|ex_armoc|ex_armor(?!_body)|ex_era_turret|ex_decor_04|glsaa_[6-8]|hatch_0[34]|mg_aamount_h|misc_a|optic_commander)$',
  });
  source('m60a1', {
    turretNode: '^Turret$', gunNode: '^weapon$', autoPivot: true,
    yawOffset: -Math.PI / 2,
  });
  source('pt91m', {
    turretNode: '^misc_a$', gunNode: '^misc_b$', autoPivot: true,
  });
  for (const id of ['merkava1b', 'merkava2b', 'merkava2d', 'merkava3b', 'merkava3c', 'merkava3d', 'merkava4b']) {
    articulated(id, {
      turretFollowers: MERKAVA_TURRET_FOLLOWERS,
      gunFollowers: MERKAVA_GUN_FOLLOWERS,
    });
  }
  for (const id of ['t62mv1', 't64bv1', 't72b_1987', 't72bu', 'type90']) {
    source(id, {
      turretNode: '^Turret$', autoPivot: true, yawOffset: -Math.PI / 2,
    });
  }
  source('t72b3m', {
    turretNode: '^misc_a$', gunNode: '^misc_b$', autoPivot: true,
    yawOffset: Math.PI,
  });
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
