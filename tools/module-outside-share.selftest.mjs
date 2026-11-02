// Every internal module sketch lies mostly inside its armour (267, Main: gen-combat-anatomy reported "N% outside its
// armour" and only warned; the M551's transmission sat 96% under its sloped rear plate). First-party tooling: Kevin B. Liu.
//
// The share is the generator's own (tools/crew-seat-fit.mjs moduleOutsideShares, the `outside` placeModules reports):
// each placeable sketch voxelized against its frame's armour shell, over the authored anatomy finalized against the
// committed row, as gen-combat-anatomy measures it. A sketch with MODULE_OUTSIDE_SHARE_LIMIT or more of its box outside
// fails, except the KNOWN offenders below, a ratchet that only shrinks: a KNOWN entry that no longer offends fails too,
// until it is removed. Optics are sights on the armour's edge, not internal volumes. A sketch planted wholly above the
// hull roof fails (the control), and the shares equal placeModules' report on one tank. Manual (the fleet suite): it
// finalizes every tank's anatomy.
import assert from 'node:assert/strict';
import { enableCombatAnatomyMeasurementMode } from '../src/vehicles/combatAnatomyMeasurementMode.ts';

enableCombatAnatomyMeasurementMode();
await import('../src/vehicles/tankFactory.ts');
const { ALL_TANK_IDS, TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { authoredCombatAnatomy, finalizeCombatAnatomy, moduleHitShapes } = await import('../src/vehicles/combatAnatomy.ts');
const { COMBAT_ANATOMY_CALIBRATIONS } = await import('../src/vehicles/combatAnatomyCalibrations.ts');
const { MODULE_OUTSIDE_SHARE_LIMIT, moduleOutsideShares, placeModules } = await import('./crew-seat-fit.mjs');

/** Each tank's module/frame sketches at or past the limit on 2026-11-01: fix the sketch, then remove its entry. */
const KNOWN = Object.freeze({
  amx30b: ['ammoRack/hull', 'engine/hull', 'fuelTank/hull'],
  amx40: ['ammoRack/hull', 'fuelTank/hull'],
  amx40_proto: ['radio/turret'],
  amx56: ['ammoRack/turret', 'autoloader/turret'],
  ares_apc: ['ammoRack/turret'],
  bm_oplot_m: ['ammoRack/turret', 'autoloader/turret', 'engine/hull', 'fuelTank/hull', 'radio/turret', 'transmission/hull'],
  bm_oplot_t: ['ammoRack/turret', 'autoloader/turret', 'engine/hull', 'fuelTank/hull', 'radio/turret', 'transmission/hull'],
  bmpt_t90: ['ammoRack/turret'],
  bmpt_terminator2: ['ammoRack/turret', 'missileRack/turret', 'radio/turret'],
  c1_ariete: ['ammoRack/turret', 'fuelTank/hull', 'radio/turret'],
  c1_ariete_proto_serie1: ['ammoRack/turret', 'radio/turret'],
  c2_ariete: ['ammoRack/turret', 'radio/turret'],
  c2_ariete_proto: ['ammoRack/turret', 'radio/turret'],
  challenger2: ['transmission/hull'],
  challenger2e: ['transmission/hull'],
  challenger3: ['transmission/hull'],
  challenger3_proto: ['engine/hull', 'fuelTank/hull', 'transmission/hull'],
  chieftain3: ['ammoRack/hull', 'radio/turret'],
  chieftain5: ['ammoRack/hull', 'fuelTank/hull'],
  chieftain_mk10: ['ammoRack/hull', 'engine/hull', 'fuelTank/hull', 'radio/turret', 'transmission/hull'],
  chieftain_mk9: ['ammoRack/hull', 'radio/turret'],
  cv9035dk: ['missileRack/turret'],
  cv90_mk4: ['missileRack/turret'],
  fv4034: ['transmission/hull'],
  jpz_e100: ['radio/hull'],
  k1a1: ['ammoRack/turret'],
  k2_black_panther: ['ammoRack/turret', 'autoloader/turret', 'radio/turret'],
  kf51_panther: ['radio/hull'],
  leclerc_xlr: ['ammoRack/turret'],
  leo1a5: ['fuelTank/hull'],
  leo2_revolution: ['radio/turret'],
  leo2_revolution_proto: ['transmission/hull'],
  leo2a6: ['ammoRack/hull', 'fuelTank/hull'],
  leo2a6_ua: ['fuelTank/hull'],
  leo2a6m: ['fuelTank/hull', 'transmission/hull'],
  leo2a7v: ['radio/turret', 'transmission/hull'],
  leopard2_proto: ['ammoRack/hull'],
  m1a2_abrams: ['fuelTank/hull'],
  m1a2_abrams_sepv2: ['fuelTank/hull'],
  m1a2_abrams_sepv3: ['fuelTank/hull'],
  m1a2_abrams_tusk: ['fuelTank/hull'],
  m1a3: ['transmission/hull'],
  m3a3_bradley: ['radio/turret'],
  m41_bw: ['radio/turret'],
  m41_jgsdf: ['radio/turret'],
  m41a3: ['radio/turret'],
  m41dk1: ['radio/turret'],
  m48_super: ['fuelTank/hull'],
  m48a2ga2: ['fuelTank/hull'],
  m48a3_patton: ['fuelTank/hull'],
  m48a5_patton: ['fuelTank/hull'],
  m551_sheridan: ['engine/hull'],
  magach3: ['fuelTank/hull'],
  namer_ifv: ['fuelTank/hull'],
  object695: ['feedSystem/turret'],
  pl01: ['ammoRack/turret'],
  pl01_105: ['ammoRack/turret'],
  pt64_tur: ['radio/turret'],
  pt84_orzel: ['ammoRack/turret', 'engine/hull', 'fuelTank/hull', 'radio/turret', 'transmission/hull'],
  pt84_sokol: ['ammoRack/turret', 'autoloader/turret', 'engine/hull', 'fuelTank/hull', 'radio/turret', 'transmission/hull'],
  pt84_zbik: ['ammoRack/turret', 'autoloader/turret', 'engine/hull', 'fuelTank/hull', 'radio/turret', 'transmission/hull'],
  pt91a_twardy: ['radio/turret'],
  pt91m: ['radio/turret'],
  strv103a: ['ammoRack/hull', 'fuelTank/hull'],
  strv103b: ['ammoRack/hull', 'fuelTank/hull'],
  t14_armata: ['transmission/hull'],
  t62mv1: ['radio/turret'],
  t64b1v_2022: ['radio/turret'],
  t64bm1m: ['radio/turret'],
  t64bv: ['radio/turret'],
  t64bv1: ['radio/turret'],
  t64bv_donbas: ['radio/turret'],
  t72b3: ['radio/turret'],
  t72b3_qilin: ['radio/turret'],
  t72b3_sich: ['radio/turret'],
  t72b3_zubr: ['radio/turret'],
  t72b3_zubr_ii: ['radio/turret'],
  t72b3m_2016: ['radio/turret'],
  t72b3m_2022: ['radio/turret'],
  t72b3m_hetman: ['radio/turret'],
  t72b3m_hetman_ii: ['radio/turret'],
  t72b3m_kunlun: ['radio/turret'],
  t72b_1987: ['radio/turret'],
  t72m1_jaguar: ['radio/turret'],
  t80: ['engine/hull', 'radio/hull'],
  t80b: ['engine/hull', 'radio/hull'],
  t80bv: ['engine/hull', 'radio/hull'],
  t80u_kursk: ['engine/hull', 'radio/hull'],
  t80u_yun: ['radio/turret'],
  t84bm_oplot_m: ['ammoRack/hull', 'autoloader/hull', 'engine/hull', 'fuelTank/hull', 'radio/turret', 'transmission/hull'],
  t90a_burlak: ['radio/turret'],
  t90am: ['ammoRack/hull', 'engine/hull', 'fuelTank/hull', 'transmission/hull'],
  t90ms_2011: ['ammoRack/hull'],
  t90ms_tagil: ['ammoRack/hull'],
  t90sm: ['ammoRack/hull', 'engine/hull', 'fuelTank/hull', 'transmission/hull'],
  t90sm_2013: ['ammoRack/hull', 'engine/hull', 'fuelTank/hull', 'transmission/hull'],
  type10: ['transmission/hull'],
  type10_dozer: ['transmission/hull'],
  type10_tk_x: ['ammoRack/turret', 'radio/turret'],
  type10b: ['ammoRack/turret', 'radio/turret'],
  type90: ['engine/hull', 'fuelTank/hull', 'transmission/hull'],
  type96_72_long: ['radio/turret'],
  type96_72m_lei: ['radio/turret'],
  type96_80_feng: ['radio/turret'],
  type96b: ['fuelTank/hull', 'radio/turret'],
  ua_challenger2: ['transmission/hull'],
  ua_m1a2_abrams: ['fuelTank/hull'],
  udes03: ['fuelTank/hull'],
  vickers_mk1: ['ammoRack/hull', 'engine/hull', 'fuelTank/hull', 'radio/turret', 'transmission/hull'],
  x1_pioneiro: ['radio/turret'],
  x1a2_carcara: ['radio/turret'],
  xk2_black_panther: ['ammoRack/turret'],
  ztz100: ['engine/hull', 'fuelTank/hull', 'transmission/hull'],
  ztz100_prototype: ['ammoRack/hull', 'engine/hull', 'fuelTank/hull', 'missileRack/turret', 'transmission/hull'],
  ztz20: ['engine/hull', 'fuelTank/hull', 'transmission/hull'],
  ztz20_prototype: ['engine/hull', 'fuelTank/hull', 'transmission/hull'],
  ztz85_iii: ['ammoRack/hull', 'autoloader/hull', 'fuelTank/hull'],
});
const KNOWN_KEYS = Object.entries(KNOWN).flatMap(([id, entries]) => entries.map((entry) => `${id}/${entry}`));

/** The finalized probe spec of `id` and the options the generator places its modules with. */
function probeOf(id) {
  void TANK_SPECS[id];
  const calibration = COMBAT_ANATOMY_CALIBRATIONS[id];
  const probe = authoredCombatAnatomy(id);
  assert.ok(probe && calibration, `${id}: an authored anatomy and a committed row`);
  finalizeCombatAnatomy(probe, calibration);
  const drawn = new Set((calibration.moduleShapes || []).map((receipt) => `${receipt.module}|${!!receipt.turretLocal}`));
  return { probe, options: { drawn, ring: calibration.turretRing ?? null } };
}
/** The internal sketches of `probe` at or past the limit, as id/module/frame keys. */
const offendersOf = (id, probe, options) => moduleOutsideShares(probe, options)
  .filter((row) => row.module !== 'optics' && row.outside >= MODULE_OUTSIDE_SHARE_LIMIT)
  .map((row) => [`${id}/${row.module}/${row.frame}`, row.outside]);

const found = new Map();
for (const id of ALL_TANK_IDS) {
  const { probe, options } = probeOf(id);
  for (const [key, outside] of offendersOf(id, probe, options)) found.set(key, outside);
}
const known = new Set(KNOWN_KEYS);
const fresh = [...found].filter(([key]) => !known.has(key)).map(([key, outside]) => `${key} ${Math.round(outside * 100)}% outside`);
const fixed = KNOWN_KEYS.filter((key) => !found.has(key));
assert.deepEqual(fresh, [], `module sketches at or past ${MODULE_OUTSIDE_SHARE_LIMIT * 100}% outside their armour (move the sketch inside)`);
assert.deepEqual(fixed, [], 'KNOWN offenders now inside their armour: remove them from KNOWN (the ratchet only shrinks)');

// the shares are the generator's: equal to placeModules' report, crew-free, on a tank with hull and turret sketches
{
  const { probe, options } = probeOf('m551_sheridan');
  const { report } = placeModules(structuredClone(probe), [], { ...options, hitShapes: moduleHitShapes });
  const rows = (list) => list.map((row) => `${row.module}/${row.frame} ${row.outside}`).sort();
  assert.deepEqual(rows(moduleOutsideShares(probe, options)), rows(report), 'moduleOutsideShares is placeModules\' outside share');
}
// control: a transmission planted a metre above the hull roof is an offender, and not a KNOWN one
{
  const { probe, options } = probeOf('m551_sheridan');
  const roof = COMBAT_ANATOMY_CALIBRATIONS.m551_sheridan.hull.max[1];
  const planted = probe.armor.modules.find((box) => box.module === 'transmission' && !box.turretLocal);
  planted.min[1] = roof + 1; planted.max[1] = roof + 1.4;
  delete planted.parts;
  const offenders = offendersOf('m551_sheridan', probe, options);
  assert.deepEqual(offenders.filter(([key]) => key === 'm551_sheridan/transmission/hull').map(([, outside]) => outside), [1],
    'a planted sketch wholly outside the hull is an offender');
  assert.ok(!known.has('m551_sheridan/transmission/hull'), 'and the ratchet does not excuse it');
}
console.log(`module-outside-share.selftest: ${ALL_TANK_IDS.length} tanks, ${found.size} internal sketches at or past `
  + `${MODULE_OUTSIDE_SHARE_LIMIT * 100}% outside their armour, all KNOWN (the ratchet: ${KNOWN_KEYS.length} in ${Object.keys(KNOWN).length} tanks); a planted sketch fails`);
