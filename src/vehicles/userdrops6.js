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
      dims: { hullLengthM: 6.33, overallLengthM: 8.48, widthM: 3.51, heightM: 3.18 } }),
  make('m60a1', 'm47_patton', 'M47 Patton', 'USA',
    { hp: 1550, weightTons: 46, topSpeedKmh: 48, gun: { caliberMm: 90, reloadS: 6.8 },
      dims: { hullLengthM: 6.33, overallLengthM: 8.51, widthM: 3.51, heightM: 3.35 } }),
  make('m4a3e8', 'm26_pershing', 'M26 Pershing', 'USA',
    { hp: 1450, weightTons: 41.9, topSpeedKmh: 40, gun: { caliberMm: 90, reloadS: 7.5 },
      dims: { hullLengthM: 6.33, overallLengthM: 8.65, widthM: 3.51, heightM: 2.78 } }),
  make('m4a3e8', 'm45_patton', 'M45 Patton', 'USA',
    { hp: 1500, weightTons: 42, topSpeedKmh: 40, gun: { caliberMm: 105, reloadS: 9.0 },
      // stub 105mm howitzer barely clears the bow: overall ~= hull length
      // (the previous 8.65 was a copy of the M26's long-90mm figure)
      dims: { hullLengthM: 6.33, overallLengthM: 6.4, widthM: 3.51, heightM: 2.78 } }),
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
  fixed('isu152'); fixed('isu122s');
  for (const id of ['centurion3', 'centurion5', 'comet', 'challenger_cruiser', 'charioteer',
    'leopard2_proto', 'm46_patton', 'm47_patton', 'm26_pershing', 'm45_patton']) articulated(id);
  // The Bergman Abrams exports an empty Turret pivot at the scene origin.
  // Its authored hull/turret placement is already correct; autoPivot treated
  // the long fused cannon as the turret footprint and moved the entire upper
  // vehicle off the pedestal. Keep the neutral placement and rotate it around
  // the spec's real turret-ring pivot instead.
  articulated('m1a1_aim', 'm1a1_aim', { autoPivot: false });
  // The pack's `M60A3 complex` STL is the M60 machine-gun receiver, not the
  // Patton tank (the icon pass caught the false-positive). Use the recovered
  // M60A1 hull/turret for this close family variant instead of shipping a gun
  // floating on the pedestal.
  articulated('m60a3', 'm60a1', { gunNode: '^weapon$', yawOffset: -Math.PI / 2 });
}

export const USERDROP6_TANK_IDS = SPECS.map((s) => s.id);
